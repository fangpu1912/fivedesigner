import { useCallback, useMemo } from 'react'
import { useStore } from '@xyflow/react'

interface UpstreamNodeData {
  imageUrl?: string | null
  previewImageUrl?: string | null
  videoUrl?: string | null
  audioUrl?: string | null
  text?: string | null
  content?: string | null
  prompt?: string | null
  items?: Array<{
    imageUrl?: string | null
    videoUrl?: string | null
    audioUrl?: string | null
    prompt?: string | null
    [key: string]: unknown
  }>
  [key: string]: unknown
}

export function useUpstreamData(nodeId: string) {
  const edges = useStore((state) => state.edges)
  const nodes = useStore((state) => state.nodes)

  const incomingEdges = useMemo(
    () => edges.filter(e => e.target === nodeId),
    [edges, nodeId]
  )

  // 获取上游图片数据（支持 items 数组）
  const getUpstreamImageData = useCallback((): string | null => {
    for (const edge of incomingEdges) {
      const sourceNode = nodes.find(n => n.id === edge.source)
      if (!sourceNode) continue
      const data = sourceNode.data as UpstreamNodeData
      
      // 直接字段
      const imageUrl = data?.imageUrl || data?.previewImageUrl || null
      if (imageUrl) return imageUrl
      
      // 从 items 数组中获取（如 VideoGenNode）
      if (data?.items && Array.isArray(data.items)) {
        const completedItem = data.items.find(item => item.imageUrl || item.videoUrl)
        if (completedItem?.imageUrl) return completedItem.imageUrl
      }
    }
    return null
  }, [incomingEdges, nodes])

  // 获取上游视频数据
  const getUpstreamVideoData = useCallback((): string | null => {
    for (const edge of incomingEdges) {
      const sourceNode = nodes.find(n => n.id === edge.source)
      if (!sourceNode) continue
      const data = sourceNode.data as UpstreamNodeData
      
      // 直接字段
      if (data?.videoUrl) return data.videoUrl
      
      // 从 items 数组中获取
      if (data?.items && Array.isArray(data.items)) {
        const completedItem = data.items.find(item => item.videoUrl)
        if (completedItem?.videoUrl) return completedItem.videoUrl
      }
    }
    return null
  }, [incomingEdges, nodes])

  // 获取上游音频数据
  const getUpstreamAudioData = useCallback((): string | null => {
    for (const edge of incomingEdges) {
      const sourceNode = nodes.find(n => n.id === edge.source)
      if (!sourceNode) continue
      const data = sourceNode.data as UpstreamNodeData
      
      // 直接字段
      if (data?.audioUrl) return data.audioUrl
      
      // 从 items 数组中获取
      if (data?.items && Array.isArray(data.items)) {
        const completedItem = data.items.find(item => item.audioUrl)
        if (completedItem?.audioUrl) return completedItem.audioUrl
      }
    }
    return null
  }, [incomingEdges, nodes])

  // 获取上游文本/提示词数据
  const getUpstreamTextData = useCallback((): string | null => {
    for (const edge of incomingEdges) {
      const sourceNode = nodes.find(n => n.id === edge.source)
      if (!sourceNode) continue
      const data = sourceNode.data as UpstreamNodeData
      
      // 直接字段
      const text = data?.text || data?.content || data?.prompt || null
      if (text) return text
      
      // 从 items 数组中获取
      if (data?.items && Array.isArray(data.items)) {
        const completedItem = data.items.find(item => item.prompt)
        if (completedItem?.prompt) return completedItem.prompt
      }
    }
    return null
  }, [incomingEdges, nodes])

  // 获取上游节点的完整数据
  const getUpstreamNodeData = useCallback((): UpstreamNodeData | null => {
    const firstEdge = incomingEdges[0]
    if (!firstEdge) return null
    const sourceNode = nodes.find(n => n.id === firstEdge.source)
    if (!sourceNode) return null
    return sourceNode.data as UpstreamNodeData
  }, [incomingEdges, nodes])

  // 获取上游节点的原图和结果图（用于对比）
  const getUpstreamBeforeAfter = useCallback((): { before: string | null; after: string | null } => {
    const firstEdge = incomingEdges[0]
    if (!firstEdge) return { before: null, after: null }
    const sourceNode = nodes.find(n => n.id === firstEdge.source)
    if (!sourceNode) return { before: null, after: null }
    const data = sourceNode.data as UpstreamNodeData

    // previewImageUrl 是原图（Before）
    // imageUrl 是生成结果（After）
    const before = data?.previewImageUrl || null
    const after = data?.imageUrl || null

    // 如果只有一张图，说明还没有生成结果
    if (before && after && before === after) {
      return { before, after: null }
    }

    return { before, after }
  }, [incomingEdges, nodes])

  const getAllUpstreamImages = useCallback((): string[] => {
    const images: string[] = []
    for (const edge of incomingEdges) {
      const sourceNode = nodes.find(n => n.id === edge.source)
      if (!sourceNode) continue
      const data = sourceNode.data as UpstreamNodeData

      if (data?.items && Array.isArray(data.items)) {
        for (const item of data.items) {
          if (item.imageUrl) images.push(item.imageUrl)
        }
      } else {
        const imgUrl = data?.imageUrl || data?.previewImageUrl
        if (imgUrl) images.push(imgUrl)
      }
    }
    return images
  }, [incomingEdges, nodes])

  const upstreamImage = useMemo(() => getUpstreamImageData(), [getUpstreamImageData])
  const upstreamVideo = useMemo(() => getUpstreamVideoData(), [getUpstreamVideoData])
  const upstreamAudio = useMemo(() => getUpstreamAudioData(), [getUpstreamAudioData])
  const upstreamText = useMemo(() => getUpstreamTextData(), [getUpstreamTextData])
  const upstreamBeforeAfter = useMemo(() => getUpstreamBeforeAfter(), [getUpstreamBeforeAfter])
  const upstreamImages = useMemo(() => getAllUpstreamImages(), [getAllUpstreamImages])

  return {
    getUpstreamImageData,
    getUpstreamVideoData,
    getUpstreamAudioData,
    getUpstreamTextData,
    getUpstreamNodeData,
    getUpstreamBeforeAfter,
    getAllUpstreamImages,
    upstreamImage,
    upstreamVideo,
    upstreamAudio,
    upstreamText,
    upstreamBeforeAfter,
    upstreamImages,
  }
}
