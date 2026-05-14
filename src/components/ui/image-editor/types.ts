export interface ImageEditorProps {
  src: string
  alt?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave?: (editedImage: string) => void
  onDelete?: () => void
  onReupload?: () => void
}

export type EditMode = 'view' | 'crop' | 'annotate' | 'split' | 'ai-edit'
export type AnnotationType = 'text' | 'rect' | 'circle' | 'arrow' | 'freehand'
export type AIBrushType = 'brush' | 'eraser'

export interface Annotation {
  id: string
  type: AnnotationType
  x: number
  y: number
  width?: number
  height?: number
  endX?: number
  endY?: number
  color: string
  text?: string
  points?: { x: number; y: number }[]
}

export interface CropArea {
  x: number
  y: number
  width: number
  height: number
}

export interface PastedImage {
  id: string
  src: string
  x: number
  y: number
  width: number
  height: number
  opacity: number
}
