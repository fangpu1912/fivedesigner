// 自定义风格配置
export interface CustomStyle {
  name?: string
  prompt?: string
  negativePrompt?: string
}

// 项目类型
export interface Project {
  id: string
  name: string
  description?: string
  aspect_ratio?: string
  visual_style?: string
  custom_style?: CustomStyle
  cover_image?: string
  quality_prompt?: string // 质量提示词，自动附加到所有生图/生视频提示词后面
  created_at: string
  updated_at: string
}

// 风格类型配置
export interface ArtStyle {
  id: string
  name: string
  nameEn: string
  description: string
  prompt: string
  negativePrompt?: string
  icon?: string
  category: 'anime' | 'realistic' | 'artistic' | 'special' | 'chinese' | 'scifi' | 'game' | 'custom'
}

// 预定义的艺术风格
export const ART_STYLES: ArtStyle[] = [
  // 自定义风格占位
  {
    id: 'custom',
    name: '自定义风格',
    nameEn: 'Custom Style',
    description: '用户自定义的艺术风格',
    prompt: '',
    negativePrompt: '',
    category: 'custom',
  },
  // 动漫风格
  {
    id: 'anime_default',
    name: '日系动漫',
    nameEn: 'Anime Style',
    description: '经典日系动漫风格，色彩鲜艳，线条流畅',
    prompt:
      'anime style, illustration, vibrant colors, smooth lines, detailed eyes, cel shading, 2D, pixiv, artstation',
    negativePrompt: '3d, realistic, photo, western cartoon, low quality, blurry',
    category: 'anime',
  },
  {
    id: 'anime_makoto',
    name: '新海诚风格',
    nameEn: 'Makoto Shinkai Style',
    description: '新海诚式唯美画风，光影细腻，色彩梦幻',
    prompt:
      'Makoto Shinkai style, anime, detailed background, beautiful lighting, dreamy colors, sky, clouds, cinematic composition, vivid colors, soft shadows',
    negativePrompt: 'cartoon, western style, dark, gloomy',
    category: 'anime',
  },
  {
    id: 'anime_ghibli',
    name: '吉卜力风格',
    nameEn: 'Ghibli Style',
    description: '宫崎骏吉卜力工作室风格，手绘质感，温暖治愈',
    prompt:
      'Studio Ghibli style, Hayao Miyazaki, hand-drawn, watercolor texture, warm colors, soft lighting, detailed background, nature, fantasy, cozy atmosphere',
    negativePrompt: 'dark, horror, realistic, 3d, cg',
    category: 'anime',
  },
  {
    id: 'anime_cyberpunk',
    name: '赛博朋克动漫',
    nameEn: 'Cyberpunk Anime',
    description: '赛博朋克动漫风格，霓虹灯光，未来都市',
    prompt:
      'cyberpunk anime style, neon lights, futuristic city, high tech, night, rain, reflections, vibrant neon colors, detailed background, sci-fi',
    negativePrompt: 'daylight, natural, rural, historical',
    category: 'anime',
  },
  {
    id: 'anime_chibi',
    name: 'Q版萌系',
    nameEn: 'Chibi Style',
    description: 'Q版萌系风格，头大身小，可爱治愈',
    prompt:
      'chibi style, super deformed, big head small body, cute, kawaii, adorable, rounded features, bright colors, cheerful, anime style',
    negativePrompt: 'realistic, serious, dark, mature',
    category: 'anime',
  },
  {
    id: 'anime_vtuber',
    name: '虚拟主播',
    nameEn: 'VTuber Style',
    description: '虚拟主播Live2D风格，精致立绘，偶像感',
    prompt:
      'vtuber style, live2d, idol, virtual youtuber, detailed character design, bright eyes, cute outfit, gradient hair, sparkling, anime style',
    negativePrompt: 'realistic, 3d, dark, gritty',
    category: 'anime',
  },
  // 古风国风
  {
    id: 'chinese_ancient',
    name: '古风汉服',
    nameEn: 'Ancient Chinese Style',
    description: '中国传统古风，汉服飘逸，典雅端庄',
    prompt:
      'ancient Chinese style, hanfu, traditional Chinese clothing, flowing sleeves, elegant, graceful, Chinese architecture background, classical beauty, silk fabric, hair ornaments, oriental aesthetic',
    negativePrompt: 'modern clothing, western style, contemporary, casual wear',
    category: 'chinese',
  },
  {
    id: 'chinese_xianxia',
    name: '仙侠武侠',
    nameEn: 'Xianxia Wuxia Style',
    description: '仙侠武侠风格，飘逸出尘，剑气纵横',
    prompt:
      'xianxia wuxia style, immortal cultivator, martial arts, flying sword, ethereal, mystical, ancient Chinese fantasy, flowing robes, magical effects, mountain scenery, clouds, spiritual energy',
    negativePrompt: 'modern, sci-fi, guns, technology, urban',
    category: 'chinese',
  },
  {
    id: 'chinese_palace',
    name: '宫廷古风',
    nameEn: 'Chinese Palace Style',
    description: '宫廷古风，华丽服饰，皇家气派',
    prompt:
      'Chinese palace style, imperial court, elaborate traditional costume, phoenix crown, royal elegance, palace background, red and gold colors, luxurious, historical Chinese, Tang Dynasty, Song Dynasty',
    negativePrompt: 'commoner clothing, modern, simple, casual',
    category: 'chinese',
  },
  {
    id: 'chinese_ink_figure',
    name: '水墨人物',
    nameEn: 'Ink Wash Portrait',
    description: '水墨人物画风格，写意传神，意境深远',
    prompt:
      'Chinese ink wash painting style, figure painting, xieyi style, expressive brushwork, minimal color, black and white, rice paper texture, poetic, scholarly, traditional Chinese art, elegant',
    negativePrompt: 'colorful, realistic, oil painting, western style',
    category: 'chinese',
  },
  {
    id: 'chinese_gongbi',
    name: '工笔重彩',
    nameEn: 'Gongbi Style',
    description: '工笔重彩风格，细腻精致，色彩浓丽',
    prompt:
      'gongbi style, Chinese meticulous painting, fine brushwork, rich colors, detailed, elaborate patterns, traditional Chinese beauty, silk painting, decorative, ornate, classical',
    negativePrompt: 'rough, sketchy, watercolor, loose brushwork',
    category: 'chinese',
  },
  // 写实风格
  {
    id: 'realistic_photo',
    name: '写实摄影',
    nameEn: 'Realistic Photography',
    description: '真实摄影风格，细节丰富，光影自然',
    prompt:
      'photorealistic, photography, realistic, detailed texture, natural lighting, depth of field, sharp focus, 8k uhd, professional photography',
    negativePrompt: 'anime, cartoon, illustration, painting, drawing',
    category: 'realistic',
  },
  {
    id: 'realistic_cinematic',
    name: '电影级写实',
    nameEn: 'Cinematic Realistic',
    description: '电影级写实风格，构图精美，氛围感强',
    prompt:
      'cinematic, photorealistic, movie still, film grain, dramatic lighting, color grading, wide angle, depth of field, bokeh, professional cinematography',
    negativePrompt: 'anime, cartoon, low quality, amateur',
    category: 'realistic',
  },
  // 艺术风格
  {
    id: 'art_oil',
    name: '油画风格',
    nameEn: 'Oil Painting',
    description: '古典油画风格，笔触厚重，色彩浓郁',
    prompt:
      'oil painting, classical art, thick brushstrokes, rich colors, canvas texture, masterpiece, museum quality, detailed, artistic',
    negativePrompt: 'digital, anime, cartoon, photo, modern',
    category: 'artistic',
  },
  {
    id: 'art_watercolor',
    name: '水彩风格',
    nameEn: 'Watercolor',
    description: '水彩画风格，色彩通透，笔触轻盈',
    prompt:
      'watercolor painting, transparent colors, light brushstrokes, flowing, artistic, soft edges, paper texture, delicate, beautiful',
    negativePrompt: 'oil painting, thick paint, digital, anime',
    category: 'artistic',
  },
  {
    id: 'art_ink',
    name: '水墨风格',
    nameEn: 'Chinese Ink',
    description: '中国传统水墨画风格，意境深远，留白讲究',
    prompt:
      'Chinese ink painting, traditional art, ink wash, brush strokes, minimalism, poetic, elegant, rice paper, oriental aesthetic, misty mountains',
    negativePrompt: 'colorful, western, oil painting, realistic',
    category: 'artistic',
  },
  {
    id: 'art_ukiyoe',
    name: '浮世绘',
    nameEn: 'Ukiyo-e',
    description: '日本浮世绘风格，线条鲜明，色彩平面化',
    prompt:
      'ukiyo-e style, Japanese woodblock print, flat colors, bold outlines, traditional Japanese art, Hokusai, Hiroshige, waves, Mount Fuji',
    negativePrompt: '3d, realistic, western, modern',
    category: 'artistic',
  },
  // 特色风格
  {
    id: 'special_pixel',
    name: '像素风格',
    nameEn: 'Pixel Art',
    description: '复古像素艺术风格，8bit/16bit游戏感',
    prompt:
      'pixel art, 8bit, 16bit, retro game style, dithering, limited palette, crisp pixels, nostalgic, game screenshot',
    negativePrompt: 'smooth, realistic, 3d, high resolution, blurry',
    category: 'special',
  },
  {
    id: 'special_lowpoly',
    name: '低多边形',
    nameEn: 'Low Poly',
    description: '低多边形3D风格，几何感强，色彩明快',
    prompt:
      'low poly, 3d, geometric, flat shading, vibrant colors, minimalist, clean, modern, isometric, game art',
    negativePrompt: 'realistic, detailed texture, smooth, organic',
    category: 'special',
  },
  {
    id: 'special_3d',
    name: '3D卡通',
    nameEn: '3D Cartoon',
    description: '3D卡通渲染风格，皮克斯/迪士尼感',
    prompt:
      '3D cartoon, Pixar style, Disney style, stylized 3D, soft shading, vibrant colors, appealing, cute, high quality 3D render',
    negativePrompt: 'realistic, anime, 2d, dark, horror',
    category: 'special',
  },
  {
    id: 'special_steampunk',
    name: '蒸汽朋克',
    nameEn: 'Steampunk',
    description: '蒸汽朋克风格，齿轮机械，维多利亚时代',
    prompt:
      'steampunk style, gears, brass, copper, steam, Victorian era, mechanical, industrial, retro-futuristic, clockwork, leather, goggles, intricate machinery',
    negativePrompt: 'modern, clean, minimal, digital, sleek',
    category: 'special',
  },
  {
    id: 'special_retro',
    name: '复古怀旧',
    nameEn: 'Retro Vintage',
    description: '复古怀旧风格，80/90年代感，胶片质感',
    prompt:
      'retro style, vintage, 80s, 90s, film grain, VHS effect, nostalgic, old photo, faded colors, analog, cassette, neon retro, synthwave',
    negativePrompt: 'modern, futuristic, clean, digital, sharp',
    category: 'special',
  },
  {
    id: 'special_fairy',
    name: '童话梦幻',
    nameEn: 'Fairy Tale',
    description: '童话梦幻风格，唯美浪漫，魔法氛围',
    prompt:
      'fairy tale style, magical, dreamy, enchanted forest, sparkles, glowing, whimsical, fantasy, romantic, soft colors, ethereal, storybook illustration',
    negativePrompt: 'dark, horror, realistic, gritty, urban',
    category: 'special',
  },
  {
    id: 'special_dark',
    name: '暗黑哥特',
    nameEn: 'Dark Gothic',
    description: '暗黑哥特风格，神秘阴郁，华丽颓废',
    prompt:
      'dark gothic style, mysterious, ominous, Victorian gothic, elaborate details, dark colors, candles, roses, skulls, elegant but eerie, dramatic shadows',
    negativePrompt: 'bright, cheerful, cute, colorful, happy',
    category: 'special',
  },
  {
    id: 'special_pop',
    name: '波普艺术',
    nameEn: 'Pop Art',
    description: '波普艺术风格，色彩鲜明，商业感强',
    prompt:
      'pop art style, bold colors, comic book style, Ben-Day dots, Andy Warhol, Roy Lichtenstein, commercial art, vibrant, graphic, retro advertising',
    negativePrompt: 'subtle, realistic, natural, muted colors',
    category: 'special',
  },
  {
    id: 'special_lineart',
    name: '线稿风格',
    nameEn: 'Line Art',
    description: '线稿风格，线条清晰，适合上色',
    prompt:
      'line art, clean lines, coloring book style, black and white, outline, sketch, ink drawing, clear contours, no shading, vector style',
    negativePrompt: 'colored, shaded, painted, textured, realistic',
    category: 'special',
  },
  {
    id: 'special_sketch',
    name: '铅笔素描',
    nameEn: 'Pencil Sketch',
    description: '铅笔素描风格，手绘感强，质感细腻',
    prompt:
      'pencil sketch, graphite drawing, hand-drawn, sketchy, shading, hatching, cross-hatching, paper texture, artistic, rough but detailed, monochrome',
    negativePrompt: 'colored, digital, clean, vector, painted',
    category: 'special',
  },
  // 科幻风格
  {
    id: 'scifi_cyberpunk',
    name: '赛博朋克',
    nameEn: 'Cyberpunk',
    description: '赛博朋克风格，高科技低生活，霓虹都市',
    prompt:
      'cyberpunk, high tech low life, neon city, futuristic, dystopian, holograms, augmented reality, rain, night, glowing signs, techwear, implants',
    negativePrompt: 'natural, rural, historical, daylight, organic',
    category: 'scifi',
  },
  {
    id: 'scifi_space',
    name: '太空科幻',
    nameEn: 'Space Sci-Fi',
    description: '太空科幻风格，星际战舰，宇宙探索',
    prompt:
      'space sci-fi, spaceship, space station, galaxy, nebula, stars, astronaut, futuristic technology, zero gravity, cosmic, interstellar, NASA style',
    negativePrompt: 'earth, natural, historical, medieval, fantasy magic',
    category: 'scifi',
  },
  {
    id: 'scifi_postapoc',
    name: '末日废土',
    nameEn: 'Post-Apocalyptic',
    description: '末日废土风格，荒芜破败，生存挣扎',
    prompt:
      'post-apocalyptic, wasteland, ruins, abandoned city, survival, dust, rust, makeshift gear, desolate, dramatic sky, Mad Max style, Fallout style',
    negativePrompt: 'clean, modern, thriving, peaceful, colorful',
    category: 'scifi',
  },
  // 游戏风格
  {
    id: 'game_rpg',
    name: 'RPG游戏',
    nameEn: 'RPG Game Art',
    description: 'RPG游戏美术风格，奇幻冒险，装备道具',
    prompt:
      'RPG game art, fantasy RPG, character design, armor, weapons, loot, dungeon, medieval fantasy, game UI elements, inventory, quest, adventure',
    negativePrompt: 'realistic, modern, sci-fi, contemporary',
    category: 'game',
  },
  {
    id: 'game_pixelart',
    name: '像素游戏',
    nameEn: 'Pixel Game',
    description: '像素游戏风格，游戏场景，角色精灵',
    prompt:
      'pixel game art, sprite, game screenshot, tileset, 16-bit, 32-bit, SNES style, platformer, RPG, adventure game, vibrant, nostalgic gaming',
    negativePrompt: '3d, realistic, smooth, high resolution, modern',
    category: 'game',
  },
]

// 剧集类型
export interface Episode {
  id: string
  project_id: string
  name: string
  description?: string
  episode_number?: number
  created_at: string
  updated_at: string
}

// 脚本类型
export interface Script {
  id: string
  episode_id: string
  title: string
  content: string
  created_at: string
  updated_at: string
  // 提取的内容（持久化到数据库，切换页面后保留）
  extracted_assets?: ExtractedAsset[]
  extracted_dubbing?: ExtractedDubbing[]
  extracted_shots?: ExtractedShot[]
}

// 提取的资产类型
export interface ExtractedAsset {
  id?: string
  type: 'character' | 'scene' | 'prop'
  name: string
  description?: string
  appearance?: string
  setting?: string
  prompt?: string
  voiceDescription?: string
  count?: number
}

// 提取的配音类型
export interface ExtractedDubbing {
  character: string
  line: string
  emotion?: string
  audio_prompt?: string
  context?: string
}

// 提取的分镜类型
export interface ExtractedShot {
  id: string
  scene: string
  description: string
  duration?: string
  cameraAngle?: string
  characters?: string[]
  props?: string[]
  prompt?: string
  videoPrompt?: string
  dubbing?: {
    character?: string
    line?: string
    emotion?: string
    audio_prompt?: string
  }
  references?: {
    characters?: string[]
    scenes?: string[]
    props?: string[]
  }
}

// 分镜类型
export interface Storyboard {
  id: string
  episode_id: string
  project_id: string
  name: string
  shot_type?: string
  scene?: string
  scene_id?: string
  location?: string
  time?: string
  description?: string
  prompt?: string
  negative_prompt?: string
  video_prompt?: string
  image?: string
  video?: string
  audio?: string
  duration?: number
  status?: string
  sort_order?: number
  character_ids?: string[]
  prop_ids?: string[]
  reference_images?: string[] // 图片模式参考图片数组（持久化存储）
  video_reference_images?: string[] // 视频模式参考图片数组（持久化存储）
  metadata?: Record<string, unknown>
  created_at: string
  updated_at: string
}

// 角色标签类型
export type CharacterTag = 'protagonist' | 'supporting' | 'narrator' | 'guest' | 'other'

export const CHARACTER_TAG_CONFIG: Record<CharacterTag, { label: string; color: string }> = {
  protagonist: { label: '主角', color: 'bg-red-500' },
  supporting: { label: '配角', color: 'bg-blue-500' },
  narrator: { label: '旁白', color: 'bg-purple-500' },
  guest: { label: '客串', color: 'bg-green-500' },
  other: { label: '其他', color: 'bg-gray-500' },
}

// 场景类型
export interface Scene {
  id: string
  project_id: string
  episode_id?: string
  name: string
  description?: string
  prompt?: string // AI 生图提示词
  tags?: string[] // 标签数组
  image?: string
  metadata?: Record<string, unknown>
  created_at: string
  updated_at: string
}

// 道具类型
export interface Prop {
  id: string
  project_id: string
  episode_id?: string
  name: string
  description?: string
  prompt?: string // AI 生图提示词
  tags?: string[] // 标签数组
  image?: string
  metadata?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface CharacterOutfit {
  id: string
  character_id: string
  name: string
  description?: string
  prompt?: string
  image?: string
  tags?: string[]
  is_default: boolean
  created_at: string
  updated_at: string
}

// 角色类型
export interface Character {
  id: string
  project_id: string
  episode_id?: string
  name: string
  image?: string
  default_voice_id?: string
  minimax_voice_id?: string
  minimax_file_id?: number
  description?: string
  prompt?: string
  voice_profile?: string
  voice_description?: string
  tag?: CharacterTag
  tags?: string[]
  created_at: string
  updated_at: string
}

// 配音类型
export type DubbingStatus = 'pending' | 'generating' | 'completed' | 'failed'
export type DubbingType = 'narration' | 'character' | 'extra'

export interface Dubbing {
  id: string
  project_id: string
  storyboard_id: string
  character_id?: string
  text: string
  audio_url?: string
  duration?: number
  voice_id?: string
  provider?: string
  status: DubbingStatus
  type?: DubbingType // 配音类型：narration(旁白), character(角色), extra(额外)
  emotion?: string // 情绪：开心、悲伤、愤怒、惊讶、平静、兴奋、温柔、紧张、害怕、厌恶、困惑、失望、尴尬、害羞、自豪、嫉妒、焦虑、沮丧、疲惫、满足、感激、期待、怀念、嘲讽、冷酷、严肃、亲切、活泼、沉稳、神秘、威严、默认
  audio_prompt?: string // 配音提示词，融合情绪和语气描述
  sequence: number // 同分镜内配音顺序，支持多角色多台词
  created_at: string
  updated_at: string
}

// AI 模型配置
export interface AIModelConfig {
  id: string
  name: string
  type: 'image' | 'video' | 'tts' | 'chat'
  provider: string
  apiKey?: string
  baseUrl?: string
  modelName?: string
  endpoints?: {
    image?: string
    video?: string
    chat?: string
  }
  enabled: boolean
  category?: 'default' | 'custom' | 'production' | 'testing' | 'backup'
  isDefault?: boolean
  description?: string
  endpoint?: string
  adapterType?: string // 适配器类型（用于自定义供应商指定 API 格式）
  createdAt?: string
  updatedAt?: string
}

// 工作流配置
export interface WorkflowConfig {
  id: string
  name: string
  type: 'txt2img' | 'img2img' | 'img2vid' | 'txt2vid' | 'tts' | 'other'
  workflow: Record<string, any>
  nodes: {
    prompt?: string | string[]
    negativePrompt?: string | string[]
    width?: string | string[]
    height?: string | string[]
    seed?: string | string[]
    imageInput?: string | string[]
    output?: string | string[]
    text?: string | string[]
    voice_id?: string | string[]
    emotion?: string | string[]
    speed?: string | string[]
    [key: string]: string | string[] | undefined
  }
  created_at: string
  updated_at: string
  // 扩展字段
  description?: string
  tags?: string[]
}

// 插件类型
export interface Plugin {
  id: string
  name: string
  version: string
  enabled: boolean
  config?: Record<string, any>
  installed_at: string
  updated_at: string
}

// ComfyUI 配置类型
export interface ComfyConfig {
  address: string
  ttsWorkflow: Record<string, any> | null
  ttsNodes: {
    textInput: string
    audioRef: string
    emotion?: string
    audioOutput: string
  }
  img2VidWorkflow: Record<string, any> | null
  img2VidNodes: {
    prompt: string
    image: string
    width: string
    height: string
    frameCount: string
    output: string
  }
  txt2ImgWorkflow: Record<string, any> | null
  txt2ImgNodes: {
    prompt: string
    seed: string
    width: string
    height: string
    output: string
  }
  img2ImgWorkflow: Record<string, any> | null
  img2ImgNodes: {
    prompt: string
    seed: string
    source: string
    width: string
    height: string
    output: string
  }
}

// API 配置类型
export interface ApiConfig {
  apiKey: string
  baseUrl: string
  textModel: string
  imageModel: string
  videoModel: string
  apiProvider?: 'google' | 'thirdParty'
  apiPaths?: {
    chat?: string
    imageGeneration?: string
    imageEdit?: string
    videoGeneration?: string
  }
  comfyConfig: ComfyConfig
}

// 媒体资产（全局提示词库）
export interface MediaAsset {
  id: string
  name: string
  type: 'image' | 'video'
  file_path: string
  prompt?: string
  tags?: string[]
  description?: string
  width?: number
  height?: number
  file_size?: number
  source?: 'generated' | 'imported'
  project_id?: string
  episode_id?: string
  created_at: string
  updated_at: string
}

// 导出样片审阅相关类型
export type GenerationTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
export type GenerationTaskType = 'image_generation' | 'video_generation' | 'audio_generation' | 'text_generation'

export interface GenerationTask {
  id: string
  type: GenerationTaskType
  name?: string
  status: GenerationTaskStatus
  model?: string
  provider?: string
  project_id?: string
  episode_id?: string
  prompt?: string
  input_params?: Record<string, unknown>
  output_url?: string
  output_path?: string
  error?: string
  progress: number
  step_name?: string
  retry_count: number
  max_retries: number
  api_task_id?: string
  metadata?: Record<string, unknown>
  started_at?: string
  completed_at?: string
  created_at: string
  updated_at: string
}

export type TaskLogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface TaskLogEntry {
  id: number
  task_id: string
  timestamp: string
  level: TaskLogLevel
  message: string
  data?: Record<string, unknown>
}

export interface GenerationTaskWithLogs extends GenerationTask {
  logs: TaskLogEntry[]
}

export * from './sample'

// 图片比例选项
export const IMAGE_ASPECT_RATIOS = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '21:9',
] as const

export type ImageAspectRatio = typeof IMAGE_ASPECT_RATIOS[number]
