import type { GenerationType, AspectRatio, Resolution } from '@/types/generation'

export type ModelCategory = 'image' | 'video' | 'text' | 'tts' | 'vl'

export interface ModelRegistryEntry {
  id: string
  name: string
  category: ModelCategory
  vendorModelId: string
  supportedTypes: GenerationType[]
  supportedAspectRatios: AspectRatio[]
  supportedResolutions: Resolution[]
  maxImages: number
  maxDuration: number
  supportsAudio?: boolean
  supportsCameraFixed?: boolean
  supportsFastMode?: boolean
  imageInputFormat?: 'base64' | 'url' | 'multipart'
  requestFormat?: 'json' | 'multipart'
  isAsync?: boolean
  fallbackModelId?: string
}

const MODEL_REGISTRY: Record<string, ModelRegistryEntry> = {
  'seedream': {
    id: 'seedream',
    name: 'Seedream 5.0',
    category: 'image',
    vendorModelId: 'volcengine:Seedream-5.0',
    supportedTypes: ['text-to-image', 'image-to-image', 'multi-ref-image'],
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    supportedResolutions: ['720p', '1080p'],
    maxImages: 4,
    maxDuration: 0,
    imageInputFormat: 'base64',
    requestFormat: 'json',
  },
  'nano-banana': {
    id: 'nano-banana',
    name: 'Gemini 3.1 Flash Image',
    category: 'image',
    vendorModelId: 'google:gemini-2.0-flash-exp',
    supportedTypes: ['text-to-image', 'image-to-image', 'multi-ref-image'],
    supportedAspectRatios: ['1:1', '16:9', '9:16'],
    supportedResolutions: ['720p', '1080p', '2K'],
    maxImages: 4,
    maxDuration: 0,
    imageInputFormat: 'base64',
    requestFormat: 'json',
  },
  'kling-image': {
    id: 'kling-image',
    name: 'Kling Image V3',
    category: 'image',
    vendorModelId: 'klingai:Kling-Image',
    supportedTypes: ['text-to-image', 'image-to-image', 'multi-ref-image'],
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    supportedResolutions: ['720p', '1080p', '2K'],
    maxImages: 4,
    maxDuration: 0,
    imageInputFormat: 'url',
    requestFormat: 'json',
  },
  'seedance': {
    id: 'seedance',
    name: 'Seedance 1.5 Pro',
    category: 'video',
    vendorModelId: 'volcengine:Seedance-1.5-pro',
    supportedTypes: ['text-to-video', 'image-to-video', 'first-last-frame', 'multi-ref-video'],
    supportedAspectRatios: ['1:1', '16:9', '9:16'],
    supportedResolutions: ['480p', '720p', '1080p'],
    maxImages: 2,
    maxDuration: 10,
    supportsAudio: true,
    supportsCameraFixed: true,
    supportsFastMode: true,
    imageInputFormat: 'base64',
    requestFormat: 'json',
    isAsync: true,
  },
  'kling-video': {
    id: 'kling-video',
    name: 'Kling Video V3',
    category: 'video',
    vendorModelId: 'klingai:Kling-Video',
    supportedTypes: ['text-to-video', 'image-to-video', 'first-last-frame', 'multi-ref-video'],
    supportedAspectRatios: ['1:1', '16:9', '9:16'],
    supportedResolutions: ['720p', '1080p'],
    maxImages: 7,
    maxDuration: 10,
    supportsAudio: true,
    imageInputFormat: 'url',
    requestFormat: 'json',
    isAsync: true,
  },
  'hailuo': {
    id: 'hailuo',
    name: 'MiniMax Hailuo 2.3',
    category: 'video',
    vendorModelId: 'minimax:Hailuo-Video',
    supportedTypes: ['text-to-video', 'image-to-video', 'first-last-frame', 'multi-ref-video'],
    supportedAspectRatios: ['1:1', '16:9', '9:16'],
    supportedResolutions: ['720p', '1080p'],
    maxImages: 2,
    maxDuration: 6,
    supportsAudio: true,
    supportsFastMode: true,
    imageInputFormat: 'url',
    requestFormat: 'json',
    isAsync: true,
  },
  'vidu': {
    id: 'vidu',
    name: 'Vidu Q3',
    category: 'video',
    vendorModelId: 'vidu:Vidu-Q3',
    supportedTypes: ['text-to-video', 'image-to-video', 'first-last-frame', 'multi-ref-video'],
    supportedAspectRatios: ['1:1', '16:9', '9:16'],
    supportedResolutions: ['720p', '1080p'],
    maxImages: 2,
    maxDuration: 8,
    supportsAudio: true,
    imageInputFormat: 'url',
    requestFormat: 'json',
    isAsync: true,
  },
  'veo': {
    id: 'veo',
    name: 'Veo 3.1',
    category: 'video',
    vendorModelId: 'google:Veo-3.1',
    supportedTypes: ['text-to-video', 'image-to-video', 'first-last-frame', 'multi-ref-video'],
    supportedAspectRatios: ['1:1', '16:9', '9:16'],
    supportedResolutions: ['720p', '1080p'],
    maxImages: 4,
    maxDuration: 8,
    supportsAudio: true,
    supportsFastMode: true,
    imageInputFormat: 'base64',
    requestFormat: 'json',
    isAsync: true,
  },
}

export function getModelEntry(modelId: string): ModelRegistryEntry | undefined {
  return MODEL_REGISTRY[modelId]
}

export function getVendorModelId(modelId: string): string {
  const entry = MODEL_REGISTRY[modelId]
  return entry?.vendorModelId || modelId
}

export function getModelsByCategory(category: ModelCategory): ModelRegistryEntry[] {
  return Object.values(MODEL_REGISTRY).filter(m => m.category === category)
}

export function getModelsForGenerationType(type: GenerationType): ModelRegistryEntry[] {
  return Object.values(MODEL_REGISTRY).filter(m => m.supportedTypes.includes(type))
}

export function resolveModelId(input: string): { shortId: string; vendorModelId: string } {
  if (MODEL_REGISTRY[input]) {
    return { shortId: input, vendorModelId: MODEL_REGISTRY[input].vendorModelId }
  }
  for (const [shortId, entry] of Object.entries(MODEL_REGISTRY)) {
    if (entry.vendorModelId === input) {
      return { shortId, vendorModelId: input }
    }
  }
  return { shortId: input, vendorModelId: input }
}

export function getModelCategory(modelId: string): ModelCategory | undefined {
  return MODEL_REGISTRY[modelId]?.category
}

export function isAsyncModel(modelId: string): boolean {
  return MODEL_REGISTRY[modelId]?.isAsync ?? false
}

export function getImageInputFormat(modelId: string): 'base64' | 'url' | 'multipart' {
  return MODEL_REGISTRY[modelId]?.imageInputFormat || 'base64'
}

export interface ModelFixedParams {
  duration?: number
  aspectRatio?: string
  resolution?: string
  width?: number
  height?: number
}

const MODEL_FIXED_PARAMS: Record<string, ModelFixedParams> = {
  'grok-video-3-max': { duration: 15 },
  'grok-video-3-pro': { duration: 10 },
  'sora2-pro-landscape-25s': { duration: 25, aspectRatio: '16:9', width: 1920, height: 1080 },
  'sora2-pro-landscape-hd-10s': { duration: 10, aspectRatio: '16:9', width: 1920, height: 1080 },
  'sora2-pro-landscape-hd-15s': { duration: 15, aspectRatio: '16:9', width: 1920, height: 1080 },
  'sora2-pro-portrait-25s': { duration: 25, aspectRatio: '9:16', width: 1080, height: 1920 },
  'sora2-pro-portrait-hd-10s': { duration: 10, aspectRatio: '9:16', width: 1080, height: 1920 },
  'sora2-pro-portrait-hd-15s': { duration: 15, aspectRatio: '9:16', width: 1080, height: 1920 },
}

export interface CorrectedParams {
  duration?: number
  width?: number
  height?: number
  aspectRatio?: string
  corrections: string[]
}

export function correctModelParams(
  modelName: string,
  params: { duration?: number; width?: number; height?: number; aspectRatio?: string }
): CorrectedParams {
  const fixed = MODEL_FIXED_PARAMS[modelName]
  if (!fixed) {
    return {
      ...params,
      corrections: [],
    }
  }

  const corrections: string[] = []
  const result: CorrectedParams = {
    duration: params.duration,
    width: params.width,
    height: params.height,
    aspectRatio: params.aspectRatio,
    corrections,
  }

  if (fixed.duration !== undefined && params.duration !== fixed.duration) {
    corrections.push(`时长已自动纠正: ${params.duration}s → ${fixed.duration}s（${modelName} 固定时长）`)
    result.duration = fixed.duration
  }

  if (fixed.aspectRatio && params.aspectRatio !== fixed.aspectRatio) {
    corrections.push(`宽高比已自动纠正: ${params.aspectRatio || '默认'} → ${fixed.aspectRatio}（${modelName} 固定比例）`)
    result.aspectRatio = fixed.aspectRatio
  }

  if (fixed.width && params.width !== fixed.width) {
    corrections.push(`宽度已自动纠正: ${params.width} → ${fixed.width}（${modelName} 固定尺寸）`)
    result.width = fixed.width
  }

  if (fixed.height && params.height !== fixed.height) {
    corrections.push(`高度已自动纠正: ${params.height} → ${fixed.height}（${modelName} 固定尺寸）`)
    result.height = fixed.height
  }

  return result
}

export function hasFixedParams(modelName: string): boolean {
  return modelName in MODEL_FIXED_PARAMS
}
