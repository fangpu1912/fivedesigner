export type MentionElementType = 'character' | 'scene' | 'prop' | 'storyboard' | 'video' | 'audio' | 'image'

export interface MentionItem {
  id: string
  type: MentionElementType
  name: string
  imageUrl?: string
  thumbnail?: string
  description?: string
  prompt?: string
}

export interface MentionData {
  id: string
  type: MentionElementType
  label: string
  imageUrl?: string
  description?: string
  prompt?: string
}

export interface ResolvedPrompt {
  text: string
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  >
  referenceImages: string[]
  mentions: MentionData[]
}

export const MENTION_TYPE_CONFIG: Record<MentionElementType, { label: string; icon: string; color: string }> = {
  character: { label: '角色', icon: 'User', color: 'text-blue-500' },
  scene: { label: '场景', icon: 'Mountain', color: 'text-green-500' },
  prop: { label: '道具', icon: 'Box', color: 'text-amber-500' },
  storyboard: { label: '分镜', icon: 'LayoutGrid', color: 'text-purple-500' },
  video: { label: '视频', icon: 'Video', color: 'text-red-500' },
  audio: { label: '音频', icon: 'Music', color: 'text-pink-500' },
  image: { label: '图片', icon: 'Image', color: 'text-cyan-500' },
}
