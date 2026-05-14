/**
 * 音色复刻任务处理器
 */

import type { Task, TaskResult } from '@/store/useTaskQueueStore'
import { AiAudio } from '@/services/vendor/aiService'

export async function voiceCloneHandler(
  task: Task,
  updateProgress: (progress: number, stepName?: string) => void
): Promise<TaskResult> {
  const { metadata } = task

  try {
    updateProgress(10, '初始化音色复刻服务')

    const { audioFile, voiceId, characterId } = metadata as {
      audioFile: File
      voiceId: string
      characterId: string
    }

    updateProgress(30, '上传音频文件')

    // 使用 Vendor 系统的 AiAudio 上传音频
    const uploadResult = await AiAudio.uploadVoiceCloneAudio(audioFile, 'minimax')

    if (!uploadResult.fileId) {
      throw new Error('上传音频文件失败: 未返回 fileId')
    }

    updateProgress(100, '完成')

    return {
      success: true,
      data: {
        voiceId: voiceId,
        fileId: uploadResult.fileId,
        characterId,
      },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '音色复刻失败'
    return {
      success: false,
      error: errorMessage,
    }
  }
}
