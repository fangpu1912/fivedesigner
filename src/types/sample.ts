// 样片审阅相关类型定义

// 轨道类型
export type TrackType = 'video' | 'audio' | 'subtitle' | 'effect'

// 片段类型
export type TrackItemType = 'storyboard' | 'dubbing' | 'music' | 'subtitle' | 'transition'

// 字幕样式
export interface SubtitleStyle {
  font_family: string
  font_size: number
  color: string
  background_color?: string
  position: 'top' | 'middle' | 'bottom'
}

// 时间轴片段
export interface TrackItem {
  id: string
  type: TrackItemType
  source_id: string // 关联的分镜/配音ID
  start_time: number // 在时间轴上的开始时间(秒)
  duration: number // 时长(秒)
  // 视频特有
  video_url?: string
  // 音频特有
  audio_url?: string
  volume?: number // 音量 0-1
  // 字幕特有
  text?: string
  subtitle_style?: SubtitleStyle
  // 转场特有
  transition_type?: string
  transition_duration?: number
}

// 时间轴轨道
export interface Track {
  id: string
  type: TrackType
  name: string
  items: TrackItem[]
  isVisible: boolean
  isLocked: boolean
}

// 样片项目
export interface SampleProject {
  id: string
  episode_id: string
  name: string
  duration: number // 总时长(秒)
  tracks: Track[]
  created_at: string
  updated_at: string
}

// 剪映导出相关类型

// 剪映草稿结构（基于剪映专业版 JSON 格式）
export interface CapCutDraft {
  id: string
  name: string
  duration: number
  tracks: CapCutTrack[]
  materials: CapCutMaterial[]
}

export interface CapCutTrack {
  id: string
  type: 'video' | 'audio' | 'text'
  segments: CapCutSegment[]
}

export interface CapCutSegment {
  id: string
  material_id: string
  start_time: number // 微秒
  duration: number // 微秒
  source_start: number // 素材开始时间（微秒）
  source_duration: number // 素材时长（微秒）
}

export interface CapCutMaterial {
  id: string
  type: 'video' | 'audio' | 'text'
  file_path?: string
  text?: string
  duration: number
}

// 渲染设置
export interface RenderSettings {
  format: 'mp4' | 'webm' | 'mov'
  resolution: '1080p' | '720p' | '4k'
  fps: 24 | 30 | 60
  bitrate: number // kbps
}

// 默认渲染设置
export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  format: 'mp4',
  resolution: '1080p',
  fps: 30,
  bitrate: 8000,
}

// 默认字幕样式
export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  font_family: 'Arial',
  font_size: 24,
  color: '#FFFFFF',
  background_color: 'rgba(0, 0, 0, 0.5)',
  position: 'bottom',
}

// 样片片段（用于剪映导出）
export interface SampleClip {
  id: string
  storyboard: {
    id: string
    name: string
    description?: string
  }
  dubbings: Array<{
    id: string
    audio_url?: string
    duration?: number
  }>
  duration: number // 计算后的时长（视频或音频的最大值）
  videoUrl?: string
  imageUrl?: string
  audioUrl?: string
}
