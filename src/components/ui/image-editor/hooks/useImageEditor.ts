import { useState, useRef, useCallback, useEffect } from 'react'
import { save } from '@tauri-apps/plugin-dialog'
import { writeFile, mkdir } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'

import { useToast } from '@/hooks/useToast'
import { isTauriEnv } from '@/utils/asset'
import { workspaceService } from '@/services/workspace/WorkspaceService'
import { AI } from '@/services/vendor'

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

export interface ImageResolution {
  width: number
  height: number
}

export function useImageEditor(src: string, open: boolean) {
  const { toast } = useToast()

  const [scale, setScale] = useState(1)
  const [editMode, setEditMode] = useState<EditMode>('view')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [imageResolution, setImageResolution] = useState<ImageResolution | null>(null)

  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [annotationType, setAnnotationType] = useState<AnnotationType>('rect')
  const [annotationColor, setAnnotationColor] = useState('#ef4444')
  const [tempAnnotation, setTempAnnotation] = useState<Annotation | null>(null)
  const [editingText, setEditingText] = useState<string | null>(null)
  const [textInput, setTextInput] = useState('')

  const [cropArea, setCropArea] = useState<CropArea | null>(null)
  const [cropAspectRatio, setCropAspectRatio] = useState<number | null>(null)

  const [splitRows, setSplitRows] = useState(2)
  const [splitCols, setSplitCols] = useState(2)
  const [splitLineWidth, setSplitLineWidth] = useState(0.5)
  const [isSplitting, setIsSplitting] = useState(false)

  const [aiBrushType, setAiBrushType] = useState<AIBrushType>('brush')
  const [aiBrushSize, setAiBrushSize] = useState(30)
  const [aiPrompt, setAiPrompt] = useState('')
  const [isAiProcessing, setIsAiProcessing] = useState(false)
  const [maskCanvas, setMaskCanvas] = useState<HTMLCanvasElement | null>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null)

  const [pastedImages, setPastedImages] = useState<PastedImage[]>([])
  const [selectedPastedId, setSelectedPastedId] = useState<string | null>(null)
  const [isDraggingPasted, setIsDraggingPasted] = useState(false)
  const [pastedDragOffset, setPastedDragOffset] = useState({ x: 0, y: 0 })

  const [isDrawing, setIsDrawing] = useState(false)
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 })

  const [isDownloading, setIsDownloading] = useState(false)
  const [isCopying, setIsCopying] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  function setCrossOriginIfNeeded(img: HTMLImageElement, imageSrc: string) {
    if (!imageSrc.startsWith('asset://')) {
      img.crossOrigin = 'anonymous'
    }
  }

  useEffect(() => {
    if (open && src) {
      const img = new Image()
      setCrossOriginIfNeeded(img, src)
      img.onload = () => {
        setImageResolution({ width: img.naturalWidth, height: img.naturalHeight })
      }
      img.onerror = () => {
        console.error('[ImageEditor] 图片加载失败:', src)
      }
      img.src = src
    }
  }, [open, src])

  const resetEditor = useCallback(() => {
    setScale(1)
    setEditMode('view')
    setAnnotations([])
    setCropArea(null)
    setCropAspectRatio(null)
    setTempAnnotation(null)
    setEditingText(null)
    setSplitRows(2)
    setSplitCols(2)
    setSplitLineWidth(0.5)
    setAiBrushType('brush')
    setAiBrushSize(30)
    setAiPrompt('')
    setMaskCanvas(null)
    setPastedImages([])
    setSelectedPastedId(null)
    setIsDraggingPasted(false)
    if (maskCanvasRef.current) {
      const ctx = maskCanvasRef.current.getContext('2d')
      ctx?.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height)
    }
    maskCanvasRef.current = null
  }, [])

  useEffect(() => {
    if (!open) {
      resetEditor()
    }
  }, [open, resetEditor])

  const handleZoomIn = useCallback(() => setScale(prev => Math.min(prev + 0.25, 3)), [])
  const handleZoomOut = useCallback(() => setScale(prev => Math.max(prev - 0.25, 0.5)), [])

  const handleModeChange = useCallback((mode: EditMode) => {
    setEditMode(prev => prev === mode ? 'view' : mode)
    setCropArea(null)
    setTempAnnotation(null)
  }, [])

  const addAnnotation = useCallback((annotation: Annotation) => {
    setAnnotations(prev => [...prev, annotation])
  }, [])

  const updateAnnotation = useCallback((id: string, updates: Partial<Annotation>) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a))
  }, [])

  const deleteAnnotation = useCallback((id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id))
  }, [])

  const clearAnnotations = useCallback(() => {
    setAnnotations([])
    setTempAnnotation(null)
  }, [])

  const applyCrop = useCallback(async (): Promise<string | null> => {
    if (!cropArea || !imageResolution) return null

    const img = new Image()
    setCrossOriginIfNeeded(img, src)
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = reject
      img.src = src
    })

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    canvas.width = Math.max(1, Math.round(cropArea.width))
    canvas.height = Math.max(1, Math.round(cropArea.height))

    ctx.drawImage(
      img,
      cropArea.x, cropArea.y, cropArea.width, cropArea.height,
      0, 0, canvas.width, canvas.height
    )

    return canvas.toDataURL('image/png')
  }, [cropArea, imageResolution, src])

  const clearMask = useCallback(() => {
    if (maskCanvasRef.current) {
      const ctx = maskCanvasRef.current.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height)
      }
    }
    setMaskCanvas(null)
    maskCanvasRef.current = null
  }, [])

  const initMaskCanvas = useCallback(() => {
    if (!maskCanvasRef.current && imageResolution) {
      const canvas = document.createElement('canvas')
      canvas.width = imageResolution.width
      canvas.height = imageResolution.height
      maskCanvasRef.current = canvas
      setMaskCanvas(canvas)
    }
  }, [imageResolution])

  const addPastedImage = useCallback((image: PastedImage) => {
    setPastedImages(prev => [...prev, image])
    setSelectedPastedId(image.id)
  }, [])

  const removePastedImage = useCallback((id: string) => {
    setPastedImages(prev => prev.filter(p => p.id !== id))
    setSelectedPastedId(null)
  }, [])

  const updatePastedImage = useCallback((id: string, updates: Partial<PastedImage>) => {
    setPastedImages(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p))
  }, [])

  const drawArrow = useCallback((ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string) => {
    const headLength = 15
    const angle = Math.atan2(y2 - y1, x2 - x1)

    ctx.strokeStyle = color
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(x2, y2)
    ctx.lineTo(
      x2 - headLength * Math.cos(angle - Math.PI / 6),
      y2 - headLength * Math.sin(angle - Math.PI / 6)
    )
    ctx.lineTo(
      x2 - headLength * Math.cos(angle + Math.PI / 6),
      y2 - headLength * Math.sin(angle + Math.PI / 6)
    )
    ctx.closePath()
    ctx.fill()
  }, [])

  const renderToCanvas = useCallback(async (): Promise<HTMLCanvasElement> => {
    const img = new Image()
    setCrossOriginIfNeeded(img, src)
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = reject
      img.src = src
    })

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight

    ctx.drawImage(img, 0, 0)

    annotations.forEach(ann => {
      ctx.strokeStyle = ann.color
      ctx.fillStyle = ann.color
      ctx.lineWidth = 3

      switch (ann.type) {
        case 'rect':
          if (ann.width && ann.height) {
            ctx.strokeRect(ann.x, ann.y, ann.width, ann.height)
          }
          break
        case 'circle':
          if (ann.width && ann.height) {
            ctx.beginPath()
            ctx.ellipse(
              ann.x + ann.width / 2,
              ann.y + ann.height / 2,
              ann.width / 2,
              ann.height / 2,
              0,
              0,
              Math.PI * 2
            )
            ctx.stroke()
          }
          break
        case 'arrow':
          if (ann.endX !== undefined && ann.endY !== undefined) {
            drawArrow(ctx, ann.x, ann.y, ann.endX, ann.endY, ann.color)
          }
          break
        case 'freehand':
          if (ann.points && ann.points.length > 1) {
            ctx.beginPath()
            ctx.moveTo(ann.points[0]?.x ?? 0, ann.points[0]?.y ?? 0)
            ann.points.forEach((p, i) => {
              if (i > 0) ctx.lineTo(p.x, p.y)
            })
            ctx.stroke()
          }
          break
        case 'text':
          if (ann.text) {
            ctx.font = 'bold 24px sans-serif'
            ctx.fillText(ann.text, ann.x, ann.y)
          }
          break
      }
    })

    for (const pasted of pastedImages) {
      const pastedImg = new Image()
      setCrossOriginIfNeeded(pastedImg, pasted.src)
      await new Promise<void>((resolve, reject) => {
        pastedImg.onload = () => resolve()
        pastedImg.onerror = reject
        pastedImg.src = pasted.src
      })
      ctx.globalAlpha = pasted.opacity
      ctx.drawImage(pastedImg, pasted.x, pasted.y, pasted.width, pasted.height)
      ctx.globalAlpha = 1
    }

    return canvas
  }, [src, annotations, pastedImages, drawArrow])

  const handleDownload = useCallback(async () => {
    if (isDownloading) return
    setIsDownloading(true)

    try {
      const canvas = await renderToCanvas()
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/png')
      })
      const arrayBuffer = await blob.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)

      if (isTauriEnv()) {
        const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
        const savePath = await save({
          defaultPath: `image_${timestamp}.png`,
          filters: [
            { name: 'PNG 图片', extensions: ['png'] },
            { name: 'JPEG 图片', extensions: ['jpg', 'jpeg'] },
            { name: '所有文件', extensions: ['*'] },
          ],
          title: '保存图片',
        })

        if (savePath) {
          await writeFile(savePath, uint8Array)
          toast({ title: '下载成功', description: `已保存到: ${savePath}` })
        }
      } else {
        const url = canvas.toDataURL('image/png')
        const link = document.createElement('a')
        link.href = url
        link.download = `image_${Date.now()}.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        toast({ title: '下载成功' })
      }
    } catch (error) {
      console.error('下载失败:', error)
      toast({ title: '下载失败', variant: 'destructive' })
    } finally {
      setIsDownloading(false)
    }
  }, [isDownloading, renderToCanvas, toast])

  const handleCopy = useCallback(async () => {
    if (isCopying) return
    setIsCopying(true)

    try {
      const canvas = await renderToCanvas()
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/png')
      })

      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      toast({ title: '已复制到剪贴板' })
    } catch (error) {
      console.error('复制失败:', error)
      toast({ title: '复制失败', variant: 'destructive' })
    } finally {
      setIsCopying(false)
    }
  }, [isCopying, renderToCanvas, toast])

  const handlePaste = useCallback(async () => {
    if (!imageResolution) return

    try {
      const clipboardItems = await navigator.clipboard.read()
      let imageDataUrl = ''

      for (const item of clipboardItems) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type)
            imageDataUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader()
              reader.onload = () => resolve(reader.result as string)
              reader.readAsDataURL(blob)
            })
            break
          }
        }
        if (imageDataUrl) break
      }

      if (!imageDataUrl) {
        imageDataUrl = src
      }

      const img = new Image()
      setCrossOriginIfNeeded(img, imageDataUrl || src)
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = reject
        img.src = imageDataUrl || src
      })

      const pasteWidth = Math.min(img.naturalWidth, imageResolution.width * 0.5)
      const pasteScale = pasteWidth / img.naturalWidth
      const pasteHeight = img.naturalHeight * pasteScale

      const newPastedImage: PastedImage = {
        id: `pasted-${Date.now()}`,
        src: imageDataUrl,
        x: imageResolution.width * 0.25,
        y: imageResolution.height * 0.25,
        width: pasteWidth,
        height: pasteHeight,
        opacity: 1,
      }

      addPastedImage(newPastedImage)
      toast({ title: '已粘贴到画布', description: '拖拽可调整位置' })
    } catch (error) {
      console.error('粘贴失败:', error)
      toast({ title: '粘贴失败', variant: 'destructive' })
    }
  }, [imageResolution, src, addPastedImage, toast])

  const handleApplySplit = useCallback(async () => {
    if (!imageResolution || isSplitting) return
    setIsSplitting(true)

    try {
      const img = new Image()
      setCrossOriginIfNeeded(img, src)
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = reject
        img.src = src
      })

      const { width, height } = imageResolution
      const lineWidth = splitLineWidth

      const totalLineWidthX = (splitCols - 1) * lineWidth
      const totalLineWidthY = (splitRows - 1) * lineWidth
      const cellWidth = (width - totalLineWidthX) / splitCols
      const cellHeight = (height - totalLineWidthY) / splitRows

      const splitImages: string[] = []

      for (let row = 0; row < splitRows; row++) {
        for (let col = 0; col < splitCols; col++) {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')!
          canvas.width = Math.max(1, Math.floor(cellWidth))
          canvas.height = Math.max(1, Math.floor(cellHeight))

          const sx = col * (cellWidth + lineWidth)
          const sy = row * (cellHeight + lineWidth)

          ctx.drawImage(
            img,
            sx, sy, cellWidth, cellHeight,
            0, 0, canvas.width, canvas.height
          )

          const dataUrl = canvas.toDataURL('image/png')
          splitImages.push(dataUrl)
        }
      }

      if (isTauriEnv()) {
        const workspacePath = await workspaceService.getWorkspacePath()
        const splitDir = await join(workspacePath, 'temp', 'splits', `${Date.now()}`)
        await mkdir(splitDir, { recursive: true })

        for (let i = 0; i < splitImages.length; i++) {
          const dataUrl = splitImages[i]
          const base64 = dataUrl?.split(',')[1]
      if (!base64) continue
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let j = 0; j < binary.length; j++) {
        bytes[j] = binary.charCodeAt(j)
      }

          const fileName = `split_${String(i + 1).padStart(2, '0')}.png`
          const filePath = await join(splitDir, fileName)
          await writeFile(filePath, bytes)
        }

        toast({
          title: '切割完成',
          description: `已生成 ${splitImages.length} 张图片，保存到: ${splitDir}`,
        })
      } else {
        splitImages.forEach((dataUrl, index) => {
          const link = document.createElement('a')
          link.href = dataUrl
          link.download = `split_${String(index + 1).padStart(2, '0')}.png`
          setTimeout(() => link.click(), index * 100)
        })

        toast({
          title: '切割完成',
          description: `已生成 ${splitImages.length} 张图片并开始下载`,
        })
      }

      setEditMode('view')
    } catch (error) {
      console.error('切割失败:', error)
      toast({ title: '切割失败', variant: 'destructive' })
    } finally {
      setIsSplitting(false)
    }
  }, [imageResolution, isSplitting, src, splitRows, splitCols, splitLineWidth, toast])

  const handleAiEdit = useCallback(async () => {
    if (!aiPrompt.trim() || !imageResolution || isAiProcessing) return
    setIsAiProcessing(true)

    try {
      let maskBase64 = ''
      if (maskCanvasRef.current) {
        maskBase64 = maskCanvasRef.current.toDataURL('image/png')
      }

      const img = new Image()
      setCrossOriginIfNeeded(img, src)
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = reject
        img.src = src
      })

      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const imageBase64 = canvas.toDataURL('image/png')

      const result = await AI.Image.generate(
        {
          prompt: aiPrompt,
          imageBase64: maskBase64 ? [imageBase64, maskBase64] : [imageBase64],
          size: '1K',
          aspectRatio: `${imageResolution.width}:${imageResolution.height}`,
        },
        'official:claude-sonnet-4-6',
        0
      )

      if (result) {
        toast({ title: 'AI 编辑完成', description: '图片已成功修改' })
        setEditMode('view')
        clearMask()
        setAiPrompt('')
      }
    } catch (error) {
      console.error('AI 编辑失败:', error)
      toast({ title: 'AI 编辑失败', variant: 'destructive' })
    } finally {
      setIsAiProcessing(false)
    }
  }, [aiPrompt, imageResolution, isAiProcessing, src, clearMask, toast])

  const handleMaskMouseDown = useCallback((e: React.MouseEvent, imageRef: React.RefObject<HTMLImageElement | null>) => {
    if (!imageRef.current || !imageResolution) return

    const rect = imageRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / scale
    const y = (e.clientY - rect.top) / scale

    if (!maskCanvasRef.current) {
      const canvas = document.createElement('canvas')
      canvas.width = imageResolution.width
      canvas.height = imageResolution.height
      maskCanvasRef.current = canvas
      setMaskCanvas(canvas)
    }

    setIsDrawing(true)
    setDrawStart({ x, y })

    drawMask(x, y, false, imageRef)
  }, [imageResolution, scale])

  const handleMaskMouseMove = useCallback((e: React.MouseEvent, imageRef: React.RefObject<HTMLImageElement | null>) => {
    if (!isDrawing || !imageRef.current) return

    const rect = imageRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / scale
    const y = (e.clientY - rect.top) / scale

    drawMask(x, y, true, imageRef)
  }, [isDrawing, scale])

  const drawMask = useCallback((x: number, y: number, isContinuous: boolean, imageRef: React.RefObject<HTMLImageElement | null>) => {
    if (!maskCanvasRef.current || !imageResolution || !imageRef.current) return

    const ctx = maskCanvasRef.current.getContext('2d')
    if (!ctx) return

    const displayWidth = imageRef.current.clientWidth || imageResolution.width
    const displayHeight = imageRef.current.clientHeight || imageResolution.height

    const scaleX = imageResolution.width / displayWidth
    const scaleY = imageResolution.height / displayHeight
    const actualX = x * scaleX
    const actualY = y * scaleY
    const actualBrushSize = aiBrushSize * scaleX

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = actualBrushSize

    if (aiBrushType === 'brush') {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
    } else {
      ctx.globalCompositeOperation = 'destination-out'
    }

    if (isContinuous) {
      ctx.beginPath()
      ctx.moveTo(drawStart.x * scaleX, drawStart.y * scaleY)
      ctx.lineTo(actualX, actualY)
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.arc(actualX, actualY, actualBrushSize / 2, 0, Math.PI * 2)
      ctx.fill()
    }

    setDrawStart({ x, y })
    setMaskCanvas(maskCanvasRef.current)
  }, [imageResolution, aiBrushSize, aiBrushType, drawStart])

  const handlePastedMouseDown = useCallback((e: React.MouseEvent, id: string, imageRef: React.RefObject<HTMLImageElement | null>) => {
    e.stopPropagation()
    setSelectedPastedId(id)
    setIsDraggingPasted(true)

    const pasted = pastedImages.find(p => p.id === id)
    if (pasted && imageRef.current) {
      const rect = imageRef.current.getBoundingClientRect()
      setPastedDragOffset({
        x: (e.clientX - rect.left) / scale - pasted.x,
        y: (e.clientY - rect.top) / scale - pasted.y,
      })
    }
  }, [pastedImages, scale])

  const handlePastedMouseMove = useCallback((e: React.MouseEvent, imageRef: React.RefObject<HTMLImageElement | null>) => {
    if (!isDraggingPasted || !selectedPastedId || !imageRef.current) return

    const rect = imageRef.current.getBoundingClientRect()
    const newX = (e.clientX - rect.left) / scale - pastedDragOffset.x
    const newY = (e.clientY - rect.top) / scale - pastedDragOffset.y

    setPastedImages(prev =>
      prev.map(p =>
        p.id === selectedPastedId
          ? { ...p, x: Math.max(0, newX), y: Math.max(0, newY) }
          : p
      )
    )
  }, [isDraggingPasted, selectedPastedId, scale, pastedDragOffset])

  const handlePastedMouseUp = useCallback(() => {
    setIsDraggingPasted(false)
  }, [])

  return {
    scale,
    editMode,
    isFullscreen,
    imageResolution,
    setIsFullscreen,
    handleZoomIn,
    handleZoomOut,
    handleModeChange,

    annotations,
    annotationType,
    annotationColor,
    tempAnnotation,
    editingText,
    textInput,
    setAnnotationType,
    setAnnotationColor,
    setTempAnnotation,
    setEditingText,
    setTextInput,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    clearAnnotations,

    cropArea,
    cropAspectRatio,
    setCropArea,
    setCropAspectRatio,
    applyCrop,

    splitRows,
    splitCols,
    splitLineWidth,
    isSplitting,
    setSplitRows,
    setSplitCols,
    setSplitLineWidth,
    setIsSplitting,
    handleApplySplit,

    aiBrushType,
    aiBrushSize,
    aiPrompt,
    isAiProcessing,
    maskCanvas,
    maskCanvasRef,
    setAiBrushType,
    setAiBrushSize,
    setAiPrompt,
    setIsAiProcessing,
    setMaskCanvas,
    clearMask,
    initMaskCanvas,
    handleAiEdit,
    handleMaskMouseDown,
    handleMaskMouseMove,
    drawMask,

    pastedImages,
    selectedPastedId,
    isDraggingPasted,
    setSelectedPastedId,
    addPastedImage,
    removePastedImage,
    updatePastedImage,
    handlePastedMouseDown,
    handlePastedMouseMove,
    handlePastedMouseUp,

    isDrawing,
    drawStart,
    setIsDrawing,
    setDrawStart,

    isDownloading,
    isCopying,
    handleDownload,
    handleCopy,
    handlePaste,

    resetEditor,
    renderToCanvas,

    fileInputRef,
  }
}
