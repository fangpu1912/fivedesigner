import { Outlet } from 'react-router-dom'

import { cn } from '@/lib/utils'
import { useUIStore } from '@/store/useUIStore'

import { Sidebar } from './Sidebar'

export function MainLayout() {
  const { sidebarOpen } = useUIStore()

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main
        className={cn(
          'flex-1 overflow-hidden transition-all duration-300',
          sidebarOpen ? 'ml-72' : 'ml-16'
        )}
      >
        <Outlet />
      </main>
    </div>
  )
}
