import { forwardRef } from 'react'

import { MentionInput, type MentionInputRef } from '@/components/ai/MentionInput'
import { useUpstreamMentionItems } from '../../hooks/useUpstreamMentionItems'
import type { MentionData } from '@/types/mention'

export type { MentionInputRef } from '@/components/ai/MentionInput'

export interface NodePromptInputProps {
  value: string
  onChange: (value: string) => void
  onMentionsChange?: (mentions: MentionData[]) => void
  placeholder?: string
  className?: string
  minRows?: number
  maxRows?: number
  disabled?: boolean
  nodeId: string
  enableSlashMenu?: boolean
}

export const NodePromptInput = forwardRef<MentionInputRef, NodePromptInputProps>(
  (
    {
      value,
      onChange,
      onMentionsChange,
      placeholder = '输入提示词，@ 引用上游节点，/ 快速预设...',
      className,
      minRows = 2,
      maxRows = 5,
      disabled = false,
      nodeId,
      enableSlashMenu = true,
    },
    ref,
  ) => {
    const { search } = useUpstreamMentionItems(nodeId)

    return (
      <MentionInput
        ref={ref}
        value={value}
        onChange={onChange}
        onMentionsChange={onMentionsChange}
        placeholder={placeholder}
        minRows={minRows}
        maxRows={maxRows}
        disabled={disabled}
        className={className}
        customSearch={search}
        enableSlashMenu={enableSlashMenu}
      />
    )
  },
)

NodePromptInput.displayName = 'NodePromptInput'
