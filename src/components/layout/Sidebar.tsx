import {
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Film,
  Clapperboard,
} from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { useProjectQuery } from '@/hooks/useProjects'
import { useEpisodeQuery } from '@/hooks/useEpisodes'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/store/useUIStore'
import { navPages } from '@/config/appPages'

export function Sidebar() {
  const location = useLocation()
  const { sidebarOpen, toggleSidebar, setActiveRoute, currentProjectId, currentEpisodeId } =
    useUIStore()
  const { data: currentProject } = useProjectQuery(currentProjectId || '')
  const { data: currentEpisode } = useEpisodeQuery(currentEpisodeId || '')

  const isItemActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(`${path}/`)
  }

  return (
    <aside
      className={cn(
        'h-screen bg-card border-r border-border flex flex-col transition-all duration-300',
        sidebarOpen ? 'w-64' : 'w-16'
      )}
    >
      {/* Logo区域 */}
      <div className="h-14 flex items-center px-4 border-b border-border">
        {sidebarOpen ? (
          <div className="flex items-center gap-3 flex-1">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Clapperboard className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-base">FiveDesigner</span>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center mx-auto">
            <Clapperboard className="w-4 h-4 text-primary-foreground" />
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className={cn('h-7 w-7', sidebarOpen ? 'ml-auto' : 'mx-auto mt-2')}
        >
          {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </Button>
      </div>

      {/* 当前上下文 - 仅展开时显示 */}
      {sidebarOpen && (currentProject || currentEpisode) && (
        <div className="px-3 py-2 border-b border-border bg-muted/30">
          <div className="space-y-1.5">
            {currentProject && (
              <div className="flex items-center gap-2 text-xs">
                <FolderOpen className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-muted-foreground truncate">{currentProject.name}</span>
              </div>
            )}
            {currentEpisode && (
              <div className="flex items-center gap-2 text-xs">
                <Film className="w-3.5 h-3.5 text-primary" />
                <span className="font-medium truncate">{currentEpisode.name}</span>
                {currentEpisode.episode_number && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                    EP.{currentEpisode.episode_number}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 折叠状态指示器 */}
      {!sidebarOpen && (currentProject || currentEpisode) && (
        <div className="py-2 px-2 border-b border-border space-y-1">
          {currentEpisode && (
            <div className="flex justify-center">
              <div
                className="w-8 h-8 rounded-md bg-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground"
                title={currentEpisode.name}
              >
                {currentEpisode.episode_number || 'E'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 导航菜单 - 从 appPages 配置动态渲染 */}
      <nav className="flex-1 overflow-y-auto py-2">
        {sidebarOpen ? (
          <ul className="space-y-0.5 px-2">
            {navPages.map(page => {
              const PageIcon = page.icon
              return (
                <li key={page.navPath}>
                  <NavLink
                    to={page.navPath}
                    onClick={() => setActiveRoute(page.navPath)}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
                      isItemActive(page.navPath)
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <PageIcon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{page.label}</span>
                  </NavLink>
                </li>
              )
            })}
          </ul>
        ) : (
          /* 折叠状态 - 只显示图标 */
          <ul className="space-y-0.5 px-2">
            {navPages.map(page => {
              const PageIcon = page.icon
              return (
                <li key={page.navPath}>
                  <NavLink
                    to={page.navPath}
                    onClick={() => setActiveRoute(page.navPath)}
                    title={page.label}
                    className={cn(
                      'flex items-center justify-center h-9 rounded-md transition-colors',
                      isItemActive(page.navPath)
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <PageIcon className="w-[18px] h-[18px]" />
                  </NavLink>
                </li>
              )
            })}
          </ul>
        )}
      </nav>

      {/* 底部信息 */}
      <div className="p-3 border-t border-border">
        {sidebarOpen ? (
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>v1.0.0</span>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>就绪</span>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="系统正常" />
          </div>
        )}
      </div>
    </aside>
  )
}
