import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import type { ImageResolution } from '../hooks/useImageEditor'

interface SplitToolbarProps {
  splitRows: number
  splitCols: number
  splitLineWidth: number
  imageResolution: ImageResolution | null
  isSplitting: boolean
  onRowsChange: (rows: number) => void
  onColsChange: (cols: number) => void
  onLineWidthChange: (width: number) => void
  onReset: () => void
  onApply: () => void
}

export function SplitToolbar({
  splitRows,
  splitCols,
  splitLineWidth,
  imageResolution,
  isSplitting,
  onRowsChange,
  onColsChange,
  onLineWidthChange,
  onReset,
  onApply,
}: SplitToolbarProps) {
  const maxLineWidth = Math.min(imageResolution?.width || 100, imageResolution?.height || 100) / 10

  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-3 bg-background/95 backdrop-blur-sm rounded-xl px-4 py-3 shadow-xl border min-w-[320px]">
      {/* 行数设置 */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">行数</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => onRowsChange(Math.max(1, splitRows - 1))}
            disabled={splitRows <= 1}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <span className="w-8 text-center text-sm font-medium">{splitRows}</span>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => onRowsChange(Math.min(10, splitRows + 1))}
            disabled={splitRows >= 10}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* 列数设置 */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">列数</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => onColsChange(Math.max(1, splitCols - 1))}
            disabled={splitCols <= 1}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <span className="w-8 text-center text-sm font-medium">{splitCols}</span>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => onColsChange(Math.min(10, splitCols + 1))}
            disabled={splitCols >= 10}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* 分割线宽度 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">分割线宽度</span>
          <span className="text-xs text-muted-foreground">{splitLineWidth.toFixed(1)}px</span>
        </div>
        <Slider
          value={[splitLineWidth]}
          onValueChange={(v) => onLineWidthChange(v[0] ?? 0.5)}
          min={0}
          max={maxLineWidth}
          step={0.5}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">
          红色区域为切割时会丢弃的分割线像素
        </p>
      </div>

      {/* 输出信息 */}
      <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
        <span>输出 {splitRows * splitCols} 张小图</span>
        {imageResolution && (
          <span>
            单张: {Math.floor((imageResolution.width - (splitCols - 1) * splitLineWidth) / splitCols)} ×
            {Math.floor((imageResolution.height - (splitRows - 1) * splitLineWidth) / splitRows)}
          </span>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onReset}>
          重置
        </Button>
        <Button variant="default" size="sm" onClick={onApply} disabled={isSplitting}>
          {isSplitting ? (
            <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-1" />
          ) : null}
          应用切割
        </Button>
      </div>
    </div>
  )
}
