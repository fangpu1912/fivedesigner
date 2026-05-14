import { getComfyUIServerUrl } from '@/services/configService'
import { type WorkflowConfig } from '@/types'

import { ComfyUIClient } from './comfyui/ComfyUIClient'

import type {
  ComfyUIQueueStatus,
  ComfyUIHistoryItem,
  ComfyUIUploadResponse,
  ComfyUIProgress,
  ComfyUIEventHandler,
  ComfyUIEventType,
  ComfyUIEvent,
} from './comfyui/types'

export interface ComfyUIQueueItem {
  prompt: Record<string, unknown>
  client_id: string
}

export interface ComfyUIQueueResponse {
  prompt_id: string
  number: number
  node_errors?: Record<string, unknown>
}

export class ComfyUIService {
  private serverUrl: string
  private clientId: string
  client: ComfyUIClient

  constructor(serverUrl: string = 'http://127.0.0.1:8188', projectId?: string, episodeId?: string) {
    this.serverUrl = serverUrl
    this.clientId = `fivedesigner-${Date.now()}`
    this.client = new ComfyUIClient({
      serverUrl: this.serverUrl,
      clientId: this.clientId,
      projectId,
      episodeId,
    })
  }

  /**
   * 更新项目/剧集上下文
   */
  setContext(projectId?: string, episodeId?: string): void {
    this.client.setContext(projectId, episodeId)
  }

  async connect(): Promise<void> {
    await this.client.connect()
  }

  disconnect(): void {
    this.client.disconnect()
  }

  isConnected(): boolean {
    return this.client.isConnected()
  }

  on(eventType: ComfyUIEventType, handler: ComfyUIEventHandler): () => void {
    return this.client.on(eventType, handler)
  }

  onProgress(callback: (progress: ComfyUIProgress) => void): () => void {
    const handler: ComfyUIEventHandler = (event: ComfyUIEvent) => {
      callback(event.data as ComfyUIProgress)
    }
    return this.client.on('progress', handler)
  }

  async queuePrompt(workflow: Record<string, unknown>): Promise<ComfyUIQueueResponse> {
    if (!this.client.isConnected()) {
      await this.client.connect()
    }
    return this.client.queuePrompt(workflow)
  }

  async getQueue(): Promise<ComfyUIQueueStatus> {
    return this.client.getQueue()
  }

  async interrupt(): Promise<void> {
    return this.client.interrupt()
  }

  async clearQueue(): Promise<void> {
    return this.client.clearQueue()
  }

  async getHistory(promptId: string): Promise<Record<string, ComfyUIHistoryItem>> {
    return this.client.getHistory(promptId)
  }

  async getImage(filename: string, subfolder: string, type: string): Promise<string> {
    return this.client.getImage(filename, subfolder, type)
  }

  async uploadImage(
    imageData: ArrayBuffer,
    filename: string,
    subfolder: string = ''
  ): Promise<ComfyUIUploadResponse> {
    return this.client.uploadImage(imageData, filename, subfolder)
  }

  async waitForCompletion(
    promptId: string,
    timeout: number = 1200000
  ): Promise<ComfyUIHistoryItem> {
    const startTime = Date.now()

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Timeout waiting for prompt completion'))
      }, timeout)

      const cleanup = this.client.on('executed', async event => {
        const data = event.data as { prompt_id: string }
        if (data.prompt_id === promptId) {
          // executed 事件触发时 history 可能还没写入，轮询会处理
          // 这里只清理 WebSocket 监听，让 pollHistory 去拿结果
          cleanup()
        }
      })

      this.client.on('execution_error', event => {
        const data = event.data as { prompt_id?: string; exception_message?: string; node_id?: string }
        if (data.prompt_id === promptId) {
          clearTimeout(timeoutId)
          cleanup()
          const errorMsg = data.exception_message || 'Execution error'
          const nodeInfo = data.node_id ? ` (node: ${data.node_id})` : ''
          reject(new Error(`ComfyUI execution error${nodeInfo}: ${errorMsg}`))
        }
      })

      this.pollHistory(promptId, startTime, timeout, resolve, reject, timeoutId, cleanup)
    })
  }

  private async pollHistory(
    promptId: string,
    startTime: number,
    timeout: number,
    resolve: (value: ComfyUIHistoryItem) => void,
    reject: (reason: Error) => void,
    timeoutId: NodeJS.Timeout,
    cleanup: () => void
  ): Promise<void> {
    while (Date.now() - startTime < timeout) {
      try {
        const history = await this.getHistory(promptId)
        if (history[promptId]) {
          clearTimeout(timeoutId)
          cleanup()
          const item = history[promptId]
          // 检查是否有错误
          if (item.status?.status_str === 'error') {
            const rawMsg = item.status?.messages?.[0]
            const errorMsg = typeof rawMsg === 'string' ? rawMsg : JSON.stringify(item.status?.messages)
            reject(new Error(errorMsg))
          } else {
            resolve(item)
          }
          return
        }
      } catch (error) {
        // Continue polling
      }
      await new Promise(r => setTimeout(r, 1000))
    }
    clearTimeout(timeoutId)
    cleanup()
    reject(new Error('Timeout waiting for prompt completion'))
  }

  async generateImage(workflowConfig: WorkflowConfig, prompt: string): Promise<string[]> {
    if (!this.client.isConnected()) {
      await this.client.connect()
    }

    const workflow = { ...workflowConfig.workflow }

    if (workflowConfig.nodes.prompt) {
      const promptNodeIds = Array.isArray(workflowConfig.nodes.prompt) ? workflowConfig.nodes.prompt : [workflowConfig.nodes.prompt]
      for (const nodeId of promptNodeIds) {
        const node = workflow[nodeId]
        if (node && node.inputs) {
          node.inputs.text = prompt
        }
      }
    }

    const queueResponse = await this.queuePrompt(workflow)
    const history = await this.waitForCompletion(queueResponse.prompt_id)

    const images: string[] = []
    for (const nodeId of Object.keys(history.outputs)) {
      const output = history.outputs[nodeId]
      if (output?.images) {
        for (const image of output.images) {
          const imageUrl = await this.getImage(image.filename, image.subfolder, image.type)
          images.push(imageUrl)
        }
      }
    }

    return images
  }

  async generateImageWithProgress(
    workflowConfig: WorkflowConfig,
    prompt: string,
    onProgress?: (progress: ComfyUIProgress) => void
  ): Promise<string[]> {
    if (!this.client.isConnected()) {
      await this.client.connect()
    }

    let progressCleanup: (() => void) | undefined
    if (onProgress) {
      progressCleanup = this.onProgress(onProgress)
    }

    try {
      const result = await this.generateImage(workflowConfig, prompt)
      return result
    } finally {
      progressCleanup?.()
    }
  }

  async checkConnection(): Promise<boolean> {
    return this.client.checkConnection()
  }

  getClientId(): string {
    return this.clientId
  }

  getServerUrl(): string {
    return this.serverUrl
  }
}

let comfyUIService: ComfyUIService | null = null

export function initComfyUIService(
  serverUrl: string,
  projectId?: string,
  episodeId?: string
): ComfyUIService {
  comfyUIService = new ComfyUIService(serverUrl, projectId, episodeId)
  return comfyUIService
}

export function getComfyUIService(): ComfyUIService {
  if (!comfyUIService) {
    // 从配置中获取服务器地址
    const serverUrl = getComfyUIServerUrl()
    comfyUIService = new ComfyUIService(serverUrl)
  }
  return comfyUIService
}

/**
 * 设置 ComfyUI 服务的项目/剧集上下文
 */
export function setComfyUIContext(projectId?: string, episodeId?: string): void {
  if (comfyUIService) {
    comfyUIService.setContext(projectId, episodeId)
  }
}

export function resetComfyUIService(): void {
  if (comfyUIService) {
    comfyUIService.disconnect()
    comfyUIService = null
  }
}
