import { Outlet } from 'react-router-dom'

import { PageHeader } from './PageHeader'
import { Sidebar } from './Sidebar'
import { AIChatFloatingButton } from '@/components/ai/AIChatFloatingButton'

export function Layout() {
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <main className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <PageHeader />
        <div className="flex-1 overflow-hidden">
          <Outlet />
        </div>
      </main>

      {/* 全局 AI 聊天悬浮按钮 */}
      <AIChatFloatingButton />
    </div>
  )
}