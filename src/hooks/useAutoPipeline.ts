import { useState, useCallback, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createAutoPipelineService, AutoPipelineService, type AutoPipelineState, type AutoPipelineConfig } from '@/services/autoPipelineService'
import { useUIStore } from '@/store/useUIStore'
import { useToast } from '@/hooks/useToast'
import logger from '@/utils/logger'

export function useAutoPipeline() {
  const [state, setState] = useState<AutoPipelineState>({
    phase: 'idle',
    percent: 0,
    message: '',
    currentStep: '',
    totalSteps: 8,
    completedSteps: 0,
    storyboardCount: 0,
    imageCompleted: 0,
    videoCompleted: 0,
    dubbingCompleted: 0,
    firstFrameUrls: [],
    failedItems: [],
  })
  const serviceRef = useRef<AutoPipelineService | null>(null)
  const queryClient = useQueryClient()
  const { currentProjectId, currentEpisodeId } = useUIStore()
  const { toast } = useToast()

  useEffect(() => {
    const service = createAutoPipelineService()
    serviceRef.current = service
    service.setStateHandler((newState) => setState({ ...newState }))
    return () => {
      service.cancel()
    }
  }, [])

  const start = useCallback(async (content: string, config?: Partial<AutoPipelineConfig>) => {
    if (!currentProjectId || !currentEpisodeId) {
      toast({ title: '请先选择项目和剧集', variant: 'destructive' })
      return
    }

    const fullConfig: AutoPipelineConfig = {
      projectId: currentProjectId,
      episodeId: currentEpisodeId,
      imageModel: config?.imageModel || 'official:claude-sonnet-4-6',
      videoModel: config?.videoModel || 'official:Wan2.6-I2V-1080P',
      ttsModel: config?.ttsModel || 'minimax:speech-01-turbo',
      ttsVoice: config?.ttsVoice || 'default',
      imageConcurrency: config?.imageConcurrency || 3,
      videoConcurrency: config?.videoConcurrency || 2,
      ttsConcurrency: config?.ttsConcurrency || 5,
      skipReview: config?.skipReview || false,
    }

    try {
      await serviceRef.current?.start(content, fullConfig)

      await queryClient.invalidateQueries({ queryKey: ['characters'] })
      await queryClient.invalidateQueries({ queryKey: ['scenes'] })
      await queryClient.invalidateQueries({ queryKey: ['props'] })
      await queryClient.invalidateQueries({ queryKey: ['storyboards'] })
      await queryClient.invalidateQueries({ queryKey: ['dubbings'] })

      if (state.phase === 'completed') {
        toast({ title: '全自动流水线完成', description: '所有资产、图片、视频和配音已生成' })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.error('[useAutoPipeline] 失败:', e)
      toast({ title: '流水线失败', description: msg, variant: 'destructive' })
    }
  }, [currentProjectId, currentEpisodeId, queryClient, toast, state.phase])

  const cancel = useCallback(() => {
    serviceRef.current?.cancel()
  }, [])

  const approve = useCallback((reviewId: string, approved: boolean) => {
    serviceRef.current?.approve(reviewId, approved)
  }, [])

  const isRunning = state.phase !== 'idle' && state.phase !== 'completed' && state.phase !== 'failed'
  const isWaitingForReview = state.phase === 'review_storyboard' || state.phase === 'review_first_frame'

  return { state, start, cancel, approve, isRunning, isWaitingForReview }
}
