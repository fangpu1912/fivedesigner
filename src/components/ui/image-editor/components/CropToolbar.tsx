import { RotateCcw, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CropArea } from '../types'

interface CropToolbarProps {
  cropAspectRatio: number | null
  cropArea: CropArea | null
  onAspectRatioChange: (ratio: number | null) => void
  onReset: () => void
  onApply: () => void
}

const aspectRatios = [
  { label: '自由', value: null },
  { label: '1:1', value: 1 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:2', value: 3 / 2 },
  { label: '2:3', value: 2 / 3 },
]

export function CropToolbar({
  cropAspectRatio,
  cropArea,
  onAspectRatioChange,
  onReset,
  onApply,
}: CropToolbarProps) {
  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 bg-background/95 backdrop-blur-sm rounded-xl px-4 py-3 shadow-xl border min-w-[400px]">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium whitespace-nowrap">比例:</span>
        <div className="flex items-center gap-1 flex-wrap">
          {aspectRatios.map(({ label, value }) => (
            <Button
              key={label}
              variant={cropAspectRatio === value ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => onAspectRatioChange(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      
      {cropArea && (
        <div className="flex items-center justify-center gap-2 pt-2 border-t">
          <div className="text-xs text-muted-foreground mr-2">
            {Math.round(cropArea.width)} × {Math.round(cropArea.height)}
          </div>
          <Button variant="ghost" size="sm" className="h-7" onClick={onReset}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            重置
          </Button>
          <Button variant="default" size="sm" className="h-7" onClick={onApply}>
            <Check className="h-3.5 w-3.5 mr-1" />
            应用裁剪
          </Button>
        </div>
      )}
    </div>
  )
}
