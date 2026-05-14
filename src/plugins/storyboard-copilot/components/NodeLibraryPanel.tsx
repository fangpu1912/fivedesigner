import { useState } from 'react'
import {
  Upload,
  Wand2,
  Image as ImageIcon,
  Grid3X3,
  Type,
  Camera,
  ZoomIn,
  Sparkles,
  LayoutGrid,
  Mic,
  Video,
  Pen,
  Lightbulb,
  View,
  Box,
  SplitSquareHorizontal,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

import type { CanvasNodeType } from '../types'
import { CANVAS_NODE_TYPES } from '../types'
import { nodeCategories, getNodeDefinition } from '../utils'

interface NodeLibraryPanelProps {
  onAddNode: (type: CanvasNodeType) => void
}

const nodeIcons: Record<CanvasNodeType, React.ReactNode> = {
  [CANVAS_NODE_TYPES.upload]: <Upload className="h-3.5 w-3.5" />,
  [CANVAS_NODE_TYPES.imageEdit]: <Wand2 className="h-3.5 w-3.5" />,
  [CANVAS_NODE_TYPES.aiImageEdit]: <Sparkles className="h-3.5 w-3.5" />,
  [CANVAS_NODE_TYPES.blankImage]: <ImageIcon className="h-3.5 w-3.5" />,
  [CANVAS_NODE_TYPES.storyboardSplit]: <Grid3X3 className="h-3.5 w-3.5" />,
  [CANVAS_NODE_TYPES.textAnnotation]: <Type className="h-3.5 w-3.5" />,
  [CANVAS_NODE_TYPES.sceneDirector]: <Camera className="h-3.5 w-3.5" />,
  [CANVAS_NODE_TYPES.upscale]: <ZoomIn className="h-3.5 w-3.5" />,
  [CANVAS_NODE_TYPES.videoGen]: <Video className="h-3.5 w-3.5" />,
  [CANVAS_NODE_TYPES.videoUpload]: <Video className="h-3.5 w-3.5" />,
  [CANVAS_NODE_TYPES.audioUpload]: <Mic className="h-3.5 w-3.5" />,
  [CANVAS_NODE_TYPES.imageToPrompt]: <Lightbulb className="h-3.5 w-3.5" />,
  [CANVAS_NODE_TYPES.imageCompare]: <SplitSquareHorizontal className="h-3.5 w-3.5" />,
}

const _categoryIcons: Record<string, React.ReactNode> = {
  input: <Upload className="h-3 w-3" />,
  generate: <ImageIcon className="h-3 w-3" />,
  video: <Video className="h-3 w-3" />,
  storyboard: <Grid3X3 className="h-3 w-3" />,
  layout: <LayoutGrid className="h-3 w-3" />,
}

export function NodeLibraryPanel({ onAddNode }: NodeLibraryPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(nodeCategories.map(c => c.id))
  )

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  const nodesByCategory = nodeCategories
    .map((category) => ({
      ...category,
      nodes: Object.values(CANVAS_NODE_TYPES)
        .map((type) => getNodeDefinition(type))
        .filter((def): def is NonNullable<typeof def> => def?.category === category.id),
    }))
    .filter((group) => group.nodes.length > 0)

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg border bg-background/95 shadow-sm backdrop-blur transition-all duration-200',
        isExpanded ? 'w-52' : 'w-10'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-2 py-1.5">
        {isExpanded && <span className="text-xs font-medium">节点库</span>}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <span className="text-xs">{isExpanded ? '◀' : '▶'}</span>
        </Button>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="overflow-y-auto max-h-[calc(100vh-200px)] p-1.5">
          {nodesByCategory.map((category) => {
            const isCategoryExpanded = expandedCategories.has(category.id)
            return (
              <div key={category.id} className="mb-1">
                {/* Category Header */}
                <button
                  className="flex items-center gap-1.5 w-full px-1.5 py-1 rounded hover:bg-muted/50 transition-colors"
                  onClick={() => toggleCategory(category.id)}
                >
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: category.color }}
                  />
                  <span className="text-[10px] font-semibold text-muted-foreground flex-1 text-left">
                    {category.label}
                  </span>
                  <span className="text-[9px] text-muted-foreground/60">
                    {isCategoryExpanded ? '▾' : '▸'}
                  </span>
                </button>

                {/* Category Nodes */}
                {isCategoryExpanded && (
                  <div className="ml-1 space-y-0.5 mt-0.5">
                    {category.nodes.map((node) => (
                      <Button
                        key={node.type}
                        variant="ghost"
                        size="sm"
                        className="h-7 w-full justify-start gap-2 px-2 text-xs hover:bg-muted"
                        onClick={() => onAddNode(node.type)}
                        title={node.description}
                      >
                        <span style={{ color: category.color }}>
                          {nodeIcons[node.type]}
                        </span>
                        <span className="truncate">{node.label}</span>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
