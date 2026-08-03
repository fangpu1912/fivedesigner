import { useCallback } from 'react'

import { listen } from '@tauri-apps/api/event'

import {
  buildProbeScript,
  buildDropdownProbeScript,
} from '@/services/doubao/autoScript'
import { DOUBAO_CHAT_URL } from '@/services/doubao/constants'
import { markNewChatCreated } from '@/services/doubaoBrowserService'
import { getDoubaoAccounts } from '@/services/doubaoQuotaService'
import { sleep } from '@/utils/async'

import { useEmbeddedBrowser } from './useEmbeddedBrowser'

// re-export 错误类型和参数接口，保持外部 import 兼容
export {
  DoubaoUploadUnsupportedError,
  DoubaoQuotaExhaustedError,
  DoubaoSessionExpiredError,
  DoubaoTimeoutError,
  type DoubaoGenerateParams,
} from '@/services/doubaoBrowserService'

/**
 * 豆包浏览器生成 Hook（UI 调试入口）
 *
 * 核心生成逻辑已抽离到 `doubaoBrowserService`，本 hook 仅保留：
 * - `containerRef` / `showBrowser` / `hideBrowser` / `reposition`：UI 调试用浏览器控制
 * - `probePage` / `probeDropdown`：页面结构探测（自动化脚本失效时调试 DOM）
 *
 * 任务队列 executor 直接调 `doubaoBrowserService.generateVideo`，不经过本 hook。
 */
export function useDoubaoBrowserGeneration() {
  const browser = useEmbeddedBrowser()

  /**
   * 探测豆包页面结构（调试用）
   *
   * 注入探测脚本，扫描页面所有可交互元素并回传。
   * 用于：自动化脚本找不到按钮时，查看页面实际 DOM 结构。
   *
   * @returns 探测结果摘要文本
   */
  const probePage = useCallback(
    async (accountId: string, switchToVideoFirst?: boolean): Promise<string> => {
      const accounts = getDoubaoAccounts()
      const account = accounts.find(a => a.id === accountId)
      if (!account) throw new Error(`豆包账号 ${accountId} 不存在`)

      // 确保 WebView 运行
      await browser.createWebview(accountId, account.url, {
        proxy: account.proxy,
        cookies: account.cookies,
      })

      // 检测是否在创作页
      let currentUrl = ''
      try {
        currentUrl = await browser.getWebviewUrlAsync(accountId)
      } catch {
        /* ignore */
      }

      const onChat = /doubao\.com\/chat/i.test(currentUrl)
      if (!onChat) {
        await browser.navigateWebview(accountId, DOUBAO_CHAT_URL)
        await sleep(3500)
      }

      // 监听探测结果（一次性）；视频模式探测需要更长超时（点击后等 2.5s 再扫描）
      return new Promise<string>((resolve, reject) => {
        let unlisten: (() => void) | null = null
        const timer = setTimeout(() => {
          if (unlisten) unlisten()
          reject(new Error('探测超时（未收到页面响应）'))
        }, switchToVideoFirst ? 20000 : 15000)

        listen<{ accountId: string; status: Record<string, unknown> }>(
          'doubao-auto-status',
          (event) => {
            if (event.payload.accountId !== accountId) return
            const status = event.payload.status || {}
            if (String(status.phase) === 'probe') {
              clearTimeout(timer)
              if (unlisten) unlisten()
              resolve(String(status.msg || '探测完成，但无内容'))
            }
          }
        ).then((fn) => {
          unlisten = fn
        })

        // 注入探测脚本
        browser.evalWebviewJs(accountId, buildProbeScript(switchToVideoFirst)).catch((err) => {
          clearTimeout(timer)
          if (unlisten) unlisten()
          reject(new Error(`注入探测脚本失败: ${err}`))
        })
      })
    },
    [browser]
  )

  /**
   * 探测比例下拉菜单（调试用）
   *
   * 点击比例按钮展开下拉菜单后，扫描所有元素并回传。
   * 用于：自动化脚本选比例失败时，查看下拉菜单实际 DOM 结构。
   *
   * @returns 探测结果摘要文本
   */
  const probeDropdown = useCallback(
    async (accountId: string): Promise<string> => {
      const accounts = getDoubaoAccounts()
      const account = accounts.find(a => a.id === accountId)
      if (!account) throw new Error(`豆包账号 ${accountId} 不存在`)

      await browser.createWebview(accountId, account.url, {
        proxy: account.proxy,
        cookies: account.cookies,
      })

      let currentUrl = ''
      try {
        currentUrl = await browser.getWebviewUrlAsync(accountId)
      } catch {
        /* ignore */
      }

      const onChat = /doubao\.com\/chat/i.test(currentUrl)
      if (!onChat) {
        await browser.navigateWebview(accountId, DOUBAO_CHAT_URL)
        await sleep(3500)
      }

      return new Promise<string>((resolve, reject) => {
        let unlisten: (() => void) | null = null
        const timer = setTimeout(() => {
          if (unlisten) unlisten()
          reject(new Error('探测超时（20秒未收到页面响应）'))
        }, 20000)

        listen<{ accountId: string; status: Record<string, unknown> }>(
          'doubao-auto-status',
          (event) => {
            if (event.payload.accountId !== accountId) return
            const status = event.payload.status || {}
            if (String(status.phase) === 'probe') {
              clearTimeout(timer)
              if (unlisten) unlisten()
              resolve(String(status.msg || '探测完成，但无内容'))
            }
          }
        ).then((fn) => {
          unlisten = fn
        })

        browser.evalWebviewJs(accountId, buildDropdownProbeScript()).catch((err) => {
          clearTimeout(timer)
          if (unlisten) unlisten()
          reject(new Error(`注入探测脚本失败: ${err}`))
        })
      })
    },
    [browser]
  )

  return {
    /** WebView 容器 ref，绑定到 UI div 以支持"眼睛"按钮显示浏览器 */
    containerRef: browser.containerRef,
    /**
     * 显示指定账号的浏览器（点击眼睛图标调用）
     * 确保 WebView 已创建 + 已导航到豆包创作页，然后显示。
     * 如果 WebView 已存在且在 chat 页面，直接显示（复用当前对话）。
     */
    showBrowser: async (accountId: string) => {
      const accounts = getDoubaoAccounts()
      const account = accounts.find(a => a.id === accountId)
      if (!account) return

      // 1. 确保 WebView 已创建（createWebview 内部去重，已存在则不重建）
      await browser.createWebview(accountId, account.url, {
        proxy: account.proxy,
        cookies: account.cookies,
      })

      // 2. 检测是否在创作页，必要时导航（不导航则复用当前对话）
      // 注意：get_webview_url 返回空字符串，需用 getWebviewUrlAsync 通过事件回传获取真实 URL
      let currentUrl = ''
      try {
        currentUrl = await browser.getWebviewUrlAsync(accountId)
      } catch { /* ignore */ }

      const onChat = /doubao\.com\/chat/i.test(currentUrl)
      if (!onChat) {
        await browser.navigateWebview(accountId, DOUBAO_CHAT_URL)
        await sleep(3500)
        // 标记今天已创建新对话，避免 generateVideo 重复创建
        markNewChatCreated(accountId)
      }

      // 3. 显示 WebView
      await browser.showWebview(accountId)
    },
    /** 隐藏指定账号的浏览器 */
    hideBrowser: (accountId: string) => browser.hideWebview(accountId),
    /** 重新定位 webview */
    reposition: browser.repositionActiveWebview,
    /** 探测豆包页面结构（调试用），返回页面 DOM 摘要 */
    probePage,
    /** 探测比例下拉菜单（调试用），点击比例按钮后扫描下拉内容 */
    probeDropdown,
  }
}
