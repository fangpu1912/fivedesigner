import { useCallback } from 'react'
import type { CanvasNode, CanvasNodeData } from '../types'

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
  'abortController',
])

function stripNodeRuntimeState(data: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (RUNTIME_STATE_KEYS.has(key)) continue
    if (key === 'items' && Array.isArray(value)) {
      cleaned[key] = value.map((item: Record<string, unknown>) => {
        const itemCopy = { ...item }
        delete itemCopy.status
        return itemCopy
      })
    } else {
      cleaned[key] = value
    }
  }
  return cleaned
}

export function useRuntimeStateStripper() {
  const stripNodesForSave = useCallback((nodes: CanvasNode[]): CanvasNode[] => {
    return nodes.map((node) => ({
      ...node,
      data: stripNodeRuntimeState(node.data as Record<string, unknown>) as CanvasNodeData,
    }))
  }, [])

  const resetStaleRuntimeState = useCallback((nodes: CanvasNode[]): CanvasNode[] => {
    return nodes.map((node) => {
      const data = node.data as Record<string, unknown>
      const needsReset =
        data.isGenerating === true ||
        data.isProcessing === true ||
        data.isRunning === true

      if (!needsReset) return node

      const cleaned = { ...data }
      if (cleaned.isGenerating) cleaned.isGenerating = false
      if (cleaned.isProcessing) cleaned.isProcessing = false
      if (cleaned.isRunning) cleaned.isRunning = false
      if (cleaned.progress) cleaned.progress = 0
      if (cleaned.generationError) delete cleaned.generationError

      if (Array.isArray(cleaned.items)) {
        cleaned.items = (cleaned.items as Array<Record<string, unknown>>).map((item) => {
          if (item.status === 'generating' || item.status === 'pending') {
            return { ...item, status: 'failed' }
          }
          return item
        })
      }

      return { ...node, data: cleaned as CanvasNodeData }
    })
  }, [])

  return { stripNodesForSave, resetStaleRuntimeState }
}

export { stripNodeRuntimeState, RUNTIME_STATE_KEYS }
