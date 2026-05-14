export interface ParsedToken {
  type: 'keyword' | 'weight' | 'embedding' | 'negative' | 'bracket' | 'text'
  value: string
  weight?: number
  embedding?: string
}

export interface ParsedPrompt {
  tokens: ParsedToken[]
  positivePrompt: string
  negativePrompt: string
  keywords: string[]
  weights: Map<string, number>
  embeddings: string[]
}

const WEIGHT_REGEX = /\(([^)]+):([\d.]+)\)/g
const EMBEDDING_REGEX = /\[([^\]]+):([\d.]+)\]/g
const NEGATIVE_REGEX = /\[NEGATIVE:\s*([^\]]+)\]/gi

export function parsePrompt(prompt: string): ParsedPrompt {
  const tokens: ParsedToken[] = []
  const weights = new Map<string, number>()
  const embeddings: string[] = []
  const keywords: string[] = []

  let negativePrompt = ''
  let positivePrompt = prompt

  const negativeMatch = prompt.match(NEGATIVE_REGEX)
  if (negativeMatch) {
    negativePrompt = negativeMatch.map(m => m.replace(/\[NEGATIVE:\s*|\]/g, '')).join(', ')
    positivePrompt = prompt.replace(NEGATIVE_REGEX, '').trim()
  }

  const processedPrompt = positivePrompt
  let match

  while ((match = WEIGHT_REGEX.exec(processedPrompt)) !== null) {
    const keyword = match[1]
    const weightStr = match[2]
    if (keyword && weightStr) {
      const weight = parseFloat(weightStr)
      weights.set(keyword, weight)
      keywords.push(keyword)

      tokens.push({
        type: 'weight',
        value: match[0],
        weight,
      })
    }
  }

  WEIGHT_REGEX.lastIndex = 0

  while ((match = EMBEDDING_REGEX.exec(processedPrompt)) !== null) {
    const embeddingName = match[1]
    if (embeddingName) {
      embeddings.push(embeddingName)

      tokens.push({
        type: 'embedding',
        value: match[0],
        embedding: embeddingName,
      })
    }
  }

  EMBEDDING_REGEX.lastIndex = 0

  const remainingText = processedPrompt
    .replace(WEIGHT_REGEX, '')
    .replace(EMBEDDING_REGEX, '')
    .replace(NEGATIVE_REGEX, '')
    .trim()

  if (remainingText) {
    const words = remainingText.split(/[,，\s]+/).filter(Boolean)
    words.forEach(word => {
      if (!keywords.includes(word)) {
        keywords.push(word)
        tokens.push({
          type: 'keyword',
          value: word,
        })
      }
    })
  }

  return {
    tokens,
    positivePrompt,
    negativePrompt,
    keywords,
    weights,
    embeddings,
  }
}

export function applyWeight(keyword: string, weight: number): string {
  return `(${keyword}:${weight.toFixed(2)})`
}

export function applyEmbedding(embeddingName: string, weight: number = 1): string {
  return `[${embeddingName}:${weight.toFixed(2)}]`
}

export function formatNegativePrompt(negativePrompt: string): string {
  return `[NEGATIVE: ${negativePrompt}]`
}

export function extractWeights(prompt: string): Map<string, number> {
  const weights = new Map<string, number>()
  let match

  while ((match = WEIGHT_REGEX.exec(prompt)) !== null) {
    const keyword = match[1]
    const weightStr = match[2]
    if (keyword && weightStr) {
      weights.set(keyword, parseFloat(weightStr))
    }
  }

  return weights
}

export function extractEmbeddings(prompt: string): string[] {
  const embeddings: string[] = []
  let match

  while ((match = EMBEDDING_REGEX.exec(prompt)) !== null) {
    const embeddingName = match[1]
    if (embeddingName) {
      embeddings.push(embeddingName)
    }
  }

  return embeddings
}

export function highlightSyntax(text: string): Array<{ text: string; type: string }> {
  const segments: Array<{ text: string; type: string }> = []
  let lastIndex = 0

  const patterns = [
    { regex: /\(([^)]+):([\d.]+)\)/g, type: 'weight' },
    { regex: /\[([^\]]+):([\d.]+)\]/g, type: 'embedding' },
    { regex: /\[NEGATIVE:[^\]]+\]/gi, type: 'negative' },
    { regex: /[\]{}()[\]]/g, type: 'bracket' },
  ]

  const matches: Array<{ start: number; end: number; type: string }> = []

  patterns.forEach(({ regex, type }) => {
    let match
    regex.lastIndex = 0
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        type,
      })
    }
  })

  matches.sort((a, b) => a.start - b.start)

  matches.forEach(({ start, end, type }) => {
    if (start > lastIndex) {
      segments.push({ text: text.slice(lastIndex, start), type: 'text' })
    }
    segments.push({ text: text.slice(start, end), type })
    lastIndex = end
  })

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), type: 'text' })
  }

  return segments.length > 0 ? segments : [{ text, type: 'text' }]
}

export function validatePrompt(prompt: string): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const brackets: Array<{ char: string; index: number }> = []

  const bracketPairs: Record<string, string> = {
    '(': ')',
    '[': ']',
    '{': '}',
    ')': '(',
    ']': '[',
    '}': '{',
  }

  const openBrackets = ['(', '[', '{']

  for (let i = 0; i < prompt.length; i++) {
    const char = prompt[i]
    if (char && openBrackets.includes(char)) {
      brackets.push({ char, index: i })
    } else if (char && [')', ']', '}'].includes(char)) {
      const lastBracket = brackets.pop()
      if (!lastBracket || bracketPairs[lastBracket.char] !== char) {
        errors.push(`位置 ${i}: 不匹配的闭合括号 "${char}"`)
      }
    }
  }

  brackets.forEach(({ char, index }) => {
    errors.push(`位置 ${index}: 未闭合的括号 "${char}"`)
  })

  let match
  while ((match = WEIGHT_REGEX.exec(prompt)) !== null) {
    const weightStr = match[2]
    if (weightStr) {
      const weight = parseFloat(weightStr)
      if (weight < 0 || weight > 2) {
        errors.push(`权重值 ${weight} 超出推荐范围 (0-2)`)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

export function mergePrompts(prompts: string[]): string {
  return prompts.filter(Boolean).join(', ')
}

export function splitPrompt(prompt: string): string[] {
  return prompt
    .split(/[,，]+/)
    .map(s => s.trim())
    .filter(Boolean)
}
