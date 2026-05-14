import { useState, useMemo, useCallback, useRef } from 'react'

import { confirm, open } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'
import {
  Plus,
  Trash2,
  Edit2,
  Film,
  FolderOpen,
  Search,
  Grid,
  List,
  ArrowUpDown,
  Upload,
  FileJson,
  Archive,
  Image,
  Video,
  FileText,
  MoreVertical,
} from 'lucide-react'

import { ImagePreviewDialog } from '@/components/media/ImagePreviewDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ImageUpload } from '@/components/ui/image-upload'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useScenesByEpisode, usePropsByEpisode } from '@/hooks/useAssetManager'
import { useCharacters } from '@/hooks/useCharacters'
import {
  useEpisodesQuery,
  useCreateEpisodeMutation,
  useUpdateEpisodeMutation,
  useDeleteEpisodeMutation,
} from '@/hooks/useEpisodes'
import {
  useProjectsQuery,
  useCreateProjectMutation,
  useUpdateProjectMutation,
  useDeleteProjectMutation,
} from '@/hooks/useProjects'
import { useStoryboards } from '@/hooks/useStoryboards'
import { useToast } from '@/hooks/useToast'
import { WorkspaceService } from '@/services/workspace/WorkspaceService'
import { useUIStore } from '@/store/useUIStore'
import type { Project, Episode } from '@/types'
import { ART_STYLES as ART_STYLES_CONFIG, IMAGE_ASPECT_RATIOS } from '@/types'

type ViewMode = 'card' | 'list'
type SortField = 'name' | 'created_at' | 'updated_at'
type SortOrder = 'asc' | 'desc'

interface ProjectExport {
  version: string
  exportedAt: string
  project: Project
  episodes: Episode[]
  storyboards: Array<{
    id: string
    episode_id: string
    project_id: string
    name: string
    shot_type?: string
    scene?: string
    location?: string
    time?: string
    description?: string
    prompt?: string
    video_prompt?: string
    image?: string
    video?: string
    status?: string
    sort_order?: number
    created_at: string
    updated_at: string
  }>
  characters: Array<{
    id: string
    project_id: string
    episode_id?: string
    name: string
    description?: string
    prompt?: string
    image?: string
    tags?: string[]
    created_at: string
    updated_at: string
  }>
  scenes: Array<{
    id: string
    project_id: string
    episode_id?: string
    name: string
    description?: string
    prompt?: string
    image?: string
    tags?: string[]
    created_at: string
    updated_at: string
  }>
  props: Array<{
    id: string
    project_id: string
    episode_id?: string
    name: string
    description?: string
    prompt?: string
    image?: string
    tags?: string[]
    created_at: string
    updated_at: string
  }>
}

export function ProjectManage() {
  const { data: projects = [] } = useProjectsQuery()
  const createProject = useCreateProjectMutation()
  const updateProject = useUpdateProjectMutation()
  const deleteProject = useDeleteProjectMutation()
  const { currentProjectId, setCurrentProjectId, setCurrentEpisodeId } = useUIStore()
  const { toast } = useToast()

  const [isCreating, setIsCreating] = useState(false)
  const [isEditing, setIsEditing] = useState<Project | null>(null)
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    aspect_ratio: '16:9',
    visual_style: '',
    cover_image: '',
    custom_style: { name: '', prompt: '', negativePrompt: '' },
    quality_prompt: '8k, ultra HD, high detail, masterpiece, best quality',
  })

  const { data: episodes = [] } = useEpisodesQuery(currentProjectId || '')
  const createEpisode = useCreateEpisodeMutation()
  const updateEpisode = useUpdateEpisodeMutation()
  const deleteEpisode = useDeleteEpisodeMutation()

  const [isCreatingEpisode, setIsCreatingEpisode] = useState(false)
  const [isEditingEpisode, setIsEditingEpisode] = useState<Episode | null>(null)
  const [newEpisode, setNewEpisode] = useState({ name: '', description: '', episode_number: 1 })

  const [viewMode, setViewMode] = useState<ViewMode>('card')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('updated_at')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [isUploadingCover, setIsUploadingCover] = useState(false)

  // 处理封面上传
  const _handleCoverUpload = async (isEditingProject: boolean = false) => {
    try {
      setIsUploadingCover(true)

      // 打开文件选择对话框
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: '图片文件',
            extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
          },
        ],
      })

      if (!selected || Array.isArray(selected)) return

      // 读取文件
      const fileData = await readFile(selected)
      const fileName = selected.split(/[\\/]/).pop() || 'cover.jpg'

      // 保存到工作区
      const workspace = WorkspaceService.getInstance()
      const metadata = await workspace.saveFile(
        fileData,
        'storyboard', // 使用 storyboard 类型存储封面
        fileName,
        { mimeType: 'image/' + fileName.split('.').pop() }
      )

      // 获取可访问的URL（使用绝对路径）
      const assetUrl = await workspace.getAssetUrl(metadata.path)

      // 更新状态
      if (isEditingProject && isEditing) {
        setIsEditing({ ...isEditing, cover_image: assetUrl })
      } else {
        setNewProject({ ...newProject, cover_image: assetUrl })
      }

      toast({ title: '封面上传成功' })
    } catch (error) {
      console.error('封面上传失败:', error)
      toast({
        title: '封面上传失败',
        description: (error as Error).message,
        variant: 'destructive',
      })
    } finally {
      setIsUploadingCover(false)
    }
  }

  const filteredAndSortedProjects = useMemo(() => {
    let result = [...projects]

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        p => p.name.toLowerCase().includes(query) || p.description?.toLowerCase().includes(query)
      )
    }

    result.sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          break
        case 'updated_at':
          comparison = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })

    return result
  }, [projects, searchQuery, sortField, sortOrder])

  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortField(field)
        setSortOrder('desc')
      }
    },
    [sortField]
  )

  const handleCreate = async () => {
    if (!newProject.name.trim()) return

    try {
      await createProject.mutateAsync({
        name: newProject.name,
        description: newProject.description,
        aspect_ratio: newProject.aspect_ratio,
        visual_style: newProject.visual_style,
        cover_image: newProject.cover_image,
        custom_style: newProject.visual_style === 'custom' ? newProject.custom_style : undefined,
        quality_prompt: newProject.quality_prompt,
      })

      toast({ title: '项目创建成功', description: `已创建项目: ${newProject.name}` })
      setNewProject({
        name: '',
        description: '',
        aspect_ratio: '16:9',
        visual_style: '',
        cover_image: '',
        custom_style: { name: '', prompt: '', negativePrompt: '' },
        quality_prompt: '8k, ultra HD, high detail, masterpiece, best quality',
      })
      setIsCreating(false)
    } catch (error) {
      toast({ title: '创建失败', description: (error as Error).message, variant: 'destructive' })
    }
  }

  const handleUpdate = async () => {
    if (!isEditing || !isEditing.name.trim()) return

    try {
      await updateProject.mutateAsync({
        id: isEditing.id,
        data: {
          name: isEditing.name,
          description: isEditing.description,
          aspect_ratio: isEditing.aspect_ratio,
          visual_style: isEditing.visual_style,
          cover_image: isEditing.cover_image,
          custom_style: isEditing.visual_style === 'custom' ? isEditing.custom_style : undefined,
          quality_prompt: isEditing.quality_prompt,
        },
      })

      toast({ title: '项目更新成功' })
      setIsEditing(null)
    } catch (error) {
      toast({ title: '更新失败', description: (error as Error).message, variant: 'destructive' })
    }
  }

  const handleDelete = async (id: string) => {
    const confirmed = await confirm('确定要删除这个项目吗？此操作不可恢复。', {
      title: '删除确认',
      kind: 'warning',
      okLabel: '确定',
      cancelLabel: '取消',
    })
    if (!confirmed) return

    try {
      await deleteProject.mutateAsync(id)
      if (currentProjectId === id) {
        setCurrentProjectId(null)
        setCurrentEpisodeId(null)
      }
      toast({ title: '项目已删除' })
    } catch (error) {
      toast({ title: '删除失败', description: (error as Error).message, variant: 'destructive' })
    }
  }

  const handleSelectProject = (project: Project) => {
    setCurrentProjectId(project.id)
    setCurrentEpisodeId(null)
  }

  const handleCreateEpisode = async () => {
    if (!newEpisode.name.trim() || !currentProjectId) return

    try {
      await createEpisode.mutateAsync({
        name: newEpisode.name,
        description: newEpisode.description,
        episode_number: newEpisode.episode_number,
        project_id: currentProjectId,
      })

      toast({ title: '剧集创建成功', description: `已创建剧集: ${newEpisode.name}` })
      setNewEpisode({ name: '', description: '', episode_number: episodes.length + 1 })
      setIsCreatingEpisode(false)
    } catch (error) {
      toast({ title: '创建失败', description: (error as Error).message, variant: 'destructive' })
    }
  }

  const handleUpdateEpisode = async () => {
    if (!isEditingEpisode || !isEditingEpisode.name.trim()) return

    try {
      await updateEpisode.mutateAsync({
        id: isEditingEpisode.id,
        data: {
          name: isEditingEpisode.name,
          description: isEditingEpisode.description,
          episode_number: isEditingEpisode.episode_number,
        },
      })

      toast({ title: '剧集更新成功' })
      setIsEditingEpisode(null)
    } catch (error) {
      toast({ title: '更新失败', description: (error as Error).message, variant: 'destructive' })
    }
  }

  const handleDeleteEpisode = async (id: string) => {
    const confirmed = await confirm('确定要删除这个剧集吗？', {
      title: '删除确认',
      kind: 'warning',
      okLabel: '确定',
      cancelLabel: '取消',
    })
    if (!confirmed) return

    try {
      await deleteEpisode.mutateAsync(id)
      toast({ title: '剧集已删除' })
    } catch (error) {
      toast({ title: '删除失败', description: (error as Error).message, variant: 'destructive' })
    }
  }

  const handleSelectEpisode = (episode: Episode) => {
    setCurrentEpisodeId(episode.id)
  }

  const exportProjectAsJSON = useCallback(
    async (project: Project) => {
      try {
        const { episodeDB, storyboardDB, characterDB, sceneDB, propDB } = await import('@/db')

        const [projectEpisodes, projectCharacters, projectScenes, projectProps] = await Promise.all(
          [
            episodeDB.getAll(project.id),
            characterDB.getAll(project.id),
            sceneDB.getAll(project.id),
            propDB.getAll(project.id),
          ]
        )

        const allStoryboards = []
        for (const episode of projectEpisodes) {
          const storyboards = await storyboardDB.getAll(episode.id)
          allStoryboards.push(...storyboards)
        }

        const exportData: ProjectExport = {
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          project,
          episodes: projectEpisodes,
          storyboards: allStoryboards,
          characters: projectCharacters,
          scenes: projectScenes,
          props: projectProps,
        }

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${project.name}_${new Date().toISOString().split('T')[0]}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        toast({ title: '导出成功', description: `已导出项目: ${project.name}` })
      } catch (error) {
        toast({ title: '导出失败', description: (error as Error).message, variant: 'destructive' })
      }
    },
    [toast]
  )

  const importProjectFromJSON = useCallback(
    async (file: File) => {
      setIsImporting(true)
      try {
        const text = await file.text()
        const data: ProjectExport = JSON.parse(text)

        if (!data.project || !data.project.name) {
          throw new Error('无效的项目文件格式')
        }

        const { projectDB, episodeDB, storyboardDB, characterDB, sceneDB, propDB } =
          await import('@/db')

        const newProject = await projectDB.create({
          name: `${data.project.name} (导入)`,
          description: data.project.description,
          aspect_ratio: data.project.aspect_ratio,
          visual_style: data.project.visual_style,
        })

        const episodeIdMap = new Map<string, string>()
        for (const episode of data.episodes || []) {
          const newEpisode = await episodeDB.create({
            name: episode.name,
            description: episode.description,
            episode_number: episode.episode_number,
            project_id: newProject.id,
          })
          episodeIdMap.set(episode.id, newEpisode.id)
        }

        for (const storyboard of data.storyboards || []) {
          const newEpisodeId = episodeIdMap.get(storyboard.episode_id) || ''
          await storyboardDB.create({
            name: storyboard.name,
            shot_type: storyboard.shot_type,
            scene: storyboard.scene,
            location: storyboard.location,
            time: storyboard.time,
            description: storyboard.description,
            prompt: storyboard.prompt,
            video_prompt: storyboard.video_prompt,
            image: storyboard.image,
            video: storyboard.video,
            status: storyboard.status,
            sort_order: storyboard.sort_order,
            episode_id: newEpisodeId,
            project_id: newProject.id,
          })
        }

        for (const character of data.characters || []) {
          const newEpisodeId = episodeIdMap.get(character.episode_id || '') || undefined
          await characterDB.create({
            name: character.name,
            description: character.description,
            prompt: character.prompt,
            image: character.image,
            tags: character.tags,
            episode_id: newEpisodeId,
            project_id: newProject.id,
          })
        }

        for (const scene of data.scenes || []) {
          const newEpisodeId = episodeIdMap.get(scene.episode_id || '') || undefined
          await sceneDB.create({
            name: scene.name,
            description: scene.description,
            prompt: scene.prompt,
            image: scene.image,
            tags: scene.tags,
            episode_id: newEpisodeId,
            project_id: newProject.id,
          })
        }

        for (const prop of data.props || []) {
          const newEpisodeId = episodeIdMap.get(prop.episode_id || '') || undefined
          await propDB.create({
            name: prop.name,
            description: prop.description,
            prompt: prop.prompt,
            image: prop.image,
            tags: prop.tags,
            episode_id: newEpisodeId,
            project_id: newProject.id,
          })
        }

        toast({ title: '导入成功', description: `已导入项目: ${newProject.name}` })
      } catch (error) {
        toast({ title: '导入失败', description: (error as Error).message, variant: 'destructive' })
      } finally {
        setIsImporting(false)
      }
    },
    [toast]
  )

  const exportProjectAsArchive = useCallback(
    async (project: Project) => {
      try {
        const { episodeDB, storyboardDB, characterDB, sceneDB, propDB } = await import('@/db')

        const [projectEpisodes, projectCharacters, projectScenes, projectProps] = await Promise.all(
          [
            episodeDB.getAll(project.id),
            characterDB.getAll(project.id),
            sceneDB.getAll(project.id),
            propDB.getAll(project.id),
          ]
        )

        const allStoryboards = []
        for (const episode of projectEpisodes) {
          const storyboards = await storyboardDB.getAll(episode.id)
          allStoryboards.push(...storyboards)
        }

        const exportData: ProjectExport = {
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          project,
          episodes: projectEpisodes,
          storyboards: allStoryboards,
          characters: projectCharacters,
          scenes: projectScenes,
          props: projectProps,
        }

        const manifest = JSON.stringify(exportData, null, 2)
        const blob = new Blob([manifest], { type: 'application/json' })

        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${project.name}_${new Date().toISOString().split('T')[0]}_archive.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        toast({
          title: '导出成功',
          description: `已导出项目归档: ${project.name}（注：资产文件路径已保存，实际文件需手动打包）`,
        })
      } catch (error) {
        toast({ title: '导出失败', description: (error as Error).message, variant: 'destructive' })
      }
    },
    [toast]
  )

  const selectedProject = projects.find(p => p.id === currentProjectId)

  const sortedEpisodes = useMemo(() => {
    return [...episodes].sort((a, b) => (a.episode_number || 0) - (b.episode_number || 0))
  }, [episodes])

  return (
    <div className="p-6 max-w-7xl mx-auto h-[calc(100vh-4rem)] overflow-y-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold">项目管理</h1>
          <p className="text-muted-foreground mt-1">管理您的视频项目</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
          >
            <Upload className="w-4 h-4 mr-2" />
            {isImporting ? '导入中...' : '导入项目'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) {
                importProjectFromJSON(file)
                e.target.value = ''
              }
            }}
          />
          <Button
            onClick={() => {
              setNewProject({
                name: '',
                description: '',
                aspect_ratio: '16:9',
                visual_style: '',
                cover_image: '',
                custom_style: { name: '', prompt: '', negativePrompt: '' },
                quality_prompt: '8k, ultra HD, high detail, masterpiece, best quality',
              })
              setIsCreating(true)
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            新建项目
          </Button>
        </div>
      </div>

      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新建项目</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* 项目封面 */}
            <div>
              <label className="text-sm font-medium mb-2 block">项目封面</label>
              <ImageUpload
                value={newProject.cover_image}
                onChange={value => setNewProject({ ...newProject, cover_image: value })}
                placeholder="点击上传项目封面"
                previewClassName="w-40 h-24"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">项目名称 *</label>
              <Input
                value={newProject.name}
                onChange={e => setNewProject({ ...newProject, name: e.target.value })}
                placeholder="输入项目名称"
              />
            </div>

            {/* 比例选择 */}
            <div>
              <label className="text-sm font-medium mb-2 block">项目比例</label>
              <select
                value={newProject.aspect_ratio}
                onChange={e => setNewProject({ ...newProject, aspect_ratio: e.target.value })}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                {IMAGE_ASPECT_RATIOS.map(ratio => (
                  <option key={ratio} value={ratio}>
                    {ratio}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                此比例将作为项目默认比例，用于 AI 生图/生视频
              </p>
            </div>

            {/* 艺术风格选择 */}
            <div>
              <label className="text-sm font-medium mb-2 block">艺术风格</label>
              <select
                value={newProject.visual_style}
                onChange={e => setNewProject({ ...newProject, visual_style: e.target.value })}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">选择艺术风格（可选）</option>
                <optgroup label="动漫风格">
                  {ART_STYLES_CONFIG.filter(s => s.category === 'anime').map(style => (
                    <option key={style.id} value={style.id}>
                      {style.name} - {style.description}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="写实风格">
                  {ART_STYLES_CONFIG.filter(s => s.category === 'realistic').map(style => (
                    <option key={style.id} value={style.id}>
                      {style.name} - {style.description}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="艺术风格">
                  {ART_STYLES_CONFIG.filter(s => s.category === 'artistic').map(style => (
                    <option key={style.id} value={style.id}>
                      {style.name} - {style.description}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="特色风格">
                  {ART_STYLES_CONFIG.filter(s => s.category === 'special').map(style => (
                    <option key={style.id} value={style.id}>
                      {style.name} - {style.description}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="古风国风">
                  {ART_STYLES_CONFIG.filter(s => s.category === 'chinese').map(style => (
                    <option key={style.id} value={style.id}>
                      {style.name} - {style.description}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="科幻风格">
                  {ART_STYLES_CONFIG.filter(s => s.category === 'scifi').map(style => (
                    <option key={style.id} value={style.id}>
                      {style.name} - {style.description}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="游戏风格">
                  {ART_STYLES_CONFIG.filter(s => s.category === 'game').map(style => (
                    <option key={style.id} value={style.id}>
                      {style.name} - {style.description}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="自定义">
                  {ART_STYLES_CONFIG.filter(s => s.category === 'custom').map(style => (
                    <option key={style.id} value={style.id}>
                      {style.name}
                    </option>
                  ))}
                </optgroup>
              </select>
              {newProject.visual_style && newProject.visual_style !== 'custom' && (
                <div className="mt-2 p-2 bg-muted rounded text-xs">
                  <span className="font-medium">提示词预览：</span>
                  {ART_STYLES_CONFIG.find(s => s.id === newProject.visual_style)?.prompt.substring(
                    0,
                    100
                  )}
                  ...
                </div>
              )}
            </div>

            {/* 自定义风格设置 */}
            {newProject.visual_style === 'custom' && (
              <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
                <label className="text-sm font-medium">自定义风格设置</label>
                <Input
                  value={newProject.custom_style.name}
                  onChange={e =>
                    setNewProject({
                      ...newProject,
                      custom_style: { ...newProject.custom_style, name: e.target.value },
                    })
                  }
                  placeholder="风格名称（如：我的专属风格）"
                />
                <Textarea
                  value={newProject.custom_style.prompt}
                  onChange={e =>
                    setNewProject({
                      ...newProject,
                      custom_style: { ...newProject.custom_style, prompt: e.target.value },
                    })
                  }
                  placeholder="正向提示词（将自动附加到所有生图提示词中）"
                  rows={2}
                />
                <Textarea
                  value={newProject.custom_style.negativePrompt}
                  onChange={e =>
                    setNewProject({
                      ...newProject,
                      custom_style: { ...newProject.custom_style, negativePrompt: e.target.value },
                    })
                  }
                  placeholder="负面提示词（可选）"
                  rows={2}
                />
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-2 block">质量提示词</label>
              <Textarea
                value={newProject.quality_prompt}
                onChange={e => setNewProject({ ...newProject, quality_prompt: e.target.value })}
                placeholder="输入质量提示词，如：8k, ultra HD, high detail..."
                rows={2}
              />
              <p className="text-xs text-muted-foreground mt-1">
                此提示词会在生图/生视频时自动添加到正面提示词末尾，不会添加到负面提示词
              </p>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">项目描述</label>
              <Textarea
                value={newProject.description}
                onChange={e => setNewProject({ ...newProject, description: e.target.value })}
                placeholder="输入项目描述（可选）"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreating(false)}>
              取消
            </Button>
            <Button onClick={handleCreate} disabled={createProject.isPending}>
              {createProject.isPending ? '创建中...' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!isEditing} onOpenChange={() => setIsEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑项目</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* 项目封面 */}
            <div>
              <label className="text-sm font-medium mb-2 block">项目封面</label>
              <ImageUpload
                value={isEditing?.cover_image || ''}
                onChange={value => isEditing && setIsEditing({ ...isEditing, cover_image: value })}
                placeholder="点击上传项目封面"
                previewClassName="w-40 h-24"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">项目名称 *</label>
              <Input
                value={isEditing?.name || ''}
                onChange={e => isEditing && setIsEditing({ ...isEditing, name: e.target.value })}
                placeholder="输入项目名称"
              />
            </div>

            {/* 比例选择 */}
            <div>
              <label className="text-sm font-medium mb-2 block">项目比例</label>
              <select
                value={isEditing?.aspect_ratio || '16:9'}
                onChange={e =>
                  isEditing && setIsEditing({ ...isEditing, aspect_ratio: e.target.value })
                }
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                {IMAGE_ASPECT_RATIOS.map(ratio => (
                  <option key={ratio} value={ratio}>
                    {ratio}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                此比例将作为项目默认比例，用于 AI 生图/生视频
              </p>
            </div>

            {/* 艺术风格选择 */}
            <div>
              <label className="text-sm font-medium mb-2 block">艺术风格</label>
              <select
                value={isEditing?.visual_style || ''}
                onChange={e =>
                  isEditing && setIsEditing({ ...isEditing, visual_style: e.target.value })
                }
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">选择艺术风格（可选）</option>
                <optgroup label="动漫风格">
                  {ART_STYLES_CONFIG.filter(s => s.category === 'anime').map(style => (
                    <option key={style.id} value={style.id}>
                      {style.name} - {style.description}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="写实风格">
                  {ART_STYLES_CONFIG.filter(s => s.category === 'realistic').map(style => (
                    <option key={style.id} value={style.id}>
                      {style.name} - {style.description}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="艺术风格">
                  {ART_STYLES_CONFIG.filter(s => s.category === 'artistic').map(style => (
                    <option key={style.id} value={style.id}>
                      {style.name} - {style.description}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="特色风格">
                  {ART_STYLES_CONFIG.filter(s => s.category === 'special').map(style => (
                    <option key={style.id} value={style.id}>
                      {style.name} - {style.description}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="古风国风">
                  {ART_STYLES_CONFIG.filter(s => s.category === 'chinese').map(style => (
                    <option key={style.id} value={style.id}>
                      {style.name} - {style.description}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="科幻风格">
                  {ART_STYLES_CONFIG.filter(s => s.category === 'scifi').map(style => (
                    <option key={style.id} value={style.id}>
                      {style.name} - {style.description}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="游戏风格">
                  {ART_STYLES_CONFIG.filter(s => s.category === 'game').map(style => (
                    <option key={style.id} value={style.id}>
                      {style.name} - {style.description}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="自定义">
                  {ART_STYLES_CONFIG.filter(s => s.category === 'custom').map(style => (
                    <option key={style.id} value={style.id}>
                      {style.name}
                    </option>
                  ))}
                </optgroup>
              </select>
              {isEditing?.visual_style && isEditing.visual_style !== 'custom' && (
                <div className="mt-2 p-2 bg-muted rounded text-xs">
                  <span className="font-medium">提示词预览：</span>
                  {ART_STYLES_CONFIG.find(s => s.id === isEditing.visual_style)?.prompt.substring(
                    0,
                    100
                  )}
                  ...
                </div>
              )}
            </div>

            {/* 自定义风格设置 */}
            {isEditing?.visual_style === 'custom' && (
              <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
                <label className="text-sm font-medium">自定义风格设置</label>
                <Input
                  value={isEditing?.custom_style?.name || ''}
                  onChange={e =>
                    isEditing &&
                    setIsEditing({
                      ...isEditing,
                      custom_style: { ...(isEditing.custom_style || {}), name: e.target.value },
                    })
                  }
                  placeholder="风格名称（如：我的专属风格）"
                />
                <Textarea
                  value={isEditing?.custom_style?.prompt || ''}
                  onChange={e =>
                    isEditing &&
                    setIsEditing({
                      ...isEditing,
                      custom_style: { ...(isEditing.custom_style || {}), prompt: e.target.value },
                    })
                  }
                  placeholder="正向提示词（将自动附加到所有生图提示词中）"
                  rows={2}
                />
                <Textarea
                  value={isEditing?.custom_style?.negativePrompt || ''}
                  onChange={e =>
                    isEditing &&
                    setIsEditing({
                      ...isEditing,
                      custom_style: {
                        ...(isEditing.custom_style || {}),
                        negativePrompt: e.target.value,
                      },
                    })
                  }
                  placeholder="负面提示词（可选）"
                  rows={2}
                />
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-2 block">质量提示词</label>
              <Textarea
                value={isEditing?.quality_prompt || ''}
                onChange={e =>
                  isEditing && setIsEditing({ ...isEditing, quality_prompt: e.target.value })
                }
                placeholder="输入质量提示词，如：8k, ultra HD, high detail..."
                rows={2}
              />
              <p className="text-xs text-muted-foreground mt-1">
                此提示词会在生图/生视频时自动添加到正面提示词末尾，不会添加到负面提示词
              </p>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">项目描述</label>
              <Textarea
                value={isEditing?.description || ''}
                onChange={e =>
                  isEditing && setIsEditing({ ...isEditing, description: e.target.value })
                }
                placeholder="输入项目描述（可选）"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditing(null)}>
              取消
            </Button>
            <Button onClick={handleUpdate} disabled={updateProject.isPending}>
              {updateProject.isPending ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreatingEpisode} onOpenChange={setIsCreatingEpisode}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建剧集</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">剧集名称</label>
              <Input
                value={newEpisode.name}
                onChange={e => setNewEpisode({ ...newEpisode, name: e.target.value })}
                placeholder="输入剧集名称"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">集数</label>
              <Input
                type="number"
                value={newEpisode.episode_number}
                onChange={e =>
                  setNewEpisode({ ...newEpisode, episode_number: parseInt(e.target.value) || 1 })
                }
                min={1}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">描述</label>
              <Textarea
                value={newEpisode.description}
                onChange={e => setNewEpisode({ ...newEpisode, description: e.target.value })}
                placeholder="输入剧集描述（可选）"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreatingEpisode(false)}>
              取消
            </Button>
            <Button onClick={handleCreateEpisode} disabled={createEpisode.isPending}>
              {createEpisode.isPending ? '创建中...' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!isEditingEpisode} onOpenChange={() => setIsEditingEpisode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑剧集</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">剧集名称</label>
              <Input
                value={isEditingEpisode?.name || ''}
                onChange={e =>
                  isEditingEpisode &&
                  setIsEditingEpisode({ ...isEditingEpisode, name: e.target.value })
                }
                placeholder="输入剧集名称"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">集数</label>
              <Input
                type="number"
                value={isEditingEpisode?.episode_number || 1}
                onChange={e =>
                  isEditingEpisode &&
                  setIsEditingEpisode({
                    ...isEditingEpisode,
                    episode_number: parseInt(e.target.value) || 1,
                  })
                }
                min={1}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">描述</label>
              <Textarea
                value={isEditingEpisode?.description || ''}
                onChange={e =>
                  isEditingEpisode &&
                  setIsEditingEpisode({ ...isEditingEpisode, description: e.target.value })
                }
                placeholder="输入剧集描述（可选）"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditingEpisode(null)}>
              取消
            </Button>
            <Button onClick={handleUpdateEpisode} disabled={updateEpisode.isPending}>
              {updateEpisode.isPending ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <Card className="mb-4">
            <CardContent className="py-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索项目名称或描述..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="flex gap-2">
                  <div className="flex border rounded-md">
                    <Button
                      variant={viewMode === 'card' ? 'default' : 'ghost'}
                      size="icon"
                      className="rounded-r-none"
                      onClick={() => setViewMode('card')}
                    >
                      <Grid className="w-4 h-4" />
                    </Button>
                    <Button
                      variant={viewMode === 'list' ? 'default' : 'ghost'}
                      size="icon"
                      className="rounded-l-none"
                      onClick={() => setViewMode('list')}
                    >
                      <List className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex border rounded-md">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`rounded-r-none ${sortField === 'name' ? 'bg-accent' : ''}`}
                      onClick={() => toggleSort('name')}
                    >
                      名称
                      {sortField === 'name' && (
                        <ArrowUpDown
                          className={`w-3 h-3 ml-1 ${sortOrder === 'asc' ? 'rotate-180' : ''}`}
                        />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`rounded-none border-x ${sortField === 'created_at' ? 'bg-accent' : ''}`}
                      onClick={() => toggleSort('created_at')}
                    >
                      创建时间
                      {sortField === 'created_at' && (
                        <ArrowUpDown
                          className={`w-3 h-3 ml-1 ${sortOrder === 'asc' ? 'rotate-180' : ''}`}
                        />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`rounded-l-none ${sortField === 'updated_at' ? 'bg-accent' : ''}`}
                      onClick={() => toggleSort('updated_at')}
                    >
                      更新时间
                      {sortField === 'updated_at' && (
                        <ArrowUpDown
                          className={`w-3 h-3 ml-1 ${sortOrder === 'asc' ? 'rotate-180' : ''}`}
                        />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {viewMode === 'card' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredAndSortedProjects.map(project => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  isSelected={currentProjectId === project.id}
                  onSelect={() => handleSelectProject(project)}
                  onEdit={() =>
                    setIsEditing({
                      ...project,
                      quality_prompt:
                        project.quality_prompt ||
                        '8k, ultra HD, high detail, masterpiece, best quality',
                    })
                  }
                  onDelete={() => handleDelete(project.id)}
                  onExportJSON={() => exportProjectAsJSON(project)}
                  onExportArchive={() => exportProjectAsArchive(project)}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {filteredAndSortedProjects.map(project => (
                    <ProjectListItem
                      key={project.id}
                      project={project}
                      isSelected={currentProjectId === project.id}
                      onSelect={() => handleSelectProject(project)}
                      onEdit={() =>
                        setIsEditing({
                          ...project,
                          quality_prompt:
                            project.quality_prompt ||
                            '8k, ultra HD, high detail, masterpiece, best quality',
                        })
                      }
                      onDelete={() => handleDelete(project.id)}
                      onExportJSON={() => exportProjectAsJSON(project)}
                      onExportArchive={() => exportProjectAsArchive(project)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {filteredAndSortedProjects.length === 0 && !isCreating && (
            <div className="text-center py-12">
              <Film className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">
                {searchQuery ? '未找到匹配的项目' : '暂无项目'}
              </h3>
              <p className="text-muted-foreground mt-1">
                {searchQuery ? '请尝试其他搜索条件' : '点击上方按钮创建您的第一个项目'}
              </p>
            </div>
          )}
        </div>

        <div>
          {selectedProject ? (
            <EpisodePanel
              project={selectedProject}
              episodes={sortedEpisodes}
              currentEpisodeId={useUIStore.getState().currentEpisodeId}
              onCreateEpisode={() => {
                setNewEpisode({ name: '', description: '', episode_number: episodes.length + 1 })
                setIsCreatingEpisode(true)
              }}
              onEditEpisode={episode => setIsEditingEpisode(episode)}
              onDeleteEpisode={handleDeleteEpisode}
              onSelectEpisode={handleSelectEpisode}
            />
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <FolderOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>请先选择一个项目</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

interface ProjectCardProps {
  project: Project
  isSelected: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
  onExportJSON: () => void
  onExportArchive: () => void
}

function ProjectCard({
  project,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onExportJSON,
  onExportArchive,
}: ProjectCardProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const artStyle = ART_STYLES_CONFIG.find(s => s.id === project.visual_style)

  return (
    <>
      <Card
        className={`cursor-pointer transition-all hover:shadow-md overflow-hidden ${
          isSelected ? 'border-primary ring-2 ring-primary/20' : 'hover:border-primary/50'
        }`}
        onClick={onSelect}
      >
        {/* 封面图 - 可点击预览 */}
        {project.cover_image ? (
          <div
            className="w-full h-32 overflow-hidden relative group"
            onClick={e => {
              e.stopPropagation()
              setIsPreviewOpen(true)
            }}
          >
            <img
              src={project.cover_image}
              alt={project.name}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            {/* 悬停遮罩 */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
              <span className="text-white text-sm font-medium">点击查看大图</span>
            </div>
          </div>
        ) : (
          <div className="w-full h-20 bg-gradient-to-r from-primary/20 to-primary/5 flex items-center justify-center">
            <Film className="w-10 h-10 text-primary/40" />
          </div>
        )}

        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="min-w-0 flex-1">
                <CardTitle className="text-lg truncate">{project.name}</CardTitle>
                <CardDescription className="text-xs">
                  {new Date(project.updated_at).toLocaleDateString()}
                </CardDescription>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={e => {
                    e.stopPropagation()
                    onEdit()
                  }}
                >
                  <Edit2 className="w-4 h-4 mr-2" /> 编辑
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={e => {
                    e.stopPropagation()
                    onExportJSON()
                  }}
                >
                  <FileJson className="w-4 h-4 mr-2" /> 导出 JSON
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={e => {
                    e.stopPropagation()
                    onExportArchive()
                  }}
                >
                  <Archive className="w-4 h-4 mr-2" /> 导出归档
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={e => {
                    e.stopPropagation()
                    onDelete()
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" /> 删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          {/* 风格标签 */}
          {(artStyle || project.visual_style === 'custom') && (
            <div className="mb-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                {project.visual_style === 'custom'
                  ? project.custom_style?.name || '自定义风格'
                  : artStyle?.name}
              </span>
            </div>
          )}
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {project.description || '暂无描述'}
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>创建于 {new Date(project.created_at).toLocaleDateString()}</span>
          </div>
        </CardContent>
      </Card>

      {/* 图片预览对话框 */}
      {project.cover_image && (
        <ImagePreviewDialog
          src={project.cover_image}
          alt={project.name}
          title={project.name}
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
        />
      )}
    </>
  )
}

interface ProjectListItemProps {
  project: Project
  isSelected: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
  onExportJSON: () => void
  onExportArchive: () => void
}

function ProjectListItem({
  project,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onExportJSON,
  onExportArchive,
}: ProjectListItemProps) {
  return (
    <div
      className={`flex items-center gap-4 p-4 cursor-pointer transition-colors hover:bg-accent ${
        isSelected ? 'bg-primary/5' : ''
      }`}
      onClick={onSelect}
    >
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Film className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{project.name}</div>
        <div className="text-sm text-muted-foreground truncate">
          {project.description || '暂无描述'}
        </div>
      </div>
      <div className="text-sm text-muted-foreground hidden sm:block">
        {new Date(project.updated_at).toLocaleDateString()}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreVertical className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={e => {
              e.stopPropagation()
              onEdit()
            }}
          >
            <Edit2 className="w-4 h-4 mr-2" /> 编辑
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={e => {
              e.stopPropagation()
              onExportJSON()
            }}
          >
            <FileJson className="w-4 h-4 mr-2" /> 导出 JSON
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={e => {
              e.stopPropagation()
              onExportArchive()
            }}
          >
            <Archive className="w-4 h-4 mr-2" /> 导出归档
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={e => {
              e.stopPropagation()
              onDelete()
            }}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="w-4 h-4 mr-2" /> 删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

interface EpisodePanelProps {
  project: Project
  episodes: Episode[]
  currentEpisodeId: string | null
  onCreateEpisode: () => void
  onEditEpisode: (episode: Episode) => void
  onDeleteEpisode: (id: string) => void
  onSelectEpisode: (episode: Episode) => void
}

function EpisodePanel({
  project,
  episodes,
  currentEpisodeId,
  onCreateEpisode,
  onEditEpisode,
  onDeleteEpisode,
  onSelectEpisode,
}: EpisodePanelProps) {
  const { data: storyboards = [] } = useStoryboards(currentEpisodeId || '')
  const { data: characters = [] } = useCharacters(project.id, currentEpisodeId || undefined)
  const { data: scenes = [] } = useScenesByEpisode(currentEpisodeId || undefined)
  const { data: props = [] } = usePropsByEpisode(currentEpisodeId || undefined)

  const currentEpisodeStats = useMemo(() => {
    return {
      storyboards: storyboards.length,
      characters: characters.length,
      scenes: scenes.length,
      props: props.length,
      assets: 0,
      images: 0,
      videos: 0,
    }
  }, [storyboards, characters, scenes, props])

  return (
    <Card className="h-fit">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">剧集</CardTitle>
          </div>
          <Button size="sm" onClick={onCreateEpisode}>
            <Plus className="w-4 h-4 mr-1" />
            新建
          </Button>
        </div>
        <CardDescription>{project.name}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="list" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="list" className="flex-1">
              剧集列表
            </TabsTrigger>
            <TabsTrigger value="stats" className="flex-1">
              统计信息
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="mt-4">
            <div className="space-y-2">
              {episodes.map(episode => (
                <div
                  key={episode.id}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                    currentEpisodeId === episode.id
                      ? 'bg-primary/5 border-primary'
                      : 'hover:bg-accent'
                  }`}
                  onClick={() => onSelectEpisode(episode)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                        EP.{episode.episode_number || 1}
                      </span>
                      <span className="font-medium truncate">{episode.name}</span>
                    </div>
                    {episode.description && (
                      <div className="text-sm text-muted-foreground truncate mt-1">
                        {episode.description}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onEditEpisode(episode)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => onDeleteEpisode(episode.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}

              {episodes.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <p>暂无剧集</p>
                  <p className="text-sm mt-1">点击上方按钮创建剧集</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="stats" className="mt-4">
            {currentEpisodeId ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-2xl font-bold">{currentEpisodeStats.storyboards}</div>
                    <div className="text-sm text-muted-foreground">分镜数</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-2xl font-bold">{currentEpisodeStats.assets}</div>
                    <div className="text-sm text-muted-foreground">资产数</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-2xl font-bold">{currentEpisodeStats.images}</div>
                    <div className="text-sm text-muted-foreground">图片</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-2xl font-bold">{currentEpisodeStats.videos}</div>
                    <div className="text-sm text-muted-foreground">视频</div>
                  </div>
                </div>

                <div className="pt-2 border-t">
                  <h4 className="text-sm font-medium mb-2">资产分布</h4>
                  <div className="space-y-2">
                    {currentEpisodeStats.images > 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <Image className="w-4 h-4 text-muted-foreground" />
                        <span>图片资产</span>
                        <span className="ml-auto text-muted-foreground">
                          {currentEpisodeStats.images} 个
                        </span>
                      </div>
                    )}
                    {currentEpisodeStats.videos > 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <Video className="w-4 h-4 text-muted-foreground" />
                        <span>视频资产</span>
                        <span className="ml-auto text-muted-foreground">
                          {currentEpisodeStats.videos} 个
                        </span>
                      </div>
                    )}
                    {currentEpisodeStats.assets -
                      currentEpisodeStats.images -
                      currentEpisodeStats.videos >
                      0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span>其他资产</span>
                        <span className="ml-auto text-muted-foreground">
                          {currentEpisodeStats.assets -
                            currentEpisodeStats.images -
                            currentEpisodeStats.videos}{' '}
                          个
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>请选择一个剧集查看统计信息</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
