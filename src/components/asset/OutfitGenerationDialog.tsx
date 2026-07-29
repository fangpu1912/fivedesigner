import { useState, useEffect, useCallback } from 'react'

import {
  Wand2,
  Loader2,
  Image as ImageIcon,
  RefreshCw,
  Check,
  AlertCircle,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/useToast'
import { useCharacter } from '@/hooks/useCharacters'
import { useOutfitMutations } from '@/hooks/useOutfits'
import { useGeneration } from '@/plugins/storyboard-copilot/hooks/useGeneration'
import { VendorModelSelector } from '@/components/ai/VendorModelSelector'
import { useUIStore } from '@/store/useUIStore'
import { getImageUrl } from '@/utils/asset'
import { saveGeneratedImage } from '@/utils/mediaStorage'
import type { CharacterOutfit } from '@/types'

interface OutfitGenerationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  characterId: string
  outfit: CharacterOutfit | null
  projectId?: string
  episodeId?: string
}

/**
 * 衣橱图生图换装弹窗
 * 基于角色主图 + 服装提示词，调用图生图生成新服装图，并写回 outfit.image
 */
export function OutfitGenerationDialog({
  open,
  onOpenChange,
  characterId,
  outfit,
  projectId,
  episodeId,
}: OutfitGenerationDialogProps) {
  const { toast } = useToast()
  const { data: character } = useCharacter(characterId)
  const outfitMutations = useOutfitMutations()
  const { generateImageToImage, isGenerating, progress } = useGeneration()

  const storeProjectId = useUIStore((state) => state.currentProjectId)
  const storeEpisodeId = useUIStore((state) => state.currentEpisodeId)

  const effectiveProjectId = projectId || storeProjectId || ''
  const effectiveEpisodeId = episodeId || storeEpisodeId || ''

  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('')
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [isApplying, setIsApplying] = useState(false)

  // 每次打开弹窗或切换 outfit 时，重置状态
  useEffect(() => {
    if (open && outfit) {
      setPrompt(outfit.prompt || '')
      setGeneratedUrl(null)
      setModel('')
    }
  }, [open, outfit])

  const characterImage = character?.image || ''
  const characterImageDisplay = getImageUrl(characterImage)

  const handleGenerate = useCallback(async () => {
    if (!outfit) return
    if (!characterImage) {
      toast({
        title: '无法生成',
        description: '该角色没有主图，无法作为图生图参考',
        variant: 'destructive',
      })
      return
    }
    if (!prompt.trim()) {
      toast({ title: '请输入提示词', variant: 'destructive' })
      return
    }
    if (!model) {
      toast({ title: '请选择图片模型', variant: 'destructive' })
      return
    }
    if (!effectiveProjectId || !effectiveEpisodeId) {
      toast({
        title: '缺少项目或剧集',
        description: '请先在侧边栏选择当前项目和剧集',
        variant: 'destructive',
      })
      return
    }

    setGeneratedUrl(null)

    const result = await generateImageToImage(prompt, characterImage, model, {
      projectId: effectiveProjectId,
      episodeId: effectiveEpisodeId,
    })

    if (result.success && result.imageUrl) {
      setGeneratedUrl(result.imageUrl)
    } else {
      toast({
        title: '生成失败',
        description: result.error || '请重试',
        variant: 'destructive',
      })
    }
  }, [outfit, characterImage, prompt, model, effectiveProjectId, effectiveEpisodeId, generateImageToImage, toast])

  const handleApply = useCallback(async () => {
    if (!outfit || !generatedUrl) return

    setIsApplying(true)
    try {
      const savedPath = await saveGeneratedImage(
        generatedUrl,
        effectiveProjectId,
        effectiveEpisodeId
      )

      await outfitMutations.updateAsync({
        id: outfit.id,
        data: { image: savedPath },
      })

      toast({ title: '已应用为服装图片' })
      onOpenChange(false)
    } catch (error) {
      toast({
        title: '应用失败',
        description: error instanceof Error ? error.message : '请重试',
        variant: 'destructive',
      })
    } finally {
      setIsApplying(false)
    }
  }, [outfit, generatedUrl, effectiveProjectId, effectiveEpisodeId, outfitMutations, onOpenChange, toast])

  const handleClose = (v: boolean) => {
    if (isGenerating || isApplying) return
    onOpenChange(v)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-purple-500" />
            AI 换装 - {outfit?.name || ''}
          </DialogTitle>
          <DialogDescription>
            基于角色主图和服装提示词生成新服装图
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto -mx-6 px-6">
          <div className="flex gap-4">
            {/* 左侧：角色主图 */}
            <div className="w-40 shrink-0">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                角色主图（参考图）
              </label>
              <div className="aspect-[3/4] rounded-lg border overflow-hidden bg-muted">
                {characterImageDisplay ? (
                  <img
                    src={characterImageDisplay}
                    alt={character?.name || '角色'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-8 w-8 mb-2 opacity-50" />
                    <span className="text-[10px] text-center px-2">
                      该角色没有主图
                    </span>
                  </div>
                )}
              </div>
              {!characterImageDisplay && (
                <p className="text-[10px] text-destructive mt-1.5">
                  请先在资产管理中为角色上传主图
                </p>
              )}
            </div>

            {/* 右侧：参数和操作 */}
            <div className="flex-1 space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  服装提示词
                </label>
                <Textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="描述想要生成的服装/状态"
                  rows={4}
                  className="text-xs"
                  disabled={isGenerating}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  图片模型
                </label>
                <VendorModelSelector
                  type="image"
                  value={model}
                  onChange={(_vendorId, _modelName, fullValue) => setModel(fullValue)}
                  disabled={isGenerating}
                  className="w-full"
                />
              </div>

              {/* 生成按钮和进度 */}
              <div className="space-y-2">
                <Button
                  onClick={handleGenerate}
                  disabled={
                    isGenerating ||
                    isApplying ||
                    !characterImageDisplay ||
                    !prompt.trim() ||
                    !model
                  }
                  className="w-full"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      生成中... {progress > 0 ? `${progress}%` : ''}
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4 mr-1" />
                      {generatedUrl ? '重新生成' : '生成服装图'}
                    </>
                  )}
                </Button>

                {isGenerating && progress > 0 && (
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 生成结果预览 */}
          {generatedUrl && (
            <div className="mt-4 pt-4 border-t">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                生成结果
              </label>
              <div className="flex gap-4">
                <div className="w-40 shrink-0">
                  <div className="aspect-[3/4] rounded-lg border overflow-hidden bg-muted">
                    <img
                      src={getImageUrl(generatedUrl) || generatedUrl}
                      alt="生成结果"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
                <div className="flex-1 flex flex-col justify-center gap-2">
                  <p className="text-xs text-muted-foreground">
                    满意吗？点击下方按钮将此图应用为该服装的图片。
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleGenerate}
                      disabled={isGenerating || isApplying}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      重新生成
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleApply}
                      disabled={isApplying}
                    >
                      {isApplying ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3 mr-1" />
                      )}
                      应用为服装图片
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 边界提示 */}
          {!characterImageDisplay && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                该角色没有主图，无法进行图生图。
                请先在资产管理中为该角色上传一张主图（角色默认形象），再回来换装。
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
