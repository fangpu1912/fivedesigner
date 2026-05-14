export interface ComfyUIWorkflow {
  id: string
  name: string
  description?: string
  nodes: ComfyUINode[]
  links: ComfyUILink[]
}

export interface ComfyUINode {
  id: number
  type: string
  inputs?: Record<string, unknown>
  outputs?: Record<string, unknown>
  pos?: [number, number]
  size?: { width: number; height: number }
}

export interface ComfyUILink {
  id: number
  fromNode: number
  fromSlot: number
  toNode: number
  toSlot: number
  type: string
}

export interface ComfyUIQueueItem {
  promptId: string
  status: 'running' | 'pending' | 'completed' | 'failed'
  progress?: number
  outputs?: Record<string, unknown>
}

export interface ComfyUIHistory {
  promptId: string
  status: string
  outputs: Record<string, { images?: Array<{ filename: string; subfolder: string; type: string }> }>
}

export interface ComfyUIHistoryItem {
  prompt: Record<string, unknown>
  outputs: Record<string, { images?: Array<{ filename: string; subfolder: string; type: string }> }>
  status: {
    status_str: string
    completed: boolean
    messages: string[][]
  }
}

export interface ComfyUIQueueResponse {
  prompt_id: string
  number: number
  node_errors?: Record<string, unknown>
}

export interface ComfyUIQueueStatus {
  queue_running: Array<{ prompt: Record<string, unknown>; prompt_id: string }>
  queue_pending: Array<{ prompt: Record<string, unknown>; prompt_id: string }>
}

export interface ComfyUIProgress {
  value: number
  max: number
  promptId?: string
}

export interface ComfyUIExecuted {
  prompt_id: string
  output: Record<string, unknown>
}

export interface ComfyUIExecuteStart {
  prompt_id: string
}

export interface ComfyUIError {
  type: string
  message: string
  details?: unknown
}

export interface ComfyUIUploadResponse {
  name: string
  subfolder: string
  type: string
}

export interface ComfyUIClientConfig {
  serverUrl: string
  clientId?: string
  reconnectInterval?: number
  maxReconnectAttempts?: number
  projectId?: string
  episodeId?: string
}

export type ComfyUIEventType =
  | 'status'
  | 'progress'
  | 'executing'
  | 'executed'
  | 'execution_start'
  | 'execution_error'
  | 'connected'
  | 'disconnected'
  | 'error'

export interface ComfyUIEvent {
  type: ComfyUIEventType
  data: unknown
}

export type ComfyUIEventHandler = (event: ComfyUIEvent) => void
