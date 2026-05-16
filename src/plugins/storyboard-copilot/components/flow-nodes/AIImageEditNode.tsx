import { useState, useCallback, useRef, useEffect, memo } from 'react'
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react'
import { Wand2, Loader2, ImageIcon, Paintbrush, Eraser, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NodePromptInput, type MentionInputRef } from './NodePromptInput'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/hooks/useToast'
import { NODE_IMAGE_CONTAINER_CLASS } from './NodeStyles'
import { useUIStore } from '@/store/useUIStore'
import { getImageUrl } from '@/utils/asset'
import { ReferenceImageInput } from '@/components/ai/ReferenceImageInput'
import { ImagePreviewDialog } from '@/components/media/ImagePreviewDialog'
import type { AIImageEditNodeData } from '../../types'
import { useGeneration } from '../../hooks/useGeneration'
import { useImageModels } from '../../hooks/useImageModels'
import { useUpstreamData } from '../../hooks/useUpstreamData'
import { canvasEvents } from '../../utils/canvasEvents'
import { useEnlargedHandles } from '../../hooks/useEnlargedHandles'
import {
  getNodeContainerClass,
  getTargetHandleClass,
  getSourceHandleClass,
  NODE_HEADER_FLOATING_CLASS,
  NODE_HEADER_CLASSES,
  NODE_CONTENT_CLASSES,
  NODE_WIDTH,
} from './NodeStyles'

type AIBrushType = 'brush' | 'eraser'

interface AIImageEditNodeProps extends NodeProps {
  data: AIImageEditNodeData
}

export const AIImageEditNode = memo(({ id, data, selected }: AIImageEditNodeProps) => {
  const { updateNodeData } = useReactFlow()
  const { upstreamImage, upstreamText, upstreamImages } = useUpstreamData(id)
  const upstreamImageRef = useRef<string | null>(null)
  const upstreamPromptRef = useRef<string | null>(null)
  const { models: imageModels, isLoading: isLoadingModels } = useImageModels()
  const currentProjectId = useUIStore((state) => state.currentProjectId)
  const currentEpisodeId = useUIStore((state) => state.currentEpisodeId)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [prompt, setPrompt] = useState(data.prompt || '')
  const [model, setModel] = useState(data.model || '')
  const [referenceImages, setReferenceImages] = useState<string[]>(data.referenceImages || [])
  const [brushType, setBrushType] = useState<AIBrushType>('brush')
  const [brushSize, setBrushSize] = useState(data.brushSize || 30)
  const [isDrawing, setIsDrawing] = useState(false)
  const [maskImage, setMaskImage] = useState<string | null>(data.maskImage || null)
  const [showPreview, setShowPreview] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const promptInputRef = useRef<MentionInputRef>(null)
  const { toast } = useToast()
  const enlargedHandles = useEnlargedHandles(id)
  const { generateImageEdit, isGenerating, progress } = useGeneration()

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
      } as AIImageEditNodeData)
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

  // 保存原图引用，用于对比
  const originalImageUrl = data.previewImageUrl || data.imageUrl || upstreamImage

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
    if (!isEditorOpen || !imageUrl || !canvasRef.current) return

    const img = new Image()
    if (!imageUrl.startsWith('asset://')) {
      img.crossOrigin = 'anonymous'
    }
    img.onload = () => {
      if (canvasRef.current) {
        canvasRef.current.width = img.naturalWidth
        canvasRef.current.height = img.naturalHeight
        const ctx = canvasRef.current.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0)
        }
      }
    }
    img.onerror = () => {
      console.error('[AIImageEditNode] 图片加载失败:', imageUrl)
    }
    img.src = imageUrl
  }, [isEditorOpen, imageUrl])

  useEffect(() => {
    if (!isEditorOpen || !containerRef.current || !canvasRef.current) return

    const updateCanvasSize = () => {
      const container = containerRef.current
      const canvas = canvasRef.current
      if (!container || !canvas) return

      const imgElement = canvas.previousElementSibling as HTMLImageElement
      if (imgElement) {
        canvas.style.width = `${imgElement.offsetWidth}px`
        canvas.style.height = `${imgElement.offsetHeight}px`
      }
    }

    updateCanvasSize()
    const timer = setTimeout(updateCanvasSize, 100)
    return () => clearTimeout(timer)
  }, [isEditorOpen, imageUrl])

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return { x: 0, y: 0 }
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return
    setIsDrawing(true)
    const { x, y } = getCanvasCoordinates(e)
    draw(x, y, false)
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current) return
    const { x, y } = getCanvasCoordinates(e)
    draw(x, y, true)
  }

  const handleMouseUp = () => {
    setIsDrawing(false)
    if (canvasRef.current) {
      setMaskImage(canvasRef.current.toDataURL('image/png'))
    }
  }

  const draw = (x: number, y: number, isContinuous: boolean) => {
    if (!canvasRef.current) return
    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = brushSize

    if (brushType === 'brush') {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
    } else {
      ctx.globalCompositeOperation = 'destination-out'
    }

    if (isContinuous) {
      ctx.lineTo(x, y)
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(x, y)
    }
  }

  const handleClearMask = () => {
    if (canvasRef.current && imageUrl) {
      const ctx = canvasRef.current.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
        const img = new Image()
        if (!imageUrl.startsWith('asset://')) {
          img.crossOrigin = 'anonymous'
        }
        img.onload = () => {
          ctx.drawImage(img, 0, 0)
        }
        img.src = imageUrl
      }
    }
    setMaskImage(null)
  }

  const handleGenerate = useCallback(async () => {
    if (!model) { toast({ title: '请先选择模型', variant: 'destructive' }); return }
    if (!prompt.trim() || !effectiveImageUrl) {
      toast({ title: '请输入提示词并上传图片', variant: 'destructive' })
      return
    }

    try {
      const resolved = promptInputRef.current?.getResolvedPrompt()
      const mentionImages = resolved?.referenceImages?.filter(
        (url: string) => url !== effectiveImageUrl
      ) || []
      const allReferenceImages = [...referenceImages, ...mentionImages]
      const uniqueReferences = [...new Set(allReferenceImages)]

      const result = await generateImageEdit({
        prompt,
        imageUrl: effectiveImageUrl,
        maskImage: maskImage || undefined,
        referenceImages: uniqueReferences.length > 0 ? uniqueReferences : undefined,
        model,
        projectId: currentProjectId || undefined,
        episodeId: currentEpisodeId || undefined,
      })

      if (result.success && result.imageUrl) {
        updateNodeData(id, {
          imageUrl: result.imageUrl,
          previewImageUrl: originalImageUrl || data.previewImageUrl,
          prompt,
          referenceImages,
          maskImage,
        })
        canvasEvents.emit({
          type: 'addResultNode',
          imageUrl: result.imageUrl,
          sourceNodeId: id,
          sourceHandleId: 'source',
        })
        toast({ title: '生成成功' })
        setIsEditorOpen(false)
      } else {
        toast({ title: result.error || '生成失败', variant: 'destructive' })
      }
    } catch (error) {
      toast({ title: '生成失败', variant: 'destructive' })
    }
  }, [prompt, effectiveImageUrl, maskImage, referenceImages, model, currentProjectId, currentEpisodeId, generateImageEdit, toast, id, updateNodeData])

  const handleMainImageChange = (images: string[]) => {
    updateNodeData(id, {
      imageUrl: images.length > 0 ? images[0] : undefined,
    })
  }

  return (
    <>
      <div
        className={getNodeContainerClass(selected, 'flex h-full flex-col')}
        style={{ width: NODE_WIDTH.LARGE }}
      >
        <div className={NODE_HEADER_FLOATING_CLASS}>
          <div className={NODE_HEADER_CLASSES.container}>
            <div className={NODE_HEADER_CLASSES.title}>
              <Wand2 className={NODE_HEADER_CLASSES.icon} />
              <span>图片编辑</span>
            </div>
          </div>
        </div>

        <div className={NODE_CONTENT_CLASSES.container}>
          <div
            className={NODE_IMAGE_CONTAINER_CLASS + ' relative aspect-video group cursor-pointer'}
            onClick={() => {
              if (imageUrl) setIsEditorOpen(true)
            }}
          >
            {imageUrl ? (
              <>
                <img
                  src={imageUrl}
                  alt="图片编辑"
                  className="w-full h-full object-cover"
                  onLoad={handleImageLoad}
                />
                {resolutionText && (
                  <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    {resolutionText}
                  </span>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setIsEditorOpen(true)
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="p-1.5 rounded-md bg-black/60 text-white hover:bg-black/80"
                    title="编辑"
                  >
                    <Paintbrush className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowPreview(true)
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="p-1.5 rounded-md bg-black/60 text-white hover:bg-black/80"
                    title="预览"
                  >
                    <ImageIcon className="w-4 h-4" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); updateNodeData(id, { ...data, imageUrl: null, previewImageUrl: null } as AIImageEditNodeData) }} className="p-1.5 rounded-md bg-red-500/80 text-white hover:bg-red-600" title="清除结果"><X className="w-4 h-4" /></button>
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
                <ImageIcon className="w-8 h-8" />
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

          {data.prompt && (
            <p className="text-[11px] text-muted-foreground line-clamp-2">
              {data.prompt}
            </p>
          )}

          {data.referenceImages && data.referenceImages.length > 0 && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <ImageIcon className="w-3 h-3" />
              <span>{data.referenceImages.length} 张参考图</span>
            </div>
          )}
        </div>

        <Handle type="target" id="target" position={Position.Left} className={getTargetHandleClass(undefined, enlargedHandles.target)} />
        <Handle type="source" id="source" position={Position.Right} className={getSourceHandleClass(undefined, enlargedHandles.source)} />
      </div>

      {imageUrl && (
        <ImagePreviewDialog
          src={imageUrl}
          alt="图片编辑预览"
          isOpen={showPreview}
          onClose={() => setShowPreview(false)}
          title="图片编辑"
        />
      )}

      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden p-0">
          <DialogTitle className="sr-only">图片编辑</DialogTitle>

          <div className="flex h-[80vh]">
            <div className="flex-1 bg-muted/30 p-4 flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                <Button
                  variant={brushType === 'brush' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setBrushType('brush')}
                >
                  <Paintbrush className="w-4 h-4 mr-1" />
                  画笔
                </Button>
                <Button
                  variant={brushType === 'eraser' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setBrushType('eraser')}
                >
                  <Eraser className="w-4 h-4 mr-1" />
                  橡皮擦
                </Button>
                <Button variant="ghost" size="sm" onClick={handleClearMask}>
                  <RotateCcw className="w-4 h-4 mr-1" />
                  清除
                </Button>

                <div className="flex-1" />

                <div className="flex items-center gap-2 w-32">
                  <span className="text-xs text-muted-foreground">{brushSize}px</span>
                  <Slider
                    value={[brushSize]}
                    onValueChange={([v]) => v !== undefined && setBrushSize(v)}
                    onPointerDown={(e) => e.stopPropagation()}
                    min={5}
                    max={100}
                    step={1}
                  />
                </div>
              </div>

              <div
                ref={containerRef}
                className="flex-1 flex items-center justify-center overflow-auto"
              >
                {imageUrl ? (
                  <div className="relative inline-block">
                    <img
                      src={imageUrl}
                      alt="编辑"
                      className="max-w-full max-h-[60vh] object-contain select-none"
                      crossOrigin="anonymous"
                      onLoad={(e) => {
                        const img = e.currentTarget
                        if (canvasRef.current) {
                          canvasRef.current.width = img.naturalWidth
                          canvasRef.current.height = img.naturalHeight
                          canvasRef.current.style.width = `${img.offsetWidth}px`
                          canvasRef.current.style.height = `${img.offsetHeight}px`
                        }
                      }}
                    />
                    <canvas
                      ref={canvasRef}
                      className="absolute top-0 left-0 cursor-crosshair"
                      style={{ pointerEvents: 'auto' }}
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                    />
                  </div>
                ) : (
                  <div className="text-muted-foreground">请先上传图片</div>
                )}
              </div>
            </div>

            <div className="w-80 border-l p-4 flex flex-col gap-4 overflow-y-auto">
              <div className="space-y-2">
                <label className="text-sm font-medium">模型</label>
                <Select
                  value={model}
                  onValueChange={(value) => {
                    setModel(value)
                    updateNodeData(id, { ...data, model: value })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isLoadingModels ? '加载中...' : '选择模型'} />
                  </SelectTrigger>
                  <SelectContent>
                    {imageModels.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">编辑图片</label>
                <ReferenceImageInput
                  value={data.imageUrl ? [data.imageUrl] : []}
                  onChange={handleMainImageChange}
                  maxReferences={1}
                  displayMode="thumbnail"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">编辑提示词</label>
                <NodePromptInput
                  ref={promptInputRef}
                  nodeId={id}
                  placeholder="描述你想要修改的内容，@ 引用上游节点..."
                  value={prompt}
                  onChange={setPrompt}
                  minRows={3}
                  maxRows={6}
                />
              </div>

              <div className="space-y-2">
                <ReferenceImageInput
                  label="参考图片"
                  value={referenceImages}
                  onChange={setReferenceImages}
                  maxReferences={4}
                  displayMode="thumbnail"
                />
              </div>

              <div className="flex gap-2 mt-auto">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setIsEditorOpen(false)}
                >
                  取消
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleGenerate}
                  disabled={isGenerating || !prompt.trim() || !effectiveImageUrl}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      生成中...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4 mr-1" />
                      生成
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
})

AIImageEditNode.displayName = 'AIImageEditNode'
