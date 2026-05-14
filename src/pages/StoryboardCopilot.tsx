import { StoryboardCopilotPanel } from '@/plugins/storyboard-copilot'

export default function StoryboardCopilotPage() {
  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col overflow-hidden">
      <StoryboardCopilotPanel className="flex-1" />
    </div>
  )
}
