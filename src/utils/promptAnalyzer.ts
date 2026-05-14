/**
 * 提示词分析工具
 * 提供提示词结构分析、Token估算、关键词提取等功能
 */

export interface PromptStructure {
  variables: string[]
  functions: string[]
  conditionals: string[]
  loops: string[]
  warnings: string[]
}

/**
 * 估算提示词的Token数量
 * 使用简化的估算：中文约1.5字符/token，英文约4字符/token
 */
export function estimateTokens(text: string): number {
  if (!text.trim()) return 0

  // 统计中文字符
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  // 统计英文单词（简化估算）
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length
  // 其他字符（标点、数字等）
  const otherChars = text.length - chineseChars - englishWords

  // 估算公式
  const chineseTokens = Math.ceil(chineseChars / 1.5)
  const englishTokens = Math.ceil(englishWords / 0.75)
  const otherTokens = Math.ceil(otherChars / 2)

  return chineseTokens + englishTokens + otherTokens
}

/**
 * 提取关键词
 * 从提示词中提取有意义的关键词
 */
export function extractKeywords(text: string): string[] {
  if (!text.trim()) return []

  const keywords = new Set<string>()

  // 移除模板语法
  const cleanText = text
    .replace(/\{\{[^}]+\}\}/g, ' ')
    .replace(/\{\{#\w+\s+[^}]+\}\}/g, ' ')
    .replace(/\{\{\/\w+\}\}/g, ' ')

  // 提取中文关键词（2-6个字的词组）
  const chineseWords = cleanText.match(/[\u4e00-\u9fa5]{2,6}/g) || []
  chineseWords.forEach(word => {
    // 过滤常见停用词
    if (!isStopWord(word)) {
      keywords.add(word)
    }
  })

  // 提取英文关键词
  const englishWords = cleanText.match(/[a-zA-Z]{3,}/g) || []
  englishWords.forEach(word => {
    const lowerWord = word.toLowerCase()
    if (!isEnglishStopWord(lowerWord)) {
      keywords.add(lowerWord)
    }
  })

  return Array.from(keywords).slice(0, 20)
}

/**
 * 分析提示词结构
 */
export function analyzePromptStructure(text: string): PromptStructure {
  const structure: PromptStructure = {
    variables: [],
    functions: [],
    conditionals: [],
    loops: [],
    warnings: [],
  }

  if (!text.trim()) return structure

  // 提取变量 {{variable}}
  const variableMatches = text.match(/\{\{\s*([^{}|]+?)\s*\}\}/g) || []
  variableMatches.forEach(match => {
    const varName = match.replace(/\{\{|\}\}/g, '').trim()
    if (!structure.variables.includes(varName)) {
      structure.variables.push(varName)
    }
  })

  // 提取条件语句 {{#if}}, {{#unless}}
  const conditionalMatches = text.match(/\{\{#(if|unless)\s+([^}]+)\}\}/g) || []
  conditionalMatches.forEach(match => {
    structure.conditionals.push(match)
  })

  // 提取循环 {{#each}}
  const loopMatches = text.match(/\{\{#each\s+([^}]+)\}\}/g) || []
  loopMatches.forEach(match => {
    structure.loops.push(match)
  })

  // 检查常见问题
  checkCommonIssues(text, structure)

  return structure
}

/**
 * 检查常见问题
 */
function checkCommonIssues(text: string, structure: PromptStructure): void {
  // 检查未闭合的括号
  const openBrackets = (text.match(/\{\{/g) || []).length
  const closeBrackets = (text.match(/\}\}/g) || []).length
  if (openBrackets !== closeBrackets) {
    structure.warnings.push(`括号不匹配: {{ (${openBrackets}) 与 }} (${closeBrackets})`)
  }

  // 检查未闭合的条件语句
  const ifCount = (text.match(/\{\{#if/g) || []).length
  const endifCount = (text.match(/\{\{\/if\}\}/g) || []).length
  if (ifCount !== endifCount) {
    structure.warnings.push(`条件语句未闭合: #if (${ifCount}) 与 /if (${endifCount})`)
  }

  // 检查未闭合的循环
  const eachCount = (text.match(/\{\{#each/g) || []).length
  const endeachCount = (text.match(/\{\{\/each\}\}/g) || []).length
  if (eachCount !== endeachCount) {
    structure.warnings.push(`循环语句未闭合: #each (${eachCount}) 与 /each (${endeachCount})`)
  }

  // 检查重复变量
  const allVars: string[] = []
  const varMatches = text.match(/\{\{\s*([^{}|]+?)\s*\}\}/g) || []
  varMatches.forEach(match => {
    const varName = match.replace(/\{\{|\}\}/g, '').trim()
    allVars.push(varName)
  })

  const varCounts = allVars.reduce((acc, varName) => {
    acc[varName] = (acc[varName] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  Object.entries(varCounts).forEach(([varName, count]) => {
    if (count > 3) {
      structure.warnings.push(`变量 "${varName}" 使用了 ${count} 次，建议减少重复`)
    }
  })

  // 检查提示词长度
  if (text.length > 4000) {
    structure.warnings.push('提示词较长，可能影响AI处理速度')
  }

  // 检查是否有示例标记
  if (text.includes('例如：') || text.includes('示例：') || text.includes('e.g.')) {
    structure.warnings.push('提示词中包含示例内容，实际使用时需要替换')
  }
}

/**
 * 中文停用词检查
 */
function isStopWord(word: string): boolean {
  const stopWords = new Set([
    '一个', '这个', '那个', '这些', '那些', '这里', '那里', '哪里',
    '什么', '怎么', '为什么', '如何', '可以', '需要', '应该',
    '进行', '完成', '实现', '使用', '通过', '根据', '基于',
    '所有', '每个', '任何', '其他', '另外', '然后', '接着',
    '如果', '那么', '但是', '因为', '所以', '虽然', '尽管',
    '内容', '信息', '数据', '结果', '输出', '输入', '返回',
  ])
  return stopWords.has(word)
}

/**
 * 英文停用词检查
 */
function isEnglishStopWord(word: string): boolean {
  const stopWords = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all',
    'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day',
    'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new',
    'now', 'old', 'see', 'two', 'who', 'boy', 'did', 'she',
    'use', 'her', 'way', 'many', 'oil', 'sit', 'set', 'run',
    'eat', 'far', 'sea', 'eye', 'ago', 'off', 'too', 'any',
    'say', 'man', 'try', 'ask', 'end', 'why', 'let', 'put',
    'say', 'she', 'try', 'way', 'own', 'say', 'too', 'old',
  ])
  return stopWords.has(word)
}

/**
 * 优化提示词
 * 提供一些自动优化建议
 */
export function optimizePrompt(text: string): {
  optimized: string
  suggestions: string[]
} {
  const suggestions: string[] = []
  let optimized = text

  // 移除多余的空行
  const originalLines = text.split('\n').length
  optimized = optimized.replace(/\n{3,}/g, '\n\n')
  if (optimized.split('\n').length < originalLines) {
    suggestions.push('移除了多余的空行')
  }

  // 标准化变量格式
  optimized = optimized.replace(/\{\{\s+/g, '{{').replace(/\s+\}\}/g, '}}')

  // 检查并建议添加角色设定
  if (!text.includes('角色') && !text.includes('character')) {
    suggestions.push('考虑添加角色相关的变量')
  }

  // 检查并建议添加风格设定
  if (!text.includes('风格') && !text.includes('style')) {
    suggestions.push('考虑添加风格相关的变量')
  }

  // 检查输出格式
  if (!text.includes('JSON') && !text.includes('格式')) {
    suggestions.push('建议明确指定输出格式（如JSON）')
  }

  return { optimized, suggestions }
}

/**
 * 对比两个提示词
 */
export function comparePrompts(oldText: string, newText: string): {
  added: string[]
  removed: string[]
  modified: string[]
} {
  const oldVars = extractVariables(oldText)
  const newVars = extractVariables(newText)

  const added = newVars.filter(v => !oldVars.includes(v))
  const removed = oldVars.filter(v => !newVars.includes(v))
  const modified: string[] = []

  // 检查共同变量的使用变化
  const commonVars = oldVars.filter(v => newVars.includes(v))
  commonVars.forEach(varName => {
    const oldCount = (oldText.match(new RegExp(`\\{\\{\\s*${varName}\\s*\\}\\}`, 'g')) || []).length
    const newCount = (newText.match(new RegExp(`\\{\\{\\s*${varName}\\s*\\}\\}`, 'g')) || []).length
    if (oldCount !== newCount) {
      modified.push(`${varName} (使用次数: ${oldCount} → ${newCount})`)
    }
  })

  return { added, removed, modified }
}

/**
 * 提取所有变量
 */
function extractVariables(text: string): string[] {
  const vars = new Set<string>()
  const matches = text.match(/\{\{\s*([^{}|]+?)\s*\}\}/g) || []
  matches.forEach(match => {
    const varName = match.replace(/\{\{|\}\}/g, '').trim()
    vars.add(varName)
  })
  return Array.from(vars)
}

/**
 * 验证提示词模板
 */
export function validatePromptTemplate(text: string): {
  valid: boolean
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []

  if (!text.trim()) {
    errors.push('提示词内容不能为空')
    return { valid: false, errors, warnings }
  }

  const structure = analyzePromptStructure(text)

  // 检查语法错误
  if (structure.warnings.some(w => w.includes('未闭合'))) {
    errors.push(...structure.warnings.filter(w => w.includes('未闭合')))
  } else {
    warnings.push(...structure.warnings)
  }

  // 检查是否有变量
  if (structure.variables.length === 0) {
    warnings.push('提示词中没有使用任何变量，可能不够灵活')
  }

  // 检查提示词长度
  const tokens = estimateTokens(text)
  if (tokens > 8000) {
    errors.push(`提示词过长（约${tokens} tokens），可能超出模型限制`)
  } else if (tokens > 4000) {
    warnings.push(`提示词较长（约${tokens} tokens），建议精简`)
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
