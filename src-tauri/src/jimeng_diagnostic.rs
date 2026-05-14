/**
 * 即梦网站诊断模块
 * 用于分析页面结构，获取关键元素选择器
 */

use std::process::{Command, Stdio};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct DiagnosticResult {
    pub success: bool,
    pub data: Option<String>,
    pub error: Option<String>,
}

/**
 * 运行页面诊断
 * 分析即梦网站的 DOM 结构，输出关键元素信息
 */
#[tauri::command]
pub async fn run_jimeng_diagnostic() -> Result<DiagnosticResult, String> {
    let temp_dir = std::env::temp_dir().join("jimeng-automation");
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp dir: {}", e))?;

    // 创建诊断脚本
    let script_content = r#"
const fs = require('fs');
const path = require('path');

// 添加项目 node_modules 路径
const projectModules = 'D:\\trae_projects\\fivedesigner\\node_modules';
module.paths.unshift(projectModules);

const { chromium } = require('playwright');

async function runDiagnostic() {
    console.log('=== 即梦网站页面诊断 ===\n');
    
    let browser = null;
    
    try {
        // 连接到已打开的浏览器
        console.log('正在连接浏览器...');
        browser = await chromium.connectOverCDP('http://localhost:9222');
        console.log('✓ 已连接到浏览器\n');
        
        // 查找即梦页面
        const contexts = await browser.contexts();
        let targetPage = null;
        
        for (const context of contexts) {
            const pages = await context.pages();
            for (const page of pages) {
                const url = await page.url();
                if (url.includes('jimeng.jianying.com')) {
                    targetPage = page;
                    break;
                }
            }
            if (targetPage) break;
        }
        
        if (!targetPage) {
            console.log('ERROR: 未找到即梦页面');
            return;
        }
        
        console.log('当前页面 URL:', await targetPage.url());
        console.log('页面标题:', await targetPage.title());
        console.log('\n');
        
        // 1. 分析所有输入框
        console.log('=== 1. 输入框分析 ===');
        const inputs = await targetPage.$$('textarea, input[type="text"], div[contenteditable="true"]');
        console.log(`找到 ${inputs.length} 个输入框:\n`);
        
        for (let i = 0; i < inputs.length; i++) {
            const input = inputs[i];
            try {
                const tagName = await input.evaluate(el => el.tagName);
                const className = await input.evaluate(el => el.className);
                const placeholder = await input.evaluate(el => el.placeholder || '');
                const isVisible = await input.isVisible().catch(() => false);
                const rect = await input.evaluate(el => {
                    const r = el.getBoundingClientRect();
                    return { x: r.x, y: r.y, width: r.width, height: r.height };
                });
                
                console.log(`[输入框 ${i + 1}]`);
                console.log(`  标签: ${tagName}`);
                console.log(`  类名: ${className.substring(0, 100)}`);
                console.log(`  Placeholder: ${placeholder}`);
                console.log(`  可见: ${isVisible}`);
                console.log(`  位置: x=${Math.round(rect.x)}, y=${Math.round(rect.y)}, w=${Math.round(rect.width)}, h=${Math.round(rect.height)}`);
                console.log('');
            } catch (e) {
                console.log(`[输入框 ${i + 1}] 获取信息失败: ${e.message}\n`);
            }
        }
        
        // 2. 分析所有按钮
        console.log('\n=== 2. 按钮分析 ===');
        const buttons = await targetPage.$$('button');
        console.log(`找到 ${buttons.length} 个按钮:\n`);
        
        let visibleButtonCount = 0;
        for (let i = 0; i < buttons.length; i++) {
            const btn = buttons[i];
            try {
                const text = await btn.textContent();
                const className = await btn.evaluate(el => el.className);
                const isVisible = await btn.isVisible().catch(() => false);
                const isEnabled = await btn.isEnabled().catch(() => false);
                const rect = await btn.evaluate(el => {
                    const r = el.getBoundingClientRect();
                    return { x: r.x, y: r.y, width: r.width, height: r.height };
                });
                
                if (isVisible) {
                    visibleButtonCount++;
                    console.log(`[按钮 ${visibleButtonCount}]`);
                    console.log(`  文本: "${text?.trim() || '(无文本)'}"`);
                    console.log(`  类名: ${className.substring(0, 100)}`);
                    console.log(`  可用: ${isEnabled}`);
                    console.log(`  位置: x=${Math.round(rect.x)}, y=${Math.round(rect.y)}, w=${Math.round(rect.width)}, h=${Math.round(rect.height)}`);
                    console.log('');
                }
            } catch (e) {
                // 忽略错误
            }
        }
        
        // 3. 分析所有图片
        console.log('\n=== 3. 图片分析 ===');
        const images = await targetPage.$$('img');
        console.log(`找到 ${images.length} 个图片元素:\n`);
        
        let visibleImageCount = 0;
        for (let i = 0; i < images.length; i++) {
            const img = images[i];
            try {
                const src = await img.getAttribute('src');
                const isVisible = await img.isVisible().catch(() => false);
                const rect = await img.evaluate(el => {
                    const r = el.getBoundingClientRect();
                    return { x: r.x, y: r.y, width: r.width, height: r.height };
                });
                
                if (isVisible && src) {
                    visibleImageCount++;
                    console.log(`[图片 ${visibleButtonCount}]`);
                    console.log(`  SRC: ${src.substring(0, 100)}...`);
                    console.log(`  位置: x=${Math.round(rect.x)}, y=${Math.round(rect.y)}, w=${Math.round(rect.width)}, h=${Math.round(rect.height)}`);
                    console.log('');
                }
            } catch (e) {
                // 忽略错误
            }
        }
        
        // 4. 推荐选择器
        console.log('\n=== 4. 推荐选择器 ===');
        console.log('根据分析结果，建议使用以下选择器:\n');
        
        // 查找提示词输入框
        console.log('提示词输入框:');
        console.log('  - textarea[placeholder*="提示"]');
        console.log('  - div[contenteditable="true"]');
        console.log('  - 或通过坐标点击页面中央偏上位置');
        console.log('');
        
        console.log('生成按钮:');
        console.log('  - button:has-text("生成")');
        console.log('  - 或通过遍历所有按钮查找包含"生成"文本的');
        console.log('');
        
        console.log('生成的图片:');
        console.log('  - img[src*="jimeng"]');
        console.log('  - img[src*="bytedance"]');
        console.log('  - 或查找所有可见的大尺寸图片');
        console.log('');
        
        console.log('=== 诊断完成 ===');
        
    } catch (error) {
        console.log('ERROR:', error.message);
        console.log(error.stack);
    } finally {
        if (browser) {
            console.log('\n保持浏览器连接');
        }
    }
}

runDiagnostic();
"#;

    let script_path = temp_dir.join("diagnostic.js");
    std::fs::write(&script_path, script_content)
        .map_err(|e| format!("Failed to write script: {}", e))?;

    // 执行诊断脚本
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
        .map_err(|e| format!("Failed to run diagnostic: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if output.status.success() {
        Ok(DiagnosticResult {
            success: true,
            data: Some(stdout.to_string()),
            error: None,
        })
    } else {
        Ok(DiagnosticResult {
            success: false,
            data: None,
            error: Some(stderr.to_string()),
        })
    }
}
