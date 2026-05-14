import { AI } from '@/services/vendor/aiService'
import { getActivePrompt } from '@/services/promptConfigService'
import { characterDB, sceneDB, propDB, storyboardDB, dubbingDB } from '@/db'
import { createProductionScheduler, type ProductionTask, type ProductionProgress } from '@/services/productionAgentService'
import { saveGeneratedImage, saveGeneratedVideo, saveGeneratedAudio } from '@/utils/mediaStorage'
import { getImageUrl, getVideoUrl, getAudioUrl } from '@/utils/asset'
import logger from '@/utils/logger'
import {
  runPipeline,
  parseJSON,
  type PipelineProgress,
  type PipelineProgressCallback,
} from './novelPipelineService'

export type AutoPhase =
  | 'idle'
  | 'text_pipeline'
  | 'review_storyboard'
  | 'generating_images'
  | 'review_first_frame'
  | 'generating_videos'
  | 'generating_dubbing'
  | 'composing'
  | 'completed'
  | 'failed'

export interface AutoPipelineState {
  phase: AutoPhase
  percent: number
  message: string
  currentStep: string
  totalSteps: number
  completedSteps: number

  storyboardCount: number
  imageCompleted: number
  videoCompleted: number
  dubbingCompleted: number

  firstFrameUrls: string[]
  failedItems: FailedItem[]
}

export interface FailedItem {
  storyboardId: string
  step: 'image' | 'video' | 'dubbing'
  error: string
}

export interface AutoPipelineConfig {
  projectId: string
  episodeId: string
  imageModel: string
  videoModel: string
  ttsModel: string
  ttsVoice: string
  imageConcurrency?: number
  videoConcurrency?: number
  ttsConcurrency?: number
  skipReview?: boolean
}

type ApprovalResolver = (approved: boolean) => void

export class AutoPipelineService {
  private state: AutoPipelineState = this.getInitialState()
  private onStateChange: ((state: AutoPipelineState) => void) | null = null
  private abortController = new AbortController()
  private approvalResolvers = new Map<string, ApprovalResolver>()
  private config: AutoPipelineConfig | null = null

  private getInitialState(): AutoPipelineState {
    return {
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
    }
  }

  setStateHandler(handler: (state: AutoPipelineState) => void) {
    this.onStateChange = handler
  }

  private updateState(partial: Partial<AutoPipelineState>) {
    this.state = { ...this.state, ...partial }
    this.onStateChange?.(this.state)
  }

  async start(content: string, config: AutoPipelineConfig) {
    this.config = config
    this.abortController = new AbortController()
    this.state = this.getInitialState()
    this.onStateChange?.(this.state)

    try {
      await this.clearExistingData(config.projectId, config.episodeId)
      await this.runTextPipeline(content, config)
      await this.waitForApproval('review_storyboard', '分镜审核', '请检查生成的分镜和资产，确认后将继续生成图片')
      await this.generateImages(config)
      await this.waitForApproval('review_first_frame', '首帧审核', '请检查生成的图片，确认画风和角色一致性后将继续生成视频')
      await this.generateVideos(config)
      await this.generateDubbing(config)
      this.updateState({ phase: 'completed', percent: 100, message: '全自动流水线完成', completedSteps: 8 })
    } catch (error) {
      if (this.abortController.signal.aborted) {
        this.updateState({ phase: 'idle', message: '流水线已取消' })
      } else {
        const msg = error instanceof Error ? error.message : String(error)
        this.updateState({ phase: 'failed', message: msg })
        logger.error('[AutoPipeline] 失败:', error)
      }
    }
  }

  cancel() {
    this.abortController.abort()
    for (const [key, resolver] of this.approvalResolvers) {
      resolver(false)
      this.approvalResolvers.delete(key)
    }
  }

  approve(reviewId: string, approved: boolean) {
    const resolver = this.approvalResolvers.get(reviewId)
    if (resolver) {
      resolver(approved)
      this.approvalResolvers.delete(reviewId)
    }
  }

  private async waitForApproval(phase: AutoPhase, title: string, description: string): Promise<void> {
    if (this.config?.skipReview) return

    this.updateState({ phase, message: `${title}：${description}` })

    return new Promise((resolve) => {
      const id = phase
      this.approvalResolvers.set(id, (approved) => {
        if (!approved) {
          this.abortController.abort()
        }
        resolve()
      })
    })
  }

  private async clearExistingData(projectId: string, episodeId: string) {
    const existingChars = await characterDB.getByEpisode(episodeId)
    const existingScenes = await sceneDB.getByEpisode(episodeId)
    const existingProps = await propDB.getByEpisode(episodeId)
    const existingStoryboards = await storyboardDB.getAll(episodeId)
    const existingDubbings = await dubbingDB.getByEpisode(episodeId)
    const orphanedDubbings = await dubbingDB.getOrphaned(projectId)

    for (const d of [...existingDubbings, ...orphanedDubbings]) await dubbingDB.delete(d.id)
    for (const sb of existingStoryboards) await storyboardDB.delete(sb.id)
    for (const p of existingProps) await propDB.delete(p.id)
    for (const s of existingScenes) await sceneDB.delete(s.id)
    for (const c of existingChars) await characterDB.delete(c.id)
  }

  private async runTextPipeline(content: string, config: AutoPipelineConfig) {
    this.updateState({
      phase: 'text_pipeline',
      percent: 5,
      message: '正在分析剧本并提取资产...',
      currentStep: '剧本分析',
      completedSteps: 0,
    })

    await runPipeline(content, config.projectId, config.episodeId, (p: PipelineProgress) => {
      if (this.abortController.signal.aborted) return
      const percent = Math.min(40, p.percent * 0.4)
      this.updateState({
        percent,
        message: p.stepName,
        currentStep: p.stepName,
      })
    })

    const storyboards = await storyboardDB.getAll(config.episodeId)
    this.updateState({
      percent: 40,
      completedSteps: 2,
      currentStep: '分镜拆解完成',
      message: `已生成 ${storyboards.length} 个分镜`,
      storyboardCount: storyboards.length,
    })
  }

  private async generateImages(config: AutoPipelineConfig) {
    this.updateState({
      phase: 'generating_images',
      percent: 45,
      message: '正在生成分镜图片...',
      currentStep: '图片生成',
      completedSteps: 3,
    })

    const storyboards = await storyboardDB.getAll(config.episodeId)
    const pending = storyboards.filter(sb => !sb.image && sb.prompt)

    if (pending.length === 0) {
      this.updateState({ percent: 60, imageCompleted: storyboards.length })
      return
    }

    const scheduler = createProductionScheduler({ maxConcurrency: config.imageConcurrency || 3 })
    let completed = 0

    scheduler.setProgressCallback((progress: ProductionProgress) => {
      const basePercent = 45
      const range = 15
      const percent = basePercent + Math.floor(progress.percent * range)
      this.updateState({
        percent,
        message: `图片生成中 (${completed}/${pending.length})`,
      })
    })

    for (const sb of pending) {
      scheduler.addTask({
        id: sb.id,
        type: 'image_gen',
        name: `分镜图片: ${sb.name || sb.id}`,
        maxRetries: 1,
        metadata: { storyboardId: sb.id, prompt: sb.prompt },
      })
    }

    scheduler.registerExecutor('image_gen', async (task: ProductionTask) => {
      if (this.abortController.signal.aborted) throw new Error('已取消')

      const { storyboardId, prompt } = task.metadata as { storyboardId: string; prompt: string }
      const sb = await storyboardDB.getById(storyboardId)
      if (!sb) throw new Error('分镜不存在')

      const fullPrompt = await this.buildImagePrompt(sb, config)

      const imageUrl = await AI.Image.generate(
        {
          prompt: fullPrompt,
          width: 1024,
          height: 576,
        },
        config.imageModel,
        0
      )

      let localPath: string | null = null
      if (imageUrl) {
        try {
          localPath = await saveGeneratedImage(imageUrl, config.projectId, config.episodeId)
        } catch {
          localPath = imageUrl
        }
      }

      await storyboardDB.update(storyboardId, {
        image: localPath || imageUrl,
        status: 'image_done',
      })

      completed++
      this.updateState({ imageCompleted: completed })

      if (completed <= 3 && localPath) {
        this.updateState({
          firstFrameUrls: [...this.state.firstFrameUrls, getImageUrl(localPath) || localPath],
        })
      }

      return imageUrl
    })

    await scheduler.start()
    this.updateState({ percent: 60, completedSteps: 4, currentStep: '图片生成完成' })
  }

  private async buildImagePrompt(sb: any, config: AutoPipelineConfig): Promise<string> {
    const parts = [sb.prompt || sb.description || '']

    if (sb.character_ids?.length) {
      for (const charId of sb.character_ids) {
        try {
          const char = await characterDB.getById(charId)
          if (char?.prompt) parts.push(char.prompt)
        } catch {}
      }
    }

    if (sb.scene_id) {
      try {
        const scene = await sceneDB.getById(sb.scene_id)
        if (scene?.prompt) parts.push(scene.prompt)
      } catch {}
    }

    try {
      const project = await (await import('@/db')).projectDB.getById(config.projectId)
      if (project?.visual_style) parts.push(project.visual_style)
      if (project?.quality_prompt) parts.push(project.quality_prompt)
    } catch {}

    return parts.filter(Boolean).join(', ')
  }

  private async generateVideos(config: AutoPipelineConfig) {
    this.updateState({
      phase: 'generating_videos',
      percent: 65,
      message: '正在生成分镜视频...',
      currentStep: '视频生成',
      completedSteps: 5,
    })

    const storyboards = await storyboardDB.getAll(config.episodeId)
    const withImage = storyboards.filter(sb => sb.image && !sb.video)

    if (withImage.length === 0) {
      this.updateState({ percent: 80, videoCompleted: storyboards.length })
      return
    }

    const scheduler = createProductionScheduler({ maxConcurrency: config.videoConcurrency || 2 })
    let completed = 0

    scheduler.setProgressCallback((progress: ProductionProgress) => {
      const basePercent = 65
      const range = 15
      const percent = basePercent + Math.floor(progress.percent * range)
      this.updateState({
        percent,
        message: `视频生成中 (${completed}/${withImage.length})`,
      })
    })

    for (const sb of withImage) {
      scheduler.addTask({
        id: `video-${sb.id}`,
        type: 'video_gen',
        name: `分镜视频: ${sb.name || sb.id}`,
        maxRetries: 1,
        metadata: { storyboardId: sb.id },
      })
    }

    scheduler.registerExecutor('video_gen', async (task: ProductionTask) => {
      if (this.abortController.signal.aborted) throw new Error('已取消')

      const { storyboardId } = task.metadata as { storyboardId: string }
      const sb = await storyboardDB.getById(storyboardId)
      if (!sb) throw new Error('分镜不存在')

      const imageUrl = getImageUrl(sb.image) || sb.image

      const videoUrl = await AI.Video.generate(
        {
          prompt: sb.video_prompt || sb.prompt || sb.description || '',
          firstImageBase64: imageUrl,
          duration: 5,
          generateAudio: false,
        },
        config.videoModel,
        0
      )

      let localPath: string | null = null
      if (videoUrl) {
        try {
          localPath = await saveGeneratedVideo(videoUrl, config.projectId, config.episodeId)
        } catch {
          localPath = videoUrl
        }
      }

      await storyboardDB.update(storyboardId, {
        video: localPath || videoUrl,
        status: 'video_done',
      })

      completed++
      this.updateState({ videoCompleted: completed })

      return videoUrl
    })

    await scheduler.start()
    this.updateState({ percent: 80, completedSteps: 6, currentStep: '视频生成完成' })
  }

  private async generateDubbing(config: AutoPipelineConfig) {
    this.updateState({
      phase: 'generating_dubbing',
      percent: 85,
      message: '正在生成配音...',
      currentStep: '配音生成',
      completedSteps: 7,
    })

    const dubbings = await dubbingDB.getByEpisode(config.episodeId)
    const pending = dubbings.filter(d => !d.audio_url && d.text)

    if (pending.length === 0) {
      this.updateState({ percent: 95, dubbingCompleted: dubbings.length })
      return
    }

    const scheduler = createProductionScheduler({ maxConcurrency: config.ttsConcurrency || 5 })
    let completed = 0

    scheduler.setProgressCallback((progress: ProductionProgress) => {
      const basePercent = 85
      const range = 10
      const percent = basePercent + Math.floor(progress.percent * range)
      this.updateState({
        percent,
        message: `配音生成中 (${completed}/${pending.length})`,
      })
    })

    for (const dub of pending) {
      scheduler.addTask({
        id: `dub-${dub.id}`,
        type: 'tts_gen',
        name: `配音: ${dub.text?.substring(0, 20) || dub.id}`,
        maxRetries: 1,
        metadata: { dubbingId: dub.id },
      })
    }

    scheduler.registerExecutor('tts_gen', async (task: ProductionTask) => {
      if (this.abortController.signal.aborted) throw new Error('已取消')

      const { dubbingId } = task.metadata as { dubbingId: string }
      const dub = await dubbingDB.getById(dubbingId)
      if (!dub) throw new Error('配音不存在')

      let voice = config.ttsVoice
      if (dub.character_id) {
        try {
          const char = await characterDB.getById(dub.character_id)
          if (char?.default_voice_id) voice = char.default_voice_id
          if (char?.minimax_voice_id) voice = char.minimax_voice_id
        } catch {}
      }

      const result = await AI.Audio.generate(
        {
          text: dub.text,
          voice: voice || 'default',
          emotion: dub.emotion,
        },
        config.ttsModel,
        0
      )

      const audioUrl = typeof result === 'string' ? result : result

      let localPath: string | null = null
      if (audioUrl) {
        try {
          localPath = await saveGeneratedAudio(audioUrl, config.projectId, config.episodeId)
        } catch {
          localPath = audioUrl
        }
      }

      await dubbingDB.update(dubbingId, {
        audio_url: localPath || audioUrl,
        status: 'done',
      })

      completed++
      this.updateState({ dubbingCompleted: completed })

      return audioUrl
    })

    await scheduler.start()
    this.updateState({ percent: 95, completedSteps: 8, currentStep: '配音生成完成' })
  }
}

export function createAutoPipelineService(): AutoPipelineService {
  return new AutoPipelineService()
}
