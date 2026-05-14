import { ReactFlowProvider } from '@xyflow/react'

import { StoryboardFlow } from './StoryboardFlow'

interface StoryboardCopilotPanelProps {
  className?: string
}

export function StoryboardCopilotPanel({ className }: StoryboardCopilotPanelProps) {
  return (
    <ReactFlowProvider>
      <StoryboardFlow className={className} />
    </ReactFlowProvider>
  )
}
