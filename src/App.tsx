import { useEffect, useState } from 'react'

import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { check as checkUpdate } from '@tauri-apps/plugin-updater'

import { AppErrorBoundary } from '@/components/app/AppErrorBoundary'
import { Layout } from '@/components/layout/Layout'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { Toaster } from '@/components/ui/toaster'
import { ActivationDialog } from '@/components/ActivationDialog'
import { appPages } from '@/config/appPages'
import { QueryProvider } from '@/providers/QueryProvider'
import { workspaceService } from '@/services/workspace'
import { startTaskProcessor, stopTaskProcessor, registerDefaultExecutors } from '@/services/taskQueue'
import { useTaskResume } from '@/hooks/useTaskResume'
import { checkAndRestoreActivation } from '@/services/activationService'
import logger from '@/utils/logger'
import type { ActivationStatus } from '@/types'

function AppContent() {
  const queryClient = useQueryClient()
  const [ready, setReady] = useState(false)
  const [activationStatus, setActivationStatus] = useState<ActivationStatus | null>(null)
  const [showActivationDialog, setShowActivationDialog] = useState(false)
  const [activationChecked, setActivationChecked] = useState(false)

  useTaskResume()

  useEffect(() => {
    // 全局未捕获错误处理 - 静默处理，不记录到日志
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      // 静默处理所有 Promise rejection，防止控制台污染
      event.preventDefault()
    }
    const handleError = (event: ErrorEvent) => {
      // 静默处理所有错误，防止控制台污染
      event.preventDefault()
    }
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    window.addEventListener('error', handleError)

    const initApp = async () => {
      // 检查激活状态
      try {
        const status = await checkAndRestoreActivation()
        setActivationStatus(status)
        setActivationChecked(true)
        if (!status) {
          setShowActivationDialog(true)
          // 未激活,不继续初始化
          return
        }
      } catch (error) {
        logger.error('[App] Failed to check activation:', error)
        // 激活检查失败,允许使用(避免完全无法使用)
        setActivationChecked(true)
      }

      try {
        await workspaceService.initialize()
      } catch (error) {
        logger.error('[App] Failed to initialize workspace:', error)
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
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
      window.removeEventListener('error', handleError)
    }
  }, [queryClient])

  if (!ready) {
    // 激活检查完成但未激活,显示激活对话框
    if (activationChecked && !activationStatus) {
      return (
        <div className="flex items-center justify-center h-screen">
          <ActivationDialog
            open={showActivationDialog}
            onOpenChange={setShowActivationDialog}
            onActivated={(status) => {
              setActivationStatus(status)
              setShowActivationDialog(false)
              // 激活成功后继续初始化
              workspaceService.initialize().catch((error) => {
                logger.error('[App] Failed to initialize workspace:', error)
              })
              setReady(true)
            }}
          />
        </div>
      )
    }

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
