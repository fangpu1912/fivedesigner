/**
 * 视频渲染服务
 * 使用 FFmpeg 直接渲染输出到工作目录
 */

import type { SampleClip } from '@/types'

// 渲染设置
export interface RenderOptions {
  format: 'mp4' | 'webm'
  resolution: '1080p' | '720p' | '480p' | '1080p-vertical' | '720p-vertical' | '480p-vertical'
  fps: 24 | 30 | 60
  quality: 'high' | 'medium' | 'low'
}

// 默认渲染设置
export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  format: 'mp4',
  resolution: '1080p-vertical',
  fps: 30,
  quality: 'high',
}

// 分辨率配置
const RESOLUTION_CONFIG = {
  '1080p': { width: 1920, height: 1080 },
  '720p': { width: 1280, height: 720 },
  '480p': { width: 854, height: 480 },
  '1080p-vertical': { width: 1080, height: 1920 },
  '720p-vertical': { width: 720, height: 1280 },
  '480p-vertical': { width: 480, height: 854 },
}

// 渲染进度回调
export type RenderProgressCallback = (progress: number, message: string) => void

// 渲染结果
export interface RenderResult {
  success: boolean
  message: string
  outputPath?: string
  ffmpegCommand?: string
}

/**
 * 将 Tauri asset URL 转换为本地文件路径
 * 支持多种格式：asset://, asset:///localhost/, http://asset.localhost/
 */
function convertAssetUrlToPath(url: string): string {
  if (!url) return ''

  try {
    // 1. 处理 http://asset.localhost/ 格式
    if (url.startsWith('http://asset.localhost/')) {
      const pathPart = url.replace('http://asset.localhost/', '')
      let decodedPath = decodeURIComponent(pathPart)
      decodedPath = decodedPath.replace(/\.$/, '')
      return decodedPath
    }

    // 2. 处理 asset://localhost/ 格式
    if (url.startsWith('asset://localhost/')) {
      const pathPart = url.replace('asset://localhost/', '')
      let decodedPath = decodeURIComponent(pathPart)
      decodedPath = decodedPath.replace(/^\//, '')
      return decodedPath
    }

    // 3. 处理 asset:/// 格式（三斜杠）
    if (url.startsWith('asset:///')) {
      const pathPart = url.replace('asset:///', '')
      let decodedPath = decodeURIComponent(pathPart)
      decodedPath = decodedPath.replace(/^\//, '')
      return decodedPath
    }

    // 4. 处理 asset:// 格式（双斜杠）
    if (url.startsWith('asset://')) {
      const pathPart = url.replace('asset://', '')
      let decodedPath = decodeURIComponent(pathPart)
      decodedPath = decodedPath.replace(/^\//, '')
      return decodedPath
    }
  } catch {
    // 解码失败，返回原始值
  }

  // 已经是本地路径或其他格式
  return url
}

/**
 * 生成 FFmpeg 命令用于高质量渲染
 * 使用 filter_complex concat 方式，更可靠
 */
export function generateFFmpegCommand(
  clips: SampleClip[],
  options: RenderOptions = DEFAULT_RENDER_OPTIONS,
  outputPath: string = 'output.mp4'
): string {
  const { width, height } = RESOLUTION_CONFIG[options.resolution]

  // 过滤出有视频或图片的片段
  const videoClips = clips.filter(clip => clip.videoUrl || clip.imageUrl)

  if (videoClips.length === 0) {
    return 'ffmpeg -f lavfi -i color=c=black:s=1280x720:d=1 -c:v libx264 -t 1 "output.mp4"'
  }

  if (videoClips.length === 1) {
    const clip = videoClips[0]!
    if (clip.videoUrl) {
      const localPath = convertAssetUrlToPath(clip.videoUrl)
      return `ffmpeg -i "${localPath}" -vf "scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${options.fps}" -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "${outputPath}"`
    } else if (clip.imageUrl) {
      const localPath = convertAssetUrlToPath(clip.imageUrl)
      return `ffmpeg -loop 1 -i "${localPath}" -f lavfi -i anullsrc=r=44100:cl=stereo -vf "scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${options.fps}" -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -c:a aac -b:a 192k -t ${clip.duration} -shortest -movflags +faststart "${outputPath}"`
    }
  }

  // 使用 filter_complex concat 方式处理多片段
  const inputParts: string[] = []
  const filterParts: string[] = []
  
  videoClips.forEach((clip, index) => {
    if (clip.videoUrl) {
      const localPath = convertAssetUrlToPath(clip.videoUrl)
      inputParts.push(`-i "${localPath}"`)
      filterParts.push(`[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${options.fps},setpts=PTS-STARTPTS[v${index}];[${index}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,asetpts=PTS-STARTPTS[a${index}]`)
    } else if (clip.imageUrl) {
      const localPath = convertAssetUrlToPath(clip.imageUrl)
      inputParts.push(`-loop 1 -i "${localPath}" -f lavfi -i anullsrc=r=44100:cl=stereo`)
      filterParts.push(`[${index * 2}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${options.fps},trim=0:${clip.duration},setpts=PTS-STARTPTS[v${index}];[${index * 2 + 1}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,atrim=0:${clip.duration},asetpts=PTS-STARTPTS[a${index}]`)
    }
  })
  
  const vConcat = videoClips.map((_, i) => `[v${i}]`).join('')
  const aConcat = videoClips.map((_, i) => `[a${i}]`).join('')
  const filterComplex = `${filterParts.join(';')};${vConcat}concat=n=${videoClips.length}:v=1:a=0[outv];${aConcat}concat=n=${videoClips.length}:v=0:a=1[outa]`
  
  const command = `ffmpeg ${inputParts.join(' ')} -filter_complex "${filterComplex}" -map "[outv]" -map "[outa]" -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart -y "${outputPath}"`

  return command
}

/**
 * 生成单行 FFmpeg 命令（使用 filter_complex concat）
 * 适用于简单场景，支持音频
 */
export function generateSimpleFFmpegCommand(
  clips: SampleClip[],
  options: RenderOptions = DEFAULT_RENDER_OPTIONS,
  outputPath: string = 'output.mp4'
): string {
  const { width, height } = RESOLUTION_CONFIG[options.resolution]

  // 过滤出有视频或图片的片段
  const videoClips = clips.filter(clip => clip.videoUrl || clip.imageUrl)

  if (videoClips.length === 0) {
    return `ffmpeg -f lavfi -i color=c=black:s=${width}:${height}:d=1 -c:v libx264 -t 1 "${outputPath}"`
  }

  if (videoClips.length === 1) {
    // 只有一个片段时，不需要 concat，直接处理
    const clip = videoClips[0]!
    if (clip.videoUrl) {
      const localPath = convertAssetUrlToPath(clip.videoUrl)
      return `ffmpeg -i "${localPath}" -vf "scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${options.fps}" -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "${outputPath}"`
    } else if (clip.imageUrl) {
      const localPath = convertAssetUrlToPath(clip.imageUrl)
      return `ffmpeg -loop 1 -i "${localPath}" -f lavfi -i anullsrc=r=44100:cl=stereo -vf "scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${options.fps}" -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -c:a aac -b:a 192k -t ${clip.duration} -shortest -movflags +faststart "${outputPath}"`
    }
  }

  // 多个片段时使用 filter_complex concat 方式（更可靠的拼接方式）
  // 先转码所有片段为统一格式，然后通过 filter 拼接
  
  const inputParts: string[] = []
  const filterParts: string[] = []
  
  videoClips.forEach((clip, index) => {
    if (clip.videoUrl) {
      const localPath = convertAssetUrlToPath(clip.videoUrl)
      inputParts.push(`-i "${localPath}"`)
      // 先 scale 再 trim，确保正确处理
      filterParts.push(`[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${options.fps},setpts=PTS-STARTPTS[v${index}];[${index}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,asetpts=PTS-STARTPTS[a${index}]`)
    } else if (clip.imageUrl) {
      const localPath = convertAssetUrlToPath(clip.imageUrl)
      inputParts.push(`-loop 1 -i "${localPath}" -f lavfi -i anullsrc=r=44100:cl=stereo`)
      // 图片需要生成视频
      filterParts.push(`[${index * 2}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${options.fps},trim=0:${clip.duration},setpts=PTS-STARTPTS[v${index}];[${index * 2 + 1}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,atrim=0:${clip.duration},asetpts=PTS-STARTPTS[a${index}]`)
    }
  })
  
  // 构建 concat filter
  const vConcat = videoClips.map((_, i) => `[v${i}]`).join('')
  const aConcat = videoClips.map((_, i) => `[a${i}]`).join('')
  const filterComplex = `${filterParts.join(';')};${vConcat}concat=n=${videoClips.length}:v=1:a=0[outv];${aConcat}concat=n=${videoClips.length}:v=0:a=1[outa]`
  
  const command = `ffmpeg ${inputParts.join(' ')} -filter_complex "${filterComplex}" -map "[outv]" -map "[outa]" -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart -y "${outputPath}"`

  return command
}

/**
 * 复制 FFmpeg 命令到剪贴板
 */
export async function copyFFmpegCommand(command: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(command)
    return true
  } catch {
    return false
  }
}
