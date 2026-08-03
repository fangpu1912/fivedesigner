import { useCallback, useEffect, useRef } from 'react'

import * as embeddedBrowserService from '@/services/embeddedBrowserService'
import logger from '@/utils/logger'

export interface BrowserTab {
  accountId: string
  name: string
  platform: string
  url: string
  isRunning: boolean
}

/**
 * 嵌入式浏览器 React Hook（UI 定位层）
 *
 * 职责：管理 webview 在 React 容器内的定位（containerRef + ResizeObserver），
 * 以及 UI 调试入口（显示/隐藏浏览器）。实际的 Tauri invoke 调用委托给
 * `embeddedBrowserService` 纯函数，与 service 共用同一套后端能力。
 *
 * 注意：webview 是 Tauri 窗口级资源，不随本 hook 卸载而销毁——
 * 这保证了任务队列后台运行时 webview 跨页面存活。
 */
export function useEmbeddedBrowser() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const repositionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeAccountIdRef = useRef<string | null>(null)

  // 定位 webview：因为 webview 是主窗口的子 webview，
  // 位置相对于主窗口内容区，直接用 container 的 rect 即可
  const updateWebviewPosition = useCallback(async (accountId: string) => {
    const container = containerRef.current
    if (!container) return

    try {
      const rect = container.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return

      await embeddedBrowserService.positionWebview(
        accountId,
        Math.round(rect.left),
        Math.round(rect.top),
        Math.round(rect.width),
        Math.round(rect.height)
      )
    } catch (error) {
      logger.error('定位 Webview 失败:', error)
    }
  }, [])

  const createWebview = useCallback(async (
    accountId: string,
    url: string,
    options?: {
      userAgent?: string
      proxy?: string
      cookies?: string
    }
  ) => {
    try {
      await embeddedBrowserService.createWebview(accountId, url, options)
      activeAccountIdRef.current = accountId

      // 延迟定位，等 webview 创建完成
      setTimeout(() => updateWebviewPosition(accountId), 500)
    } catch (error) {
      logger.error('创建 Webview 失败:', error)
      throw error
    }
  }, [updateWebviewPosition])

  const showWebview = useCallback(async (accountId: string) => {
    try {
      await embeddedBrowserService.showWebview(accountId)
      activeAccountIdRef.current = accountId
      setTimeout(() => updateWebviewPosition(accountId), 100)
    } catch (error) {
      logger.error('显示 Webview 失败:', error)
    }
  }, [updateWebviewPosition])

  const hideWebview = useCallback(async (accountId: string) => {
    try {
      await embeddedBrowserService.hideWebview(accountId)
    } catch (error) {
      logger.error('隐藏 Webview 失败:', error)
    }
  }, [])

  const closeWebview = useCallback(async (accountId: string) => {
    try {
      await embeddedBrowserService.closeWebview(accountId)
    } catch (error) {
      logger.error('关闭 Webview 失败:', error)
    }
  }, [])

  const navigateWebview = useCallback(async (accountId: string, url: string) => {
    try {
      await embeddedBrowserService.navigateWebview(accountId, url)
    } catch (error) {
      logger.error('导航 Webview 失败:', error)
    }
  }, [])

  const evalWebviewJs = useCallback(async (accountId: string, jsCode: string) => {
    try {
      await embeddedBrowserService.evalWebviewJs(accountId, jsCode)
    } catch (error) {
      logger.error('执行 JS 失败:', error)
    }
  }, [])

  const injectCookies = useCallback(async (accountId: string, cookies: string) => {
    try {
      await embeddedBrowserService.injectCookies(accountId, cookies)
    } catch (error) {
      logger.error('注入 Cookie 失败:', error)
    }
  }, [])

  const repositionActiveWebview = useCallback(() => {
    const accountId = activeAccountIdRef.current
    if (!accountId) return

    if (repositionTimerRef.current) {
      clearTimeout(repositionTimerRef.current)
    }
    repositionTimerRef.current = setTimeout(() => {
      updateWebviewPosition(accountId)
    }, 50)
  }, [updateWebviewPosition])

  /**
   * Callback ref：在 DOM 元素挂载/卸载时正确绑定/解绑 ResizeObserver
   *
   * 解决问题：Dialog 通过 Portal 渲染，打开时 containerRef.current 从 null 变为 DOM 元素，
   * 但原来的 useEffect 依赖 [repositionActiveWebview] 不会重新运行，
   * 导致 ResizeObserver 没有绑定到新 DOM 元素，窗口缩放时 WebView 位置不更新。
   */
  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    // 清理旧的 observer
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }

    containerRef.current = node

    // 绑定新的 observer
    if (node) {
      observerRef.current = new ResizeObserver(() => {
        repositionActiveWebview()
      })
      observerRef.current.observe(node)
    }
  }, [repositionActiveWebview])

  // 监听窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      repositionActiveWebview()
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [repositionActiveWebview])

  return {
    containerRef: setContainerRef,
    createWebview,
    showWebview,
    hideWebview,
    closeWebview,
    navigateWebview,
    evalWebviewJs,
    injectCookies,
    getWebviewUrlAsync: embeddedBrowserService.getWebviewUrlAsync,
    updateWebviewPosition,
    repositionActiveWebview,
  }
}
