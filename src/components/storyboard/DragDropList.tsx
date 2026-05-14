import React, { useState, useRef, useCallback } from 'react'

import { GripVertical, ChevronUp, ChevronDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface DragItem {
  id: string
  [key: string]: any
}

interface DragDropListProps<T extends DragItem> {
  items: T[]
  onReorder: (items: T[]) => void
  renderItem: (item: T, index: number, isDragging: boolean) => React.ReactNode
  keyExtractor: (item: T) => string
  className?: string
  itemClassName?: string
}

export function DragDropList<T extends DragItem>({
  items,
  onReorder,
  renderItem,
  keyExtractor,
  className,
  itemClassName,
}: DragDropListProps<T>) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const dragNodeRef = useRef<HTMLDivElement | null>(null)

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    dragNodeRef.current = e.target as HTMLDivElement
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index.toString())
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    setOverIndex(null)
    dragNodeRef.current = null
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

    if (draggedIndex === null || draggedIndex === index) return

    setOverIndex(index)
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()

    if (draggedIndex === null || draggedIndex === dropIndex) return

    const newItems = [...items]
    const [draggedItem] = newItems.splice(draggedIndex, 1)
    newItems.splice(dropIndex, 0, draggedItem!)

    onReorder(newItems)
    setDraggedIndex(null)
    setOverIndex(null)
  }

  const moveItem = (fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1
    if (toIndex < 0 || toIndex >= items.length) return

    const newItems = [...items]
    const [item] = newItems.splice(fromIndex, 1)
    newItems.splice(toIndex, 0, item!)
    onReorder(newItems)
  }

  return (
    <div className={className}>
      {items.map((item, index) => {
        const isDragging = draggedIndex === index
        const isOver = overIndex === index

        return (
          <div
            key={keyExtractor(item)}
            draggable
            onDragStart={e => handleDragStart(e, index)}
            onDragEnd={handleDragEnd}
            onDragOver={e => handleDragOver(e, index)}
            onDrop={e => handleDrop(e, index)}
            className={cn(
              'relative transition-all',
              itemClassName,
              isDragging && 'opacity-50',
              isOver && draggedIndex !== null && draggedIndex < index && 'translate-y-2',
              isOver && draggedIndex !== null && draggedIndex > index && '-translate-y-2'
            )}
          >
            {/* 拖拽指示器 */}
            {isOver && draggedIndex !== null && (
              <div
                className={cn(
                  'absolute left-0 right-0 h-0.5 bg-primary',
                  draggedIndex < index ? 'bottom-0' : 'top-0'
                )}
              />
            )}

            <div className="flex items-center gap-1">
              {/* 拖拽手柄 */}
              <div className="flex flex-col items-center">
                <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                <div className="flex flex-col">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4"
                    onClick={() => moveItem(index, 'up')}
                    disabled={index === 0}
                  >
                    <ChevronUp className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4"
                    onClick={() => moveItem(index, 'down')}
                    disabled={index === items.length - 1}
                  >
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              {/* 内容 */}
              <div className="flex-1">{renderItem(item, index, isDragging)}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// 简化版拖拽排序 Hook
export function useDragReorder<T extends { id: string }>(
  items: T[],
  onReorder: (items: T[]) => void
) {
  const [draggedId, setDraggedId] = useState<string | null>(null)

  const handleDragStart = useCallback((id: string) => {
    setDraggedId(id)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggedId(null)
  }, [])

  const handleDrop = useCallback(
    (targetId: string) => {
      if (!draggedId || draggedId === targetId) return

      const draggedIndex = items.findIndex(item => item.id === draggedId)
      const targetIndex = items.findIndex(item => item.id === targetId)

      if (draggedIndex === -1 || targetIndex === -1) return

      const newItems = [...items]
      const [draggedItem] = newItems.splice(draggedIndex, 1)
      newItems.splice(targetIndex, 0, draggedItem!)

      onReorder(newItems)
      setDraggedId(null)
    },
    [items, draggedId, onReorder]
  )

  const moveUp = useCallback(
    (id: string) => {
      const index = items.findIndex(item => item.id === id)
      if (index <= 0) return

      const newItems = [...items]
      const [item] = newItems.splice(index, 1)
      newItems.splice(index - 1, 0, item!)
      onReorder(newItems)
    },
    [items, onReorder]
  )

  const moveDown = useCallback(
    (id: string) => {
      const index = items.findIndex(item => item.id === id)
      if (index === -1 || index >= items.length - 1) return

      const newItems = [...items]
      const [item] = newItems.splice(index, 1)
      newItems.splice(index + 1, 0, item!)
      onReorder(newItems)
    },
    [items, onReorder]
  )

  return {
    draggedId,
    handleDragStart,
    handleDragEnd,
    handleDrop,
    moveUp,
    moveDown,
  }
}
