import { useEffect, useCallback, useState, useRef } from 'react'

import { save } from '@tauri-apps/plugin-dialog'
import { readFile, writeFile } from '@tauri-apps/plugin-fs'
import {
  X,
  ZoomIn,
  Download,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  RotateCcw,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { getAssetUrl } from '@/utils/asset'

interface ImagePreviewDialogProps {
  src: string
  alt?: string
  isOpen: boolean
  onClose: () => void
  title?: string
  images?: string[]
  currentIndex?: number
  onIndexChange?: (index: number) => void
  autoPlay?: boolean
  autoPlayInterval?: number
}

export function ImagePreviewDialog({
  src,
  alt = '预览图片',
  isOpen,
  onClose,
  title,
  images = [],
  currentIndex = 0,
  onIndexChange,
  autoPlay = false,
  autoPlayInterval = 3000,
}: ImagePreviewDialogProps) {
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const autoPlayRef = useRef<NodeJS.Timeout | null>(null)

  // 转换所有图片路径为可显示的 URL
  const imageList = (images.length > 0 ? images : [src]).map(img => getAssetUrl(img) || img)
  const currentIdx = currentIndex ?? 0
  const currentSrc = imageList[currentIdx] || imageList[0] || src
  const hasMultipleImages = imageList.length > 1

  const currentIdxRef = useRef(currentIdx)

  useEffect(() => {
    currentIdxRef.current = currentIdx
  }, [currentIdx])

  useEffect(() => {
    if (isPlaying && hasMultipleImages && onIndexChange) {
      autoPlayRef.current = setInterval(() => {
        const newIndex =
          currentIdxRef.current < imageList.length - 1 ? currentIdxRef.current + 1 : 0
        onIndexChange(newIndex)
      }, autoPlayInterval)
    }
    return () => {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current)
        autoPlayRef.current = null
      }
    }
  }, [isPlaying, hasMultipleImages, imageList.length, autoPlayInterval, onIndexChange])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowLeft' && hasMultipleImages && onIndexChange) {
        e.preventDefault()
        const newIndex = currentIdx > 0 ? currentIdx - 1 : imageList.length - 1
        onIndexChange(newIndex)
      } else if (e.key === 'ArrowRight' && hasMultipleImages && onIndexChange) {
        e.preventDefault()
        const newIndex = currentIdx < imageList.length - 1 ? currentIdx + 1 : 0
        onIndexChange(newIndex)
      } else if (e.key === ' ' && hasMultipleImages) {
        e.preventDefault()
        setIsPlaying(prev => !prev)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose, hasMultipleImages, onIndexChange, currentIdx, imageList.length])

  useEffect(() => {
    if (isOpen && autoPlay) {
      setIsPlaying(true)
    }
    return () => {
      setIsPlaying(false)
    }
  }, [isOpen, autoPlay])

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setImageSize({
      width: img.naturalWidth,
      height: img.naturalHeight,
    })
  }

  const handleDownload = async () => {
    try {
      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const defaultName = `${title || 'image'}_${timestamp}.png`

      const savePath = await save({
        defaultPath: defaultName,
        filters: [
          { name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
          { name: '所有文件', extensions: ['*'] },
        ],
        title: '保存图片',
      })

      if (!savePath) return

      const isLocalFile = currentSrc.startsWith('file://') || currentSrc.startsWith('asset://')

      if (isLocalFile) {
        let filePath = currentSrc
        if (filePath.startsWith('file://')) {
          filePath = decodeURIComponent(filePath.slice(7))
        } else if (filePath.startsWith('asset://')) {
          filePath = decodeURIComponent(filePath.slice(8))
        }

        const fileData = await readFile(filePath)
        await writeFile(savePath, fileData)
      } else {
        const response = await fetch(currentSrc)
        const blob = await response.blob()
        const arrayBuffer = await blob.arrayBuffer()
        await writeFile(savePath, new Uint8Array(arrayBuffer))
      }
    } catch (error) {
      console.error('下载失败:', error)
    }
  }

  const handlePrev = () => {
    if (!hasMultipleImages || !onIndexChange) return
    const newIndex = currentIdx > 0 ? currentIdx - 1 : imageList.length - 1
    onIndexChange(newIndex)
  }

  const handleNext = () => {
    if (!hasMultipleImages || !onIndexChange) return
    const newIndex = currentIdx < imageList.length - 1 ? currentIdx + 1 : 0
    onIndexChange(newIndex)
  }

  const handleThumbnailClick = (index: number) => {
    if (onIndexChange) {
      onIndexChange(index)
    }
  }

  if (!currentSrc || !isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="!fixed !inset-4 !w-auto !h-auto !max-w-none !max-h-none !translate-x-0 !translate-y-0 !left-0 !top-0 !right-0 !bottom-0 p-0 overflow-hidden bg-black/95 border-none rounded-lg">
        <DialogTitle className="sr-only">{title || alt}</DialogTitle>

        <ImageViewer
          src={currentSrc}
          alt={alt}
          title={title}
          onImageLoad={handleImageLoad}
          hasMultipleImages={hasMultipleImages}
          currentIdx={currentIdx}
          imageListLength={imageList.length}
          isPlaying={isPlaying}
          onTogglePlay={() => setIsPlaying(!isPlaying)}
          onDownload={handleDownload}
          onClose={onClose}
          onPrev={handlePrev}
          onNext={handleNext}
        />

        {/* 底部缩略图导航条 */}
        {hasMultipleImages && (
          <div className="absolute bottom-10 left-0 right-0 px-4 h-20 z-50">
            <div
              className="flex items-center justify-center gap-2 overflow-x-auto py-2 h-full scrollbar-hide"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {imageList.map((img, index) => (
                <button
                  key={index}
                  onClick={() => handleThumbnailClick(index)}
                  className={cn(
                    'flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all',
                    index === currentIdx
                      ? 'border-primary ring-2 ring-primary/50'
                      : 'border-transparent opacity-60 hover:opacity-100'
                  )}
                >
                  <img
                    src={img}
                    alt={`缩略图 ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 底部信息 */}
        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent h-10 flex items-center justify-center z-50">
          <div className="flex items-center justify-center gap-4 text-white/60 text-xs">
            {imageSize && (
              <span className="flex items-center gap-1">
                <span className="font-medium">原始分辨率:</span>
                <span className="text-white">
                  {imageSize.width} × {imageSize.height}
                </span>
                <span className="text-white/40">
                  ({((imageSize.width * imageSize.height) / 1000000).toFixed(2)} MP)
                </span>
              </span>
            )}
            <span className="text-white/30">|</span>
            <span>按 ESC 键关闭预览</span>
            {hasMultipleImages && (
              <>
                <span className="text-white/30">|</span>
                <span>按 ← → 键切换图片</span>
                <span className="text-white/30">|</span>
                <span>按 空格 键播放/暂停</span>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============================================
// 内部图片查看器组件（带缩放和拖拽）
// ============================================

interface ImageViewerProps {
  src: string
  alt: string
  title?: string
  onImageLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void
  hasMultipleImages: boolean
  currentIdx: number
  imageListLength: number
  isPlaying: boolean
  onTogglePlay: () => void
  onDownload: () => void
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}

function ImageViewer({
  src,
  alt,
  title,
  onImageLoad,
  hasMultipleImages,
  currentIdx,
  imageListLength,
  isPlaying,
  onTogglePlay,
  onDownload,
  onClose,
  onPrev,
  onNext,
}: ImageViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const scaleDisplayRef = useRef<HTMLDivElement>(null)

  const [viewerOpacity, setViewerOpacity] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  const cssScaleRef = useRef(1)
  const imageScaleRef = useRef(1)
  const imagePositionRef = useRef({ x: 0, y: 0 })
  const targetScaleRef = useRef(1)
  const targetPositionRef = useRef({ x: 0, y: 0 })
  const animationFrameRef = useRef<number | null>(null)
  const dragStartRef = useRef({ x: 0, y: 0 })

  const updateImageTransform = useCallback(() => {
    const img = imageRef.current
    if (!img) return
    const scale = imageScaleRef.current
    const pos = imagePositionRef.current
    img.style.transform = `scale(${scale}) translate(${pos.x / scale}px, ${pos.y / scale}px)`
    if (scaleDisplayRef.current) {
      const totalScale = cssScaleRef.current * scale
      scaleDisplayRef.current.innerText = `${Math.round(totalScale * 100)}%`
    }
  }, [])

  const resetView = useCallback(() => {
    imageScaleRef.current = 1
    imagePositionRef.current = { x: 0, y: 0 }
    targetScaleRef.current = 1
    targetPositionRef.current = { x: 0, y: 0 }
    updateImageTransform()
  }, [updateImageTransform])

  const isPointOnImageContent = useCallback((clientX: number, clientY: number): boolean => {
    const img = imageRef.current
    if (!img || !img.naturalWidth || !img.naturalHeight) return false
    const rect = img.getBoundingClientRect()
    const imgRatio = img.naturalWidth / img.naturalHeight
    const containerRatio = rect.width / rect.height

    let contentWidth: number
    let contentHeight: number
    let offsetX: number
    let offsetY: number
    if (imgRatio > containerRatio) {
      contentWidth = rect.width
      contentHeight = rect.width / imgRatio
      offsetX = 0
      offsetY = (rect.height - contentHeight) / 2
    } else {
      contentHeight = rect.height
      contentWidth = rect.height * imgRatio
      offsetY = 0
      offsetX = (rect.width - contentWidth) / 2
    }

    const clickX = clientX - rect.left
    const clickY = clientY - rect.top
    return (
      clickX >= offsetX &&
      clickX <= offsetX + contentWidth &&
      clickY >= offsetY &&
      clickY <= offsetY + contentHeight
    )
  }, [])

  // 初始化淡入动画
  useEffect(() => {
    setViewerOpacity(0)
    requestAnimationFrame(() => {
      setViewerOpacity(1)
    })
  }, [src])

  // 滚轮缩放
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const isMacOs =
      typeof navigator !== 'undefined' &&
      typeof navigator.platform === 'string' &&
      /mac/i.test(navigator.platform)

    const wheelDelta = (event: WheelEvent): number => {
      const factor = event.ctrlKey && isMacOs ? 10 : 1
      const deltaModeFactor = event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002
      return -event.deltaY * deltaModeFactor * factor
    }

    const handleWheel = (e: WheelEvent) => {
      if (!isPointOnImageContent(e.clientX, e.clientY)) return
      e.preventDefault()

      if (!animationFrameRef.current) {
        targetScaleRef.current = imageScaleRef.current
        targetPositionRef.current = imagePositionRef.current
      }

      const currentScale = targetScaleRef.current
      const currentPos = targetPositionRef.current
      const pinchDelta = wheelDelta(e)
      let newScale = currentScale * Math.pow(2, pinchDelta)
      newScale = Math.max(0.1, Math.min(10, newScale))

      const rect = container.getBoundingClientRect()
      const centerX = rect.width / 2
      const centerY = rect.height / 2
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      const mouseFromCenter = { x: mouseX - centerX, y: mouseY - centerY }
      const k = newScale / currentScale
      const newPos = {
        x: mouseFromCenter.x * (1 - k) + currentPos.x * k,
        y: mouseFromCenter.y * (1 - k) + currentPos.y * k,
      }

      targetScaleRef.current = newScale
      targetPositionRef.current = newPos

      if (!animationFrameRef.current) {
        const loop = () => {
          const targetScale = targetScaleRef.current
          const targetPos = targetPositionRef.current
          const currentScale = imageScaleRef.current
          const currentPos = imagePositionRef.current
          const factor = 0.3
          const nextScale = currentScale + (targetScale - currentScale) * factor
          const nextPos = {
            x: currentPos.x + (targetPos.x - currentPos.x) * factor,
            y: currentPos.y + (targetPos.y - currentPos.y) * factor,
          }

          imageScaleRef.current = nextScale
          imagePositionRef.current = nextPos
          updateImageTransform()

          if (
            Math.abs(nextScale - targetScale) < 0.001 &&
            Math.abs(nextPos.x - targetPos.x) < 0.1 &&
            Math.abs(nextPos.y - targetPos.y) < 0.1
          ) {
            imageScaleRef.current = targetScale
            imagePositionRef.current = targetPos
            updateImageTransform()
            animationFrameRef.current = null
          } else {
            animationFrameRef.current = requestAnimationFrame(loop)
          }
        }
        animationFrameRef.current = requestAnimationFrame(loop)
      }
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      container.removeEventListener('wheel', handleWheel)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [isPointOnImageContent, updateImageTransform])

  // 鼠标按下开始拖拽
  const handleImageMouseDown = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    if (e.button !== 0) return
    if (!isPointOnImageContent(e.clientX, e.clientY)) return
    e.preventDefault()
    setIsDragging(true)
    dragStartRef.current = {
      x: e.clientX - imagePositionRef.current.x,
      y: e.clientY - imagePositionRef.current.y,
    }
  }, [isPointOnImageContent])

  // 鼠标移动拖拽
  const handleContainerMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return
    const newPos = {
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    }
    imagePositionRef.current = newPos
    targetPositionRef.current = newPos
    updateImageTransform()
  }, [isDragging, updateImageTransform])

  // 鼠标释放结束拖拽
  const handleContainerMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // 鼠标移动时更新光标
  const handleImageMouseMove = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    const isOnContent = isPointOnImageContent(e.clientX, e.clientY)
    e.currentTarget.style.cursor = isOnContent ? (isDragging ? 'grabbing' : 'default') : 'default'
  }, [isDragging, isPointOnImageContent])

  // 图片加载完成
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    onImageLoad(e)
    const img = e.currentTarget
    if (!img.naturalWidth || !img.naturalHeight || !img.offsetWidth || !img.offsetHeight) return

    const naturalRatio = img.naturalWidth / img.naturalHeight
    const layoutRatio = img.offsetWidth / img.offsetHeight

    let actualDisplayWidth: number
    if (naturalRatio > layoutRatio) {
      actualDisplayWidth = img.offsetWidth
    } else {
      actualDisplayWidth = img.offsetHeight * naturalRatio
    }

    cssScaleRef.current = actualDisplayWidth / img.naturalWidth
    imageScaleRef.current = 1
    targetScaleRef.current = 1
    imagePositionRef.current = { x: 0, y: 0 }
    targetPositionRef.current = { x: 0, y: 0 }
    updateImageTransform()
  }, [onImageLoad, updateImageTransform])

  const viewerControlClass =
    'inline-flex h-10 items-center justify-center rounded-full border border-white/20 bg-black/60 px-4 text-sm text-white backdrop-blur-xl'

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      style={{ overscrollBehavior: 'contain' }}
      onMouseMove={handleContainerMouseMove}
      onMouseUp={handleContainerMouseUp}
      onMouseLeave={handleContainerMouseUp}
    >
      {/* 顶部工具栏 */}
      <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <div className="text-white text-sm truncate max-w-[50%]">
          {title || alt}
          {hasMultipleImages && (
            <span className="ml-2 text-white/60">
              ({currentIdx + 1} / {imageListLength})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasMultipleImages && (
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={e => {
                e.stopPropagation()
                onTogglePlay()
              }}
              title={isPlaying ? '暂停 (空格)' : '播放 (空格)'}
            >
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </Button>
          )}
          <div className={viewerControlClass}>
            <ZoomIn className="h-4 w-4 mr-2" />
            <div ref={scaleDisplayRef} className="min-w-[44px] text-center">100%</div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={e => {
              e.stopPropagation()
              resetView()
            }}
            title="重置视图"
          >
            <RotateCcw className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={e => {
              e.stopPropagation()
              onDownload()
            }}
            title="下载图片"
          >
            <Download className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={e => {
              e.stopPropagation()
              onClose()
            }}
            title="关闭"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* 图片 */}
      <div className="relative">
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          className="select-none transition-opacity duration-300"
          style={{
            opacity: viewerOpacity,
            transformOrigin: 'center',
            width: '95vw',
            height: '95vh',
            objectFit: 'contain',
          }}
          onLoad={handleImageLoad}
          onMouseDown={handleImageMouseDown}
          onMouseMove={handleImageMouseMove}
          onClick={(e) => {
            if (!isPointOnImageContent(e.clientX, e.clientY)) {
              onClose()
            } else {
              e.stopPropagation()
            }
          }}
          draggable={false}
        />
      </div>

      {/* 左右箭头 */}
      {hasMultipleImages && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-4 top-1/2 -translate-y-1/2 z-40 text-white hover:bg-white/20 h-12 w-12 rounded-full bg-black/40"
            onClick={onPrev}
            title="上一张 (←)"
          >
            <ChevronLeft className="h-8 w-8" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-1/2 -translate-y-1/2 z-40 text-white hover:bg-white/20 h-12 w-12 rounded-full bg-black/40"
            onClick={onNext}
            title="下一张 (→)"
          >
            <ChevronRight className="h-8 w-8" />
          </Button>
        </>
      )}


    </div>
  )
}

// ============================================
// 可点击缩略图组件
// ============================================

interface ClickableThumbnailProps {
  src?: string | null
  alt?: string
  title?: string
  className?: string
  aspectRatio?: 'video' | 'square' | 'portrait'
  fallback?: React.ReactNode
  images?: string[]
  initialIndex?: number
  onIndexChange?: (index: number) => void
  autoPlay?: boolean
  autoPlayInterval?: number
}

export function ClickableThumbnail({
  src,
  alt = '缩略图',
  title,
  className,
  aspectRatio = 'video',
  fallback,
  images = [],
  initialIndex = 0,
  onIndexChange,
  autoPlay = false,
  autoPlayInterval = 3000,
}: ClickableThumbnailProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(initialIndex)

  const imageList = images.length > 0 ? images : src ? [src] : []

  const handleIndexChange = (index: number) => {
    setCurrentIndex(index)
    onIndexChange?.(index)
  }

  if (!src && images.length === 0) {
    return (
      <div
        className={cn(
          'relative overflow-hidden rounded-lg bg-muted flex items-center justify-center',
          aspectRatio === 'video' && 'aspect-video',
          aspectRatio === 'square' && 'aspect-square',
          aspectRatio === 'portrait' && 'aspect-[3/4]',
          className
        )}
      >
        {fallback || <span className="text-muted-foreground text-sm">暂无图片</span>}
      </div>
    )
  }

  return (
    <>
      <div
        className={cn(
          'relative overflow-hidden rounded-lg cursor-pointer group',
          aspectRatio === 'video' && 'aspect-video',
          aspectRatio === 'square' && 'aspect-square',
          aspectRatio === 'portrait' && 'aspect-[3/4]',
          className
        )}
        onClick={() => setIsPreviewOpen(true)}
      >
        <img
          src={src || images[0]}
          alt={alt}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <ZoomIn className="w-8 h-8 text-white" />
        </div>
        {imageList.length > 1 && (
          <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
            {imageList.length} 张
          </div>
        )}
      </div>

      <ImagePreviewDialog
        src={src || images[0] || ''}
        alt={alt}
        title={title}
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        images={imageList}
        currentIndex={currentIndex}
        onIndexChange={handleIndexChange}
        autoPlay={autoPlay}
        autoPlayInterval={autoPlayInterval}
      />
    </>
  )
}
