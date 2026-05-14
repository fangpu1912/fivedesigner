declare module '@/types' {
  interface ExtractedAsset {
    promptFront?: string
    promptLeft?: string
    promptRight?: string
    promptBack?: string
    tags?: string[]
  }

  interface ExtractedShot {
    references?: {
      characters?: string[]
      scenes?: string[]
      props?: string[]
    }
    dubbing?: {
      character?: string
      line?: string
      text?: string
      emotion?: string
      audioPrompt?: string
      audio_prompt?: string
    }
  }

  interface Storyboard {
    video_duration?: number
    image_url?: string
    thumbnail?: string
    tags?: string[]
  }

  interface Scene {
    thumbnail?: string
    tags?: string[]
  }

  interface Prop {
    thumbnail?: string
    tags?: string[]
  }

  interface Character {
    avatar?: string
    voice_id?: string
    tags?: string[]
    metadata?: Record<string, unknown>
  }

  interface Dubbing {
    episode_id?: string
    audio_prompt?: string
  }

  interface AIModelConfig {
    model?: string
    endpoints?: {
      image?: string
      video?: string
      chat?: string
      tts?: string
    }
  }
}

export {}
