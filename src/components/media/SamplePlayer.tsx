import { useRef, useState, useCallback, useEffect } from 'react'

import { convertFileSrc } from '@tauri-apps/api/core'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Maximize2,
  Minimize2,
  Image as ImageIcon,
  Film,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

// 获取文件URL
function getFileUrl(path?: string | null): string | null {
  if (!path) return null
  if (path.startsWith('http') || path.startsWith('data:')) return path
  return convertFileSrc(path)
}

interface SampleClip {
  id: string
  storyboard: {
    name: string
    description?: string
  }
  dubbings: Array<{
    text?: string
  }>
  duration: number
  videoUrl?: string
  audioUrl?: string
  imageUrl?: string
}

interface SamplePlayerProps {
  clip: SampleClip
  isPlaying: boolean
  onPlayChange: (playing: boolean) => void
  onEnded?: () => void
  className?: string
}

export function SamplePlayer({
  clip,
  isPlaying,
  onPlayChange,
  onEnded,
  className,
}: SamplePlayerProps) {
  const [currentTime, setCurrentTime] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showSubtitle, setShowSubtitle] = useState(true)

  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const endedTriggeredRef = useRef(false)
  const imageTimerRef = useRef<NodeJS.Timeout | null>(null)
  const imageStartTimeRef = useRef<number>(0)

  // 格式化时间显示
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }

  // 播放控制
  const togglePlay = useCallback(() => {
    onPlayChange(!isPlaying)
  }, [isPlaying, onPlayChange])

  // 时间更新处理
  const handleVideoTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime)
    }
  }, [])

  const handleAudioTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }, [])

  // 结束处理 - 使用 ref 防止重复触发
  const handleEnded = useCallback(() => {
    if (endedTriggeredRef.current) return
    endedTriggeredRef.current = true
    onEnded?.()
  }, [onEnded])

  const handleVideoEnded = useCallback(() => {
    // 视频结束就触发切换，不管音频
    // 这样可以确保视频完整播放
    handleEnded()
  }, [handleEnded])

  const handleAudioEnded = useCallback(() => {
    // 音频结束不做处理，让视频继续播放
    // 音频只是伴随音轨，不影响视频播放时长
  }, [])

  // 同步播放状态
  useEffect(() => {
    if (!clip) return

    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.play().catch(() => {})
      } else {
        videoRef.current.pause()
      }
    }

    if (audioRef.current && clip.audioUrl) {
      if (isPlaying) {
        audioRef.current.play().catch(() => {})
      } else {
        audioRef.current.pause()
      }
    }
  }, [isPlaying, clip])

  // 切换片段时重置时间和结束标记
  useEffect(() => {
    setCurrentTime(0)
    endedTriggeredRef.current = false
    imageStartTimeRef.current = 0

    // 清除图片定时器
    if (imageTimerRef.current) {
      clearTimeout(imageTimerRef.current)
      imageTimerRef.current = null
    }
  }, [clip.id])

  // 图片轮播定时器 - 当播放图片时，按照duration自动切换
  useEffect(() => {
    const isImage = !clip.videoUrl && clip.imageUrl
    const hasAudio = !!clip.audioUrl

    // 清除之前的定时器
    if (imageTimerRef.current) {
      clearTimeout(imageTimerRef.current)
      imageTimerRef.current = null
    }

    if (isImage && isPlaying && !hasAudio) {
      // 纯图片（无音频），使用定时器
      imageStartTimeRef.current = Date.now()

      // 设置定时器，在duration结束后触发
      imageTimerRef.current = setTimeout(() => {
        handleEnded()
      }, clip.duration * 1000)

      // 更新时间显示
      const updateTime = () => {
        if (!isPlaying || endedTriggeredRef.current) return
        const elapsed = (Date.now() - imageStartTimeRef.current) / 1000
        setCurrentTime(Math.min(elapsed, clip.duration))
        if (elapsed < clip.duration) {
          requestAnimationFrame(updateTime)
        }
      }
      requestAnimationFrame(updateTime)
    }

    return () => {
      if (imageTimerRef.current) {
        clearTimeout(imageTimerRef.current)
        imageTimerRef.current = null
      }
    }
  }, [clip.videoUrl, clip.imageUrl, clip.audioUrl, clip.duration, isPlaying, handleEnded])

  // 全屏切换
  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return

    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen()
        setIsFullscreen(true)
      } else {
        await document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch (error) {
      console.error('全屏切换失败:', error)
    }
  }, [])

  // 监听全屏变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  if (!clip) {
    return (
      <div className={cn('flex items-center justify-center bg-black', className)}>
        <div className="text-center text-white/50">
          <Film className="w-16 h-16 mx-auto mb-4" />
          <p>暂无分镜</p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-col bg-black relative overflow-hidden',
        isFullscreen ? 'h-screen w-screen fixed inset-0 z-50' : className
      )}
    >
      {/* 视频/图片显示区域 */}
      <div
        className={cn(
          'flex-1 flex items-center justify-center relative overflow-hidden',
          isFullscreen ? 'h-full' : 'min-h-0'
        )}
      >
        {/* 视频或图片 */}
        {clip.videoUrl ? (
          <video
            ref={videoRef}
            src={getFileUrl(clip.videoUrl) || ''}
            className={cn('max-w-full max-h-full', isFullscreen ? 'max-h-[80vh]' : 'max-h-[50vh]')}
            muted
            playsInline
            onTimeUpdate={handleVideoTimeUpdate}
            onEnded={handleVideoEnded}
          />
        ) : clip.imageUrl ? (
          <img
            src={getFileUrl(clip.imageUrl) || ''}
            alt={clip.storyboard.name}
            className={cn(
              'max-w-full max-h-full object-contain',
              isFullscreen ? 'max-h-[80vh]' : 'max-h-[50vh]'
            )}
          />
        ) : (
          <div className="text-center text-white/50">
            <ImageIcon className="w-16 h-16 mx-auto mb-4" />
            <p>无视频或图片</p>
          </div>
        )}

        {/* 音频元素 */}
        {clip.audioUrl && (
          <audio
            ref={audioRef}
            src={getFileUrl(clip.audioUrl) || ''}
            onTimeUpdate={handleAudioTimeUpdate}
            onEnded={handleAudioEnded}
          />
        )}

        {/* 分镜名称 */}
        <div className="absolute top-4 left-4 bg-black/60 rounded-lg px-3 py-1.5">
          <p className="text-white text-sm font-medium">{clip.storyboard.name}</p>
        </div>

        {/* 字幕显示 */}
        {showSubtitle && clip.dubbings.length > 0 && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-black/70 rounded-lg px-6 py-3 max-w-[80%]">
            <p className="text-white text-lg text-center leading-relaxed">
              {clip.dubbings[0]?.text || clip.storyboard.description || ''}
            </p>
          </div>
        )}

        {/* 播放控制栏 */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/80 rounded-lg px-4 py-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-white hover:text-white hover:bg-white/20"
            onClick={togglePlay}
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
          </Button>

          <Separator orientation="vertical" className="h-6 bg-white/30 mx-2" />

          <div className="text-white text-sm font-mono">
            {formatTime(currentTime)} / {formatTime(clip.duration)}
          </div>

          <Separator orientation="vertical" className="h-6 bg-white/30 mx-2" />

          {/* 字幕开关 */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white hover:text-white hover:bg-white/20"
            onClick={() => setShowSubtitle(!showSubtitle)}
            title={showSubtitle ? '隐藏字幕' : '显示字幕'}
          >
            {showSubtitle ? (
              <span className="text-xs">CC</span>
            ) : (
              <span className="text-xs text-white/50">CC</span>
            )}
          </Button>

          {/* 全屏按钮 */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white hover:text-white hover:bg-white/20"
            onClick={toggleFullscreen}
            title={isFullscreen ? '退出全屏' : '全屏'}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
