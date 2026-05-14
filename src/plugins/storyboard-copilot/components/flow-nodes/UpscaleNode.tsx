import { memo, useState, useCallback, useRef, useEffect } from 'react'
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react'
import { Maximize, Loader2, ImageIcon, AlertCircle, Play, X, Cloud } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/useToast'
import { getImageUrl } from '@/utils/asset'
import { useUIStore } from '@/store/useUIStore'
import { upscaleImage } from '@/services/upscaleService'
import { setUpscaleWorkflowConfig, getUpscaleWorkflowConfig } from '@/services/comfyuiUpscaleService'
import { getWorkflowConfigs } from '@/services/workflowConfigService'
import { useTaskQueueStore } from '@/store/useTaskQueueStore'
import { canvasEvents } from '../../utils/canvasEvents'
import { useUpstreamData } from '../../hooks/useUpstreamData'
import {
  getNodeContainerClass,
  getTargetHandleClass,
  getSourceHandleClass,
  NODE_HEADER_FLOATING_CLASS,
  NODE_HEADER_CLASSES,
} from './NodeStyles'
import { useEnlargedHandles } from '../../hooks/useEnlargedHandles'
import type { UpscaleNodeData } from '../../types'
import type { WorkflowConfig } from '@/types'

interface UpscaleNodeProps extends NodeProps {
  data: UpscaleNodeData
}

export const UpscaleNode = memo(({ id, data, selected }: UpscaleNodeProps) => {
  const { updateNodeData } = useReactFlow()
  const { toast } = useToast()
  const currentProjectId = useUIStore((state) => state.currentProjectId)
  const currentEpisodeId = useUIStore((state) => state.currentEpisodeId)
  const { upstreamImage } = useUpstreamData(id)
  const upstreamImageRef = useRef<string | null>(null)
  const enlargedHandles = useEnlargedHandles(id)

  const [isProcessing, setIsProcessing] = useState(data.isProcessing || false)
  const [progress, setProgress] = useState(data.progress || 0)
  const [resultUrl, setResultUrl] = useState<string | null>(data.imageUrl || null)
  const [workflows, setWorkflows] = useState<WorkflowConfig[]>([])
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(data.workflowId || '')
  const abortControllerRef = useRef<AbortController | null>(null)

  // 加载工作流列表（从 localStorage，与分镜绘制页面保持一致）
  useEffect(() => {
    try {
      const list = getWorkflowConfigs()
      setWorkflows(list)
      if (data.workflowId && data.workflowName) {
        const saved = list.find((w: WorkflowConfig) => w.id === data.workflowId)
        if (saved) {
          setUpscaleWorkflowConfig(saved)
        }
      }
    } catch {}
  }, [])

  // 选中工作流
  const handleWorkflowChange = useCallback((workflowId: string) => {
    setSelectedWorkflowId(workflowId)
    const workflow = workflows.find(w => w.id === workflowId)
    if (workflow) {
      setUpscaleWorkflowConfig(workflow)
      updateNodeData(id, { ...data, workflowId: workflow.id, workflowName: workflow.name } as UpscaleNodeData)
    }
  }, [workflows, data, id, updateNodeData])

  useEffect(() => {
    if (upstreamImage && !data.imageUrl) {
      upstreamImageRef.current = upstreamImage
      updateNodeData(id, { imageUrl: upstreamImage })
    } else if (!upstreamImage && upstreamImageRef.current && data.imageUrl === upstreamImageRef.current) {
      upstreamImageRef.current = null
      updateNodeData(id, { imageUrl: null })
    }
  }, [upstreamImage, data.imageUrl, id, updateNodeData])

  const effectiveImageUrl = data.imageUrl || upstreamImage
  const hasInputImage = !!effectiveImageUrl
  const imageUrl = effectiveImageUrl ? getImageUrl(effectiveImageUrl) : null

  useEffect(() => {
    if (data._executeTrigger && hasInputImage && !isProcessing) {
      handleUpscale()
    }
  }, [data._executeTrigger])

  const handleUpscale = useCallback(async () => {
    if (!data.imageUrl || isProcessing) return

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    setIsProcessing(true)
    updateNodeData(id, { ...data, isProcessing: true } as UpscaleNodeData)

    // 加入任务队列
    const taskId = useTaskQueueStore.getState().addTask({
      type: 'image_generation',
      name: 'ComfyUI 图片放大',
      description: data.workflowName || 'ComfyUI 超分',
      metadata: { nodeId: id, workflowId: selectedWorkflowId },
    })
    useTaskQueueStore.getState().updateTask(taskId, { status: 'running', startedAt: Date.now() })

    try {
      toast({ title: '开始放大图片...', description: 'ComfyUI 工作流' })
      const result = await upscaleImage({
        imageUrl: data.imageUrl!,
        projectId: currentProjectId ?? undefined,
        episodeId: currentEpisodeId ?? undefined,
        onProgress: (p) => {
          setProgress(p)
          useTaskQueueStore.getState().updateTask(taskId, { progress: p })
          updateNodeData(id, { ...data, progress: p, isProcessing: true } as UpscaleNodeData)
        },
      })
      if (abortControllerRef.current?.signal.aborted) return
      if (!result.success || !result.imageUrl) throw new Error(result.error || '放大失败')

      const savedPath = result.imageUrl
      setResultUrl(savedPath)
      updateNodeData(id, {
        ...data,
        imageUrl: savedPath,
        isProcessing: false,
        progress: 100,
      } as UpscaleNodeData)

      useTaskQueueStore.getState().updateTask(taskId, {
        status: 'completed',
        progress: 100,
        completedAt: Date.now(),
        result: { success: true, outputUrl: savedPath },
      })

      canvasEvents.emit({
        type: 'addResultNode',
        imageUrl: savedPath,
        sourceNodeId: id,
        sourceHandleId: 'source',
      })

      toast({ title: '放大完成' })
    } catch (error) {
      console.error('图片放大失败:', error)
      toast({
        title: '放大失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      })
      useTaskQueueStore.getState().updateTask(taskId, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : '未知错误',
      })
      updateNodeData(id, { ...data, isProcessing: false, progress: 0 } as UpscaleNodeData)
    } finally {
      setIsProcessing(false)
      abortControllerRef.current = null
    }
  }, [data, id, selectedWorkflowId, updateNodeData, toast, currentProjectId, currentEpisodeId])

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsProcessing(false)
    setProgress(0)
    updateNodeData(id, { ...data, isProcessing: false, progress: 0 } as UpscaleNodeData)
    toast({ title: '已取消放大' })
  }, [data, id, updateNodeData, toast])

  return (
    <div
      className={getNodeContainerClass(selected, 'flex h-full flex-col')}
      style={{ width: 320, height: 400 }}
    >
      <div className={NODE_HEADER_FLOATING_CLASS}>
        <div className={NODE_HEADER_CLASSES.container}>
          <div className={NODE_HEADER_CLASSES.title}>
            <Maximize className={NODE_HEADER_CLASSES.icon} />
            <span>图片放大</span>
          </div>
          {isProcessing && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {progress}%
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col h-full">
        <div className="flex-1 min-h-0 p-3">
          <div className="relative rounded-lg overflow-hidden border bg-muted/20 aspect-video group">
            {imageUrl ? (
              <>
                <img
                  src={imageUrl}
                  alt="原始图片"
                  className="w-full h-full object-contain"
                />
                {resultUrl && (
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100">
                    <button onClick={(e) => { e.stopPropagation(); setResultUrl(null); updateNodeData(id, { ...data, imageUrl: upstreamImage || null } as UpscaleNodeData) }} className="p-1.5 rounded-md bg-red-500/80 text-white hover:bg-red-600" title="清除结果"><X className="w-4 h-4" /></button>
                  </div>
                )}
                {isProcessing && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
                    <Loader2 className="w-8 h-8 text-white animate-spin" />
                    <span className="text-white text-sm">{progress}%</span>
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <ImageIcon className="w-10 h-10" />
              </div>
            )}
          </div>

          {!hasInputImage && (
            <p className="text-[10px] text-muted-foreground text-center mt-2">
              请连接上游图片节点
            </p>
          )}
        </div>

        <div className="border-t border-border/40 bg-muted/20 px-3 py-2 space-y-2">
          {/* 工作流选择 */}
          <Select value={selectedWorkflowId} onValueChange={handleWorkflowChange} disabled={isProcessing}>
            <SelectTrigger className="h-7 text-[11px]">
              <SelectValue placeholder="选择工作流..." />
            </SelectTrigger>
            <SelectContent>
              {workflows.map(w => (
                <SelectItem key={w.id} value={w.id} className="text-[11px]">
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 按钮 */}
          <div className="flex items-center gap-2">
            {isProcessing ? (
              <Button
                variant="destructive"
                size="sm"
                className="h-8 px-3 text-[11px] flex-1"
                onClick={handleCancel}
              >
                <AlertCircle className="w-3 h-3 mr-1" />
                取消
              </Button>
            ) : (
              <Button
                variant="default"
                size="sm"
                className="h-8 px-3 text-[11px] flex-1"
                disabled={!getUpscaleWorkflowConfig()?.workflow}
                onClick={() => {
                  if (hasInputImage) {
                    handleUpscale()
                  } else {
                    canvasEvents.emit({ type: 'executeNode', nodeId: id })
                  }
                }}
              >
                {resultUrl ? (
                  <><Maximize className="w-3 h-3 mr-1" />重新放大</>
                ) : hasInputImage ? (
                  <><Maximize className="w-3 h-3 mr-1" />放大</>
                ) : (
                  <><Play className="w-3 h-3 mr-1" />获取并放大</>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      <Handle type="target" id="target" position={Position.Left} className={getTargetHandleClass(undefined, enlargedHandles.target)} />
      <Handle type="source" id="source" position={Position.Right} className={getSourceHandleClass(undefined, enlargedHandles.source)} />
    </div>
  )
})

UpscaleNode.displayName = 'UpscaleNode'
