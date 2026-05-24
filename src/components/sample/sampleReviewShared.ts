import type { Dubbing, Storyboard } from '@/types'

export interface SampleReviewClip {
  id: string
  storyboard: Storyboard
  dubbings: Dubbing[]
  duration: number
  videoUrl?: string
  audioUrl?: string
  imageUrl?: string
}

export { getAssetUrl as getSampleMediaUrl } from '@/utils/asset'
