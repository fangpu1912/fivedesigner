import type { MentionData } from '@/types/mention'

export interface AssetInfo {
  id: string
  type: 'character' | 'scene' | 'prop'
  name: string
  aliases?: string[]
  imageUrl?: string
}

export function buildMentionDoc(text: string, assets: AssetInfo[]): Record<string, unknown> {
  if (!text || assets.length === 0) {
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: text || '' }] }],
    }
  }

  const matches: Array<{
    start: number
    end: number
    asset: AssetInfo
    matchText: string
  }> = []

  for (const asset of assets) {
    const namesToMatch = [asset.name, ...(asset.aliases || [])]
    for (const matchName of namesToMatch) {
      const lowerName = matchName.toLowerCase()
      const lowerText = text.toLowerCase()
      let index = 0
      while ((index = lowerText.indexOf(lowerName, index)) !== -1) {
        const before = index > 0 ? text[index - 1] : ' '
        const after = index + matchName.length < text.length ? text[index + matchName.length] : ' '

        const isBeforeAlphanumeric = /[a-zA-Z0-9]/.test(before || ' ')
        const isAfterAlphanumeric = /[a-zA-Z0-9]/.test(after || ' ')
        if (!isBeforeAlphanumeric && !isAfterAlphanumeric) {
          const isOverlap = matches.some(m => index < m.end && index + matchName.length > m.start)
          if (!isOverlap) {
            matches.push({ start: index, end: index + matchName.length, asset, matchText: matchName })
          }
        }
        index += 1
      }
    }
  }

  matches.sort((a, b) => a.start - b.start)

  const content: Record<string, unknown>[] = []
  let lastEnd = 0

  for (const match of matches) {
    if (match.start > lastEnd) {
      content.push({ type: 'text', text: text.slice(lastEnd, match.start) })
    }
    content.push({
      type: 'mention',
      attrs: {
        id: `asset:${match.asset.type}:${match.asset.id}`,
        label: match.asset.name,
        type: match.asset.type,
        imageUrl: match.asset.imageUrl || null,
      },
    })
    lastEnd = match.end
  }

  if (lastEnd < text.length) {
    content.push({ type: 'text', text: text.slice(lastEnd) })
  }

  return {
    type: 'doc',
    content: [{ type: 'paragraph', content }],
  }
}

export function buildMentionDataFromAssets(assets: AssetInfo[]): MentionData[] {
  return assets.map(a => ({
    id: `asset:${a.type}:${a.id}`,
    type: a.type,
    label: a.name,
    imageUrl: a.imageUrl,
  }))
}
