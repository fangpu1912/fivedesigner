import { useCallback, useEffect, useState } from 'react'

import { Bot, FolderOpen, RefreshCw, Settings, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getAIConfigs } from '@/services/configService'
import { workspaceService } from '@/services/workspace'

interface AppHealthState {
  loading: boolean
  workspacePath: string
  workspaceReady: boolean
  aiConfigCount: number
  enabledAiConfigCount: number
  error: string | null
}

const initialState: AppHealthState = {
  loading: true,
  workspacePath: '',
  workspaceReady: false,
  aiConfigCount: 0,
  enabledAiConfigCount: 0,
  error: null,
}

export function AppStatusBanner() {
  const [health, setHealth] = useState<AppHealthState>(initialState)

  const refreshHealth = useCallback(async () => {
    setHealth(current => ({ ...current, loading: true, error: null }))

    try {
      await workspaceService.initialize()
      const workspacePath = await workspaceService.getWorkspacePath()
      const aiConfigs = getAIConfigs()
      const enabledAiConfigCount = aiConfigs.filter(config => config.enabled !== false).length

      setHealth({
        loading: false,
        workspacePath,
        workspaceReady: true,
        aiConfigCount: aiConfigs.length,
        enabledAiConfigCount,
        error: null,
      })
    } catch (error) {
      const aiConfigs = getAIConfigs()
      const enabledAiConfigCount = aiConfigs.filter(config => config.enabled !== false).length

      setHealth({
        loading: false,
        workspacePath: '',
        workspaceReady: false,
        aiConfigCount: aiConfigs.length,
        enabledAiConfigCount,
        error: error instanceof Error ? error.message : '工作区初始化失败',
      })
    }
  }, [])

  useEffect(() => {
    void refreshHealth()

    const handleStorage = () => {
      void refreshHealth()
    }

    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener('storage', handleStorage)
    }
  }, [refreshHealth])

  const showAttention =
    !health.workspaceReady || health.enabledAiConfigCount === 0 || !!health.error

  return (
    <section
      className={[
        'border-b px-4 py-3 backdrop-blur-sm',
        showAttention ? 'border-amber-500/20 bg-amber-500/5' : 'border-border/60 bg-background/80',
      ].join(' ')}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={showAttention ? 'secondary' : 'outline'}>
              {showAttention ? '待完善' : '运行正常'}
            </Badge>
            {health.loading && (
              <span className="text-xs text-muted-foreground">正在检查工作区与模型配置...</span>
            )}
            {!health.loading && health.error && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                <TriangleAlert className="h-3.5 w-3.5" />
                {health.error}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-2">
              <FolderOpen className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {health.workspaceReady ? health.workspacePath : '工作区尚未完成初始化'}
              </span>
            </span>
            <span className="inline-flex items-center gap-2">
              <Bot className="h-4 w-4" />
              已配置 {health.aiConfigCount} 个模型，启用 {health.enabledAiConfigCount} 个
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void refreshHealth()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            重新检查
          </Button>
          <Button asChild size="sm">
            <Link to="/settings">
              <Settings className="mr-2 h-4 w-4" />
              前往设置完善配置
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
