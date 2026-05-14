import { useCallback, useEffect, useRef, useState } from 'react'
import type { CanvasNode } from '../types'

interface VirtualizationConfig {
  mountPadding: number
  parkPadding: number
  settleDelayMs: number
  batchSize: number
  recentPinMs: number
}

const DEFAULT_CONFIG: VirtualizationConfig = {
  mountPadding: 600,
  parkPadding: 900,
  settleDelayMs: 120,
  batchSize: 24,
  recentPinMs: 2000,
}

interface ViewportRect {
  x: number
  y: number
  width: number
  height: number
  zoom: number
}

export function useRendererVirtualization(config: Partial<VirtualizationConfig> = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const [viewport, setViewport] = useState<ViewportRect>({ x: 0, y: 0, width: 0, height: 0, zoom: 1 })
  const settleTimerRef = useRef<NodeJS.Timeout | null>(null)
  const pendingViewportRef = useRef<ViewportRect | null>(null)
  const recentOperationTimeRef = useRef<number>(0)

  const markRecentOperation = useCallback(() => {
    recentOperationTimeRef.current = Date.now()
  }, [])

  const updateViewport = useCallback((newViewport: ViewportRect) => {
    pendingViewportRef.current = newViewport

    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current)
    }

    settleTimerRef.current = setTimeout(() => {
      if (pendingViewportRef.current) {
        setViewport(pendingViewportRef.current)
        pendingViewportRef.current = null
      }
      settleTimerRef.current = null
    }, cfg.settleDelayMs)
  }, [cfg.settleDelayMs])

  const getNodeVisibility = useCallback((node: CanvasNode): 'mounted' | 'parked' | 'unmounted' => {
    const now = Date.now()
    const isRecentOperation = now - recentOperationTimeRef.current < cfg.recentPinMs

    if (isRecentOperation) return 'mounted'

    const measured = (node as unknown as Record<string, Record<string, number>>).measured
    const nodeWidth = measured?.width || node.width || 300
    const nodeHeight = measured?.height || node.height || 200
    const nodeLeft = node.position.x
    const nodeTop = node.position.y
    const nodeRight = nodeLeft + nodeWidth
    const nodeBottom = nodeTop + nodeHeight

    const viewLeft = viewport.x - cfg.mountPadding
    const viewTop = viewport.y - cfg.mountPadding
    const viewRight = viewport.x + viewport.width + cfg.mountPadding
    const viewBottom = viewport.y + viewport.height + cfg.mountPadding

    if (nodeRight >= viewLeft && nodeLeft <= viewRight && nodeBottom >= viewTop && nodeTop <= viewBottom) {
      return 'mounted'
    }

    const parkLeft = viewport.x - cfg.parkPadding
    const parkTop = viewport.y - cfg.parkPadding
    const parkRight = viewport.x + viewport.width + cfg.parkPadding
    const parkBottom = viewport.y + viewport.height + cfg.parkPadding

    if (nodeRight >= parkLeft && nodeLeft <= parkRight && nodeBottom >= parkTop && nodeTop <= parkBottom) {
      return 'parked'
    }

    return 'unmounted'
  }, [viewport, cfg.mountPadding, cfg.parkPadding, cfg.recentPinMs])

  useEffect(() => {
    return () => {
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current)
      }
    }
  }, [])

  return {
    viewport,
    updateViewport,
    getNodeVisibility,
    markRecentOperation,
  }
}
