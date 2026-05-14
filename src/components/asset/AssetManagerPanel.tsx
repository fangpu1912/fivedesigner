import { useState, useMemo, useRef, useCallback, useEffect } from 'react'

import { convertFileSrc } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { writeFile, readFile } from '@tauri-apps/plugin-fs'
import { saveMediaFile } from '@/utils/mediaStorage'
import {
  Plus,
  Trash2,
  Search,
  FileJson,
  User,
  Mountain,
  Box,
  Image as ImageIcon,
  FolderOpen,
  Check,
  CheckSquare,
  Download,
  Upload,
  Loader2,
  X,
  Sparkles,
  Video,
  MapPin,
  Save,
  Pencil,
  LayoutGrid,
  Images,
  Shirt,
} from 'lucide-react'
import { AssetCreateDialog, type AssetCreateCategory, type AssetCreateData } from './AssetCreateDialog'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/useToast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  useCharactersByEpisode,
  useCharacterMutations,
} from '@/hooks/useCharacters'
import {
  useScenesByEpisode,
  useSceneMutations,
} from '@/hooks/useAssetManager'
import {
  usePropsByEpisode,
  usePropMutations,
} from '@/hooks/useAssetManager'
import {
  useStoryboards,
  useStoryboardMutations,
} from '@/hooks/useStoryboards'

import { AssetGalleryView } from './AssetGalleryView'
import { CharacterWardrobeDialog } from './CharacterWardrobeDialog'
import { ImagePreviewDialog } from '@/components/media/ImagePreviewDialog'

// 资产分类类型
export type AssetCategory = 'character' | 'scene' | 'prop' | 'storyboard'

// 资产项接口
export interface AssetItem {
  id: string
  name: string
  description?: string
  prompt?: string
  videoPrompt?: string
  category: AssetCategory
  tags?: string[]
  thumbnail?: string
  image?: string
  filePath?: string
  fileSize?: number
  fileType?: string
  metadata?: Record<string, unknown>
  scene_id?: string
  character_ids?: string[]
  prop_ids?: string[]
  scene_name?: string
  character_names?: string[]
  prop_names?: string[]
  sort_order?: number
  project_id?: string
  episode_id?: string
  createdAt: string
  updatedAt: string
}

// 分类配置
const CATEGORY_CONFIG: Record<
  AssetCategory,
  {
    label: string
    icon: React.ReactNode
    color: string
    bgColor: string
    description: string
    acceptTypes?: string
  }
> = {
  character: {
    label: '角色',
    icon: <User className="w-4 h-4" />,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    description: '剧本中的角色人物',
    acceptTypes: '.jpg,.jpeg,.png,.webp',
  },
  scene: {
    label: '场景',
    icon: <Mountain className="w-4 h-4" />,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    description: '故事发生的地点环境',
    acceptTypes: '.jpg,.jpeg,.png,.webp',
  },
  prop: {
    label: '道具',
    icon: <Box className="w-4 h-4" />,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    description: '剧中使用的物品道具',
    acceptTypes: '.jpg,.jpeg,.png,.webp',
  },
  storyboard: {
    label: '分镜',
    icon: <ImageIcon className="w-4 h-4" />,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    description: '分镜设计和镜头规划',
    acceptTypes: '.jpg,.jpeg,.png,.webp',
  },
}

interface AssetManagerPanelProps {
  projectId?: string
  episodeId?: string
  onNavigate?: (type: 'character' | 'scene' | 'prop' | 'storyboard', id: string) => void
}

export function AssetManagerPanel({ projectId, episodeId }: AssetManagerPanelProps) {
  const { toast } = useToast()
  const characterMutations = useCharacterMutations()
  const sceneMutations = useSceneMutations()
  const propMutations = usePropMutations()
  const storyboardMutations = useStoryboardMutations()
  const { data: characters = [] } = useCharactersByEpisode(episodeId || undefined)
  const { data: scenes = [] } = useScenesByEpisode(episodeId || undefined)
  const { data: props = [] } = usePropsByEpisode(episodeId || undefined)
  const { data: storyboards = [] } = useStoryboards(episodeId || '')
  const [activeCategory, setActiveCategory] = useState<AssetCategory>('character')

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set())
  const [batchMode, setBatchMode] = useState(false)
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [detailPanelOpen, setDetailPanelOpen] = useState(false)
  const [detailPanelMode, setDetailPanelMode] = useState<'preview' | 'edit'>('preview')
  const [viewMode, setViewMode] = useState<'grid' | 'gallery'>('gallery')

  // 对话框状态
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [currentAsset, setCurrentAsset] = useState<AssetItem | null>(null)
  const [previewIndex, setPreviewIndex] = useState(0)

  // 导入状态
  const [importJsonInput, setImportJsonInput] = useState('')
  const [importFilePath, setImportFilePath] = useState<string | null>(null)

  // 表单状态
  const [createCategory, setCreateCategory] = useState<AssetCategory>('character')
  const [createName, setCreateName] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [createPrompt, setCreatePrompt] = useState('')
  const [createVideoPrompt, setCreateVideoPrompt] = useState('')
  const [createTags, setCreateTags] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [editImage, setEditImage] = useState<string | null>(null)

  const updateAsset = useCallback(
    async (category: AssetCategory, id: string, data: Record<string, unknown>) => {
      if (category === 'character') {
        await characterMutations.update.mutateAsync({ id, data })
      } else if (category === 'scene') {
        await sceneMutations.update.mutateAsync({ id, data })
      } else if (category === 'prop') {
        await propMutations.update.mutateAsync({ id, data })
      } else if (category === 'storyboard') {
        await storyboardMutations.updateStoryboard.mutateAsync({ id, data })
      }
    },
    [characterMutations, sceneMutations, propMutations, storyboardMutations]
  )

  const createAsset = useCallback(
    async (category: AssetCategory, data: Record<string, unknown>) => {
      if (category === 'character') {
        return characterMutations.create.mutateAsync(data as any)
      } else if (category === 'scene') {
        return sceneMutations.create.mutateAsync(data as any)
      } else if (category === 'prop') {
        return propMutations.create.mutateAsync(data as any)
      } else {
        return storyboardMutations.createStoryboard.mutateAsync(data as any)
      }
    },
    [characterMutations, sceneMutations, propMutations, storyboardMutations]
  )

  const assets = useMemo(() => {
    if (!episodeId) return []

    const characterAssets: AssetItem[] = characters.map(char => ({
      id: char.id,
      name: char.name,
      description: typeof char.description === 'string' ? char.description : '',
      prompt: char.prompt || '',
      category: 'character',
      tags: char.tags,
      thumbnail: char.image,
      image: char.image,
      createdAt: char.created_at || new Date().toISOString(),
      updatedAt: char.updated_at || new Date().toISOString(),
    }))

    const sceneAssets: AssetItem[] = scenes.map(scene => ({
      id: scene.id,
      name: scene.name,
      description: scene.description || '',
      prompt: scene.prompt || '',
      category: 'scene' as const,
      tags: scene.tags,
      thumbnail: scene.image,
      image: scene.image,
      createdAt: scene.created_at || new Date().toISOString(),
      updatedAt: scene.updated_at || new Date().toISOString(),
    }))

    const propAssets: AssetItem[] = props.map(prop => ({
      id: prop.id,
      name: prop.name,
      description: prop.description || '',
      prompt: prop.prompt || '',
      category: 'prop' as const,
      tags: prop.tags,
      thumbnail: prop.image,
      image: prop.image,
      createdAt: prop.created_at || new Date().toISOString(),
      updatedAt: prop.updated_at || new Date().toISOString(),
    }))

    const storyboardAssets: AssetItem[] = storyboards.map(sb => {
      const characterNames = (sb.character_ids || [])
        .map((id: string) => {
          const char = characters.find(c => c.id === id)
          return char?.name
        })
        .filter((name): name is string => !!name)

      const sceneName = sb.scene_id ? scenes.find(s => s.id === sb.scene_id)?.name : undefined

      const propNames = (sb.prop_ids || [])
        .map((id: string) => {
          const prop = props.find(p => p.id === id)
          return prop?.name
        })
        .filter((name): name is string => !!name)

      return {
        id: sb.id,
        name: sb.name || `分镜 ${(sb.sort_order || 0) + 1}`,
        description: sb.description || '',
        prompt: sb.prompt || '',
        videoPrompt: sb.video_prompt || '',
        category: 'storyboard' as const,
        tags: [],
        thumbnail: sb.image,
        image: sb.image,
        scene_id: sb.scene_id,
        character_ids: sb.character_ids,
        prop_ids: sb.prop_ids,
        scene_name: sceneName,
        character_names: characterNames,
        prop_names: propNames,
        sort_order: sb.sort_order,
        createdAt: sb.created_at || new Date().toISOString(),
        updatedAt: sb.updated_at || new Date().toISOString(),
      }
    })

    return [
      ...characterAssets,
      ...sceneAssets,
      ...propAssets,
      ...storyboardAssets,
    ]
  }, [episodeId, characters, scenes, props, storyboards])

  const handleAssetCreate = useCallback(
    async (data: AssetCreateData) => {
      try {
        if (data.jsonItems && data.jsonItems.length > 0) {
          const categoryAssets = assets.filter(a => a.category === data.category)
          let baseSortOrder = categoryAssets.length

          if (data.insertPosition === 'start') {
            baseSortOrder = 0
          } else if (typeof data.insertPosition === 'number') {
            baseSortOrder = data.insertPosition
          }

          for (let i = 0; i < data.jsonItems.length; i++) {
            const item = data.jsonItems[i]!
            const category = item.category || data.category
            const sortOrder = baseSortOrder + i

            if (category === 'character') {
              await createAsset(category, {
                project_id: projectId || '',
                episode_id: episodeId || '',
                name: item.name || '未命名',
                description: item.description || '',
                prompt: item.prompt || '',
                tags: item.tags || [],
              })
            } else if (category === 'storyboard') {
              await createAsset(category, {
                episode_id: episodeId || '',
                project_id: projectId || '',
                name: item.name || '未命名',
                description: item.description || '',
                prompt: item.prompt || '',
                video_prompt: item.videoPrompt || '',
                sort_order: sortOrder,
              })
            } else if (category === 'scene') {
              await createAsset(category, {
                project_id: projectId || '',
                episode_id: episodeId,
                name: item.name || '未命名',
                description: item.description || '',
                prompt: item.prompt || '',
                tags: item.tags || [],
              })
            } else if (category === 'prop') {
              await createAsset(category, {
                project_id: projectId || '',
                episode_id: episodeId,
                name: item.name || '未命名',
                description: item.description || '',
                prompt: item.prompt || '',
                tags: item.tags || [],
              })
            }
          }

          toast({ title: `成功创建 ${data.jsonItems.length} 个资产` })
        } else {
          const tags = data.tags || []

          if (data.category === 'character') {
            await createAsset(data.category, {
              project_id: projectId || '',
              episode_id: episodeId || '',
              name: data.name,
              description: data.description,
              prompt: data.prompt,
              tags,
              image: data.image,
            })
          } else if (data.category === 'scene') {
            await createAsset(data.category, {
              project_id: projectId || '',
              episode_id: episodeId,
              name: data.name,
              description: data.description,
              prompt: data.prompt,
              tags,
              image: data.image,
            })
          } else if (data.category === 'prop') {
            await createAsset(data.category, {
              project_id: projectId || '',
              episode_id: episodeId,
              name: data.name,
              description: data.description,
              prompt: data.prompt,
              tags,
              image: data.image,
            })
          } else if (data.category === 'storyboard') {
            const categoryAssets = assets.filter(a => a.category === data.category)
            let sortOrder = categoryAssets.length

            if (data.insertPosition === 'start') {
              sortOrder = 0
            } else if (typeof data.insertPosition === 'number') {
              sortOrder = data.insertPosition
            }

            await createAsset(data.category, {
              episode_id: episodeId || '',
              project_id: projectId || '',
              name: data.name,
              description: data.description,
              prompt: data.prompt,
              video_prompt: data.videoPrompt,
              sort_order: sortOrder,
            })
          }

          toast({ title: '创建成功' })
        }
      } catch (error) {
        console.error('创建资产失败:', error)
        toast({ title: '创建失败', variant: 'destructive' })
      }
    },
    [assets, projectId, episodeId, createAsset]
  )

  const deleteAsset = useCallback(
    async (category: AssetCategory, id: string) => {
      if (category === 'character') {
        await characterMutations.remove.mutateAsync(id)
      } else if (category === 'scene') {
        await sceneMutations.remove.mutateAsync(id)
      } else if (category === 'prop') {
        await propMutations.remove.mutateAsync(id)
      } else if (category === 'storyboard') {
        await storyboardMutations.deleteStoryboard.mutateAsync(id)
      }
    },
    [characterMutations, sceneMutations, propMutations, storyboardMutations]
  )

  // 过滤资产
  const filteredAssets = assets.filter(asset => {
    const matchesCategory = asset.category === activeCategory
    const matchesSearch =
      (asset.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (asset.description?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      asset.tags?.some(tag => (tag?.toLowerCase() || '').includes(searchQuery.toLowerCase()))
    return matchesCategory && matchesSearch
  })

  // 获取分类统计
  const getCategoryCount = (category: AssetCategory) => {
    return assets.filter(a => a.category === category).length
  }

  // 编辑资产
  const handleEdit = async () => {
    if (!currentAsset || !createName.trim()) return

    try {
      const tags = createTags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean)

      if (currentAsset.category === 'character') {
        await updateAsset(currentAsset.category, currentAsset.id, {
          name: createName,
          description: createDescription,
          prompt: createPrompt,
          tags,
          image: editImage,
        })
      } else if (currentAsset.category === 'scene') {
        await updateAsset(currentAsset.category, currentAsset.id, {
          name: createName,
          description: createDescription,
          prompt: createPrompt,
          tags,
          image: editImage,
        })
      } else if (currentAsset.category === 'prop') {
        await updateAsset(currentAsset.category, currentAsset.id, {
          name: createName,
          description: createDescription,
          prompt: createPrompt,
          tags,
          image: editImage,
        })
      } else if (currentAsset.category === 'storyboard') {
        await updateAsset(currentAsset.category, currentAsset.id, {
          name: createName,
          description: createDescription,
          prompt: createPrompt,
          video_prompt: createVideoPrompt,
          metadata: { tags },
          image: editImage,
        })
      }

      toast({ title: '更新成功' })
      resetCreateForm()
      setEditDialogOpen(false) // 重新加载
    } catch (error) {
      console.error('更新资产失败:', error)
      toast({ title: '更新失败', variant: 'destructive' })
    }
  }

  // 处理资产图片上传
  const handleAssetImageUpload = async (asset: AssetItem, imagePath: string) => {
    try {
      await updateAsset(asset.category, asset.id, { image: imagePath })
    } catch (error) {
      console.error('上传图片失败:', error)
      toast({ title: '上传图片失败', variant: 'destructive' })
    }
  }

  // 处理资产图片移除
  const handleAssetImageRemove = async (asset: AssetItem) => {
    try {
      await updateAsset(asset.category, asset.id, { image: undefined })
    } catch (error) {
      console.error('移除图片失败:', error)
      toast({ title: '移除图片失败', variant: 'destructive' })
    }
  }

  // 删除资产
  const handleDelete = async () => {
    if (!currentAsset) return

    try {
      await deleteAsset(currentAsset.category, currentAsset.id)

      toast({ title: '删除成功' })
      setDeleteDialogOpen(false)
      setCurrentAsset(null) // 重新加载
    } catch (error) {
      console.error('删除资产失败:', error)
      toast({ title: '删除失败', variant: 'destructive' })
    }
  }

  // 批量删除
  const handleBatchDelete = async () => {
    try {
      for (const assetId of selectedAssets) {
        const asset = assets.find(a => a.id === assetId)
        if (asset) {
          await deleteAsset(asset.category, asset.id)
        }
      }

      toast({ title: `删除 ${selectedAssets.size} 个资产` })
      setSelectedAssets(new Set()) // 重新加载
    } catch (error) {
      console.error('批量删除失败:', error)
      toast({ title: '删除失败', variant: 'destructive' })
    }
  }

  // 重置表单
  const resetCreateForm = () => {
    setCreateName('')
    setCreateDescription('')
    setCreatePrompt('')
    setCreateVideoPrompt('')
    setCreateTags('')
    setEditImage(null)
  }

  // 打开编辑对话框
  const openEditDialog = (asset: AssetItem) => {
    setCurrentAsset(asset)
    setCreateName(asset.name)
    setCreateDescription(asset.description || '')
    setCreatePrompt(asset.prompt || '')
    setCreateVideoPrompt(asset.videoPrompt || '')
    setCreateTags(asset.tags?.join(', ') || '')
    setCreateCategory(asset.category)
    setEditImage(asset.image || null)
    setEditDialogOpen(true)
  }

  // 打开删除对话框
  const openDeleteDialog = (asset: AssetItem) => {
    setCurrentAsset(asset)
    setDeleteDialogOpen(true)
  }

  // 切换选择
  const toggleSelection = (id: string) => {
    setSelectedAssets(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  // 导出 JSON
  const exportJson = async () => {
    try {
      const dataStr = JSON.stringify(filteredAssets, null, 2)

      // 打开保存对话框
      const savePath = await save({
        defaultPath: `assets_${activeCategory}_${new Date().toISOString().slice(0, 10)}.json`,
        filters: [
          { name: 'JSON 文件', extensions: ['json'] },
          { name: '所有文件', extensions: ['*'] },
        ],
        title: '导出资产',
      })

      if (!savePath) return

      // 写入文件
      await writeFile(savePath, new TextEncoder().encode(dataStr))

      toast({
        title: '导出成功',
        description: `资产已保存到: ${savePath}`,
      })
    } catch (error) {
      console.error('导出失败:', error)
      toast({
        title: '导出失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      })
    }
  }

  // 打开导入对话框
  const importJson = () => {
    // 预填示例内容
    setImportJsonInput(`{
  "characters": [
    {
      "category": "character",
      "name": "主角-李明",
      "description": "25岁左右的年轻男性，身材中等，短发，眼神坚定",
      "prompt": "25-year-old Asian male, short black hair, determined eyes...",
      "tags": ["主角", "男性", "现代"]
    }
  ],
  "scenes": [
    {
      "category": "scene",
      "name": "现代办公室",
      "description": "宽敞明亮的现代办公室，落地窗外是城市夜景",
      "prompt": "Modern office interior, spacious and bright...",
      "tags": ["室内", "现代", "办公室"]
    }
  ],
  "props": [
    {
      "category": "prop",
      "name": "神秘信封",
      "description": "泛黄的旧信封，封口处有红色蜡封",
      "prompt": "Old yellowed envelope, red wax seal...",
      "tags": ["道具", "神秘", "复古"]
    }
  ],
  "storyboards": [
    {
      "category": "storyboard",
      "name": "开场-办公室全景",
      "description": "广角镜头展示办公室全景",
      "prompt": "Wide shot, modern office interior...",
      "videoPrompt": "Slow pan from window to protagonist...",
      "sort_order": 1
    }
  ]
}`)
    setImportFilePath(null)
    setImportDialogOpen(true)
  }

  // 选择导入文件
  const handleSelectImportFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          { name: 'JSON 文件', extensions: ['json'] },
          { name: '所有文件', extensions: ['*'] },
        ],
        title: '选择资产 JSON 文件',
      })

      if (selected) {
        const filePath = selected as string
        setImportFilePath(filePath)

        // 读取文件内容
        const fileData = await readFile(filePath)
        const content = new TextDecoder().decode(fileData)
        setImportJsonInput(content)
      }
    } catch (error) {
      console.error('选择文件失败:', error)
      toast({
        title: '选择文件失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      })
    }
  }

  // 执行导入
  const handleImport = async () => {
    if (!importJsonInput.trim()) {
      toast({
        title: '请输入 JSON 内容',
        description: '请粘贴 JSON 内容或选择文件',
        variant: 'destructive',
      })
      return
    }

    try {
      // 解析 JSON
      let jsonData: AssetItem | AssetItem[]
      try {
        jsonData = JSON.parse(importJsonInput)
      } catch {
        toast({
          title: 'JSON 格式错误',
          description: '无法解析 JSON 内容，请检查格式',
          variant: 'destructive',
        })
        return
      }

      // 转换为数组
      const newAssets: AssetItem[] = Array.isArray(jsonData) ? jsonData : [jsonData]

      if (newAssets.length === 0) {
        toast({
          title: '没有可导入的资产',
          description: 'JSON 中未找到有效的资产数据',
          variant: 'destructive',
        })
        return
      }

      // 统计各类资产数量
      const stats = {
        character: 0,
        scene: 0,
        prop: 0,
        storyboard: 0,
      }

      // 创建资产
      let createdCount = 0
      for (const asset of newAssets) {
        const category = asset.category || activeCategory
        stats[category]++

        try {
          // 🔑 优先使用 JSON 中的 project_id 和 episode_id，如果没有则使用当前页面选中的
          const assetProjectId = asset.project_id || projectId || ''
          const assetEpisodeId = asset.episode_id || episodeId || ''
          
          if (category === 'character') {
            await createAsset(category, {
              project_id: assetProjectId,
              episode_id: assetEpisodeId,
              name: asset.name || '未命名角色',
              description: asset.description || '',
              prompt: asset.prompt || '',
              tags: asset.tags || [],
            })
          } else if (category === 'scene') {
            await createAsset(category, {
              project_id: assetProjectId,
              episode_id: assetEpisodeId,
              name: asset.name || '未命名场景',
              description: asset.description || '',
              prompt: asset.prompt || '',
              tags: asset.tags || [],
            })
          } else if (category === 'prop') {
            await createAsset(category, {
              project_id: assetProjectId,
              episode_id: assetEpisodeId,
              name: asset.name || '未命名道具',
              description: asset.description || '',
              prompt: asset.prompt || '',
              tags: asset.tags || [],
            })
          } else if (category === 'storyboard') {
            await createAsset(category, {
              episode_id: assetEpisodeId,
              project_id: assetProjectId,
              name: asset.name || '未命名分镜',
              description: asset.description || '',
              prompt: asset.prompt || '',
              video_prompt: asset.videoPrompt || '',
              sort_order: asset.sort_order || 0,
            })
          }
          createdCount++
        } catch (error) {
          console.error(`创建资产失败: ${asset.name}`, error)
        }
      }

      // 关闭对话框
      setImportDialogOpen(false)

      toast({
        title: '导入成功',
        description: `成功导入 ${createdCount} 个资产：角色 ${stats.character}，场景 ${stats.scene}，道具 ${stats.prop}，分镜 ${stats.storyboard}`,
      })
    } catch (error) {
      console.error('导入失败:', error)
      toast({
        title: '导入失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      })
    }
  }



  // 获取文件URL
  const getFileUrl = (path?: string) => {
    if (!path) return null
    if (path.startsWith('http') || path.startsWith('data:')) return path
    return convertFileSrc(path)
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">资产管理</h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>共 {assets.length} 项</span>
            {selectedAssets.size > 0 && (
              <Badge variant="secondary">已选 {selectedAssets.size}</Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 搜索 */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索资产..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 w-56"
            />
          </div>

          {/* 视图切换 */}
          <div className="flex items-center border rounded-lg p-1 bg-muted/50">
            <button
              onClick={() => setViewMode('gallery')}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded text-sm transition-colors',
                viewMode === 'gallery' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Images className="h-4 w-4" />
              画廊
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded text-sm transition-colors',
                viewMode === 'grid' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <LayoutGrid className="h-4 w-4" />
              网格
            </button>
          </div>

          {/* 批量操作 */}
          {!batchMode ? (
            <Button variant="outline" size="sm" onClick={() => setBatchMode(true)}>
              <CheckSquare className="h-4 w-4 mr-1" />
              批量
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // 全选当前筛选的资产
                  const allIds = new Set(filteredAssets.map(a => a.id))
                  setSelectedAssets(allIds)
                }}
              >
                <CheckSquare className="h-4 w-4 mr-1" />
                全选 ({filteredAssets.length})
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBatchDelete}
                disabled={selectedAssets.size === 0}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                删除 ({selectedAssets.size})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setBatchMode(false)
                  setSelectedAssets(new Set())
                }}
              >
                取消
              </Button>
            </>
          )}

          {/* 导入 JSON */}
          <Button variant="outline" size="sm" onClick={importJson}>
            <Upload className="h-4 w-4 mr-1" />
            导入
          </Button>

          {/* 导出 */}
          <Button variant="outline" size="sm" onClick={exportJson}>
            <Download className="h-4 w-4 mr-1" />
            导出
          </Button>

          {/* 新建 */}
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            新建
          </Button>
        </div>
      </div>

      {/* 分类标签 - 现代 Tab 样式 */}
      <div className="flex items-center gap-1 px-4 py-2 border-b">
        {(Object.keys(CATEGORY_CONFIG) as AssetCategory[]).map(category => (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all',
              activeCategory === category
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            {CATEGORY_CONFIG[category].icon}
            <span>{CATEGORY_CONFIG[category].label}</span>
            <span
              className={cn(
                'text-xs px-1.5 py-0.5 rounded-full',
                activeCategory === category ? 'bg-primary-foreground/20' : 'bg-muted'
              )}
            >
              {getCategoryCount(category)}
            </span>
          </button>
        ))}
      </div>

      {/* 主内容区 */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'gallery' ? (
          /* 画廊视图 */
          <AssetGalleryView
            assets={filteredAssets}
            activeCategory={activeCategory}
            selectedAssetId={selectedAssetId}
            onSelect={setSelectedAssetId}
            onEdit={openEditDialog}
            onDelete={openDeleteDialog}
            onImageUpload={handleAssetImageUpload}
            onImageRemove={handleAssetImageRemove}
            onSave={async (updatedAsset) => {
              try {
                const updateData: Record<string, unknown> = {
                  name: updatedAsset.name,
                  description: updatedAsset.description,
                  prompt: updatedAsset.prompt,
                  tags: updatedAsset.tags,
                }
                if (updatedAsset.category === 'storyboard') {
                  updateData.video_prompt = updatedAsset.videoPrompt
                }
                await updateAsset(updatedAsset.category, updatedAsset.id, updateData)
              } catch (error) {
                console.error('保存失败:', error)
                throw error
              }
            }}
            getFileUrl={getFileUrl}
            projectId={projectId}
            episodeId={episodeId}
          />
        ) : (
          /* 网格视图 */
          <div className="flex-1 flex overflow-hidden h-full">
            {/* 左侧资产列表 */}
            <div className="flex-1 overflow-auto min-w-0">
              {filteredAssets.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <FolderOpen className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">暂无资产</p>
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={() => setCreateDialogOpen(true)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      创建第一个资产
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-4">
                  {filteredAssets.map((asset, index) => (
                    <AssetCard
                      key={asset.id}
                      asset={asset}
                      selected={selectedAssetId === asset.id || selectedAssets.has(asset.id)}
                      batchMode={batchMode}
                      onSelect={() => {
                        if (batchMode) {
                          toggleSelection(asset.id)
                        } else {
                          setSelectedAssetId(selectedAssetId === asset.id ? null : asset.id)
                          if (selectedAssetId !== asset.id) {
                            setDetailPanelOpen(true)
                            setDetailPanelMode('preview')
                          }
                        }
                      }}
                      onEdit={() => {
                        setSelectedAssetId(asset.id)
                        setDetailPanelOpen(true)
                        setDetailPanelMode('edit')
                      }}
                      onDelete={() => openDeleteDialog(asset)}
                      onPreview={() => {
                        setCurrentAsset(asset)
                        setPreviewIndex(index)
                        setPreviewDialogOpen(true)
                      }}
                      onOpenDetail={() => {
                        setSelectedAssetId(asset.id)
                        setDetailPanelOpen(true)
                        setDetailPanelMode('preview')
                      }}
                      getFileUrl={getFileUrl}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* 右侧可折叠画廊式面板 */}
            {selectedAssetId &&
              (() => {
                const asset = assets.find(a => a.id === selectedAssetId)
                if (!asset) return null
                return (
                  <AssetDetailPanel
                    asset={asset}
                    mode={detailPanelMode}
                    open={detailPanelOpen}
                    onCollapse={() => setDetailPanelOpen(false)}
                    onOpen={() => setDetailPanelOpen(true)}
                    onModeChange={(mode) => setDetailPanelMode(mode)}
                    onSave={async updatedAsset => {
                      try {
                        const updateData: Record<string, unknown> = {
                          name: updatedAsset.name,
                          description: updatedAsset.description,
                          prompt: updatedAsset.prompt,
                          tags: updatedAsset.tags,
                        }
                        if (updatedAsset.category === 'storyboard') {
                          updateData.video_prompt = updatedAsset.videoPrompt
                        }
                        await updateAsset(updatedAsset.category, updatedAsset.id, updateData)
                        toast({ title: '保存成功' })
                      } catch (error) {
                        console.error('保存失败:', error)
                        toast({ title: '保存失败', variant: 'destructive' })
                      }
                    }}
                    onDelete={() => {
                      openDeleteDialog(asset)
                      setDetailPanelOpen(false)
                    }}
                    onImageUpload={handleAssetImageUpload}
                    onImageRemove={handleAssetImageRemove}
                    getFileUrl={getFileUrl}
                    projectId={projectId}
                    episodeId={episodeId}
                  />
                )
              })()}
          </div>
        )}
      </div>

      {/* 创建对话框 */}
      <AssetCreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        defaultCategory={createCategory as AssetCreateCategory}
        projectId={projectId}
        episodeId={episodeId}
        existingItems={assets.map(item => ({ id: item.id, name: item.name }))}
        onSubmit={handleAssetCreate}
      />

      {/* 编辑对话框 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑资产</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* 图片上传区域 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">资产图片</label>
              <div className="flex items-center gap-4">
                <div className="relative w-24 h-24 group">
                  {editImage ? (
                    <>
                      <img
                        src={getFileUrl(editImage) || ''}
                        alt="资产图片"
                        className="w-full h-full object-cover rounded-lg border"
                      />
                      <button
                        onClick={() => setEditImage(null)}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-destructive text-white rounded-full flex items-center justify-center shadow-lg"
                        title="移除图片"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => document.getElementById('edit-image-input')?.click()}
                      disabled={isUploading}
                      className="w-full h-full border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center hover:border-primary hover:bg-muted/50 transition-colors disabled:opacity-50"
                    >
                      {isUploading ? (
                        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <Upload className="w-6 h-6 text-muted-foreground mb-1" />
                          <span className="text-xs text-muted-foreground">上传图片</span>
                        </>
                      )}
                    </button>
                  )}
                  <input
                    id="edit-image-input"
                    type="file"
                    accept="image/*"
                    onChange={async e => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      if (!file.type.startsWith('image/')) {
                        toast({
                          title: '上传失败',
                          description: '请选择图片文件',
                          variant: 'destructive',
                        })
                        return
                      }
                      setIsUploading(true)
                      try {
                        const reader = new FileReader()
                        reader.onload = async event => {
                          const base64Data = event.target?.result as string
                          if (!base64Data) return
                          const imagePath = await saveMediaFile(
                            base64Data,
                            file.name,
                            projectId || '',
                            episodeId || '',
                            'image'
                          )
                          setEditImage(imagePath)
                          toast({ title: '上传成功', description: '图片已保存' })
                        }
                        reader.readAsDataURL(file)
                      } catch (error) {
                        toast({
                          title: '上传失败',
                          description: error instanceof Error ? error.message : '请重试',
                          variant: 'destructive',
                        })
                      } finally {
                        setIsUploading(false)
                      }
                    }}
                    className="hidden"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  支持 JPG、PNG、WebP 格式
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">资产类型</label>
              <Select
                value={createCategory}
                onValueChange={v => setCreateCategory(v as AssetCategory)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_CONFIG) as AssetCategory[]).map(cat => (
                    <SelectItem key={cat} value={cat}>
                      <div className="flex items-center gap-2">
                        {CATEGORY_CONFIG[cat].icon}
                        {CATEGORY_CONFIG[cat].label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">名称</label>
              <Input
                value={createName}
                onChange={e => setCreateName(e.target.value)}
                placeholder="请输入名称"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">描述</label>
              <Textarea
                value={createDescription}
                onChange={e => setCreateDescription(e.target.value)}
                placeholder="请输入描述"
                rows={3}
              />
            </div>

            {/* 提示词（仅角色、场景、道具、分镜） */}
            {['character', 'scene', 'prop', 'storyboard'].includes(createCategory) && (
              <div className="space-y-2">
                <label className="text-sm font-medium">提示词</label>
                <Textarea
                  value={createPrompt}
                  onChange={e => setCreatePrompt(e.target.value)}
                  placeholder="AI 生图提示词（可选）"
                  rows={3}
                />
              </div>
            )}

            {/* 视频提示词（仅分镜） */}
            {createCategory === 'storyboard' && (
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1">
                  <Video className="h-3 w-3" />
                  视频提示词
                </label>
                <Textarea
                  value={createVideoPrompt}
                  onChange={e => setCreateVideoPrompt(e.target.value)}
                  placeholder="AI 生视频提示词（可选）"
                  rows={3}
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">标签</label>
              <Input
                value={createTags}
                onChange={e => setCreateTags(e.target.value)}
                placeholder="多个标签用逗号分隔"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                resetCreateForm()
                setEditDialogOpen(false)
              }}
            >
              取消
            </Button>
            <Button onClick={handleEdit}>
              <Check className="h-4 w-4 mr-1" />
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除资产「{currentAsset?.name}」吗？此操作不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-1" />
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 导入 JSON 对话框 */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileJson className="h-5 w-5" />
              导入资产 JSON
            </DialogTitle>
            <DialogDescription>
              从 JSON 文件批量导入角色、场景、道具、分镜等资产
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex flex-col gap-4 py-4">
            {/* 选择文件按钮 */}
            <Button variant="outline" onClick={handleSelectImportFile} className="w-full">
              <FolderOpen className="h-4 w-4 mr-2" />
              选择 JSON 文件
            </Button>

            {/* 文件路径显示 */}
            {importFilePath && (
              <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                已选择: {importFilePath}
              </div>
            )}

            {/* JSON 输入区域 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">JSON 内容</label>
              <Textarea
                value={importJsonInput}
                onChange={e => setImportJsonInput(e.target.value)}
                placeholder={`// 示例格式：
{
  "characters": [
    {
      "category": "character",
      "name": "主角-李明",
      "description": "25岁左右的年轻男性，身材中等，短发，眼神坚定",
      "prompt": "25-year-old Asian male, short black hair, determined eyes...",
      "tags": ["主角", "男性", "现代"]
    }
  ],
  "scenes": [
    {
      "category": "scene",
      "name": "现代办公室",
      "description": "宽敞明亮的现代办公室，落地窗外是城市夜景",
      "prompt": "Modern office interior, spacious and bright...",
      "tags": ["室内", "现代", "办公室"]
    }
  ],
  "props": [
    {
      "category": "prop",
      "name": "神秘信封",
      "description": "泛黄的旧信封，封口处有红色蜡封",
      "prompt": "Old yellowed envelope, red wax seal...",
      "tags": ["道具", "神秘", "复古"]
    }
  ],
  "storyboards": [
    {
      "category": "storyboard",
      "name": "开场-办公室全景",
      "description": "广角镜头展示办公室全景",
      "prompt": "Wide shot, modern office interior...",
      "videoPrompt": "Slow pan from window to protagonist...",
      "sort_order": 1
    }
  ]
}

// 或者直接使用数组格式：
[
  { "category": "character", "name": "角色1", ... },
  { "category": "scene", "name": "场景1", ... }
]`}
                className="font-mono text-xs min-h-[550px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleImport} disabled={!importJsonInput.trim()}>
              <Upload className="h-4 w-4 mr-1" />
              导入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 预览对话框 - 使用ImagePreviewDialog组件 */}
      <ImagePreviewDialog
        src={filteredAssets[previewIndex]?.thumbnail ? getFileUrl(filteredAssets[previewIndex].thumbnail) || '' : ''}
        alt={filteredAssets[previewIndex]?.name || '预览'}
        title={filteredAssets[previewIndex]?.name}
        isOpen={previewDialogOpen}
        onClose={() => setPreviewDialogOpen(false)}
        images={filteredAssets.map(a => getFileUrl(a.thumbnail) || '').filter(Boolean)}
        currentIndex={previewIndex}
        onIndexChange={setPreviewIndex}
      />
    </div>
  )
}

// 资产卡片组件（网格视图）
interface AssetCardProps {
  asset: AssetItem
  selected: boolean
  batchMode: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
  onPreview: () => void
  onOpenDetail: () => void
  getFileUrl: (path?: string) => string | null
}

function AssetCard({
  asset,
  selected,
  batchMode,
  onSelect,
  onEdit,
  onDelete,
  onPreview,
  onOpenDetail,
  getFileUrl,
}: AssetCardProps) {
  const config = CATEGORY_CONFIG[asset.category]
  const thumbnail = asset.thumbnail ? getFileUrl(asset.thumbnail) : null

  return (
    <div
      className={cn(
        'group relative rounded-xl border bg-card overflow-hidden transition-all hover:shadow-lg hover:border-primary/50',
        selected && 'ring-2 ring-primary border-primary'
      )}
    >
      {/* 缩略图区域 - 点击预览 */}
      <div 
        className="aspect-square relative bg-muted overflow-hidden cursor-zoom-in"
        onClick={onPreview}
      >
        {thumbnail ? (
          <>
            <img
              src={thumbnail}
              alt={asset.name}
              className="w-full h-full object-cover transition-transform group-hover:scale-105"
            />
          </>
        ) : (
          <div className={cn('w-full h-full flex items-center justify-center', config.bgColor)}>
            <div className={cn('opacity-50', config.color)}>{config.icon}</div>
          </div>
        )}

        {/* 选中标记 */}
        {selected && !batchMode && (
          <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow-lg">
            <Check className="h-4 w-4 text-primary-foreground" />
          </div>
        )}

        {/* 批量选择复选框 */}
        {batchMode && (
          <div 
            className="absolute top-2 left-2 z-10"
            onClick={e => {
              e.stopPropagation()
              onSelect()
            }}
          >
            <div
              className={cn(
                'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer',
                selected
                  ? 'bg-primary border-primary'
                  : 'bg-background/80 border-muted-foreground/30'
              )}
            >
              {selected && <Check className="h-3 w-3 text-primary-foreground" />}
            </div>
          </div>
        )}

        {/* 类型标签 */}
        <div className="absolute bottom-2 left-2">
          <Badge
            variant="secondary"
            className={cn('text-[10px] gap-1', config.bgColor, config.color)}
          >
            {config.icon}
            {config.label}
          </Badge>
        </div>

        {/* 悬停操作 */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={e => {
              e.stopPropagation()
              onOpenDetail()
            }}
          >
            <Pencil className="h-3 w-3 mr-1" />
            编辑
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={e => {
              e.stopPropagation()
              onDelete()
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* 信息区域 - 点击打开编辑 */}
      <div 
        className="p-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onEdit}
      >
        <p className="font-medium text-sm truncate">{asset.name}</p>
        {asset.description && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{asset.description}</p>
        )}
        {asset.category === 'storyboard' &&
          (asset.character_names?.length || asset.scene_name || asset.prop_names?.length) && (
            <div className="flex flex-wrap gap-0.5 mt-1.5">
              {asset.scene_name && (
                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 gap-0.5">
                  <MapPin className="h-2.5 w-2.5" />
                  {asset.scene_name}
                </Badge>
              )}
              {asset.character_names?.slice(0, 2).map((name, i) => (
                <Badge key={i} variant="outline" className="text-[9px] px-1 py-0 h-4 gap-0.5">
                  <User className="h-2.5 w-2.5" />
                  {name}
                </Badge>
              ))}
            </div>
          )}
      </div>
    </div>
  )
}

// 资产详情面板
interface AssetDetailPanelProps {
  asset: AssetItem
  mode: 'preview' | 'edit'
  open: boolean
  onCollapse: () => void
  onOpen: () => void
  onModeChange: (mode: 'preview' | 'edit') => void
  onSave: (asset: AssetItem) => void
  onDelete: () => void
  onImageUpload?: (asset: AssetItem, imagePath: string) => void
  onImageRemove?: (asset: AssetItem) => void
  getFileUrl: (path?: string) => string | null
  projectId?: string
  episodeId?: string
}

function AssetDetailPanel({
  asset,
  mode,
  open,
  onCollapse,
  onOpen,
  onModeChange,
  onSave,
  onDelete,
  onImageUpload,
  onImageRemove,
  getFileUrl,
  projectId,
  episodeId,
}: AssetDetailPanelProps) {
  const [editData, setEditData] = useState({
    name: asset.name,
    description: asset.description || '',
    prompt: asset.prompt || '',
    videoPrompt: asset.videoPrompt || '',
    tags: asset.tags?.join(', ') || '',
  })
  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [wardrobeOpen, setWardrobeOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  useEffect(() => {
    setEditData({
      name: asset.name,
      description: asset.description || '',
      prompt: asset.prompt || '',
      videoPrompt: asset.videoPrompt || '',
      tags: asset.tags?.join(', ') || '',
    })
  }, [asset.id, asset.name, asset.description, asset.prompt, asset.videoPrompt, asset.tags])

  const config = CATEGORY_CONFIG[asset.category]
  const thumbnail = asset.thumbnail ? getFileUrl(asset.thumbnail) : null
  const image = asset.image ? getFileUrl(asset.image) : null
  const displayImage = image || thumbnail

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !onImageUpload) return

    if (!file.type.startsWith('image/')) {
      toast({
        title: '上传失败',
        description: '请选择图片文件',
        variant: 'destructive',
      })
      return
    }

    setIsUploading(true)
    try {
      const reader = new FileReader()
      reader.onload = async event => {
        const base64Data = event.target?.result as string
        if (!base64Data) return

        const imagePath = await saveMediaFile(
          base64Data,
          file.name,
          projectId || '',
          episodeId || '',
          'image'
        )

        onImageUpload(asset, imagePath)
        toast({
          title: '上传成功',
          description: '图片已保存',
        })
      }
      reader.readAsDataURL(file)
    } catch (error) {
      toast({
        title: '上传失败',
        description: error instanceof Error ? error.message : '请重试',
        variant: 'destructive',
      })
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await onSave({
        ...asset,
        name: editData.name,
        description: editData.description,
        prompt: editData.prompt,
        videoPrompt: editData.videoPrompt,
        tags: editData.tags
          .split(',')
          .map(t => t.trim())
          .filter(Boolean),
      })
    } finally {
      setIsSaving(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({ title: '已复制到剪贴板' })
  }

  return (
    <>
      {/* 折叠时的侧边标签 */}
      {!open && (
        <button
          onClick={onOpen}
          className={cn(
            'w-10 border-l bg-card flex flex-col items-center py-4 gap-3 shrink-0 cursor-pointer hover:bg-accent transition-colors',
          )}
        >
          <div className={cn('w-7 h-7 rounded-md flex items-center justify-center', config.bgColor, config.color)}>
            {config.icon}
          </div>
          <div className="writing-mode-vertical text-[10px] text-muted-foreground font-medium" style={{ writingMode: 'vertical-rl' }}>
            {asset.name?.slice(0, 6)}
          </div>
          <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors">
            <Pencil className="h-3 w-3" />
          </div>
        </button>
      )}

      {/* 展开的面板 */}
      <div className={cn(
        'border-l bg-card flex flex-col overflow-hidden transition-[width] duration-300 ease-in-out shrink-0',
        open ? 'w-[460px]' : 'w-0 border-l-0'
      )}>
        {/* 头部 - 模式切换标签 */}
        <div className="flex items-center justify-between p-3 border-b shrink-0">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            <button
              onClick={() => onModeChange('preview')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                mode === 'preview'
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Images className="h-3.5 w-3.5" />
              预览
            </button>
            <button
              onClick={() => onModeChange('edit')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                mode === 'edit'
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Pencil className="h-3.5 w-3.5" />
              编辑
            </button>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant="outline" className={cn('gap-1 text-[10px]', config.color)}>
              {config.icon}
              {config.label}
            </Badge>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCollapse}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-auto">
          {mode === 'preview' ? (
            /* ===== 预览模式 ===== */
            <div className="p-4 space-y-4">
              {/* 大图预览 */}
              {displayImage ? (
                <div className="rounded-lg overflow-hidden bg-muted relative group">
                  <img src={displayImage} alt={asset.name} className="w-full object-contain max-h-[400px]" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    {onImageUpload && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                      >
                        {isUploading ? (
                          <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />
                        ) : (
                          <Upload className="h-3 w-3 mr-1" />
                        )}
                        更换图片
                      </Button>
                    )}
                    {onImageRemove && asset.image && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => onImageRemove(asset)}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        移除
                      </Button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </div>
              ) : onImageUpload ? (
                <div
                  className="rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center bg-muted/50 hover:bg-muted transition-colors cursor-pointer py-12"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isUploading ? (
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                      <span className="text-sm text-muted-foreground">上传图片</span>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </div>
              ) : (
                <div className="rounded-lg bg-muted flex items-center justify-center py-12">
                  <div className={cn('opacity-50', config.color)}>{config.icon}</div>
                </div>
              )}

              {/* 名称和描述 */}
              <div>
                <h3 className="font-semibold text-base">{asset.name}</h3>
                {asset.description && (
                  <p className="text-sm text-muted-foreground mt-1">{asset.description}</p>
                )}
              </div>

              {/* 图片提示词 */}
              {asset.prompt && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    图片提示词
                  </label>
                  <div className="relative group/prompt">
                    <div className="bg-muted/50 rounded-md p-3 text-xs font-mono whitespace-pre-wrap leading-relaxed border">
                      {asset.prompt}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover/prompt:opacity-100 transition-opacity"
                      onClick={() => copyToClipboard(asset.prompt || '')}
                    >
                      <Save className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}

              {/* 视频提示词（仅分镜） */}
              {asset.category === 'storyboard' && asset.videoPrompt && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Video className="h-3 w-3" />
                    视频提示词
                  </label>
                  <div className="relative group/vprompt">
                    <div className="bg-muted/50 rounded-md p-3 text-xs font-mono whitespace-pre-wrap leading-relaxed border">
                      {asset.videoPrompt}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover/vprompt:opacity-100 transition-opacity"
                      onClick={() => copyToClipboard(asset.videoPrompt || '')}
                    >
                      <Save className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}

              {/* 关联资产（仅分镜） */}
              {asset.category === 'storyboard' &&
                (asset.scene_name || asset.character_names?.length || asset.prop_names?.length) && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">关联资产</label>
                    <div className="flex flex-wrap gap-1">
                      {asset.scene_name && (
                        <Badge variant="secondary" className="gap-1">
                          <MapPin className="h-3 w-3" />
                          {asset.scene_name}
                        </Badge>
                      )}
                      {asset.character_names?.map((name, i) => (
                        <Badge key={i} variant="secondary" className="gap-1">
                          <User className="h-3 w-3" />
                          {name}
                        </Badge>
                      ))}
                      {asset.prop_names?.map((name, i) => (
                        <Badge key={i} variant="secondary" className="gap-1">
                          <Box className="h-3 w-3" />
                          {name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

              {/* 标签 */}
              {asset.tags && asset.tags.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">标签</label>
                  <div className="flex flex-wrap gap-1">
                    {asset.tags.map((tag, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* 创建时间 */}
              <div className="text-xs text-muted-foreground pt-2 border-t">
                创建于 {new Date(asset.createdAt).toLocaleString()}
              </div>

              {/* 底部操作 */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-1"
                  onClick={() => onModeChange('edit')}
                >
                  <Pencil className="h-4 w-4" />
                  编辑
                </Button>
                <Button
                  variant="outline"
                  className="gap-1 text-destructive hover:text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            /* ===== 编辑模式 ===== */
            <div className="p-4 space-y-4">
              {/* 缩略图预览 */}
              {displayImage ? (
                <div className="aspect-video rounded-lg overflow-hidden bg-muted relative group flex items-center justify-center">
                  <img src={displayImage} alt={asset.name} className="w-full h-full object-contain" />
                  {onImageRemove && asset.image && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => onImageRemove(asset)}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      移除
                    </Button>
                  )}
                  {onImageUpload && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      {isUploading ? (
                        <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />
                      ) : (
                        <Upload className="h-3 w-3 mr-1" />
                      )}
                      更换
                    </Button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </div>
              ) : onImageUpload ? (
                <div className="aspect-video rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isUploading ? (
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-muted-foreground mb-1" />
                      <span className="text-xs text-muted-foreground">上传图片</span>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </div>
              ) : (
                <div className="aspect-video rounded-lg bg-muted flex items-center justify-center">
                  <div className={cn('opacity-50', config.color)}>{config.icon}</div>
                </div>
              )}

              {/* 名称 */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">名称</label>
                <Input
                  value={editData.name}
                  onChange={e => setEditData({ ...editData, name: e.target.value })}
                  placeholder="资产名称"
                />
              </div>

              {/* 描述 */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">描述</label>
                <Textarea
                  value={editData.description}
                  onChange={e => setEditData({ ...editData, description: e.target.value })}
                  placeholder="资产描述"
                  rows={2}
                />
              </div>

              {/* 提示词 */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  图片提示词
                </label>
                <Textarea
                  value={editData.prompt}
                  onChange={e => setEditData({ ...editData, prompt: e.target.value })}
                  placeholder="AI 生图提示词"
                  rows={4}
                  className="font-mono text-xs"
                />
              </div>

              {/* 视频提示词（仅分镜） */}
              {asset.category === 'storyboard' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Video className="h-3 w-3" />
                    视频提示词
                  </label>
                  <Textarea
                    value={editData.videoPrompt}
                    onChange={e => setEditData({ ...editData, videoPrompt: e.target.value })}
                    placeholder="AI 生视频提示词"
                    rows={3}
                    className="font-mono text-xs"
                  />
                </div>
              )}

              {/* 关联资产（仅分镜） */}
              {asset.category === 'storyboard' &&
                (asset.scene_name || asset.character_names?.length || asset.prop_names?.length) && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">关联资产</label>
                    <div className="flex flex-wrap gap-1">
                      {asset.scene_name && (
                        <Badge variant="secondary" className="gap-1">
                          <MapPin className="h-3 w-3" />
                          {asset.scene_name}
                        </Badge>
                      )}
                      {asset.character_names?.map((name, i) => (
                        <Badge key={i} variant="secondary" className="gap-1">
                          <User className="h-3 w-3" />
                          {name}
                        </Badge>
                      ))}
                      {asset.prop_names?.map((name, i) => (
                        <Badge key={i} variant="secondary" className="gap-1">
                          <Box className="h-3 w-3" />
                          {name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

              {/* 标签 */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">标签</label>
                <Input
                  value={editData.tags}
                  onChange={e => setEditData({ ...editData, tags: e.target.value })}
                  placeholder="多个标签用逗号分隔"
                />
              </div>

              {/* 衣橱（仅角色） */}
              {asset.category === 'character' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">服装造型</label>
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => setWardrobeOpen(true)}
                  >
                    <Shirt className="h-4 w-4 text-blue-500" />
                    管理衣橱
                  </Button>
                  <CharacterWardrobeDialog
                    open={wardrobeOpen}
                    onOpenChange={setWardrobeOpen}
                    characterId={asset.id}
                    characterName={asset.name}
                    projectId={projectId}
                    episodeId={episodeId}
                  />
                </div>
              )}

              {/* 创建时间 */}
              <div className="text-xs text-muted-foreground">
                创建于 {new Date(asset.createdAt).toLocaleString()}
              </div>
            </div>
          )}
        </div>

        {/* 编辑模式底部操作 */}
        {mode === 'edit' && (
          <div className="p-4 border-t flex gap-2 shrink-0">
            <Button variant="outline" className="flex-1" onClick={onDelete}>
              <Trash2 className="h-4 w-4 mr-1" />
              删除
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              保存
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
