import { forwardRef, useEffect, useImperativeHandle, useRef, useState, useCallback } from 'react'

import { User, Mountain, Box, LayoutGrid, Video, Music, Image, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MENTION_TYPE_CONFIG, type MentionItem, type MentionElementType } from '@/types/mention'
import { MediaThumbnail } from '@/components/media/MediaThumbnail'

interface MentionDropdownProps {
  items: MentionItem[]
  selectedIndex: number
  query: string
  onSelect: (item: MentionItem) => void
  onHover: (index: number) => void
  onVisibleCountChange?: (count: number) => void
}

const TYPE_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  User,
  Mountain,
  Box,
  LayoutGrid,
  Video,
  Music,
  Image,
}

const PAGE_SIZE = 15

function TypeIcon({ type, className }: { type: MentionElementType; className?: string }) {
  const config = MENTION_TYPE_CONFIG[type]
  const IconComp = TYPE_ICON_MAP[config.icon]
  if (!IconComp) return null
  return <IconComp className={cn('h-3.5 w-3.5', config.color, className)} />
}

function groupByType(items: MentionItem[]): Record<string, MentionItem[]> {
  const groups: Record<string, MentionItem[]> = {}
  for (const item of items) {
    if (!groups[item.type]) groups[item.type] = []
    groups[item.type]!.push(item)
  }
  return groups
}

function getMediaType(type: MentionElementType): 'image' | 'video' | 'audio' {
  if (type === 'video') return 'video'
  if (type === 'audio') return 'audio'
  return 'image'
}

function MentionItemThumbnail({ item }: { item: MentionItem }) {
  const mediaType = getMediaType(item.type)

  if (!item.thumbnail && mediaType === 'audio') {
    return (
      <div className="w-7 h-7 rounded bg-muted flex items-center justify-center shrink-0">
        <TypeIcon type={item.type} />
      </div>
    )
  }

  if (!item.thumbnail) {
    return (
      <div className="w-7 h-7 rounded bg-muted flex items-center justify-center shrink-0">
        <TypeIcon type={item.type} />
      </div>
    )
  }

  return (
    <div className="w-7 h-7 rounded overflow-hidden shrink-0">
      <MediaThumbnail
        url={item.thumbnail}
        mediaType={mediaType}
        alt={item.name}
        className="w-7 h-7"
        iconClassName="w-3 h-3"
      />
    </div>
  )
}

export const MentionDropdown = forwardRef<HTMLDivElement, MentionDropdownProps>(
  ({ items, selectedIndex, query, onSelect, onHover, onVisibleCountChange }, ref) => {
    const innerRef = useRef<HTMLDivElement>(null)
    useImperativeHandle(ref, () => innerRef.current!)

    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
    const visibleItems = items.slice(0, visibleCount)
    const hasMore = visibleCount < items.length
    const groups = groupByType(visibleItems)
    let flatIndex = 0

    useEffect(() => {
      setVisibleCount(PAGE_SIZE)
    }, [items])

    useEffect(() => {
      onVisibleCountChange?.(visibleItems.length)
    }, [visibleItems.length, onVisibleCountChange])

    useEffect(() => {
      const selected = innerRef.current?.querySelector('[data-selected="true"]')
      if (selected) {
        selected.scrollIntoView({ block: 'nearest' })
      }
    }, [selectedIndex])

    const handleScroll = useCallback(() => {
      if (!innerRef.current || !hasMore) return
      const { scrollTop, scrollHeight, clientHeight } = innerRef.current
      if (scrollHeight - scrollTop - clientHeight < 80) {
        setVisibleCount(prev => Math.min(prev + PAGE_SIZE, items.length))
      }
    }, [hasMore, items.length])

    return (
      <div
        ref={innerRef}
        className="absolute z-50 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border bg-popover shadow-lg"
        onPointerDown={(e) => e.preventDefault()}
        onScroll={handleScroll}
      >
        {query && (
          <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-b sticky top-0 bg-popover z-10">
            搜索 "{query}" · {items.length} 个结果
          </div>
        )}

        {Object.entries(groups).map(([type, groupItems]) => {
          const config = MENTION_TYPE_CONFIG[type as MentionElementType]
          return (
            <div key={type}>
              <div className="px-3 py-1 text-[11px] font-medium text-muted-foreground bg-muted/30 sticky top-0 z-[5]">
                {config.label}
              </div>

              {groupItems.map((item) => {
                const idx = flatIndex++
                const isSelected = idx === selectedIndex
                return (
                  <div
                    key={item.id}
                    data-selected={isSelected}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm transition-colors',
                      isSelected
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-accent/50',
                    )}
                    onClick={() => onSelect(item)}
                    onMouseEnter={() => onHover(idx)}
                  >
                    <MentionItemThumbnail item={item} />
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium text-xs">{item.name}</div>
                      {item.description && (
                        <div className="truncate text-[10px] text-muted-foreground">{item.description}</div>
                      )}
                    </div>
                    <TypeIcon type={item.type as MentionElementType} className="opacity-40" />
                  </div>
                )
              })}
            </div>
          )
        })}

        {hasMore && (
          <div className="flex items-center justify-center gap-1 px-3 py-1.5 text-[11px] text-muted-foreground border-t bg-muted/20">
            <ChevronDown className="h-3 w-3" />
            滚动加载更多 ({items.length - visibleCount} 项)
          </div>
        )}

        {items.length === 0 && (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            未找到匹配的资产
          </div>
        )}
      </div>
    )
  }
)

MentionDropdown.displayName = 'MentionDropdown'
