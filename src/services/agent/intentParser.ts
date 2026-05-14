/**
 * 需求解析引擎
 * 将自然语言描述解析为结构化创作需求
 */

import type { ParsedIntent, CreationType, CreationStyle } from './types'

// 风格关键词映射
const STYLE_KEYWORDS: Record<string, CreationStyle[]> = {
  '古风': ['古风', '仙侠', '武侠', '古典', '传统', '汉服', '唐装', '宋制'],
  '现代': ['现代', '都市', '时尚', '潮流', '简约', '清新'],
  '科幻': ['科幻', '未来', '赛博朋克', '机械', '太空', '宇宙'],
  '悬疑': ['悬疑', '惊悚', '恐怖', '暗黑', '神秘'],
  '言情': ['言情', '浪漫', '唯美', '甜蜜', '温柔'],
  '奇幻': ['奇幻', '魔幻', '魔法', '异世界', '精灵'],
  '写实': ['写实', '真实', '照片级', '逼真'],
  '动漫': ['动漫', '二次元', '卡通', 'Q版', '日系'],
}

// 类型关键词映射
const TYPE_KEYWORDS: Record<CreationType, string[]> = {
  'image': ['图', '图片', '画', '海报', '封面', '插画', '头像', '壁纸'],
  'video': ['视频', '短片', '动画', 'MV', '影片', '动图', '跳舞', '舞蹈', '舞剑', '动作', '运动'],
  'audio': ['音频', '配音', '声音', '语音', '音乐'],
  'mixed': ['套', '系列', '组合', '全套'],
}

// 比例关键词映射
const ASPECT_RATIO_MAP: Record<string, string> = {
  '竖屏': '9:16',
  '手机': '9:16',
  '抖音': '9:16',
  '横屏': '16:9',
  '电脑': '16:9',
  '电影': '16:9',
  '方形': '1:1',
  '正方形': '1:1',
  '头像': '1:1',
}

/**
 * 解析用户输入
 */
export async function parseIntent(input: string): Promise<ParsedIntent> {
  // 1. 识别创作类型
  const type = detectType(input)

  // 2. 识别风格
  const style = detectStyle(input)

  // 3. 提取主体、场景、动作
  const { subject, scene, action, mood } = extractElements(input)

  // 4. 识别比例和尺寸
  const { aspectRatio, width, height } = detectAspectRatio(input)

  // 5. 识别输出数量
  const outputCount = detectOutputCount(input)

  // 6. 识别时长（视频）
  const duration = detectDuration(input)

  // 7. 优化提示词
  const optimizedPrompt = optimizePrompt(input, style, subject, scene, action, mood)

  return {
    type,
    style,
    subject,
    scene,
    action,
    mood,
    outputCount,
    aspectRatio,
    width,
    height,
    duration,
    rawInput: input,
    optimizedPrompt,
  }
}

/**
 * 检测创作类型
 */
function detectType(input: string): CreationType {
  const lowerInput = input.toLowerCase()

  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (keywords.some(kw => lowerInput.includes(kw))) {
      return type as CreationType
    }
  }

  // 默认类型
  if (lowerInput.includes('视频') || lowerInput.includes('短片')) {
    return 'video'
  }
  if (lowerInput.includes('配音') || lowerInput.includes('音频')) {
    return 'audio'
  }

  return 'image'
}

/**
 * 检测风格
 */
function detectStyle(input: string): CreationStyle {
  const lowerInput = input.toLowerCase()

  for (const [style, keywords] of Object.entries(STYLE_KEYWORDS)) {
    if (keywords.some(kw => lowerInput.includes(kw))) {
      return style as CreationStyle
    }
  }

  return '写实'
}

/**
 * 提取主体、场景、动作、情绪
 */
function extractElements(input: string): {
  subject: string
  scene?: string
  action?: string
  mood?: string
} {
  // 简单的规则提取，后续可以用 LLM 优化
  let subject = ''
  let scene = ''
  let action = ''
  let mood = ''

  // 提取主体（通常是"XX在..."或"XX做..."中的XX）
  const subjectMatch = input.match(/([^，。]+?)(?:在|做|穿|拿|站|坐|走|跑)/)
  if (subjectMatch) {
    subject = subjectMatch[1]?.trim() ?? ''
  }

  // 提取场景（"在...中/里/上"）
  const sceneMatch = input.match(/在([^，。]+?)(?:中|里|上|下|前|后)/)
  if (sceneMatch) {
    scene = sceneMatch[1]?.trim() ?? ''
  }

  // 提取动作（动词）
  const actionKeywords = ['舞剑', '站立', '坐着', '行走', '奔跑', '跳跃', '微笑', '凝视', '挥手']
  for (const kw of actionKeywords) {
    if (input.includes(kw)) {
      action = kw
      break
    }
  }

  // 提取情绪/氛围
  const moodKeywords = ['氛围感', '唯美', '浪漫', '紧张', '神秘', '温馨', '悲伤', '欢快']
  for (const kw of moodKeywords) {
    if (input.includes(kw)) {
      mood = kw
      break
    }
  }

  return { subject, scene, action, mood }
}

/**
 * 检测比例和尺寸
 */
function detectAspectRatio(input: string): {
  aspectRatio: string
  width: number
  height: number
} {
  const lowerInput = input.toLowerCase()

  // 检查关键词
  for (const [keyword, ratio] of Object.entries(ASPECT_RATIO_MAP)) {
    if (lowerInput.includes(keyword)) {
      return calculateDimensions(ratio)
    }
  }

  // 检查数字比例（如 16:9, 1:1）
  const ratioMatch = input.match(/(\d+):(\d+)/)
  if (ratioMatch) {
    return calculateDimensions(`${ratioMatch[1]}:${ratioMatch[2]}`)
  }

  // 默认 16:9
  return calculateDimensions('16:9')
}

/**
 * 根据比例计算尺寸
 */
function calculateDimensions(aspectRatio: string): {
  aspectRatio: string
  width: number
  height: number
} {
  const baseSize = 1024

  switch (aspectRatio) {
    case '1:1':
      return { aspectRatio, width: baseSize, height: baseSize }
    case '16:9':
      return { aspectRatio, width: baseSize, height: Math.round(baseSize * 9 / 16) }
    case '9:16':
      return { aspectRatio, width: Math.round(baseSize * 9 / 16), height: baseSize }
    case '4:3':
      return { aspectRatio, width: baseSize, height: Math.round(baseSize * 3 / 4) }
    case '3:4':
      return { aspectRatio, width: Math.round(baseSize * 3 / 4), height: baseSize }
    case '21:9':
      return { aspectRatio, width: baseSize, height: Math.round(baseSize * 9 / 21) }
    default:
      return { aspectRatio: '16:9', width: baseSize, height: Math.round(baseSize * 9 / 16) }
  }
}

/**
 * 检测输出数量
 */
function detectOutputCount(input: string): number {
  // 检查数字 + 张/个/套
  const countMatch = input.match(/(\d+)\s*[张个套幅]/)
  if (countMatch) {
    const count = parseInt(countMatch[1] ?? '1')
    return Math.min(Math.max(count, 1), 10) // 限制 1-10
  }

  // 检查关键词
  if (input.includes('一套') || input.includes('系列')) {
    return 4
  }

  return 1
}

/**
 * 检测时长（视频）
 */
function detectDuration(input: string): number | undefined {
  // 检查数字 + 秒
  const secondMatch = input.match(/(\d+)\s*秒/)
  if (secondMatch) {
    return parseInt(secondMatch[1] ?? '0')
  }

  // 检查数字 + 分钟
  const minuteMatch = input.match(/(\d+)\s*分钟/)
  if (minuteMatch) {
    return parseInt(minuteMatch[1] ?? '0') * 60
  }

  return undefined
}

/**
 * 优化提示词
 */
function optimizePrompt(
  input: string,
  style: CreationStyle,
  _subject: string,
  _scene?: string,
  _action?: string,
  _mood?: string
): string {
  let prompt = input

  // 添加风格词
  if (style && !input.includes(style as string)) {
    prompt = `${style}风格, ${prompt}`
  }

  // 添加质量词
  const qualityWords = ['高质量', '精细', '细节丰富']
  if (!qualityWords.some(qw => input.includes(qw))) {
    prompt += ', 高质量, 细节丰富'
  }

  return prompt
}
