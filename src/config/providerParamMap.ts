// AI 厂商参数映射配置
// 统一参数 -> 厂商特定参数

export type ProviderType = 'doubao' | 'kling' | 'google' | 'openai' | 'minimax' | 'unknown'
export type ModelType = 'image' | 'video' | 'chat' | 'tts'

// 统一参数接口
export interface UnifiedParams {
  prompt: string
  width?: number
  height?: number
  aspectRatio?: string // 16:9, 9:16, 1:1, 4:3
  duration?: number // 视频时长（秒）
  quality?: string // standard, hd
  style?: string // vivid, natural
  n?: number // 生成数量
  // 视频特有
  resolution?: string // 480p, 720p, 1080p
  fps?: number // 帧率
  firstFrame?: string // 首帧图片 base64
  lastFrame?: string // 尾帧图片 base64
  // 对话特有
  messages?: Array<{ role: string; content: string }>
  temperature?: number
  maxTokens?: number
}

// 参数转换函数类型
export type ParamTransformer = (value: any, params?: UnifiedParams) => any

// 厂商参数映射配置
export interface ProviderConfig {
  name: string
  provider: ProviderType
  type: ModelType
  // 参数映射表: 统一参数名 -> 转换函数
  paramMapping: Record<string, ParamTransformer>
  // 必需参数
  requiredParams?: string[]
  // 默认值
  defaultParams?: Record<string, any>
  // 构建完整请求体
  buildRequestBody: (params: UnifiedParams, modelName: string) => any
  // 解析响应
  parseResponse: (response: any) => {
    url?: string
    dataUrl?: string
    taskId?: string
    content?: string
    error?: string
  }
  // 轮询配置（用于异步任务）
  polling?: {
    enabled: boolean
    getTaskId: (response: any) => string | undefined
    buildPollUrl: (taskId: string, baseUrl: string) => string
    checkComplete: (response: any) => boolean
    getResultUrl: (response: any) => string | undefined
  }
}

// 辅助函数：尺寸转换
const convertSize = (width?: number, height?: number): string => {
  if (!width || !height) return '1024x1024'
  return `${width}x${height}`
}

// 辅助函数：宽高比转换
const convertRatio = (aspectRatio?: string): string => {
  const ratioMap: Record<string, string> = {
    '16:9': '16:9',
    '9:16': '9:16',
    '1:1': '1:1',
    '4:3': '4:3',
    '3:4': '3:4',
  }
  return ratioMap[aspectRatio || ''] || '16:9'
}

// 辅助函数：分辨率转换
const convertResolution = (_width?: number, height?: number): string => {
  if (!height) return '720p'
  if (height >= 1080) return '1080p'
  if (height >= 720) return '720p'
  return '480p'
}

// ==================== 豆包配置 ====================
const doubaoImageConfig: ProviderConfig = {
  name: '豆包图像',
  provider: 'doubao',
  type: 'image',
  paramMapping: {
    prompt: p => p,
    size: (w, h) =>
      convertSize(typeof w === 'number' ? w : undefined, typeof h === 'number' ? h : undefined),
    n: n => n || 1,
  },
  buildRequestBody: (params, modelName) => ({
    model: modelName,
    prompt: params.prompt,
    size: convertSize(params.width, params.height),
    n: params.n || 1,
  }),
  parseResponse: response => {
    const url = response.data?.[0]?.url || response.url
    return { url }
  },
}

const doubaoVideoConfig: ProviderConfig = {
  name: '豆包视频',
  provider: 'doubao',
  type: 'video',
  paramMapping: {
    prompt: p => p,
    ratio: r => convertRatio(r),
    resolution: (_res, params) => convertResolution(params?.width, params?.height),
    duration: d => d || 5,
    firstFrame: f => f,
    lastFrame: l => l,
  },
  requiredParams: ['prompt'],
  buildRequestBody: (params, modelName) => {
    const body: any = {
      model: modelName,
      prompt: params.prompt,
      ratio: convertRatio(params.aspectRatio),
      resolution: convertResolution(params.width, params.height),
      duration: params.duration || 5,
    }
    // 添加首帧图片（图生视频模式）
    if (params.firstFrame) {
      body.first_frame = params.firstFrame
    }
    // 添加尾帧图片（首尾帧模式）
    if (params.lastFrame) {
      body.last_frame = params.lastFrame
    }
    return body
  },
  parseResponse: response => {
    const taskId = response.id || response.task_id
    if (taskId) {
      return { taskId }
    }
    const url = response.video_url || response.data?.[0]?.url
    return { url }
  },
  polling: {
    enabled: true,
    getTaskId: response => response.id || response.task_id,
    buildPollUrl: (taskId, baseUrl) =>
      `${baseUrl.replace(/\/$/, '')}/api/v3/contents/generations/tasks/${taskId}`,
    checkComplete: response => {
      const status = response.status || response.state
      return status === 'succeeded' || status === 'completed' || status === 'success'
    },
    getResultUrl: response => response.video_url || response.video?.url,
  },
}

// ==================== 可灵配置 ====================
const klingImageConfig: ProviderConfig = {
  name: '可灵图像',
  provider: 'kling',
  type: 'image',
  paramMapping: {
    prompt: p => p,
    width: w => w || 1024,
    height: h => h || 1024,
    n: n => n || 1,
  },
  buildRequestBody: (params, modelName) => ({
    model: modelName,
    prompt: params.prompt,
    width: params.width || 1024,
    height: params.height || 1024,
    n: params.n || 1,
  }),
  parseResponse: response => {
    const url = response.data?.[0]?.url || response.url
    return { url }
  },
}

const klingVideoConfig: ProviderConfig = {
  name: '可灵视频',
  provider: 'kling',
  type: 'video',
  paramMapping: {
    prompt: p => p,
    aspectRatio: r => convertRatio(r),
    duration: d => d || 5,
    fps: f => f || 30,
  },
  buildRequestBody: (params, modelName) => ({
    model: modelName,
    prompt: params.prompt,
    aspect_ratio: convertRatio(params.aspectRatio),
    duration: params.duration || 5,
    fps: params.fps || 30,
  }),
  parseResponse: response => {
    const taskId = response.task_id || response.id
    if (taskId) {
      return { taskId }
    }
    const url = response.data?.[0]?.url || response.video_url
    return { url }
  },
  polling: {
    enabled: true,
    getTaskId: response => response.task_id || response.id,
    buildPollUrl: (taskId, baseUrl) => `${baseUrl.replace(/\/$/, '')}/v2/videos/status/${taskId}`,
    checkComplete: response => {
      const status = response.status || response.state
      return status === 'completed' || status === 'success'
    },
    getResultUrl: response => response.data?.[0]?.url || response.video_url,
  },
}

// ==================== 谷歌配置 ====================
const googleImageConfig: ProviderConfig = {
  name: '谷歌图像',
  provider: 'google',
  type: 'image',
  paramMapping: {
    prompt: p => p,
  },
  buildRequestBody: (params, modelName) => ({
    model: modelName,
    contents: [
      {
        role: 'user',
        parts: [{ text: params.prompt }],
      },
    ],
    generationConfig: {
      temperature: params.temperature || 0.7,
    },
  }),
  parseResponse: response => {
    const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData
    if (inlineData) {
      return {
        dataUrl: `data:${inlineData.mimeType};base64,${inlineData.data}`,
      }
    }
    return { error: '未找到图像数据' }
  },
}

const googleVideoConfig: ProviderConfig = {
  name: '谷歌视频',
  provider: 'google',
  type: 'video',
  paramMapping: {
    prompt: p => p,
  },
  buildRequestBody: (params, modelName) => ({
    model: modelName,
    contents: [
      {
        role: 'user',
        parts: [{ text: params.prompt }],
      },
    ],
    generationConfig: {
      temperature: params.temperature || 0.7,
      responseModalities: ['VIDEO'],
    },
  }),
  parseResponse: response => {
    const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData
    if (inlineData) {
      return {
        dataUrl: `data:${inlineData.mimeType};base64,${inlineData.data}`,
      }
    }
    return { error: '未找到视频数据' }
  },
}

// ==================== OpenAI/Sora 配置 ====================
const openaiImageConfig: ProviderConfig = {
  name: 'OpenAI 图像',
  provider: 'openai',
  type: 'image',
  paramMapping: {
    prompt: p => p,
    size: (w, h) => {
      // OpenAI 只支持特定尺寸
      const size = convertSize(
        typeof w === 'number' ? w : undefined,
        typeof h === 'number' ? h : undefined
      )
      const validSizes = ['1024x1024', '1024x1792', '1792x1024']
      return validSizes.includes(size) ? size : '1024x1024'
    },
    quality: q => q || 'standard',
    style: s => s || 'vivid',
    n: n => n || 1,
  },
  buildRequestBody: (params, modelName) => ({
    model: modelName,
    prompt: params.prompt,
    size: openaiImageConfig.paramMapping.size!(params.width, params),
    quality: params.quality || 'standard',
    style: params.style || 'vivid',
    n: params.n || 1,
  }),
  parseResponse: response => {
    const url = response.data?.[0]?.url
    const _revisedPrompt = response.data?.[0]?.revised_prompt
    return { url }
  },
}

const soraVideoConfig: ProviderConfig = {
  name: 'Sora 视频',
  provider: 'openai',
  type: 'video',
  paramMapping: {
    prompt: p => p,
    aspectRatio: r => convertRatio(r),
  },
  buildRequestBody: (params, modelName) => ({
    model: modelName,
    prompt: params.prompt,
    aspect_ratio: convertRatio(params.aspectRatio),
  }),
  parseResponse: response => {
    const url = response.data?.[0]?.url || response.url
    return { url }
  },
}

const googleChatConfig: ProviderConfig = {
  name: '谷歌对话',
  provider: 'google',
  type: 'chat',
  paramMapping: {
    prompt: p => p,
    temperature: t => t || 0.7,
  },
  buildRequestBody: (params, modelName) => ({
    model: modelName,
    contents: [
      {
        role: 'user',
        parts: [{ text: params.prompt }],
      },
    ],
    generationConfig: {
      temperature: params.temperature || 0.7,
    },
  }),
  parseResponse: response => {
    const content = response.candidates?.[0]?.content?.parts?.[0]?.text
    return { content }
  },
}

const openaiChatConfig: ProviderConfig = {
  name: 'OpenAI 对话',
  provider: 'openai',
  type: 'chat',
  paramMapping: {
    messages: m => m,
    temperature: t => t || 0.7,
    maxTokens: m => m || 2000,
  },
  buildRequestBody: (params, modelName) => ({
    model: modelName,
    messages: params.messages || [{ role: 'user', content: params.prompt }],
    temperature: params.temperature || 0.7,
    max_tokens: params.maxTokens || 2000,
  }),
  parseResponse: response => {
    const content = response.choices?.[0]?.message?.content
    return { content }
  },
}

// ==================== 模型映射表 ====================
// 根据 modelName 关键词匹配配置
export const modelConfigMap: Record<string, ProviderConfig> = {
  // 豆包图像
  'doubao-seedream': doubaoImageConfig,
  // 豆包视频
  'doubao-seedance': doubaoVideoConfig,
  'doubao-veo': doubaoVideoConfig,
  // 注意：veo3 是 Google 的模型，不在此映射，由 Veo31Provider 专门处理
  // 可灵
  kling: klingVideoConfig, // 默认可灵是视频
  'kling-image': klingImageConfig,
  'kling-video': klingVideoConfig,
  // 谷歌
  gemini: googleChatConfig,
  'gemini-image': googleImageConfig,
  'gemini-video': googleVideoConfig,
  // OpenAI
  'dall-e': openaiImageConfig,
  gpt: openaiChatConfig,
  // Sora
  sora: soraVideoConfig,
}

// ==================== 检测函数 ====================
export function detectProvider(modelName: string): {
  config: ProviderConfig | null
  provider: ProviderType
  type: ModelType
} {
  const name = modelName.toLowerCase()

  // 按优先级匹配
  for (const [key, config] of Object.entries(modelConfigMap)) {
    if (name.includes(key.toLowerCase())) {
      return {
        config,
        provider: config.provider,
        type: config.type,
      }
    }
  }

  // 默认返回 OpenAI 格式
  return {
    config: openaiChatConfig,
    provider: 'openai',
    type: 'chat',
  }
}

// ==================== 构建请求体 ====================
export function buildRequestBody(
  modelName: string,
  params: UnifiedParams
): { body: any; config: ProviderConfig } {
  const { config } = detectProvider(modelName)

  if (!config) {
    // 默认使用 OpenAI 格式
    return {
      body: {
        model: modelName,
        prompt: params.prompt,
      },
      config: openaiChatConfig,
    }
  }

  const body = config.buildRequestBody(params, modelName)
  return { body, config }
}

// ==================== 解析响应 ====================
export function parseResponse(
  modelName: string,
  response: any
): {
  url?: string
  dataUrl?: string
  taskId?: string
  content?: string
  error?: string
} {
  const { config } = detectProvider(modelName)

  if (!config) {
    // 默认解析
    return {
      url: response.data?.[0]?.url || response.url,
      content: response.choices?.[0]?.message?.content,
    }
  }

  return config.parseResponse(response)
}

// ==================== 获取轮询配置 ====================
export function getPollingConfig(modelName: string) {
  const { config } = detectProvider(modelName)
  return config?.polling || null
}
