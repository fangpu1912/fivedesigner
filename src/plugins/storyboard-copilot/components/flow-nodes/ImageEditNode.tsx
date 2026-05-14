import { memo, useCallback, useState, useEffect, useRef } from 'react'
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react'
import { Loader2, Image as ImageIcon, Play, Pencil, Crop, ZoomIn, Sparkles, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { NodePromptInput, type MentionInputRef } from './NodePromptInput'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/useToast'
import { useUIStore } from '@/store/useUIStore'
import { useProjectQuery } from '@/hooks/useProjects'
import { getImageUrl } from '@/utils/asset'
import { saveMediaFile } from '@/utils/mediaStorage'
import { useGeneration } from '../../hooks/useGeneration'
import { useImageModels } from '../../hooks/useImageModels'
import { useUpstreamData } from '../../hooks/useUpstreamData'
import { canvasEvents } from '../../utils/canvasEvents'
import { useEnlargedHandles } from '../../hooks/useEnlargedHandles'
import { ImageEditorDialog } from '../ImageEditorDialog'
import { ImageCropDialog } from '../ImageCropDialog'
import { ImagePreviewDialog } from '@/components/media/ImagePreviewDialog'

import type { ImageEditNodeData, ImageSize } from '../../types'
import { IMAGE_SIZES, IMAGE_ASPECT_RATIOS } from '../../types'
import {
  getNodeContainerClass,
  getTargetHandleClass,
  getSourceHandleClass,
  NODE_HEADER_FLOATING_CLASS,
  NODE_HEADER_CLASSES,
} from './NodeStyles'

interface ImageEditNodeProps extends NodeProps {
  data: ImageEditNodeData
}

const ASPECT_RATIO_SIZES: Record<string, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '16:9': { width: 1024, height: 576 },
  '9:16': { width: 576, height: 1024 },
  '4:3': { width: 1024, height: 768 },
  '3:4': { width: 768, height: 1024 },
  '21:9': { width: 1024, height: 438 },
}

function calculateSize(baseSize: { width: number; height: number }, size: ImageSize): { width: number; height: number } {
  const multiplier = {
    '1K': 1,
    '2K': 2,
    '4K': 4,
  }[size] || 1

  return {
    width: Math.round(baseSize.width * multiplier),
    height: Math.round(baseSize.height * multiplier),
  }
}

export const ImageEditNode = memo(({ id, data, selected }: ImageEditNodeProps) => {
  const { updateNodeData } = useReactFlow()
  const { toast } = useToast()
  const { models: imageModels, isLoading: isLoadingModels } = useImageModels()
  const { isGenerating, progress, generateImage, generateImageToImage } = useGeneration()
  const { upstreamImage, upstreamText, upstreamImages } = useUpstreamData(id)
  const upstreamImageRef = useRef<string | null>(null)
  const upstreamPromptRef = useRef<string | null>(null)

  const currentProjectId = useUIStore((state) => state.currentProjectId)
  const currentEpisodeId = useUIStore((state) => state.currentEpisodeId)
  const { data: currentProject } = useProjectQuery(currentProjectId || '')
  const enlargedHandles = useEnlargedHandles(id)

  const [prompt, setPrompt] = useState(data.prompt || '')
  const [model, setModel] = useState(data.model || '')
  const [size, setSize] = useState<ImageSize>(data.size || '1K')
  const promptInputRef = useRef<MentionInputRef>(null)
  const projectAspectRatio = currentProject?.aspect_ratio
  const isValidProjectRatio = projectAspectRatio && IMAGE_ASPECT_RATIOS.includes(projectAspectRatio as typeof IMAGE_ASPECT_RATIOS[number])
  const [aspectRatio, setAspectRatio] = useState(data.aspectRatio || (isValidProjectRatio ? projectAspectRatio : '16:9'))
  const [showEditor, setShowEditor] = useState(false)
  const [showCropper, setShowCropper] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const effectiveImageUrl = data.imageUrl || upstreamImage
  const imageUrl = effectiveImageUrl ? getImageUrl(effectiveImageUrl) : null

  const imageWidth = (data as Record<string, unknown>).imageWidth as number | undefined
  const imageHeight = (data as Record<string, unknown>).imageHeight as number | undefined
  const resolutionText = imageWidth && imageHeight ? `${imageWidth}×${imageHeight}` : null

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    if (img.naturalWidth && img.naturalHeight) {
      updateNodeData(id, {
        ...data,
        imageWidth: img.naturalWidth,
        imageHeight: img.naturalHeight,
      } as ImageEditNodeData)
    }
  }, [data, id, updateNodeData])

  useEffect(() => {
    if (upstreamImage && !data.imageUrl) {
      upstreamImageRef.current = upstreamImage
      updateNodeData(id, { imageUrl: upstreamImage, previewImageUrl: upstreamImage })
    } else if (!upstreamImage && upstreamImageRef.current && data.imageUrl === upstreamImageRef.current) {
      upstreamImageRef.current = null
      updateNodeData(id, { imageUrl: null, previewImageUrl: null })
    }
  }, [upstreamImage, data.imageUrl, data, id, updateNodeData])

  useEffect(() => {
    if (upstreamText && !data.prompt && !prompt) {
      upstreamPromptRef.current = upstreamText
      setPrompt(upstreamText)
      updateNodeData(id, { ...data, prompt: upstreamText })
    } else if (!upstreamText && upstreamPromptRef.current && prompt === upstreamPromptRef.current) {
      upstreamPromptRef.current = null
      setPrompt('')
      updateNodeData(id, { ...data, prompt: '' })
    }
  }, [upstreamText, data, prompt, id, updateNodeData])

  useEffect(() => {
    data.aspectRatio = aspectRatio
  }, [aspectRatio, data])

  const handleEditorSave = useCallback(async (annotatedImageDataUrl: string) => {
    try {
      const savedPath = await saveMediaFile(annotatedImageDataUrl, {
        projectId: currentProjectId || 'temp',
        episodeId: currentEpisodeId || 'temp',
        type: 'image',
        fileName: `edited_${Date.now()}.png`,
        extension: 'png',
      })
      updateNodeData(id, { imageUrl: savedPath, previewImageUrl: savedPath })
      toast({ title: '标注已保存' })
    } catch (error) {
      toast({ title: '保存失败', description: String(error), variant: 'destructive' })
    }
  }, [id, currentProjectId, currentEpisodeId, updateNodeData, toast])

  const handleGenerate = useCallback(async () => {
    if (!model) { toast({ title: '请先选择模型', variant: 'destructive' }); return }
    if (!prompt.trim()) { toast({ title: '请输入提示词', variant: 'destructive' }); return }

    const baseSize = ASPECT_RATIO_SIZES[aspectRatio] as { width: number; height: number }
    const actualSize = calculateSize(baseSize, size)

    const resolved = promptInputRef.current?.getResolvedPrompt()
    const mentionImages = resolved?.referenceImages || []

    try {
      let result
      if (effectiveImageUrl) {
        result = await generateImageToImage(prompt, effectiveImageUrl, model, {
          projectId: currentProjectId || undefined, 
          episodeId: currentEpisodeId || undefined,
          width: actualSize.width,
          height: actualSize.height,
          referenceImages: mentionImages.length > 0 ? mentionImages : undefined,
        })
      } else {
        result = await generateImage(prompt, model, {
          projectId: currentProjectId || undefined, 
          episodeId: currentEpisodeId || undefined,
          width: actualSize.width,
          height: actualSize.height,
          referenceImages: mentionImages.length > 0 ? mentionImages : undefined,
        })
      }

      if (result.success && result.imageUrl) {
        updateNodeData(id, { imageUrl: result.imageUrl, previewImageUrl: result.imageUrl, prompt, model, size, aspectRatio })
        canvasEvents.emit({
          type: 'addResultNode',
          imageUrl: result.imageUrl,
          sourceNodeId: id,
          sourceHandleId: 'source',
        })
        toast({ title: '生成完成' })
      } else {
        toast({ title: '生成失败', description: result.error || '未知错误', variant: 'destructive' })
      }
    } catch (error) {
      toast({ title: '生成失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' })
    }
  }, [prompt, effectiveImageUrl, model, size, aspectRatio, id, currentProjectId, currentEpisodeId, generateImage, generateImageToImage, updateNodeData, toast])

  return (
    <div className={getNodeContainerClass(selected, `flex h-full flex-col`)} style={{ width: 400, height: 450 }}>
      {/* 浮动标题 */}
      <div className={NODE_HEADER_FLOATING_CLASS}>
        <div className={NODE_HEADER_CLASSES.container}>
          <div className={NODE_HEADER_CLASSES.title}>
            <Sparkles className={NODE_HEADER_CLASSES.icon} />
            <span>图片生成</span>
          </div>
        </div>
      </div>

      {/* 内容区 - LibTV风格 */}
      <div className="flex flex-col h-full">
        {/* 主内容区 - 图片预览 + 提示词 */}
        <div className="flex-1 min-h-0 p-3 space-y-3">
          {/* 图片预览 */}
          <div
            className="relative rounded-lg overflow-hidden border bg-muted/20 aspect-video group cursor-pointer"
            onClick={() => imageUrl && setShowPreview(true)}
          >
            {imageUrl ? (
              <>
                <img src={imageUrl} alt="图片生成" className="w-full h-full object-cover" onLoad={handleImageLoad} />
                {resolutionText && (
                  <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    {resolutionText}
                  </span>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100">
                  <button onClick={(e) => { e.stopPropagation(); setShowPreview(true) }} className="p-1.5 rounded-md bg-black/60 text-white hover:bg-black/80" title="预览"><ZoomIn className="w-4 h-4" /></button>
                  <button onClick={(e) => { e.stopPropagation(); setShowEditor(true) }} className="p-1.5 rounded-md bg-black/60 text-white hover:bg-black/80" title="标注"><Pencil className="w-4 h-4" /></button>
                  <button onClick={(e) => { e.stopPropagation(); setShowCropper(true) }} className="p-1.5 rounded-md bg-black/60 text-white hover:bg-black/80" title="裁剪"><Crop className="w-4 h-4" /></button>
                  <button onClick={(e) => { e.stopPropagation(); updateNodeData(id, { ...data, imageUrl: null, previewImageUrl: null } as ImageEditNodeData) }} className="p-1.5 rounded-md bg-red-500/80 text-white hover:bg-red-600" title="清除结果"><X className="w-4 h-4" /></button>
                </div>
              </>
            ) : upstreamImages.length > 0 ? (
              <div className="w-full h-full flex items-center justify-center gap-1 p-2">
                {upstreamImages.slice(0, 4).map((imgUrl, i) => (
                  <img key={i} src={getImageUrl(imgUrl) || ''} alt={`参考图${i + 1}`} className="h-full max-h-[90%] aspect-square object-cover rounded border border-white/20" />
                ))}
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <ImageIcon className="w-10 h-10" />
              </div>
            )}
            {isGenerating && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-8 h-8 text-white animate-spin" />
                {progress > 0 && <span className="text-white text-sm">{progress}%</span>}
              </div>
            )}
            {imageUrl && upstreamImages.length > 0 && (
              <div className="absolute bottom-1 left-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {upstreamImages.slice(0, 4).map((imgUrl, i) => (
                  <img key={i} src={getImageUrl(imgUrl) || ''} alt={`参考图${i + 1}`} className="h-8 w-8 object-cover rounded border border-white/40" />
                ))}
              </div>
            )}
          </div>

          {/* 提示词 - 限制最大高度避免遮住下拉列表 */}
          <div className="flex-1 flex flex-col min-h-0 max-h-[120px]">
            <NodePromptInput
              ref={promptInputRef}
              nodeId={id}
              placeholder="描述你想要生成的图片，@ 引用上游节点..."
              value={prompt}
              onChange={setPrompt}
              minRows={2}
              maxRows={4}
            />
          </div>
        </div>

        {/* 底部工具栏 - LibTV风格 */}
        <div className="border-t border-border/40 bg-muted/20 px-3 py-2">
          {/* 第一行：模型、比例、尺寸（统一顺序） */}
          <div className="flex items-center gap-2 mb-2">
            {/* 模型选择 */}
            <div className="flex-1 min-w-0">
              <Select value={model} onValueChange={setModel} disabled={isLoadingModels}>
                <SelectTrigger className="h-8 text-[11px]"><SelectValue placeholder="选择模型" /></SelectTrigger>
                <SelectContent>
                  {imageModels.map((m) => (<SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            {/* 比例 */}
            <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v)}>
              <SelectTrigger className="h-8 w-20 text-[11px] shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {IMAGE_ASPECT_RATIOS.map((r) => (<SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>))}
              </SelectContent>
            </Select>
            {/* 尺寸 */}
            <Select value={size} onValueChange={(v) => setSize(v as ImageSize)}>
              <SelectTrigger className="h-8 w-16 text-[11px] shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {IMAGE_SIZES.map((s) => (<SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          
          {/* 第二行：生成按钮 + 项目比例提示 */}
          <div className="flex items-center justify-between">
            {isValidProjectRatio && aspectRatio === projectAspectRatio && (
              <span className="text-[10px] text-green-600">使用项目比例</span>
            )}
            <div className="flex-1"></div>
            <Button className="h-8 px-4 text-[11px] gap-1" onClick={handleGenerate} disabled={isGenerating || !model || !prompt.trim()}>
              {isGenerating ? <><Loader2 className="h-3 w-3 animate-spin" />生成中...</> : <><Play className="h-3 w-3" />{effectiveImageUrl ? '重新生成' : '生成'}</>}
            </Button>
          </div>
        </div>
      </div>

      {/* 端口 */}
      <Handle type="target" id="target" position={Position.Left} className={getTargetHandleClass(undefined, enlargedHandles.target)} />
      <Handle type="source" id="source" position={Position.Right} className={getSourceHandleClass(undefined, enlargedHandles.source)} />

      {/* 对话框 */}
      {imageUrl && <ImageEditorDialog open={showEditor} imageUrl={imageUrl} onClose={() => setShowEditor(false)} onSave={handleEditorSave} />}
      {imageUrl && <ImageCropDialog open={showCropper} imageUrl={imageUrl} onClose={() => setShowCropper(false)} onSave={(croppedUrl) => { updateNodeData(id, { imageUrl: croppedUrl, previewImageUrl: croppedUrl, annotations: undefined }); toast({ title: '裁剪完成' }) }} />}
      {imageUrl && <ImagePreviewDialog src={imageUrl} alt="图片生成预览" isOpen={showPreview} onClose={() => setShowPreview(false)} title="图片生成结果" />}
    </div>
  )
})

ImageEditNode.displayName = 'ImageEditNode'
