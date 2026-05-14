import { useState, useRef, useCallback } from 'react'

import { Upload, FileAudio, X, Check, Loader2, AlertCircle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { voiceService } from '@/services/voiceService'
import type { Voice } from '@/types/voice'

interface VoiceBatchUploaderProps {
  onUploadSuccess?: (voices: Voice[]) => void
  onCancel?: () => void
  className?: string
}

interface UploadItem {
  id: string
  file: File
  name: string
  description: string
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
  voice?: Voice
}

export function VoiceBatchUploader({
  onUploadSuccess,
  onCancel,
  className,
}: VoiceBatchUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [items, setItems] = useState<UploadItem[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [globalDescription, setGlobalDescription] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 处理文件选择
  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files) return

    const newItems: UploadItem[] = []

    Array.from(files).forEach(file => {
      // 验证文件
      const validation = voiceService.validateAudioFile(file)
      if (!validation.valid) {
        console.warn(`跳过无效文件 ${file.name}: ${validation.error}`)
        return
      }

      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '')
      newItems.push({
        id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        file,
        name: nameWithoutExt,
        description: '',
        status: 'pending',
      })
    })

    if (newItems.length > 0) {
      setItems(prev => [...prev, ...newItems])
    }
  }, [])

  // 处理文件输入变化
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files)
    // 清空 input 以便可以重复选择相同文件
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // 处理拖放
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFileSelect(e.dataTransfer.files)
  }

  // 移除项目
  const removeItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id))
  }

  // 更新项目名称
  const updateItemName = (id: string, name: string) => {
    setItems(prev => prev.map(item => (item.id === id ? { ...item, name } : item)))
  }

  // 更新项目描述
  const updateItemDescription = (id: string, description: string) => {
    setItems(prev => prev.map(item => (item.id === id ? { ...item, description } : item)))
  }

  // 应用全局描述到所有项目
  const applyGlobalDescription = () => {
    if (!globalDescription.trim()) return
    setItems(prev =>
      prev.map(item =>
        item.status === 'pending' && !item.description
          ? { ...item, description: globalDescription.trim() }
          : item
      )
    )
  }

  // 批量上传
  const handleBatchUpload = async () => {
    if (items.length === 0) return

    const pendingItems = items.filter(item => item.status === 'pending')
    if (pendingItems.length === 0) return

    setIsUploading(true)
    const uploadedVoices: Voice[] = []

    for (const item of pendingItems) {
      if (!item.name.trim()) continue

      // 更新状态为上传中
      setItems(prev => prev.map(i => (i.id === item.id ? { ...i, status: 'uploading' } : i)))

      try {
        const voice = await voiceService.uploadVoice(
          item.file,
          item.name.trim(),
          item.description.trim() || undefined
        )

        uploadedVoices.push(voice)

        // 更新状态为成功
        setItems(prev => prev.map(i => (i.id === item.id ? { ...i, status: 'success', voice } : i)))
      } catch (err) {
        // 更新状态为错误
        setItems(prev =>
          prev.map(i =>
            i.id === item.id
              ? {
                  ...i,
                  status: 'error',
                  error: err instanceof Error ? err.message : '上传失败',
                }
              : i
          )
        )
      }
    }

    setIsUploading(false)

    if (uploadedVoices.length > 0) {
      onUploadSuccess?.(uploadedVoices)
    }
  }

  // 格式化文件大小
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  // 获取状态显示
  const getStatusBadge = (status: UploadItem['status'], error?: string) => {
    switch (status) {
      case 'pending':
        return (
          <Badge variant="secondary" className="text-[10px]">
            待上传
          </Badge>
        )
      case 'uploading':
        return (
          <Badge variant="default" className="text-[10px]">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            上传中
          </Badge>
        )
      case 'success':
        return (
          <Badge variant="default" className="text-[10px] bg-green-500">
            <Check className="w-3 h-3 mr-1" />
            成功
          </Badge>
        )
      case 'error':
        return (
          <Badge variant="destructive" className="text-[10px]" title={error}>
            <AlertCircle className="w-3 h-3 mr-1" />
            失败
          </Badge>
        )
    }
  }

  const pendingCount = items.filter(item => item.status === 'pending').length
  const successCount = items.filter(item => item.status === 'success').length
  const errorCount = items.filter(item => item.status === 'error').length

  return (
    <div className={cn('space-y-4', className)}>
      {/* 文件上传区域 */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'border-2 border-dashed rounded-lg p-6 text-center transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-muted-foreground/50'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          multiple
          onChange={handleInputChange}
          className="hidden"
        />

        <div className="space-y-3">
          <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
          <div>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} size="sm">
              选择音频文件
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            <p>支持格式: WAV, MP3, OGG, WebM</p>
            <p>最大 10MB, 时长 3-60 秒</p>
            <p className="text-[10px] mt-1">支持多选，可拖拽文件到此处</p>
          </div>
        </div>
      </div>

      {/* 全局描述设置 */}
      {items.length > 0 && pendingCount > 0 && (
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">
              统一描述（应用到未设置描述的音色）
            </label>
            <Textarea
              value={globalDescription}
              onChange={e => setGlobalDescription(e.target.value)}
              placeholder="输入统一描述..."
              rows={2}
              className="text-sm"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={applyGlobalDescription}
            disabled={!globalDescription.trim()}
          >
            应用
          </Button>
        </div>
      )}

      {/* 文件列表 */}
      {items.length > 0 && (
        <div className="border rounded-lg">
          <div className="p-3 border-b bg-muted/30 flex items-center justify-between">
            <div className="text-sm font-medium">
              待上传列表
              <span className="text-xs text-muted-foreground ml-2">
                共 {items.length} 个
                {successCount > 0 && (
                  <span className="text-green-600 ml-1">({successCount} 成功)</span>
                )}
                {errorCount > 0 && (
                  <span className="text-destructive ml-1">({errorCount} 失败)</span>
                )}
              </span>
            </div>
            {pendingCount === 0 && (
              <Button variant="ghost" size="sm" onClick={() => setItems([])}>
                清空列表
              </Button>
            )}
          </div>

          <ScrollArea className="h-[300px]">
            <div className="p-3 space-y-3">
              {items.map(item => (
                <div
                  key={item.id}
                  className={cn(
                    'border rounded-lg p-3 space-y-2',
                    item.status === 'success' && 'border-green-200 bg-green-50/30',
                    item.status === 'error' && 'border-red-200 bg-red-50/30'
                  )}
                >
                  {/* 文件信息和状态 */}
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FileAudio className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{item.file.name}</p>
                        {getStatusBadge(item.status, item.error)}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(item.file.size)}
                      </p>
                    </div>
                    {item.status !== 'uploading' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(item.id)}
                        className="h-6 w-6"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>

                  {/* 编辑区域 - 仅待上传状态可编辑 */}
                  {item.status === 'pending' && (
                    <div className="space-y-2 pl-11">
                      <Input
                        value={item.name}
                        onChange={e => updateItemName(item.id, e.target.value)}
                        placeholder="音色名称"
                        className="h-8 text-sm"
                      />
                      <Textarea
                        value={item.description}
                        onChange={e => updateItemDescription(item.id, e.target.value)}
                        placeholder="描述（可选）"
                        rows={2}
                        className="text-xs"
                      />
                    </div>
                  )}

                  {/* 错误提示 */}
                  {item.status === 'error' && item.error && (
                    <div className="pl-11 text-xs text-destructive">{item.error}</div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={isUploading}>
          {successCount > 0 ? '关闭' : '取消'}
        </Button>
        <Button
          onClick={handleBatchUpload}
          disabled={pendingCount === 0 || isUploading}
          className="gap-1"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              上传中...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              批量上传 ({pendingCount})
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
