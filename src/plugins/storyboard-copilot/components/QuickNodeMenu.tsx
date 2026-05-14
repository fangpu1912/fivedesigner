import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Upload, Wand2, Image as ImageIcon, Grid3X3, Type, Camera,
  ZoomIn, Sparkles, LayoutGrid, Video, Pen, Search, Play,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import type { CanvasNodeType } from '../types'
import { CANVAS_NODE_TYPES } from '../types'
import { nodeCategories, nodeDefinitions } from '../utils'

const nodeIcons: Record<string, React.ReactNode> = {
  [CANVAS_NODE_TYPES.upload]: <Upload className="h-3.5 w-3.5" />,
  [CANVAS_NODE_TYPES.imageEdit]: <Wand2 className="h-3.5 w-3.5" />,
  [CANVAS_NODE_TYPES.aiImageEdit]: <Sparkles className="h-3.5 w-3.5" />,
  [CANVAS_NODE_TYPES.blankImage]: <ImageIcon className="h-3.5 w-3.5" />,
  [CANVAS_NODE_TYPES.storyboardSplit]: <Grid3X3 className="h-3.5 w-3.5" />,
  [CANVAS_NODE_TYPES.textAnnotation]: <Type className="h-3.5 w-3.5" />,
  [CANVAS_NODE_TYPES.sceneDirector]: <Camera className="h-3.5 w-3.5" />,
  [CANVAS_NODE_TYPES.upscale]: <ZoomIn className="h-3.5 w-3.5" />,
  [CANVAS_NODE_TYPES.videoGen]: <Video className="h-3.5 w-3.5" />,
}

interface QuickNodeMenuProps {
  x: number
  y: number
  sourceNodeId: string
  sourceHandleId: string | null
  onSelect: (type: CanvasNodeType) => void
  onClose: () => void
}

export function QuickNodeMenu({ x, y, onSelect, onClose }: QuickNodeMenuProps) {
  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(nodeCategories.map(c => c.id))
  )
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const filteredNodes = useMemo(() => {
    if (!search.trim()) return nodeDefinitions
    const q = search.toLowerCase()
    return nodeDefinitions.filter(
      def => def.label.toLowerCase().includes(q) || def.description.toLowerCase().includes(q) || def.type.toLowerCase().includes(q)
    )
  }, [search])

  const groupedNodes = useMemo(() => {
    const groups: Map<string, typeof nodeDefinitions> = new Map()
    for (const cat of nodeCategories) {
      const items = filteredNodes.filter(def => def.category === cat.id)
      if (items.length > 0) groups.set(cat.id, items)
    }
    return groups
  }, [filteredNodes])

  const flatItems = useMemo(() => {
    const items: Array<{ type: CanvasNodeType; label: string; description: string; category: string }> = []
    for (const [, defs] of groupedNodes) {
      for (const def of defs) {
        items.push({ type: def.type, label: def.label, description: def.description, category: def.category })
      }
    }
    return items
  }, [groupedNodes])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setSelectedIndex(0)
  }, [search])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, flatItems.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (flatItems[selectedIndex]) onSelect(flatItems[selectedIndex].type)
        return
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [flatItems, selectedIndex, onSelect, onClose])

  useEffect(() => {
    const selectedEl = listRef.current?.querySelector('[data-selected="true"]')
    selectedEl?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(categoryId)) next.delete(categoryId)
      else next.add(categoryId)
      return next
    })
  }

  const getCategoryColor = (catId: string) => {
    return nodeCategories.find(c => c.id === catId)?.color || '#888'
  }

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 1000,
  }

  return (
    <div ref={menuRef} style={menuStyle} className="nodrag nopan">
      <div
        className="w-56 max-h-[400px] rounded-lg border bg-background/95 shadow-xl backdrop-blur overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-1.5 border-b">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索节点..."
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto p-1.5">
          {Array.from(groupedNodes.entries()).map(([catId, defs]) => {
            const category = nodeCategories.find(c => c.id === catId)
            const color = getCategoryColor(catId)
            const isExpanded = expandedCategories.has(catId)
            return (
              <div key={catId} className="mb-1">
                <button
                  className="flex items-center gap-1.5 w-full px-1.5 py-1 rounded hover:bg-muted/50 transition-colors"
                  onClick={() => toggleCategory(catId)}
                >
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-[10px] font-semibold text-muted-foreground flex-1 text-left">
                    {category?.label || catId}
                  </span>
                  <span className="text-[9px] text-muted-foreground/60">
                    {isExpanded ? '▾' : '▸'}
                  </span>
                </button>

                {isExpanded && (
                  <div className="ml-1 space-y-0.5 mt-0.5">
                    {defs.map((def) => {
                      const globalIndex = flatItems.findIndex(f => f.type === def.type)
                      const isSelected = globalIndex === selectedIndex
                      return (
                        <button
                          key={def.type}
                          data-selected={isSelected}
                          className={cn(
                            'w-full flex items-center gap-2 px-2 py-1 rounded text-left transition-colors',
                            isSelected ? 'bg-primary/15 text-foreground' : 'text-foreground/80 hover:bg-muted/50'
                          )}
                          onClick={() => onSelect(def.type)}
                          onMouseEnter={() => setSelectedIndex(globalIndex)}
                          title={def.description}
                        >
                          <span className={cn('shrink-0', isSelected ? 'text-primary' : '')} style={!isSelected ? { color } : undefined}>
                            {nodeIcons[def.type] || <Play className="h-3.5 w-3.5" />}
                          </span>
                          <span className="text-xs truncate">{def.label}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
          {flatItems.length === 0 && (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">没有匹配的节点</div>
          )}
        </div>
      </div>
    </div>
  )
}
