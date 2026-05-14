export interface CanvasEventPayload {
  type: 'addResultNode' | 'executeNode' | 'propagateData' | 'addUploadNode'
  imageUrl?: string
  videoUrl?: string
  audioUrl?: string
  text?: string
  sourceNodeId?: string
  sourceHandleId?: string
  nodeId?: string
  data?: Record<string, unknown>
}

class CanvasEventEmitter {
  private listeners: ((payload: CanvasEventPayload) => void)[] = []

  subscribe(callback: (payload: CanvasEventPayload) => void) {
    this.listeners.push(callback)
    return () => {
      const index = this.listeners.indexOf(callback)
      if (index > -1) {
        this.listeners.splice(index, 1)
      }
    }
  }

  emit(payload: CanvasEventPayload) {
    this.listeners.forEach((callback) => callback(payload))
  }
}

export const canvasEvents = new CanvasEventEmitter()
