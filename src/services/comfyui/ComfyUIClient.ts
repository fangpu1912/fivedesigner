import { saveMediaFile } from '@/utils/mediaStorage'

import { httpProxy } from '../tauri'

import type {
  ComfyUIClientConfig,
  ComfyUIEventHandler,
  ComfyUIEvent,
  ComfyUIEventType,
  ComfyUIQueueStatus,
  ComfyUIQueueResponse,
  ComfyUIHistoryItem,
  ComfyUIUploadResponse,
  ComfyUIProgress,
} from './types'

export class ComfyUIClient {
  private serverUrl: string
  private wsUrl: string
  private clientId: string
  private ws: WebSocket | null = null
  private reconnectInterval: number
  private maxReconnectAttempts: number
  private reconnectAttempts: number = 0
  private eventHandlers: Map<ComfyUIEventType, Set<ComfyUIEventHandler>> = new Map()
  private isConnecting: boolean = false
  private shouldReconnect: boolean = true
  private projectId?: string
  private episodeId?: string

  constructor(config: ComfyUIClientConfig) {
    this.serverUrl = config.serverUrl.replace(/\/$/, '')
    this.wsUrl = this.serverUrl.replace(/^http/, 'ws')
    this.clientId =
      config.clientId || `fivedesigner-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    this.reconnectInterval = config.reconnectInterval || 3000
    this.maxReconnectAttempts = config.maxReconnectAttempts || 10
    this.projectId = config.projectId
    this.episodeId = config.episodeId
  }

  /**
   * 更新项目/剧集上下文
   */
  setContext(projectId?: string, episodeId?: string): void {
    this.projectId = projectId
    this.episodeId = episodeId
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // 如果已经连接，直接返回
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve()
        return
      }

      // 如果正在连接中，等待连接完成
      if (this.isConnecting) {
        // 设置一个超时检查
        const checkInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            clearInterval(checkInterval)
            resolve()
          } else if (!this.isConnecting) {
            clearInterval(checkInterval)
            reject(new Error('Connection failed'))
          }
        }, 100)
        return
      }

      // 清理旧的连接
      this.cleanup()

      this.isConnecting = true
      this.shouldReconnect = true

      // 设置连接超时
      const connectionTimeout = setTimeout(() => {
        if (this.isConnecting) {
          this.isConnecting = false
          this.cleanup()
          reject(new Error('Connection timeout: WebSocket connection timed out after 10s'))
        }
      }, 10000)

      try {
        this.ws = new WebSocket(`${this.wsUrl}/ws?clientId=${this.clientId}`)

        this.ws.onopen = () => {
          clearTimeout(connectionTimeout)
          this.isConnecting = false
          this.reconnectAttempts = 0
          this.emit({ type: 'connected', data: { clientId: this.clientId } })
          resolve()
        }

        this.ws.onclose = event => {
          this.isConnecting = false
          this.emit({ type: 'disconnected', data: { code: event.code, reason: event.reason } })

          // 清理当前连接
          this.cleanup()

          // 自动重连
          if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++
            console.log(
              `[ComfyUIClient] Reconnecting... Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`
            )
            setTimeout(() => {
              if (this.shouldReconnect) {
                this.connect().catch(() => {
                  // 重连失败会在 onclose 中继续处理
                })
              }
            }, this.reconnectInterval)
          }
        }

        this.ws.onerror = error => {
          clearTimeout(connectionTimeout)
          this.isConnecting = false
          this.emit({ type: 'error', data: error })
          // 错误时清理连接并 reject
          this.cleanup()
          reject(new Error(`WebSocket error: ${error.type || 'Unknown error'}`))
        }

        this.ws.onmessage = event => {
          this.handleMessage(event.data)
        }
      } catch (error) {
        clearTimeout(connectionTimeout)
        this.isConnecting = false
        this.cleanup()
        reject(error)
      }
    })
  }

  disconnect(): void {
    this.shouldReconnect = false
    this.cleanup()
  }

  /**
   * 清理 WebSocket 连接
   */
  private cleanup(): void {
    if (this.ws) {
      // 移除所有事件监听器
      this.ws.onopen = null
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.onmessage = null

      // 关闭连接
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close()
      }

      this.ws = null
    }
  }

  private handleMessage(data: string | Blob): void {
    try {
      if (data instanceof Blob) {
        // 检查是否是图片数据（通常是较大的二进制数据）
        if (data.size > 1000) {
          // 可能是图片数据，跳过解析
          return
        }
        // 处理文本Blob数据
        const reader = new FileReader()
        reader.onload = e => {
          if (e.target?.result) {
            this.handleMessage(e.target.result as string)
          }
        }
        reader.readAsText(data)
        return
      }

      // 检查数据是否以 { 开头（JSON格式）
      if (!data.trim().startsWith('{')) {
        // 不是JSON格式，跳过
        return
      }

      const message = JSON.parse(data)
      const type = message.type as ComfyUIEventType

      switch (type) {
        case 'status':
          this.emit({ type: 'status', data: message.data })
          break
        case 'progress': {
          const progress: ComfyUIProgress = {
            value: message.data.value,
            max: message.data.max,
          }
          this.emit({ type: 'progress', data: progress })
          break
        }
        case 'executing':
          this.emit({ type: 'executing', data: message.data })
          break
        case 'executed':
          this.emit({ type: 'executed', data: message.data })
          break
        case 'execution_start':
          this.emit({ type: 'execution_start', data: message.data })
          break
        case 'execution_error':
          this.emit({ type: 'execution_error', data: message.data })
          break
      }
    } catch (error) {
      console.error('Failed to parse ComfyUI message:', error)
    }
  }

  private emit(event: ComfyUIEvent): void {
    const handlers = this.eventHandlers.get(event.type)
    if (handlers) {
      handlers.forEach(handler => handler(event))
    }
  }

  on(eventType: ComfyUIEventType, handler: ComfyUIEventHandler): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set())
    }
    this.eventHandlers.get(eventType)!.add(handler)

    return () => {
      this.eventHandlers.get(eventType)?.delete(handler)
    }
  }

  off(eventType: ComfyUIEventType, handler: ComfyUIEventHandler): void {
    this.eventHandlers.get(eventType)?.delete(handler)
  }

  async queuePrompt(workflow: Record<string, unknown>): Promise<ComfyUIQueueResponse> {
    const response = await httpProxy({
      method: 'POST',
      url: `${this.serverUrl}/prompt`,
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        prompt: workflow,
        client_id: this.clientId,
      },
    })

    if (response.status !== 200) {
      const error = JSON.parse(response.body)
      console.error('[ComfyUIClient] Queue prompt failed:', error)
      console.error('[ComfyUIClient] Node errors:', error.node_errors)
      const errorMessage = error.error?.message || error.error || 'Prompt validation failed'
      const nodeErrors = error.node_errors ? JSON.stringify(error.node_errors, null, 2) : ''
      throw new Error(`ComfyUI Error: ${errorMessage}\nNode Errors: ${nodeErrors}`)
    }

    return JSON.parse(response.body)
  }

  async getQueue(): Promise<ComfyUIQueueStatus> {
    const response = await httpProxy({
      method: 'GET',
      url: `${this.serverUrl}/queue`,
    })

    if (response.status !== 200) {
      throw new Error('Failed to get queue status')
    }

    return JSON.parse(response.body)
  }

  async interrupt(): Promise<void> {
    const response = await httpProxy({
      method: 'POST',
      url: `${this.serverUrl}/interrupt`,
    })

    if (response.status !== 200) {
      throw new Error('Failed to interrupt')
    }
  }

  async clearQueue(): Promise<void> {
    const response = await httpProxy({
      method: 'POST',
      url: `${this.serverUrl}/queue`,
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        clear: true,
      },
    })

    if (response.status !== 200) {
      throw new Error('Failed to clear queue')
    }
  }

  async getHistory(promptId: string): Promise<Record<string, ComfyUIHistoryItem>> {
    const response = await httpProxy({
      method: 'GET',
      url: `${this.serverUrl}/history/${promptId}`,
    })

    if (response.status !== 200) {
      throw new Error('Failed to get history')
    }

    return JSON.parse(response.body)
  }

  async uploadImage(
    imageData: ArrayBuffer,
    filename: string,
    subfolder: string = '',
    overwrite: boolean = true
  ): Promise<ComfyUIUploadResponse> {
    const blob = new Blob([imageData], { type: 'image/png' })
    const formData = new FormData()
    formData.append('image', blob, filename)
    formData.append('type', 'input')
    formData.append('subfolder', subfolder)
    formData.append('overwrite', overwrite ? 'true' : 'false')

    const response = await fetch(`${this.serverUrl}/upload/image`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
      throw new Error(`Failed to upload image: ${errorData.message || response.statusText}`)
    }

    return response.json()
  }

  async uploadAudio(
    audioData: ArrayBuffer,
    filename: string,
    subfolder: string = ''
  ): Promise<ComfyUIUploadResponse> {
    console.log('[ComfyUIClient] Uploading audio file:', filename)

    // 创建 Blob 和 FormData
    const blob = new Blob([audioData], { type: 'audio/wav' })
    const formData = new FormData()
    formData.append('image', blob, filename) // ComfyUI 使用 image 字段接收文件
    formData.append('type', 'input')
    formData.append('subfolder', subfolder)

    // 使用 fetch API 直接发送 FormData（httpProxy 不支持 FormData）
    const response = await fetch(`${this.serverUrl}/upload/image`, {
      method: 'POST',
      body: formData,
    })

    console.log('[ComfyUIClient] Upload audio response:', response.status, response.statusText)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
      console.error('[ComfyUIClient] Upload audio failed:', errorData)
      throw new Error(`Failed to upload audio: ${errorData.message || response.statusText}`)
    }

    const result = await response.json()
    console.log('[ComfyUIClient] Upload audio success:', result)
    return result
  }

  async getFile(
    filename: string,
    subfolder: string,
    type: string,
    fileType: 'image' | 'video' | 'audio' = 'image'
  ): Promise<string> {
    const params = new URLSearchParams({
      filename,
      subfolder,
      type,
    })

    console.log('[ComfyUIClient] getFile called:', { filename, subfolder, type, fileType })

    try {
      // 使用 fetch 直接获取二进制数据
      const response = await fetch(`${this.serverUrl}/view?${params.toString()}`)

      if (!response.ok) {
        throw new Error('Failed to get image')
      }

      // 将二进制数据转换为 ArrayBuffer
      const arrayBuffer = await response.arrayBuffer()
      console.log('[ComfyUIClient] fetched arrayBuffer size:', arrayBuffer.byteLength)

      // 使用 mediaStorage 保存文件，统一目录结构
      const filePath = await saveMediaFile(
        arrayBuffer,
        filename,
        this.projectId,
        this.episodeId,
        fileType
      )

      console.log('[ComfyUIClient] saved file to:', filePath)

      // 返回本地文件路径，让调用方决定如何转换 URL
      return filePath
    } catch (error) {
      console.error('Failed to get image:', error)
      throw error
    }
  }

  async getImage(filename: string, subfolder: string, type: string): Promise<string> {
    return this.getFile(filename, subfolder, type, 'image')
  }

  async checkConnection(): Promise<boolean> {
    try {
      const response = await httpProxy({
        method: 'GET',
        url: `${this.serverUrl}/system_stats`,
      })
      return response.status === 200
    } catch {
      return false
    }
  }

  getClientId(): string {
    return this.clientId
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}
