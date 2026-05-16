import { useMutation } from '@tanstack/react-query'
import { projectDB, taskDB } from '@/db'
import { AI } from '@/services/vendor'
import { correctModelParams } from '@/services/modelRegistry'
import { useTaskQueueStore } from '@/store/useTaskQueueStore'
import { imagePathToBase64 } from '@/utils/imageUtils'
import logger from '@/utils/logger'
import { taskLog } from '@/utils/logBuffer'
import type { ProgressInfo } from '@/types/generation'
import type { GenerationTaskType } from '@/types'

function getImageSize(width?: number, height?: number): '1K' | '2K' | '4K' {
  if (!width || !height) return '1K'
  const maxDim = Math.max(width, height)
  if (maxDim <= 1024) return '1K'
  if (maxDim <= 2048) return '2K'
  return '4K'
}

function getVideoResolution(width?: number, height?: number): string {
  if (!width && !height) return '1080p'
  const maxDim = Math.max(width || 0, height || 0)
  if (maxDim <= 720) return '720p'
  if (maxDim <= 1080) return '1080p'
  return '4K'
}

/** 将宽高比字符串转为基础分辨率（横向 1280×720 基准，纵向 720×1280 基准） */
export function aspectRatioToDimensions(ratio: string): { width: number; height: number } {
  const parts = ratio.split(':').map(Number)
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) {
    return { width: 1280, height: 720 }
  }
  const [w, h] = parts
  const isLandscape = w > h
  const scale = Math.min(1280 / Math.max(w, h), 720 / Math.min(w, h))
  if (isLandscape) {
    return { width: 1280, height: Math.round(1280 * h / w) }
  }
  return { width: Math.round(720 * w / h), height: 720 }
}

export interface ImageGenerationRequest {
  prompt: string
  negativePrompt?: string
  width?: number
  height?: number
  aspectRatio?: string
  model?: string
  imageUrl?: string
  maskImage?: string
  referenceImages?: string[]
  projectId: string
  episodeId?: string
  name?: string
  onProgress?: (progress: ProgressInfo) => void
}

export interface VideoGenerationRequest {
  prompt: string
  width?: number
  height?: number
  firstFrame?: string
  lastFrame?: string
  referenceImages?: string[]
  model?: string
  duration?: number
  generateAudio?: boolean
  seed?: number
  fps?: number
  imageUrl?: string
  projectId?: string
  episodeId?: string
  name?: string
  onProgress?: (progress: ProgressInfo) => void
}

export interface TTSGenerationRequest {
  text: string
  voice?: string
  speed?: number
  pitch?: number
  volume?: number
  model?: string
  provider?: string
  // 音色克隆相关
  voiceSampleUrl?: string
  fileId?: number
  // ComfyUI 相关
  workflowId?: string
  workflowParams?: Record<string, unknown>
  // 项目信息
  projectId?: string
  episodeId?: string
  name?: string
}

export interface TextGenerationRequest {
  messages: { role: string; content: string }[]
  system?: string
  temperature?: number
  maxTokens?: number
  model?: string
}

/**
 * 构建完整提示词（添加项目风格和质量词）
 */
export async function buildFullPrompt(projectId: string, basePrompt: string): Promise<string> {
  try {
    const project = await projectDB.getById(projectId)
    if (!project) return basePrompt

    let parts: string[] = []

    if (project.visual_style) {
      parts.push(project.visual_style)
    }

    parts.push(basePrompt)

    if (project.quality_prompt) {
      parts.push(project.quality_prompt)
    }

    return parts.join(', ')
  } catch (error) {
    logger.error('构建完整提示词失败:', error)
    return basePrompt
  }
}

/**
 * 图片生成 Hook
 * 
 * 生成逻辑：
 * - 文生图：无图片输入
 * - 图生图：使用 imageUrl 作为参考图
 * - 多图参考生图：使用 referenceImages 作为多参考图
 * 
 * 优先级：
 * - 参考图：imageUrl > referenceImages[0] > 分镜图
 * - 多参考：referenceImages（除首帧外的其他图片）
 */
export function useImageGeneration() {
  return useMutation<string, Error, ImageGenerationRequest>({
    mutationFn: async request => {
      const model = request.model || 'official:claude-sonnet-4-6'

      const taskId = useTaskQueueStore.getState().addTask({
        type: 'image_generation',
        name: request.name || '图片生成',
        metadata: {
          prompt: request.prompt,
          width: request.width,
          height: request.height,
          referenceImages: request.referenceImages,
          model,
          projectId: request.projectId,
          episodeId: request.episodeId,
        },
      })

      useTaskQueueStore.getState().updateTask(taskId, {
        status: 'running',
        startedAt: Date.now(),
      })

      let dbTaskId: string | undefined
      try {
        dbTaskId = (
          await taskDB.create({
            type: 'image_generation' as GenerationTaskType,
            name: request.name || '图片生成',
            status: 'running',
            model,
            provider: model.split(':')[0],
            project_id: request.projectId,
            episode_id: request.episodeId,
            prompt: request.prompt,
            input_params: {
              width: request.width,
              height: request.height,
              negativePrompt: request.negativePrompt,
              aspectRatio: request.aspectRatio,
              hasImageUrl: !!request.imageUrl,
              referenceImagesCount: request.referenceImages?.length || 0,
            },
            progress: 0,
            retry_count: 0,
            max_retries: 1,
            started_at: new Date().toISOString(),
          })
        ).id

        taskLog(dbTaskId, 'info', '开始图片生成', { model, prompt: request.prompt.substring(0, 200) })
      } catch (e) {
        logger.error('创建持久化任务记录失败:', e)
      }

      try {
        let fullPrompt = request.prompt
        if (request.projectId) {
          fullPrompt = await buildFullPrompt(request.projectId, request.prompt)
        }

        useTaskQueueStore.getState().updateTask(taskId, { progress: 20, stepName: '准备参考图' })
        if (dbTaskId) {
          taskDB.update(dbTaskId, { progress: 20, step_name: '准备参考图' }).catch(() => {})
          taskLog(dbTaskId, 'info', '准备参考图')
        }

        const imageBase64: string[] = []
        
        if (request.imageUrl) {
          const base64 = await imagePathToBase64(request.imageUrl)
          if (base64) {
            imageBase64.push(base64)
          }
        }
        
        if (request.referenceImages && request.referenceImages.length > 0) {
          for (const imgUrl of request.referenceImages) {
            if (imgUrl === request.imageUrl) continue
            const base64 = await imagePathToBase64(imgUrl)
            if (base64) {
              imageBase64.push(base64)
            }
          }
        }

        useTaskQueueStore.getState().updateTask(taskId, { progress: 40, stepName: '发送生成请求' })
        if (dbTaskId) {
          taskDB.update(dbTaskId, { progress: 40, step_name: '发送生成请求' }).catch(() => {})
          taskLog(dbTaskId, 'info', '发送生成请求', { imageBase64Count: imageBase64.length })
        }

        const imageUrls: string[] = []
        const isPublicUrl = (url: string) =>
          (url.startsWith('http://') || url.startsWith('https://')) && !url.includes('asset.localhost')
        if (request.imageUrl && isPublicUrl(request.imageUrl)) {
          imageUrls.push(request.imageUrl)
        }
        if (request.referenceImages) {
          for (const imgUrl of request.referenceImages) {
            if (imgUrl === request.imageUrl) continue
            if (isPublicUrl(imgUrl)) {
              imageUrls.push(imgUrl)
            }
          }
        }

        let maskBase64: string | undefined
        if (request.maskImage) {
          maskBase64 = await imagePathToBase64(request.maskImage)
        }

        const config = {
          prompt: fullPrompt,
          imageBase64,
          imageUrls,
          maskBase64: maskBase64 || undefined,
          size: request.width && request.height
            ? getImageSize(request.width, request.height)
            : '1K' as const,
          aspectRatio: request.width && request.height 
            ? `${request.width}:${request.height}` as `${number}:${number}`
            : (request.aspectRatio || '16:9') as `${number}:${number}`,
        }

        const numericProjectId = request.projectId ? parseInt(request.projectId) : 0
        const imageUrl = await AI.Image.generate(config, model, numericProjectId || 0)

        useTaskQueueStore.getState().updateTask(taskId, { progress: 90, stepName: '保存结果' })
        if (dbTaskId) {
          taskDB.update(dbTaskId, { progress: 90, step_name: '保存结果', output_url: imageUrl }).catch(() => {})
          taskLog(dbTaskId, 'info', '生成完成，正在保存', { imageUrl: imageUrl?.substring(0, 200) })
        }

        let savedPath: string | undefined
        if (imageUrl && request.projectId && request.episodeId) {
          const { saveGeneratedImage } = await import('@/utils/mediaStorage')
          savedPath = await saveGeneratedImage(imageUrl, request.projectId, request.episodeId)
        }

        const finalPath = savedPath || imageUrl

        useTaskQueueStore.getState().updateTask(taskId, {
          status: 'completed',
          progress: 100,
          stepName: '完成',
          completedAt: Date.now(),
          result: {
            success: true,
            outputPath: savedPath,
            outputUrl: finalPath,
            data: { imageUrl: finalPath, savedPath },
          },
        })

        if (dbTaskId) {
          taskDB.update(dbTaskId, {
            status: 'completed',
            progress: 100,
            step_name: '完成',
            output_url: imageUrl,
            output_path: savedPath,
            completed_at: new Date().toISOString(),
            metadata: { savedPath, imageUrl },
          }).catch(() => {})
          taskLog(dbTaskId, 'info', '图片生成完成', { savedPath: savedPath?.substring(0, 200) })
        }

        return finalPath
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : '图片生成失败'
        useTaskQueueStore.getState().updateTask(taskId, {
          status: 'failed',
          errorMessage: errorMsg,
          completedAt: Date.now(),
          result: { success: false, error: errorMsg },
        })

        if (dbTaskId) {
          taskDB.update(dbTaskId, {
            status: 'failed',
            error: errorMsg,
            completed_at: new Date().toISOString(),
          }).catch(() => {})
          taskLog(dbTaskId, 'error', `图片生成失败: ${errorMsg}`)
        }

        throw error
      }
    },
  })
}

/**
 * 视频生成 Hook
 * 
 * 生成逻辑：
 * - 文生视频：无图片输入
 * - 图生视频：使用 firstFrame 作为首帧
 * - 首尾帧生视频：使用 firstFrame + lastFrame
 * - 多图参考生视频：使用 firstFrame + referenceImages
 * 
 * 优先级：
 * - 首帧：firstFrame > imageUrl > referenceImages[0]
 * - 尾帧：lastFrame（可选）
 * - 参考图：referenceImages（除首帧外的其他图片）
 */
export function useVideoGeneration() {
  return useMutation<string, Error, VideoGenerationRequest>({
    mutationFn: async request => {
      const model = request.model || 'official:Wan2.6-I2V-1080P'

      const taskId = useTaskQueueStore.getState().addTask({
        type: 'video_generation',
        name: request.name || '视频生成',
        metadata: {
          prompt: request.prompt,
          width: request.width,
          height: request.height,
          firstFrame: request.firstFrame,
          lastFrame: request.lastFrame,
          referenceImages: request.referenceImages,
          duration: request.duration,
          model,
          projectId: request.projectId,
          episodeId: request.episodeId,
        },
      })

      useTaskQueueStore.getState().updateTask(taskId, {
        status: 'running',
        startedAt: Date.now(),
      })

      let dbTaskId: string | undefined
      try {
        dbTaskId = (
          await taskDB.create({
            type: 'video_generation' as GenerationTaskType,
            name: request.name || '视频生成',
            status: 'running',
            model,
            provider: model.split(':')[0],
            project_id: request.projectId,
            episode_id: request.episodeId,
            prompt: request.prompt,
            input_params: {
              width: request.width,
              height: request.height,
              duration: request.duration,
              fps: request.fps,
              generateAudio: request.generateAudio,
              hasFirstFrame: !!request.firstFrame,
              hasLastFrame: !!request.lastFrame,
              referenceImagesCount: request.referenceImages?.length || 0,
            },
            progress: 0,
            retry_count: 0,
            max_retries: 1,
            started_at: new Date().toISOString(),
          })
        ).id

        taskLog(dbTaskId, 'info', '开始视频生成', { model, prompt: request.prompt.substring(0, 200) })
      } catch (e) {
        logger.error('创建持久化任务记录失败:', e)
      }

      try {
        let firstFrameUrl = request.firstFrame || request.imageUrl
        let lastFrameUrl = request.lastFrame

        const hasExplicitFirstFrame = !!(request.firstFrame || request.imageUrl)
        const hasExplicitLastFrame = !!request.lastFrame

        if (!hasExplicitFirstFrame && !hasExplicitLastFrame && request.referenceImages && request.referenceImages.length > 0) {
          // 参考生视频模式：所有 referenceImages 都作为参考图传入
          // 不自动拆分为首帧/尾帧
        } else {
          // 首帧/首尾帧模式：自动从 referenceImages 中提取首帧和尾帧
          if (!firstFrameUrl && request.referenceImages && request.referenceImages.length > 0) {
            firstFrameUrl = request.referenceImages[0]
          }
          if (!lastFrameUrl && request.referenceImages && request.referenceImages.length >= 2) {
            if (firstFrameUrl === request.referenceImages[0]) {
              lastFrameUrl = request.referenceImages[1]
            }
          }
        }
        
        const otherReferenceImages: string[] = []
        if (request.referenceImages && request.referenceImages.length > 0) {
          for (const imgUrl of request.referenceImages) {
            if (imgUrl === firstFrameUrl || imgUrl === lastFrameUrl) continue
            otherReferenceImages.push(imgUrl)
          }
        }

        useTaskQueueStore.getState().updateTask(taskId, { progress: 20, stepName: '准备参考图' })
        if (dbTaskId) {
          taskDB.update(dbTaskId, { progress: 20, step_name: '准备参考图' }).catch(() => {})
          taskLog(dbTaskId, 'info', '准备参考图', {
            hasFirstFrame: !!firstFrameUrl,
            hasLastFrame: !!lastFrameUrl,
            otherRefCount: otherReferenceImages.length,
          })
        }

        const firstFrameBase64 = await imagePathToBase64(firstFrameUrl || '')
        const lastFrameBase64 = await imagePathToBase64(lastFrameUrl || '')
        
        const referenceImagesBase64: string[] = []
        for (const imgUrl of otherReferenceImages) {
          const base64 = await imagePathToBase64(imgUrl)
          if (base64) {
            referenceImagesBase64.push(base64)
          }
        }

        useTaskQueueStore.getState().updateTask(taskId, { progress: 40, stepName: '发送生成请求' })
        if (dbTaskId) {
          taskDB.update(dbTaskId, { progress: 40, step_name: '发送生成请求' }).catch(() => {})
          taskLog(dbTaskId, 'info', '发送视频生成请求（异步轮询模式）')
        }

        const modelName = model.split(':')[1] || model
        const corrected = correctModelParams(modelName, {
          duration: request.duration || 5,
          width: request.width,
          height: request.height,
          aspectRatio: request.width && request.height
            ? `${request.width}:${request.height}`
            : '16:9',
        })

        if (corrected.corrections.length > 0 && dbTaskId) {
          for (const msg of corrected.corrections) {
            taskLog(dbTaskId, 'warn', msg)
          }
        }

        const config = {
          prompt: request.prompt,
          firstImageBase64: firstFrameBase64,
          lastImageBase64: lastFrameBase64,
          referenceImages: referenceImagesBase64,
          duration: corrected.duration || 5,
          resolution: getVideoResolution(corrected.width, corrected.height),
          aspectRatio: (corrected.aspectRatio || '16:9') as `${number}:${number}`,
          generateAudio: request.generateAudio ?? true,
        }

        const numericProjectId = request.projectId ? parseInt(request.projectId) : 0
        const videoUrl = await AI.Video.generate(config, model, numericProjectId || 0)

        useTaskQueueStore.getState().updateTask(taskId, { progress: 90, stepName: '保存结果' })
        if (dbTaskId) {
          taskDB.update(dbTaskId, { progress: 90, step_name: '保存结果', output_url: videoUrl }).catch(() => {})
          taskLog(dbTaskId, 'info', '视频生成完成，正在保存', { videoUrl: videoUrl?.substring(0, 200) })
        }

        let savedPath: string | undefined
        if (videoUrl && request.projectId && request.episodeId) {
          const { saveGeneratedVideo } = await import('@/utils/mediaStorage')
          savedPath = await saveGeneratedVideo(videoUrl, request.projectId, request.episodeId)
        }

        const finalPath = savedPath || videoUrl

        useTaskQueueStore.getState().updateTask(taskId, {
          status: 'completed',
          progress: 100,
          stepName: '完成',
          completedAt: Date.now(),
          result: {
            success: true,
            outputPath: savedPath,
            outputUrl: finalPath,
            data: { videoUrl: finalPath, savedPath },
          },
        })

        if (dbTaskId) {
          taskDB.update(dbTaskId, {
            status: 'completed',
            progress: 100,
            step_name: '完成',
            output_url: videoUrl,
            output_path: savedPath,
            completed_at: new Date().toISOString(),
            metadata: { savedPath, videoUrl },
          }).catch(() => {})
          taskLog(dbTaskId, 'info', '视频生成完成', { savedPath: savedPath?.substring(0, 200) })
        }

        return finalPath
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : '视频生成失败'
        useTaskQueueStore.getState().updateTask(taskId, {
          status: 'failed',
          errorMessage: errorMsg,
          completedAt: Date.now(),
          result: { success: false, error: errorMsg },
        })

        if (dbTaskId) {
          taskDB.update(dbTaskId, {
            status: 'failed',
            error: errorMsg,
            completed_at: new Date().toISOString(),
          }).catch(() => {})
          taskLog(dbTaskId, 'error', `视频生成失败: ${errorMsg}`)
        }

        throw error
      }
    },
  })
}

/**
 * TTS 生成 Hook
 * 
 * 支持模式：
 * - AI 模式：使用 Vendor TTS 服务（MiniMax、DeepSeek 等）
 * - ComfyUI 模式：使用 ComfyUI 工作流生成
 * - 音色克隆：支持即时音色克隆（voiceSampleUrl）和预克隆音色（fileId）
 */
export function useTTSGeneration() {
  return useMutation<{ audioUrl: string; duration: number }, Error, TTSGenerationRequest>({
    mutationFn: async request => {
      const isComfyUI = request.provider === 'comfyui' || request.workflowId
      const model = request.model || 'minimax:speech-01-turbo'
      const provider = request.provider || 'minimax'
      const isMiniMax = provider === 'minimax' || model.includes('minimax')

      const taskId = useTaskQueueStore.getState().addTask({
        type: 'audio_generation',
        name: request.name || '语音生成',
        metadata: {
          text: request.text,
          voiceId: request.voice,
          provider,
          model,
          isComfyUI,
          hasVoiceClone: !!request.voiceSampleUrl || !!request.fileId,
          projectId: request.projectId,
          episodeId: request.episodeId,
        },
      })

      useTaskQueueStore.getState().updateTask(taskId, {
        status: 'running',
        startedAt: Date.now(),
      })

      let dbTaskId: string | undefined
      try {
        dbTaskId = (
          await taskDB.create({
            type: 'audio_generation' as GenerationTaskType,
            name: request.name || '语音生成',
            status: 'running',
            model,
            provider,
            project_id: request.projectId,
            episode_id: request.episodeId,
            prompt: request.text.substring(0, 500),
            input_params: {
              voice: request.voice,
              speed: request.speed,
              pitch: request.pitch,
              volume: request.volume,
              isComfyUI,
              hasVoiceClone: !!request.voiceSampleUrl || !!request.fileId,
              workflowId: request.workflowId,
            },
            progress: 0,
            retry_count: 0,
            max_retries: 1,
            started_at: new Date().toISOString(),
          })
        ).id

        taskLog(dbTaskId, 'info', '开始语音生成', { model, provider, isComfyUI })
      } catch (e) {
        logger.error('创建持久化任务记录失败:', e)
      }

      try {
        if (isComfyUI && request.workflowId) {
          useTaskQueueStore.getState().updateTask(taskId, { progress: 20, stepName: '准备 ComfyUI 工作流' })
          if (dbTaskId) {
            taskDB.update(dbTaskId, { progress: 20, step_name: '准备 ComfyUI 工作流' }).catch(() => {})
            taskLog(dbTaskId, 'info', '准备 ComfyUI 工作流', { workflowId: request.workflowId })
          }
          
          const { generateTTSWithComfyUI } = await import('@/services/comfyui/comfyuiTTS')
          
          useTaskQueueStore.getState().updateTask(taskId, { progress: 40, stepName: '执行 ComfyUI 工作流' })
          if (dbTaskId) {
            taskDB.update(dbTaskId, { progress: 40, step_name: '执行 ComfyUI 工作流' }).catch(() => {})
            taskLog(dbTaskId, 'info', '执行 ComfyUI 工作流')
          }
          
          const result = await generateTTSWithComfyUI({
            text: request.text,
            voice: request.voice,
            voiceSampleUrl: request.voiceSampleUrl,
            workflowId: request.workflowId,
            workflowParams: request.workflowParams,
            projectId: request.projectId,
            episodeId: request.episodeId,
          })

          useTaskQueueStore.getState().updateTask(taskId, {
            status: 'completed',
            progress: 100,
            stepName: '完成',
            completedAt: Date.now(),
            result: { success: true, outputUrl: result.audioUrl },
          })

          if (dbTaskId) {
            taskDB.update(dbTaskId, {
              status: 'completed',
              progress: 100,
              step_name: '完成',
              output_url: result.audioUrl,
              completed_at: new Date().toISOString(),
            }).catch(() => {})
            taskLog(dbTaskId, 'info', '语音生成完成（ComfyUI）')
          }

          return { audioUrl: result.audioUrl, duration: result.duration }
        }

        useTaskQueueStore.getState().updateTask(taskId, { progress: 30, stepName: '发送生成请求' })
        if (dbTaskId) {
          taskDB.update(dbTaskId, { progress: 30, step_name: '发送生成请求' }).catch(() => {})
          taskLog(dbTaskId, 'info', '发送 AI 语音生成请求', { model, provider })
        }

        const config: any = {
          text: request.text,
          voiceId: request.voice || 'default',
          speed: request.speed || 1.0,
          pitch: request.pitch || 0,
          volume: request.volume || 1.0,
          emotion: 'neutral',
        }

        if (isMiniMax) {
          if (request.voiceSampleUrl) {
            config.voiceSampleUrl = request.voiceSampleUrl
          } else if (request.fileId) {
            config.fileId = request.fileId
          }
        }

        const audioUrl = await AI.Audio.generate(config, model, 0)

        useTaskQueueStore.getState().updateTask(taskId, { progress: 80, stepName: '下载音频文件' })
        if (dbTaskId) {
          taskDB.update(dbTaskId, { progress: 80, step_name: '下载音频文件', output_url: audioUrl }).catch(() => {})
          taskLog(dbTaskId, 'info', '音频生成完成，正在下载')
        }

        let savedPath: string | undefined
        if (request.projectId && request.episodeId) {
          const { saveGeneratedAudio } = await import('@/utils/mediaStorage')
          savedPath = await saveGeneratedAudio(audioUrl, request.projectId, request.episodeId)
        }

        const audioPath = savedPath || audioUrl

        useTaskQueueStore.getState().updateTask(taskId, {
          status: 'completed',
          progress: 100,
          stepName: '完成',
          completedAt: Date.now(),
          result: {
            success: true,
            outputPath: savedPath,
            outputUrl: audioPath,
            data: { audioUrl: audioPath, savedPath },
          },
        })

        if (dbTaskId) {
          taskDB.update(dbTaskId, {
            status: 'completed',
            progress: 100,
            step_name: '完成',
            output_url: audioUrl,
            output_path: savedPath,
            completed_at: new Date().toISOString(),
          }).catch(() => {})
          taskLog(dbTaskId, 'info', '语音生成完成')
        }

        return { audioUrl: audioPath, duration: 0 }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : '语音生成失败'
        useTaskQueueStore.getState().updateTask(taskId, {
          status: 'failed',
          errorMessage: errorMsg,
          completedAt: Date.now(),
          result: { success: false, error: errorMsg },
        })

        if (dbTaskId) {
          taskDB.update(dbTaskId, {
            status: 'failed',
            error: errorMsg,
            completed_at: new Date().toISOString(),
          }).catch(() => {})
          taskLog(dbTaskId, 'error', `语音生成失败: ${errorMsg}`)
        }

        throw error
      }
    },
  })
}

// 辅助函数：查找输入字段
/**
 * 文本生成 Hook
 */
export function useTextGeneration() {
  return useMutation<string, Error, TextGenerationRequest>({
    mutationFn: async request => {
      return AI.Text.generate(
        {
          messages: request.messages,
          temperature: request.temperature || 0.7,
          maxTokens: request.maxTokens || 2048,
        },
        undefined,
        0
      )
    },
  })
}
