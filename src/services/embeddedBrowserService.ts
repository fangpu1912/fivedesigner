/**
 * 嵌入式浏览器 Service（纯函数版）
 *
 * 把 `useEmbeddedBrowser` hook 里的 Tauri invoke 调用抽成纯函数，无 React 依赖。
 * 供 `doubaoBrowserService` 等非 hook 调用方使用，也供 hook 内部复用。
 *
 * 与 hook 版的区别：
 * - **不 catch 吞错**：失败时直接 throw，让上层 service 感知并处理（hook 版是 console.error 后吞掉）
 * - **不包含 containerRef/position 的 DOM 逻辑**：定位锚点需 DOM rect，由 hook 负责；
 *   本模块仅提供 `positionWebview` 纯函数供 hook 调用
 */

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export interface CreateWebviewOptions {
  userAgent?: string
  proxy?: string
  cookies?: string
}

/** 创建嵌入式 webview（Rust 侧已去重：label 存在则仅置 is_active=true，不重建） */
export async function createWebview(
  accountId: string,
  url: string,
  options?: CreateWebviewOptions
): Promise<void> {
  await invoke('create_embedded_webview', {
    accountId,
    url,
    userAgent: options?.userAgent || null,
    proxy: options?.proxy || null,
    cookies: options?.cookies || null,
  })
}

/** 显示 webview（移回可视区） */
export async function showWebview(accountId: string): Promise<void> {
  await invoke('show_webview', { accountId })
}

/** 隐藏 webview（移到 -9999,-9999 并缩到 1x1；eval_webview_js 仍生效） */
export async function hideWebview(accountId: string): Promise<void> {
  await invoke('hide_webview', { accountId })
}

/** 关闭并销毁 webview */
export async function closeWebview(accountId: string): Promise<void> {
  await invoke('close_embedded_webview', { accountId })
}

/** 导航 webview 到指定 URL */
export async function navigateWebview(accountId: string, url: string): Promise<void> {
  await invoke('navigate_webview', { accountId, url })
}

/**
 * 在 webview 中执行 JS 代码
 * 注意：Tauri 的 webview.eval 不返回 JS 执行结果，结果回传走 IPC
 * （JS 内 __TAURI_INTERNALS__.invoke → 后端 emit → 前端 listen）
 */
export async function evalWebviewJs(accountId: string, jsCode: string): Promise<void> {
  await invoke('eval_webview_js', { accountId, jsCode })
}

/** 注入 Cookie 到 webview */
export async function injectCookies(accountId: string, cookies: string): Promise<void> {
  await invoke('inject_cookies_to_webview', { accountId, cookies })
}

/** 获取 webview 当前 URL */
export async function getWebviewUrl(accountId: string): Promise<string> {
  return invoke<string>('get_webview_url', { accountId })
}

/**
 * 获取 webview 当前 URL（异步事件回调式，可靠版）
 *
 * `get_webview_url` 命令返回空字符串，实际 URL 通过 `webview-url-changed` 事件回传。
 * 本方法监听该事件并等待回传，确保拿到真实 URL。
 * 用于判断是否已在豆包创作页（避免重复导航创建新对话）。
 */
export async function getWebviewUrlAsync(accountId: string, timeoutMs = 3000): Promise<string> {
  return new Promise((resolve) => {
    let unlisten: (() => void) | null = null
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null
    let resolved = false

    const cleanup = () => {
      if (unlisten) unlisten()
      if (timeoutTimer) clearTimeout(timeoutTimer)
    }

    const finish = (url: string) => {
      if (resolved) return
      resolved = true
      cleanup()
      resolve(url)
    }

    // 监听 webview-url-changed 事件
    listen<{ url: string }>('webview-url-changed', (event) => {
      finish(event.payload.url)
    }).then((fn) => {
      unlisten = fn
    })

    // 超时返回空字符串（降级为导航）
    timeoutTimer = setTimeout(() => finish(''), timeoutMs)

    // 触发 report_url 事件
    invoke('get_webview_url', { accountId }).catch(() => {})
  })
}

/** 定位 webview（基于主窗口内容区坐标，供 hook 的 updateWebviewPosition 调用） */
export async function positionWebview(
  accountId: string,
  x: number,
  y: number,
  width: number,
  height: number
): Promise<void> {
  await invoke('position_webview', { accountId, x, y, width, height })
}
