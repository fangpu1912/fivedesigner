import { useState, useRef, useEffect, useCallback, useMemo } from 'react'

import {
  ImageIcon,
  Plus,
  Sparkles,
  Play,
  Settings2,
  Layers,
  Check,
  Loader2,
  X,
  Wand2,
  Sliders,
  ImagePlus,
  History,
  Video,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

import {
  VendorModelSelector,
  ComfyUIParamsPanel,
  type ComfyUIParams,
  applyParamsToWorkflow,
} from '@/components/ai'
import { ReferenceImageInput, type ReferenceItem } from '@/components/ai/ReferenceImageInput'
import { AssetCreateDialog, type AssetCreateCategory, type AssetCreateData } from '@/components/asset/AssetCreateDialog'
import { ImagePreviewDialog } from '@/components/media/ImagePreviewDialog'
import { VideoPlayer } from '@/components/media/VideoPlayer'
import { BatchGenerationPanel } from '@/components/storyboard/BatchGenerationPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MentionInput, type MentionInputRef } from '@/components/ai/MentionInput'
import type { MentionData } from '@/types/mention'
import { Textarea } from '@/components/ui/textarea'
import { characterDB, sceneDB, propDB, storyboardDB } from '@/db'
import {
  useCharactersByEpisode,
  useCharacterMutations,
  useScenesByEpisode,
  useSceneMutations,
  usePropsByEpisode,
  usePropMutations,
} from '@/hooks/useAssetManager'
import { useEpisodesQuery } from '@/hooks/useEpisodes'
import {
  useImageGeneration,
  useVideoGeneration,
} from '@/hooks/useVendorGeneration'
import { usePersistentUIState } from '@/hooks/usePersistentUIState'
import { useReferenceMentionItems } from '@/hooks/useReferenceMentionItems'
import { useProjectQuery } from '@/hooks/useProjects'
import { useStoryboards, useStoryboardMutations, storyboardKeys } from '@/hooks/useStoryboards'
import { useToast } from '@/hooks/useToast'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { ComfyUIClient } from '@/services/comfyui/ComfyUIClient'
import {
  extractComfyUIMediaOutputs,
  pollComfyUIHistoryUntilDone,
} from '@/services/comfyui/resultUtils'
import { getComfyUIServerUrl } from '@/services/configService'
import { getWorkflowConfigs } from '@/services/workflowConfigService'
import { useUIStore } from '@/store/useUIStore'
import type { WorkflowConfig } from '@/types'
import type { GenerationResult } from '@/types/generation'
import { getImageUrl } from '@/utils/asset'
import { readFile } from '@tauri-apps/plugin-fs'
import { vendorConfigService } from '@/services/vendor'
import type { VendorConfig, VideoModel } from '@/services/vendor'

type GenerationType = 'image' | 'video'
type TabType = 'storyboard' | 'character' | 'scene' | 'prop'
type ViewMode = 'single' | 'batch' | 'generate'
type MainViewMode = 'preview' | 'list' | 'grid'
type GenerationMode = 'ai' | 'comfyui'

interface GenerationParams {
  prompt: string
  aspectRatio?: string
  duration?: number
  resolution?: string
  audio?: boolean
  width?: number
  height?: number
  seed?: number
  randomSeed?: boolean
  resolutionScale?: number
}

const DEFAULT_IMAGE_PARAMS: GenerationParams = {
  prompt: '',
  aspectRatio: '16:9',
  width: 1024,
  height: 576,
  seed: -1,
  randomSeed: false,
}

const DEFAULT_VIDEO_PARAMS: GenerationParams = {
  prompt: '',
  aspectRatio: '9:16',
  duration: 8,
  resolution: '720p',
  audio: true,
  width: 720,
  height: 1280,
  seed: -1,
  randomSeed: false,
}

export function StoryboardDraw() {
  const { currentProjectId, currentEpisodeId } = useUIStore()
  const { data: storyboards = [], isLoading: isLoadingStoryboards } = useStoryboards(
    currentEpisodeId || ''
  )
  const { data: episodes = [] } = useEpisodesQuery(currentProjectId || '')
  const { data: currentProject } = useProjectQuery(currentProjectId || '')
  const { data: characters = [] } = useCharactersByEpisode(currentEpisodeId || '')
  const { data: scenes = [] } = useScenesByEpisode(currentEpisodeId || '')
  const { data: props = [] } = usePropsByEpisode(currentEpisodeId || '')
  const {
    createStoryboardAsync,
    updateStoryboardAsync,
  } = useStoryboardMutations()
  const characterMutations = useCharacterMutations()
  const sceneMutations = useSceneMutations()
  const propMutations = usePropMutations()
  const imageGeneration = useImageGeneration()
  const videoGeneration = useVideoGeneration()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const updateLinkedAsset = useCallback(
    async (type: 'character' | 'scene' | 'prop', id: string, data: Record<string, unknown>) => {
      if (type === 'character') {
        await characterMutations.update.mutateAsync({ id, data })
      } else if (type === 'scene') {
        await sceneMutations.update.mutateAsync({ id, data })
      } else if (type === 'prop') {
        await propMutations.update.mutateAsync({ id, data })
      }
    },
    [characterMutations, sceneMutations, propMutations]
  )

  const createLinkedAsset = useCallback(
    async (type: 'character' | 'scene' | 'prop', data: Record<string, unknown>) => {
      if (type === 'character') {
        return characterMutations.create.mutateAsync(data as any)
      } else if (type === 'scene') {
        return sceneMutations.create.mutateAsync(data as any)
      } else {
        return propMutations.create.mutateAsync(data as any)
      }
    },
    [characterMutations, sceneMutations, propMutations]
  )

  // 核心状态：生成类型（图片/视频）- 必须在 useTaskQueue 之前定义
  const [generationType, setGenerationType] = usePersistentUIState<GenerationType>(
    'generationPage.type',
    'image'
  )

  // Tab and view states
  const [activeTab, setActiveTab] = usePersistentUIState<TabType>(
    'generationPage.activeTab',
    'storyboard'
  )
  const [viewMode, setViewMode] = usePersistentUIState<ViewMode>(
    'generationPage.viewMode',
    'single'
  )
  const [mainViewMode, setMainViewMode] = usePersistentUIState<MainViewMode>(
    'generationPage.mainViewMode',
    'preview'
  )

  // Selection states - 持久化到 localStorage
  const [selectedIds, setSelectedIds] = usePersistentUIState<string[]>(
    'generationPage.selectedIds',
    []
  )
  const [activeItemId, setActiveItemId] = usePersistentUIState<string | null>(
    'generationPage.activeItemId',
    null
  )

  // Form states
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [localPrompt, setLocalPrompt] = useState('')
  const [localVideoPrompt, setLocalVideoPrompt] = useState('')
  const [localNegativePrompt, setLocalNegativePrompt] = useState('')
  const [localLastFrame, setLocalLastFrame] = useState<string | undefined>(undefined)
  const [localReferenceImages, setLocalReferenceImages] = useState<string[]>([])
  const [_localVideoReferenceImages, setLocalVideoReferenceImages] = useState<string[]>([])
  const [selectedReferenceItems, setSelectedReferenceItems] = useState<ReferenceItem[]>([])
  const [linkedAssets, setLinkedAssets] = useState<Array<{
    id: string
    type: 'character' | 'scene' | 'prop'
    name: string
    image?: string
    color: string
  }>>([])
  const [localEditPrompt, setLocalEditPrompt] = useState('')
  const [isNegativePromptExpanded, setIsNegativePromptExpanded] = useState(false)

  const promptInputRef = useRef<MentionInputRef>(null)
  const editPromptInputRef = useRef<MentionInputRef>(null)
  const [promptMentions, setPromptMentions] = useState<MentionData[]>([])
  const [editPromptMentions, setEditPromptMentions] = useState<MentionData[]>([])

  // AI generation states
  const [selectedModelId, setSelectedModelId] = usePersistentUIState<string>(
    'generationPage.modelId',
    ''
  )
  const [selectedConfigId, setSelectedConfigId] = usePersistentUIState<string>(
    'generationPage.configId',
    ''
  )
  const [modelParams, setModelParams] = usePersistentUIState<GenerationParams>(
    'generationPage.params',
    generationType === 'video' ? DEFAULT_VIDEO_PARAMS : DEFAULT_IMAGE_PARAMS
  )
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)
  const [previewVideo, setPreviewVideo] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const isGeneratingRef = useRef(false) // 防止重复点击

  // ComfyUI states
  const [comfyuiWorkflows, setComfyuiWorkflows] = useState<WorkflowConfig[]>([])
  const [selectedWorkflowId, setSelectedWorkflowId] = usePersistentUIState<string>(
    'generationPage.workflowId',
    ''
  )
  const [comfyuiConnected, setComfyuiConnected] = useState(false)
  const [comfyUIParams, setComfyUIParams] = usePersistentUIState<ComfyUIParams>(
    'generationPage.comfyUIParams',
    {}
  )
  const getComfyUIParamsRef = useRef<(() => ComfyUIParams) | null>(null)
  const comfyuiClientRef = useRef<ComfyUIClient | null>(null)
  const [generationMode, setGenerationMode] = usePersistentUIState<GenerationMode>(
    'generationPage.mode',
    'ai'
  )
  const [isParamPanelCollapsed, setIsParamPanelCollapsed] = usePersistentUIState<boolean>(
    'generationPage.paramCollapsed',
    false
  )

  // 供应商配置（用于获取模型可用参数）
  const [vendors, setVendors] = useState<VendorConfig[]>([])

  useEffect(() => {
    vendorConfigService.initialize().then(() => {
      vendorConfigService.getAllVendors().then(allVendors => {
        setVendors(allVendors.filter(v => v.enable))
      })
    })
  }, [])

  // 根据当前选择的模型获取模型配置
  const currentModelConfig = useMemo(() => {
    if (!selectedModelId) return null
    const [vendorId, modelName] = selectedModelId.split(':')
    if (!vendorId || !modelName) return null
    const vendor = vendors.find(v => v.id === vendorId)
    if (!vendor) return null
    const model = vendor.models.find(m => m.modelName === modelName && m.type === 'video')
    return model as VideoModel | undefined
  }, [selectedModelId, vendors])

  // 获取可用的时长列表
  const availableDurations = useMemo(() => {
    if (!currentModelConfig?.durationResolutionMap) return [5, 8, 10, 12, 15]
    const durations = new Set<number>()
    for (const map of currentModelConfig.durationResolutionMap) {
      for (const d of map.duration) {
        durations.add(d)
      }
    }
    return Array.from(durations).sort((a, b) => a - b)
  }, [currentModelConfig])

  // 获取可用的分辨率列表
  const availableResolutions = useMemo(() => {
    if (!currentModelConfig?.durationResolutionMap) return ['720p']
    const resolutions = new Set<string>()
    for (const map of currentModelConfig.durationResolutionMap) {
      for (const r of map.resolution) {
        resolutions.add(r)
      }
    }
    return Array.from(resolutions)
  }, [currentModelConfig])

  // Asset data - now using React Query (useCharactersByEpisode, useScenesByEpisode, usePropsByEpisode)
  const [isLoadingAssets, _setIsLoadingAssets] = useState(false)

  // Preview dialog
  const [previewImages, setPreviewImages] = useState<string[]>([])
  const [previewCurrentIndex, setPreviewCurrentIndex] = useState(0)
  const [showPreviewDialog, setShowPreviewDialog] = useState(false)

  // Image history (per item) - 持久化到 localStorage
  const [imageHistoryMap, setImageHistoryMap] = usePersistentUIState<Record<string, string[]>>(
    'generationPage.imageHistory',
    {}
  )

  // Video history (per item) - 持久化到 localStorage
  const [videoHistoryMap, setVideoHistoryMap] = usePersistentUIState<Record<string, string[]>>(
    'generationPage.videoHistory',
    {}
  )

  // Derived state
  const currentItems = useMemo(() => {
    switch (activeTab) {
      case 'storyboard':
        return storyboards
      case 'character':
        return characters
      case 'scene':
        return scenes
      case 'prop':
        return props
      default:
        return []
    }
  }, [activeTab, storyboards, characters, scenes, props])

  const activeItem = useMemo(() => {
    if (!activeItemId) return null
    return currentItems.find(item => item.id === activeItemId) || null
  }, [activeItemId, currentItems])

  const { search: referenceSearch } = useReferenceMentionItems(
    selectedReferenceItems,
  )

  // 刷新数据函数（替代整页刷新）- 放在这里避免提前引用
  const refreshData = useCallback(async () => {
    // 刷新当前剧集的分镜数据
    if (currentEpisodeId) {
      await queryClient.invalidateQueries({ queryKey: storyboardKeys.list(currentEpisodeId) })
      await queryClient.invalidateQueries({ queryKey: ['characters', 'episode', currentEpisodeId] })
      await queryClient.invalidateQueries({ queryKey: ['scenes', 'episode', currentEpisodeId] })
      await queryClient.invalidateQueries({ queryKey: ['props', 'episode', currentEpisodeId] })
    }
    
    if (activeItemId && activeTab) {
      let refreshedItem = null
      if (activeTab === 'storyboard') {
        refreshedItem = await storyboardDB.getById(activeItemId)
      } else if (activeTab === 'character') {
        refreshedItem = await characterDB.getById(activeItemId)
      } else if (activeTab === 'scene') {
        refreshedItem = await sceneDB.getById(activeItemId)
      } else if (activeTab === 'prop') {
        refreshedItem = await propDB.getById(activeItemId)
      }
      
      if (refreshedItem?.image) {
        // 更新生成结果显示
        setGeneratedImage(refreshedItem.image)
        console.log('[GenerationPage] 已更新生成结果:', refreshedItem.image)
      }
    }
    
    console.log('[GenerationPage] 数据已刷新')
  }, [queryClient, currentEpisodeId, activeItemId, activeTab])

  const selectedWorkflow = useMemo(
    () => comfyuiWorkflows.find(w => w.id === selectedWorkflowId) || null,
    [comfyuiWorkflows, selectedWorkflowId]
  )

  // Get tab label in Chinese
  const getTabLabel = useCallback(
    (tab?: TabType) => {
      const t = tab || activeTab
      switch (t) {
        case 'storyboard':
          return '分镜'
        case 'character':
          return '角色'
        case 'scene':
          return '场景'
        case 'prop':
          return '道具'
        default:
          return '项目'
      }
    },
    [activeTab]
  )

  // Load assets when episode changes
  useEffect(() => {
    if (!currentEpisodeId) return
    // React Query will automatically refetch data when currentEpisodeId changes
  }, [currentEpisodeId, currentProjectId])

  // Validate activeItemId when currentItems changes (e.g., tab switch or data reload)
  useEffect(() => {
    if (activeItemId && !currentItems.find(item => item.id === activeItemId)) {
      // Active item no longer exists in current items, clear selection
      setActiveItemId(null)
    }
    // Filter out selected IDs that no longer exist in current items
    const validSelectedIds = selectedIds.filter(id => currentItems.some(item => item.id === id))
    if (validSelectedIds.length !== selectedIds.length) {
      setSelectedIds(validSelectedIds)
    }
  }, [activeItemId, currentItems, setActiveItemId, selectedIds, setSelectedIds])

  // Load ComfyUI workflows
  useEffect(() => {
    try {
      setComfyuiWorkflows(getWorkflowConfigs())
    } catch (error) {
      console.error('加载 ComfyUI 工作流失败:', error)
    }
  }, [])

  // Init ComfyUI client
  const initComfyUIClient = async () => {
    try {
      if (comfyuiClientRef.current?.isConnected()) {
        setComfyuiConnected(true)
        return
      }
      const client = new ComfyUIClient({ serverUrl: getComfyUIServerUrl() })
      const connectPromise = client.connect()
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('连接超时')), 5000)
      )
      await Promise.race([connectPromise, timeoutPromise])
      client.setContext(currentProjectId ?? undefined, currentEpisodeId ?? undefined)
      comfyuiClientRef.current = client
      setComfyuiConnected(true)
    } catch (error) {
      console.error('连接 ComfyUI 失败:', error)
      setComfyuiConnected(false)
    }
  }

  const getMentionImageUrls = (mentions: MentionData[]): string[] => {
    return mentions
      .filter(m => m.imageUrl)
      .map(m => m.imageUrl!)
  }

  // Connect to ComfyUI when mode changes
  useEffect(() => {
    if (generationMode !== 'comfyui') return
    initComfyUIClient()
  }, [generationMode])

  // Update ComfyUI context when project/episode changes
  useEffect(() => {
    if (comfyuiClientRef.current && currentProjectId && currentEpisodeId) {
      comfyuiClientRef.current.setContext(currentProjectId, currentEpisodeId)
    }
  }, [currentProjectId, currentEpisodeId])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      comfyuiClientRef.current?.disconnect()
      comfyuiClientRef.current = null
    }
  }, [])

  // Track previous active item ID and generation type to detect real changes
  const prevActiveItemIdRef = useRef<string | null>(null)
  const prevGenerationTypeRef = useRef<GenerationType>(generationType)

  // Update edit state when active item or generation type changes
  useEffect(() => {
    const currentId = activeItem?.id || null
    const isItemChanged = prevActiveItemIdRef.current !== currentId
    const isTypeChanged = prevGenerationTypeRef.current !== generationType
    prevActiveItemIdRef.current = currentId
    prevGenerationTypeRef.current = generationType

    if (!activeItem) {
      // 清空本地状态
      setLocalPrompt('')
      setLocalVideoPrompt('')
      setLocalNegativePrompt('')
      setLocalReferenceImages([])
      setLocalVideoReferenceImages([])
      setLocalLastFrame(undefined)
      setGeneratedImage(null)
      setPreviewVideo(null)
      return
    }

    const item = activeItem as any

    // 当项目变化或生成类型变化时，更新提示词和参考图
    if (isItemChanged || isTypeChanged) {
      // 根据生成类型加载对应的提示词
      const prompt = item.prompt || ''
      const videoPrompt = item.video_prompt || ''
      // 🔑 加载参考图 - 根据生成类型选择不同的字段
      const savedRefImages = generationType === 'video' 
        ? (item.video_reference_images || []) 
        : (item.reference_images || [])
      const savedVideoRefImages = item.video_reference_images || []
      
      console.log('[GenerationPage] useEffect 更新本地状态:', {
        isItemChanged,
        isTypeChanged,
        generationType,
        itemId: item.id,
        savedRefImages,
        savedVideoRefImages,
        itemReferenceImages: item.reference_images,
        itemVideoReferenceImages: item.video_reference_images
      })

      // 简化：直接设置本地状态
      setLocalPrompt(prompt)
      setLocalVideoPrompt(videoPrompt)
      setLocalNegativePrompt(item.negative_prompt || '')
      setLocalReferenceImages(savedRefImages)
      setLocalVideoReferenceImages(savedVideoRefImages)
    }

    // Only reset preview when item actually changes (not when data updates)
    if (isItemChanged) {
      if (generationType === 'video') {
        setPreviewVideo(item.video || null)
      } else {
        setGeneratedImage(item.image || null)
      }

      // 加载参考图映射（从分镜的 character_ids, prop_ids, scene_id）
      if (activeTab === 'storyboard' && item) {
        const storyboard = item as any
        console.log('[GenerationPage] 加载分镜关联资产:', {
          storyboardId: storyboard.id,
          character_ids: storyboard.character_ids,
          prop_ids: storyboard.prop_ids,
          scene_id: storyboard.scene_id,
          characters: characters.length,
          scenes: scenes.length,
          props: props.length,
        })

        // 收集关联资产信息（包含占位符）
        const linkedAssets: Array<{
          id: string
          type: 'character' | 'scene' | 'prop'
          name: string
          image?: string
          color: string
        }> = []

        // 获取角色（从 character_ids）
        const characterIds = storyboard.character_ids || []
        for (const charId of characterIds) {
          const char = characters.find((c: any) => c.id === charId)
          if (char) {
            linkedAssets.push({
              id: char.id,
              type: 'character',
              name: char.name,
              image: char.image,
              color: 'bg-blue-500',
            })
          }
        }

        // 获取场景（从 scene_id）
        const sceneId = storyboard.scene_id
        if (sceneId) {
          const scene = scenes.find((s: any) => s.id === sceneId)
          if (scene) {
            linkedAssets.push({
              id: scene.id,
              type: 'scene',
              name: scene.name,
              image: scene.image,
              color: 'bg-green-500',
            })
          }
        }

        // 获取道具（从 prop_ids）
        const propIds = storyboard.prop_ids || []
        for (const propId of propIds) {
          const prop = props.find((p: any) => p.id === propId)
          if (prop) {
            linkedAssets.push({
              id: prop.id,
              type: 'prop',
              name: prop.name,
              image: prop.image,
              color: 'bg-orange-500',
            })
          }
        }

        console.log('[GenerationPage] 关联资产:', linkedAssets)

        // 保存关联资产到 state（用于显示首字图标）
        setLinkedAssets(linkedAssets)

        const linkedImages = linkedAssets.filter(a => a.image).map(a => a.image!)
        const savedImages = generationType === 'video'
          ? ((item as any).video_reference_images || [])
          : ((item as any).reference_images || [])
        const mainImage = (item as any).image
        const mergedImages = [...new Set([...linkedImages, ...savedImages])].filter(img => img !== mainImage)
        console.log('[GenerationPage] 合并参考图:', { 
          generationType, 
          linkedImages, 
          savedImages, 
          mergedImages,
          imageRefImages: (item as any).reference_images,
          videoRefImages: (item as any).video_reference_images
        })
        setLocalReferenceImages(mergedImages)
      }
    }
  }, [activeItem?.id, generationType, activeTab, characters, scenes, props])

  // 简化：移除自动保存逻辑，改为手动保存

  // Update params when generation type changes (only if not already set)
  useEffect(() => {
    // 检查当前参数是否匹配当前生成类型
    const isVideoParams = (modelParams as any).duration !== undefined
    const shouldBeVideo = generationType === 'video'

    // 如果类型不匹配，重置为默认参数
    if (isVideoParams !== shouldBeVideo) {
      setModelParams(shouldBeVideo ? DEFAULT_VIDEO_PARAMS : DEFAULT_IMAGE_PARAMS)
    }
  }, [generationType, modelParams, setModelParams])

  // Get current displayed image
  const getCurrentDisplayImage = (): string | null => {
    if (generationType === 'image') {
      return generatedImage || (activeItem ? (activeItem as any).image : null)
    }
    return null
  }

  // Add image to history
  const addImageToHistory = useCallback(
    (imageUrl: string) => {
      if (!activeItemId) return
      setImageHistoryMap(prev => {
        const history = prev[activeItemId] || []
        if (history.includes(imageUrl)) return prev // Avoid duplicates
        return {
          ...prev,
          [activeItemId]: [...history, imageUrl].slice(-20), // Keep last 20
        }
      })
    },
    [activeItemId]
  )

  // Add video to history
  const addVideoToHistory = useCallback(
    (videoUrl: string) => {
      if (!activeItemId) return
      setVideoHistoryMap(prev => {
        const history = prev[activeItemId] || []
        if (history.includes(videoUrl)) return prev // Avoid duplicates
        return {
          ...prev,
          [activeItemId]: [...history, videoUrl].slice(-20), // Keep last 20
        }
      })
    },
    [activeItemId]
  )

  // Handle vendor model change
  const handleVendorModelChange = useCallback(
    (vendorId: string, _modelName: string, fullValue: string) => {
      setSelectedConfigId(vendorId)
      setSelectedModelId(fullValue)
      // 切换模型时，自动调整时长和分辨率为可用值
      const [vId, mName] = fullValue.split(':')
      if (vId && mName) {
        const vendor = vendors.find(v => v.id === vId)
        const modelConfig = vendor?.models.find(m => m.modelName === mName && m.type === 'video') as VideoModel | undefined
        if (modelConfig?.durationResolutionMap) {
          const durations = new Set<number>()
          const resolutions = new Set<string>()
          for (const map of modelConfig.durationResolutionMap) {
            for (const d of map.duration) durations.add(d)
            for (const r of map.resolution) resolutions.add(r)
          }
          const availDurations = Array.from(durations).sort((a, b) => a - b)
          const availResolutions = Array.from(resolutions)
          setModelParams(prev => ({
            ...prev,
            duration: availDurations.includes(prev.duration || 0) ? prev.duration : availDurations[0],
            resolution: availResolutions.includes(prev.resolution || '') ? prev.resolution : availResolutions[0],
          }))
        }
      }
    },
    [vendors]
  )

  // Generate single item (AI mode)
  const handleGenerateSingle = useCallback(async () => {
    // 防止重复点击
    if (isGeneratingRef.current) {
      console.log('[StoryboardDraw] 正在生成中，忽略重复点击')
      return
    }
    
    if (!activeItem || !currentProjectId) return

    isGeneratingRef.current = true
    setIsGenerating(true)

    // 根据生成类型使用对应的提示词
    const prompt = (generationType === 'video' ? localVideoPrompt : localPrompt).trim()
    if (!prompt) {
      toast({ title: '错误', description: `请输入${generationType === 'video' ? '视频' : '图片'}提示词`, variant: 'destructive' })
      setIsGenerating(false)
      isGeneratingRef.current = false
      return
    }

    const mentionedImages = getMentionImageUrls(promptMentions)

    try {
      let result: string

      if (generationType === 'video') {
        // 视频生成逻辑：
        // - 有分镜图+尾帧：首尾帧生视频
        // - 有分镜图无尾帧：图生视频
        // - 无分镜图但有参考图：多图参考生视频（用第一张参考图作为首帧）
        // - 无分镜图无参考图：文生视频
        
        const storyboardImage = (activeItem as any)?.image
        const hasReferenceImages = localReferenceImages?.length > 0
        
        // 确定首帧：分镜图 > 参考图第一张
        const firstFrame = storyboardImage || (hasReferenceImages ? localReferenceImages[0] : undefined)
        // 尾帧
        const lastFrame = localLastFrame || undefined
        // 其他参考图（除首帧外的）+ @提及的图片（去重）
        const otherLocalRefs = hasReferenceImages 
          ? localReferenceImages.filter((img: string) => img !== firstFrame)
          : []
        const uniqueMentionedImages = mentionedImages.filter(url => !otherLocalRefs.includes(url) && url !== firstFrame)
        const otherReferenceImages = [...otherLocalRefs, ...uniqueMentionedImages]

        result = await videoGeneration.mutateAsync({
          projectId: currentProjectId,
          episodeId: currentEpisodeId || undefined,
          name: `${activeItem.name}_video`,
          prompt,
          model: selectedModelId,
          width: modelParams.width as number,
          height: modelParams.height as number,
          duration: modelParams.duration as number,
          resolution: modelParams.resolution as string,
          generateAudio: modelParams.audio as boolean,
          firstFrame,
          lastFrame,
          referenceImages: otherReferenceImages.length > 0 ? otherReferenceImages : undefined,
        })

        if (result) {
          if (activeTab === 'storyboard') {
            await updateStoryboardAsync({
              id: activeItem.id,
              data: { video: result, status: 'completed' },
            })
          }
          setPreviewVideo(result)
          addVideoToHistory(result)
          toast({ title: '视频生成成功' })
        } else {
          throw new Error('未返回视频 URL')
        }
      } else {
        // 图片生成逻辑：
        // - 有分镜图：图片编辑（图生图）
        // - 无分镜图但有参考图：多图参考生图（用第一张参考图作为主图）
        // - 无分镜图无参考图：文生图
        
        const storyboardImage = (activeItem as any)?.image
        const hasReferenceImages = localReferenceImages?.length > 0
        
        // 确定主图：分镜图 > 参考图第一张
        const firstImage = storyboardImage || (hasReferenceImages ? localReferenceImages[0] : undefined)
        // 其他参考图（除主图外的）+ @提及的图片（去重）
        const otherLocalRefs = hasReferenceImages 
          ? localReferenceImages.filter((img: string) => img !== firstImage)
          : []
        const uniqueMentionedImages = mentionedImages.filter(url => !otherLocalRefs.includes(url) && url !== firstImage)
        const otherReferenceImages = [...otherLocalRefs, ...uniqueMentionedImages]

        const imageUrl = await imageGeneration.mutateAsync({
          projectId: currentProjectId,
          episodeId: currentEpisodeId || undefined,
          name: `${activeItem.name}_image`,
          prompt,
          model: selectedModelId,
          width: modelParams.width as number,
          height: modelParams.height as number,
          aspectRatio: modelParams.aspectRatio || '16:9',
          imageUrl: firstImage,
          referenceImages: otherReferenceImages.length > 0 ? otherReferenceImages : undefined,
        })

        if (imageUrl) {
          setGeneratedImage(imageUrl)
          addImageToHistory(imageUrl)

          // 自动保存到对应资产（与 ComfyUI 模式保持一致）
          if (activeTab === 'storyboard') {
            await updateStoryboardAsync({ id: activeItem.id, data: { image: imageUrl } })
          } else {
            await updateLinkedAsset(activeTab, activeItem.id, { image: imageUrl })
          }

          toast({ title: '图片生成成功', description: '已自动保存到资产' })
        } else {
          throw new Error('未返回图片 URL')
        }
      }

      // 自动刷新数据
      setTimeout(() => {
        refreshData()
      }, 500)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '生成失败'
      toast({ title: '生成失败', description: errorMsg, variant: 'destructive' })
      console.error('AI 生成错误:', error)
    } finally {
      setIsGenerating(false)
      isGeneratingRef.current = false
    }
  }, [
    activeItem,
    currentProjectId,
    currentEpisodeId,
    generationType,
    generationMode,
    selectedConfigId,
    selectedModelId,
    modelParams,
    localPrompt,
    localVideoPrompt,
    localReferenceImages,
    localLastFrame,
    imageGeneration,
    videoGeneration,
    updateStoryboardAsync,
    addImageToHistory,
    activeTab,
    toast,
  ])

  // 图生图 - 编辑图像
  const handleEditImage = useCallback(async () => {
    if (!activeItem || !currentProjectId) return

    const editPrompt = localEditPrompt?.trim()
    if (!editPrompt) {
      toast({ title: '请输入编辑提示词', variant: 'destructive' })
      return
    }

    // 解析提示词中的 @提及，提取图片URL
    const mentionedImages = getMentionImageUrls(editPromptMentions)

    const referenceImages = localReferenceImages || []
    const firstFrame = (activeItem as any)?.image || referenceImages[0] || undefined

    if (!firstFrame) {
      toast({ title: '请先选择参考图或确保当前资产有图片', variant: 'destructive' })
      return
    }

    // 去重：@提及的图片如果已在参考图中，则不重复添加
    const uniqueMentionedImages = mentionedImages.filter(url => !referenceImages.includes(url))
    const allReferenceImages = [...referenceImages, ...uniqueMentionedImages]

    if (generationMode === 'comfyui') {
      await handleEditImageComfyUI(localEditPrompt || '', firstFrame, allReferenceImages)
    } else {
      // AI 模式：@提及的图片如果和 firstFrame 相同，也不重复添加
      const uniqueMentionedForAI = mentionedImages.filter(url => url !== firstFrame)
      await handleEditImageAI(localEditPrompt || '', firstFrame, uniqueMentionedForAI)
    }
  }, [
    activeItem,
    currentProjectId,
    currentEpisodeId,
    localEditPrompt,
    localReferenceImages,
    generationMode,
  ])

  // 图生图 - AI 模式
  const handleEditImageAI = useCallback(async (editPrompt: string, firstFrame: string, mentionedImages: string[] = []) => {
    if (!activeItem || !currentProjectId) return

    setIsGenerating(true)

    try {
      const imageUrl = await imageGeneration.mutateAsync({
        projectId: currentProjectId,
        episodeId: currentEpisodeId || undefined,
        name: `${activeItem.name}_edit`,
        prompt: editPrompt,
        model: selectedModelId,
        width: modelParams.width as number,
        height: modelParams.height as number,
        aspectRatio: modelParams.aspectRatio || '16:9',
        imageUrl: firstFrame,
        referenceImages: mentionedImages.length > 0 ? mentionedImages : undefined,
      })

      if (imageUrl) {
        setGeneratedImage(imageUrl)
        addImageToHistory(imageUrl)

        // 自动保存到对应资产
        if (activeTab === 'storyboard') {
          await updateStoryboardAsync({ id: activeItem.id, data: { image: imageUrl } })
        } else {
          await updateLinkedAsset(activeTab, activeItem.id, { image: imageUrl })
        }

        toast({ title: '图像编辑成功', description: '已自动保存到资产' })

        // 自动刷新数据（替代整页刷新）
        setTimeout(() => {
          refreshData()
        }, 500) // 0.5秒后刷新数据
      } else {
        throw new Error('未返回图片 URL')
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '图像编辑失败'
      toast({ title: '图像编辑失败', description: errorMsg, variant: 'destructive' })
      console.error('图生图错误:', error)
    } finally {
      setIsGenerating(false)
    }
  }, [
    activeItem,
    currentProjectId,
    currentEpisodeId,
    selectedConfigId,
    selectedModelId,
    modelParams,
    imageGeneration,
    updateStoryboardAsync,
    addImageToHistory,
    activeTab,
    toast,
    refreshData,
  ])

  // 图生图 - ComfyUI 模式
  const handleEditImageComfyUI = useCallback(async (editPrompt: string, firstFrame: string, referenceImages: string[]) => {
    if (!activeItem || !selectedWorkflow || !comfyuiClientRef.current) {
      toast({ title: '请先选择 ComfyUI 工作流', variant: 'destructive' })
      return
    }

    setIsGenerating(true)

    // 动态导入 useTaskQueueStore
    const { useTaskQueueStore } = await import('@/store/useTaskQueueStore')
    
    // 创建任务
    const taskId = useTaskQueueStore.getState().addTask({
      type: 'image_generation',
      name: 'ComfyUI 图生图',
      metadata: { prompt: editPrompt, itemId: activeItem.id },
    })
    useTaskQueueStore.getState().updateTask(taskId, { status: 'running', startedAt: Date.now() })
    
    try {
      let uploadedImageName: string | null = null
      const uploadedReferenceImages: string[] = []

      // 合并所有图片：firstFrame + referenceImages（去重）
      const allImagesToUpload = [firstFrame, ...referenceImages.filter(img => img !== firstFrame)]
      console.log('[ComfyUI 图生图] 主图片:', firstFrame)
      console.log('[ComfyUI 图生图] 参考图片数量:', referenceImages.length, referenceImages)
      console.log('[ComfyUI 图生图] 所有待上传图片:', allImagesToUpload)
      
      for (let i = 0; i < allImagesToUpload.length; i++) {
        const image = allImagesToUpload[i]
        if (!image) continue
        
        try {
          let uploadedName: string | null = null
          
          // 检查是否是远程 URL（排除 asset 协议）
          const isAssetProtocol = image.includes('asset.localhost') || image.startsWith('asset://')
          const isRemoteUrl = (image.startsWith('http://') || image.startsWith('https://')) && !isAssetProtocol
          
          if (isRemoteUrl) {
            // 远程图片需要先下载
            console.log(`[ComfyUI 图生图] 图片 ${i + 1} - 检测到远程URL，正在下载...`)
            const response = await fetch(image)
            if (!response.ok) {
              throw new Error(`下载远程图片失败: ${response.statusText}`)
            }
            const blob = await response.blob()
            const arrayBuffer = await blob.arrayBuffer()
            const filename = `edit_${Date.now()}_${i}.png`
            
            // 上传到 ComfyUI
            const formData = new FormData()
            formData.append('image', new Blob([arrayBuffer], { type: 'image/png' }), filename)
            formData.append('type', 'input')
            formData.append('subfolder', '')
            
            const serverUrl = getComfyUIServerUrl()
            const uploadResponse = await fetch(`${serverUrl}/upload/image`, {
              method: 'POST',
              body: formData,
            })
            
            if (!uploadResponse.ok) {
              const errorData = await uploadResponse.json().catch(() => ({ message: 'Unknown error' }))
              throw new Error(`上传失败: ${errorData.message || uploadResponse.statusText}`)
            }
            
            const uploadResult = await uploadResponse.json()
            uploadedName = uploadResult.name
            console.log(`[ComfyUI 图生图] 图片 ${i + 1} 远程上传成功:`, uploadedName)
          } else {
            // 本地文件路径处理
            let localPath = image
            if (image.startsWith('asset://')) {
              const match = image.match(/asset:\/\/[^/]+\/(.+)/)
              if (match) {
                localPath = decodeURIComponent(match[1]!)
              }
            }
            
            // 处理 asset.localhost 协议
            if (localPath.includes('asset.localhost')) {
              try {
                const urlObj = new URL(localPath)
                localPath = decodeURIComponent(urlObj.pathname)
              } catch {
                const match = localPath.match(/asset\.localhost\/(.+)/)
                if (match) {
                  localPath = decodeURIComponent(match[1]!)
                }
              }
            }
            
            // 去掉前导斜杠
            if (localPath.startsWith('/')) {
              localPath = localPath.substring(1)
            }
            
            // 处理 Windows 路径中的斜杠
            localPath = localPath.replace(/\//g, '\\')
            
            console.log(`[ComfyUI 图生图] 图片 ${i + 1} - 处理后的本地路径:`, localPath)
            
            // 读取本地文件
            const imageData = await readFile(localPath)
            const filename = `edit_${Date.now()}_${i}.png`
            
            // 使用 FormData 上传到 ComfyUI
            const blob = new Blob([imageData], { type: 'image/png' })
            const formData = new FormData()
            formData.append('image', blob, filename)
            formData.append('type', 'input')
            formData.append('subfolder', '')
            
            const serverUrl = getComfyUIServerUrl()
            const response = await fetch(`${serverUrl}/upload/image`, {
              method: 'POST',
              body: formData,
            })
            
            if (!response.ok) {
              const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
              throw new Error(`上传失败: ${errorData.message || response.statusText}`)
            }
            
            const uploadResult = await response.json()
            uploadedName = uploadResult.name
            console.log(`[ComfyUI 图生图] 图片 ${i + 1} 上传成功:`, uploadedName)
          }
          
          if (uploadedName) {
            uploadedReferenceImages.push(uploadedName)
            // 第一张图片作为主图
            if (i === 0) {
              uploadedImageName = uploadedName
            }
          }
        } catch (error) {
          console.error(`[ComfyUI 图生图] 上传图片 ${i + 1} 失败:`, error)
          // 继续上传其他图片
        }
      }
      
      console.log('[ComfyUI 图生图] 所有图片上传完成:', {
        mainImage: uploadedImageName,
        allImages: uploadedReferenceImages
      })

      const currentParams = getComfyUIParamsRef.current ? getComfyUIParamsRef.current() : {}
      
      // 处理种子：如果参数面板中种子为 -1，则生成随机种子；否则使用面板中的固定种子
      const effectiveSeed = currentParams.seed === -1 || currentParams.seed === undefined
        ? Math.floor(Math.random() * 2147483647)
        : currentParams.seed
      console.log('[ComfyUI 图生图] 种子设置:', { panelSeed: currentParams.seed, effectiveSeed })
      
      const params: ComfyUIParams = {
        ...currentParams,
        prompt: editPrompt,
        negativePrompt: localNegativePrompt,
        // 使用处理后的种子（-1 表示随机，其他值表示固定）
        seed: effectiveSeed,
        width: currentParams.width || modelParams.width,
        height: currentParams.height || modelParams.height,
        imageInput: uploadedImageName || undefined,
        // 多图参考 - 使用上传后的图片名称
        referenceImages: uploadedReferenceImages.length > 0 ? uploadedReferenceImages : undefined,
      }

      console.log('[ComfyUI 图生图] 应用参数:', {
        editPrompt,
        negativePrompt: localNegativePrompt,
        imageInput: uploadedImageName,
        currentParams,
      })

      let workflowData = applyParamsToWorkflow(selectedWorkflow.workflow, params, selectedWorkflow.nodes)

      // 如果没有上传图片，清空 LoadImage 节点（避免使用模板中的旧图片）
      if (!uploadedImageName) {
        for (const [nodeId, node] of Object.entries(workflowData)) {
          const nodeData = node as any
          if (nodeData.class_type === 'LoadImage' || nodeData.class_type?.includes('LoadImage')) {
            if (nodeData.inputs?.image) {
              console.log('[ComfyUI 图生图] 清空 LoadImage 节点:', nodeId, '原值:', nodeData.inputs.image)
              nodeData.inputs.image = ''
            }
          }
        }
      }

      // 调试：检查工作流中的提示词节点
      for (const [nodeId, node] of Object.entries(workflowData)) {
        const nodeData = node as any
        if (
          nodeData.class_type?.includes('CLIPTextEncode') ||
          nodeData.class_type?.includes('Text') ||
          nodeData.inputs?.text !== undefined
        ) {
          console.log('[ComfyUI 图生图] 提示词节点:', nodeId, nodeData.class_type, nodeData.inputs)
        }
      }

      // 强制应用提示词到所有可能的提示词节点（确保图生图提示词被使用）
      // 简单策略：第一个 CLIPTextEncode 节点是正向提示词，第二个是负向提示词
      let textEncodeCount = 0
      for (const [nodeId, node] of Object.entries(workflowData)) {
        const nodeData = node as any
        if (!nodeData.inputs) continue

        // CLIPTextEncode 节点
        if (
          nodeData.class_type === 'CLIPTextEncode' ||
          nodeData.class_type?.includes('CLIPTextEncode')
        ) {
          textEncodeCount++
          if (textEncodeCount === 1) {
            // 第一个通常是正向提示词
            nodeData.inputs.text = editPrompt
            console.log('[ComfyUI 图生图] 强制设置正向提示词:', nodeId, editPrompt)
          } else if (textEncodeCount === 2 && localNegativePrompt) {
            // 第二个通常是负向提示词
            nodeData.inputs.text = localNegativePrompt
            console.log('[ComfyUI 图生图] 强制设置负向提示词:', nodeId, localNegativePrompt)
          }
        }
      }

      // 🔍 调试：打印最终工作流中的所有种子节点
      console.log('[ComfyUI 生成] 最终工作流中的种子节点:')
      for (const [nodeId, node] of Object.entries(workflowData)) {
        const nodeData = node as any
        if (nodeData.inputs?.seed !== undefined) {
          console.log(`  ${nodeId} (${nodeData.class_type}): seed = ${nodeData.inputs.seed}`)
        }
      }
      
      const queue = await comfyuiClientRef.current.queuePrompt(workflowData)
      useTaskQueueStore.getState().updateTask(taskId, { progress: 40, stepName: 'ComfyUI 执行中' })
      const historyItem = await pollComfyUIHistoryUntilDone(
        comfyuiClientRef.current,
        queue.prompt_id
      )
      const outputs = extractComfyUIMediaOutputs(historyItem)

      const imageOutput = outputs.find(o => o.mediaType === 'image')
      if (imageOutput) {
        const imagePath = await comfyuiClientRef.current.getFile(
          imageOutput.filename,
          imageOutput.subfolder,
          imageOutput.type,
          'image'
        )

        setGeneratedImage(imagePath)
        addImageToHistory(imagePath)

        // Update item
        if (activeTab === 'storyboard') {
          await updateStoryboardAsync({ id: activeItem.id, data: { image: imagePath } })
        } else {
          await updateLinkedAsset(activeTab, activeItem.id, { image: imagePath })
        }

        useTaskQueueStore.getState().updateTask(taskId, {
          status: 'completed',
          progress: 100,
          stepName: '完成',
          completedAt: Date.now(),
        })

        toast({ title: 'ComfyUI 图像编辑成功' })

        // 自动刷新数据（替代整页刷新）
        setTimeout(() => {
          refreshData()
        }, 500) // 0.5秒后刷新数据
      } else {
        throw new Error('ComfyUI 未返回图片输出')
      }
    } catch (error) {
      // 更新任务状态为失败
      useTaskQueueStore.getState().updateTask(taskId, {
        status: 'failed',
        stepName: '失败',
        errorMessage: error instanceof Error ? error.message : 'ComfyUI 图像编辑失败',
      })

      const errorMsg = error instanceof Error ? error.message : 'ComfyUI 图像编辑失败'
      toast({ title: 'ComfyUI 图像编辑失败', description: errorMsg, variant: 'destructive' })
      console.error('ComfyUI 图生图错误:', error)
    } finally {
      setIsGenerating(false)
    }
  }, [
    activeItem,
    selectedWorkflow,
    currentProjectId,
    currentEpisodeId,
    localNegativePrompt,
    modelParams,
    activeTab,
    addImageToHistory,
    updateStoryboardAsync,
    toast,
    refreshData,
  ])

  // Generate with ComfyUI
  const handleGenerateComfyUI = useCallback(async () => {
    if (!activeItem || !selectedWorkflow || !comfyuiClientRef.current) {
      toast({ title: '请先选择工作流', variant: 'destructive' })
      return
    }

    setIsGenerating(true)

    const prompt = generationType === 'video' ? localVideoPrompt : localPrompt

    const mentionedImages = getMentionImageUrls(promptMentions)

    const taskType = generationType === 'video' ? 'video_generation' as const : 'image_generation' as const
    const taskName = generationType === 'video' ? 'ComfyUI 视频生成' : 'ComfyUI 图片生成'

    const { useTaskQueueStore } = await import('@/store/useTaskQueueStore')
    const taskId = useTaskQueueStore.getState().addTask({
      type: taskType,
      name: taskName,
      metadata: { prompt, generationType, itemId: activeItem.id },
    })
    useTaskQueueStore.getState().updateTask(taskId, { status: 'running', startedAt: Date.now() })

    try {
      // 获取参考图片（包括从@提及中提取的图片，去重）
      const localRefs = localReferenceImages || []
      const uniqueMentionedImages = mentionedImages.filter(url => !localRefs.includes(url))
      const referenceImages = [...localRefs, ...uniqueMentionedImages]
      
      // 上传图片到 ComfyUI：只用项目图片作为主图，参考图不自动作为主图
      let uploadedImageName: string | null = null
      const uploadedReferenceImages: string[] = []
      const imageToUpload = (activeItem as any)?.image || undefined
      
      console.log('[ComfyUI 生成] 主图片:', imageToUpload || '无')
      console.log('[ComfyUI 生成] 参考图片数量:', referenceImages.length, referenceImages)
      console.log('[ComfyUI 生成] 从@提及提取的图片:', mentionedImages)
      console.log('[ComfyUI 生成] 去重后提及的图片:', uniqueMentionedImages)
      
      // 上传单张图片的辅助函数
      const uploadImageToComfyUI = async (imagePath: string, isReference: boolean = false): Promise<string> => {
        console.log(`[ComfyUI 生成] 上传${isReference ? '参考' : '主'}图片:`, imagePath)
        
        // 检查是否是 data: URL (base64 编码的图片，来自 ReferenceImageInput 组件)
        if (imagePath.startsWith('data:')) {
          console.log('[ComfyUI 生成] 检测到 data: URL，正在解析 base64 数据...')
          
          // 解析 data: URL，提取 base64 数据
          const match = imagePath.match(/^data:image\/[^;]+;base64,(.+)$/)
          if (!match) {
            throw new Error('无效的 data: URL 格式')
          }
          
          const base64Data = match[1]!
          const binaryData = atob(base64Data)
          const arrayBuffer = new Uint8Array(binaryData.length)
          for (let i = 0; i < binaryData.length; i++) {
            arrayBuffer[i] = binaryData.charCodeAt(i)
          }
          
          const filename = `input_${Date.now()}.png`
          
          // 使用 FormData 上传到 ComfyUI
          const blob = new Blob([arrayBuffer], { type: 'image/png' })
          const formData = new FormData()
          formData.append('image', blob, filename)
          formData.append('type', 'input')
          formData.append('subfolder', '')
          
          const serverUrl = getComfyUIServerUrl()
          const response = await fetch(`${serverUrl}/upload/image`, {
            method: 'POST',
            body: formData,
          })
          
          if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error')
            let errorMessage = errorText
            
            // 尝试解析 JSON 错误
            try {
              const errorData = JSON.parse(errorText)
              errorMessage = errorData.message || errorData.error || errorText
            } catch {
              // 不是 JSON，使用原始文本
            }
            
            // 检查是否是权限错误
            if (errorMessage.includes('Permission denied') || errorMessage.includes('input')) {
              throw new Error(
                `ComfyUI input 文件夹权限 denied。请检查：\n` +
                `1. ComfyUI 的 input 文件夹是否有写入权限\n` +
                `2. 路径: E:\\AI\\ComfyUI\\input\n` +
                `3. 尝试以管理员身份运行 ComfyUI，或修改文件夹权限`
              )
            }
            
            throw new Error(`上传失败: ${errorMessage || response.statusText}`)
          }
          
          const uploadResult = await response.json()
          console.log(`[ComfyUI 生成] data: URL ${isReference ? '参考' : '主'}图片上传成功:`, uploadResult.name)
          return uploadResult.name
        }
        
        // 检查是否是远程 URL
        if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
          // 判断是否是 asset 协议（Tauri 本地文件，不是真正的远程URL）
          if (!imagePath.includes('asset.localhost')) {
            // 真正的远程 URL 图片 - 下载后用 FormData 上传
            console.log('[ComfyUI 生成] 检测到远程URL，正在下载...')
            const response = await fetch(imagePath)
            if (!response.ok) {
              throw new Error(`下载远程图片失败: ${response.statusText}`)
            }
            const blob = await response.blob()
            
            const filename = imagePath.split('/').pop()?.split('?')[0] || `input_${Date.now()}.png`
            
            // 使用 FormData 上传到 ComfyUI（与编辑图像一致）
            const arrayBuffer = await blob.arrayBuffer()
            const uploadBlob = new Blob([arrayBuffer], { type: 'image/png' })
            const formData = new FormData()
            formData.append('image', uploadBlob, filename)
            formData.append('type', 'input')
            formData.append('subfolder', '')
            
            const serverUrl = getComfyUIServerUrl()
            const uploadResponse = await fetch(`${serverUrl}/upload/image`, {
              method: 'POST',
              body: formData,
            })
            
            if (!uploadResponse.ok) {
              const errorData = await uploadResponse.json().catch(() => ({ message: 'Unknown error' }))
              throw new Error(`上传失败: ${errorData.message || uploadResponse.statusText}`)
            }
            
            const uploadResult = await uploadResponse.json()
            console.log(`[ComfyUI 生成] 远程${isReference ? '参考' : '主'}图片上传成功:`, uploadResult.name)
            return uploadResult.name
          } else {
            // asset.localhost 协议 - 本地文件
            let localPath = imagePath
            
            // 从 URL 提取本地路径
            try {
              const urlObj = new URL(localPath)
              localPath = decodeURIComponent(urlObj.pathname)
              if (localPath.startsWith('/')) {
                localPath = localPath.substring(1)
              }
            } catch (_e) {
              const match = localPath.match(/asset\.localhost\/(.+)/)
              if (match) {
                localPath = decodeURIComponent(match[1]!)
                if (localPath.startsWith('/')) {
                  localPath = localPath.substring(1)
                }
              }
            }
            
            // 处理 Windows 路径中的斜杠
            localPath = localPath.replace(/\//g, '\\')
            
            console.log('[ComfyUI 生成] 处理后的本地路径:', localPath)
            
            // 读取本地文件
            const { readFile } = await import('@tauri-apps/plugin-fs')
            const imageData = await readFile(localPath)
            const filename = `input_${Date.now()}.png`
            
            // 使用 FormData 上传到 ComfyUI（与编辑图像完全一致！）
            const blob = new Blob([imageData], { type: 'image/png' })
            const formData = new FormData()
            formData.append('image', blob, filename)
            formData.append('type', 'input')
            formData.append('subfolder', '')
            
            const serverUrl = getComfyUIServerUrl()
            const response = await fetch(`${serverUrl}/upload/image`, {
              method: 'POST',
              body: formData,
            })
            
            if (!response.ok) {
              const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
              throw new Error(`上传失败: ${errorData.message || response.statusText}`)
            }
            
            const uploadResult = await response.json()
            console.log(`[ComfyUI 生成] ${isReference ? '参考' : '主'}图片上传成功:`, uploadResult.name)
            return uploadResult.name
          }
        } else {
          // 普通本地文件路径（asset:// 或直接路径）
          let localPath = imagePath
          
          if (localPath.startsWith('asset://')) {
            const match = localPath.match(/asset:\/\/[^/]+\/(.+)/)
            if (match) {
              localPath = match[1]!
              localPath = decodeURIComponent(localPath)
            }
          }
          
          // 处理 Windows 路径中的斜杠
          localPath = localPath.replace(/\//g, '\\')
          
          console.log('[ComfyUI 生成] 处理后的本地路径:', localPath)
          
          // 读取本地文件
          const { readFile } = await import('@tauri-apps/plugin-fs')
          const imageData = await readFile(localPath)
          const filename = `input_${Date.now()}.png`
          
          // 使用 FormData 上传到 ComfyUI（与编辑图像完全一致！）
          const blob = new Blob([imageData], { type: 'image/png' })
          const formData = new FormData()
          formData.append('image', blob, filename)
          formData.append('type', 'input')
          formData.append('subfolder', '')
          
          const serverUrl = getComfyUIServerUrl()
          const response = await fetch(`${serverUrl}/upload/image`, {
            method: 'POST',
            body: formData,
          })
          
          if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error')
            let errorMessage = errorText
            
            try {
              const errorData = JSON.parse(errorText)
              errorMessage = errorData.message || errorData.error || errorText
            } catch {
              // 不是 JSON
            }
            
            if (errorMessage.includes('Permission denied') || errorMessage.includes('input')) {
              throw new Error(
                `ComfyUI input 文件夹权限 denied。请检查：\n` +
                `1. ComfyUI 的 input 文件夹是否有写入权限\n` +
                `2. 路径: E:\\AI\\ComfyUI\\input\n` +
                `3. 尝试以管理员身份运行 ComfyUI，或修改文件夹权限`
              )
            }
            
            throw new Error(`上传失败: ${errorMessage || response.statusText}`)
          }
          
          const uploadResult = await response.json()
          console.log(`[ComfyUI 生成] ${isReference ? '参考' : '主'}图片上传成功:`, uploadResult.name)
          return uploadResult.name
        }
      }
      
      // 上传主图片
      if (imageToUpload) {
        try {
          useTaskQueueStore.getState().updateTask(taskId, { progress: 10, stepName: '上传图片' })
          uploadedImageName = await uploadImageToComfyUI(imageToUpload, false)
        } catch (error) {
          console.error('[ComfyUI 生成] 上传主图片失败:', error)
          toast({ title: '上传图片到 ComfyUI 失败', description: String(error), variant: 'destructive' })
          throw error
        }
      }

      // 上传参考图片（所有 referenceImages 都作为参考上传，去重：排除已作为主图上传的）
      const uniqueReferenceImages = referenceImages.filter(ref => ref !== imageToUpload)
      if (uniqueReferenceImages.length > 0) {
        console.log('[ComfyUI 生成] 开始上传参考图片:', uniqueReferenceImages)
        for (let i = 0; i < uniqueReferenceImages.length; i++) {
          const refImage = uniqueReferenceImages[i]
          if (refImage) {
            try {
              const uploadedRefName = await uploadImageToComfyUI(refImage, true)
              uploadedReferenceImages.push(uploadedRefName)
            } catch (error) {
              console.error(`[ComfyUI 生成] 上传参考图片 ${i} 失败:`, error)
              // 继续上传其他参考图片
            }
          }
        }
        console.log('[ComfyUI 生成] 参考图片上传完成:', uploadedReferenceImages)
      }

      const currentParams = getComfyUIParamsRef.current ? getComfyUIParamsRef.current() : {}

      // 处理种子：如果参数面板中种子为 -1，则生成随机种子；否则使用面板中的固定种子
      const effectiveSeed = currentParams.seed === -1 || currentParams.seed === undefined
        ? Math.floor(Math.random() * 2147483647)
        : currentParams.seed
      console.log('[ComfyUI 生成] 种子设置:', { panelSeed: currentParams.seed, effectiveSeed })

      const params: ComfyUIParams = {
        ...currentParams,
        prompt,
        negativePrompt: localNegativePrompt,
        // 使用处理后的种子（-1 表示随机，其他值表示固定）
        seed: effectiveSeed,
        // ComfyUI 模式使用参数面板中的宽高，不强制使用 AI 模式的宽高
        // 如果参数面板没有设置宽高，则使用工作流自身的默认值
        ...(currentParams.width !== undefined && { width: currentParams.width }),
        ...(currentParams.height !== undefined && { height: currentParams.height }),
        imageInput: uploadedImageName || undefined,
        // 多图参考 - 使用上传后的图片名称
        referenceImages: uploadedReferenceImages.length > 0 ? uploadedReferenceImages : undefined,
      }

      // Add video-specific params
      if (generationType === 'video') {
        ;(params as any).frameCount = currentParams.frameCount || (modelParams as any).fps
        ;(params as any).fps = currentParams.fps || (modelParams as any).fps
        ;(params as any).videoLength = currentParams.videoLength || (modelParams as any).duration
      }

      console.log('[ComfyUI 生成] 应用参数:', { prompt, seed: params.seed, imageInput: uploadedImageName, referenceImages: uploadedReferenceImages, currentParams })

      let workflowData = applyParamsToWorkflow(selectedWorkflow.workflow, params, selectedWorkflow.nodes)
      
      // 查找并记录种子节点的值
      for (const [nodeId, node] of Object.entries(workflowData)) {
        const nodeData = node as any
        if (nodeData.inputs?.seed !== undefined) {
          console.log(`[ComfyUI 生成] 工作流种子节点 ${nodeId}:`, nodeData.inputs.seed)
        }
      }

      // 🔑 强制应用提示词到所有可能的提示词节点（与编辑图像逻辑一致）
      let textEncodeCount = 0
      for (const [nodeId, node] of Object.entries(workflowData)) {
        const nodeData = node as any
        if (!nodeData.inputs) continue

        if (
          nodeData.class_type === 'CLIPTextEncode' ||
          nodeData.class_type?.includes('CLIPTextEncode')
        ) {
          textEncodeCount++
          if (textEncodeCount === 1) {
            nodeData.inputs.text = prompt
            console.log('[ComfyUI 生成] 强制设置正向提示词:', nodeId, prompt)
          } else if (textEncodeCount === 2 && localNegativePrompt) {
            nodeData.inputs.text = localNegativePrompt
            console.log('[ComfyUI 生成] 强制设置负向提示词:', nodeId, localNegativePrompt)
          }
        }
      }

      const queue = await comfyuiClientRef.current.queuePrompt(workflowData)
      const historyItem = await pollComfyUIHistoryUntilDone(
        comfyuiClientRef.current,
        queue.prompt_id
      )
      const outputs = extractComfyUIMediaOutputs(historyItem)
      useTaskQueueStore.getState().updateTask(taskId, { progress: 80, stepName: '保存结果' })

      if (generationType === 'video') {
        const videoOutput = outputs.find(o => o.mediaType === 'video')
        if (videoOutput) {
          const videoUrl = await comfyuiClientRef.current.getFile(
            videoOutput.filename,
            videoOutput.subfolder,
            videoOutput.type,
            'video'
          )
          if (activeTab === 'storyboard') {
            await updateStoryboardAsync({
              id: activeItem.id,
              data: { video: videoUrl, status: 'completed' },
            })
          }
          setPreviewVideo(videoUrl)
          addVideoToHistory(videoUrl)
          useTaskQueueStore.getState().updateTask(taskId, {
            status: 'completed', progress: 100, stepName: '完成', completedAt: Date.now(),
            result: { success: true, outputPath: videoUrl, outputUrl: videoUrl },
          })
          toast({ title: 'ComfyUI 视频生成成功' })
        } else {
          throw new Error('ComfyUI 未返回视频输出')
        }
      } else {
        const imageOutput = outputs.find(o => o.mediaType === 'image')
        if (imageOutput) {
          const imagePath = await comfyuiClientRef.current.getFile(
            imageOutput.filename,
            imageOutput.subfolder,
            imageOutput.type,
            'image'
          )

          // getFile 已经将文件保存到本地，直接使用返回的路径
          setGeneratedImage(imagePath)
          addImageToHistory(imagePath)

          useTaskQueueStore.getState().updateTask(taskId, {
            status: 'completed', progress: 100, stepName: '完成', completedAt: Date.now(),
            result: { success: true, outputPath: imagePath, outputUrl: imagePath },
          })

          // Update item - React Query will automatically refetch data
          if (activeTab === 'storyboard') {
            await updateStoryboardAsync({ id: activeItem.id, data: { image: imagePath } })
          } else {
            await updateLinkedAsset(activeTab, activeItem.id, { image: imagePath })
          }

          toast({ title: 'ComfyUI 图片生成成功' })
        } else {
          throw new Error('ComfyUI 未返回图片输出')
        }
      }

      // 自动刷新数据
      setTimeout(() => {
        refreshData()
      }, 500)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'ComfyUI 生成失败'
      useTaskQueueStore.getState().updateTask(taskId, {
        status: 'failed', errorMessage: errorMsg, completedAt: Date.now(),
        result: { success: false, error: errorMsg },
      })
      toast({ title: 'ComfyUI 生成失败', description: errorMsg, variant: 'destructive' })
      console.error('ComfyUI 生成错误:', error)
    } finally {
      setIsGenerating(false)
    }
  }, [
    activeItem,
    selectedWorkflow,
    generationType,
    localPrompt,
    localVideoPrompt,
    localNegativePrompt,
    localReferenceImages,
    modelParams,
    currentProjectId,
    currentEpisodeId,
    activeTab,
    addImageToHistory,
    updateStoryboardAsync,
    toast,
    previewVideo,
    generatedImage,
    refreshData,
  ])

  // Batch generation
  const getBatchItems = () => {
    if (activeTab === 'storyboard') return storyboards.filter(s => selectedIds.includes(s.id))
    if (activeTab === 'character') return characters.filter(c => selectedIds.includes(c.id))
    if (activeTab === 'scene') return scenes.filter(s => selectedIds.includes(s.id))
    return props.filter(p => selectedIds.includes(p.id))
  }

  const handleBatchComplete = async (results: Map<string, GenerationResult>) => {
    // 手动刷新相关数据 - 使用正确的 query key 格式
    if (currentEpisodeId) {
      await queryClient.invalidateQueries({ queryKey: storyboardKeys.list(currentEpisodeId) })
      await queryClient.invalidateQueries({ queryKey: ['characters', 'episode', currentEpisodeId] })
      await queryClient.invalidateQueries({ queryKey: ['scenes', 'episode', currentEpisodeId] })
      await queryClient.invalidateQueries({ queryKey: ['props', 'episode', currentEpisodeId] })
    }

    setSelectedIds([])
    setViewMode('batch')
    toast({ title: `批量生成完成，已生成 ${results.size} 项` })
  }

  // Selection handlers
  const handleSelectItem = (id: string) => {
    if (viewMode === 'batch') {
      setSelectedIds(prev => (prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]))
    } else {
      setActiveItemId(id)
      setSelectedIds([id])
    }
  }

  const handleSelectAll = () => {
    if (selectedIds.length === currentItems.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(currentItems.map(item => item.id))
    }
  }

  const handleAssetCreate = async (data: AssetCreateData) => {
    if (data.jsonItems && data.jsonItems.length > 0) {
      for (let i = 0; i < data.jsonItems.length; i++) {
        const item = data.jsonItems[i]!
        const cat = item.category || data.category
        if (cat === 'storyboard') {
          await createStoryboardAsync({
            name: item.name,
            description: item.description,
            prompt: item.prompt,
            video_prompt: item.videoPrompt,
            project_id: currentProjectId || '',
            episode_id: currentEpisodeId || '',
            sort_order: storyboards.length + i,
          })
        } else if (cat === 'character' || cat === 'scene' || cat === 'prop') {
          await createLinkedAsset(cat, {
            name: item.name,
            description: item.description,
            prompt: item.prompt,
            tags: item.tags,
            project_id: currentProjectId || '',
            episode_id: currentEpisodeId || '',
          })
        }
      }
      toast({ title: `成功创建 ${data.jsonItems.length} 个资产` })
      return
    }

    let newItem
    if (data.category === 'storyboard') {
      newItem = await createStoryboardAsync({
        name: data.name,
        description: data.description,
        prompt: data.prompt,
        video_prompt: data.videoPrompt,
        project_id: currentProjectId || '',
        episode_id: currentEpisodeId || '',
        sort_order: storyboards.length,
        image: data.image,
      })
    } else if (data.category === 'character') {
      newItem = await createLinkedAsset('character', {
        name: data.name,
        description: data.description,
        prompt: data.prompt,
        tags: data.tags,
        image: data.image,
        project_id: currentProjectId || '',
        episode_id: currentEpisodeId || '',
      })
    } else if (data.category === 'scene') {
      newItem = await createLinkedAsset('scene', {
        name: data.name,
        description: data.description,
        prompt: data.prompt,
        tags: data.tags,
        image: data.image,
        project_id: currentProjectId || '',
        episode_id: currentEpisodeId || '',
      })
    } else {
      newItem = await createLinkedAsset('prop', {
        name: data.name,
        description: data.description,
        prompt: data.prompt,
        tags: data.tags,
        image: data.image,
        project_id: currentProjectId || '',
        episode_id: currentEpisodeId || '',
      })
    }

    if (newItem) {
      setActiveItemId(newItem.id)
    }
    toast({ title: '创建成功' })
  }

  // Save handler - 保存所有修改（包括参考图和提示词）
  const handleSave = async () => {
    if (!activeItem) return

    try {
      // 🔑 保存参考图和提示词到数据库
      if (activeTab === 'storyboard') {
        await updateStoryboardAsync({
          id: activeItem.id,
          data: {
            prompt: localPrompt,
            video_prompt: localVideoPrompt,
            negative_prompt: localNegativePrompt,
            // 根据当前生成类型保存到对应的字段
            ...(generationType === 'video' 
              ? { video_reference_images: localReferenceImages }
              : { reference_images: localReferenceImages }
            ),
          },
        })
      } else {
        // 其他资产类型的保存逻辑
        const updateData = {
          prompt: localPrompt,
          metadata: {
            ...(activeItem as any).metadata,
            negativePrompt: localNegativePrompt,
          },
        }

        await updateLinkedAsset(activeTab, activeItem.id, updateData as any)
      }

      toast({ title: '保存成功' })
    } catch (error) {
      console.error('保存失败:', error)
      toast({ title: '保存失败', variant: 'destructive' })
    }
  }

  // Auto-save effect - 自动保存参考图和提示词
  useEffect(() => {
    if (!activeItem || activeTab !== 'storyboard') return

    // 延迟保存，避免频繁操作
    const timeoutId = setTimeout(() => {
      const item = activeItem as any
      // 根据生成类型比较对应的参考图字段
      const currentRefImages = generationType === 'video'
        ? (item.video_reference_images || [])
        : (item.reference_images || [])
      const hasChanges =
        localPrompt !== (item.prompt || '') ||
        localVideoPrompt !== (item.video_prompt || '') ||
        localNegativePrompt !== (item.negative_prompt || '') ||
        JSON.stringify(localReferenceImages) !== JSON.stringify(currentRefImages)

      if (hasChanges) {
        console.log('[GenerationPage] 自动保存触发')
        handleSave()
      }
    }, 1000) // 1秒后自动保存

    return () => clearTimeout(timeoutId)
  }, [localPrompt, localVideoPrompt, localNegativePrompt, localReferenceImages, activeItem, activeTab])

  // Render helpers
  const renderItemImage = (item: any) => {
    const imageUrl = getImageUrl(item.image)
    if (imageUrl) {
      return (
        <img
          src={imageUrl}
          alt={item.name}
          className="w-full h-full object-cover rounded"
          onClick={e => {
            e.stopPropagation()
            if (imageUrl) {
              const currentItemsList =
                activeTab === 'storyboard'
                  ? storyboards
                  : activeTab === 'character'
                    ? characters
                    : activeTab === 'scene'
                      ? scenes
                      : activeTab === 'prop'
                        ? props
                        : []
              const itemsWithImages = currentItemsList.filter((i: any) => getImageUrl(i.image))
              const allImages = itemsWithImages
                .map((i: any) => getImageUrl(i.image))
                .filter(Boolean) as string[]
              const currentIndex = itemsWithImages.findIndex((i: any) => i.id === item.id)
              setPreviewImages(allImages)
              setPreviewCurrentIndex(Math.max(0, currentIndex))
              setShowPreviewDialog(true)
            }
          }}
        />
      )
    }
    return <ImageIcon className="w-8 h-8 text-muted-foreground" />
  }

  if (!currentEpisodeId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Layers className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">请先选择一个剧集</h3>
          <p className="text-muted-foreground mt-1">请在项目管理中选择剧集以开始创建。</p>
        </div>
      </div>
    )
  }

  const allSelected = currentItems.length > 0 && selectedIds.length === currentItems.length

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Left Sidebar - Item List */}
      <div className="w-80 border-r flex flex-col bg-background shrink-0">
        {/* Header */}
        <div className="h-14 border-b flex items-center justify-between px-4 shrink-0">
          <h2 className="font-semibold">{getTabLabel()}列表</h2>
          <div className="flex gap-2">
            {(viewMode === 'batch' || selectedIds.length > 0) && (
              <Button size="sm" variant="ghost" onClick={handleSelectAll}>
                {allSelected ? '取消全选' : '全选'}
                {selectedIds.length > 0 && ` (${selectedIds.length}/${currentItems.length})`}
              </Button>
            )}
            <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              新建
            </Button>
          </div>
        </div>

        {/* Type & Tab Selector */}
        <div className="border-b px-4 py-3 space-y-3 shrink-0">
          {/* Generation Type Toggle */}
          <Card className="border-0 shadow-none bg-muted/50">
            <CardContent className="p-1">
              <div className="flex gap-1">
                <button
                  onClick={() => setGenerationType('image')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-md transition-all',
                    generationType === 'image'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                  )}
                >
                  <ImageIcon className="w-4 h-4" />
                  图片
                </button>
                <button
                  onClick={() => setGenerationType('video')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-md transition-all',
                    generationType === 'video'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                  )}
                >
                  <Video className="w-4 h-4" />
                  视频
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Tab List (for image mode only) */}
          {generationType === 'image' && (
            <Tabs
              value={activeTab}
              onValueChange={v => {
                setActiveTab(v as TabType)
                setSelectedIds([])
                setActiveItemId(null)
              }}
            >
              <TabsList className="grid w-full grid-cols-4 h-9 bg-muted/50 p-1">
                <TabsTrigger value="character" className="text-xs">
                  角色
                </TabsTrigger>
                <TabsTrigger value="scene" className="text-xs">
                  场景
                </TabsTrigger>
                <TabsTrigger value="prop" className="text-xs">
                  道具
                </TabsTrigger>
                <TabsTrigger value="storyboard" className="text-xs">
                  分镜
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoadingStoryboards || isLoadingAssets ? (
            <div className="text-sm text-muted-foreground text-center py-4">加载中...</div>
          ) : currentItems.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">暂无{getTabLabel()}数据</p>
            </div>
          ) : (
            currentItems.map(item => {
              const isSelected = selectedIds.includes(item.id)
              const isActive = activeItemId === item.id

              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectItem(item.id)}
                  className={cn(
                    'w-full text-left p-2 rounded border transition-colors',
                    isActive && 'border-primary bg-primary/5 ring-1 ring-primary/20',
                    isSelected && !isActive && 'border-primary/50 bg-primary/5',
                    !isSelected && !isActive && 'border-border hover:bg-muted/50'
                  )}
                >
                  <div className="flex gap-2 relative">
                    <div className="w-12 h-12 rounded bg-muted overflow-hidden flex-shrink-0">
                      {renderItemImage(item)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {(item as any).description || '暂无描述'}
                      </div>
                    </div>
                    {generationType === 'video' && (item as any).video && (
                      <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-blue-500" />
                    )}
                    {generationType === 'image' && (item as any).image && (
                      <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-green-500" />
                    )}
                    {viewMode === 'batch' && (
                      <Check
                        className={cn(
                          'w-5 h-5 flex-shrink-0 self-start mt-0.5',
                          isSelected ? 'text-primary' : 'text-muted-foreground/30'
                        )}
                      />
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Batch Actions Footer */}
        {viewMode === 'batch' && selectedIds.length > 0 && (
          <div className="p-3 border-t bg-muted/50 shrink-0">
            <div className="text-xs text-muted-foreground mb-2">已选择 {selectedIds.length} 项</div>
            <div className="flex gap-2">
              <Button className="flex-1" size="sm" onClick={() => setViewMode('generate')}>
                开始批量{generationType === 'video' ? '视频' : '图片'}生成
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSelectedIds([])}>
                清空
              </Button>
            </div>
          </div>
        )}

        {/* View Mode Toggle */}
        <div className="p-3 border-t bg-muted/30 shrink-0">
          <div className="flex border rounded-md bg-background">
            <Button
              size="sm"
              variant={viewMode === 'single' ? 'default' : 'ghost'}
              className="flex-1 rounded-r-none"
              onClick={() => {
                setViewMode('single')
                setSelectedIds(activeItemId ? [activeItemId] : [])
              }}
            >
              <Check className="w-3.5 h-3.5 mr-1.5" />
              单选
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'batch' ? 'default' : 'ghost'}
              className="flex-1 rounded-l-none border-l"
              onClick={() => {
                setViewMode('batch')
                setSelectedIds([])
              }}
            >
              <Layers className="w-3.5 h-3.5 mr-1.5" />
              批量
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {viewMode === 'generate' ? (
          /* Batch Generation Mode - 批量生成模式 */
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto">
              <BatchGenerationPanel
                items={getBatchItems().map(item => ({
                  id: item.id,
                  name: item.name,
                  description: (item as any).description,
                  prompt: (item as any).prompt,
                  image: (item as any).image,
                }))}
                type={activeTab}
                episodeId={currentEpisodeId || undefined}
                projectId={currentProjectId || undefined}
                onComplete={handleBatchComplete}
                onCancel={() => setViewMode('batch')}
              />
            </div>
          </div>
        ) : !activeItem ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Layers className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">请选择一项进行编辑</h3>
              <p className="text-muted-foreground mt-1">从左侧列表选择一项继续。</p>
            </div>
          </div>
        ) : (
          <>
            {/* Top Toolbar */}
            <div className="h-14 border-b flex items-center justify-between px-4 shrink-0 bg-background">
              <div className="flex items-center gap-3">
                <h2 className="font-semibold text-lg">
                  {activeItem?.name || `新建${getTabLabel()}`}
                </h2>
                {activeItem && (
                  <Badge variant="secondary" className="text-xs font-normal">
                    {activeItem.description || '暂无描述'}
                  </Badge>
                )}
              </div>
              {/* Save Button - 右上角 - 始终显示 */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsParamPanelCollapsed(!isParamPanelCollapsed)}
                  title={isParamPanelCollapsed ? '展开参数面板' : '收起参数面板'}
                >
                  {isParamPanelCollapsed ? (
                    <ChevronLeft className="w-4 h-4 mr-1" />
                  ) : (
                    <ChevronRight className="w-4 h-4 mr-1" />
                  )}
                  {isParamPanelCollapsed ? '展开参数' : '收起参数'}
                </Button>
                <Button variant="outline" size="sm" onClick={handleSave}>
                  保存修改
                </Button>
              </div>
            </div>

            {/* Preview + Config Layout */}
            <div className="flex-1 flex overflow-hidden bg-background">
              {/* Left: Preview + Reference Images Panel */}
              <div className={cn(
                "border-r flex flex-col bg-muted/5 overflow-hidden transition-all duration-300",
                isParamPanelCollapsed ? "flex-1" : "w-[45%]"
              )}>
                {/* 4 Tab 切换面板 */}
                <Tabs
                  value={mainViewMode}
                  onValueChange={v => setMainViewMode(v as MainViewMode)}
                  className="flex flex-col h-full"
                >
                  <TabsList className="mx-4 mt-4 grid w-auto grid-cols-3 h-9 bg-muted/50 p-1">
                    <TabsTrigger value="preview" className="text-xs">
                      <ImageIcon className="w-3.5 h-3.5 mr-1.5" />
                      生成结果
                    </TabsTrigger>
                    <TabsTrigger value="history" className="text-xs">
                      <History className="w-3.5 h-3.5 mr-1.5" />
                      {generationType === 'video' ? '历史视频' : '历史图'}
                    </TabsTrigger>
                    <TabsTrigger value="reference" className="text-xs">
                      <ImagePlus className="w-3.5 h-3.5 mr-1.5" />
                      参考图
                    </TabsTrigger>
                  </TabsList>

                  {/* 生成结果 Tab */}
                  <TabsContent value="preview" className="flex-1 m-0 p-4 overflow-hidden">
                    {getCurrentDisplayImage() || previewVideo || (activeItem as any).video ? (
                      <div className="h-full flex flex-col">
                        {/* 图片/视频显示区域 */}
                        <div className="flex-1 relative bg-muted/30 rounded-lg overflow-hidden">
                          {/* 优先显示视频（如果有） */}
                          {(activeItem as any).video ? (
                            <VideoPlayer
                              src={(activeItem as any).video}
                              className="w-full h-full"
                            />
                          ) : generationType === 'video' && previewVideo ? (
                            <VideoPlayer
                              src={previewVideo}
                              className="w-full h-full"
                            />
                          ) : getCurrentDisplayImage() ? (
                            <img
                              src={getImageUrl(getCurrentDisplayImage()) || ''}
                              alt="生成结果"
                              className="w-full h-full object-contain cursor-pointer"
                              onClick={() => {
                                const historyUrls = (imageHistoryMap[activeItemId || ''] || [])
                                  .map(url => getImageUrl(url))
                                  .filter((url): url is string => url !== null && url !== '')
                                if (historyUrls.length > 0) {
                                  setPreviewImages(historyUrls)
                                  setPreviewCurrentIndex(historyUrls.length - 1)
                                  setShowPreviewDialog(true)
                                }
                              }}
                            />
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center bg-muted/30 rounded-lg overflow-hidden">
                        <div className="text-center text-muted-foreground">
                          {generationType === 'video' ? (
                            <Video className="w-16 h-16 mx-auto mb-4 opacity-50" />
                          ) : (
                            <ImageIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
                          )}
                          <p>暂无生成结果</p>
                          <p className="text-sm mt-1">在右侧配置参数并生成</p>
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  {/* 历史 Tab - 根据生成类型显示图片或视频历史 */}
                  <TabsContent value="history" className="flex-1 m-0 p-4 overflow-hidden">
                    <div className="h-full flex flex-col gap-4">
                      {generationType === 'video' ? (
                        // 视频历史
                        videoHistoryMap[activeItemId || '']?.length ? (
                          <>
                            <div className="flex-1 overflow-y-auto">
                              <div className="grid grid-cols-2 gap-2">
                                {videoHistoryMap[activeItemId || '']?.map((url, idx) => (
                                  <div
                                    key={idx}
                                    className={cn(
                                      'relative aspect-video rounded-lg overflow-hidden border-2 cursor-pointer transition-all group',
                                      'border-transparent hover:border-muted-foreground/30'
                                    )}
                                    onClick={() => {
                                      setPreviewVideo(url)
                                    }}
                                  >
                                    <video
                                      src={getImageUrl(url) || ''}
                                      className="w-full h-full object-cover"
                                      preload="metadata"
                                    />
                                    {/* 悬停显示操作按钮 */}
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        className="w-full text-xs"
                                        onClick={e => {
                                          e.stopPropagation()
                                          // 设为主视频
                                          if (activeTab === 'storyboard') {
                                            updateStoryboardAsync({
                                              id: activeItem!.id,
                                              data: { video: url },
                                            })
                                          }
                                          toast({ title: '已设为主视频' })
                                        }}
                                      >
                                        <Video className="w-3 h-3 mr-1" />
                                        设为主视频
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="h-full flex items-center justify-center">
                            <div className="text-center text-muted-foreground">
                              <History className="w-16 h-16 mx-auto mb-4 opacity-50" />
                              <p>暂无历史视频</p>
                              <p className="text-sm mt-1">生成的视频将自动显示在此处</p>
                            </div>
                          </div>
                        )
                      ) : (
                        // 图片历史
                        imageHistoryMap[activeItemId || '']?.length ? (
                          <>
                            <div className="flex-1 overflow-y-auto">
                              <div className="grid grid-cols-3 gap-2">
                                {imageHistoryMap[activeItemId || '']?.map((url, idx) => (
                                  <div
                                    key={idx}
                                    className={cn(
                                      'relative aspect-square rounded-lg overflow-hidden border-2 cursor-pointer transition-all group',
                                      'border-transparent hover:border-muted-foreground/30'
                                    )}
                                    onClick={() => {
                                      const historyUrls = (
                                        imageHistoryMap[activeItemId || ''] || []
                                      )
                                        .map(url => getImageUrl(url))
                                        .filter((url): url is string => url !== null && url !== '')
                                      setPreviewImages(historyUrls)
                                      setPreviewCurrentIndex(idx)
                                      setShowPreviewDialog(true)
                                    }}
                                  >
                                    <img
                                      src={getImageUrl(url) || ''}
                                      alt={`历史 ${idx + 1}`}
                                      className="w-full h-full object-cover"
                                    />
                                    {/* 悬停显示操作按钮 */}
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        className="w-full text-xs"
                                        onClick={e => {
                                          e.stopPropagation()
                                          // 设为主图
                                          if (activeTab === 'storyboard') {
                                            updateStoryboardAsync({
                                              id: activeItem!.id,
                                              data: { image: url },
                                            })
                                          } else {
                                            updateLinkedAsset(activeTab, activeItem!.id, { image: url })
                                          }
                                          toast({ title: '已设为主图' })
                                        }}
                                      >
                                        <ImageIcon className="w-3 h-3 mr-1" />
                                        设为主图
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="h-full flex items-center justify-center">
                            <div className="text-center text-muted-foreground">
                              <History className="w-16 h-16 mx-auto mb-4 opacity-50" />
                              <p>暂无历史图片</p>
                              <p className="text-sm mt-1">生成的图片将自动显示在此处</p>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </TabsContent>

                  {/* 参考图 Tab */}
                  <TabsContent value="reference" className="flex-1 m-0 p-4 overflow-hidden">
                    <div className="h-full flex flex-col gap-4 overflow-y-auto">
                      {/* 模式标签 */}
                      <div className="flex items-center gap-2 pb-2 border-b">
                        <span className="text-sm font-medium">当前模式:</span>
                        <span className={cn(
                          "px-2 py-0.5 rounded text-xs font-medium",
                          generationType === 'image' 
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        )}>
                          {generationType === 'image' ? '图片生成' : '视频生成'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {generationType === 'image' 
                            ? '(参考图用于图片生成)' 
                            : '(参考图用于视频生成)'}
                        </span>
                      </div>

                      {/* 首尾帧区域 */}
                      <div className="space-y-3">
                        <label className="text-sm font-medium">首尾帧</label>
                        {/* 首帧 - 使用ReferenceImageInput组件 */}
                        <div className="space-y-2">
                          <label className="text-xs text-muted-foreground">首帧</label>
                          <ReferenceImageInput
                            label=""
                            placeholder="点击选择首帧图片"
                            value={(activeItem as any)?.image ? [(activeItem as any).image] : []}
                            onChange={async urls => {
                              if (urls.length > 0 && activeItem) {
                                const newImage = urls[0]!
                                // 不修改 localReferenceImages，首帧和参考图独立管理
                                // 更新首帧到资产
                                if (activeTab === 'storyboard') {
                                  await updateStoryboardAsync({
                                    id: activeItem.id,
                                    data: {
                                      image: newImage,
                                      // 首帧和参考图是独立的，不再自动同步
                                    },
                                  })
                                } else {
                                  await updateLinkedAsset(activeTab, activeItem.id, { image: newImage })
                                }
                                setGeneratedImage(newImage)
                                toast({ title: '首帧已更新' })
                                refreshData()
                              } else if (urls.length === 0 && activeItem) {
                                // 删除首帧，但保留参考图
                                if (activeTab === 'storyboard') {
                                  await updateStoryboardAsync({
                                    id: activeItem.id,
                                    data: { image: '' },
                                  })
                                } else {
                                  await updateLinkedAsset(activeTab, activeItem.id, { image: '' })
                                }
                                setGeneratedImage(null)
                                toast({ title: '首帧已删除' })
                                refreshData()
                              }
                            }}
                            maxReferences={1}
                            episodes={episodes}
                            storyboards={storyboards}
                            characters={characters}
                            scenes={scenes}
                            props={props}
                            currentEpisodeId={currentEpisodeId || undefined}
                            displayMode="large"
                          />
                        </div>
                        {/* 尾帧 */}
                        <div className="space-y-2">
                          <label className="text-xs text-muted-foreground">尾帧（可选）</label>
                          <div
                            className="h-36 bg-muted/50 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center relative overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
                            onClick={() => {
                              const input = document.createElement('input')
                              input.type = 'file'
                              input.accept = 'image/*'
                              input.onchange = async e => {
                                const file = (e.target as HTMLInputElement).files?.[0]
                                if (file && currentProjectId) {
                                  const arrayBuffer = await file.arrayBuffer()
                                  const { workspaceService } =
                                    await import('@/services/workspace/WorkspaceService')
                                  const metadata = await workspaceService.saveFile(
                                    new Uint8Array(arrayBuffer),
                                    'storyboard',
                                    file.name,
                                    {
                                      projectId: currentProjectId,
                                      episodeId: currentEpisodeId,
                                      saveMetadata: false,
                                    }
                                  )
                                  setLocalLastFrame(metadata.path)
                                }
                              }
                              input.click()
                            }}
                          >
                            {localLastFrame ? (
                              <>
                                <img
                                  src={getImageUrl(localLastFrame) || ''}
                                  alt="尾帧"
                                  className="w-full h-full object-cover"
                                />
                                <button
                                  onClick={e => {
                                    e.stopPropagation()
                                    setLocalLastFrame(undefined)
                                  }}
                                  className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 hover:opacity-100 transition-opacity"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                                <div className="absolute top-1 left-1 bg-secondary text-secondary-foreground text-xs px-1.5 py-0.5 rounded">
                                  尾帧
                                </div>
                              </>
                            ) : (
                              <div className="text-center text-muted-foreground">
                                <ImagePlus className="w-6 h-6 mx-auto mb-1 opacity-50" />
                                <span className="text-xs">点击添加尾帧</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 调试显示当前参考图状态 */}
                      <div className="text-xs text-muted-foreground mb-2">
                        当前{generationType === 'image' ? '图片' : '视频'}模式参考图数量: {(localReferenceImages || []).length}
                        {(localReferenceImages || []).length > 0 && (
                          <span className="ml-2">
                            路径: {(localReferenceImages || []).map((url, i) => (
                              <span key={i} className="inline-block bg-muted px-1 rounded mx-1" title={url}>
                                {url.substring(url.lastIndexOf('/') + 1, url.lastIndexOf('/') + 15)}...
                              </span>
                            ))}
                          </span>
                        )}
                      </div>

                      {/* 输入参考图像 - 包含手动选择和关联资产占位符 */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          参考图像（用于{generationType === 'image' ? '图片' : '视频'}生成）
                        </label>
                        <ReferenceImageInput
                          label=""
                          placeholder="点击选择参考图像"
                          value={localReferenceImages || []}
                          onChange={urls => {
                            console.log('[GenerationPage] ReferenceImageInput onChange:', urls)
                            setLocalReferenceImages(urls)
                          }}
                          onItemsChange={setSelectedReferenceItems}
                          maxReferences={10}
                          episodes={episodes}
                          storyboards={storyboards}
                          characters={characters}
                          scenes={scenes}
                          props={props}
                          currentEpisodeId={currentEpisodeId || undefined}
                          linkedAssets={linkedAssets}
                        />
                      </div>

                      {/* 编辑功能区 - 图生图 */}
                      <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            编辑提示词（将覆盖主提示词）
                            <span className="text-[10px] text-muted-foreground ml-2">(输入 @ 引用参考图)</span>
                          </span>
                          {localEditPrompt && (
                            <span className="text-xs text-primary">已输入</span>
                          )}
                        </div>
                        <MentionInput
                          ref={editPromptInputRef}
                          value={localEditPrompt || ''}
                          onChange={(val) => setLocalEditPrompt(val)}
                          onMentionsChange={setEditPromptMentions}
                          placeholder="输入编辑提示词，@ 引用参考图..."
                          customSearch={referenceSearch}
                          minRows={3}
                          maxRows={6}
                        />
                        <Button
                          className="w-full"
                          size="sm"
                          onClick={handleEditImage}
                          disabled={
                            isGenerating ||
                            !localEditPrompt?.trim() ||
                            (!localReferenceImages?.length && !(activeItem as any)?.image)
                          }
                        >
                          {isGenerating ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              生成中...
                            </>
                          ) : (
                            <>
                              <Wand2 className="w-4 h-4 mr-2" />
                              编辑图像
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </TabsContent>


                </Tabs>
              </div>

              {/* Right: Configuration Panel (55%) - Collapsible */}
              <div className={cn(
                "flex-1 overflow-y-auto bg-muted/10 transition-all duration-300",
                isParamPanelCollapsed ? "w-0 flex-none opacity-0 p-0" : "p-4"
              )}>
                <div className={cn("space-y-4", isParamPanelCollapsed && "hidden")}>
                {/* Generation Mode Toggle */}
                <Card className="border-0 shadow-none bg-muted/50">
                  <CardContent className="p-1">
                    <Tabs
                      value={generationMode}
                      onValueChange={v => setGenerationMode(v as GenerationMode)}
                      className="w-full"
                    >
                      <TabsList className="grid w-full grid-cols-2 h-9 bg-transparent p-0">
                        <TabsTrigger
                          value="ai"
                          className="text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"
                        >
                          <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                          AI 生成
                        </TabsTrigger>
                        <TabsTrigger
                          value="comfyui"
                          className="text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"
                        >
                          <Settings2 className="w-3.5 h-3.5 mr-1.5" />
                          ComfyUI
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </CardContent>
                </Card>

                {/* Model Selector / Workflow Selector - First */}
                    {generationMode === 'ai' ? (
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                            <Wand2 className="w-4 h-4" />
                            模型选择
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <VendorModelSelector
                            type={generationType === 'video' ? 'video' : 'image'}
                            value={selectedModelId}
                            onChange={handleVendorModelChange}
                            disabled={isGenerating}
                          />
                        </CardContent>
                      </Card>
                    ) : (
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm text-muted-foreground">工作流</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <select
                            value={selectedWorkflowId}
                            onChange={e => setSelectedWorkflowId(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            disabled={!comfyuiConnected}
                          >
                            <option value="">选择工作流</option>
                            {comfyuiWorkflows.map(workflow => (
                              <option key={workflow.id} value={workflow.id}>
                                {workflow.name}
                              </option>
                            ))}
                          </select>
                        </CardContent>
                      </Card>
                    )}

                {/* Prompt Editor - After model/workflow selection */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-muted-foreground">提示词</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        {generationType === 'video' ? '视频提示词' : '图片提示词'}
                        <span className="text-[10px] text-muted-foreground ml-2">(输入 @ 引用参考图)</span>
                      </label>
                      <MentionInput
                        ref={promptInputRef}
                        value={generationType === 'video' ? localVideoPrompt : localPrompt}
                        onChange={(val) => {
                          if (generationType === 'video') {
                            setLocalVideoPrompt(val)
                          } else {
                            setLocalPrompt(val)
                          }
                        }}
                        onMentionsChange={setPromptMentions}
                        placeholder={`输入${getTabLabel()}${generationType === 'video' ? '视频' : '图片'}提示词，@ 引用参考图...`}
                        customSearch={referenceSearch}
                        minRows={4}
                        maxRows={8}
                      />
                    </div>

                    {/* Negative Prompt for image mode - Collapsible */}
                    {generationType === 'image' && (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setIsNegativePromptExpanded(!isNegativePromptExpanded)}
                          className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <span className={cn(
                            "transform transition-transform duration-200",
                            isNegativePromptExpanded ? "rotate-90" : ""
                          )}>▶</span>
                          反向提示词
                          {localNegativePrompt && (
                            <span className="text-primary">(已填写)</span>
                          )}
                        </button>
                        {isNegativePromptExpanded && (
                          <Textarea
                            value={localNegativePrompt}
                            onChange={e => setLocalNegativePrompt(e.target.value)}
                            placeholder="输入不希望出现的内容..."
                            rows={2}
                            className="resize-none"
                          />
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Parameters Panel - After prompt */}
                {generationMode === 'ai' ? (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-muted-foreground">
                        {generationType === 'video' ? '视频参数' : '图片参数'}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* 自定义尺寸输入 */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium">图片尺寸 (像素)</label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={modelParams.width || 1024}
                            onChange={e => setModelParams({ ...modelParams, width: parseInt(e.target.value) || 1024 })}
                            className="flex-1"
                            placeholder="宽度"
                            min={256}
                            max={4096}
                            step={64}
                          />
                          <span className="text-muted-foreground">×</span>
                          <Input
                            type="number"
                            value={modelParams.height || 576}
                            onChange={e => setModelParams({ ...modelParams, height: parseInt(e.target.value) || 576 })}
                            className="flex-1"
                            placeholder="高度"
                            min={256}
                            max={4096}
                            step={64}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          建议尺寸: 256-4096，建议为64的倍数
                        </p>
                      </div>

                      {/* 快捷比例选择 */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium">快捷比例</label>
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { ratio: '1:1', w: 1, h: 1 },
                            { ratio: '16:9', w: 16, h: 9 },
                            { ratio: '9:16', w: 9, h: 16 },
                            { ratio: '4:3', w: 4, h: 3 },
                            { ratio: '3:4', w: 3, h: 4 },
                            { ratio: '21:9', w: 21, h: 9 },
                          ].map(({ ratio, w, h }) => (
                            <button
                              key={ratio}
                              onClick={() => {
                                const currentWidth = modelParams.width || 1024
                                const newHeight = Math.round(currentWidth * h / w)
                                setModelParams({ 
                                  ...modelParams, 
                                  aspectRatio: ratio, 
                                  height: newHeight 
                                })
                              }}
                              className={cn(
                                'px-3 py-2 text-xs rounded-md border transition-colors',
                                modelParams.aspectRatio === ratio
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-background border-input hover:bg-accent'
                              )}
                            >
                              {ratio}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 视频特有参数 */}
                      {generationType === 'video' && (
                        <>
                          {/* 分辨率选择 */}
                          <div className="space-y-2">
                            <label className="text-sm font-medium">分辨率</label>
                            <div className="flex flex-wrap gap-2">
                              {availableResolutions.map(r => (
                                <button
                                  key={r}
                                  onClick={() => setModelParams({ ...modelParams, resolution: r })}
                                  className={cn(
                                    'px-3 py-2 text-xs rounded-md border transition-colors',
                                    modelParams.resolution === r
                                      ? 'bg-primary text-primary-foreground border-primary'
                                      : 'bg-background border-input hover:bg-accent'
                                  )}
                                >
                                  {r}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* 时长选择 */}
                          <div className="space-y-2">
                            <label className="text-sm font-medium">时长 (秒)</label>
                            <div className="flex flex-wrap gap-2">
                              {availableDurations.map(d => (
                                <button
                                  key={d}
                                  onClick={() => setModelParams({ ...modelParams, duration: d })}
                                  className={cn(
                                    'px-3 py-2 text-xs rounded-md border transition-colors',
                                    modelParams.duration === d
                                      ? 'bg-primary text-primary-foreground border-primary'
                                      : 'bg-background border-input hover:bg-accent'
                                  )}
                                >
                                  {d}s
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* 音频开关 */}
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium">生成音频</label>
                            <button
                              onClick={() =>
                                setModelParams({ ...modelParams, audio: !modelParams.audio })
                              }
                              className={cn(
                                'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                                modelParams.audio ? 'bg-primary' : 'bg-muted'
                              )}
                            >
                              <span
                                className={cn(
                                  'inline-block h-3 w-3 transform rounded-full bg-white transition-transform',
                                  modelParams.audio ? 'translate-x-5' : 'translate-x-1'
                                )}
                              />
                            </button>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                        <Sliders className="w-4 h-4" />
                        工作流参数
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ComfyUIParamsPanel
                        workflow={selectedWorkflow}
                        params={comfyUIParams}
                        onParamsReady={getParams => {
                          getComfyUIParamsRef.current = getParams
                        }}
                        onChange={params => {
                          // 保存ComfyUI参数变化，包括宽高
                          setComfyUIParams(params)
                        }}
                        project={currentProject}
                        storyboard={{
                          // ComfyUI 模式使用工作流自身的宽高，不强制覆盖
                          // width: modelParams.width,
                          // height: modelParams.height,
                        }}
                      />
                    </CardContent>
                  </Card>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2 pt-4">
                  {generationMode === 'ai' ? (
                    <Button
                      className="flex-1"
                      size="default"
                      onClick={handleGenerateSingle}
                      disabled={!selectedModelId || isGenerating}
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          生成中...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          生成{generationType === 'video' ? '视频' : '图片'}
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      size="lg"
                      onClick={handleGenerateComfyUI}
                      disabled={
                        !selectedWorkflowId || !comfyuiConnected || isGenerating
                      }
                    >
                      <Play className="w-4 h-4 mr-2" />
                      {isGenerating ? '生成中...' : '运行工作流'}
                    </Button>
                  )}


                </div>

                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Create Dialog */}
      <AssetCreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        defaultCategory={activeTab as AssetCreateCategory}
        projectId={currentProjectId || undefined}
        episodeId={currentEpisodeId || undefined}
        existingItems={currentItems.map(item => ({ id: item.id, name: item.name }))}
        onSubmit={handleAssetCreate}
      />

      <ImagePreviewDialog
        src={previewImages[0] || ''}
        images={previewImages}
        currentIndex={previewCurrentIndex}
        isOpen={showPreviewDialog}
        onClose={() => setShowPreviewDialog(false)}
        onIndexChange={setPreviewCurrentIndex}
      />
    </div>
  )
}
