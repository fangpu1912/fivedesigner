import { useMemo } from 'react'
import { getImageUrl } from '@/utils/asset'
import type { MentionItem, MentionElementType } from '@/types/mention'
import type { ReferenceItem, ReferenceMediaType } from '@/components/ai/ReferenceImageInput'

const TYPE_MAP: Record<ReferenceMediaType, MentionElementType> = {
  storyboard: 'storyboard',
  character: 'character',
  scene: 'scene',
  prop: 'prop',
  'upload-image': 'image',
  'upload-video': 'video',
  'upload-audio': 'audio',
}

export function useReferenceMentionItems(
  referenceItems: ReferenceItem[],
) {
  const items: MentionItem[] = useMemo(() => {
    const result: MentionItem[] = []
    const seenUrls = new Set<string>()
    const seenIds = new Set<string>()

    for (const ref of referenceItems) {
      const mentionType = TYPE_MAP[ref.type]
      const uniqueId = `${ref.type}:${ref.id}`

      // 基于 ID 去重（同一资产只出现一次）
      if (seenIds.has(uniqueId)) continue
      seenIds.add(uniqueId)

      if (mentionType === 'video') {
        if (seenUrls.has(ref.url)) continue
        seenUrls.add(ref.url)
        result.push({
          id: `ref:${ref.type}:${ref.id}`,
          type: mentionType,
          name: ref.name,
          imageUrl: undefined,
          thumbnail: ref.url,
          description: ref.description ?? ref.prompt ?? undefined,
          prompt: ref.prompt ?? undefined,
          aliases: ref.aliases,
        })
      } else if (mentionType === 'audio') {
        if (seenUrls.has(ref.url)) continue
        seenUrls.add(ref.url)
        result.push({
          id: `ref:${ref.type}:${ref.id}`,
          type: mentionType,
          name: ref.name,
          imageUrl: undefined,
          thumbnail: undefined,
          description: ref.description ?? ref.prompt ?? undefined,
          prompt: ref.prompt ?? undefined,
          aliases: ref.aliases,
        })
      } else {
        const url = ref.url ? (getImageUrl(ref.url) ?? ref.url) : undefined
        if (url && seenUrls.has(url)) continue
        if (url) seenUrls.add(url)
        result.push({
          id: `ref:${ref.type}:${ref.id}`,
          type: mentionType,
          name: ref.name,
          imageUrl: url,
          thumbnail: url,
          description: ref.description ?? ref.prompt ?? undefined,
          prompt: ref.prompt ?? undefined,
          aliases: ref.aliases,
        })
      }
    }

    return result
  }, [referenceItems])

  const search = useMemo(() => {
    return (query: string): MentionItem[] => {
      if (!query) return items

      const lower = query.toLowerCase()
      return items.filter(item =>
        item.name.toLowerCase().includes(lower) ||
        item.description?.toLowerCase().includes(lower) ||
        item.type.includes(lower) ||
        item.aliases?.some(a => a.toLowerCase().includes(lower))
      )
    }
  }, [items])

  return { items, search }
}
