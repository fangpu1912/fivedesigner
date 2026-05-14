import { useState, useEffect, useRef } from 'react'
import { ScrollText, Filter, Trash2, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useTaskLogsQuery, useGenerationTaskQuery } from '@/hooks/useGenerationTasks'
import { useLogBufferSubscribe } from '@/utils/logBuffer'
import type { TaskLogEntry, TaskLogLevel } from '@/types'
import { getImageUrl, getVideoUrl, getAudioUrl } from '@/utils/asset'

const LEVEL_CONFIG: Record<TaskLogLevel, { color: string; bgColor: string; label: string }> = {
  debug: { color: 'text-gray-400', bgColor: 'bg-gray-500/10', label: 'DEBUG' },
  info: { color: 'text-blue-400', bgColor: 'bg-blue-500/10', label: 'INFO' },
  warn: { color: 'text-yellow-400', bgColor: 'bg-yellow-500/10', label: 'WARN' },
  error: { color: 'text-red-400', bgColor: 'bg-red-500/10', label: 'ERROR' },
}

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  pending: { color: 'text-muted-foreground', label: '等待中' },
  running: { color: 'text-primary', label: '运行中' },
  completed: { color: 'text-green-500', label: '已完成' },
  failed: { color: 'text-destructive', label: '失败' },
  cancelled: { color: 'text-muted-foreground', label: '已取消' },
}

const TYPE_CONFIG: Record<string, { label: string }> = {
  image_generation: { label: '图片生成' },
  video_generation: { label: '视频生成' },
  audio_generation: { label: '语音生成' },
  text_generation: { label: '文本生成' },
}

function LogEntryRow({ entry }: { entry: TaskLogEntry }) {
  const [expanded, setExpanded] = useState(false)
  const config = LEVEL_CONFIG[entry.level] || LEVEL_CONFIG.info
  const time = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ''

  return (
    <div className={cn('px-2 py-1 text-xs font-mono hover:bg-muted/50 cursor-pointer', config.bgColor)}>
      <div className="flex items-start gap-2" onClick={() => setExpanded(!expanded)}>
        <span className={cn('shrink-0 w-12 text-[10px] font-semibold', config.color)}>{config.label}</span>
        <span className="shrink-0 text-muted-foreground">{time}</span>
        <span className="flex-1 truncate">{entry.message}</span>
        {entry.data && (
          <span className="shrink-0 text-muted-foreground">
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </span>
        )}
      </div>
      {expanded && entry.data && (
        <pre className="mt-1 ml-14 p-2 bg-muted rounded text-[10px] overflow-x-auto max-h-40">
          {JSON.stringify(entry.data, null, 2)}
        </pre>
      )}
    </div>
  )
}

function ResultPreview({ task }: { task: { output_path?: string; output_url?: string; type?: string } }) {
  const path = task.output_path || task.output_url
  if (!path) return null

  const type = task.type || ''
  if (type.includes('image')) {
    const url = getImageUrl(path)
    if (!url) return null
    return (
      <div className="mt-2 rounded-md overflow-hidden border">
        <img src={url} alt="生成结果" className="max-w-full max-h-40 object-contain" />
      </div>
    )
  }
  if (type.includes('video')) {
    const url = getVideoUrl(path)
    if (!url) return null
    return (
      <div className="mt-2 rounded-md overflow-hidden border">
        <video src={url} controls className="max-w-full max-h-40" />
      </div>
    )
  }
  if (type.includes('audio')) {
    const url = getAudioUrl(path)
    if (!url) return null
    return (
      <div className="mt-2">
        <audio src={url} controls className="w-full" />
      </div>
    )
  }
  return null
}

export function TaskLogPanel({ taskId, onClose }: { taskId: string; onClose?: () => void }) {
  const [levelFilter, setLevelFilter] = useState<TaskLogLevel | 'all'>('all')
  const [showRealtime, setShowRealtime] = useState(true)
  const [realtimeLogs, setRealtimeLogs] = useState<Array<{ index: number; timestamp: string; level: TaskLogLevel; message: string; data?: Record<string, unknown> }>>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastRealtimeIndex = useRef(0)

  const { data: task } = useGenerationTaskQuery(taskId)
  const { data: dbLogs, refetch } = useTaskLogsQuery(taskId, {
    level: levelFilter === 'all' ? undefined : levelFilter,
    enabled: !showRealtime,
  })

  useEffect(() => {
    if (!showRealtime) return
    const unsubscribe = useLogBufferSubscribe(entries => {
      const newEntries = entries.filter(e => e.taskId === taskId && e.index > lastRealtimeIndex.current)
      if (newEntries.length > 0) {
      const lastEntry = newEntries[newEntries.length - 1]
      if (lastEntry) {
        lastRealtimeIndex.current = lastEntry.index
      }
        setRealtimeLogs(prev => [...prev, ...newEntries].slice(-200))
      }
    })
    return unsubscribe
  }, [taskId, showRealtime])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [realtimeLogs, dbLogs])

  const displayLogs = showRealtime ? realtimeLogs : (dbLogs || [])

  const statusConfig = task ? (STATUS_CONFIG[task.status] || STATUS_CONFIG.pending) : null
  const typeConfig = task?.type ? (TYPE_CONFIG[task.type] || { label: task.type }) : null

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScrollText className="h-4 w-4" />
            <CardTitle className="text-sm">{task?.name || '任务日志'}</CardTitle>
            {statusConfig && (
              <span className={cn('text-xs px-1.5 py-0.5 rounded-md', statusConfig.color)}>
                {statusConfig.label}
              </span>
            )}
            {typeConfig && (
              <span className="text-xs text-muted-foreground">{typeConfig.label}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setShowRealtime(!showRealtime)}
              title={showRealtime ? '切换到数据库日志' : '切换到实时日志'}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', showRealtime && 'text-primary')} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => refetch()}
              title="刷新"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            {onClose && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        {task && (
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            {task.model && <span>模型: {task.model}</span>}
            {task.prompt && <span className="truncate max-w-48">提示词: {task.prompt.substring(0, 60)}...</span>}
            {task.progress > 0 && task.progress < 100 && <span>进度: {task.progress}%</span>}
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-2 overflow-hidden pt-0">
        <div className="flex items-center gap-1">
          <Filter className="h-3 w-3 text-muted-foreground" />
          {(['all', 'info', 'warn', 'error', 'debug'] as const).map(level => (
            <Button
              key={level}
              variant={levelFilter === level ? 'secondary' : 'ghost'}
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={() => setLevelFilter(level)}
            >
              {level === 'all' ? '全部' : LEVEL_CONFIG[level]?.label || level}
            </Button>
          ))}
          <span className="ml-auto text-[10px] text-muted-foreground">
            {showRealtime ? '实时' : '数据库'} · {displayLogs.length} 条
          </span>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto border rounded-md bg-background"
        >
          {displayLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <ScrollText className="h-6 w-6 mb-2 opacity-50" />
              <p className="text-xs">暂无日志</p>
            </div>
          ) : (
            displayLogs.map((log, i) => (
              <LogEntryRow
                key={'id' in log ? (log as TaskLogEntry).id : i}
                entry={log as TaskLogEntry}
              />
            ))
          )}
        </div>

        {task?.status === 'completed' && <ResultPreview task={task} />}
      </CardContent>
    </Card>
  )
}
