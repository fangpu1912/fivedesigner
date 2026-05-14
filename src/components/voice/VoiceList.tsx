import { useState, useEffect, useCallback } from 'react'

import { confirm } from '@tauri-apps/plugin-dialog'
import {
  Mic,
  Trash2,
  Edit3,
  Scissors,
  Link2,
  User,
  Upload,
  CheckSquare,
  Square,
  X,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAllCharacters, useUpdateCharacter } from '@/hooks/useCharacters'
import { cn } from '@/lib/utils'
import { voiceService } from '@/services/voiceService'
import type { Voice, VoiceFilter } from '@/types/voice'

import { AudioTrimmer } from './AudioTrimmer'
import { VoiceAudioPlayer } from './VoiceAudioPlayer'
import { VoiceBatchUploader } from './VoiceBatchUploader'
import { VoiceBindingDialog } from './VoiceBindingDialog'
import { VoiceEditDialog } from './VoiceEditDialog'
import { VoiceUploader } from './VoiceUploader'

interface VoiceListProps {
  filter?: VoiceFilter
  className?: string
}

export function VoiceList({ filter, className }: VoiceListProps) {
  const [voices, setVoices] = useState<Voice[]>([])
  const { data: characters = [] } = useAllCharacters()
  const updateCharacter = useUpdateCharacter()
  const [isLoading, setIsLoading] = useState(false)

  // 选择状态
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [isBatchDeleting, setIsBatchDeleting] = useState(false)

  // 对话框状态
  const [editingVoice, setEditingVoice] = useState<Voice | null>(null)
  const [trimmingVoice, setTrimmingVoice] = useState<Voice | null>(null)
  const [trimmingAudioFile, setTrimmingAudioFile] = useState<File | null>(null)
  const [bindingVoice, setBindingVoice] = useState<Voice | null>(null)
  const [showUploader, setShowUploader] = useState(false)
  const [showBatchUploader, setShowBatchUploader] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<Voice | null>(null)

  // 加载音色列表
  const loadVoices = useCallback(() => {
    setIsLoading(true)
    try {
      const allVoices = voiceService.getAllVoices(filter)
      setVoices(allVoices)
    } catch (error) {
      console.error('加载音色列表失败:', error)
    } finally {
      setIsLoading(false)
    }
  }, [filter])

  useEffect(() => {
    loadVoices()
  }, [loadVoices])

  // 删除音色
  const handleDelete = useCallback(
    async (voice: Voice) => {
      try {
        const boundCharacters = characters.filter(c => c.voice_id === voice.id)
        for (const character of boundCharacters) {
          await updateCharacter.mutateAsync({ id: character.id, data: { voice_id: undefined } })
        }

        voiceService.deleteVoice(voice.id)
        loadVoices()
        setShowDeleteConfirm(null)
      } catch (error) {
        console.error('删除音色失败:', error)
      }
    },
    [characters, loadVoices, updateCharacter]
  )

  // 批量删除音色
  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return

    const confirmed = await confirm(
      `确定要删除选中的 ${selectedIds.size} 个音色吗？此操作不可恢复。`,
      {
        title: '批量删除确认',
        kind: 'warning',
        okLabel: '确定删除',
        cancelLabel: '取消',
      }
    )

    if (!confirmed) return

    setIsBatchDeleting(true)
    try {
      const idsToDelete = Array.from(selectedIds)

      // 解绑所有相关角色
      for (const voiceId of idsToDelete) {
        const boundCharacters = characters.filter(c => c.default_voice_id === voiceId)
        for (const character of boundCharacters) {
          await updateCharacter.mutateAsync({ id: character.id, data: { default_voice_id: undefined } })
        }
      }

      // 删除音色
      for (const voiceId of idsToDelete) {
        await voiceService.deleteVoice(voiceId)
      }

      setSelectedIds(new Set())
      setIsSelectMode(false)
      loadVoices()
    } catch (error) {
      console.error('批量删除失败:', error)
    } finally {
      setIsBatchDeleting(false)
    }
  }, [selectedIds, characters, loadVoices, updateCharacter])

  // 切换选择模式
  const toggleSelectMode = useCallback(() => {
    setIsSelectMode(prev => !prev)
    setSelectedIds(new Set())
  }, [])

  // 全选/取消全选
  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === voices.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(voices.map(v => v.id)))
    }
  }, [voices, selectedIds.size])

  // 切换单个选择
  const toggleSelect = useCallback((voiceId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(voiceId)) {
        newSet.delete(voiceId)
      } else {
        newSet.add(voiceId)
      }
      return newSet
    })
  }, [])

  // 打开裁剪对话框
  const openTrimDialog = useCallback(async (voice: Voice) => {
    if (!voice.filePath) {
      console.error('音色没有文件路径')
      return
    }

    try {
      // 从本地文件读取音频数据
      const { readVoiceFile } = await import('@/utils/mediaStorage')
      const audioData = await readVoiceFile(voice.filePath)

      // 创建 File 对象
      const audioFile = new File([audioData], voice.name, { type: voice.mimeType || 'audio/wav' })

      setTrimmingAudioFile(audioFile)
      setTrimmingVoice(voice)
    } catch (error) {
      console.error('加载音频文件失败:', error)
    }
  }, [])

  // 关闭裁剪对话框
  const closeTrimDialog = useCallback(() => {
    setTrimmingVoice(null)
    setTrimmingAudioFile(null)
  }, [])

  // 保存裁剪
  const handleTrimSave = useCallback(
    async (trimmedBlob: Blob) => {
      if (trimmingVoice) {
        try {
          // 创建新的 File 对象
          const fileName = trimmingVoice.name.replace(/\.[^/.]+$/, '') + '_trimmed.wav'
          const trimmedFile = new File([trimmedBlob], fileName, { type: 'audio/wav' })

          // 上传到服务
          await voiceService.updateVoiceAudio(trimmingVoice.id, trimmedFile)
          loadVoices()
          closeTrimDialog()
        } catch (error) {
          console.error('保存裁剪失败:', error)
        }
      }
    },
    [trimmingVoice, loadVoices, closeTrimDialog]
  )

  // 获取绑定到该音色的角色
  const getBoundCharacters = useCallback(
    (voiceId: string) => {
      return characters.filter(c => c.default_voice_id === voiceId)
    },
    [characters]
  )

  // 格式化时长
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* 头部工具栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isSelectMode ? (
            <>
              <Checkbox
                checked={selectedIds.size === voices.length && voices.length > 0}
                onCheckedChange={toggleSelectAll}
              />
              <span className="text-sm">
                {selectedIds.size > 0 ? `已选择 ${selectedIds.size} 项` : '全选'}
              </span>
            </>
          ) : (
            <h3 className="text-lg font-medium">
              我的音色
              <span className="ml-2 text-sm text-muted-foreground">({voices.length})</span>
            </h3>
          )}
        </div>
        <div className="flex gap-2">
          {isSelectMode ? (
            <>
              <Button variant="outline" onClick={toggleSelectMode} size="sm">
                <X className="h-4 w-4 mr-1" />
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={handleBatchDelete}
                size="sm"
                disabled={selectedIds.size === 0 || isBatchDeleting}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {isBatchDeleting ? '删除中...' : `删除 (${selectedIds.size})`}
              </Button>
            </>
          ) : (
            <>
              {voices.length > 0 && (
                <Button variant="outline" onClick={toggleSelectMode} size="sm">
                  <CheckSquare className="h-4 w-4 mr-1" />
                  批量管理
                </Button>
              )}
              <Button variant="outline" onClick={() => setShowBatchUploader(true)} size="sm">
                <Upload className="h-4 w-4 mr-1" />
                批量上传
              </Button>
              <Button onClick={() => setShowUploader(true)} size="sm">
                <Mic className="h-4 w-4 mr-1" />
                上传音色
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 音色列表 */}
      {voices.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Mic className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>还没有音色</p>
          <p className="text-sm">点击上方按钮上传您的第一个音色</p>
        </div>
      ) : (
        <ScrollArea className="h-[600px]">
          <div className="grid gap-4 pr-4">
            {voices.map(voice => {
              const boundCharacters = getBoundCharacters(voice.id)
              const isSelected = selectedIds.has(voice.id)

              return (
                <Card
                  key={voice.id}
                  className={cn(
                    'overflow-hidden transition-colors',
                    isSelectMode && isSelected && 'border-primary bg-primary/5'
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      {/* 选择模式下显示复选框 */}
                      {isSelectMode && (
                        <div className="pt-1">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelect(voice.id)}
                          />
                        </div>
                      )}

                      {/* 音色信息 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium truncate">{voice.name}</h4>
                          <Badge variant="secondary" className="text-xs">
                            {formatDuration(voice.duration)}
                          </Badge>
                          {voice.trimStart !== undefined && (
                            <Badge variant="outline" className="text-xs">
                              已裁剪
                            </Badge>
                          )}
                        </div>

                        {voice.description && (
                          <p className="text-sm text-muted-foreground truncate mb-2">
                            {voice.description}
                          </p>
                        )}

                        {/* 绑定的角色 */}
                        {boundCharacters.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap">
                            <User className="h-3 w-3 text-muted-foreground" />
                            {boundCharacters.map(char => (
                              <Badge key={char.id} variant="secondary" className="text-xs">
                                {char.name}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {/* 音频播放器 - 直接显示 */}
                        <div className="mt-3">
                          <VoiceAudioPlayer
                            audioUrl={voice.audioUrl}
                            trimStart={voice.trimStart}
                            trimEnd={voice.trimEnd}
                            showWaveform={false}
                          />
                        </div>
                      </div>

                      {/* 操作按钮 - 非选择模式显示 */}
                      {!isSelectMode && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setBindingVoice(voice)}
                            title="绑定角色"
                          >
                            <Link2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openTrimDialog(voice)}
                            title="裁剪"
                          >
                            <Scissors className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingVoice(voice)}
                            title="编辑"
                          >
                            <Edit3 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setShowDeleteConfirm(voice)}
                            className="text-destructive hover:text-destructive"
                            title="删除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </ScrollArea>
      )}

      {/* 上传对话框 */}
      <Dialog open={showUploader} onOpenChange={setShowUploader}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>上传音色</DialogTitle>
          </DialogHeader>
          <VoiceUploader
            onUploadSuccess={_voice => {
              loadVoices()
              setShowUploader(false)
            }}
            onCancel={() => setShowUploader(false)}
          />
        </DialogContent>
      </Dialog>

      {/* 批量上传对话框 */}
      <Dialog open={showBatchUploader} onOpenChange={setShowBatchUploader}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>批量上传音色</DialogTitle>
          </DialogHeader>
          <VoiceBatchUploader
            onUploadSuccess={uploadedVoices => {
              loadVoices()
              if (uploadedVoices.length > 0) {
                setShowBatchUploader(false)
              }
            }}
            onCancel={() => setShowBatchUploader(false)}
          />
        </DialogContent>
      </Dialog>

      {/* 裁剪对话框 */}
      {trimmingVoice && trimmingAudioFile && (
        <AudioTrimmer
          audioFile={trimmingAudioFile}
          onConfirm={handleTrimSave}
          onCancel={closeTrimDialog}
        />
      )}

      {/* 编辑对话框 */}
      <VoiceEditDialog
        voice={editingVoice}
        isOpen={!!editingVoice}
        onClose={() => setEditingVoice(null)}
        onSave={() => {
          loadVoices()
        }}
      />

      {/* 绑定对话框 */}
      {bindingVoice && (
        <VoiceBindingDialog
          voice={bindingVoice}
          isOpen={!!bindingVoice}
          onClose={() => setBindingVoice(null)}
        />
      )}

      {/* 删除确认对话框 */}
      <Dialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            确定要删除音色 "{showDeleteConfirm?.name}" 吗？此操作不可恢复。
          </p>
          {getBoundCharacters(showDeleteConfirm?.id || '').length > 0 && (
            <p className="text-sm text-destructive">
              注意：该音色已绑定 {getBoundCharacters(showDeleteConfirm?.id || '').length}{' '}
              个角色，删除后将自动解绑。
            </p>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => showDeleteConfirm && handleDelete(showDeleteConfirm)}
            >
              删除
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
