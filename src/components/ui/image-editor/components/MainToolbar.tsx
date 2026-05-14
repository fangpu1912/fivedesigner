import { Crop, Pencil, Scissors, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { EditMode } from '../hooks/useImageEditor'

interface MainToolbarProps {
  editMode: EditMode
  onModeChange: (mode: EditMode) => void
  onReupload: () => void
  onDelete?: () => void
}

export function MainToolbar({ editMode, onModeChange, onReupload, onDelete }: MainToolbarProps) {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-0.5 bg-background/95 backdrop-blur-sm rounded-xl px-2 py-1.5 shadow-xl border">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={editMode === 'crop' ? 'default' : 'ghost'}
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={() => onModeChange('crop')}
          >
            <Crop className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">裁剪</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={editMode === 'annotate' ? 'default' : 'ghost'}
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={() => onModeChange('annotate')}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">标注</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={editMode === 'split' ? 'default' : 'ghost'}
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={() => onModeChange('split')}
          >
            <Scissors className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">切割</TooltipContent>
      </Tooltip>

      <div className="w-px h-5 bg-border mx-1" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={onReupload}>
            <Upload className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">重新上传</TooltipContent>
      </Tooltip>

      {onDelete && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">删除图片</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
