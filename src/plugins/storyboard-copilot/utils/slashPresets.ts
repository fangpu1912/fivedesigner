export interface SlashPreset {
  id: string
  label: string
  category: string
  prompt: string
  description?: string
}

export const SLASH_PRESETS: SlashPreset[] = [
  {
    id: 'scene-ref',
    label: '场景参考图',
    category: '图片',
    prompt: '生成场景参考图，包含全景环境、光影氛围、空间纵深，{用户输入}',
    description: '生成带环境氛围的场景图',
  },
  {
    id: 'character-3view',
    label: '角色三视图',
    category: '图片',
    prompt: '生成角色三视图（正面、侧面、背面），保持角色外观一致性，白色/纯色背景，{用户输入}',
    description: '角色正面+侧面+背面参考图',
  },
  {
    id: 'character-4view',
    label: '角色四视图',
    category: '图片',
    prompt: '生成角色四视图合一提示词（正面半身肖像+正面全身+侧面全身+背面全身），纯角色静态展示，无道具，统一柔光，白色/纯色背景，确保角色一致性，{用户输入}',
    description: '角色四视图合一（半身+三全身）',
  },
  {
    id: 'grid-4',
    label: '四宫格分镜',
    category: '分镜',
    prompt: '生成一张无缝的四宫格（2x2）的连贯剧情分镜图。要求：同一角色的外观、服饰、发型保持一致；场景与光影风格统一；镜头从左上到右下依次推进；每一格都有明确动作与主体，构图干净、排版紧凑。{用户输入}',
    description: '2x2 连贯剧情分镜',
  },
  {
    id: 'grid-9',
    label: '九宫格分镜',
    category: '分镜',
    prompt: '生成一张无缝的九宫格（3x3）的连贯剧情分镜图。要求：角色与关键道具保持一致；场景与光影风格统一；镜头从左上到右下依次推进；每一格都有明确动作与主体，构图干净、排版紧凑。{用户输入}',
    description: '3x3 连贯剧情分镜',
  },
  {
    id: 'grid-16',
    label: '十六宫格分镜',
    category: '分镜',
    prompt: '生成一张无缝的十六宫格（4x4）的连贯剧情分镜图。要求：角色与关键道具保持完全一致；每一个分镜都必须是下一个分镜的时间上或因果上的延续；整体风格统一；分镜顺序从左上到右下；画面干净、排版紧凑。{用户输入}',
    description: '4x4 连贯剧情分镜',
  },
  {
    id: 'shot-closeup',
    label: '特写镜头',
    category: '景别',
    prompt: '特写镜头，聚焦面部/手部/关键道具细节，浅景深，{用户输入}',
    description: '面部或细节特写',
  },
  {
    id: 'shot-medium',
    label: '中景',
    category: '景别',
    prompt: '中景镜头，腰部以上构图，展示人物动作与表情，{用户输入}',
    description: '腰部以上构图',
  },
  {
    id: 'shot-full',
    label: '全景',
    category: '景别',
    prompt: '全景镜头，全身构图，展示人物与环境的完整关系，{用户输入}',
    description: '全身+环境构图',
  },
  {
    id: 'shot-wide',
    label: '远景',
    category: '景别',
    prompt: '远景镜头，大场景构图，强调空间纵深与环境氛围，人物较小，{用户输入}',
    description: '大场景环境构图',
  },
  {
    id: 'angle-low',
    label: '仰拍',
    category: '机位',
    prompt: '低角度仰拍，从下往上拍摄，人物显得高大威严，{用户输入}',
    description: '低角度仰视',
  },
  {
    id: 'angle-high',
    label: '俯拍',
    category: '机位',
    prompt: '高角度俯拍，从上往下拍摄，展示全局空间关系，{用户输入}',
    description: '高角度俯视',
  },
  {
    id: 'angle-shoulder',
    label: '过肩镜头',
    category: '机位',
    prompt: '过肩镜头，前景人物肩膀虚化，聚焦对面人物表情，{用户输入}',
    description: '对话场景常用',
  },
  {
    id: 'angle-pov',
    label: '主观视角',
    category: '机位',
    prompt: '第一人称主观视角，从角色眼睛位置拍摄，增强代入感，{用户输入}',
    description: '角色视角',
  },
  {
    id: 'light-natural',
    label: '自然光',
    category: '光影',
    prompt: '自然光照明，柔和均匀，真实感强，{用户输入}',
    description: '柔和自然光',
  },
  {
    id: 'light-backlit',
    label: '逆光',
    category: '光影',
    prompt: '逆光拍摄，轮廓光勾勒人物边缘，画面有光晕和层次感，{用户输入}',
    description: '轮廓光+光晕',
  },
  {
    id: 'light-golden',
    label: '黄金时刻',
    category: '光影',
    prompt: '黄金时刻光线，暖色调，长投影，温暖浪漫氛围，{用户输入}',
    description: '日出/日落暖光',
  },
  {
    id: 'light-neon',
    label: '霓虹灯光',
    category: '光影',
    prompt: '霓虹灯光照明，多彩反射，赛博朋克/都市夜景氛围，{用户输入}',
    description: '多彩霓虹夜景',
  },
  {
    id: 'video-static',
    label: '固定镜头',
    category: '视频',
    prompt: '固定机位拍摄，画面稳定，适合对话和展示场景',
    description: '静止不动',
  },
  {
    id: 'video-pan',
    label: '横摇镜头',
    category: '视频',
    prompt: '镜头水平摇动，从左到右或从右到左缓慢移动，展示环境全貌',
    description: '水平摇摄',
  },
  {
    id: 'video-push',
    label: '推镜头',
    category: '视频',
    prompt: '镜头缓慢向前推进，逐渐靠近主体，增强关注度和紧张感',
    description: '向前推进',
  },
  {
    id: 'video-follow',
    label: '跟拍',
    category: '视频',
    prompt: '镜头跟随人物移动，保持人物在画面中心，营造身临其境感',
    description: '跟随主体',
  },
  {
    id: 'video-orbit',
    label: '环绕镜头',
    category: '视频',
    prompt: '镜头围绕主体缓慢旋转，360度展示人物或物体',
    description: '环绕旋转',
  },
  {
    id: 'long-to-short',
    label: '长文精简',
    category: '文本',
    prompt: '对以上的小说剧情文案进行大幅精简（目标篇幅约为原文的50-70%），完整保留原文对话，按照"对白驱动剧情"的结构重新梳理旁白与独白，保留原文段落结构与标点符号。',
    description: '保留对白精简叙事',
  },
  {
    id: 'extract-characters',
    label: '提取角色',
    category: '文本',
    prompt: '从以下文本中提取所有角色，对每个角色输出：name（角色名）、description（外貌、性格、身份、内心动机）、prompt（AI生图提示词：人物名+年龄段+体型+五官+发型+肤色+服装+配饰+姿态+表情）',
    description: '提取角色设定',
  },
  {
    id: 'extract-scenes',
    label: '提取场景',
    category: '文本',
    prompt: '从以下文本中提取所有场景，对每个场景输出：name（场景名）、description（环境、氛围、时间）、prompt（AI生图提示词：视角+时间段+天气+地理位置+环境元素+材质+颜色+光线+色调）',
    description: '提取场景设定',
  },
]

export const SLASH_CATEGORIES = [
  { id: '图片', label: '图片生成', order: 1 },
  { id: '分镜', label: '分镜构图', order: 2 },
  { id: '景别', label: '景别', order: 3 },
  { id: '机位', label: '机位角度', order: 4 },
  { id: '光影', label: '光影风格', order: 5 },
  { id: '视频', label: '视频运镜', order: 6 },
  { id: '文本', label: '文本处理', order: 7 },
] as const

export function searchSlashPresets(query: string): SlashPreset[] {
  if (!query) return SLASH_PRESETS
  const lower = query.toLowerCase()
  return SLASH_PRESETS.filter(
    (p) =>
      p.label.toLowerCase().includes(lower) ||
      p.description?.toLowerCase().includes(lower) ||
      p.category.toLowerCase().includes(lower) ||
      p.prompt.toLowerCase().includes(lower),
  )
}
