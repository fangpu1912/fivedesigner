import { memo, useCallback, useState, useEffect, useRef } from 'react'

import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react'
import {
  Scan, Copy, Check, RotateCcw, Loader2,
  ChevronDown, X, Sparkles, User, Mountain, Tag,
  Play, Pause, Volume2, VolumeX,
} from 'lucide-react'

import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import { AI } from '@/services/vendor'
import { getImageUrl } from '@/utils/asset'

import { useEnlargedHandles } from '../../hooks/useEnlargedHandles'
import { useUpstreamData } from '../../hooks/useUpstreamData'

import { NodeResizeHandle } from './NodeResizeHandle'
import { getNodeContainerClass, getSourceHandleClass, getTargetHandleClass } from './NodeStyles'

import type { VideoReverseNodeData } from '../../types'

type AnalysisMode = 'quick' | 'full' | 'characters' | 'scenes'

interface ExtractedFrame {
  timestamp: number
  imageUrl: string | null
  selected: boolean
}

interface AnalysisResult {
  description: string
  summary: string
  characters: Array<{ name: string; description: string; prompt: string }>
  scenes: Array<{ name: string; description: string; prompt: string }>
  tags: string[]
}

const MODE_OPTIONS: Array<{ value: AnalysisMode; label: string; hint: string }> = [
  { value: 'quick', label: '快速摘要', hint: '简要描述视频内容' },
  { value: 'full', label: '完整分析', hint: '角色+场景+标签全量提取' },
  { value: 'characters', label: '角色提取', hint: '专注提取角色信息' },
  { value: 'scenes', label: '场景提取', hint: '专注提取场景信息' },
]

const DEFAULT_INTERVAL = 2

function modeToPrompt(mode: AnalysisMode): string {
  const base = '你是专业的影视分析专家。请分析这些视频关键帧。'
  switch (mode) {
    case 'quick':
      return `${base}请用中文简要总结视频内容（50字以内），并提取3-5个关键词标签。\n\n请严格按JSON格式输出：\n{"summary":"...","tags":["标签1","标签2"]}`
    case 'characters':
      return `${base}请专注提取所有出场的角色信息，为每个角色生成可用于AI生图的提示词。\n\n请严格按JSON格式输出：\n{"characters":[{"name":"角色名","description":"外貌、性格、职业","prompt":"AI生图提示词（中文，包含：人物名+年龄段+体型+五官+发型+肤色+服装+配饰+姿态+表情）"}]}`
    case 'scenes':
      return `${base}请专注提取所有场景/环境信息，为每个场景生成可用于AI生图的提示词。\n\n请严格按JSON格式输出：\n{"scenes":[{"name":"场景名","description":"环境、氛围、时间","prompt":"AI生图提示词（中文，包含：视角+时间段+天气+地理位置+环境元素+材质+颜色+光线+色调）"}]}`
    case 'full':
      return `${base}请提取完整的视频信息，包括角色、场景和整体描述。\n\n请严格按JSON格式输出：\n{"description":"视频整体描述","summary":"100字以内摘要","characters":[{"name":"角色名","description":"外貌、性格、职业","prompt":"AI生图提示词（中文，包含：人物名+年龄段+体型+五官+发型+肤色+服装+配饰+姿态+表情）"}],"scenes":[{"name":"场景名","description":"环境、氛围、时间","prompt":"AI生图提示词（中文，包含：视角+时间段+天气+地理位置+环境元素+材质+颜色+光线+色调）"}],"tags":["标签1","标签2","标签3"]}`
  }
}

function captureFrameFromVideo(video: HTMLVideoElement): string | null {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 320
    canvas.height = video.videoHeight || 180
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.8)
  } catch {
    return null
  }
}

function seekAndCapture(video: HTMLVideoElement, timeSeconds: number): Promise<string | null> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked)
      resolve(captureFrameFromVideo(video))
    }
    video.addEventListener('seeked', onSeeked, { once: true })
    video.currentTime = Math.max(0, Math.min(timeSeconds, video.duration || 0))
  })
}

function parseResult(content: string): AnalysisResult {
  const result: AnalysisResult = { description: '', summary: '', characters: [], scenes: [], tags: [] }
  try {
    let jsonStr = content
    const mdMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    if (mdMatch) {
      const captured = mdMatch[1]
      if (captured) jsonStr = captured
    }
    else {
      const s = content.indexOf('{'), e = content.lastIndexOf('}')
      if (s !== -1 && e > s) jsonStr = content.substring(s, e + 1)
    }
    const p = JSON.parse(jsonStr)
    result.description = p.description || ''
    result.summary = p.summary || ''
    result.characters = (p.characters || []).map((c: Record<string, unknown>) => ({
      name: String(c.name || ''), description: String(c.description || ''), prompt: String(c.prompt || ''),
    }))
    result.scenes = (p.scenes || []).map((s: Record<string, unknown>) => ({
      name: String(s.name || ''), description: String(s.description || ''), prompt: String(s.prompt || ''),
    }))
    result.tags = p.tags || []
  } catch { result.description = content }
  return result
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface VideoReverseNodeProps extends NodeProps {
  data: VideoReverseNodeData
}

export const VideoReverseNode = memo(({ id, data, selected }: VideoReverseNodeProps) => {
  const { updateNodeData } = useReactFlow()
  const { toast } = useToast()
  const { upstreamVideo } = useUpstreamData(id)
  const enlargedHandles = useEnlargedHandles(id)
  const videoRef = useRef<HTMLVideoElement>(null)
  const upstreamVideoRef = useRef<string | null>(null)

  const [mode, setMode] = useState<AnalysisMode>('full')
  const [modeOpen, setModeOpen] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [frames, setFrames] = useState<ExtractedFrame[]>([])
  const [activeTab, setActiveTab] = useState<'characters' | 'scenes' | 'summary'>('summary')
  const [copied, setCopied] = useState(false)
  const [status, setStatus] = useState<'empty' | 'ready' | 'extracting' | 'frames_ready' | 'analyzing' | 'done' | 'error'>('empty')
  const [errorMsg, setErrorMsg] = useState('')
  const [result, setResult] = useState<AnalysisResult>({
    description: data.description || '',
    summary: data.summary || '',
    characters: data.characters || [],
    scenes: data.scenes || [],
    tags: data.tags || [],
  })
  const [videoReady, setVideoReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(true)
  const [showControls, setShowControls] = useState(false)
  const modeMenuRef = useRef<HTMLDivElement>(null)
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const displayUrl = data.videoUrl ? getImageUrl(data.videoUrl) : null

  useEffect(() => {
    if (upstreamVideo && upstreamVideo !== data.videoUrl) {
      upstreamVideoRef.current = upstreamVideo
      updateNodeData(id, { ...data, videoUrl: upstreamVideo })
      setStatus('ready')
      setVideoReady(false)
    } else if (!upstreamVideo && upstreamVideoRef.current && data.videoUrl === upstreamVideoRef.current) {
      upstreamVideoRef.current = null
      updateNodeData(id, { ...data, videoUrl: null })
      setStatus('empty')
      setVideoReady(false)
    }
  }, [upstreamVideo, data, id, updateNodeData])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onLoadedMetadata = () => {
      setDuration(video.duration)
      setVideoReady(true)
      setStatus('ready')
    }
    const onTimeUpdate = () => setCurrentTime(video.currentTime)
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onEnded = () => setIsPlaying(false)
    const onError = () => {
      setVideoReady(false)
      setErrorMsg('视频加载失败')
      setStatus('error')
    }

    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onEnded)
    video.addEventListener('error', onError)

    if (video.readyState >= 1) {
      setDuration(video.duration)
      setVideoReady(true)
      setStatus('ready')
    }

    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('error', onError)
    }
  }, [displayUrl])

  useEffect(() => {
    if (result.description || result.summary) {
      updateNodeData(id, {
        ...data,
        description: result.description,
        summary: result.summary,
        characters: result.characters,
        scenes: result.scenes,
        prompt: result.description || result.summary,
        tags: result.tags,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (modeMenuRef.current && !modeMenuRef.current.contains(e.target as Node)) setModeOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  useEffect(() => () => {
    if (videoRef.current && videoRef.current.src) {
      videoRef.current.removeAttribute('src')
      videoRef.current.load()
    }
  }, [])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) { video.play().catch(() => {}) }
    else { video.pause() }
  }, [])

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current
    if (!video) return
    const t = Number(e.target.value)
    video.currentTime = t
    setCurrentTime(t)
  }, [])

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setIsMuted(video.muted)
  }, [])

  const showControlsTemp = useCallback(() => {
    setShowControls(true)
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current)
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000)
  }, [])

  const handleExtractFrames = useCallback(async () => {
    const video = videoRef.current
    if (!video || !displayUrl || !videoReady) return

    if (!video.duration || video.duration <= 0) {
      toast({ title: '无法获取视频时长', variant: 'destructive' })
      return
    }

    setStatus('extracting')
    setErrorMsg('')

    const wasPlaying = !video.paused
    if (wasPlaying) video.pause()
    const savedTime = video.currentTime

    try {
      const dur = video.duration
      const interval = DEFAULT_INTERVAL
      const count = Math.max(3, Math.min(8, Math.floor(dur / interval)))
      const newFrames: ExtractedFrame[] = []

      for (let i = 0; i < count; i++) {
        const t = Math.min((i + 1) * interval, dur - 0.1)
        if (t <= 0) continue
        const dataUrl = await seekAndCapture(video, t)
        newFrames.push({ timestamp: Math.round(t * 10) / 10, imageUrl: dataUrl, selected: true })
      }

      video.currentTime = savedTime
      if (wasPlaying) video.play().catch(() => {})

      setFrames(newFrames)
      setStatus('frames_ready')
    } catch (error) {
      video.currentTime = savedTime
      if (wasPlaying) video.play().catch(() => {})
      setErrorMsg(String(error))
      setStatus('error')
    }
  }, [displayUrl, videoReady, toast])

  const toggleFrame = useCallback((timestamp: number) => {
    setFrames((prev) => prev.map((f) => (f.timestamp === timestamp ? { ...f, selected: !f.selected } : f)))
  }, [])

  const addFrameFromCurrent = useCallback(async () => {
    const video = videoRef.current
    if (!video) return
    const t = video.currentTime
    const exists = frames.some((f) => Math.abs(f.timestamp - t) < 0.5)
    if (exists) { toast({ title: '该时间点已有帧', variant: 'destructive' }); return }
    const dataUrl = captureFrameFromVideo(video)
    if (dataUrl) {
      setFrames((prev) => [...prev, { timestamp: Math.round(t * 10) / 10, imageUrl: dataUrl, selected: true }].sort((a, b) => a.timestamp - b.timestamp))
    }
  }, [frames, toast])

  const removeFrame = useCallback((timestamp: number) => {
    setFrames((prev) => prev.filter((f) => f.timestamp !== timestamp))
  }, [])

  const handleAnalyze = useCallback(async () => {
    const selectedFrames = frames.filter((f) => f.selected)
    if (selectedFrames.length === 0) {
      toast({ title: '请先提取并选择关键帧', variant: 'destructive' })
      return
    }

    setStatus('analyzing')
    setErrorMsg('')

    try {
      const prompt = customPrompt || modeToPrompt(mode)
      const messages: Array<{ role: string; content: string }> = [{ role: 'user', content: prompt }]

      for (const frame of selectedFrames) {
        if (frame.imageUrl) {
          messages.push({ role: 'user', content: `[时间点: ${frame.timestamp}s]` })
          messages.push({ role: 'user', content: frame.imageUrl })
        }
      }

      const aiResult = await AI.VL.analyze({
        messages: messages as Array<{ role: string; content: string }>,
        temperature: 0.7,
        maxTokens: 4096,
      })

      const content = typeof aiResult === 'string' ? aiResult : ''
      const parsed = parseResult(content)
      setResult(parsed)
      setStatus('done')
      toast({ title: '分析完成' })
    } catch (error) {
      setErrorMsg(String(error))
      setStatus('error')
      toast({ title: '分析失败', description: String(error), variant: 'destructive' })
    }
  }, [frames, mode, customPrompt, toast])

  const handleReset = useCallback(() => {
    setResult({ description: '', summary: '', characters: [], scenes: [], tags: [] })
    setFrames([])
    setStatus(displayUrl ? 'ready' : 'empty')
    setErrorMsg('')
  }, [displayUrl])

  const handleCopy = useCallback(() => {
    let text = ''
    if (activeTab === 'summary') {
      const parts: string[] = []
      if (result.description) parts.push(result.description)
      if (result.summary) parts.push(result.summary)
      if (result.tags.length > 0) parts.push(`标签: ${result.tags.join(', ')}`)
      text = parts.join('\n\n')
    } else if (activeTab === 'characters') {
      text = result.characters.map((c) => `${c.name}: ${c.description}`).join('\n\n')
    } else {
      text = result.scenes.map((s) => `${s.name}: ${s.description}`).join('\n\n')
    }
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [activeTab, result])

  const hasResult = result.description || result.summary || result.characters.length > 0 || result.scenes.length > 0
  const isProcessing = status === 'extracting' || status === 'analyzing'
  const selectedCount = frames.filter((f) => f.selected).length

  return (
    <div
      className={getNodeContainerClass(selected)}
      style={{ width: 420 }}
    >
      <div className="flex items-center justify-between px-3 py-2 text-xs font-medium border-b bg-muted/30 node-header">
        <div className="flex items-center gap-1.5">
          <Scan className="h-3.5 w-3.5 text-primary" />
          <span>视频反推</span>
        </div>
        <div className="flex items-center gap-1">
          {hasResult && !isProcessing && (
            <button
              onClick={handleReset}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1 hover:bg-muted rounded transition-colors"
              title="重置"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col">
        {displayUrl ? (
          <div
            className="relative bg-black group/video"
            onMouseEnter={showControlsTemp}
            onMouseMove={showControlsTemp}
            onMouseLeave={() => setShowControls(false)}
          >
            <video
              ref={videoRef}
              src={displayUrl}
              className="w-full h-44 object-contain cursor-pointer"
              preload="metadata"
              muted
              playsInline
              onClick={togglePlay}
            />

            {!videoReady && status !== 'error' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <Loader2 className="h-6 w-6 text-white animate-spin" />
              </div>
            )}

            {(status === 'extracting' || status === 'analyzing') && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
                <Loader2 className="h-6 w-6 text-white animate-spin mb-2" />
                <span className="text-white text-xs">
                  {status === 'extracting' ? '提取关键帧...' : 'AI 分析中...'}
                </span>
              </div>
            )}

            {status === 'error' && errorMsg && !hasResult && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-500/20">
                <X className="h-6 w-6 text-red-400 mb-1" />
                <span className="text-red-400 text-xs px-4 text-center">{errorMsg}</span>
              </div>
            )}

            <div className={cn(
              'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent pt-6 pb-1 px-2 transition-opacity duration-200',
              showControls || !videoReady ? 'opacity-100' : 'opacity-0 group-hover/video:opacity-100',
            )}>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={togglePlay}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="p-1 text-white/90 hover:text-white transition-colors"
                >
                  {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </button>

                <span className="text-[10px] text-white/70 font-mono w-16 text-right tabular-nums">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>

                <input
                  type="range"
                  min={0}
                  max={duration || 0}
                  step={0.1}
                  value={currentTime}
                  onChange={handleSeek}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="flex-1 h-1 accent-primary cursor-pointer"
                />

                <button
                  onClick={toggleMute}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="p-1 text-white/70 hover:text-white transition-colors"
                >
                  {isMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-44 flex-col items-center justify-center gap-3 text-muted-foreground border-b bg-muted/20">
            <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center">
              <Scan className="h-6 w-6 opacity-30" />
            </div>
            <div className="text-center">
              <p className="text-xs font-medium">连接上游视频节点</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">将视频节点的输出连接到此处</p>
            </div>
          </div>
        )}

        {displayUrl && videoReady && !isProcessing && status !== 'error' && (
          <div className="border-b">
            <div className="flex items-center gap-2 px-3 py-2">
              <div ref={modeMenuRef} className="relative">
                <button
                  onClick={() => setModeOpen(!modeOpen)}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border bg-background hover:bg-muted/50 transition-colors"
                >
                  <span className="max-w-[80px] truncate">{MODE_OPTIONS.find((m) => m.value === mode)?.label}</span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </button>
                {modeOpen && (
                  <div className="absolute top-full left-0 mt-1 w-48 bg-popover border rounded-lg shadow-xl z-50 py-1.5">
                    {MODE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => { setMode(opt.value); setModeOpen(false) }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className={cn(
                          'w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors',
                          mode === opt.value && 'bg-muted font-medium',
                        )}
                      >
                        <div>{opt.label}</div>
                        <div className="text-[10px] text-muted-foreground">{opt.hint}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={() => setPromptOpen(!promptOpen)}
                onPointerDown={(e) => e.stopPropagation()}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-md border transition-colors',
                  promptOpen || customPrompt ? 'bg-primary/10 border-primary/30 text-primary' : 'hover:bg-muted/50',
                )}
              >
                自定义提示词
              </button>

              <button
                onClick={handleExtractFrames}
                onPointerDown={(e) => e.stopPropagation()}
                className="ml-auto px-3 py-1 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                自动提取
              </button>
            </div>

            {promptOpen && (
              <div className="px-3 pb-2">
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder={modeToPrompt(mode)}
                  className="w-full h-20 text-xs p-2.5 border rounded-md resize-none bg-muted/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </div>
        )}

        {frames.length > 0 && !isProcessing && (
          <div className="border-b">
            <div className="flex items-center px-3 py-2">
              <span className="text-[11px] font-medium text-muted-foreground">
                关键帧 <span className="text-foreground">{selectedCount}</span>/<span>{frames.length}</span>
              </span>
              <div className="flex items-center gap-1.5 ml-auto">
                <button
                  onClick={addFrameFromCurrent}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  截取当前帧
                </button>
                <button
                  onClick={handleAnalyze}
                  disabled={selectedCount === 0}
                  onPointerDown={(e) => e.stopPropagation()}
                  className={cn(
                    'flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium transition-all',
                    selectedCount > 0
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'
                      : 'bg-muted text-muted-foreground cursor-not-allowed',
                  )}
                >
                  <Sparkles className="h-3 w-3" />
                  开始分析
                </button>
              </div>
            </div>
            <div className="flex gap-2 px-3 pb-2.5 overflow-x-auto">
              {frames.map((frame) => (
                <div key={frame.timestamp} className="relative flex-shrink-0 group/frame">
                  <button
                    onClick={() => toggleFrame(frame.timestamp)}
                    onPointerDown={(e) => e.stopPropagation()}
                    className={cn(
                      'relative w-[72px] h-[48px] rounded-md overflow-hidden border-2 transition-all duration-150',
                      frame.selected
                        ? 'border-primary shadow-[0_0_0_1px_rgba(59,130,246,0.4)]'
                        : 'border-transparent opacity-65 hover:opacity-100 hover:border-white/30',
                    )}
                  >
                    {frame.imageUrl ? (
                      <img src={frame.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-muted text-[9px] text-muted-foreground">
                        错误
                      </div>
                    )}
                    <span className="absolute bottom-0 left-0 right-0 text-center text-[9px] leading-tight bg-black/55 text-white py-0.5 font-mono">
                      {formatTime(frame.timestamp)}
                    </span>
                  </button>
                  <button
                    onClick={() => removeFrame(frame.timestamp)}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="absolute -top-1.5 -right-1.5 h-4 w-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover/frame:opacity-100 transition-opacity shadow-sm"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {status === 'error' && hasResult && !isProcessing && (
          <div className="px-3 py-2 text-xs text-destructive border-b bg-destructive/5 flex items-center gap-2">
            <X className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">上次分析失败: {errorMsg || '未知错误'}</span>
          </div>
        )}

        {hasResult && !isProcessing && (
          <div className="flex flex-col" style={{ maxHeight: 300 }}>
            <div className="flex items-center border-b px-1">
              {[
                { key: 'summary' as const, label: '摘要', icon: Tag },
                { key: 'characters' as const, label: '角色', icon: User, count: result.characters.length },
                { key: 'scenes' as const, label: '场景', icon: Mountain, count: result.scenes.length },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  onPointerDown={(e) => e.stopPropagation()}
                  className={cn(
                    'flex items-center gap-1 px-3 py-2 text-[11px] font-medium transition-colors border-b-2 -mb-px',
                    activeTab === tab.key
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  <tab.icon className="h-3 w-3" />
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className={cn(
                      'text-[10px] ml-0.5',
                      activeTab === tab.key ? 'text-primary/70' : 'text-muted-foreground/60',
                    )}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
              <button
                onClick={handleCopy}
                onPointerDown={(e) => e.stopPropagation()}
                className="ml-auto p-1.5 hover:bg-muted rounded-md transition-colors"
                title="复制内容"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>

            <div className="overflow-y-auto p-3" style={{ maxHeight: 260 }}>
              {activeTab === 'summary' && (
                <div className="space-y-3">
                  {result.description && (
                    <div className="p-3 bg-muted/20 rounded-lg border border-border/40">
                      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                        整体描述
                      </div>
                      <p className="text-xs leading-relaxed whitespace-pre-wrap">{result.description}</p>
                    </div>
                  )}
                  {result.summary && (
                    <div className="p-3 bg-muted/20 rounded-lg border border-border/40">
                      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                        摘要
                      </div>
                      <p className="text-xs leading-relaxed">{result.summary}</p>
                    </div>
                  )}
                  {result.tags.length > 0 && (
                    <div>
                      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                        标签
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {result.tags.map((tag) => (
                          <span key={tag} className="px-2 py-1 bg-muted/50 rounded-md text-[11px] text-muted-foreground border border-border/30">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'characters' && (
                result.characters.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                    <div className="h-10 w-10 rounded-full bg-muted/30 flex items-center justify-center">
                      <User className="h-5 w-5 opacity-30" />
                    </div>
                    <span className="text-xs">未识别到角色</span>
                    <span className="text-[10px] text-muted-foreground/60">尝试切换为「完整分析」或「角色提取」模式</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {result.characters.map((c, i) => (
                      <div key={c.name || `char-${i}`} className="p-3 bg-muted/20 rounded-lg border border-border/40 hover:border-border/60 transition-colors">
                        <div className="flex items-center gap-2.5 mb-2">
                          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <User className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <div>
                            <span className="text-xs font-semibold">{c.name || '未命名角色'}</span>
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">{c.description}</p>
                        {c.prompt && (
                          <div className="p-2 bg-background/50 rounded-md border border-border/30 text-[10px] text-muted-foreground font-mono leading-relaxed break-all">
                            {c.prompt}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}

              {activeTab === 'scenes' && (
                result.scenes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                    <div className="h-10 w-10 rounded-full bg-muted/30 flex items-center justify-center">
                      <Mountain className="h-5 w-5 opacity-30" />
                    </div>
                    <span className="text-xs">未识别到场景</span>
                    <span className="text-[10px] text-muted-foreground/60">尝试切换为「完整分析」或「场景提取」模式</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {result.scenes.map((s, i) => (
                      <div key={s.name || `scene-${i}`} className="p-3 bg-muted/20 rounded-lg border border-border/40 hover:border-border/60 transition-colors">
                        <div className="flex items-center gap-2.5 mb-2">
                          <div className="h-7 w-7 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                            <Mountain className="h-3.5 w-3.5 text-emerald-500" />
                          </div>
                          <div>
                            <span className="text-xs font-semibold">{s.name || '未命名场景'}</span>
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">{s.description}</p>
                        {s.prompt && (
                          <div className="p-2 bg-background/50 rounded-md border border-border/30 text-[10px] text-muted-foreground font-mono leading-relaxed break-all">
                            {s.prompt}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </div>

      <Handle
        type="target"
        id="target"
        position={Position.Left}
        className={getTargetHandleClass(undefined, enlargedHandles.target)}
      />

      <Handle
        type="source"
        id="prompt"
        position={Position.Right}
        className={getSourceHandleClass(undefined, enlargedHandles.source)}
      />

      <NodeResizeHandle />
    </div>
  )
})

VideoReverseNode.displayName = 'VideoReverseNode'