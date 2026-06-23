/**
 * ComfyUI 通用编辑服务
 * 支持任意 ComfyUI 工作流对图片/视频/音频进行批量处理（去水印、字幕、风格迁移等）
 * 流程：上传文件 → 注入工作流 → 提交 → 轮询完成 → 拿回结果
 */

import { getComfyUIServerUrl } from '@/services/configService'
import { ComfyUIService } from './comfyuiService'
import type { WorkflowConfig } from '@/types'
import type { BatchMediaType } from '@/plugins/storyboard-copilot/types'

export interface ComfyUIEditOptions {
  mediaUrl: string
  mediaType?: BatchMediaType
  onProgress?: (progress: number) => void
  projectId?: string
  episodeId?: string
}

export interface ComfyUIEditResult {
  success: boolean
  imageUrl?: string   // 输出文件路径（兼容旧名）
  videoUrl?: string
  audioUrl?: string
  outputType?: BatchMediaType
  error?: string
}

// 当前工作流配置
let currentEditWorkflowConfig: WorkflowConfig | null = null
let editImageNodeId = '1'
let editOutputNodeId = '4'

/**
 * 设置编辑工作流配置
 */
export function setEditWorkflowConfig(config: WorkflowConfig | null): void {
  currentEditWorkflowConfig = config
  if (config?.workflow) {
    const imageNodeId = typeof config.nodes.imageInput === 'string' ? config.nodes.imageInput : '1'
    const outputNodeId = typeof config.nodes.output === 'string' ? config.nodes.output : '4'
    editImageNodeId = imageNodeId
    editOutputNodeId = outputNodeId
  }
}

/**
 * 获取当前编辑工作流配置
 */
export function getEditWorkflowConfig(): WorkflowConfig | null {
  return currentEditWorkflowConfig
}

/**
 * 将 URL 转为本地路径
 */
function toLocalPath(url: string): string {
  if (url.startsWith('file://')) return url.replace('file://', '')
  if (url.startsWith('asset://')) {
    const match = url.match(/asset:\/\/localhost\/(.*)/)
    if (match?.[1]) return decodeURIComponent(match[1])
  }
  return url
}

/**
 * 使用 ComfyUI 工作流处理单个文件
 */
export async function editWithComfyUI(
  options: ComfyUIEditOptions
): Promise<ComfyUIEditResult> {
  const { mediaUrl, mediaType = 'image', onProgress, projectId, episodeId } = options

  let comfyUI: ComfyUIService | null = null

  try {
    onProgress?.(10)

    const serverUrl = await getComfyUIServerUrl()
    if (!serverUrl) {
      throw new Error('ComfyUI 服务器地址未配置，请在设置中配置')
    }

    if (!currentEditWorkflowConfig?.workflow) {
      throw new Error('未选择工作流，请在编辑节点中选择工作流')
    }

    const localPath = toLocalPath(mediaUrl)
    onProgress?.(20)

    comfyUI = new ComfyUIService(serverUrl, projectId, episodeId)
    await comfyUI.connect()
    onProgress?.(30)

    // 上传文件到 ComfyUI
    const { readFile } = await import('@tauri-apps/plugin-fs')
    const fileData = await readFile(localPath)
    const ext = localPath.split('.').pop()?.toLowerCase() || 'png'
    const fileName = `edit_input_${Date.now()}.${ext}`

    // 根据媒体类型选择上传方式
    let uploadResult: { name: string; subfolder: string; type: string }
    if (mediaType === 'audio') {
      uploadResult = await comfyUI.client.uploadAudio(fileData.buffer as ArrayBuffer, fileName, '')
    } else {
      uploadResult = await comfyUI.client.uploadImage(fileData, fileName, '', true)
    }

    onProgress?.(40)

    // 注入上传的文件名到工作流
    const workflow = JSON.parse(JSON.stringify(currentEditWorkflowConfig.workflow))
    const inputNode = workflow[editImageNodeId] as { inputs?: Record<string, unknown> } | undefined
    if (inputNode?.inputs) {
      // 图片和视频用 image 字段，音频用 audio 字段
      if (mediaType === 'audio') {
        inputNode.inputs.audio = uploadResult.name
      } else {
        inputNode.inputs.image = uploadResult.name
      }
    }

    // 提交工作流
    const queueResponse = await comfyUI.queuePrompt(workflow)
    onProgress?.(50)

    // 轮询等待完成
    const historyItem = await comfyUI.waitForCompletion(queueResponse.prompt_id)
    onProgress?.(90)

    // 获取输出 — 检查图片和视频输出
    const output = historyItem.outputs?.[editOutputNodeId]
    if (!output) {
      throw new Error('未找到输出结果')
    }

    // 优先检查视频输出，其次图片输出
    let savedPath: string
    let outputType: BatchMediaType = mediaType

    if (output.videos?.[0]) {
      const video = output.videos[0]
      savedPath = await comfyUI.client.getFile(video.filename, video.subfolder, video.type, 'video')
      outputType = 'video'
    } else if (output.images?.[0]) {
      const image = output.images[0]
      savedPath = await comfyUI.getImage(image.filename, image.subfolder, image.type)
      outputType = 'image'
    } else if (output.audio?.[0]) {
      const audio = output.audio[0]
      savedPath = await comfyUI.client.getFile(audio.filename, audio.subfolder, audio.type, 'audio')
      outputType = 'audio'
    } else {
      throw new Error('未找到输出文件')
    }

    onProgress?.(100)

    return {
      success: true,
      imageUrl: outputType === 'image' ? savedPath : undefined,
      videoUrl: outputType === 'video' ? savedPath : undefined,
      audioUrl: outputType === 'audio' ? savedPath : undefined,
      outputType,
    }
  } catch (error) {
    console.error('ComfyUI 编辑失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'ComfyUI 编辑失败',
    }
  } finally {
    comfyUI?.disconnect()
  }
}

/**
 * 批量处理：依次对多个文件执行同一工作流
 */
export async function batchEditWithComfyUI(
  items: Array<{ id: string; mediaUrl: string; mediaType?: BatchMediaType }>,
  options: {
    projectId?: string
    episodeId?: string
    onItemProgress?: (itemId: string, progress: number) => void
    onItemComplete?: (itemId: string, result: ComfyUIEditResult) => void
  }
): Promise<Map<string, ComfyUIEditResult>> {
  const results = new Map<string, ComfyUIEditResult>()

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!
    const result = await editWithComfyUI({
      mediaUrl: item.mediaUrl,
      mediaType: item.mediaType || 'image',
      projectId: options.projectId,
      episodeId: options.episodeId,
      onProgress: (p) => {
        const overallProgress = Math.round(((i * 100 + p) / items.length))
        options.onItemProgress?.(item.id, overallProgress)
      },
    })
    results.set(item.id, result)
    options.onItemComplete?.(item.id, result)
  }

  return results
}
