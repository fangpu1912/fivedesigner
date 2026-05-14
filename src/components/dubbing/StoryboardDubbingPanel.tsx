import { useState, useCallback } from 'react'

import {
  Volume2,
  Scissors,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock,
  User,
  ChevronDown,
  ChevronUp,
  Trash2,
  Smile,
  Mic,
  Plus,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Download,
} from 'lucide-react'

import { AudioTrimmer } from '@/components/editor/AudioTrimmer'
import { AudioPlayerWithWaveform } from '@/components/media/AudioPlayer'
import { ClickableImage } from '@/components/media/ClickableImage'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { Storyboard, Dubbing, Character } from '@/types'
import { getImageUrl, getAudioUrl } from '@/utils/asset'

// 配音类型
type DubbingType = 'narration' | 'character' | 'extra'

// 单条配音数据（本地临时状态）
interface LocalDubbingLine {
  id?: string // 已保存的配音有ID
  tempId: string // 临时ID，用于本地状态管理
  text: string
  character_id?: string
  emotion?: string // 情绪：开心、悲伤、愤怒、惊讶、平静、兴奋、温柔、紧张、害怕、厌恶、困惑、失望、尴尬、害羞、自豪、嫉妒、焦虑、沮丧、疲惫、满足、感激、期待、怀念、嘲讽、冷酷、严肃、亲切、活泼、沉稳、神秘、威严、默认
  audio_prompt?: string // 配音提示词，融合情绪和语气描述
  audio_url?: string
  status?: Dubbing['status']
  duration?: number
  sequence: number
  type?: DubbingType // 配音类型：旁白/角色/额外
  isFromMetadata?: boolean // 是否从metadata加载
}

interface DubbingLineItemProps {
  dubbing: LocalDubbingLine
  characters: Character[]
  isGenerating: boolean
  provider: string
  canMoveUp: boolean
  canMoveDown: boolean
  onGenerate: () => Promise<void>
  onUpdateText: (text: string) => void
  onUpdateCharacter: (characterId?: string) => void
  onUpdateEmotion: (emotion: string) => void
  onUpdateAudioPrompt: (audioPrompt: string) => void
  onTrim: (start: number, end: number) => void
  onReplace: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

function DubbingLineItem({
  dubbing,
  characters,
  isGenerating,
  canMoveUp,
  canMoveDown,
  onGenerate,
  onUpdateText,
  onUpdateCharacter,
  onUpdateEmotion,
  onUpdateAudioPrompt,
  onTrim,
  onDelete,
  onMoveUp,
  onMoveDown,
}: DubbingLineItemProps) {
  const [isTrimming, setIsTrimming] = useState(false)
  const status = dubbing.status || 'pending'

  const handleTrim = useCallback(
    (start: number, end: number) => {
      onTrim(start, end)
      setIsTrimming(false)
    },
    [onTrim]
  )

  const getStatusIcon = () => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-3 w-3 text-green-500" />
      case 'failed':
        return <AlertCircle className="h-3 w-3 text-destructive" />
      case 'generating':
        return <RefreshCw className="h-3 w-3 text-primary animate-spin" />
      default:
        return <Clock className="h-3 w-3 text-muted-foreground" />
    }
  }

  // 获取配音类型标签
  const getTypeLabel = () => {
    switch (dubbing.type) {
      case 'narration':
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-600">
            旁白
          </span>
        )
      case 'character':
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-600">
            角色
          </span>
        )
      case 'extra':
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-600">
            额外
          </span>
        )
      default:
        return null
    }
  }

  return (
    <div
      className={cn(
        'border rounded-lg p-3',
        dubbing.type === 'narration' && 'bg-blue-50/50 border-blue-200',
        dubbing.type === 'character' && 'bg-green-50/50 border-green-200',
        dubbing.type === 'extra' && 'bg-secondary/30'
      )}
    >
      {/* 排序控制 */}
      <div className="flex items-center gap-1 mb-2">
        <div className="flex flex-col">
          <Button
            variant="ghost"
            size="sm"
            className="h-4 w-4 p-0"
            disabled={!canMoveUp}
            onClick={onMoveUp}
          >
            <ArrowUp className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-4 w-4 p-0"
            disabled={!canMoveDown}
            onClick={onMoveDown}
          >
            <ArrowDown className="h-3 w-3" />
          </Button>
        </div>
        <GripVertical className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">#{dubbing.sequence + 1}</span>
        {getTypeLabel()}
        <div className="flex-1" />
        {getStatusIcon()}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {/* 台词文本 */}
      <div className="space-y-2 mb-3">
        <Textarea
          value={dubbing.text}
          onChange={e => onUpdateText(e.target.value)}
          placeholder="输入配音台词..."
          rows={2}
          className="text-sm"
        />
      </div>

      {/* 角色、情绪、语调、语速 */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <User className="h-3 w-3" />
            角色
          </label>
          <select
            value={dubbing.character_id || ''}
            onChange={e => onUpdateCharacter(e.target.value || undefined)}
            className="w-full h-8 rounded-md border bg-background px-2 text-xs"
          >
            <option value="">选择角色</option>
            {characters.map(char => (
              <option key={char.id} value={char.id}>
                {char.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Smile className="h-3 w-3" />
            情绪
          </label>
          <select
            value={dubbing.emotion || ''}
            onChange={e => onUpdateEmotion(e.target.value)}
            className="w-full h-8 rounded-md border bg-background px-2 text-xs"
          >
            <option value="">选择情绪</option>
            <option value="开心">开心</option>
            <option value="悲伤">悲伤</option>
            <option value="愤怒">愤怒</option>
            <option value="惊讶">惊讶</option>
            <option value="平静">平静</option>
            <option value="兴奋">兴奋</option>
            <option value="温柔">温柔</option>
            <option value="紧张">紧张</option>
            <option value="害怕">害怕</option>
            <option value="厌恶">厌恶</option>
            <option value="困惑">困惑</option>
            <option value="失望">失望</option>
            <option value="尴尬">尴尬</option>
            <option value="害羞">害羞</option>
            <option value="自豪">自豪</option>
            <option value="嫉妒">嫉妒</option>
            <option value="焦虑">焦虑</option>
            <option value="沮丧">沮丧</option>
            <option value="疲惫">疲惫</option>
            <option value="满足">满足</option>
            <option value="感激">感激</option>
            <option value="期待">期待</option>
            <option value="怀念">怀念</option>
            <option value="嘲讽">嘲讽</option>
            <option value="冷酷">冷酷</option>
            <option value="严肃">严肃</option>
            <option value="亲切">亲切</option>
            <option value="活泼">活泼</option>
            <option value="沉稳">沉稳</option>
            <option value="神秘">神秘</option>
            <option value="威严">威严</option>
            <option value="默认">默认</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Mic className="h-3 w-3" />
            配音提示词
          </label>
          <input
            type="text"
            value={dubbing.audio_prompt || ''}
            onChange={e => onUpdateAudioPrompt(e.target.value)}
            placeholder="如：开心地说、低沉悲伤的声音、激动地说"
            className="w-full h-8 rounded-md border bg-background px-2 text-xs"
          />
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={onGenerate}
          disabled={isGenerating || !dubbing.text}
          className="flex-1"
        >
          {isGenerating ? (
            <>
              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
              生成中
            </>
          ) : (
            <>
              <Volume2 className="h-3 w-3 mr-1" />
              {dubbing.audio_url ? '重新生成' : '生成配音'}
            </>
          )}
        </Button>

        {dubbing.audio_url && !isTrimming && (
          <Button variant="outline" size="sm" onClick={() => setIsTrimming(true)}>
            <Scissors className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* 音频播放器 */}
      {dubbing.audio_url && !isTrimming && (
        <div className="mt-3">
          <AudioPlayerWithWaveform src={getAudioUrl(dubbing.audio_url) || ''} />
        </div>
      )}

      {/* 音频修剪 */}
      {dubbing.audio_url && isTrimming && (
        <div className="mt-3">
          <AudioTrimmer
            src={getAudioUrl(dubbing.audio_url) || ''}
            onTrim={handleTrim}
            onCancel={() => setIsTrimming(false)}
          />
        </div>
      )}
    </div>
  )
}

interface StoryboardDubbingItemProps {
  storyboard: Storyboard
  localDubbings: LocalDubbingLine[]
  characters: Character[]
  generatingIds: Set<string>
  provider: string
  onAddDubbing: (storyboardId: string) => void
  onUpdateDubbing: (storyboardId: string, tempId: string, data: Partial<LocalDubbingLine>) => void
  onDeleteDubbing: (storyboardId: string, tempId: string) => void
  onMoveDubbing: (storyboardId: string, tempId: string, direction: 'up' | 'down') => void
  onGenerate: (storyboardId: string, tempId: string) => Promise<void>
  onTrim: (storyboardId: string, tempId: string, start: number, end: number) => void
  onReplace: (storyboardId: string, tempId: string) => void
  onSaveDubbing: (storyboardId: string, tempId: string) => Promise<void>
}

function StoryboardDubbingItem({
  storyboard,
  localDubbings,
  characters,
  generatingIds,
  provider,
  onAddDubbing,
  onUpdateDubbing,
  onDeleteDubbing,
  onMoveDubbing,
  onGenerate,
  onTrim,
  onReplace,
}: StoryboardDubbingItemProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  const handleAddDubbing = () => {
    onAddDubbing(storyboard.id)
  }

  const handleUpdateDubbing = (tempId: string, data: Partial<LocalDubbingLine>) => {
    onUpdateDubbing(storyboard.id, tempId, data)
  }

  const handleDeleteDubbing = (tempId: string) => {
    onDeleteDubbing(storyboard.id, tempId)
  }

  const handleMoveDubbing = (tempId: string, direction: 'up' | 'down') => {
    onMoveDubbing(storyboard.id, tempId, direction)
  }

  const completedCount = localDubbings.filter(d => d.status === 'completed').length

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className="w-20 h-14 rounded bg-secondary overflow-hidden shrink-0">
            {getImageUrl(storyboard.image) ? (
              <ClickableImage
                src={getImageUrl(storyboard.image)}
                alt={storyboard.name}
                title={storyboard.name}
                aspectRatio="auto"
                className="w-full h-full"
                showHoverEffect={false}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-xs text-muted-foreground">#{storyboard.sort_order || 0}</span>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h4 className="font-medium truncate">{storyboard.name}</h4>
                <span className="text-xs text-muted-foreground">
                  {completedCount}/{localDubbings.length} 条配音
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setIsExpanded(!isExpanded)}>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>

            {isExpanded && (
              <div className="space-y-3 mt-3">
                {localDubbings.map((dubbing, index) => (
                  <DubbingLineItem
                    key={dubbing.tempId}
                    dubbing={dubbing}
                    characters={characters}
                    isGenerating={generatingIds.has(dubbing.tempId)}
                    provider={provider}
                    canMoveUp={index > 0}
                    canMoveDown={index < localDubbings.length - 1}
                    onGenerate={() => onGenerate(storyboard.id, dubbing.tempId)}
                    onUpdateText={text => handleUpdateDubbing(dubbing.tempId, { text })}
                    onUpdateCharacter={character_id =>
                      handleUpdateDubbing(dubbing.tempId, { character_id })
                    }
                    onUpdateEmotion={emotion => handleUpdateDubbing(dubbing.tempId, { emotion })}
                    onUpdateAudioPrompt={audio_prompt =>
                      handleUpdateDubbing(dubbing.tempId, { audio_prompt })
                    }
                    onTrim={(start, end) => onTrim(storyboard.id, dubbing.tempId, start, end)}
                    onReplace={() => onReplace(storyboard.id, dubbing.tempId)}
                    onDelete={() => handleDeleteDubbing(dubbing.tempId)}
                    onMoveUp={() => handleMoveDubbing(dubbing.tempId, 'up')}
                    onMoveDown={() => handleMoveDubbing(dubbing.tempId, 'down')}
                  />
                ))}

                <Button variant="outline" size="sm" onClick={handleAddDubbing} className="w-full">
                  <Plus className="h-4 w-4 mr-1" />
                  添加配音
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface StoryboardDubbingPanelProps {
  storyboards: Storyboard[]
  dubbings: Dubbing[]
  localDubbings: Record<string, Record<string, LocalDubbingLine>>
  characters: Character[]
  generatingIds: Set<string>
  provider: string
  loadNarration?: boolean
  onAddDubbing: (storyboardId: string) => void
  onUpdateDubbing: (storyboardId: string, tempId: string, data: Partial<LocalDubbingLine>) => void
  onDeleteDubbing: (storyboardId: string, tempId: string) => void
  onMoveDubbing: (storyboardId: string, tempId: string, direction: 'up' | 'down') => void
  onGenerate: (storyboardId: string, tempId: string) => Promise<void>
  onTrim: (storyboardId: string, tempId: string, start: number, end: number) => void
  onReplace: (storyboardId: string, tempId: string) => void
  onSaveDubbing: (storyboardId: string, tempId: string) => Promise<void>
  onBatchGenerate: (storyboardIds: string[]) => void
  onExportAll?: () => void
}

export function StoryboardDubbingPanel({
  storyboards,
  dubbings,
  localDubbings,
  characters,
  generatingIds,
  provider,
  loadNarration = true,
  onAddDubbing,
  onUpdateDubbing,
  onDeleteDubbing,
  onMoveDubbing,
  onGenerate,
  onTrim,
  onReplace,
  onSaveDubbing,
  onBatchGenerate,
  onExportAll,
}: StoryboardDubbingPanelProps) {
  void provider
  void onReplace
  void onSaveDubbing
  void onBatchGenerate
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const getDubbingsByStoryboard = (storyboardId: string): Dubbing[] => {
    return dubbings.filter(d => d.storyboard_id === storyboardId)
  }

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedIds(newSet)
  }

  const handleBatchGenerate = () => {
    // 使用 localDubbings 而不是 dubbings（数据库数据）
    // 根据 loadNarration 决定是否包含旁白
    const idsToGenerate = Array.from(selectedIds).filter(id => {
      const storyboardDubbings = Object.values(localDubbings[id] || {})
      // 根据 loadNarration 过滤旁白
      const filteredDubbings = loadNarration
        ? storyboardDubbings
        : storyboardDubbings.filter(d => d.type !== 'narration')
      // 只要有文本内容的配音就生成
      return filteredDubbings.some(d => d.text && d.text.trim())
    })
    if (idsToGenerate.length > 0) {
      onBatchGenerate(idsToGenerate)
    }
  }

  const selectAll = () => {
    setSelectedIds(new Set(storyboards.map(s => s.id)))
  }

  const deselectAll = () => {
    setSelectedIds(new Set())
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">分镜配音</h3>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={selectAll}>
              全选
            </Button>
            <Button variant="outline" size="sm" onClick={deselectAll}>
              取消
            </Button>
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-sm text-muted-foreground">已选择 {selectedIds.size} 个分镜</span>
            <Button size="sm" onClick={handleBatchGenerate}>
              <Volume2 className="h-3 w-3 mr-1" />
              批量生成
            </Button>
          </div>
        )}

        {onExportAll && (
          <div className="flex items-center gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={onExportAll}>
              <Download className="h-3 w-3 mr-1" />
              导出所有配音
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {storyboards.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <Volume2 className="h-12 w-12 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">暂无分镜</p>
          </div>
        ) : (
          <div className="space-y-2">
            {storyboards.map(storyboard => (
              <div key={storyboard.id} className="relative">
                <div
                  className="absolute left-0 top-0 bottom-0 w-6 flex items-center justify-center z-10 cursor-pointer"
                  onClick={() => toggleSelect(storyboard.id)}
                >
                  <div
                    className={cn(
                      'w-4 h-4 rounded border-2 flex items-center justify-center transition-colors',
                      selectedIds.has(storyboard.id)
                        ? 'bg-primary border-primary'
                        : 'border-muted-foreground'
                    )}
                  >
                    {selectedIds.has(storyboard.id) && (
                      <CheckCircle className="h-3 w-3 text-primary-foreground" />
                    )}
                  </div>
                </div>

                <div className="ml-6">
                  <StoryboardDubbingItem
                    storyboard={storyboard}
                    localDubbings={Object.values(localDubbings[storyboard.id] || {})
                      .filter(d => loadNarration || d.type !== 'narration')
                      .sort((a, b) => a.sequence - b.sequence)}
                    characters={characters}
                    generatingIds={generatingIds}
                    provider={provider}
                    onAddDubbing={onAddDubbing}
                    onUpdateDubbing={onUpdateDubbing}
                    onDeleteDubbing={onDeleteDubbing}
                    onMoveDubbing={onMoveDubbing}
                    onGenerate={onGenerate}
                    onTrim={onTrim}
                    onReplace={onReplace}
                    onSaveDubbing={onSaveDubbing}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
