/**
 * FFmpeg 管理器
 * 调用 Tauri 后端命令检测、下载和使用 FFmpeg
 */

import { invoke } from '@tauri-apps/api/core'

// FFmpeg 状态类型
export interface FFmpegStatus {
  installed: boolean
  source: 'system' | 'app' | 'none'
  version?: string
  path?: string
}

/**
 * 检查 FFmpeg 状态
 * 调用 Tauri 后端命令检测
 */
export async function checkFFmpegStatus(): Promise<FFmpegStatus> {
  try {
    const result = await invoke<FFmpegStatus>('check_ffmpeg_status')
    return result
  } catch (error) {
    console.error('Check FFmpeg status failed:', error)
    return {
      installed: false,
      source: 'none',
    }
  }
}

/**
 * 下载 FFmpeg
 * 调用 Tauri 后端命令自动下载和解压
 */
export async function downloadFFmpeg(
  onProgress?: (progress: number, message: string) => void
): Promise<{ success: boolean; message: string; path?: string }> {
  try {
    onProgress?.(0, '准备下载 FFmpeg...')

    const url = getFFmpegDownloadUrl()
    const targetDir = await getFFmpegTargetDir()

    onProgress?.(10, '开始下载...')

    const result = await invoke<string>('download_ffmpeg', {
      url,
      targetDir,
    })

    onProgress?.(100, 'FFmpeg 安装完成！')

    return {
      success: true,
      message: 'FFmpeg 安装成功',
      path: result,
    }
  } catch (error) {
    console.error('Download FFmpeg failed:', error)
    return {
      success: false,
      message: `下载失败: ${error instanceof Error ? error.message : '未知错误'}`,
    }
  }
}

/**
 * 使用 FFmpeg 渲染视频
 * 执行命令
 */
export async function renderWithFFmpeg(
  ffmpegPath: string,
  commandScript: string,
  outputFile: string,
  _clips?: Array<{ videoUrl?: string; imageUrl?: string; duration: number }>,
  onProgress?: (progress: number, message: string) => void,
  projectId?: string,
  episodeId?: string
): Promise<{ success: boolean; message: string }> {
  try {
    onProgress?.(0, '开始渲染...')

    // 对于简单命令，不需要 concatList
    const concatList = ''

    console.log('[FFmpeg] Command:', commandScript)
    console.log('[FFmpeg] Output file:', outputFile)

    await invoke('render_video_with_ffmpeg_script', {
      ffmpegPath,
      commandScript,
      outputFile,
      concatList,
      project_id: projectId || null,
      episode_id: episodeId || null,
    })

    onProgress?.(100, '渲染完成！')

    return {
      success: true,
      message: '视频渲染成功',
    }
  } catch (error) {
    console.error('FFmpeg render failed:', error)
    return {
      success: false,
      message: `渲染失败: ${error instanceof Error ? error.message : '未知错误'}`,
    }
  }
}

/**
 * 获取 FFmpeg 目标目录
 */
async function getFFmpegTargetDir(): Promise<string> {
  const { workspaceService } = await import('./workspace/WorkspaceService')
  const baseDir = await workspaceService.getWorkspacePath()
  return `${baseDir}/tools/ffmpeg`
}

/**
 * 获取 FFmpeg 下载链接
 */
export function getFFmpegDownloadUrl(): string {
  const userAgent = navigator.userAgent.toLowerCase()

  if (userAgent.includes('win')) {
    return 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip'
  } else if (userAgent.includes('mac')) {
    return 'https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip'
  } else {
    return 'https://johnvansickle.com/ffmpeg/builds/ffmpeg-git-amd64-static.tar.xz'
  }
}

/**
 * 生成 FFmpeg 安装指南
 */
export function getFFmpegInstallGuide(): string {
  const userAgent = navigator.userAgent.toLowerCase()

  if (userAgent.includes('win')) {
    return `Windows 安装 FFmpeg：

方法1 - 自动安装（推荐）：
点击"自动安装 FFmpeg"按钮，应用会自动下载并配置

方法2 - 手动安装：
1. 下载 FFmpeg：
   https://github.com/BtbN/FFmpeg-Builds/releases
   选择 ffmpeg-master-latest-win64-gpl.zip

2. 解压到 C:\ffmpeg

3. 添加到系统 PATH：
   - 右键"此电脑" → 属性 → 高级系统设置
   - 环境变量 → Path → 编辑
   - 添加 C:\ffmpeg\bin

4. 验证安装：
   打开命令行，输入 ffmpeg -version`
  } else if (userAgent.includes('mac')) {
    return `Mac 安装 FFmpeg：

方法1 - 使用 Homebrew：
   brew install ffmpeg

方法2 - 手动下载：
   https://evermeet.cx/ffmpeg/

验证安装：
   ffmpeg -version`
  } else {
    return `Linux 安装 FFmpeg：

Ubuntu/Debian：
   sudo apt update
   sudo apt install ffmpeg

CentOS/RHEL：
   sudo yum install ffmpeg

验证安装：
   ffmpeg -version`
  }
}
