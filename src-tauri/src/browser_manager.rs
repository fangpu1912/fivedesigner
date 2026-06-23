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
    pub proxy: Option<String>,
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

/// 生成随机 User-Agent
fn generate_random_ua() -> String {
    let chrome_versions = [
        "120.0.0.0", "121.0.0.0", "122.0.0.0", "123.0.0.0",
        "124.0.0.0", "125.0.0.0", "126.0.0.0", "127.0.0.0",
        "128.0.0.0", "129.0.0.0", "130.0.0.0", "131.0.0.0",
    ];
    let idx = rand::random::<usize>() % chrome_versions.len();
    let ver = chrome_versions[idx];
    format!(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{} Safari/537.36",
        ver
    )
}

/// 为每个 profile 生成指纹伪造扩展
fn ensure_fingerprint_extension(app_data_dir: &std::path::Path, profile_id: &str) -> Option<PathBuf> {
    let ext_dir = app_data_dir.join("browser_profiles").join(profile_id).join("_fingerprint_ext");
    
    // 如果已存在则直接返回
    if ext_dir.join("manifest.json").exists() {
        return Some(ext_dir);
    }
    
    std::fs::create_dir_all(&ext_dir).ok()?;
    
    // 生成随机种子（每个账号不同，canvas/webgl 指纹就不同）
    let seed: u32 = rand::random();
    let noise_strength: f64 = (rand::random::<u32>() % 100) as f64 / 1000.0; // 0.000-0.099
    
    let manifest = serde_json::json!({
        "manifest_version": 3,
        "name": "Fingerprint Guard",
        "version": "1.0",
        "description": "Canvas/WebGL fingerprint noise injection",
        "content_scripts": [{
            "matches": ["<all_urls>"],
            "js": ["inject.js"],
            "run_at": "document_start",
            "all_frames": true,
            "world": "MAIN"
        }]
    });
    
    let inject_js = format!(r#"
(function() {{
    const seed = {seed};
    const noise = {noise_strength};
    
    // Canvas 指纹伪造 - 注入微小噪声
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function() {{
        const ctx = this.getContext('2d');
        if (ctx) {{
            try {{
                const imageData = ctx.getImageData(0, 0, this.width, this.height);
                const data = imageData.data;
                for (let i = 0; i < data.length; i += 4) {{
                    // 用 seed 生成确定性噪声
                    const n = ((Math.sin(i * seed) * 10000) % 1) * noise * 255;
                    data[i] = Math.max(0, Math.min(255, data[i] + n));
                }}
                ctx.putImageData(imageData, 0, 0);
            }} catch(e) {{}}
        }}
        return origToDataURL.apply(this, arguments);
    }};
    
    const origToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function() {{
        const ctx = this.getContext('2d');
        if (ctx) {{
            try {{
                const imageData = ctx.getImageData(0, 0, this.width, this.height);
                const data = imageData.data;
                for (let i = 0; i < data.length; i += 4) {{
                    const n = ((Math.sin(i * seed) * 10000) % 1) * noise * 255;
                    data[i] = Math.max(0, Math.min(255, data[i] + n));
                }}
                ctx.putImageData(imageData, 0, 0);
            }} catch(e) {{}}
        }}
        return origToBlob.apply(this, arguments);
    }};
    
    // WebGL 指纹伪造
    const origGetParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(param) {{
        // VENDOR
        if (param === 37445) return 'Google Inc. (NVIDIA)';
        // RENDERER
        if (param === 37446) return 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)';
        return origGetParameter.apply(this, arguments);
    }};
    
    try {{
        const origGetParameter2 = WebGL2RenderingContext.prototype.getParameter;
        WebGL2RenderingContext.prototype.getParameter = function(param) {{
            if (param === 37445) return 'Google Inc. (NVIDIA)';
            if (param === 37446) return 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)';
            return origGetParameter2.apply(this, arguments);
        }};
    }} catch(e) {{}}
    
    // AudioContext 指纹伪造
    const origCreateAnalyser = AudioContext.prototype.createAnalyser;
    AudioContext.prototype.createAnalyser = function() {{
        const analyser = origCreateAnalyser.apply(this, arguments);
        const origGetFloatFrequencyData = analyser.getFloatFrequencyData;
        analyser.getFloatFrequencyData = function(array) {{
            origGetFloatFrequencyData.apply(this, arguments);
            for (let i = 0; i < array.length; i++) {{
                array[i] += ((Math.sin(i * seed) * 10000) % 1) * noise * 10;
            }}
        }};
        return analyser;
    }};
}})();
"#);
    
    std::fs::write(ext_dir.join("manifest.json"), manifest.to_string()).ok()?;
    std::fs::write(ext_dir.join("inject.js"), inject_js).ok()?;
    
    Some(ext_dir)
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
    
    // 生成指纹伪造扩展（每个账号独立 seed）
    let fingerprint_ext = ensure_fingerprint_extension(&app_data_dir, &profile.id);
    
    // 生成独立端口
    let debug_port = 19222 + rand::random::<u16>() % 1000;
    
    // 窗口位置偏移
    let window_offset = rand::random::<i32>() % 100;
    
    // 随机分辨率（从常见分辨率中选）
    let resolutions = [
        (1366, 768), (1920, 1080), (1440, 900), (1536, 864),
        (1600, 900), (1280, 720), (1280, 800),
    ];
    let (vp_w, vp_h) = if profile.viewport_width > 0 && profile.viewport_height > 0 {
        (profile.viewport_width, profile.viewport_height)
    } else {
        let idx = rand::random::<usize>() % resolutions.len();
        resolutions[idx]
    };
    
    // 随机 UA（如果 profile 未指定）
    let user_agent = profile.user_agent.clone()
        .unwrap_or_else(generate_random_ua);
    
    let mut args = vec![
        format!("--user-data-dir={}", user_data_dir.to_string_lossy()),
        format!("--window-size={},{}", vp_w, vp_h),
        format!("--window-position={},100", 100 + window_offset),
        format!("--remote-debugging-port={}", debug_port),
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
        "--disable-dev-shm-usage".to_string(),
        "--disable-breakpad".to_string(),
        "--disable-crash-reporter".to_string(),
        "--disable-features=IsolateOrigins,site-per-process".to_string(),
        "--disable-site-isolation-trials".to_string(),
        "--disable-features=CrossSiteDocumentBlocking,ChromeSingle".to_string(),
        "--disable-backgrounding-occluded-windows".to_string(),
        format!("--lang={}", profile.locale),
        format!("--user-agent={}", user_agent),
    ];
    
    // 代理配置
    if let Some(proxy) = &profile.proxy {
        if !proxy.is_empty() {
            args.push(format!("--proxy-server={}", proxy));
        }
    }
    
    // 加载扩展（用户扩展 + 指纹扩展）
    let mut load_extensions = vec![];
    if let Ok(entries) = std::fs::read_dir(&extensions_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && path.join("manifest.json").exists() {
                load_extensions.push(path.to_string_lossy().to_string());
            }
        }
    }
    if let Some(fp_ext) = &fingerprint_ext {
        load_extensions.push(fp_ext.to_string_lossy().to_string());
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
        cmd.creation_flags(0x00000008 | 0x00000200);
    }
    
    let child = cmd.spawn()
        .map_err(|e| format!("启动浏览器失败: {}", e))?;
    
    let pid = child.id();
    
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
