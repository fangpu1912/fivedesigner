# BrowserManager 验证与修复计划

## 当前状态

BrowserManager 多开器功能的核心代码已创建完成：
- `src-tauri/src/embedded_browser.rs` — Rust 后端（创建/定位/显示/隐藏/导航/关闭 Webview）
- `src-tauri/scripts/dewatermark_content.js` — 去水印脚本（已适配 Tauri Webview）
- `src-tauri/scripts/dewatermark_page.js` — 15秒视频选项注入（已适配 Tauri Webview）
- `src/hooks/useEmbeddedBrowser.ts` — 嵌入式浏览器 React Hook
- `src/hooks/useMediaExtraction.ts` — 媒体提取/下载 React Hook
- `src/pages/BrowserManager.tsx` — 三栏布局页面组件
- `src-tauri/src/lib.rs` — 模块注册和命令注册已完成
- `src-tauri/capabilities/main-capability.json` — 权限配置已更新

## 已发现的问题

### 1. BrowserManager.tsx 缺少 `invoke` 导入（必须修复）
- **文件**: `src/pages/BrowserManager.tsx` 第 190 行
- **问题**: `deleteAccount` 函数中调用 `invoke('clear_browser_data', ...)` 但 `invoke` 未从 `@tauri-apps/api/core` 导入
- **修复**: 添加 `import { invoke } from '@tauri-apps/api/core'`

### 2. `proxy_url` 方法可能不存在（需 cargo check 验证）
- **文件**: `src-tauri/src/embedded_browser.rs` 第 101 行
- **问题**: `builder.proxy_url()` 可能需要 Tauri 特性标志或不存在于 2.10.3 版本
- **修复**: 如果编译失败，移除 `proxy_url` 调用或添加对应 feature flag

### 3. Cookie 注入函数不完整（功能性问题）
- **文件**: `src-tauri/src/embedded_browser.rs` 第 141-164 行
- **问题**: `inject_cookies_via_eval` 函数没有 AppHandle，无法实际执行 JS，只返回 `Ok(())`
- **修复**: 这个函数在 tokio::spawn 中被调用，但没有 AppHandle。需要将 AppHandle 克隆传入或改为通过前端 `inject_cookies_to_webview` 命令注入（已有该命令，第 327-360 行）

### 4. useMediaExtraction.ts 下载命令参数不匹配（需验证）
- **文件**: `src/hooks/useMediaExtraction.ts` 第 106 行
- **问题**: `download_video` Rust 命令签名需要 `task_id`, `cookies`, `media_type` 参数（都是 Option），JS 端只传了 `url`, `filename`, `projectId`, `episodeId`
- **修复**: Option 参数可以不传，Tauri 会将其视为 None，应该能正常工作

## 实施步骤

### Step 1: 修复 BrowserManager.tsx 缺失的 invoke 导入
- 在 `src/pages/BrowserManager.tsx` 顶部添加 `import { invoke } from '@tauri-apps/api/core'`

### Step 2: 修复 embedded_browser.rs Cookie 注入逻辑
- 重构 `create_embedded_webview` 中的 Cookie 注入部分
- 将 `inject_cookies_via_eval` 改为通过已有的 `inject_cookies_to_webview` 命令方式
- 在 tokio::spawn 中使用 AppHandle 克隆调用 `inject_cookies_to_webview` 命令的逻辑

### Step 3: 运行 cargo check 验证 Rust 编译
- 执行 `cargo check` 在 `src-tauri` 目录
- 修复所有编译错误（特别是 `proxy_url` 如果不存在的话）

### Step 4: 运行 npm run typecheck 验证 TypeScript 编译
- 执行 `npm run typecheck`
- 修复所有类型错误

### Step 5: 端到端功能测试
- 启动应用 `npm run tauri:dev`
- 验证：添加账号 → 打开浏览器 → 去水印脚本注入 → 媒体捕获 → 下载

## 验证标准

1. `cargo check` — 0 errors
2. `npm run typecheck` — 0 errors
3. 应用启动后 BrowserManager 页面正常显示
4. 添加账号后内嵌浏览器正常打开
5. 豆包页面自动注入去水印脚本
6. 生成的图片/视频出现在右侧下载面板
