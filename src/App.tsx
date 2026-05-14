import { useEffect, useState } from 'react'

import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { check as checkUpdate } from '@tauri-apps/plugin-updater'

import { AppErrorBoundary } from '@/components/app/AppErrorBoundary'
import { Layout } from '@/components/layout/Layout'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { Toaster } from '@/components/ui/toaster'
import { appPages } from '@/config/appPages'
import { QueryProvider } from '@/providers/QueryProvider'
import { workspaceService } from '@/services/workspace'
import { startTaskProcessor, stopTaskProcessor, registerDefaultExecutors } from '@/services/taskQueue'
import { useTaskResume } from '@/hooks/useTaskResume'

function AppContent() {
  const queryClient = useQueryClient()
  const [ready, setReady] = useState(false)

  useTaskResume()

  useEffect(() => {
    const initApp = async () => {
      try {
        await workspaceService.initialize()
      } catch (error) {
        console.error('[App] Failed to initialize workspace:', error)
      }

      setReady(true)
    }
    void initApp()

    registerDefaultExecutors()
    startTaskProcessor()

    // 启动时检查更新（不阻塞）
    const checkForUpdates = async () => {
      try {
        const update = await checkUpdate()
        if (update?.available) {
          const confirmed = await import('@tauri-apps/plugin-dialog').then(m =>
            m.confirm(`发现新版本 ${update.version}，是否更新？`, {
              title: '发现更新',
              kind: 'info',
              okLabel: '更新',
              cancelLabel: '稍后',
            })
          )
          if (confirmed) {
            await update.downloadAndInstall()
            const { relaunch } = await import('@tauri-apps/plugin-process')
            await relaunch()
          }
        }
      } catch {
        // 静默失败，不影响启动
      }
    }
    void checkForUpdates()

    return () => {
      stopTaskProcessor()
    }
  }, [queryClient])

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          {appPages.flatMap(page =>
            page.routePaths.map(routePath => {
              const PageComponent = page.component
              const key = `${page.navPath}:${routePath}`

              if (routePath === '/') {
                return <Route key={key} index element={<PageComponent />} />
              }

              return <Route key={key} path={routePath.slice(1)} element={<PageComponent />} />
            })
          )}
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

function App() {
  return (
    <AppErrorBoundary>
      <QueryProvider>
        <ThemeProvider>
          <AppContent />
          <Toaster />
        </ThemeProvider>
      </QueryProvider>
    </AppErrorBoundary>
  )
}

export default App
