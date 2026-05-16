import { useTaskQueueStore, type Task, type TaskResult, type TaskQueueType } from '@/store/useTaskQueueStore'
import { queryClient } from '@/providers/QueryProvider'

export type TaskExecutor = (
  task: Task,
  updateProgress: (progress: number, stepName?: string) => void,
  signal?: AbortSignal
) => Promise<TaskResult>

const executors: Map<TaskQueueType, TaskExecutor> = new Map()

export function registerExecutor(type: TaskQueueType, executor: TaskExecutor) {
  executors.set(type, executor)
}

export function getExecutor(type: TaskQueueType): TaskExecutor | undefined {
  return executors.get(type)
}

let processingInterval: ReturnType<typeof setInterval> | null = null

export function startTaskProcessor() {
  if (processingInterval) return

  processingInterval = setInterval(() => {
    processNextTasks()
  }, 500)
}

export function stopTaskProcessor() {
  if (processingInterval) {
    clearInterval(processingInterval)
    processingInterval = null
  }
}

function processNextTasks() {
  const state = useTaskQueueStore.getState()

  if (state.isPaused) return

  const runningCount = state.getActiveTaskCount()
  const availableSlots = state.maxConcurrent - runningCount

  if (availableSlots <= 0) return

  const pendingTasks = state.getPendingTasks()
  const tasksToStart = pendingTasks.slice(0, availableSlots)

  for (const task of tasksToStart) {
    executeTask(task.id)
  }
}

async function executeTask(taskId: string) {
  const state = useTaskQueueStore.getState()
  const task = state.getTask(taskId)
  if (!task || task.status !== 'pending') return

  const executor = getExecutor(task.type)
  if (!executor) {
    useTaskQueueStore.getState().updateTask(taskId, {
      status: 'failed',
      errorMessage: `未注册的任务类型: ${task.type}`,
      completedAt: Date.now(),
    })
    return
  }

  const abortController = new AbortController()

  useTaskQueueStore.getState().updateTask(taskId, {
    status: 'running',
    startedAt: Date.now(),
    abortController,
  })

  const updateProgress = (progress: number, stepName?: string) => {
    useTaskQueueStore.getState().updateTask(taskId, { progress, stepName })
  }

  try {
    const result = await executor(task, updateProgress, abortController.signal)

    if (abortController.signal.aborted) {
      useTaskQueueStore.getState().updateTask(taskId, {
        status: 'cancelled',
        completedAt: Date.now(),
      })
      return
    }

    if (result.success) {
      useTaskQueueStore.getState().updateTask(taskId, {
        status: 'completed',
        progress: 100,
        result,
        completedAt: Date.now(),
      })
    } else {
      useTaskQueueStore.getState().updateTask(taskId, {
        status: 'failed',
        errorMessage: result.error || '任务执行失败',
        result,
        completedAt: Date.now(),
      })
    }
  } catch (error) {
    if (abortController.signal.aborted) {
      useTaskQueueStore.getState().updateTask(taskId, {
        status: 'cancelled',
        completedAt: Date.now(),
      })
      return
    }

    useTaskQueueStore.getState().updateTask(taskId, {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : '任务执行失败',
      completedAt: Date.now(),
    })
  }
}

export function registerDefaultExecutors() {
  registerExecutor('image_generation', async (task, updateProgress, signal) => {
    const { AI } = await import('@/services/vendor')
    const { saveGeneratedImage } = await import('@/utils/mediaStorage')

    const { prompt, width, height, referenceImages, model, projectId, episodeId } = task.metadata as {
      prompt: string
      width?: number
      height?: number
      referenceImages?: string[]
      model?: string
      projectId: string
      episodeId: string
    }

    updateProgress(10, '准备生成参数')

    if (signal?.aborted) return { success: false, error: '已取消' }

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

    if (signal?.aborted) return { success: false, error: '已取消' }
    if (!imageUrl) throw new Error('图片生成失败')

    updateProgress(80, '保存生成结果')

    const savedPath = await saveGeneratedImage(imageUrl, projectId, episodeId)

    updateProgress(100, '完成')

    return {
      success: true,
      outputPath: savedPath,
      outputUrl: imageUrl,
      data: { imageUrl, savedPath },
    }
  })

  registerExecutor('video_generation', async (task, updateProgress, signal) => {
    const { AI } = await import('@/services/vendor')
    const { saveGeneratedVideo } = await import('@/utils/mediaStorage')

    const { prompt, width, height, firstFrame, lastFrame, referenceImages, duration, model, projectId, episodeId } = task.metadata as {
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

    updateProgress(10, '准备生成参数')

    if (signal?.aborted) return { success: false, error: '已取消' }

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

    if (signal?.aborted) return { success: false, error: '已取消' }
    if (!videoUrl) throw new Error('视频生成失败')

    updateProgress(80, '保存生成结果')

    const savedPath = await saveGeneratedVideo(videoUrl, projectId, episodeId)

    updateProgress(100, '完成')

    return {
      success: true,
      outputPath: savedPath,
      outputUrl: videoUrl,
      data: { videoUrl, savedPath },
    }
  })

  registerExecutor('audio_generation', async (task, updateProgress, signal) => {
    const { AI } = await import('@/services/vendor')
    const { saveGeneratedAudio } = await import('@/utils/mediaStorage')

    const { text, voiceId, speed, model, projectId, episodeId } = task.metadata as {
      text: string
      voiceId?: string
      speed?: number
      model?: string
      projectId: string
      episodeId: string
    }

    updateProgress(10, '准备生成参数')

    if (signal?.aborted) return { success: false, error: '已取消' }

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

    if (signal?.aborted) return { success: false, error: '已取消' }
    if (!audioUrl) throw new Error('音频生成失败')

    updateProgress(80, '保存生成结果')

    const savedPath = await saveGeneratedAudio(audioUrl, projectId, episodeId)

    updateProgress(100, '完成')

    return {
      success: true,
      outputPath: savedPath,
      outputUrl: audioUrl,
      data: { audioUrl, savedPath },
    }
  })

  // 批量操作执行器
  registerExecutor('batch_operation', async (task, updateProgress, signal) => {
    const { item, type, generationMode, modelId, workflowId, params, projectId, episodeId } = task.metadata as {
      item: { id: string; name: string; prompt?: string; image?: string; reference_images?: string[] }
      type: 'storyboard' | 'character' | 'scene' | 'prop'
      generationMode: 'ai' | 'comfyui'
      modelId?: string
      workflowId?: string
      params?: Record<string, unknown>
      projectId: string
      episodeId: string
    }

    updateProgress(10, '准备生成')

    if (generationMode === 'ai') {
      const { AI } = await import('@/services/vendor')
      const { saveGeneratedImage } = await import('@/utils/mediaStorage')
      const { imagePathToBase64 } = await import('@/utils/imageUtils')

      const referenceImages = item.reference_images || (item.image ? [item.image] : [])
      const imageBase64: string[] = []

      for (const imgUrl of referenceImages) {
        if (signal?.aborted) return { success: false, error: '已取消' }
        const base64 = await imagePathToBase64(imgUrl)
        if (base64) imageBase64.push(base64)
      }

      updateProgress(30, '发送生成请求')

      const imageUrl = await AI.Image.generate(
        {
          prompt: item.prompt || '',
          imageBase64,
          width: (params?.width as number) || 1024,
          height: (params?.height as number) || 576,
        } as any,
        modelId || '',
      )

      if (signal?.aborted) return { success: false, error: '已取消' }
      if (!imageUrl) throw new Error('图片生成失败')

      updateProgress(80, '保存结果')

      const savedPath = await saveGeneratedImage(imageUrl, projectId, episodeId)

      // 更新数据库
      const { storyboardDB, characterDB, sceneDB, propDB } = await import('@/db')
      if (type === 'storyboard') {
        await storyboardDB.update(item.id, { image: savedPath, status: 'completed' })
      } else if (type === 'character') {
        await characterDB.update(item.id, { image: savedPath })
      } else if (type === 'scene') {
        await sceneDB.update(item.id, { image: savedPath })
      } else if (type === 'prop') {
        await propDB.update(item.id, { image: savedPath })
      }

      // 自动刷新React Query数据
      queryClient.invalidateQueries({ queryKey: ['storyboards', episodeId] })
      queryClient.invalidateQueries({ queryKey: ['characters', episodeId] })
      queryClient.invalidateQueries({ queryKey: ['scenes', episodeId] })
      queryClient.invalidateQueries({ queryKey: ['props', episodeId] })

      updateProgress(100, '完成')

      return {
        success: true,
        outputPath: savedPath,
        outputUrl: imageUrl,
        data: { imageUrl, savedPath, itemId: item.id },
      }
    } else {
      // ComfyUI 模式
      const { getComfyUIService } = await import('@/services/comfyuiService')
      const { getWorkflowConfigs } = await import('@/services/workflowConfigService')
      const { applyParamsToWorkflow } = await import('@/components/ai/ComfyUIParamsPanel')

      updateProgress(10, '加载工作流')

      const configs = await getWorkflowConfigs()
      const workflow = configs.find(w => w.id === workflowId)
      if (!workflow) throw new Error('工作流配置不存在')

      const referenceImages = item.reference_images || (item.image ? [item.image] : [])

      updateProgress(20, '上传图片')

      const client = getComfyUIService().client
      const uploadedImages: string[] = []

      // 上传所有参考图片
      if (referenceImages.length > 0) {
        const { readFile } = await import('@tauri-apps/plugin-fs')
        
        for (let i = 0; i < referenceImages.length; i++) {
          if (signal?.aborted) return { success: false, error: '已取消' }
          
          let localPath = referenceImages[i]
          if (!localPath) continue

          // 处理 asset.localhost URL
          if (localPath.includes('asset.localhost')) {
            try {
              const urlObj = new URL(localPath)
              localPath = decodeURIComponent(urlObj.pathname)
            } catch (_e) {
              console.warn('[BatchGeneration] 解析 asset URL 失败:', localPath)
              continue
            }
          }
          
          // 处理路径格式
          if (localPath.startsWith('/')) localPath = localPath.substring(1)
          localPath = localPath.replace(/\//g, '\\')

          try {
            const imageData = await readFile(localPath)
            const filename = `batch_${Date.now()}_${i}.png`
            const uploadResult = await client.uploadImage(imageData, filename)
            uploadedImages.push(uploadResult.name)
            console.log(`[BatchGeneration] 上传参考图 ${i + 1}/${referenceImages.length}:`, uploadResult.name)
          } catch (error) {
            console.warn(`[BatchGeneration] 上传参考图 ${i} 失败:`, error)
          }
        }
      }

      updateProgress(30, '应用参数')

      const uniqueSeed = Math.floor((Date.now() % 1000000) * 1000 + Math.random() * 1000) % 2147483647

      // 构建参数：第一张作为主图，其余作为参考图
      const workflowParams: Record<string, unknown> = {
        ...params,
        prompt: item.prompt || '',
        seed: uniqueSeed,
        imageInput: uploadedImages[0], // 主图
      }
      
      // 如果有多个参考图，添加 referenceImages 参数
      if (uploadedImages.length > 1) {
        workflowParams.referenceImages = uploadedImages.slice(1)
      }

      let workflowData = applyParamsToWorkflow(
        workflow.workflow,
        workflowParams,
        workflow.nodes
      )

      updateProgress(40, '执行中')

      const queue = await client.queuePrompt(workflowData)

      // 轮询等待完成
      const result = await new Promise<{ success: boolean; imageUrl?: string; error?: string }>((resolve) => {
        const check = async () => {
          if (signal?.aborted) {
            resolve({ success: false, error: '已取消' })
            return
          }

          try {
            const history = await client.getHistory(queue.prompt_id)
            const historyItem = history?.[queue.prompt_id]

            if (historyItem) {
              if (historyItem.status.completed) {
                const outputs = historyItem.outputs
                const images: Array<{ filename: string; subfolder: string; type: string }> = []

                Object.values(outputs).forEach((output: any) => {
                  if (output?.images) images.push(...output.images)
                })

                if (images.length > 0) {
                  const firstImage = images[0]!
                  const localPath = await client.getImage(
                    firstImage.filename,
                    firstImage.subfolder,
                    firstImage.type
                  )
                  resolve({ success: true, imageUrl: localPath })
                } else {
                  resolve({ success: false, error: '未生成图片' })
                }
              } else if (historyItem.status.status_str === 'error') {
                resolve({ success: false, error: 'ComfyUI 执行失败' })
              } else {
                setTimeout(check, 1000)
              }
            } else {
              setTimeout(check, 1000)
            }
          } catch (error) {
            resolve({ success: false, error: String(error) })
          }
        }
        check()
      })

      if (!result.success) {
        throw new Error(result.error || '生成失败')
      }

      updateProgress(80, '保存结果')

      // 更新数据库
      const { storyboardDB, characterDB, sceneDB, propDB } = await import('@/db')
      if (type === 'storyboard') {
        await storyboardDB.update(item.id, { image: result.imageUrl, status: 'completed' })
      } else if (type === 'character') {
        await characterDB.update(item.id, { image: result.imageUrl })
      } else if (type === 'scene') {
        await sceneDB.update(item.id, { image: result.imageUrl })
      } else if (type === 'prop') {
        await propDB.update(item.id, { image: result.imageUrl })
      }

      // 自动刷新React Query数据
      queryClient.invalidateQueries({ queryKey: ['storyboards', episodeId] })
      queryClient.invalidateQueries({ queryKey: ['characters', episodeId] })
      queryClient.invalidateQueries({ queryKey: ['scenes', episodeId] })
      queryClient.invalidateQueries({ queryKey: ['props', episodeId] })

      updateProgress(100, '完成')

      return {
        success: true,
        outputPath: result.imageUrl,
        outputUrl: result.imageUrl,
        data: { imageUrl: result.imageUrl, itemId: item.id },
      }
    }
  })

  console.log('[TaskQueue] 默认执行器已注册')
}
