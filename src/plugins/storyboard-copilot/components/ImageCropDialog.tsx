import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'

import { Check, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getImageUrl } from '@/utils/asset'
import { useToast } from '@/hooks/useToast'

interface ImageCropDialogProps {
  open: boolean
  imageUrl: string
  projectId?: string
  episodeId?: string
  onClose: () => void
  onSave: (croppedImageUrl: string) => void
}

const VIEWPORT_PADDING_PX = 32
const VIEWPORT_MIN_WIDTH_PX = 1000
const VIEWPORT_MIN_HEIGHT_PX = 700

function parsePresetRatio(value: string): number | null {
  if (!value.includes(':')) return null
  const parts = value.split(':').map(Number)
  const rawW = parts[0] ?? NaN
  const rawH = parts[1] ?? NaN
  if (!Number.isFinite(rawW) || !Number.isFinite(rawH) || rawW <= 0 || rawH <= 0) return null
  return rawW / rawH
}

function toImageSpaceCrop(
  crop: PixelCrop,
  renderedWidth: number,
  renderedHeight: number,
  naturalWidth: number,
  naturalHeight: number
) {
  const scaleX = naturalWidth / renderedWidth
  const scaleY = naturalHeight / renderedHeight
  return {
    cropX: Math.round(crop.x * scaleX),
    cropY: Math.round(crop.y * scaleY),
    cropWidth: Math.round(crop.width * scaleX),
    cropHeight: Math.round(crop.height * scaleY),
  }
}

function buildDefaultCrop(width: number, height: number, aspect: number | undefined): Crop {
  if (!aspect) return { unit: 'px', x: 0, y: 0, width, height }
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 88 }, aspect, width, height),
    width, height
  )
}

const RATIO_OPTIONS = [
  { label: '自由', value: 'free' },
  { label: '1:1', value: '1:1' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
]

export function ImageCropDialog({ 
  open, 
  imageUrl, 
  onClose, 
  onSave,
}: ImageCropDialogProps) {
  const { toast } = useToast()
  const imageRef = useRef<HTMLImageElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null)
  const [aspectMode, setAspectMode] = useState('free')
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 })
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })

  const displayUrl = useMemo(() => getImageUrl(imageUrl) || imageUrl, [imageUrl])

  useEffect(() => {
    if (!open) return
    setCrop(undefined)
    setCompletedCrop(null)
    setAspectMode('free')
    setNaturalSize({ width: 0, height: 0 })
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

  const renderedImageSize = useMemo(() => {
    if (naturalSize.width <= 0 || naturalSize.height <= 0) return null
    const availableWidth = Math.max(VIEWPORT_MIN_WIDTH_PX, viewportSize.width - VIEWPORT_PADDING_PX * 2)
    const availableHeight = Math.max(VIEWPORT_MIN_HEIGHT_PX, viewportSize.height - VIEWPORT_PADDING_PX * 2)
    const widthRatio = availableWidth / naturalSize.width
    const heightRatio = availableHeight / naturalSize.height
    const ratio = Math.min(widthRatio, heightRatio, 1.5)
    return {
      width: Math.max(1, Math.round(naturalSize.width * ratio)),
      height: Math.max(1, Math.round(naturalSize.height * ratio)),
    }
  }, [naturalSize, viewportSize])

  const resolvedAspect = useMemo(() => {
    if (aspectMode === 'free') return undefined
    return parsePresetRatio(aspectMode) ?? undefined
  }, [aspectMode])

  const handleImageLoad = useCallback(() => {
    const image = imageRef.current
    if (!image) return
    setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight })
  }, [])

  // 初始化默认裁剪区域
  useEffect(() => {
    if (!renderedImageSize) return
    const next = buildDefaultCrop(renderedImageSize.width, renderedImageSize.height, resolvedAspect)
    setCrop(next)
    if (next.unit === 'px') {
      setCompletedCrop({ unit: 'px', x: next.x, y: next.y, width: next.width, height: next.height })
    } else {
      setCompletedCrop({
        unit: 'px',
        x: Math.round((next.x / 100) * renderedImageSize.width),
        y: Math.round((next.y / 100) * renderedImageSize.height),
        width: Math.round((next.width / 100) * renderedImageSize.width),
        height: Math.round((next.height / 100) * renderedImageSize.height),
      })
    }
  }, [renderedImageSize, resolvedAspect])

  // 执行裁剪
  const performCrop = useCallback((pixelCrop: PixelCrop): string | null => {
    if (!renderedImageSize || naturalSize.width <= 0) return null

    const { cropX, cropY, cropWidth, cropHeight } = toImageSpaceCrop(
      pixelCrop,
      renderedImageSize.width,
      renderedImageSize.height,
      naturalSize.width,
      naturalSize.height
    )

    const image = imageRef.current
    if (!image) return null

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, cropWidth)
    canvas.height = Math.max(1, cropHeight)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(
      image,
      cropX, cropY, cropWidth, cropHeight,
      0, 0, canvas.width, canvas.height
    )

    try {
      return canvas.toDataURL('image/png')
    } catch {
      console.error('[ImageCropDialog] toDataURL 失败')
      return null
    }
  }, [renderedImageSize, naturalSize])

  // 裁剪保存
  const handleCrop = useCallback(() => {
    if (!completedCrop) {
      onClose()
      return
    }
    const result = performCrop(completedCrop)
    if (result) {
      onSave(result)
      toast({ title: '裁剪完成' })
    }
    onClose()
  }, [completedCrop, performCrop, onSave, onClose, toast])

  const handleReset = useCallback(() => {
    if (!renderedImageSize) return
    const next = buildDefaultCrop(renderedImageSize.width, renderedImageSize.height, resolvedAspect)
    setCrop(next)
  }, [renderedImageSize, resolvedAspect])

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl w-full max-h-[98vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>图片裁剪</DialogTitle>
        </DialogHeader>

        {/* 工具栏 */}
        <div className="flex flex-wrap items-center gap-2">
          {RATIO_OPTIONS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                aspectMode === item.value
                  ? 'border-primary bg-primary/15 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-muted'
              }`}
              onClick={() => setAspectMode(item.value)}
            >
              {item.label}
            </button>
          ))}
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-1" />
            重置
          </Button>
        </div>

        {/* 裁剪预览区 */}
        <div
          ref={viewportRef}
          className="flex-1 min-h-[600px] flex items-center justify-center bg-muted rounded-lg overflow-hidden"
        >
          {renderedImageSize && (
            <ReactCrop
              crop={crop}
              onChange={(nextCrop) => setCrop(nextCrop)}
              onComplete={(pixelCrop) => setCompletedCrop(pixelCrop)}
              aspect={resolvedAspect}
              minWidth={24}
              minHeight={24}
              keepSelection
              ruleOfThirds
            >
              <img
                ref={imageRef}
                src={displayUrl}
                alt="裁剪源图"
                crossOrigin="anonymous"
                className="block select-none object-contain"
                style={{
                  width: `${renderedImageSize.width}px`,
                  height: `${renderedImageSize.height}px`,
                  maxWidth: 'none',
                  maxHeight: 'none',
                }}
                onLoad={handleImageLoad}
              />
            </ReactCrop>
          )}
          {!renderedImageSize && (
            <img
              ref={imageRef}
              src={displayUrl}
              alt="裁剪源图"
              crossOrigin="anonymous"
              className="hidden"
              onLoad={handleImageLoad}
            />
          )}
        </div>

        {/* 底部 */}
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {naturalSize.width > 0 && `原图: ${naturalSize.width} × ${naturalSize.height}`}
            {completedCrop && renderedImageSize && (
              <span className="ml-3">
                裁剪: {Math.round(completedCrop.width * naturalSize.width / renderedImageSize.width)} × {Math.round(completedCrop.height * naturalSize.height / renderedImageSize.height)}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>取消</Button>
            <Button onClick={handleCrop} disabled={!completedCrop}>
              <Check className="h-4 w-4 mr-1" />
              确认裁剪
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
