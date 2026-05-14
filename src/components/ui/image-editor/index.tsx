import { useCallback, useRef, useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import { RotateCcw, X } from 'lucide-react'
import { cn } from '@/lib/utils'

import { useImageEditor } from './hooks/useImageEditor'
import { useImageViewerTransform } from './hooks/useImageViewerTransform'
import { MainToolbar } from './components/MainToolbar'
import { AnnotationToolbar } from './components/AnnotationToolbar'
import { CropToolbar } from './components/CropToolbar'
import { SplitToolbar } from './components/SplitToolbar'
import { AIEditToolbar } from './components/AIEditToolbar'
import { ImageInfo } from './components/ImageInfo'
import { ImageCanvas } from './components/ImageCanvas'

import type { ImageEditorProps } from './types'

export type {
  ImageEditorProps,
  EditMode,
  AnnotationType,
  AIBrushType,
  Annotation,
  CropArea,
  PastedImage,
} from './types'

export { useImageEditor } from './hooks/useImageEditor'

export function ImageEditor({
  src,
  alt = '',
  open,
  onOpenChange,
  onSave,
  onDelete,
  onReupload,
}: ImageEditorProps) {
  const canvasRef = useRef<React.ElementRef<typeof ImageCanvas>>(null)
  const editor = useImageEditor(src, open)
  const [isVisible, setIsVisible] = useState(false)
  const [overlayOpacity, setOverlayOpacity] = useState(0)
  const closeTimerRef = useRef<number | null>(null)

  const {
    containerRef,
    scaleDisplayRef,
    viewerOpacity,
    resetView,
    handleImageMouseDown,
    handleContainerMouseMove,
    handleContainerMouseUp,
    handleImageMouseMove,
    handleImageLoad,
  } = useImageViewerTransform(open && isVisible)

  // 处理打开/关闭动画
  useEffect(() => {
    if (open) {
      setIsVisible(true)
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
      setOverlayOpacity(0)
      requestAnimationFrame(() => {
        setOverlayOpacity(1)
      })
      return
    }
    if (!isVisible) return
    setOverlayOpacity(0)
    closeTimerRef.current = window.setTimeout(() => {
      setIsVisible(false)
    }, 400)
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
    }
  }, [open, isVisible])

  // 打开时重置视图
  useEffect(() => {
    if (!open) return
    resetView()
  }, [open, src, resetView])

  // ESC 关闭
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onOpenChange])

  const handleSaveAnnotations = useCallback(async () => {
    try {
      const canvas = await editor.renderToCanvas()
      const annotatedImage = canvas.toDataURL('image/png')
      onSave?.(annotatedImage)
    } catch (error) {
      console.error('保存失败:', error)
    }
  }, [editor, onSave])

  const handleApplyCrop = useCallback(async () => {
    const croppedImage = await editor.applyCrop()
    if (croppedImage) {
      onSave?.(croppedImage)
    }
  }, [editor, onSave])

  // 处理画布上的绘制事件
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    if (editor.editMode === 'view') {
      // 在 view 模式下，使用 viewer 的拖拽功能
      handleImageMouseDown(e)
      return
    }
    e.preventDefault()

    const img = canvasRef.current?.getImageElement()
    if (!img) return

    const rect = img.getBoundingClientRect()
    const naturalWidth = img.naturalWidth
    const naturalHeight = img.naturalHeight

    // 计算图片实际显示区域（考虑 object-fit: contain）
    const imgRatio = naturalWidth / naturalHeight
    const containerRatio = rect.width / rect.height
    let contentWidth: number
    let contentHeight: number
    let offsetX: number
    let offsetY: number

    if (imgRatio > containerRatio) {
      contentWidth = rect.width
      contentHeight = rect.width / imgRatio
      offsetX = 0
      offsetY = (rect.height - contentHeight) / 2
    } else {
      contentHeight = rect.height
      contentWidth = rect.height * imgRatio
      offsetY = 0
      offsetX = (rect.width - contentWidth) / 2
    }

    const x = ((e.clientX - rect.left - offsetX) / contentWidth) * naturalWidth
    const y = ((e.clientY - rect.top - offsetY) / contentHeight) * naturalHeight

    editor.setIsDrawing(true)
    editor.setDrawStart({ x, y })

    if (editor.editMode === 'annotate') {
      const newAnnotation = {
        id: Date.now().toString(),
        type: editor.annotationType,
        x,
        y,
        color: editor.annotationColor,
        points: editor.annotationType === 'freehand' ? [{ x, y }] : undefined,
      }
      editor.setTempAnnotation(newAnnotation)
    }
  }, [editor, handleImageMouseDown])

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLImageElement>) => {
    if (editor.editMode === 'view') {
      handleImageMouseMove(e)
      return
    }
    if (!editor.isDrawing) return
    e.preventDefault()

    const img = canvasRef.current?.getImageElement()
    if (!img) return

    const rect = img.getBoundingClientRect()
    const naturalWidth = img.naturalWidth
    const naturalHeight = img.naturalHeight

    const imgRatio = naturalWidth / naturalHeight
    const containerRatio = rect.width / rect.height
    let contentWidth: number
    let contentHeight: number
    let offsetX: number
    let offsetY: number

    if (imgRatio > containerRatio) {
      contentWidth = rect.width
      contentHeight = rect.width / imgRatio
      offsetX = 0
      offsetY = (rect.height - contentHeight) / 2
    } else {
      contentHeight = rect.height
      contentWidth = rect.height * imgRatio
      offsetY = 0
      offsetX = (rect.width - contentWidth) / 2
    }

    const x = ((e.clientX - rect.left - offsetX) / contentWidth) * naturalWidth
    const y = ((e.clientY - rect.top - offsetY) / contentHeight) * naturalHeight

    if (editor.editMode === 'crop') {
      let width = Math.abs(x - editor.drawStart.x)
      let height = Math.abs(y - editor.drawStart.y)

      if (editor.cropAspectRatio) {
        height = width / editor.cropAspectRatio
      }

      editor.setCropArea({
        x: Math.min(x, editor.drawStart.x),
        y: Math.min(y, editor.drawStart.y),
        width,
        height,
      })
    } else if (editor.editMode === 'annotate' && editor.tempAnnotation) {
      editor.setTempAnnotation(prev => {
        if (!prev) return null

        if (prev.type === 'freehand' && prev.points) {
          return { ...prev, points: [...prev.points, { x, y }] }
        } else if (prev.type === 'rect' || prev.type === 'circle') {
          return {
            ...prev,
            width: Math.abs(x - prev.x),
            height: Math.abs(y - prev.y),
          }
        } else if (prev.type === 'arrow') {
          return {
            ...prev,
            endX: x,
            endY: y,
          }
        }
        return prev
      })
    }
  }, [editor, handleImageMouseMove])

  const handleCanvasMouseUp = useCallback(() => {
    if (editor.editMode === 'view') {
      handleContainerMouseUp()
      return
    }
    if (!editor.isDrawing) return
    editor.setIsDrawing(false)

    if (editor.editMode === 'annotate' && editor.tempAnnotation) {
      if (editor.tempAnnotation.type === 'text') {
        editor.setEditingText(editor.tempAnnotation.id)
        editor.setTextInput('')
      }
      editor.addAnnotation(editor.tempAnnotation)
      editor.setTempAnnotation(null)
    }
  }, [editor, handleContainerMouseUp])

  const handlePastedDragStart = useCallback((e: React.MouseEvent, id: string) => {
    editor.handlePastedMouseDown(e, id, { current: canvasRef.current?.getImageElement() ?? null })
  }, [editor])

  const handlePastedMove = useCallback((e: React.MouseEvent) => {
    editor.handlePastedMouseMove(e, { current: canvasRef.current?.getImageElement() ?? null })
  }, [editor])

  const handleMaskMouseDown = useCallback((e: React.MouseEvent) => {
    editor.handleMaskMouseDown(e, { current: canvasRef.current?.getImageElement() ?? null })
  }, [editor])

  const handleMaskMouseMove = useCallback((e: React.MouseEvent) => {
    editor.handleMaskMouseMove(e, { current: canvasRef.current?.getImageElement() ?? null })
  }, [editor])

  const getMouseHandler = () => {
    if (editor.editMode === 'ai-edit') {
      return {
        onMouseDown: handleMaskMouseDown,
        onMouseMove: handleMaskMouseMove,
        onMouseUp: handleCanvasMouseUp,
        onMouseLeave: handleCanvasMouseUp,
      }
    }
    return {
      onMouseDown: handleCanvasMouseDown,
      onMouseMove: handleCanvasMouseMove,
      onMouseUp: handleCanvasMouseUp,
      onMouseLeave: handleCanvasMouseUp,
    }
  }

  const mouseHandlers = getMouseHandler()

  if (!isVisible) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'p-0 overflow-hidden border-0 bg-black/90 backdrop-blur-lg',
          editor.isFullscreen ? 'max-w-[100vw] max-h-[100vh] w-screen h-screen' : 'max-w-[95vw] max-h-[95vh] w-[95vw] h-[95vh]'
        )}
        style={{
          opacity: overlayOpacity,
          transition: 'opacity 400ms ease',
        }}
      >
        <DialogTitle className="sr-only">图片编辑器</DialogTitle>

        <TooltipProvider delayDuration={200}>
          {/* 主容器 - 全屏黑色背景 */}
          <div
            ref={containerRef as React.RefObject<HTMLDivElement>}
            className="absolute inset-0 flex items-center justify-center overflow-hidden"
            style={{ overscrollBehavior: 'contain' }}
            onMouseMove={handleContainerMouseMove}
            onMouseUp={handleContainerMouseUp}
            onMouseLeave={handleContainerMouseUp}
            onClick={(e) => {
              if (e.target === e.currentTarget) onOpenChange(false)
            }}
          >
            {/* 图片画布 */}
            <ImageCanvas
              ref={canvasRef}
              src={src}
              alt={alt}
              editMode={editor.editMode}
              annotations={editor.annotations}
              tempAnnotation={editor.tempAnnotation}
              cropArea={editor.cropArea}
              pastedImages={editor.pastedImages}
              selectedPastedId={editor.selectedPastedId}
              maskCanvas={editor.maskCanvas}
              splitRows={editor.splitRows}
              splitCols={editor.splitCols}
              splitLineWidth={editor.splitLineWidth}
              aiBrushType={editor.aiBrushType}
              imageResolution={editor.imageResolution}
              viewerOpacity={viewerOpacity}
              onImageMouseDown={mouseHandlers.onMouseDown as (e: React.MouseEvent<HTMLImageElement>) => void}
              onContainerMouseMove={mouseHandlers.onMouseMove as (e: React.MouseEvent) => void}
              onContainerMouseUp={mouseHandlers.onMouseUp}
              onImageMouseMove={handleCanvasMouseMove as (e: React.MouseEvent) => void}
              onImageLoad={handleImageLoad}
              onPastedDragStart={handlePastedDragStart}
              onPastedMove={handlePastedMove}
              onPastedDelete={editor.removePastedImage}
              onTextEdit={(id, text) => {
                editor.setEditingText(id)
                editor.setTextInput(text)
              }}
              editingText={editor.editingText}
              textInput={editor.textInput}
              onTextInputChange={editor.setTextInput}
              onTextEditEnd={() => {
                if (editor.editingText) {
                  editor.updateAnnotation(editor.editingText, { text: editor.textInput })
                  editor.setEditingText(null)
                }
              }}
            />

            {/* 主工具栏 - 悬浮在顶部 */}
            <MainToolbar
              editMode={editor.editMode}
              onModeChange={editor.handleModeChange}
              onReupload={onReupload || (() => {})}
              onDelete={onDelete}
            />

            {/* 标注工具栏 */}
            {editor.editMode === 'annotate' && (
              <AnnotationToolbar
                annotationType={editor.annotationType}
                annotationColor={editor.annotationColor}
                onAnnotationTypeChange={editor.setAnnotationType}
                onAnnotationColorChange={editor.setAnnotationColor}
                onClearAnnotations={editor.clearAnnotations}
                onSaveAnnotations={handleSaveAnnotations}
              />
            )}

            {/* 裁剪工具栏 */}
            {editor.editMode === 'crop' && (
              <CropToolbar
                cropAspectRatio={editor.cropAspectRatio}
                cropArea={editor.cropArea}
                onAspectRatioChange={editor.setCropAspectRatio}
                onReset={() => editor.setCropArea(null)}
                onApply={handleApplyCrop}
              />
            )}

            {/* 切割工具栏 */}
            {editor.editMode === 'split' && (
              <SplitToolbar
                splitRows={editor.splitRows}
                splitCols={editor.splitCols}
                splitLineWidth={editor.splitLineWidth}
                imageResolution={editor.imageResolution}
                isSplitting={editor.isSplitting}
                onRowsChange={editor.setSplitRows}
                onColsChange={editor.setSplitCols}
                onLineWidthChange={editor.setSplitLineWidth}
                onReset={() => {
                  editor.setSplitRows(2)
                  editor.setSplitCols(2)
                  editor.setSplitLineWidth(0.5)
                }}
                onApply={editor.handleApplySplit}
              />
            )}

            {/* AI 编辑工具栏 */}
            {editor.editMode === 'ai-edit' && (
              <AIEditToolbar
                aiBrushType={editor.aiBrushType}
                aiBrushSize={editor.aiBrushSize}
                aiPrompt={editor.aiPrompt}
                isAiProcessing={editor.isAiProcessing}
                onBrushTypeChange={editor.setAiBrushType}
                onBrushSizeChange={editor.setAiBrushSize}
                onPromptChange={editor.setAiPrompt}
                onClearMask={editor.clearMask}
                onApply={editor.handleAiEdit}
              />
            )}

            {/* 底部控制栏 */}
            <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-3">
              <div className="flex items-center gap-4">
                <div
                  ref={scaleDisplayRef as React.RefObject<HTMLDivElement>}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-white/20 bg-black/60 px-4 text-sm text-white backdrop-blur-xl min-w-[74px]"
                >
                  100%
                </div>
                <button
                  onClick={resetView}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-white/20 bg-black/60 px-4 text-sm text-white backdrop-blur-xl transition-colors hover:bg-white/10"
                  title="重置视图"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onOpenChange(false)}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-white/20 bg-black/60 px-4 text-sm text-white backdrop-blur-xl transition-colors hover:bg-white/10"
                  title="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* 图片信息 - 左下角 */}
            <ImageInfo
              imageResolution={editor.imageResolution}
              editMode={editor.editMode}
            />
          </div>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  )
}
