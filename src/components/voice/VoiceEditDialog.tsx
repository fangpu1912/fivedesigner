import { useState, useEffect } from 'react'

import { Pencil, Save, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { voiceService } from '@/services/voiceService'
import type { Voice } from '@/types/voice'

interface VoiceEditDialogProps {
  voice: Voice | null
  isOpen: boolean
  onClose: () => void
  onSave?: () => void
}

export function VoiceEditDialog({ voice, isOpen, onClose, onSave }: VoiceEditDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // 当 voice 变化时更新表单
  useEffect(() => {
    if (voice) {
      setName(voice.name)
      setDescription(voice.description || '')
    }
  }, [voice])

  // 保存编辑
  const handleSave = async () => {
    if (!voice || !name.trim()) return

    setIsSaving(true)
    try {
      voiceService.updateVoice(voice.id, {
        name: name.trim(),
        description: description.trim() || undefined,
      })
      onSave?.()
      onClose()
    } catch (error) {
      console.error('保存失败:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // 取消编辑
  const handleCancel = () => {
    // 恢复原始值
    if (voice) {
      setName(voice.name)
      setDescription(voice.description || '')
    }
    onClose()
  }

  if (!voice) return null

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            编辑音色
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              音色名称 <span className="text-red-500">*</span>
            </label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="输入音色名称"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">描述</label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="描述这个音色的特点..."
              rows={3}
            />
          </div>

          {/* 音色信息预览 */}
          <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">时长:</span>
              <span>
                {Math.floor(voice.duration / 60)}:
                {Math.floor(voice.duration % 60)
                  .toString()
                  .padStart(2, '0')}
              </span>
            </div>
            {voice.trimStart !== undefined && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">裁剪:</span>
                <span className="text-primary">已裁剪</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleCancel}>
            <X className="h-4 w-4 mr-1" />
            取消
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || isSaving}>
            {isSaving ? (
              <>
                <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />
                保存中...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-1" />
                保存
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
