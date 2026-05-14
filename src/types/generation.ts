/**
 * AI 模型生成类型定义
 * 支持图片生成和视频生成的多种模式
 */

export type GenerationType =
  | 'text-to-image'
  | 'image-to-image'
  | 'multi-ref-image'
  | 'text-to-video'
  | 'image-to-video'
  | 'first-last-frame'
  | 'multi-ref-video'

export type ImageModel = 'seedream' | 'nano-banana' | 'kling-image'
export type VideoModel = 'seedance' | 'kling-video' | 'hailuo' | 'vidu' | 'veo'

export type MediaCategory = 'image' | 'video'
export type TaskStatus = 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'
export type Quality = 'basic' | 'high' | 'standard' | 'professional'
export type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '21:9' | '9:21'
export type Resolution = '480p' | '720p' | '1080p' | '2K' | '4K'

export interface ProgressInfo {
  status: TaskStatus
  progress?: number
  message?: string
  queuePosition?: number
  estimatedTime?: number
}

export interface BaseGenerationParams {
  prompt: string
  negativePrompt?: string
  seed?: number
  model?: ImageModel | VideoModel | string
  aspectRatio?: AspectRatio
  resolution?: Resolution
  quality?: Quality
  onProgress?: (info: ProgressInfo) => void
  systemPrompt?: string
}

export interface TextToImageParams extends BaseGenerationParams {
  type: 'text-to-image'
  model: ImageModel
  width?: number
  height?: number
  numImages?: number
}

export interface ImageToImageParams extends BaseGenerationParams {
  type: 'image-to-image'
  model: ImageModel
  imageUrl: string
  strength?: number
  width?: number
  height?: number
}

export interface MultiRefImageParams extends BaseGenerationParams {
  type: 'multi-ref-image'
  model: ImageModel
  imageUrls: string[]
  strength?: number
  width?: number
  height?: number
}

export interface TextToVideoParams extends BaseGenerationParams {
  type: 'text-to-video'
  model: VideoModel
  duration?: number
  fps?: number
  generateAudio?: boolean
  // Veo 特有参数
  enhancePrompt?: boolean // 是否优化提示词（中文转英文）
  enableUpsample?: boolean // 是否分辨率提升（返回 1080p）
}

export interface ImageToVideoParams extends BaseGenerationParams {
  type: 'image-to-video'
  model: VideoModel
  imageUrl: string
  duration?: number
  fps?: number
  generateAudio?: boolean
  cameraFixed?: boolean
  // Veo 特有参数
  enhancePrompt?: boolean // 是否优化提示词（中文转英文）
}

export interface FirstLastFrameParams extends BaseGenerationParams {
  type: 'first-last-frame'
  model: VideoModel
  firstFrameUrl: string
  lastFrameUrl: string
  duration?: number
  fps?: number
  generateAudio?: boolean
  // Veo 特有参数
  enhancePrompt?: boolean // 是否优化提示词（中文转英文）
}

export interface MultiRefVideoParams extends BaseGenerationParams {
  type: 'multi-ref-video'
  model: VideoModel
  imageUrls: string[]
  duration?: number
  fps?: number
  generateAudio?: boolean
  // Veo 特有参数
  enhancePrompt?: boolean // 是否优化提示词（中文转英文）
}

export interface ChatGenerationParams extends BaseGenerationParams {
  type?: 'chat'
  messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  temperature?: number
  maxTokens?: number
}

export type GenerationParams =
  | TextToImageParams
  | ImageToImageParams
  | MultiRefImageParams
  | TextToVideoParams
  | ImageToVideoParams
  | FirstLastFrameParams
  | MultiRefVideoParams
  | ChatGenerationParams

export interface GenerationResult {
  success: boolean
  taskId?: string
  imageUrl?: string
  imageUrls?: string[]
  videoUrl?: string
  audioUrl?: string
  filePath?: string
  text?: string
  error?: string
  metadata?: {
    model?: string
    duration?: number
    resolution?: string
    seed?: number
    finishReason?: string
    [key: string]: unknown
  }
}

export interface ModelCapabilities {
  model: ImageModel | VideoModel
  name: string
  category: MediaCategory
  supportedTypes: GenerationType[]
  maxImages: number
  maxDuration: number
  supportedResolutions: Resolution[]
  supportedAspectRatios: AspectRatio[]
  supportsAudio?: boolean
  supportsCameraFixed?: boolean
  supportsFastMode?: boolean
}

export const IMAGE_MODEL_CAPABILITIES: Record<ImageModel, ModelCapabilities> = {
  seedream: {
    model: 'seedream',
    name: 'Seedream 5.0',
    category: 'image',
    supportedTypes: ['text-to-image', 'image-to-image', 'multi-ref-image'],
    maxImages: 4,
    maxDuration: 0,
    supportedResolutions: ['720p', '1080p'],
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
  },
  'nano-banana': {
    model: 'nano-banana',
    name: 'Gemini 3.1 Flash Image',
    category: 'image',
    supportedTypes: ['text-to-image', 'image-to-image', 'multi-ref-image'],
    maxImages: 4,
    maxDuration: 0,
    supportedResolutions: ['720p', '1080p', '2K'],
    supportedAspectRatios: ['1:1', '16:9', '9:16'],
  },
  'kling-image': {
    model: 'kling-image',
    name: 'Kling Image V3',
    category: 'image',
    supportedTypes: ['text-to-image', 'image-to-image', 'multi-ref-image'],
    maxImages: 4,
    maxDuration: 0,
    supportedResolutions: ['720p', '1080p', '2K'],
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
  },
}

export const VIDEO_MODEL_CAPABILITIES: Record<VideoModel, ModelCapabilities> = {
  seedance: {
    model: 'seedance',
    name: 'Seedance 1.5 Pro',
    category: 'video',
    supportedTypes: ['text-to-video', 'image-to-video', 'first-last-frame', 'multi-ref-video'],
    maxImages: 2,
    maxDuration: 10,
    supportedResolutions: ['480p', '720p', '1080p'],
    supportedAspectRatios: ['1:1', '16:9', '9:16'],
    supportsAudio: true,
    supportsCameraFixed: true,
    supportsFastMode: true,
  },
  'kling-video': {
    model: 'kling-video',
    name: 'Kling Video V3',
    category: 'video',
    supportedTypes: ['text-to-video', 'image-to-video', 'first-last-frame', 'multi-ref-video'],
    maxImages: 7,
    maxDuration: 10,
    supportedResolutions: ['720p', '1080p'],
    supportedAspectRatios: ['1:1', '16:9', '9:16'],
    supportsAudio: true,
  },
  hailuo: {
    model: 'hailuo',
    name: 'MiniMax Hailuo 2.3',
    category: 'video',
    supportedTypes: ['text-to-video', 'image-to-video', 'first-last-frame', 'multi-ref-video'],
    maxImages: 2,
    maxDuration: 6,
    supportedResolutions: ['720p', '1080p'],
    supportedAspectRatios: ['1:1', '16:9', '9:16'],
    supportsAudio: true,
    supportsFastMode: true,
  },
  vidu: {
    model: 'vidu',
    name: 'Vidu Q3',
    category: 'video',
    supportedTypes: ['text-to-video', 'image-to-video', 'first-last-frame', 'multi-ref-video'],
    maxImages: 2,
    maxDuration: 8,
    supportedResolutions: ['720p', '1080p'],
    supportedAspectRatios: ['1:1', '16:9', '9:16'],
    supportsAudio: true,
  },
  veo: {
    model: 'veo',
    name: 'Veo 3.1',
    category: 'video',
    supportedTypes: ['text-to-video', 'image-to-video', 'first-last-frame', 'multi-ref-video'],
    maxImages: 4,
    maxDuration: 8,
    supportedResolutions: ['720p', '1080p'],
    supportedAspectRatios: ['1:1', '16:9', '9:16'],
    supportsAudio: true,
    supportsFastMode: true,
  },
}

export function getModelCapabilities(
  model: ImageModel | VideoModel
): ModelCapabilities | undefined {
  return (
    IMAGE_MODEL_CAPABILITIES[model as ImageModel] || VIDEO_MODEL_CAPABILITIES[model as VideoModel]
  )
}

export function getSupportedModelsForType(type: GenerationType): (ImageModel | VideoModel)[] {
  const allCapabilities = { ...IMAGE_MODEL_CAPABILITIES, ...VIDEO_MODEL_CAPABILITIES }
  return Object.values(allCapabilities)
    .filter(cap => cap.supportedTypes.includes(type))
    .map(cap => cap.model)
}

export function isImageModel(model: string): model is ImageModel {
  return model in IMAGE_MODEL_CAPABILITIES
}

export function isVideoModel(model: string): model is VideoModel {
  return model in VIDEO_MODEL_CAPABILITIES
}

export function getGenerationTypeCategory(type: GenerationType): MediaCategory {
  return ['text-to-image', 'image-to-image', 'multi-ref-image'].includes(type) ? 'image' : 'video'
}
