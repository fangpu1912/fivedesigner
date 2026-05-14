import { useState, useCallback } from 'react'

import { ChevronLeft, ChevronRight, Star, Trash2, Check } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ImageCarouselProps {
  images: string[]
  currentIndex: number
  onIndexChange: (index: number) => void
  onSetMain?: (index: number) => void
  onDelete?: (index: number) => void
  mainIndex?: number
  showThumbnails?: boolean
  className?: string
}

export function ImageCarousel({
  images,
  currentIndex,
  onIndexChange,
  onSetMain,
  onDelete,
  mainIndex = 0,
  showThumbnails = true,
  className,
}: ImageCarouselProps) {
  const [isHovered, setIsHovered] = useState(false)

  const handlePrev = useCallback(() => {
    const newIndex = currentIndex === 0 ? images.length - 1 : currentIndex - 1
    onIndexChange(newIndex)
  }, [currentIndex, images.length, onIndexChange])

  const handleNext = useCallback(() => {
    const newIndex = currentIndex === images.length - 1 ? 0 : currentIndex + 1
    onIndexChange(newIndex)
  }, [currentIndex, images.length, onIndexChange])

  if (images.length === 0) {
    return (
      <div className={cn('flex items-center justify-center bg-muted/30 rounded-lg', className)}>
        <p className="text-muted-foreground">暂无图片</p>
      </div>
    )
  }

  if (images.length === 1) {
    return (
      <div
        className={cn(
          'relative flex items-center justify-center bg-muted/30 rounded-lg overflow-hidden',
          className
        )}
      >
        <img src={images[0]} alt="Preview" className="max-w-full max-h-full object-contain" />
        {mainIndex === 0 && (
          <div className="absolute top-2 left-2 bg-primary text-primary-foreground px-2 py-1 rounded text-xs flex items-center gap-1">
            <Star className="w-3 h-3" />
            主图
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn('flex flex-col gap-2', className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 主显示区 */}
      <div className="relative flex-1 flex items-center justify-center bg-muted/30 rounded-lg overflow-hidden min-h-0">
        <img
          src={images[currentIndex]}
          alt={`Preview ${currentIndex + 1}`}
          className="max-w-full max-h-full object-contain"
        />

        {/* 主图标记 */}
        {currentIndex === mainIndex && (
          <div className="absolute top-2 left-2 bg-primary text-primary-foreground px-2 py-1 rounded text-xs flex items-center gap-1">
            <Star className="w-3 h-3" />
            主图
          </div>
        )}

        {/* 图片计数 */}
        <div className="absolute top-2 right-2 bg-black/50 text-white px-2 py-1 rounded text-xs">
          {currentIndex + 1} / {images.length}
        </div>

        {/* 左右切换按钮 */}
        {isHovered && images.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white"
              onClick={handlePrev}
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white"
              onClick={handleNext}
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </>
        )}

        {/* 操作按钮 */}
        {isHovered && (
          <div className="absolute bottom-2 right-2 flex gap-1">
            {onSetMain && currentIndex !== mainIndex && (
              <Button
                variant="ghost"
                size="sm"
                className="bg-black/30 hover:bg-black/50 text-white text-xs"
                onClick={() => onSetMain(currentIndex)}
              >
                <Star className="w-3 h-3 mr-1" />
                设为主图
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="bg-black/30 hover:bg-black/50 text-white text-xs hover:text-red-400"
                onClick={e => {
                  e.stopPropagation()
                  onDelete(currentIndex)
                }}
              >
                <Trash2 className="w-3 h-3 mr-1" />
                删除
              </Button>
            )}
          </div>
        )}
      </div>

      {/* 缩略图列表 */}
      {showThumbnails && images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto p-1 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {images.map((img, idx) => (
            <button
              key={idx}
              onClick={() => onIndexChange(idx)}
              className={cn(
                'relative flex-shrink-0 w-16 h-16 rounded overflow-hidden border-2 transition-all',
                idx === currentIndex
                  ? 'border-primary ring-2 ring-primary/20'
                  : 'border-transparent hover:border-muted-foreground/30'
              )}
            >
              <img src={img} alt={`Thumbnail ${idx + 1}`} className="w-full h-full object-cover" />
              {idx === mainIndex && (
                <div className="absolute top-0.5 left-0.5 bg-primary text-primary-foreground rounded px-1 text-[8px]">
                  主
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
