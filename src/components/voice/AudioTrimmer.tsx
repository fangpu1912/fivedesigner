import { useState, useRef, useEffect, useCallback } from 'react'

import { Play, Pause, X, Scissors, Check, ZoomIn, ZoomOut, Info } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface AudioTrimmerProps {
  audioFile: File
  onConfirm: (trimmedBlob: Blob) => void
  onCancel: () => void
}

export function AudioTrimmer({ audioFile, onConfirm, onCancel }: AudioTrimmerProps) {
  console.log('[AudioTrimmer] 组件渲染, audioFile:', audioFile?.name)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioBufferRef = useRef<AudioBuffer | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)

  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [startPos, setStartPos] = useState(0)
  const [endPos, setEndPos] = useState(1)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [waveformData, setWaveformData] = useState<number[]>([])
  const [isDragging, setIsDragging] = useState<'start' | 'end' | 'region' | null>(null)

  // 缩放相关
  const [zoom, setZoom] = useState(1)
  const [scrollOffset] = useState(0)

  // 音频信息
  const [audioInfo, setAudioInfo] = useState<{
    sampleRate: number
    channels: number
    duration: number
    format: string
  } | null>(null)

  // 显示信息面板
  const [showInfo, setShowInfo] = useState(false)

  // 格式化时间
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }

  // 加载音频并生成波形
  useEffect(() => {
    const loadAudio = async () => {
      setIsLoading(true)
      try {
        const arrayBuffer = await audioFile.arrayBuffer()
        const audioContext = new AudioContext()
        audioContextRef.current = audioContext
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
        audioBufferRef.current = audioBuffer

        // 获取音频格式信息
        const format = audioFile.name.split('.').pop()?.toUpperCase() || 'UNKNOWN'
        setAudioInfo({
          sampleRate: audioBuffer.sampleRate,
          channels: audioBuffer.numberOfChannels,
          duration: audioBuffer.duration,
          format,
        })

        setDuration(audioBuffer.duration)
        setEndPos(1)
        setStartPos(0)

        // 生成波形数据
        const rawData = audioBuffer.getChannelData(0)
        const samples = 500
        const blockSize = Math.floor(rawData.length / samples)
        const filteredData: number[] = []

        for (let i = 0; i < samples; i++) {
          let sum = 0
          const start = blockSize * i
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(rawData[start + j] || 0)
          }
          filteredData.push(sum / blockSize)
        }

        // 归一化
        const max = Math.max(...filteredData)
        const normalized = filteredData.map(v => v / max)
        setWaveformData(normalized)
        setIsLoading(false)
      } catch (err) {
        console.error('加载音频失败:', err)
        setIsLoading(false)
      }
    }

    loadAudio()

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
      // 停止任何正在播放的音频
      if (sourceRef.current) {
        try {
          sourceRef.current.stop()
        } catch (e) {}
      }
    }
  }, [audioFile])

  // 绘制波形
  useEffect(() => {
    if (!canvasRef.current || waveformData.length === 0) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 设置画布大小
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const width = rect.width
    const height = rect.height

    // 清空画布
    ctx.clearRect(0, 0, width, height)

    // 背景 - 使用固定颜色确保可见
    ctx.fillStyle = '#f1f5f9' // slate-100
    ctx.fillRect(0, 0, width, height)

    // 绘制网格
    ctx.strokeStyle = 'rgba(0,0,0,0.05)'
    ctx.lineWidth = 1
    for (let i = 0; i <= 10; i++) {
      const x = (i / 10) * width
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }

    // 计算可见区域
    const visibleStart = scrollOffset / zoom
    const visibleEnd = (scrollOffset + 1) / zoom

    // 绘制选中区域
    const startX = Math.max(0, ((startPos - visibleStart) / (visibleEnd - visibleStart)) * width)
    const endX = Math.min(width, ((endPos - visibleStart) / (visibleEnd - visibleStart)) * width)
    ctx.fillStyle = 'rgba(0,0,0,0.08)'
    ctx.fillRect(startX, 0, endX - startX, height)

    // 绘制波形
    const barWidth = width / (waveformData.length / zoom)
    const gap = 1

    for (
      let i = Math.floor(scrollOffset * waveformData.length);
      i < Math.min(waveformData.length, (scrollOffset + 1) * waveformData.length);
      i++
    ) {
      const position = i / waveformData.length
      const x = ((position - scrollOffset) / zoom) * width

      if (x < -barWidth || x > width + barWidth) continue

      const barHeight = (waveformData[i] ?? 0) * (height * 0.8)
      const y = (height - barHeight) / 2

      // 在选中区域内的波形高亮 - 使用深色
      if (position >= startPos && position <= endPos) {
        ctx.fillStyle = '#0f172a' // slate-900
      } else {
        ctx.fillStyle = '#64748b' // slate-500
      }

      ctx.fillRect(x + gap / 2, y, barWidth - gap, barHeight)
    }

    // 绘制起始和结束线
    ctx.strokeStyle = '#0f172a' // slate-900
    ctx.lineWidth = 2

    const startLineX = Math.max(
      0,
      ((startPos - visibleStart) / (visibleEnd - visibleStart)) * width
    )
    const endLineX = Math.min(
      width,
      ((endPos - visibleStart) / (visibleEnd - visibleStart)) * width
    )

    ctx.beginPath()
    ctx.moveTo(startLineX, 0)
    ctx.lineTo(startLineX, height)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(endLineX, 0)
    ctx.lineTo(endLineX, height)
    ctx.stroke()

    // 绘制当前播放位置
    if (duration > 0) {
      const currentX =
        ((currentTime / duration - visibleStart) / (visibleEnd - visibleStart)) * width
      if (currentX >= 0 && currentX <= width) {
        ctx.strokeStyle = '#22c55e'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(currentX, 0)
        ctx.lineTo(currentX, height)
        ctx.stroke()
      }
    }

    // 绘制缩放指示器
    ctx.fillStyle = '#64748b'
    ctx.font = '12px sans-serif'
    ctx.fillText(`${Math.round(zoom * 100)}%`, width - 50, 20)
  }, [waveformData, startPos, endPos, currentTime, duration, zoom, scrollOffset])

  // 播放/暂停
  const togglePlay = useCallback(() => {
    if (isPlaying) {
      // 停止播放
      if (sourceRef.current) {
        try {
          sourceRef.current.stop()
        } catch (e) {}
        sourceRef.current = null
      }
      setIsPlaying(false)
    } else {
      // 开始播放
      if (!audioContextRef.current || !audioBufferRef.current) return

      // 创建音频源
      const source = audioContextRef.current.createBufferSource()
      source.buffer = audioBufferRef.current

      // 创建增益节点（用于淡入淡出）
      const gainNode = audioContextRef.current.createGain()
      gainNodeRef.current = gainNode

      // 淡入效果（0.1秒）
      const startTime = audioContextRef.current.currentTime
      gainNode.gain.setValueAtTime(0, startTime)
      gainNode.gain.linearRampToValueAtTime(1, startTime + 0.1)

      source.connect(gainNode)
      gainNode.connect(audioContextRef.current.destination)

      // 设置播放范围
      const startTime2 = startPos * duration
      const endTime = endPos * duration
      source.start(0, startTime2, endTime - startTime2)

      sourceRef.current = source

      // 使用 setInterval 更新播放时间
      const intervalId = setInterval(() => {
        if (sourceRef.current && audioContextRef.current) {
          const current = audioContextRef.current.currentTime
          const elapsed = current - startTime
          const newTime = startTime2 + elapsed

          if (newTime >= endTime) {
            setCurrentTime(endTime)
            setIsPlaying(false)
            clearInterval(intervalId)
            try {
              source.stop()
            } catch (e) {}
            sourceRef.current = null
          } else {
            setCurrentTime(newTime)
          }
        }
      }, 50) // 每 50ms 更新一次

      source.onended = () => {
        setIsPlaying(false)
        clearInterval(intervalId)
        sourceRef.current = null
      }

      // 保存 interval ID 以便停止
      ;(source as any).intervalId = intervalId

      setIsPlaying(true)
    }
  }, [isPlaying, startPos, endPos, duration])

  // 停止播放
  const stopPlayback = useCallback(() => {
    if (sourceRef.current) {
      // 清理 interval
      const intervalId = (sourceRef.current as any).intervalId
      if (intervalId) {
        clearInterval(intervalId)
      }
      try {
        sourceRef.current.stop()
      } catch (e) {}
      sourceRef.current = null
    }
    setIsPlaying(false)
  }, [])

  // 处理画布点击和拖动
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    stopPlayback()

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width

    // 转换为实际位置
    const visibleStart = scrollOffset / zoom
    const visibleEnd = (scrollOffset + 1) / zoom
    const actualPos = visibleStart + x * (visibleEnd - visibleStart)

    // 判断点击位置
    const startDist = Math.abs(actualPos - startPos)
    const endDist = Math.abs(actualPos - endPos)
    const handleWidth = 0.05 / zoom

    if (startDist < handleWidth) {
      setIsDragging('start')
    } else if (endDist < handleWidth) {
      setIsDragging('end')
    } else if (actualPos > startPos && actualPos < endPos) {
      setIsDragging('region')
      setCurrentTime(actualPos * duration)
    }
  }

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))

    const visibleStart = scrollOffset / zoom
    const visibleEnd = (scrollOffset + 1) / zoom
    const actualPos = visibleStart + x * (visibleEnd - visibleStart)

    if (isDragging === 'start') {
      if (actualPos < endPos - 0.01) {
        setStartPos(Math.max(0, actualPos))
        setCurrentTime(actualPos * duration)
      }
    } else if (isDragging === 'end') {
      if (actualPos > startPos + 0.01) {
        setEndPos(Math.min(1, actualPos))
      }
    } else if (isDragging === 'region') {
      const regionWidth = endPos - startPos
      const newStart = Math.max(0, Math.min(1 - regionWidth, actualPos - regionWidth / 2))
      setStartPos(newStart)
      setEndPos(newStart + regionWidth)
      setCurrentTime(actualPos * duration)
    }
  }

  const handleCanvasMouseUp = () => {
    setIsDragging(null)
  }

  // 滚轮缩放
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    const newZoom = Math.max(1, Math.min(10, zoom + delta))
    setZoom(newZoom)
  }

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowLeft':
          e.preventDefault()
          stopPlayback()
          const newTimeLeft = Math.max(0, currentTime - 1)
          setCurrentTime(newTimeLeft)
          break
        case 'ArrowRight':
          e.preventDefault()
          stopPlayback()
          const newTimeRight = Math.min(duration, currentTime + 1)
          setCurrentTime(newTimeRight)
          break
        case 'Escape':
          onCancel()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [togglePlay, stopPlayback, currentTime, duration, onCancel])

  // 确认裁剪
  const handleConfirm = async () => {
    if (!audioBufferRef.current) return

    stopPlayback()
    setIsProcessing(true)

    try {
      const audioBuffer = audioBufferRef.current
      const sampleRate = audioBuffer.sampleRate
      const startOffset = Math.floor(startPos * duration * sampleRate)
      const endOffset = Math.floor(endPos * duration * sampleRate)
      const frameCount = endOffset - startOffset

      const trimmedBuffer = audioContextRef.current!.createBuffer(
        audioBuffer.numberOfChannels,
        frameCount,
        sampleRate
      )

      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        const inputData = audioBuffer.getChannelData(channel)
        const outputData = trimmedBuffer.getChannelData(channel)
        for (let i = 0; i < frameCount; i++) {
          outputData[i] = inputData[startOffset + i] ?? 0
        }
      }

      const wavBlob = audioBufferToWav(trimmedBuffer)
      onConfirm(wavBlob)
    } catch (err) {
      console.error('裁剪失败:', err)
      alert('裁剪失败')
    } finally {
      setIsProcessing(false)
    }
  }

  const startTime = startPos * duration
  const endTime = endPos * duration
  const selectedDuration = endTime - startTime

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-xl p-6 max-w-4xl w-full border shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Scissors size={20} className="text-primary-foreground" />
            </div>
            <div>
              <div className="font-medium text-lg">音频裁剪</div>
              <div className="text-muted-foreground text-sm">
                拖动选择区域，只保留一人说话的片段
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowInfo(!showInfo)}
              className={`p-2 rounded-md transition-colors ${showInfo ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
            >
              <Info size={20} />
            </button>
            <button
              onClick={onCancel}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 音频信息面板 */}
        {showInfo && audioInfo && (
          <div className="mb-4 p-4 bg-muted rounded-lg grid grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground text-xs mb-1">格式</div>
              <div className="font-medium">{audioInfo.format}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs mb-1">采样率</div>
              <div className="font-medium">{audioInfo.sampleRate} Hz</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs mb-1">声道数</div>
              <div className="font-medium">{audioInfo.channels === 1 ? '单声道' : '立体声'}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs mb-1">总时长</div>
              <div className="font-medium">{formatTime(audioInfo.duration)}</div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="h-40 flex items-center justify-center text-muted-foreground">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mr-3" />
            加载音频中...
          </div>
        ) : (
          <>
            {/* 波形画布 */}
            <div className="mb-4 relative">
              <canvas
                ref={canvasRef}
                className="w-full h-32 rounded-lg cursor-crosshair bg-muted"
                style={{ cursor: isDragging ? 'grabbing' : 'crosshair' }}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
                onWheel={handleWheel}
              />

              {/* 缩放控制 */}
              <div className="absolute bottom-2 right-2 flex gap-1">
                <button
                  onClick={() => setZoom(Math.max(1, zoom - 1))}
                  className="p-1.5 bg-background/80 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border"
                  title="缩小"
                >
                  <ZoomOut size={14} />
                </button>
                <button
                  onClick={() => setZoom(Math.min(10, zoom + 1))}
                  className="p-1.5 bg-background/80 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border"
                  title="放大"
                >
                  <ZoomIn size={14} />
                </button>
              </div>
            </div>

            {/* 时间信息 */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-muted rounded-lg p-4 border">
                <div className="text-muted-foreground text-xs mb-2">开始时间</div>
                <div className="text-primary font-mono text-xl">{formatTime(startTime)}</div>
              </div>
              <div className="bg-muted rounded-lg p-4 border">
                <div className="text-muted-foreground text-xs mb-2">结束时间</div>
                <div className="text-primary font-mono text-xl">{formatTime(endTime)}</div>
              </div>
              <div className="bg-muted rounded-lg p-4 border">
                <div className="text-muted-foreground text-xs mb-2">选中时长</div>
                <div className="text-green-600 font-mono text-xl">
                  {formatTime(selectedDuration)}
                </div>
              </div>
            </div>

            {/* 播放控制 */}
            <div className="flex items-center justify-center gap-6 mb-6">
              <button
                onClick={() => {
                  stopPlayback()
                  setCurrentTime(Math.max(0, currentTime - 1))
                }}
                className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                title="后退 1 秒"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polygon points="11 19 2 12 11 5 11 19" />
                  <polygon points="22 19 13 12 22 5 22 19" />
                </svg>
              </button>

              <button
                onClick={togglePlay}
                className="w-14 h-14 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center text-primary-foreground transition-all hover:scale-105"
              >
                {isPlaying ? <Pause size={24} /> : <Play size={24} className="ml-1" />}
              </button>

              <button
                onClick={() => {
                  stopPlayback()
                  setCurrentTime(Math.min(duration, currentTime + 1))
                }}
                className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                title="前进 1 秒"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polygon points="13 19 22 12 13 5 13 19" />
                  <polygon points="2 19 11 12 2 5 2 19" />
                </svg>
              </button>
            </div>

            {/* 快捷键提示 */}
            <div className="text-center text-muted-foreground text-xs mb-4">
              空格键：播放/暂停 · 左右方向键：快进/快退 · 滚轮：缩放波形
            </div>
          </>
        )}

        {/* 按钮 */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={onCancel} className="flex-1">
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={isProcessing || isLoading} className="flex-1">
            {isProcessing ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                处理中...
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Check size={16} />
                确认裁剪
              </div>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const format = 1
  const bitDepth = 16

  const bytesPerSample = bitDepth / 8
  const blockAlign = numChannels * bytesPerSample

  const dataLength = buffer.length * blockAlign
  const bufferLength = 44 + dataLength

  const arrayBuffer = new ArrayBuffer(bufferLength)
  const view = new DataView(arrayBuffer)

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i))
    }
  }

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, format, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataLength, true)

  const channels = []
  for (let i = 0; i < numChannels; i++) {
    channels.push(buffer.getChannelData(i))
  }

  let offset = 44
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch]?.[i] ?? 0))
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff
      view.setInt16(offset, int16, true)
      offset += 2
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' })
}
