import { useRef, forwardRef, useImperativeHandle } from 'react'
import { cn } from '@/lib/utils'
import type { Annotation, CropArea, PastedImage, EditMode, AIBrushType } from '../types'
import type { ImageResolution } from '../hooks/useImageEditor'

export interface ImageCanvasRef {
  getImageElement: () => HTMLImageElement | null
  getContainerElement: () => HTMLDivElement | null
}

interface ImageCanvasProps {
  src: string
  alt: string
  editMode: EditMode
  annotations: Annotation[]
  tempAnnotation: Annotation | null
  cropArea: CropArea | null
  pastedImages: PastedImage[]
  selectedPastedId: string | null
  maskCanvas: HTMLCanvasElement | null
  splitRows: number
  splitCols: number
  splitLineWidth: number
  aiBrushType: AIBrushType
  imageResolution: ImageResolution | null
  viewerOpacity: number
  onImageMouseDown: (e: React.MouseEvent<HTMLImageElement>) => void
  onContainerMouseMove: (e: React.MouseEvent) => void
  onContainerMouseUp: () => void
  onImageMouseMove: (e: React.MouseEvent) => void
  onImageLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void
  onPastedDragStart: (e: React.MouseEvent, id: string) => void
  onPastedMove: (e: React.MouseEvent) => void
  onPastedDelete: (id: string) => void
  onTextEdit: (id: string, text: string) => void
  editingText: string | null
  textInput: string
  onTextInputChange: (value: string) => void
  onTextEditEnd: () => void
}

export const ImageCanvas = forwardRef<ImageCanvasRef, ImageCanvasProps>(
  ({
    src,
    alt,
    editMode,
    annotations,
    tempAnnotation,
    cropArea,
    pastedImages,
    selectedPastedId,
    maskCanvas,
    splitRows,
    splitCols,
    splitLineWidth,
    aiBrushType,
    imageResolution,
    viewerOpacity,
    onImageMouseDown,
    onContainerMouseMove,
    onContainerMouseUp,
    onImageMouseMove,
    onImageLoad,
    onPastedDragStart,
    onPastedMove,
    onPastedDelete,
    onTextEdit,
    editingText,
    textInput,
    onTextInputChange,
    onTextEditEnd,
  }, ref) => {
    const imageRef = useRef<HTMLImageElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    useImperativeHandle(ref, () => ({
      getImageElement: () => imageRef.current,
      getContainerElement: () => containerRef.current,
    }))

    const getDisplayScale = () => {
      if (!imageRef.current || !imageResolution) {
        return { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 }
      }
      const rect = imageRef.current.getBoundingClientRect()
      const imgRatio = imageResolution.width / imageResolution.height
      const containerRatio = rect.width / rect.height

      let contentWidth: number
      let contentHeight: number
      if (imgRatio > containerRatio) {
        contentWidth = rect.width
        contentHeight = rect.width / imgRatio
      } else {
        contentHeight = rect.height
        contentWidth = rect.height * imgRatio
      }

      return {
        scaleX: contentWidth / imageResolution.width,
        scaleY: contentHeight / imageResolution.height,
        offsetX: (rect.width - contentWidth) / 2,
        offsetY: (rect.height - contentHeight) / 2,
      }
    }

    const renderAnnotations = () => {
      const allAnnotations = tempAnnotation ? [...annotations, tempAnnotation] : annotations
      const { scaleX, scaleY, offsetX, offsetY } = getDisplayScale()

      return allAnnotations.map(ann => {
        const style: React.CSSProperties = {
          position: 'absolute',
          left: offsetX + ann.x * scaleX,
          top: offsetY + ann.y * scaleY,
          pointerEvents: 'none',
        }

        if (ann.type === 'text') {
          return (
            <div
              key={ann.id}
              className="absolute px-2 py-1 bg-white/90 rounded text-sm font-medium shadow-sm"
              style={{
                ...style,
                color: ann.color,
                pointerEvents: 'auto',
              }}
              onDoubleClick={() => onTextEdit(ann.id, ann.text || '')}
            >
              {editingText === ann.id ? (
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => onTextInputChange(e.target.value)}
                  onBlur={onTextEditEnd}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onTextEditEnd()
                  }}
                  className="w-32 px-1 border rounded"
                  autoFocus
                />
              ) : (
                <>
                  {ann.text || '双击编辑'}
                  <button
                    className="ml-2 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                    }}
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          )
        }

        if (ann.type === 'rect' && ann.width && ann.height) {
          return (
            <div
              key={ann.id}
              className="absolute border-2"
              style={{
                ...style,
                width: ann.width * scaleX,
                height: ann.height * scaleY,
                borderColor: ann.color,
              }}
            />
          )
        }

        if (ann.type === 'circle' && ann.width && ann.height) {
          return (
            <div
              key={ann.id}
              className="absolute border-2 rounded-full"
              style={{
                ...style,
                width: ann.width * scaleX,
                height: ann.height * scaleY,
                borderColor: ann.color,
              }}
            />
          )
        }

        if (ann.type === 'arrow' && ann.endX !== undefined && ann.endY !== undefined) {
          const dx = ann.endX - ann.x
          const dy = ann.endY - ann.y
          const angle = Math.atan2(dy, dx) * (180 / Math.PI)
          const length = Math.sqrt(dx * dx + dy * dy)

          return (
            <div
              key={ann.id}
              className="absolute"
              style={{
                ...style,
                width: length * scaleX,
                height: 3,
                backgroundColor: ann.color,
                transformOrigin: '0 50%',
                transform: `rotate(${angle}deg)`,
              }}
            >
              <div
                className="absolute right-0 top-1/2 -translate-y-1/2"
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: `10px solid ${ann.color}`,
                  borderTop: '6px solid transparent',
                  borderBottom: '6px solid transparent',
                }}
              />
            </div>
          )
        }

        if (ann.type === 'freehand' && ann.points && ann.points.length > 1) {
          const points = ann.points
          const minX = Math.min(...points.map(p => p.x))
          const minY = Math.min(...points.map(p => p.y))
          const maxX = Math.max(...points.map(p => p.x))
          const maxY = Math.max(...points.map(p => p.y))

          const pathData = points.reduce((acc, p, i) => {
            const x = (p.x - minX) * scaleX
            const y = (p.y - minY) * scaleY
            return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`
          }, '')

          return (
            <svg
              key={ann.id}
              className="absolute pointer-events-none"
              style={{
                left: offsetX + minX * scaleX,
                top: offsetY + minY * scaleY,
                width: (maxX - minX) * scaleX,
                height: (maxY - minY) * scaleY,
                overflow: 'visible',
              }}
            >
              <path
                d={pathData}
                fill="none"
                stroke={ann.color}
                strokeWidth={3}
              />
            </svg>
          )
        }

        return null
      })
    }

    const renderCropOverlay = () => {
      if (!cropArea || !imageResolution) return null

      const { scaleX, scaleY, offsetX, offsetY } = getDisplayScale()

      return (
        <div
          className="absolute border-2 border-primary bg-primary/10"
          style={{
            left: offsetX + cropArea.x * scaleX,
            top: offsetY + cropArea.y * scaleY,
            width: cropArea.width * scaleX,
            height: cropArea.height * scaleY,
            pointerEvents: 'none',
          }}
        >
          <div className="absolute -top-6 left-0 bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded">
            {Math.round(cropArea.width)} × {Math.round(cropArea.height)}
          </div>
        </div>
      )
    }

    const renderSplitGrid = () => {
      if (editMode !== 'split' || !imageResolution) return null

      const { scaleX, scaleY, offsetX, offsetY } = getDisplayScale()
      const displayWidth = imageResolution.width * scaleX
      const displayHeight = imageResolution.height * scaleY

      const cellWidth = displayWidth / splitCols
      const cellHeight = displayHeight / splitRows
      const lineWidthPx = Math.max(1, (splitLineWidth / 100) * Math.min(displayWidth, displayHeight))

      const verticalLines = []
      const horizontalLines = []

      for (let i = 1; i < splitCols; i++) {
        verticalLines.push(
          <div
            key={`v-${i}`}
            className="absolute bg-red-500/70"
            style={{
              left: offsetX + i * cellWidth - lineWidthPx / 2,
              top: offsetY,
              width: lineWidthPx,
              height: displayHeight,
              pointerEvents: 'none',
            }}
          />
        )
      }

      for (let i = 1; i < splitRows; i++) {
        horizontalLines.push(
          <div
            key={`h-${i}`}
            className="absolute bg-red-500/70"
            style={{
              left: offsetX,
              top: offsetY + i * cellHeight - lineWidthPx / 2,
              width: displayWidth,
              height: lineWidthPx,
              pointerEvents: 'none',
            }}
          />
        )
      }

      return (
        <>
          {verticalLines}
          {horizontalLines}
          {Array.from({ length: splitRows * splitCols }).map((_, index) => {
            const row = Math.floor(index / splitCols)
            const col = index % splitCols
            const actualCellWidth = (imageResolution.width - (splitCols - 1) * splitLineWidth) / splitCols
            const actualCellHeight = (imageResolution.height - (splitRows - 1) * splitLineWidth) / splitRows

            return (
              <div
                key={`label-${index}`}
                className="absolute flex items-center justify-center text-xs font-medium text-white/80"
                style={{
                  left: offsetX + col * cellWidth + 4,
                  top: offsetY + row * cellHeight + 4,
                  width: cellWidth - 8,
                  height: cellHeight - 8,
                  pointerEvents: 'none',
                }}
              >
                {Math.round(actualCellWidth)} × {Math.round(actualCellHeight)}
              </div>
            )
          })}
        </>
      )
    }

    const renderMaskOverlay = () => {
      if (editMode !== 'ai-edit' || !maskCanvas || !imageResolution) return null

      const { scaleX, scaleY, offsetX, offsetY } = getDisplayScale()
      const displayWidth = imageResolution.width * scaleX
      const displayHeight = imageResolution.height * scaleY

      return (
        <canvas
          className="absolute pointer-events-none"
          style={{
            left: offsetX,
            top: offsetY,
            width: displayWidth,
            height: displayHeight,
            mixBlendMode: 'normal',
          }}
          width={displayWidth}
          height={displayHeight}
          ref={(canvas) => {
            if (canvas && maskCanvas) {
              const ctx = canvas.getContext('2d')
              if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height)
                ctx.drawImage(maskCanvas, 0, 0, canvas.width, canvas.height)
              }
            }
          }}
        />
      )
    }

    const renderPastedImages = () => {
      if (pastedImages.length === 0 || !imageResolution) return null

      const { scaleX, scaleY, offsetX, offsetY } = getDisplayScale()

      return pastedImages.map(pasted => {
        const displayX = offsetX + pasted.x * scaleX
        const displayY = offsetY + pasted.y * scaleY
        const displayW = pasted.width * scaleX
        const displayH = pasted.height * scaleY

        return (
          <div
            key={pasted.id}
            className={cn(
              'absolute cursor-move transition-shadow',
              selectedPastedId === pasted.id && 'ring-2 ring-primary ring-offset-2'
            )}
            style={{
              left: displayX,
              top: displayY,
              width: displayW,
              height: displayH,
              opacity: pasted.opacity,
            }}
            onMouseDown={(e) => onPastedDragStart(e, pasted.id)}
            onMouseMove={onPastedMove}
            onMouseUp={onContainerMouseUp}
            onMouseLeave={onContainerMouseUp}
          >
            <img
              src={pasted.src}
              alt="粘贴的图片"
              className="w-full h-full object-contain pointer-events-none"
              draggable={false}
            />
            {selectedPastedId === pasted.id && (
              <div className="absolute -top-6 right-0 flex items-center gap-1">
                <button
                  className="w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs hover:scale-110 transition-transform"
                  onClick={(e) => {
                    e.stopPropagation()
                    onPastedDelete(pasted.id)
                  }}
                >
                  ×
                </button>
              </div>
            )}
          </div>
        )
      })
    }

    const getCursor = () => {
      if (editMode === 'view') return 'default'
      if (editMode === 'ai-edit') {
        return aiBrushType === 'brush' ? 'crosshair' : 'cell'
      }
      return 'crosshair'
    }

    return (
      <div
        ref={containerRef}
        className="absolute inset-0 flex items-center justify-center overflow-hidden"
        onMouseMove={onContainerMouseMove}
        onMouseUp={onContainerMouseUp}
        onMouseLeave={onContainerMouseUp}
      >
        <div className="relative w-full h-full">
          <img
            ref={imageRef}
            src={src}
            alt={alt}
            className="absolute inset-0 w-full h-full select-none"
            style={{
              objectFit: 'contain',
              opacity: viewerOpacity,
              transition: 'opacity 300ms ease',
              cursor: getCursor(),
            }}
            draggable={false}
            onMouseDown={onImageMouseDown}
            onMouseMove={onImageMouseMove}
            onLoad={onImageLoad}
          />

          {/* 覆盖层容器 - 与图片对齐 */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {renderAnnotations()}
            {renderCropOverlay()}
            {renderSplitGrid()}
            {renderMaskOverlay()}
            {renderPastedImages()}
          </div>
        </div>
      </div>
    )
  }
)

ImageCanvas.displayName = 'ImageCanvas'
