import { useEffect, useState } from 'react'

import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { check as checkUpdate } from '@tauri-apps/plugin-updater'
import { FolderOpen, Plus } from 'lucide-react'

import { AppErrorBoundary } from '@/components/app/AppErrorBoundary'
import { Layout } from '@/components/layout/Layout'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Toaster } from '@/components/ui/toaster'
import { ActivationDialog } from '@/components/ActivationDialog'
import { appPages } from '@/config/appPages'
import { QueryProvider } from '@/providers/QueryProvider'
import { workspaceService } from '@/services/workspace'
import { startTaskProcessor, stopTaskProcessor, registerDefaultExecutors } from '@/services/taskQueue'
import { useTaskResume } from '@/hooks/useTaskResume'
import { checkAndRestoreActivation } from '@/services/activationService'
import { projectDB } from '@/db'
import logger from '@/utils/logger'
import type { ActivationStatus } from '@/types'

function AppContent() {
  const queryClient = useQueryClient()
  const [ready, setReady] = useState(false)
  const [activationStatus, setActivationStatus] = useState<ActivationStatus | null>(null)
  const [showActivationDialog, setShowActivationDialog] = useState(false)
  const [activationChecked, setActivationChecked] = useState(false)
  const [showFirstRunGuide, setShowFirstRunGuide] = useState(false)
  const [guideStep, setGuideStep] = useState(0)

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

        // 首次运行检测：无项目时弹出引导
        try {
          const projects = await projectDB.getAll()
          if (projects.length === 0) {
            const isCustom = workspaceService.isCustomWorkspace()
            if (!isCustom) {
              setGuideStep(0)
              setShowFirstRunGuide(true)
            }
          }
        } catch {
          // 数据库查询失败不阻塞
        }
      } catch (error) {
        logger.error('[App] Failed to initialize workspace:', error)
      }

      setReady(true)
    }
    void initApp()

    registerDefaultExecutors()
    startTaskProcessor()
    // 预热豆包配额（service 懒加载守卫，幂等；任务队列 executor 启动前确保配额已就绪）
    void import('@/services/doubaoQuotaService').then(m => m.load())

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
    <>
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

      {/* 首次运行引导 */}
      <Dialog open={showFirstRunGuide} onOpenChange={setShowFirstRunGuide}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">欢迎使用 FiveDesigner 🎉</DialogTitle>
            <DialogDescription>
              为了正常使用，请先完成以下两步设置，避免数据存到系统盘。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* 步骤1 */}
            <Card className={guideStep === 0 ? 'border-primary' : ''}>
              <CardContent className="p-4 flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-sm font-bold text-primary">1</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">设置工作目录</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    软件默认使用系统 AppData 目录存储文件，请设置到有足够空间的自定义目录（如 D:\FiveDesigner），避免 C 盘爆满。
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 h-7 text-xs"
                    onClick={() => {
                      window.open('/settings', '_self')
                    }}
                  >
                    <FolderOpen className="w-3 h-3 mr-1" />
                    前往设置工作目录
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 步骤2 */}
            <Card className={guideStep === 1 ? 'border-primary' : ''}>
              <CardContent className="p-4 flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-sm font-bold text-primary">2</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">新建项目与剧集</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    所有创作内容都归属于项目和剧集，请先创建一个项目，再在项目中创建剧集。
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 h-7 text-xs"
                    onClick={() => {
                      setShowFirstRunGuide(false)
                      window.open('/projects', '_self')
                    }}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    前往新建项目
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowFirstRunGuide(false)}>
              稍后设置
            </Button>
            <Button size="sm" onClick={() => {
              if (guideStep === 0) {
                setGuideStep(1)
              } else {
                setShowFirstRunGuide(false)
              }
            }}>
              {guideStep === 0 ? '下一步' : '我知道了'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
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
