import { useState, useRef, useEffect, useCallback } from 'react'

import { Play, Pause, Volume2, VolumeX } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'

interface VoiceAudioPlayerProps {
  audioUrl: string
  trimStart?: number
  trimEnd?: number
  className?: string
  showWaveform?: boolean
}

export function VoiceAudioPlayer({
  audioUrl,
  trimStart,
  trimEnd,
  className,
  showWaveform = true,
}: VoiceAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)

  // 加载音频元数据
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleLoadedMetadata = () => {
      setDuration(audio.duration)
    }

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)

      // 检查是否到达裁剪结束点
      if (trimEnd && audio.currentTime >= trimEnd) {
        audio.pause()
        setIsPlaying(false)
        audio.currentTime = trimStart || 0
      }
    }

    const handleEnded = () => {
      setIsPlaying(false)
      // 重置到裁剪开始点
      if (trimStart) {
        audio.currentTime = trimStart
      }
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
    }
  }, [audioUrl, trimStart, trimEnd])

  // 播放/暂停切换
  const togglePlay = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return

    try {
      if (isPlaying) {
        audio.pause()
        setIsPlaying(false)
      } else {
        // 如果从开头开始或已结束，跳到裁剪开始点
        if (
          trimStart &&
          (audio.currentTime < trimStart || audio.currentTime >= (trimEnd || duration))
        ) {
          audio.currentTime = trimStart
        }
        await audio.play()
        setIsPlaying(true)
      }
    } catch (error) {
      console.error('Audio play/pause error:', error)
      setIsPlaying(false)
    }
  }, [isPlaying, trimStart, trimEnd, duration])

  // 跳转到指定时间
  const seekTo = useCallback(
    (time: number) => {
      const audio = audioRef.current
      if (!audio) return

      // 限制在裁剪范围内
      let targetTime = time
      if (trimStart && time < trimStart) {
        targetTime = trimStart
      }
      if (trimEnd && time > trimEnd) {
        targetTime = trimEnd
      }

      audio.currentTime = targetTime
      setCurrentTime(targetTime)
    },
    [trimStart, trimEnd]
  )

  // 切换静音
  const toggleMute = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    audio.muted = !isMuted
    setIsMuted(!isMuted)
  }, [isMuted])

  // 调整音量
  const handleVolumeChange = useCallback(
    (value: number[]) => {
      const audio = audioRef.current
      if (!audio) return

      const newVolume = value[0] ?? 0
      audio.volume = newVolume
      setVolume(newVolume)

      if (newVolume > 0 && isMuted) {
        audio.muted = false
        setIsMuted(false)
      }
    },
    [isMuted]
  )

  // 格式化时间
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  // 生成波形数据（模拟）
  const waveformBars = 50
  const waveformData = Array.from({ length: waveformBars }, (_, i) => {
    const position = i / waveformBars
    const isInTrimRange =
      (!trimStart || position >= trimStart / duration) &&
      (!trimEnd || position <= trimEnd / duration)
    return {
      height: Math.random() * 0.6 + 0.2,
      isActive: isInTrimRange,
    }
  })

  // 计算播放进度
  const effectiveDuration = trimEnd ? trimEnd - (trimStart || 0) : duration - (trimStart || 0)
  const effectiveCurrentTime = Math.max(0, currentTime - (trimStart || 0))
  const progress = effectiveDuration > 0 ? (effectiveCurrentTime / effectiveDuration) * 100 : 0

  return (
    <div className={cn('space-y-3', className)}>
      {/* 隐藏的原生音频元素 */}
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      {/* 播放控制 */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          onClick={togglePlay}
          className="h-10 w-10 rounded-full"
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
        </Button>

        {/* 时间显示 */}
        <div className="text-sm text-muted-foreground min-w-[80px]">
          {formatTime(effectiveCurrentTime)} / {formatTime(effectiveDuration || duration)}
        </div>

        {/* 进度条 */}
        <div className="flex-1">
          <Slider
            value={[currentTime]}
            min={trimStart || 0}
            max={trimEnd || duration}
            step={0.1}
            onValueChange={value => seekTo(value[0] ?? 0)}
            className="cursor-pointer"
          />
        </div>

        {/* 音量控制 */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggleMute} className="h-8 w-8">
            {isMuted || volume === 0 ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>
          <Slider
            value={[isMuted ? 0 : volume]}
            min={0}
            max={1}
            step={0.1}
            onValueChange={handleVolumeChange}
            className="w-20"
          />
        </div>
      </div>

      {/* 波形显示 */}
      {showWaveform && (
        <div className="h-16 flex items-center gap-0.5 px-2">
          {waveformData.map((bar, index) => {
            const barProgress = (index / waveformBars) * 100
            const isPlayed = barProgress <= progress

            return (
              <div
                key={index}
                className={cn(
                  'flex-1 rounded-full transition-all duration-200',
                  bar.isActive ? 'bg-primary' : 'bg-muted',
                  isPlayed && bar.isActive && 'bg-primary/70'
                )}
                style={{
                  height: `${bar.height * 100}%`,
                  opacity: bar.isActive ? 1 : 0.3,
                }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
