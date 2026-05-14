import { X, Loader2, CheckCircle, AlertCircle, Clock } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { getImageUrl, getVideoUrl, getAudioUrl } from '@/utils/asset'

// 本地定义 Task 类型，避免依赖已删除的 useTaskQueueStore
type TaskStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
type TaskType =
  | 'image_generation'
  | 'video_generation'
  | 'audio_generation'
  | 'voice_clone'
  | 'script_analysis'
  | 'batch_operation'
  | 'export'
  | 'import'
  | 'other'

interface TaskResult {
  outputUrl?: string
  outputPath?: string
  metadata?: Record<string, unknown>
}

interface Task {
  id: string
  name?: string
  type: TaskType
  status: TaskStatus
  progress: number
  description?: string
  errorMessage?: string
  createdAt?: number
  startedAt?: number
  completedAt?: number
  result?: TaskResult
}

interface GenerationProgressProps {
  task: Task
  onCancel?: () => void
}

const STATUS_CONFIG: Record<TaskStatus, { icon: typeof Clock; label: string; color: string; bgColor: string }> = {
  pending: {
    icon: Clock,
    label: '等待中',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
  },
  running: {
    icon: Loader2,
    label: '生成中',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  paused: {
    icon: Clock,
    label: '已暂停',
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
  },
  completed: {
    icon: CheckCircle,
    label: '已完成',
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  failed: {
    icon: AlertCircle,
    label: '失败',
    color: 'text-destructive',
    bgColor: 'bg-destructive/10',
  },
  cancelled: {
    icon: AlertCircle,
    label: '已取消',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
  },
}

const TYPE_LABELS: Record<TaskType, string> = {
  image_generation: '图片',
  video_generation: '视频',
  audio_generation: '音频',
  voice_clone: '音色复刻',
  script_analysis: '剧本分析',
  batch_operation: '批量操作',
  export: '导出',
  import: '导入',
  other: '其他',
}

export function GenerationProgress({ task, onCancel }: GenerationProgressProps) {
  const config = STATUS_CONFIG[task.status]
  const StatusIcon = config.icon
  const isRunning = task.status === 'running'
  const isPending = task.status === 'pending'
  const isCompleted = task.status === 'completed'
  const isFailed = task.status === 'failed'

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return minutes > 0 ? `${minutes}分${remainingSeconds}秒` : `${remainingSeconds}秒`
  }

  const getElapsedTime = () => {
    if (!task.startedAt) return null
    const endTime = task.completedAt || Date.now()
    return formatTime(endTime - task.startedAt)
  }

  const getTaskName = () => {
    return task.name || TYPE_LABELS[task.type] || '任务'
  }

  return (
    <Card className={cn('overflow-hidden', isFailed && 'border-destructive')}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className={cn('p-2 rounded-full', config.bgColor)}>
            <StatusIcon className={cn('h-5 w-5', config.color, isRunning && 'animate-spin')} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">{getTaskName()}</span>
              <span className={cn('text-sm', config.color)}>{config.label}</span>
            </div>

            {(isRunning || isPending) && (
              <div className="space-y-2">
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300 ease-out"
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{task.progress}%</span>
                  {getElapsedTime() && <span>已用时: {getElapsedTime()}</span>}
                </div>
              </div>
            )}

            {isCompleted && task.result && (
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">
                  生成完成 · 用时: {getElapsedTime()}
                </div>
                {task.result.outputUrl && task.type === 'image_generation' && (
                  <div className="relative rounded-lg overflow-hidden bg-secondary">
                    <img
                      src={getImageUrl(task.result.outputUrl) || task.result.outputUrl}
                      alt="生成结果"
                      className="w-full h-auto max-h-48 object-contain"
                    />
                  </div>
                )}
                {task.result.outputUrl && task.type === 'video_generation' && (
                  <video
                    src={getVideoUrl(task.result.outputUrl) || task.result.outputUrl}
                    controls
                    className="w-full h-auto max-h-48 rounded-lg"
                  />
                )}
                {task.result.outputUrl && task.type === 'audio_generation' && (
                  <audio src={getAudioUrl(task.result.outputUrl) || task.result.outputUrl} controls className="w-full" />
                )}
              </div>
            )}

            {isFailed && task.errorMessage && (
              <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                {task.errorMessage}
              </div>
            )}

            {task.description && (
              <div className="mt-2 text-sm text-muted-foreground line-clamp-2">
                {task.description}
              </div>
            )}
          </div>

          {(isRunning || isPending) && onCancel && (
            <Button variant="ghost" size="icon" onClick={onCancel} className="shrink-0">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export type { Task, TaskStatus, TaskType }
