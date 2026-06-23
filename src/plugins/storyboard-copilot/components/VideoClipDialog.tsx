import { useState, useRef, useEffect, useCallback } from 'react'

import { invoke } from '@tauri-apps/api/core'
import {
  Scissors,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Loader2,
  PlayCircle,
  Camera,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import { getVideoUrl } from '@/utils/asset'
import { saveMediaFile } from '@/utils/mediaStorage'

import { canvasEvents } from '../utils/canvasEvents'

const FPS_OPTIONS = [23.976, 24, 25, 29.97, 30, 50, 60]

interface VideoClipDialogProps {
  open: boolean
  onClose: () => void
  videoUrl: string
  videoDuration?: number
  videoFps?: number
  projectId?: string
  episodeId?: string
  sourceNodeId?: string
  onClipSaved?: (clippedVideoPath: string) => void
}

export function VideoClipDialog({
  open,
  onClose,
  videoUrl,
  videoDuration: propDuration,
  videoFps: propFps,
  projectId,
  episodeId,
  sourceNodeId,
  onClipSaved,
}: VideoClipDialogProps) {
  const { toast } = useToast()
  const videoRef = useRef<HTMLVideoElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(propDuration || 0)
  const [fps, setFps] = useState(propFps || 24)
  const [clipStart, setClipStart] = useState(0)
  const [clipEnd, setClipEnd] = useState(0)
  const [isClipping, setIsClipping] = useState(false)
  const [dragging, setDragging] = useState<'start' | 'end' | 'playhead' | null>(null)
  const [videoLoaded, setVideoLoaded] = useState(false)
  const [isPlayingClip, setIsPlayingClip] = useState(false)
  const [isCapturingFrame, setIsCapturingFrame] = useState(false)

  useEffect(() => {
    if (open) {
      setClipStart(0)
      setCurrentTime(0)
      setIsPlaying(false)
      setVideoLoaded(false)
      setDragging(null)
      setIsPlayingClip(false)
    }
  }, [open])

  useEffect(() => {
    if (videoLoaded && duration > 0) {
      setClipEnd(duration)
    }
  }, [videoLoaded, duration])

  const handleVideoLoaded = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    setDuration(video.duration)
    setVideoLoaded(true)
    if (propFps && propFps > 0) {
      setFps(propFps)
    }
  }, [propFps])

  useEffect(() => {
    if (!open || !videoUrl || !videoLoaded) return
    if (propFps && propFps > 0) return

    const detectFps = async () => {
      try {
        const result = await invoke<{
          duration: number
          width: number
          height: number
          fps: number
          codec: string
        }>('get_video_info', {
          videoPath: videoUrl,
        })
        if (result.fps && result.fps > 0) {
          const detected = result.fps
          const closest = FPS_OPTIONS.reduce((prev, curr) =>
            Math.abs(curr - detected) < Math.abs(prev - detected) ? curr : prev,
          )
          setFps(closest)
        }
      } catch { /* fallback to default */ }
    }
    detectFps()
  }, [open, videoUrl, videoLoaded, propFps])

  const frameDuration = 1 / fps

  const formatTimecode = useCallback(
    (seconds: number) => {
      const h = Math.floor(seconds / 3600)
      const m = Math.floor((seconds % 3600) / 60)
      const s = Math.floor(seconds % 60)
      const f = Math.floor((seconds % 1) * fps)
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`
    },
    [fps],
  )

  const formatShortTime = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = (seconds % 60).toFixed(2)
    return `${m}:${Number(s) < 10 ? '0' : ''}${s}`
  }, [])

  const seekTo = useCallback(
    (time: number) => {
      const video = videoRef.current
      if (!video) return
      const clamped = Math.max(0, Math.min(time, duration))
      video.currentTime = clamped
      setCurrentTime(clamped)
    },
    [duration],
  )

  const stepFrame = useCallback(
    (direction: number) => {
      seekTo(currentTime + direction * frameDuration)
    },
    [currentTime, frameDuration, seekTo],
  )

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (isPlaying) {
      video.pause()
      setIsPlaying(false)
    } else {
      setIsPlayingClip(false)
      video.play()
      setIsPlaying(true)
    }
  }, [isPlaying])

  const playClipRegion = useCallback(() => {
    const video = videoRef.current
    if (!video || clipEnd <= clipStart) return

    setIsPlayingClip(true)
    setIsPlaying(true)
    video.currentTime = clipStart
    video.play()
  }, [clipStart, clipEnd])

  const goToStart = useCallback(() => {
    seekTo(clipStart)
  }, [clipStart, seekTo])

  const goToEnd = useCallback(() => {
    seekTo(clipEnd)
  }, [clipEnd, seekTo])

  const resetClip = useCallback(() => {
    setClipStart(0)
    setClipEnd(duration)
    seekTo(0)
  }, [duration, seekTo])

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    setCurrentTime(video.currentTime)

    if (isPlayingClip && video.currentTime >= clipEnd) {
      video.pause()
      video.currentTime = clipStart
      setIsPlaying(false)
      setIsPlayingClip(false)
    }
  }, [isPlayingClip, clipEnd, clipStart])

  const handleVideoEnded = useCallback(() => {
    setIsPlaying(false)
    setIsPlayingClip(false)
  }, [])

  const playheadPercent = duration > 0 ? (currentTime / duration) * 100 : 0
  const clipStartPercent = duration > 0 ? (clipStart / duration) * 100 : 0
  const clipEndPercent = duration > 0 ? (clipEnd / duration) * 100 : 100
  const clipDuration = clipEnd - clipStart

  const handleTimelineMouseDown = useCallback(
    (e: React.MouseEvent, type: 'start' | 'end' | 'playhead') => {
      e.preventDefault()
      e.stopPropagation()
      setDragging(type)
    },
    [],
  )

  useEffect(() => {
    if (!dragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const timeline = timelineRef.current
      if (!timeline || duration <= 0) return

      const rect = timeline.getBoundingClientRect()
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
      const ratio = x / rect.width
      const time = ratio * duration

      if (dragging === 'start') {
        const newStart = Math.max(0, Math.min(time, clipEnd - frameDuration))
        setClipStart(newStart)
      } else if (dragging === 'end') {
        const newEnd = Math.min(duration, Math.max(time, clipStart + frameDuration))
        setClipEnd(newEnd)
      } else if (dragging === 'playhead') {
        seekTo(time)
      }
    }

    const handleMouseUp = () => {
      setDragging(null)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragging, duration, clipEnd, clipStart, frameDuration, seekTo])

  const handleTimelineClick = useCallback(
    (e: React.MouseEvent) => {
      if (dragging) return
      const timeline = timelineRef.current
      if (!timeline || duration <= 0) return

      const rect = timeline.getBoundingClientRect()
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
      const ratio = x / rect.width
      seekTo(ratio * duration)
    },
    [dragging, duration, seekTo],
  )

  const handleTimecodeInput = useCallback(
    (value: string, type: 'start' | 'end') => {
      const parts = value.split(':').map(Number)
      if (parts.some(isNaN)) return
      let seconds = 0
      if (parts.length === 4) {
        seconds = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0) + (parts[3] || 0) / fps
      } else if (parts.length === 3) {
        seconds = (parts[0] || 0) * 60 + (parts[1] || 0) + (parts[2] || 0) / fps
      } else if (parts.length === 2) {
        seconds = (parts[0] || 0) + (parts[1] || 0) / fps
      }
      seconds = Math.max(0, Math.min(seconds, duration))
      if (type === 'start') {
        setClipStart(Math.min(seconds, clipEnd - frameDuration))
      } else {
        setClipEnd(Math.max(seconds, clipStart + frameDuration))
      }
    },
    [duration, fps, clipEnd, clipStart, frameDuration],
  )

  const handleClip = useCallback(async () => {
    if (!videoUrl || clipDuration <= 0) return

    setIsClipping(true)
    try {
      const outputPath = `${videoUrl}_clip_${Date.now()}.mp4`

      await invoke<string>('export_scene_video', {
        videoPath: videoUrl,
        startTime: clipStart,
        endTime: clipEnd,
        outputPath,
      })

      let savedPath = outputPath
      if (projectId && episodeId) {
        try {
          const { readFile } = await import('@tauri-apps/plugin-fs')
          const fileData = await readFile(outputPath)
          savedPath = await saveMediaFile(fileData, {
            projectId,
            episodeId,
            type: 'video',
            fileName: `clip_${Date.now()}.mp4`,
            extension: 'mp4',
          })
        } catch { /* fallback to raw output path */ }
      }

      toast({ title: '截取成功', description: `片段时长 ${formatShortTime(clipDuration)}` })

      if (sourceNodeId) {
        canvasEvents.emit({
          type: 'addResultNode',
          videoUrl: savedPath,
          sourceNodeId,
          sourceHandleId: 'video',
          noConnect: true,
        })
      } else {
        onClipSaved?.(savedPath)
      }
      onClose()
    } catch (error) {
      toast({
        title: '截取失败',
        description: String(error),
        variant: 'destructive',
      })
    } finally {
      setIsClipping(false)
    }
  }, [videoUrl, clipStart, clipEnd, clipDuration, projectId, episodeId, toast, onClipSaved, onClose, formatShortTime, sourceNodeId])

  const handleCaptureFrame = useCallback(async () => {
    if (!videoUrl || !videoRef.current) return

    setIsCapturingFrame(true)
    try {
      // 使用当前播放时间作为截取时间点
      const captureTime = currentTime

      const outputPath = `${videoUrl}_frame_${Date.now()}.png`

      await invoke<string>('capture_frame', {
        videoPath: videoUrl,
        timestamp: captureTime,
        outputPath,
      })

      let savedPath = outputPath
      if (projectId && episodeId) {
        try {
          const { readFile } = await import('@tauri-apps/plugin-fs')
          const fileData = await readFile(outputPath)
          savedPath = await saveMediaFile(fileData, {
            projectId,
            episodeId,
            type: 'image',
            fileName: `frame_${Date.now()}.png`,
            extension: 'png',
          })
        } catch { /* fallback to raw output path */ }
      }

      toast({ title: '截取单帧成功', description: `时间点: ${formatTimecode(captureTime)}` })

      if (sourceNodeId) {
        canvasEvents.emit({
          type: 'addResultNode',
          imageUrl: savedPath,
          sourceNodeId,
          sourceHandleId: 'image',
          noConnect: true,
        })
      }
    } catch (error) {
      toast({
        title: '截取单帧失败',
        description: String(error),
        variant: 'destructive',
      })
    } finally {
      setIsCapturingFrame(false)
    }
  }, [videoUrl, currentTime, projectId, episodeId, toast, sourceNodeId, formatTimecode])

  const displayUrl = getVideoUrl(videoUrl) || videoUrl

  const currentFrame = Math.floor(currentTime * fps)
  const startFrame = Math.floor(clipStart * fps)
  const endFrame = Math.floor(clipEnd * fps)

  const fpsLabel = FPS_OPTIONS.includes(fps) ? String(fps) : fps.toFixed(3)

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl w-full max-h-[95vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 py-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Scissors className="w-4 h-4" />
            视频截取
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* 视频播放区 */}
          <div className="bg-black flex items-center justify-center" style={{ maxHeight: '50vh' }}>
            <video
              ref={videoRef}
              src={displayUrl}
              className="max-w-full max-h-[50vh] object-contain"
              preload="auto"
              onLoadedMetadata={handleVideoLoaded}
              onTimeUpdate={handleTimeUpdate}
              onEnded={handleVideoEnded}
              onClick={togglePlay}
            />
          </div>

          {/* 播放控制栏 */}
          <div className="px-4 py-2 border-b bg-muted/30 flex items-center gap-1.5">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goToStart} title="跳到截取起点">
              <SkipBack className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => stepFrame(-5)} title="后退5帧">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => stepFrame(-1)} title="后退1帧">
              <span className="text-[10px] font-mono">-1F</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={togglePlay}
              title={isPlaying ? '暂停' : '播放'}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => stepFrame(1)} title="前进1帧">
              <span className="text-[10px] font-mono">+1F</span>
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => stepFrame(5)} title="前进5帧">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goToEnd} title="跳到截取终点">
              <SkipForward className="h-3.5 w-3.5" />
            </Button>

            <div className="w-px h-5 bg-border mx-1" />

            <Button
              variant={isPlayingClip ? 'default' : 'outline'}
              size="sm"
              className="h-7 gap-1 text-[10px] px-2"
              onClick={playClipRegion}
              title="播放选中区域"
            >
              <PlayCircle className="h-3.5 w-3.5" />
              播放选中
            </Button>

            <div className="w-px h-5 bg-border mx-1" />

            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-[10px] px-2"
              onClick={handleCaptureFrame}
              disabled={isCapturingFrame || !videoLoaded}
              title="截取当前帧为图片"
            >
              {isCapturingFrame ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Camera className="h-3.5 w-3.5" />
              )}
              截取单帧
            </Button>

            <div className="flex-1" />

            <div className="text-xs font-mono tabular-nums text-muted-foreground">
              {formatTimecode(currentTime)}
              <span className="mx-1">/</span>
              {formatTimecode(duration)}
            </div>
            <div className="flex items-center gap-1 ml-2">
              <span className="text-[10px] text-muted-foreground">帧 {currentFrame} @</span>
              <Select value={fpsLabel} onValueChange={(v) => setFps(Number(v))}>
                <SelectTrigger className="h-5 w-[58px] text-[10px] border-0 p-0 gap-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FPS_OPTIONS.map((f) => (
                    <SelectItem key={String(f)} value={String(f)} className="text-[11px]">
                      {f}fps
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 时间轴 */}
          <div className="px-4 py-3 space-y-2">
            <div
              ref={timelineRef}
              className="relative h-12 bg-muted/50 rounded-lg cursor-pointer select-none overflow-hidden"
              onClick={handleTimelineClick}
            >
              {/* 时间刻度 */}
              <div className="absolute inset-x-0 top-0 h-3 flex">
                {duration > 0 &&
                  Array.from({ length: Math.min(Math.ceil(duration) + 1, 60) }, (_, i) => i).map((sec) => (
                    <div
                      key={`tick-${sec}`}
                      className="absolute top-0 flex flex-col items-center"
                      style={{ left: `${(sec / duration) * 100}%` }}
                    >
                      <div className="w-px h-2 bg-border" />
                      <span className="text-[7px] text-muted-foreground leading-none mt-0.5">
                        {sec}s
                      </span>
                    </div>
                  ))}
              </div>

              {/* 截取区域高亮 */}
              <div
                className="absolute top-3 bottom-0 bg-primary/15 border-y-2 border-primary/40"
                style={{
                  left: `${clipStartPercent}%`,
                  width: `${clipEndPercent - clipStartPercent}%`,
                }}
              />

              {/* 非截取区域遮罩 */}
              <div
                className="absolute top-3 bottom-0 bg-black/20"
                style={{ left: 0, width: `${clipStartPercent}%` }}
              />
              <div
                className="absolute top-3 bottom-0 bg-black/20"
                style={{ left: `${clipEndPercent}%`, right: 0 }}
              />

              {/* 起点手柄 */}
              <div
                className="absolute top-0 bottom-0 w-3 cursor-ew-resize z-10 flex items-center justify-center group"
                style={{ left: `calc(${clipStartPercent}% - 6px)` }}
                onMouseDown={(e) => handleTimelineMouseDown(e, 'start')}
              >
                <div className="w-1 h-8 bg-primary rounded-full group-hover:w-1.5 transition-all shadow-sm" />
              </div>

              {/* 终点手柄 */}
              <div
                className="absolute top-0 bottom-0 w-3 cursor-ew-resize z-10 flex items-center justify-center group"
                style={{ left: `calc(${clipEndPercent}% - 6px)` }}
                onMouseDown={(e) => handleTimelineMouseDown(e, 'end')}
              >
                <div className="w-1 h-8 bg-primary rounded-full group-hover:w-1.5 transition-all shadow-sm" />
              </div>

              {/* 播放头 */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
                style={{ left: `${playheadPercent}%` }}
              >
                <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 bg-red-500 rounded-full" />
              </div>
            </div>

            {/* 时间轴标签 */}
            <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
              <span>0:00</span>
              <span>{formatShortTime(duration)}</span>
            </div>
          </div>

          {/* 截取时间信息 */}
          <div className="px-4 pb-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {/* 起点 */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">起点</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={formatTimecode(clipStart)}
                    onChange={(e) => handleTimecodeInput(e.target.value, 'start')}
                    className="flex-1 h-8 px-2 text-xs font-mono tabular-nums border rounded-md bg-background text-center"
                    title="格式: HH:MM:SS:FF"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[10px] shrink-0"
                    onClick={() => {
                      setClipStart(currentTime)
                      if (currentTime > clipEnd - frameDuration) {
                        setClipEnd(currentTime + frameDuration)
                      }
                    }}
                  >
                    设为当前
                  </Button>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  帧 {startFrame} · {formatShortTime(clipStart)}
                </div>
              </div>

              {/* 终点 */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">终点</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={formatTimecode(clipEnd)}
                    onChange={(e) => handleTimecodeInput(e.target.value, 'end')}
                    className="flex-1 h-8 px-2 text-xs font-mono tabular-nums border rounded-md bg-background text-center"
                    title="格式: HH:MM:SS:FF"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[10px] shrink-0"
                    onClick={() => {
                      setClipEnd(currentTime)
                      if (currentTime < clipStart + frameDuration) {
                        setClipStart(Math.max(0, currentTime - frameDuration))
                      }
                    }}
                  >
                    设为当前
                  </Button>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  帧 {endFrame} · {formatShortTime(clipEnd)}
                </div>
              </div>
            </div>

            {/* 截取时长 */}
            <div className="flex items-center justify-center gap-3 py-2 px-4 rounded-lg bg-muted/30">
              <span className="text-xs text-muted-foreground">截取时长</span>
              <span className={cn('text-sm font-mono font-semibold tabular-nums', clipDuration > 0 ? 'text-primary' : 'text-destructive')}>
                {formatTimecode(clipDuration)}
              </span>
              <span className="text-xs text-muted-foreground">
                ({endFrame - startFrame} 帧)
              </span>
            </div>

            {/* 快捷截取 */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">快捷截取:</span>
              {[1, 2, 3, 5, 10].map((sec) => (
                <Button
                  key={sec}
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={() => {
                    setClipStart(Math.max(0, currentTime))
                    setClipEnd(Math.min(duration, currentTime + sec))
                  }}
                >
                  {sec}s
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={() => {
                  setClipStart(currentTime)
                  setClipEnd(duration)
                }}
              >
                到结尾
              </Button>
            </div>
          </div>
        </div>

        {/* 底部操作 */}
        <div className="px-5 py-3 border-t bg-muted/30 flex items-center justify-between shrink-0">
          <Button variant="outline" size="sm" onClick={resetClip} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            重置
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={playClipRegion}
              disabled={clipDuration <= 0}
              className="gap-1.5"
            >
              <PlayCircle className="h-3.5 w-3.5" />
              播放选中
            </Button>
            <Button variant="outline" size="sm" onClick={onClose}>
              取消
            </Button>
            <Button
              size="sm"
              onClick={handleClip}
              disabled={isClipping || clipDuration <= 0}
              className="gap-1.5"
            >
              {isClipping ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Scissors className="h-3.5 w-3.5" />
              )}
              截取片段
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
