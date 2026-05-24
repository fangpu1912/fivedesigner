use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{command, AppHandle, Manager};
use lazy_static::lazy_static;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserProfile {
    pub id: String,
    pub name: String,
    pub user_agent: Option<String>,
    pub viewport_width: u32,
    pub viewport_height: u32,
    pub locale: String,
    pub timezone: String,
    pub color_scheme: String,
    pub data_dir: String,
    pub extensions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserSession {
    pub id: String,
    pub profile_id: String,
    pub url: String,
    pub title: String,
    pub pid: Option<u32>,
}

// 全局进程管理器
lazy_static! {
    static ref BROWSER_PROCESSES: Mutex<HashMap<String, u32>> = Mutex::new(HashMap::new());
}

/// 检测系统默认浏览器路径
#[command]
pub async fn detect_browser() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        // 优先查找 Chrome
        let chrome_paths = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe",
        ];
        
        for path in &chrome_paths {
            let expanded = shellexpand::env(path).unwrap_or_else(|_| std::borrow::Cow::Borrowed(*path));
            if std::path::Path::new(&*expanded).exists() {
                return Ok(expanded.to_string());
            }
        }
        
        // 查找 Edge
        let edge_paths = [
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        ];
        
        for path in &edge_paths {
            if std::path::Path::new(path).exists() {
                return Ok(path.to_string());
            }
        }
    }
    
    Err("未找到 Chrome 或 Edge 浏览器".to_string())
}

/// 创建新的浏览器窗口 - 使用独立进程模式
#[command]
pub async fn create_browser_window(
    app: AppHandle,
    session_id: String,
    profile: BrowserProfile,
    url: String,
) -> Result<u32, String> {
    let browser_path = detect_browser().await?;
    
    // 获取应用数据目录
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    
    // 每个账号完全独立的用户数据目录
    let user_data_dir = app_data_dir.join("browser_profiles").join(&profile.id);
    std::fs::create_dir_all(&user_data_dir)
        .map_err(|e| format!("创建用户数据目录失败: {}", e))?;
    
    // 扩展目录
    let extensions_dir = app_data_dir.join("browser_extensions");
    std::fs::create_dir_all(&extensions_dir).ok();
    
    // 生成独立端口
    let debug_port = 19222 + rand::random::<u16>() % 1000;
    
    // 窗口位置偏移
    let window_offset = rand::random::<i32>() % 100;
    
    // 关键：使用 --single-process 模式禁用多进程，强制每个实例完全独立
    let mut args = vec![
        format!("--user-data-dir={}", user_data_dir.to_string_lossy()),
        format!("--window-size=1366,768"),
        format!("--window-position={},100", 100 + window_offset),
        format!("--remote-debugging-port={}", debug_port),
        // 强制独立实例的关键参数
        "--no-first-run".to_string(),
        "--no-default-browser-check".to_string(),
        "--disable-default-apps".to_string(),
        "--disable-sync".to_string(),
        "--disable-background-networking".to_string(),
        "--disable-background-timer-throttling".to_string(),
        "--disable-renderer-backgrounding".to_string(),
        "--disable-features=TranslateUI,ChromeCleanup".to_string(),
        "--disable-component-extensions-with-background-pages".to_string(),
        "--disable-ipc-flooding-protection".to_string(),
        "--disable-hang-monitor".to_string(),
        "--force-color-profile=srgb".to_string(),
        "--disable-gpu".to_string(),
        "--disable-software-rasterizer".to_string(),
        "--disable-dev-shm-usage".to_string(),
        "--disable-breakpad".to_string(),
        "--disable-crash-reporter".to_string(),
        "--disable-features=IsolateOrigins,site-per-process".to_string(),
        "--allow-running-insecure-content".to_string(),
        "--disable-site-isolation-trials".to_string(),
        "--disable-web-security".to_string(),
        "--disable-features=CrossSiteDocumentBlocking".to_string(),
        // 禁用单实例检查
        "--disable-features=ChromeSingle".to_string(),
        "--disable-backgrounding-occluded-windows".to_string(),
        format!("--lang={}", profile.locale),
    ];
    
    // User-Agent
    if let Some(ua) = &profile.user_agent {
        args.push(format!("--user-agent={}", ua));
    }
    
    // 加载扩展
    let mut load_extensions = vec![];
    if let Ok(entries) = std::fs::read_dir(&extensions_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && path.join("manifest.json").exists() {
                load_extensions.push(path.to_string_lossy().to_string());
            }
        }
    }
    
    if !load_extensions.is_empty() {
        args.push(format!("--load-extension={}", load_extensions.join(",")));
    }
    
    args.push(url);
    
    // 启动浏览器
    let mut cmd = Command::new(&browser_path);
    cmd.args(&args)
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        // DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP - 完全独立的进程
        cmd.creation_flags(0x00000008 | 0x00000200);
    }
    
    let child = cmd.spawn()
        .map_err(|e| format!("启动浏览器失败: {}", e))?;
    
    let pid = child.id();
    
    // 记录进程
    if let Ok(mut processes) = BROWSER_PROCESSES.lock() {
        processes.insert(profile.id.clone(), pid);
    }
    
    Ok(pid)
}

/// 关闭浏览器进程
#[command]
pub async fn close_browser_window(pid: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill")
            .args(&["/F", "/T", "/PID", &pid.to_string()])
            .output();
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        let _ = Command::new("kill")
            .args(&["-9", &pid.to_string()])
            .output();
    }
    
    if let Ok(mut processes) = BROWSER_PROCESSES.lock() {
        processes.retain(|_, &mut p| p != pid);
    }
    
    Ok(())
}

/// 检查浏览器进程是否仍在运行
#[command]
pub async fn check_browser_running(pid: u32) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("tasklist")
            .args(&["/FI", &format!("PID eq {}", pid), "/NH"])
            .stdout(Stdio::piped())
            .output()
            .map_err(|e| format!("检查进程失败: {}", e))?;
        
        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(stdout.contains(&pid.to_string()))
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new("kill")
            .args(&["-0", &pid.to_string()])
            .output()
            .map_err(|e| format!("检查进程失败: {}", e))?;
        Ok(output.status.success())
    }
}

/// 获取扩展列表
#[command]
pub async fn list_browser_extensions(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    
    let extensions_dir = app_data_dir.join("browser_extensions");
    let mut extensions = vec![];
    
    if let Ok(entries) = std::fs::read_dir(&extensions_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let manifest_path = path.join("manifest.json");
                if manifest_path.exists() {
                    if let Ok(content) = std::fs::read_to_string(&manifest_path) {
                        if let Ok(manifest) = serde_json::from_str::<serde_json::Value>(&content) {
                            extensions.push(serde_json::json!({
                                "id": path.file_name().unwrap_or_default().to_string_lossy(),
                                "name": manifest.get("name").and_then(|v| v.as_str()).unwrap_or("Unknown"),
                                "version": manifest.get("version").and_then(|v| v.as_str()).unwrap_or(""),
                                "path": path.to_string_lossy(),
                            }));
                        }
                    }
                }
            }
        }
    }
    
    Ok(extensions)
}

/// 安装扩展
#[command]
pub async fn install_browser_extension(
    app: AppHandle,
    source_path: String,
) -> Result<String, String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    
    let extensions_dir = app_data_dir.join("browser_extensions");
    std::fs::create_dir_all(&extensions_dir).ok();
    
    let source = PathBuf::from(&source_path);
    
    if !source.exists() {
        return Err("源文件或目录不存在".to_string());
    }
    
    let manifest_path = source.join("manifest.json");
    if !manifest_path.exists() {
        return Err("无效的扩展：缺少 manifest.json".to_string());
    }
    
    let manifest_content = std::fs::read_to_string(&manifest_path)
        .map_err(|e| format!("读取 manifest.json 失败: {}", e))?;
    
    let manifest: serde_json::Value = serde_json::from_str(&manifest_content)
        .map_err(|e| format!("解析 manifest.json 失败: {}", e))?;
    
    let ext_name = manifest.get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown_extension");
    
    let safe_name: String = ext_name.chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
        .collect();
    
    let target_dir = extensions_dir.join(&safe_name);
    
    if target_dir.exists() {
        std::fs::remove_dir_all(&target_dir).ok();
    }
    
    copy_dir_all(&source, &target_dir)
        .map_err(|e| format!("复制扩展文件失败: {}", e))?;
    
    Ok(safe_name)
}

/// 删除扩展
#[command]
pub async fn uninstall_browser_extension(
    app: AppHandle,
    extension_id: String,
) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    
    let ext_dir = app_data_dir.join("browser_extensions").join(&extension_id);
    
    if ext_dir.exists() {
        std::fs::remove_dir_all(&ext_dir).ok();
    }
    
    Ok(())
}

/// 清理浏览器数据
#[command]
pub async fn clear_browser_data(
    app: AppHandle,
    profile_id: String,
) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    
    let data_dir = app_data_dir.join("browser_profiles").join(&profile_id);
    
    if data_dir.exists() {
        std::fs::remove_dir_all(&data_dir).ok();
    }
    
    Ok(())
}

/// 递归复制目录
fn copy_dir_all(src: impl AsRef<std::path::Path>, dst: impl AsRef<std::path::Path>) -> std::io::Result<()> {
    std::fs::create_dir_all(&dst)?;
    
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        
        if ty.is_dir() {
            copy_dir_all(entry.path(), dst.as_ref().join(entry.file_name()))?;
        } else {
            std::fs::copy(entry.path(), dst.as_ref().join(entry.file_name()))?;
        }
    }
    
    Ok(())
}
