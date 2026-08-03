# 页内浏览页面重构：多实例浏览器 + 去水印集成

## Context

当前 BrowserManager 页面是简单的卡片网格布局，打开外部 Chrome 窗口，无内嵌浏览器、无下载面板。用户需要将其重构为三栏布局的多实例浏览器管理器，集成豆包去水印脚本，类似剧本创作页的布局风格。

## 布局设计

```
┌──────────┬──────────────────────────────┬──────────────┐
│ 左栏 w-60 │      中间栏 flex-1             │  右栏 w-80   │
│ 账号列表  │  内嵌 Webview 浏览器区域        │  可折叠下载面板│
│          │  Tab栏 + URL栏 + 浏览器容器     │  图片/视频列表 │
└──────────┴──────────────────────────────┴──────────────┘
```

参照 ScriptCreation.tsx 的三栏布局模式（左 w-80 / 中 flex-1 / 右 w-80 可折叠）。

## 核心技术方案

### 内嵌浏览器：WebviewWindow 定位覆盖法

Tauri 2.0 的 WebviewWindow 无法嵌入 DOM，采用定位覆盖方案：
- 每个账号创建独立 WebviewWindow（无边框、独立 data_directory）
- 前端通过 `getBoundingClientRect()` + 主窗口位置计算 webview 屏幕坐标
- 调用 Rust 命令动态设置 webview 的 position/size
- 切换账号时 hide/show 对应 webview
- ResizeObserver 监听容器变化，实时更新 webview 位置

### 去水印脚本注入

从 `豆包去视频图片水印13` 提取核心逻辑，适配 Tauri webview 环境：
- **content.js** → `initialization_scripts` 注入，保留 fetch/XHR 拦截 + SSE 解析 + 图片/视频提取
- **page.js** → 保留 15 秒视频选项注入逻辑
- **forwarder.js** → 不移植 DOM 注入浮窗，改为 postMessage 通知主应用
- **background.js** → 不移植，下载由主应用下载面板实现
- 移除所有 `chrome.*` API 调用和激活码逻辑
- 通信改为 `window.__TAURI__.event.emit('media-extracted', ...)` 

### 通信机制

```
豆包页面(SSE拦截) → content.js postMessage
  → initialization_script 监听器
  → __TAURI__.event.emit("media-extracted", {accountId, type, data})
  → 主窗口 listen("media-extracted")
  → React 更新下载面板
```

## 实施步骤

### Step 1: Rust 后端 - 内嵌 Webview 管理

**新建 `src-tauri/src/embedded_browser.rs`**

实现 Tauri 命令：
- `create_embedded_webview(app, account_id, url, data_dir, user_agent, proxy, cookies)` - 创建无边框 WebviewWindow，注入去水印脚本，设置独立 data_directory
- `position_webview_window(app, account_id, x, y, width, height)` - 定位 webview 到指定屏幕坐标
- `show_webview_window(app, account_id)` / `hide_webview_window(app, account_id)` - 显示/隐藏
- `navigate_webview(app, account_id, url)` - 导航
- `close_embedded_webview(app, account_id)` - 关闭并清理
- `inject_dewatermark_script(app, account_id)` - 手动注入去水印脚本（导航后重新注入）
- `eval_webview_js(app, account_id, js_code)` - 在 webview 中执行 JS

WebviewWindow 配置：
- `decorations(false)` 无边框
- `data_directory(app_data_dir/browser_sessions/{account_id})` Cookie 隔离
- `initialization_scripts` 注入去水印脚本
- `label` 格式: `browser_webview_{account_id}`
- `on_navigation_completed` 回调判断 doubao.com 域名，重新注入脚本

**修改 `src-tauri/src/lib.rs`**
- 添加 `mod embedded_browser;`
- 在 `generate_handler![]` 中注册新命令

### Step 2: 去水印脚本适配

**新建 `src-tauri/scripts/dewatermark_content.js`**

从 `D:\trae_projects\doubao\browser_manager\豆包去视频图片水印13\content.js` 提取并适配：
- 保留：fetch/XHR 拦截、SSE 解析、图片提取、视频提取、无水印 URL 解析（callGetPlayInfo、callDoubaoShareSave、callGetVideoShareInfo）
- 修改：`window.postMessage` 改为 `__TAURI__.event.emit('media-extracted', ...)` 
- 添加：`window.__EMBEDDED_ACCOUNT_ID__` 全局变量（创建时注入）
- 移除：所有 `chrome.*` API、激活码逻辑

**新建 `src-tauri/scripts/dewatermark_page.js`**

从 `page.js` 提取 15 秒视频选项注入逻辑，移除激活码检查。

### Step 3: 前端页面重构

**重写 `src/pages/BrowserManager.tsx`** 为三栏布局：

左栏 AccountListPanel：
- 账号卡片列表（名称、平台、运行状态指示灯）
- 点击切换 webview（show/hide + position）
- 添加账号按钮 + Cookie 导入
- 开启/关闭账号

中间栏 BrowserTabsArea：
- Tab 栏（每运行账号一个 Tab，可关闭）
- URL 栏（显示/输入 URL，前进后退按钮）
- Webview 容器（ref 用于定位）

右栏 DownloadPanel（可折叠）：
- 图片/视频 Tab 切换
- 缩略图网格列表
- 单项下载 + 批量下载按钮
- 清空按钮
- 监听 `media-extracted` 事件更新列表

**新建 `src/hooks/useEmbeddedBrowser.ts`**
- webview 生命周期管理（创建、定位、显示、隐藏、关闭）
- 位置同步逻辑（ResizeObserver + window resize）
- Tab 切换逻辑

**新建 `src/hooks/useMediaExtraction.ts`**
- 监听 `media-extracted` Tauri 事件
- 维护 ExtractedMedia 状态
- 下载功能（调用 download_video/download_image）

### Step 4: 权限配置

**修改 `src-tauri/capabilities/main-capability.json`**
- windows 数组添加 `"browser_webview_*"` 模式
- 添加 webview 权限：`core:webview:allow-webview-set-size`、`core:webview:allow-webview-set-position`、`core:webview:allow-webview-eval`

### Step 5: 兼容与收尾

- 保留原有 `browser_manager.rs` 的外部 Chrome 命令（兼容）
- 页面离开时隐藏所有 webview（不关闭，保持登录态）
- 下载面板复用已有的 `download_video` / `download_image` Tauri 命令

## 关键文件

| 文件 | 操作 |
|------|------|
| `src-tauri/src/embedded_browser.rs` | 新建 |
| `src-tauri/scripts/dewatermark_content.js` | 新建 |
| `src-tauri/scripts/dewatermark_page.js` | 新建 |
| `src/pages/BrowserManager.tsx` | 重写 |
| `src/hooks/useEmbeddedBrowser.ts` | 新建 |
| `src/hooks/useMediaExtraction.ts` | 新建 |
| `src-tauri/src/lib.rs` | 修改（注册新模块和命令） |
| `src-tauri/capabilities/main-capability.json` | 修改（添加权限） |

## 验证方法

1. 启动 `npm run tauri:dev`
2. 进入"页内浏览"页面
3. 添加豆包账号，输入 Cookie，点击开启
4. 验证：webview 正确定位在中间栏区域
5. 在豆包页面生成图片/视频
6. 验证：右侧下载面板自动显示提取的图片/视频
7. 点击下载，验证文件保存到项目目录
8. 切换账号，验证 webview 正确切换且 Cookie 隔离
9. 折叠/展开右侧面板，验证 webview 位置同步更新
10. `cargo check` 和 `npm run typecheck` 无错误
