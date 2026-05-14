import { memo, useCallback, useEffect, useState, useRef, useMemo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Play, Loader2, Video, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { NodePromptInput, type MentionInputRef } from './NodePromptInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { VendorModelSelector } from '@/components/ai/VendorModelSelector'
import { useToast } from '@/hooks/useToast'
import { useVideoGeneration } from '@/hooks/useVendorGeneration'
import { useUIStore } from '@/store/useUIStore'
import { useProjectQuery } from '@/hooks/useProjects'
import { useTaskQueueStore } from '@/store/useTaskQueueStore'
import { getImageUrl, getVideoUrl } from '@/utils/asset'
import { useUpstreamData } from '../../hooks/useUpstreamData'
import { canvasEvents } from '../../utils/canvasEvents'
import { useEnlargedHandles } from '../../hooks/useEnlargedHandles'

import type { VideoGenNodeData } from '../../types'
import { IMAGE_ASPECT_RATIOS } from '../../types'
import { getNodeContainerClass, getTargetHandleClass, getSourceHandleClass, NODE_HEADER_FLOATING_CLASS, NODE_HEADER_CLASSES } from './NodeStyles'

interface VideoGenNodeProps extends NodeProps {
  data: VideoGenNodeData
}

export const VideoGenNode = memo(({ id, data, selected }: VideoGenNodeProps) => {
  const { toast } = useToast()
  const videoGen = useVideoGeneration()
  const currentProjectId = useUIStore(state => state.currentProjectId)
  const currentEpisodeId = useUIStore(state => state.currentEpisodeId)
  const { data: currentProject } = useProjectQuery(currentProjectId || '')
  const { getUpstreamImageData, getUpstreamTextData, upstreamImage, upstreamText, upstreamImages } = useUpstreamData(id)

  const [items, setItems] = useState(data.items || [])
  const [model, setModel] = useState(data.model || '')
  const [duration, setDuration] = useState(data.duration || 5)
  const [generateAudio, setGenerateAudio] = useState(data.generateAudio ?? true)
  const [isRunning, setIsRunning] = useState(data.isRunning || false)
  const [currentIndex, setCurrentIndex] = useState(data.currentIndex || 0)
  const [prompt, setPrompt] = useState('')
  const promptInputRef = useRef<MentionInputRef>(null)
  const upstreamPromptRef = useRef<string | null>(null)

  const tasks = useTaskQueueStore((s) => s.tasks)
  const videoTaskProgress = useMemo(() => {
    const runningVideoTask = tasks.find(
      (t) => t.type === 'video_generation' && t.status === 'running'
    )
    return runningVideoTask?.progress ?? 0
  }, [tasks])

  const projectAspectRatio = currentProject?.aspect_ratio
  const isValidProjectRatio = projectAspectRatio && IMAGE_ASPECT_RATIOS.includes(projectAspectRatio as typeof IMAGE_ASPECT_RATIOS[number])
  const [aspectRatio, setAspectRatio] = useState(data.aspectRatio || (isValidProjectRatio ? projectAspectRatio : '16:9'))
  const [motionStrength, setMotionStrength] = useState(data.motionStrength || 5)
  const [fps, _setFps] = useState(data.fps || 24)
  const [previewVideo, setPreviewVideo] = useState<string | null>(null)
  const enlargedHandles = useEnlargedHandles(id)

  useEffect(() => {
    if (upstreamText) {
      upstreamPromptRef.current = upstreamText
      if (!prompt) {
        setPrompt(upstreamText)
      }
    } else {
      if (upstreamPromptRef.current && prompt === upstreamPromptRef.current) {
        setPrompt('')
      }
      upstreamPromptRef.current = null
    }
  }, [upstreamText, prompt])

  useEffect(() => {
    if (!upstreamImage && items.length > 0) {
      const hasUpstreamData = items.some(item => item.firstFrameUrl || (item.referenceImages && item.referenceImages.length > 0))
      if (hasUpstreamData) {
        setItems(prev => prev.map(item => ({
          ...item,
          firstFrameUrl: null,
          referenceImages: [],
        })))
      }
    } else if (upstreamImage && items.length > 0) {
      setItems(prev => prev.map(item => {
        if (!item.firstFrameUrl) {
          return { ...item, firstFrameUrl: upstreamImage }
        }
        return item
      }))
    }
  }, [upstreamImage, items.length])

  // 当上游传入items时，同步
  useEffect(() => {
    if (data.items && data.items.length > 0) {
      setItems(data.items)
    }
  }, [data.items])

  // 当项目比例变化时，优先同步项目比例（如果节点没有手动设置过）
  useEffect(() => {
    if (isValidProjectRatio && !data._aspectRatioManuallySet) {
      setAspectRatio(projectAspectRatio)
      data.aspectRatio = projectAspectRatio
    }
  }, [projectAspectRatio, isValidProjectRatio, data])

  data.model = model
  data.duration = duration
  data.generateAudio = generateAudio
  data.aspectRatio = aspectRatio
  data.motionStrength = motionStrength
  data.fps = fps

  const handleStart = useCallback(async () => {
    if (!currentProjectId) {
      toast({ title: '请先选择项目', variant: 'destructive' })
      return
    }

    if (!currentEpisodeId) {
      toast({ title: '请先选择剧集', variant: 'destructive' })
      return
    }

    if (!model) {
      toast({ title: '请先选择模型', variant: 'destructive' })
      return
    }

    // 如果有文本输入框的内容但没有items，创建单个item
    let targetItems = items
    if (targetItems.length === 0 && prompt.trim()) {
      const upstreamImage = getUpstreamImageData()
      const resolved = promptInputRef.current?.getResolvedPrompt()
      const mentionImages = resolved?.referenceImages || []
      targetItems = [{
        id: `item_${Date.now()}_0`,
        name: '手动输入',
        prompt: prompt,
        videoPrompt: prompt,
        firstFrameUrl: upstreamImage || null,
        referenceImages: mentionImages.length > 0 ? mentionImages : [],
        videoUrl: null,
        status: 'pending' as const,
      }]
      setItems(targetItems)
    }

    if (targetItems.length === 0) {
      toast({ title: '请输入提示词或连接上游节点', variant: 'destructive' })
      return
    }

    setIsRunning(true)
    data.isRunning = true

    const projectId = currentProjectId
    const episodeId = currentEpisodeId
    const updatedItems = [...targetItems]

    for (let i = currentIndex; i < updatedItems.length; i++) {
      const item = updatedItems[i]
      if (!item || item.status === 'completed' || item.status === 'failed') continue

      // 检查提示词是否为空
      const effectivePrompt = item.videoPrompt || item.prompt || prompt
      if (!effectivePrompt.trim()) {
        toast({ title: `分镜 ${i + 1} 提示词为空，跳过`, variant: 'destructive' })
        updatedItems[i] = { ...item, status: 'failed' }
        setItems([...updatedItems])
        continue
      }

      setCurrentIndex(i)
      data.currentIndex = i
      updatedItems[i] = { ...item, status: 'generating' }
      setItems([...updatedItems])

      try {
        const resultUrl = await videoGen.mutateAsync({
          prompt: effectivePrompt,
          firstFrame: item.firstFrameUrl || undefined,
          referenceImages: item.referenceImages || undefined,
          duration,
          generateAudio,
          model,
          projectId,
          episodeId,
        })

        data.rawVideoUrl = resultUrl
        data.videoUrl = resultUrl
        updatedItems[i] = { ...item, status: 'completed', videoUrl: resultUrl }
        setItems([...updatedItems])
        data.items = updatedItems

        canvasEvents.emit({
          type: 'propagateData',
          sourceNodeId: id,
          data: {},
        })

        canvasEvents.emit({
          type: 'addResultNode',
          videoUrl: resultUrl,
          sourceNodeId: id,
          sourceHandleId: 'videos',
        })
      } catch (err) {
        updatedItems[i] = { ...item, status: 'failed' }
        setItems([...updatedItems])
        data.items = updatedItems
      }
    }

    setIsRunning(false)
    data.isRunning = false
    const completed = updatedItems.filter(i => i.status === 'completed').length
    toast({ title: '视频生成完成', description: `${completed}/${updatedItems.length} 成功` })
  }, [items, prompt, model, duration, generateAudio, currentIndex, currentProjectId, currentEpisodeId, toast, data, videoGen, getUpstreamImageData])

  const handleStop = useCallback(() => {
    setIsRunning(false)
    data.isRunning = false
  }, [data])

  const completedCount = items.filter(i => i.status === 'completed').length
  const failedCount = items.filter(i => i.status === 'failed').length
  const dataVideoUrl = (data.videoUrl as string | null | undefined) || null
  const dataRawVideoUrl = (data.rawVideoUrl as string | null | undefined) || null
  const latestVideo = items.find(i => i.videoUrl)?.videoUrl || dataVideoUrl || null
  const playableUrl = getVideoUrl(latestVideo || '') || latestVideo || dataRawVideoUrl

  return (
    <div className={getNodeContainerClass(!!selected, 'flex h-full flex-col')} style={{ width: 420, height: 520 }}>
      <Handle type="target" position={Position.Left} id="input" className={getTargetHandleClass(undefined, enlargedHandles.target)} style={{ top: '50%' }} />
      <Handle type="source" position={Position.Right} id="videos" className={getSourceHandleClass(undefined, enlargedHandles.source)} style={{ top: '50%' }} />

      <div className={NODE_HEADER_FLOATING_CLASS}>
        <div className={NODE_HEADER_CLASSES.container}>
          <div className={NODE_HEADER_CLASSES.title}>
            <Video className={NODE_HEADER_CLASSES.icon} />
            <span>视频生成</span>
          </div>
          <div className="flex items-center gap-1.5">
            {isRunning && <Loader2 className="h-3 w-3 animate-spin" />}
            {completedCount > 0 && <span className="text-[10px] text-green-500">{completedCount}✓</span>}
            {failedCount > 0 && <span className="text-[10px] text-destructive">{failedCount}✗</span>}
          </div>
        </div>
      </div>

      {/* ====== 上半部分：预览区 ====== */}
      <div className="flex-1 min-h-0 bg-black/5 dark:bg-white/5 m-3 mb-0 rounded-lg overflow-hidden flex items-center justify-center relative">
        {latestVideo ? (
           <div className="relative w-full h-full group cursor-pointer" onClick={() => setPreviewVideo(latestVideo || null)}>
             <video
               src={playableUrl || ''}
              className="w-full h-full object-contain"
              muted
              loop
              onMouseEnter={e => (e.target as HTMLVideoElement).play()}
              onMouseLeave={e => { (e.target as HTMLVideoElement).pause(); (e.target as HTMLVideoElement).currentTime = 0 }}
            />
            <div className="absolute inset-0 flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
              <div className="h-12 w-12 rounded-full bg-white/90 flex items-center justify-center cursor-pointer" onClick={() => setPreviewVideo(latestVideo || null)}>
                <Play className="h-6 w-6 text-black ml-0.5" />
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setItems(prev => prev.map(item => ({ ...item, videoUrl: null, status: 'pending' as const })))
                }}
                className="p-1.5 rounded-md bg-red-500/80 text-white hover:bg-red-600"
                title="清除结果"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : items.length > 0 && items[0]?.firstFrameUrl ? (
          <div className="relative w-full h-full">
            <img src={getImageUrl(items[0]?.firstFrameUrl || '') || ''} alt="预览" className="w-full h-full object-contain" />
            {(items[0]?.referenceImages && items[0].referenceImages.length > 0) && (
              <div className="absolute bottom-2 right-2 flex gap-1">
                {items[0].referenceImages.slice(0, 4).map((url, i) => (
                  <img key={i} src={getImageUrl(url) || ''} alt={`ref${i}`} className="h-10 w-10 object-cover rounded border border-white/30" />
                ))}
              </div>
            )}
          </div>
        ) : upstreamImages.length > 0 ? (
          <div className="w-full h-full flex items-center justify-center gap-1 p-2">
            {upstreamImages.slice(0, 4).map((imgUrl, i) => (
              <img key={i} src={getImageUrl(imgUrl) || ''} alt={`参考图${i + 1}`} className="h-full max-h-[90%] aspect-square object-cover rounded border border-white/20" />
            ))}
          </div>
        ) : (
          <div className="text-center text-muted-foreground">
            <Video className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-xs">输入提示词或连接上游节点</p>
          </div>
        )}

        {/* 进度覆盖层 */}
        {isRunning && (
          <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
            {items.length > 1 ? (
              <>
                <div className="w-40 bg-white/20 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-white h-full rounded-full transition-all" style={{ width: `${(currentIndex / Math.max(items.length, 1)) * 100}%` }} />
                </div>
                <span className="text-xs text-white/80">{currentIndex + 1}/{items.length} · {videoTaskProgress > 0 ? `${videoTaskProgress}%` : '等待中...'}</span>
              </>
            ) : (
              <>
                {videoTaskProgress > 0 && (
                  <div className="w-40 bg-white/20 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-white h-full rounded-full transition-all" style={{ width: `${videoTaskProgress}%` }} />
                  </div>
                )}
                <span className="text-xs text-white/80">{videoTaskProgress > 0 ? `${videoTaskProgress}%` : '生成中...'}</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* ====== 下半部分：参数面板 ====== */}
      <div className="px-3 py-2.5 space-y-2 border-t border-border/40">
        {/* 提示词 */}
        <div className="nodrag">
          <NodePromptInput
            ref={promptInputRef}
            nodeId={id}
            value={prompt}
            onChange={setPrompt}
            placeholder="输入视频提示词，@ 引用上游节点..."
            minRows={2}
            maxRows={4}
          />
        </div>

        {/* 模型选择 */}
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 nodrag nowheel">
            <VendorModelSelector
              type="video"
              value={model}
              onChange={(_vendorId, _modelName, fullValue) => setModel(fullValue)}
            />
          </div>
          <Select value={aspectRatio} onValueChange={(v) => { setAspectRatio(v); data._aspectRatioManuallySet = true; data.aspectRatio = v }}>
            <SelectTrigger className="h-7 w-16 text-[10px] shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IMAGE_ASPECT_RATIOS.map(r => (
                <SelectItem key={r} value={r} className="text-[11px]">{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(duration)} onValueChange={v => setDuration(Number(v))}>
            <SelectTrigger className="h-7 w-14 text-[10px] shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5" className="text-[11px]">5s</SelectItem>
              <SelectItem value="10" className="text-[11px]">10s</SelectItem>
              <SelectItem value="15" className="text-[11px]">15s</SelectItem>
              <SelectItem value="30" className="text-[11px]">30s</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 第二行：运动 + 音频 + 生成 */}
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground shrink-0">运动</span>
            <Slider value={[motionStrength]} onValueChange={([v]) => { if (typeof v === 'number') { setMotionStrength(v); data.motionStrength = v } }} min={1} max={10} step={1} disabled={isRunning} className="flex-1" />
            <span className="text-[10px] font-medium w-3 text-center">{motionStrength}</span>
          </div>
          <label className="flex items-center gap-1 text-[10px] text-muted-foreground nodrag shrink-0">
            <input type="checkbox" checked={generateAudio} onChange={e => setGenerateAudio(e.target.checked)} className="rounded" />
            音频
          </label>
          <Button
            className="h-7 px-3 text-[10px] shrink-0"
            onClick={isRunning ? handleStop : handleStart}
            disabled={(items.length === 0 && !prompt.trim()) || !model || !currentProjectId}
          >
            {isRunning ? (
              <><Loader2 className="h-3 w-3 mr-1 animate-spin" />停止</>
            ) : (
              <><Play className="h-3 w-3 mr-1" />生成</>
            )}
          </Button>
        </div>
      </div>

      {/* 视频预览弹窗 */}
      {previewVideo && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={() => setPreviewVideo(null)}>
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <video src={playableUrl || ''} controls autoPlay className="max-w-[90vw] max-h-[90vh] rounded-lg" />
            <button onClick={() => setPreviewVideo(null)} className="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-background border flex items-center justify-center hover:bg-muted transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
})

VideoGenNode.displayName = 'VideoGenNode'
