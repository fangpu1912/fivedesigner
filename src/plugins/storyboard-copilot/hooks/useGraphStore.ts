import { useCallback } from 'react'
import { useStore, useReactFlow } from '@xyflow/react'
import type { CanvasNode, CanvasEdge, CanvasNodeData } from '../types'
import { getImageUrl } from '@/utils/asset'
import type { MentionItem } from '@/types/mention'

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

const RUNTIME_STATE_KEYS = new Set([
  'isGenerating',
  'isProcessing',
  'isRunning',
  'generationStartedAt',
  'generationDurationMs',
  'generationError',
  'progress',
  '_executeTrigger',
  '_outputTrigger',
  '_aspectRatioManuallySet',
])

export function stripRuntimeState(data: Record<string, unknown>): Record<string, unknown> {
  const cleaned = { ...data }
  for (const key of RUNTIME_STATE_KEYS) {
    delete cleaned[key]
  }
  if (Array.isArray(cleaned.items)) {
    cleaned.items = (cleaned.items as Array<Record<string, unknown>>).map(item => {
      const itemCopy = { ...item }
      delete itemCopy.status
      return itemCopy
    })
  }
  return cleaned
}

export function useGraphStore() {
  const storeNodes = useStore((state) => state.nodes) as CanvasNode[]
  const storeEdges = useStore((state) => state.edges) as CanvasEdge[]
  const reactFlow = useReactFlow()

  const getIncomingEdges = useCallback(
    (nodeId: string): CanvasEdge[] => {
      return storeEdges.filter((e) => e.target === nodeId)
    },
    [storeEdges],
  )

  const getOutgoingEdges = useCallback(
    (nodeId: string): CanvasEdge[] => {
      return storeEdges.filter((e) => e.source === nodeId)
    },
    [storeEdges],
  )

  const getSourceNodes = useCallback(
    (nodeId: string): CanvasNode[] => {
      const incoming = storeEdges.filter((e) => e.target === nodeId)
      return incoming
        .map((edge) => storeNodes.find((n) => n.id === edge.source))
        .filter((n): n is CanvasNode => !!n)
    },
    [storeEdges, storeNodes],
  )

  const getTargetNodes = useCallback(
    (nodeId: string): CanvasNode[] => {
      const outgoing = storeEdges.filter((e) => e.source === nodeId)
      return outgoing
        .map((edge) => storeNodes.find((n) => n.id === edge.target))
        .filter((n): n is CanvasNode => !!n)
    },
    [storeEdges, storeNodes],
  )

  const getSourceNodeData = useCallback(
    (nodeId: string): UpstreamNodeData | null => {
      const firstEdge = storeEdges.find((e) => e.target === nodeId)
      if (!firstEdge) return null
      const sourceNode = storeNodes.find((n) => n.id === firstEdge.source)
      if (!sourceNode) return null
      return sourceNode.data as UpstreamNodeData
    },
    [storeEdges, storeNodes],
  )

  const getUpstreamImageData = useCallback(
    (nodeId: string): string | null => {
      const incoming = storeEdges.filter((e) => e.target === nodeId)
      for (const edge of incoming) {
        const sourceNode = storeNodes.find((n) => n.id === edge.source)
        if (!sourceNode) continue
        const data = sourceNode.data as UpstreamNodeData
        const imageUrl = data?.imageUrl || data?.previewImageUrl || null
        if (imageUrl) return imageUrl
        if (data?.items && Array.isArray(data.items)) {
          const completedItem = data.items.find((item) => item.imageUrl || item.videoUrl)
          if (completedItem?.imageUrl) return completedItem.imageUrl
        }
      }
      return null
    },
    [storeEdges, storeNodes],
  )

  const getUpstreamVideoData = useCallback(
    (nodeId: string): string | null => {
      const incoming = storeEdges.filter((e) => e.target === nodeId)
      for (const edge of incoming) {
        const sourceNode = storeNodes.find((n) => n.id === edge.source)
        if (!sourceNode) continue
        const data = sourceNode.data as UpstreamNodeData
        if (data?.videoUrl) return data.videoUrl
        if (data?.items && Array.isArray(data.items)) {
          const completedItem = data.items.find((item) => item.videoUrl)
          if (completedItem?.videoUrl) return completedItem.videoUrl
        }
      }
      return null
    },
    [storeEdges, storeNodes],
  )

  const getUpstreamAudioData = useCallback(
    (nodeId: string): string | null => {
      const incoming = storeEdges.filter((e) => e.target === nodeId)
      for (const edge of incoming) {
        const sourceNode = storeNodes.find((n) => n.id === edge.source)
        if (!sourceNode) continue
        const data = sourceNode.data as UpstreamNodeData
        if (data?.audioUrl) return data.audioUrl
        if (data?.items && Array.isArray(data.items)) {
          const completedItem = data.items.find((item) => item.audioUrl)
          if (completedItem?.audioUrl) return completedItem.audioUrl
        }
      }
      return null
    },
    [storeEdges, storeNodes],
  )

  const getUpstreamTextData = useCallback(
    (nodeId: string): string | null => {
      const incoming = storeEdges.filter((e) => e.target === nodeId)
      for (const edge of incoming) {
        const sourceNode = storeNodes.find((n) => n.id === edge.source)
        if (!sourceNode) continue
        const data = sourceNode.data as UpstreamNodeData
        const text = data?.text || data?.content || data?.prompt || null
        if (text) return text
        if (data?.items && Array.isArray(data.items)) {
          const completedItem = data.items.find((item) => item.prompt)
          if (completedItem?.prompt) return completedItem.prompt
        }
      }
      return null
    },
    [storeEdges, storeNodes],
  )

  const getUpstreamBeforeAfter = useCallback(
    (nodeId: string): { before: string | null; after: string | null } => {
      const firstEdge = storeEdges.find((e) => e.target === nodeId)
      if (!firstEdge) return { before: null, after: null }
      const sourceNode = storeNodes.find((n) => n.id === firstEdge.source)
      if (!sourceNode) return { before: null, after: null }
      const data = sourceNode.data as UpstreamNodeData
      const before = data?.previewImageUrl || null
      const after = data?.imageUrl || null
      if (before && after && before === after) {
        return { before, after: null }
      }
      return { before, after }
    },
    [storeEdges, storeNodes],
  )

  const getUpstreamMentionItems = useCallback(
    (nodeId: string): MentionItem[] => {
      const result: MentionItem[] = []
      const incoming = storeEdges.filter((e) => e.target === nodeId)

      for (const edge of incoming) {
        const sourceNode = storeNodes.find((n) => n.id === edge.source)
        if (!sourceNode) continue

        const data = sourceNode.data as UpstreamNodeData
        const nodeLabel =
          data?.displayName || NODE_TYPE_LABELS[sourceNode.type || ''] || sourceNode.type || '节点'

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
          const mediaType = data.videoUrl ? 'video' : data.audioUrl ? 'audio' : data.imageUrl || data.previewImageUrl ? 'image' : null

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
    },
    [storeEdges, storeNodes],
  )

  const searchMentionItems = useCallback(
    (nodeId: string, query: string): MentionItem[] => {
      const items = getUpstreamMentionItems(nodeId)
      if (!query) return items
      const lower = query.toLowerCase()
      return items.filter(
        (item) =>
          item.name.toLowerCase().includes(lower) ||
          item.description?.toLowerCase().includes(lower) ||
          item.type.includes(lower),
      )
    },
    [getUpstreamMentionItems],
  )

  const getNode = useCallback(
    (nodeId: string): CanvasNode | undefined => {
      return storeNodes.find((n) => n.id === nodeId)
    },
    [storeNodes],
  )

  const getNodeData = useCallback(
    <T = CanvasNodeData>(nodeId: string): T | null => {
      const node = storeNodes.find((n) => n.id === nodeId)
      return node ? (node.data as T) : null
    },
    [storeNodes],
  )

  const updateNodeData = useCallback(
    (nodeId: string, dataUpdate: Partial<CanvasNodeData>) => {
      reactFlow.updateNodeData(nodeId, dataUpdate)
    },
    [reactFlow],
  )

  const addNodes = useCallback(
    (nodes: CanvasNode[]) => {
      reactFlow.addNodes(nodes)
    },
    [reactFlow],
  )

  const addEdges = useCallback(
    (edges: CanvasEdge[]) => {
      reactFlow.addEdges(edges)
    },
    [reactFlow],
  )

  const clearDownstreamData = useCallback(
    (edge: CanvasEdge) => {
      const targetNode = storeNodes.find((n) => n.id === edge.target)
      if (!targetNode) return

      const data = targetNode.data as Record<string, unknown>
      const clearedData: Record<string, unknown> = {}
      const fieldsToClear = [
        'imageUrl',
        'previewImageUrl',
        'videoUrl',
        'audioUrl',
        'prompt',
        'text',
        'referenceImages',
        'items',
      ]
      for (const field of fieldsToClear) {
        if (field in data) {
          clearedData[field] = field === 'items' ? [] : null
        }
      }

      if (Object.keys(clearedData).length > 0) {
        reactFlow.updateNodeData(edge.target, clearedData)
      }
    },
    [storeNodes, reactFlow],
  )

  const getNodesForSave = useCallback((): CanvasNode[] => {
    return storeNodes.map((node) => ({
      ...node,
      data: stripRuntimeState(node.data as Record<string, unknown>) as CanvasNodeData,
    }))
  }, [storeNodes])

  return {
    nodes: storeNodes,
    edges: storeEdges,

    getIncomingEdges,
    getOutgoingEdges,
    getSourceNodes,
    getTargetNodes,
    getSourceNodeData,

    getUpstreamImageData,
    getUpstreamVideoData,
    getUpstreamAudioData,
    getUpstreamTextData,
    getUpstreamBeforeAfter,

    getUpstreamMentionItems,
    searchMentionItems,

    getNode,
    getNodeData,
    updateNodeData,
    addNodes,
    addEdges,

    clearDownstreamData,
    getNodesForSave,

    fitView: reactFlow.fitView,
    getViewport: reactFlow.getViewport,
    setViewport: reactFlow.setViewport,
    zoomIn: reactFlow.zoomIn,
    zoomOut: reactFlow.zoomOut,
  }
}
