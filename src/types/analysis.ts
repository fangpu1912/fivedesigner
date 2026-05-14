export interface AnalysisCharacter {
  character_id: number
  name: string
  description: string
  prompt: string
  staticViews?: string
  wardrobeVariants?: string
  replacement_image?: string | null
}

export interface AnalysisSceneSetting {
  scene_id: number
  name: string
  description: string
  prompt: string
}

export interface AnalysisProp {
  prop_id: number
  name: string
  description: string
  prompt: string
}

export interface AnalysisStoryboard {
  storyboard_id: number
  timestamp?: string
  duration: number
  shot_type?: string
  camera_motion?: string
  description: string
  prompt: string
  videoPrompt: string
  characters?: string[]
  props?: string[]
  transition?: string
}

export interface AnalysisResult {
  title: string
  style: string
  aspect_ratio: string
  total_duration: number
  bgm_style: string
  color_grade: string
  overall_prompt: string
  characters: AnalysisCharacter[]
  scenes: AnalysisSceneSetting[]
  props: AnalysisProp[]
  storyboards: AnalysisStoryboard[]
  reverse_prompts: string[]
  raw_analysis: string
}

export interface AnalysisTask {
  analysis_id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  filename?: string
  file_path?: string
  created_at: string
  result?: AnalysisResult | null
  error?: string | null
}

export interface CreateProjectFromAnalysisPayload {
  topic?: string
  video_engine?: string
  add_subtitles?: boolean
  projectId?: string
}

export interface CreateProjectFromAnalysisResponse {
  projectId: string
  episodeId: string
  characterCount: number
  storyboardCount: number
}
