import { useState, useRef, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open, save, confirm } from '@tauri-apps/plugin-dialog'
import {
  Film,
  Scissors,
  Download,
  Image as ImageIcon,
  Video,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Settings2,
  FolderOpen,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Camera,
  Import,
  RotateCw,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/hooks/useToast'
import { getAssetUrl } from '@/utils/asset'
import { cn } from '@/lib/utils'
import { ImagePreviewDialog } from '@/components/media/ImagePreviewDialog'
import { useUIStore } from '@/store/useUIStore'
import { localDB } from '@/db'

interface SceneInfo {
  id: number
  start_time: number
  end_time: number
  start_time_formatted: string
  end_time_formatted: string
  duration: number
  duration_formatted: string
  screenshot_path: string
}

interface DetectionResult {
  scenes: SceneInfo[]
  total_scenes: number
  video_duration: number
  video_fps: number
  video_width: number
  video_height: number
}

export default function VideoSceneExtraction() {
  const { toast } = useToast()
  const { currentProjectId, currentEpisodeId } = useUIStore()
  const [videoPath, setVideoPath] = useState('')
  const [videoInfo, setVideoInfo] = useState<{ duration: number; width: number; height: number; fps: number } | null>(null)
  const [threshold, setThreshold] = useState(30)
  const [isDetecting, setIsDetecting] = useState(false)
  const [detectProgress, setDetectProgress] = useState(0)
  const [detectStatus, setDetectStatus] = useState('')
  const [scenes, setScenes] = useState<SceneInfo[]>([])
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(-1)
  const [exportScreenshots, setExportScreenshots] = useState(true)
  const [exportVideos, setExportVideos] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportStatus, setExportStatus] = useState('')
  const [selectedScenes, setSelectedScenes] = useState<Set<number>>(new Set())
  const [screenshotOffset, setScreenshotOffset] = useState(0)
  const [isCapturing, setIsCapturing] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const previewRef = useRef<HTMLDivElement>(null)

  const handleSelectVideo = async () => {
    try {
      const selected = await open({
        filters: [
          { name: '视频文件', extensions: ['mp4', 'avi', 'mov', 'mkv', 'flv'] },
          { name: '所有文件', extensions: ['*'] },
        ],
        title: '选择视频文件',
      })

      if (selected && typeof selected === 'string') {
        setVideoPath(selected)
        setScenes([])
        setCurrentPreviewIndex(-1)
        setSelectedScenes(new Set())
        setDetectProgress(0)
        setDetectStatus('')
        toast({ title: '视频已选择', description: selected.split(/[\\/]/).pop() })
      }
    } catch (error) {
      toast({ title: '选择文件失败', description: String(error), variant: 'destructive' })
    }
  }

  const handleDetectScenes = async () => {
    if (!videoPath) {
      toast({ title: '请先选择视频文件', variant: 'destructive' })
      return
    }

    setIsDetecting(true)
    setDetectProgress(0)
    setDetectStatus('正在分析视频信息...')
    setScenes([])
    setCurrentPreviewIndex(-1)

    try {
      const result = await invoke<DetectionResult>('detect_video_scenes', {
        request: {
          video_path: videoPath,
          threshold: threshold / 100,
          output_dir: `${videoPath}_scenes`,
        },
      })

      setDetectProgress(100)
      setDetectStatus(`检测完成，共 ${result.total_scenes} 个分镜`)
      setScenes(result.scenes)
      setVideoInfo({
        duration: result.video_duration,
        width: result.video_width,
        height: result.video_height,
        fps: result.video_fps,
      })

      if (result.scenes.length > 0) {
        setCurrentPreviewIndex(0)
        setSelectedScenes(new Set(result.scenes.map((s) => s.id)))
      }

      toast({
        title: '分镜检测完成',
        description: `共检测到 ${result.total_scenes} 个分镜`,
      })
    } catch (error) {
      setDetectStatus('检测失败')
      toast({
        title: '分镜检测失败',
        description: String(error),
        variant: 'destructive',
      })
    } finally {
      setIsDetecting(false)
    }
  }

  const handleDeleteScene = (index: number) => {
    const newScenes = scenes.filter((_, i) => i !== index)
    newScenes.forEach((scene, i) => {
      scene.id = i + 1
    })
    setScenes(newScenes)

    if (currentPreviewIndex >= newScenes.length) {
      setCurrentPreviewIndex(newScenes.length - 1)
    }
  }

  const toggleSceneSelection = (id: number) => {
    const newSet = new Set(selectedScenes)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedScenes(newSet)
  }

  const handlePrevScene = useCallback(() => {
    if (currentPreviewIndex > 0) {
      setCurrentPreviewIndex(currentPreviewIndex - 1)
      setScreenshotOffset(0)
    }
  }, [currentPreviewIndex])

  const handleNextScene = useCallback(() => {
    if (currentPreviewIndex < scenes.length - 1) {
      setCurrentPreviewIndex(currentPreviewIndex + 1)
      setScreenshotOffset(0)
    }
  }, [currentPreviewIndex, scenes.length])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handlePrevScene()
      if (e.key === 'ArrowRight') handleNextScene()
    },
    [handlePrevScene, handleNextScene]
  )

  const handleRecaptureScreenshot = async () => {
    if (!currentScene || !videoPath) return

    setIsCapturing(true)
    try {
      const newTimestamp = currentScene.start_time + screenshotOffset

      if (newTimestamp < 0 || newTimestamp > currentScene.end_time) {
        toast({
          title: '时间超出范围',
          description: `偏移后时间必须在 0 到 ${currentScene.duration.toFixed(1)} 秒之间`,
          variant: 'destructive',
        })
        return
      }

      const newScreenshotPath = `${videoPath}_scenes/screenshots/scene_${String(currentScene.id).padStart(3, '0')}_offset_${screenshotOffset}s.jpg`

      const result = await invoke<string>('capture_frame', {
        videoPath,
        timestamp: newTimestamp,
        outputPath: newScreenshotPath,
      })

      const updatedScenes = [...scenes]
      updatedScenes[currentPreviewIndex] = {
        ...currentScene,
        screenshot_path: result,
      }
      setScenes(updatedScenes)

      toast({
        title: '截图已更新',
        description: `在时间 ${formatDuration(newTimestamp)} 处重新截取`,
      })
    } catch (error) {
      toast({
        title: '截图失败',
        description: String(error),
        variant: 'destructive',
      })
    } finally {
      setIsCapturing(false)
    }
  }

  const handleExport = async () => {
    if (scenes.length === 0) {
      toast({ title: '没有可导出的分镜', variant: 'destructive' })
      return
    }

    const selectedSceneList = scenes.filter((s) => selectedScenes.has(s.id))
    if (selectedSceneList.length === 0) {
      toast({ title: '请先选择要导出的分镜', variant: 'destructive' })
      return
    }

    try {
      const outputDir = await save({
        title: '选择导出目录',
        defaultPath: '分镜导出',
      })

      if (!outputDir) return

      setIsExporting(true)
      setExportProgress(0)
      setExportStatus('正在准备导出...')

      const result = await invoke<{ screenshot_paths: string[]; video_paths: string[] }>('export_scenes', {
        request: {
          video_path: videoPath,
          scenes: selectedSceneList.map((s) => ({
            id: s.id,
            start_time: s.start_time,
            end_time: s.end_time,
          })),
          output_dir: outputDir,
          export_screenshots: exportScreenshots,
          export_videos: exportVideos,
        },
      })

      setExportProgress(100)
      setExportStatus('导出完成')

      const totalExported = result.screenshot_paths.length + result.video_paths.length
      toast({
        title: '导出完成',
        description: `成功导出 ${totalExported} 个文件`,
      })
    } catch (error) {
      setExportStatus('导出失败')
      toast({
        title: '导出失败',
        description: String(error),
        variant: 'destructive',
      })
    } finally {
      setIsExporting(false)
    }
  }

  // 导入分镜到剧集
  const handleImportToEpisode = async () => {
    if (scenes.length === 0) {
      toast({ title: '没有可导入的分镜', variant: 'destructive' })
      return
    }

    if (!currentProjectId || !currentEpisodeId) {
      toast({ title: '请先选择项目和剧集', variant: 'destructive' })
      return
    }

    const confirmed = await confirm(
      `确定要导入 ${scenes.length} 个分镜到当前剧集吗？\n\n这将清空当前剧集的所有现有分镜！`,
      { title: '导入确认', kind: 'warning', okLabel: '确认导入', cancelLabel: '取消' }
    )
    if (!confirmed) return

    setIsImporting(true)
    setImportProgress(0)

    try {
      // 1. 先清空当前剧集的分镜
      const existingStoryboards = await localDB.getStoryboards(currentEpisodeId)
      for (const sb of existingStoryboards) {
        await localDB.deleteStoryboard(sb.id)
      }

      // 2. 导出每个分镜的视频片段到工作目录
      const total = scenes.length
      const videoOutputDir = `${videoPath}_scenes/videos`
      await invoke('export_scenes', {
        request: {
          video_path: videoPath,
          scenes: scenes.map((s) => ({
            id: s.id,
            start_time: s.start_time,
            end_time: s.end_time,
          })),
          output_dir: videoOutputDir,
          export_screenshots: false,
          export_videos: true,
        },
      })

      // 3. 创建新分镜（图片+视频）
      for (let i = 0; i < total; i++) {
        const scene = scenes[i]!
        setImportProgress(Math.round(((i + 1) / total) * 100))

        // 视频片段路径
        const startFormatted = scene.start_time_formatted.replace(/:/g, '-')
        const endFormatted = scene.end_time_formatted.replace(/:/g, '-')
        const videoPathFormatted = `${videoOutputDir}/scene_${String(scene.id).padStart(3, '0')}_${startFormatted}_to_${endFormatted}.mp4`

        await localDB.createStoryboard({
          episode_id: currentEpisodeId,
          project_id: currentProjectId,
          name: `分镜 ${scene.id}`,
          description: `从视频提取的分镜\n开始: ${scene.start_time_formatted}\n结束: ${scene.end_time_formatted}\n时长: ${scene.duration_formatted}`,
          image: scene.screenshot_path,
          video: videoPathFormatted,
          duration: scene.duration,
          sort_order: i,
          status: 'draft',
        })
      }

      toast({
        title: '导入完成',
        description: `成功导入 ${total} 个分镜到当前剧集`,
      })
    } catch (error) {
      toast({
        title: '导入失败',
        description: String(error),
        variant: 'destructive',
      })
    } finally {
      setIsImporting(false)
      setImportProgress(0)
    }
  }

  const currentScene = currentPreviewIndex >= 0 ? scenes[currentPreviewIndex] : null
  const allScreenshotPaths = scenes.map(s => s.screenshot_path).filter(Boolean)

  return (
    <div className="flex flex-col h-full" onKeyDown={handleKeyDown} tabIndex={0}>
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Scissors className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold">视频分镜拆解</h1>
          <Badge variant="secondary">FFmpeg 场景检测</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSelectVideo}>
            <FolderOpen className="w-4 h-4 mr-1" />
            选择视频
          </Button>
          <Button
            size="sm"
            onClick={handleDetectScenes}
            disabled={!videoPath || isDetecting}
          >
            {isDetecting ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Film className="w-4 h-4 mr-1" />
            )}
            自动检测分镜
          </Button>
          {scenes.length > 0 && currentProjectId && currentEpisodeId && (
            <Button
              size="sm"
              variant="secondary"
              onClick={handleImportToEpisode}
              disabled={isImporting}
            >
              {isImporting ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Import className="w-4 h-4 mr-1" />
              )}
              导入剧集
            </Button>
          )}
        </div>
      </div>

      {/* 检测进度条 */}
      {isDetecting && (
        <div className="px-6 py-2 bg-muted/50 border-b">
          <div className="flex items-center gap-3">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="text-sm flex-1">{detectStatus}</span>
            <span className="text-sm text-muted-foreground">{detectProgress}%</span>
          </div>
          <Progress value={detectProgress} className="h-1.5 mt-1.5" />
        </div>
      )}

      {/* 导出进度条 */}
      {isExporting && (
        <div className="px-6 py-2 bg-muted/50 border-b">
          <div className="flex items-center gap-3">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="text-sm flex-1">{exportStatus}</span>
            <span className="text-sm text-muted-foreground">{exportProgress}%</span>
          </div>
          <Progress value={exportProgress} className="h-1.5 mt-1.5" />
        </div>
      )}

      {/* 导入进度条 */}
      {isImporting && (
        <div className="px-6 py-2 bg-muted/50 border-b">
          <div className="flex items-center gap-3">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="text-sm flex-1">正在导入分镜到剧集...</span>
            <span className="text-sm text-muted-foreground">{importProgress}%</span>
          </div>
          <Progress value={importProgress} className="h-1.5 mt-1.5" />
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧：控制面板和分镜列表 */}
        <div className="w-[420px] flex flex-col border-r bg-muted/30">
          {/* 视频信息 */}
          {videoPath && (
            <Card className="m-3">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Video className="w-4 h-4 text-muted-foreground" />
                  <span className="truncate flex-1" title={videoPath}>
                    {videoPath.split(/[\\/]/).pop()}
                  </span>
                </div>
                {videoInfo && (
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div className="flex gap-3">
                      <span>时长: {formatDuration(videoInfo.duration)}</span>
                      <span>分辨率: {videoInfo.width}x{videoInfo.height}</span>
                    </div>
                    <div>帧率: {videoInfo.fps.toFixed(2)} fps</div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* 检测设置 */}
          <Card className="mx-3 mb-3">
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                检测设置
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 space-y-3">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <Label>检测灵敏度</Label>
                  <span className="text-muted-foreground">{threshold}%</span>
                </div>
                <Slider
                  value={[threshold]}
                  onValueChange={(v) => setThreshold(v[0] ?? 30)}
                  min={10}
                  max={90}
                  step={1}
                />
                <p className="text-xs text-muted-foreground">值越小检测越灵敏，可能产生更多分镜</p>
              </div>
            </CardContent>
          </Card>

          {/* 导出设置 */}
          {scenes.length > 0 && (
            <Card className="mx-3 mb-3">
              <CardHeader className="p-3 pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  导出设置
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="export-screenshots" className="text-sm cursor-pointer">
                    <ImageIcon className="w-4 h-4 inline mr-1" />
                    导出截图
                  </Label>
                  <Switch
                    id="export-screenshots"
                    checked={exportScreenshots}
                    onCheckedChange={setExportScreenshots}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="export-videos" className="text-sm cursor-pointer">
                    <Video className="w-4 h-4 inline mr-1" />
                    导出视频片段
                  </Label>
                  <Switch
                    id="export-videos"
                    checked={exportVideos}
                    onCheckedChange={setExportVideos}
                  />
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={handleExport}
                  disabled={isExporting || selectedScenes.size === 0}
                >
                  {isExporting ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-1" />
                  )}
                  导出选中分镜 ({selectedScenes.size})
                </Button>
              </CardContent>
            </Card>
          )}

          {/* 分镜列表 */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="px-3 py-2 text-sm font-medium flex items-center justify-between">
              <span>分镜列表</span>
              {scenes.length > 0 && (
                <Badge variant="secondary">{scenes.length} 个分镜</Badge>
              )}
            </div>
            <ScrollArea className="flex-1">
              <div className="px-3 pb-3 space-y-2">
                {scenes.map((scene, index) => (
                  <div
                    key={scene.id}
                    className={cn(
                      'flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors',
                      currentPreviewIndex === index
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-accent',
                      !selectedScenes.has(scene.id) && 'opacity-50'
                    )}
                    onClick={() => {
                      setCurrentPreviewIndex(index)
                      setScreenshotOffset(0)
                      toggleSceneSelection(scene.id)
                    }}
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded bg-primary/10 text-primary text-sm font-medium shrink-0">
                      {scene.id}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">
                        {scene.start_time_formatted} - {scene.end_time_formatted}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        时长: {scene.duration_formatted}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteScene(index)
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}

                {scenes.length === 0 && !isDetecting && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Film className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">选择视频并点击检测</p>
                    <p className="text-xs mt-1">自动识别视频中的场景切换</p>
                  </div>
                )}

                {isDetecting && (
                  <div className="text-center py-8 text-muted-foreground">
                    <RotateCw className="w-10 h-10 mx-auto mb-2 animate-spin opacity-50" />
                    <p className="text-sm">正在检测分镜...</p>
                    <p className="text-xs mt-1">{detectStatus}</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* 右侧：预览区 */}
        <div className="flex-1 flex flex-col bg-background">
          {currentScene ? (
            <>
              {/* 预览工具栏 */}
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="w-8 h-8"
                    onClick={handlePrevScene}
                    disabled={currentPreviewIndex === 0}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm font-medium">
                    第 {currentScene.id} 镜 / 共 {scenes.length} 镜
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="w-8 h-8"
                    onClick={handleNextScene}
                    disabled={currentPreviewIndex === scenes.length - 1}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
                <div className="text-sm text-muted-foreground">
                  {currentScene.start_time_formatted} - {currentScene.end_time_formatted}
                  <span className="ml-2">({currentScene.duration_formatted})</span>
                </div>
              </div>

              {/* 预览图 */}
              <div className="flex-1 flex items-center justify-center p-6 bg-muted/20 min-h-0 overflow-hidden" ref={previewRef}>
                {currentScene.screenshot_path ? (
                  <img
                    src={getAssetUrl(currentScene.screenshot_path) || ''}
                    alt={`分镜 ${currentScene.id}`}
                    className="max-w-full max-h-full object-contain rounded-lg shadow-lg cursor-pointer"
                    onClick={() => {
                      setPreviewIndex(currentPreviewIndex)
                      setPreviewOpen(true)
                    }}
                    title="点击打开轮播预览"
                  />
                ) : (
                  <div className="flex flex-col items-center text-muted-foreground">
                    <AlertCircle className="w-12 h-12 mb-2 opacity-50" />
                    <p>截图生成失败</p>
                  </div>
                )}
              </div>

              {/* 底部信息和截图微调 */}
              <div className="px-4 py-3 border-t bg-muted/30 space-y-3">
                {/* 时间信息 */}
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-4">
                    <span>开始: {currentScene.start_time_formatted}</span>
                    <span>结束: {currentScene.end_time_formatted}</span>
                    <span>时长: {currentScene.duration_formatted}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedScenes.has(currentScene.id) ? (
                      <Badge variant="default" className="gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        已选中
                      </Badge>
                    ) : (
                      <Badge variant="outline">未选中</Badge>
                    )}
                  </div>
                </div>

                {/* 截图时间微调 */}
                <div className="flex items-center gap-3 pt-2 border-t border-border/50">
                  <Camera className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm text-muted-foreground shrink-0">截图偏移:</span>
                  <input
                    type="number"
                    value={screenshotOffset}
                    onChange={(e) => setScreenshotOffset(Number(e.target.value))}
                    step={0.1}
                    min={-currentScene.start_time}
                    max={currentScene.duration}
                    className="w-20 h-8 px-2 text-sm border rounded-md bg-background"
                    title="相对于场景开始时间的偏移量（秒）"
                  />
                  <span className="text-sm text-muted-foreground">秒</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleRecaptureScreenshot}
                    disabled={isCapturing}
                    className="ml-auto"
                  >
                    {isCapturing ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                    ) : (
                      <Camera className="w-3.5 h-3.5 mr-1" />
                    )}
                    重新截取
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  当前截图时间: {formatDuration(currentScene.start_time + screenshotOffset)} (场景开始 + {screenshotOffset}秒)
                </p>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <Film className="w-16 h-16 mb-4 opacity-30" />
              <p className="text-lg font-medium">视频分镜拆解工具</p>
              <p className="text-sm mt-2 max-w-md text-center">
                选择视频文件后，自动检测场景切换点，生成每个分镜的截图和时间信息。
                支持导出截图和视频片段。
              </p>
              <div className="flex items-center gap-2 mt-6 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <ChevronLeft className="w-3 h-3" />
                  <ChevronRight className="w-3 h-3" />
                  键盘方向键切换分镜
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 图片预览轮播弹窗 */}
      <ImagePreviewDialog
        src={allScreenshotPaths[previewIndex] || ''}
        alt={`分镜 ${previewIndex + 1}`}
        title={`第 ${previewIndex + 1} 镜 / 共 ${scenes.length} 镜`}
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        images={allScreenshotPaths}
        currentIndex={previewIndex}
        onIndexChange={setPreviewIndex}
      />
    </div>
  )
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}
