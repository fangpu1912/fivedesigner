export interface ParamField {
  name: string
  label: string
  type: 'select' | 'number' | 'text' | 'checkbox' | 'slider'
  options?: Array<{ value: string; label: string }>
  defaultValue: unknown
  min?: number
  max?: number
  step?: number
  description?: string
}

export interface ProviderConfig {
  name: string
  baseUrl: string
  paramMapping: Record<string, string>
  defaultParams: Record<string, unknown>
  paramTransformers?: Record<string, (value: unknown) => unknown>
  buildRequestBody: (model: string, prompt: string, params: Record<string, unknown>) => object
  parseResponse?: (response: any) => any
  paramFields: {
    image?: ParamField[]
    video?: ParamField[]
    chat?: ParamField[]
    tts?: ParamField[]
  }
}

export interface ImageGenerationParams {
  prompt: string
  size?: '1024x1024' | '1024x1536' | '1536x1024' | '2048x2048' | '2K' | '4K'
  quality?: 'standard' | 'high'
  style?: 'vivid' | 'natural'
  n?: number
}

export interface VideoGenerationParams {
  prompt: string
  resolution?: '480p' | '720p' | '1080p'
  ratio?: '16:9' | '4:3' | '1:1' | '9:16'
  duration?: number
  imageUrl?: string
}

export interface DubbingParams {
  text: string
  voiceId?: string
  speed?: number
  pitch?: number
  volume?: number
  emotion?: string
}

export const openaiConfig: ProviderConfig = {
  name: 'OpenAI',
  baseUrl: 'https://api.openai.com',
  paramMapping: { size: 'size', quality: 'quality', style: 'style', n: 'n' },
  defaultParams: { size: '1024x1024', quality: 'standard', n: 1 },
  buildRequestBody: (model, prompt, params) => ({ model, prompt, ...params }),
  paramFields: {
    image: [
      {
        name: 'size',
        label: 'Size',
        type: 'select',
        defaultValue: '1024x1024',
        options: [
          { value: '1024x1024', label: '1:1' },
          { value: '1024x1536', label: '2:3' },
          { value: '1536x1024', label: '3:2' },
        ],
      },
      {
        name: 'quality',
        label: 'Quality',
        type: 'select',
        defaultValue: 'standard',
        options: [
          { value: 'standard', label: 'Standard' },
          { value: 'high', label: 'High' },
        ],
      },
      {
        name: 'style',
        label: 'Style',
        type: 'select',
        defaultValue: 'vivid',
        options: [
          { value: 'vivid', label: 'Vivid' },
          { value: 'natural', label: 'Natural' },
        ],
      },
      { name: 'n', label: 'Count', type: 'number', defaultValue: 1, min: 1, max: 4 },
    ],
    chat: [],
  },
}

export const volcesConfig: ProviderConfig = {
  name: 'Volces',
  baseUrl: 'https://ark.cn-beijing.volces.com',
  paramMapping: { size: 'size', resolution: 'resolution', ratio: 'ratio', duration: 'duration' },
  defaultParams: { size: '2048x2048', resolution: '720p', ratio: '16:9', duration: 5 },
  buildRequestBody: (model, prompt, params) => ({ model, prompt, ...params }),
  paramFields: {
    image: [
      {
        name: 'size',
        label: 'Size',
        type: 'select',
        defaultValue: '2048x2048',
        options: [
          { value: '2048x2048', label: '1:1' },
          { value: '2048x3072', label: '2:3' },
          { value: '3072x2048', label: '3:2' },
        ],
      },
    ],
    video: [
      {
        name: 'resolution',
        label: 'Resolution',
        type: 'select',
        defaultValue: '720p',
        options: [
          { value: '480p', label: '480p' },
          { value: '720p', label: '720p' },
          { value: '1080p', label: '1080p' },
        ],
      },
      {
        name: 'ratio',
        label: 'Ratio',
        type: 'select',
        defaultValue: '16:9',
        options: [
          { value: '16:9', label: '16:9' },
          { value: '4:3', label: '4:3' },
          { value: '1:1', label: '1:1' },
          { value: '9:16', label: '9:16' },
        ],
      },
      { name: 'duration', label: 'Duration', type: 'number', defaultValue: 5, min: 2, max: 12 },
    ],
  },
}

export const geminiConfig: ProviderConfig = {
  name: 'Gemini',
  baseUrl: 'https://generativelanguage.googleapis.com',
  paramMapping: {},
  defaultParams: {},
  buildRequestBody: (model, prompt, params) => ({
    model,
    contents: [{ parts: [{ text: prompt }] }],
    ...params,
  }),
  paramFields: { chat: [] },
}

// MiniMax 图片生成配置
// API文档: https://platform.minimaxi.com/document/ImageGeneration
export const minimaxImageConfig: ProviderConfig = {
  name: 'MiniMax Image',
  baseUrl: 'https://api.minimaxi.com',
  paramMapping: {
    prompt: 'prompt',
    aspectRatio: 'aspect_ratio',
    n: 'n',
    quality: 'quality',
  },
  defaultParams: { n: 1, quality: 'standard' },
  buildRequestBody: (model, prompt, params) => ({
    model: model || 'image-01',
    prompt,
    aspect_ratio: params.aspectRatio || '1:1',
    n: params.n || 1,
    quality: params.quality || 'standard',
  }),
  parseResponse: (response) => {
    // MiniMax 返回格式: { data: { image_urls: [...] } }
    if (response.data?.image_urls?.length > 0) {
      return { imageUrl: response.data.image_urls[0] }
    }
    return response
  },
  paramFields: {
    image: [
      {
        name: 'aspectRatio',
        label: '宽高比',
        type: 'select',
        defaultValue: '1:1',
        options: [
          { value: '1:1', label: '1:1 正方形' },
          { value: '16:9', label: '16:9 宽屏' },
          { value: '9:16', label: '9:16 竖屏' },
          { value: '4:3', label: '4:3 标准' },
          { value: '3:4', label: '3:4 竖版' },
        ],
      },
      {
        name: 'quality',
        label: '质量',
        type: 'select',
        defaultValue: 'standard',
        options: [
          { value: 'standard', label: '标准' },
          { value: 'high', label: '高清' },
        ],
      },
      { name: 'n', label: '数量', type: 'number', defaultValue: 1, min: 1, max: 4 },
    ],
  },
}

// MiniMax 视频生成配置
// API文档: https://platform.minimaxi.com/document/VideoGeneration
export const minimaxVideoConfig: ProviderConfig = {
  name: 'MiniMax Video',
  baseUrl: 'https://api.minimaxi.com',
  paramMapping: {
    prompt: 'prompt',
    imageUrl: 'first_frame_image',
    duration: 'duration',
    resolution: 'resolution',
  },
  defaultParams: { duration: 5, resolution: '720p' },
  buildRequestBody: (model, prompt, params) => {
    const body: Record<string, unknown> = {
      model: model || 'video-01',
      prompt,
      duration: params.duration || 5,
      resolution: params.resolution || '720p',
    }
    // 如果提供了首帧图片，添加到请求
    if (params.imageUrl) {
      body.first_frame_image = params.imageUrl
    }
    return body
  },
  parseResponse: (response) => {
    // MiniMax 视频生成通常是异步的，返回 task_id
    if (response.task_id) {
      return { taskId: response.task_id }
    }
    return response
  },
  paramFields: {
    video: [
      {
        name: 'duration',
        label: '时长(秒)',
        type: 'select',
        defaultValue: '5',
        options: [
          { value: '5', label: '5秒' },
          { value: '10', label: '10秒' },
        ],
      },
      {
        name: 'resolution',
        label: '分辨率',
        type: 'select',
        defaultValue: '720p',
        options: [
          { value: '480p', label: '480p' },
          { value: '720p', label: '720p' },
          { value: '1080p', label: '1080p' },
        ],
      },
    ],
  },
}

// MiniMax TTS 配音配置（增强版）
// API文档: https://platform.minimaxi.com/document/T2A
export const minimaxTTSConfig: ProviderConfig = {
  name: 'MiniMax TTS',
  baseUrl: 'https://api.minimax.chat',
  paramMapping: {
    voiceId: 'voice_id',
    speed: 'speed',
    pitch: 'pitch',
    volume: 'volume',
    emotion: 'emotion',
    sampleRate: 'sample_rate',
    bitrate: 'bitrate',
    format: 'format',
  },
  defaultParams: {
    speed: 1,
    pitch: 0,
    volume: 1,
    sampleRate: 32000,
    bitrate: 128000,
    format: 'mp3',
  },
  buildRequestBody: (model, prompt, params) => ({
    model: model || 'speech-01-turbo',
    text: prompt,
    voice_id: params.voiceId || 'female-shaonv',
    speed: params.speed ?? 1,
    pitch: params.pitch ?? 0,
    volume: params.volume ?? 1,
    emotion: params.emotion || 'neutral',
    sample_rate: params.sampleRate ?? 32000,
    bitrate: params.bitrate ?? 128000,
    format: params.format || 'mp3',
  }),
  parseResponse: (response) => {
    // MiniMax TTS 返回音频 URL
    if (response.data?.audio_url) {
      return { audioUrl: response.data.audio_url }
    }
    return response
  },
  paramFields: {
    tts: [
      {
        name: 'voiceId',
        label: '音色',
        type: 'select',
        defaultValue: 'female-shaonv',
        options: [
          { value: 'female-shaonv', label: '少女音' },
          { value: 'male-qn-qingse', label: '青年音-青涩' },
          { value: 'male-qn-jingying', label: '青年音-精英' },
          { value: 'female-chengshu', label: '成熟女声' },
          { value: 'male-chengshu', label: '成熟男声' },
          { value: 'female-yuzhong', label: '御姐音' },
          { value: 'male-dashu', label: '大叔音' },
        ],
      },
      {
        name: 'speed',
        label: '语速',
        type: 'slider',
        defaultValue: 1,
        min: 0.5,
        max: 2,
        step: 0.1,
      },
      {
        name: 'pitch',
        label: '音调',
        type: 'slider',
        defaultValue: 0,
        min: -12,
        max: 12,
        step: 1,
      },
      {
        name: 'volume',
        label: '音量',
        type: 'slider',
        defaultValue: 1,
        min: 0.1,
        max: 3,
        step: 0.1,
      },
      {
        name: 'emotion',
        label: '情感',
        type: 'select',
        defaultValue: 'neutral',
        options: [
          { value: 'neutral', label: '中性' },
          { value: 'happy', label: '开心' },
          { value: 'sad', label: '悲伤' },
          { value: 'angry', label: '愤怒' },
          { value: 'fearful', label: '恐惧' },
          { value: 'disgusted', label: '厌恶' },
          { value: 'surprised', label: '惊讶' },
          { value: 'curious', label: '好奇' },
          { value: 'embarrassed', label: '尴尬' },
        ],
      },
      {
        name: 'format',
        label: '格式',
        type: 'select',
        defaultValue: 'mp3',
        options: [
          { value: 'mp3', label: 'MP3' },
          { value: 'wav', label: 'WAV' },
          { value: 'pcm', label: 'PCM' },
        ],
      },
    ],
  },
}

// DeepSeek 配置
// API文档: https://platform.deepseek.com/api-docs/
export const deepseekConfig: ProviderConfig = {
  name: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com',
  paramMapping: {
    temperature: 'temperature',
    maxTokens: 'max_tokens',
    topP: 'top_p',
    stream: 'stream',
  },
  defaultParams: {
    temperature: 1.0,
    maxTokens: 4096,
    topP: 1.0,
    stream: false,
  },
  buildRequestBody: (model, prompt, params) => ({
    model: model || 'deepseek-chat',
    messages: [{ role: 'user', content: prompt }],
    temperature: params.temperature ?? 1.0,
    max_tokens: params.maxTokens ?? 4096,
    top_p: params.topP ?? 1.0,
    stream: params.stream ?? false,
  }),
  parseResponse: (response) => {
    // DeepSeek 返回格式: { choices: [{ message: { content: '...' } }] }
    if (response.choices?.[0]?.message?.content) {
      return { content: response.choices[0].message.content }
    }
    return response
  },
  paramFields: {
    chat: [
      {
        name: 'temperature',
        label: '温度',
        type: 'slider',
        defaultValue: 1.0,
        min: 0,
        max: 2,
        step: 0.1,
        description: '控制输出的随机性，值越高输出越随机',
      },
      {
        name: 'maxTokens',
        label: '最大 Token 数',
        type: 'number',
        defaultValue: 4096,
        min: 1,
        max: 8192,
        description: '生成文本的最大长度',
      },
      {
        name: 'topP',
        label: 'Top P',
        type: 'slider',
        defaultValue: 1.0,
        min: 0,
        max: 1,
        step: 0.1,
        description: '核采样参数',
      },
    ],
  },
}

export const providerConfigs: Record<string, ProviderConfig> = {
  openai: openaiConfig,
  volces: volcesConfig,
  gemini: geminiConfig,
  deepseek: deepseekConfig,
  'minimax-image': minimaxImageConfig,
  'minimax-video': minimaxVideoConfig,
  'minimax-tts': minimaxTTSConfig,
}

export function detectProvider(baseUrl: string, type?: 'image' | 'video' | 'tts' | 'chat'): ProviderConfig | null {
  const url = baseUrl.toLowerCase()
  if (url.includes('volces') || url.includes('ark.cn-beijing')) return volcesConfig
  if (url.includes('google') || url.includes('gemini')) return geminiConfig
  if (url.includes('deepseek')) return deepseekConfig
  if (url.includes('minimax')) {
    // 根据类型返回不同的 MiniMax 配置
    switch (type) {
      case 'image':
        return minimaxImageConfig
      case 'video':
        return minimaxVideoConfig
      case 'tts':
        return minimaxTTSConfig
      default:
        return minimaxTTSConfig
    }
  }
  if (url.includes('openai')) return openaiConfig
  return openaiConfig
}

export function transformParams(
  provider: ProviderConfig,
  unifiedParams: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(unifiedParams)) {
    const mappedKey = provider.paramMapping[key] || key
    const transformer = provider.paramTransformers?.[key]
    result[mappedKey] = transformer ? transformer(value) : value
  }
  return result
}

export function buildRequestBody(
  baseUrl: string,
  model: string,
  prompt: string,
  params: Record<string, unknown> = {}
) {
  const provider = detectProvider(baseUrl) || openaiConfig
  return provider.buildRequestBody(model, prompt, transformParams(provider, params))
}

export function parseResponse(baseUrl: string, response: any) {
  const provider = detectProvider(baseUrl) || openaiConfig
  return provider.parseResponse ? provider.parseResponse(response) : response
}
