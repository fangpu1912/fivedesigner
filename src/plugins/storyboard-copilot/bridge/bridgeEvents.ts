export type BridgeEventType =
  | 'asset:created'
  | 'asset:updated'
  | 'asset:deleted'
  | 'canvas:node-added'
  | 'canvas:node-removed'
  | 'canvas:node-data-changed'
  | 'canvas:edge-added'
  | 'canvas:edge-removed'
  | 'canvas:node-executed'
  | 'canvas:node-execution-completed'
  | 'canvas:node-execution-failed'
  | 'canvas:selection-changed'
  | 'canvas:viewport-changed'
  | 'generation:started'
  | 'generation:completed'
  | 'generation:failed'
  | 'generation:progress'

export type AssetType = 'storyboard' | 'character' | 'scene' | 'prop' | 'dubbing'

export interface AssetEventPayload {
  type: AssetType
  ids: string[]
  projectId?: string
  episodeId?: string
  field?: string
  value?: unknown
}

export interface CanvasNodeEventPayload {
  nodeId: string
  nodeType?: string
  data?: Record<string, unknown>
  position?: { x: number; y: number }
}

export interface CanvasEdgeEventPayload {
  edgeId: string
  source: string
  target: string
}

export interface GenerationEventPayload {
  nodeId: string
  nodeType: string
  resultType: 'image' | 'video' | 'audio' | 'text'
  resultUrl?: string
  error?: string
  progress?: number
}

export interface CanvasSelectionPayload {
  selectedNodeIds: string[]
}

export interface CanvasViewportPayload {
  x: number
  y: number
  zoom: number
}

export type BridgeEventPayload =
  | { event: 'asset:created'; payload: AssetEventPayload }
  | { event: 'asset:updated'; payload: AssetEventPayload }
  | { event: 'asset:deleted'; payload: AssetEventPayload }
  | { event: 'canvas:node-added'; payload: CanvasNodeEventPayload }
  | { event: 'canvas:node-removed'; payload: CanvasNodeEventPayload }
  | { event: 'canvas:node-data-changed'; payload: CanvasNodeEventPayload }
  | { event: 'canvas:edge-added'; payload: CanvasEdgeEventPayload }
  | { event: 'canvas:edge-removed'; payload: CanvasEdgeEventPayload }
  | { event: 'canvas:node-executed'; payload: CanvasNodeEventPayload }
  | { event: 'canvas:node-execution-completed'; payload: CanvasNodeEventPayload }
  | { event: 'canvas:node-execution-failed'; payload: CanvasNodeEventPayload }
  | { event: 'canvas:selection-changed'; payload: CanvasSelectionPayload }
  | { event: 'canvas:viewport-changed'; payload: CanvasViewportPayload }
  | { event: 'generation:started'; payload: GenerationEventPayload }
  | { event: 'generation:completed'; payload: GenerationEventPayload }
  | { event: 'generation:failed'; payload: GenerationEventPayload }
  | { event: 'generation:progress'; payload: GenerationEventPayload }

type EventHandler<T = unknown> = (payload: T) => void

class BridgeEventEmitter {
  private listeners: Map<string, Set<EventHandler>> = new Map()

  on<T>(event: BridgeEventType, handler: EventHandler<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    const handlers = this.listeners.get(event)!
    handlers.add(handler as EventHandler)
    return () => {
      handlers.delete(handler as EventHandler)
      if (handlers.size === 0) {
        this.listeners.delete(event)
      }
    }
  }

  once<T>(event: BridgeEventType, handler: EventHandler<T>): () => void {
    const wrapper: EventHandler = (payload) => {
      off()
      handler(payload as T)
    }
    const off = this.on(event, wrapper)
    return off
  }

  emit<T>(event: BridgeEventType, payload: T): void {
    const handlers = this.listeners.get(event)
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(payload)
        } catch (error) {
          console.error(`[BridgeEvents] Error in handler for "${event}":`, error)
        }
      })
    }
  }

  off<T>(event: BridgeEventType, handler: EventHandler<T>): void {
    const handlers = this.listeners.get(event)
    if (handlers) {
      handlers.delete(handler as EventHandler)
    }
  }

  removeAllListeners(event?: BridgeEventType): void {
    if (event) {
      this.listeners.delete(event)
    } else {
      this.listeners.clear()
    }
  }

  listenerCount(event: BridgeEventType): number {
    return this.listeners.get(event)?.size || 0
  }
}

export const bridgeEvents = new BridgeEventEmitter()
