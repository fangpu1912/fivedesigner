import React, { useState, useRef, useEffect, useCallback } from 'react'

import {
  Pencil,
  Eraser,
  Square,
  Circle,
  Type,
  Move,
  Undo,
  Redo,
  Trash2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Layers,
  Highlighter,
  Minus,
  ArrowRight,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { getImageUrl } from '@/utils/asset'

type Tool =
  | 'pencil'
  | 'eraser'
  | 'line'
  | 'rect'
  | 'circle'
  | 'arrow'
  | 'text'
  | 'move'
  | 'highlighter'
type LayerType = 'background' | 'drawing' | 'annotation'

interface Point {
  x: number
  y: number
}

interface DrawingAction {
  tool: Tool
  points: Point[]
  color: string
  size: number
  layer: LayerType
}

interface Layer {
  id: string
  name: string
  type: LayerType
  visible: boolean
  opacity: number
  canvas: HTMLCanvasElement | null
}

interface CanvasDrawingToolProps {
  image?: string | null
  onSave?: (imageData: string) => void
  onCancel?: () => void
  width?: number
  height?: number
}

const COLORS = [
  '#000000',
  '#FFFFFF',
  '#FF0000',
  '#00FF00',
  '#0000FF',
  '#FFFF00',
  '#FF00FF',
  '#00FFFF',
  '#FFA500',
  '#800080',
  '#FFC0CB',
  '#A52A2A',
  '#808080',
  '#C0C0C0',
]

export function CanvasDrawingTool({
  image,
  onSave,
  onCancel,
  width = 1024,
  height = 768,
}: CanvasDrawingToolProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map())
  const backgroundCanvasRef = useRef<HTMLCanvasElement>(null)
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null)
  const annotationCanvasRef = useRef<HTMLCanvasElement>(null)

  const [activeTool, setActiveTool] = useState<Tool>('pencil')
  const [color, setColor] = useState('#FF0000')
  const [brushSize, setBrushSize] = useState(3)
  const [zoom, setZoom] = useState(1)
  const [isDrawing, setIsDrawing] = useState(false)
  const [_currentPoint, setCurrentPoint] = useState<Point | null>(null)
  const [startPoint, setStartPoint] = useState<Point | null>(null)

  const [history, setHistory] = useState<DrawingAction[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  const [layers, setLayers] = useState<Layer[]>([
    {
      id: 'background',
      name: '背景',
      type: 'background',
      visible: true,
      opacity: 100,
      canvas: null,
    },
    { id: 'drawing', name: '绘图层', type: 'drawing', visible: true, opacity: 100, canvas: null },
    {
      id: 'annotation',
      name: '标注层',
      type: 'annotation',
      visible: true,
      opacity: 100,
      canvas: null,
    },
  ])
  const [activeLayerId, setActiveLayerId] = useState<string>('annotation')

  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string } | null>(null)

  useEffect(() => {
    initCanvases()
  }, [])

  useEffect(() => {
    if (image && backgroundCanvasRef.current) {
      loadBackgroundImage(image)
    }
  }, [image])

  const initCanvases = () => {
    const canvases = [backgroundCanvasRef, drawingCanvasRef, annotationCanvasRef]
    canvases.forEach((ref, index) => {
      if (ref.current) {
        ref.current.width = width
        ref.current.height = height
        const ctx = ref.current.getContext('2d')
        if (ctx && index === 0) {
          ctx.fillStyle = '#FFFFFF'
          ctx.fillRect(0, 0, width, height)
        }
      }
    })
  }

  const loadBackgroundImage = useCallback((src: string) => {
    const img = new Image()
    const resolvedSrc = getImageUrl(src) || src
    if (resolvedSrc && !resolvedSrc.startsWith('asset://') && !resolvedSrc.startsWith('data:')) {
      img.crossOrigin = 'anonymous'
    }
    img.onload = () => {
      const ctx = backgroundCanvasRef.current?.getContext('2d')
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height)
      }
    }
    img.src = resolvedSrc
  }, [])

  const getActiveCanvas = (): HTMLCanvasElement | null => {
    const activeLayer = layers.find(l => l.id === activeLayerId)
    if (!activeLayer) return null

    switch (activeLayer.type) {
      case 'background':
        return backgroundCanvasRef.current
      case 'drawing':
        return drawingCanvasRef.current
      case 'annotation':
        return annotationCanvasRef.current
      default:
        return null
    }
  }

  const getMousePos = (e: React.MouseEvent): Point => {
    const canvas = getActiveCanvas()
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) / zoom,
      y: (e.clientY - rect.top) / zoom,
    }
  }

  const startDrawing = (e: React.MouseEvent) => {
    if (activeTool === 'text') {
      const pos = getMousePos(e)
      setTextInput({ x: pos.x, y: pos.y, value: '' })
      return
    }

    if (activeTool === 'move') return

    setIsDrawing(true)
    const pos = getMousePos(e)
    setCurrentPoint(pos)
    setStartPoint(pos)

    if (activeTool === 'pencil' || activeTool === 'eraser' || activeTool === 'highlighter') {
      const canvas = getActiveCanvas()
      const ctx = canvas?.getContext('2d')
      if (ctx) {
        ctx.beginPath()
        ctx.moveTo(pos.x, pos.y)
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.strokeStyle = activeTool === 'eraser' ? '#FFFFFF' : color
        ctx.lineWidth = brushSize
        if (activeTool === 'highlighter') {
          ctx.globalAlpha = 0.3
        } else {
          ctx.globalAlpha = 1
        }
      }
    }
  }

  const draw = (e: React.MouseEvent) => {
    if (!isDrawing) return

    const pos = getMousePos(e)
    const canvas = getActiveCanvas()
    const ctx = canvas?.getContext('2d')

    if (!ctx) return

    if (activeTool === 'pencil' || activeTool === 'eraser' || activeTool === 'highlighter') {
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
      setCurrentPoint(pos)
    } else if (startPoint) {
      // 对于形状工具，需要在临时画布上绘制预览
      // 这里简化处理，直接在当前画布上绘制
    }
  }

  const endDrawing = (e: React.MouseEvent) => {
    if (!isDrawing) return

    const pos = getMousePos(e)
    const canvas = getActiveCanvas()
    const ctx = canvas?.getContext('2d')

    if (ctx && startPoint) {
      if (activeTool === 'line') {
        ctx.beginPath()
        ctx.moveTo(startPoint.x, startPoint.y)
        ctx.lineTo(pos.x, pos.y)
        ctx.strokeStyle = color
        ctx.lineWidth = brushSize
        ctx.stroke()
      } else if (activeTool === 'rect') {
        ctx.strokeStyle = color
        ctx.lineWidth = brushSize
        ctx.strokeRect(
          Math.min(startPoint.x, pos.x),
          Math.min(startPoint.y, pos.y),
          Math.abs(pos.x - startPoint.x),
          Math.abs(pos.y - startPoint.y)
        )
      } else if (activeTool === 'circle') {
        const radiusX = Math.abs(pos.x - startPoint.x) / 2
        const radiusY = Math.abs(pos.y - startPoint.y) / 2
        const centerX = Math.min(startPoint.x, pos.x) + radiusX
        const centerY = Math.min(startPoint.y, pos.y) + radiusY

        ctx.beginPath()
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI)
        ctx.strokeStyle = color
        ctx.lineWidth = brushSize
        ctx.stroke()
      } else if (activeTool === 'arrow') {
        drawArrow(ctx, startPoint, pos, color, brushSize)
      }
    }

    setIsDrawing(false)
    setCurrentPoint(null)
    setStartPoint(null)

    // 添加到历史记录
    if (canvas) {
      const action: DrawingAction = {
        tool: activeTool,
        points: startPoint ? [startPoint, pos] : [],
        color,
        size: brushSize,
        layer: layers.find(l => l.id === activeLayerId)?.type || 'annotation',
      }
      setHistory([...history.slice(0, historyIndex + 1), action])
      setHistoryIndex(historyIndex + 1)
    }
  }

  const drawArrow = (
    ctx: CanvasRenderingContext2D,
    from: Point,
    to: Point,
    color: string,
    size: number
  ) => {
    const headLength = size * 5
    const angle = Math.atan2(to.y - from.y, to.x - from.x)

    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.strokeStyle = color
    ctx.lineWidth = size
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(to.x, to.y)
    ctx.lineTo(
      to.x - headLength * Math.cos(angle - Math.PI / 6),
      to.y - headLength * Math.sin(angle - Math.PI / 6)
    )
    ctx.moveTo(to.x, to.y)
    ctx.lineTo(
      to.x - headLength * Math.cos(angle + Math.PI / 6),
      to.y - headLength * Math.sin(angle + Math.PI / 6)
    )
    ctx.stroke()
  }

  const handleTextSubmit = () => {
    if (!textInput) return

    const canvas = getActiveCanvas()
    const ctx = canvas?.getContext('2d')

    if (ctx && textInput.value) {
      ctx.font = `${brushSize * 5}px sans-serif`
      ctx.fillStyle = color
      ctx.fillText(textInput.value, textInput.x, textInput.y)
    }

    setTextInput(null)
  }

  const undo = () => {
    if (historyIndex < 0) return

    const newHistoryIndex = historyIndex - 1
    setHistoryIndex(newHistoryIndex)

    // 重绘所有历史动作
    redrawFromHistory(newHistoryIndex)
  }

  const redo = () => {
    if (historyIndex >= history.length - 1) return

    const newHistoryIndex = historyIndex + 1
    setHistoryIndex(newHistoryIndex)

    redrawFromHistory(newHistoryIndex)
  }

  const redrawFromHistory = (index: number) => {
    // 清空所有画布
    ;[drawingCanvasRef, annotationCanvasRef].forEach(ref => {
      const ctx = ref.current?.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, width, height)
      }
    })

    // 重绘历史动作
    for (let i = 0; i <= index; i++) {
      const action = history[i]
      if (!action) continue

      let canvas: HTMLCanvasElement | null = null
      switch (action.layer) {
        case 'drawing':
          canvas = drawingCanvasRef.current
          break
        case 'annotation':
          canvas = annotationCanvasRef.current
          break
      }

      const ctx = canvas?.getContext('2d')
      if (!ctx || action.points.length < 2) continue

      ctx.strokeStyle = action.color
      ctx.lineWidth = action.size
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      if (action.tool === 'line') {
        ctx.beginPath()
        ctx.moveTo(action.points[0]?.x ?? 0, action.points[0]?.y ?? 0)
        ctx.lineTo(action.points[1]?.x ?? 0, action.points[1]?.y ?? 0)
        ctx.stroke()
      } else if (action.tool === 'rect') {
        ctx.strokeRect(
          Math.min(action.points[0]?.x ?? 0, action.points[1]?.x ?? 0),
          Math.min(action.points[0]?.y ?? 0, action.points[1]?.y ?? 0),
          Math.abs((action.points[1]?.x ?? 0) - (action.points[0]?.x ?? 0)),
          Math.abs((action.points[1]?.y ?? 0) - (action.points[0]?.y ?? 0))
        )
      }
    }
  }

  const clearLayer = () => {
    const canvas = getActiveCanvas()
    const ctx = canvas?.getContext('2d')
    if (ctx) {
      ctx.clearRect(0, 0, width, height)
    }
  }

  const handleSave = () => {
    // 合并所有可见图层
    const mergedCanvas = document.createElement('canvas')
    mergedCanvas.width = width
    mergedCanvas.height = height
    const ctx = mergedCanvas.getContext('2d')

    if (ctx) {
      layers.forEach(layer => {
        if (!layer.visible) return

        let canvas: HTMLCanvasElement | null = null
        switch (layer.type) {
          case 'background':
            canvas = backgroundCanvasRef.current
            break
          case 'drawing':
            canvas = drawingCanvasRef.current
            break
          case 'annotation':
            canvas = annotationCanvasRef.current
            break
        }

        if (canvas) {
          ctx.globalAlpha = layer.opacity / 100
          ctx.drawImage(canvas, 0, 0)
        }
      })

      const imageData = mergedCanvas.toDataURL('image/png')
      onSave?.(imageData)
    }
  }

  const tools: { id: Tool; icon: React.ReactNode; label: string }[] = [
    { id: 'pencil', icon: <Pencil className="w-4 h-4" />, label: '铅笔' },
    { id: 'highlighter', icon: <Highlighter className="w-4 h-4" />, label: '荧光笔' },
    { id: 'eraser', icon: <Eraser className="w-4 h-4" />, label: '橡皮擦' },
    { id: 'line', icon: <Minus className="w-4 h-4" />, label: '直线' },
    { id: 'arrow', icon: <ArrowRight className="w-4 h-4" />, label: '箭头' },
    { id: 'rect', icon: <Square className="w-4 h-4" />, label: '矩形' },
    { id: 'circle', icon: <Circle className="w-4 h-4" />, label: '圆形' },
    { id: 'text', icon: <Type className="w-4 h-4" />, label: '文字' },
    { id: 'move', icon: <Move className="w-4 h-4" />, label: '移动' },
  ]

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 工具栏 */}
      <div className="h-12 border-b flex items-center justify-between px-4">
        <div className="flex items-center gap-1">
          {tools.map(tool => (
            <Button
              key={tool.id}
              variant={activeTool === tool.id ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={() => setActiveTool(tool.id)}
              title={tool.label}
            >
              {tool.icon}
            </Button>
          ))}

          <div className="w-px h-6 bg-border mx-2" />

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={undo}
            disabled={historyIndex < 0}
          >
            <Undo className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
          >
            <Redo className="w-4 h-4" />
          </Button>

          <div className="w-px h-6 bg-border mx-2" />

          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={clearLayer}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setZoom(Math.max(0.25, zoom - 0.25))}
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-sm w-12 text-center">{Math.round(zoom * 100)}%</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setZoom(Math.min(4, zoom + 0.25))}
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(1)}>
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            取消
          </Button>
          <Button size="sm" onClick={handleSave}>
            保存
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧面板 */}
        <div className="w-64 border-r flex flex-col">
          {/* 颜色选择 */}
          <div className="p-3 border-b">
            <div className="text-sm font-medium mb-2">颜色</div>
            <div className="grid grid-cols-7 gap-1">
              {COLORS.map(c => (
                <button
                  key={c}
                  className={cn(
                    'w-6 h-6 rounded border-2',
                    color === c ? 'border-primary' : 'border-transparent'
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          {/* 画笔大小 */}
          <div className="p-3 border-b">
            <div className="text-sm font-medium mb-2">画笔大小: {brushSize}px</div>
            <Slider
              value={[brushSize]}
              onValueChange={([v]) => setBrushSize(v ?? 1)}
              min={1}
              max={50}
              step={1}
            />
          </div>

          {/* 图层 */}
          <div className="flex-1 p-3 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">图层</div>
            </div>
            <div className="space-y-1">
              {layers.map(layer => (
                <div
                  key={layer.id}
                  className={cn(
                    'flex items-center gap-2 p-2 rounded cursor-pointer',
                    activeLayerId === layer.id && 'bg-primary/10'
                  )}
                  onClick={() => setActiveLayerId(layer.id)}
                >
                  <input
                    type="checkbox"
                    checked={layer.visible}
                    onChange={e => {
                      e.stopPropagation()
                      setLayers(
                        layers.map(l => (l.id === layer.id ? { ...l, visible: !l.visible } : l))
                      )
                    }}
                  />
                  <Layers className="w-4 h-4" />
                  <span className="text-sm flex-1">{layer.name}</span>
                  <span className="text-xs text-muted-foreground">{layer.opacity}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 画布区域 */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto bg-muted/30 flex items-center justify-center"
          style={{
            backgroundImage:
              'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
            backgroundSize: '20px 20px',
            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
          }}
        >
          <div
            className="relative"
            style={{
              width: width * zoom,
              height: height * zoom,
            }}
          >
            {/* 背景层 */}
            <canvas
              ref={backgroundCanvasRef}
              className="absolute top-0 left-0"
              style={{
                width: width * zoom,
                height: height * zoom,
                opacity: layers.find(l => l.type === 'background')?.opacity ?? 100 / 100,
                display: layers.find(l => l.type === 'background')?.visible ? 'block' : 'none',
              }}
            />
            {/* 绘图层 */}
            <canvas
              ref={drawingCanvasRef}
              className="absolute top-0 left-0"
              style={{
                width: width * zoom,
                height: height * zoom,
                opacity: layers.find(l => l.type === 'drawing')?.opacity ?? 100 / 100,
                display: layers.find(l => l.type === 'drawing')?.visible ? 'block' : 'none',
              }}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={endDrawing}
              onMouseLeave={endDrawing}
            />
            {/* 标注层 */}
            <canvas
              ref={annotationCanvasRef}
              className="absolute top-0 left-0"
              style={{
                width: width * zoom,
                height: height * zoom,
                opacity: layers.find(l => l.type === 'annotation')?.opacity ?? 100 / 100,
                display: layers.find(l => l.type === 'annotation')?.visible ? 'block' : 'none',
              }}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={endDrawing}
              onMouseLeave={endDrawing}
            />

            {/* 文字输入框 */}
            {textInput && (
              <input
                type="text"
                className="absolute bg-white border rounded px-1"
                style={{
                  left: textInput.x * zoom,
                  top: (textInput.y - 20) * zoom,
                  fontSize: brushSize * 5 * zoom,
                }}
                value={textInput.value}
                onChange={e => setTextInput({ ...textInput, value: e.target.value })}
                onBlur={handleTextSubmit}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleTextSubmit()
                  if (e.key === 'Escape') setTextInput(null)
                }}
                autoFocus
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
