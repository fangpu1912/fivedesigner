import { useState, useCallback, useRef, useEffect } from 'react'
import { Wand2, Loader2, Paintbrush, Eraser, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/useToast'
import { getImageUrl } from '@/utils/asset'
import { ReferenceImageInput } from '@/components/ai/ReferenceImageInput'
import { useImageModels } from '@/plugins/storyboard-copilot/hooks/useImageModels'
import { useGeneration } from '@/plugins/storyboard-copilot/hooks/useGeneration'
import { useUIStore } from '@/store/useUIStore'

type AIBrushType = 'brush' | 'eraser'

interface AIImageEditDialogProps {
  open: boolean
  imageUrl: string
  onClose: () => void
  onSave: (newImageUrl: string) => void
}

export function AIImageEditDialog({ open, imageUrl, onClose, onSave }: AIImageEditDialogProps) {
  const currentProjectId = useUIStore((state) => state.currentProjectId)
  const currentEpisodeId = useUIStore((state) => state.currentEpisodeId)
  const { models: imageModels, isLoading: isLoadingModels } = useImageModels()
  const { toast } = useToast()
  const { generateImageEdit, isGenerating, progress } = useGeneration()

  const [brushType, setBrushType] = useState<AIBrushType>('brush')
  const [brushSize, setBrushSize] = useState(30)
  const [isDrawing, setIsDrawing] = useState(false)
  const [maskImage, setMaskImage] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('')
  const [referenceImages, setReferenceImages] = useState<string[]>([])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imageSizeRef = useRef<{ width: number; height: number } | null>(null)

  const displayUrl = imageUrl ? getImageUrl(imageUrl) : null

  // 打开时加载图片到 canvas
  useEffect(() => {
    if (!open || !displayUrl || !canvasRef.current) return

    const img = new Image()
    if (!displayUrl.startsWith('asset://')) {
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
      imageSizeRef.current = { width: img.naturalWidth, height: img.naturalHeight }
    }
    img.src = displayUrl
  }, [open, displayUrl])

  // 同步 canvas 尺寸
  useEffect(() => {
    if (!open || !containerRef.current || !canvasRef.current) return

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
  }, [open, displayUrl])

  // 关闭时重置状态
  useEffect(() => {
    if (!open) {
      setMaskImage(null)
      setPrompt('')
      setBrushType('brush')
      setBrushSize(30)
    }
  }, [open])

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

  const handleClearMask = () => {
    if (canvasRef.current && displayUrl) {
      const ctx = canvasRef.current.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
        const img = new Image()
        if (!displayUrl.startsWith('asset://')) {
          img.crossOrigin = 'anonymous'
        }
        img.onload = () => {
          ctx.drawImage(img, 0, 0)
        }
        img.src = displayUrl
      }
    }
    setMaskImage(null)
  }

  const handleGenerate = useCallback(async () => {
    if (!model) {
      toast({ title: '请先选择模型', variant: 'destructive' })
      return
    }
    if (!prompt.trim() || !imageUrl) {
      toast({ title: '请输入提示词', variant: 'destructive' })
      return
    }

    try {
      const result = await generateImageEdit({
        prompt,
        imageUrl,
        maskImage: maskImage || undefined,
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        model,
        projectId: currentProjectId || undefined,
        episodeId: currentEpisodeId || undefined,
        width: imageSizeRef.current?.width,
        height: imageSizeRef.current?.height,
      })

      if (result.success && result.imageUrl) {
        onSave(result.imageUrl)
        toast({ title: '生成成功' })
        onClose()
      } else {
        toast({ title: result.error || '生成失败', variant: 'destructive' })
      }
    } catch (error) {
      toast({ title: '生成失败', variant: 'destructive' })
    }
  }, [prompt, imageUrl, maskImage, referenceImages, model, currentProjectId, currentEpisodeId, generateImageEdit, toast, onSave, onClose])

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden p-0">
        <DialogTitle className="sr-only">图片编辑（图生图）</DialogTitle>

        <div className="flex h-[80vh]">
          {/* 左侧：画布区域 */}
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
              {displayUrl ? (
                <div className="relative inline-block">
                  <img
                    src={displayUrl}
                    alt="编辑"
                    className="max-w-full max-h-[60vh] object-contain select-none"
                    crossOrigin="anonymous"
                    onLoad={(e) => {
                      const img = e.currentTarget
                      imageSizeRef.current = { width: img.naturalWidth, height: img.naturalHeight }
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

          {/* 右侧：参数面板 */}
          <div className="w-80 border-l p-4 flex flex-col gap-4 overflow-y-auto">
            <div className="space-y-2">
              <label className="text-sm font-medium">模型</label>
              <Select value={model} onValueChange={setModel}>
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
              <label className="text-sm font-medium">编辑提示词</label>
              <Textarea
                placeholder="描述你想要修改的内容..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
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
                onClick={onClose}
              >
                取消
              </Button>
              <Button
                className="flex-1"
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim() || !imageUrl}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                    {progress > 0 ? `${progress}%` : '生成中...'}
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
  )
}
