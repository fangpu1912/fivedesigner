import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Brush, Circle, Square, Type, Undo2, Trash2, Grid3X3 } from 'lucide-react'
import { Stage, Layer, Image as KonvaImage, Rect, Ellipse, Arrow, Line, Text, Transformer, Group } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type Konva from 'konva'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getImageUrl } from '@/utils/asset'
import {
  normalizeAnnotationRect,
  type AnnotationItem,
  type AnnotationToolType,
} from '../tools/annotation'

const VIEWPORT_PADDING_PX = 32
const VIEWPORT_MIN_WIDTH_PX = 1000
const VIEWPORT_MIN_HEIGHT_PX = 700
const DEFAULT_LINE_WIDTH_PERCENT = 0.4
const MIN_LINE_WIDTH_PERCENT = 0.1
const MAX_LINE_WIDTH_PERCENT = 3
const DEFAULT_TEXT_SIZE_PERCENT = 10
const MIN_TEXT_SIZE_PERCENT = 1
const MAX_TEXT_SIZE_PERCENT = 30

type ToolButton = { type: AnnotationToolType | 'faceGrid'; label: string; icon: typeof Square }

const TOOL_BUTTONS: ToolButton[] = [
  { type: 'rect', label: '矩形', icon: Square },
  { type: 'ellipse', label: '圆形', icon: Circle },
  { type: 'arrow', label: '箭头', icon: ArrowRight },
  { type: 'pen', label: '画笔', icon: Brush },
  { type: 'text', label: '文本', icon: Type },
  { type: 'faceGrid', label: '人脸网格', icon: Grid3X3 },
]

type FaceGridRegion = {
  id: string
  x: number
  y: number
  width: number
  height: number
  opacity: number
  gridSize: number
  angle: number
  color: string
}

function createAnnotationId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function resolveTextBaseSize(image: HTMLImageElement | null): number {
  if (!image) return 1000
  return Math.max(320, Math.min(image.naturalWidth, image.naturalHeight))
}

function percentToFontSize(percent: number, baseSize: number): number {
  return Math.max(10, Math.round(baseSize * (percent / 100)))
}

function percentToLineWidth(percent: number, baseSize: number): number {
  return Math.max(1, Math.round(baseSize * (percent / 100)))
}

function getPointsBounds(points: number[]): { minX: number; minY: number } {
  const xs = points.filter((_, i) => i % 2 === 0)
  const ys = points.filter((_, i) => i % 2 === 1)
  return { minX: Math.min(...xs), minY: Math.min(...ys) }
}

function updateAnnotationPosition(item: AnnotationItem, newX: number, newY: number): AnnotationItem {
  if (item.type === 'arrow' || item.type === 'pen') {
    const { minX, minY } = getPointsBounds(item.points)
    const dx = newX - minX
    const dy = newY - minY
    return { ...item, points: item.points.map((p: number, i: number) => (i % 2 === 0 ? p + dx : p + dy)) } as AnnotationItem
  }
  if (item.type === 'rect' || item.type === 'ellipse' || item.type === 'text') {
    return { ...item, x: newX, y: newY }
  }
  return item
}

function updateAnnotationTransform(
  item: AnnotationItem, newX: number, newY: number, scaleX: number, scaleY: number
): AnnotationItem {
  if (item.type === 'rect' || item.type === 'ellipse') {
    return { ...item, x: newX, y: newY, width: Math.max(5, item.width * scaleX), height: Math.max(5, item.height * scaleY) }
  }
  if (item.type === 'text') {
    return { ...item, x: newX, y: newY, fontSize: Math.max(8, Math.round(item.fontSize * Math.max(scaleX, scaleY))) }
  }
  if (item.type === 'arrow' || item.type === 'pen') {
    const { minX, minY } = getPointsBounds(item.points)
    return {
      ...item,
      points: item.points.map((p: number, i: number) => i % 2 === 0 ? newX + (p - minX) * scaleX : newY + (p - minY) * scaleY),
    } as AnnotationItem
  }
  return item
}

function drawAnnotationOnCanvas(ctx: CanvasRenderingContext2D, item: AnnotationItem): void {
  ctx.save()
  ctx.strokeStyle = ('stroke' in item ? item.stroke : undefined) || '#ff4d4f'
  ctx.fillStyle = ('color' in item ? item.color : undefined) || '#ff4d4f'
  ctx.lineWidth = ('lineWidth' in item ? item.lineWidth : undefined) || 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  switch (item.type) {
    case 'rect':
      if (item.width > 0 && item.height > 0) {
        ctx.strokeRect(item.x, item.y, item.width, item.height)
      }
      break
    case 'ellipse':
      if (item.width > 0 && item.height > 0) {
        ctx.beginPath()
        ctx.ellipse(
          item.x + item.width / 2, item.y + item.height / 2,
          item.width / 2, item.height / 2,
          0, 0, Math.PI * 2
        )
        ctx.stroke()
      }
      break
    case 'arrow': {
      const [x1, y1, x2, y2] = item.points
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      const angle = Math.atan2(y2 - y1, x2 - x1)
      const headLen = Math.max(10, item.lineWidth * 4)
      ctx.beginPath()
      ctx.moveTo(x2, y2)
      ctx.lineTo(
        x2 - headLen * Math.cos(angle - Math.PI / 6),
        y2 - headLen * Math.sin(angle - Math.PI / 6)
      )
      ctx.moveTo(x2, y2)
      ctx.lineTo(
        x2 - headLen * Math.cos(angle + Math.PI / 6),
        y2 - headLen * Math.sin(angle + Math.PI / 6)
      )
      ctx.stroke()
      break
    }
    case 'pen': {
      if (item.points.length >= 4) {
        ctx.beginPath()
        const p0 = item.points[0]
        const p1 = item.points[1]
        if (p0 !== undefined && p1 !== undefined) {
          ctx.moveTo(p0, p1)
          for (let i = 2; i < item.points.length; i += 2) {
            const px = item.points[i]
            const py = item.points[i + 1]
            if (px !== undefined && py !== undefined) {
              ctx.lineTo(px, py)
            }
          }
          ctx.stroke()
        }
      }
      break
    }
    case 'text':
      if (item.text) {
        ctx.font = `bold ${item.fontSize}px sans-serif`
        ctx.textBaseline = 'top'
        ctx.fillText(item.text, item.x, item.y)
      }
      break
  }

  ctx.restore()
}

function drawFaceGridOnCanvas(ctx: CanvasRenderingContext2D, region: FaceGridRegion): void {
  ctx.save()
  
  const centerX = region.x + region.width / 2
  const centerY = region.y + region.height / 2
  const radiusX = region.width / 2
  const radiusY = region.height / 2
  
  ctx.beginPath()
  ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2)
  ctx.clip()
  
  ctx.translate(centerX, centerY)
  ctx.rotate((region.angle * Math.PI) / 180)
  ctx.translate(-centerX, -centerY)
  
  ctx.strokeStyle = region.color
  ctx.globalAlpha = region.opacity
  ctx.lineWidth = 0.5
  
  const diagonal = Math.sqrt(region.width ** 2 + region.height ** 2) * 1.5
  const startX = centerX - diagonal / 2
  const startY = centerY - diagonal / 2
  
  for (let y = startY; y < startY + diagonal; y += region.gridSize) {
    ctx.beginPath()
    ctx.moveTo(startX, y)
    ctx.lineTo(startX + diagonal, y)
    ctx.stroke()
  }
  
  for (let x = startX; x < startX + diagonal; x += region.gridSize) {
    ctx.beginPath()
    ctx.moveTo(x, startY)
    ctx.lineTo(x, startY + diagonal)
    ctx.stroke()
  }
  
  ctx.restore()
}

type DraftState = {
  tool: Exclude<AnnotationToolType, 'text'>
  startX: number
  startY: number
  currentX: number
  currentY: number
  points?: number[]
}

interface TextEditorState {
  annotationId: string | null
  x: number
  y: number
  value: string
}

interface ImageEditorDialogProps {
  open: boolean
  imageUrl: string
  projectId?: string
  episodeId?: string
  onClose: () => void
  onSave: (annotatedImageDataUrl: string) => void
}

export function ImageEditorDialog({ open, imageUrl, onClose, onSave }: ImageEditorDialogProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [tool, setTool] = useState<AnnotationToolType | 'faceGrid'>('rect')
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([])
  const [faceGridRegions, setFaceGridRegions] = useState<FaceGridRegion[]>([])
  const [draft, setDraft] = useState<DraftState | null>(null)
  const [undoStack, setUndoStack] = useState<(AnnotationItem[] | FaceGridRegion[])[]>([])
  const [redoStack, setRedoStack] = useState<(AnnotationItem[] | FaceGridRegion[])[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [color, setColor] = useState('#ff4d4f')
  const [lineWidthPercent, setLineWidthPercent] = useState(DEFAULT_LINE_WIDTH_PERCENT)
  const [textSizePercent, setTextSizePercent] = useState(DEFAULT_TEXT_SIZE_PERCENT)
  const [textEditorState, setTextEditorState] = useState<TextEditorState | null>(null)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  
  // 人脸网格参数
  const [gridOpacity, setGridOpacity] = useState(0.15)
  const [gridSize, setGridSize] = useState(6)
  const [gridAngle, setGridAngle] = useState(45)
  const [gridColor, setGridColor] = useState('#000000')
  const [draftFaceGrid, setDraftFaceGrid] = useState<{ x: number; y: number; width: number; height: number } | null>(null)

  const stageRef = useRef<Konva.Stage | null>(null)
  const contentGroupRef = useRef<Konva.Group | null>(null)
  const transformerRef = useRef<Konva.Transformer | null>(null)
  const shapeRefs = useRef<Map<string, Konva.Node>>(new Map())
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const textInputRef = useRef<HTMLTextAreaElement | null>(null)

  const displayUrl = useMemo(() => getImageUrl(imageUrl) || imageUrl, [imageUrl])

  useEffect(() => {
    if (!open || !imageUrl) return
    const img = new window.Image()
    if (displayUrl && !displayUrl.startsWith('asset://') && !displayUrl.startsWith('data:')) img.crossOrigin = 'anonymous'
    img.onload = () => setImage(img)
    img.onerror = () => { console.error('[ImageEditorDialog] 图片加载失败:', displayUrl); setImage(null) }
    img.src = displayUrl
  }, [open, imageUrl, displayUrl])

  useEffect(() => {
    if (!open) return
    setAnnotations([])
    setFaceGridRegions([])
    setUndoStack([])
    setRedoStack([])
    setSelectedId(null)
    setDraft(null)
    setDraftFaceGrid(null)
    setTextEditorState(null)
  }, [open, imageUrl])

  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const updateSize = () => {
      const rect = element.getBoundingClientRect()
      setViewportSize({ width: Math.max(0, Math.round(rect.width)), height: Math.max(0, Math.round(rect.height)) })
    }
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const textBaseSize = useMemo(() => resolveTextBaseSize(image), [image])
  const lineWidth = percentToLineWidth(lineWidthPercent, textBaseSize)
  const fontSize = percentToFontSize(textSizePercent, textBaseSize)

  const { stageWidth, stageHeight, scale } = useMemo(() => {
    if (!image) return { stageWidth: 1200, stageHeight: 700, scale: 1 }
    const availableWidth = Math.max(VIEWPORT_MIN_WIDTH_PX, viewportSize.width - VIEWPORT_PADDING_PX * 2)
    const availableHeight = Math.max(VIEWPORT_MIN_HEIGHT_PX, viewportSize.height - VIEWPORT_PADDING_PX * 2)
    const widthRatio = availableWidth / image.naturalWidth
    const heightRatio = availableHeight / image.naturalHeight
    const ratio = Math.min(widthRatio, heightRatio, 1.5)
    return {
      stageWidth: Math.max(1, Math.round(image.naturalWidth * ratio)),
      stageHeight: Math.max(1, Math.round(image.naturalHeight * ratio)),
      scale: ratio,
    }
  }, [image, viewportSize])

  const getImagePoint = useCallback(() => {
    const stage = stageRef.current
    const group = contentGroupRef.current
    if (!stage || !group || !image) return null
    const pointer = stage.getPointerPosition()
    if (!pointer) return null
    const transform = group.getAbsoluteTransform().copy()
    transform.invert()
    const imagePoint = transform.point(pointer)
    return {
      x: clamp(imagePoint.x, 0, image.naturalWidth),
      y: clamp(imagePoint.y, 0, image.naturalHeight),
    }
  }, [image])

  const buildDraftAnnotation = useCallback((currentX: number, currentY: number): AnnotationItem | null => {
    if (!draft) return null
    if (draft.tool === 'pen') {
      const points = [...(draft.points ?? [draft.startX, draft.startY]), currentX, currentY]
      return { id: 'draft-pen', type: 'pen', points, stroke: color, lineWidth }
    }
    if (draft.tool === 'arrow') {
      return { id: 'draft-arrow', type: 'arrow', points: [draft.startX, draft.startY, currentX, currentY], stroke: color, lineWidth }
    }
    const rect = normalizeAnnotationRect(draft.startX, draft.startY, currentX, currentY)
    if (draft.tool === 'rect') return { id: 'draft-rect', type: 'rect', ...rect, stroke: color, lineWidth }
    return { id: 'draft-ellipse', type: 'ellipse', ...rect, stroke: color, lineWidth }
  }, [color, draft, lineWidth])

  const draftAnnotation = useMemo(() => {
    if (!draft) return null
    if (draft.tool === 'pen') {
      return { id: 'draft-pen', type: 'pen' as const, points: draft.points ?? [draft.startX, draft.startY], stroke: color, lineWidth } as AnnotationItem
    }
    return buildDraftAnnotation(draft.currentX, draft.currentY)
  }, [buildDraftAnnotation, color, draft, lineWidth])

  const handlePointerDown = useCallback((event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const point = getImagePoint()
    if (!point) return
    const target = event.target
    const isBackground = target === target.getStage() || target.name() === 'annotation-background'
    if (!isBackground) return

    if (tool === 'text') {
      setTextEditorState({ annotationId: null, x: point.x, y: point.y, value: '' })
      requestAnimationFrame(() => textInputRef.current?.focus())
      return
    }

    if (tool === 'faceGrid') {
      setDraftFaceGrid({ x: point.x, y: point.y, width: 0, height: 0 })
      return
    }

    setTextEditorState(null)
    setSelectedId(null)
    setDraft({
      tool: tool as Exclude<AnnotationToolType, 'text'>,
      startX: point.x, startY: point.y,
      currentX: point.x, currentY: point.y,
      points: tool === 'pen' ? [point.x, point.y] : undefined,
    })
  }, [getImagePoint, tool])

  const handlePointerMove = useCallback(() => {
    if (tool === 'faceGrid' && draftFaceGrid) {
      const point = getImagePoint()
      if (!point) return
      setDraftFaceGrid({
        x: Math.min(draftFaceGrid.x, point.x),
        y: Math.min(draftFaceGrid.y, point.y),
        width: Math.abs(point.x - draftFaceGrid.x),
        height: Math.abs(point.y - draftFaceGrid.y),
      })
      return
    }

    if (!draft) return
    const point = getImagePoint()
    if (!point) return
    if (draft.tool === 'pen') {
      setDraft(prev => prev && prev.tool === 'pen'
        ? { ...prev, currentX: point.x, currentY: point.y, points: [...(prev.points ?? [prev.startX, prev.startY]), point.x, point.y] }
        : prev)
      return
    }
    setDraft(prev => prev ? { ...prev, currentX: point.x, currentY: point.y } : prev)
  }, [draft, draftFaceGrid, getImagePoint, tool])

  const handlePointerUp = useCallback(() => {
    if (tool === 'faceGrid' && draftFaceGrid) {
      if (draftFaceGrid.width > 10 && draftFaceGrid.height > 10) {
        const newRegion: FaceGridRegion = {
          id: createAnnotationId(),
          ...draftFaceGrid,
          opacity: gridOpacity,
          gridSize,
          angle: gridAngle,
          color: gridColor,
        }
        setUndoStack(prev => [...prev, faceGridRegions])
        setRedoStack([])
        setFaceGridRegions(prev => [...prev, newRegion])
        setSelectedId(newRegion.id)
      }
      setDraftFaceGrid(null)
      return
    }

    if (!draft) return
    const point = getImagePoint()
    const finalX = point?.x ?? draft.currentX
    const finalY = point?.y ?? draft.currentY
    const nextItem = buildDraftAnnotation(finalX, finalY)
    if (!nextItem) { setDraft(null); return }

    if ((nextItem.type === 'rect' || nextItem.type === 'ellipse') && (nextItem.width < 4 || nextItem.height < 4)) { setDraft(null); return }
    if (nextItem.type === 'arrow') { const [x1, y1, x2, y2] = nextItem.points; if (Math.hypot(x2 - x1, y2 - y1) < 4) { setDraft(null); return } }
    if (nextItem.type === 'pen' && nextItem.points.length < 6) { setDraft(null); return }

    const createdItem = { ...nextItem, id: createAnnotationId() } as AnnotationItem
    setUndoStack(prev => [...prev, annotations])
    setRedoStack([])
    const nextAnnotations = [...annotations, createdItem]
    setAnnotations(nextAnnotations)
    setSelectedId(createdItem.id)
    setDraft(null)
  }, [annotations, buildDraftAnnotation, draft, draftFaceGrid, faceGridRegions, getImagePoint, gridAngle, gridColor, gridOpacity, gridSize, tool])

  const handleDeleteSelected = useCallback(() => {
    if (!selectedId) return
    setUndoStack(prev => [...prev, annotations])
    setRedoStack([])
    
    // 检查是否是标注
    const isAnnotation = annotations.some(a => a.id === selectedId)
    if (isAnnotation) {
      setAnnotations(prev => prev.filter(item => item.id !== selectedId))
    } else {
      setFaceGridRegions(prev => prev.filter(r => r.id !== selectedId))
    }
    setSelectedId(null)
  }, [annotations, selectedId])

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return
    const previous = undoStack[undoStack.length - 1]
    if (!previous) return
    setRedoStack(prev => [...prev, annotations])
    setUndoStack(prev => prev.slice(0, -1))
    
    // 判断是标注还是人脸网格
    if (previous.length > 0 && previous[0] && 'type' in previous[0]) {
      setAnnotations(previous as AnnotationItem[])
    } else {
      setFaceGridRegions(previous as FaceGridRegion[])
    }
  }, [annotations, undoStack])

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return
    const next = redoStack[redoStack.length - 1]
    if (!next) return
    setUndoStack(prev => [...prev, annotations])
    setRedoStack(prev => prev.slice(0, -1))
    
    if (next.length > 0 && next[0] && 'type' in next[0]) {
      setAnnotations(next as AnnotationItem[])
    } else {
      setFaceGridRegions(next as FaceGridRegion[])
    }
  }, [annotations, redoStack])

  const handleClear = useCallback(() => {
    setUndoStack(prev => [...prev, annotations])
    setRedoStack([])
    setSelectedId(null)
    setAnnotations([])
    setFaceGridRegions([])
  }, [annotations])

  const handleSave = useCallback(() => {
    if (!image) {
      onClose()
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      onClose()
      return
    }

    ctx.drawImage(image, 0, 0)

    // 先绘制人脸网格
    for (const region of faceGridRegions) {
      drawFaceGridOnCanvas(ctx, region)
    }

    // 再绘制标注
    for (const item of annotations) {
      drawAnnotationOnCanvas(ctx, item)
    }

    let dataUrl: string
    try {
      dataUrl = canvas.toDataURL('image/png')
    } catch {
      console.error('[ImageEditorDialog] toDataURL 失败')
      onClose()
      return
    }

    onClose()
    onSave(dataUrl)
  }, [image, annotations, faceGridRegions, onSave, onClose])

  const handleCommitTextEditor = useCallback(() => {
    if (!textEditorState) return
    const value = textEditorState.value.trim()
    if (textEditorState.annotationId) {
      const nextAnnotations = annotations.map(item => {
        if (item.id !== textEditorState.annotationId || item.type !== 'text') return item
        if (!value) return null
        return { ...item, text: value, color, fontSize }
      }).filter((item): item is AnnotationItem => Boolean(item))
      setUndoStack(prev => [...prev, annotations])
      setRedoStack([])
      setAnnotations(nextAnnotations)
      setTextEditorState(null)
      return
    }
    if (!value) { setTextEditorState(null); return }
    const nextItem: AnnotationItem = { id: createAnnotationId(), type: 'text', x: textEditorState.x, y: textEditorState.y, text: value, color, fontSize }
    setUndoStack(prev => [...prev, annotations])
    setRedoStack([])
    setAnnotations([...annotations, nextItem])
    setSelectedId(nextItem.id)
    setTextEditorState(null)
  }, [annotations, color, fontSize, textEditorState])

  const bindShapeRef = useCallback((id: string, node: Konva.Node | null) => {
    if (node) shapeRefs.current.set(id, node)
    else shapeRefs.current.delete(id)
  }, [])

  const handleAnnotationDragEnd = useCallback((item: AnnotationItem, event: KonvaEventObject<DragEvent>) => {
    const node = event.target
    const nextX = node.x()
    const nextY = node.y()
    if (item.type === 'arrow' || item.type === 'pen') { node.x(0); node.y(0) }
    setUndoStack(prev => [...prev, annotations])
    setRedoStack([])
    setAnnotations(prev => prev.map(current => current.id === item.id ? updateAnnotationPosition(current, nextX, nextY) : current))
  }, [annotations])

  const handleAnnotationTransformEnd = useCallback((item: AnnotationItem, event: KonvaEventObject<Event>) => {
    const node = event.target
    const scaleX = node.scaleX()
    const scaleY = node.scaleY()
    const nextX = node.x()
    const nextY = node.y()
    node.scaleX(1)
    node.scaleY(1)
    if (item.type === 'arrow' || item.type === 'pen') { node.x(0); node.y(0) }
    setUndoStack(prev => [...prev, annotations])
    setRedoStack([])
    setAnnotations(prev => prev.map(current => current.id === item.id ? updateAnnotationTransform(current, nextX, nextY, scaleX, scaleY) : current))
  }, [annotations])

  useEffect(() => {
    const transformer = transformerRef.current
    if (!transformer) return
    if (!selectedId) { transformer.nodes([]); transformer.getLayer()?.batchDraw(); return }
    const selectedNode = shapeRefs.current.get(selectedId)
    if (!selectedNode) { transformer.nodes([]); transformer.getLayer()?.batchDraw(); return }
    transformer.nodes([selectedNode])
    transformer.getLayer()?.batchDraw()
  }, [selectedId])

  const renderAnnotationNode = useCallback((item: AnnotationItem, opacity = 1) => {
    const isSelected = selectedId === item.id
    const canInteract = tool === item.type
    const draggable = canInteract && isSelected

    const commonHandlers = {
      draggable,
      onClick: () => { if (canInteract) setSelectedId(item.id) },
      onTap: () => { if (canInteract) setSelectedId(item.id) },
      onDragEnd: (event: KonvaEventObject<DragEvent>) => handleAnnotationDragEnd(item, event),
      onTransformEnd: (event: KonvaEventObject<Event>) => handleAnnotationTransformEnd(item, event),
    }

    if (item.type === 'rect') {
      return <Rect key={item.id} ref={node => bindShapeRef(item.id, node)} x={item.x} y={item.y} width={item.width} height={item.height} stroke={item.stroke} strokeWidth={item.lineWidth} opacity={opacity} strokeScaleEnabled={false} {...commonHandlers} />
    }
    if (item.type === 'ellipse') {
      return <Ellipse key={item.id} ref={node => bindShapeRef(item.id, node)} x={item.x + item.width / 2} y={item.y + item.height / 2} radiusX={item.width / 2} radiusY={item.height / 2} stroke={item.stroke} strokeWidth={item.lineWidth} opacity={opacity} strokeScaleEnabled={false} {...commonHandlers} />
    }
    if (item.type === 'arrow') {
      return <Arrow key={item.id} ref={node => bindShapeRef(item.id, node)} points={item.points} stroke={item.stroke} fill={item.stroke} strokeWidth={item.lineWidth} pointerLength={Math.max(10, item.lineWidth * 4)} pointerWidth={Math.max(10, item.lineWidth * 3)} opacity={opacity} strokeScaleEnabled={false} {...commonHandlers} />
    }
    if (item.type === 'pen') {
      return <Line key={item.id} ref={node => bindShapeRef(item.id, node)} points={item.points} stroke={item.stroke} strokeWidth={item.lineWidth} lineJoin="round" lineCap="round" opacity={opacity} strokeScaleEnabled={false} {...commonHandlers} />
    }
    return <Text key={item.id} ref={node => bindShapeRef(item.id, node)} x={item.x} y={item.y} text={item.text} fill={item.color} fontStyle="bold" fontSize={item.fontSize} lineHeight={1.2} opacity={opacity} {...commonHandlers} onDblClick={() => setTextEditorState({ annotationId: item.id, x: item.x, y: item.y, value: item.text })} />
  }, [bindShapeRef, handleAnnotationDragEnd, handleAnnotationTransformEnd, selectedId, tool])

  const activeStyleKind = useMemo<'shape' | 'text' | 'faceGrid' | null>(() => {
    if (tool === 'text') return 'text'
    if (tool === 'faceGrid') return 'faceGrid'
    if (['rect', 'ellipse', 'arrow', 'pen'].includes(tool)) return 'shape'
    return null
  }, [tool])

  const transformerKeepRatio = useMemo(() => {
    const selected = annotations.find(a => a.id === selectedId)
    return selected?.type === 'text'
  }, [annotations, selectedId])

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl w-full max-h-[98vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>图片标注</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          {TOOL_BUTTONS.map(button => {
            const Icon = button.icon
            const active = tool === button.type
            return (
              <Button key={button.type} variant={active ? 'default' : 'outline'} size="sm" onClick={() => { setTool(button.type); if (button.type !== 'text') setTextEditorState(null) }}>
                <Icon className="h-4 w-4 mr-1" />
                {button.label}
              </Button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeStyleKind === 'shape' && (
            <>
              <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-8 w-10 cursor-pointer rounded-md border border-border bg-transparent p-1" />
              <input type="range" min={MIN_LINE_WIDTH_PERCENT} max={MAX_LINE_WIDTH_PERCENT} step={0.1} value={Number(lineWidthPercent.toFixed(1))} onChange={e => setLineWidthPercent(Number(e.target.value))} className="w-20" />
              <span className="text-xs text-muted-foreground">{lineWidthPercent.toFixed(1)}%</span>
            </>
          )}
          {activeStyleKind === 'text' && (
            <div className="flex items-center gap-2">
              <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-8 w-10 cursor-pointer rounded-md border border-border bg-transparent p-1" />
              <input type="number" min={MIN_TEXT_SIZE_PERCENT} max={MAX_TEXT_SIZE_PERCENT} step={0.5} value={Number(textSizePercent.toFixed(1))} onChange={e => setTextSizePercent(Number(e.target.value))} className="h-8 w-20 rounded-md border border-input bg-transparent px-2 text-sm" />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          )}
          {activeStyleKind === 'faceGrid' && (
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">密度</span>
                <input type="range" min={2} max={20} step={1} value={gridSize} onChange={e => setGridSize(Number(e.target.value))} className="w-16" />
                <span className="text-muted-foreground w-6">{gridSize}px</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">透明度</span>
                <input type="range" min={5} max={50} step={1} value={gridOpacity * 100} onChange={e => setGridOpacity(Number(e.target.value) / 100)} className="w-16" />
                <span className="text-muted-foreground w-8">{Math.round(gridOpacity * 100)}%</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">角度</span>
                <input type="range" min={0} max={90} step={5} value={gridAngle} onChange={e => setGridAngle(Number(e.target.value))} className="w-16" />
                <span className="text-muted-foreground w-6">{gridAngle}°</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">颜色</span>
                <input type="color" value={gridColor} onChange={e => setGridColor(e.target.value)} className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent p-0.5" />
              </div>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={handleUndo} disabled={undoStack.length === 0}>
            <Undo2 className="h-4 w-4 mr-1" />撤销
          </Button>
          <Button variant="outline" size="sm" onClick={handleRedo} disabled={redoStack.length === 0}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></svg>
            重做
          </Button>
          <Button variant="outline" size="sm" onClick={handleDeleteSelected} disabled={!selectedId}>
            <Trash2 className="h-4 w-4 mr-1" />删除
          </Button>
          <Button variant="outline" size="sm" onClick={handleClear} disabled={annotations.length === 0 && faceGridRegions.length === 0}>
            <Trash2 className="h-4 w-4 mr-1" />清空
          </Button>
        </div>

        <div ref={viewportRef} className="flex-1 min-h-[700px] flex items-center justify-center bg-muted rounded-lg overflow-hidden">
          <Stage
            ref={stageRef}
            width={stageWidth}
            height={stageHeight}
            onMouseDown={handlePointerDown}
            onTouchStart={handlePointerDown}
            onMouseMove={handlePointerMove}
            onTouchMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onTouchEnd={handlePointerUp}
            onMouseLeave={handlePointerUp}
            className={tool === 'text' ? 'cursor-text' : 'cursor-crosshair'}
          >
            <Layer>
              <Group ref={contentGroupRef} x={0} y={0} scaleX={scale} scaleY={scale}>
                {image && (
                  <KonvaImage image={image} x={0} y={0} width={image.naturalWidth} height={image.naturalHeight} name="annotation-background" />
                )}
                
                {/* 渲染人脸网格区域 */}
                {faceGridRegions.map(region => (
                  <Ellipse
                    key={region.id}
                    x={region.x + region.width / 2}
                    y={region.y + region.height / 2}
                    radiusX={region.width / 2}
                    radiusY={region.height / 2}
                    stroke="#a855f7"
                    strokeWidth={2}
                    strokeScaleEnabled={false}
                    onClick={() => tool === 'faceGrid' && setSelectedId(region.id)}
                    onTap={() => tool === 'faceGrid' && setSelectedId(region.id)}
                  />
                ))}
                
                {/* 渲染正在绘制的人脸网格 */}
                {draftFaceGrid && draftFaceGrid.width > 0 && draftFaceGrid.height > 0 ? (
                  <Ellipse
                    x={draftFaceGrid.x + draftFaceGrid.width / 2}
                    y={draftFaceGrid.y + draftFaceGrid.height / 2}
                    radiusX={draftFaceGrid.width / 2}
                    radiusY={draftFaceGrid.height / 2}
                    stroke="#a855f7"
                    strokeWidth={2}
                    dash={[5, 5]}
                    strokeScaleEnabled={false}
                  />
                ) : null}
                
                {annotations.map(item => renderAnnotationNode(item))}
                {draftAnnotation && renderAnnotationNode(draftAnnotation, 0.75)}
                <Transformer
                  ref={transformerRef}
                  boundBoxFunc={(oldBox, newBox) => { if (newBox.width < 5 || newBox.height < 5) return oldBox; return newBox }}
                  rotateEnabled={false}
                  borderStroke="#3b82f6"
                  anchorStroke="#3b82f6"
                  anchorFill="#ffffff"
                  anchorSize={8}
                  ignoreStroke
                  keepRatio={transformerKeepRatio}
                />
              </Group>
            </Layer>
          </Stage>
        </div>

        {textEditorState && (
          <div className="flex items-center gap-2">
            <textarea
              ref={textInputRef}
              value={textEditorState.value}
              onChange={e => setTextEditorState(prev => prev ? { ...prev, value: e.target.value } : null)}
              onKeyDown={e => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleCommitTextEditor() }
                if (e.key === 'Escape') { e.preventDefault(); setTextEditorState(null) }
              }}
              rows={2}
              placeholder="输入文本..."
              className="flex-1 h-16 rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-none"
              autoFocus
            />
            <Button size="sm" onClick={handleCommitTextEditor}>确认</Button>
            <Button size="sm" variant="outline" onClick={() => setTextEditorState(null)}>取消</Button>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {image && `原图: ${image.naturalWidth} × ${image.naturalHeight}`}
            {annotations.length > 0 && <span className="ml-3">标注: {annotations.length}</span>}
            {faceGridRegions.length > 0 && <span className="ml-3">网格: {faceGridRegions.length}</span>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>取消</Button>
            <Button onClick={handleSave}>保存</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
