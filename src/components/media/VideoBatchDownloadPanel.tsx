import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Download,
  X,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  Play,
  Link,
  FileVideo,
  FolderOpen,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import {
  videoBatchDownloadService,
  type VideoDownloadTask,
} from '@/services/videoBatchDownloadService'

interface VideoBatchDownloadPanelProps {
  open: boolean
  onClose: () => void
  projectId?: string
  episodeId?: string
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 80)
}

export function VideoBatchDownloadPanel({
  open,
  onClose,
  projectId,
  episodeId,
}: VideoBatchDownloadPanelProps) {
  const { toast } = useToast()
  const [tasks, setTasks] = useState<VideoDownloadTask[]>([])
  const [urlInput, setUrlInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const refreshTasks = useCallback(() => {
    setTasks(videoBatchDownloadService.getTasks())
  }, [])

  useEffect(() => {
    if (!open) return

    refreshTasks()

    const unlisteners = [
      videoBatchDownloadService.on('progress', refreshTasks),
      videoBatchDownloadService.on('completed', refreshTasks),
      videoBatchDownloadService.on('failed', refreshTasks),
      videoBatchDownloadService.on('allCompleted', () => {
        refreshTasks()
        setIsProcessing(false)
      }),
    ]

    return () => {
      unlisteners.forEach(fn => fn())
    }
  }, [open, refreshTasks])

  useEffect(() => {
    videoBatchDownloadService.init()
    return () => {
      videoBatchDownloadService.destroy()
    }
  }, [])

  const stats = videoBatchDownloadService.getStats()

  const handleAddUrls = useCallback(() => {
    if (!urlInput.trim()) return

    const lines = urlInput
      .split(/[\n\r]+/)
      .map(line => line.trim())
      .filter(line => line.startsWith('http'))

    if (lines.length === 0) {
      toast({ title: '请输入有效的视频链接', variant: 'destructive' })
      return
    }

    const items = lines.map((url, i) => {
      const urlObj = new URL(url).pathname
      const rawName = urlObj.split('/').pop() || `video_${Date.now()}_${i}`
      const filename = sanitizeFilename(rawName) + '.mp4'
      return { url, filename, projectId, episodeId }
    })

    const newTasks = videoBatchDownloadService.addTasks(items)
    setUrlInput('')

    if (newTasks.length > 0) {
      toast({ title: `已添加 ${newTasks.length} 个下载任务` })
    } else {
      toast({ title: '所有链接已在下载队列中', variant: 'destructive' })
    }

    refreshTasks()
  }, [urlInput, projectId, episodeId, toast, refreshTasks])

  const handleStartBatch = useCallback(async () => {
    if (isProcessing) return
    setIsProcessing(true)
    try {
      await videoBatchDownloadService.startBatch()
    } catch (error) {
      toast({
        title: '批量下载出错',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      })
    } finally {
      setIsProcessing(false)
    }
  }, [isProcessing, toast])

  const handleClearCompleted = useCallback(() => {
    videoBatchDownloadService.clearCompleted()
    refreshTasks()
  }, [refreshTasks])

  const handleRemoveTask = useCallback((id: string) => {
    videoBatchDownloadService.removeTask(id)
    refreshTasks()
  }, [refreshTasks])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50" onClick={onClose} />
      <div className="w-[520px] bg-card border-l flex flex-col shadow-xl">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-lg">视频批量下载</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* URL 输入区 */}
        <div className="p-4 border-b space-y-3 shrink-0">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Link className="h-3 w-3" />
              视频链接（每行一个，支持豆包/即梦等分享链接）
            </label>
            <textarea
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder={`https://www.doubao.com/video-sharing?...\nhttps://jimeng.jianying.com/s/...\nhttps://example.com/video.mp4`}
              className="w-full min-h-[100px] rounded-md border bg-background px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              onKeyDown={e => {
                if (e.key === 'Enter' && e.ctrlKey) {
                  handleAddUrls()
                }
              }}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAddUrls} className="flex-1 gap-1" size="sm">
              <Download className="h-3.5 w-3.5" />
              添加到队列
            </Button>
            <Button
              onClick={handleStartBatch}
              disabled={isProcessing || stats.pending === 0}
              className="flex-1 gap-1"
              size="sm"
              variant={isProcessing ? 'outline' : 'default'}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  下载中...
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  开始下载 ({stats.pending})
                </>
              )}
            </Button>
          </div>
        </div>

        {/* 统计栏 */}
        <div className="flex items-center gap-3 px-4 py-2 border-b text-xs text-muted-foreground shrink-0">
          <span>共 {stats.total} 个</span>
          <span className="text-blue-500">等待 {stats.pending}</span>
          <span className="text-yellow-500">下载中 {stats.downloading}</span>
          <span className="text-green-500">完成 {stats.completed}</span>
          {stats.failed > 0 && <span className="text-red-500">失败 {stats.failed}</span>}
          <div className="flex-1" />
          {stats.completed + stats.failed > 0 && (
            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={handleClearCompleted}>
              <Trash2 className="h-3 w-3" />
              清除已完成
            </Button>
          )}
        </div>

        {/* 任务列表 */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-2" ref={scrollRef}>
            {tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <FileVideo className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm">暂无下载任务</p>
                <p className="text-xs mt-1">粘贴视频链接添加到下载队列</p>
              </div>
            ) : (
              tasks.map(task => (
                <DownloadTaskItem
                  key={task.id}
                  task={task}
                  onRemove={() => handleRemoveTask(task.id)}
                />
              ))
            )}
          </div>
        </ScrollArea>

        {/* 底部提示 */}
        <div className="p-3 border-t text-[10px] text-muted-foreground shrink-0">
          视频将保存到项目目录的 videos 文件夹。Ctrl+Enter 快速添加链接。
        </div>
      </div>
    </div>
  )
}

function DownloadTaskItem({
  task,
  onRemove,
}: {
  task: VideoDownloadTask
  onRemove: () => void
}) {
  const statusIcon = {
    pending: <FileVideo className="h-4 w-4 text-muted-foreground" />,
    downloading: <Loader2 className="h-4 w-4 text-primary animate-spin" />,
    completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    failed: <XCircle className="h-4 w-4 text-red-500" />,
  }[task.status]

  const statusText = {
    pending: '等待中',
    downloading: '下载中',
    completed: '已完成',
    failed: '失败',
  }[task.status]

  return (
    <div
      className={cn(
        'rounded-lg border p-3 space-y-2 transition-colors',
        task.status === 'completed' && 'bg-green-50/50 border-green-200',
        task.status === 'failed' && 'bg-red-50/50 border-red-200',
      )}
    >
      <div className="flex items-start gap-2">
        {statusIcon}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{task.filename}</p>
          <p className="text-[10px] text-muted-foreground truncate mt-0.5">
            {task.url.substring(0, 80)}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span
            className={cn(
              'text-[10px] font-medium',
              task.status === 'completed' && 'text-green-600',
              task.status === 'failed' && 'text-red-600',
              task.status === 'downloading' && 'text-primary',
            )}
          >
            {statusText}
          </span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRemove}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {task.status === 'downloading' && (
        <div className="space-y-1">
          <Progress value={task.progress} className="h-1.5" />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{formatBytes(task.downloaded)}</span>
            <span>{task.total ? formatBytes(task.total) : '未知大小'}</span>
          </div>
        </div>
      )}

      {task.status === 'completed' && task.filePath && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <FolderOpen className="h-3 w-3" />
          <span className="truncate">{task.filePath}</span>
        </div>
      )}

      {task.status === 'failed' && task.error && (
        <p className="text-[10px] text-red-500">{task.error}</p>
      )}
    </div>
  )
}
