import logger from '@/utils/logger'

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'retrying'
export type TaskType = 'scene_segmentation' | 'asset_extraction' | 'storyboard_breakdown' | 'dubbing_generation'

export interface ProductionTask {
  id: string
  type: TaskType
  name: string
  status: TaskStatus
  retryCount: number
  maxRetries: number
  error?: string
  startTime?: number
  endTime?: number
  result?: unknown
  metadata?: Record<string, unknown>
}

export interface ProductionProgress {
  total: number
  completed: number
  failed: number
  running: number
  pending: number
  percent: number
  currentTasks: ProductionTask[]
  estimatedTimeRemaining?: number
}

export type ProgressCallback = (progress: ProductionProgress) => void
export type TaskExecutor<T = unknown> = (task: ProductionTask) => Promise<T>

interface SchedulerConfig {
  maxConcurrency: number
  retryDelay: number
  progressInterval: number
}

const DEFAULT_CONFIG: SchedulerConfig = {
  maxConcurrency: 3,
  retryDelay: 2000,
  progressInterval: 500,
}

export class ProductionScheduler {
  private tasks: Map<string, ProductionTask> = new Map()
  private executors: Map<TaskType, TaskExecutor> = new Map()
  private runningCount = 0
  private config: SchedulerConfig
  private progressCallback?: ProgressCallback
  private abortController?: AbortController
  private startTime = 0

  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  registerExecutor(type: TaskType, executor: TaskExecutor): void {
    this.executors.set(type, executor)
  }

  setProgressCallback(callback: ProgressCallback): void {
    this.progressCallback = callback
  }

  addTask(task: Omit<ProductionTask, 'status' | 'retryCount'>): string {
    const fullTask: ProductionTask = {
      ...task,
      status: 'pending',
      retryCount: 0,
    }
    this.tasks.set(task.id, fullTask)
    return task.id
  }

  addTasks(tasks: Array<Omit<ProductionTask, 'status' | 'retryCount'>>): string[] {
    return tasks.map(task => this.addTask(task))
  }

  getProgress(): ProductionProgress {
    const taskList = Array.from(this.tasks.values())
    const total = taskList.length
    const completed = taskList.filter(t => t.status === 'completed').length
    const failed = taskList.filter(t => t.status === 'failed').length
    const running = taskList.filter(t => t.status === 'running').length
    const pending = taskList.filter(t => t.status === 'pending').length
    const retrying = taskList.filter(t => t.status === 'retrying').length

    const percent = total > 0 ? Math.round(((completed + failed) / total) * 100) : 0

    const elapsed = Date.now() - this.startTime
    const avgTimePerTask = completed > 0 ? elapsed / completed : 0
    const estimatedTimeRemaining = pending + running + retrying > 0
      ? Math.round(avgTimePerTask * (pending + running + retrying) / this.config.maxConcurrency)
      : 0

    return {
      total,
      completed,
      failed,
      running,
      pending,
      percent,
      currentTasks: taskList.filter(t => t.status === 'running' || t.status === 'retrying'),
      estimatedTimeRemaining,
    }
  }

  async start(): Promise<void> {
    this.abortController = new AbortController()
    this.startTime = Date.now()

    const reportProgress = () => {
      if (this.progressCallback) {
        this.progressCallback(this.getProgress())
      }
    }

    const progressInterval = setInterval(reportProgress, this.config.progressInterval)

    try {
      await this.processQueue()
    } finally {
      clearInterval(progressInterval)
      reportProgress()
    }
  }

  abort(): void {
    this.abortController?.abort()
  }

  private async processQueue(): Promise<void> {
    const pendingTasks = () => Array.from(this.tasks.values())
      .filter(t => t.status === 'pending' || t.status === 'retrying')

    while (pendingTasks().length > 0 && !this.abortController?.signal.aborted) {
      const available = this.config.maxConcurrency - this.runningCount
      if (available <= 0) {
        await this.sleep(100)
        continue
      }

      const toRun = pendingTasks().slice(0, available)
      await Promise.all(toRun.map(task => this.executeTask(task)))
    }
  }

  private async executeTask(task: ProductionTask): Promise<void> {
    const executor = this.executors.get(task.type)
    if (!executor) {
      task.status = 'failed'
      task.error = `No executor registered for task type: ${task.type}`
      logger.error(`[ProductionScheduler] ${task.error}`)
      return
    }

    task.status = task.retryCount > 0 ? 'retrying' : 'running'
    task.startTime = Date.now()
    this.runningCount++

    try {
      task.result = await executor(task)
      task.status = 'completed'
      task.endTime = Date.now()
      logger.info(`[ProductionScheduler] Task completed: ${task.name}`)
    } catch (error) {
      task.endTime = Date.now()
      const errorMsg = error instanceof Error ? error.message : String(error)
      task.error = errorMsg
      logger.error(`[ProductionScheduler] Task failed: ${task.name}`, errorMsg)

      if (task.retryCount < task.maxRetries) {
        task.retryCount++
        task.status = 'retrying'
        logger.info(`[ProductionScheduler] Retrying task: ${task.name} (${task.retryCount}/${task.maxRetries})`)
        await this.sleep(this.config.retryDelay)
        this.runningCount--
        await this.executeTask(task)
        return
      }

      task.status = 'failed'
    } finally {
      this.runningCount--
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

export function createProductionScheduler(config?: Partial<SchedulerConfig>): ProductionScheduler {
  return new ProductionScheduler(config)
}
