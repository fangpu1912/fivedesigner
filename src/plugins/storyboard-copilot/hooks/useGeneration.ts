import { useCallback, useMemo } from 'react'
import { useImageGeneration } from '@/hooks/useVendorGeneration'
import { useTaskQueueStore } from '@/store/useTaskQueueStore'
import { useToast } from '@/hooks/useToast'
import type { GenerationResult } from '@/types/generation'

export interface GenerationOptions {
  projectId?: string
  episodeId?: string
  width?: number
  height?: number
  referenceImages?: string[]
  onProgress?: (progress: number) => void
}

export interface ImageEditOptions {
  prompt: string
  imageUrl: string
  maskImage?: string
  referenceImages?: string[]
  model?: string
  projectId?: string
  episodeId?: string
}

export function useGeneration() {
  const imageGeneration = useImageGeneration()
  const { toast } = useToast()

  const tasks = useTaskQueueStore((s) => s.tasks)
  const imageTaskProgress = useMemo(() => {
    const runningImageTask = tasks.find(
      (t) => t.type === 'image_generation' && t.status === 'running'
    )
    return runningImageTask?.progress ?? 0
  }, [tasks])

  const generateImage = useCallback(
    async (
      prompt: string,
      model: string,
      options: GenerationOptions = {}
    ): Promise<GenerationResult> => {
      const { projectId, episodeId, width, height, referenceImages } = options

      if (!projectId || !episodeId) {
        return {
          success: false,
          error: '缺少项目ID或剧集ID',
        }
      }

      try {
        const imageUrl = await imageGeneration.mutateAsync({
          prompt,
          model,
          projectId,
          episodeId,
          width,
          height,
          referenceImages,
          name: '分镜助手 - 图片生成',
        })

        return {
          success: true,
          imageUrl,
        }
      } catch (error) {
        console.error('[useGeneration] 生成失败:', error)
        toast({
          title: '生成失败',
          description: error instanceof Error ? error.message : '未知错误',
          variant: 'destructive',
        })
        return {
          success: false,
          error: error instanceof Error ? error.message : '未知错误',
        }
      }
    },
    [imageGeneration, toast]
  )

  const generateImageToImage = useCallback(
    async (
      prompt: string,
      imageUrl: string,
      model: string,
      options: GenerationOptions = {}
    ): Promise<GenerationResult> => {
      const { projectId, episodeId, width, height, referenceImages } = options

      if (!projectId || !episodeId) {
        return {
          success: false,
          error: '缺少项目ID或剧集ID',
        }
      }

      try {
        const generatedImageUrl = await imageGeneration.mutateAsync({
          prompt,
          model,
          imageUrl,
          projectId,
          episodeId,
          width,
          height,
          referenceImages,
          name: '分镜助手 - 图生图',
        })

        return {
          success: true,
          imageUrl: generatedImageUrl,
        }
      } catch (error) {
        console.error('[useGeneration] 生成失败:', error)
        toast({
          title: '生成失败',
          description: error instanceof Error ? error.message : '未知错误',
          variant: 'destructive',
        })
        return {
          success: false,
          error: error instanceof Error ? error.message : '未知错误',
        }
      }
    },
    [imageGeneration, toast]
  )

  const generateImageEdit = useCallback(
    async (options: ImageEditOptions): Promise<GenerationResult> => {
      const { prompt, imageUrl, maskImage, referenceImages, model, projectId, episodeId } = options

      if (!projectId || !episodeId) {
        return {
          success: false,
          error: '缺少项目ID或剧集ID',
        }
      }

      try {
        const generatedImageUrl = await imageGeneration.mutateAsync({
          prompt,
          imageUrl,
          maskImage,
          referenceImages,
          model,
          projectId,
          episodeId,
          name: '分镜助手 - 图片编辑',
        })

        return {
          success: true,
          imageUrl: generatedImageUrl,
        }
      } catch (error) {
        console.error('[useGeneration] 编辑生成失败:', error)
        toast({
          title: '生成失败',
          description: error instanceof Error ? error.message : '未知错误',
          variant: 'destructive',
        })
        return {
          success: false,
          error: error instanceof Error ? error.message : '未知错误',
        }
      }
    },
    [imageGeneration, toast]
  )

  const cancelGeneration = useCallback(() => {
    console.log('[useGeneration] 取消生成 - 请在任务队列面板中操作')
  }, [])

  return {
    isGenerating: imageGeneration.isPending,
    progress: imageTaskProgress,
    generateImage,
    generateImageToImage,
    generateImageEdit,
    cancelGeneration,
  }
}
