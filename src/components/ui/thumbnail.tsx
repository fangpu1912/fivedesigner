import { useState, useEffect } from 'react'

import { cn } from '@/lib/utils'

import { ImagePreview } from './image-preview'

interface ThumbnailProps {
  src: string
  alt?: string
  className?: string
  showResolution?: boolean
  resolution?: { width: number; height: number }
}

export function Thumbnail({
  src,
  alt = '',
  className,
  showResolution = true,
  resolution: initialResolution,
}: ThumbnailProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [resolution, setResolution] = useState<{ width: number; height: number } | null>(
    initialResolution || null
  )
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (src && !initialResolution) {
      const img = new Image()
      img.onload = () => {
        setResolution({ width: img.naturalWidth, height: img.naturalHeight })
        setIsLoading(false)
      }
      img.onerror = () => {
        setIsLoading(false)
      }
      img.src = src
    } else {
      setIsLoading(false)
    }
  }, [src, initialResolution])

  return (
    <>
      <div
        className={cn(
          'relative group cursor-pointer overflow-hidden rounded-lg border bg-muted',
          className
        )}
        onClick={() => setIsPreviewOpen(true)}
      >
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
        />

        {/* 悬停遮罩 */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity text-sm font-medium">
            点击查看原图
          </span>
        </div>

        {/* 分辨率标签 */}
        {showResolution && resolution && (
          <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
            {resolution.width}×{resolution.height}
          </div>
        )}

        {/* 加载状态 */}
        {isLoading && (
          <div className="absolute inset-0 bg-muted flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        )}
      </div>

      <ImagePreview
        src={src}
        alt={alt}
        open={isPreviewOpen}
        onOpenChange={setIsPreviewOpen}
        resolution={resolution || undefined}
      />
    </>
  )
}
