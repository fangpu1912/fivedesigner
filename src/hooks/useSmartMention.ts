import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import type { MentionItem, MentionElementType } from '@/types/mention'

export interface AssociatedAsset {
  id: string
  type: 'character' | 'scene' | 'prop'
  name: string
  image?: string
  prompt?: string
  description?: string
  aliases?: string[]
}

export interface SmartMentionSuggestion {
  asset: AssociatedAsset
  matchText: string
  startIndex: number
  endIndex: number
}

/**
 * 智能识别提示词中可@关联的资产
 *
 * 当用户在提示词中输入角色/场景/道具的名称时，自动识别并建议转换为@mention
 * 支持：
 * 1. 精确匹配资产名称
 * 2. 模糊匹配（名称包含）
 * 3. 中文分词匹配
 */
export function useSmartMention(
  text: string,
  associatedAssets: AssociatedAsset[],
) {
  const [suggestions, setSuggestions] = useState<SmartMentionSuggestion[]>([])
  const lastTextRef = useRef(text)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>()

  // 提取文本中所有可能的名称匹配
  const findSuggestions = useCallback((inputText: string): SmartMentionSuggestion[] => {
    if (!inputText || associatedAssets.length === 0) return []

    const results: SmartMentionSuggestion[] = []
    const usedIndices = new Set<number>()

    const tryMatch = (asset: AssociatedAsset, matchName: string) => {
      const lowerName = matchName.toLowerCase()
      const lowerText = inputText.toLowerCase()

      let index = 0
      while ((index = lowerText.indexOf(lowerName, index)) !== -1) {
        const before = index > 0 ? inputText[index - 1] : ' '
        const after = index + matchName.length < inputText.length ? inputText[index + matchName.length] : ' '

        const isBeforeAlphanumeric = /[a-zA-Z0-9]/.test(before || ' ')
        const isAfterAlphanumeric = /[a-zA-Z0-9]/.test(after || ' ')

        if (!isBeforeAlphanumeric && !isAfterAlphanumeric) {
          const isOverlap = Array.from(usedIndices).some(
            used => index < used + matchName.length && index + matchName.length > used
          )

          if (!isOverlap) {
            results.push({
              asset,
              matchText: matchName,
              startIndex: index,
              endIndex: index + matchName.length,
            })
            for (let i = index; i < index + matchName.length; i++) {
              usedIndices.add(i)
            }
          }
        }
        index += 1
      }
    }

    for (const asset of associatedAssets) {
      tryMatch(asset, asset.name)
      if (asset.aliases) {
        for (const alias of asset.aliases) {
          tryMatch(asset, alias)
        }
      }
    }

    // 2. 检查是否已经被@mention了（简单检查：前面有@符号）
    const filtered = results.filter(s => {
      const beforeChar = s.startIndex > 0 ? inputText[s.startIndex - 1] : ''
      return beforeChar !== '@'
    })

    return filtered
  }, [associatedAssets])

  // 防抖检测
  useEffect(() => {
    if (text === lastTextRef.current) return
    lastTextRef.current = text

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      const newSuggestions = findSuggestions(text)
      setSuggestions(newSuggestions)
    }, 300)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [text, findSuggestions])

  // 将资产转换为MentionItem
  const toMentionItem = useCallback((asset: AssociatedAsset): MentionItem => {
    const typeMap: Record<string, MentionElementType> = {
      character: 'character',
      scene: 'scene',
      prop: 'prop',
    }

    return {
      id: `asset:${asset.type}:${asset.id}`,
      type: typeMap[asset.type] || 'character',
      name: asset.name,
      imageUrl: asset.image,
      thumbnail: asset.image,
      description: asset.description,
      prompt: asset.prompt,
      aliases: asset.aliases,
    }
  }, [])

  // 获取所有关联资产作为mention items（用于@下拉）
  const mentionItems = useMemo(() => {
    return associatedAssets.map(asset => toMentionItem(asset))
  }, [associatedAssets, toMentionItem])

  // 搜索函数（用于MentionInput的customSearch）
  const search = useMemo(() => {
    return (query: string): MentionItem[] => {
      if (!query) return mentionItems

      const lower = query.toLowerCase()
      return mentionItems.filter(item =>
        item.name.toLowerCase().includes(lower) ||
        item.type.includes(lower) ||
        item.description?.toLowerCase().includes(lower) ||
        item.prompt?.toLowerCase().includes(lower) ||
        item.aliases?.some(a => a.toLowerCase().includes(lower))
      )
    }
  }, [mentionItems])

  // 清除建议
  const dismissSuggestion = useCallback((index: number) => {
    setSuggestions(prev => prev.filter((_, i) => i !== index))
  }, [])

  // 清除所有建议
  const dismissAll = useCallback(() => {
    setSuggestions([])
  }, [])

  return {
    suggestions,
    mentionItems,
    search,
    dismissSuggestion,
    dismissAll,
    toMentionItem,
  }
}
