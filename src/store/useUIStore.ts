import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { setComfyUIContext } from '@/services/comfyuiService'

interface UIState {
  sidebarOpen: boolean
  theme: 'light' | 'dark' | 'system'
  currentProjectId: string | null
  currentEpisodeId: string | null
  activeRoute: string
  toggleSidebar: () => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  setCurrentProjectId: (projectId: string | null) => void
  setCurrentEpisodeId: (episodeId: string | null) => void
  setActiveRoute: (route: string) => void
}

export const useUIStore = create<UIState>()(
  persist(
    set => ({
      sidebarOpen: true,
      theme: 'system',
      currentProjectId: null,
      currentEpisodeId: null,
      activeRoute: '/',
      toggleSidebar: () => set(state => ({ sidebarOpen: !state.sidebarOpen })),
      setTheme: theme => set({ theme }),
      setCurrentProjectId: projectId => {
        set({ currentProjectId: projectId, currentEpisodeId: null })
        // 更新 ComfyUI 服务的上下文
        setComfyUIContext(projectId || undefined, undefined)
      },
      setCurrentEpisodeId: episodeId => {
        set({ currentEpisodeId: episodeId })
        // 更新 ComfyUI 服务的上下文
        const state = useUIStore.getState()
        setComfyUIContext(state.currentProjectId || undefined, episodeId || undefined)
      },
      setActiveRoute: route => set({ activeRoute: route }),
    }),
    {
      name: 'fivedesigner-ui',
      version: 1,
      partialize: state => ({
        sidebarOpen: state.sidebarOpen,
        theme: state.theme,
        activeRoute: state.activeRoute,
        currentProjectId: state.currentProjectId,
        currentEpisodeId: state.currentEpisodeId,
      }),
    }
  )
)
