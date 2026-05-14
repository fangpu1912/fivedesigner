import { useRef, useEffect, useCallback, useState } from 'react'

import { cn } from '@/lib/utils'

interface WaveformVisualizerProps {
  audioUrl?: string
  className?: string
  height?: number
  barCount?: number
  barWidth?: number
  barGap?: number
  progress?: number
  onSeek?: (position: number) => void
  isPlaying?: boolean
}

export function WaveformVisualizer({
  audioUrl,
  className,
  height = 80,
  barCount = 100,
  barWidth = 3,
  barGap = 2,
  progress = 0,
  onSeek,
  isPlaying = false,
}: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [waveformData, setWaveformData] = useState<number[]>([])
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const generateMockWaveform = () => {
      const data: number[] = []
      for (let i = 0; i < barCount; i++) {
        const base = 0.3 + Math.random() * 0.4
        const variation = Math.sin(i * 0.1) * 0.2
        data.push(Math.max(0.1, Math.min(1, base + variation)))
      }
      setWaveformData(data)
      setIsLoaded(true)
    }

    if (audioUrl) {
      generateMockWaveform()
    } else {
      setWaveformData([])
      setIsLoaded(false)
    }
  }, [audioUrl, barCount])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || waveformData.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const width = rect.width
    const h = rect.height
    const totalBarWidth = barWidth + barGap
    const startX = (width - barCount * totalBarWidth) / 2

    ctx.clearRect(0, 0, width, h)

    waveformData.forEach((value, index) => {
      const x = startX + index * totalBarWidth
      const barHeight = value * (h - 10)
      const y = (h - barHeight) / 2

      const progressIndex = (progress / 100) * barCount

      if (index < progressIndex) {
        const gradient = ctx.createLinearGradient(x, y, x, y + barHeight)
        gradient.addColorStop(0, 'rgb(59, 130, 246)')
        gradient.addColorStop(1, 'rgb(147, 51, 234)')
        ctx.fillStyle = gradient
      } else {
        ctx.fillStyle = 'rgba(100, 116, 139, 0.5)'
      }

      ctx.beginPath()
      ctx.roundRect(x, y, barWidth, barHeight, 1)
      ctx.fill()
    })

    if (isPlaying) {
      const playheadX = startX + (progress / 100) * barCount * totalBarWidth
      ctx.strokeStyle = 'rgb(239, 68, 68)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(playheadX, 0)
      ctx.lineTo(playheadX, h)
      ctx.stroke()
    }
  }, [waveformData, progress, barCount, barWidth, barGap, isPlaying])

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onSeek || waveformData.length === 0) return

      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const totalBarWidth = barWidth + barGap
      const startX = (rect.width - barCount * totalBarWidth) / 2

      const relativeX = x - startX
      const position = Math.max(0, Math.min(100, (relativeX / (barCount * totalBarWidth)) * 100))

      onSeek(position)
    },
    [onSeek, barCount, barWidth, barGap, waveformData]
  )

  return (
    <div className={cn('relative', className)}>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className={cn('w-full rounded-lg', onSeek && 'cursor-pointer')}
        style={{ height: `${height}px` }}
      />
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary/50 rounded-lg">
          <p className="text-sm text-muted-foreground">暂无音频</p>
        </div>
      )}
    </div>
  )
}

interface AudioWaveformProps {
  audioUrl?: string
  className?: string
  onTimeUpdate?: (currentTime: number, duration: number) => void
}

export function AudioWaveform({ audioUrl, className, onTimeUpdate }: AudioWaveformProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  const handleSeek = useCallback(
    (position: number) => {
      if (!audioRef.current || duration === 0) return
      audioRef.current.currentTime = (position / 100) * duration
    },
    [duration]
  )

  const handleTimeUpdate = useCallback(() => {
    if (!audioRef.current) return
    const time = audioRef.current.currentTime
    setCurrentTime(time)
    onTimeUpdate?.(time, duration)
  }, [duration, onTimeUpdate])

  const handleLoadedMetadata = useCallback(() => {
    if (!audioRef.current) return
    setDuration(audioRef.current.duration)
  }, [])

  const handleEnded = useCallback(() => {
    setIsPlaying(false)
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)

    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)

    return () => {
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
    }
  }, [])

  return (
    <div className={cn('space-y-2', className)}>
      <WaveformVisualizer
        audioUrl={audioUrl}
        progress={progress}
        onSeek={handleSeek}
        isPlaying={isPlaying}
      />
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
      />
    </div>
  )
}
