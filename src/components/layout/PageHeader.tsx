import { useState } from 'react'

import { FolderOpen, Film, ChevronRight, ListTodo } from 'lucide-react'
import { useLocation } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getAppPageByPathname } from '@/config/appPages'
import { useProjectQuery } from '@/hooks/useProjects'
import { useEpisodeQuery } from '@/hooks/useEpisodes'
import { useUIStore } from '@/store/useUIStore'
import { useTaskQueueStore } from '@/store/useTaskQueueStore'
import { TaskQueuePanel } from '@/components/ai/TaskQueuePanel'

export function PageHeader() {
  const location = useLocation()
  const currentPage = getAppPageByPathname(location.pathname)
  const { currentProjectId, currentEpisodeId } = useUIStore()
  const { data: project } = useProjectQuery(currentProjectId || '')
  const { data: episode } = useEpisodeQuery(currentEpisodeId || '')
  const [taskQueueOpen, setTaskQueueOpen] = useState(false)
  const hasActiveTasks = useTaskQueueStore(s => s.hasActiveTasks())
  const runningCount = useTaskQueueStore(s => s.tasks.filter(t => t.status === 'running').length)
  const pendingCount = useTaskQueueStore(s => s.tasks.filter(t => t.status === 'pending').length)

  if (!currentPage) {
    return null
  }

  const PageIcon = currentPage.icon
  const showContextHint =
    currentPage.navPath !== '/' &&
    currentPage.navPath !== '/settings' &&
    currentPage.navPath !== '/prompt-settings' &&
    !project

  return (
    <header className="h-14 border-b border-border bg-card/50 px-4 flex items-center justify-between">
      {/* 左侧：页面标题 */}
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <PageIcon className="h-4 w-4" />
        </div>
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold">{currentPage.label}</h1>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {currentPage.description}
          </span>
        </div>
      </div>

      {/* 右侧：上下文信息和任务队列 */}
      <div className="flex items-center gap-2">
        {showContextHint ? (
          <Badge variant="outline" className="text-[10px] px-2 py-0.5 h-6">
            请先选择项目
          </Badge>
        ) : (
          <>
            {project && (
              <div className="flex items-center gap-1.5 text-xs">
                <FolderOpen className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-muted-foreground max-w-24 truncate">
                  {project.name}
                </span>
              </div>
            )}
            {project && episode && (
              <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
            )}
            {episode && (
              <div className="flex items-center gap-1.5 text-xs">
                <Film className="w-3.5 h-3.5 text-primary" />
                <span className="font-medium max-w-24 truncate">{episode.name}</span>
                {episode.episode_number && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                    EP.{episode.episode_number}
                  </Badge>
                )}
              </div>
            )}
          </>
        )}

        {/* 任务队列按钮 */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 ml-2"
          onClick={() => setTaskQueueOpen(!taskQueueOpen)}
        >
          <div className="relative">
            <ListTodo className="h-4 w-4" />
            {hasActiveTasks && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                {runningCount + pendingCount}
              </span>
            )}
          </div>
        </Button>
      </div>

      {/* 任务队列面板 */}
      {taskQueueOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setTaskQueueOpen(false)}
          />
          <div className="fixed right-0 top-0 bottom-0 z-50 w-96 bg-background border-l shadow-xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold">任务队列</h2>
            </div>
            <div className="flex-1 overflow-hidden p-4">
              <TaskQueuePanel />
            </div>
          </div>
        </>
      )}
    </header>
  )
}
