export interface APIEndpoint {
  id: string
  name: string
  provider: APIProvider
  baseUrl: string
  apiKey?: string
  headers?: Record<string, string>
  endpoints?: Record<string, string>
  authType?: 'none' | 'bearer' | 'apiKey' | 'basic'
  parameters?: APIParameterExtended[]
  mappings?: APIMapping[]
  responseMapping?: ResponseMapping
}

export interface APIParameterExtended {
  name: string
  label?: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'image'
  required: boolean
  defaultValue?: unknown
  description?: string
  validation?: {
    min?: number
    max?: number
    enum?: string[]
    pattern?: string
  }
}

export interface APIMapping {
  id: string
  apiParameter: string
  sourceField: string
  defaultValue?: unknown
  transformation?: string
  condition?: string
}

export type APIProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'stability'
  | 'midjourney'
  | 'runway'
  | 'pika'
  | 'kling'
  | 'hailuo'
  | 'veo'
  | 'comfyui'
  | 'stablediffusion'
  | 'custom'

export interface APITemplate {
  id: string
  name: string
  provider: APIProvider
  endpoint?: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  headers?: Record<string, string>
  parameters: Record<string, unknown>
  mappings?: APIMapping[]
  responseMapping?: ResponseMapping
  description?: string
}

export interface APIParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  required: boolean
  defaultValue?: unknown
  description?: string
}

export interface ResponseMapping {
  successPath?: string
  dataPath?: string
  errorPath?: string
}

export interface ApiEndpointMapping {
  id: string
  name: string
  provider: APIProvider
  baseUrl: string
  endpoints: {
    generate?: string
    status?: string
    result?: string
    cancel?: string
  }
  headers?: Record<string, string>
  parameters?: Record<string, unknown>
  durationField?: string
  temperatureField?: string
}

export interface APIConfig {
  id: string
  name: string
  provider: APIProvider
  apiKey: string
  baseUrl?: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

// 参数映射类型
export interface ParameterMapping {
  id: string
  sourceField: string
  targetField: string
  transformation?: string
  defaultValue?: unknown
  condition?: string
}

// API 响应类型
export interface APIResponse {
  success: boolean
  data?: unknown
  error?: string
  statusCode?: number
}

// 转换函数类型
export interface TransformationFunction {
  id: string
  name: string
  description: string
  fn: (value: unknown, context?: unknown) => unknown | Promise<unknown>
}

// 源字段类型
export interface SourceField {
  value: string
  label: string
  category: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'image'
}
