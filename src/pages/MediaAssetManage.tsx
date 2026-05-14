import { useState, useCallback } from 'react'

import { join } from '@tauri-apps/api/path'
import { open, confirm, save } from '@tauri-apps/plugin-dialog'
import { writeFile, readFile, mkdir, exists, copyFile } from '@tauri-apps/plugin-fs'
import {
  Download,
  FileImage,
  FileJson,
  FileText,
  Film,
  Folder,
  Image,
  Loader2,
  Pencil,
  Search,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'

import { ImagePreviewDialog } from '@/components/media/ImagePreviewDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useMediaAssets, useMediaAssetMutations } from '@/hooks/useMediaAssets'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import { workspaceService } from '@/services/workspace/WorkspaceService'
import { getImageUrl, getVideoUrl } from '@/utils/asset'


export default function MediaAssetManage() {
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [editingAsset, setEditingAsset] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPrompt, setEditPrompt] = useState('')
  const [editTags, setEditTags] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [previewVideo, setPreviewVideo] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState<'prompt' | 'file' | 'json' | null>(null)

  const { toast } = useToast()
  const { data: assets = [], isLoading } = useMediaAssets({
    type: filterType === 'all' ? undefined : filterType,
    search: searchQuery || undefined,
  })
  const mutations = useMediaAssetMutations()

  const allTags = [...new Set(assets.flatMap(a => a.tags || []))].sort()

  const handleImport = useCallback(async () => {
    const selected = await open({
      multiple: true,
      filters: [
        { name: '媒体文件', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'mp4', 'webm', 'mov', 'avi', 'mkv'] },
        { name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] },
        { name: '视频文件', extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      title: '选择文件导入到媒体库',
    })

    if (!selected) return

    setImporting(true)
    const paths = Array.isArray(selected) ? selected : [selected]

    try {
      const baseDir = await workspaceService.getWorkspacePath()
      const mediaDir = await join(baseDir, 'media-library')
      const dirExists = await exists(mediaDir)
      if (!dirExists) {
        await mkdir(mediaDir, { recursive: true })
      }

      let imported = 0
      for (const filePath of paths) {
        const fileName = filePath.split('\\').pop()?.split('/').pop() || 'unknown'
        const ext = fileName.split('.').pop()?.toLowerCase() || ''
        const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)
        const isVideo = ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)
        if (!isImage && !isVideo) continue

        const fileData = await readFile(filePath)
        const newFileName = `${uuidv4()}.${ext}`
        const destPath = await join(mediaDir, newFileName)
        await writeFile(destPath, fileData)

        await mutations.create.mutateAsync({
          name: fileName,
          type: isImage ? 'image' : 'video',
          file_path: destPath,
          source: 'imported',
        })
        imported++
      }

      toast({ title: '导入成功', description: `共导入 ${imported} 个媒体文件` })
    } catch (error) {
      toast({ title: '导入失败', description: String(error), variant: 'destructive' })
    } finally {
      setImporting(false)
    }
  }, [mutations, toast])

  const handleDelete = useCallback(async (id: string) => {
    const confirmed = await confirm('确定要删除吗？删除后文件将从媒体库移除。', {
      title: '确认删除',
      kind: 'warning',
      okLabel: '确定',
      cancelLabel: '取消',
    })
    if (!confirmed) return

    try {
      await mutations.remove.mutateAsync(id)
      toast({ title: '删除成功' })
    } catch (error) {
      toast({ title: '删除失败', description: String(error), variant: 'destructive' })
    }
  }, [mutations, toast])

  const openEditDialog = useCallback((asset: typeof assets[0]) => {
    setEditingAsset(asset.id)
    setEditName(asset.name)
    setEditPrompt(asset.prompt || '')
    setEditTags((asset.tags || []).join(', '))
    setEditDescription(asset.description || '')
  }, [])

  const handleSaveEdit = useCallback(async () => {
    if (!editingAsset) return
    try {
      await mutations.update.mutateAsync({
        id: editingAsset,
        data: {
          name: editName,
          prompt: editPrompt || undefined,
          tags: editTags.split(',').map(t => t.trim()).filter(Boolean),
          description: editDescription || undefined,
        },
      })
      toast({ title: '保存成功' })
      setEditingAsset(null)
    } catch (error) {
      toast({ title: '保存失败', description: String(error), variant: 'destructive' })
    }
  }, [editingAsset, editName, editPrompt, editTags, editDescription, mutations, toast])

  const handleExportPrompts = useCallback(async () => {
    if (assets.length === 0) {
      toast({ title: '没有可导出的内容', variant: 'destructive' })
      return
    }

    setExporting('prompt')
    try {
      const lines: string[] = []
      lines.push(`========== 素材收集 - 提示词导出 ==========`)
      lines.push(`导出时间: ${new Date().toLocaleString()}`)
      lines.push(`总数: ${assets.length} 个文件`)
      lines.push('')

      const images = assets.filter(a => a.type === 'image')
      const videos = assets.filter(a => a.type === 'video')

      if (images.length > 0) {
        lines.push('========== 图片提示词 ==========')
        images.forEach((asset, index) => {
          lines.push(`【图片 ${index + 1}】${asset.name}`)
          if (asset.prompt) lines.push(`${asset.prompt}`)
          if (asset.tags && asset.tags.length > 0) lines.push(`标签: ${asset.tags.join(', ')}`)
          if (asset.description) lines.push(`描述: ${asset.description}`)
          lines.push('')
        })
      }

      if (videos.length > 0) {
        lines.push('========== 视频提示词 ==========')
        videos.forEach((asset, index) => {
          lines.push(`【视频 ${index + 1}】${asset.name}`)
          if (asset.prompt) lines.push(`${asset.prompt}`)
          if (asset.tags && asset.tags.length > 0) lines.push(`标签: ${asset.tags.join(', ')}`)
          if (asset.description) lines.push(`描述: ${asset.description}`)
          lines.push('')
        })
      }

      const content = lines.join('\n')
      const savePath = await save({
        defaultPath: `素材提示词_${new Date().toISOString().slice(0, 10)}.txt`,
        filters: [{ name: '文本文件', extensions: ['txt'] }],
        title: '保存提示词',
      })

      if (!savePath) return
      const encoder = new TextEncoder()
      await writeFile(savePath, encoder.encode(content))
      toast({ title: '导出成功', description: `已保存到 ${savePath}` })
    } catch (error) {
      toast({ title: '导出失败', description: String(error), variant: 'destructive' })
    } finally {
      setExporting(null)
    }
  }, [assets, toast])

  const handleExportFiles = useCallback(async () => {
    if (assets.length === 0) {
      toast({ title: '没有可导出的文件', variant: 'destructive' })
      return
    }

    const dir = await open({
      directory: true,
      title: '选择导出目录',
    })
    if (!dir) return

    setExporting('file')
    try {
      let copied = 0
      for (const asset of assets) {
        if (!asset.file_path) continue
        const fileName = asset.name
        const destPath = await join(dir, fileName)
        try {
          await copyFile(asset.file_path, destPath)
          copied++
        } catch {
          // 跳过失败的文件
        }
      }
      toast({ title: '导出成功', description: `已导出 ${copied} 个文件到 ${dir}` })
    } catch (error) {
      toast({ title: '导出失败', description: String(error), variant: 'destructive' })
    } finally {
      setExporting(null)
    }
  }, [assets, toast])

  const handleExportJson = useCallback(async () => {
    if (assets.length === 0) {
      toast({ title: '没有可导出的内容', variant: 'destructive' })
      return
    }

    setExporting('json')
    try {
      const exportData = assets.map(asset => ({
        name: asset.name,
        type: asset.type,
        prompt: asset.prompt || null,
        tags: asset.tags || [],
        description: asset.description || null,
        file_path: asset.file_path,
        width: asset.width || null,
        height: asset.height || null,
        file_size: asset.file_size || null,
        source: asset.source || null,
        created_at: asset.created_at,
        updated_at: asset.updated_at,
      }))

      const content = JSON.stringify(exportData, null, 2)
      const savePath = await save({
        defaultPath: `素材数据_${new Date().toISOString().slice(0, 10)}.json`,
        filters: [
          { name: 'JSON 文件', extensions: ['json'] },
          { name: '所有文件', extensions: ['*'] },
        ],
        title: '保存 JSON',
      })

      if (!savePath) return
      const encoder = new TextEncoder()
      await writeFile(savePath, encoder.encode(content))
      toast({ title: '导出成功', description: `已保存到 ${savePath}` })
    } catch (error) {
      toast({ title: '导出失败', description: String(error), variant: 'destructive' })
    } finally {
      setExporting(null)
    }
  }, [assets, toast])

  const isExporting = exporting !== null

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b shrink-0">
        <div>
          <h1 className="text-lg font-semibold">素材收集</h1>
          <p className="text-sm text-muted-foreground">收集图片、视频及其提示词，用于复用和管理</p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={isExporting || assets.length === 0}>
                {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                导出
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportPrompts} disabled={isExporting}>
                <FileText className="h-4 w-4 mr-2" />
                导出提示词 (TXT)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportFiles} disabled={isExporting}>
                <Folder className="h-4 w-4 mr-2" />
                导出文件到目录
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleExportJson} disabled={isExporting}>
                <FileJson className="h-4 w-4 mr-2" />
                导出元数据 (JSON)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" onClick={handleImport} disabled={importing}>
            {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            导入文件
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 p-4 border-b shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索名称或提示词..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-8"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 border rounded-lg p-0.5">
          {(['all', 'image', 'video'] as const).map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm transition-colors',
                filterType === type
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {type === 'all' ? '全部' : type === 'image' ? '图片' : '视频'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            加载中...
          </div>
        ) : assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
            {searchQuery || filterType !== 'all' ? (
              <>
                <Search className="h-10 w-10 opacity-30" />
                <p>没有匹配的媒体文件</p>
              </>
            ) : (
              <>
                <FileImage className="h-10 w-10 opacity-30" />
                <p>素材为空，点击右上角导入文件</p>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {assets.map(asset => {
              const displayUrl = getImageUrl(asset.file_path) || getVideoUrl(asset.file_path)
              return (
                <div
                  key={asset.id}
                  className="group relative rounded-lg border bg-card overflow-hidden hover:shadow-md transition-shadow"
                >
                  <div className="aspect-[4/3] bg-muted flex items-center justify-center overflow-hidden">
                    {asset.type === 'image' ? (
                      displayUrl ? (
                        <img
                          src={displayUrl}
                          alt={asset.name}
                          className="w-full h-full object-cover cursor-pointer"
                          onClick={() => setPreviewImage(displayUrl)}
                        />
                      ) : (
                        <Image className="h-8 w-8 text-muted-foreground/50" />
                      )
                    ) : displayUrl ? (
                      <div
                        className="relative w-full h-full cursor-pointer group/video"
                        onClick={() => setPreviewVideo(displayUrl)}
                      >
                        <video
                          src={displayUrl}
                          className="w-full h-full object-cover"
                          muted
                          onMouseEnter={e => (e.target as HTMLVideoElement).play()}
                          onMouseLeave={e => {
                            (e.target as HTMLVideoElement).pause()
                            ;(e.target as HTMLVideoElement).currentTime = 0
                          }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/video:opacity-100 transition-opacity bg-black/30">
                          <Film className="h-8 w-8 text-white" />
                        </div>
                      </div>
                    ) : (
                      <Video className="h-8 w-8 text-muted-foreground/50" />
                    )}
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEditDialog(asset)}
                        className="h-7 w-7 rounded-full bg-background/90 flex items-center justify-center hover:bg-background shadow-sm"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(asset.id)}
                        className="h-7 w-7 rounded-full bg-background/90 flex items-center justify-center hover:bg-background hover:text-destructive shadow-sm"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="absolute top-2 left-2">
                      <div className={cn(
                        'flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium shadow-sm',
                        asset.type === 'image'
                          ? 'bg-sky-500/90 text-white'
                          : 'bg-violet-500/90 text-white'
                      )}>
                        {asset.type === 'image' ? (
                          <Image className="h-3 w-3" />
                        ) : (
                          <Film className="h-3 w-3" />
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="p-2.5 space-y-1.5">
                    <p className="text-xs font-medium truncate" title={asset.name}>
                      {asset.name}
                    </p>
                    {asset.prompt ? (
                      <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">
                        {asset.prompt}
                      </p>
                    ) : (
                      <p className="text-[10px] text-muted-foreground/50 italic">无提示词</p>
                    )}
                    {asset.tags && asset.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {asset.tags.slice(0, 3).map(tag => (
                          <Badge key={tag} variant="outline" className="text-[9px] px-1 py-0 h-4">
                            {tag}
                          </Badge>
                        ))}
                        {asset.tags.length > 3 && (
                          <span className="text-[9px] text-muted-foreground">+{asset.tags.length - 3}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Dialog open={!!editingAsset} onOpenChange={(open) => !open && setEditingAsset(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑媒体信息</DialogTitle>
            <DialogDescription>修改名称、提示词、标签和描述</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">名称</label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="文件名称" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">提示词</label>
              <Textarea
                value={editPrompt}
                onChange={e => setEditPrompt(e.target.value)}
                placeholder="输入提示词..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">标签</label>
              <Input
                value={editTags}
                onChange={e => setEditTags(e.target.value)}
                placeholder="用逗号分隔多个标签"
              />
              {allTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {allTags.map(tag => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="cursor-pointer hover:bg-accent text-[10px]"
                      onClick={() => {
                        const currentTags = editTags.split(',').map(t => t.trim()).filter(Boolean)
                        if (!currentTags.includes(tag)) {
                          setEditTags([...currentTags, tag].join(', '))
                        }
                      }}
                    >
                      + {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">描述</label>
              <Textarea
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                placeholder="输入描述..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingAsset(null)}>取消</Button>
            <Button onClick={handleSaveEdit}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImagePreviewDialog
        src={previewImage || ''}
        isOpen={!!previewImage}
        onClose={() => setPreviewImage(null)}
      />

      <Dialog open={!!previewVideo} onOpenChange={(open) => !open && setPreviewVideo(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>视频预览</DialogTitle>
          </DialogHeader>
          {previewVideo && (
            <video src={previewVideo} controls className="w-full max-h-[70vh] rounded-lg" autoPlay />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
