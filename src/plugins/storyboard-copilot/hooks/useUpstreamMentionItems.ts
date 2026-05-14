import { useMemo } from 'react'
import { useStore } from '@xyflow/react'
import { getImageUrl } from '@/utils/asset'
import type { MentionItem, MentionElementType } from '@/types/mention'

interface UpstreamNodeData {
  imageUrl?: string | null
  previewImageUrl?: string | null
  videoUrl?: string | null
  audioUrl?: string | null
  text?: string | null
  content?: string | null
  prompt?: string | null
  displayName?: string
  sourceFileName?: string | null
  items?: Array<{
    imageUrl?: string | null
    videoUrl?: string | null
    audioUrl?: string | null
    prompt?: string | null
    name?: string
    firstFrameUrl?: string | null
    [key: string]: unknown
  }>
  [key: string]: unknown
}

const NODE_TYPE_LABELS: Record<string, string> = {
  uploadNode: '上传图片',
  imageNode: '图片生成',
  aiImageEditNode: '图片编辑',
  blankImageNode: '空白图',
  textAnnotationNode: '文本标注',
  videoGenNode: '视频生成',
  videoUploadNode: '上传视频',
  audioUploadNode: '上传音频',
  imageToPromptNode: '图片反推',
  upscaleNode: '图片放大',
  storyboardNode: '分镜拆分',
  sceneDirectorNode: '场景编排',
  imageCompareNode: '图片对比',
}

function getMediaTypeFromNode(data: UpstreamNodeData): MentionElementType | null {
  if (data.videoUrl) return 'video'
  if (data.audioUrl) return 'audio'
  if (data.imageUrl || data.previewImageUrl) return 'image'
  return null
}

export function useUpstreamMentionItems(nodeId: string) {
  const edges = useStore((state) => state.edges)
  const nodes = useStore((state) => state.nodes)

  const items: MentionItem[] = useMemo(() => {
    const result: MentionItem[] = []
    const incomingEdges = edges.filter(e => e.target === nodeId)

    for (const edge of incomingEdges) {
      const sourceNode = nodes.find(n => n.id === edge.source)
      if (!sourceNode) continue

      const data = sourceNode.data as UpstreamNodeData
      const nodeLabel = data?.displayName || NODE_TYPE_LABELS[sourceNode.type || ''] || sourceNode.type || '节点'

      if (data?.items && Array.isArray(data.items) && data.items.length > 0) {
        for (let i = 0; i < data.items.length; i++) {
          const item = data.items[i]
          if (!item) continue

          if (item.imageUrl) {
            result.push({
              id: `node:${sourceNode.id}:item:${i}`,
              type: 'image',
              name: item.name || `${nodeLabel} #${i + 1}`,
              imageUrl: getImageUrl(item.imageUrl) ?? undefined,
              thumbnail: getImageUrl(item.imageUrl) ?? undefined,
              description: item.prompt ?? undefined,
              prompt: item.prompt ?? undefined,
            })
          } else if (item.videoUrl) {
            const thumb = item.firstFrameUrl || item.imageUrl
            result.push({
              id: `node:${sourceNode.id}:item:${i}`,
              type: 'video',
              name: item.name || `${nodeLabel} #${i + 1}`,
              imageUrl: thumb ? getImageUrl(thumb) ?? undefined : undefined,
              thumbnail: thumb ? getImageUrl(thumb) ?? undefined : undefined,
              description: item.prompt ?? undefined,
              prompt: item.prompt ?? undefined,
            })
          } else if (item.audioUrl) {
            result.push({
              id: `node:${sourceNode.id}:item:${i}`,
              type: 'audio',
              name: item.name || `${nodeLabel} #${i + 1}`,
              imageUrl: undefined,
              description: item.prompt ?? undefined,
              prompt: item.prompt ?? undefined,
            })
          }
        }
      } else {
        const mediaType = getMediaTypeFromNode(data)

        if (mediaType === 'image') {
          const imgUrl = data.imageUrl || data.previewImageUrl
          if (imgUrl) {
            result.push({
              id: `node:${sourceNode.id}`,
              type: 'image',
              name: data.sourceFileName || nodeLabel,
              imageUrl: getImageUrl(imgUrl) ?? undefined,
              thumbnail: getImageUrl(imgUrl) ?? undefined,
              description: data.prompt ?? undefined,
              prompt: data.prompt ?? undefined,
            })
          }
        } else if (mediaType === 'video' && data.videoUrl) {
          const thumb = data.previewImageUrl || data.imageUrl
          result.push({
            id: `node:${sourceNode.id}`,
            type: 'video',
            name: data.sourceFileName || nodeLabel,
            imageUrl: thumb ? getImageUrl(thumb) ?? undefined : undefined,
            thumbnail: thumb ? getImageUrl(thumb) ?? undefined : undefined,
            description: data.prompt ?? undefined,
            prompt: data.prompt ?? undefined,
          })
        } else if (mediaType === 'audio' && data.audioUrl) {
          result.push({
            id: `node:${sourceNode.id}`,
            type: 'audio',
            name: data.sourceFileName || nodeLabel,
            imageUrl: undefined,
            description: data.prompt ?? undefined,
            prompt: data.prompt ?? undefined,
          })
        }

        if (data.prompt || data.text || data.content) {
          const textContent = data.prompt || data.text || data.content
          if (textContent && mediaType !== 'image') {
            result.push({
              id: `node:${sourceNode.id}:text`,
              type: 'image',
              name: `${nodeLabel} 提示词`,
              imageUrl: data.imageUrl ? getImageUrl(data.imageUrl) ?? undefined : undefined,
              thumbnail: data.imageUrl ? getImageUrl(data.imageUrl) ?? undefined : undefined,
              description: textContent.substring(0, 100),
              prompt: textContent,
            })
          }
        }
      }
    }

    return result
  }, [edges, nodes, nodeId])

  const search = useMemo(() => {
    return (query: string): MentionItem[] => {
      if (!query) return items

      const lower = query.toLowerCase()
      return items.filter(item =>
        item.name.toLowerCase().includes(lower) ||
        item.description?.toLowerCase().includes(lower) ||
        item.type.includes(lower)
      )
    }
  }, [items])

  return { items, search }
}
