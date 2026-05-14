import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { MentionInput, type MentionInputRef } from '@/components/ai/MentionInput'
import { cn } from '@/lib/utils'
import type { MentionData } from '@/types/mention'

interface PromptEditorProps {
  value: string
  onChange: (value: string) => void
  negativeValue?: string
  onNegativeChange?: (value: string) => void
  showNegativePrompt?: boolean
  placeholder?: string
  className?: string
  projectId?: string
  episodeId?: string
  enableMention?: boolean
  mentionRef?: React.Ref<MentionInputRef>
  onMentionsChange?: (mentions: MentionData[]) => void
}

export function PromptEditor({
  value,
  onChange,
  negativeValue,
  onNegativeChange,
  showNegativePrompt = false,
  placeholder = '输入提示词...',
  className,
  projectId,
  episodeId,
  enableMention = false,
  mentionRef,
  onMentionsChange,
}: PromptEditorProps) {
  const [showNegative, setShowNegative] = useState(!!negativeValue)

  return (
    <div className={cn('space-y-3', className)}>
      {enableMention ? (
        <MentionInput
          ref={mentionRef}
          value={value}
          onChange={onChange}
          onMentionsChange={onMentionsChange}
          placeholder={placeholder}
          projectId={projectId}
          episodeId={episodeId}
          minRows={4}
        />
      ) : (
        <Textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={4}
          className="resize-none"
        />
      )}

      {showNegativePrompt && (
        <div className="space-y-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowNegative(!showNegative)}
            className="h-6 px-2 text-xs text-muted-foreground"
          >
            {showNegative ? '隐藏反向提示词' : '显示反向提示词'}
          </Button>

          {showNegative && onNegativeChange && (
            <Textarea
              value={negativeValue || ''}
              onChange={e => onNegativeChange(e.target.value)}
              placeholder="输入反向提示词（描述不希望在图片中出现的内容）..."
              rows={2}
              className="resize-none text-sm"
            />
          )}
        </div>
      )}
    </div>
  )
}
