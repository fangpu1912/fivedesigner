import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import type { GenerationResult } from '../types/generation'

export type GenerationTaskType = 'image' | 'video' | 'audio'
export type GenerationTaskStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface GenerationOptions {
  prompt: string
  negativePrompt?: string
  width?: number
  height?: number
  aspectRatio?: string
  duration?: number
  audio?: boolean
  model?: string
  imageUrl?: string
}

export interface GenerationTask {
  id: string
  type: GenerationTaskType
  status: GenerationTaskStatus
  progress: number
  request: GenerationOptions
  result?: GenerationResult
  error?: string
  createdAt: number
  startedAt?: number
  completedAt?: number
}

interface GenerationState {
  tasks: GenerationTask[]
  activeTaskId: string | null
  maxConcurrent: number

  addTask: (task: Omit<GenerationTask, 'id' | 'createdAt'>) => string
  updateTask: (id: string, updates: Partial<GenerationTask>) => void
  removeTask: (id: string) => void
  clearCompleted: () => void
  setActiveTask: (id: string | null) => void
  setMaxConcurrent: (max: number) => void
  getTask: (id: string) => GenerationTask | undefined
  getPendingTasks: () => GenerationTask[]
  getRunningTasks: () => GenerationTask[]
  getCompletedTasks: () => GenerationTask[]
  getFailedTasks: () => GenerationTask[]
  getTasksByType: (type: GenerationTaskType) => GenerationTask[]
}

const generateId = () => `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

export const useGenerationStore = create<GenerationState>()(
  immer((set, get) => ({
    tasks: [],
    activeTaskId: null,
    maxConcurrent: 1,

    addTask: task => {
      const id = generateId()
      set(state => {
        state.tasks.push({
          ...task,
          id,
          createdAt: Date.now(),
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
        const index = state.tasks.findIndex(t => t.id === id)
        if (index !== -1) {
          state.tasks.splice(index, 1)
        }
        if (state.activeTaskId === id) {
          state.activeTaskId = null
        }
      }),

    clearCompleted: () =>
      set(state => {
        state.tasks = state.tasks.filter(t => t.status !== 'completed' && t.status !== 'failed')
      }),

    setActiveTask: id =>
      set(state => {
        state.activeTaskId = id
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
  }))
)
