import type { Task, TaskResult } from '@/store/useTaskQueueStore'
import { AI } from '@/services/vendor'

export async function aiGenerationHandler(
  task: Task,
  updateProgress: (progress: number, stepName?: string) => void
): Promise<TaskResult> {
  const { type, metadata } = task

  try {
    switch (type) {
      case 'image_generation': {
        updateProgress(10, '准备生成参数')

        const { prompt, width, height, referenceImages, model, projectId, episodeId } = metadata as {
          prompt: string
          width?: number
          height?: number
          referenceImages?: string[]
          model?: string
          projectId: string
          episodeId: string
        }

        updateProgress(30, '发送生成请求')

        const imageUrl = await AI.Image.generate(
          {
            prompt,
            imageBase64: referenceImages || [],
            size: '1K',
            aspectRatio: width && height ? `${width}:${height}` : undefined,
          } as any,
          model || '',
          parseInt(projectId)
        )

        if (!imageUrl) {
          throw new Error('图片生成失败')
        }

        updateProgress(80, '保存生成结果')

        const { saveGeneratedImage } = await import('@/utils/mediaStorage')
        const savedPath = await saveGeneratedImage(imageUrl, projectId, episodeId)

        updateProgress(100, '完成')

        return {
          success: true,
          outputPath: savedPath,
          outputUrl: imageUrl,
          data: { imageUrl, savedPath },
        }
      }

      case 'video_generation': {
        updateProgress(10, '准备生成参数')

        const { prompt, width, height, firstFrame, lastFrame, referenceImages, duration, model, projectId, episodeId } = metadata as {
          prompt: string
          width?: number
          height?: number
          firstFrame?: string
          lastFrame?: string
          referenceImages?: string[]
          duration?: number
          model?: string
          projectId: string
          episodeId: string
        }

        updateProgress(20, '发送生成请求')

        const videoUrl = await AI.Video.generate(
          {
            prompt,
            firstImageBase64: firstFrame || referenceImages?.[0] || '',
            lastImageBase64: lastFrame || '',
            duration: duration || 5,
            resolution: '1080p',
            aspectRatio: width && height ? `${width}:${height}` : undefined,
            audio: true,
            imageBase64: referenceImages || [],
            mode: firstFrame ? 'startEndRequired' : 'text',
          } as any,
          model || '',
          parseInt(projectId)
        )

        if (!videoUrl) {
          throw new Error('视频生成失败')
        }

        updateProgress(80, '保存生成结果')

        const { saveGeneratedVideo } = await import('@/utils/mediaStorage')
        const savedPath = await saveGeneratedVideo(videoUrl, projectId, episodeId)

        updateProgress(100, '完成')

        return {
          success: true,
          outputPath: savedPath,
          outputUrl: videoUrl,
          data: { videoUrl, savedPath },
        }
      }

      case 'audio_generation': {
        updateProgress(10, '准备生成参数')

        const { text, voiceId, speed, model, projectId, episodeId } = metadata as {
          text: string
          voiceId?: string
          speed?: number
          model?: string
          projectId: string
          episodeId: string
        }

        updateProgress(30, '发送生成请求')

        const audioUrl = await AI.Audio.generate(
          {
            text,
            voice: voiceId || 'default',
            speed: speed || 1.0,
          },
          model || '',
          parseInt(projectId)
        )

        if (!audioUrl) {
          throw new Error('音频生成失败')
        }

        updateProgress(80, '保存生成结果')

        const { saveGeneratedAudio } = await import('@/utils/mediaStorage')
        const savedPath = await saveGeneratedAudio(audioUrl, projectId, episodeId)

        updateProgress(100, '完成')

        return {
          success: true,
          outputPath: savedPath,
          outputUrl: audioUrl,
          data: { audioUrl, savedPath },
        }
      }

      default:
        throw new Error(`不支持的生成类型: ${type}`)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '生成失败'
    return {
      success: false,
      error: errorMessage,
    }
  }
}
