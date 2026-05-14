import { memo, useCallback, useEffect, useState } from 'react'
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react'
import { Image as ImageIcon, Plus, Minus, Download } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/useToast'

import type { BlankImageNodeData, ImageSize } from '../../types'
import { IMAGE_SIZES, IMAGE_ASPECT_RATIOS } from '../../types'
import {
  getNodeContainerClass,
  getTargetHandleClass,
  getSourceHandleClass,
  NODE_HEADER_FLOATING_CLASS,
  NODE_HEADER_CLASSES,
  NODE_CONTENT_CLASSES,
  NODE_WIDTH,
} from './NodeStyles'
import { useEnlargedHandles } from '../../hooks/useEnlargedHandles'

interface BlankImageNodeProps extends NodeProps {
  data: BlankImageNodeData
}

const ASPECT_RATIO_SIZES: Record<string, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '16:9': { width: 1024, height: 576 },
  '9:16': { width: 576, height: 1024 },
  '4:3': { width: 1024, height: 768 },
  '3:4': { width: 768, height: 1024 },
  '21:9': { width: 1024, height: 438 },
}

function calculateSize(baseSize: { width: number; height: number }, size: ImageSize): { width: number; height: number } {
  const multiplier = {
    '1K': 1,
    '2K': 2,
    '4K': 4,
  }[size] || 1

  return {
    width: Math.round(baseSize.width * multiplier),
    height: Math.round(baseSize.height * multiplier),
  }
}

export const BlankImageNode = memo(({ id, data, selected }: BlankImageNodeProps) => {
  const { updateNodeData } = useReactFlow()
  const { toast } = useToast()

  const [rows, setRows] = useState(data.gridRows || 2)
  const [cols, setCols] = useState(data.gridCols || 2)
  const [aspectRatio, setAspectRatio] = useState(data.aspectRatio || '16:9')
  const [size, setSize] = useState<ImageSize>(data.size || '1K')
  const [isGenerating, setIsGenerating] = useState(false)
  const enlargedHandles = useEnlargedHandles(id)

  // 同步节点数据
  useEffect(() => {
    data.gridRows = rows
    data.gridCols = cols
    data.aspectRatio = aspectRatio
    data.size = size
  }, [rows, cols, aspectRatio, size, data])

  // 调整行数
  const handleRowChange = useCallback((delta: number) => {
    const newRows = Math.max(1, Math.min(9, rows + delta))
    setRows(newRows)
  }, [rows])

  // 调整列数
  const handleColChange = useCallback((delta: number) => {
    const newCols = Math.max(1, Math.min(9, cols + delta))
    setCols(newCols)
  }, [cols])

  // 生成白图
  const handleGenerate = useCallback(async () => {
    setIsGenerating(true)
    try {
      const baseSize = ASPECT_RATIO_SIZES[aspectRatio] ?? { width: 1024, height: 576 }
      const actualSize = calculateSize(baseSize, size)

      // 创建 Canvas 生成白图
      const canvas = document.createElement('canvas')
      canvas.width = actualSize.width
      canvas.height = actualSize.height
      const ctx = canvas.getContext('2d')
      
      if (!ctx) {
        throw new Error('无法创建 canvas 上下文')
      }

      // 填充白色背景
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // 绘制宫格线（可选，用于预览）
      const cellWidth = canvas.width / cols
      const cellHeight = canvas.height / rows
      
      ctx.strokeStyle = '#E5E7EB'
      ctx.lineWidth = 2
      
      // 绘制垂直线
      for (let i = 1; i < cols; i++) {
        ctx.beginPath()
        ctx.moveTo(i * cellWidth, 0)
        ctx.lineTo(i * cellWidth, canvas.height)
        ctx.stroke()
      }
      
      // 绘制水平线
      for (let i = 1; i < rows; i++) {
        ctx.beginPath()
        ctx.moveTo(0, i * cellHeight)
        ctx.lineTo(canvas.width, i * cellHeight)
        ctx.stroke()
      }

      // 转换为 Data URL
      const dataUrl = canvas.toDataURL('image/png')
      
      updateNodeData(id, {
        imageUrl: dataUrl,
        previewImageUrl: dataUrl,
        width: actualSize.width,
        height: actualSize.height,
      })

      toast({ title: '白图生成完成', description: `${actualSize.width}×${actualSize.height}` })
    } catch (error) {
      console.error('生成白图失败:', error)
      toast({ title: '生成失败', description: String(error), variant: 'destructive' })
    } finally {
      setIsGenerating(false)
    }
  }, [rows, cols, aspectRatio, size, id, updateNodeData, toast])

  const imageUrl = data.imageUrl
  const gridLabel = `${rows}×${cols}`

  return (
    <div
      className={getNodeContainerClass(!!selected, 'flex h-full flex-col')}
      style={{ width: NODE_WIDTH.MEDIUM }}
    >
      <Handle type="target" id="target" position={Position.Left} className={getTargetHandleClass(undefined, enlargedHandles.target)} />
      <Handle type="source" id="source" position={Position.Right} className={getSourceHandleClass(undefined, enlargedHandles.source)} />

      <div className={NODE_HEADER_FLOATING_CLASS}>
        <div className={NODE_HEADER_CLASSES.container}>
          <div className={NODE_HEADER_CLASSES.title}>
            <ImageIcon className={NODE_HEADER_CLASSES.icon} />
            <span>空白图</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); handleRowChange(-1) }}
              disabled={rows <= 1}
            >
              <Minus className="h-2.5 w-2.5" />
            </button>
            <span className="text-[9px] font-semibold text-foreground">{rows}</span>
            <button
              type="button"
              className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); handleRowChange(1) }}
              disabled={rows >= 9}
            >
              <Plus className="h-2.5 w-2.5" />
            </button>
            <button
              type="button"
              className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); handleColChange(-1) }}
              disabled={cols <= 1}
            >
              <Minus className="h-2.5 w-2.5" />
            </button>
            <span className="text-[9px] font-semibold text-foreground">{cols}</span>
            <button
              type="button"
              className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); handleColChange(1) }}
              disabled={cols >= 9}
            >
              <Plus className="h-2.5 w-2.5" />
            </button>
            <span className="text-[9px] text-muted-foreground ml-1">{gridLabel}</span>
          </div>
        </div>
      </div>

      <div className={`${NODE_CONTENT_CLASSES.container} flex-1 overflow-hidden flex flex-col`}>
        {/* 预览区域 */}
        <div className="flex-1 min-h-0 bg-muted/30 rounded border border-border/50 flex items-center justify-center mb-2">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="空白图预览"
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <div className="text-center text-muted-foreground">
              <ImageIcon className="h-8 w-8 mx-auto mb-1 opacity-30" />
              <span className="text-[10px]">点击生成白图</span>
            </div>
          )}
        </div>

        {/* 参数设置 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label className="w-10 shrink-0 text-[11px]">比例</Label>
            <Select value={aspectRatio} onValueChange={setAspectRatio}>
              <SelectTrigger className="h-7 flex-1 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IMAGE_ASPECT_RATIOS.map((r) => (
                  <SelectItem key={r} value={r} className="text-[11px]">
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Label className="w-10 shrink-0 text-[11px]">尺寸</Label>
            <Select value={size} onValueChange={(v) => setSize(v as ImageSize)}>
              <SelectTrigger className="h-7 flex-1 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IMAGE_SIZES.map((s) => (
                  <SelectItem key={s} value={s} className="text-[11px]">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            className="w-full h-7 text-[11px]"
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <span className="animate-spin mr-1">⏳</span>
                生成中...
              </>
            ) : (
              <>
                <Download className="h-3 w-3 mr-1" />
                生成白图
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
})

BlankImageNode.displayName = 'BlankImageNode'
