import { useState, useCallback, useRef, useEffect } from 'react'
import { Variable, Sparkles, AlertCircle, Type, Hash, Calculator } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { estimateTokens, extractKeywords, analyzePromptStructure } from '@/utils/promptAnalyzer'

interface PromptEditorProps {
  value: string
  onChange: (value: string) => void
  variables: string[]
  placeholder?: string
  className?: string
  showAnalysis?: boolean
}

interface Suggestion {
  type: 'variable' | 'function'
  label: string
  description: string
  insert: string
}

// 内置函数建议
const BUILTIN_FUNCTIONS: Suggestion[] = [
  { type: 'function', label: '条件判断', description: '根据条件显示内容', insert: '{{#if condition}}内容{{/if}}' },
  { type: 'function', label: '遍历循环', description: '遍历列表', insert: '{{#each items}}{{this}}{{/each}}' },
  { type: 'function', label: '默认值', description: '变量为空时使用默认值', insert: '{{varName || "默认值"}}' },
]

export function PromptEditor({
  value,
  onChange,
  variables,
  placeholder = '输入提示词模板内容...',
  className,
  showAnalysis = true,
}: PromptEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [, setCursorPosition] = useState(0)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [analysis, setAnalysis] = useState<{
    tokens: number
    keywords: string[]
    structure: ReturnType<typeof analyzePromptStructure>
  } | null>(null)

  // 分析提示词
  useEffect(() => {
    if (showAnalysis && value) {
      setAnalysis({
        tokens: estimateTokens(value),
        keywords: extractKeywords(value),
        structure: analyzePromptStructure(value),
      })
    }
  }, [value, showAnalysis])

  // 检测输入并显示建议
  const checkForSuggestions = useCallback((text: string, cursor: number) => {
    const beforeCursor = text.slice(0, cursor)
    const afterOpen = beforeCursor.lastIndexOf('{{')
    const afterClose = beforeCursor.lastIndexOf('}}')

    // 如果在 {{ 之后且没有 }}
    if (afterOpen > afterClose) {
      const partial = beforeCursor.slice(afterOpen + 2).trim().toLowerCase()

      // 构建建议列表
      const allSuggestions: Suggestion[] = [
        ...variables.map(v => ({
          type: 'variable' as const,
          label: v,
          description: `变量: ${v}`,
          insert: v,
        })),
        ...BUILTIN_FUNCTIONS,
      ]

      // 过滤建议
      const filtered = allSuggestions.filter(s =>
        s.label.toLowerCase().includes(partial) ||
        s.insert.toLowerCase().includes(partial)
      )

      setSuggestions(filtered)
      setShowSuggestions(filtered.length > 0)
      setSelectedIndex(0)
    } else {
      setShowSuggestions(false)
    }
  }, [variables])

  // 插入建议
  const insertSuggestion = useCallback((suggestion: Suggestion) => {
    if (!textareaRef.current) return

    const textarea = textareaRef.current
    const start = textarea.selectionStart
    const text = textarea.value

    // 找到 {{ 的位置
    const beforeCursor = text.slice(0, start)
    const afterOpen = beforeCursor.lastIndexOf('{{')
    const afterClose = beforeCursor.lastIndexOf('}}')

    if (afterOpen > afterClose) {
      const beforeVar = text.slice(0, afterOpen + 2)
      const afterVar = text.slice(start)
      const newText = beforeVar + suggestion.insert + afterVar

      onChange(newText)
      setShowSuggestions(false)

      // 设置光标位置
      setTimeout(() => {
        const newPosition = afterOpen + 2 + suggestion.insert.length
        textarea.setSelectionRange(newPosition, newPosition)
        textarea.focus()
      }, 0)
    }
  }, [onChange])

  // 处理键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showSuggestions) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => (prev + 1) % suggestions.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length)
        break
      case 'Enter':
      case 'Tab':
        e.preventDefault()
        if (suggestions[selectedIndex]) {
          insertSuggestion(suggestions[selectedIndex])
        }
        break
      case 'Escape':
        setShowSuggestions(false)
        break
    }
  }, [showSuggestions, suggestions, selectedIndex, insertSuggestion])

  // 处理输入
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    const newCursor = e.target.selectionStart
    onChange(newValue)
    setCursorPosition(newCursor)
    checkForSuggestions(newValue, newCursor)
  }, [onChange, checkForSuggestions])

  // 处理点击
  const handleClick = useCallback((e: React.MouseEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget
    const newCursor = textarea.selectionStart
    setCursorPosition(newCursor)
    checkForSuggestions(textarea.value, newCursor)
  }, [checkForSuggestions])

  // 高亮显示内容
  const renderHighlightedContent = useCallback(() => {
    if (!value) return null

    // 分割文本并高亮
    const parts = value.split(/(\{\{[^}]+\}\})/g)
    return parts.map((part, index) => {
      if (part.startsWith('{{') && part.endsWith('}}')) {
        const varName = part.slice(2, -2).trim()
        const isValidVar = variables.includes(varName)
        return (
          <span
            key={index}
            className={cn(
              'rounded px-1',
              isValidVar
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
            )}
          >
            {part}
          </span>
        )
      }
      return <span key={index}>{part}</span>
    })
  }, [value, variables])

  return (
    <div className={cn('space-y-3', className)}>
      {/* 编辑器区域 */}
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onClick={handleClick}
          placeholder={placeholder}
          className="min-h-[300px] font-mono text-sm resize-y"
          spellCheck={false}
        />

        {/* 自动补全建议 */}
        {showSuggestions && (
          <div className="absolute z-50 bg-popover border rounded-md shadow-lg mt-1 min-w-[200px] max-h-[200px] overflow-auto">
            {suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.type}-${suggestion.label}`}
                onClick={() => insertSuggestion(suggestion)}
                className={cn(
                  'w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-accent',
                  index === selectedIndex && 'bg-accent'
                )}
              >
                {suggestion.type === 'variable' ? (
                  <Variable className="h-4 w-4 text-blue-500" />
                ) : (
                  <Sparkles className="h-4 w-4 text-purple-500" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{suggestion.label}</div>
                  <div className="text-xs text-muted-foreground">{suggestion.description}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 高亮预览 */}
      {value && (
        <div className="border rounded-md p-3 bg-muted/30">
          <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            变量高亮预览
          </div>
          <div className="text-sm font-mono whitespace-pre-wrap break-all">
            {renderHighlightedContent()}
          </div>
        </div>
      )}

      {/* 分析面板 */}
      {showAnalysis && analysis && (
        <div className="border rounded-md p-3 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Calculator className="h-4 w-4" />
            提示词分析
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Token 估算 */}
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                约 <strong>{analysis.tokens}</strong> tokens
              </span>
            </div>

            {/* 变量数量 */}
            <div className="flex items-center gap-2">
              <Variable className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                <strong>{analysis.structure.variables.length}</strong> 个变量
              </span>
            </div>
          </div>

          {/* 关键词 */}
          {analysis.keywords.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <Type className="h-3 w-3" />
                提取关键词
              </div>
              <div className="flex flex-wrap gap-1">
                {analysis.keywords.slice(0, 10).map((keyword, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {keyword}
                  </Badge>
                ))}
                {analysis.keywords.length > 10 && (
                  <Badge variant="outline" className="text-xs">
                    +{analysis.keywords.length - 10}
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* 结构警告 */}
          {analysis.structure.warnings.length > 0 && (
            <div className="space-y-1">
              {analysis.structure.warnings.map((warning, index) => (
                <div key={index} className="flex items-start gap-1 text-xs text-yellow-600">
                  <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  {warning}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 快捷插入按钮 */}
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-muted-foreground self-center">插入变量:</span>
        {variables.slice(0, 5).map(variable => (
          <Button
            key={variable}
            variant="outline"
            size="sm"
            className="h-6 text-xs"
            onClick={() => {
              const textarea = textareaRef.current
              if (!textarea) return
              const start = textarea.selectionStart
              const text = textarea.value
              const insert = `{{${variable}}}`
              const newText = text.slice(0, start) + insert + text.slice(start)
              onChange(newText)
              setTimeout(() => {
                textarea.setSelectionRange(start + insert.length, start + insert.length)
                textarea.focus()
              }, 0)
            }}
          >
            {variable}
          </Button>
        ))}
        {variables.length > 5 && (
          <Badge variant="outline" className="h-6 text-xs">
            +{variables.length - 5}
          </Badge>
        )}
      </div>
    </div>
  )
}
