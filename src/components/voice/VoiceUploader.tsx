import { useState, useRef, useCallback, useEffect } from 'react'

import { Upload, Mic, FileAudio, X, Check } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { voiceService } from '@/services/voiceService'
import type { Voice } from '@/types/voice'

interface VoiceUploaderProps {
  onUploadSuccess?: (voice: Voice) => void
  onCancel?: () => void
  className?: string
}

function getRecordingFormat() {
  const candidates = [
    { mimeType: 'audio/webm;codecs=opus', extension: 'webm' },
    { mimeType: 'audio/webm', extension: 'webm' },
    { mimeType: 'audio/ogg;codecs=opus', extension: 'ogg' },
    { mimeType: 'audio/ogg', extension: 'ogg' },
  ]

  if (typeof MediaRecorder === 'undefined') {
    return null
  }

  return (
    candidates.find(
      candidate =>
        typeof MediaRecorder.isTypeSupported !== 'function' ||
        MediaRecorder.isTypeSupported(candidate.mimeType)
    ) || { mimeType: '', extension: 'webm' }
  )
}

export function VoiceUploader({ onUploadSuccess, onCancel, className }: VoiceUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [voiceName, setVoiceName] = useState('')
  const [voiceDescription, setVoiceDescription] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const recordedChunksRef = useRef<BlobPart[]>([])

  const stopMediaTracks = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach(track => track.stop())
    mediaStreamRef.current = null
  }, [])

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl)
      }

      const recorder = mediaRecorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop()
      }

      stopMediaTracks()
    }
  }, [previewUrl, stopMediaTracks])

  const handleFileSelect = useCallback(
    (file: File) => {
      setError(null)

      const validation = voiceService.validateAudioFile(file)
      if (!validation.valid) {
        setError(validation.error || '文件校验失败')
        return
      }

      if (previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl)
      }

      setSelectedFile(file)
      setPreviewUrl(URL.createObjectURL(file))

      if (!voiceName) {
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '')
        setVoiceName(nameWithoutExt)
      }
    },
    [previewUrl, voiceName]
  )

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setIsDragging(false)

    const file = event.dataTransfer.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const startRecording = async () => {
    try {
      const recordingFormat = getRecordingFormat()
      if (!recordingFormat) {
        setError('当前环境不支持录音功能')
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = recordingFormat.mimeType
        ? new MediaRecorder(stream, { mimeType: recordingFormat.mimeType })
        : new MediaRecorder(stream)

      recordedChunksRef.current = []
      mediaStreamRef.current = stream
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = event => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data)
        }
      }

      recorder.onerror = () => {
        setError('录音过程中发生错误，请重试')
        setIsRecording(false)
        stopMediaTracks()
      }

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || recordingFormat.mimeType || 'audio/webm'
        const extension = mimeType.includes('ogg') ? 'ogg' : recordingFormat.extension

        if (recordedChunksRef.current.length > 0) {
          const blob = new Blob(recordedChunksRef.current, { type: mimeType })
          const file = new File([blob], `recorded-voice-${Date.now()}.${extension}`, {
            type: mimeType,
          })
          handleFileSelect(file)
        }

        recordedChunksRef.current = []
        mediaRecorderRef.current = null
        setIsRecording(false)
        stopMediaTracks()
      }

      recorder.start()
      setError(null)
      setIsRecording(true)
    } catch {
      setError('无法访问麦克风，请检查权限设置')
    }
  }

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
      return
    }

    setIsRecording(false)
    stopMediaTracks()
  }

  const handleClear = () => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }

    stopMediaTracks()

    if (previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl)
    }

    setSelectedFile(null)
    setPreviewUrl(null)
    setVoiceName('')
    setVoiceDescription('')
    setError(null)

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleUpload = async () => {
    if (!selectedFile || !voiceName.trim()) {
      setError('请选择音频文件并填写音色名称')
      return
    }

    setIsUploading(true)
    setError(null)

    try {
      const voice = await voiceService.uploadVoice(
        selectedFile,
        voiceName.trim(),
        voiceDescription.trim() || undefined
      )

      onUploadSuccess?.(voice)
      handleClear()
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败')
    } finally {
      setIsUploading(false)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className={cn('space-y-4', className)}>
      {!selectedFile ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50'
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleInputChange}
            className="hidden"
          />

          <div className="space-y-4">
            <div className="flex justify-center gap-4">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="flex-col h-auto py-4 px-6 gap-2"
              >
                <Upload className="h-6 w-6" />
                <span className="text-xs">选择文件</span>
              </Button>

              <Button
                variant="outline"
                onClick={isRecording ? stopRecording : startRecording}
                className={cn(
                  'flex-col h-auto py-4 px-6 gap-2',
                  isRecording && 'border-red-500 text-red-500'
                )}
              >
                <Mic className="h-6 w-6" />
                <span className="text-xs">{isRecording ? '停止录音' : '录制音频'}</span>
              </Button>
            </div>

            <div className="text-sm text-muted-foreground">
              <p>支持格式: WAV, MP3, OGG, WebM</p>
              <p>最大 10MB，时长 3-60 秒</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="border rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileAudio className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={handleClear} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {previewUrl && <audio src={previewUrl} controls className="w-full h-8" />}

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">
                音色名称 <span className="text-red-500">*</span>
              </label>
              <Input
                value={voiceName}
                onChange={event => setVoiceName(event.target.value)}
                placeholder="输入音色名称"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">描述（可选）</label>
              <Textarea
                value={voiceDescription}
                onChange={event => setVoiceDescription(event.target.value)}
                placeholder="描述这个音色的特点..."
                rows={2}
              />
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">{error}</div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={isUploading}>
          取消
        </Button>
        <Button
          onClick={handleUpload}
          disabled={!selectedFile || !voiceName.trim() || isUploading}
          className="gap-1"
        >
          {isUploading ? (
            <>
              <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              上传中...
            </>
          ) : (
            <>
              <Check className="h-4 w-4" />
              上传音色
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
