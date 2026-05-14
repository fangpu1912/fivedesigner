import React, { useRef, useState, useEffect } from 'react'

import { convertFileSrc } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { readFile, writeFile } from '@tauri-apps/plugin-fs'
import { Download, Loader2, Maximize2, Minimize2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'

interface VideoPlayerProps {
  src: string
  poster?: string
  autoPlay?: boolean
  loop?: boolean
  muted?: boolean
  controls?: boolean
  onEnded?: () => void
  className?: string
  objectFit?: 'contain' | 'cover'
}

export function VideoPlayer({
  src,
  poster,
  autoPlay = false,
  loop = false,
  muted = false,
  controls = true,
  onEnded,
  className,
  objectFit: _objectFit = 'cover',
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [videoSrc, setVideoSrc] = useState<string>(src)
  const [isDownloading, setIsDownloading] = useState(false)
  const [showButton, setShowButton] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (!src) return

    if (src.startsWith('http') || src.startsWith('data:') || src.startsWith('blob:')) {
      setVideoSrc(src)
    } else {
      const url = convertFileSrc(src)
      setVideoSrc(url)
    }
  }, [src])

  // 监听全屏变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleFullscreen = async () => {
    if (!containerRef.current) return

    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch (error) {
      console.error('全屏切换失败:', error)
    }
  }

  const handleDownload = async () => {
    if (!src || isDownloading) return

    setIsDownloading(true)
    try {
      const savePath = await save({
        defaultPath: `video_${Date.now()}.mp4`,
        filters: [
          { name: 'MP4 Video', extensions: ['mp4'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      })

      if (!savePath) return

      if (src.startsWith('http') || src.startsWith('data:') || src.startsWith('blob:')) {
        const response = await fetch(src)
        if (!response.ok) throw new Error(`下载失败: ${response.status}`)
        const blob = await response.blob()
        const arrayBuffer = await blob.arrayBuffer()
        const uint8Array = new Uint8Array(arrayBuffer)
        await writeFile(savePath, uint8Array)
      } else {
        const originalPath = src.replace(/^file:\/\//, '')
        const fileData = await readFile(originalPath)
        await writeFile(savePath, fileData)
      }

      toast({ title: '下载成功', description: '视频已保存到指定位置' })
    } catch (error) {
      console.error('下载失败:', error)
      toast({ title: '下载失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' })
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative overflow-hidden rounded-lg bg-black flex items-center justify-center',
        isFullscreen ? 'w-screen h-screen' : 'w-full h-full',
        className
      )}
      onMouseEnter={() => setShowButton(true)}
      onMouseLeave={() => setShowButton(false)}
    >
      <video
        ref={videoRef}
        src={videoSrc}
        poster={poster}
        autoPlay={autoPlay}
        loop={loop}
        muted={muted}
        controls={controls}
        playsInline
        className={cn(
          'max-w-full max-h-full object-contain'
        )}
        onEnded={onEnded}
      />

      {/* 操作按钮组 */}
      <div
        className={cn(
          'absolute top-3 right-3 flex gap-2 transition-all duration-200',
          showButton || isFullscreen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
        )}
        style={{ zIndex: 50 }}
      >
        <Button
          variant="secondary"
          size="icon"
          onClick={toggleFullscreen}
          className="shadow-lg hover:scale-110"
          title={isFullscreen ? '退出全屏' : '全屏'}
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={handleDownload}
          disabled={isDownloading}
          className="shadow-lg hover:scale-110"
          title="下载视频"
        >
          {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}
