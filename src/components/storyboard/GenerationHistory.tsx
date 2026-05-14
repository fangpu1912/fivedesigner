import { useEffect, useMemo, useState } from 'react'

import { Download, History, Image as ImageIcon, Star, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { getImageUrl } from '@/utils/asset'

export interface GenerationHistoryItem {
  id: string
  imageUrl: string
  prompt: string
  negativePrompt?: string
  timestamp: number
  params?: {
    width?: number
    height?: number
    steps?: number
    cfgScale?: number
    seed?: number
    model?: string
    provider?: string
  }
  isFavorite?: boolean
}

interface GenerationHistoryProps {
  history: GenerationHistoryItem[]
  currentImage?: string | null
  onSelect: (item: GenerationHistoryItem) => void
  onDelete: (id: string) => void
  onToggleFavorite?: (id: string) => void
  onExport?: (item: GenerationHistoryItem) => void
  onClearAll?: () => void
}

export function GenerationHistory({
  history,
  currentImage,
  onSelect,
  onDelete,
  onToggleFavorite,
  onExport,
  onClearAll,
}: GenerationHistoryProps) {
  const [filter, setFilter] = useState<'all' | 'favorites'>('all')

  const filteredHistory = useMemo(() => {
    return history
      .filter(item => filter === 'all' || item.isFavorite)
      .sort((a, b) => b.timestamp - a.timestamp)
  }, [filter, history])

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <History className="mb-2 h-12 w-12" />
        <p>No generation history yet.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b p-2">
        <div className="flex items-center gap-2">
          <Button
            variant={filter === 'all' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            All ({history.length})
          </Button>
          <Button
            variant={filter === 'favorites' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setFilter('favorites')}
          >
            Favorites ({history.filter(item => item.isFavorite).length})
          </Button>
        </div>
        {onClearAll ? (
          <Button variant="ghost" size="sm" onClick={onClearAll}>
            <Trash2 className="mr-1 h-3 w-3" />
            Clear
          </Button>
        ) : null}
      </div>

      <ScrollArea className="flex-1">
        <div className="grid grid-cols-2 gap-2 p-2">
          {filteredHistory.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className={cn(
                'group relative overflow-hidden rounded-lg border text-left transition-colors',
                currentImage === item.imageUrl && 'ring-2 ring-primary'
              )}
            >
              <div className="aspect-square bg-muted">
                {item.imageUrl ? (
                  <img
                    src={getImageUrl(item.imageUrl) ?? undefined}
                    alt={item.prompt}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
              </div>

              <div className="space-y-1 p-2">
                <div className="text-xs text-muted-foreground">
                  {new Date(item.timestamp).toLocaleString()}
                </div>
                <div className="truncate text-xs font-medium">{item.prompt || 'Untitled'}</div>
              </div>

              <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {onToggleFavorite ? (
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-6 w-6"
                    onClick={event => {
                      event.stopPropagation()
                      onToggleFavorite(item.id)
                    }}
                  >
                    <Star
                      className={cn(
                        'h-3 w-3',
                        item.isFavorite && 'fill-yellow-400 text-yellow-400'
                      )}
                    />
                  </Button>
                ) : null}
                {onExport ? (
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-6 w-6"
                    onClick={event => {
                      event.stopPropagation()
                      onExport(item)
                    }}
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-6 w-6"
                  onClick={event => {
                    event.stopPropagation()
                    onDelete(item.id)
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

export function useGenerationHistory(itemId: string, type: string) {
  const [history, setHistory] = useState<GenerationHistoryItem[]>([])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`history_${type}_${itemId}`)
      setHistory(stored ? JSON.parse(stored) : [])
    } catch {
      setHistory([])
    }
  }, [itemId, type])

  const saveHistory = async (nextHistory: GenerationHistoryItem[]) => {
    setHistory(nextHistory)
    localStorage.setItem(`history_${type}_${itemId}`, JSON.stringify(nextHistory))
  }

  const addHistoryItem = async (item: Omit<GenerationHistoryItem, 'id' | 'timestamp'>) => {
    const nextItem: GenerationHistoryItem = {
      ...item,
      id: `history_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    }
    await saveHistory([nextItem, ...history].slice(0, 50))
    return nextItem
  }

  const removeHistoryItem = async (id: string) => {
    await saveHistory(history.filter(item => item.id !== id))
  }

  const clearHistory = async () => {
    await saveHistory([])
  }

  const toggleFavorite = async (id: string) => {
    await saveHistory(
      history.map(item => (item.id === id ? { ...item, isFavorite: !item.isFavorite } : item))
    )
  }

  return {
    history,
    addHistoryItem,
    removeHistoryItem,
    clearHistory,
    toggleFavorite,
    setHistory: saveHistory,
  }
}

export default GenerationHistory
