import { useRef, useState, useCallback, useEffect } from 'react'

import { convertFileSrc } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { readFile, writeFile } from '@tauri-apps/plugin-fs'
import { Play, Pause, Volume2, Download, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/useToast'

interface AudioPlayerProps {
  src: string
  autoPlay?: boolean
  onEnded?: () => void
  onTimeUpdate?: (currentTime: number, duration: number) => void
}

export function AudioPlayer({ src, autoPlay = false, onEnded, onTimeUpdate }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(autoPlay)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [audioSrc, setAudioSrc] = useState<string>(src)
  const [isDownloading, setIsDownloading] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    const loadAudio = () => {
      if (!src) return

      // 如果已经是 http、data: 或 asset:// 协议的 URL，直接使用
      if (src.startsWith('http') || src.startsWith('data:') || src.startsWith('asset://')) {
        setAudioSrc(src)
      } else if (src.startsWith('blob:')) {
        // Blob URL 直接使用
        setAudioSrc(src)
      } else {
        // 本地文件路径，需要转换
        try {
          const url = convertFileSrc(src)
          setAudioSrc(url)
        } catch (error) {
          console.error('转换音频路径失败:', error, src)
          // 如果转换失败，尝试直接使用
          setAudioSrc(src)
        }
      }
    }

    loadAudio()
  }, [src])

  const togglePlay = useCallback(async () => {
    if (!audioRef.current) return

    try {
      if (isPlaying) {
        audioRef.current.pause()
        setIsPlaying(false)
      } else {
        await audioRef.current.play()
        setIsPlaying(true)
      }
    } catch (error) {
      console.error('Audio play/pause error:', error)
      setIsPlaying(false)
    }
  }, [isPlaying])

  const handleTimeUpdate = useCallback(() => {
    if (!audioRef.current) return
    const time = audioRef.current.currentTime
    setCurrentTime(time)
    onTimeUpdate?.(time, duration)
  }, [duration, onTimeUpdate])

  const handleLoadedMetadata = useCallback(() => {
    if (!audioRef.current) return
    setDuration(audioRef.current.duration)
    setIsLoading(false)
  }, [])

  const handleError = useCallback((e: React.SyntheticEvent<HTMLAudioElement>) => {
    console.error('[AudioPlayer] Audio error:', e)
    const audio = e.currentTarget
    console.error(
      '[AudioPlayer] Audio error code:',
      audio.error?.code,
      'message:',
      audio.error?.message
    )
    setIsLoading(false)
  }, [])

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!audioRef.current) return
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const percentage = x / rect.width
      const time = percentage * duration
      audioRef.current.currentTime = time
      setCurrentTime(time)
    },
    [duration]
  )

  const handleEnded = useCallback(() => {
    setIsPlaying(false)
    onEnded?.()
  }, [onEnded])

  const handleDownload = async () => {
    if (!src || isDownloading) return

    setIsDownloading(true)
    try {
      // 打开保存对话框
      const savePath = await save({
        defaultPath: `audio_${Date.now()}.wav`,
        filters: [
          { name: 'WAV Audio', extensions: ['wav'] },
          { name: 'MP3 Audio', extensions: ['mp3'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      })

      if (!savePath) return

      let fileData: Uint8Array

      // 判断是 URL 还是本地路径
      if (src.startsWith('http') || src.startsWith('asset://') || src.startsWith('blob:')) {
        // URL: 使用 fetch 下载
        const response = await fetch(src)
        if (!response.ok) {
          throw new Error(`下载失败: ${response.status}`)
        }
        const blob = await response.blob()
        const arrayBuffer = await blob.arrayBuffer()
        fileData = new Uint8Array(arrayBuffer)
      } else {
        // 本地路径: 使用 readFile 读取
        fileData = await readFile(src)
      }

      // 写入到新位置
      await writeFile(savePath, fileData)

      toast({
        title: '下载成功',
        description: '音频已保存到指定位置',
      })
    } catch (error) {
      console.error('下载失败:', error)
      toast({
        title: '下载失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      })
    } finally {
      setIsDownloading(false)
    }
  }

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="flex items-center gap-3 p-3 bg-secondary rounded-lg">
      <Button
        variant="ghost"
        size="icon"
        onClick={togglePlay}
        disabled={isLoading}
        className="shrink-0"
      >
        {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
      </Button>

      <div className="flex-1 space-y-1">
        <div className="relative h-8 flex items-center cursor-pointer group" onClick={handleSeek}>
          <div className="w-full h-2 bg-primary/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div
            className="absolute w-3 h-3 bg-primary rounded-full shadow transition-transform group-hover:scale-125"
            style={{ left: `calc(${progress}% - 6px)` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <Volume2 className="h-5 w-5 text-muted-foreground shrink-0" />

      {/* 下载按钮 */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleDownload}
        disabled={isDownloading}
        className="shrink-0"
        title="下载音频"
      >
        {isDownloading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
      </Button>

      <audio
        ref={audioRef}
        src={audioSrc}
        autoPlay={autoPlay}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onCanPlay={() => setIsLoading(false)}
        onWaiting={() => setIsLoading(true)}
      />
    </div>
  )
}

export function AudioPlayerWithWaveform({
  src,
  autoPlay = false,
  onEnded,
  onTimeUpdate,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(autoPlay)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [audioSrc, setAudioSrc] = useState<string>(src)
  const [isDownloading, setIsDownloading] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    const loadAudio = () => {
      if (!src) return

      // 如果已经是 http、data: 或 asset:// 协议的 URL，直接使用
      if (src.startsWith('http') || src.startsWith('data:') || src.startsWith('asset://')) {
        setAudioSrc(src)
      } else if (src.startsWith('blob:')) {
        // Blob URL 直接使用
        setAudioSrc(src)
      } else {
        // 本地文件路径，需要转换
        try {
          const url = convertFileSrc(src)
          setAudioSrc(url)
        } catch (error) {
          console.error('转换音频路径失败:', error, src)
          // 如果转换失败，尝试直接使用
          setAudioSrc(src)
        }
      }
    }

    loadAudio()
  }, [src])

  const togglePlay = useCallback(async () => {
    if (!audioRef.current) return

    try {
      if (isPlaying) {
        audioRef.current.pause()
        setIsPlaying(false)
      } else {
        await audioRef.current.play()
        setIsPlaying(true)
      }
    } catch (error) {
      console.error('Audio play/pause error:', error)
      setIsPlaying(false)
    }
  }, [isPlaying])

  const handleTimeUpdate = useCallback(() => {
    if (!audioRef.current) return
    const time = audioRef.current.currentTime
    setCurrentTime(time)
    onTimeUpdate?.(time, duration)
  }, [duration, onTimeUpdate])

  const handleLoadedMetadata = useCallback(() => {
    if (!audioRef.current) return
    setDuration(audioRef.current.duration)
    setIsLoading(false)
  }, [])

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!audioRef.current || !duration) return
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const percentage = x / rect.width
      const time = percentage * duration
      audioRef.current.currentTime = time
      setCurrentTime(time)
    },
    [duration]
  )

  const handleEnded = useCallback(() => {
    setIsPlaying(false)
    onEnded?.()
  }, [onEnded])

  const handleDownload = async () => {
    if (!src || isDownloading) return

    setIsDownloading(true)
    try {
      // 打开保存对话框
      const savePath = await save({
        defaultPath: `audio_${Date.now()}.wav`,
        filters: [
          { name: 'WAV Audio', extensions: ['wav'] },
          { name: 'MP3 Audio', extensions: ['mp3'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      })

      if (!savePath) return

      let fileData: Uint8Array

      // 判断是 URL 还是本地路径
      if (src.startsWith('http') || src.startsWith('asset://') || src.startsWith('blob:')) {
        // URL: 使用 fetch 下载
        const response = await fetch(src)
        if (!response.ok) {
          throw new Error(`下载失败: ${response.status}`)
        }
        const blob = await response.blob()
        const arrayBuffer = await blob.arrayBuffer()
        fileData = new Uint8Array(arrayBuffer)
      } else {
        // 本地路径: 使用 readFile 读取
        fileData = await readFile(src)
      }

      // 写入到新位置
      await writeFile(savePath, fileData)

      toast({
        title: '下载成功',
        description: '音频已保存到指定位置',
      })
    } catch (error) {
      console.error('下载失败:', error)
      toast({
        title: '下载失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      })
    } finally {
      setIsDownloading(false)
    }
  }

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="space-y-2 p-3 bg-secondary rounded-lg">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={togglePlay}
          disabled={isLoading}
          className="shrink-0 h-8 w-8"
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>

        {/* 简洁的进度条 */}
        <div className="flex-1 space-y-1">
          <div
            className="relative h-2 bg-primary/20 rounded-full overflow-hidden cursor-pointer group"
            onClick={handleSeek}
          >
            <div
              className="h-full bg-primary transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `calc(${progress}% - 6px)` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* 下载按钮 */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDownload}
          disabled={isDownloading}
          className="shrink-0 h-8 w-8"
          title="下载音频"
        >
          {isDownloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
        </Button>
      </div>

      <audio
        ref={audioRef}
        src={audioSrc}
        autoPlay={autoPlay}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onCanPlay={() => setIsLoading(false)}
        onWaiting={() => setIsLoading(true)}
      />
    </div>
  )
}
