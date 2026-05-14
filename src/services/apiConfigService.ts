/**
 * @file apiConfigService.ts
 * @description API 配置服务 - 管理 API 模式的配置预设
 * @author OneDesigner Team
 *
 * 类似 ComfyUI 工作流配置，为 API 模式提供可保存的配置预设
 */

import { localStorageService } from './localStorageService'

// API 配置类型（支持自定义）
export type ApiConfigType = 'chat' | 'image' | 'video' | 'tts' | string

// API 端点映射
export interface ApiEndpointMapping {
  // 请求体字段映射
  promptField?: string // 提示词字段名
  negativePromptField?: string // 负面提示词字段名
  widthField?: string // 宽度字段名
  heightField?: string // 高度字段名
  seedField?: string // 种子字段名
  modelField?: string // 模型字段名
  imagesField?: string // 多图/参考图片字段名
  firstFrameField?: string // 首帧图片字段名
  lastFrameField?: string // 尾帧图片字段名
  durationField?: string // 时长字段名
  temperatureField?: string // 温度字段名
  maxTokensField?: string // 最大 token 字段名
  // 响应体字段映射
  responseImageField?: string // 图片 URL 字段路径
  responseVideoField?: string // 视频 URL 字段路径
  responseAudioField?: string // 音频 URL 字段路径
}

// 默认参数配置
export interface ApiDefaultParams {
  width?: number
  height?: number
  aspectRatio?: string
  resolution?: string
  duration?: number
  temperature?: number
  maxTokens?: number
  n?: number
  seed?: number
  // 自定义参数
  [key: string]: any
}

// API 配置
export interface ApiConfig {
  id: string
  name: string
  type: ApiConfigType
  description?: string
  // 基础配置
  baseUrl: string
  apiKey?: string
  modelName: string
  // 端点映射
  endpoints: ApiEndpointMapping
  // 默认参数
  defaultParams: ApiDefaultParams
  // 请求头配置
  headers?: Record<string, string>
  // 请求体模板（JSON 字符串，支持占位符）
  requestTemplate?: string
  createdAt: string
  updatedAt: string
}

const STORAGE_KEY = 'api_configs'

/**
 * 获取所有 API 配置
 */
export async function getAllApiConfigs(): Promise<ApiConfig[]> {
  try {
    const configs = await localStorageService.getSetting<ApiConfig[]>(STORAGE_KEY)
    return configs || []
  } catch (error) {
    console.error('获取 API 配置失败:', error)
    return []
  }
}

/**
 * 根据类型获取 API 配置
 */
export async function getApiConfigsByType(type: ApiConfigType): Promise<ApiConfig[]> {
  const configs = await getAllApiConfigs()
  return configs.filter(c => c.type === type)
}

/**
 * 根据 ID 获取单个 API 配置
 */
export async function getApiConfigById(id: string): Promise<ApiConfig | undefined> {
  const configs = await getAllApiConfigs()
  return configs.find(c => c.id === id)
}

/**
 * 保存 API 配置
 */
export async function saveApiConfig(config: ApiConfig): Promise<void> {
  try {
    const configs = await getAllApiConfigs()
    const existingIndex = configs.findIndex(c => c.id === config.id)

    const now = new Date().toISOString()
    const configToSave: ApiConfig = {
      ...config,
      updatedAt: now,
      createdAt: config.createdAt || now,
    }

    if (existingIndex >= 0) {
      configs[existingIndex] = configToSave
    } else {
      configs.push(configToSave)
    }

    await localStorageService.setSetting(STORAGE_KEY, configs)
  } catch (error) {
    console.error('保存 API 配置失败:', error)
    throw error
  }
}

/**
 * 删除 API 配置
 */
export async function deleteApiConfig(id: string): Promise<void> {
  try {
    const configs = await getAllApiConfigs()
    const filtered = configs.filter((c: { id: string }) => c.id !== id)
    await localStorageService.setSetting(STORAGE_KEY, filtered)
  } catch (error) {
    console.error('删除 API 配置失败:', error)
    throw error
  }
}

/**
 * 创建默认的 API 配置
 */
export function createDefaultApiConfig(
  type: ApiConfigType,
  name: string,
  baseUrl: string,
  modelName: string
): ApiConfig {
  const now = new Date().toISOString()

  // 根据类型设置默认端点映射
  const endpoints: ApiEndpointMapping = getDefaultEndpoints(type)

  // 根据类型设置默认参数
  const defaultParams: ApiDefaultParams = getDefaultParams(type)

  return {
    id: crypto.randomUUID(),
    name,
    type,
    baseUrl,
    modelName,
    endpoints,
    defaultParams,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * 获取默认端点映射
 */
function getDefaultEndpoints(type: ApiConfigType): ApiEndpointMapping {
  switch (type) {
    case 'image':
      return {
        promptField: 'prompt',
        negativePromptField: 'negative_prompt',
        widthField: 'width',
        heightField: 'height',
        seedField: 'seed',
        modelField: 'model',
        responseImageField: 'data[0].url',
      }
    case 'video':
      return {
        promptField: 'prompt',
        widthField: 'width',
        heightField: 'height',
        durationField: 'duration',
        responseVideoField: 'data[0].url',
      }
    case 'tts':
      return {
        promptField: 'text',
        modelField: 'model',
        responseAudioField: 'data[0].url',
      }
    case 'chat':
    default:
      return {
        promptField: 'messages',
        modelField: 'model',
        temperatureField: 'temperature',
        maxTokensField: 'max_tokens',
      }
  }
}

/**
 * 获取默认参数
 */
function getDefaultParams(type: ApiConfigType): ApiDefaultParams {
  switch (type) {
    case 'image':
      return {
        width: 1024,
        height: 1024,
        aspectRatio: '1:1',
        n: 1,
        temperature: 0.7,
      }
    case 'video':
      return {
        width: 1280,
        height: 720,
        resolution: '720p',
        duration: 5,
        aspectRatio: '16:9',
      }
    case 'tts':
      return {
        temperature: 0.7,
      }
    case 'chat':
    default:
      return {
        temperature: 0.7,
        maxTokens: 2000,
      }
  }
}

/**
 * 从响应中提取 URL
 */
export function extractUrlFromResponse(response: any, fieldPath: string): string | undefined {
  if (!fieldPath) return undefined

  const parts = fieldPath.split('.')
  let value = response

  for (const part of parts) {
    // 处理数组索引，如 data[0]
    const arrayMatch = part.match(/^(.+)\[(\d+)\]$/)
    if (arrayMatch) {
      const [, key, indexStr] = arrayMatch
      const keyValue = key ?? ''
      const index = parseInt(indexStr ?? '0')
      const arr = value?.[keyValue]
      if (Array.isArray(arr)) {
        value = arr[index]
      } else {
        return undefined
      }
    } else {
      value = value?.[part]
    }

    if (value === undefined) return undefined
  }

  return typeof value === 'string' ? value : undefined
}

/**
 * 构建请求体
 */
export function buildRequestBody(config: ApiConfig, params: Record<string, any>): any {
  // 如果有自定义模板，使用模板
  if (config.requestTemplate) {
    let template = config.requestTemplate
    // 替换占位符
    Object.entries(params).forEach(([key, value]) => {
      template = template.replace(new RegExp(`{{${key}}}`, 'g'), String(value))
    })
    return JSON.parse(template)
  }

  // 否则使用端点映射构建
  const body: Record<string, any> = {}

  if (config.endpoints.modelField) {
    body[config.endpoints.modelField] = config.modelName
  }

  if (config.endpoints.promptField && params.prompt) {
    body[config.endpoints.promptField] = params.prompt
  }

  if (config.endpoints.negativePromptField && params.negativePrompt) {
    body[config.endpoints.negativePromptField] = params.negativePrompt
  }

  if (config.endpoints.widthField && params.width) {
    body[config.endpoints.widthField] = params.width
  }

  if (config.endpoints.heightField && params.height) {
    body[config.endpoints.heightField] = params.height
  }

  if (config.endpoints.seedField && params.seed !== undefined) {
    body[config.endpoints.seedField] = params.seed
  }

  // 多图/参考图片字段
  if (config.endpoints.imagesField && params.images && params.images.length > 0) {
    body[config.endpoints.imagesField] = params.images
  }

  // 首帧图片字段
  if (config.endpoints.firstFrameField && params.firstFrame) {
    body[config.endpoints.firstFrameField] = params.firstFrame
  }

  // 尾帧图片字段
  if (config.endpoints.lastFrameField && params.lastFrame) {
    body[config.endpoints.lastFrameField] = params.lastFrame
  }

  // 添加其他自定义参数
  Object.entries(params).forEach(([key, value]) => {
    if (!body[key] && value !== undefined) {
      body[key] = value
    }
  })

  return body
}

export const apiConfigService = {
  getAllApiConfigs,
  getApiConfigsByType,
  getApiConfigById,
  saveApiConfig,
  deleteApiConfig,
  createDefaultApiConfig,
  extractUrlFromResponse,
  buildRequestBody,
}

export default apiConfigService
