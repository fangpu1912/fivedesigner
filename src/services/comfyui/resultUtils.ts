import type { ComfyUIClient } from './ComfyUIClient'
import type { ComfyUIHistoryItem } from './types'

export type ComfyUIMediaType = 'image' | 'video' | 'audio'

export interface ComfyUIMediaOutput {
  filename: string
  subfolder: string
  type: string
  mediaType: ComfyUIMediaType
  sourceNodeId?: string
}

interface PollComfyUIHistoryOptions {
  timeoutMs?: number
  intervalMs?: number
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'])

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getFileExtension(fileName: string): string {
  const trimmed = fileName.trim()
  const index = trimmed.lastIndexOf('.')
  if (index < 0) {
    return ''
  }
  return trimmed.slice(index + 1).toLowerCase()
}

function inferMediaType(fileName: string, fallback: ComfyUIMediaType = 'image'): ComfyUIMediaType {
  const ext = getFileExtension(fileName)
  if (VIDEO_EXTENSIONS.has(ext)) return 'video'
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio'
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  return fallback
}

function normalizeOutputItems(
  items: unknown,
  mediaType: ComfyUIMediaType,
  sourceNodeId?: string
): ComfyUIMediaOutput[] {
  if (!Array.isArray(items)) {
    return []
  }

  const result: ComfyUIMediaOutput[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue
    }

    const data = item as Record<string, unknown>
    const filename = typeof data.filename === 'string' ? data.filename : ''
    const subfolder = typeof data.subfolder === 'string' ? data.subfolder : ''
    const type = typeof data.type === 'string' ? data.type : 'output'

    if (!filename) {
      continue
    }

    result.push({
      filename,
      subfolder,
      type,
      mediaType,
      sourceNodeId,
    })
  }

  return result
}

export function extractComfyUIMediaOutputs(historyItem: ComfyUIHistoryItem): ComfyUIMediaOutput[] {
  const outputs = historyItem.outputs || {}
  const mediaOutputs: ComfyUIMediaOutput[] = []

  for (const [nodeId, output] of Object.entries(outputs)) {
    if (!output || typeof output !== 'object') {
      continue
    }

    const outputData = output as Record<string, unknown>

    // 处理 images 字段 - 需要根据文件扩展名推断类型
    if (Array.isArray(outputData.images)) {
      for (const item of normalizeOutputItems(outputData.images, 'image', nodeId)) {
        mediaOutputs.push({
          ...item,
          mediaType: inferMediaType(item.filename, 'image'),
        })
      }
    }

    // 处理 videos 字段
    mediaOutputs.push(...normalizeOutputItems(outputData.videos, 'video', nodeId))

    // 处理 audio 字段
    mediaOutputs.push(...normalizeOutputItems(outputData.audio, 'audio', nodeId))

    // 处理 files 字段
    if (Array.isArray(outputData.files)) {
      for (const file of normalizeOutputItems(outputData.files, 'image', nodeId)) {
        mediaOutputs.push({
          ...file,
          mediaType: inferMediaType(file.filename, file.mediaType),
        })
      }
    }

    // 处理 gifs 字段（某些视频输出可能在这里）
    if (Array.isArray(outputData.gifs)) {
      for (const item of normalizeOutputItems(outputData.gifs, 'video', nodeId)) {
        mediaOutputs.push({
          ...item,
          mediaType: 'video',
        })
      }
    }
  }

  return mediaOutputs
}

export function getComfyUIErrorMessage(historyItem: ComfyUIHistoryItem): string {
  const messages = historyItem.status?.messages || []

  for (const message of messages) {
    if (!Array.isArray(message) || message.length < 2) {
      continue
    }

    const [eventType, payload] = message
    if (eventType !== 'execution_error') {
      continue
    }

    if (payload && typeof payload === 'object') {
      const data = payload as Record<string, unknown>
      const exceptionMessage =
        typeof data.exception_message === 'string' ? data.exception_message : ''
      const errorMessage = typeof data.error === 'string' ? data.error : ''
      const exceptionType = typeof data.exception_type === 'string' ? data.exception_type : ''
      return exceptionMessage || errorMessage || exceptionType || 'ComfyUI execution failed'
    }

    if (typeof payload === 'string') {
      return payload
    }
  }

  return historyItem.status?.status_str || 'ComfyUI execution failed'
}

export async function pollComfyUIHistoryUntilDone(
  client: ComfyUIClient,
  promptId: string,
  options?: PollComfyUIHistoryOptions
): Promise<ComfyUIHistoryItem> {
  const timeoutMs = options?.timeoutMs ?? 1200000
  const intervalMs = options?.intervalMs ?? 1000
  const startedAt = Date.now()

  while (Date.now() - startedAt <= timeoutMs) {
    const history = await client.getHistory(promptId)
    const historyItem = history[promptId]

    if (historyItem) {
      if (historyItem.status?.completed) {
        return historyItem
      }

      if (historyItem.status?.status_str === 'error') {
        throw new Error(getComfyUIErrorMessage(historyItem))
      }
    }

    await delay(intervalMs)
  }

  throw new Error('ComfyUI generation timeout')
}
