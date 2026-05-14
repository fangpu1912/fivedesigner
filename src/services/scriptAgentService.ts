import { AI } from '@/services/vendor/aiService'
import { getActivePrompt } from '@/services/promptConfigService'

export interface StoryStructure {
  mainPlot: string
  subPlots: Array<{
    name: string
    description: string
    relatedCharacters: string[]
  }>
  foreshadowing: Array<{
    content: string
    resolvedIn: string
  }>
  turningPoints: Array<{
    position: string
    event: string
    impact: string
  }>
}

export interface CharacterArc {
  name: string
  initialState: string
  development: string
  finalState: string
  keyMoments: string[]
}

export interface AdaptationStrategy {
  preserveElements: string[]
  compressElements: string[]
  expandElements: string[]
  removeElements: string[]
  notes: string
}

export interface ScriptOutline {
  title: string
  logline: string
  theme: string
  structure: StoryStructure
  characterArcs: CharacterArc[]
  adaptationStrategy: AdaptationStrategy
  estimatedDuration: string
  targetAudience: string
}

export interface ScriptAgentProgress {
  stage: 'analyzing' | 'structuring' | 'outlining' | 'completed'
  percent: number
  message: string
}

export type ScriptAgentProgressCallback = (progress: ScriptAgentProgress) => void

function parseJSON<T>(text: string): T {
  let cleaned = text.trim()

  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1]!.trim()
  }

  try {
    return JSON.parse(cleaned) as T
  } catch {}

  const firstObj = cleaned.indexOf('{')
  if (firstObj === -1) {
    throw new Error(`无法从AI响应中提取JSON: ${cleaned.substring(0, 200)}`)
  }

  let depth = 0
  let inStr = false
  let escape = false
  for (let i = firstObj; i < cleaned.length; i++) {
    const ch = cleaned[i]
    if (escape) { escape = false; continue }
    if (ch === '\\' && inStr) { escape = true; continue }
    if (ch === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (ch === '{') depth++
    if (ch === '}') {
      depth--
      if (depth === 0) {
        const candidate = cleaned.substring(firstObj, i + 1)
        try {
          return JSON.parse(candidate) as T
        } catch {}
        break
      }
    }
  }

  throw new Error(`无法解析AI响应为JSON: ${cleaned.substring(0, 300)}`)
}

async function callAI(prompt: string): Promise<string> {
  try {
    const result = await AI.Text.generate({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      maxTokens: 8192,
    })
    if (!result) {
      throw new Error('AI 返回了空结果')
    }
    return result
  } catch (error) {
    const msg = error instanceof Error ? error.message : (typeof error === 'string' ? error : JSON.stringify(error))
    throw new Error(`AI 生成失败: ${msg}`)
  }
}

export async function analyzeNovelStructure(
  content: string,
  onProgress?: ScriptAgentProgressCallback
): Promise<StoryStructure> {
  onProgress?.({ stage: 'analyzing', percent: 10, message: '分析故事结构...' })

  const prompt = getActivePrompt('script_structure_analysis', {
    content: content.substring(0, 15000),
  })

  const result = await callAI(prompt)
  return parseJSON<StoryStructure>(result)
}

export async function analyzeCharacterArcs(
  content: string,
  characters: string[],
  onProgress?: ScriptAgentProgressCallback
): Promise<CharacterArc[]> {
  onProgress?.({ stage: 'analyzing', percent: 30, message: '分析角色成长弧线...' })

  const prompt = getActivePrompt('script_character_arc', {
    content: content.substring(0, 12000),
    characters: characters.join('、'),
  })

  const result = await callAI(prompt)
  return parseJSON<CharacterArc[]>(result)
}

export async function generateAdaptationStrategy(
  structure: StoryStructure,
  targetDuration: string,
  onProgress?: ScriptAgentProgressCallback
): Promise<AdaptationStrategy> {
  onProgress?.({ stage: 'structuring', percent: 50, message: '制定改编策略...' })

  const prompt = getActivePrompt('script_adaptation_strategy', {
    mainPlot: structure.mainPlot,
    subPlots: JSON.stringify(structure.subPlots),
    targetDuration,
  })

  const result = await callAI(prompt)
  return parseJSON<AdaptationStrategy>(result)
}

export async function generateScriptOutline(
  content: string,
  onProgress?: ScriptAgentProgressCallback
): Promise<ScriptOutline> {
  onProgress?.({ stage: 'outlining', percent: 20, message: '生成剧本大纲...' })

  const structure = await analyzeNovelStructure(content, onProgress)

  onProgress?.({ stage: 'outlining', percent: 40, message: '分析角色弧线...' })
  const characterArcs = await analyzeCharacterArcs(
    content,
    structure.subPlots.flatMap(s => s.relatedCharacters).slice(0, 5),
    onProgress
  )

  onProgress?.({ stage: 'outlining', percent: 60, message: '制定改编策略...' })
  const adaptationStrategy = await generateAdaptationStrategy(
    structure,
    '10-15分钟短片',
    onProgress
  )

  onProgress?.({ stage: 'outlining', percent: 80, message: '生成完整大纲...' })

  const prompt = getActivePrompt('script_outline_generation', {
    content: content.substring(0, 10000),
    structure: JSON.stringify(structure),
    characterArcs: JSON.stringify(characterArcs),
    adaptationStrategy: JSON.stringify(adaptationStrategy),
  })

  const result = await callAI(prompt)
  const outline = parseJSON<ScriptOutline>(result)
  outline.structure = structure
  outline.characterArcs = characterArcs
  outline.adaptationStrategy = adaptationStrategy

  onProgress?.({ stage: 'completed', percent: 100, message: '剧本大纲生成完成' })

  return outline
}

export const ScriptAgent = {
  analyzeNovelStructure,
  analyzeCharacterArcs,
  generateAdaptationStrategy,
  generateScriptOutline,
}
