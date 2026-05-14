/**
 * 图片超分辨率服务
 * 直接使用 ComfyUI 工作流进行放大
 */

import { upscaleWithComfyUI, checkComfyUIStatus } from './comfyuiUpscaleService'

export interface UpscaleOptions {
  imageUrl: string
  onProgress?: (progress: number) => void
  projectId?: string
  episodeId?: string
}

export interface UpscaleResult {
  success: boolean
  imageUrl?: string
  error?: string
}

// 主超分函数
export async function upscaleImage(options: UpscaleOptions): Promise<UpscaleResult> {
  const comfyStatus = await checkComfyUIStatus()

  if (!comfyStatus.available) {
    return {
      success: false,
      error: `ComfyUI 不可用: ${comfyStatus.message}，请在设置中配置 ComfyUI 服务器地址`,
    }
  }

  return upscaleWithComfyUI(options)
}
