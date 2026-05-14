// 音色类型
export type VoiceType = 'system' | 'custom' | 'cloned'

// 音色状态
export type VoiceStatus = 'active' | 'inactive' | 'processing' | 'error'

// 音色信息
export interface Voice {
  id: string
  name: string
  description?: string
  type: VoiceType
  status: VoiceStatus

  // 音频信息
  audioUrl: string
  audioData?: ArrayBuffer
  filePath?: string // 本地文件路径（Tauri 使用）
  mimeType?: string // 音频 MIME 类型
  duration: number
  sampleRate?: number

  // 裁剪信息
  trimStart?: number
  trimEnd?: number

  // 绑定信息
  boundProvider?: string
  boundVoiceId?: string

  // 元数据
  language?: string
  gender?: 'male' | 'female' | 'neutral'
  tags?: string[]

  // 时间戳
  createdAt: string
  updatedAt: string
}

// 音色上传配置
export interface VoiceUploadConfig {
  maxDuration: number
  minDuration: number
  maxFileSize: number
  supportedFormats: string[]
}

// 音色裁剪配置
export interface VoiceTrimConfig {
  start: number
  end: number
}

// 音色绑定配置
export interface VoiceBinding {
  voiceId: string
  provider: string
  providerVoiceId: string
  name: string
}

// 音色预览状态
export interface VoicePreviewState {
  isPlaying: boolean
  currentTime: number
  duration: number
}

// 音色过滤器
export interface VoiceFilter {
  type?: VoiceType
  status?: VoiceStatus
  language?: string
  search?: string
}

// 默认上传配置
export const DEFAULT_VOICE_UPLOAD_CONFIG: VoiceUploadConfig = {
  maxDuration: 60,
  minDuration: 3,
  maxFileSize: 10 * 1024 * 1024, // 10MB
  supportedFormats: ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/webm'],
}
