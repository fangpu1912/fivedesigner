export type WorkflowNodeType = 'image_gen' | 'video_gen' | 'tts' | 'script' | 'condition' | 'merge'

export interface WorkflowNode {
  id: string
  type: WorkflowNodeType
  name: string
  config: Record<string, unknown>
  inputs: WorkflowPort[]
  outputs: WorkflowPort[]
  position: { x: number; y: number }
  inputMapping?: Record<string, string>
}

export interface WorkflowPort {
  id: string
  name: string
  type: 'image' | 'video' | 'audio' | 'text' | 'any'
  required: boolean
}

export interface WorkflowEdge {
  id: string
  source: string
  sourcePort: string
  target: string
  targetPort: string
}

export interface Workflow {
  id: string
  name: string
  description?: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  variables: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export interface WorkflowExecution {
  id: string
  workflowId: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  currentNode?: string
  progress: number
  inputs: Record<string, unknown>
  outputs: Record<string, unknown>
  logs: WorkflowLog[]
  startedAt?: number
  completedAt?: number
}

export interface WorkflowLog {
  timestamp: number
  nodeId: string
  level: 'info' | 'warn' | 'error'
  message: string
}

export interface WorkflowTemplate {
  id: string
  name: string
  description?: string
  category: string
  workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>
  thumbnail?: string
}

export interface NodeExecutionResult {
  success: boolean
  outputs: Record<string, unknown>
  error?: string
}

export interface ExecutionContext {
  workflow: Workflow
  execution: WorkflowExecution
  nodeOutputs: Map<string, Record<string, unknown>>
  variables: Record<string, unknown>
  onProgress?: (progress: number, currentNode?: string) => void
  onLog?: (log: WorkflowLog) => void
}

export type ExecutionCallback = {
  onProgress?: (progress: number, currentNode?: string) => void
  onLog?: (log: WorkflowLog) => void
  onNodeComplete?: (nodeId: string, result: NodeExecutionResult) => void
  onComplete?: (execution: WorkflowExecution) => void
  onError?: (error: Error) => void
}
