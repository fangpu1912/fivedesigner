/**
 * 抖音作品下载服务
 * - 通过 http_request Tauri 命令调用抖音 web API(绕 CORS)
 * - 通过 Web Worker 生成 a_bogus 签名
 * - 通过 saveMediaFile 保存到正确的项目/剧集子目录
 */
import { invoke } from '@tauri-apps/api/core'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'

import { douyinSigner } from './douyinSigner'
import type { DouyinFetchResult, DouyinWorkItem, DouyinDownloadOptions } from '@/types/douyin'
import { saveMediaFile } from '@/utils/mediaStorage'

const LIST_API = 'https://www.douyin.com/aweme/v1/web/aweme/post/'
export const DOUYIN_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
const REFERER = 'https://www.douyin.com/'

const MAX_REQUESTS = 20
const MAX_ITEMS = 1000

/** 固定设备参数(参考 acquire.py) */
function buildDeviceParams(secUserId: string, cursor: number, msToken: string): Record<string, string | number | boolean> {
  return {
    sec_user_id: secUserId,
    max_cursor: cursor,
    count: 100,
    cut_version: 1,
    publish_video_strategy_type: 2,
    source: 'page',
    device_platform: 'webapp',
    aid: 6383,
    channel: 'channel_pc_web',
    pc_client_type: 1,
    version_code: 170400,
    version_name: '17.4.0',
    cookie_enabled: true,
    screen_width: 1536,
    screen_height: 864,
    browser_language: 'zh-CN',
    browser_platform: 'Win32',
    browser_name: 'Chrome',
    browser_version: '123.0.0.0',
    browser_online: true,
    engine_name: 'Blink',
    engine_version: '123.0.0.0',
    os_name: 'Windows',
    os_version: '10',
    cpu_core_num: 16,
    device_memory: 8,
    platform: 'PC',
    downlink: 10,
    effective_type: '4g',
    round_trip_time: 50,
    msToken,
  }
}

/** 从主页 URL 或纯 sec_user_id 提取 sec_user_id */
export function extractSecUserId(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  // 直接是 sec_user_id(以 MS4w 开头)
  if (/^MS4w[A-Za-z0-9_-]+$/.test(trimmed)) return trimmed
  // URL 形式 https://www.douyin.com/user/MS4w...
  const match = trimmed.match(/\/user\/([^/?#]+)/)
  if (match) return match[1] || ''
  return ''
}

/** 生成 fake msToken(107 位随机字母数字) */
export function generateFakeMsToken(size = 107): string {
  const base = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < size; i++) {
    s += base.charAt(Math.floor(Math.random() * base.length))
  }
  return s
}

/** 文件名净化:替换非法字符 */
export function sanitizeFileName(name: string): string {
  return (name || '').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 80) || 'unnamed'
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 从 cookie 字符串中提取 msToken(若有) */
function extractMsTokenFromCookie(cookie: string): string | null {
  const match = cookie.match(/msToken=([^;]+)/)
  return match ? match[1] || null : null
}

/** 调用抖音 API 获取一页作品,返回原始 JSON */
async function requestOnePage(
  secUserId: string,
  cursor: number,
  cookie: string,
): Promise<any> {
  const realMsToken = extractMsTokenFromCookie(cookie)
  const msToken = realMsToken || generateFakeMsToken()
  const params = buildDeviceParams(secUserId, cursor, msToken)

  // 签名输入:未编码的 k=v&k=v 串(等价 Python 的 unquote(urlencode(query)))
  const queryForSign = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join('&')

  const aBogus = await douyinSigner.sign(queryForSign, DOUYIN_UA)
  params.a_bogus = aBogus

  // 构造最终 URL(编码)
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    search.set(k, String(v))
  }
  const url = `${LIST_API}?${search.toString()}`

  const result = await invoke<{
    success: boolean
    status: number
    headers: Record<string, string>
    body: string
    error?: string
  }>('http_request', {
    request: {
      url,
      method: 'GET',
      headers: {
        'User-Agent': DOUYIN_UA,
        Referer: REFERER,
        Cookie: cookie || '',
      },
      timeout: 30000,
    },
  })

  if (!result.success) {
    throw new Error(`抖音 API 请求失败: ${result.error || `status=${result.status}`}`)
  }

  try {
    return JSON.parse(result.body)
  } catch {
    throw new Error('抖音 API 返回非 JSON 响应,可能是接口失效或 Cookie 失效')
  }
}

/** 解析单个 aweme 为 DouyinWorkItem */
function parseAweme(item: any): DouyinWorkItem | null {
  if (!item) return null
  const awemeId = item.aweme_id
  if (!awemeId) return null

  const desc = typeof item.desc === 'string' ? item.desc : ''
  const createTime = Number(item.create_time) || 0
  const authorUid = item.author?.uid || ''
  const authorNickname = item.author?.nickname || '未知账号'

  // 图集
  if (Array.isArray(item.images) && item.images.length > 0) {
    const images = item.images
      .map((img: any) => ({
        url: img?.url_list?.[0] || '',
        width: Number(img?.width) || 0,
        height: Number(img?.height) || 0,
      }))
      .filter((img: any) => img.url)
    if (images.length === 0) return null
    return {
      awemeId,
      type: 'image',
      desc,
      createTime,
      authorUid,
      authorNickname,
      images,
      coverUrl: images[0].url,
      width: images[0].width,
      height: images[0].height,
    }
  }

  // 视频
  const video = item.video
  if (video) {
    const videoUrl = video?.play_addr?.url_list?.[0] || ''
    if (!videoUrl) return null
    return {
      awemeId,
      type: 'video',
      desc,
      createTime,
      authorUid,
      authorNickname,
      videoUrl,
      coverUrl: video?.cover?.url_list?.[0] || '',
      width: Number(video.width) || 0,
      height: Number(video.height) || 0,
    }
  }

  return null
}

/**
 * 获取账号全部作品(分页拉取)
 * @param secUserId sec_user_id
 * @param cookie 抖音 Cookie 字符串(可为空,公开作品用 fake msToken)
 * @param onProgress 每页拉取后回调当前累计数量
 */
export async function fetchDouyinWorks(
  secUserId: string,
  cookie: string,
  onProgress?: (count: number) => void,
): Promise<DouyinFetchResult> {
  const items: DouyinWorkItem[] = []
  let cursor = 0
  let hasMore = true
  let nickname = ''
  let requestCount = 0
  let retryCount = 0
  const maxRetries = 3

  while (hasMore && requestCount < MAX_REQUESTS && items.length < MAX_ITEMS) {
    requestCount++
    let data: any
    try {
      data = await requestOnePage(secUserId, cursor, cookie)
    } catch (err) {
      retryCount++
      if (retryCount >= maxRetries) {
        throw new Error(`获取作品列表失败: ${(err as Error).message}`)
      }
      await delay(1500 + retryCount * 1000)
      continue
    }
    retryCount = 0

    const statusCode = data.status_code ?? 0
    if (statusCode !== 0) {
      const statusMsg = data.status_msg || ''
      if (statusCode === 5) {
        // 临时异常,重试
        retryCount++
        if (retryCount >= maxRetries) break
        await delay(1500 + retryCount * 1000)
        continue
      }
      if (statusMsg.includes('私密账号')) {
        throw new Error('该账号为私密账号,需要登录后的 Cookie 且关注该账号')
      }
      throw new Error(`抖音 API 异常(status_code=${statusCode}): ${statusMsg}`)
    }

    const oldCursor = cursor
    cursor = data.max_cursor ?? 0
    hasMore = !!data.has_more

    const awemeList: any[] = data.aweme_list || []
    for (const aweme of awemeList) {
      const parsed = parseAweme(aweme)
      if (parsed) {
        if (!nickname && parsed.authorNickname) nickname = parsed.authorNickname
        items.push(parsed)
      }
    }

    onProgress?.(items.length)

    // cursor 未更新则停止
    if (cursor === oldCursor && requestCount > 1) {
      hasMore = false
    }

    if (hasMore) {
      await delay(800 + Math.random() * 700)
    }
  }

  return { items, hasMore, maxCursor: cursor, nickname }
}

/** 下载单个文件(图集的一张图 或 一个视频),返回保存的绝对路径 */
export async function downloadDouyinFile(url: string, opts: DouyinDownloadOptions): Promise<string> {
  if (!url) throw new Error('下载地址为空')

  // 通过 Tauri HTTP 下载文件数据（绕 CORS，带 Referer 和 Cookie）
  const headers: Record<string, string> = {
    'Accept': opts.mediaType === 'video' ? 'video/*,*/*' : 'image/*,*/*',
    'Referer': REFERER,
    'User-Agent': DOUYIN_UA,
  }
  if (opts.cookie) {
    headers['Cookie'] = opts.cookie
  }

  const response = await tauriFetch(url, {
    method: 'GET',
    headers,
  })

  if (!response.ok) {
    throw new Error(`下载失败: HTTP ${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const uint8Data = new Uint8Array(arrayBuffer)

  // 使用 saveMediaFile 保存到正确的项目/剧集子目录
  const savePath = await saveMediaFile(uint8Data, {
    projectId: opts.projectId,
    episodeId: opts.episodeId || '',
    type: opts.mediaType === 'video' ? 'video' : 'image',
    fileName: opts.fileName,
  })

  return savePath
}
