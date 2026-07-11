import { useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'

export interface BrowserTab {
  accountId: string
  name: string
  platform: string
  url: string
  isRunning: boolean
}

export function useEmbeddedBrowser() {
  const containerRef = useRef<HTMLDivElement>(null)
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

      await invoke('position_webview', {
        accountId,
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      })
    } catch (error) {
      console.error('定位 Webview 失败:', error)
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
      await invoke('create_embedded_webview', {
        accountId,
        url,
        userAgent: options?.userAgent || null,
        proxy: options?.proxy || null,
        cookies: options?.cookies || null,
      })

      activeAccountIdRef.current = accountId

      // 延迟定位，等 webview 创建完成
      setTimeout(() => updateWebviewPosition(accountId), 500)
    } catch (error) {
      console.error('创建 Webview 失败:', error)
      throw error
    }
  }, [updateWebviewPosition])

  const showWebview = useCallback(async (accountId: string) => {
    try {
      await invoke('show_webview', { accountId })
      activeAccountIdRef.current = accountId
      setTimeout(() => updateWebviewPosition(accountId), 100)
    } catch (error) {
      console.error('显示 Webview 失败:', error)
    }
  }, [updateWebviewPosition])

  const hideWebview = useCallback(async (accountId: string) => {
    try {
      await invoke('hide_webview', { accountId })
    } catch (error) {
      console.error('隐藏 Webview 失败:', error)
    }
  }, [])

  const closeWebview = useCallback(async (accountId: string) => {
    try {
      await invoke('close_embedded_webview', { accountId })
    } catch (error) {
      console.error('关闭 Webview 失败:', error)
    }
  }, [])

  const navigateWebview = useCallback(async (accountId: string, url: string) => {
    try {
      await invoke('navigate_webview', { accountId, url })
    } catch (error) {
      console.error('导航 Webview 失败:', error)
    }
  }, [])

  const evalWebviewJs = useCallback(async (accountId: string, jsCode: string) => {
    try {
      await invoke('eval_webview_js', { accountId, jsCode })
    } catch (error) {
      console.error('执行 JS 失败:', error)
    }
  }, [])

  const injectCookies = useCallback(async (accountId: string, cookies: string) => {
    try {
      await invoke('inject_cookies_to_webview', { accountId, cookies })
    } catch (error) {
      console.error('注入 Cookie 失败:', error)
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

  // 监听容器大小变化
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => {
      repositionActiveWebview()
    })

    observer.observe(container)
    return () => observer.disconnect()
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
    containerRef,
    createWebview,
    showWebview,
    hideWebview,
    closeWebview,
    navigateWebview,
    evalWebviewJs,
    injectCookies,
    updateWebviewPosition,
    repositionActiveWebview,
  }
}
