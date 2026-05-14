import { useCallback, useRef, useState } from 'react'
import type { CanvasNode, CanvasEdge, CanvasHistorySnapshot } from '../types'

export interface CanvasStateReturn {
  nodes: CanvasNode[]
  setNodes: React.Dispatch<React.SetStateAction<CanvasNode[]>>
  edges: CanvasEdge[]
  setEdges: React.Dispatch<React.SetStateAction<CanvasEdge[]>>
  selectedNodeId: string | null
  setSelectedNodeId: React.Dispatch<React.SetStateAction<string | null>>
  selectedEdgeId: string | null
  setSelectedEdgeId: React.Dispatch<React.SetStateAction<string | null>>
  saveHistory: () => void
  undo: () => boolean
  redo: () => boolean
  setCanvasData: (newNodes: CanvasNode[], newEdges: CanvasEdge[]) => void
  clearSelection: () => void
  canUndo: boolean
  canRedo: boolean
}

export function useCanvasState(): CanvasStateReturn {
  const [nodes, setNodes] = useState<CanvasNode[]>([])
  const [edges, setEdges] = useState<CanvasEdge[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)

  // 历史记录用于撤销/重做
  const historyRef = useRef<{
    past: CanvasHistorySnapshot[]
    future: CanvasHistorySnapshot[]
  }>({ past: [], future: [] })

  // 保存历史
  const saveHistory = useCallback(() => {
    historyRef.current.past.push({ nodes: [...nodes], edges: [...edges] })
    historyRef.current.future = []
    // 限制历史记录数量
    if (historyRef.current.past.length > 50) {
      historyRef.current.past.shift()
    }
  }, [nodes, edges])

  // 撤销
  const undo = useCallback(() => {
    const { past } = historyRef.current
    if (past.length === 0) return false

    const previous = past[past.length - 1]
    if (!previous) return false
    historyRef.current.past = past.slice(0, past.length - 1)
    historyRef.current.future.unshift({ nodes: [...nodes], edges: [...edges] })

    setNodes(previous.nodes)
    setEdges(previous.edges)
    return true
  }, [nodes, edges])

  // 重做
  const redo = useCallback(() => {
    const { future } = historyRef.current
    if (future.length === 0) return false

    const next = future[0]
    if (!next) return false
    historyRef.current.future = future.slice(1)
    historyRef.current.past.push({ nodes: [...nodes], edges: [...edges] })

    setNodes(next.nodes)
    setEdges(next.edges)
    return true
  }, [nodes, edges])

  // 设置画布数据
  const setCanvasData = useCallback((newNodes: CanvasNode[], newEdges: CanvasEdge[]) => {
    setNodes(newNodes)
    setEdges(newEdges)
  }, [])

  // 清除选择
  const clearSelection = useCallback(() => {
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
  }, [])

  return {
    nodes,
    setNodes,
    edges,
    setEdges,
    selectedNodeId,
    setSelectedNodeId,
    selectedEdgeId,
    setSelectedEdgeId,
    saveHistory,
    undo,
    redo,
    setCanvasData,
    clearSelection,
    canUndo: historyRef.current.past.length > 0,
    canRedo: historyRef.current.future.length > 0,
  }
}
