import logger from '@/utils/logger'

export function parseAIJsonResponse<T = unknown>(response: string): T | null {
  if (!response) return null

  let cleaned = response.trim()

  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7)
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3)
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3)
  }
  cleaned = cleaned.trim()

  cleaned = cleaned
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/"/g, '"')
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .replace(/'/g, "'")

  cleaned = cleaned.replace(
    /"(prompt|description|scene|content|text|name|type|line|emotion|audio_prompt|voiceDescription|videoPrompt|nanoBananaGridPrompt)":\s*([^"\[\{][^,}\]]*?)(,|\}|\])/g,
    (match, key, value, ending) => {
      const trimmedValue = value.trim()
      if (trimmedValue && !trimmedValue.match(/^["\[\{]/)) {
        return `"${key}": "${trimmedValue}"${ending}`
      }
      return match
    }
  )

  try {
    return JSON.parse(cleaned) as T
  } catch (e) {
    logger.warn('JSON 解析失败，尝试提取 JSON 块:', e)

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]) as T
      } catch (e2) {
        logger.warn('JSON 块提取后仍解析失败:', e2)
        return null
      }
    }

    return null
  }
}

export function extractArrayFromResponse<T = unknown>(response: unknown, ...keys: string[]): T[] {
  if (Array.isArray(response)) return response

  if (response && typeof response === 'object') {
    const obj = response as Record<string, unknown>
    for (const key of keys) {
      if (obj[key] && Array.isArray(obj[key])) {
        return obj[key] as T[]
      }
    }
    if (obj.items && Array.isArray(obj.items)) {
      return obj.items as T[]
    }
    if (obj.data && Array.isArray(obj.data)) {
      return obj.data as T[]
    }
  }

  return []
}
