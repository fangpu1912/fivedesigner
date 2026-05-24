import { useCallback } from 'react'
import { X, User, Mountain, Box, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SmartMentionSuggestion } from '@/hooks/useSmartMention'
import type { MentionItem } from '@/types/mention'

interface SmartMentionTooltipProps {
  suggestions: SmartMentionSuggestion[]
  onAccept: (suggestion: SmartMentionSuggestion, mentionItem: MentionItem) => void
  onDismiss: (index: number) => void
  onDismissAll: () => void
  className?: string
}

const TYPE_CONFIG: Record<string, { label: string; icon: typeof User; color: string; bgColor: string }> = {
  character: { label: '角色', icon: User, color: 'text-blue-500', bgColor: 'bg-blue-50 dark:bg-blue-950/30' },
  scene: { label: '场景', icon: Mountain, color: 'text-green-500', bgColor: 'bg-green-50 dark:bg-green-950/30' },
  prop: { label: '道具', icon: Box, color: 'text-amber-500', bgColor: 'bg-amber-50 dark:bg-amber-950/30' },
}

function SuggestionCard({
  suggestion,
  onAccept,
  onDismiss,
}: {
  suggestion: SmartMentionSuggestion
  onAccept: (s: SmartMentionSuggestion, item: MentionItem) => void
  onDismiss: () => void
}) {
  const { asset, matchText } = suggestion
  const config = TYPE_CONFIG[asset.type] || TYPE_CONFIG.character
  if (!config) return null
  const Icon = config.icon

  const handleAccept = useCallback(() => {
    const mentionItem: MentionItem = {
      id: `asset:${asset.type}:${asset.id}`,
      type: asset.type as 'character' | 'scene' | 'prop',
      name: asset.name,
      imageUrl: asset.image,
      thumbnail: asset.image,
      description: asset.description,
      prompt: asset.prompt,
    }
    onAccept(suggestion, mentionItem)
  }, [suggestion, asset, onAccept])

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer',
        'hover:shadow-sm transition-all animate-in fade-in slide-in-from-bottom-1',
        config.bgColor,
        'border-transparent hover:border-primary/30'
      )}
      onClick={handleAccept}
    >
      <div className={cn('w-6 h-6 rounded-md flex items-center justify-center shrink-0', config.bgColor)}>
        <Icon className={cn('w-3.5 h-3.5', config.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium truncate">
            检测到{config.label} &quot;{matchText}&quot;
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          点击转换为 @{asset.name}
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleAccept()
          }}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary text-primary-foreground text-[10px] font-medium hover:bg-primary/90 transition-colors"
        >
          <Sparkles className="w-3 h-3" />
          @关联
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDismiss()
          }}
          className="w-5 h-5 rounded-md hover:bg-muted flex items-center justify-center transition-colors"
        >
          <X className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>
    </div>
  )
}

export function SmartMentionTooltip({
  suggestions,
  onAccept,
  onDismiss,
  onDismissAll,
  className,
}: SmartMentionTooltipProps) {
  if (suggestions.length === 0) return null

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] text-muted-foreground font-medium">
          智能关联 ({suggestions.length})
        </span>
        <button
          onClick={onDismissAll}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          忽略全部
        </button>
      </div>
      <div className="space-y-1.5">
        {suggestions.map((suggestion, index) => (
          <SuggestionCard
            key={`${suggestion.asset.id}-${index}`}
            suggestion={suggestion}
            onAccept={onAccept}
            onDismiss={() => onDismiss(index)}
          />
        ))}
      </div>
    </div>
  )
}
