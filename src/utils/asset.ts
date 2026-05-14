/**
 * 统一资源处理工具
 * 用于处理本地文件路径转换、URL 处理等
 */

import { convertFileSrc } from '@tauri-apps/api/core'

/**
 * 检测是否在 Tauri 环境中运行
 */
export function isTauriEnv(): boolean {
  if (typeof window === 'undefined') return false
  // 检查 window.__TAURI__ 是否存在
  const hasTauri = '__TAURI__' in window
  // 检查 window.__TAURI_INTERNALS__ 是否存在（Tauri v2）
  const hasTauriInternals = '__TAURI_INTERNALS__' in window
  return hasTauri || hasTauriInternals
}

/**
 * 检测是否为远程 URL
 * 注意：排除 Tauri 的 asset.localhost URL
 */
export function isRemoteUrl(path: string | null | undefined): boolean {
  if (!path) return false
  // 排除 Tauri 的 asset.localhost URL
  if (path.includes('asset.localhost')) return false
  return path.startsWith('http://') || path.startsWith('https://')
}

/**
 * 检测是否为 asset:// 协议 URL
 */
export function isAssetUrl(path: string | null | undefined): boolean {
  if (!path) return false
  return path.startsWith('asset://') || path.includes('asset.localhost')
}

/**
 * 检测是否为本地文件路径
 */
export function isLocalPath(path: string | null | undefined): boolean {
  if (!path) return false
  return !isRemoteUrl(path) && !isAssetUrl(path)
}

/**
 * 检测是否为绝对路径
 */
export function isAbsolutePath(path: string): boolean {
  // Windows: C:\ or \\ or D:/
  // Unix: /
  return /^([a-zA-Z]:[\\/]|\\\\|\/)/.test(path)
}

/**
 * 获取资源显示 URL
 * - 远程 URL 直接返回
 * - asset:// URL 直接返回
 * - file:// URL 转换为 asset:// URL
 * - 本地绝对路径转换为 asset:// URL
 * - 相对路径：如果已经是 asset:// 格式则返回，否则返回 null（需要使用异步版本）
 *
 * @param path 资源路径
 * @returns 可显示的 URL，如果路径为空或无法处理则返回 null
 */
export function getAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null

  // 远程 URL 直接返回
  if (isRemoteUrl(path)) return path

  // asset:// 协议已转换过
  if (isAssetUrl(path)) return path

  // data: URL 直接返回
  if (path.startsWith('data:')) return path

  // blob: URL 直接返回
  if (path.startsWith('blob:')) return path

  // 解码 URL 编码的路径（处理 Windows 路径中的特殊字符）
  let decodedPath = path
  try {
    decodedPath = decodeURIComponent(path)
  } catch {
    // 如果解码失败，使用原始路径
  }

  // 🔑 处理 Tauri 的 asset.localhost URL
  // 例如: http://asset.localhost/E%3A%5Cpath%5Cto%5Cfile.png
  if (decodedPath.includes('asset.localhost')) {
    try {
      // 提取路径部分
      const urlObj = new URL(decodedPath)
      // pathname 会是 /E:/path/to/file.png 格式
      let localPath = decodeURIComponent(urlObj.pathname)
      // 移除开头的斜杠
      if (localPath.startsWith('/')) {
        localPath = localPath.substring(1)
      }
      // 转换为 asset:// URL
      if (isTauriEnv()) {
        return convertFileSrc(localPath)
      }
      return decodedPath
    } catch (err) {
      console.error('[getAssetUrl] Failed to parse asset.localhost URL:', err)
    }
  }

  // file:// 协议转换为 asset:// URL
  if (decodedPath.startsWith('file://')) {
    const filePath = decodedPath.replace(/^file:\/\//, '')
    const normalizedPath = filePath.replace(/^\/([a-zA-Z]:)\//, '$1\\')
    if (isTauriEnv()) return convertFileSrc(normalizedPath)
    return decodedPath
  }

  // Tauri 环境：本地路径转换
  if (isTauriEnv()) {
    if (isAbsolutePath(decodedPath)) {
      try {
        const assetUrl = convertFileSrc(decodedPath)
        // 确保返回的是 asset:// 协议的 URL
        if (assetUrl && (assetUrl.startsWith('asset://') || assetUrl.startsWith('http'))) {
          return assetUrl
        }
        // 如果 convertFileSrc 返回了其他格式，尝试再次转换
        if (assetUrl && assetUrl.startsWith('file://')) {
          const filePath = assetUrl.replace(/^file:\/\//, '')
          const normalizedPath = filePath.replace(/^\/([a-zA-Z]:)\//, '$1\\')
          const retryUrl = convertFileSrc(normalizedPath)
          if (retryUrl && (retryUrl.startsWith('asset://') || retryUrl.startsWith('http'))) {
            return retryUrl
          }
        }
        // 如果转换失败，返回 null（让调用方处理）
        console.warn('[getAssetUrl] convertFileSrc did not return asset:// URL:', assetUrl)
        return null
      } catch (err) {
        console.error('[getAssetUrl] convertFileSrc failed:', err)
        return null
      }
    }
    // 相对路径在 Tauri 环境中无法直接转换，返回 null
    console.warn('[getAssetUrl] Relative path not supported in Tauri:', decodedPath)
    return null
  }

  // 非 Tauri 环境：本地路径无法显示，返回 null
  console.warn('[getAssetUrl] Local path not supported in non-Tauri environment:', decodedPath)
  return null
}

/**
 * 批量获取资源显示 URL
 *
 * @param paths 资源路径数组
 * @returns 可显示的 URL 数组（过滤掉空值）
 */
export function getAssetUrls(paths: (string | null | undefined)[]): string[] {
  return paths.map(getAssetUrl).filter((url): url is string => url !== null)
}

/**
 * 获取音频 URL（别名，语义化）
 */
export const getAudioUrl = getAssetUrl

/**
 * 获取视频 URL（别名，语义化）
 */
export const getVideoUrl = getAssetUrl

/**
 * 获取图片 URL（别名，语义化）
 */
export const getImageUrl = getAssetUrl

/**
 * 获取文件扩展名
 *
 * @param path 文件路径或 URL
 * @returns 扩展名（小写，不含点），如果没有则返回空字符串
 */
export function getFileExtension(path: string | null | undefined): string {
  if (!path) return ''

  // 移除查询参数
  const cleanPath = path.split('?')[0]
  if (!cleanPath) return ''

  const lastDot = cleanPath.lastIndexOf('.')

  if (lastDot === -1 || lastDot === cleanPath.length - 1) {
    return ''
  }

  return cleanPath.slice(lastDot + 1).toLowerCase()
}

/**
 * 检测文件是否为图片
 */
export function isImageFile(path: string | null | undefined): boolean {
  const ext = getFileExtension(path)
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(ext)
}

/**
 * 检测文件是否为视频
 */
export function isVideoFile(path: string | null | undefined): boolean {
  const ext = getFileExtension(path)
  return ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv', 'wmv', 'flv'].includes(ext)
}

/**
 * 检测文件是否为音频
 */
export function isAudioFile(path: string | null | undefined): boolean {
  const ext = getFileExtension(path)
  return ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a', 'wma'].includes(ext)
}

/**
 * 获取文件类型
 */
export function getMediaType(
  path: string | null | undefined
): 'image' | 'video' | 'audio' | 'unknown' {
  if (isImageFile(path)) return 'image'
  if (isVideoFile(path)) return 'video'
  if (isAudioFile(path)) return 'audio'
  return 'unknown'
}
