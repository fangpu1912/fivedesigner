import { useState } from 'react'
import { X, Settings } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

import type { CanvasNode } from '../types'
import { getNodeDefinition } from '../utils'

interface PropertiesPanelProps {
  nodeId: string | null
  nodes: CanvasNode[]
  isOpen: boolean
  onToggle: () => void
}

export function PropertiesPanel({ nodeId, nodes, isOpen, onToggle }: PropertiesPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const node = nodeId ? nodes.find((n) => n.id === nodeId) : null
  const definition = node ? getNodeDefinition(node.type) : null

  if (!isOpen || !node || !definition) {
    return (
      <div
        className={cn(
          'flex flex-col rounded-lg border bg-background/95 shadow-sm backdrop-blur transition-all duration-200',
          isOpen ? 'w-96' : 'w-10'
        )}
      >
        <div className="flex items-center justify-between border-b px-2 py-1.5">
          {isOpen && <span className="text-xs font-medium">属性</span>}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onToggle}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>

        {isOpen && (
          <div className="flex h-32 items-center justify-center p-4 text-center">
            <span className="text-xs text-muted-foreground">
              选择节点查看属性
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg border bg-background/95 shadow-sm backdrop-blur transition-all duration-200',
        isExpanded ? 'w-96' : 'w-10'
      )}
    >
      <div className="flex items-center justify-between border-b px-2 py-1.5">
        {isExpanded && (
          <div className="flex items-center gap-1.5 overflow-hidden">
            <Settings className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate text-xs font-medium">{definition.label}</span>
          </div>
        )}
        <div className="flex items-center gap-0.5">
          {isExpanded && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onToggle}
              title="关闭"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? '折叠' : '展开'}
          >
            <span className="text-xs">{isExpanded ? '◀' : '▶'}</span>
          </Button>
        </div>
      </div>

      {isExpanded && (
        <ScrollArea className="h-[calc(100vh-280px)]">
          <div className="space-y-3 p-3">
            <p className="text-xs text-foreground/80">
              {definition.description}
            </p>

            <Separator />

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-foreground">基本信息</span>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-foreground/70">ID</span>
                  <span className="font-mono text-foreground">{node.id.slice(0, 8)}...</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground/70">类型</span>
                  <span className="text-foreground">{node.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground/70">位置</span>
                  <span className="text-foreground">
                    X: {Math.round(node.position.x)}, Y: {Math.round(node.position.y)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground/70">尺寸</span>
                  <span className="text-foreground">
                    W: {node.width || 'auto'}, H: {node.height || 'auto'}
                  </span>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-foreground">数据预览</span>
              <pre className="whitespace-pre-wrap break-all rounded bg-muted p-2 text-[10px] text-foreground">
                {JSON.stringify(node.data, null, 2)}
              </pre>
            </div>

            {definition.inputs && definition.inputs.length > 0 && (
              <>
                <Separator />
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-foreground">输入端口</span>
                  <div className="space-y-1">
                    {definition.inputs.map((input) => (
                      <div
                        key={input.id}
                        className="flex items-center justify-between rounded bg-muted px-2 py-1 text-xs"
                      >
                        <span className="text-foreground">{input.label}</span>
                        <span className="text-[10px] text-foreground/60">{input.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {definition.outputs && definition.outputs.length > 0 && (
              <>
                <Separator />
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-foreground">输出端口</span>
                  <div className="space-y-1">
                    {definition.outputs.map((output) => (
                      <div
                        key={output.id}
                        className="flex items-center justify-between rounded bg-muted px-2 py-1 text-xs"
                      >
                        <span className="text-foreground">{output.label}</span>
                        <span className="text-[10px] text-foreground/60">{output.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
