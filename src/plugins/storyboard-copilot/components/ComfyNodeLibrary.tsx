import { useState, useMemo } from 'react'
import { Search, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { nodeCategories, nodeDefinitions } from '../utils'
import type { CanvasNodeType } from '../types'

interface ComfyNodeLibraryProps {
  onAddNode: (type: CanvasNodeType, position?: { x: number; y: number }) => void
}

export function ComfyNodeLibrary({ onAddNode }: ComfyNodeLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set(nodeCategories.map((c) => c.id))
  )

  // 按类别分组节点
  const groupedNodes = useMemo(() => {
    const groups = nodeCategories.map((category) => ({
      ...category,
      nodes: nodeDefinitions.filter(
        (def) =>
          def.category === category.id &&
          (def.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
            def.description.toLowerCase().includes(searchQuery.toLowerCase()))
      ),
    }))
    return groups.filter((g) => g.nodes.length > 0)
  }, [searchQuery])

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  const handleDragStart = (e: React.DragEvent, type: CanvasNodeType) => {
    e.dataTransfer.setData('application/reactflow', type)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="flex flex-col h-full w-64 bg-card border-r">
      {/* 头部 */}
      <div className="p-3 border-b">
        <h3 className="text-sm font-semibold mb-2">节点库</h3>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="搜索节点..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-7 text-xs"
          />
        </div>
      </div>

      {/* 节点列表 */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {groupedNodes.map((category) => (
            <div key={category.id} className="rounded-md overflow-hidden">
              {/* 类别标题 */}
              <button
                onClick={() => toggleCategory(category.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
              >
                {expandedCategories.has(category.id) ? (
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                )}
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: category.color }}
                />
                <span>{category.label}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {category.nodes.length}
                </span>
              </button>

              {/* 节点列表 */}
              {expandedCategories.has(category.id) && (
                <div className="pl-6 pr-1 py-1 space-y-0.5">
                  {category.nodes.map((node) => (
                    <div
                      key={node.type}
                      draggable
                      onDragStart={(e) => handleDragStart(e, node.type)}
                      onClick={() => onAddNode(node.type)}
                      className={cn(
                        'group flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer',
                        'hover:bg-muted transition-colors border-l-2 border-transparent',
                        'hover:border-l-current'
                      )}
                      style={{ '--tw-border-opacity': 1, color: category.color } as React.CSSProperties}
                      title={node.description}
                    >
                      <span className="truncate flex-1">{node.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* 底部提示 */}
      <div className="p-2 border-t text-[10px] text-muted-foreground text-center">
        拖拽节点到画布，或点击添加
      </div>
    </div>
  )
}
