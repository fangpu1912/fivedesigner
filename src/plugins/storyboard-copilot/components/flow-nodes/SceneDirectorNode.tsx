import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  Handle,
  Position,
  useUpdateNodeInternals,
  useReactFlow,
  type NodeProps,
} from '@xyflow/react'
import {
  Clapperboard,
  ImagePlus,
  Trash2,
  Download,
  Send,
} from 'lucide-react'

import { canvasEvents } from '../../utils/canvasEvents'
import { useUpstreamData } from '../../hooks/useUpstreamData'
import { ImagePreviewDialog } from '@/components/media/ImagePreviewDialog'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { useToast } from '@/hooks/useToast'
import { useUIStore } from '@/store/useUIStore'
import { saveMediaFile } from '@/utils/mediaStorage'
import { getImageUrl } from '@/utils/asset'

import type {
  SceneDirectorNodeData,
  CameraConfig,
  SceneScreenshot,
} from '../../types'
import { PanoramaViewer } from '../three/PanoramaViewer'
import { getNodeContainerClass, getTargetHandleClass, getSourceHandleClass, NODE_HEADER_FLOATING_CLASS, NODE_HEADER_CLASSES } from './NodeStyles'
import { useEnlargedHandles } from '../../hooks/useEnlargedHandles'

interface SceneDirectorNodeProps extends NodeProps {
  data: SceneDirectorNodeData
}

const DEFAULT_CAMERA: CameraConfig = {
  position: { x: 0, y: 0, z: 0 },
  target: { x: 0, y: 0, z: -1 },
  fov: 75,
}

export const SceneDirectorNode = memo(({ id, data, selected }: SceneDirectorNodeProps) => {
  const { toast } = useToast()
  const updateNodeInternals = useUpdateNodeInternals()
  const { updateNodeData } = useReactFlow()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { upstreamImage } = useUpstreamData(id)
  const upstreamImageRef = useRef<string | null>(null)

  const currentProjectId = useUIStore((state) => state.currentProjectId)
  const currentEpisodeId = useUIStore((state) => state.currentEpisodeId)

  const [panoramaUrl, setPanoramaUrl] = useState<string | null>(data.panoramaUrl || null)
  const [camera, setCamera] = useState<CameraConfig>(data.camera || DEFAULT_CAMERA)
  const [screenshots, setScreenshots] = useState<SceneScreenshot[]>(data.screenshots || [])
  const [showGrid, setShowGrid] = useState(data.showGrid ?? true)
  const gridSize = data.gridSize || 50
  const [screenshotRatio, setScreenshotRatio] = useState(data.screenshotRatio || '16:9')
  const [previewScreenshot, setPreviewScreenshot] = useState<SceneScreenshot | null>(null)

  const enlargedHandles = useEnlargedHandles(id)

  // 上游图片接入时自动作为全景图
  useEffect(() => {
    if (upstreamImage && !panoramaUrl) {
      upstreamImageRef.current = upstreamImage
      setPanoramaUrl(upstreamImage)
      updateNodeData(id, { ...data, panoramaUrl: upstreamImage } as SceneDirectorNodeData)
    } else if (!upstreamImage && upstreamImageRef.current && panoramaUrl === upstreamImageRef.current) {
      upstreamImageRef.current = null
      setPanoramaUrl(null)
      updateNodeData(id, { ...data, panoramaUrl: null } as SceneDirectorNodeData)
    }
  }, [upstreamImage, panoramaUrl, data, id, updateNodeData])

  // 同步状态到节点数据
  useEffect(() => {
    data.panoramaUrl = panoramaUrl
    data.camera = camera
    data.screenshots = screenshots
    data.showGrid = showGrid
    data.gridSize = gridSize
    data.screenshotRatio = screenshotRatio
  }, [panoramaUrl, camera, screenshots, showGrid, gridSize, screenshotRatio, data])

  useEffect(() => {
    updateNodeInternals(id)
  }, [id, updateNodeInternals])

  const handlePanoramaUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      try {
        const arrayBuffer = await file.arrayBuffer()
        const ext = file.name.split('.').pop() || 'jpg'

        const savedPath = await saveMediaFile(arrayBuffer, {
          projectId: currentProjectId || 'temp',
          episodeId: currentEpisodeId || 'temp',
          type: 'image',
          fileName: `panorama_${Date.now()}.${ext}`,
          extension: ext,
        })

        setPanoramaUrl(savedPath)
        toast({ title: '全景图已上传' })
      } catch (error) {
        toast({
          title: '上传失败',
          description: String(error),
          variant: 'destructive',
        })
      }

      e.target.value = ''
    },
    [currentProjectId, currentEpisodeId, toast]
  )

  const handleScreenshot = useCallback(
    (screenshot: SceneScreenshot) => {
      setScreenshots((prev) => [...prev, screenshot])
      updateNodeData(id, { ...data, imageUrl: screenshot.dataUrl } as SceneDirectorNodeData)
      canvasEvents.emit({
        type: 'addUploadNode',
        imageUrl: screenshot.dataUrl,
        sourceNodeId: id,
      })
      toast({ title: '截图已保存并发送到画布' })
    },
    [toast, id, data, updateNodeData]
  )

  const handleDeleteScreenshot = useCallback(
    (screenshotId: string) => {
      setScreenshots((prev) => prev.filter((s) => s.id !== screenshotId))
      toast({ title: '截图已删除' })
    },
    [toast]
  )

  const handleSendToCanvas = useCallback(
    (screenshot: SceneScreenshot) => {
      canvasEvents.emit({
        type: 'addUploadNode',
        imageUrl: screenshot.dataUrl,
        sourceNodeId: id,
      })
      toast({ title: '已发送到画布', description: '截图已添加为图片节点' })
    },
    [id, toast]
  )

  const handleExportScreenshot = useCallback(
    async (screenshot: SceneScreenshot) => {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { readFile } = await import('@tauri-apps/plugin-fs')

        const fileData = await readFile(screenshot.dataUrl)

        const savePath = await save({
          defaultPath: `scene_${screenshot.timestamp}.png`,
          filters: [
            { name: 'PNG Image', extensions: ['png'] },
            { name: 'All Files', extensions: ['*'] },
          ],
        })

        if (savePath) {
          const { writeFile } = await import('@tauri-apps/plugin-fs')
          await writeFile(savePath, fileData)
          toast({ title: '导出成功' })
        }
      } catch (error) {
        toast({
          title: '导出失败',
          description: String(error),
          variant: 'destructive',
        })
      }
    },
    [toast]
  )

  return (
    <div className={getNodeContainerClass(!!selected, 'flex h-full flex-col')} style={{ width: 900, height: 600 }}>
      <Handle type="target" position={Position.Left} id="target" isConnectable={true} className={getTargetHandleClass(undefined, enlargedHandles.target)} />
      <Handle type="source" position={Position.Right} id="source" isConnectable={true} className={getSourceHandleClass(undefined, enlargedHandles.source)} />

      <div className={NODE_HEADER_FLOATING_CLASS}>
        <div className={NODE_HEADER_CLASSES.container}>
          <div className={NODE_HEADER_CLASSES.title}>
            <Clapperboard className={NODE_HEADER_CLASSES.icon} />
            <span>场景编排</span>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 主视图区域 */}
        <div
          className="relative flex-1 nowheel"
          onContextMenu={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          {panoramaUrl ? (
            <PanoramaViewer
              panoramaUrl={panoramaUrl}
              camera={camera}
              showGrid={showGrid}
              gridSize={gridSize}
              onCameraChange={setCamera}
              onScreenshot={handleScreenshot}
              onGridToggle={() => setShowGrid(!showGrid)}
              screenshotRatio={screenshotRatio}
              onReupload={() => fileInputRef.current?.click()}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-muted/30 p-4">
              <ImagePlus className="h-12 w-12 text-muted-foreground" />
              <p className="text-center text-[11px] text-muted-foreground">
                请先上传 360° 全景图
              </p>
              <Button
                variant="outline"
                className="h-7 text-[11px]"
                onClick={() => fileInputRef.current?.click()}
              >
                上传全景图
              </Button>
            </div>
          )}
        </div>

        {/* 右侧面板 */}
        <div className="flex w-72 flex-col border-l bg-muted/20">
          {/* 截图比例 */}
          <div className="border-b p-3">
            <Label className="mb-2 text-[11px] font-medium">截图比例</Label>
            <Select value={screenshotRatio} onValueChange={setScreenshotRatio}>
              <SelectTrigger className="h-7 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="16:9">16:9 (宽屏)</SelectItem>
                <SelectItem value="4:3">4:3 (标准)</SelectItem>
                <SelectItem value="1:1">1:1 (方形)</SelectItem>
                <SelectItem value="9:16">9:16 (竖屏)</SelectItem>
                <SelectItem value="21:9">21:9 (电影)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 截图列表 */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 p-3 border-b">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              <Label className="text-[11px] font-medium">截图列表 ({screenshots.length})</Label>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              <div className="grid grid-cols-2 gap-2">
                {screenshots.map((screenshot) => (
                  <div key={screenshot.id} className="group relative">
                    <img
                      src={getImageUrl(screenshot.dataUrl) || screenshot.dataUrl}
                      alt={`Screenshot ${screenshot.timestamp}`}
                      className="aspect-video w-full rounded object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center gap-1 rounded bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-white"
                        title="预览"
                        onClick={() => setPreviewScreenshot(screenshot)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-white"
                        title="发送到画布"
                        onClick={() => handleSendToCanvas(screenshot)}
                      >
                        <Send className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-white"
                        title="导出"
                        onClick={() => handleExportScreenshot(screenshot)}
                      >
                        <Download className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-white"
                        title="删除"
                        onClick={() => handleDeleteScreenshot(screenshot.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              {screenshots.length === 0 && (
                <p className="py-4 text-center text-[11px] text-muted-foreground">
                  点击截图按钮保存视角
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePanoramaUpload}
      />

      <ImagePreviewDialog
        src={previewScreenshot ? (getImageUrl(previewScreenshot.dataUrl) || previewScreenshot.dataUrl) : ''}
        alt="截图预览"
        isOpen={!!previewScreenshot}
        onClose={() => setPreviewScreenshot(null)}
        title={previewScreenshot ? `截图 ${new Date(previewScreenshot.timestamp).toLocaleString()}` : ''}
        images={screenshots.map(s => getImageUrl(s.dataUrl) || s.dataUrl)}
        currentIndex={previewScreenshot ? screenshots.findIndex(s => s.id === previewScreenshot.id) : 0}
        onIndexChange={(index) => {
          const s = screenshots[index]
          if (s) setPreviewScreenshot(s)
        }}
      />
    </div>
  )
})

SceneDirectorNode.displayName = 'SceneDirectorNode'
