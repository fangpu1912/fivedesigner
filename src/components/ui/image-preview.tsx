import { useState, useEffect } from 'react'

import { save } from '@tauri-apps/plugin-dialog'
import { readFile, writeFile } from '@tauri-apps/plugin-fs'
import { ZoomIn, ZoomOut, X, Download } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/hooks/useToast'

interface ImagePreviewProps {
  src: string
  alt?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  resolution?: { width: number; height: number }
}

export function ImagePreview({ src, alt = '', open, onOpenChange, resolution }: ImagePreviewProps) {
  const [scale, setScale] = useState(1)
  const [imageResolution, setImageResolution] = useState<{ width: number; height: number } | null>(
    resolution || null
  )
  const [isDownloading, setIsDownloading] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (open && src && !resolution) {
      const img = new Image()
      img.onload = () => {
        setImageResolution({ width: img.naturalWidth, height: img.naturalHeight })
      }
      img.src = src
    }
  }, [open, src, resolution])

  useEffect(() => {
    if (!open) {
      setScale(1)
    }
  }, [open])

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.25, 3))
  }

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.25, 0.5))
  }

  const handleDownload = async () => {
    if (isDownloading) return
    setIsDownloading(true)

    try {
      // 判断是否为本地文件路径（以 file:// 开头）
      const isLocalFile = src.startsWith('file://') || src.startsWith('asset://')

      // 生成默认文件名
      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const defaultName = `${alt || 'image'}_${timestamp}.png`

      // 打开保存对话框
      const savePath = await save({
        defaultPath: defaultName,
        filters: [
          { name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
          { name: '所有文件', extensions: ['*'] },
        ],
        title: '保存图片',
      })

      if (!savePath) {
        setIsDownloading(false)
        return // 用户取消了保存
      }

      if (isLocalFile) {
        // 本地文件：直接读取并保存
        let filePath = src
        if (filePath.startsWith('file://')) {
          filePath = decodeURIComponent(filePath.slice(7))
        } else if (filePath.startsWith('asset://')) {
          filePath = decodeURIComponent(filePath.slice(8))
        }

        const fileData = await readFile(filePath)
        await writeFile(savePath, fileData)
      } else {
        // 网络图片：先下载再保存
        const response = await fetch(src)
        const blob = await response.blob()
        const arrayBuffer = await blob.arrayBuffer()
        const uint8Array = new Uint8Array(arrayBuffer)
        await writeFile(savePath, uint8Array)
      }

      toast({
        title: '下载成功',
        description: `图片已保存到: ${savePath}`,
      })
    } catch (error) {
      console.error('下载失败:', error)
      toast({
        title: '下载失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      })
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 overflow-hidden bg-background/95">
        <DialogTitle className="sr-only">图片预览</DialogTitle>

        {/* 工具栏 */}
        <div className="absolute top-4 left-4 right-4 z-50 flex items-center justify-between">
          <div className="flex items-center gap-2 bg-background/80 backdrop-blur-sm rounded-lg px-3 py-1.5">
            <span className="text-sm text-muted-foreground">
              {imageResolution
                ? `${imageResolution.width} × ${imageResolution.height}`
                : '加载中...'}
            </span>
            <span className="text-sm text-muted-foreground">|</span>
            <span className="text-sm text-muted-foreground">{Math.round(scale * 100)}%</span>
          </div>

          <div className="flex items-center gap-1 bg-background/80 backdrop-blur-sm rounded-lg p-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleZoomOut}
              disabled={scale <= 0.5}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleZoomIn}
              disabled={scale >= 3}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleDownload}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
              ) : (
                <Download className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 图片容器 */}
        <div className="flex items-center justify-center min-h-[300px] max-h-[85vh] overflow-auto p-8">
          <img
            src={src}
            alt={alt}
            className="max-w-none transition-transform duration-200 ease-out"
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'center center',
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
