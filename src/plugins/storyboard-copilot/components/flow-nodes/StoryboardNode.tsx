import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Handle, Position, useUpdateNodeInternals, useReactFlow, type NodeProps, type Edge } from '@xyflow/react'
import { LayoutGrid, Plus, Minus, Image as ImageIcon, Download, Replace, Trash2, Merge, FolderDown, Crop, ExternalLink } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/useToast'
import { getImageUrl } from '@/utils/asset'
import { urlToUint8Array } from '@/utils/mediaStorage'

import type { StoryboardSplitNodeData, StoryboardFrameItem } from '../../types'
import { createDefaultFrames, generateNodeId, generateEdgeId } from '../../utils'
import { getNodeContainerClass, getTargetHandleClass, getSourceHandleClass, NODE_HEADER_FLOATING_CLASS, NODE_HEADER_CLASSES } from './NodeStyles'
import { NodeResizeHandle } from './NodeResizeHandle'
import { ImageCropDialog } from '../ImageCropDialog'
import { useEnlargedHandles } from '../../hooks/useEnlargedHandles'

interface StoryboardNodeProps extends NodeProps {
  data: StoryboardSplitNodeData
}

interface FrameItemProps {
  frame: StoryboardFrameItem
  index: number
  onNoteChange: (frameId: string, note: string) => void
  onReplaceImage: (frameId: string) => void
  onDeleteFrame: (frameId: string) => void
  onCropImage: (frameId: string) => void
  onMouseDown: (e: React.MouseEvent, frameId: string, index: number) => void
  onDoubleClick: (frameId: string) => void
  onExtractToNode: (frameId: string) => void
  isDragOver: boolean
  isDragging: boolean
}

const FrameItem = memo(({ frame, index, onNoteChange, onReplaceImage, onDeleteFrame, onCropImage, onMouseDown, onDoubleClick, onExtractToNode, isDragOver, isDragging }: FrameItemProps) => {
  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded border bg-muted/30 group/item min-h-[80px] transition-all nodrag ${isDragOver ? 'ring-2 ring-primary ring-offset-1' : ''} ${isDragging ? 'opacity-50' : ''} ${frame.imageUrl ? 'cursor-grab' : ''}`}
      onMouseDown={(e) => {
        if (e.button === 0 && frame.imageUrl) {
          e.preventDefault()
          e.stopPropagation()
          onMouseDown(e, frame.id, index)
        }
      }}
      onDoubleClick={() => onDoubleClick(frame.id)}
    >
      <div className="absolute right-1 top-1 z-10 flex gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity">
        {frame.imageUrl && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 rounded bg-background/80 p-1 hover:bg-primary/20 hover:text-primary"
            onClick={(e) => {
              e.stopPropagation()
              onExtractToNode(frame.id)
            }}
            title="提取为新节点"
          >
            <ExternalLink className="h-3 w-3" />
          </Button>
        )}
        {frame.imageUrl && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 rounded bg-background/80 p-1 hover:bg-background"
            onClick={(e) => {
              e.stopPropagation()
              onCropImage(frame.id)
            }}
            title="裁剪图片"
          >
            <Crop className="h-3 w-3" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 rounded bg-background/80 p-1 hover:bg-background"
          onClick={(e) => {
            e.stopPropagation()
            onReplaceImage(frame.id)
          }}
          title="替换图片"
        >
          <Replace className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 rounded bg-background/80 p-1 hover:bg-destructive hover:text-destructive-foreground"
          onClick={(e) => {
            e.stopPropagation()
            onDeleteFrame(frame.id)
          }}
          title="删除"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {frame.imageUrl ? (
        <img
          src={getImageUrl(frame.imageUrl) || ''}
          alt={`Frame ${index + 1}`}
          className="w-full h-full object-contain pointer-events-none"
          draggable={false}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center min-h-[60px]">
          <ImageIcon className="h-6 w-6 opacity-30" />
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 flex items-center gap-1 border-t bg-background/90 px-1.5 py-1">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-medium text-primary">
          {index + 1}
        </span>
        <Input
          value={frame.note}
          onChange={(e) => onNoteChange(frame.id, e.target.value)}
          placeholder={`分镜 ${index + 1}`}
          className="h-5 border-0 bg-transparent px-1 text-[10px] placeholder:text-[10px] focus-visible:ring-0"
          onPointerDown={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  )
})

FrameItem.displayName = 'FrameItem'

export const StoryboardNode = memo(({ id, data, selected }: StoryboardNodeProps) => {
  const updateNodeInternals = useUpdateNodeInternals()
  const { updateNodeData, addNodes, getNode, addEdges } = useReactFlow()
  const { toast } = useToast()
  const [rows, setRows] = useState(data.gridRows || 2)
  const [cols, setCols] = useState(data.gridCols || 2)
  const [gap, setGap] = useState(data.gap ?? 2)
  const [frames, setFrames] = useState<StoryboardFrameItem[]>(data.frames || [])
  const [isExecuting, setIsExecuting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null)
  const [originalFrameSize, setOriginalFrameSize] = useState<{ width: number; height: number } | null>(null)
  const [cropFrameId, setCropFrameId] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const dragStateRef = useRef<{
    frameId: string
    index: number
    startX: number
    startY: number
    isDragging: boolean
  } | null>(null)
  const dragOverIndexRef = useRef<number | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const lastExecuteTrigger = useRef<number | undefined>(data._executeTrigger)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const enlargedHandles = useEnlargedHandles(id)

  useEffect(() => {
    dragOverIndexRef.current = dragOverIndex
  }, [dragOverIndex])

  const handleFrameMouseDown = useCallback((e: React.MouseEvent, frameId: string, index: number) => {
    dragStateRef.current = {
      frameId,
      index,
      startX: e.clientX,
      startY: e.clientY,
      isDragging: false,
    }

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const state = dragStateRef.current
      if (!state) return

      const dx = moveEvent.clientX - state.startX
      const dy = moveEvent.clientY - state.startY

      if (!state.isDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        state.isDragging = true
        setDraggingIndex(state.index)
        document.body.style.userSelect = 'none'
        document.body.style.webkitUserSelect = 'none'
      }

      if (state.isDragging && gridRef.current) {
        const gridRect = gridRef.current.getBoundingClientRect()
        const gap = (data.gap ?? 2) * 4
        const cellW = (gridRect.width - (cols - 1) * gap) / cols
        const cellH = (gridRect.height - (rows - 1) * gap) / rows

        const relX = moveEvent.clientX - gridRect.left
        const relY = moveEvent.clientY - gridRect.top

        const targetCol = Math.floor(relX / (cellW + gap))
        const targetRow = Math.floor(relY / (cellH + gap))

        if (targetCol >= 0 && targetCol < cols && targetRow >= 0 && targetRow < rows) {
          const targetIdx = targetRow * cols + targetCol
          const newDragOver = targetIdx !== state.index ? targetIdx : null
          setDragOverIndex(newDragOver)
        } else {
          setDragOverIndex(null)
        }
      }
    }

    const handleMouseUp = () => {
      const state = dragStateRef.current
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)

      const currentDragOver = dragOverIndexRef.current

      if (state?.isDragging && currentDragOver !== null && currentDragOver !== state.index) {
        setFrames((prev) => {
          const newFrames = [...prev]
          const srcFrame = newFrames[state.index]
          const tgtFrame = newFrames[currentDragOver]
          if (!srcFrame || !tgtFrame) return prev
          newFrames[state.index] = tgtFrame
          newFrames[currentDragOver] = srcFrame
          updateNodeData(id, { frames: newFrames })
          return newFrames
        })
      }

      setDragOverIndex(null)
      setDraggingIndex(null)
      document.body.style.userSelect = ''
      document.body.style.webkitUserSelect = ''
      dragStateRef.current = null
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [data.gap, cols, rows, id, updateNodeData])

  const handleCropImage = useCallback((frameId: string) => {
    setCropFrameId(frameId)
  }, [])

  const handleFrameDoubleClick = useCallback((frameId: string) => {
    const frame = frames.find(f => f.id === frameId)
    if (frame?.imageUrl) {
      handleCropImage(frameId)
    }
  }, [frames, handleCropImage])

  const handleExtractToNode = useCallback((frameId: string) => {
    const frame = frames.find(f => f.id === frameId)
    if (!frame?.imageUrl) return

    const currentNode = getNode(id)
    if (!currentNode) return

    const frameIndex = frames.findIndex(f => f.id === frameId)
    const row = Math.floor(frameIndex / cols)
    const col = frameIndex % cols

    const newNodeId = generateNodeId()
    const newNodePosition = {
      x: currentNode.position.x + 420,
      y: currentNode.position.y + row * 120,
    }

    addNodes([{
      id: newNodeId,
      type: 'uploadNode',
      position: newNodePosition,
      data: {
        imageUrl: frame.imageUrl,
        previewImageUrl: frame.imageUrl,
        sourceFileName: frame.note || `分镜 ${row + 1}-${col + 1}`,
        displayName: frame.note || `分镜 ${row + 1}-${col + 1}`,
      },
    }])

    const newEdgeId = generateEdgeId(id, newNodeId)
    addEdges([{
      id: newEdgeId,
      source: id,
      target: newNodeId,
      sourceHandle: 'source',
      targetHandle: 'target',
      type: 'custom',
    }])

    toast({ title: '已提取为新节点', description: frame.note || `分镜 ${row + 1}-${col + 1}` })
  }, [frames, cols, id, getNode, addNodes, addEdges, toast])

  // 处理裁剪完成
  const handleCropComplete = useCallback((croppedUrl: string) => {
    if (!cropFrameId) return
    
    setFrames(prev => {
      const newFrames = prev.map(f => 
        f.id === cropFrameId ? { ...f, imageUrl: croppedUrl, previewImageUrl: croppedUrl } : f
      )
      updateNodeData(id, { frames: newFrames })
      return newFrames
    })
    
    setCropFrameId(null)
  }, [cropFrameId, id, updateNodeData])

  // 获取当前要裁剪的图片
  const cropImageUrl = useMemo(() => {
    if (!cropFrameId) return null
    const frame = frames.find(f => f.id === cropFrameId)
    return frame?.imageUrl || null
  }, [cropFrameId, frames])

  useEffect(() => {
    if (frames.length === 0) {
      const newFrames = createDefaultFrames(rows, cols)
      setFrames(newFrames)
      updateNodeData(id, { frames: newFrames })
    }
  }, [])

  useEffect(() => {
    updateNodeInternals(id)
  }, [id, updateNodeInternals])

  useEffect(() => {
    if (data.frames && data.frames !== frames) {
      setFrames(data.frames)
    }
    if (data.gridRows !== undefined && data.gridRows !== rows) {
      setRows(data.gridRows)
    }
    if (data.gridCols !== undefined && data.gridCols !== cols) {
      setCols(data.gridCols)
    }
    if (data.gap !== undefined && data.gap !== gap) {
      setGap(data.gap)
    }
  }, [data.frames, data.gridRows, data.gridCols, data.gap])

  useEffect(() => {
    if (data._executeTrigger && data._executeTrigger !== lastExecuteTrigger.current) {
      lastExecuteTrigger.current = data._executeTrigger

      const inputImageUrl = data.inputImageUrl
      const inputFrames = data.inputFrames

      if (inputImageUrl) {
        performSplit(inputImageUrl)
      } else if (inputFrames && inputFrames.length > 0) {
        setFrames(inputFrames)
        updateNodeData(id, { frames: inputFrames })
      }
    }
  }, [data._executeTrigger, data.inputImageUrl, data.inputFrames])

  const performSplit = async (imageUrl: string) => {
    setIsExecuting(true)
    setProgress(10)

    try {
      const displayUrl = getImageUrl(imageUrl)
      if (!displayUrl) {
        throw new Error('无法获取图片 URL')
      }

      const img = new Image()
      if (!displayUrl.startsWith('asset://')) {
        img.crossOrigin = 'anonymous'
      }
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = reject
        img.src = displayUrl
      })

      setProgress(30)

      const { naturalWidth: width, naturalHeight: height } = img
      const cellWidth = width / cols
      const cellHeight = height / rows

      setOriginalFrameSize({ width: Math.floor(cellWidth), height: Math.floor(cellHeight) })

      const newFrames: StoryboardFrameItem[] = []

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(cellWidth)
          canvas.height = Math.floor(cellHeight)
          const ctx = canvas.getContext('2d')!

          ctx.drawImage(
            img,
            col * cellWidth,
            row * cellHeight,
            cellWidth,
            cellHeight,
            0,
            0,
            cellWidth,
            cellHeight
          )

          const dataUrl = canvas.toDataURL('image/png')

          newFrames.push({
            id: `frame-${row}-${col}-${Date.now()}`,
            imageUrl: dataUrl,
            note: `分镜 ${row + 1}-${col + 1}`,
            order: row * cols + col,
          })

          setProgress(30 + Math.round(((row * cols + col + 1) / (rows * cols)) * 60))
        }
      }

      setFrames(newFrames)
      updateNodeData(id, { frames: newFrames })
      setProgress(100)

      setTimeout(() => {
        handleMergeAndOutput(newFrames)
      }, 500)
    } catch (error) {
      console.error('图片拆分失败:', error)
    } finally {
      setIsExecuting(false)
    }
  }

  const handleFrameNoteChange = useCallback(
    (frameId: string, note: string) => {
      setFrames((prev) => {
        const newFrames = prev.map((f) => (f.id === frameId ? { ...f, note } : f))
        updateNodeData(id, { frames: newFrames })
        return newFrames
      })
    },
    [id, updateNodeData]
  )

  const handleReplaceImage = useCallback((frameId: string) => {
    setSelectedFrameId(frameId)
    fileInputRef.current?.click()
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedFrameId) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string
      if (!dataUrl) return

      // 如果有输入图片拆分的尺寸，使用那个尺寸
      // 否则使用上传图片的原始尺寸
      if (originalFrameSize) {
        // 有输入图片时，按拆分尺寸缩放
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = originalFrameSize.width
          canvas.height = originalFrameSize.height
          const ctx = canvas.getContext('2d')!

          // 等比缩放并居中裁剪
          const scale = Math.max(originalFrameSize.width / img.width, originalFrameSize.height / img.height)
          const drawWidth = img.width * scale
          const drawHeight = img.height * scale
          const drawX = (originalFrameSize.width - drawWidth) / 2
          const drawY = (originalFrameSize.height - drawHeight) / 2

          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, originalFrameSize.width, originalFrameSize.height)
          ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight)

          const resizedDataUrl = canvas.toDataURL('image/png')
          setFrames((prev) => {
            const newFrames = prev.map((f) =>
              f.id === selectedFrameId ? { ...f, imageUrl: resizedDataUrl } : f
            )
            updateNodeData(id, { frames: newFrames })
            return newFrames
          })
        }
        img.src = dataUrl
      } else {
        setFrames((prev) => {
          const newFrames = prev.map((f) =>
            f.id === selectedFrameId ? { ...f, imageUrl: dataUrl } : f
          )
          updateNodeData(id, { frames: newFrames })
          return newFrames
        })
      }
    }
    reader.readAsDataURL(file)

    e.target.value = ''
    setSelectedFrameId(null)
  }, [selectedFrameId, id, updateNodeData, originalFrameSize])

  const createWhitePlaceholder = (): string => {
    const canvas = document.createElement('canvas')
    canvas.width = 100
    canvas.height = 100
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  }

  const handleDeleteFrame = useCallback((frameId: string) => {
    setFrames((prev) => {
      const newFrames = prev.map((f) =>
        f.id === frameId ? { ...f, imageUrl: createWhitePlaceholder() } : f
      )
      updateNodeData(id, { frames: newFrames })
      return newFrames
    })
  }, [id, updateNodeData])

  const handleRowsChange = useCallback(
    (delta: number) => {
      const newRows = Math.max(1, Math.min(6, rows + delta))
      setRows(newRows)

      const currentLength = frames.length
      const newLength = newRows * cols

      if (newLength > currentLength) {
        const newFrames = [
          ...frames,
          ...createDefaultFrames(newRows - rows, cols).map((f, i) => ({
            ...f,
            order: currentLength + i,
          })),
        ]
        setFrames(newFrames)
        updateNodeData(id, { gridRows: newRows, frames: newFrames })
      } else if (newLength < currentLength) {
        const newFrames = frames.slice(0, newLength)
        setFrames(newFrames)
        updateNodeData(id, { gridRows: newRows, frames: newFrames })
      } else {
        updateNodeData(id, { gridRows: newRows })
      }
    },
    [rows, cols, frames, id, updateNodeData]
  )

  const handleColsChange = useCallback(
    (delta: number) => {
      const newCols = Math.max(1, Math.min(6, cols + delta))
      setCols(newCols)

      const currentLength = frames.length
      const newLength = rows * newCols

      if (newLength > currentLength) {
        const newFrames = [
          ...frames,
          ...createDefaultFrames(rows, newCols - cols).map((f, i) => ({
            ...f,
            order: currentLength + i,
          })),
        ]
        setFrames(newFrames)
        updateNodeData(id, { gridCols: newCols, frames: newFrames })
      } else if (newLength < currentLength) {
        const newFrames = frames.slice(0, newLength)
        setFrames(newFrames)
        updateNodeData(id, { gridCols: newCols, frames: newFrames })
      } else {
        updateNodeData(id, { gridCols: newCols })
      }
    },
    [rows, cols, frames, id, updateNodeData]
  )

  const handleMergeAndOutput = useCallback(async (framesToMerge: StoryboardFrameItem[] = frames) => {
    if (framesToMerge.length === 0 || !framesToMerge.some(f => f.imageUrl)) {
      console.warn('没有可合并的图片')
      return
    }

    try {
      const mergeGap = gap * 4
      const padding = 20

      // 首先加载所有图片获取实际尺寸
      const loadedImages: { img: HTMLImageElement; frame: StoryboardFrameItem; row: number; col: number }[] = []
      
      // 按行列分组计算每行每列的最大尺寸
      const rowHeights: number[] = new Array(rows).fill(0)
      const colWidths: number[] = new Array(cols).fill(0)

      for (let i = 0; i < framesToMerge.length; i++) {
        const frame = framesToMerge[i]!
        const row = Math.floor(i / cols)
        const col = i % cols
        
        if (!frame.imageUrl) {
          rowHeights[row] = Math.max(rowHeights[row] ?? 0, 300)
          colWidths[col] = Math.max(colWidths[col] ?? 0, 400)
          continue
        }
        
        const img = new Image()
        const resolvedUrl = getImageUrl(frame.imageUrl) || frame.imageUrl
        if (!resolvedUrl?.startsWith('data:') && !resolvedUrl?.startsWith('asset://')) {
          img.crossOrigin = 'anonymous'
        }
        
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('图片加载失败'))
          img.src = resolvedUrl || ''
        })
        
        loadedImages.push({ img, frame, row, col })
        rowHeights[row] = Math.max(rowHeights[row] ?? 0, img.height)
        colWidths[col] = Math.max(colWidths[col] ?? 0, img.width)
      }

      // 计算画布总尺寸
      const totalWidth = colWidths.reduce((sum, w) => sum + w, 0) + (cols - 1) * mergeGap + padding * 2
      const totalHeight = rowHeights.reduce((sum, h) => sum + h, 0) + (rows - 1) * mergeGap + padding * 2

      const canvas = document.createElement('canvas')
      canvas.width = totalWidth
      canvas.height = totalHeight
      const ctx = canvas.getContext('2d')!

      if (!ctx) {
        throw new Error('无法获取 canvas 上下文')
      }

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      for (const { img, frame, row, col } of loadedImages) {
        let x = padding
        for (let c = 0; c < col; c++) {
          x += (colWidths[c] ?? 0) + mergeGap
        }
        
        let y = padding
        for (let r = 0; r < row; r++) {
          y += (rowHeights[r] ?? 0) + mergeGap
        }

        const cellW = colWidths[col] ?? 0
        const cellH = rowHeights[row] ?? 0
        const drawX = x + (cellW - img.width) / 2
        const drawY = y + (cellH - img.height) / 2
        
        ctx.drawImage(img, drawX, drawY, img.width, img.height)

        if (frame.note) {
          ctx.fillStyle = '#374151'
          ctx.font = '12px sans-serif'
          ctx.textAlign = 'left'
          ctx.fillText(frame.note, x, y + cellH + 16)
        }
      }

      for (let i = 0; i < framesToMerge.length; i++) {
        const frame = framesToMerge[i]!
        if (frame.imageUrl) continue
        
        const row = Math.floor(i / cols)
        const col = i % cols
        
        let x = padding
        for (let c = 0; c < col; c++) {
          x += (colWidths[c] ?? 0) + mergeGap
        }
        
        let y = padding
        for (let r = 0; r < row; r++) {
          y += (rowHeights[r] ?? 0) + mergeGap
        }

        const cellW = colWidths[col] ?? 0
        const cellH = rowHeights[row] ?? 0

        ctx.fillStyle = '#f3f4f6'
        ctx.fillRect(x, y, cellW, cellH)
        ctx.strokeStyle = '#e5e7eb'
        ctx.lineWidth = 1
        ctx.strokeRect(x, y, cellW, cellH)
      }

      const mergedDataUrl = canvas.toDataURL('image/png')

      updateNodeData(id, {
        mergedImageUrl: mergedDataUrl,
        outputImageUrl: mergedDataUrl,
        _outputTrigger: Date.now(),
      })

      console.log('✅ 图片合并完成，已输出到下游节点')

      return mergedDataUrl
    } catch (error) {
      console.error('合并失败:', error)
      throw error
    }
  }, [frames, rows, cols, gap, id, updateNodeData])

  const dataUrlToUint8Array = (dataUrl: string): Uint8Array => {
    const base64 = dataUrl.split(',')[1]!
    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes
  }

  const handleExport = useCallback(async () => {
    try {
      const mergedDataUrl = await handleMergeAndOutput()
      if (!mergedDataUrl) {
        alert('没有可导出的图片')
        return
      }

      const { save } = await import('@tauri-apps/plugin-dialog')
      const { writeFile } = await import('@tauri-apps/plugin-fs')

      const savePath = await save({
        defaultPath: `分镜_${rows}x${cols}_${Date.now()}.png`,
        filters: [
          { name: 'PNG 图片', extensions: ['png'] },
          { name: '所有文件', extensions: ['*'] },
        ],
        title: '保存分镜图片',
      })

      if (savePath) {
        const fileData = dataUrlToUint8Array(mergedDataUrl)
        await writeFile(savePath, fileData)
        console.log('✅ 图片已保存到:', savePath)
      }
    } catch (error) {
      console.error('导出失败:', error)
      alert('导出失败: ' + (error instanceof Error ? error.message : '未知错误'))
    }
  }, [handleMergeAndOutput, rows, cols])

  const handleManualMerge = useCallback(async () => {
    setIsExecuting(true)
    try {
      const mergedDataUrl = await handleMergeAndOutput()

      if (mergedDataUrl) {
        const currentNode = getNode(id)
        if (currentNode) {
          const newNodeId = `export-${Date.now()}`
          const newNodePosition = {
            x: (currentNode.position.x ?? 0) + 400,
            y: currentNode.position.y ?? 0,
          }

          addNodes([{
            id: newNodeId,
            type: 'uploadNode',
            position: newNodePosition,
            data: {
              imageUrl: mergedDataUrl,
              previewImageUrl: mergedDataUrl,
              aspectRatio: '16:9',
              sourceFileName: '合并结果',
            },
          }])

          // 自动连接新节点到当前节点的右侧
          const newEdge: Edge = {
            id: `e-${id}-${newNodeId}`,
            source: id,
            target: newNodeId,
            sourceHandle: 'source',
            targetHandle: 'target',
          }
          addEdges([newEdge])
        }
      }
    } catch (error) {
      console.error('合并失败:', error)
    } finally {
      setIsExecuting(false)
    }
  }, [handleMergeAndOutput, getNode, addNodes, addEdges, id])

  // 批量下载子图
  const handleBatchDownload = useCallback(async () => {
    const framesWithImage = frames.filter(f => f.imageUrl)
    if (framesWithImage.length === 0) {
      toast({ title: '没有可下载的图片', variant: 'destructive' })
      return
    }

    try {
      // 使用 Tauri Dialog API 选择保存目录
      const { open } = await import('@tauri-apps/plugin-dialog')
      const { writeFile } = await import('@tauri-apps/plugin-fs')

      const dir = await open({
        directory: true,
        title: '选择保存目录',
      })

      if (!dir) return

      // 生成唯一批次标识（时间戳+随机数）
      const batchId = `${Date.now()}_${Math.random().toString(36).substr(2, 4)}`

      let successCount = 0
      for (let i = 0; i < framesWithImage.length; i++) {
        const frame = framesWithImage[i]!
        if (!frame.imageUrl) continue

        try {
          const uint8Array = await urlToUint8Array(frame.imageUrl)

          // 保存文件 - 使用批次ID避免覆盖
          const fileName = `frame_${batchId}_${String(i + 1).padStart(2, '0')}.png`
          const filePath = `${dir}\\${fileName}`
          await writeFile(filePath, uint8Array)
          successCount++
        } catch (err) {
          console.error(`保存图片 ${i + 1} 失败:`, err)
        }
      }

      toast({ title: `已保存 ${successCount}/${framesWithImage.length} 张图片`, description: `批次ID: ${batchId}` })
    } catch (error) {
      console.error('批量下载失败:', error)
      toast({ title: '下载失败', description: String(error), variant: 'destructive' })
    }
  }, [frames, toast])

  const gridTemplateColumns = `repeat(${cols}, 1fr)`

  return (
    <div
      className={getNodeContainerClass(!!selected, 'flex h-full flex-col')}
      style={{ width: 360, minHeight: 300 }}
    >
      <Handle type="target" id="target" position={Position.Left} className={getTargetHandleClass(undefined, enlargedHandles.target)} />
      <Handle type="source" id="source" position={Position.Right} className={getSourceHandleClass(undefined, enlargedHandles.source)} />

      <div className={NODE_HEADER_FLOATING_CLASS}>
        <div className={NODE_HEADER_CLASSES.container}>
          <div className={NODE_HEADER_CLASSES.title}>
            <LayoutGrid className={NODE_HEADER_CLASSES.icon} />
            <span>分镜拆分</span>
          </div>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleRowsChange(-1)} disabled={rows <= 1}>
              <Minus className="h-2 w-2" />
            </Button>
            <span className="w-3 text-center text-[10px]">{rows}</span>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleRowsChange(1)} disabled={rows >= 6}>
              <Plus className="h-2 w-2" />
            </Button>
            <span className="text-[10px] text-muted-foreground">×</span>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleColsChange(-1)} disabled={cols <= 1}>
              <Minus className="h-2 w-2" />
            </Button>
            <span className="w-3 text-center text-[10px]">{cols}</span>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleColsChange(1)} disabled={cols >= 6}>
              <Plus className="h-2 w-2" />
            </Button>
            <div className="mx-0.5 h-3 w-px bg-border" />
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { const g = Math.max(0, gap - 1); setGap(g); updateNodeData(id, { gap: g }); }} disabled={gap <= 0} title="减小间距">
              <Minus className="h-2 w-2" />
            </Button>
            <span className="w-4 text-center text-[9px] text-muted-foreground" title="间距">{gap * 4}</span>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { const g = Math.min(8, gap + 1); setGap(g); updateNodeData(id, { gap: g }); }} disabled={gap >= 8} title="增大间距">
              <Plus className="h-2 w-2" />
            </Button>
          </div>
        </div>
      </div>

      <div className="px-2 pt-7 pb-1 flex-1 overflow-auto flex flex-col gap-1.5">
        {isExecuting && (
          <div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-1 text-center text-[10px] text-muted-foreground">
              处理中... {progress}%
            </div>
          </div>
        )}

        <div
          ref={gridRef}
          className="grid flex-1"
          style={{
            gridTemplateColumns,
            gridAutoRows: '1fr',
            gap: `${gap * 4}px`,
          }}
        >
          {frames.map((frame, index) => (
            <FrameItem
              key={frame.id}
              frame={frame}
              index={index}
              onNoteChange={handleFrameNoteChange}
              onReplaceImage={handleReplaceImage}
              onDeleteFrame={handleDeleteFrame}
              onCropImage={handleCropImage}
              onMouseDown={handleFrameMouseDown}
              onDoubleClick={handleFrameDoubleClick}
              onExtractToNode={handleExtractToNode}
              isDragOver={dragOverIndex === index}
              isDragging={draggingIndex === index}
            />
          ))}
        </div>

        <div className="shrink-0 flex items-center justify-end gap-0.5 pt-1 border-t border-border/30">
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleManualMerge} disabled={!frames.some(f => f.imageUrl) || isExecuting} title="合并图片并输出到下游">
            <Merge className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleExport} disabled={!frames.some(f => f.imageUrl)} title="导出多宫格分镜">
            <Download className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleBatchDownload} disabled={!frames.some(f => f.imageUrl)} title="批量下载子图">
            <FolderDown className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      <NodeResizeHandle
        minWidth={280}
        minHeight={240}
        maxWidth={1200}
        maxHeight={1200}
      />

      {/* 裁剪对话框 */}
      {cropImageUrl && (
        <ImageCropDialog
          open={!!cropFrameId}
          imageUrl={cropImageUrl}
          onClose={() => setCropFrameId(null)}
          onSave={handleCropComplete}
        />
      )}
    </div>
  )
})

StoryboardNode.displayName = 'StoryboardNode'
