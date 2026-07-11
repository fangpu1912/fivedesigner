/**
 * 抖音作品下载页
 * 输入抖音主页 URL → 获取作品列表 → 勾选 → 下载到当前项目素材库(分类:抖音主页)
 */
import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'

import {
  Cookie,
  Download,
  FolderOpen,
  Image as ImageIcon,
  Link2,
  Loader2,
  Video as VideoIcon,
  RefreshCw,
  Eye,
  ChevronLeft,
  ChevronRight,
  Play,
  HelpCircle,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/useToast'
import { ImagePreviewDialog } from '@/components/media/ImagePreviewDialog'
import {
  useDouyinCookie,
  useSaveDouyinCookie,
  useDouyinWorksQuery,
  useDownloadDouyinWorksMutation,
} from '@/hooks/useDouyinDownload'
import { extractSecUserId } from '@/services/douyin/douyinService'
import logger from '@/utils/logger'
import { useUIStore } from '@/store/useUIStore'
import type { DouyinDownloadLog, DouyinDownloadProgress, DouyinWorkItem } from '@/types/douyin'

function formatBytes(bytes?: number | null): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export default function DouyinDownload() {
  const [urlInput, setUrlInput] = useState('')
  const [secUserId, setSecUserId] = useState('')
  const [cookieDialogOpen, setCookieDialogOpen] = useState(false)
  const [cookieInput, setCookieInput] = useState('')
  const [cookieHelpOpen, setCookieHelpOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [fetchProgress, setFetchProgress] = useState(0)
  const [logs, setLogs] = useState<DouyinDownloadLog[]>([])
  const [downloadProgress, setDownloadProgress] = useState({ completed: 0, total: 0 })
  const [previewItem, setPreviewItem] = useState<DouyinWorkItem | null>(null)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all')

  const currentProjectId = useUIStore((s) => s.currentProjectId)
  const currentEpisodeId = useUIStore((s) => s.currentEpisodeId)
  const { data: cookie } = useDouyinCookie()
  const cookieMutation = useSaveDouyinCookie()
  const { toast } = useToast()

  const worksQuery = useDouyinWorksQuery(
    secUserId,
    cookie || '',
    !!secUserId,
    (n) => setFetchProgress(n),
  )

  const downloadMutation = useDownloadDouyinWorksMutation()

  // 监听 Rust download_video 命令发出的实时进度事件,按 taskId 匹配更新对应 log
  useEffect(() => {
    let unlisten: (() => void) | undefined
    listen<DouyinDownloadProgress>('download-video-progress', (event) => {
      const { taskId, downloaded, total } = event.payload
      if (!taskId) return
      const percent = total && total > 0 ? Math.min(100, (downloaded / total) * 100) : null
      setLogs((prev) =>
        prev.map((log) => {
          if (log.taskId !== taskId || log.status !== 'downloading') return log
          return { ...log, downloaded, total: total ?? null, percent }
        }),
      )
    })
      .then((fn) => {
        unlisten = fn
      })
      .catch((err) => {
        logger.error('[douyin-download] progress listener failed to register', err)
      })
    return () => {
      unlisten?.()
    }
  }, [])

  const handleFetch = () => {
    const id = extractSecUserId(urlInput)
    if (!id) {
      toast({
        title: 'URL 无效',
        description: '请输入抖音主页 URL,如 https://www.douyin.com/user/MS4w...',
        variant: 'destructive',
      })
      return
    }
    setSelectedIds(new Set())
    setFetchProgress(0)
    setLogs([])
    setFilterType('all')
    setSecUserId(id)
  }

  const handleOpenCookie = () => {
    setCookieInput(cookie || '')
    setCookieDialogOpen(true)
  }

  const handleSaveCookie = () => {
    cookieMutation.mutate(cookieInput.trim(), {
      onSuccess: () => {
        setCookieDialogOpen(false)
        toast({ title: 'Cookie 已保存' })
      },
      onError: (err) => {
        toast({ title: '保存失败', description: err.message, variant: 'destructive' })
      },
    })
  }

  const handleClearCookie = () => {
    cookieMutation.mutate('', {
      onSuccess: () => {
        setCookieInput('')
        toast({ title: 'Cookie 已清除' })
      },
    })
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allItems = worksQuery.data?.items || []
  const imageCount = allItems.filter((i) => i.type === 'image').length
  const videoCount = allItems.filter((i) => i.type === 'video').length
  const filteredItems =
    filterType === 'all' ? allItems : allItems.filter((i) => i.type === filterType)

  const toggleSelectAll = () => {
    if (filteredItems.length === 0) return
    const allSelected = filteredItems.every((i) => selectedIds.has(i.awemeId))
    if (allSelected) {
      const next = new Set(selectedIds)
      filteredItems.forEach((i) => next.delete(i.awemeId))
      setSelectedIds(next)
    } else {
      const next = new Set(selectedIds)
      filteredItems.forEach((i) => next.add(i.awemeId))
      setSelectedIds(next)
    }
  }

  const handlePreview = (item: DouyinWorkItem, e: React.MouseEvent) => {
    e.stopPropagation()
    setPreviewIndex(0)
    setPreviewItem(item)
  }

  const previewImages = previewItem?.images || []
  const previewMax = previewItem?.type === 'image' ? previewImages.length - 1 : 0
  const goPrev = (e: React.MouseEvent) => {
    e.stopPropagation()
    setPreviewIndex((i) => Math.max(0, i - 1))
  }
  const goNext = (e: React.MouseEvent) => {
    e.stopPropagation()
    setPreviewIndex((i) => Math.min(previewMax, i + 1))
  }

  const handleDownload = () => {
    if (!currentProjectId) {
      toast({
        title: '未选择项目',
        description: '请先在项目管理中选择一个项目',
        variant: 'destructive',
      })
      return
    }
    const selected = (worksQuery.data?.items || []).filter((it) => selectedIds.has(it.awemeId))
    if (selected.length === 0) return

    setLogs([])
    setDownloadProgress({ completed: 0, total: 0 })

    downloadMutation.mutate(
      {
        items: selected,
        projectId: currentProjectId,
        episodeId: currentEpisodeId,
        cookie: cookie || '',
        onLog: (log) => {
          setLogs((prev) => {
            const idx = prev.findIndex((l) => l.name === log.name)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = log
              return next
            }
            return [...prev, log]
          })
        },
        onProgress: (completed, total) => setDownloadProgress({ completed, total }),
      },
      {
        onSuccess: (res) => {
          toast({
            title: '下载完成',
            description: `成功 ${res.success} 个,失败 ${res.failed} 个,已加入素材库"抖音主页"分类`,
          })
        },
        onError: (err) => {
          toast({ title: '下载失败', description: err.message, variant: 'destructive' })
        },
      },
    )
  }

  const progressPercent =
    downloadProgress.total > 0
      ? (downloadProgress.completed / downloadProgress.total) * 100
      : 0

  // 当前正在下载的文件(串行下载,同一时刻只有一个)
  const currentDownloading = logs.find((l) => l.status === 'downloading')

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* 标题 */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Download className="h-8 w-8" />
          抖音作品下载
        </h1>
        <p className="text-muted-foreground mt-1">
          下载抖音主页图集和视频,自动加入素材库"抖音主页"分类
        </p>
      </div>

      {/* 输入区 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            获取作品
          </CardTitle>
          <CardDescription>粘贴抖音主页 URL,获取该账号的全部作品</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
              placeholder="https://www.douyin.com/user/MS4w..."
              className="flex-1"
            />
            <Button onClick={handleFetch} disabled={worksQuery.isLoading}>
              {worksQuery.isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              获取作品
            </Button>
            <Button variant="outline" onClick={handleOpenCookie}>
              <Cookie className="h-4 w-4 mr-2" />
              Cookie
              {cookie ? (
                <Badge variant="default" className="ml-2 text-xs">
                  已设置
                </Badge>
              ) : (
                <Badge variant="secondary" className="ml-2 text-xs">
                  未设置
                </Badge>
              )}
            </Button>
          </div>

          {worksQuery.isLoading && (
            <div className="space-y-2">
              <Progress value={fetchProgress > 0 ? 100 : 30} />
              <p className="text-sm text-muted-foreground">
                正在获取作品... 已加载 {fetchProgress} 个
              </p>
            </div>
          )}

          {worksQuery.isError && (
            <div className="text-sm text-destructive">
              获取失败:{(worksQuery.error as Error)?.message || '未知错误'}
              <Button
                variant="outline"
                size="sm"
                className="ml-2"
                onClick={() => worksQuery.refetch()}
              >
                重试
              </Button>
            </div>
          )}

          <div className="flex items-center gap-2 text-sm">
            <FolderOpen className="h-4 w-4" />
            <span className="text-muted-foreground">当前项目:</span>
            {currentProjectId ? (
              <Badge variant="default">已选择</Badge>
            ) : (
              <Badge variant="destructive">未选择</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 下载进度数据面板 */}
      {downloadMutation.isPending && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
              <div>
                <p className="text-sm font-medium">正在下载到素材库</p>
                <p className="text-xs text-muted-foreground">
                  {downloadProgress.completed} / {downloadProgress.total} 个文件
                </p>
              </div>
            </div>
            <p className="text-2xl font-bold tabular-nums">{progressPercent.toFixed(0)}%</p>
          </div>
          <Progress value={progressPercent} />
          {currentDownloading && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="truncate font-mono">{currentDownloading.name}</span>
                <span className="text-muted-foreground shrink-0 tabular-nums ml-2">
                  {currentDownloading.percent != null
                    ? `${currentDownloading.percent.toFixed(0)}%`
                    : formatBytes(currentDownloading.downloaded)}
                  {currentDownloading.total != null && currentDownloading.percent == null
                    ? ` / ${formatBytes(currentDownloading.total)}`
                    : ''}
                  {currentDownloading.total != null && currentDownloading.percent != null
                    ? ` · ${formatBytes(currentDownloading.downloaded)} / ${formatBytes(currentDownloading.total)}`
                    : ''}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-200"
                  style={{ width: `${currentDownloading.percent ?? 0}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 作品列表 */}
      {worksQuery.data && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>作品列表</CardTitle>
                <CardDescription>
                  共 {allItems.length} 个作品 · {worksQuery.data.nickname}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={toggleSelectAll}>
                  {filteredItems.length > 0 &&
                  filteredItems.every((i) => selectedIds.has(i.awemeId))
                    ? '取消全选'
                    : '全选'}
                </Button>
                <Button
                  size="sm"
                  onClick={handleDownload}
                  disabled={
                    downloadMutation.isPending ||
                    !currentProjectId ||
                    selectedIds.size === 0
                  }
                >
                  {downloadMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  下载选中到素材库({selectedIds.size})
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Button
                size="sm"
                variant={filterType === 'all' ? 'default' : 'outline'}
                onClick={() => setFilterType('all')}
              >
                全部 ({allItems.length})
              </Button>
              <Button
                size="sm"
                variant={filterType === 'image' ? 'default' : 'outline'}
                onClick={() => setFilterType('image')}
              >
                <ImageIcon className="h-3 w-3 mr-1" />
                图集 ({imageCount})
              </Button>
              <Button
                size="sm"
                variant={filterType === 'video' ? 'default' : 'outline'}
                onClick={() => setFilterType('video')}
              >
                <VideoIcon className="h-3 w-3 mr-1" />
                视频 ({videoCount})
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {filteredItems.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {allItems.length === 0 ? '未获取到公开作品' : '当前筛选下无作品'}
              </div>
            ) : (
              <div className="h-[600px] w-full rounded border p-2 overflow-y-auto">
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {filteredItems.map((item) => (
                    <div
                      key={item.awemeId}
                      className="group relative border rounded-lg overflow-hidden cursor-pointer hover:border-primary transition-colors"
                      onClick={() => toggleSelect(item.awemeId)}
                    >
                      <div className="aspect-square bg-muted flex items-center justify-center relative">
                        {item.coverUrl ? (
                          <img
                            src={item.coverUrl}
                            alt={item.desc}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              ;(e.target as HTMLImageElement).style.display = 'none'
                            }}
                          />
                        ) : (
                          <ImageIcon className="h-8 w-8 text-muted-foreground" />
                        )}
                        {item.type === 'video' && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="bg-black/50 rounded-full p-2">
                              <Play className="h-6 w-6 text-white fill-white" />
                            </div>
                          </div>
                        )}
                        <div
                          className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                          onClick={(e) => handlePreview(item, e)}
                        >
                          <div className="flex flex-col items-center text-white">
                            <Eye className="h-7 w-7 mb-1" />
                            <span className="text-xs">预览</span>
                          </div>
                        </div>
                      </div>
                      <div className="absolute top-2 left-2">
                        <Checkbox
                          checked={selectedIds.has(item.awemeId)}
                          onCheckedChange={() => toggleSelect(item.awemeId)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div className="absolute top-2 right-2">
                        {item.type === 'image' ? (
                          <Badge variant="secondary" className="text-xs">
                            <ImageIcon className="h-3 w-3 mr-1" />
                            图集{item.images?.length ? `(${item.images.length})` : ''}
                          </Badge>
                        ) : (
                          <Badge variant="default" className="text-xs">
                            <VideoIcon className="h-3 w-3 mr-1" />
                            视频
                          </Badge>
                        )}
                      </div>
                      <div className="p-2">
                        <p className="text-xs line-clamp-2 text-muted-foreground">
                          {item.desc || '无描述'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Cookie 弹窗 */}
      <Dialog open={cookieDialogOpen} onOpenChange={setCookieDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>抖音 Cookie 设置</DialogTitle>
            <DialogDescription className="flex items-center gap-2">
              粘贴抖音网页版 Cookie 以访问完整作品。公开作品可不填。Cookie 加密保存,重启后仍有效。
              <button
                type="button"
                onClick={() => setCookieHelpOpen(true)}
                className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={cookieInput}
            onChange={(e) => setCookieInput(e.target.value)}
            placeholder="在此粘贴抖音 Cookie,格式: key1=value1; key2=value2; ..."
            rows={8}
            className="font-mono text-xs"
          />
          <DialogFooter>
            <Button variant="outline" onClick={handleClearCookie} disabled={cookieMutation.isPending}>
              清除
            </Button>
            <Button onClick={handleSaveCookie} disabled={cookieMutation.isPending}>
              {cookieMutation.isPending ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cookie 获取教程图片 */}
      <ImagePreviewDialog
        src="/get-cookie.png"
        alt="获取 Cookie 教程"
        isOpen={cookieHelpOpen}
        onClose={() => setCookieHelpOpen(false)}
        title="获取 Cookie 教程"
      />

      {/* 预览弹窗 */}
      <Dialog open={!!previewItem} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden">
          {previewItem && (
            <>
              <DialogHeader className="px-6 pt-6 pb-2">
                <DialogTitle className="flex items-center gap-2">
                  {previewItem.type === 'image' ? (
                    <Badge variant="secondary">
                      <ImageIcon className="h-3 w-3 mr-1" />
                      图集
                    </Badge>
                  ) : (
                    <Badge variant="default">
                      <VideoIcon className="h-3 w-3 mr-1" />
                      视频
                    </Badge>
                  )}
                  {previewItem.authorNickname}
                </DialogTitle>
                <DialogDescription className="line-clamp-2">
                  {previewItem.desc || '无描述'}
                </DialogDescription>
              </DialogHeader>
              <div
                className="relative bg-black flex items-center justify-center"
                style={{ minHeight: 400, maxHeight: '70vh' }}
              >
                {previewItem.type === 'image' ? (
                  <>
                    <img
                      src={previewImages[previewIndex]?.url}
                      alt={previewItem.desc}
                      referrerPolicy="no-referrer"
                      className="max-w-full max-h-[70vh] object-contain"
                      onError={(e) => {
                        ;(e.target as HTMLImageElement).style.opacity = '0.3'
                      }}
                    />
                    {previewImages.length > 1 && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full h-10 w-10"
                          onClick={goPrev}
                          disabled={previewIndex === 0}
                        >
                          <ChevronLeft className="h-6 w-6" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full h-10 w-10"
                          onClick={goNext}
                          disabled={previewIndex >= previewMax}
                        >
                          <ChevronRight className="h-6 w-6" />
                        </Button>
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full">
                          {previewIndex + 1} / {previewImages.length}
                        </div>
                      </>
                    )}
                  </>
                ) : previewItem.videoUrl ? (
                  <video
                    src={`http://dyproxy.localhost/video?url=${encodeURIComponent(previewItem.videoUrl)}`}
                    poster={
                      previewItem.coverUrl
                        ? `http://dyproxy.localhost/video?url=${encodeURIComponent(previewItem.coverUrl)}`
                        : undefined
                    }
                    controls
                    autoPlay
                    className="max-w-full max-h-[70vh]"
                  />
                ) : (
                  <img
                    src={previewItem.coverUrl}
                    alt={previewItem.desc}
                    referrerPolicy="no-referrer"
                    className="max-w-full max-h-[70vh] object-contain"
                  />
                )}
              </div>
              <DialogFooter className="px-6 pb-4 pt-2">
                <Button
                  variant="outline"
                  onClick={() => toggleSelect(previewItem.awemeId)}
                >
                  {selectedIds.has(previewItem.awemeId) ? '取消选中' : '勾选下载'}
                </Button>
                <Button onClick={() => setPreviewItem(null)}>关闭</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
