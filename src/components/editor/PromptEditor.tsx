import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'

import { Sparkles, X, Plus, Minus, AlertCircle, CheckCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import {
  highlightSyntax,
  validatePrompt,
  parsePrompt,
  type ParsedPrompt,
} from './utils/promptParser'

export interface PromptEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  maxLength?: number
  suggestions?: string[]
  onGenerate?: () => void
  isGenerating?: boolean
  showNegativePrompt?: boolean
  negativeValue?: string
  onNegativeChange?: (value: string) => void
  className?: string
}

export const PromptEditor: React.FC<PromptEditorProps> = ({
  value,
  onChange,
  placeholder = '输入提示词，支持权重语法 (keyword:1.5)',
  maxLength = 2000,
  suggestions = [],
  onGenerate,
  isGenerating = false,
  showNegativePrompt = true,
  negativeValue = '',
  onNegativeChange,
  className,
}) => {
  const [isFocused, setIsFocused] = useState(false)
  const [cursorPosition, setCursorPosition] = useState(0)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0)
  const [parsedPrompt, setParsedPrompt] = useState<ParsedPrompt | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setParsedPrompt(parsePrompt(value))
  }, [value])

  const filteredSuggestions = useMemo(() => {
    if (!showSuggestions || suggestions.length === 0) return []

    const textBeforeCursor = value.slice(0, cursorPosition)
    const lastWord = textBeforeCursor.split(/[,，\s]+/).pop() || ''

    if (lastWord.length < 2) return []

    return suggestions
      .filter(s => s.toLowerCase().includes(lastWord.toLowerCase()))
      .slice(0, 8)
      .map(text => ({
        text,
        type: 'keyword' as const,
      }))
  }, [showSuggestions, suggestions, value, cursorPosition])

  const validation = useMemo(() => validatePrompt(value), [value])

  const characterCount = value.length
  const isOverLimit = characterCount > maxLength

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value
      onChange(newValue)
      setCursorPosition(e.target.selectionStart)
      setShowSuggestions(true)
      setSelectedSuggestionIndex(0)
    },
    [onChange]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (showSuggestions && filteredSuggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelectedSuggestionIndex(prev => Math.min(prev + 1, filteredSuggestions.length - 1))
          return
        }

        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSelectedSuggestionIndex(prev => Math.max(prev - 1, 0))
          return
        }

        if (e.key === 'Tab' || e.key === 'Enter') {
          e.preventDefault()
          const suggestion = filteredSuggestions[selectedSuggestionIndex]
          if (suggestion) {
            insertSuggestion(suggestion.text)
          }
          return
        }

        if (e.key === 'Escape') {
          setShowSuggestions(false)
          return
        }
      }

      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && onGenerate) {
        e.preventDefault()
        onGenerate()
      }
    },
    [showSuggestions, filteredSuggestions, selectedSuggestionIndex, onGenerate]
  )

  const insertSuggestion = useCallback(
    (suggestion: string) => {
      const textBeforeCursor = value.slice(0, cursorPosition)
      const textAfterCursor = value.slice(cursorPosition)

      const lastCommaIndex = Math.max(
        textBeforeCursor.lastIndexOf(','),
        textBeforeCursor.lastIndexOf('，')
      )
      const lastSpaceIndex = textBeforeCursor.lastIndexOf(' ')
      const cutIndex = Math.max(lastCommaIndex, lastSpaceIndex) + 1

      const prefix = textBeforeCursor.slice(0, cutIndex)
      const newValue = prefix + suggestion + ', ' + textAfterCursor

      onChange(newValue)
      setShowSuggestions(false)

      setTimeout(() => {
        if (textareaRef.current) {
          const newPosition = cutIndex + suggestion.length + 2
          textareaRef.current.focus()
          textareaRef.current.setSelectionRange(newPosition, newPosition)
        }
      }, 0)
    },
    [value, cursorPosition, onChange]
  )

  const adjustWeight = useCallback(
    (delta: number) => {
      if (!textareaRef.current) return

      const textBeforeCursor = value.slice(0, cursorPosition)
      const weightMatch = textBeforeCursor.match(/\(([^)]+):([\d.]+)\)$/)

      if (weightMatch) {
        const keyword = weightMatch[1]
        const weightStr = weightMatch[2]
        if (!keyword || !weightStr) return
        const currentWeight = parseFloat(weightStr)
        const newWeight = Math.max(0.1, Math.min(2, currentWeight + delta))
        const newWeightedKeyword = `(${keyword}:${newWeight.toFixed(2)})`

        const startIndex = cursorPosition - weightMatch[0].length
        const newValue =
          value.slice(0, startIndex) + newWeightedKeyword + value.slice(cursorPosition)

        onChange(newValue)

        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.setSelectionRange(
              startIndex + newWeightedKeyword.length,
              startIndex + newWeightedKeyword.length
            )
          }
        }, 0)
      }
    },
    [value, cursorPosition, onChange]
  )

  const handleSelect = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setCursorPosition(e.currentTarget.selectionStart)
  }, [])

  const handleFocus = useCallback(() => {
    setIsFocused(true)
    setShowSuggestions(true)
  }, [])

  const handleBlur = useCallback(() => {
    setIsFocused(false)
    setTimeout(() => setShowSuggestions(false), 200)
  }, [])

  const highlightedSegments = useMemo(() => {
    return highlightSyntax(value)
  }, [value])

  return (
    <div className={cn('space-y-2', className)}>
      <div
        className={cn(
          'relative rounded-md border border-input bg-background',
          'ring-offset-background transition-colors',
          isFocused && 'ring-2 ring-ring ring-offset-2',
          isOverLimit && 'border-destructive'
        )}
      >
        <div
          ref={highlightRef}
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-md p-3"
          aria-hidden="true"
        >
          <pre className="whitespace-pre-wrap break-words font-mono text-sm">
            {highlightedSegments.map((segment, index) => (
              <span
                key={index}
                className={cn({
                  'text-foreground': segment.type === 'text',
                  'text-blue-500 font-semibold': segment.type === 'weight',
                  'text-purple-500': segment.type === 'embedding',
                  'text-red-500': segment.type === 'negative',
                  'text-yellow-500': segment.type === 'bracket',
                })}
              >
                {segment.text}
              </span>
            ))}
          </pre>
        </div>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onSelect={handleSelect}
          placeholder={placeholder}
          className={cn(
            'relative h-auto min-h-[120px] w-full resize-y bg-transparent p-3',
            'font-mono text-sm text-transparent caret-foreground',
            'focus:outline-none'
          )}
          style={{ caretColor: 'currentColor' }}
        />

        {showSuggestions && filteredSuggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-auto rounded-md border bg-popover shadow-lg">
            {filteredSuggestions.map((suggestion, index) => (
              <button
                key={suggestion.text}
                type="button"
                onClick={() => insertSuggestion(suggestion.text)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
                  index === selectedSuggestionIndex
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50'
                )}
              >
                <Sparkles className="h-3 w-3 text-muted-foreground" />
                <span>{suggestion.text}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => adjustWeight(0.1)}
            title="增加权重 (Ctrl+])"
          >
            <Plus className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => adjustWeight(-0.1)}
            title="减少权重 (Ctrl+[)"
          >
            <Minus className="h-3 w-3" />
          </Button>

          {validation.valid ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <div className="group relative">
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              <div className="absolute bottom-full left-0 z-50 mb-2 hidden w-64 rounded-md bg-popover p-2 text-xs shadow-lg group-hover:block">
                {validation.errors.map((error, i) => (
                  <div key={i} className="text-destructive">
                    {error}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span
            className={cn(
              'text-xs',
              isOverLimit ? 'text-destructive font-medium' : 'text-muted-foreground'
            )}
          >
            {characterCount} / {maxLength}
          </span>

          {onGenerate && (
            <Button
              type="button"
              size="sm"
              onClick={onGenerate}
              disabled={isGenerating || !value.trim() || isOverLimit}
            >
              {isGenerating ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  生成
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {showNegativePrompt && onNegativeChange && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">负向提示词</label>
          <Textarea
            value={negativeValue}
            onChange={e => onNegativeChange(e.target.value)}
            placeholder="输入不想出现的内容..."
            className="min-h-[80px] font-mono"
          />
        </div>
      )}

      {parsedPrompt && (
        <div className="flex flex-wrap gap-1.5">
          {parsedPrompt.keywords.slice(0, 10).map((keyword, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs"
            >
              {keyword}
              {parsedPrompt.weights.has(keyword) && (
                <span className="text-blue-500">
                  :{parsedPrompt.weights.get(keyword)?.toFixed(1)}
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  const newValue = value.replace(
                    new RegExp(
                      `[,，]?\\s*${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^,，]*`,
                      'g'
                    ),
                    ''
                  )
                  onChange(newValue.trim())
                }}
                className="hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default PromptEditor
