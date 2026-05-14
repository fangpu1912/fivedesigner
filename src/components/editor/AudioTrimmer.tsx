import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'

import { Play, Pause, RotateCcw, X, Scissors } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface AudioTrimmerProps {
  src: string
  onTrim: (start: number, end: number) => void
  onCancel?: () => void
  className?: string
}

interface Selection {
  start: number
  end: number
}

const WAVEFORM_COLOR = '#3b82f6'
const SELECTION_COLOR = 'rgba(59, 130, 246, 0.3)'
const PLAYHEAD_COLOR = '#ef4444'

export const AudioTrimmer: React.FC<AudioTrimmerProps> = ({ src, onTrim, onCancel, className }) => {
  const [audioDuration, setAudioDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [waveformData, setWaveformData] = useState<number[]>([])
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragType, setDragType] = useState<'start' | 'end' | 'move' | null>(null)
  const [dragStartX, setDragStartX] = useState(0)
  const [initialSelection, setInitialSelection] = useState<Selection>({ start: 0, end: 0 })

  const audioRef = useRef<HTMLAudioElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const selectionRef = useRef<Selection>({ start: 0, end: 0 })

  // 同步 selection 到 ref
  useEffect(() => {
    selectionRef.current = selection
  }, [selection])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleLoadedMetadata = () => {
      setAudioDuration(audio.duration)
      setSelection({ start: 0, end: audio.duration })
      setIsLoading(false)
    }

    const handleTimeUpdate = () => {
      const currentTime = audio.currentTime
      setCurrentTime(currentTime)

      // 如果播放超过了选中区域的结束时间，停止播放
      // 使用 ref 获取最新的 selection 值
      const currentSelection = selectionRef.current
      if (currentSelection.end > 0 && currentTime >= currentSelection.end - 0.01) {
        audio.pause()
        audio.currentTime = currentSelection.start
        setIsPlaying(false)
        setCurrentTime(currentSelection.start)
      }
    }

    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(selection.start)
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
    }
  }, [])

  useEffect(() => {
    const loadAudio = async () => {
      try {
        const response = await fetch(src)
        const arrayBuffer = await response.arrayBuffer()

        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContext()
        }

        const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer)
        const channelData = audioBuffer.getChannelData(0)
        const samples = 200
        const blockSize = Math.floor(channelData.length / samples)
        const waveform: number[] = []

        for (let i = 0; i < samples; i++) {
          let sum = 0
          for (let j = 0; j < blockSize; j++) {
            const sampleIndex = i * blockSize + j
            const sampleValue =
              sampleIndex < channelData.length ? (channelData[sampleIndex] ?? 0) : 0
            sum += Math.abs(sampleValue)
          }
          waveform.push(sum / blockSize)
        }

        const max = Math.max(...waveform)
        setWaveformData(waveform.map(v => v / max))
      } catch (error) {
        console.error('Failed to load audio:', error)
      }
    }

    loadAudio()
  }, [src])

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
    const height = rect.height
    const barWidth = width / waveformData.length
    const barGap = 2

    ctx.clearRect(0, 0, width, height)

    const selectionStartX = (selection.start / audioDuration) * width
    const selectionEndX = (selection.end / audioDuration) * width

    ctx.fillStyle = SELECTION_COLOR
    ctx.fillRect(selectionStartX, 0, selectionEndX - selectionStartX, height)

    waveformData.forEach((value, index) => {
      const x = index * barWidth
      const barHeight = value * (height - 20)
      const y = (height - barHeight) / 2

      const isInSelection = x >= selectionStartX && x <= selectionEndX

      ctx.fillStyle = isInSelection ? WAVEFORM_COLOR : '#94a3b8'
      ctx.fillRect(x + barGap / 2, y, barWidth - barGap, barHeight)
    })

    const playheadX = (currentTime / audioDuration) * width
    ctx.strokeStyle = PLAYHEAD_COLOR
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(playheadX, 0)
    ctx.lineTo(playheadX, height)
    ctx.stroke()
  }, [waveformData, selection, currentTime, audioDuration])

  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }, [])

  const handlePlayPause = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return

    try {
      if (isPlaying) {
        audio.pause()
        setIsPlaying(false)
      } else {
        if (currentTime >= selection.end || currentTime < selection.start) {
          audio.currentTime = selection.start
        }
        await audio.play()
        setIsPlaying(true)
      }
    } catch (error) {
      console.error('Audio play/pause error:', error)
      setIsPlaying(false)
    }
  }, [isPlaying, currentTime, selection])

  const handleReset = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    audio.pause()
    audio.currentTime = selection.start
    setCurrentTime(selection.start)
    setIsPlaying(false)
  }, [selection.start])

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas || !audioDuration) return

      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const clickTime = (x / rect.width) * audioDuration

      const audio = audioRef.current
      if (audio) {
        audio.currentTime = Math.max(selection.start, Math.min(selection.end, clickTime))
      }
    },
    [audioDuration, selection]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const container = containerRef.current
      if (!container || !audioDuration) return

      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left
      const clickTime = (x / rect.width) * audioDuration

      // 动态阈值：根据音频时长调整，最小 0.1 秒，最大 0.5 秒
      const threshold = Math.min(0.5, Math.max(0.1, audioDuration * 0.02))

      // 记录初始选择状态
      setInitialSelection(selection)

      if (Math.abs(clickTime - selection.start) < threshold) {
        setDragType('start')
      } else if (Math.abs(clickTime - selection.end) < threshold) {
        setDragType('end')
      } else if (clickTime > selection.start && clickTime < selection.end) {
        setDragType('move')
      } else {
        return
      }

      setIsDragging(true)
      setDragStartX(e.clientX)
    },
    [audioDuration, selection]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || !dragType || !containerRef.current || !audioDuration) return

      const container = containerRef.current
      const rect = container.getBoundingClientRect()
      const deltaX = e.clientX - dragStartX
      const deltaTime = (deltaX / rect.width) * audioDuration

      if (dragType === 'start') {
        // 使用 initialSelection 作为基准，避免跳动
        const newStart = Math.max(
          0,
          Math.min(initialSelection.end - 0.1, initialSelection.start + deltaTime)
        )
        setSelection(prev => ({ ...prev, start: newStart }))
      } else if (dragType === 'end') {
        // 使用 initialSelection 作为基准，避免跳动
        const newEnd = Math.min(
          audioDuration,
          Math.max(initialSelection.start + 0.1, initialSelection.end + deltaTime)
        )
        setSelection(prev => ({ ...prev, end: newEnd }))
      } else if (dragType === 'move') {
        const duration = initialSelection.end - initialSelection.start
        let newStart = initialSelection.start + deltaTime
        let newEnd = initialSelection.end + deltaTime

        if (newStart < 0) {
          newStart = 0
          newEnd = duration
        }
        if (newEnd > audioDuration) {
          newEnd = audioDuration
          newStart = audioDuration - duration
        }

        setSelection({ start: newStart, end: newEnd })
      }
    },
    [isDragging, dragType, dragStartX, audioDuration, initialSelection]
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setDragType(null)
  }, [])

  const handleTimeInputChange = useCallback(
    (type: 'start' | 'end', value: string) => {
      const timeParts = value.split(':')
      if (timeParts.length !== 2) return

      const minsStr = timeParts[0]
      const secsStr = timeParts[1]
      if (!minsStr || !secsStr) return

      const mins = parseInt(minsStr, 10)
      const secsParts = secsStr.split('.')
      const secsStrPart = secsParts[0]
      if (!secsStrPart) return

      const secs = parseInt(secsStrPart, 10)
      const ms = secsParts[1] ? parseInt(secsParts[1], 10) : 0

      const totalSeconds = mins * 60 + secs + ms / 100

      if (type === 'start') {
        setSelection(prev => ({
          ...prev,
          start: Math.max(0, Math.min(prev.end - 0.1, totalSeconds)),
        }))
      } else {
        setSelection(prev => ({
          ...prev,
          end: Math.min(audioDuration, Math.max(prev.start + 0.1, totalSeconds)),
        }))
      }
    },
    [audioDuration]
  )

  const handleTrim = useCallback(() => {
    onTrim(selection.start, selection.end)
  }, [selection, onTrim])

  const selectionDuration = useMemo(() => {
    return selection.end - selection.start
  }, [selection])

  return (
    <div className={cn('space-y-4', className)}>
      <audio ref={audioRef} src={src} preload="metadata" />

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>音频修剪</span>
          <span>总时长: {formatTime(audioDuration)}</span>
        </div>

        <div
          ref={containerRef}
          className="relative h-24 cursor-crosshair rounded-lg border bg-muted/30"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <canvas
            ref={canvasRef}
            className="h-full w-full rounded-lg"
            onClick={handleCanvasClick}
          />

          <div
            className="absolute top-0 h-full w-1 cursor-ew-resize bg-blue-500"
            style={{ left: `${(selection.start / audioDuration) * 100}%` }}
          />

          <div
            className="absolute top-0 h-full w-1 cursor-ew-resize bg-blue-500"
            style={{ left: `${(selection.end / audioDuration) * 100}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">开始时间</label>
          <input
            type="text"
            value={formatTime(selection.start)}
            onChange={e => handleTimeInputChange('start', e.target.value)}
            className="w-full rounded-md border bg-background px-2 py-1.5 font-mono text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">结束时间</label>
          <input
            type="text"
            value={formatTime(selection.end)}
            onChange={e => handleTimeInputChange('end', e.target.value)}
            className="w-full rounded-md border bg-background px-2 py-1.5 font-mono text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">选中时长</label>
          <div className="flex h-9 items-center rounded-md border bg-muted/50 px-2 font-mono text-sm">
            {formatTime(selectionDuration)}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePlayPause}
            disabled={isLoading}
          >
            {isPlaying ? (
              <>
                <Pause className="h-4 w-4 mr-1" />
                暂停
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-1" />
                播放
              </>
            )}
          </Button>

          <Button type="button" variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-1" />
            重置
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              <X className="h-4 w-4 mr-1" />
              取消
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            onClick={handleTrim}
            disabled={isLoading || selectionDuration < 0.1}
          >
            <Scissors className="h-4 w-4 mr-1" />
            确认修剪
          </Button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        提示: 拖动波形图边缘调整选择区域，点击波形图跳转播放位置
      </div>
    </div>
  )
}

export default AudioTrimmer
