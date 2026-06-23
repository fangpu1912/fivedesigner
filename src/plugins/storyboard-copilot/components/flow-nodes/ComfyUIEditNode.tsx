import { memo, useState, useCallback, useRef, useEffect } from 'react'
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react'
import { Workflow, Loader2, ImageIcon, Play, Square, CheckCircle2, XCircle, Clock, Film, Music } from 'lucide-react'

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
import { getWorkflowConfigs } from '@/services/workflowConfigService'
import { setEditWorkflowConfig, getEditWorkflowConfig, batchEditWithComfyUI } from '@/services/comfyuiEditService'
import { useTaskQueueStore } from '@/store/useTaskQueueStore'
import { useUpstreamData } from '../../hooks/useUpstreamData'
import {
  getNodeContainerClass,
  getTargetHandleClass,
  getSourceHandleClass,
  NODE_HEADER_FLOATING_CLASS,
  NODE_HEADER_CLASSES,
} from './NodeStyles'
import { useEnlargedHandles } from '../../hooks/useEnlargedHandles'
import type { ComfyUIEditNodeData, BatchMediaType } from '../../types'
import type { WorkflowConfig } from '@/types'

interface ComfyUIEditNodeProps extends NodeProps {
  data: ComfyUIEditNodeData
}

function MediaTypeBadge({ type }: { type?: BatchMediaType }) {
  const iconMap = {
    image: { icon: ImageIcon, color: 'text-orange-400' },
    video: { icon: Film, color: 'text-blue-400' },
    audio: { icon: Music, color: 'text-green-400' },
  } as const
  const key = (type || 'image') as keyof typeof iconMap
  const config = iconMap[key]
  const Icon = config.icon
  return <Icon className={`w-3 h-3 ${config.color}`} />
}

export const ComfyUIEditNode = memo(({ id, data, selected }: ComfyUIEditNodeProps) => {
  const { updateNodeData } = useReactFlow()
  const { toast } = useToast()
  const currentProjectId = useUIStore((state) => state.currentProjectId)
  const currentEpisodeId = useUIStore((state) => state.currentEpisodeId)
  const { upstreamImage, upstreamImages } = useUpstreamData(id)
  const enlargedHandles = useEnlargedHandles(id)

  const [isProcessing, setIsProcessing] = useState(data.isProcessing || false)
  const [progress, setProgress] = useState(data.currentProgress || 0)
  const [workflows, setWorkflows] = useState<WorkflowConfig[]>([])
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(data.workflowId || '')
  const abortRef = useRef(false)

  const items = data.items || []

  // 加载工作流列表
  useEffect(() => {
    try {
      const list = getWorkflowConfigs()
      setWorkflows(list)
      if (data.workflowId) {
        const saved = list.find((w: WorkflowConfig) => w.id === data.workflowId)
        if (saved) {
          setEditWorkflowConfig(saved)
        }
      }
    } catch {}
  }, [])

  // 接收上游数据：单张图片或批量图片/视频/音频
  useEffect(() => {
    if (upstreamImages.length > 0 && items.length === 0) {
      const newItems = upstreamImages.map((url, i) => ({
        id: `item-${Date.now()}-${i}`,
        inputUrl: url,
        inputType: 'image' as BatchMediaType,
        outputUrl: null,
        sourceFileName: `image_${i + 1}`,
        status: 'pending' as const,
      }))
      updateNodeData(id, { ...data, items: newItems } as ComfyUIEditNodeData)
    } else if (upstreamImage && !upstreamImages.length && items.length === 0) {
      updateNodeData(id, {
        ...data,
        items: [{
          id: `item-${Date.now()}-0`,
          inputUrl: upstreamImage,
          inputType: 'image' as BatchMediaType,
          outputUrl: null,
          sourceFileName: 'input',
          status: 'pending' as const,
        }],
      } as ComfyUIEditNodeData)
    }
  }, [upstreamImage, upstreamImages])

  // 选中工作流
  const handleWorkflowChange = useCallback((workflowId: string) => {
    setSelectedWorkflowId(workflowId)
    const workflow = workflows.find(w => w.id === workflowId)
    if (workflow) {
      setEditWorkflowConfig(workflow)
      updateNodeData(id, { ...data, workflowId: workflow.id, workflowName: workflow.name } as ComfyUIEditNodeData)
    }
  }, [workflows, data, id, updateNodeData])

  // 执行批量处理
  const handleProcess = useCallback(async () => {
    const currentItems = data.items || []
    const pendingItems = currentItems.filter(i => i.status === 'pending' || i.status === 'error')
    if (pendingItems.length === 0) {
      toast({ title: '没有待处理的文件', variant: 'destructive' })
      return
    }

    if (!getEditWorkflowConfig()?.workflow) {
      toast({ title: '请先选择工作流', variant: 'destructive' })
      return
    }

    abortRef.current = false
    setIsProcessing(true)
    updateNodeData(id, { ...data, isProcessing: true, currentProgress: 0 } as ComfyUIEditNodeData)

    const taskId = useTaskQueueStore.getState().addTask({
      type: 'image_generation',
      name: `ComfyUI 批量编辑 (${pendingItems.length}个文件)`,
      description: data.workflowName || 'ComfyUI 工作流',
      metadata: { nodeId: id },
    })
    useTaskQueueStore.getState().updateTask(taskId, { status: 'running', startedAt: Date.now() })

    try {
      const results = await batchEditWithComfyUI(
        pendingItems.map(i => ({ id: i.id, mediaUrl: i.inputUrl!, mediaType: i.inputType })),
        {
          projectId: currentProjectId ?? undefined,
          episodeId: currentEpisodeId ?? undefined,
          onItemProgress: (_itemId, p) => {
            setProgress(p)
            updateNodeData(id, { ...data, currentProgress: p } as ComfyUIEditNodeData)
            useTaskQueueStore.getState().updateTask(taskId, { progress: p })
          },
          onItemComplete: (itemId, result) => {
            if (abortRef.current) return
            const outputUrl = result.success
              ? (result.imageUrl || result.videoUrl || result.audioUrl || null)
              : null
            const outputType = result.success ? (result.outputType || undefined) : undefined
            const updatedItems = (data.items || []).map(item => {
              if (item.id === itemId) {
                return {
                  ...item,
                  outputUrl,
                  outputType,
                  status: result.success ? 'done' as const : 'error' as const,
                  error: result.error,
                }
              }
              return item
            })
            updateNodeData(id, { ...data, items: updatedItems } as ComfyUIEditNodeData)
          },
        }
      )

      if (abortRef.current) return

      const finalItems = (data.items || []).map(item => {
        const result = results.get(item.id)
        if (result) {
          const outputUrl = result.success
            ? (result.imageUrl || result.videoUrl || result.audioUrl || null)
            : null
          return {
            ...item,
            outputUrl,
            outputType: result.success ? (result.outputType || item.inputType) : undefined,
            status: result.success ? 'done' as const : 'error' as const,
            error: result.error,
          }
        }
        return item
      })

      updateNodeData(id, {
        ...data,
        items: finalItems,
        isProcessing: false,
        currentProgress: 100,
      } as ComfyUIEditNodeData)

      useTaskQueueStore.getState().updateTask(taskId, {
        status: 'completed',
        progress: 100,
        completedAt: Date.now(),
      })

      const successCount = finalItems.filter(i => i.status === 'done').length
      const failCount = finalItems.filter(i => i.status === 'error').length
      toast({
        title: `处理完成: ${successCount} 成功${failCount > 0 ? `, ${failCount} 失败` : ''}`,
        variant: failCount > 0 ? 'destructive' : undefined,
      })
    } catch (error) {
      console.error('批量处理失败:', error)
      toast({
        title: '批量处理失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      })
      useTaskQueueStore.getState().updateTask(taskId, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : '未知错误',
      })
      updateNodeData(id, { ...data, isProcessing: false, currentProgress: 0 } as ComfyUIEditNodeData)
    } finally {
      setIsProcessing(false)
    }
  }, [data, id, currentProjectId, currentEpisodeId, updateNodeData, toast])

  // 取消处理
  const handleCancel = useCallback(() => {
    abortRef.current = true
    setIsProcessing(false)
    setProgress(0)
    updateNodeData(id, { ...data, isProcessing: false, currentProgress: 0 } as ComfyUIEditNodeData)
    toast({ title: '已取消处理' })
  }, [data, id, updateNodeData, toast])

  // 重置错误项
  const handleRetryErrors = useCallback(() => {
    const updatedItems = items.map(item =>
      item.status === 'error' ? { ...item, status: 'pending' as const, error: undefined } : item
    )
    updateNodeData(id, { ...data, items: updatedItems } as ComfyUIEditNodeData)
  }, [items, data, id, updateNodeData])

  const doneCount = items.filter(i => i.status === 'done').length
  const errorCount = items.filter(i => i.status === 'error').length
  const pendingCount = items.filter(i => i.status === 'pending').length
  const hasInput = items.length > 0

  return (
    <div
      className={getNodeContainerClass(selected, 'flex h-full flex-col')}
      style={{ width: 360, height: 500 }}
    >
      <div className={NODE_HEADER_FLOATING_CLASS}>
        <div className={NODE_HEADER_CLASSES.container}>
          <div className={NODE_HEADER_CLASSES.title}>
            <Workflow className={NODE_HEADER_CLASSES.icon} />
            <span>ComfyUI编辑</span>
          </div>
          {isProcessing && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {progress}%
            </div>
          )}
          {!isProcessing && items.length > 0 && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              {doneCount > 0 && <span className="text-green-500">{doneCount}完成</span>}
              {errorCount > 0 && <span className="text-red-500">{errorCount}失败</span>}
              {pendingCount > 0 && <span>{pendingCount}待处理</span>}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col h-full">
        {/* 结果列表 */}
        <div className="flex-1 min-h-0 p-2 overflow-y-auto">
          {items.length === 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
              <div className="flex items-center gap-3 opacity-40">
                <ImageIcon className="w-8 h-8" />
                <Film className="w-8 h-8" />
                <Music className="w-8 h-8" />
              </div>
              <p className="text-[11px]">连接上游节点获取文件</p>
              <p className="text-[10px] opacity-60">支持图片/视频/音频批量处理</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-2 p-1.5 rounded-md border border-border/40 bg-muted/10">
                  {/* 输入缩略图 */}
                  <div className="w-10 h-10 rounded overflow-hidden bg-muted/20 flex-shrink-0 flex items-center justify-center">
                    {item.inputUrl && item.inputType === 'image' ? (
                      <img src={getImageUrl(item.inputUrl) || ''} alt="" className="w-full h-full object-cover" />
                    ) : item.inputUrl ? (
                      <MediaTypeBadge type={item.inputType} />
                    ) : (
                      <ImageIcon className="w-4 h-4 opacity-40" />
                    )}
                  </div>

                  {/* 状态 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <MediaTypeBadge type={item.inputType} />
                      <p className="text-[10px] truncate text-foreground/80">{item.sourceFileName || item.id}</p>
                    </div>
                    {item.status === 'processing' && (
                      <div className="flex items-center gap-1 text-[9px] text-blue-400">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" /> 处理中...
                      </div>
                    )}
                    {item.status === 'done' && (
                      <div className="flex items-center gap-1 text-[9px] text-green-500">
                        <CheckCircle2 className="w-2.5 h-2.5" /> 完成
                      </div>
                    )}
                    {item.status === 'error' && (
                      <div className="text-[9px] text-red-400 truncate" title={item.error}>
                        <XCircle className="w-2.5 h-2.5 inline mr-0.5" />{item.error || '失败'}
                      </div>
                    )}
                    {item.status === 'pending' && (
                      <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                        <Clock className="w-2.5 h-2.5" /> 等待
                      </div>
                    )}
                  </div>

                  {/* 输出缩略图 */}
                  <div className="w-10 h-10 rounded overflow-hidden bg-muted/20 flex-shrink-0 flex items-center justify-center">
                    {item.outputUrl && item.outputType === 'image' ? (
                      <img src={getImageUrl(item.outputUrl) || ''} alt="" className="w-full h-full object-cover" />
                    ) : item.outputUrl ? (
                      <MediaTypeBadge type={item.outputType || item.inputType} />
                    ) : (
                      <ImageIcon className="w-4 h-4 opacity-20" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="border-t border-border/40 bg-muted/20 px-2 py-2 space-y-1.5">
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

          {/* 操作按钮 */}
          <div className="flex items-center gap-1.5">
            {isProcessing ? (
              <Button
                variant="destructive"
                size="sm"
                className="h-7 px-2 text-[11px] flex-1"
                onClick={handleCancel}
              >
                <Square className="w-3 h-3 mr-1" />
                取消
              </Button>
            ) : (
              <>
                <Button
                  variant="default"
                  size="sm"
                  className="h-7 px-2 text-[11px] flex-1"
                  disabled={!hasInput || !getEditWorkflowConfig()?.workflow}
                  onClick={handleProcess}
                >
                  <Play className="w-3 h-3 mr-1" />
                  {pendingCount > 0 ? `处理 ${pendingCount} 个` : '开始处理'}
                </Button>
                {errorCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={handleRetryErrors}
                  >
                    重试失败
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <Handle type="target" id="target" position={Position.Left} className={getTargetHandleClass(undefined, enlargedHandles.target)} />
      <Handle type="source" id="source" position={Position.Right} className={getSourceHandleClass(undefined, enlargedHandles.source)} />
    </div>
  )
})

ComfyUIEditNode.displayName = 'ComfyUIEditNode'
