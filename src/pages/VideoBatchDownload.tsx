import { useState, useEffect, useCallback, useRef } from 'react'

import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import {
  CheckCircle2,
  XCircle,
  Download,
  FileVideo,
  FolderOpen,
  Link,
  Loader2,
  Play,
  Settings2,
  Trash2,
  Video,
  X,
  AlertCircle,
  ClipboardPaste,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import {
  videoBatchDownloadService,
  makeUniqueFilename,
  type VideoDownloadTask,
} from '@/services/videoBatchDownloadService'

interface ResolvedVideo {
  video_url: string
  title: string
  platform: string
  thumbnail?: string
  needs_browser_download?: boolean
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function detectPlatform(url: string): string {
  if (url.includes('doubao.com')) return 'doubao'
  if (url.includes('jimeng.jianying.com')) return 'jimeng'
  if (url.match(/\.(mp4|webm|mov|avi)/i)) return 'direct'
  return 'unknown'
}

const PLATFORM_LABELS: Record<string, { label: string; color: string }> = {
  doubao: { label: '豆包', color: 'text-blue-500' },
  jimeng: { label: '即梦', color: 'text-purple-500' },
  direct: { label: '直链', color: 'text-green-500' },
  unknown: { label: '未知', color: 'text-muted-foreground' },
}

export default function VideoBatchDownload() {
  const { toast } = useToast()
  const [tasks, setTasks] = useState<VideoDownloadTask[]>([])
  const [urlInput, setUrlInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isResolving, setIsResolving] = useState(false)
  const [concurrency, setConcurrency] = useState(2)
  const [resolvedPreview, setResolvedPreview] = useState<ResolvedVideo | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const refreshTasks = useCallback(() => {
    setTasks(videoBatchDownloadService.getTasks())
  }, [])

  useEffect(() => {
    videoBatchDownloadService.init()
    refreshTasks()

    const unlisteners = [
      videoBatchDownloadService.on('progress', refreshTasks),
      videoBatchDownloadService.on('completed', refreshTasks),
      videoBatchDownloadService.on('failed', refreshTasks),
      videoBatchDownloadService.on('allCompleted', () => {
        refreshTasks()
        setIsProcessing(false)
        toast({ title: '批量下载完成' })
      }),
    ]

    return () => {
      unlisteners.forEach(fn => fn())
    }
  }, [refreshTasks, toast])

  const stats = videoBatchDownloadService.getStats()

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setUrlInput(prev => (prev ? prev + '\n' + text : text))
        toast({ title: '已粘贴' })
      }
    } catch {
      toast({ title: '无法访问剪贴板', variant: 'destructive' })
    }
  }, [toast])

  const handleResolveAndAdd = useCallback(async () => {
    const lines = urlInput
      .split(/[\n\r]+/)
      .map(line => line.trim())
      .filter(line => line.startsWith('http'))

    if (lines.length === 0) {
      toast({ title: '请输入有效的视频链接', variant: 'destructive' })
      return
    }

    setIsResolving(true)
    let addedCount = 0
    let failedCount = 0

    for (const url of lines) {
      try {
        const platform = detectPlatform(url)

        if (platform === 'direct') {
          const baseName = url.split('/').pop() || 'video'
          const filename = makeUniqueFilename(baseName, 'mp4')
          videoBatchDownloadService.addTasks([{
            url,
            filename,
          }])
          addedCount++
        } else {
          const resolved = await invoke<ResolvedVideo>('resolve_video_url', { url })
          const filename = makeUniqueFilename(resolved.title, 'mp4')
          videoBatchDownloadService.addTasks([{
            url: resolved.video_url,
            filename,
            needsBrowserDownload: resolved.needs_browser_download ?? false,
          }])
          addedCount++

          if (lines.length === 1) {
            setResolvedPreview(resolved)
          }
        }
      } catch (error) {
        failedCount++
        const errMsg = error instanceof Error ? error.message : String(error)
        toast({
          title: '解析失败',
          description: `${url.substring(0, 50)}... - ${errMsg}`,
          variant: 'destructive',
        })
      }
    }

    setIsResolving(false)
    setUrlInput('')
    refreshTasks()

    if (addedCount > 0) {
      toast({ title: `已添加 ${addedCount} 个下载任务` })
    }
    if (failedCount > 0) {
      toast({
        title: `${failedCount} 个链接解析失败`,
        description: '可能需要登录Cookie或链接已过期',
        variant: 'destructive',
      })
    }
  }, [urlInput, toast, refreshTasks])

  const handleStartBatch = useCallback(async () => {
    if (isProcessing) return
    setIsProcessing(true)
    videoBatchDownloadService.setConcurrency(concurrency)
    try {
      await videoBatchDownloadService.startBatch()
    } catch (error) {
      toast({
        title: '批量下载出错',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      })
      setIsProcessing(false)
    }
  }, [isProcessing, concurrency, toast])

  const handleClearCompleted = useCallback(() => {
    videoBatchDownloadService.clearCompleted()
    refreshTasks()
  }, [refreshTasks])

  const handleRemoveTask = useCallback((id: string) => {
    videoBatchDownloadService.removeTask(id)
    refreshTasks()
  }, [refreshTasks])

  const handleOpenDownloadFolder = useCallback(async () => {
    await openDialog({ directory: true, title: '下载目录' })
  }, [])

  return (
    <div className="h-full flex flex-col">
      {/* 页面标题 */}
      <div className="px-6 py-4 border-b shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Download className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">视频批量下载</h1>
            <p className="text-xs text-muted-foreground">
              粘贴豆包/即梦分享链接或直接视频URL，批量下载无水印视频
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧 - URL 输入 + 解析 */}
        <div className="w-[420px] border-r flex flex-col shrink-0">
          {/* URL 输入区 */}
          <div className="p-4 space-y-3 border-b">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Link className="h-4 w-4" />
                视频链接
              </label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 text-xs"
                onClick={handlePasteFromClipboard}
              >
                <ClipboardPaste className="h-3 w-3" />
                粘贴
              </Button>
            </div>
            <textarea
              ref={textareaRef}
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder={`支持以下格式：\n• 豆包分享链接: https://www.doubao.com/video-sharing?...\n• 即梦分享链接: https://jimeng.jianying.com/s/...\n• 直接视频URL: https://example.com/video.mp4\n\n每行一个链接，Ctrl+Enter 快速添加`}
              className="w-full min-h-[180px] rounded-md border bg-background px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              onKeyDown={e => {
                if (e.key === 'Enter' && e.ctrlKey) {
                  handleResolveAndAdd()
                }
              }}
            />

            {/* 解析预览 */}
            {resolvedPreview && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn('gap-1 text-[10px]', PLATFORM_LABELS[resolvedPreview.platform]?.color)}>
                    {PLATFORM_LABELS[resolvedPreview.platform]?.label || resolvedPreview.platform}
                  </Badge>
                  <span className="text-sm font-medium truncate">{resolvedPreview.title}</span>
                </div>
                {resolvedPreview.thumbnail && (
                  <img
                    src={resolvedPreview.thumbnail}
                    alt="缩略图"
                    className="w-full rounded-md max-h-[120px] object-cover"
                  />
                )}
                <p className="text-[10px] text-muted-foreground font-mono truncate">
                  {resolvedPreview.video_url.substring(0, 80)}
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleResolveAndAdd}
                className="flex-1 gap-1"
                size="sm"
                disabled={isResolving || !urlInput.trim()}
              >
                {isResolving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    解析中...
                  </>
                ) : (
                  <>
                    <Link className="h-3.5 w-3.5" />
                    解析并添加
                  </>
                )}
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

          {/* 设置区 */}
          <div className="p-4 space-y-3 border-b">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">下载设置</span>
            </div>

            {/* 并发数 */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">并发数</span>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 5].map(n => (
                  <button
                    key={n}
                    onClick={() => setConcurrency(n)}
                    className={cn(
                      'w-8 h-8 rounded-md text-sm font-medium transition-colors',
                      concurrency === n
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted hover:bg-muted/80'
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 使用说明 */}
          <div className="p-4 space-y-2 flex-1 overflow-auto">
            <h3 className="text-sm font-medium flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              使用说明
            </h3>
            <div className="text-xs text-muted-foreground space-y-1.5">
              <p>1. 在豆包/即梦网页端打开视频，点击分享获取链接</p>
              <p>2. 粘贴链接到上方输入框，点击「解析并添加」</p>
              <p>3. 系统会自动打开隐藏浏览器窗口解析视频地址</p>
              <p>4. 解析成功后点击「开始下载」批量下载</p>
              <p className="pt-2 text-yellow-600">⚠️ 注意事项：</p>
              <p>• 首次使用可能需要等待几秒解析</p>
              <p>• 分享链接可能有时效性，过期后无法解析</p>
              <p>• 视频保存到当前项目/剧集的 videos 目录</p>
            </div>
          </div>
        </div>

        {/* 右侧 - 任务列表 */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* 统计栏 */}
          <div className="flex items-center gap-4 px-4 py-3 border-b shrink-0">
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">下载队列</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>共 {stats.total} 个</span>
              <span className="text-blue-500">等待 {stats.pending}</span>
              <span className="text-yellow-500">下载中 {stats.downloading}</span>
              <span className="text-green-500">完成 {stats.completed}</span>
              {stats.failed > 0 && <span className="text-red-500">失败 {stats.failed}</span>}
            </div>
            <div className="flex-1" />
            {stats.completed + stats.failed > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleClearCompleted}>
                <Trash2 className="h-3 w-3" />
                清除已完成
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleOpenDownloadFolder}>
              <FolderOpen className="h-3 w-3" />
              打开目录
            </Button>
          </div>

          {/* 任务列表 */}
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-2">
              {tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <FileVideo className="w-16 h-16 mb-4 opacity-20" />
                  <p className="text-sm font-medium">暂无下载任务</p>
                  <p className="text-xs mt-1">在左侧粘贴视频链接添加到下载队列</p>
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
        task.status === 'completed' && 'bg-green-50/50 border-green-200 dark:bg-green-950/20 dark:border-green-900',
        task.status === 'failed' && 'bg-red-50/50 border-red-200 dark:bg-red-950/20 dark:border-red-900',
      )}
    >
      <div className="flex items-start gap-2">
        {statusIcon}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{task.filename}</p>
          <p className="text-[10px] text-muted-foreground truncate mt-0.5">
            {task.url.substring(0, 100)}
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
            <span>{task.progress}% {task.total ? `/ ${formatBytes(task.total)}` : ''}</span>
          </div>
        </div>
      )}

      {task.status === 'completed' && task.filePath && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <FolderOpen className="h-3 w-3 shrink-0" />
          <span className="truncate">{task.filePath}</span>
        </div>
      )}

      {task.status === 'failed' && task.error && (
        <p className="text-[10px] text-red-500">{task.error}</p>
      )}
    </div>
  )
}
