import { useRef, useState } from 'react'

import { Upload, X, ImageIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { getAssetUrl } from '@/utils/asset'

import { Button } from './button'

interface ImageUploadProps {
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  previewClassName?: string
  accept?: string
  maxSize?: number // MB
  useLocalPath?: boolean // 是否使用本地路径存储模式
  projectId?: string
  episodeId?: string
}

export function ImageUpload({
  value,
  onChange,
  placeholder = '点击上传图片',
  className,
  previewClassName = 'w-full h-32',
  accept = 'image/*',
  maxSize = 10,
  useLocalPath = false,
  projectId,
  episodeId,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  const handleFileChange = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件')
      return
    }
    if (file.size > maxSize * 1024 * 1024) {
      alert(`图片大小不能超过 ${maxSize}MB`)
      return
    }

    if (useLocalPath && projectId && episodeId) {
      setIsUploading(true)
      try {
        const reader = new FileReader()
        reader.onload = async e => {
          if (e.target?.result) {
            const base64Data = e.target.result as string
            const { saveMediaFile } = await import('@/utils/mediaStorage')
            const savedPath = await saveMediaFile(
              base64Data,
              file.name,
              projectId,
              episodeId,
              'image'
            )
            onChange(savedPath)
          }
        }
        reader.readAsDataURL(file)
      } catch (error) {
        console.error('上传失败:', error)
        alert('上传失败，请重试')
      } finally {
        setIsUploading(false)
      }
    } else {
      const reader = new FileReader()
      reader.onload = e => {
        if (e.target?.result) {
          onChange(e.target.result as string)
        }
      }
      reader.readAsDataURL(file)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileChange(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleClick = () => {
    inputRef.current?.click()
  }

  const handleRemove = () => {
    onChange('')
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  if (value) {
    const displayUrl = getAssetUrl(value) || value
    return (
      <div className={cn('relative group', previewClassName, className)}>
        {isUploading ? (
          <div className="w-full h-full flex items-center justify-center bg-muted rounded-lg border">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <img src={displayUrl} alt="预览" className="w-full h-full object-cover rounded-lg border" />
        )}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={handleClick} disabled={isUploading}>
            <Upload className="w-4 h-4 mr-1" />
            更换
          </Button>
          <Button type="button" variant="destructive" size="sm" onClick={handleRemove} disabled={isUploading}>
            <X className="w-4 h-4 mr-1" />
            删除
          </Button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={e => e.target.files?.[0] && handleFileChange(e.target.files[0])}
          className="hidden"
        />
      </div>
    )
  }

  return (
    <div
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={cn(
        'border-2 border-dashed rounded-lg cursor-pointer transition-all flex flex-col items-center justify-center gap-2 hover:border-primary/50 hover:bg-muted/30',
        isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
        previewClassName,
        className
      )}
    >
      <ImageIcon className="w-8 h-8 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">{placeholder}</span>
      <span className="text-xs text-muted-foreground/60">点击或拖拽上传</span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={e => e.target.files?.[0] && handleFileChange(e.target.files[0])}
        className="hidden"
      />
    </div>
  )
}
