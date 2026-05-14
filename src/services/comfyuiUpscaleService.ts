/**
 * ComfyUI 图片超分服务
 * 上传图片 → 注入工作流 → 轮询拿结果
 * 工作流由用户提供 JSON 文件
 */

import { getComfyUIServerUrl } from '@/services/configService'
import { ComfyUIService } from './comfyuiService'
import type { WorkflowConfig } from '@/types'

export interface ComfyUIUpscaleOptions {
  imageUrl: string
  onProgress?: (progress: number) => void
  projectId?: string
  episodeId?: string
}

export interface ComfyUIUpscaleResult {
  success: boolean
  imageUrl?: string
  error?: string
}

// 当前工作流配置（由用户通过文件选择导入）
let currentWorkflowConfig: WorkflowConfig | null = null

// 记录节点ID映射
let upscaleImageNodeId = '1'
let upscaleOutputNodeId = '4'

/**
 * 设置工作流配置
 */
export function setUpscaleWorkflowConfig(config: WorkflowConfig | null): void {
  currentWorkflowConfig = config
  if (config?.workflow) {
    const imageNodeId = typeof config.nodes.imageInput === 'string' ? config.nodes.imageInput : '1'
    const outputNodeId = typeof config.nodes.output === 'string' ? config.nodes.output : '4'
    upscaleImageNodeId = imageNodeId
    upscaleOutputNodeId = outputNodeId
  }
}

/**
 * 获取当前工作流配置
 */
export function getUpscaleWorkflowConfig(): WorkflowConfig | null {
  return currentWorkflowConfig
}

/**
 * 使用 ComfyUI 超分图片
 * 流程：上传图片 → 注入工作流 → 提交 → 轮询完成 → 拿回结果
 */
export async function upscaleWithComfyUI(
  options: ComfyUIUpscaleOptions
): Promise<ComfyUIUpscaleResult> {
  const { imageUrl, onProgress, projectId, episodeId } = options

  let comfyUI: ComfyUIService | null = null

  try {
    onProgress?.(10)

    const serverUrl = await getComfyUIServerUrl()
    if (!serverUrl) {
      throw new Error('ComfyUI 服务器地址未配置，请在设置中配置')
    }

    if (!currentWorkflowConfig?.workflow) {
      throw new Error('未导入工作流，请在超分节点中选择工作流 JSON 文件')
    }

    // 获取图片本地路径
    let localPath = imageUrl
    if (imageUrl.startsWith('file://')) {
      localPath = imageUrl.replace('file://', '')
    } else if (imageUrl.startsWith('asset://')) {
      const match = imageUrl.match(/asset:\/\/localhost\/(.*)/)
      if (match?.[1]) {
        localPath = decodeURIComponent(match[1])
      }
    }

    onProgress?.(20)

    comfyUI = new ComfyUIService(serverUrl, projectId, episodeId)
    await comfyUI.connect()

    onProgress?.(30)

    // 上传图片到 ComfyUI
    const { readFile } = await import('@tauri-apps/plugin-fs')
    const imageData = await readFile(localPath)
    const fileName = `input_${Date.now()}.png`
    const uploadResult = await comfyUI.client.uploadImage(imageData, fileName, '', true)

    onProgress?.(40)

    // 注入上传的图片名到工作流
    const workflow = JSON.parse(JSON.stringify(currentWorkflowConfig.workflow))
    const imageNode = workflow[upscaleImageNodeId] as { inputs?: Record<string, unknown> } | undefined
    if (imageNode?.inputs) {
      imageNode.inputs.image = uploadResult.name
    }

    // 提交工作流
    const queueResponse = await comfyUI.queuePrompt(workflow)
    onProgress?.(50)

    // 轮询等待完成
    const historyItem = await comfyUI.waitForCompletion(queueResponse.prompt_id)
    onProgress?.(90)

    // 获取输出图片
    const output = historyItem.outputs?.[upscaleOutputNodeId]
    const outputImage = output?.images?.[0]
    if (!outputImage) {
      throw new Error('未找到输出图片')
    }

    // 下载结果
    const savedPath = await comfyUI.getImage(
      outputImage.filename,
      outputImage.subfolder,
      outputImage.type
    )

    onProgress?.(100)

    return { success: true, imageUrl: savedPath }
  } catch (error) {
    console.error('ComfyUI 超分失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'ComfyUI 超分失败',
    }
  } finally {
    comfyUI?.disconnect()
  }
}

/**
 * 检查 ComfyUI 是否可用
 */
export async function checkComfyUIStatus(): Promise<{
  available: boolean
  message: string
  serverUrl?: string
}> {
  try {
    const serverUrl = await getComfyUIServerUrl()
    if (!serverUrl) {
      return { available: false, message: 'ComfyUI 服务器地址未配置' }
    }
    const comfyUI = new ComfyUIService(serverUrl)
    await comfyUI.connect()
    comfyUI.disconnect()
    return { available: true, message: 'ComfyUI 连接正常', serverUrl }
  } catch (error) {
    return {
      available: false,
      message: error instanceof Error ? error.message : '无法连接到 ComfyUI',
    }
  }
}
