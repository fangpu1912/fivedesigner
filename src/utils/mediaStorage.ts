import { join } from '@tauri-apps/api/path'
import { writeFile, mkdir, exists } from '@tauri-apps/plugin-fs'
import { fetch } from '@tauri-apps/plugin-http'

import { workspaceService } from '@/services/workspace/WorkspaceService'

export type MediaType =
  | 'image'
  | 'character'
  | 'scene'
  | 'prop'
  | 'storyboard'
  | 'video'
  | 'audio'
  | 'voice'

export interface SaveMediaOptions {
  projectId: string
  episodeId: string
  type: MediaType
  fileName?: string
  extension?: string
}

/**
 * 将 Data URL 或远程 URL 转换为 Uint8Array
 */
export async function urlToUint8Array(url: string): Promise<Uint8Array> {
  // 如果是 Data URL
  if (url.startsWith('data:')) {
    let base64 = url.split(',')[1]
    if (!base64) throw new Error('Invalid data URL')
    // 移除所有非 base64 字符（空格、换行符等）
    base64 = base64.replace(/[^A-Za-z0-9+/=]/g, '')
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }

  // 如果是远程 URL，使用 Tauri HTTP 插件下载（绕过 CORS）
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      // 使用 Tauri 的 HTTP 插件，不受浏览器 CORS 限制
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'image/*,*/*',
        },
      })
      if (!response.ok) {
        throw new Error(`Failed to download: ${response.status}`)
      }
      const arrayBuffer = await response.arrayBuffer()
      return new Uint8Array(arrayBuffer)
    } catch (error) {
      console.error('[urlToUint8Array] Tauri fetch failed, trying browser fetch:', error)
      // 如果 Tauri fetch 失败，尝试浏览器 fetch（可能会受 CORS 限制）
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Failed to download: ${response.status}`)
      }
      const blob = await response.blob()
      const arrayBuffer = await blob.arrayBuffer()
      return new Uint8Array(arrayBuffer)
    }
  }

  throw new Error('Unsupported URL format')
}

/**
 * 保存媒体文件到本地（对象参数版本）
 * @param data 文件数据 (Data URL, 远程 URL, 或 Uint8Array)
 * @param options 保存选项
 * @returns 绝对路径
 */
export async function saveMediaFile(
  data: string | Uint8Array | ArrayBuffer,
  options: SaveMediaOptions
): Promise<string>

export async function saveMediaFile(
  data: Uint8Array | ArrayBuffer | string,
  fileName: string,
  projectId?: string,
  episodeId?: string,
  type?: MediaType
): Promise<string>

export async function saveMediaFile(
  data: string | Uint8Array | ArrayBuffer,
  arg2: SaveMediaOptions | string,
  arg3?: string,
  arg4?: string,
  arg5?: MediaType
): Promise<string> {
  let projectId: string | undefined
  let episodeId: string | undefined
  let type: MediaType
  let fileName: string

  if (typeof arg2 === 'object') {
    const options = arg2
    projectId = options.projectId
    episodeId = options.episodeId
    type = options.type
    fileName = options.fileName || `${type}_${Date.now()}.${options.extension || 'bin'}`
  } else {
    fileName = arg2
    projectId = arg3
    episodeId = arg4
    type = arg5 || 'storyboard'
  }

  const baseDir = await workspaceService.getWorkspacePath()
  const typeDirMap: Record<MediaType, string> = {
    image: 'images',
    character: 'characters',
    scene: 'scenes',
    prop: 'props',
    storyboard: 'storyboards',
    video: 'videos',
    audio: 'audios',
    voice: 'voices',
  }
  const typeDir = typeDirMap[type as MediaType] || 'images'

  let dirPath: string
  if (projectId && episodeId) {
    dirPath = await join(baseDir, 'projects', projectId, episodeId, typeDir)
  } else {
    dirPath = await join(baseDir, 'temp', typeDir)
  }
  const filePath = await join(dirPath, fileName)

  // 确保目录存在
  const dirExists = await exists(dirPath)
  if (!dirExists) {
    await mkdir(dirPath, { recursive: true })
  }

  // 处理不同类型的数据
  let fileData: Uint8Array
  if (typeof data === 'string') {
    // 可能是 Base64、Data URL 或远程 URL
    if (data.startsWith('data:')) {
      fileData = await urlToUint8Array(data)
    } else if (data.startsWith('http://') || data.startsWith('https://')) {
      fileData = await urlToUint8Array(data)
    } else {
      // Base64 字符串 - 清理可能的空格、换行符等
      let base64Data = data.includes(',') ? data.split(',')[1] : data
      if (!base64Data) throw new Error('Invalid base64 data')
      // 移除所有非 base64 字符（空格、换行符等）
      base64Data = base64Data.replace(/[^A-Za-z0-9+/=]/g, '')
      const binaryString = atob(base64Data)
      fileData = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        fileData[i] = binaryString.charCodeAt(i)
      }
    }
  } else if (data instanceof ArrayBuffer) {
    fileData = new Uint8Array(data)
  } else {
    fileData = data
  }

  await writeFile(filePath, fileData)

  // 返回绝对路径
  return filePath
}

/**
 * 保存生成的图片
 * @param imageUrl 图片 URL (Data URL 或远程 URL)
 * @param projectId 项目 ID
 * @param episodeId 剧集 ID
 * @param extension 扩展名 (默认 png)
 * @returns 相对路径
 */
export async function saveGeneratedImage(
  imageUrl: string,
  projectId: string,
  episodeId: string,
  extension: string = 'png'
): Promise<string> {
  // 根据 Data URL 推断扩展名
  if (imageUrl.startsWith('data:image/')) {
    const mimeType = imageUrl.match(/data:image\/(\w+);/)?.[1]
    if (mimeType) {
      extension = mimeType === 'jpeg' ? 'jpg' : mimeType
    }
  }

  return saveMediaFile(imageUrl, {
    projectId,
    episodeId,
    type: 'image',
    extension,
  })
}

/**
 * 保存生成的视频
 * @param videoUrl 视频 URL (Data URL 或远程 URL)
 * @param projectId 项目 ID
 * @param episodeId 剧集 ID
 * @param extension 扩展名 (默认 mp4)
 * @returns 相对路径
 */
export async function saveGeneratedVideo(
  videoUrl: string,
  projectId: string,
  episodeId: string,
  extension: string = 'mp4'
): Promise<string> {
  return saveMediaFile(videoUrl, {
    projectId,
    episodeId,
    type: 'video',
    extension,
  })
}

/**
 * 保存生成的音频
 * @param audioUrl 音频 URL (Data URL 或远程 URL)
 * @param projectId 项目 ID
 * @param episodeId 剧集 ID
 * @param extension 扩展名 (默认 mp3)
 * @returns 相对路径
 */
export async function saveGeneratedAudio(
  audioUrl: string,
  projectId: string,
  episodeId: string,
  extension: string = 'mp3'
): Promise<string> {
  return saveMediaFile(audioUrl, {
    projectId,
    episodeId,
    type: 'audio',
    extension,
  })
}

/**
 * 删除媒体文件
 * @param filePath 文件路径（绝对路径）
 */
export async function deleteMediaFile(filePath: string): Promise<void> {
  const { remove } = await import('@tauri-apps/plugin-fs')

  try {
    await remove(filePath)
  } catch (error) {
    // 文件可能不存在，忽略错误
    console.warn('Failed to delete media file:', error)
  }
}

/**
 * 保存音色文件
 * @param voiceId 音色 ID
 * @param data 音频数据
 * @param fileName 文件名
 * @returns 文件路径
 */
export async function saveVoiceFile(
  voiceId: string,
  data: ArrayBuffer,
  fileName: string
): Promise<string> {
  const baseDir = await workspaceService.getWorkspacePath()
  const dirPath = await join(baseDir, 'voices', voiceId)

  // 确保目录存在
  const dirExists = await exists(dirPath)
  if (!dirExists) {
    await mkdir(dirPath, { recursive: true })
  }

  const filePath = await join(dirPath, fileName)
  const fileData = new Uint8Array(data)
  await writeFile(filePath, fileData)

  return filePath
}

/**
 * 删除音色目录
 * @param voiceId 音色 ID
 */
export async function deleteVoiceDirectory(voiceId: string): Promise<void> {
  const { remove } = await import('@tauri-apps/plugin-fs')
  const baseDir = await workspaceService.getWorkspacePath()
  const dirPath = await join(baseDir, 'voices', voiceId)

  try {
    await remove(dirPath, { recursive: true })
  } catch (error) {
    console.warn('Failed to delete voice directory:', error)
  }
}

/**
 * 读取音色文件
 * @param filePath 文件路径（绝对路径）
 * @returns ArrayBuffer
 */
export async function readVoiceFile(filePath: string): Promise<ArrayBuffer> {
  const { readFile } = await import('@tauri-apps/plugin-fs')

  const data = await readFile(filePath)
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
}
