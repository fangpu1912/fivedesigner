import type { MentionData, ResolvedPrompt } from '@/types/mention'

export function resolvePromptToAIFormat(
  editorJSON: Record<string, unknown>,
  mentions: MentionData[]
): ResolvedPrompt {
  const content: ResolvedPrompt['content'] = []
  const referenceImages: string[] = []
  let textBuffer = ''

  const mentionMap = new Map(mentions.map(m => [m.id, m]))

  const walk = (node: Record<string, unknown>) => {
    if (node.type === 'text' && typeof node.text === 'string') {
      textBuffer += node.text
      return
    }

    if (node.type === 'mention' && node.attrs) {
      const attrs = node.attrs as Record<string, unknown>
      const mentionId = attrs.id as string
      const mention = mentionMap.get(mentionId)

      if (mention) {
        if (textBuffer) {
          content.push({ type: 'text', text: textBuffer })
          textBuffer = ''
        }

        const type = mention.type || attrs.type

        if (['character', 'scene', 'prop', 'storyboard', 'image'].includes(type as string) && mention.imageUrl) {
          content.push({ type: 'text', text: `【${mention.label}】：` })
          content.push({ type: 'image_url', image_url: { url: mention.imageUrl } })
          referenceImages.push(mention.imageUrl)
        } else if (type === 'video' && mention.imageUrl) {
          content.push({ type: 'text', text: `【${mention.label}（视频封面）】：` })
          content.push({ type: 'image_url', image_url: { url: mention.imageUrl } })
          referenceImages.push(mention.imageUrl)
        } else if (type === 'audio') {
          content.push({ type: 'text', text: `【音频：${mention.label}】` })
        } else {
          textBuffer += mention.label
        }

        if (mention.prompt) {
          textBuffer += `（${mention.prompt}）`
        }
      }
      return
    }

    if (node.type === 'hardBreak') {
      textBuffer += '\n'
      return
    }

    if (node.type === 'paragraph') {
      if (textBuffer && content.length > 0) {
        textBuffer += '\n'
      }
    }

    if (Array.isArray(node.content)) {
      for (const child of node.content as Record<string, unknown>[]) {
        walk(child)
      }
      if (node.type === 'paragraph' && content.length > 0) {
        textBuffer += '\n'
      }
    }
  }

  walk(editorJSON)

  if (textBuffer) {
    content.push({ type: 'text', text: textBuffer.replace(/\n+$/, '') })
  }

  const text = content
    .filter(c => c.type === 'text')
    .map(c => c.type === 'text' ? c.text : '')
    .join('')

  return { text, content, referenceImages, mentions }
}

export function extractMentionsFromJSON(
  editorJSON: Record<string, unknown>
): MentionData[] {
  const mentions: MentionData[] = []

  const walk = (node: Record<string, unknown>) => {
    if (node.type === 'mention' && node.attrs) {
      const attrs = node.attrs as Record<string, unknown>
      mentions.push({
        id: attrs.id as string,
        type: (attrs.type as MentionData['type']) || 'character',
        label: attrs.label as string,
        imageUrl: attrs.imageUrl as string | undefined,
        description: attrs.description as string | undefined,
        prompt: attrs.prompt as string | undefined,
      })
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content as Record<string, unknown>[]) {
        walk(child)
      }
    }
  }

  walk(editorJSON)
  return mentions
}
