import { memo, useState, useEffect, useRef, useCallback } from 'react'
import { Handle, Position, useReactFlow, useStore, type NodeProps } from '@xyflow/react'
import { GitCompare, Loader2, MoveHorizontal } from 'lucide-react'

import { getImageUrl } from '@/utils/asset'
import { getNodeContainerClass, getTargetHandleClass, NODE_MIN_WIDTH, NODE_MIN_HEIGHT, } from './NodeStyles'
import { NodeResizeHandle } from './NodeResizeHandle'
import { useEnlargedHandles } from '../../hooks/useEnlargedHandles'

import type { NodeDisplayData } from '../../types'

interface ImageCompareNodeProps extends NodeProps {
  data: NodeDisplayData
  width?: number
  height?: number
}

function resolveNodeDimension(value: number | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 1) return Math.round(value)
  return fallback
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

async function computeDiff(
  img1Src: string,
  img2Src: string,
  threshold: number
): Promise<{ dataUrl: string; similarity: string }> {
  const [img1, img2] = await Promise.all([loadImage(img1Src), loadImage(img2Src)])

  const w = Math.max(img1.width, img2.width)
  const h = Math.max(img1.height, img2.height)

  const canvas1 = document.createElement('canvas')
  canvas1.width = w
  canvas1.height = h
  const ctx1 = canvas1.getContext('2d')!
  ctx1.drawImage(img1, 0, 0, w, h)
  const data1 = ctx1.getImageData(0, 0, w, h)

  const canvas2 = document.createElement('canvas')
  canvas2.width = w
  canvas2.height = h
  const ctx2 = canvas2.getContext('2d')!
  ctx2.drawImage(img2, 0, 0, w, h)
  const data2 = ctx2.getImageData(0, 0, w, h)

  const diffCanvas = document.createElement('canvas')
  diffCanvas.width = w
  diffCanvas.height = h
  const diffCtx = diffCanvas.getContext('2d')!
  const diffData = diffCtx.createImageData(w, h)

  let diffPixels = 0
  const totalPixels = w * h

  for (let i = 0; i < data1.data.length; i += 4) {
    const r1 = data1.data[i] ?? 0, g1 = data1.data[i + 1] ?? 0, b1 = data1.data[i + 2] ?? 0
    const r2 = data2.data[i] ?? 0, g2 = data2.data[i + 1] ?? 0, b2 = data2.data[i + 2] ?? 0
    const diff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2)

    if (diff > threshold) {
      diffPixels++
      diffData.data[i] = 255
      diffData.data[i + 1] = Math.min(255, diff)
      diffData.data[i + 2] = 0
      diffData.data[i + 3] = 200
    } else {
      diffData.data[i] = r2
      diffData.data[i + 1] = g2
      diffData.data[i + 2] = b2
      diffData.data[i + 3] = 255
    }
  }

  diffCtx.putImageData(diffData, 0, 0)
  const similarity = ((1 - diffPixels / totalPixels) * 100).toFixed(1)

  return { dataUrl: diffCanvas.toDataURL('image/png'), similarity }
}

type DiffMode = 'slider' | 'diff' | 'overlay' | 'sideBySide'

export const ImageCompareNode = memo(({ id, data, selected, width, height }: ImageCompareNodeProps) => {
  const { updateNodeData: _updateNodeData } = useReactFlow()
  const nodes = useStore((s) => s.nodes)
  const edges = useStore((s) => s.edges)
  const incomingEdges = edges.filter((edge) => edge.target === id)
  const [diffResult, setDiffResult] = useState<string | null>(null)
  const [isComputing, setIsComputing] = useState(false)
  const [similarity, setSimilarity] = useState<string | null>(null)
  const [threshold, setThreshold] = useState(30)
  const [mode, setMode] = useState<DiffMode>('slider')
  const [sliderPos, setSliderPos] = useState(50)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const enlargedHandles = useEnlargedHandles(id)

  const getImageFromEdge = (edgeIndex: number): string | null => {
    if (incomingEdges.length <= edgeIndex) return null
    const edge = incomingEdges[edgeIndex]
    if (!edge) return null
    const sourceNode = nodes.find((n) => n.id === edge.source)
    if (!sourceNode) return null
    return (sourceNode.data?.imageUrl || sourceNode.data?.previewImageUrl || null) as string | null
  }

  const image1Url = (() => {
    const path = getImageFromEdge(0)
    return path ? getImageUrl(path) : null
  })()

  const image2Url = (() => {
    const path = getImageFromEdge(1)
    return path ? getImageUrl(path) : null
  })()

  const handleCompare = useCallback(async () => {
    if (!image1Url || !image2Url) return
    setIsComputing(true)
    try {
      const result = await computeDiff(image1Url, image2Url, threshold)
      setDiffResult(result.dataUrl)
      setSimilarity(result.similarity)
    } catch (err) {
      console.error('对比失败:', err)
    } finally {
      setIsComputing(false)
    }
  }, [image1Url, image2Url, threshold])

  useEffect(() => {
    if (image1Url && image2Url) {
      handleCompare()
    }
  }, [image1Url, image2Url, threshold, handleCompare])

  const handleSliderMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleSliderMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    setSliderPos(Math.max(0, Math.min(100, (x / rect.width) * 100)))
  }, [isDragging])

  const handleSliderTouchMove = useCallback((e: React.TouchEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const touch = e.touches[0]
    if (!touch) return
    const x = touch.clientX - rect.left
    setSliderPos(Math.max(0, Math.min(100, (x / rect.width) * 100)))
  }, [])

  const resolvedWidth = resolveNodeDimension(width, 320)
  const resolvedHeight = resolveNodeDimension(height, 280)

  const modeLabels: Record<DiffMode, string> = {
    slider: '滑动',
    diff: '差异',
    overlay: '叠加',
    sideBySide: '并排',
  }

  return (
    <div
      className={cn(getNodeContainerClass(selected), 'flex flex-col')}
      style={{ width: resolvedWidth, height: resolvedHeight + 70 }}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-3 py-2 text-xs font-medium border-b bg-muted/30 shrink-0 node-header">
        <div className="flex items-center gap-1.5">
          <GitCompare className="h-4 w-4" />
          <span>{data.displayName || '图片对比'}</span>
        </div>
        {similarity && (
          <span className="text-[10px] text-muted-foreground">相似度: {similarity}%</span>
        )}
      </div>

      {/* 控制栏 */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b shrink-0">
        <div className="flex gap-1">
          {(['slider', 'diff', 'overlay', 'sideBySide'] as DiffMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              onPointerDown={(e) => e.stopPropagation()}
              className={cn(
                'px-1.5 py-0.5 rounded text-[9px] transition-colors',
                mode === m
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {modeLabels[m]}
            </button>
          ))}
        </div>
        {mode === 'diff' && (
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-[9px] text-muted-foreground">阈值</span>
            <input
              type="range"
              min="5"
              max="100"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              onPointerDown={(e) => e.stopPropagation()}
              className="w-12 h-1 accent-primary"
            />
          </div>
        )}
      </div>

      {/* 内容区域 */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-hidden relative"
        onMouseMove={handleSliderMouseMove}
        onMouseUp={() => setIsDragging(false)}
        onMouseLeave={() => setIsDragging(false)}
        onTouchMove={handleSliderTouchMove}
      >
        {isComputing ? (
          <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-xs">计算差异中...</span>
          </div>
        ) : mode === 'slider' && image1Url && image2Url ? (
          <>
            <img
              src={image2Url}
              alt="图2"
              className="absolute inset-0 w-full h-full object-contain"
              draggable={false}
            />
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
            >
              <img
                src={image1Url}
                alt="图1"
                className="w-full h-full object-contain"
                draggable={false}
              />
            </div>
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg cursor-ew-resize"
              style={{ left: `${sliderPos}%`, transform: 'translateX(-50%)' }}
            >
              <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 bg-white rounded-full shadow-md flex items-center justify-center"
                onMouseDown={handleSliderMouseDown}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <MoveHorizontal className="h-3 w-3 text-foreground" />
              </div>
            </div>
          </>
        ) : mode === 'diff' && diffResult ? (
          <img
            src={diffResult}
            alt="差异结果"
            className="w-full h-full object-contain"
            draggable={false}
          />
        ) : mode === 'sideBySide' && image1Url && image2Url ? (
          <div className="flex w-full h-full">
            <img src={image1Url} alt="图1" className="w-1/2 h-full object-contain" draggable={false} />
            <div className="w-px bg-border" />
            <img src={image2Url} alt="图2" className="w-1/2 h-full object-contain" draggable={false} />
          </div>
        ) : mode === 'overlay' && image1Url && image2Url ? (
          <div className="relative w-full h-full">
            <img src={image2Url} alt="图2" className="absolute inset-0 w-full h-full object-contain opacity-50" draggable={false} />
            <img src={image1Url} alt="图1" className="absolute inset-0 w-full h-full object-contain opacity-50" draggable={false} />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <GitCompare className="h-8 w-8 opacity-50" />
            <span className="text-xs text-center px-4">请连接两张图片</span>
          </div>
        )}
      </div>

      {/* 输入端口 */}
      <Handle
        type="target"
        id="left"
        position={Position.Left}
        className={getTargetHandleClass(undefined, enlargedHandles.target)}
      />
      <Handle
        type="target"
        id="right"
        position={Position.Left}
        className={getTargetHandleClass(undefined, enlargedHandles.target)}
      />

      {/* 缩放手柄 */}
      <NodeResizeHandle
        minWidth={NODE_MIN_WIDTH}
        minHeight={NODE_MIN_HEIGHT}
        maxWidth={800}
        maxHeight={600}
      />
    </div>
  )
})

ImageCompareNode.displayName = 'ImageCompareNode'

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}
