import { useState, useRef } from 'react'

import { Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface ClickableVideoProps {
  src?: string | null
  poster?: string
  alt?: string
  className?: string
  aspectRatio?: 'video' | 'square' | 'portrait'
  showControls?: boolean
}

export function ClickableVideo({
  src,
  poster,
  alt = '视频',
  className,
  aspectRatio = 'video',
  showControls = true,
}: ClickableVideoProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(true)
  const videoRef = useRef<HTMLVideoElement>(null)

  if (!src) {
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
        <span className="text-muted-foreground text-sm">暂无视频</span>
      </div>
    )
  }

  const handlePlayPause = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (videoRef.current) {
      try {
        if (isPlaying) {
          videoRef.current.pause()
          setIsPlaying(false)
        } else {
          await videoRef.current.play()
          setIsPlaying(true)
        }
      } catch (error) {
        console.error('Video play/pause error:', error)
        setIsPlaying(false)
      }
    }
  }

  const handleMuteToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (videoRef.current) {
      videoRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }

  const handleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen()
      }
    }
  }

  return (
    <>
      {/* 缩略图/预览区域 */}
      <div
        className={cn(
          'relative overflow-hidden rounded-lg cursor-pointer group bg-black',
          aspectRatio === 'video' && 'aspect-video',
          aspectRatio === 'square' && 'aspect-square',
          aspectRatio === 'portrait' && 'aspect-[3/4]',
          className
        )}
        onClick={() => setIsPreviewOpen(true)}
      >
        <video
          src={src}
          poster={poster}
          className="w-full h-full object-cover"
          muted
          loop
          preload="metadata"
        />

        {/* 播放按钮遮罩 */}
        <div className="absolute inset-0 bg-black/30 group-hover:bg-black/50 transition-colors flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center group-hover:scale-110 transition-transform">
            <Play className="w-6 h-6 text-black ml-1" />
          </div>
        </div>

        {/* 视频时长指示器（如果有） */}
        <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
          点击播放
        </div>
      </div>

      {/* 全屏预览对话框 */}
      <Dialog
        open={isPreviewOpen}
        onOpenChange={open => {
          setIsPreviewOpen(open)
          if (!open && videoRef.current) {
            videoRef.current.pause()
            setIsPlaying(false)
          }
        }}
      >
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 overflow-hidden bg-black border-none">
          <DialogTitle className="sr-only">{alt}</DialogTitle>

          <div className="relative flex items-center justify-center bg-black">
            <video
              ref={videoRef}
              src={src}
              poster={poster}
              className="max-w-full max-h-[80vh]"
              autoPlay
              muted={isMuted}
              loop
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />

            {/* 自定义控制栏 */}
            {showControls && (
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                <div className="flex items-center justify-center gap-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20"
                    onClick={handlePlayPause}
                  >
                    {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20"
                    onClick={handleMuteToggle}
                  >
                    {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20"
                    onClick={handleFullscreen}
                  >
                    <Maximize className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
