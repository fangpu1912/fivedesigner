import { useEffect, useRef, useCallback, useState } from 'react'
import { Viewer } from '@photo-sphere-viewer/core'
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin'
import '@photo-sphere-viewer/core/index.css'
import '@photo-sphere-viewer/markers-plugin/index.css'
import { getImageUrl, isAssetUrl } from '@/utils/asset'
import { saveMediaFile } from '@/utils/mediaStorage'
import { useUIStore } from '@/store/useUIStore'
import { useToast } from '@/hooks/useToast'
import type { SceneCharacter, CameraConfig, SceneScreenshot } from '../../types'
import { Plus, Trash2, Camera, Users, ImagePlus, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PanoramaViewerProps {
  panoramaUrl: string | null
  characters: SceneCharacter[]
  camera: CameraConfig
  showGrid: boolean
  gridSize: number
  onCameraChange: (camera: CameraConfig) => void
  onScreenshot: (screenshot: SceneScreenshot) => void
  selectedCharacterId: string | null
  onCharacterSelect: (id: string | null) => void
  onCharacterUpdate: (id: string, updates: Partial<SceneCharacter>) => void
  isPlacingCharacter?: boolean
  onGroundClick?: (position: { x: number; z: number }) => void
  onGridToggle?: () => void
  screenshotRatio?: string
  onReupload?: () => void
  onAddCharacter?: (char: SceneCharacter) => void
  onDeleteCharacter?: (id: string) => void
}

// 防抖函数
function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

// 颜色池
const COLOR_POOL = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4']

export function PanoramaViewer({
  panoramaUrl,
  characters,
  camera,
  showGrid,
  gridSize: _gridSize,
  onCameraChange,
  onScreenshot,
  selectedCharacterId,
  onCharacterSelect,
  onCharacterUpdate,
  isPlacingCharacter,
  onGroundClick,
  onGridToggle,
  screenshotRatio = '16:9',
  onReupload,
  onAddCharacter,
  onDeleteCharacter,
}: PanoramaViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const screenshotRatioRef = useRef<string>(screenshotRatio)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showMultiGrid, setShowMultiGrid] = useState(false)
  const [isPlacingMode, setIsPlacingMode] = useState(false)
  const [_pendingCharacter, setPendingCharacter] = useState<SceneCharacter | null>(null)
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
      plugins: [
        [MarkersPlugin, {
          markers: [],
        }],
      ],
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

    // 双击事件 - 放置模式
    viewer.addEventListener('dblclick', ({ data }) => {
      if (isPlacingMode) {
        // 在双击位置放置人物
        const newChar: SceneCharacter = {
          id: `char_${Date.now()}`,
          name: `人物 ${characters.length + 1}`,
          imageUrl: '',
          position: { x: data.yaw, y: data.pitch, z: 0 },
          rotation: 0,
          scale: 1,
          layer: 'midground',
          pose: 'front',
        }
        if (onAddCharacter) {
          onAddCharacter(newChar)
        }
        setIsPlacingMode(false)
        toast({ title: '人物已放置', description: '点击人物可替换图片' })
      } else if (isPlacingCharacter && onGroundClick) {
        const x = Math.sin(data.yaw * Math.PI / 180) * 5
        const z = -Math.cos(data.yaw * Math.PI / 180) * 5
        onGroundClick({ x, z })
      }
    })

    // 键盘快捷键
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleScreenshotBtn()
      }
      if (e.key === 'Escape') {
        setIsPlacingMode(false)
        setPendingCharacter(null)
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

  // 放置模式切换时禁用/启用拖拽旋转
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    // @ts-ignore - Photo Sphere Viewer 内部方法
    if (viewer.dynamics) {
      // @ts-ignore
      viewer.dynamics.mouseEnabled = !isPlacingMode
    }
  }, [isPlacingMode])

  // 加载全景图
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !panoramaUrl) return

    setIsLoading(true)
    setError(null)

    const imageUrl = getImageUrl(panoramaUrl) || panoramaUrl

    const loadPanorama = async () => {
      let blobUrl: string | null = null
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

        if (blobUrl) {
          URL.revokeObjectURL(blobUrl)
        }
      } catch (err) {
        console.error('加载全景图失败:', err)
        setIsLoading(false)
        setError('加载全景图失败')
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl)
        }
      }
    }

    loadPanorama()
  }, [panoramaUrl])

  // 更新人物标记
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    const markersPlugin = viewer.getPlugin(MarkersPlugin) as MarkersPlugin | null
    if (!markersPlugin) return

    markersPlugin.clearMarkers()

    characters.forEach((char, index) => {
      const imageUrl = getImageUrl(char.imageUrl) || char.imageUrl
      const isSelected = char.id === selectedCharacterId
      const hasImage = !!imageUrl

      // 根据是否有图片选择不同的标记样式
      const markerHtml = hasImage 
        ? `<div style="
            width: 48px; 
            height: 72px; 
            border-radius: 4px; 
            overflow: hidden; 
            border: 3px solid ${isSelected ? '#ffff00' : 'transparent'};
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            transition: all 0.2s;
          ">
            <img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: cover;" />
          </div>`
        : `<div style="
            width: 40px; 
            height: 60px; 
            background: ${COLOR_POOL[index % COLOR_POOL.length]};
            border-radius: 4px;
            border: 3px solid ${isSelected ? '#ffff00' : 'transparent'};
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 12px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.2s;
          ">
            ${index + 1}
          </div>`

      markersPlugin.addMarker({
        id: char.id,
        html: markerHtml,
        position: { yaw: char.position.x, pitch: char.position.y ?? 0 },
        size: { width: hasImage ? 48 : 40, height: hasImage ? 72 : 60 },
        anchor: 'bottom center',
        className: `character-marker ${isSelected ? 'selected' : ''}`,
        tooltip: char.name,
        data: { character: char },
      })
    })
  }, [characters, selectedCharacterId])

  // 标记点击 - 选择或替换图片
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    const markersPlugin = viewer.getPlugin(MarkersPlugin) as MarkersPlugin | null
    if (!markersPlugin) return

    const handleMarkerClick = ({ marker }: { marker: any }) => {
      const char = marker.data?.character as SceneCharacter
      if (!char) return

      // 如果已经有图片，只是选中
      if (char.imageUrl) {
        onCharacterSelect(marker.id)
        return
      }

      // 如果没有图片，打开文件选择器替换
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) return

        try {
          const arrayBuffer = await file.arrayBuffer()
          const ext = file.name.split('.').pop() || 'png'
          const savedPath = await saveMediaFile(arrayBuffer, {
            projectId: currentProjectId || 'temp',
            episodeId: currentEpisodeId || 'temp',
            type: 'image',
            fileName: `character_${Date.now()}.${ext}`,
            extension: ext,
          })

          onCharacterUpdate(marker.id, { 
            imageUrl: savedPath,
            name: file.name.replace(/\.[^/.]+$/, '')
          })
          toast({ title: '图片已替换', description: file.name })
        } catch (error) {
          toast({ title: '替换失败', description: String(error), variant: 'destructive' })
        }
      }
      input.click()
    }

    markersPlugin.addEventListener('select-marker', handleMarkerClick as unknown as EventListener)

    return () => {
      markersPlugin.removeEventListener('select-marker', handleMarkerClick as unknown as EventListener)
    }
  }, [onCharacterSelect, onCharacterUpdate, currentProjectId, currentEpisodeId, toast])

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

  // 删除选中人物
  const handleDeleteSelected = useCallback(() => {
    if (!selectedCharacterId || !onDeleteCharacter) return
    onDeleteCharacter(selectedCharacterId)
    onCharacterSelect(null)
    toast({ title: '人物已删除' })
  }, [selectedCharacterId, onDeleteCharacter, onCharacterSelect, toast])

  // 清空所有人物
  const handleClearAll = useCallback(() => {
    if (!onDeleteCharacter) return
    characters.forEach(char => onDeleteCharacter(char.id))
    onCharacterSelect(null)
    toast({ title: '所有人物已清空' })
  }, [characters, onDeleteCharacter, onCharacterSelect, toast])

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
        {/* 添加人物 */}
        <Button
          variant={isPlacingMode ? 'default' : 'outline'}
          size="sm"
          onClick={() => setIsPlacingMode(!isPlacingMode)}
          className="h-8 text-xs gap-1"
        >
          {isPlacingMode ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          {isPlacingMode ? '点击放置' : '添加人物'}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleDeleteSelected}
          disabled={!selectedCharacterId}
          className="h-8 text-xs gap-1"
        >
          <Trash2 className="h-3 w-3" />
          删除
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleClearAll}
          disabled={characters.length === 0}
          className="h-8 text-xs"
        >
          清空
        </Button>

        <div className="mx-1 h-4 w-px bg-border" />

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

        {/* 网格 */}
        <Button
          variant={showGrid ? 'secondary' : 'outline'}
          size="sm"
          onClick={onGridToggle}
          className="h-8 w-8 p-0"
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
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            {characters.length}
          </span>
        </div>
      </div>

      {/* 放置模式提示 */}
      {isPlacingMode && (
        <div className="absolute left-1/2 top-20 z-20 -translate-x-1/2 rounded bg-blue-500 px-4 py-2 text-sm text-white shadow-lg">
          拖拽旋转已禁用 • 双击放置人物 • 按 ESC 退出
        </div>
      )}

      {/* 选中人物提示 */}
      {selectedCharacterId && !isPlacingMode && (
        <div className="absolute left-1/2 top-20 z-20 -translate-x-1/2 rounded bg-primary px-4 py-2 text-sm text-primary-foreground shadow-lg">
          选中人物：{characters.find(c => c.id === selectedCharacterId)?.name} • 点击图片可替换
        </div>
      )}

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
        左键拖动旋转 • 滚轮缩放 • 点击"添加人物"后双击放置 • 点击小人替换图片 • F全屏 • Ctrl+V粘贴截图
      </div>
    </div>
  )
}
