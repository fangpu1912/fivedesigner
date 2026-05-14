import { useState, useRef, useEffect, useCallback } from 'react'

import { RotateCcw, Check } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'

import { VoiceAudioPlayer } from './VoiceAudioPlayer'

interface VoiceTrimEditorProps {
  audioUrl: string
  duration: number
  initialTrimStart?: number
  initialTrimEnd?: number
  minDuration?: number
  maxDuration?: number
  onTrimChange?: (start: number, end: number) => void
  onSave?: (start: number, end: number) => void
  className?: string
}

export function VoiceTrimEditor({
  audioUrl,
  duration,
  initialTrimStart = 0,
  initialTrimEnd,
  minDuration = 3,
  maxDuration = 60,
  onTrimChange,
  onSave,
  className,
}: VoiceTrimEditorProps) {
  const [trimStart, setTrimStart] = useState(initialTrimStart)
  const [trimEnd, setTrimEnd] = useState(initialTrimEnd || duration)
  const [_isDragging, setIsDragging] = useState<'start' | 'end' | null>(null)
  const waveformRef = useRef<HTMLDivElement>(null)

  // 确保裁剪范围有效
  useEffect(() => {
    const effectiveEnd = initialTrimEnd || duration
    setTrimStart(Math.max(0, Math.min(initialTrimStart, effectiveEnd - minDuration)))
    setTrimEnd(Math.min(duration, Math.max(effectiveEnd, initialTrimStart + minDuration)))
  }, [initialTrimStart, initialTrimEnd, duration, minDuration])

  // 通知父组件裁剪变化
  useEffect(() => {
    onTrimChange?.(trimStart, trimEnd)
  }, [trimStart, trimEnd, onTrimChange])

  // 格式化时间
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    const milliseconds = Math.floor((time % 1) * 100)
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`
  }

  // 计算裁剪后的时长
  const trimmedDuration = trimEnd - trimStart

  // 验证裁剪范围
  const isValid = trimmedDuration >= minDuration && trimmedDuration <= maxDuration

  // 处理开始时间变化
  const handleStartChange = useCallback(
    (value: number[]) => {
      const newStart = Math.max(0, Math.min(value[0] ?? 0, trimEnd - minDuration))
      setTrimStart(newStart)
    },
    [trimEnd, minDuration]
  )

  // 处理结束时间变化
  const handleEndChange = useCallback(
    (value: number[]) => {
      const newEnd = Math.min(duration, Math.max(value[0] ?? 0, trimStart + minDuration))
      setTrimEnd(newEnd)
    },
    [trimStart, duration, minDuration]
  )

  // 重置裁剪
  const handleReset = useCallback(() => {
    setTrimStart(0)
    setTrimEnd(duration)
  }, [duration])

  // 保存裁剪
  const handleSave = useCallback(() => {
    if (isValid) {
      onSave?.(trimStart, trimEnd)
    }
  }, [trimStart, trimEnd, isValid, onSave])

  // 生成波形数据
  const waveformBars = 100
  const waveformData = Array.from({ length: waveformBars }, (_, i) => {
    const position = (i / waveformBars) * duration
    const isInRange = position >= trimStart && position <= trimEnd
    return {
      height: Math.random() * 0.6 + 0.2,
      isInRange,
    }
  })

  // 计算裁剪区域的位置
  const trimStartPercent = (trimStart / duration) * 100
  const trimWidthPercent = ((trimEnd - trimStart) / duration) * 100

  return (
    <div className={cn('space-y-4', className)}>
      {/* 音频播放器 */}
      <VoiceAudioPlayer
        audioUrl={audioUrl}
        trimStart={trimStart}
        trimEnd={trimEnd}
        showWaveform={false}
      />

      {/* 裁剪信息 */}
      <div className="flex items-center justify-between text-sm">
        <div className="space-x-4">
          <span className="text-muted-foreground">
            开始: <span className="text-foreground font-medium">{formatTime(trimStart)}</span>
          </span>
          <span className="text-muted-foreground">
            结束: <span className="text-foreground font-medium">{formatTime(trimEnd)}</span>
          </span>
          <span className={cn('font-medium', isValid ? 'text-green-600' : 'text-destructive')}>
            时长: {formatTime(trimmedDuration)}
          </span>
        </div>
        {!isValid && (
          <span className="text-xs text-destructive">
            {trimmedDuration < minDuration
              ? `最短需要 ${minDuration}秒`
              : `最长允许 ${maxDuration}秒`}
          </span>
        )}
      </div>

      {/* 波形和裁剪区域可视化 */}
      <div className="relative" ref={waveformRef}>
        {/* 波形背景 */}
        <div className="h-24 flex items-center gap-0.5 px-2 rounded-lg bg-muted/30">
          {waveformData.map((bar, index) => (
            <div
              key={index}
              className={cn(
                'flex-1 rounded-full transition-all duration-200',
                bar.isInRange ? 'bg-primary' : 'bg-muted'
              )}
              style={{
                height: `${bar.height * 100}%`,
                opacity: bar.isInRange ? 1 : 0.3,
              }}
            />
          ))}
        </div>

        {/* 裁剪区域遮罩 */}
        <div className="absolute inset-0 pointer-events-none">
          {/* 左侧遮罩 */}
          <div
            className="absolute top-0 left-0 h-full bg-black/20 rounded-l-lg"
            style={{ width: `${trimStartPercent}%` }}
          />
          {/* 右侧遮罩 */}
          <div
            className="absolute top-0 right-0 h-full bg-black/20 rounded-r-lg"
            style={{ width: `${100 - trimStartPercent - trimWidthPercent}%` }}
          />
        </div>
      </div>

      {/* 裁剪控制滑块 */}
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>裁剪开始</span>
            <span>{formatTime(trimStart)}</span>
          </div>
          <Slider
            value={[trimStart]}
            min={0}
            max={trimEnd - minDuration}
            step={0.1}
            onValueChange={handleStartChange}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>裁剪结束</span>
            <span>{formatTime(trimEnd)}</span>
          </div>
          <Slider
            value={[trimEnd]}
            min={trimStart + minDuration}
            max={duration}
            step={0.1}
            onValueChange={handleEndChange}
          />
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={handleReset} className="gap-1">
          <RotateCcw className="h-4 w-4" />
          重置
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!isValid} className="gap-1">
          <Check className="h-4 w-4" />
          保存裁剪
        </Button>
      </div>
    </div>
  )
}
