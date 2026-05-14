/**
 * 即梦自动化模块 V2
 * 更可靠的自动化方案
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

fn get_temp_dir() -> PathBuf {
    std::env::temp_dir().join("jimeng-automation")
}

/**
 * 执行即梦自动化生成 - V2 版本
 * 使用更可靠的选择器策略
 */
#[tauri::command]
pub async fn jimeng_auto_generate_v2(
    request: JimengGenerateRequest,
) -> Result<JimengGenerateResult, String> {
    let temp_dir = get_temp_dir();
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp dir: {}", e))?;

    // 创建改进的 Playwright 脚本
    let script_content = create_improved_script(&request)?;
    let script_path = temp_dir.join("generate_v2.js");
    std::fs::write(&script_path, &script_content)
        .map_err(|e| format!("Failed to write script: {}", e))?;

    // 执行脚本
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

    // 解析结果
    if output.status.success() {
        if stdout.contains("SUCCESS:") {
            let image_path = stdout.split("SUCCESS:").nth(1)
                .map(|s| s.trim().to_string())
                .unwrap_or_default();
            Ok(JimengGenerateResult {
                success: true,
                image_path: Some(image_path),
                error: None,
            })
        } else if stdout.contains("ERROR:") {
            let error_msg = stdout.split("ERROR:").nth(1)
                .map(|s| s.trim().to_string())
                .unwrap_or_else(|| "Unknown error".to_string());
            Ok(JimengGenerateResult {
                success: false,
                image_path: None,
                error: Some(error_msg),
            })
        } else {
            Ok(JimengGenerateResult {
                success: false,
                image_path: None,
                error: Some(format!("Unexpected output: {}", stdout)),
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

fn create_improved_script(request: &JimengGenerateRequest) -> Result<String, String> {
    let prompt = &request.prompt;
    let negative_prompt = request.negative_prompt.as_deref().unwrap_or("");
    let output_dir = &request.output_dir;
    
    let script = format!(r#"
const fs = require('fs');
const path = require('path');

// 添加项目 node_modules 路径（必须在 require playwright 之前）
const projectModules = 'D:\\\\trae_projects\\\\fivedesigner\\\\node_modules';
module.paths.unshift(projectModules);

const {{ chromium }} = require('playwright');

async function run() {{
    let browser = null;
    
    try {{
        console.log('=== 即梦自动化生成 V2 ===');
        
        // 1. 连接到已打开的浏览器
        console.log('正在连接浏览器...');
        let connected = false;
        let retryCount = 0;
        const maxRetries = 15;
        
        while (!connected && retryCount < maxRetries) {{
            try {{
                browser = await chromium.connectOverCDP('http://localhost:9222');
                connected = true;
                console.log('✓ 成功连接到浏览器');
            }} catch (e) {{
                retryCount++;
                console.log(`等待浏览器启动... (${{retryCount}}/${{maxRetries}})`);
                await new Promise(r => setTimeout(r, 1000));
            }}
        }}
        
        if (!connected) {{
            console.log('ERROR: 无法连接到浏览器，请确保已点击"打开浏览器"按钮');
            return;
        }}
        
        // 2. 查找即梦页面
        console.log('正在查找即梦页面...');
        const contexts = await browser.contexts();
        let targetPage = null;
        
        for (const context of contexts) {{
            const pages = await context.pages();
            for (const page of pages) {{
                const url = await page.url();
                if (url.includes('jimeng.jianying.com')) {{
                    targetPage = page;
                    console.log('✓ 找到即梦页面:', url);
                    break;
                }}
            }}
            if (targetPage) break;
        }}
        
        if (!targetPage) {{
            console.log('ERROR: 未找到即梦页面');
            return;
        }}
        
        // 3. 智能填写提示词
        console.log('正在填写提示词...');
        const promptText = `{prompt}`;
        
        // 策略1: 尝试通过 placeholder 查找
        const inputSelectors = [
            'textarea[placeholder*="提示"]',
            'textarea[placeholder*="描述"]',
            'div[contenteditable="true"]',
            'input[placeholder*="提示"]',
            '[class*="prompt"] textarea',
            '[class*="input"] textarea'
        ];
        
        let inputFound = false;
        for (const selector of inputSelectors) {{
            try {{
                const input = await targetPage.$(selector);
                if (input) {{
                    const isVisible = await input.isVisible().catch(() => false);
                    if (isVisible) {{
                        await input.click();
                        await input.fill('');
                        await input.fill(promptText);
                        console.log('✓ 已填写提示词:', selector);
                        inputFound = true;
                        break;
                    }}
                }}
            }} catch (e) {{}}
        }}
        
        // 策略2: 如果上面失败，尝试通过坐标点击（基于常见布局）
        if (!inputFound) {{
            console.log('尝试通过坐标定位输入框...');
            // 获取页面尺寸
            const viewport = await targetPage.viewportSize();
            if (viewport) {{
                // 通常输入框在页面中央偏上位置
                const centerX = viewport.width / 2;
                const centerY = viewport.height * 0.3;
                
                await targetPage.mouse.click(centerX, centerY);
                await targetPage.keyboard.type(promptText);
                console.log('✓ 已通过坐标填写提示词');
                inputFound = true;
            }}
        }}
        
        if (!inputFound) {{
            console.log('ERROR: 无法找到提示词输入框');
            return;
        }}
        
        // 4. 等待一下让页面响应
        await targetPage.waitForTimeout(1500);
        
        // 5. 智能点击生成按钮
        console.log('正在查找生成按钮...');
        
        // 策略1: 通过文本查找
        const generateTexts = ['生成', '立即生成', '开始创作', '生成图片'];
        let buttonClicked = false;
        
        for (const text of generateTexts) {{
            try {{
                // 使用 XPath 查找包含特定文本的按钮
                const button = await targetPage.$('button:has-text("' + text + '")');
                if (button) {{
                    const isVisible = await button.isVisible().catch(() => false);
                    const isEnabled = await button.isEnabled().catch(() => false);
                    
                    if (isVisible && isEnabled) {{
                        await button.click();
                        console.log('✓ 已点击生成按钮:', text);
                        buttonClicked = true;
                        break;
                    }}
                }}
            }} catch (e) {{}}
        }}
        
        // 策略2: 查找所有按钮，选择最可能是生成按钮的
        if (!buttonClicked) {{
            console.log('尝试查找所有按钮...');
            const buttons = await targetPage.$$('button');
            console.log(`找到 ${{buttons.length}} 个按钮`);
            
            for (let i = 0; i < buttons.length; i++) {{
                try {{
                    const btn = buttons[i];
                    const text = await btn.textContent();
                    const isVisible = await btn.isVisible().catch(() => false);
                    
                    if (isVisible && text) {{
                        console.log(`按钮 ${{i}}: "${{text}}"`);
                        
                        // 优先选择包含"生成"或"创作"的按钮
                        if (text.includes('生成') || text.includes('创作')) {{
                            await btn.click();
                            console.log('✓ 已点击按钮:', text);
                            buttonClicked = true;
                            break;
                        }}
                    }}
                }} catch (e) {{}}
            }}
        }}
        
        // 策略3: 如果还是找不到，尝试通过键盘快捷键
        if (!buttonClicked) {{
            console.log('尝试使用键盘快捷键...');
            await targetPage.keyboard.press('Enter');
            console.log('✓ 已发送 Enter 键');
            buttonClicked = true;
        }}
        
        if (!buttonClicked) {{
            console.log('ERROR: 无法点击生成按钮');
            return;
        }}
        
        // 6. 等待生成完成
        console.log('等待生成完成...');
        console.log('（请在浏览器中查看生成进度）');
        
        // 等待生成完成 - 检测生成中的状态
        let generationComplete = false;
        let waitTime = 0;
        const maxWaitTime = 120000; // 最多等待 120 秒
        
        while (!generationComplete && waitTime < maxWaitTime) {{
            await targetPage.waitForTimeout(3000);
            waitTime += 3000;
            
            // 检查是否有生成的图片出现
            const images = await targetPage.$$('img[src*="jimeng"], img[src*="bytedance"], [class*="result"] img, [class*="image"] img');
            const visibleImages = [];
            
            for (const img of images) {{
                const isVisible = await img.isVisible().catch(() => false);
                const src = await img.getAttribute('src').catch(() => '');
                if (isVisible && src && (src.includes('http') || src.includes('data:image'))) {{
                    visibleImages.push(src);
                }}
            }}
            
            if (visibleImages.length > 0) {{
                console.log(`✓ 检测到 ${{visibleImages.length}} 张生成完成的图片`);
                generationComplete = true;
                
                // 7. 下载图片
                console.log('正在下载图片...');
                const downloadDir = `{output_dir}`;
                if (!fs.existsSync(downloadDir)) {{
                    fs.mkdirSync(downloadDir, {{ recursive: true }});
                }}
                
                const downloadedPaths = [];
                for (let i = 0; i < visibleImages.length; i++) {{
                    const imageUrl = visibleImages[i];
                    const timestamp = Date.now();
                    const filename = `jimeng_${{timestamp}}_${{i + 1}}.png`;
                    const filepath = path.join(downloadDir, filename);
                    
                    try {{
                        // 下载图片
                        const response = await fetch(imageUrl);
                        const buffer = await response.buffer();
                        fs.writeFileSync(filepath, buffer);
                        console.log(`✓ 已下载图片: ${{filename}}`);
                        downloadedPaths.push(filepath);
                    }} catch (e) {{
                        console.log(`✗ 下载图片 ${{i + 1}} 失败:`, e.message);
                    }}
                }}
                
                if (downloadedPaths.length > 0) {{
                    console.log('');
                    console.log('=== 下载完成 ===');
                    console.log(`成功下载 ${{downloadedPaths.length}} 张图片`);
                    console.log('保存位置:', downloadDir);
                    console.log('');
                    console.log('SUCCESS:' + downloadedPaths[0]);
                }} else {{
                    console.log('WARNING: 未能下载任何图片');
                }}
                
                break;
            }}
            
            // 每 10 秒输出一次进度
            if (waitTime % 10000 === 0) {{
                console.log(`已等待 ${{waitTime / 1000}} 秒...`);
            }}
        }}
        
        if (!generationComplete) {{
            console.log('WARNING: 等待超时，可能生成时间较长，请手动检查浏览器');
        }}
        
    }} catch (error) {{
        console.log('ERROR:', error.message);
        console.log(error.stack);
    }} finally {{
        // 不要关闭浏览器，让用户继续使用
        if (browser) {{
            console.log('保持浏览器连接，不要关闭');
        }}
    }}
}}

run();
"#,
        prompt = prompt.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', "\\n"),
    );
    
    Ok(script)
}

/**
 * 检查环境
 */
#[tauri::command]
pub async fn check_jimeng_environment_v2() -> Result<serde_json::Value, String> {
    let node_installed = Command::new("cmd")
        .args(["/C", "node --version"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);

    let playwright_installed = Command::new("cmd")
        .args(["/C", "npx playwright --version"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);

    Ok(serde_json::json!({
        "node_installed": node_installed,
        "playwright_installed": playwright_installed,
        "ready": node_installed && playwright_installed
    }))
}
