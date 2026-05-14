import { convertFileSrc } from '@tauri-apps/api/core'

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

export function getSampleMediaUrl(path?: string | null): string | null {
  if (!path) return null
  if (path.startsWith('http') || path.startsWith('data:')) return path
  return convertFileSrc(path)
}
