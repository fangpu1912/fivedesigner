/**
 * Agent 控制器
 * 协调解析、规划、执行、校验全流程
 */

import { AI } from '@/services/vendor/aiService'
import { useTaskQueueStore } from '@/store/useTaskQueueStore'
import { parseIntent } from './intentParser'
import { generateTaskGraph, calculateProgress as _calculateProgress, getExecutableTasks as _getExecutableTasks } from './taskPlanner'
import type {
  ParsedIntent,
  TaskGraph,
  TaskNode,
  AgentState,
  AgentConfig,
} from './types'

// 默认配置
const DEFAULT_CONFIG: AgentConfig = {
  defaultOutputCount: 4,
  defaultAspectRatio: '16:9',
  defaultWidth: 1024,
  defaultHeight: 576,
  autoOptimizePrompt: true,
  enableQualityCheck: true,
  maxRetries: 3,
}

/**
 * Agent 控制器类
 */
export class AgentController {
  private state: AgentState
  private config: AgentConfig
  private onStateChange?: (state: AgentState) => void

  constructor(config: Partial<AgentConfig> = {}, onStateChange?: (state: AgentState) => void) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.onStateChange = onStateChange
    this.state = {
      phase: 'idle',
      progress: 0,
      message: '等待输入...',
    }
  }

  /**
   * 获取当前状态
   */
  getState(): AgentState {
    return { ...this.state }
  }

  /**
   * 更新状态
   */
  private updateState(updates: Partial<AgentState>) {
    this.state = { ...this.state, ...updates }
    this.onStateChange?.(this.state)
  }

  /**
   * 开始创作流程
   */
  async start(input: string): Promise<void> {
    try {
      this.updateState({
        phase: 'parsing',
        progress: 0,
        message: '正在理解您的需求...',
        startTime: Date.now(),
      })

      // Phase 1: 解析需求
      const intent = await this.parsePhase(input)

      // Phase 2: 规划任务
      const taskGraph = await this.planningPhase(intent)

      // Phase 3: 执行任务
      await this.executionPhase(taskGraph)

      // Phase 4: 完成
      this.updateState({
        phase: 'completed',
        progress: 100,
        message: '创作完成！',
      })
    } catch (error) {
      this.updateState({
        phase: 'failed',
        message: error instanceof Error ? error.message : '创作失败',
      })
      throw error
    }
  }

  /**
   * Phase 1: 解析需求
   */
  private async parsePhase(input: string): Promise<ParsedIntent> {
    this.updateState({
      phase: 'parsing',
      progress: 10,
      message: '正在解析创作需求...',
    })

    const intent = await parseIntent(input)

    this.updateState({
      intent,
      progress: 20,
      message: `已识别：${intent.type === 'image' ? '图片' : intent.type === 'video' ? '视频' : '音频'}创作，风格：${intent.style}`,
    })

    return intent
  }

  /**
   * Phase 2: 规划任务
   */
  private async planningPhase(intent: ParsedIntent): Promise<TaskGraph> {
    this.updateState({
      phase: 'planning',
      progress: 25,
      message: '正在规划创作任务...',
    })

    const taskGraph = generateTaskGraph(intent)

    this.updateState({
      taskGraph,
      progress: 30,
      message: `已规划 ${taskGraph.nodes.length} 个任务，分 ${taskGraph.batches.length} 批次执行`,
    })

    return taskGraph
  }

  /**
   * Phase 3: 执行任务
   */
  private async executionPhase(taskGraph: TaskGraph): Promise<void> {
    this.updateState({
      phase: 'executing',
      progress: 30,
      message: '开始执行创作任务...',
    })

    // 按批次执行任务
    for (let batchIndex = 0; batchIndex < taskGraph.batches.length; batchIndex++) {
      const batch = taskGraph.batches[batchIndex]!

      this.updateState({
        message: `执行第 ${batchIndex + 1}/${taskGraph.batches.length} 批次任务...`,
      })

      // 并行执行批次内的任务
      await Promise.all(
        batch.map(taskId => this.executeTask(taskGraph, taskId))
      )

      // 更新进度
      const progress = 30 + Math.round((batchIndex + 1) / taskGraph.batches.length * 60)
      this.updateState({ progress })
    }
  }

  /**
   * 执行单个任务
   */
  private async executeTask(taskGraph: TaskGraph, taskId: string): Promise<void> {
    const task = taskGraph.nodes.find(n => n.id === taskId)
    if (!task) return

    // 更新任务状态
    task.status = 'running'
    this.updateState({
      currentTaskId: taskId,
      message: `正在执行：${task.name}`,
    })

    try {
      // 根据任务类型调用不同的生成服务
      switch (task.type) {
        case 'image':
          await this.executeImageTask(task)
          break
        case 'video':
          await this.executeVideoTask(task)
          break
        case 'audio':
          await this.executeAudioTask(task)
          break
      }

      task.status = 'completed'
    } catch (error) {
      task.status = 'failed'
      task.error = error instanceof Error ? error.message : '任务执行失败'
      console.error(`[Agent] 任务 ${taskId} 失败:`, task.error)
    }
  }

  /**
   * 执行图片生成任务
   */
  private async executeImageTask(task: TaskNode): Promise<void> {
    // 获取项目信息
    const { useUIStore } = await import('@/store/useUIStore')
    const { currentProjectId, currentEpisodeId: _currentEpisodeId } = useUIStore.getState()

    if (!currentProjectId) {
      throw new Error('未选择项目')
    }

    // 使用 AI 服务直接生成（不使用 Hook）
    // 使用传入的模型配置，视频创作中的关键帧生成也使用 imageModel
    let modelName = this.config.imageModel
    if (!modelName && this.config.videoModel) {
      // 如果是视频创作流程中的关键帧生成，且没有图片模型，尝试使用视频模型的图片生成能力
      // 注意：某些视频模型（如 Seedream）也支持图片生成
      modelName = this.config.videoModel.replace('seedance', 'seedream').replace('video', 'image')
    }
    if (!modelName) {
      throw new Error('未选择图片生成模型，请先在 Agent 面板中选择图片模型（视频创作需要图片模型生成关键帧）')
    }
    const imageUrl = await AI.Image.generate(
      {
        prompt: task.params.prompt as string,
        width: task.params.width as number,
        height: task.params.height as number,
        // 如果有参考图，添加参考
        ...(task.params.referenceImage ? {
          imageUrl: task.output, // 使用之前任务的输出作为参考
        } : {}),
      } as any,
      modelName,
      parseInt(currentProjectId)
    )

    task.output = imageUrl
  }

  /**
   * 执行视频生成任务
   */
  private async executeVideoTask(task: TaskNode): Promise<void> {
    const { useUIStore } = await import('@/store/useUIStore')
    const { currentProjectId, currentEpisodeId: _currentEpisodeId } = useUIStore.getState()

    if (!currentProjectId) {
      throw new Error('未选择项目')
    }

    // 获取关键帧
    const frameIds = task.params.frameIds as string[]
    const frameUrls: string[] = []

    // 从任务图中获取关键帧的输出
    const taskGraph = this.state.taskGraph
    if (taskGraph) {
      for (const frameId of frameIds) {
        const frameTask = taskGraph.nodes.find(n => n.id === frameId)
        if (frameTask?.output) {
          frameUrls.push(frameTask.output)
        }
      }
    }

    // 使用 AI 服务直接生成（不使用 Hook）
    // 使用传入的模型配置
    const modelName = this.config.videoModel
    if (!modelName) {
      throw new Error('未选择视频生成模型，请先在 Agent 面板中选择视频模型')
    }
    const videoUrl = await AI.Video.generate(
      {
        prompt: task.params.prompt as string,
        width: (task.params.width as number) || 1280,
        height: (task.params.height as number) || 720,
        duration: task.params.duration as number,
        firstImageBase64: frameUrls[0],
        lastImageBase64: frameUrls[frameUrls.length - 1],
        referenceImages: frameUrls,
      } as any,
      modelName,
      parseInt(currentProjectId)
    )

    task.output = videoUrl
  }

  /**
   * 执行音频生成任务
   */
  private async executeAudioTask(task: TaskNode): Promise<void> {
    const { useUIStore } = await import('@/store/useUIStore')
    const { currentProjectId, currentEpisodeId: _currentEpisodeId } = useUIStore.getState()

    if (!currentProjectId) {
      throw new Error('未选择项目')
    }

    // 使用 AI 服务直接生成（不使用 Hook）
    // 使用传入的模型配置
    const modelName = this.config.audioModel
    if (!modelName) {
      throw new Error('未选择音频生成模型，请先在 Agent 面板中选择音频模型')
    }
    const audioUrl = await AI.Audio.generate(
      {
        text: task.params.text as string,
        voice: 'default',
      },
      modelName,
      parseInt(currentProjectId)
    )

    task.output = audioUrl
  }

  /**
   * 停止创作
   */
  stop(): void {
    // 取消正在进行的任务队列任务
    const store = useTaskQueueStore.getState()
    store.tasks
      .filter(t => t.status === 'running' || t.status === 'pending')
      .forEach(t => store.cancelTask(t.id))

    this.updateState({
      phase: 'idle',
      message: '已停止',
    })
  }
}

/**
 * 创建 Agent 控制器实例（Hook 风格）
 */
export function createAgentController(
  config?: Partial<AgentConfig>,
  onStateChange?: (state: AgentState) => void
): AgentController {
  return new AgentController(config, onStateChange)
}
