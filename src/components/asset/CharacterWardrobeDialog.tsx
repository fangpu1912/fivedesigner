import { useState } from 'react'

import { open } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'
import { saveMediaFile } from '@/utils/mediaStorage'
import { getImageUrl } from '@/utils/asset'
import {
  Shirt,
  Plus,
  Trash2,
  Star,
  Upload,
  Loader2,
  X,
  Image as ImageIcon,
  Save,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/useToast'
import {
  useOutfitsByCharacter,
  useOutfitMutations,
} from '@/hooks/useOutfits'
import type { CharacterOutfit } from '@/types'

interface CharacterWardrobeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  characterId: string
  characterName: string
  projectId?: string
  episodeId?: string
  onSelectOutfit?: (outfit: CharacterOutfit) => void
}

export function CharacterWardrobeDialog({
  open: isOpen,
  onOpenChange,
  characterId,
  characterName,
  projectId,
  episodeId,
  onSelectOutfit,
}: CharacterWardrobeDialogProps) {
  const { toast } = useToast()
  const { data: outfits = [], isLoading } = useOutfitsByCharacter(characterId)
  const outfitMutations = useOutfitMutations()

  const [editingOutfit, setEditingOutfit] = useState<CharacterOutfit | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    prompt: '',
    tags: '',
  })
  const [outfitImage, setOutfitImage] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const resetForm = () => {
    setFormData({ name: '', description: '', prompt: '', tags: '' })
    setOutfitImage(null)
    setEditingOutfit(null)
    setIsCreating(false)
  }

  const handleStartCreate = () => {
    resetForm()
    setIsCreating(true)
  }

  const handleStartEdit = (outfit: CharacterOutfit) => {
    setEditingOutfit(outfit)
    setFormData({
      name: outfit.name,
      description: outfit.description || '',
      prompt: outfit.prompt || '',
      tags: outfit.tags?.join(', ') || '',
    })
    setOutfitImage(outfit.image || null)
    setIsCreating(true)
  }

  const handleImageSelect = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          { name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
        ],
        title: '选择服装图片',
      })
      if (!selected) return

      setIsUploading(true)
      const filePath = selected as string
      const fileData = await readFile(filePath)
      const ext = filePath.split('.').pop() || 'png'
      const imagePath = await saveMediaFile(
        fileData,
        {
          projectId: projectId || '',
          episodeId: episodeId || '',
          type: 'character',
          extension: ext,
        }
      )
      setOutfitImage(imagePath)
      toast({ title: '图片上传成功' })
    } catch (error) {
      toast({
        title: '上传失败',
        description: error instanceof Error ? error.message : '请重试',
        variant: 'destructive',
      })
    } finally {
      setIsUploading(false)
    }
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({ title: '请输入服装名称', variant: 'destructive' })
      return
    }

    setIsSaving(true)
    try {
      const tags = formData.tags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean)

      if (editingOutfit) {
        await outfitMutations.updateAsync({
          id: editingOutfit.id,
          data: {
            character_id: characterId,
            name: formData.name.trim(),
            description: formData.description || undefined,
            prompt: formData.prompt || undefined,
            image: outfitImage || undefined,
            tags: tags.length > 0 ? tags : undefined,
          },
        })
        toast({ title: '服装已更新' })
      } else {
        await outfitMutations.createAsync({
          character_id: characterId,
          name: formData.name.trim(),
          description: formData.description || undefined,
          prompt: formData.prompt || undefined,
          image: outfitImage || undefined,
          tags: tags.length > 0 ? tags : undefined,
          is_default: outfits.length === 0,
        })
        toast({ title: '服装已添加' })
      }
      resetForm()
    } catch (error) {
      toast({
        title: '保存失败',
        description: error instanceof Error ? error.message : '请重试',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (outfit: CharacterOutfit) => {
    try {
      await outfitMutations.deleteAsync({ id: outfit.id, characterId })
      toast({ title: '服装已删除' })
    } catch (error) {
      toast({
        title: '删除失败',
        description: error instanceof Error ? error.message : '请重试',
        variant: 'destructive',
      })
    }
  }

  const handleSetDefault = async (outfit: CharacterOutfit) => {
    try {
      await outfitMutations.setDefaultAsync({
        characterId,
        outfitId: outfit.id,
      })
      toast({ title: '已设为默认服装' })
    } catch (error) {
      toast({
        title: '设置失败',
        description: error instanceof Error ? error.message : '请重试',
        variant: 'destructive',
      })
    }
  }

  const displayImage = (path?: string) => {
    return getImageUrl(path)
  }

  return (
    <Dialog open={isOpen} onOpenChange={v => { if (!v) resetForm(); onOpenChange(v) }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shirt className="h-5 w-5 text-blue-500" />
            {characterName} 的衣橱
          </DialogTitle>
          <DialogDescription>
            管理角色的不同服装造型，可用于生图时选择不同穿搭
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto -mx-6 px-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : isCreating ? (
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">
                  {editingOutfit ? '编辑服装' : '添加服装'}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetForm}
                >
                  <X className="h-4 w-4 mr-1" />
                  取消
                </Button>
              </div>

              <div className="flex gap-4">
                <div className="w-32 shrink-0">
                  <div
                    className="aspect-[3/4] rounded-lg border-2 border-dashed border-border overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={handleImageSelect}
                  >
                    {outfitImage ? (
                      <img
                        src={displayImage(outfitImage) || ''}
                        alt="服装预览"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-muted/50">
                        {isUploading ? (
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        ) : (
                          <>
                            <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                            <span className="text-[10px] text-muted-foreground">上传图片</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  {outfitImage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full mt-1 text-xs"
                      onClick={handleImageSelect}
                      disabled={isUploading}
                    >
                      更换图片
                    </Button>
                  )}
                </div>

                <div className="flex-1 space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">服装名称 *</label>
                    <Input
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      placeholder="如：日常便装、战斗盔甲、晚礼服"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">描述</label>
                    <Textarea
                      value={formData.description}
                      onChange={e => setFormData({ ...formData, description: e.target.value })}
                      placeholder="服装的详细描述"
                      rows={2}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">生图提示词</label>
                    <Textarea
                      value={formData.prompt}
                      onChange={e => setFormData({ ...formData, prompt: e.target.value })}
                      placeholder="AI 生图时的服装提示词"
                      rows={3}
                      className="font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">标签</label>
                    <Input
                      value={formData.tags}
                      onChange={e => setFormData({ ...formData, tags: e.target.value })}
                      placeholder="多个标签用逗号分隔，如：日常,现代,休闲"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={resetForm}>
                  取消
                </Button>
                <Button onClick={handleSave} disabled={isSaving || !formData.name.trim()}>
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-1" />
                  )}
                  {editingOutfit ? '更新' : '添加'}
                </Button>
              </div>
            </div>
          ) : outfits.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Shirt className="h-12 w-12 mb-3 opacity-50" />
              <p className="text-sm mb-1">还没有服装造型</p>
              <p className="text-xs mb-4">为角色添加不同的服装，生图时可以切换穿搭</p>
              <Button size="sm" onClick={handleStartCreate}>
                <Plus className="h-4 w-4 mr-1" />
                添加第一套服装
              </Button>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  共 {outfits.length} 套服装
                </span>
                <Button size="sm" onClick={handleStartCreate}>
                  <Plus className="h-4 w-4 mr-1" />
                  添加
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {outfits.map(outfit => {
                  const imgUrl = displayImage(outfit.image)
                  return (
                    <div
                      key={outfit.id}
                      className="group relative rounded-lg border bg-card overflow-hidden hover:shadow-md transition-shadow"
                    >
                      <div
                        className="aspect-[3/4] relative bg-muted overflow-hidden cursor-pointer"
                        onClick={() => onSelectOutfit?.(outfit)}
                      >
                        {imgUrl ? (
                          <img
                            src={imgUrl}
                            alt={outfit.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-muted/50">
                            <ImageIcon className="h-8 w-8 text-muted-foreground opacity-50" />
                          </div>
                        )}

                        {outfit.is_default && (
                          <div className="absolute top-2 left-2">
                            <Badge className="bg-yellow-500 text-white text-[10px] gap-0.5">
                              <Star className="h-3 w-3" />
                              默认
                            </Badge>
                          </div>
                        )}

                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={e => {
                              e.stopPropagation()
                              handleStartEdit(outfit)
                            }}
                          >
                            编辑
                          </Button>
                          {!outfit.is_default && (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={e => {
                                e.stopPropagation()
                                handleSetDefault(outfit)
                              }}
                            >
                              <Star className="h-3 w-3 mr-0.5" />
                              设为默认
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={e => {
                              e.stopPropagation()
                              handleDelete(outfit)
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      <div className="p-2">
                        <p className="text-sm font-medium truncate">{outfit.name}</p>
                        {outfit.description && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {outfit.description}
                          </p>
                        )}
                        {outfit.tags && outfit.tags.length > 0 && (
                          <div className="flex flex-wrap gap-0.5 mt-1">
                            {outfit.tags.slice(0, 3).map((tag: string, i: number) => (
                              <Badge
                                key={i}
                                variant="secondary"
                                className="text-[9px] px-1 py-0 h-4"
                              >
                                {tag}
                              </Badge>
                            ))}
                            {outfit.tags.length > 3 && (
                              <Badge
                                variant="secondary"
                                className="text-[9px] px-1 py-0 h-4"
                              >
                                +{outfit.tags.length - 3}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
