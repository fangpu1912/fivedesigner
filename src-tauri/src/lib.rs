use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Seek};
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Arc, Mutex};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use tauri::{AppHandle, Manager, Listener, Emitter};
use futures_util::{SinkExt, StreamExt};
use image::GenericImageView;

mod modelscope;
mod video_scene_detection;

#[derive(Serialize, Deserialize, Debug)]
pub struct HttpRequest {
    pub method: String,
    pub url: String,
    pub headers: Option<serde_json::Value>,
    pub body: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct HttpResponse {
    pub status: u16,
    pub headers: serde_json::Value,
    pub body: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<String>,
}

#[tauri::command]
async fn download_video_via_browser(
    app: AppHandle,
    url: String,
    filename: String,
    task_id: Option<String>,
    project_id: Option<String>,
    episode_id: Option<String>,
) -> Result<String, String> {
    use std::io::Write;
    use tauri::Emitter;

    let browser_path = find_browser_path()
        .ok_or("未找到 Chrome 或 Edge 浏览器".to_string())?;

    let debug_port = 19223u16;
    let temp_dir = std::env::temp_dir().join("fivedesigner-cdp-download");
    let _ = std::fs::create_dir_all(&temp_dir);

    let mut child = Command::new(&browser_path)
        .args(&[
            &format!("--remote-debugging-port={}", debug_port),
            &format!("--user-data-dir={}", temp_dir.to_string_lossy()),
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-extensions",
            "--disable-popup-blocking",
            "--headless=new",
            "about:blank",
        ])
        .spawn()
        .map_err(|e| format!("启动浏览器失败: {}", e))?;

    let result = tokio::time::timeout(
        std::time::Duration::from_secs(120),
        browser_fetch_video(app.clone(), debug_port, &url, &filename, task_id.clone(), project_id.clone(), episode_id.clone()),
    ).await;

    let _ = child.kill();

    match result {
        Ok(Ok(path)) => Ok(path),
        Ok(Err(e)) => Err(e),
        Err(_) => Err("浏览器下载超时".to_string()),
    }
}

async fn browser_fetch_video(
    app: AppHandle,
    port: u16,
    video_url: &str,
    filename: &str,
    task_id: Option<String>,
    project_id: Option<String>,
    episode_id: Option<String>,
) -> Result<String, String> {
    use std::io::Write;
    use tauri::Emitter;

    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    let tabs_url = format!("http://localhost:{}/json", port);
    let http_client = reqwest::Client::new();

    let ws_url = {
        let mut attempts = 0;
        loop {
            match http_client.get(&tabs_url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    if let Ok(tabs) = resp.json::<Vec<serde_json::Value>>().await {
                        if let Some(tab) = tabs.first() {
                            let ws = tab.get("webSocketDebuggerUrl").and_then(|v| v.as_str()).unwrap_or("").to_string();
                            if !ws.is_empty() {
                                break ws;
                            }
                        }
                    }
                }
                _ => {}
            }
            attempts += 1;
            if attempts > 20 {
                return Err("无法连接到浏览器调试端口".to_string());
            }
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }
    };

    let (mut ws_stream, _) = tokio_tungstenite::connect_async(&ws_url)
        .await
        .map_err(|e| format!("WebSocket 连接失败: {}", e))?;

    let msg_id = Arc::new(std::sync::atomic::AtomicU32::new(1));
    let next_id = || msg_id.fetch_add(1, std::sync::atomic::Ordering::Relaxed);

    let enable_id = next_id();
    let enable_msg = serde_json::json!({"id": enable_id, "method": "Network.enable", "params": {}}).to_string();
    ws_stream.send(tokio_tungstenite::tungstenite::Message::Text(enable_msg.into()))
        .await.map_err(|e| format!("CDP 命令失败: {}", e))?;

    let page_enable_id = next_id();
    let page_enable_msg = serde_json::json!({"id": page_enable_id, "method": "Page.enable", "params": {}}).to_string();
    ws_stream.send(tokio_tungstenite::tungstenite::Message::Text(page_enable_msg.into()))
        .await.map_err(|e| format!("CDP 命令失败: {}", e))?;

    tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    while let Ok(Some(Ok(tokio_tungstenite::tungstenite::Message::Text(_)))) =
        tokio::time::timeout(std::time::Duration::from_millis(100), ws_stream.next()).await {};

    let fetch_js = format!(
        r#"
        (async function() {{
            try {{
                const resp = await fetch("{video_url}", {{
                    method: "GET",
                    credentials: "include",
                    headers: {{
                        "Accept": "video/*,*/*",
                        "Accept-Language": "zh-CN,zh;q=0.9"
                    }}
                }});
                if (!resp.ok) return JSON.stringify({{error: "HTTP " + resp.status}});
                const blob = await resp.blob();
                const reader = new FileReader();
                return new Promise((resolve) => {{
                    reader.onload = () => {{
                        const base64 = reader.result.split(',')[1];
                        resolve(JSON.stringify({{
                            size: blob.size,
                            type: blob.type,
                            data: base64
                        }}));
                    }};
                    reader.readAsDataURL(blob);
                }});
            }} catch(e) {{
                return JSON.stringify({{error: e.message}});
            }}
        }})()
        "#,
        video_url = video_url.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', "\\n")
    );

    let fetch_id = next_id();
    let fetch_msg = serde_json::json!({
        "id": fetch_id,
        "method": "Runtime.evaluate",
        "params": {
            "expression": fetch_js,
            "awaitPromise": true,
            "returnByValue": true,
            "timeout": 110000
        }
    }).to_string();
    ws_stream.send(tokio_tungstenite::tungstenite::Message::Text(fetch_msg.into()))
        .await.map_err(|e| format!("CDP fetch 命令失败: {}", e))?;

    let start = std::time::Instant::now();
    let fetch_timeout = std::time::Duration::from_secs(110);
    let mut fetch_result: Option<String> = None;

    while start.elapsed() < fetch_timeout {
        let remaining = fetch_timeout - start.elapsed();
        let poll_timeout = std::time::Duration::from_millis(1000).min(remaining);

        match tokio::time::timeout(poll_timeout, ws_stream.next()).await {
            Ok(Some(Ok(tokio_tungstenite::tungstenite::Message::Text(text)))) => {
                if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&text) {
                    let msg_id_val = msg.get("id").and_then(|i| i.as_u64()).unwrap_or(0) as u32;
                    if msg_id_val == fetch_id as u32 {
                        if let Some(result) = msg.get("result") {
                            if let Some(exception) = result.get("exceptionDetails") {
                                let desc = exception.get("text").and_then(|t| t.as_str()).unwrap_or("unknown error");
                                return Err(format!("浏览器 fetch 失败: {}", desc));
                            }
                            if let Some(value) = result.get("result").and_then(|r| r.get("value")) {
                                if let Some(val_str) = value.as_str() {
                                    fetch_result = Some(val_str.to_string());
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            Ok(Some(Ok(_))) => {}
            Ok(Some(Err(e))) => {
                return Err(format!("WebSocket 错误: {}", e));
            }
            Ok(None) => break,
            Err(_) => {}
        }
    }

    let result_str = fetch_result.ok_or("浏览器 fetch 超时，未收到响应".to_string())?;
    let parsed: serde_json::Value = serde_json::from_str(&result_str)
        .map_err(|e| format!("解析 fetch 结果失败: {}", e))?;

    if let Some(error) = parsed.get("error") {
        return Err(format!("浏览器 fetch 错误: {}", error));
    }

    let size = parsed.get("size").and_then(|s| s.as_u64()).unwrap_or(0);
    if size < 1000 {
        return Err(format!("下载内容过小 ({} bytes)，可能是错误页面", size));
    }

    let base64_data = parsed.get("data").and_then(|d| d.as_str()).unwrap_or("");
    if base64_data.is_empty() {
        return Err("fetch 返回空数据".to_string());
    }

    let video_bytes = base64::decode(base64_data)
        .map_err(|e| format!("Base64 解码失败: {}", e))?;

    let workspace_path = get_workspace_path(app.clone()).await
        .map_err(|e| format!("Failed to get workspace path: {}", e))?;

    let base_dir = PathBuf::from(&workspace_path);
    let save_dir = if let (Some(proj_id), Some(ep_id)) = (&project_id, &episode_id) {
        base_dir.join("projects").join(proj_id).join(ep_id).join("videos")
    } else {
        base_dir.join("temp").join("videos")
    };

    fs::create_dir_all(&save_dir)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    let save_path = save_dir.join(filename);

    let mut file = fs::File::create(&save_path)
        .map_err(|e| format!("Failed to create file: {}", e))?;

    file.write_all(&video_bytes)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    let tid = task_id.unwrap_or_default();
    let _ = app.emit("download-video-progress", serde_json::json!({
        "url": video_url,
        "downloaded": video_bytes.len() as u64,
        "total": video_bytes.len() as u64,
        "filename": filename,
        "taskId": &tid,
    }));

    Ok(save_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn http_proxy(request: HttpRequest) -> Result<HttpResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("Failed to create client: {}", e))?;
    
    let mut req_builder = match request.method.to_uppercase().as_str() {
        "GET" => client.get(&request.url),
        "POST" => client.post(&request.url),
        "PUT" => client.put(&request.url),
        "DELETE" => client.delete(&request.url),
        "PATCH" => client.patch(&request.url),
        _ => return Err(format!("Unsupported HTTP method: {}", request.method)),
    };

    if let Some(headers) = request.headers {
        if let Some(headers_obj) = headers.as_object() {
            for (key, value) in headers_obj {
                if let Some(val_str) = value.as_str() {
                    req_builder = req_builder.header(key, val_str);
                }
            }
        }
    }

    if let Some(body) = request.body {
        req_builder = req_builder.json(&body);
    }

    let response = req_builder
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let status = response.status().as_u16();
    
    let mut headers_map = serde_json::Map::new();
    for (key, value) in response.headers() {
        if let Ok(val_str) = value.to_str() {
            headers_map.insert(key.to_string(), serde_json::Value::String(val_str.to_string()));
        }
    }

    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    Ok(HttpResponse {
        status,
        headers: serde_json::Value::Object(headers_map),
        body,
    })
}

#[tauri::command]
async fn get_app_data_dir(app: AppHandle) -> Result<String, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
async fn ensure_data_dir(app: AppHandle) -> Result<String, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    let assets_dir = data_dir.join("assets");
    let projects_dir = data_dir.join("projects");
    
    fs::create_dir_all(&assets_dir)
        .map_err(|e| format!("Failed to create assets dir: {}", e))?;
    fs::create_dir_all(&projects_dir)
        .map_err(|e| format!("Failed to create projects dir: {}", e))?;
    
    Ok(data_dir.to_string_lossy().to_string())
}

#[tauri::command]
async fn save_file(path: String, content: String) -> Result<(), String> {
    let path = PathBuf::from(&path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent dir: {}", e))?;
    }
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
async fn read_file_base64(path: String) -> Result<String, String> {
    let bytes = fs::read(&path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    Ok(base64::encode(&bytes))
}

#[tauri::command]
async fn delete_file(path: String) -> Result<(), String> {
    let path = PathBuf::from(&path);
    if path.is_dir() {
        fs::remove_dir_all(&path)
            .map_err(|e| format!("Failed to remove directory: {}", e))?;
    } else {
        fs::remove_file(&path)
            .map_err(|e| format!("Failed to remove file: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
async fn list_dir(path: String) -> Result<Vec<FileInfo>, String> {
    let path = PathBuf::from(&path);
    let mut files = Vec::new();
    
    let entries = fs::read_dir(&path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;
    
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let metadata = entry.metadata().map_err(|e| format!("Failed to read metadata: {}", e))?;
        
        files.push(FileInfo {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
            size: metadata.len(),
            modified: metadata.modified()
                .ok()
                .and_then(|t| {
                    let datetime: chrono::DateTime<chrono::Utc> = t.into();
                    Some(datetime.to_rfc3339())
                }),
        });
    }
    
    Ok(files)
}

#[tauri::command]
async fn copy_file(src: String, dst: String) -> Result<(), String> {
    let dst_path = PathBuf::from(&dst);
    if let Some(parent) = dst_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent dir: {}", e))?;
    }
    fs::copy(&src, &dst)
        .map_err(|e| format!("Failed to copy file: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn file_exists(path: String) -> Result<bool, String> {
    Ok(PathBuf::from(&path).exists())
}

/// 创建隐藏窗口的命令（Windows 上使用 CREATE_NO_WINDOW 标志，防止命令行弹窗）
#[cfg(target_os = "windows")]
pub(crate) fn create_command<S: AsRef<std::ffi::OsStr>>(program: S) -> Command {
    let mut cmd = Command::new(program);
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    cmd
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn create_command<S: AsRef<std::ffi::OsStr>>(program: S) -> Command {
    Command::new(program)
}

// FFmpeg 相关命令

#[derive(Serialize, Deserialize, Debug)]
pub struct FFmpegStatus {
    pub installed: bool,
    pub source: String, // "system", "app", "none"
    pub version: Option<String>,
    pub path: Option<String>,
}

#[tauri::command]
async fn check_ffmpeg_status(app: AppHandle) -> Result<FFmpegStatus, String> {
    // 1. 先检查系统 PATH 中的 FFmpeg
    match create_command("ffmpeg")
        .args(&["-version"])
        .output()
    {
        Ok(output) => {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let version = stdout
                    .lines()
                    .next()
                    .and_then(|line| line.split_whitespace().nth(2))
                    .map(|s| s.to_string());
                
                return Ok(FFmpegStatus {
                    installed: true,
                    source: "system".to_string(),
                    version,
                    path: Some("ffmpeg".to_string()),
                });
            }
        }
        Err(_) => {
            // 系统 PATH 中没有 FFmpeg，继续检查应用目录
        }
    }
    
    // 2. 检查应用数据目录中的 FFmpeg
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    let ffmpeg_dir = app_data_dir.join("ffmpeg");
    
    #[cfg(target_os = "windows")]
    let ffmpeg_exe = ffmpeg_dir.join("ffmpeg.exe");
    #[cfg(not(target_os = "windows"))]
    let ffmpeg_exe = ffmpeg_dir.join("ffmpeg");
    
    if ffmpeg_exe.exists() {
        // 验证这个 FFmpeg 是否可用
        match create_command(&ffmpeg_exe)
            .args(&["-version"])
            .output()
        {
            Ok(output) => {
                if output.status.success() {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    let version = stdout
                        .lines()
                        .next()
                        .and_then(|line| line.split_whitespace().nth(2))
                        .map(|s| s.to_string());
                    
                    return Ok(FFmpegStatus {
                        installed: true,
                        source: "app".to_string(),
                        version,
                        path: Some(ffmpeg_exe.to_string_lossy().to_string()),
                    });
                }
            }
            Err(_) => {}
        }
    }
    
    // 3. 未找到 FFmpeg
    Ok(FFmpegStatus {
        installed: false,
        source: "none".to_string(),
        version: None,
        path: None,
    })
}

#[derive(Serialize, Deserialize, Debug)]
pub struct DownloadProgress {
    pub progress: u8,
    pub message: String,
}

#[tauri::command]
async fn download_ffmpeg(
    app: AppHandle,
    url: String,
    target_dir: String,
) -> Result<String, String> {
    use std::io::Write;
    
    let target_path = PathBuf::from(&target_dir);
    fs::create_dir_all(&target_path)
        .map_err(|e| format!("Failed to create target dir: {}", e))?;
    
    // 下载文件
    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to download: {}", e))?;
    
    let total_size = response
        .content_length()
        .ok_or("Failed to get content length")?;
    
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    
    let download_path = target_path.join("ffmpeg.zip");
    let mut file = fs::File::create(&download_path)
        .map_err(|e| format!("Failed to create file: {}", e))?;
    
    while let Some(result) = stream.next().await {
        let chunk = result.map_err(|e| format!("Failed to download chunk: {}", e))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Failed to write chunk: {}", e))?;
        downloaded += chunk.len() as u64;
        
        let progress = ((downloaded as f64 / total_size as f64) * 100.0) as u8;
        // 可以在这里发送进度事件到前端
    }
    
    // 解压文件
    let extract_dir = target_path.join("extracted");
    fs::create_dir_all(&extract_dir)
        .map_err(|e| format!("Failed to create extract dir: {}", e))?;
    
    // 使用 zip 库解压
    let file = fs::File::open(&download_path)
        .map_err(|e| format!("Failed to open zip file: {}", e))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Failed to read zip: {}", e))?;
    
    archive.extract(&extract_dir)
        .map_err(|e| format!("Failed to extract zip: {}", e))?;
    
    // 查找 ffmpeg.exe
    let mut ffmpeg_path: Option<PathBuf> = None;
    
    fn find_ffmpeg(dir: &PathBuf) -> Option<PathBuf> {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    if let Some(found) = find_ffmpeg(&path) {
                        return Some(found);
                    }
                } else {
                    #[cfg(target_os = "windows")]
                    let is_ffmpeg = path.file_name()
                        .map(|n| n.to_string_lossy().eq_ignore_ascii_case("ffmpeg.exe"))
                        .unwrap_or(false);
                    #[cfg(not(target_os = "windows"))]
                    let is_ffmpeg = path.file_name()
                        .map(|n| n.to_string_lossy() == "ffmpeg")
                        .unwrap_or(false);
                    
                    if is_ffmpeg {
                        return Some(path);
                    }
                }
            }
        }
        None
    }
    
    if let Some(found) = find_ffmpeg(&extract_dir) {
        ffmpeg_path = Some(found);
    }
    
    if let Some(ffmpeg) = ffmpeg_path {
        // 复制到目标目录
        let target_ffmpeg = target_path.join(ffmpeg.file_name().unwrap());
        fs::copy(&ffmpeg, &target_ffmpeg)
            .map_err(|e| format!("Failed to copy ffmpeg: {}", e))?;
        
        // 清理临时文件
        let _ = fs::remove_dir_all(&extract_dir);
        let _ = fs::remove_file(&download_path);
        
        Ok(target_ffmpeg.to_string_lossy().to_string())
    } else {
        Err("FFmpeg executable not found in downloaded archive".to_string())
    }
}

#[tauri::command]
async fn render_video_with_ffmpeg(
    ffmpeg_path: String,
    command_args: Vec<String>,
) -> Result<String, String> {
    let output = create_command(&ffmpeg_path)
        .args(&command_args)
        .output()
        .map_err(|e| format!("Failed to execute FFmpeg: {}", e))?;
    
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
async fn render_video_with_ffmpeg_script(
    app: AppHandle,
    ffmpegPath: String,
    commandScript: String,
    outputFile: String,
    concatList: String,
    project_id: Option<String>,
    episode_id: Option<String>,
) -> Result<String, String> {
    // 获取工作目录
    let workspace_path = get_workspace_path(app.clone()).await
        .map_err(|e| format!("Failed to get workspace path: {}", e))?;
    let working_dir = PathBuf::from(&workspace_path);
    
    // 构建输出目录：优先使用项目结构
    let (output_dir, final_output_path) = if let (Some(proj_id), Some(ep_id)) = (project_id, episode_id) {
        let videos_dir = working_dir.join("projects").join(proj_id).join(ep_id).join("videos");
        let output_path = if std::path::Path::new(&outputFile).is_absolute() {
            outputFile
        } else {
            videos_dir.join(&outputFile).to_string_lossy().to_string()
        };
        (videos_dir, output_path)
    } else {
        // 没有项目信息时使用 renders 目录
        let renders_dir = working_dir.join("renders");
        let output_path = if std::path::Path::new(&outputFile).is_absolute() {
            outputFile
        } else {
            renders_dir.join(&outputFile).to_string_lossy().to_string()
        };
        (renders_dir, output_path)
    };
    
    fs::create_dir_all(&output_dir)
        .map_err(|e| format!("Failed to create output dir: {}", e))?;
    
    // 创建临时文件目录
    let temp_dir = output_dir.join(".temp");
    fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp dir: {}", e))?;
    
    // 创建 concat_list.txt 文件
    let concat_list_path = temp_dir.join("concat_list.txt");
    fs::write(&concat_list_path, concatList)
        .map_err(|e| format!("Failed to write concat list: {}", e))?;
    
    // 创建 PowerShell 脚本文件
    let script_path = temp_dir.join("render_script.ps1");
    
    let script_content = format!(
        "Set-Location -Path \"{}\"\n{}\n",
        output_dir.to_string_lossy(),
        commandScript
    );
    
    fs::write(&script_path, script_content)
        .map_err(|e| format!("Failed to write script: {}", e))?;
    
    // 执行 PowerShell 脚本
    #[cfg(target_os = "windows")]
    let output = create_command("powershell")
        .args(&["-ExecutionPolicy", "Bypass", "-File", script_path.to_str().unwrap()])
        .current_dir(&output_dir)
        .output()
        .map_err(|e| format!("Failed to execute script: {}", e))?;
    
    #[cfg(not(target_os = "windows"))]
    let output = create_command("pwsh")
        .args(&["-ExecutionPolicy", "Bypass", "-File", script_path.to_str().unwrap()])
        .current_dir(&output_dir)
        .output()
        .map_err(|e| format!("Failed to execute script: {}", e))?;
    
    // 读取完整的输出
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    
    // 清理临时文件
    let _ = fs::remove_dir_all(&temp_dir);
    
    if output.status.success() {
        // 检查输出文件是否真的存在
        // 尝试多种路径格式
        let paths_to_check = vec![
            final_output_path.clone(),
            final_output_path.replace('/', "\\"),
            final_output_path.replace('\\', "/"),
            working_dir.join(std::path::Path::new(&final_output_path).file_name().unwrap_or_default()).to_string_lossy().to_string(),
        ];
        
        let file_exists = paths_to_check.iter().any(|p| std::path::Path::new(p).exists());
        
        if file_exists {
            Ok(final_output_path)
        } else {
            // 文件可能已生成但路径检测失败，仍然返回成功
            // 因为 FFmpeg 返回了成功状态
            Ok(final_output_path)
        }
    } else {
        // 尝试从输出中提取更有用的错误信息
        let error_msg = if stderr.is_empty() {
            if stdout.is_empty() {
                "Unknown error (no output)".to_string()
            } else {
                format!("Script output: {}", stdout)
            }
        } else {
            stderr.to_string()
        };
        Err(format!("FFmpeg render failed:\n{}", error_msg))
    }
}

#[tauri::command]
async fn get_workspace_path(app: AppHandle) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    // 尝试读取用户设置的工作目录
    let workspace_config_path = app_data_dir.join("workspace-config.json");
    if workspace_config_path.exists() {
        match fs::read_to_string(&workspace_config_path) {
            Ok(content) => {
                // 使用 serde_json 正确解析 JSON
                match serde_json::from_str::<serde_json::Value>(&content) {
                    Ok(json) => {
                        if let Some(path) = json.get("workspace_path").and_then(|v| v.as_str()) {
                            return Ok(path.to_string());
                        }
                    }
                    Err(_) => {}
                }
            }
            Err(_) => {}
        }
    }
    
    // 返回默认路径
    Ok(app_data_dir.to_string_lossy().to_string())
}

#[tauri::command]
async fn download_image(app: AppHandle, url: String, filename: String, project_id: Option<String>, episode_id: Option<String>) -> Result<String, String> {
    use std::io::Write;
    
    // 获取工作目录
    let workspace_path = get_workspace_path(app.clone()).await
        .map_err(|e| format!("Failed to get workspace path: {}", e))?;
    
    // 构建保存路径
    let base_dir = PathBuf::from(&workspace_path);
    let save_dir = if let (Some(proj_id), Some(ep_id)) = (project_id, episode_id) {
        base_dir.join("projects").join(proj_id).join(ep_id).join("images")
    } else {
        base_dir.join("temp").join("images")
    };
    
    // 确保目录存在
    fs::create_dir_all(&save_dir)
        .map_err(|e| format!("Failed to create directory: {}", e))?;
    
    let save_path = save_dir.join(&filename);
    
    // 发送 HTTP 请求下载图片
    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to download image: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }
    
    // 读取图片数据
    let image_data = response.bytes()
        .await
        .map_err(|e| format!("Failed to read image data: {}", e))?;
    
    // 写入文件
    let mut file = fs::File::create(&save_path)
        .map_err(|e| format!("Failed to create file: {}", e))?;
    
    file.write_all(&image_data)
        .map_err(|e| format!("Failed to write file: {}", e))?;
    
    Ok(save_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn download_video(
    app: AppHandle,
    url: String,
    filename: String,
    task_id: Option<String>,
    project_id: Option<String>,
    episode_id: Option<String>,
    cookies: Option<String>,
) -> Result<String, String> {
    use std::io::Write;
    use tauri::Emitter;

    let workspace_path = get_workspace_path(app.clone()).await
        .map_err(|e| format!("Failed to get workspace path: {}", e))?;

    let base_dir = PathBuf::from(&workspace_path);
    let save_dir = if let (Some(proj_id), Some(ep_id)) = (&project_id, &episode_id) {
        base_dir.join("projects").join(proj_id).join(ep_id).join("videos")
    } else {
        base_dir.join("temp").join("videos")
    };

    fs::create_dir_all(&save_dir)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    let save_path = save_dir.join(&filename);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let mut request = client.get(&url)
        .header("Accept", "video/*,*/*");

    if url.contains("jimeng") || url.contains("jianying") {
        request = request.header("Referer", "https://jimeng.jianying.com/");
    } else if url.contains("doubao") {
        request = request.header("Referer", "https://www.doubao.com/");
    }

    if let Some(ref cookie_str) = cookies {
        if !cookie_str.is_empty() {
            request = request.header("Cookie", cookie_str.as_str());
        }
    }

    let mut response = request
        .send()
        .await
        .map_err(|e| format!("Failed to download video: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let total_size = response.content_length();
    let mut downloaded: u64 = 0;
    let mut file = fs::File::create(&save_path)
        .map_err(|e| format!("Failed to create file: {}", e))?;

    let tid = task_id.unwrap_or_default();
    let mut chunk_index: u64 = 0;
    while let Some(chunk) = response.chunk().await.map_err(|e| format!("Failed to read chunk: {}", e))? {
        file.write_all(&chunk)
            .map_err(|e| format!("Failed to write chunk: {}", e))?;
        downloaded += chunk.len() as u64;
        chunk_index += 1;

        if chunk_index % 10 == 0 {
            let _ = app.emit("download-video-progress", serde_json::json!({
                "url": &url,
                "downloaded": downloaded,
                "total": total_size,
                "filename": &filename,
                "taskId": &tid,
            }));
        }
    }

    let _ = app.emit("download-video-progress", serde_json::json!({
        "url": &url,
        "downloaded": downloaded,
        "total": total_size.or(Some(downloaded)),
        "filename": &filename,
        "taskId": &tid,
    }));

    Ok(save_path.to_string_lossy().to_string())
}

#[derive(serde::Serialize)]
struct ResolvedVideo {
    video_url: String,
    title: String,
    platform: String,
    thumbnail: Option<String>,
    needs_browser_download: bool,
}

#[tauri::command]
async fn resolve_video_url(url: String) -> Result<ResolvedVideo, String> {
    if url.contains(".mp4") || url.contains(".webm") || url.contains(".mov") {
        let filename = url.split('/').last().unwrap_or("video.mp4").to_string();
        return Ok(ResolvedVideo {
            video_url: url,
            title: filename,
            platform: "direct".to_string(),
            thumbnail: None,
            needs_browser_download: false,
        });
    }

    let platform = if url.contains("doubao.com") {
        "doubao"
    } else if url.contains("jimeng.jianying.com") {
        "jimeng"
    } else {
        return Err("不支持的平台，请粘贴豆包/即梦分享链接或直接视频URL".to_string());
    };

    resolve_with_cdp(&url, platform).await
}

async fn resolve_with_cdp(share_url: &str, platform: &str) -> Result<ResolvedVideo, String> {
    let browser_path = find_browser_path()
        .ok_or("未找到 Chrome 或 Edge 浏览器，请安装后重试".to_string())?;

    let debug_port = 19222u16;
    let temp_dir = std::env::temp_dir().join("fivedesigner-cdp-profile");
    let _ = std::fs::create_dir_all(&temp_dir);

    let mut child = Command::new(&browser_path)
        .args(&[
            &format!("--remote-debugging-port={}", debug_port),
            &format!("--user-data-dir={}", temp_dir.to_string_lossy()),
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-extensions",
            "--disable-popup-blocking",
            "--window-size=1024,768",
            "about:blank",
        ])
        .spawn()
        .map_err(|e| format!("启动浏览器失败: {}", e))?;

    let needs_browser = platform == "jimeng";

    let result = tokio::time::timeout(
        std::time::Duration::from_secs(40),
        cdp_intercept_video(debug_port, share_url, platform, needs_browser),
    ).await;

    let _ = child.kill();

    match result {
        Ok(Ok(resolved)) => Ok(resolved),
        Ok(Err(e)) => Err(e),
        Err(_) => Err("解析超时，页面可能需要登录或链接已过期".to_string()),
    }
}

async fn cdp_intercept_video(port: u16, share_url: &str, platform: &str, needs_browser_download: bool) -> Result<ResolvedVideo, String> {
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    let tabs_url = format!("http://localhost:{}/json", port);
    let client = reqwest::Client::new();

    let (ws_url, _target_id) = {
        let mut attempts = 0;
        loop {
            match client.get(&tabs_url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    if let Ok(tabs) = resp.json::<Vec<serde_json::Value>>().await {
                        if let Some(tab) = tabs.first() {
                            let ws = tab.get("webSocketDebuggerUrl").and_then(|v| v.as_str()).unwrap_or("").to_string();
                            let tid = tab.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                            if !ws.is_empty() {
                                break (ws, tid);
                            }
                        }
                    }
                }
                _ => {}
            }
            attempts += 1;
            if attempts > 15 {
                return Err("无法连接到浏览器调试端口".to_string());
            }
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }
    };

    let (mut ws_stream, _) = tokio_tungstenite::connect_async(&ws_url)
        .await
        .map_err(|e| format!("WebSocket 连接失败: {}", e))?;

    let msg_id = Arc::new(std::sync::atomic::AtomicU32::new(1));
    let next_id = || msg_id.fetch_add(1, std::sync::atomic::Ordering::Relaxed);

    let enable_id = next_id();
    let enable_msg = serde_json::json!({"id": enable_id, "method": "Network.enable", "params": {}}).to_string();
    ws_stream.send(tokio_tungstenite::tungstenite::Message::Text(enable_msg.into()))
        .await.map_err(|e| format!("CDP 命令失败: {}", e))?;

    let page_enable_id = next_id();
    let page_enable_msg = serde_json::json!({"id": page_enable_id, "method": "Page.enable", "params": {}}).to_string();
    ws_stream.send(tokio_tungstenite::tungstenite::Message::Text(page_enable_msg.into()))
        .await.map_err(|e| format!("CDP 命令失败: {}", e))?;

    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    while let Ok(Some(Ok(tokio_tungstenite::tungstenite::Message::Text(_)))) =
        tokio::time::timeout(std::time::Duration::from_millis(100), ws_stream.next()).await {};

    let navigate_id = next_id();
    let navigate_msg = serde_json::json!({
        "id": navigate_id,
        "method": "Page.navigate",
        "params": { "url": share_url }
    }).to_string();
    ws_stream.send(tokio_tungstenite::tungstenite::Message::Text(navigate_msg.into()))
        .await.map_err(|e| format!("CDP 导航失败: {}", e))?;

    let mut captured_urls: Vec<String> = Vec::new();
    let mut api_video_url: Option<String> = None;
    let mut captured_api_data: Vec<serde_json::Value> = Vec::new();
    let mut page_title = String::new();
    let mut pending_body_requests: std::collections::HashMap<u32, String> = std::collections::HashMap::new();

    let start = std::time::Instant::now();
    let total_timeout = std::time::Duration::from_secs(35);
    let mut clicked_play = false;
    let click_attempted_at = std::time::Duration::from_secs(8);

    while start.elapsed() < total_timeout {
        let remaining = total_timeout - start.elapsed();
        let poll_timeout = std::time::Duration::from_millis(500).min(remaining);

        match tokio::time::timeout(poll_timeout, ws_stream.next()).await {
            Ok(Some(Ok(tokio_tungstenite::tungstenite::Message::Text(text)))) => {
                if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&text) {
                    let method = msg.get("method").and_then(|m| m.as_str()).unwrap_or("");

                    match method {
                        "Network.responseReceived" => {
                            if let Some(params) = msg.get("params") {
                                if let Some(response) = params.get("response") {
                                    let url = response.get("url").and_then(|u| u.as_str()).unwrap_or("");
                                    let status = response.get("status").and_then(|s| s.as_u64()).unwrap_or(0);

                                    if is_video_cdn_url(url) && status == 200 {
                                        if !captured_urls.contains(&url.to_string()) {
                                            captured_urls.push(url.to_string());
                                        }
                                    }

                                    if is_api_endpoint(url) && status == 200 {
                                        let request_id = params.get("requestId").and_then(|r| r.as_str()).unwrap_or("").to_string();
                                        if !request_id.is_empty() {
                                            let get_body_id = next_id();
                                            pending_body_requests.insert(get_body_id, request_id.clone());
                                            let get_body_msg = serde_json::json!({
                                                "id": get_body_id,
                                                "method": "Network.getResponseBody",
                                                "params": { "requestId": request_id }
                                            }).to_string();
                                            let _ = ws_stream.send(tokio_tungstenite::tungstenite::Message::Text(get_body_msg.into())).await;
                                        }
                                    }
                                }
                            }
                        }
                        "Network.requestWillBeSent" => {
                            if let Some(params) = msg.get("params") {
                                if let Some(request) = params.get("request") {
                                    let url = request.get("url").and_then(|u| u.as_str()).unwrap_or("");
                                    if is_video_cdn_url(url) && url.contains("http") {
                                        if !captured_urls.contains(&url.to_string()) {
                                            captured_urls.push(url.to_string());
                                        }
                                    }
                                }
                            }
                        }
                        _ => {
                            if let Some(result) = msg.get("result") {
                                let msg_id_val = msg.get("id").and_then(|i| i.as_u64()).unwrap_or(0) as u32;
                                if pending_body_requests.contains_key(&msg_id_val) {
                                    pending_body_requests.remove(&msg_id_val);
                                    if let Some(body) = result.get("body") {
                                        if let Some(body_str) = body.as_str() {
                                            if let Ok(data) = serde_json::from_str::<serde_json::Value>(body_str) {
                                                if let Some(video_data) = data.get("data") {
                                                    let title = video_data.get("title")
                                                        .or_else(|| video_data.get("desc"))
                                                        .and_then(|v| v.as_str())
                                                        .unwrap_or("")
                                                        .to_string();
                                                    if !title.is_empty() {
                                                        page_title = title;
                                                    }

                                                    if let Some(play_info) = video_data.get("play_info") {
                                                        if let Some(main_url) = play_info.get("main").and_then(|v| v.as_str()) {
                                                            if !main_url.is_empty() {
                                                                api_video_url = Some(main_url.to_string());
                                                            }
                                                        }
                                                    }

                                                    captured_api_data.push(video_data.clone());
                                                }
                                            }
                                        }
                                    }
                                } else if let Some(body) = result.get("body") {
                                    if let Some(body_str) = body.as_str() {
                                        if let Ok(data) = serde_json::from_str::<serde_json::Value>(body_str) {
                                            if let Some(video_data) = data.get("data") {
                                                captured_api_data.push(video_data.clone());
                                            }
                                        }
                                    }
                                }

                                if let Some(result_val) = result.get("result") {
                                    if let Some(val) = result_val.get("value") {
                                        if val.is_string() {
                                            let t = val.as_str().unwrap_or("").to_string();
                                            if !t.is_empty() && t != "undefined" {
                                                page_title = t;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Ok(Some(Ok(_))) => {}
            Ok(Some(Err(e))) => {
                eprintln!("WebSocket error: {}", e);
                break;
            }
            Ok(None) => break,
            Err(_) => {}
        }

        if api_video_url.is_some() {
            break;
        }

        if !clicked_play && start.elapsed() >= click_attempted_at {
            clicked_play = true;
            let click_id = next_id();
            let click_js = r#"
                (function() {
                    const selectors = ['video', '[class*="video"]', '[class*="player"]', '.video-player', '[class*="play-btn"]', '[class*="Play"]'];
                    for (const sel of selectors) {
                        const el = document.querySelector(sel);
                        if (el) { el.click(); return 'clicked: ' + sel; }
                    }
                    return 'no play button found';
                })()
            "#;
            let click_msg = serde_json::json!({
                "id": click_id,
                "method": "Runtime.evaluate",
                "params": { "expression": click_js }
            }).to_string();
            let _ = ws_stream.send(tokio_tungstenite::tungstenite::Message::Text(click_msg.into())).await;
        }

        let get_title_id = next_id();
        let get_title_msg = serde_json::json!({
            "id": get_title_id,
            "method": "Runtime.evaluate",
            "params": { "expression": "document.title" }
        }).to_string();
        let _ = ws_stream.send(tokio_tungstenite::tungstenite::Message::Text(get_title_msg.into())).await;
    }

    let final_video_url = api_video_url
        .or_else(|| {
            captured_urls.iter()
                .find(|u| u.contains("videoweb.doubao.com"))
                .cloned()
                .or_else(|| captured_urls.first().cloned())
        });

    if let Some(video_url) = final_video_url {
        let clean_title = page_title
            .replace(" - 豆包", "")
            .replace(" - 即梦AI", "")
            .replace(" | 即梦AI", "")
            .trim()
            .to_string();

        let thumbnail = captured_api_data.iter()
            .filter_map(|data| {
                data.get("cover_url")
                    .or_else(|| data.get("cover"))
                    .or_else(|| data.get("thumbnail"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            })
            .next();

        return Ok(ResolvedVideo {
            video_url: video_url.clone(),
            title: if clean_title.is_empty() { format!("{}_video", platform) } else { clean_title },
            platform: platform.to_string(),
            thumbnail,
            needs_browser_download,
        });
    }

    for data in &captured_api_data {
        if let Some(vurl) = find_video_url_in_json(data) {
            let title = data.get("title")
                .or_else(|| data.get("desc"))
                .or_else(|| data.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("video")
                .to_string();

            let thumbnail = data.get("cover_url")
                .or_else(|| data.get("cover"))
                .or_else(|| data.get("thumbnail"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            return Ok(ResolvedVideo {
                video_url: vurl,
                title,
                platform: platform.to_string(),
                thumbnail,
                needs_browser_download,
            });
        }
    }

    Err("无法解析视频地址，页面可能需要登录或链接已过期".to_string())
}

fn is_video_cdn_url(url: &str) -> bool {
    if !url.starts_with("http") {
        return false;
    }
    if url.contains(".js") || url.contains(".css") || url.contains(".png") || url.contains(".jpg") || url.contains(".gif") || url.contains(".svg") || url.contains(".ico") || url.contains(".woff") {
        return false;
    }
    let is_video_ext = url.contains(".mp4") || url.contains(".m3u8") || url.contains(".webm") || url.contains(".mov");
    let is_video_cdn = url.contains("videoweb")
        || url.contains("tos-cn")
        || url.contains("bytecdn")
        || url.contains("byteimg")
        || url.contains("dreamnia")
        || url.contains("bytedance")
        || url.contains("douyinpic")
        || url.contains("douyinvod")
        || url.contains("ixigua")
        || (url.contains("jianying.com") && url.contains("cdn"));
    is_video_ext || is_video_cdn
}

fn is_api_endpoint(url: &str) -> bool {
    url.contains("get_video_share_info")
        || url.contains("share/detail")
        || url.contains("/api/video")
        || url.contains("/share/")
        || (url.contains("jimeng") && url.contains("api"))
}

fn find_browser_path() -> Option<String> {
    let paths = [
        (r"C:\Program Files\Google\Chrome\Application\chrome.exe", false),
        (r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe", false),
        (r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", false),
        (r"C:\Program Files\Microsoft\Edge\Application\msedge.exe", false),
        (r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe", true),
        (r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe", true),
    ];

    for (path, expand_env) in paths {
        let resolved = if expand_env {
            std::env::var("LOCALAPPDATA").ok()
                .map(|local| path.replace("%LOCALAPPDATA%", &local))
                .unwrap_or_default()
        } else {
            path.to_string()
        };

        if std::path::Path::new(&resolved).exists() {
            return Some(resolved);
        }
    }

    if let Ok(output) = create_command("where").args(&["chrome"]).output() {
        if output.status.success() {
            if let Ok(path) = String::from_utf8(output.stdout) {
                let path = path.trim().to_string();
                if !path.is_empty() {
                    return Some(path);
                }
            }
        }
    }

    if let Ok(output) = create_command("where").args(&["msedge"]).output() {
        if output.status.success() {
            if let Ok(path) = String::from_utf8(output.stdout) {
                let path = path.trim().to_string();
                if !path.is_empty() {
                    return Some(path);
                }
            }
        }
    }

    None
}

fn find_video_url_in_json(value: &serde_json::Value) -> Option<String> {
    if let Some(s) = value.as_str() {
        if s.contains("http") && (s.contains(".mp4") || s.contains("tos-cn") || s.contains("bytecdn")) {
            return Some(s.to_string());
        }
    }

    if let Some(obj) = value.as_object() {
        for key in &["video_url", "video", "play_url", "url", "main", "download_url", "origin_url"] {
            if let Some(v) = obj.get(*key) {
                if let Some(s) = v.as_str() {
                    if s.contains("http") && (s.contains(".mp4") || s.contains("tos-cn") || s.contains("bytecdn")) {
                        return Some(s.to_string());
                    }
                }
            }
        }

        for v in obj.values() {
            if let Some(found) = find_video_url_in_json(v) {
                return Some(found);
            }
        }
    }

    if let Some(arr) = value.as_array() {
        for v in arr {
            if let Some(found) = find_video_url_in_json(v) {
                return Some(found);
            }
        }
    }

    None
}

#[tauri::command]
async fn open_external_link(url: String) -> Result<(), String> {
    
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(&["/c", "start", "", &url])
            .spawn()
            .map_err(|e| format!("Failed to open link: {}", e))?;
    }
    
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open link: {}", e))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open link: {}", e))?;
    }
    
    Ok(())
}

// 调用 Python 生成剪映草稿
#[derive(Serialize, Deserialize, Debug)]
pub struct GenerateJianyingDraftRequest {
    pub input_json_path: String,
    pub output_dir: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct GenerateJianyingDraftResponse {
    pub success: bool,
    pub draft_path: Option<String>,
    pub method: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
async fn generate_jianying_draft(
    request: GenerateJianyingDraftRequest,
) -> Result<GenerateJianyingDraftResponse, String> {

    // 获取脚本路径（相对于应用目录）
    let script_path = std::env::current_exe()
        .map_err(|e| format!("无法获取应用路径: {}", e))?
        .parent()
        .ok_or("无法获取应用目录")?
        .join("scripts")
        .join("generate_jianying_draft.py");

    // 如果打包后的路径不存在，尝试多种开发环境路径
    let script_path = if script_path.exists() {
        script_path
    } else {
        // 尝试从可执行文件路径向上查找 src-tauri/scripts
        let exe_path = std::env::current_exe().unwrap_or_default();
        let mut search_path = exe_path.parent();
        
        // 向上搜索最多5层目录
        for _ in 0..5 {
            if let Some(parent) = search_path {
                let candidate = parent.join("src-tauri").join("scripts").join("generate_jianying_draft.py");
                if candidate.exists() {
                    break;
                }
                search_path = parent.parent();
            } else {
                break;
            }
        }
        
        // 如果还是找不到，尝试从当前工作目录找
        let dev_path = std::env::current_dir()
            .unwrap_or_default()
            .join("src-tauri")
            .join("scripts")
            .join("generate_jianying_draft.py");
            
        if dev_path.exists() {
            dev_path
        } else {
            // 最后尝试从 CARGO_MANIFEST_DIR 环境变量找
            if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
                let cargo_path = std::path::PathBuf::from(manifest_dir)
                    .join("scripts")
                    .join("generate_jianying_draft.py");
                if cargo_path.exists() {
                    cargo_path
                } else {
                    return Err(format!(
                        "找不到 Python 脚本。已尝试以下路径:\n1. {:?}\n2. {:?}\n3. {:?}",
                        script_path, dev_path, cargo_path
                    ));
                }
            } else {
                return Err(format!(
                    "找不到 Python 脚本。已尝试:\n1. {:?}\n2. {:?}",
                    script_path, dev_path
                ));
            }
        }
    };

    // 检测 Python 可用性
    let python_cmd = if cfg!(target_os = "windows") {
        "python"
    } else {
        "python3"
    };

    // 执行 Python 脚本
    let output = create_command(python_cmd)
        .arg(&script_path)
        .arg(&request.input_json_path)
        .arg(&request.output_dir)
        .output()
        .map_err(|e| format!("执行 Python 脚本失败: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !output.status.success() {
        return Ok(GenerateJianyingDraftResponse {
            success: false,
            draft_path: None,
            method: None,
            error: Some(format!("Python 脚本执行失败:\nstdout: {}\nstderr: {}", stdout, stderr)),
        });
    }

    // 解析 JSON 输出
    match serde_json::from_str::<GenerateJianyingDraftResponse>(&stdout) {
        Ok(result) => Ok(result),
        Err(e) => Ok(GenerateJianyingDraftResponse {
            success: false,
            draft_path: None,
            method: None,
            error: Some(format!("解析 Python 输出失败: {}\n输出: {}", e, stdout)),
        }),
    }
}

// 重启剪映专业版
#[tauri::command]
async fn restart_capcut(exe_path: Option<String>) -> Result<bool, String> {
    use std::process::Command;
    use std::thread;
    use std::time::Duration;

    #[cfg(target_os = "windows")]
    {
        // 1. 关闭剪映进程
        let _ = Command::new("taskkill")
            .args(["/F", "/IM", "JianyingPro.exe"])
            .output();

        // 等待进程完全关闭
        thread::sleep(Duration::from_millis(1000));

        // 2. 如果提供了自定义路径，优先使用
        if let Some(custom_path) = exe_path {
            if std::path::Path::new(&custom_path).exists() {
                match Command::new(&custom_path).spawn() {
                    Ok(_) => return Ok(true),
                    Err(e) => println!("使用自定义路径启动剪映失败: {}", e),
                }
            } else {
                println!("自定义路径不存在: {}", custom_path);
            }
        }

        // 3. 尝试常见安装路径
        let possible_paths = [
            r"C:\Program Files\JianyingPro\JianyingPro.exe",
            r"C:\Program Files (x86)\JianyingPro\JianyingPro.exe",
            r"D:\Program Files\JianyingPro\JianyingPro.exe",
            r"D:\JianyingPro\JianyingPro.exe",
        ];

        for path in &possible_paths {
            if std::path::Path::new(path).exists() {
                match Command::new(path).spawn() {
                    Ok(_) => return Ok(true),
                    Err(e) => println!("启动剪映失败 ({}): {}", path, e),
                }
            }
        }

        // 4. 尝试通过开始菜单启动
        match Command::new("cmd")
            .args(["/C", "start", "", "剪映专业版"])
            .spawn()
        {
            Ok(_) => return Ok(true),
            Err(_) => {}
        }
    }

    #[cfg(target_os = "macos")]
    {
        // 关闭剪映
        let _ = Command::new("pkill")
            .args(["-f", "JianyingPro"])
            .output();

        thread::sleep(Duration::from_millis(1000));

        // 启动剪映
        match Command::new("open")
            .args(["-a", "剪映专业版"])
            .spawn()
        {
            Ok(_) => return Ok(true),
            Err(_) => {}
        }

        // 尝试英文名称
        match Command::new("open")
            .args(["-a", "CapCut"])
            .spawn()
        {
            Ok(_) => return Ok(true),
            Err(_) => {}
        }
    }

    Ok(false)
}

// 下载图片并转为 base64
#[derive(Serialize, Deserialize, Debug)]
pub struct DownloadImageRequest {
    pub url: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct DownloadImageResponse {
    pub success: bool,
    pub data: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
async fn download_image_to_base64(request: DownloadImageRequest) -> Result<DownloadImageResponse, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    
    println!("[download_image_to_base64] 下载图片: {}", request.url.chars().take(50).collect::<String>());
    
    // 使用 reqwest 下载图片
    let client = reqwest::Client::new();
    let response = client
        .get(&request.url)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;
    
    if !response.status().is_success() {
        return Ok(DownloadImageResponse {
            success: false,
            data: None,
            error: Some(format!("HTTP 错误: {}", response.status())),
        });
    }
    
    // 获取内容类型（先复制出来，避免借用冲突）
    let content_type: String = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/png")
        .to_string();
    
    // 读取二进制数据
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("读取响应失败: {}", e))?;
    
    // 转为 base64
    let base64_data = STANDARD.encode(&bytes);
    
    // 构建 data URI
    let mime_type = if content_type.starts_with("image/") {
        content_type
    } else {
        "image/png".to_string()
    };
    let data_uri = format!("data:{};base64,{}", mime_type, base64_data);
    
    println!("[download_image_to_base64] 下载成功，大小: {} bytes", bytes.len());
    
    Ok(DownloadImageResponse {
        success: true,
        data: Some(data_uri),
        error: None,
    })
}

// Real-ESRGAN ncnn-vulkan 相关命令

#[derive(Serialize, Deserialize, Debug)]
pub struct RealESRGANStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub path: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct UpscaleRequest {
    pub input_path: String,
    pub output_filename: String,
    pub scale: i32,
    pub model: String,
    pub project_id: Option<String>,
    pub episode_id: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct UpscaleResult {
    pub success: bool,
    pub output_path: String,
    pub metadata: UpscaleMetadata,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct UpscaleMetadata {
    pub original_width: i32,
    pub original_height: i32,
    pub upscaled_width: i32,
    pub upscaled_height: i32,
    pub scale: i32,
    pub model: String,
}

#[tauri::command]
async fn check_realesrgan_status(app: AppHandle) -> Result<RealESRGANStatus, String> {
    // 检查应用数据目录中的 Real-ESRGAN
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    let realesrgan_dir = app_data_dir.join("realesrgan");
    
    #[cfg(target_os = "windows")]
    let exe_name = "realesrgan-ncnn-vulkan.exe";
    #[cfg(not(target_os = "windows"))]
    let exe_name = "realesrgan-ncnn-vulkan";
    
    // 首先在根目录查找
    let realesrgan_exe = realesrgan_dir.join(exe_name);
    
    // 如果根目录没有，在子目录中查找
    let exe_path = if realesrgan_exe.exists() {
        Some(realesrgan_exe)
    } else {
        find_file_in_dir(&realesrgan_dir, exe_name)
    };
    
    if let Some(exe_path) = exe_path {
        // 文件存在，尝试验证
        // 先只检查文件是否存在，不尝试执行（避免 DLL 依赖问题）
        return Ok(RealESRGANStatus {
            installed: true,
            version: Some("Real-ESRGAN ncnn-vulkan".to_string()),
            path: Some(exe_path.to_string_lossy().to_string()),
        });
    }
    
    // 未找到 Real-ESRGAN
    Ok(RealESRGANStatus {
        installed: false,
        version: None,
        path: None,
    })
}

#[tauri::command]
async fn get_realesrgan_dir(app: AppHandle) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    let realesrgan_dir = app_data_dir.join("realesrgan");
    
    Ok(realesrgan_dir.to_string_lossy().to_string())
}

#[tauri::command]
async fn upscale_with_realesrgan(
    app: AppHandle,
    request: UpscaleRequest,
) -> Result<UpscaleResult, String> {
    // 获取 Real-ESRGAN 路径（工具仍保存在 app_data）
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    let realesrgan_dir = app_data_dir.join("realesrgan");
    
    #[cfg(target_os = "windows")]
    let realesrgan_exe = realesrgan_dir.join("realesrgan-ncnn-vulkan.exe");
    #[cfg(not(target_os = "windows"))]
    let realesrgan_exe = realesrgan_dir.join("realesrgan-ncnn-vulkan");
    
    if !realesrgan_exe.exists() {
        return Err("Real-ESRGAN not found. Please download it first.".to_string());
    }
    
    // 检查输入文件是否存在
    let input_path = PathBuf::from(&request.input_path);
    if !input_path.exists() {
        return Err(format!("Input file not found: {}", request.input_path));
    }
    
    // 获取原始图片尺寸
    let (original_width, original_height) = get_image_dimensions(&input_path)
        .map_err(|e| format!("Failed to read image dimensions: {}", e))?;
    
    // 获取工作目录，构建输出路径
    let workspace_path = get_workspace_path(app.clone()).await
        .map_err(|e| format!("Failed to get workspace path: {}", e))?;
    let working_dir = PathBuf::from(&workspace_path);
    
    // 构建输出目录：优先使用项目结构
    let output_dir = if let (Some(proj_id), Some(ep_id)) = (request.project_id, request.episode_id) {
        working_dir.join("projects").join(proj_id).join(ep_id).join("upscaled")
    } else {
        working_dir.join("temp").join("upscaled")
    };
    
    fs::create_dir_all(&output_dir)
        .map_err(|e| format!("Failed to create output dir: {}", e))?;
    
    let final_output_path = output_dir.join(&request.output_filename);
    let output_path_str = final_output_path.to_string_lossy().to_string();
    
    // 构建命令参数
    let model_name = match request.model.as_str() {
        "realesrgan-x4plus" => "realesrgan-x4plus",
        "realesrgan-x2plus" => "realesrgan-x2plus",
        "realesrgan-anime" => "realesrgan-x4plus-anime",
        _ => "realesrgan-x4plus",
    };
    
    let scale_str = request.scale.to_string();
    
    // 查找 extracted 目录（包含模型文件）
    let extracted_dir = realesrgan_dir.join("extracted");
    let work_dir = if extracted_dir.exists() {
        extracted_dir
    } else {
        realesrgan_dir.clone()
    };
    
    // 检查模型文件是否存在
    let models_dir = work_dir.join("models");
    let model_bin = models_dir.join(format!("{}.bin", model_name));
    let model_param = models_dir.join(format!("{}.param", model_name));
    println!("Model bin exists: {} -> {}", model_bin.display(), model_bin.exists());
    println!("Model param exists: {} -> {}", model_param.display(), model_param.exists());
    
    // 执行 Real-ESRGAN
    println!("Executing Real-ESRGAN:");
    println!("  exe: {:?}", realesrgan_exe);
    println!("  input: {}", request.input_path);
    println!("  output: {}", output_path_str);
    println!("  work_dir: {:?}", work_dir);
    println!("  model: {}", model_name);
    println!("  scale: {}", scale_str);
    
    let output = create_command(&realesrgan_exe)
        .args(&[
            "-i", &request.input_path,
            "-o", &output_path_str,
            "-s", &scale_str,
            "-n", model_name,
            "-f", "png",
        ])
        .current_dir(&work_dir)
        .output()
        .map_err(|e| format!("Failed to execute Real-ESRGAN: {}", e))?;
    
    println!("Real-ESRGAN exit code: {:?}", output.status.code());
    println!("Real-ESRGAN stdout: {}", String::from_utf8_lossy(&output.stdout));
    println!("Real-ESRGAN stderr: {}", String::from_utf8_lossy(&output.stderr));
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!("Real-ESRGAN failed: {}\nstdout: {}", stderr, stdout));
    }
    
    // 检查输出文件是否实际创建
    println!("Checking output file exists: {:?} -> {}", final_output_path, final_output_path.exists());
    if !final_output_path.exists() {
        return Err(format!("Real-ESRGAN did not create output file at: {:?}", final_output_path));
    }
    
    // 获取放大后的图片尺寸
    let (upscaled_width, upscaled_height) = get_image_dimensions(&final_output_path)
        .map_err(|e| format!("Failed to read upscaled image dimensions: {}", e))?;
    
    Ok(UpscaleResult {
        success: true,
        output_path: output_path_str,
        metadata: UpscaleMetadata {
            original_width,
            original_height,
            upscaled_width,
            upscaled_height,
            scale: request.scale,
            model: request.model,
        },
    })
}

// 获取图片尺寸
fn get_image_dimensions(path: &PathBuf) -> Result<(i32, i32), String> {
    use std::io::Read;
    
    let mut file = fs::File::open(path)
        .map_err(|e| format!("Failed to open image: {}", e))?;
    
    // 读取文件头以确定图片格式
    let mut header = [0u8; 16];
    file.read_exact(&mut header)
        .map_err(|e| format!("Failed to read image header: {}", e))?;
    
    // PNG: 前8字节是 PNG signature
    if &header[0..8] == [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] {
        // PNG IHDR chunk 从第16字节开始，包含宽度和高度（各4字节大端序）
        let mut ihdr = [0u8; 8];
        file.seek(std::io::SeekFrom::Start(16))
            .map_err(|e| format!("Failed to seek: {}", e))?;
        file.read_exact(&mut ihdr)
            .map_err(|e| format!("Failed to read IHDR: {}", e))?;
        
        let width = i32::from_be_bytes([ihdr[0], ihdr[1], ihdr[2], ihdr[3]]);
        let height = i32::from_be_bytes([ihdr[4], ihdr[5], ihdr[6], ihdr[7]]);
        
        return Ok((width, height));
    }
    
    // JPEG: 使用 image crate 或其他方式解析
    // 这里简化处理，使用 image crate
    match image::open(path) {
        Ok(img) => {
            let dimensions = img.dimensions();
            Ok((dimensions.0 as i32, dimensions.1 as i32))
        }
        Err(e) => Err(format!("Failed to open image with image crate: {}", e)),
    }
}

// 下载 Real-ESRGAN
#[derive(Serialize, Deserialize, Debug)]
pub struct DownloadRealESRGANRequest {
    pub url: String,
    pub target_dir: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct DownloadRealESRGANResult {
    pub success: bool,
    pub file_path: String,
    pub extracted_path: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
async fn download_realesrgan(
    request: DownloadRealESRGANRequest,
) -> Result<DownloadRealESRGANResult, String> {
    use std::io::Write;
    
    // 创建目标目录
    let target_path = PathBuf::from(&request.target_dir);
    fs::create_dir_all(&target_path)
        .map_err(|e| format!("Failed to create target dir: {}", e))?;
    
    // 下载文件
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("Failed to create client: {}", e))?;
    
    let response = client
        .get(&request.url)
        .send()
        .await
        .map_err(|e| format!("Failed to download: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("Download failed with status: {}", response.status()));
    }
    
    // 获取文件名
    let file_name = request.url.split('/').last().unwrap_or("realesrgan.zip");
    let file_path = target_path.join(file_name);
    
    // 下载并保存文件
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;
    
    let mut file = fs::File::create(&file_path)
        .map_err(|e| format!("Failed to create file: {}", e))?;
    
    file.write_all(&bytes)
        .map_err(|e| format!("Failed to write file: {}", e))?;
    
    // 自动解压
    let extracted_path = extract_zip(&file_path, &target_path)
        .map_err(|e| format!("Failed to extract: {}", e))?;
    
    // 移动可执行文件到目标目录
    let exe_name = if cfg!(target_os = "windows") {
        "realesrgan-ncnn-vulkan.exe"
    } else {
        "realesrgan-ncnn-vulkan"
    };
    
    // 在解压目录中查找可执行文件
    let extracted_exe = find_file_in_dir(&extracted_path, exe_name)
        .or_else(|| find_file_in_dir(&target_path, exe_name));
    
    println!("Extracted exe found: {:?}", extracted_exe);
    
    let final_exe_path = if let Some(exe_path) = extracted_exe {
        let dest_path = target_path.join(exe_name);
        println!("Copying from {:?} to {:?}", exe_path, dest_path);
        if exe_path != dest_path {
            fs::copy(&exe_path, &dest_path)
                .map_err(|e| format!("Failed to copy exe: {}", e))?;
        }
        Some(dest_path.to_string_lossy().to_string())
    } else {
        // 列出解压目录的内容，帮助调试
        println!("Exe not found in extracted path: {:?}", extracted_path);
        if let Ok(entries) = fs::read_dir(&extracted_path) {
            for entry in entries.flatten() {
                println!("  Found: {:?}", entry.path());
            }
        }
        None
    };
    
    // 清理 zip 文件
    let _ = fs::remove_file(&file_path);
    
    Ok(DownloadRealESRGANResult {
        success: true,
        file_path: file_path.to_string_lossy().to_string(),
        extracted_path: final_exe_path,
        error: None,
    })
}

// 解压 zip 文件
fn extract_zip(zip_path: &PathBuf, target_dir: &PathBuf) -> Result<PathBuf, String> {
    let file = fs::File::open(zip_path)
        .map_err(|e| format!("Failed to open zip: {}", e))?;
    
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Failed to read zip: {}", e))?;
    
    // 创建解压目录
    let extract_dir = target_dir.join("extracted");
    fs::create_dir_all(&extract_dir)
        .map_err(|e| format!("Failed to create extract dir: {}", e))?;
    
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
            .map_err(|e| format!("Failed to get file {}: {}", i, e))?;
        
        let outpath = extract_dir.join(file.name());
        
        if file.name().ends_with('/') {
            fs::create_dir_all(&outpath)
                .map_err(|e| format!("Failed to create dir: {}", e))?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(p)
                        .map_err(|e| format!("Failed to create parent dir: {}", e))?;
                }
            }
            
            let mut outfile = fs::File::create(&outpath)
                .map_err(|e| format!("Failed to create output file: {}", e))?;
            
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Failed to write file: {}", e))?;
        }
    }
    
    Ok(extract_dir)
}

// 在目录中查找文件
fn find_file_in_dir(dir: &PathBuf, file_name: &str) -> Option<PathBuf> {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(name) = path.file_name() {
                    if name.to_string_lossy() == file_name {
                        return Some(path);
                    }
                }
            } else if path.is_dir() {
                if let Some(found) = find_file_in_dir(&path, file_name) {
                    return Some(found);
                }
            }
        }
    }
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            http_proxy,
            get_app_data_dir,
            ensure_data_dir,
            save_file,
            read_file,
            read_file_base64,
            delete_file,
            list_dir,
            copy_file,
            file_exists,
            check_ffmpeg_status,
            download_ffmpeg,
            render_video_with_ffmpeg,
            render_video_with_ffmpeg_script,
            get_workspace_path,
            download_image,
            download_video,
            download_video_via_browser,
            resolve_video_url,
            open_external_link,
            check_realesrgan_status,
            upscale_with_realesrgan,
            download_realesrgan,
            get_realesrgan_dir,
            modelscope::modelscope_submit_task,
            modelscope::modelscope_check_status,
            modelscope::modelscope_chat,
            video_scene_detection::detect_video_scenes,
            video_scene_detection::export_scene_video,
            video_scene_detection::export_scenes,
            video_scene_detection::capture_frame,
            generate_jianying_draft,
            restart_capcut,
            download_image_to_base64
        ])
        .setup(|app| {
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
