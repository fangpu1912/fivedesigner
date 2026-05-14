import { useState } from 'react'
import {
  X,
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
  Pause,
  Play,
  Trash2,
  RotateCcw,
  Settings2,
  ChevronDown,
  ChevronUp,
  ListX,
  Image,
  Video,
  Music,
  FileText,
  Mic,
  Package,
} from 'lucide-react'

import { useTaskQueueStore, type Task, type TaskQueueStatus, type TaskQueueType } from '@/store/useTaskQueueStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { getImageUrl, getVideoUrl, getAudioUrl } from '@/utils/asset'

const STATUS_CONFIG: Record<TaskQueueStatus, { icon: typeof Clock; label: string; color: string; bgColor: string }> = {
  pending: { icon: Clock, label: '等待中', color: 'text-muted-foreground', bgColor: 'bg-muted' },
  running: { icon: Loader2, label: '生成中', color: 'text-primary', bgColor: 'bg-primary/10' },
  paused: { icon: Clock, label: '已暂停', color: 'text-yellow-500', bgColor: 'bg-yellow-500/10' },
  completed: { icon: CheckCircle, label: '已完成', color: 'text-green-500', bgColor: 'bg-green-500/10' },
  failed: { icon: AlertCircle, label: '失败', color: 'text-destructive', bgColor: 'bg-destructive/10' },
  cancelled: { icon: AlertCircle, label: '已取消', color: 'text-muted-foreground', bgColor: 'bg-muted' },
}

const TYPE_CONFIG: Record<TaskQueueType, { label: string; icon: typeof Image }> = {
  image_generation: { label: '图片', icon: Image },
  video_generation: { label: '视频', icon: Video },
  audio_generation: { label: '音频', icon: Music },
  voice_clone: { label: '音色复刻', icon: Mic },
  script_analysis: { label: '剧本分析', icon: FileText },
  batch_operation: { label: '批量操作', icon: Package },
  export: { label: '导出', icon: Package },
  import: { label: '导入', icon: Package },
  other: { label: '其他', icon: FileText },
}

function formatTime(ms: number) {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return minutes > 0 ? `${minutes}分${remainingSeconds}秒` : `${remainingSeconds}秒`
}

function getElapsedTime(task: Task) {
  if (!task.startedAt) return null
  const endTime = task.completedAt || Date.now()
  return formatTime(endTime - task.startedAt)
}

function TaskItem({ task }: { task: Task }) {
  const [expanded, setExpanded] = useState(false)
  const { cancelTask, retryTask, removeTask } = useTaskQueueStore()
  const statusConfig = STATUS_CONFIG[task.status]
  const typeConfig = TYPE_CONFIG[task.type]
  const StatusIcon = statusConfig.icon
  const TypeIcon = typeConfig.icon
  const isRunning = task.status === 'running'
  const isPending = task.status === 'pending'
  const isCompleted = task.status === 'completed'
  const isFailed = task.status === 'failed'
  const isCancelled = task.status === 'cancelled'
  const isDone = isCompleted || isFailed || isCancelled

  return (
    <div className={cn('border rounded-lg p-3 transition-colors', isFailed && 'border-destructive/50')}>
      <div className="flex items-start gap-3">
        <div className={cn('p-1.5 rounded-md shrink-0', statusConfig.bgColor)}>
          <TypeIcon className={cn('h-4 w-4', statusConfig.color)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-medium text-sm truncate">
              {task.name || typeConfig.label}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={cn('text-xs', statusConfig.color)}>{statusConfig.label}</span>
              {isRunning && (
                <StatusIcon className={cn('h-3.5 w-3.5 animate-spin', statusConfig.color)} />
              )}
            </div>
          </div>

          {(isRunning || isPending) && (
            <div className="space-y-1.5 mb-1">
              <Progress value={task.progress} className="h-1.5" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{task.stepName || `${task.progress}%`}</span>
                {getElapsedTime(task) && <span>{getElapsedTime(task)}</span>}
              </div>
            </div>
          )}

          {isFailed && task.errorMessage && (
            <div className="text-xs text-destructive bg-destructive/10 p-1.5 rounded mt-1 line-clamp-2">
              {task.errorMessage}
            </div>
          )}

          {isDone && task.result?.outputUrl && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-primary hover:underline mt-1 flex items-center gap-1"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              预览结果
            </button>
          )}

          {expanded && task.result?.outputUrl && (
            <div className="mt-2 rounded-lg overflow-hidden bg-secondary/50">
              {task.type === 'image_generation' && (
                <img
                  src={getImageUrl(task.result.outputUrl) || task.result.outputUrl}
                  alt="生成结果"
                  className="w-full h-auto max-h-48 object-contain"
                />
              )}
              {task.type === 'video_generation' && (
                <video
                  src={getVideoUrl(task.result.outputUrl) || task.result.outputUrl}
                  controls
                  className="w-full h-auto max-h-48"
                />
              )}
              {task.type === 'audio_generation' && (
                <audio
                  src={getAudioUrl(task.result.outputUrl) || task.result.outputUrl}
                  controls
                  className="w-full"
                />
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {(isRunning || isPending) && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => cancelTask(task.id)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
          {(isFailed || isCancelled) && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => retryTask(task.id)}
              title="重试"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
          {isDone && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => removeTask(task.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export function TaskQueuePanel() {
  const {
    tasks,
    isPaused,
    maxConcurrent,
    pauseQueue,
    resumeQueue,
    clearCompleted,
    clearAll,
    setMaxConcurrent,
    hasActiveTasks,
  } = useTaskQueueStore()

  const [showSettings, setShowSettings] = useState(false)

  const pendingCount = tasks.filter(t => t.status === 'pending').length
  const runningCount = tasks.filter(t => t.status === 'running').length
  const completedCount = tasks.filter(t => t.status === 'completed').length
  const failedCount = tasks.filter(t => t.status === 'failed').length

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Clock className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">暂无任务</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-1 mb-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            {runningCount > 0 && <span className="text-primary">{runningCount} 进行中</span>}
            {runningCount > 0 && pendingCount > 0 && <span className="mx-1">·</span>}
            {pendingCount > 0 && <span>{pendingCount} 等待</span>}
            {completedCount > 0 && <><span className="mx-1">·</span><span className="text-green-500">{completedCount} 完成</span></>}
            {failedCount > 0 && <><span className="mx-1">·</span><span className="text-destructive">{failedCount} 失败</span></>}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setShowSettings(!showSettings)}
            title="设置"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>

          {hasActiveTasks() && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={isPaused ? resumeQueue : pauseQueue}
              title={isPaused ? '继续' : '暂停'}
            >
              {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </Button>
          )}

          {completedCount > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={clearCompleted}
              title="清除已完成"
            >
              <ListX className="h-3.5 w-3.5" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={clearAll}
            title="清除全部"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {showSettings && (
        <Card className="mb-3">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">最大并发数</span>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 5].map(n => (
                  <Button
                    key={n}
                    variant={maxConcurrent === n ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 w-7 p-0 text-xs"
                    onClick={() => setMaxConcurrent(n)}
                  >
                    {n}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex-1 overflow-y-auto space-y-2">
        {[...tasks]
          .sort((a, b) => {
            const statusOrder: Record<TaskQueueStatus, number> = {
              running: 0,
              pending: 1,
              paused: 2,
              failed: 3,
              cancelled: 4,
              completed: 5,
            }
            const statusDiff = statusOrder[a.status] - statusOrder[b.status]
            if (statusDiff !== 0) return statusDiff
            return b.createdAt - a.createdAt
          })
          .map(task => (
            <TaskItem key={task.id} task={task} />
          ))}
      </div>
    </div>
  )
}
