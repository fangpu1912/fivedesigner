import { memo, useCallback, useState, useRef, useEffect } from 'react'
import { Handle, Position, type NodeProps, useReactFlow, useEdges } from '@xyflow/react'
import { Upload, X, ZoomIn, Pencil, Crop } from 'lucide-react'

import { cn } from '@/lib/utils'
import { getImageUrl } from '@/utils/asset'
import { saveMediaFile } from '@/utils/mediaStorage'
import { useToast } from '@/hooks/useToast'
import { useUIStore } from '@/store/useUIStore'
import { ImagePreviewDialog } from '@/components/media/ImagePreviewDialog'
import { ImageCropDialog } from '../ImageCropDialog'
import { ImageEditorDialog } from '../ImageEditorDialog'
import { useUpstreamData } from '../../hooks/useUpstreamData'
import { useEnlargedHandles } from '../../hooks/useEnlargedHandles'

import type { UploadImageNodeData } from '../../types'
import { DEFAULT_ASPECT_RATIO } from '../../types'
import {
  getNodeContainerClass,
  getSourceHandleClass,
  getTargetHandleClass,
  NODE_HEADER_FLOATING_CLASS,
  NODE_HEADER_CLASSES,
  NODE_IMAGE_CONTAINER_CLASS,
  NODE_MIN_WIDTH,
  NODE_MIN_HEIGHT,
} from './NodeStyles'
import { NodeResizeHandle } from './NodeResizeHandle'
import { canvasEvents } from '../../utils/canvasEvents'

interface UploadNodeProps extends NodeProps {
  data: UploadImageNodeData
}

export const UploadNode = memo(({ id, data, selected }: UploadNodeProps) => {
  const { updateNodeData, getNode, addNodes } = useReactFlow()
  const { toast } = useToast()
  const [isDragging, setIsDragging] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isCropOpen, setIsCropOpen] = useState(false)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const currentProjectId = useUIStore((state) => state.currentProjectId)
  const currentEpisodeId = useUIStore((state) => state.currentEpisodeId)
  const { getUpstreamImageData, upstreamImage } = useUpstreamData(id)
  const upstreamImageRef = useRef<string | null>(null)
  const enlargedHandles = useEnlargedHandles(id)

  useEffect(() => {
    if (upstreamImage && !data.imageUrl) {
      upstreamImageRef.current = upstreamImage
      updateNodeData(id, {
        ...data,
        imageUrl: upstreamImage,
        sourceFileName: '来自上游节点',
        aspectRatio: DEFAULT_ASPECT_RATIO,
      })
    } else if (!upstreamImage && upstreamImageRef.current && data.imageUrl === upstreamImageRef.current) {
      upstreamImageRef.current = null
      updateNodeData(id, {
        ...data,
        imageUrl: null,
        sourceFileName: null,
      })
    }
  }, [upstreamImage, data, id, updateNodeData])

  // 向下游节点传播数据
  const edges = useEdges()
  useEffect(() => {
    const hasDownstream = edges.some(e => e.source === id)
    if (hasDownstream && data.imageUrl) {
      canvasEvents.emit({
        type: 'propagateData',
        sourceNodeId: id,
        data: {},
      })
    }
  }, [data.imageUrl, edges, id])

  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        toast({ title: '请上传图片文件', variant: 'destructive' })
        return
      }
      try {
        const arrayBuffer = await file.arrayBuffer()
        const uint8Array = new Uint8Array(arrayBuffer)
        const ext = file.name.split('.').pop() || 'png'
        const savedPath = await saveMediaFile(uint8Array, {
          projectId: currentProjectId || 'temp',
          episodeId: currentEpisodeId || 'temp',
          type: 'image',
          fileName: `upload_${Date.now()}.${ext}`,
          extension: ext,
        })
        updateNodeData(id, { ...data, imageUrl: savedPath, sourceFileName: file.name, aspectRatio: DEFAULT_ASPECT_RATIO })
        toast({ title: '图片上传成功' })
      } catch (error) {
        toast({ title: '上传失败', description: String(error), variant: 'destructive' })
      }
    },
    [currentProjectId, currentEpisodeId, data, id, toast, updateNodeData],
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFileUpload(file)
      e.target.value = ''
    },
    [handleFileUpload],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files?.[0]
      if (file) handleFileUpload(file)
    },
    [handleFileUpload],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleClear = useCallback(() => {
    updateNodeData(id, { ...data, imageUrl: null, sourceFileName: null })
  }, [id, data, updateNodeData])

  // 创建新节点保存编辑后的图片
  const createNewNode = useCallback(async (imageUrl: string, name: string) => {
    try {
      const savedPath = await saveMediaFile(imageUrl, {
        projectId: currentProjectId || 'temp',
        episodeId: currentEpisodeId || 'temp',
        type: 'image',
        fileName: `${name}_${Date.now()}.png`,
        extension: 'png',
      })

      const currentNode = getNode(id)
      if (!currentNode) return

      const newNodeId = `upload-${Date.now()}`
      addNodes([{
        id: newNodeId,
        type: 'uploadNode',
        position: {
          x: (currentNode.position.x ?? 0) + 320,
          y: (currentNode.position.y ?? 0),
        },
        data: {
          imageUrl: savedPath,
          sourceFileName: `${name}.png`,
          aspectRatio: data.aspectRatio || DEFAULT_ASPECT_RATIO,
        },
      }])

      toast({ title: `${name}完成`, description: '已创建新节点保留原图' })
    } catch (error) {
      toast({ title: '保存失败', variant: 'destructive' })
    }
  }, [addNodes, currentEpisodeId, currentProjectId, data.aspectRatio, getNode, id, toast])

  const handleCropSave = useCallback(async (croppedImageUrl: string) => {
    await createNewNode(croppedImageUrl, '裁剪')
  }, [createNewNode])

  const handleEditorSave = useCallback(async (editedImageUrl: string) => {
    await createNewNode(editedImageUrl, '标注')
  }, [createNewNode])

  const imageSource = data.imageUrl ? getImageUrl(data.imageUrl) : null

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
      } as UploadImageNodeData)
    }
  }, [data, id, updateNodeData])

  return (
    <div
      className={getNodeContainerClass(selected, cn(isDragging && 'border-primary bg-primary/5'))}
      style={{ width: 280, height: 280 }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* 浮动标题 */}
      <div className={NODE_HEADER_FLOATING_CLASS}>
        <div className={NODE_HEADER_CLASSES.container}>
          <div className={NODE_HEADER_CLASSES.title}>
            <Upload className={NODE_HEADER_CLASSES.icon} />
            <span className="truncate">{data.sourceFileName || '上传图片'}</span>
          </div>
          {data.imageUrl && (
            <button
              type="button"
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
              onClick={handleClear}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 图片/上传区域 */}
      {data.imageUrl ? (
        <div className={cn('relative w-full h-full group/image', NODE_IMAGE_CONTAINER_CLASS)}>
          <img
            src={imageSource || ''}
            alt={data.sourceFileName || 'Uploaded'}
            className="w-full h-full object-contain"
            draggable={false}
            onLoad={handleImageLoad}
          />
          {resolutionText && (
            <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover/image:opacity-100 transition-opacity pointer-events-none">
              {resolutionText}
            </span>
          )}
          {/* 三个操作按钮 */}
          <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/40 opacity-0 group-hover/image:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); setIsPreviewOpen(true) }}
              className="w-10 h-10 rounded-lg bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors"
              title="预览"
            >
              <ZoomIn className="h-5 w-5 text-white" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setIsEditorOpen(true) }}
              className="w-10 h-10 rounded-lg bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors"
              title="标注"
            >
              <Pencil className="h-5 w-5 text-white" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setIsCropOpen(true) }}
              className="w-10 h-10 rounded-lg bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors"
              title="裁剪"
            >
              <Crop className="h-5 w-5 text-white" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-muted-foreground/30 rounded-lg hover:border-primary/50 hover:bg-muted/50 transition-all"
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">点击上传图片</span>
          </button>
          <span className="text-[10px] text-muted-foreground">或拖拽图片到此区域</span>
        </div>
      )}

      {/* 输入端口 */}
      <Handle
        type="target"
        id="target"
        position={Position.Left}
        className={getTargetHandleClass(undefined, enlargedHandles.target)}
      />

      {/* 输出端口 */}
      <Handle
        type="source"
        id="source"
        position={Position.Right}
        className={getSourceHandleClass(undefined, enlargedHandles.source)}
      />

      {/* 隐藏的文件输入 */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleInputChange} />

      {/* 预览弹窗 */}
      {imageSource && (
        <ImagePreviewDialog
          src={imageSource}
          alt={data.sourceFileName || 'Uploaded'}
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          title={data.sourceFileName || '上传图片'}
        />
      )}

      {/* 裁剪弹窗 */}
      {imageSource && (
        <ImageCropDialog
          open={isCropOpen}
          imageUrl={data.imageUrl || ''}
          projectId={currentProjectId || undefined}
          episodeId={currentEpisodeId || undefined}
          onClose={() => setIsCropOpen(false)}
          onSave={handleCropSave}
        />
      )}

      {/* 标注弹窗 */}
      {imageSource && (
        <ImageEditorDialog
          open={isEditorOpen}
          imageUrl={data.imageUrl || ''}
          projectId={currentProjectId || undefined}
          episodeId={currentEpisodeId || undefined}
          onClose={() => setIsEditorOpen(false)}
          onSave={handleEditorSave}
        />
      )}

      {/* 缩放手柄 */}
      <NodeResizeHandle minWidth={NODE_MIN_WIDTH} minHeight={NODE_MIN_HEIGHT} maxWidth={1200} maxHeight={1200} />
    </div>
  )
})

UploadNode.displayName = 'UploadNode'
