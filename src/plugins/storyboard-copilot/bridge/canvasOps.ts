import type { CanvasNodeType, CanvasNodeData } from '../types'
import { bridgeEvents } from './bridgeEvents'

type CanvasOpsCallback = {
  onAddNode?: (type: CanvasNodeType, position?: { x: number; y: number }, data?: Partial<CanvasNodeData>) => string | null
  onRemoveNode?: (nodeId: string) => void
  onUpdateNodeData?: (nodeId: string, data: Partial<CanvasNodeData>) => void
  onConnectNodes?: (sourceId: string, targetId: string, sourceHandle?: string, targetHandle?: string) => void
  onExecuteNode?: (nodeId: string) => void
  onFocusNode?: (nodeId: string) => void
  onGetNodes?: () => Array<{ id: string; type: string; data: Record<string, unknown>; position: { x: number; y: number } }>
  onGetEdges?: () => Array<{ id: string; source: string; target: string }>
  onGetSelectedNodes?: () => string[]
  onFitView?: () => void
}

class CanvasOpsManager {
  private callbacks: CanvasOpsCallback | null = null

  register(callbacks: CanvasOpsCallback) {
    this.callbacks = callbacks
  }

  unregister() {
    this.callbacks = null
  }

  addNode(
    type: CanvasNodeType,
    position?: { x: number; y: number },
    data?: Partial<CanvasNodeData>
  ): string | null {
    if (this.callbacks?.onAddNode) {
      const nodeId = this.callbacks.onAddNode(type, position, data)
      if (nodeId) {
        bridgeEvents.emit('canvas:node-added', {
          nodeId,
          nodeType: type,
          data: data as Record<string, unknown>,
          position,
        })
      }
      return nodeId
    }
    console.warn('[CanvasOps] Canvas not initialized. Cannot add node.')
    return null
  }

  removeNode(nodeId: string) {
    if (this.callbacks?.onRemoveNode) {
      this.callbacks.onRemoveNode(nodeId)
      bridgeEvents.emit('canvas:node-removed', { nodeId })
    }
  }

  updateNodeData(nodeId: string, data: Partial<CanvasNodeData>) {
    if (this.callbacks?.onUpdateNodeData) {
      this.callbacks.onUpdateNodeData(nodeId, data)
      bridgeEvents.emit('canvas:node-data-changed', {
        nodeId,
        data: data as Record<string, unknown>,
      })
    }
  }

  connectNodes(
    sourceId: string,
    targetId: string,
    sourceHandle?: string,
    targetHandle?: string
  ) {
    if (this.callbacks?.onConnectNodes) {
      this.callbacks.onConnectNodes(sourceId, targetId, sourceHandle, targetHandle)
      bridgeEvents.emit('canvas:edge-added', {
        edgeId: `${sourceId}-${targetId}`,
        source: sourceId,
        target: targetId,
      })
    }
  }

  executeNode(nodeId: string) {
    if (this.callbacks?.onExecuteNode) {
      this.callbacks.onExecuteNode(nodeId)
      bridgeEvents.emit('canvas:node-executed', { nodeId })
    }
  }

  focusNode(nodeId: string) {
    if (this.callbacks?.onFocusNode) {
      this.callbacks.onFocusNode(nodeId)
    }
  }

  getNodes() {
    if (this.callbacks?.onGetNodes) {
      return this.callbacks.onGetNodes()
    }
    return []
  }

  getEdges() {
    if (this.callbacks?.onGetEdges) {
      return this.callbacks.onGetEdges()
    }
    return []
  }

  getSelectedNodes() {
    if (this.callbacks?.onGetSelectedNodes) {
      return this.callbacks.onGetSelectedNodes()
    }
    return []
  }

  fitView() {
    if (this.callbacks?.onFitView) {
      this.callbacks.onFitView()
    }
  }

  isReady(): boolean {
    return this.callbacks !== null
  }
}

export const canvasOps = new CanvasOpsManager()
