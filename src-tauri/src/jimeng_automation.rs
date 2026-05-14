/**
 * 即梦浏览器自动化模块
 * 使用 Playwright 控制系统浏览器实现自动化
 */

use std::path::PathBuf;
use std::process::{Command, Stdio};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct JimengGenerateRequest {
    pub prompt: String,
    pub negative_prompt: Option<String>,
    pub reference_images: Vec<String>,
    pub output_dir: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JimengGenerateResult {
    pub success: bool,
    pub image_path: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JimengEnvironment {
    pub node_installed: bool,
    pub playwright_installed: bool,
}

fn get_temp_dir() -> PathBuf {
    std::env::temp_dir().join("jimeng-automation")
}

fn get_playwright_script_path() -> PathBuf {
    get_temp_dir().join("generate.js")
}

fn get_auth_state_path() -> PathBuf {
    get_temp_dir().join("auth-state.json")
}

/**
 * 检查自动化环境
 */
#[tauri::command]
pub async fn check_jimeng_environment() -> Result<JimengEnvironment, String> {
    // 检查 Node.js
    let node_installed = Command::new("cmd")
        .args(["/C", "node --version"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);

    // 检查 Playwright
    let playwright_installed = Command::new("cmd")
        .args(["/C", "npx playwright --version"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);

    Ok(JimengEnvironment {
        node_installed,
        playwright_installed,
    })
}

/**
 * 安装 Playwright（如果需要）
 */
#[tauri::command]
pub async fn install_playwright() -> Result<String, String> {
    let output = Command::new("cmd")
        .args(["/C", "npx playwright install --with-deps"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to install Playwright: {}", e))?;

    if output.status.success() {
        Ok("Playwright installed successfully".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to install Playwright: {}", stderr))
    }
}

/**
 * 仅打开浏览器，让用户手动准备
 * 使用 Chrome/Edge 并开启远程调试端口 9222，以便 Playwright 可以连接
 */
#[tauri::command]
pub async fn jimeng_open_browser() -> Result<String, String> {
    let url = "https://jimeng.jianying.com/ai-tool/generate";
    
    #[cfg(target_os = "windows")]
    {
        // Windows: 尝试启动 Chrome 或 Edge 并开启调试端口
        let browser_paths = [
            ("Chrome", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"),
            ("Chrome", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"),
            ("Edge", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"),
            ("Edge", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"),
        ];
        
        let mut browser_found = None;
        for (name, path) in &browser_paths {
            if std::path::Path::new(path).exists() {
                browser_found = Some((name, path));
                break;
            }
        }
        
        if let Some((browser_name, browser_path)) = browser_found {
            println!("Found browser: {} at {}", browser_name, browser_path);
            
            // 启动浏览器并开启远程调试端口
            // 使用用户数据目录避免冲突
            let user_data_dir = get_temp_dir().join(format!("{}-data", browser_name.to_lowercase()));
            let user_data_dir_str = user_data_dir.to_string_lossy();
            
            let result = Command::new(browser_path)
                .args([
                    &format!("--user-data-dir={}", user_data_dir_str),
                    "--remote-debugging-port=9222",
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--start-maximized",
                    url,
                ])
                .spawn();
            
            match result {
                Ok(status) => {
                    println!("{} started with debugging port 9222, PID: {:?}", browser_name, status.id());
                    
                    // 等待浏览器启动并监听端口
                    tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
                    
                    return Ok(format!("{} 已启动（调试端口: 9222），请登录并设置参数", browser_name));
                }
                Err(e) => {
                    return Err(format!("Failed to start {}: {}", browser_name, e));
                }
            }
        } else {
            // 降级：使用系统默认浏览器
            Command::new("cmd")
                .args(["/C", "start", "", url])
                .spawn()
                .map_err(|e| format!("Failed to open browser: {}", e))?;
            
            return Ok("已使用系统默认浏览器打开。注意：自动化功能需要 Chrome/Edge 并开启调试端口".to_string());
        }
    }
    
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-a", "Google Chrome", "--args", "--remote-debugging-port=9222", url])
            .spawn()
            .map_err(|e| format!("Failed to open browser: {}", e))?;
        
        tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
        return Ok("Chrome 已启动（调试端口: 9222），请登录并设置参数".to_string());
    }
    
    #[cfg(target_os = "linux")]
    {
        Command::new("google-chrome")
            .args(["--remote-debugging-port=9222", url])
            .spawn()
            .map_err(|e| format!("Failed to open browser: {}", e))?;
        
        tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
        return Ok("Chrome 已启动（调试端口: 9222），请登录并设置参数".to_string());
    }
}

/**
 * 执行即梦自动化生成
 */
#[tauri::command]
pub async fn jimeng_auto_generate(
    request: JimengGenerateRequest,
) -> Result<JimengGenerateResult, String> {
    // 确保临时目录存在
    let temp_dir = get_temp_dir();
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp dir: {}", e))?;

    // 创建 Playwright 脚本
    let script_content = create_playwright_script(&request)?;
    let script_path = get_playwright_script_path();
    std::fs::write(&script_path, &script_content)
        .map_err(|e| format!("Failed to write script: {}", e))?;

    // 执行脚本 - 需要从项目目录运行才能找到 playwright 模块
    let script_str = script_path.to_str().unwrap();
    let project_dir = std::env::current_dir()
        .map_err(|e| format!("Failed to get current dir: {}", e))?;
    let output = Command::new("cmd")
        .args(["/C", &format!("node {}", script_str)])
        .current_dir(&project_dir)
        .env("NODE_PATH", project_dir.join("node_modules"))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to run automation: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if output.status.success() {
        // 从输出中解析结果
        // 格式: "SUCCESS:image_path" 或 "ERROR:message"
        if stdout.starts_with("SUCCESS:") {
            let image_path = stdout.trim().strip_prefix("SUCCESS:").unwrap().to_string();
            Ok(JimengGenerateResult {
                success: true,
                image_path: Some(image_path),
                error: None,
            })
        } else if stdout.starts_with("ERROR:") {
            let error_msg = stdout.trim().strip_prefix("ERROR:").unwrap().to_string();
            Ok(JimengGenerateResult {
                success: false,
                image_path: None,
                error: Some(error_msg),
            })
        } else {
            Ok(JimengGenerateResult {
                success: false,
                image_path: None,
                error: Some(format!("Unknown output: {}", stdout)),
            })
        }
    } else {
        Ok(JimengGenerateResult {
            success: false,
            image_path: None,
            error: Some(stderr.to_string()),
        })
    }
}

fn create_playwright_script(request: &JimengGenerateRequest) -> Result<String, String> {
    let temp_dir = get_temp_dir();
    let output_dir = &request.output_dir;
    let prompt = &request.prompt;
    let negative_prompt = request.negative_prompt.as_deref().unwrap_or("");
    let reference_images_json = serde_json::to_string(&request.reference_images)
        .map_err(|e| format!("Failed to serialize reference images: {}", e))?;
    let auth_state_path_buf = get_auth_state_path();
    let _auth_state_path = auth_state_path_buf.to_str().unwrap();
    let output_dir_for_js = output_dir.replace('\\', "\\\\");

    let script = format!(r#"
const path = require('path');
const fs = require('fs');

// 添加项目 node_modules 路径
const projectModules = 'D:\\\\trae_projects\\\\fivedesigner\\\\node_modules';
module.paths.unshift(projectModules);

const {{ chromium }} = require('playwright');

async function run() {{
    let browser;
    try {{
        // 创建临时目录
        const tempDir = '{temp_dir}';
        if (!fs.existsSync(tempDir)) {{
            fs.mkdirSync(tempDir, {{ recursive: true }});
        }}
        
        console.log('Connecting to existing browser...');
        
        // 尝试连接到已打开的 Chrome/Edge 浏览器（通过 CDP）
        // 浏览器在 9222 端口开启调试
        const cdpUrls = [
            'http://localhost:9222',
            'http://127.0.0.1:9222'
        ];
        
        let connected = false;
        let lastError = null;
        
        // 重试连接（最多 10 次，每次等待 1 秒）
        for (let attempt = 0; attempt < 10; attempt++) {{
            for (const cdpUrl of cdpUrls) {{
                try {{
                    console.log('Attempt', attempt + 1, '- Trying to connect to:', cdpUrl);
                    browser = await chromium.connectOverCDP(cdpUrl);
                    console.log('Successfully connected to browser at:', cdpUrl);
                    connected = true;
                    break;
                }} catch (e) {{
                    lastError = e.message;
                    console.log('Failed to connect to', cdpUrl, ':', e.message);
                }}
            }}
            
            if (connected) break;
            
            // 等待 1 秒后重试
            console.log('Waiting 1 second before retry...');
            await new Promise(resolve => setTimeout(resolve, 1000));
        }}
        
        if (!connected) {{
            console.log('ERROR: Could not connect to any existing browser after 10 attempts.');
            console.log('Last error:', lastError);
            console.log('');
            console.log('Please make sure:');
            console.log('1. You have clicked "Open Browser" button first');
            console.log('2. Chrome/Edge is running with --remote-debugging-port=9222');
            console.log('3. Wait a few seconds for browser to fully start');
            return;
        }}
        
        // 获取已打开的页面
        const contexts = browser.contexts();
        console.log('Found', contexts.length, 'context(s)');
        
        let page = null;
        for (const context of contexts) {{
            const pages = await context.pages();
            console.log('Context has', pages.length, 'page(s)');
            for (const p of pages) {{
                const url = await p.url();
                console.log('Page URL:', url);
                // 找到即梦网站的页面
                if (url.includes('jimeng.jianying.com')) {{
                    page = p;
                    console.log('Found Jimeng page!');
                    break;
                }}
            }}
            if (page) break;
        }}
        
        if (!page) {{
            console.log('ERROR: No Jimeng page found in existing browser.');
            console.log('Please open https://jimeng.jianying.com in Chrome first.');
            return;
        }}
        
        console.log('');
        console.log('==================================================');
        console.log('Connected to existing browser!');
        console.log('Current URL:', await page.url());
        console.log('');
        console.log('Auto-filling prompt and clicking generate...');
        console.log('==================================================');
        console.log('');
        
        // 等待页面加载完成
        await page.waitForTimeout(2000);
        
        // 自动填写提示词
        console.log('Auto-filling prompt and parameters...');
        
        // 查找并填写提示词输入框
        const promptSelectors = [
            'textarea[placeholder*="提示"]',
            'textarea[placeholder*="描述"]', 
            'textarea[placeholder*="词"]',
            'div[contenteditable="true"]',
            '.prompt-input textarea',
            'textarea'
        ];
        
        let promptInput = null;
        let promptSelector = '';
        for (const selector of promptSelectors) {{
            promptInput = await page.$(selector);
            if (promptInput) {{
                promptSelector = selector;
                console.log('Found prompt input with selector:', selector);
                break;
            }}
        }}
        
        if (!promptInput) {{
            console.log('ERROR:Prompt input not found');
            await browser.close();
            return;
        }}
        
        // 填写提示词
        console.log('Filling prompt...');
        if (promptSelector.includes('contenteditable')) {{
            await promptInput.click();
            await page.keyboard.type('{prompt}');
            console.log('Typed prompt into contenteditable div');
        }} else {{
            await promptInput.fill('{prompt}');
            console.log('Filled prompt into textarea');
        }}
        
        // 如果有反向提示词
        if ('{negative_prompt}') {{
            const negPromptSelectors = [
                'textarea[placeholder*="反向"]',
                'input[placeholder*="反向"]',
            ];
            
            for (const selector of negPromptSelectors) {{
                const negInput = await page.$(selector);
                if (negInput) {{
                    await negInput.fill('{negative_prompt}');
                    console.log('Filled negative prompt');
                    break;
                }}
            }}
        }}
        
        // 处理参考图
        const referenceImages = {reference_images_json};
        if (referenceImages.length > 0) {{
            console.log('Uploading ' + referenceImages.length + ' reference images...');
            
            // 查找上传按钮
            const uploadBtn = await page.$('button:has-text("上传")');
            if (uploadBtn) {{
                // 设置文件选择器监听
                page.on('filechooser', async (fileChooser) => {{
                    for (const img of referenceImages) {{
                        if (img.path) {{
                            await fileChooser.setFiles(img.path);
                            console.log('Uploaded reference image:', img.path);
                            break;
                        }}
                    }}
                }});
                
                await uploadBtn.click();
                await page.waitForTimeout(2000);
            }}
        }}
        
        // 查找并点击生成按钮
        console.log('Looking for generate button...');
        
        // 等待一下让页面完全渲染
        await page.waitForTimeout(2000);
        
        // 尝试多种方式查找生成按钮
        let generateButton = null;
        
        // 方式1: 通过文本内容查找
        const buttonTexts = ['生成', '创作', '立即生成', '开始创作', '生成图片'];
        for (const text of buttonTexts) {{
            const buttons = await page.$$('button');
            for (const btn of buttons) {{
                const btnText = await btn.textContent();
                if (btnText && btnText.includes(text)) {{
                    // 检查按钮是否可见和可点击
                    const isVisible = await btn.isVisible().catch(() => false);
                    const isEnabled = await btn.isEnabled().catch(() => false);
                    if (isVisible && isEnabled) {{
                        generateButton = btn;
                        console.log('Found generate button with text:', text);
                        break;
                    }}
                }}
            }}
            if (generateButton) break;
        }}
        
        // 方式2: 通过 CSS 选择器查找
        if (!generateButton) {{
            const generateSelectors = [
                'button[class*="generate"]',
                'button[class*="submit"]',
                'button[class*="create"]',
                '[class*="generate"] button',
                '[class*="action"] button',
                'button[type="button"]'
            ];
            
            for (const selector of generateSelectors) {{
                const buttons = await page.$$(selector);
                for (const btn of buttons) {{
                    const isVisible = await btn.isVisible().catch(() => false);
                    const btnText = await btn.textContent().catch(() => '');
                    if (isVisible && btnText && (btnText.includes('生成') || btnText.includes('创作'))) {{
                        generateButton = btn;
                        console.log('Found generate button with selector:', selector, 'text:', btnText);
                        break;
                    }}
                }}
                if (generateButton) break;
            }}
        }}
        
        // 方式3: 查找所有可见按钮，选择最可能是生成按钮的
        if (!generateButton) {{
            const allButtons = await page.$$('button');
            console.log('Found', allButtons.length, 'buttons on page');
            
            for (let i = 0; i < allButtons.length; i++) {{
                const btn = allButtons[i];
                const isVisible = await btn.isVisible().catch(() => false);
                const btnText = await btn.textContent().catch(() => '');
                console.log('Button', i, ':', btnText, 'visible:', isVisible);
                
                if (isVisible && btnText) {{
                    // 优先选择包含"生成"或"创作"的按钮
                    if (btnText.includes('生成') || btnText.includes('创作')) {{
                        generateButton = btn;
                        console.log('Selected generate button:', btnText);
                        break;
                    }}
                }}
            }}
        }}
        
        if (!generateButton) {{
            console.log('ERROR: Generate button not found after trying all methods');
            console.log('Please manually click the generate button in the browser');
            return;
        }}
        
        console.log('Clicking generate button...');
        await generateButton.click();
        console.log('Generate button clicked successfully!');
        
        // 等待生成完成
        console.log('Waiting for generation to complete...');
        for (let i = 0; i < 120; i++) {{
            await page.waitForTimeout(5000);
            
            const generatingElements = await page.$$('.generating, .generating-button, [class*="generating"]');
            const generatingText = await page.$('text=/生成中 | 任务进行中 | 创作中/i');
            
            if (!generatingElements.length && !generatingText) {{
                console.log('Generation completed!');
                break;
            }}
            
            if ((i + 1) % 12 === 0) {{
                console.log('Still generating... (' + ((i+1) * 5) + 's)');
            }}
        }}
        
        // 查找结果图片
        console.log('Looking for result image...');
        
        const resultSelectors = [
            'img[src*="jimeng"]',
            '.result-image img',
            '.generated-image img',
            'img[class*="result"]'
        ];
        
        let resultImage = null;
        for (const selector of resultSelectors) {{
            const images = await page.$$(selector);
            if (images.length > 0) {{
                resultImage = images[0];
                console.log('Found result image with selector:', selector);
                break;
            }}
        }}
        
        if (!resultImage) {{
            console.log('ERROR:Result image not found');
            await browser.close();
            return;
        }}
        
        const src = await resultImage.getAttribute('src');
        console.log('Result image src:', src);
        
        // 下载图片
        const outputDir = '{output_dir_for_js}';
        const timestamp = Date.now();
        const outputPath = path.join(outputDir, 'jimeng_' + timestamp + '.png');
        
        // 如果是 base64 图片，直接保存
        if (src && src.startsWith('data:image')) {{
            const base64Data = src.replace(/^data:image\/\w+;base64,/, '');
            const imageBuffer = Buffer.from(base64Data, 'base64');
            fs.writeFileSync(outputPath, imageBuffer);
            console.log('SUCCESS:' + outputPath);
        }} else if (src) {{
            // 下载远程图片
            const https = require('https');
            const http = require('http');
            const urlObj = new URL(src);
            const protocol = urlObj.protocol === 'https:' ? https : http;
            
            await new Promise((resolve, reject) => {{
                protocol.get(src, (response) => {{
                    if (response.statusCode === 200) {{
                        const file = fs.createWriteStream(outputPath);
                        response.pipe(file);
                        file.on('finish', () => {{
                            file.close();
                            console.log('SUCCESS:' + outputPath);
                            resolve();
                        }});
                    }} else {{
                        reject(new Error('Failed to download image'));
                    }}
                }}).on('error', reject);
            }});
        }}
        
        await browser.close();
        
    }} catch (error) {{
        console.log('ERROR:' + error.message);
        if (browser) {{
            await browser.close();
        }}
    }}
}}

run();
"#, 
        temp_dir = temp_dir.to_string_lossy().replace('\\', "\\\\"),
        prompt = prompt.replace('\\', "\\\\").replace("'", "\\'").replace("\n", "\\n"),
        negative_prompt = negative_prompt.replace('\\', "\\\\").replace("'", "\\'").replace("\n", "\\n"),
        reference_images_json = reference_images_json.replace('\\', "\\\\"),
        output_dir_for_js = output_dir_for_js.replace('\\', "\\\\")
    );

    Ok(script)
}
