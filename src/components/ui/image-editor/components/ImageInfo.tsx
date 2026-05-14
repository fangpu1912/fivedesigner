import type { EditMode } from '../types'
import type { ImageResolution } from '../hooks/useImageEditor'

interface ImageInfoProps {
  imageResolution: ImageResolution | null
  editMode: EditMode
}

export function ImageInfo({ imageResolution, editMode }: ImageInfoProps) {
  return (
    <div className="absolute bottom-4 left-4 z-50 flex items-center gap-2 bg-background/95 backdrop-blur-sm rounded-xl px-3 py-1.5 shadow-xl border">
      <span className="text-sm text-muted-foreground">
        {imageResolution ? `${imageResolution.width} × ${imageResolution.height}` : '加载中...'}
      </span>
      {editMode !== 'view' && (
        <>
          <span className="text-muted-foreground">|</span>
          <span className="text-sm text-primary font-medium">
            {editMode === 'crop' && '裁剪模式：拖拽选择区域'}
            {editMode === 'annotate' && '标注模式：选择工具后绘制'}
            {editMode === 'split' && '切割模式'}
            {editMode === 'ai-edit' && 'AI 编辑模式：绘制蒙版后输入提示词'}
          </span>
        </>
      )}
    </div>
  )
}
