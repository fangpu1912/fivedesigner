import React, { useCallback } from 'react'

import { Check, Image as ImageIcon } from 'lucide-react'

import { ClickableImage } from '@/components/media/ClickableImage'
import { cn } from '@/lib/utils'
import type { Storyboard } from '@/types'
import { getImageUrl } from '@/utils/asset'

interface StoryboardGridProps {
  storyboards: Storyboard[]
  selectedIds?: string[]
  onSelect?: (ids: string[]) => void
  onReorder?: (storyboards: Storyboard[]) => void
  renderItem?: (storyboard: Storyboard) => React.ReactNode
}

export function StoryboardGrid({
  storyboards,
  selectedIds = [],
  onSelect,
  renderItem: _renderItem,
}: StoryboardGridProps) {
  const handleSelect = useCallback(
    (id: string) => {
      if (!onSelect) return

      const newSelectedIds = selectedIds.includes(id)
        ? selectedIds.filter(selectedId => selectedId !== id)
        : [...selectedIds, id]

      onSelect(newSelectedIds)
    },
    [selectedIds, onSelect]
  )

  const handleSelectAll = () => {
    if (!onSelect) return
    const allIds = storyboards.map(s => s.id)
    onSelect(selectedIds.length === allIds.length ? [] : allIds)
  }

  if (storyboards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-lg">暂无分镜</p>
        <p className="text-sm mt-1">点击上方按钮添加新分镜</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-muted-foreground">
          共 {storyboards.length} 个分镜
          {selectedIds.length > 0 && ` · 已选择 ${selectedIds.length} 个`}
        </div>
        {onSelect && (
          <button onClick={handleSelectAll} className="text-sm text-primary hover:underline">
            {selectedIds.length === storyboards.length ? '取消全选' : '全选'}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {storyboards.map(storyboard => (
          <div
            key={storyboard.id}
            onClick={() => handleSelect(storyboard.id)}
            className={cn(
              'flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-all',
              selectedIds.includes(storyboard.id)
                ? 'border-primary bg-primary/5'
                : 'border-transparent hover:bg-muted'
            )}
          >
            <div
              className={cn(
                'w-16 h-12 rounded overflow-hidden flex-shrink-0 bg-muted flex items-center justify-center'
              )}
              onClick={e => e.stopPropagation()}
            >
              {getImageUrl(storyboard.image) ? (
                <ClickableImage
                  src={getImageUrl(storyboard.image)}
                  alt={storyboard.name}
                  title={storyboard.name}
                  aspectRatio="auto"
                  className="w-full h-full"
                  showHoverEffect={false}
                />
              ) : (
                <ImageIcon className="w-6 h-6 text-muted-foreground" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{storyboard.name}</p>
              {storyboard.description && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {storyboard.description}
                </p>
              )}
            </div>

            <div className="flex-shrink-0">
              <div
                className={cn(
                  'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
                  selectedIds.includes(storyboard.id)
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted-foreground/30'
                )}
              >
                {selectedIds.includes(storyboard.id) && <Check className="w-3 h-3" />}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
