import { useEffect, useRef, useCallback, useState } from 'react'
import { Viewer } from '@photo-sphere-viewer/core'
import '@photo-sphere-viewer/core/index.css'
import { getImageUrl, isAssetUrl } from '@/utils/asset'
import { saveMediaFile } from '@/utils/mediaStorage'
import { useUIStore } from '@/store/useUIStore'
import { useToast } from '@/hooks/useToast'
import type { CameraConfig, SceneScreenshot } from '../../types'
import { Camera, ImagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PanoramaViewerProps {
  panoramaUrl: string | null
  camera: CameraConfig
  showGrid: boolean
  gridSize: number
  onCameraChange: (camera: CameraConfig) => void
  onScreenshot: (screenshot: SceneScreenshot) => void
  onGridToggle?: () => void
  screenshotRatio?: string
  onReupload?: () => void
}

// 防抖函数
function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

export function PanoramaViewer({
  panoramaUrl,
  camera,
  showGrid,
  gridSize: _gridSize,
  onCameraChange,
  onScreenshot,
  onGridToggle,
  screenshotRatio = '16:9',
  onReupload,
}: PanoramaViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const screenshotRatioRef = useRef<string>(screenshotRatio)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showMultiGrid, setShowMultiGrid] = useState(false)
  const { toast } = useToast()
  const currentProjectId = useUIStore((state) => state.currentProjectId)
  const currentEpisodeId = useUIStore((state) => state.currentEpisodeId)

  // 同步比例
  useEffect(() => {
    screenshotRatioRef.current = screenshotRatio
  }, [screenshotRatio])

  // 初始化 Viewer
  useEffect(() => {
    if (!containerRef.current) return

    const viewer = new Viewer({
      container: containerRef.current,
      panorama: '',
      defaultPitch: 0,
      defaultYaw: 0,
      defaultZoomLvl: 50,
      navbar: ['zoom', 'fullscreen'],
      mousemove: true, // 默认允许拖拽旋转
    })

    viewerRef.current = viewer

    // 监听视角变化
    const debouncedPositionChange = debounce(() => {
      const position = viewer.getPosition()
      onCameraChange({
        position: { x: 0, y: 0, z: 0 },
        target: {
          x: Math.sin(position.yaw * Math.PI / 180) * Math.cos(position.pitch * Math.PI / 180),
          y: Math.sin(position.pitch * Math.PI / 180),
          z: -Math.cos(position.yaw * Math.PI / 180) * Math.cos(position.pitch * Math.PI / 180),
        },
        fov: 75,
      })
    }, 200)

    viewer.addEventListener('position-updated', debouncedPositionChange)

    // 键盘快捷键
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleScreenshotBtn()
      }
      if (e.key === 'r' || e.key === 'R') {
        viewer.rotate({ yaw: 0, pitch: 0 })
        viewer.zoom(50)
      }
      // F键全屏
      if (e.key === 'f' || e.key === 'F') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
          e.preventDefault()
          const container = containerRef.current
          if (container) {
            if (!document.fullscreenElement) {
              container.requestFullscreen().catch(err => {
                console.error('[PanoramaViewer] Fullscreen error:', err)
              })
            } else {
              document.exitFullscreen().catch(err => {
                console.error('[PanoramaViewer] Exit fullscreen error:', err)
              })
            }
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    // 粘贴功能
    const handlePaste = (e: ClipboardEvent) => {
      e.stopPropagation()
      const items = e.clipboardData?.items
      if (!items) return

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (!item) continue
        if (item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile()
          if (blob) {
            const reader = new FileReader()
            reader.onload = (event) => {
              const dataUrl = event.target?.result as string
              if (dataUrl) {
                onScreenshot({
                  id: `screenshot_${Date.now()}`,
                  dataUrl,
                  timestamp: Date.now(),
                  camera: { ...camera },
                })
                toast({ title: '图片已粘贴', description: '截图已添加到画布' })
              }
            }
            reader.readAsDataURL(blob)
          }
          break
        }
      }
    }

    document.addEventListener('paste', handlePaste)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('paste', handlePaste)
      viewer.destroy()
      viewerRef.current = null
    }
  }, [])

  // 加载全景图
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !panoramaUrl) return

    setIsLoading(true)
    setError(null)

    const imageUrl = getImageUrl(panoramaUrl) || panoramaUrl

    const loadPanorama = async () => {
      try {
        let finalUrl = imageUrl

        if (isAssetUrl(imageUrl)) {
          let filePath: string | null = null

          const assetMatch = imageUrl.match(/asset:\/\/localhost\/(.*)/)
          if (assetMatch && assetMatch[1]) {
            filePath = decodeURIComponent(assetMatch[1])
          }

          if (!filePath && imageUrl.includes('asset.localhost')) {
            try {
              const urlObj = new URL(imageUrl)
              filePath = decodeURIComponent(urlObj.pathname.substring(1))
            } catch (e) {
              console.error('解析 asset.localhost URL 失败:', e)
            }
          }

          if (filePath) {
            try {
              const normalizedPath = filePath.replace(/\//g, '\\')
              const { convertFileSrc } = await import('@tauri-apps/api/core')
              finalUrl = convertFileSrc(normalizedPath)
            } catch (readErr) {
              console.error('转换文件路径失败:', readErr)
              finalUrl = imageUrl
            }
          }
        }

        await viewer.setPanorama(finalUrl, { transition: false })
        setIsLoading(false)
      } catch (err) {
        console.error('加载全景图失败:', err)
        setIsLoading(false)
        setError('加载全景图失败')
      }
    }

    loadPanorama()
  }, [panoramaUrl])

  // 截图按钮处理
  const handleScreenshotBtn = useCallback(async () => {
    const viewer = viewerRef.current
    if (!viewer) return

    const projectId = currentProjectId || 'temp'
    const episodeId = currentEpisodeId || 'temp'

    try {
      // @ts-ignore
      const renderer = viewer.renderer.renderer
      // @ts-ignore
      const scene = viewer.renderer.scene
      // @ts-ignore
      const camera = viewer.renderer.camera

      if (!renderer || !scene || !camera) return

      renderer.render(scene, camera)
      const originalCanvas = renderer.domElement

      let finalCanvas = originalCanvas
      const ratio = screenshotRatioRef.current
      if (ratio && ratio !== 'free') {
        const ratioMap: Record<string, number> = {
          '16:9': 16 / 9,
          '4:3': 4 / 3,
          '1:1': 1,
          '9:16': 9 / 16,
          '21:9': 21 / 9,
        }
        const targetRatio = ratioMap[ratio] || 16 / 9
        const cropCanvas = document.createElement('canvas')
        const ctx = cropCanvas.getContext('2d')
        if (ctx) {
          const origWidth = originalCanvas.width
          const origHeight = originalCanvas.height
          const origRatio = origWidth / origHeight
          let cropWidth, cropHeight, cropX, cropY
          if (origRatio > targetRatio) {
            cropHeight = origHeight
            cropWidth = origHeight * targetRatio
            cropX = (origWidth - cropWidth) / 2
            cropY = 0
          } else {
            cropWidth = origWidth
            cropHeight = origWidth / targetRatio
            cropX = 0
            cropY = (origHeight - cropHeight) / 2
          }
          cropCanvas.width = cropWidth
          cropCanvas.height = cropHeight
          ctx.drawImage(originalCanvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)
          finalCanvas = cropCanvas
        }
      }

      const dataUrl = finalCanvas.toDataURL('image/png')
      const fileName = `scene_screenshot_${Date.now()}.png`
      const savedPath = await saveMediaFile(dataUrl, { projectId, episodeId, type: 'image', fileName, extension: 'png' })
      const position = viewer.getPosition()

      onScreenshot({
        id: `screenshot_${Date.now()}`,
        dataUrl: savedPath,
        camera: { position: { x: 0, y: 0, z: 0 }, target: { x: Math.sin(position.yaw * Math.PI / 180) * Math.cos(position.pitch * Math.PI / 180), y: Math.sin(position.pitch * Math.PI / 180), z: -Math.cos(position.yaw * Math.PI / 180) * Math.cos(position.pitch * Math.PI / 180) }, fov: 75 },
        timestamp: Date.now(),
      })
      toast({ title: '截图已保存', description: fileName })
    } catch (err) {
      toast({ title: '截图失败', description: String(err), variant: 'destructive' })
    }
  }, [onScreenshot, currentProjectId, currentEpisodeId, toast])

  // 六宫格截图（360°水平方向，每60°一张）
  const handleMultiGridScreenshot = useCallback(async () => {
    const projectId = currentProjectId || 'temp'
    const episodeId = currentEpisodeId || 'temp'
    const viewer = viewerRef.current
    if (!viewer) return

    // @ts-ignore
    const renderer = viewer.renderer.renderer
    // @ts-ignore
    const scene = viewer.renderer.scene
    // @ts-ignore
    const camera = viewer.renderer.camera
    if (!renderer || !scene || !camera) return

    const basePitch = viewer.getPosition().pitch
    const screenshots: SceneScreenshot[] = []
    const positions = [
      { yaw: 0, pitch: basePitch },
      { yaw: 60, pitch: basePitch },
      { yaw: 120, pitch: basePitch },
      { yaw: 180, pitch: basePitch },
      { yaw: 240, pitch: basePitch },
      { yaw: 300, pitch: basePitch },
    ]

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i]
      if (!pos) continue
      viewer.rotate({ yaw: pos.yaw, pitch: pos.pitch })
      await new Promise((resolve) => setTimeout(resolve, 300))
      renderer.render(scene, camera)
      const originalCanvas = renderer.domElement

      let finalCanvas = originalCanvas
      const ratio = screenshotRatioRef.current
      if (ratio && ratio !== 'free') {
        const ratioMap: Record<string, number> = {
          '16:9': 16 / 9,
          '4:3': 4 / 3,
          '1:1': 1,
          '9:16': 9 / 16,
          '21:9': 21 / 9,
        }
        const targetRatio = ratioMap[ratio] || 16 / 9
        const cropCanvas = document.createElement('canvas')
        const ctx = cropCanvas.getContext('2d')
        if (ctx) {
          const origWidth = originalCanvas.width
          const origHeight = originalCanvas.height
          const origRatio = origWidth / origHeight
          let cropWidth, cropHeight, cropX, cropY
          if (origRatio > targetRatio) {
            cropHeight = origHeight
            cropWidth = origHeight * targetRatio
            cropX = (origWidth - cropWidth) / 2
            cropY = 0
          } else {
            cropWidth = origWidth
            cropHeight = origWidth / targetRatio
            cropX = 0
            cropY = (origHeight - cropHeight) / 2
          }
          cropCanvas.width = cropWidth
          cropCanvas.height = cropHeight
          ctx.drawImage(originalCanvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)
          finalCanvas = cropCanvas
        }
      }

      const dataUrl = finalCanvas.toDataURL('image/png')
      const fileName = `scene_screenshot_${Date.now()}_${i + 1}.png`
      const savedPath = await saveMediaFile(dataUrl, { projectId, episodeId, type: 'image', fileName, extension: 'png' })

      screenshots.push({
        id: `screenshot_${Date.now()}_${i}`,
        dataUrl: savedPath,
        camera: { position: { x: 0, y: 0, z: 0 }, target: { x: Math.sin(pos.yaw * Math.PI / 180) * Math.cos(pos.pitch * Math.PI / 180), y: Math.sin(pos.pitch * Math.PI / 180), z: -Math.cos(pos.yaw * Math.PI / 180) * Math.cos(pos.pitch * Math.PI / 180) }, fov: 75 },
        timestamp: Date.now(),
      })
    }

    screenshots.forEach(screenshot => onScreenshot(screenshot))
    toast({ title: '批量截图完成', description: `已保存 ${screenshots.length} 张图片` })
  }, [onScreenshot, currentProjectId, currentEpisodeId, toast])

  return (
    <div ref={containerRef} className="relative h-full w-full nowheel" onWheel={(e) => e.stopPropagation()}>
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
          <div className="text-sm text-muted-foreground">加载中...</div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
          <div className="text-sm text-destructive">{error}</div>
        </div>
      )}

      {/* 顶部工具栏 */}
      <div className="absolute left-3 top-3 z-20 flex items-center gap-1 rounded-lg border bg-background/90 p-1 shadow-sm">
        {/* 截图 */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleScreenshotBtn}
          className="h-8 text-xs gap-1"
        >
          <Camera className="h-3 w-3" />
          截图
        </Button>

        <Button
          variant={showMultiGrid ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setShowMultiGrid(!showMultiGrid)}
          className="h-8 w-8 p-0"
          title="六宫格截图"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        </Button>

        {showMultiGrid && (
          <Button
            variant="default"
            size="sm"
            onClick={handleMultiGridScreenshot}
            className="h-8 text-xs"
          >
            执行六宫格
          </Button>
        )}

        <div className="mx-1 h-4 w-px bg-border" />

        {/* 网格辅助线 */}
        <Button
          variant={showGrid ? 'secondary' : 'outline'}
          size="sm"
          onClick={onGridToggle}
          className="h-8 w-8 p-0"
          title="网格辅助线"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="3" x2="3" y2="21"/><line x1="21" y1="3" x2="21" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="3" y1="3" x2="21" y2="3"/><line x1="3" y1="21" x2="21" y2="21"/></svg>
        </Button>

        {onReupload && (
          <>
            <div className="mx-1 h-4 w-px bg-border" />
            <Button
              variant="outline"
              size="sm"
              onClick={onReupload}
              className="h-8 text-xs gap-1"
            >
              <ImagePlus className="h-3 w-3" />
              重传
            </Button>
          </>
        )}

        <div className="mx-1 h-4 w-px bg-border" />

        {/* 状态显示 */}
        <div className="flex items-center gap-2 px-2">
          <span className="text-xs text-muted-foreground">{screenshotRatio}</span>
        </div>
      </div>

      {/* 六宫格指示器（2行3列） */}
      {showMultiGrid && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/3 top-0 h-full w-px bg-primary/30" />
          <div className="absolute left-2/3 top-0 h-full w-px bg-primary/30" />
          <div className="absolute left-0 top-1/2 h-px w-full bg-primary/30" />
        </div>
      )}

      {/* 底部提示 */}
      <div className="absolute bottom-3 left-3 z-20 rounded bg-black/50 px-2 py-1 text-xs text-white">
        左键拖动旋转 • 滚轮缩放 • F全屏 • Ctrl+S截图 • Ctrl+V粘贴截图
      </div>
    </div>
  )
}
