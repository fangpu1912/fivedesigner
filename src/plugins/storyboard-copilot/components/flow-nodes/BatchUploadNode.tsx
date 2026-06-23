import { memo, useState, useCallback, useRef } from 'react'
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react'
import { FolderOpen, Upload, ImageIcon, X, Plus, Trash2, Film, Music } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/useToast'
import { getImageUrl } from '@/utils/asset'
import { saveMediaFile } from '@/utils/mediaStorage'
import { useUIStore } from '@/store/useUIStore'
import { open } from '@tauri-apps/plugin-dialog'
import {
  getNodeContainerClass,
  getSourceHandleClass,
  NODE_HEADER_FLOATING_CLASS,
  NODE_HEADER_CLASSES,
} from './NodeStyles'
import { useEnlargedHandles } from '../../hooks/useEnlargedHandles'
import type { BatchUploadNodeData, BatchMediaType } from '../../types'

interface BatchUploadNodeProps extends NodeProps {
  data: BatchUploadNodeData
}

// 根据文件类型判断媒体类型
function getMediaTypeFromFile(file: File): BatchMediaType {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  return 'image' // 默认
}

function getMediaTypeFromExt(ext: string): BatchMediaType | null {
  const imageExts = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff', 'tif', 'gif', 'svg']
  const videoExts = ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv', 'm4v']
  const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma']
  if (imageExts.includes(ext)) return 'image'
  if (videoExts.includes(ext)) return 'video'
  if (audioExts.includes(ext)) return 'audio'
  return null
}

function MediaTypeIcon({ type }: { type: BatchMediaType }) {
  switch (type) {
    case 'video': return <Film className="w-4 h-4 text-blue-400" />
    case 'audio': return <Music className="w-4 h-4 text-green-400" />
    default: return <ImageIcon className="w-4 h-4 text-orange-400" />
  }
}

const MEDIA_TYPE_LABELS: Record<BatchMediaType, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
}

export const BatchUploadNode = memo(({ id, data, selected }: BatchUploadNodeProps) => {
  const { updateNodeData } = useReactFlow()
  const { toast } = useToast()
  const currentProjectId = useUIStore((state) => state.currentProjectId)
  const currentEpisodeId = useUIStore((state) => state.currentEpisodeId)
  const enlargedHandles = useEnlargedHandles(id)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isDragOver, setIsDragOver] = useState(false)

  const items = data.items || []

  // 处理文件保存
  const saveFile = useCallback(async (file: File): Promise<{ savedPath: string; fileName: string; mediaType: BatchMediaType } | null> => {
    try {
      const mediaType = getMediaTypeFromFile(file)
      const arrayBuffer = await file.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      const savedPath = await saveMediaFile(
        uint8Array,
        file.name,
        currentProjectId || undefined,
        currentEpisodeId || undefined,
        mediaType
      )
      return { savedPath, fileName: file.name, mediaType }
    } catch (error) {
      console.error('保存文件失败:', error)
      return null
    }
  }, [currentProjectId, currentEpisodeId])

  // 批量添加文件
  const addFiles = useCallback(async (files: File[]) => {
    const mediaFiles = files.filter(f => f.type.startsWith('image/') || f.type.startsWith('video/') || f.type.startsWith('audio/'))
    if (mediaFiles.length === 0) {
      toast({ title: '未找到支持的媒体文件', variant: 'destructive' })
      return
    }

    const newItems = [...items]
    for (const file of mediaFiles) {
      const result = await saveFile(file)
      if (result) {
        newItems.push({
          id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          mediaUrl: result.savedPath,
          mediaType: result.mediaType,
          sourceFileName: result.fileName,
          status: 'done',
        })
      }
    }

    updateNodeData(id, { ...data, items: newItems } as BatchUploadNodeData)
    toast({ title: `已添加 ${mediaFiles.length} 个文件` })
  }, [items, data, id, updateNodeData, saveFile, toast])

  // 选择文件夹
  const handleSelectFolder = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        title: '选择媒体文件夹',
      })
      if (!selected) return

      const { readDir } = await import('@tauri-apps/plugin-fs')
      const entries = await readDir(selected as string)

      const newItems = [...items]
      let count = 0

      for (const entry of entries) {
        if (entry.isDirectory) continue
        const ext = entry.name.split('.').pop()?.toLowerCase() || ''
        const mediaType = getMediaTypeFromExt(ext)
        if (!mediaType) continue

        try {
          const { readFile } = await import('@tauri-apps/plugin-fs')
          const { join } = await import('@tauri-apps/api/path')
          const filePath = await join(selected as string, entry.name)
          const fileData = await readFile(filePath)
          const uint8Array = new Uint8Array(fileData)
          const savedPath = await saveMediaFile(
            uint8Array,
            entry.name,
            currentProjectId || undefined,
            currentEpisodeId || undefined,
            mediaType
          )

          newItems.push({
            id: `item-${Date.now()}-${count}`,
            mediaUrl: savedPath,
            mediaType,
            sourceFileName: entry.name,
            status: 'done',
          })
          count++
        } catch (err) {
          console.error(`读取文件失败: ${entry.name}`, err)
        }
      }

      updateNodeData(id, { ...data, items: newItems, sourceFolder: selected } as BatchUploadNodeData)
      toast({ title: `从文件夹添加了 ${count} 个文件` })
    } catch (error) {
      console.error('选择文件夹失败:', error)
      toast({ title: '选择文件夹失败', variant: 'destructive' })
    }
  }, [items, data, id, updateNodeData, currentProjectId, currentEpisodeId, toast])

  // 文件输入
  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) addFiles(files)
    e.target.value = ''
  }, [addFiles])

  // 拖拽
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) addFiles(files)
  }, [addFiles])

  // 删除单个
  const handleRemoveItem = useCallback((itemId: string) => {
    const newItems = items.filter(i => i.id !== itemId)
    updateNodeData(id, { ...data, items: newItems } as BatchUploadNodeData)
  }, [items, data, id, updateNodeData])

  // 清空全部
  const handleClearAll = useCallback(() => {
    updateNodeData(id, { ...data, items: [], sourceFolder: null } as BatchUploadNodeData)
  }, [data, id, updateNodeData])

  // 统计
  const imageCount = items.filter(i => i.mediaType === 'image').length
  const videoCount = items.filter(i => i.mediaType === 'video').length
  const audioCount = items.filter(i => i.mediaType === 'audio').length

  return (
    <div
      className={getNodeContainerClass(selected, 'flex h-full flex-col')}
      style={{ width: 320, height: 400 }}
    >
      <div className={NODE_HEADER_FLOATING_CLASS}>
        <div className={NODE_HEADER_CLASSES.container}>
          <div className={NODE_HEADER_CLASSES.title}>
            <FolderOpen className={NODE_HEADER_CLASSES.icon} />
            <span>批量上传</span>
          </div>
          {items.length > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              {imageCount > 0 && <span>{imageCount}图</span>}
              {videoCount > 0 && <span>{videoCount}视</span>}
              {audioCount > 0 && <span>{audioCount}音</span>}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col h-full">
        {/* 文件网格 */}
        <div
          className={`flex-1 min-h-0 p-2 overflow-y-auto ${isDragOver ? 'bg-primary/10' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {items.length === 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
              <div className="flex items-center gap-3 opacity-40">
                <ImageIcon className="w-8 h-8" />
                <Film className="w-8 h-8" />
                <Music className="w-8 h-8" />
              </div>
              <p className="text-[11px]">拖拽图片/视频/音频到此处</p>
              <p className="text-[10px] opacity-60">或点击下方按钮选择</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {items.map((item) => (
                <div key={item.id} className="relative group aspect-square rounded-md overflow-hidden border border-border/40 bg-muted/20">
                  {item.mediaType === 'image' ? (
                    <img
                      src={getImageUrl(item.mediaUrl) || ''}
                      alt={item.sourceFileName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-muted/30 gap-1">
                      <MediaTypeIcon type={item.mediaType} />
                      <span className="text-[8px] text-muted-foreground">{MEDIA_TYPE_LABELS[item.mediaType]}</span>
                    </div>
                  )}
                  <button
                    onClick={() => handleRemoveItem(item.id)}
                    className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5">
                    <p className="text-[8px] text-white truncate">{item.sourceFileName}</p>
                  </div>
                </div>
              ))}
              {/* 添加更多按钮 */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square rounded-md border border-dashed border-border/60 bg-muted/10 flex items-center justify-center text-muted-foreground hover:bg-muted/30 transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="border-t border-border/40 bg-muted/20 px-2 py-2 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px] flex-1"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-3 h-3 mr-1" />
              选择文件
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px] flex-1"
              onClick={handleSelectFolder}
            >
              <FolderOpen className="w-3 h-3 mr-1" />
              选择文件夹
            </Button>
          </div>
          {items.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] w-full text-destructive hover:text-destructive"
              onClick={handleClearAll}
            >
              <Trash2 className="w-3 h-3 mr-1" />
              清空全部
            </Button>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,audio/*"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />

      <Handle type="source" id="images" position={Position.Right} className={getSourceHandleClass(undefined, enlargedHandles.source)} />
    </div>
  )
})

BatchUploadNode.displayName = 'BatchUploadNode'
