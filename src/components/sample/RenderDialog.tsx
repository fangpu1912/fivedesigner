import { useState, useCallback, useEffect } from 'react'

import { Film, Download, Loader2, Copy, Terminal, Play } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/useToast'
import {
  checkFFmpegStatus,
  getFFmpegInstallGuide,
  downloadFFmpeg,
  renderWithFFmpeg,
  type FFmpegStatus,
} from '@/services/ffmpegManager'
import {
  generateSimpleFFmpegCommand,
  type RenderOptions,
  DEFAULT_RENDER_OPTIONS,
} from '@/services/videoRenderer'
import type { SampleClip } from '@/types'
import { workspaceService } from '@/services/workspace'
import { join } from '@tauri-apps/api/path'
import { mkdir, exists } from '@tauri-apps/plugin-fs'
import { useUIStore } from '@/store/useUIStore'

interface RenderDialogProps {
  isOpen: boolean
  onClose: () => void
  clips: SampleClip[]
  projectName: string
}

export function RenderDialog({ isOpen, onClose, clips, projectName }: RenderDialogProps) {
  const { toast } = useToast()
  const currentProjectId = useUIStore(state => state.currentProjectId)
  const currentEpisodeId = useUIStore(state => state.currentEpisodeId)
  const [isRendering, setIsRendering] = useState(false)
  const [renderProgress, setRenderProgress] = useState(0)
  const [ffmpegStatus, setFfmpegStatus] = useState<FFmpegStatus | null>(null)
  const [showInstallGuide, setShowInstallGuide] = useState(false)
  const [isInstallingFFmpeg, setIsInstallingFFmpeg] = useState(false)
  const [installProgress, setInstallProgress] = useState(0)
  const [ffmpegCommand, setFfmpegCommand] = useState<string>('')
  const [outputPath, setOutputPath] = useState<string | null>(null)

  const [options, setOptions] = useState<RenderOptions>(DEFAULT_RENDER_OPTIONS)

  // 检测 FFmpeg 状态并生成命令
  useEffect(() => {
    if (isOpen) {
      checkFFmpegStatus().then(status => {
        setFfmpegStatus(status)
        // 生成 FFmpeg 命令
        const extension = options.format === 'webm' ? 'webm' : 'mp4'
        const outPath = `${projectName || 'output'}_${options.resolution}.${extension}`
        const cmd = generateSimpleFFmpegCommand(clips, options, outPath)
        setFfmpegCommand(cmd)
      })
    }
  }, [isOpen, clips, options, projectName])

  // 直接使用 FFmpeg 渲染
  const handleRender = useCallback(async () => {
    if (clips.length === 0) {
      toast({
        title: '无法渲染',
        description: '没有可分镜数据',
        variant: 'destructive',
      })
      return
    }

    if (!ffmpegStatus?.installed || !ffmpegStatus.path) {
      toast({
        title: '无法渲染',
        description: 'FFmpeg 未安装，请先安装 FFmpeg',
        variant: 'destructive',
      })
      return
    }

    setIsRendering(true)
    setRenderProgress(0)
    setOutputPath(null)

    // 生成输出路径（项目目录下的 renders 文件夹，没有则创建）
    const extension = options.format === 'webm' ? 'webm' : 'mp4'
    const outputFileName = `${projectName || 'output'}_${options.resolution}.${extension}`
    const workspacePath = await workspaceService.getWorkspacePath()
    const rendersDir = await join(workspacePath, 'renders')

    // 如果 renders 文件夹不存在，则创建
    if (!(await exists(rendersDir))) {
      await mkdir(rendersDir, { recursive: true })
    }

    const outPath = await join(rendersDir, outputFileName)

    // 生成 FFmpeg 命令脚本（使用绝对路径，单命令方式）
    const commandScript = generateSimpleFFmpegCommand(clips, options, outPath)

    const result = await renderWithFFmpeg(
      ffmpegStatus.path, 
      commandScript, 
      outPath, 
      clips, 
      (progress, _message) => {
        setRenderProgress(progress)
      },
      currentProjectId || undefined,
      currentEpisodeId || undefined
    )

    setIsRendering(false)

    if (result.success) {
      setOutputPath(outPath)
      toast({
        title: '渲染完成',
        description: `视频已保存到: ${outPath}`,
      })
    } else {
      toast({
        title: '渲染失败',
        description: result.message,
        variant: 'destructive',
      })
    }
  }, [clips, options, projectName, ffmpegStatus, toast])

  // 复制 FFmpeg 命令
  const handleCopyCommand = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(ffmpegCommand)
      toast({
        title: '复制成功',
        description: 'FFmpeg 命令已复制到剪贴板',
      })
    } catch {
      toast({
        title: '复制失败',
        description: '请手动复制命令',
        variant: 'destructive',
      })
    }
  }, [ffmpegCommand, toast])

  // 安装 FFmpeg
  const handleInstallFFmpeg = useCallback(async () => {
    setIsInstallingFFmpeg(true)
    setInstallProgress(0)

    const _result = await downloadFFmpeg((progress, _message) => {
      setInstallProgress(progress)
    })

    setIsInstallingFFmpeg(false)

    if (result.success) {
      toast({
        title: '安装成功',
        description: result.message,
      })
      // 重新检测 FFmpeg 状态
      const status = await checkFFmpegStatus()
      setFfmpegStatus(status)
    } else {
      toast({
        title: '安装失败',
        description: result.message,
        variant: 'destructive',
      })
    }
  }, [toast])

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Film className="w-5 h-5" />
            渲染输出
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* 渲染设置 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>分辨率</Label>
              <Select
                value={options.resolution}
                onValueChange={(value: '1080p' | '720p' | '480p' | '1080p-vertical' | '720p-vertical' | '480p-vertical') =>
                  setOptions({ ...options, resolution: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1080p-vertical">1080p 竖屏 (1080x1920)</SelectItem>
                  <SelectItem value="720p-vertical">720p 竖屏 (720x1280)</SelectItem>
                  <SelectItem value="480p-vertical">480p 竖屏 (480x854)</SelectItem>
                  <SelectItem value="1080p">1080p 横屏 (1920x1080)</SelectItem>
                  <SelectItem value="720p">720p 横屏 (1280x720)</SelectItem>
                  <SelectItem value="480p">480p 横屏 (854x480)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>帧率</Label>
              <Select
                value={options.fps.toString()}
                onValueChange={(value: string) =>
                  setOptions({ ...options, fps: parseInt(value) as 24 | 30 | 60 })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24">24 FPS (电影)</SelectItem>
                  <SelectItem value="30">30 FPS (标准)</SelectItem>
                  <SelectItem value="60">60 FPS (流畅)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>格式</Label>
              <Select
                value={options.format}
                onValueChange={(value: 'mp4' | 'webm') => setOptions({ ...options, format: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mp4">MP4 (推荐)</SelectItem>
                  <SelectItem value="webm">WebM</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>质量</Label>
              <Select
                value={options.quality}
                onValueChange={(value: 'high' | 'medium' | 'low') =>
                  setOptions({ ...options, quality: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">高 (8Mbps)</SelectItem>
                  <SelectItem value="medium">中 (4Mbps)</SelectItem>
                  <SelectItem value="low">低 (2Mbps)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* FFmpeg 状态 */}
          {ffmpegStatus && (
            <div
              className={`text-sm p-3 rounded border ${
                ffmpegStatus.installed
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-yellow-50 text-yellow-700 border-yellow-200'
              }`}
            >
              {ffmpegStatus.installed ? (
                <div className="flex items-center justify-between">
                  <span>
                    ✅ FFmpeg 已安装 ({ffmpegStatus.source === 'system' ? '系统' : '内置'})
                    {ffmpegStatus.version && ` - 版本 ${ffmpegStatus.version}`}
                  </span>
                </div>
              ) : (
                <div className="space-y-3">
                  <span>⚠️ 未检测到 FFmpeg</span>

                  {isInstallingFFmpeg ? (
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span>正在下载 FFmpeg...</span>
                        <span>{installProgress}%</span>
                      </div>
                      <Progress value={installProgress} className="h-1" />
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-1 text-xs"
                      onClick={handleInstallFFmpeg}
                    >
                      <Download className="w-3.5 h-3.5" />
                      自动安装 FFmpeg（推荐）
                    </Button>
                  )}

                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={() => setShowInstallGuide(!showInstallGuide)}
                  >
                    {showInstallGuide ? '隐藏手动安装指南' : '查看手动安装指南'}
                  </Button>

                  {showInstallGuide && (
                    <Textarea
                      value={getFFmpegInstallGuide()}
                      readOnly
                      className="font-mono text-xs min-h-[200px] mt-2"
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* FFmpeg 命令 */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Terminal className="w-4 h-4" />
              FFmpeg 渲染命令
            </Label>
            <Textarea value={ffmpegCommand} readOnly className="font-mono text-xs min-h-[100px]" />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1" onClick={handleCopyCommand}>
                <Copy className="w-3.5 h-3.5" />
                复制命令
              </Button>
              {ffmpegStatus?.installed && (
                <Button
                  variant="default"
                  size="sm"
                  className="gap-1"
                  onClick={handleRender}
                  disabled={isRendering}
                >
                  {isRendering ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      渲染中...
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      开始渲染
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* 渲染进度 */}
          {isRendering && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">FFmpeg 渲染中...</span>
                <span className="font-medium">{renderProgress}%</span>
              </div>
              <Progress value={renderProgress} className="h-2" />
            </div>
          )}

          {/* 渲染完成 */}
          {outputPath && !isRendering && (
            <div className="text-sm text-green-600 bg-green-50 p-3 rounded border border-green-200">
              ✅ 视频已保存到工作目录: {outputPath}
            </div>
          )}
        </div>

        {/* 按钮 */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
