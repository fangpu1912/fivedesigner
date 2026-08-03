/**
 * 豆包浏览器生成 Service（核心业务层）
 *
 * 从 `useDoubaoBrowserGeneration` hook 抽离的纯逻辑层，无 React 依赖。
 * 供任务队列 executor 和 hook 共同调用。
 *
 * 依赖：
 * - `embeddedBrowserService`：webview 的 invoke 封装（创建/导航/eval/隐藏）
 * - `doubaoQuotaService`：配额管理（账号轮换/消费/落库）
 *
 * 核心导出：`generateVideo(params, signal)` —— 顶层入口，内部完成账号轮换 + 生成 + 保存。
 * 返回本地视频文件绝对路径（saveMediaFile 已内置）。
 */

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

import {
  buildAutoScript,
  buildPollStatusScript,
  buildClearScript,
  buildErrorCheckScript,
} from '@/services/doubao/autoScript'
import { DOUBAO_CHAT_URL } from '@/services/doubao/constants'
import { sleep } from '@/utils/async'
import { imagePathToBase64 } from '@/utils/imageUtils'
import logger from '@/utils/logger'
import { saveMediaFile } from '@/utils/mediaStorage'

import * as doubaoQuotaService from './doubaoQuotaService'
import { getDoubaoAccounts } from './doubaoQuotaService'
import * as embeddedBrowserService from './embeddedBrowserService'

// ==================== 错误类型 ====================

/** 图片上传不被支持（DataTransfer + paste 均失败） */
export class DoubaoUploadUnsupportedError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'DoubaoUploadUnsupportedError'
  }
}

/** 豆包网页返回配额不足 */
export class DoubaoQuotaExhaustedError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'DoubaoQuotaExhaustedError'
  }
}

/** 登录态过期 */
export class DoubaoSessionExpiredError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'DoubaoSessionExpiredError'
  }
}

/** 单条生成超时 */
export class DoubaoTimeoutError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'DoubaoTimeoutError'
  }
}

// ==================== 类型定义 ====================

export interface DoubaoGenerateParams {
  prompt: string
  firstFrame?: string
  lastFrame?: string
  referenceImages?: string[]
  /** 目标比例（如 '9:16'），传给自动化脚本用于选比例 */
  aspectRatio?: string
  /** 目标时长（秒，5 或 10），传给自动化脚本用于选时长 */
  duration?: number
  /** 目标模型关键词（如 'fast' / 'mini'），传给自动化脚本用于选模型 */
  model?: string
  projectId?: string
  episodeId?: string
  /** 优先账号 ID；若该账号配额耗尽则自动轮换 */
  preferAccountId?: string
  onProgress?: (info: {
    phase: string
    accountId: string
    msg?: string
  }) => void
}

// ==================== 工具函数 ====================

/** 模块级串行化：同一账号同时只允许一个生成任务 */
const accountLocks = new Map<string, Promise<unknown>>()

/** 每个账号最后创建新对话的日期（'YYYY-MM-DD'），实现"每天一个新对话"策略 */
const lastNewChatDateMap = new Map<string, string>()

/** 标记某账号今天已创建新对话（供 showBrowser 等外部调用同步状态） */
export function markNewChatCreated(accountId: string): void {
  const today = new Date().toISOString().slice(0, 10)
  lastNewChatDateMap.set(accountId, today)
}
function withAccountLock<T>(accountId: string, fn: () => Promise<T>): Promise<T> {
  const prev = accountLocks.get(accountId) || Promise.resolve()
  const result = prev.then(fn, fn)
  // 失败也不能阻塞后续任务，catch 后返回 undefined
  accountLocks.set(accountId, result.catch(() => undefined))
  return result
}

// ==================== 核心生成逻辑 ====================

/**
 * 准备阶段：createWebview → 导航 → 清理 → 注入脚本 → 等待手动发送 → 清理缓冲
 *
 * 在同账号串行锁内调用，完成后继续执行 waitAndSaveWithAccount（不释放锁），
 * 保证同一账号的 prepare + wait + save 全程原子化，避免视频/错误匹配错乱。
 * @returns submitToken 用于全链路追踪
 */
async function prepareWithAccount(
  accountId: string,
  params: {
    prompt: string
    imageBase64List: string[]
    aspectRatio?: string
    duration?: number
    model?: string
    projectId?: string
    episodeId?: string
    onProgress?: DoubaoGenerateParams['onProgress']
    signal?: AbortSignal
  }
): Promise<string> {
  const { prompt, imageBase64List, aspectRatio, duration, model, onProgress, signal } = params
  const report = (phase: string, msg?: string) =>
    onProgress?.({ phase, accountId, msg })

  // 1. 获取账号信息
  const accounts = getDoubaoAccounts()
  const account = accounts.find(a => a.id === accountId)
  if (!account) throw new Error(`豆包账号 ${accountId} 不存在`)

  // 2. 确保 WebView 运行（createWebview 内部已做去重，已存在则直接返回）
  report('starting', `启动账号 ${account.name}...`)
  await embeddedBrowserService.createWebview(accountId, account.url, {
    proxy: account.proxy,
    cookies: account.cookies,
  })
  // 不主动隐藏 webview，由 UI 层（StoryboardDraw 弹窗）控制显示/隐藏

  // 3. 检测当前页面，按"每天一个新对话"策略导航
  // 注意：getWebviewUrl 返回空字符串，需用 getWebviewUrlAsync 通过事件回传获取真实 URL
  // 否则 currentUrl 永远为空 → onChat 永远 false → 每次都导航 → 每次都创建新对话
  let currentUrl = ''
  try {
    currentUrl = await embeddedBrowserService.getWebviewUrlAsync(accountId)
  } catch {
    // 忽略，稍后重试
  }

  const onChat = /doubao\.com\/chat/i.test(currentUrl)
  const needsLogin = /login|signin|passport|sso/i.test(currentUrl) && !onChat

  if (needsLogin) {
    throw new DoubaoSessionExpiredError(`账号 ${account.name} 未登录或登录已过期`)
  }

  // 每天一个新对话策略：新的一天导航到 chat 创建新对话，同一天复用当前对话
  const today = new Date().toISOString().slice(0, 10)
  const lastNewChatDate = lastNewChatDateMap.get(accountId)
  const isNewDay = lastNewChatDate !== today

  if (isNewDay || !onChat) {
    report('navigating', isNewDay ? '创建今日新对话...' : '导航到豆包创作页...')
    await embeddedBrowserService.navigateWebview(accountId, DOUBAO_CHAT_URL)
    await sleep(3500) // 等页面加载
    lastNewChatDateMap.set(accountId, today)
  }

  // 4. 清理残留媒体（防止上条视频误匹配）
  await embeddedBrowserService.evalWebviewJs(accountId, buildClearScript())
  await sleep(500)

  // 5. 注入自动化脚本
  const submitToken = `${accountId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  report('filling', '切换视频模式并填写提示词...')
  await embeddedBrowserService.evalWebviewJs(
    accountId,
    buildAutoScript({ prompt, imageBase64List, submitToken, aspectRatio, duration, model })
  )

  // 6. 轮询状态，等待用户手动发送（waiting_manual_send / submitted）
  await waitForSubmitted(
    accountId,
    submitToken,
    doubaoQuotaService.getConfig().perItemTimeoutMs,
    report,
    signal
  )

  // 7. 提交后再次清空媒体缓冲（防止 submitted 前捕获的旧视频/对话历史视频污染）
  // submitted 后新视频要 1-3 分钟才出来，此时清空安全，不会清掉新视频
  report('detecting', '清空旧视频缓冲，等待新视频生成...')
  await embeddedBrowserService.evalWebviewJs(accountId, buildClearScript())
  await sleep(300)

  return submitToken
}

/**
 * 等待视频阶段：waitForVideo → saveMediaFile
 *
 * 在同账号串行锁内调用，同一账号同一时刻只有一个 waitForVideo 在等待，
 * 确保捕获的视频与提交的 prompt 一一对应。
 */
async function waitAndSaveWithAccount(
  accountId: string,
  params: {
    projectId?: string
    episodeId?: string
    submitToken?: string
    onProgress?: DoubaoGenerateParams['onProgress']
    signal?: AbortSignal
  }
): Promise<string> {
  const { projectId, episodeId, submitToken, onProgress, signal } = params
  const report = (phase: string, msg?: string) =>
    onProgress?.({ phase, accountId, msg })

  // 8. 等待视频（media-extracted 事件 + 错误检测）
  report('submitted', '等待豆包生成视频（约 1-3 分钟）...')
  const videoUrl = await waitForVideo(
    accountId,
    doubaoQuotaService.getConfig().perItemTimeoutMs,
    signal,
    submitToken
  )

  // 取消守卫：保存前再检查一次
  if (signal?.aborted) throw new Error('用户取消了生成')

  // 9. 保存无水印视频到本地
  report('saving', '保存视频到本地...')
  const localPath = await saveMediaFile(videoUrl, {
    projectId: projectId || '',
    episodeId: episodeId || '',
    type: 'video',
    extension: 'mp4',
    fileName: `doubao_${accountId}_${submitToken ? submitToken.slice(-8) : Date.now()}.mp4`,
  })

  const accounts = getDoubaoAccounts()
  const account = accounts.find(a => a.id === accountId)
  logger.info(
    `[DoubaoBrowserService] 账号 ${account?.name} 生成成功 (token=${submitToken?.slice(-8) || 'N/A'}): ${localPath}`
  )
  return localPath
}

// ==================== 顶层入口 ====================

/**
 * 豆包视频生成入口（账号轮换 + 生成 + 保存）
 *
 * 流程：
 * 1. 校验提示词
 * 2. 收集图片转 base64
 * 3. 确保配额已加载
 * 4. 账号轮换循环：getAvailableAccount → withAccountLock(generateWithAccount)
 *    - 成功：consume + flush，返回本地路径
 *    - 失败按错误类型处理（markBroken / 跳过 / consume 同步）
 *
 * @param params 生成参数
 * @param signal AbortSignal，取消时立即 reject
 * @returns 本地视频文件绝对路径
 */
export async function generateVideo(
  params: DoubaoGenerateParams,
  signal?: AbortSignal
): Promise<string> {
  const {
    prompt,
    firstFrame,
    lastFrame,
    referenceImages,
    aspectRatio,
    duration,
    model,
    projectId,
    episodeId,
    preferAccountId,
    onProgress,
  } = params

  if (!prompt?.trim()) {
    throw new Error('提示词不能为空')
  }

  // 取消前置检查
  if (signal?.aborted) throw new Error('用户取消了生成')

  // 确保配额已加载（service 懒加载守卫，幂等）
  await doubaoQuotaService.load()

  // 收集所有图片（首帧 + 尾帧 + 参考图）转 base64
  const allImagePaths = [
    firstFrame,
    lastFrame,
    ...(referenceImages || []),
  ].filter((p): p is string => !!p)

  const imageBase64List: string[] = []
  for (const imgPath of allImagePaths) {
    if (signal?.aborted) throw new Error('用户取消了生成')
    try {
      const b64 = await imagePathToBase64(imgPath)
      if (b64) imageBase64List.push(b64)
    } catch (err) {
      logger.warn(`[DoubaoBrowserService] 图片转 base64 失败: ${imgPath}`, err)
    }
  }

  // 账号轮换循环
  let lastError: Error | null = null
  const triedAccounts = new Set<string>()
  const maxAttempts = getDoubaoAccounts().length || 1

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) throw new Error('用户取消了生成')

    // 选择可用账号（优先 preferAccountId，若已尝试过则轮换）
    const prefer = preferAccountId && !triedAccounts.has(preferAccountId)
      ? preferAccountId
      : undefined
    const accountId = doubaoQuotaService.getAvailableAccount(prefer)
    if (!accountId) {
      throw new Error(
        lastError?.message || '所有豆包账号均不可用（配额耗尽或未登录）'
      )
    }
    triedAccounts.add(accountId)

    try {
      // 同账号全程串行（prepare + wait + save 原子化）
      // 保证同一账号同一时刻只有一个任务在执行，避免视频/错误匹配错乱
      // 跨账号仍通过 accountLock 天然并行
      const result = await withAccountLock(accountId, async () => {
        const submitToken = await prepareWithAccount(accountId, {
          prompt,
          imageBase64List,
          aspectRatio,
          duration,
          model,
          projectId,
          episodeId,
          onProgress,
          signal,
        })
        return waitAndSaveWithAccount(accountId, {
          projectId,
          episodeId,
          submitToken,
          onProgress,
          signal,
        })
      })

      // 成功：消费配额并落库
      doubaoQuotaService.consume(accountId)
      await doubaoQuotaService.flush()
      return result
    } catch (err) {
      lastError = err as Error
      logger.warn(
        `[DoubaoBrowserService] 账号 ${accountId} 生成失败:`,
        (err as Error)?.message
      )

      if (err instanceof DoubaoUploadUnsupportedError) {
        // 标记不支持自动上传，后续跳过
        doubaoQuotaService.markBroken(accountId)
      } else if (err instanceof DoubaoSessionExpiredError) {
        // 登录过期，不消费配额，跳过该账号
        onProgress?.({
          phase: 'error',
          accountId,
          msg: `账号未登录，已跳过`,
        })
      } else if (err instanceof DoubaoQuotaExhaustedError) {
        // 网页端配额不足，强制 consume 一次使本地配额同步
        doubaoQuotaService.consume(accountId)
      }
      // DoubaoTimeoutError / 用户取消 / 其他错误：不消费配额，继续轮换
      // 用户取消时直接抛出，不再轮换
      if (signal?.aborted) throw err
      continue
    }
  }

  throw lastError || new Error('所有豆包账号均不可用')
}

// ==================== 内部等待函数 ====================

/**
 * 等待自动化脚本进入 submitted 状态
 * 通过 listen('doubao-auto-status') + 周期性 eval(buildPollStatusScript) 双保险
 * 支持 AbortSignal 取消 + 错误检测
 */
function waitForSubmitted(
  accountId: string,
  expectedToken: string,
  timeoutMs: number,
  report: (phase: string, msg?: string) => void,
  signal?: AbortSignal
): Promise<number> {
  return new Promise((resolve, reject) => {
    let unlisten: (() => void) | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null
    let done = false

    const cleanup = () => {
      if (unlisten) unlisten()
      if (pollTimer) clearInterval(pollTimer)
      if (timeoutTimer) clearTimeout(timeoutTimer)
    }

    const finish = (fn: () => void) => {
      if (done) return
      done = true
      cleanup()
      fn()
    }

    // 取消检测
    if (signal) {
      if (signal.aborted) {
        finish(() => reject(new Error('用户取消了生成')))
        return
      }
      signal.addEventListener('abort', () => {
        finish(() => reject(new Error('用户取消了生成')))
      })
    }

    // 超时
    timeoutTimer = setTimeout(() => {
      finish(() => reject(new DoubaoTimeoutError('等待豆包提交状态超时')))
    }, timeoutMs)

    // 监听状态事件
    listen<{ accountId: string; status: Record<string, unknown> }>(
      'doubao-auto-status',
      (event) => {
        if (event.payload.accountId !== accountId) return
        const status = event.payload.status || {}
        const phase = String(status.phase || '')
        const msg = String(status.msg || '')
        const token = String(status.token || '')
        report(phase, msg)

        if ((phase === 'submitted' || phase === 'waiting_manual_send') && token === expectedToken) {
          const submittedAt = Number(status.submittedAt) || Date.now()
          finish(() => resolve(submittedAt))
        } else if (phase === 'error') {
          finish(() => {
            if (msg.includes('不支持自动上传')) {
              reject(new DoubaoUploadUnsupportedError(msg))
            } else if (msg.includes('未登录') || msg.includes('登录')) {
              reject(new DoubaoSessionExpiredError(msg))
            } else if (msg.includes('配额') || msg.includes('限额')) {
              reject(new DoubaoQuotaExhaustedError(msg))
            } else {
              reject(new Error(msg || '豆包自动化失败'))
            }
          })
        }
      }
    ).then((fn) => {
      unlisten = fn
    })

    // 周期性触发状态回传（eval 不能返回结果，靠脚本内 invoke 回传）
    pollTimer = setInterval(() => {
      if (signal?.aborted) {
        finish(() => reject(new Error('用户取消了生成')))
        return
      }
      invoke('eval_webview_js', {
        accountId,
        jsCode: buildPollStatusScript(),
      }).catch(() => {
        // 忽略轮询错误
      })
    }, 2000)
  })
}

/**
 * 等待无水印视频 URL
 * 通过 listen('media-extracted') + 主动轮询 poll_extracted_media 双保险
 * 匹配条件：accountId 一致 + mediaType==='video' + 有 no_watermark_url
 *
 * 支持：
 * - AbortSignal 取消（用户取消时立即 reject）
 * - 错误检测（每 3s 注入 buildErrorCheckScript，检测"肖像保护"等错误消息）
 */
function waitForVideo(
  accountId: string,
  timeoutMs: number,
  signal?: AbortSignal,
  submitToken?: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    let unlisten: (() => void) | null = null
    let unlistenError: (() => void) | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let errorCheckTimer: ReturnType<typeof setInterval> | null = null
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null
    let done = false
    const processedUrls = new Set<string>()

    const cleanup = () => {
      if (unlisten) unlisten()
      if (unlistenError) unlistenError()
      if (pollTimer) clearInterval(pollTimer)
      if (errorCheckTimer) clearInterval(errorCheckTimer)
      if (timeoutTimer) clearTimeout(timeoutTimer)
    }

    const finish = (fn: () => void) => {
      if (done) return
      done = true
      cleanup()
      fn()
    }

    // 取消检测
    if (signal) {
      if (signal.aborted) {
        finish(() => reject(new Error('用户取消了生成')))
        return
      }
      signal.addEventListener('abort', () => {
        finish(() => reject(new Error('用户取消了生成')))
      })
    }

    // 超时（视频生成通常 1-3 分钟，给足时间）
    timeoutTimer = setTimeout(() => {
      finish(() => reject(new DoubaoTimeoutError('等待视频生成超时')))
    }, timeoutMs)

    // 监听媒体提取事件
    interface MediaPayload {
      accountId: string
      mediaType: string
      data: unknown
    }
    listen<MediaPayload>('media-extracted', (event) => {
      if (done) return
      const payload = event.payload
      if (payload.accountId !== accountId) return
      if (payload.mediaType !== 'video') return

      const items = Array.isArray(payload.data) ? payload.data : [payload.data]
      for (const item of items) {
        const d = item as Record<string, unknown>
        const url = String(d.no_watermark_url || '')
        if (!url || processedUrls.has(url)) continue
        processedUrls.add(url)
        logger.info(
          `[DoubaoBrowserService] 捕获到视频 (token=${submitToken?.slice(-8) || 'N/A'}, 账号=${accountId}): ${url.substring(0, 80)}...`
        )
        finish(() => resolve(url))
        return
      }
    }).then((fn) => {
      unlisten = fn
    })

    // 监听错误检测事件（豆包返回错误消息如"肖像保护"）
    listen<{ accountId: string; status: Record<string, unknown> }>(
      'doubao-auto-status',
      (event) => {
        if (done) return
        if (event.payload.accountId !== accountId) return
        const status = event.payload.status || {}
        const phase = String(status.phase || '')
        const msg = String(status.msg || '')
        const token = String(status.token || '')
        // 只处理 error-check 来源的错误（避免和 submitted 阶段冲突）
        if (phase === 'error' && token === 'error-check') {
          logger.warn(`[DoubaoBrowserService] 检测到豆包错误: ${msg}`)
          finish(() => reject(new Error(msg)))
        }
      }
    ).then((fn) => {
      unlistenError = fn
    })

    // 主动轮询 __EXTRACTED_MEDIA__ 缓冲（兜底，防止事件丢失）
    pollTimer = setInterval(() => {
      if (signal?.aborted) {
        finish(() => reject(new Error('用户取消了生成')))
        return
      }
      invoke('poll_extracted_media', { accountId }).catch(() => {
        // 忽略轮询错误（webview 可能已关闭）
      })
    }, 2000)

    // 每 3s 注入错误检测脚本（检测"肖像保护"、"内容违规"等错误消息）
    errorCheckTimer = setInterval(() => {
      if (signal?.aborted) {
        finish(() => reject(new Error('用户取消了生成')))
        return
      }
      invoke('eval_webview_js', {
        accountId,
        jsCode: buildErrorCheckScript(),
      }).catch(() => {
        // 忽略错误（webview 可能已关闭）
      })
    }, 3000)
  })
}
