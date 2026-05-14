import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { getNodeDefinition } from '../utils'
import type { CanvasNode, CanvasNodeData } from '../types'

interface ComfyPropertiesPanelProps {
  selectedNodeId: string | null
  nodes: CanvasNode[]
  onUpdateNodeData: (nodeId: string, data: Partial<CanvasNodeData>) => void
}

export function ComfyPropertiesPanel({
  selectedNodeId,
  nodes,
  onUpdateNodeData,
}: ComfyPropertiesPanelProps) {
  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null
  const nodeDef = selectedNode ? getNodeDefinition(selectedNode.type) : null

  if (!selectedNode || !nodeDef) {
    return (
      <div className="absolute right-4 top-4 w-64 bg-card border rounded-lg shadow-lg p-4">
        <p className="text-sm text-muted-foreground text-center">
          选择一个节点查看属性
        </p>
      </div>
    )
  }

  const handleChange = (key: string, value: unknown) => {
    onUpdateNodeData(selectedNode.id, { [key]: value })
  }

  return (
    <div
      className={cn(
        'absolute left-4 top-4 w-72 bg-card border rounded-lg shadow-lg overflow-hidden transition-all duration-200',
        selectedNodeId ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none'
      )}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
        <div>
          <h4 className="text-sm font-medium">{nodeDef.label}</h4>
          <p className="text-[10px] text-muted-foreground">{nodeDef.description}</p>
        </div>
      </div>

      {/* 属性列表 */}
      <ScrollArea className="max-h-[calc(100vh-200px)]">
        <div className="p-3 space-y-4">
          {/* 动态渲染属性 */}
          {Object.entries(nodeDef.defaultProperties).map(([key, defaultValue]) => {
            const value = (selectedNode.data as Record<string, unknown>)[key] ?? defaultValue

            // 跳过特定字段
            if (['imageUrl', 'previewImageUrl', 'isGenerating', 'generationStartedAt', 'generationDurationMs', 'generationError'].includes(key)) {
              return null
            }

            // 字符串类型
            if (typeof defaultValue === 'string') {
              // 长文本使用 textarea
              if (key === 'prompt' || key === 'description' || key === 'note') {
                return (
                  <div key={key} className="space-y-1.5">
                    <Label className="text-xs">{getPropertyLabel(key)}</Label>
                    <Textarea
                      value={value as string}
                      onChange={(e) => handleChange(key, e.target.value)}
                      className="min-h-[80px] text-xs resize-none"
                      placeholder={`输入${getPropertyLabel(key)}...`}
                    />
                  </div>
                )
              }
              return (
                <div key={key} className="space-y-1.5">
                  <Label className="text-xs">{getPropertyLabel(key)}</Label>
                  <Input
                    value={value as string}
                    onChange={(e) => handleChange(key, e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              )
            }

            // 数字类型
            if (typeof defaultValue === 'number') {
              // 特定范围值使用 slider
              if (key === 'brushSize' || key === 'gridRows' || key === 'gridCols') {
                const min = key === 'brushSize' ? 5 : 1
                const max = key === 'brushSize' ? 100 : 10
                return (
                  <div key={key} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">{getPropertyLabel(key)}</Label>
                      <span className="text-[10px] text-muted-foreground">{String(value)}</span>
                    </div>
                    <Slider
                      value={[value as number]}
                      onValueChange={([v]) => handleChange(key, v)}
                      min={min}
                      max={max}
                      step={1}
                    />
                  </div>
                )
              }
              return (
                <div key={key} className="space-y-1.5">
                  <Label className="text-xs">{getPropertyLabel(key)}</Label>
                  <Input
                    type="number"
                    value={value as number}
                    onChange={(e) => handleChange(key, Number(e.target.value))}
                    className="h-8 text-xs"
                  />
                </div>
              )
            }

            // 布尔类型
            if (typeof defaultValue === 'boolean') {
              return (
                <div key={key} className="flex items-center justify-between">
                  <Label className="text-xs">{getPropertyLabel(key)}</Label>
                  <input
                    type="checkbox"
                    checked={value as boolean}
                    onChange={(e) => handleChange(key, e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                </div>
              )
            }

            // 数组类型（如参考图）
            if (Array.isArray(defaultValue)) {
              return (
                <div key={key} className="space-y-1.5">
                  <Label className="text-xs">{getPropertyLabel(key)}</Label>
                  <div className="text-[10px] text-muted-foreground">
                    {(value as unknown[]).length} 项
                  </div>
                </div>
              )
            }

            return null
          })}
        </div>
      </ScrollArea>
    </div>
  )
}

// 获取属性显示标签
function getPropertyLabel(key: string): string {
  const labels: Record<string, string> = {
    prompt: '提示词',
    model: '模型',
    aspectRatio: '宽高比',
    brushSize: '画笔大小',
    gridRows: '行数',
    gridCols: '列数',
    referenceImages: '参考图',
    maskImage: '蒙版图',
    description: '描述',
    note: '备注',
    sourceFileName: '文件名',
  }
  return labels[key] || key
}
