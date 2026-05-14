import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export type TaskQueueStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

export type TaskQueueType =
  | 'image_generation'
  | 'video_generation'
  | 'audio_generation'
  | 'voice_clone'
  | 'script_analysis'
  | 'batch_operation'
  | 'export'
  | 'import'
  | 'other'

export interface TaskResult {
  outputUrl?: string
  outputPath?: string
  metadata?: Record<string, unknown>
  data?: Record<string, unknown>
  success: boolean
  error?: string
}

export interface Task {
  id: string
  name?: string
  type: TaskQueueType
  status: TaskQueueStatus
  progress: number
  stepName?: string
  description?: string
  errorMessage?: string
  createdAt: number
  startedAt?: number
  completedAt?: number
  result?: TaskResult
  metadata?: Record<string, unknown>
  retryCount?: number
  maxRetries?: number
  abortController?: AbortController
}

interface TaskQueueState {
  tasks: Task[]
  maxConcurrent: number
  isPaused: boolean

  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'status' | 'progress'>) => string
  updateTask: (id: string, updates: Partial<Task>) => void
  removeTask: (id: string) => void
  cancelTask: (id: string) => void
  retryTask: (id: string) => void
  clearCompleted: () => void
  clearAll: () => void
  pauseQueue: () => void
  resumeQueue: () => void
  setMaxConcurrent: (max: number) => void

  getTask: (id: string) => Task | undefined
  getPendingTasks: () => Task[]
  getRunningTasks: () => Task[]
  getCompletedTasks: () => Task[]
  getFailedTasks: () => Task[]
  getTasksByType: (type: TaskQueueType) => Task[]
  getActiveTaskCount: () => number
  hasActiveTasks: () => boolean
}

const generateId = () => `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

export const useTaskQueueStore = create<TaskQueueState>()(
  immer((set, get) => ({
    tasks: [],
    maxConcurrent: 1,
    isPaused: false,

    addTask: task => {
      const id = generateId()
      set(state => {
        state.tasks.push({
          ...task,
          id,
          status: 'pending',
          progress: 0,
          createdAt: Date.now(),
          retryCount: 0,
          maxRetries: task.maxRetries ?? 1,
        })
      })
      return id
    },

    updateTask: (id, updates) =>
      set(state => {
        const index = state.tasks.findIndex(t => t.id === id)
        if (index !== -1 && state.tasks[index]) {
          Object.assign(state.tasks[index]!, updates)
        }
      }),

    removeTask: id =>
      set(state => {
        const task = state.tasks.find(t => t.id === id)
        if (task?.abortController) {
          task.abortController.abort()
        }
        state.tasks = state.tasks.filter(t => t.id !== id)
      }),

    cancelTask: id =>
      set(state => {
        const task = state.tasks.find(t => t.id === id)
        if (task) {
          if (task.abortController) {
            task.abortController.abort()
          }
          task.status = 'cancelled'
          task.completedAt = Date.now()
        }
      }),

    retryTask: id =>
      set(state => {
        const task = state.tasks.find(t => t.id === id)
        if (task && (task.status === 'failed' || task.status === 'cancelled')) {
          task.status = 'pending'
          task.progress = 0
          task.errorMessage = undefined
          task.result = undefined
          task.completedAt = undefined
          task.startedAt = undefined
          task.retryCount = (task.retryCount || 0) + 1
        }
      }),

    clearCompleted: () =>
      set(state => {
        state.tasks = state.tasks.filter(t => t.status !== 'completed' && t.status !== 'failed' && t.status !== 'cancelled')
      }),

    clearAll: () =>
      set(state => {
        state.tasks.forEach(t => {
          if (t.abortController) t.abortController.abort()
        })
        state.tasks = []
      }),

    pauseQueue: () =>
      set(state => {
        state.isPaused = true
      }),

    resumeQueue: () =>
      set(state => {
        state.isPaused = false
      }),

    setMaxConcurrent: max =>
      set(state => {
        state.maxConcurrent = max
      }),

    getTask: id => get().tasks.find(t => t.id === id),

    getPendingTasks: () => get().tasks.filter(t => t.status === 'pending'),

    getRunningTasks: () => get().tasks.filter(t => t.status === 'running'),

    getCompletedTasks: () => get().tasks.filter(t => t.status === 'completed'),

    getFailedTasks: () => get().tasks.filter(t => t.status === 'failed'),

    getTasksByType: type => get().tasks.filter(t => t.type === type),

    getActiveTaskCount: () => get().tasks.filter(t => t.status === 'running').length,

    hasActiveTasks: () => get().tasks.some(t => t.status === 'running' || t.status === 'pending'),
  }))
)
