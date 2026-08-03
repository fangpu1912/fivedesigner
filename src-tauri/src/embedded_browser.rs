use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{command, AppHandle, Emitter, Manager, WebviewBuilder, WebviewUrl};
use lazy_static::lazy_static;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddedWebviewInfo {
    pub account_id: String,
    pub label: String,
    pub url: String,
    pub is_active: bool,
}

lazy_static! {
    static ref EMBEDDED_WEBVIEWS: Mutex<HashMap<String, EmbeddedWebviewInfo>> = Mutex::new(HashMap::new());
    static ref SCAN_RESULT: Mutex<String> = Mutex::new(String::new());
}

fn make_label(account_id: &str) -> String {
    format!("bw_{}", account_id)
}

fn load_dewatermark_scripts(account_id: &str) -> Vec<String> {
    let content_js = include_str!("../scripts/dewatermark_content.js");
    let page_js = include_str!("../scripts/dewatermark_page.js");
    let account_init = format!(
        "window.__EMBEDDED_ACCOUNT_ID__ = '{}'; window.__TAURI_EMBEDDED__ = true;",
        account_id
    );
    vec![account_init, content_js.to_string(), page_js.to_string()]
}

/// 将 cookie 字符串解析为 (name, value, domain) 列表
fn parse_cookie_pairs(cookies: &str, fallback_domain: &str) -> Vec<(String, String, String)> {
    cookies
        .split(';')
        .filter_map(|pair| {
            let trimmed = pair.trim();
            if trimmed.is_empty() {
                return None;
            }
            let mut parts = trimmed.splitn(2, '=');
            let name = parts.next()?.trim().to_string();
            let value = parts.next()?.trim().to_string();
            Some((name, value, fallback_domain.to_string()))
        })
        .collect()
}

/// 构建 document.cookie 注入脚本（页面加载前执行，非 httpOnly Cookie）
fn build_cookie_injection_script(cookies: &str) -> String {
    let js_parts: Vec<String> = cookies
        .split(';')
        .filter_map(|pair| {
            let trimmed = pair.trim();
            if trimmed.is_empty() {
                return None;
            }
            // 转义单引号和换行
            let escaped = trimmed.replace('\\', "\\\\").replace('\'', "\\'").replace('\n', "");
            Some(format!("document.cookie = '{}';", escaped))
        })
        .collect();

    if js_parts.is_empty() {
        return String::new();
    }

    format!(
        "(function() {{ try {{ {} }} catch(e) {{ console.warn('[cookie-inject] non-httpOnly cookie injection:', e); }} }})();",
        js_parts.join("\n")
    )
}

/// 创建内嵌 Webview（在主窗口内，标签页式）
#[command]
pub async fn create_embedded_webview(
    app: AppHandle,
    account_id: String,
    url: String,
    user_agent: Option<String>,
    proxy: Option<String>,
    cookies: Option<String>,
) -> Result<String, String> {
    let label = make_label(&account_id);

    // 检查是否已存在
    if app.get_webview(&label).is_some() {
        if let Ok(mut views) = EMBEDDED_WEBVIEWS.lock() {
            if let Some(info) = views.get_mut(&account_id) {
                info.is_active = true;
            }
        }
        return Ok(label);
    }

    // 获取主窗口
    let main_window = app.get_window("main")
        .ok_or_else(|| "主窗口不存在".to_string())?;

    // 数据目录（隔离 session/cookie/storage）
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
    let data_dir = app_data_dir.join("browser_sessions").join(&account_id);
    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("创建浏览器数据目录失败: {}", e))?;

    let parsed_url = url.parse::<url::Url>()
        .map_err(|e| format!("URL 解析失败: {}", e))?;

    let mut builder = WebviewBuilder::new(&label, WebviewUrl::External(parsed_url.clone()))
        .data_directory(data_dir)
        .devtools(true);

    // 注入去水印脚本
    let scripts = load_dewatermark_scripts(&account_id);
    for script in scripts {
        builder = builder.initialization_script(&script);
    }

    // 将 Cookie 作为初始化脚本注入（在页面加载前执行，非 httpOnly Cookie 可生效）
    if let Some(cookies_str) = &cookies {
        if !cookies_str.trim().is_empty() {
            let cookie_script = build_cookie_injection_script(cookies_str);
            if !cookie_script.is_empty() {
                builder = builder.initialization_script(&cookie_script);
            }
        }
    }

    if let Some(ua) = &user_agent {
        builder = builder.user_agent(ua);
    }

    if let Some(proxy_str) = &proxy {
        if let Ok(proxy_url) = proxy_str.parse::<url::Url>() {
            builder = builder.proxy_url(proxy_url);
        }
    }

    // 在主窗口内创建 webview（作为子 webview，标签页式）
    let _webview = main_window.add_child(
        builder,
        tauri::Position::Logical(tauri::LogicalPosition::new(-9999.0, -9999.0)),
        tauri::Size::Logical(tauri::LogicalSize::new(1.0, 1.0)),
    ).map_err(|e| format!("创建 Webview 失败: {}", e))?;

    // 通过 CDP 注入 httpOnly Cookie（延迟 1 秒，等 WebView2 初始化完成）
    if let Some(cookies_str) = &cookies {
        if !cookies_str.trim().is_empty() {
            let cookies_clone = cookies_str.clone();
            let label_clone = label.clone();
            let url_host = parsed_url.host_str().unwrap_or("").to_string();
            let app_clone = app.clone();
            tokio::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                if let Some(wv) = app_clone.get_webview(&label_clone) {
                    let _ = inject_cookies_via_cdp(&wv, &cookies_clone, &url_host).await;
                }
            });
        }
    }

    // 保存信息
    let info = EmbeddedWebviewInfo {
        account_id: account_id.clone(),
        label: label.clone(),
        url,
        is_active: true,
    };
    if let Ok(mut views) = EMBEDDED_WEBVIEWS.lock() {
        views.insert(account_id, info);
    }

    Ok(label)
}

/// 通过 WebView2 CDP 协议设置 Cookie（支持 httpOnly）
#[cfg(target_os = "windows")]
async fn inject_cookies_via_cdp(
    webview: &tauri::Webview,
    cookies: &str,
    domain: &str,
) -> Result<(), String> {
    let cookie_pairs = parse_cookie_pairs(cookies, domain);
    if cookie_pairs.is_empty() {
        return Ok(());
    }

    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();

    webview.with_webview(move |wv| {
        let controller = wv.controller();
        let core_webview = unsafe {
            match controller.CoreWebView2() {
                Ok(cv) => cv,
                Err(e) => {
                    let _ = tx.send(Err(format!("获取 CoreWebView2 失败: {:?}", e)));
                    return;
                }
            }
        };

        let method_hstr = windows_core::HSTRING::from("Network.setCookie");

        for (name, value, cookie_domain) in &cookie_pairs {
            let params = format!(
                r#"{{"name":"{}","value":"{}","domain":"{}","path":"/","httpOnly":true,"secure":true,"sameSite":"Lax"}}"#,
                name.replace('\\', "\\\\").replace('"', "\\\""),
                value.replace('\\', "\\\\").replace('"', "\\\""),
                cookie_domain.replace('\\', "\\\\").replace('"', "\\\""),
            );
            let params_hstr = windows_core::HSTRING::from(&params);
            unsafe {
                let _ = core_webview.CallDevToolsProtocolMethod(
                    &method_hstr,
                    &params_hstr,
                    None,
                );
            }
        }

        let _ = tx.send(Ok(()));
    }).map_err(|e| format!("with_webview 调用失败: {}", e))?;

    rx.await.map_err(|e| format!("CDP cookie 注入回调失败: {}", e))?
}

#[cfg(not(target_os = "windows"))]
async fn inject_cookies_via_cdp(
    _webview: &tauri::Webview,
    _cookies: &str,
    _domain: &str,
) -> Result<(), String> {
    // 非 Windows 平台暂不支持 CDP cookie 注入
    Ok(())
}

/// 定位 Webview（相对于主窗口内容区）
#[command]
pub async fn position_webview(
    app: AppHandle,
    account_id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    // 如果 Webview 已被隐藏（is_active = false），跳过定位
    if let Ok(views) = EMBEDDED_WEBVIEWS.lock() {
        if let Some(info) = views.get(&account_id) {
            if !info.is_active {
                return Ok(());
            }
        }
    }

    let label = make_label(&account_id);
    let webview = app.get_webview(&label)
        .ok_or_else(|| format!("Webview {} 不存在 (label={})", account_id, label))?;

    webview.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)))
        .map_err(|e| format!("设置位置失败: {}", e))?;

    webview.set_size(tauri::Size::Logical(tauri::LogicalSize::new(width, height)))
        .map_err(|e| format!("设置大小失败: {}", e))?;

    Ok(())
}

/// 显示 Webview
#[command]
pub async fn show_webview(
    app: AppHandle,
    account_id: String,
) -> Result<(), String> {
    let label = make_label(&account_id);
    let _webview = app.get_webview(&label)
        .ok_or_else(|| format!("Webview {} 不存在", account_id))?;

    if let Ok(mut views) = EMBEDDED_WEBVIEWS.lock() {
        if let Some(info) = views.get_mut(&account_id) {
            info.is_active = true;
        }
    }

    Ok(())
}

/// 隐藏 Webview
#[command]
pub async fn hide_webview(
    app: AppHandle,
    account_id: String,
) -> Result<(), String> {
    let label = make_label(&account_id);
    let webview = app.get_webview(&label)
        .ok_or_else(|| format!("Webview {} 不存在", account_id))?;

    // 移到不可见区域并缩小
    webview.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(-9999.0, -9999.0)))
        .map_err(|e| format!("隐藏失败: {}", e))?;
    webview.set_size(tauri::Size::Logical(tauri::LogicalSize::new(1.0, 1.0)))
        .map_err(|e| format!("隐藏失败: {}", e))?;

    if let Ok(mut views) = EMBEDDED_WEBVIEWS.lock() {
        if let Some(info) = views.get_mut(&account_id) {
            info.is_active = false;
        }
    }

    Ok(())
}

/// 导航到指定 URL
#[command]
pub async fn navigate_webview(
    app: AppHandle,
    account_id: String,
    url: String,
) -> Result<(), String> {
    let label = make_label(&account_id);
    let webview = app.get_webview(&label)
        .ok_or_else(|| format!("Webview {} 不存在", account_id))?;

    let parsed_url = url.parse::<url::Url>()
        .map_err(|e| format!("URL 解析失败: {}", e))?;

    webview.navigate(parsed_url)
        .map_err(|e| format!("导航失败: {}", e))?;

    if let Ok(mut views) = EMBEDDED_WEBVIEWS.lock() {
        if let Some(info) = views.get_mut(&account_id) {
            info.url = url;
        }
    }

    Ok(())
}

/// 关闭内嵌 Webview
#[command]
pub async fn close_embedded_webview(
    app: AppHandle,
    account_id: String,
) -> Result<(), String> {
    let label = make_label(&account_id);

    if let Some(webview) = app.get_webview(&label) {
        let _ = webview.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(-9999.0, -9999.0)));
        webview.close().map_err(|e| format!("关闭失败: {}", e))?;
    }

    if let Ok(mut views) = EMBEDDED_WEBVIEWS.lock() {
        views.remove(&account_id);
    }

    Ok(())
}

/// 在 Webview 中执行 JS
#[command]
pub async fn eval_webview_js(
    app: AppHandle,
    account_id: String,
    js_code: String,
) -> Result<(), String> {
    let label = make_label(&account_id);
    let webview = app.get_webview(&label)
        .ok_or_else(|| format!("Webview {} 不存在", account_id))?;

    webview.eval(&js_code)
        .map_err(|e| format!("执行 JS 失败: {}", e))?;

    Ok(())
}

/// 重新注入去水印脚本
#[command]
pub async fn inject_dewatermark_script(
    app: AppHandle,
    account_id: String,
) -> Result<(), String> {
    let label = make_label(&account_id);
    let webview = app.get_webview(&label)
        .ok_or_else(|| format!("Webview {} 不存在", account_id))?;

    let scripts = load_dewatermark_scripts(&account_id);
    for script in scripts {
        webview.eval(&script)
            .map_err(|e| format!("注入脚本失败: {}", e))?;
    }

    Ok(())
}

/// 接收子 Webview 上报的媒体数据（由去水印脚本调用）
#[command]
pub async fn report_extracted_media(
    app: AppHandle,
    account_id: String,
    media_type: String,
    data: serde_json::Value,
) -> Result<(), String> {
    app.emit("media-extracted", serde_json::json!({
        "accountId": account_id,
        "mediaType": media_type,
        "data": data,
    })).map_err(|e| format!("发送事件失败: {}", e))?;

    Ok(())
}

/// 从子 Webview 轮询提取的媒体数据（通过 eval + 事件回传）
#[command]
pub async fn poll_extracted_media(
    app: AppHandle,
    account_id: String,
) -> Result<(), String> {
    let label = make_label(&account_id);
    let webview = app.get_webview(&label)
        .ok_or_else(|| format!("Webview {} 不存在", account_id))?;

    // 在子 webview 中执行脚本：读取 __EXTRACTED_MEDIA__ 缓冲区，
    // 尝试通过 __TAURI_INTERNALS__.invoke 上报，否则保留在缓冲区
    let js_code = r#"
        (function() {
            try {
                var items = window.__EXTRACTED_MEDIA__ || [];
                if (items.length === 0) return;
                window.__EXTRACTED_MEDIA__ = [];
                var accountId = window.__EMBEDDED_ACCOUNT_ID__ || '';
                // 尝试通过 Tauri IPC 上报
                if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
                    for (var i = 0; i < items.length; i++) {
                        var item = items[i];
                        window.__TAURI_INTERNALS__.invoke('report_extracted_media', {
                            accountId: accountId || item.accountId,
                            mediaType: item.mediaType,
                            data: item.data
                        });
                    }
                } else {
                    // IPC 不可用，放回缓冲区
                    window.__EXTRACTED_MEDIA__ = items;
                }
            } catch(e) {
                console.error('[dewatermark] poll error:', e);
            }
        })();
    "#;

    webview.eval(js_code)
        .map_err(|e| format!("eval 失败: {}", e))?;

    Ok(())
}

/// 获取所有活跃的 Webview 列表
#[command]
pub async fn list_active_webviews() -> Result<Vec<EmbeddedWebviewInfo>, String> {
    if let Ok(views) = EMBEDDED_WEBVIEWS.lock() {
        Ok(views.values().cloned().collect())
    } else {
        Ok(vec![])
    }
}

/// 获取子 Webview 的当前 URL（通过 eval 读取 __EMBEDDED_CURRENT_URL__）
#[command]
pub async fn get_webview_url(
    app: AppHandle,
    account_id: String,
) -> Result<String, String> {
    let label = make_label(&account_id);
    let webview = app.get_webview(&label)
        .ok_or_else(|| format!("Webview {} 不存在", account_id))?;

    // 使用一个简单的同步技巧：先 eval 设置临时变量，再 eval 读取
    let set_js = r#"window.__TMP_URL__ = window.__EMBEDDED_CURRENT_URL__ || location.href;"#;
    let _ = webview.eval(set_js);

    // 由于 eval 不能返回值，通过 IPC 调用命令回传
    let report_js = r#"
        (function() {
            var url = window.__EMBEDDED_CURRENT_URL__ || location.href || '';
            if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke && url) {
                window.__TAURI_INTERNALS__.invoke('report_url', { url: url });
            }
        })();
    "#;
    webview.eval(report_js)
        .map_err(|e| format!("eval 失败: {}", e))?;

    // 返回空字符串，实际 URL 通过 report_url 命令回传
    Ok(String::new())
}

/// 接收子 Webview 上报的 URL
#[command]
pub async fn report_url(
    app: AppHandle,
    url: String,
) -> Result<(), String> {
    app.emit("webview-url-changed", serde_json::json!({
        "url": url,
    })).map_err(|e| format!("发送 URL 事件失败: {}", e))?;
    Ok(())
}

/// 接收扫描结果回传（eval 不能返回值，通过 IPC 绕回）
#[command]
pub async fn report_scan_result(
    url: String,
) -> Result<String, String> {
    Ok(url)
}

/// 从 eval 上下文设置扫描结果（写到全局缓存）
#[command]
pub async fn set_scan_url(
    url: String,
) -> Result<(), String> {
    if let Ok(mut cache) = SCAN_RESULT.lock() {
        *cache = url;
    }
    Ok(())
}

/// 读取并清空扫描结果缓存
#[command]
pub async fn take_scan_url() -> Result<String, String> {
    if let Ok(mut cache) = SCAN_RESULT.lock() {
        let url = cache.clone();
        cache.clear();
        return Ok(url);
    }
    Ok(String::new())
}

/// 读取子 Webview 中的 __SCAN_RESULT__ 全局变量
#[command]
pub async fn get_scan_result(
    app: AppHandle,
    account_id: String,
) -> Result<String, String> {
    let label = make_label(&account_id);
    let webview = app.get_webview(&label)
        .ok_or_else(|| format!("Webview {} 不存在", account_id))?;

    let js = r#"
        (function() {
            var r = window.__SCAN_RESULT__ || '';
            window.__SCAN_RESULT__ = '';
            if (r && window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
                window.__TAURI_INTERNALS__.invoke('report_scan_result', { url: r });
            }
        })();
    "#;
    webview.eval(js)
        .map_err(|e| format!("eval 失败: {}", e))?;

    // 睡一小会等 IPC 回传
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    Ok(String::new())
}

/// 注入 Cookie 到 Webview（通过 document.cookie + CDP 双管齐下）
#[command]
pub async fn inject_cookies_to_webview(
    app: AppHandle,
    account_id: String,
    cookies: String,
) -> Result<(), String> {
    if cookies.trim().is_empty() {
        return Ok(());
    }

    let label = make_label(&account_id);
    let webview = app.get_webview(&label)
        .ok_or_else(|| format!("Webview {} 不存在", account_id))?;

    // 1. 通过 document.cookie 设置非 httpOnly Cookie
    let cookie_script = build_cookie_injection_script(&cookies);
    if !cookie_script.is_empty() {
        webview.eval(&cookie_script)
            .map_err(|e| format!("Cookie JS 注入失败: {}", e))?;
    }

    // 2. 通过 CDP 设置 httpOnly Cookie
    let url = {
        let views = EMBEDDED_WEBVIEWS.lock().unwrap_or_else(|e| e.into_inner());
        views.get(&account_id).map(|v| v.url.clone()).unwrap_or_default()
    };
    let domain = url.parse::<url::Url>()
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_string()))
        .unwrap_or_default();

    inject_cookies_via_cdp(&webview, &cookies, &domain).await?;

    Ok(())
}

/// 接收豆包自动化脚本回传的状态
/// 由 WebView 内 JS 通过 __TAURI_INTERNALS__.invoke('report_doubao_auto_status', {...}) 调用
/// 前端通过 listen('doubao-auto-status') 接收 { accountId, status }
#[command]
pub async fn report_doubao_auto_status(
    app: AppHandle,
    account_id: String,
    status: serde_json::Value,
) -> Result<(), String> {
    app.emit("doubao-auto-status", serde_json::json!({
        "accountId": account_id,
        "status": status,
    }))
    .map_err(|e| format!("发送事件失败: {}", e))?;
    Ok(())
}
