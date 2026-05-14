import { memo } from 'react'
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyEnd,
  ArrowLeftRight,
  ArrowUpDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AlignDirection, DistributeDirection } from '../utils/nodeAlignment'

interface AlignmentToolbarProps {
  onAlign: (direction: AlignDirection) => void
  onDistribute: (direction: DistributeDirection) => void
  disabled?: boolean
}

export const AlignmentToolbar = memo(function AlignmentToolbar({
  onAlign,
  onDistribute,
  disabled = false,
}: AlignmentToolbarProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-sm backdrop-blur">
      <span className="text-xs text-muted-foreground px-1">对齐</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => onAlign('left')}
        disabled={disabled}
        title="左对齐"
      >
        <AlignLeft className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => onAlign('center')}
        disabled={disabled}
        title="水平居中"
      >
        <AlignCenter className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => onAlign('right')}
        disabled={disabled}
        title="右对齐"
      >
        <AlignRight className="h-3.5 w-3.5" />
      </Button>
      <div className="mx-1 h-4 w-px bg-border" />
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => onAlign('top')}
        disabled={disabled}
        title="顶部对齐"
      >
        <AlignVerticalJustifyStart className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => onAlign('middle')}
        disabled={disabled}
        title="垂直居中"
      >
        <AlignVerticalJustifyCenter className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => onAlign('bottom')}
        disabled={disabled}
        title="底部对齐"
      >
        <AlignVerticalJustifyEnd className="h-3.5 w-3.5" />
      </Button>
      <div className="mx-1 h-4 w-px bg-border" />
      <span className="text-xs text-muted-foreground px-1">分布</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => onDistribute('horizontal')}
        disabled={disabled}
        title="水平均分"
      >
        <ArrowLeftRight className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => onDistribute('vertical')}
        disabled={disabled}
        title="垂直均分"
      >
        <ArrowUpDown className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
})
