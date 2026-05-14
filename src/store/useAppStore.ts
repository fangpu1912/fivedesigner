import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

import { useUIStore } from './useUIStore'
import { useWorkflowStore } from './useWorkflowStore'

interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
  duration?: number
}

interface AppState {
  isLoading: boolean
  loadingMessage: string
  error: string | null
  toasts: Toast[]

  setLoading: (isLoading: boolean, message?: string) => void
  setError: (error: string | null) => void
  addToast: (message: string, type: Toast['type'], duration?: number) => void
  removeToast: (id: string) => void
  clearToasts: () => void
  reset: () => void
}

const initialState = {
  isLoading: false,
  loadingMessage: '',
  error: null,
  toasts: [],
}

export const useAppStore = create<AppState>()(
  persist(
    immer(set => ({
      ...initialState,

      setLoading: (isLoading, message = '') =>
        set(state => {
          state.isLoading = isLoading
          state.loadingMessage = message
        }),

      setError: error =>
        set(state => {
          state.error = error
        }),

      addToast: (message, type, duration = 5000) =>
        set(state => {
          const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
          state.toasts.push({ id, message, type, duration })
        }),

      removeToast: id =>
        set(state => {
          const index = state.toasts.findIndex(t => t.id === id)
          if (index !== -1) {
            state.toasts.splice(index, 1)
          }
        }),

      clearToasts: () =>
        set(state => {
          state.toasts = []
        }),

      reset: () =>
        set(() => ({
          ...initialState,
        })),
    })),
    {
      name: 'app-storage',
      partialize: state => ({
        toasts: state.toasts,
      }),
    }
  )
)

export const useStores = () => ({
  app: useAppStore,
  ui: useUIStore,
  workflow: useWorkflowStore,
})

export const resetAllStores = () => {
  useAppStore.getState().reset()
  useWorkflowStore.setState({
    workflows: [],
    activeWorkflowId: null,
    executions: [],
    activeExecutionId: null,
  })
}

export type { Toast }
