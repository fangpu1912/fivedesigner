import { useState } from 'react'

import { ZoomIn, ImageIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

import { ImagePreviewDialog } from './ImagePreviewDialog'

interface ClickableImageProps {
  src?: string | null
  alt?: string
  title?: string
  className?: string
  aspectRatio?: 'video' | 'square' | 'portrait' | 'auto'
  fallback?: React.ReactNode
  showHoverEffect?: boolean
  // 图片列表（用于轮播浏览）
  images?: string[]
  currentIndex?: number
  onIndexChange?: (index: number) => void
}

export function ClickableImage({
  src,
  alt = '图片',
  title,
  className,
  aspectRatio = 'video',
  fallback,
  showHoverEffect = true,
  images = [],
  currentIndex = 0,
  onIndexChange,
}: ClickableImageProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [localIndex, setLocalIndex] = useState(currentIndex)

  // 如果没有传入 images，使用 src 作为单张图片
  const imageList = images.length > 0 ? images : src ? [src] : []
  const hasMultipleImages = imageList.length > 1

  const handleIndexChange = (index: number) => {
    setLocalIndex(index)
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
        {fallback || <ImageIcon className="w-8 h-8 text-muted-foreground/50" />}
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
        {/* 悬停遮罩 */}
        {showHoverEffect && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
            <ZoomIn className="w-6 h-6 text-white" />
          </div>
        )}
      </div>

      <ImagePreviewDialog
        src={src || images[0] || ''}
        alt={alt}
        title={title || alt}
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        images={imageList}
        currentIndex={localIndex}
        onIndexChange={handleIndexChange}
      />
    </>
  )
}
