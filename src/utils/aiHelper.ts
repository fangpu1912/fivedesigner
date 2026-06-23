import { AI } from '@/services/vendor/aiService'
import logger from '@/utils/logger'

export function parseJSON<T>(text: string): T {
  let cleaned = text.trim()

  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch?.[1]) {
    cleaned = codeBlockMatch[1].trim()
  }

  try {
    return JSON.parse(cleaned) as T
  } catch {
    // continue to next strategy
  }

  try {
    const firstBrace = cleaned.indexOf('{')
    const lastBrace = cleaned.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1)) as T
    }
  } catch {
    // continue to next strategy
  }

  try {
    const firstBracket = cleaned.indexOf('[')
    const lastBracket = cleaned.lastIndexOf(']')
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      return JSON.parse(cleaned.substring(firstBracket, lastBracket + 1)) as T
    }
  } catch {
    // continue to next strategy
  }

  throw new Error(`无法解析AI响应为JSON: ${cleaned.substring(0, 300)}`)
}

export interface CallAIOptions {
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
}

export async function callAI(prompt: string, options?: CallAIOptions): Promise<string> {
  try {
    const messages = []
    if (options?.systemPrompt) {
      messages.push({ role: 'system' as const, content: options.systemPrompt })
    }
    messages.push({ role: 'user' as const, content: prompt })

    const result = await AI.Text.generate({
      messages,
      temperature: options?.temperature ?? 0.7,
      maxTokens: options?.maxTokens ?? 16384,
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

export function splitContentIntoChunks(content: string, chunkSize: number = 10000): string[] {
  if (content.length <= chunkSize) return [content]

  const chunks: string[] = []
  let start = 0

  while (start < content.length) {
    if (start + chunkSize >= content.length) {
      chunks.push(content.substring(start))
      break
    }

    let splitPos = start + chunkSize

    const paragraphBreak = content.lastIndexOf('\n\n', splitPos)
    if (paragraphBreak > start + chunkSize * 0.5) {
      splitPos = paragraphBreak + 2
    } else {
      const lineBreak = content.lastIndexOf('\n', splitPos)
      if (lineBreak > start + chunkSize * 0.5) {
        splitPos = lineBreak + 1
      }
    }

    chunks.push(content.substring(start, splitPos))
    start = splitPos
  }

  logger.info(`[AIHelper] 内容分为 ${chunks.length} 块, 各块长度: ${chunks.map(c => c.length).join(', ')}`)
  return chunks
}

export function mergeSceneChunks(allScenes: PipelineSceneInput[]): PipelineSceneInput[] {
  const merged: PipelineSceneInput[] = []
  for (const scene of allScenes) {
    const existing = merged.find(m => m.name === scene.name)
    if (existing) {
      if (scene.originalText) {
        existing.originalText = (existing.originalText || '') + '\n' + scene.originalText
      }
      if (scene.summary && existing.summary) {
        existing.summary = existing.summary + '；' + scene.summary
      }
      for (const char of scene.characters) {
        if (!existing.characters.includes(char)) {
          existing.characters.push(char)
        }
      }
    } else {
      merged.push({ ...scene, characters: [...scene.characters] })
    }
  }
  return merged
}

export interface PipelineSceneInput {
  name: string
  summary: string
  originalText: string
  location: string
  time: string
  mood: string
  characters: string[]
  narrativeFunction: string
}
