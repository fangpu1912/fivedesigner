import { useState } from 'react'

import { convertFileSrc } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'
import { Download, Check, Image as ImageIcon, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'

type ExportFormat = 'png' | 'jpg' | 'webp'
type ExportMode = 'individual' | 'combined'

interface ExportItem {
  id: string
  name: string
  image?: string | null
}

interface BatchExportProps {
  items: ExportItem[]
  onClose?: () => void
}

function getImageSrc(src: string) {
  return src.startsWith('http') || src.startsWith('data:') ? src : convertFileSrc(src)
}

export function BatchExport({ items, onClose }: BatchExportProps) {
  const { toast } = useToast()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(items.filter(item => item.image).map(item => item.id))
  )
  const [format, setFormat] = useState<ExportFormat>('png')
  const [mode, setMode] = useState<ExportMode>('individual')
  const [quality, setQuality] = useState(90)
  const [isExporting, setIsExporting] = useState(false)

  const selectableItems = items.filter(item => item.image)
  const allSelected = selectableItems.length > 0 && selectedIds.size === selectableItems.length

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(selectableItems.map(item => item.id)))
  }

  const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image()
      const resolvedSrc = getImageSrc(src)
      if (resolvedSrc && !resolvedSrc.startsWith('asset://') && !resolvedSrc.startsWith('data:')) {
        image.crossOrigin = 'anonymous'
      }
      image.onload = () => resolve(image)
      image.onerror = reject
      image.src = resolvedSrc
    })

  const writeDataUrlToFile = async (dataUrl: string, filePath: string) => {
    const base64 = dataUrl.split(',')[1] || ''
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    await writeFile(filePath, bytes)
  }

  const saveSingleImage = async (imageSrc: string, filePath: string) => {
    const image = await loadImage(imageSrc)
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')

    if (!context) {
      return
    }

    context.drawImage(image, 0, 0)
    const mimeType = format === 'jpg' ? 'image/jpeg' : `image/${format}`
    const dataUrl = canvas.toDataURL(mimeType, quality / 100)
    await writeDataUrlToFile(dataUrl, filePath)
  }

  const exportCombined = async (selectedItems: ExportItem[]) => {
    const images = (
      await Promise.all(
        selectedItems.map(item => (item.image ? loadImage(item.image) : Promise.resolve(null)))
      )
    ).filter(Boolean) as HTMLImageElement[]
    if (images.length === 0) {
      return
    }

    const cols = Math.ceil(Math.sqrt(images.length))
    const rows = Math.ceil(images.length / cols)
    const cellWidth = Math.max(...images.map(image => image.width))
    const cellHeight = Math.max(...images.map(image => image.height))

    const canvas = document.createElement('canvas')
    canvas.width = cols * cellWidth
    canvas.height = rows * cellHeight
    const context = canvas.getContext('2d')

    if (!context) {
      return
    }

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)

    images.forEach((image, index) => {
      const col = index % cols
      const row = Math.floor(index / cols)
      const x = col * cellWidth + (cellWidth - image.width) / 2
      const y = row * cellHeight + (cellHeight - image.height) / 2
      context.drawImage(image, x, y)
    })

    const mimeType = format === 'jpg' ? 'image/jpeg' : `image/${format}`
    const dataUrl = canvas.toDataURL(mimeType, quality / 100)
    const filePath = await save({
      defaultPath: `batch-export.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    })

    if (filePath) {
      await writeDataUrlToFile(dataUrl, filePath)
    }
  }

  const handleExport = async () => {
    const selectedItems = items.filter(item => selectedIds.has(item.id) && item.image)
    if (selectedItems.length === 0) {
      toast({ title: 'Select at least one image', variant: 'destructive' })
      return
    }

    setIsExporting(true)
    try {
      if (mode === 'combined') {
        await exportCombined(selectedItems)
      } else {
        for (const item of selectedItems) {
          const filePath = await save({
            defaultPath: `${item.name}.${format}`,
            filters: [{ name: format.toUpperCase(), extensions: [format] }],
          })
          if (filePath && item.image) {
            await saveSingleImage(item.image, filePath)
          }
        }
      }

      toast({ title: 'Export completed' })
      onClose?.()
    } catch (error) {
      toast({
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Card className="w-full max-w-3xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          Batch Export
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Selected {selectedIds.size} / {selectableItems.length}
          </div>
          <Button variant="outline" size="sm" onClick={toggleSelectAll}>
            {allSelected ? 'Clear Selection' : 'Select All'}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {selectableItems.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => toggleSelect(item.id)}
              className={cn(
                'relative overflow-hidden rounded-lg border text-left transition-colors',
                selectedIds.has(item.id) ? 'ring-2 ring-primary' : 'hover:bg-accent'
              )}
            >
              <div className="aspect-square bg-muted">
                {item.image ? (
                  <img
                    src={getImageSrc(item.image)}
                    alt={item.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
              </div>
              {selectedIds.has(item.id) ? (
                <div className="absolute left-2 top-2 rounded-full bg-primary p-1 text-primary-foreground">
                  <Check className="h-3 w-3" />
                </div>
              ) : null}
              <div className="truncate border-t px-2 py-1 text-xs">{item.name}</div>
            </button>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Format</label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={format}
              onChange={event => setFormat(event.target.value as ExportFormat)}
            >
              <option value="png">PNG</option>
              <option value="jpg">JPG</option>
              <option value="webp">WebP</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Mode</label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={mode}
              onChange={event => setMode(event.target.value as ExportMode)}
            >
              <option value="individual">Individual Files</option>
              <option value="combined">Combined Sheet</option>
            </select>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span>Quality</span>
            <span>{quality}</span>
          </div>
          <Slider
            value={[quality]}
            min={50}
            max={100}
            step={1}
            onValueChange={value => setQuality(value[0] || 90)}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={() => void handleExport()} disabled={isExporting}>
            {isExporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export
          </Button>
          <Button variant="outline" onClick={onClose} disabled={isExporting}>
            Close
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default BatchExport
