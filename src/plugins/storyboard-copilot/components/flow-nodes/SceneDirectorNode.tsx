import { memo, useCallback, useEffect, useState, useRef } from 'react'
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
  User,
  Users,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Shirt,
} from 'lucide-react'

import { canvasEvents } from '../../utils/canvasEvents'
import { useUpstreamData } from '../../hooks/useUpstreamData'
import { ImagePreviewDialog } from '@/components/media/ImagePreviewDialog'
import { Scene3DEditor } from '../three/Scene3DEditor'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useToast } from '@/hooks/useToast'
import { useUIStore } from '@/store/useUIStore'
import { saveMediaFile } from '@/utils/mediaStorage'
import { getImageUrl } from '@/utils/asset'
import { characterDB, outfitDB } from '@/db'
import type { Character, CharacterOutfit } from '@/types'
import type { CharacterPose } from '../../types'

import type {
  SceneDirectorNodeData,
  SceneCharacter,
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

const POSE_OPTIONS: { value: CharacterPose; label: string; icon: string }[] = [
  { value: 'front', label: '正面', icon: '👤' },
  { value: 'side', label: '侧面', icon: '→' },
  { value: 'back', label: '背面', icon: '🚶' },
  { value: '3/4', label: '3/4侧', icon: '↗' },
]

const LAYER_COLORS = {
  foreground: '#3b82f6',
  midground: '#10b981',
  background: '#f59e0b',
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
  const [characters, setCharacters] = useState<SceneCharacter[]>(data.characters || [])
  const [camera, setCamera] = useState<CameraConfig>(data.camera || DEFAULT_CAMERA)
  const [screenshots, setScreenshots] = useState<SceneScreenshot[]>(data.screenshots || [])
  const [showGrid, setShowGrid] = useState(data.showGrid ?? true)
  const gridSize = data.gridSize || 50
  const [screenshotRatio, setScreenshotRatio] = useState(data.screenshotRatio || '16:9')
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null)
  const [previewScreenshot, setPreviewScreenshot] = useState<SceneScreenshot | null>(null)
  const [show3DEditor, setShow3DEditor] = useState(false)
  const [is3DFullscreen, setIs3DFullscreen] = useState(false)
  
  // UI 状态
  const [showCharacterPanel, setShowCharacterPanel] = useState(true)
  const [showScreenshotPanel, setShowScreenshotPanel] = useState(true)
  const [projectCharacters, setProjectCharacters] = useState<Character[]>([])
  const [characterOutfits, setCharacterOutfits] = useState<Map<string, CharacterOutfit[]>>(new Map())
  const [outfitPickerCharId, setOutfitPickerCharId] = useState<string | null>(null)
  const [spatialPrompt, setSpatialPrompt] = useState('')
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false)
  const enlargedHandles = useEnlargedHandles(id)

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

  // 加载项目角色
  useEffect(() => {
    const loadProjectCharacters = async () => {
      if (!currentProjectId) return
      try {
        const chars = await characterDB.getByProject(currentProjectId)
        setProjectCharacters(chars)
        const outfitsMap = new Map<string, CharacterOutfit[]>()
        for (const char of chars) {
          const outfits = await outfitDB.getByCharacter(char.id)
          if (outfits.length > 0) {
            outfitsMap.set(char.id, outfits)
          }
        }
        setCharacterOutfits(outfitsMap)
      } catch (error) {
        console.error('加载角色失败:', error)
      }
    }
    loadProjectCharacters()
  }, [currentProjectId])

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFullscreen = !!document.fullscreenElement
      if (!isFullscreen && is3DFullscreen) {
        setTimeout(() => {
          updateNodeInternals(id)
        }, 350)
      }
    }
    
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [id, is3DFullscreen, updateNodeInternals])

  useEffect(() => {
    data.panoramaUrl = panoramaUrl
    data.characters = characters
    data.camera = camera
    data.screenshots = screenshots
    data.showGrid = showGrid
    data.gridSize = gridSize
    data.screenshotRatio = screenshotRatio
  }, [panoramaUrl, characters, camera, screenshots, showGrid, gridSize, screenshotRatio, data])

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
        console.error('上传失败:', error)
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

  const handleAddCharacterFromProject = useCallback(
    (projectChar: Character, outfit?: CharacterOutfit) => {
      const newCharacter: SceneCharacter = {
        id: `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: outfit ? `${projectChar.name}(${outfit.name})` : projectChar.name,
        imageUrl: outfit?.image || projectChar.image || '',
        position: { x: 0, y: 0, z: 0 },
        rotation: 0,
        scale: 1,
        layer: 'midground',
        pose: 'front',
      }

      setCharacters((prev) => [...prev, newCharacter])
      setSelectedCharacterId(newCharacter.id)
      setOutfitPickerCharId(null)
      toast({ title: '人物已添加', description: '拖动调整位置，点击图片可替换' })
    },
    [toast]
  )

  const handleCharacterUpdate = useCallback(
    (characterId: string, updates: Partial<SceneCharacter>) => {
      setCharacters((prev) =>
        prev.map((char) => (char.id === characterId ? { ...char, ...updates } : char))
      )
    },
    []
  )

  const handleDeleteCharacter = useCallback(
    (characterId: string) => {
      setCharacters((prev) => prev.filter((char) => char.id !== characterId))
      if (selectedCharacterId === characterId) {
        setSelectedCharacterId(null)
      }
      toast({ title: '人物已删除' })
    },
    [selectedCharacterId, toast]
  )

  const handleGenerateSpatialPrompt = useCallback(async () => {
    if (characters.length === 0) {
      toast({ title: '请先添加角色', variant: 'destructive' })
      return
    }

    setIsGeneratingPrompt(true)
    try {
      // 构建空间描述
      const characterDescs = characters.map(char => {
        const poseLabel = POSE_OPTIONS.find(p => p.value === char.pose)?.label || '正面'
        const layerLabel = char.layer === 'foreground' ? '前景' : char.layer === 'midground' ? '中景' : '背景'
        return `${char.name}(${poseLabel}姿态，${layerLabel}，位置${char.position.x.toFixed(1)},${char.position.z?.toFixed(1) || '0'})`
      }).join('，')

      const prompt = `场景构图：${characterDescs}。相机FOV ${camera.fov}度，${showGrid ? '显示网格辅助线' : '无网格'}。`
      
      setSpatialPrompt(prompt)
      
      // 复制到剪贴板
      await navigator.clipboard.writeText(prompt)
      toast({ title: '空间描述已生成并复制', description: prompt.slice(0, 50) + '...' })
    } catch (error) {
      toast({ title: '生成失败', description: String(error), variant: 'destructive' })
    } finally {
      setIsGeneratingPrompt(false)
    }
  }, [characters, camera, showGrid, toast])

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

  const _handleResetCamera = useCallback(() => {
    setCamera(DEFAULT_CAMERA)
    toast({ title: '相机已重置' })
  }, [toast])



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

  const _selectedCharacter = characters.find((c) => c.id === selectedCharacterId)

  return (
    <TooltipProvider>
      <div className={getNodeContainerClass(!!selected, 'flex h-full flex-col')} style={{ width: 900, height: 600 }}>
        <Handle type="target" position={Position.Left} id="target" isConnectable={true} className={getTargetHandleClass(undefined, enlargedHandles.target)} />
        <Handle type="source" position={Position.Right} id="source" isConnectable={true} className={getSourceHandleClass(undefined, enlargedHandles.source)} />

        <div className={NODE_HEADER_FLOATING_CLASS}>
          <div className={NODE_HEADER_CLASSES.container}>
            <div className={NODE_HEADER_CLASSES.title}>
              <Clapperboard className={NODE_HEADER_CLASSES.icon} />
              <span>场景编排</span>
            </div>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => setShow3DEditor(!show3DEditor)}
                  >
                    {show3DEditor ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{show3DEditor ? '返回全景' : '3D场景'}</p>
                </TooltipContent>
              </Tooltip>
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
            {show3DEditor ? (
              <Scene3DEditor
                backgroundImage={panoramaUrl || undefined}
                characters={characters.map(c => ({
                  id: c.id,
                  position: { x: c.position.x, y: c.position.y || 0, z: c.position.z || 0 },
                  rotation: { x: 0, y: c.rotation, z: 0 },
                  scale: c.scale,
                  color: LAYER_COLORS[c.layer],
                  name: c.name,
                }))}
                onCharactersChange={(newCharacters) => {
                  setCharacters(newCharacters.map(c => ({
                    id: c.id,
                    name: c.name,
                    imageUrl: characters.find(oc => oc.id === c.id)?.imageUrl || '',
                    position: c.position,
                    rotation: c.rotation.y,
                    scale: c.scale,
                    layer: c.color === '#3b82f6' ? 'foreground' : c.color === '#10b981' ? 'midground' : 'background',
                    pose: characters.find(oc => oc.id === c.id)?.pose || 'front',
                  })))
                }}
                onScreenshot={(dataUrl) => {
                  handleScreenshot({
                    id: `screenshot_${Date.now()}`,
                    dataUrl,
                    camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: 75 },
                    timestamp: Date.now(),
                  })
                }}
                selectedCharacterId={selectedCharacterId}
                onSelectCharacter={setSelectedCharacterId}
                onFullscreenChange={setIs3DFullscreen}
                screenshotRatio={screenshotRatio}
              />
            ) : panoramaUrl ? (
            <PanoramaViewer
              panoramaUrl={panoramaUrl}
              characters={characters}
              camera={camera}
              showGrid={showGrid}
              gridSize={gridSize}
              onCameraChange={setCamera}
              onScreenshot={handleScreenshot}
              selectedCharacterId={selectedCharacterId}
              onCharacterSelect={setSelectedCharacterId}
              onCharacterUpdate={handleCharacterUpdate}
              onGridToggle={() => setShowGrid(!showGrid)}
              screenshotRatio={screenshotRatio}
              onReupload={() => fileInputRef.current?.click()}
              onAddCharacter={(newChar) => {
                setCharacters(prev => [...prev, newChar])
                setSelectedCharacterId(newChar.id)
              }}
              onDeleteCharacter={handleDeleteCharacter}
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
          {!is3DFullscreen && (
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

              {/* 空间描述生成 */}
              <div className="border-b p-3">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-[11px] font-medium">空间描述</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] gap-1"
                    onClick={handleGenerateSpatialPrompt}
                    disabled={isGeneratingPrompt || characters.length === 0}
                  >
                    <Sparkles className="h-3 w-3" />
                    生成
                  </Button>
                </div>
                {spatialPrompt && (
                  <div className="text-[10px] text-muted-foreground bg-muted/50 p-2 rounded max-h-20 overflow-y-auto">
                    {spatialPrompt}
                  </div>
                )}
              </div>

              {/* 角色列表面板 */}
              <div className="border-b">
                <button
                  className="flex w-full items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                  onClick={() => setShowCharacterPanel(!showCharacterPanel)}
                >
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <Label className="text-[11px] font-medium cursor-pointer">角色列表 ({characters.length})</Label>
                  </div>
                  {showCharacterPanel ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                
                {showCharacterPanel && (
                  <div className="px-3 pb-3 space-y-3">
                    {/* 快速添加提示 */}
                    <div className="text-[10px] text-muted-foreground bg-muted/30 p-2 rounded">
                      💡 点击画布上的"添加人物"按钮，然后在全景图上点击放置
                    </div>

                    {/* 项目角色库 - 快速添加带图角色 */}
                    {projectCharacters.length > 0 && (
                      <div>
                        <Label className="text-[10px] text-muted-foreground mb-1.5 block">快速添加（带图片）</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {projectCharacters.slice(0, 8).map((char) => {
                            const hasOutfits = (characterOutfits.get(char.id) || []).length > 0
                            return (
                              <div key={char.id} className="relative">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      className={cn(
                                        "w-9 h-9 rounded border-2 border-transparent hover:border-primary transition-colors overflow-hidden bg-muted",
                                        hasOutfits && "ring-1 ring-blue-400/50"
                                      )}
                                      onClick={() => {
                                        if (hasOutfits) {
                                          setOutfitPickerCharId(outfitPickerCharId === char.id ? null : char.id)
                                        } else {
                                          handleAddCharacterFromProject(char)
                                        }
                                      }}
                                    >
                                      {char.image ? (
                                        <img src={getImageUrl(char.image) || ''} alt={char.name} className="w-full h-full object-cover" />
                                      ) : (
                                        <User className="w-4 h-4 m-2 text-muted-foreground" />
                                      )}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{char.name}{hasOutfits ? ' (有服装)' : ''}</p>
                                  </TooltipContent>
                                </Tooltip>
                                {outfitPickerCharId === char.id && hasOutfits && (
                                  <div className="absolute top-full left-0 mt-1 z-50 bg-popover border rounded-lg shadow-lg p-2 min-w-[140px]">
                                    <button
                                      className="w-full text-left px-2 py-1.5 text-[11px] hover:bg-muted rounded flex items-center gap-2"
                                      onClick={() => handleAddCharacterFromProject(char)}
                                    >
                                      <div className="w-5 h-5 rounded bg-muted overflow-hidden shrink-0">
                                        {char.image ? (
                                          <img src={getImageUrl(char.image) || ''} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                          <User className="w-3 h-3 m-1 text-muted-foreground" />
                                        )}
                                      </div>
                                      默认造型
                                    </button>
                                    {(characterOutfits.get(char.id) || []).map(outfit => (
                                      <button
                                        key={outfit.id}
                                        className="w-full text-left px-2 py-1.5 text-[11px] hover:bg-muted rounded flex items-center gap-2"
                                        onClick={() => handleAddCharacterFromProject(char, outfit)}
                                      >
                                        <div className="w-5 h-5 rounded bg-muted overflow-hidden shrink-0">
                                          {outfit.image ? (
                                            <img src={getImageUrl(outfit.image) || ''} alt="" className="w-full h-full object-cover" />
                                          ) : (
                                            <Shirt className="w-3 h-3 m-1 text-muted-foreground" />
                                          )}
                                        </div>
                                        {outfit.name}
                                        {outfit.is_default && <span className="text-yellow-500 text-[9px]">★</span>}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* 场景中的角色 */}
                    {characters.length > 0 && (
                      <div>
                        <Label className="text-[10px] text-muted-foreground mb-1.5 block">场景中的人物</Label>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {characters.map((char, index) => (
                            <div
                              key={char.id}
                              className={`flex items-center gap-2 p-2 rounded border text-[11px] cursor-pointer transition-colors ${
                                selectedCharacterId === char.id 
                                  ? 'border-primary bg-primary/5' 
                                  : 'border-border hover:border-muted-foreground'
                              }`}
                              onClick={() => setSelectedCharacterId(char.id === selectedCharacterId ? null : char.id)}
                            >
                              {/* 序号/头像 */}
                              <div 
                                className="w-7 h-7 rounded flex items-center justify-center text-[10px] text-white shrink-0 overflow-hidden"
                                style={{ backgroundColor: char.imageUrl ? 'transparent' : LAYER_COLORS[char.layer] }}
                              >
                                {char.imageUrl ? (
                                  <img src={getImageUrl(char.imageUrl) || ''} alt={char.name} className="w-full h-full object-cover" />
                                ) : (
                                  index + 1
                                )}
                              </div>
                              
                              {/* 信息 */}
                              <div className="flex-1 min-w-0">
                                <div className="truncate font-medium">{char.name}</div>
                                <div className="text-[9px] text-muted-foreground">
                                  {POSE_OPTIONS.find(p => p.value === char.pose)?.label} • {char.layer === 'foreground' ? '前景' : char.layer === 'midground' ? '中景' : '背景'}
                                </div>
                              </div>
                              
                              {/* 删除 */}
                              <button
                                className="text-muted-foreground hover:text-destructive p-1"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteCharacter(char.id)
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {characters.length === 0 && (
                      <div className="text-center py-4 text-[11px] text-muted-foreground">
                        暂无角色，点击"添加人物"开始布置
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 截图列表 */}
              <div className="flex-1 overflow-hidden flex flex-col">
                <button
                  className="flex w-full items-center justify-between p-3 hover:bg-muted/50 transition-colors border-b"
                  onClick={() => setShowScreenshotPanel(!showScreenshotPanel)}
                >
                  <div className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    <Label className="text-[11px] font-medium cursor-pointer">截图列表 ({screenshots.length})</Label>
                  </div>
                  {showScreenshotPanel ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                
                {showScreenshotPanel && (
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
                )}
              </div>
            </div>
          )}
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
    </TooltipProvider>
  )
})

SceneDirectorNode.displayName = 'SceneDirectorNode'
