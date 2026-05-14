import { Type, ArrowRight, Square, Circle, MousePointer2, RotateCcw, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { AnnotationType } from '../types'

interface AnnotationToolbarProps {
  annotationType: AnnotationType
  annotationColor: string
  onAnnotationTypeChange: (type: AnnotationType) => void
  onAnnotationColorChange: (color: string) => void
  onClearAnnotations: () => void
  onSaveAnnotations: () => void
}

const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#000000']

export function AnnotationToolbar({
  annotationType,
  annotationColor,
  onAnnotationTypeChange,
  onAnnotationColorChange,
  onClearAnnotations,
  onSaveAnnotations,
}: AnnotationToolbarProps) {
  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-0.5 bg-background/95 backdrop-blur-sm rounded-xl px-2 py-1.5 shadow-xl border">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={annotationType === 'text' ? 'default' : 'ghost'}
            size="icon"
            className="h-7 w-7 rounded-lg"
            onClick={() => onAnnotationTypeChange('text')}
          >
            <Type className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">文字</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={annotationType === 'arrow' ? 'default' : 'ghost'}
            size="icon"
            className="h-7 w-7 rounded-lg"
            onClick={() => onAnnotationTypeChange('arrow')}
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">箭头</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={annotationType === 'rect' ? 'default' : 'ghost'}
            size="icon"
            className="h-7 w-7 rounded-lg"
            onClick={() => onAnnotationTypeChange('rect')}
          >
            <Square className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">矩形</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={annotationType === 'circle' ? 'default' : 'ghost'}
            size="icon"
            className="h-7 w-7 rounded-lg"
            onClick={() => onAnnotationTypeChange('circle')}
          >
            <Circle className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">圆形</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={annotationType === 'freehand' ? 'default' : 'ghost'}
            size="icon"
            className="h-7 w-7 rounded-lg"
            onClick={() => onAnnotationTypeChange('freehand')}
          >
            <MousePointer2 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">自由绘制</TooltipContent>
      </Tooltip>

      <div className="w-px h-4 bg-border mx-1" />

      {colors.map(color => (
        <button
          key={color}
          className={cn(
            'w-5 h-5 rounded-full border-2 transition-all hover:scale-110',
            annotationColor === color ? 'border-foreground scale-110' : 'border-transparent'
          )}
          style={{ backgroundColor: color }}
          onClick={() => onAnnotationColorChange(color)}
        />
      ))}

      <div className="w-px h-4 bg-border mx-1" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={onClearAnnotations}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">清除标注</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="default" size="icon" className="h-7 w-7 rounded-lg" onClick={onSaveAnnotations}>
            <Check className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">保存标注</TooltipContent>
      </Tooltip>
    </div>
  )
}
