/**
 * 供应商配置类型定义
 */

export type ServiceType = 'text' | 'image' | 'video' | 'tts'

export interface TextModel {
  name: string
  modelName: string
  type: 'text'
  think: boolean
}

export interface ImageModel {
  name: string
  modelName: string
  type: 'image'
  mode: ('text' | 'singleImage' | 'multiReference')[]
  associationSkills?: string
}

export interface VideoModel {
  name: string
  modelName: string
  type: 'video'
  mode: (
    | 'singleImage'
    | 'startEndRequired'
    | 'endFrameOptional'
    | 'startFrameOptional'
    | 'multiRefVideo'
    | 'text'
    | ('videoReference' | 'imageReference' | 'audioReference' | 'textReference')[]
  )[]
  associationSkills?: string
  audio: 'optional' | false | true
  durationResolutionMap: { duration: number[]; resolution: string[] }[]
}

export interface TTSModel {
  name: string
  modelName: string
  type: 'tts'
  voices: { title: string; voice: string }[]
}

export interface VendorInput {
  key: string
  label: string
  type: 'text' | 'password' | 'url'
  required: boolean
  placeholder?: string
}

export interface VendorConfig {
  id: string
  author: string
  description?: string
  name: string
  icon?: string
  inputs: VendorInput[]
  inputValues: Record<string, string>
  models: (TextModel | ImageModel | VideoModel | TTSModel)[]
  code: string
  enable: boolean
  createTime: number
}

export type AiType = 'scriptAgent' | 'productionAgent' | 'universalAi' | 'vlAgent' | 'ttsDubbing'

export interface AgentDeploy {
  id: string
  key: AiType
  name: string
  desc?: string
  modelName?: string
  vendorId?: string
  disabled: boolean
}

export type TaskState = 'pending' | 'running' | 'completed' | 'failed'

export interface TaskRecord {
  id: number
  projectId: number
  taskClass: string
  relatedObjects: string
  model: string
  describe: string
  state: TaskState
  startTime: number
  reason?: string
}

// 生成参数
export interface ImageConfig {
  prompt: string
  imageBase64?: string[]
  imageUrls?: string[]
  maskBase64?: string
  size?: '1K' | '2K' | '4K'
  aspectRatio?: string
  n?: number
  quality?: 'standard' | 'high'
  seed?: number
  steps?: number
  guidance?: number
  negativePrompt?: string
}

export interface VideoConfig {
  prompt: string
  firstImageBase64?: string
  lastImageBase64?: string
  referenceImages?: string[] // 多图参考
  aspectRatio?: string
  duration?: number
  resolution?: string
  generateAudio?: boolean
}

export interface TTSConfig {
  text: string
  voice: string
  voiceId?: string
  speed?: number
  pitch?: number
  volume?: number
  emotion?: string
  sampleRate?: number
  bitrate?: number
  format?: 'mp3' | 'wav' | 'pcm'
  // 声音克隆相关
  fileId?: string | number // 上传音色样本后获得的文件ID
  voiceSampleUrl?: string // 参考音频路径（用于即时音色克隆）
  promptText?: string // 克隆提示文本
  // 项目上下文
  projectId?: string
  episodeId?: string
}

// TTS 声音克隆上传结果
export interface TTSVoiceCloneUploadResult {
  fileId: string | number
  voiceId?: string
}

// TTS 音色信息
export interface TTSVoiceInfo {
  id: string
  name: string
  language: string
  gender?: 'male' | 'female' | 'neutral'
  previewUrl?: string
}

// 统一生成参数（兼容旧接口）
export interface GenerationOptions {
  prompt?: string
  messages?: { role: string; content: string }[]
  referenceImages?: string[]
  size?: string
  aspectRatio?: string
  mode?: string
  duration?: number
  resolution?: string
  audio?: boolean
  voice?: string
  speed?: number
  temperature?: number
  maxTokens?: number
}

// 统一生成结果（兼容旧接口）
export interface GenerationResult {
  success: boolean
  data?: {
    url?: string
    content?: string
    type?: 'image' | 'video' | 'audio' | 'text'
  }
  error?: string
}
