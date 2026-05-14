import { useState, useMemo, useRef } from 'react'

import { confirm } from '@tauri-apps/plugin-dialog'
import {
  Plus,
  Edit2,
  Trash2,
  User,
  Volume2,
  Check,
  Play,
  Pause,
  Search,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { ImageUpload } from '@/components/ui/image-upload'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { TTSVoice } from '@/hooks/useTTS'
import { cn } from '@/lib/utils'
import type { Character, CharacterTag } from '@/types'
import { CHARACTER_TAG_CONFIG } from '@/types'
import { getImageUrl } from '@/utils/asset'

// 获取语言图标
function getLanguageIcon(language: string): string {
  if (language.startsWith('zh')) return '🇨🇳'
  if (language.startsWith('en')) return '🇺🇸'
  if (language.startsWith('ja')) return '🇯🇵'
  if (language.startsWith('ko')) return '🇰🇷'
  if (language.startsWith('fr')) return '🇫🇷'
  if (language.startsWith('de')) return '🇩🇪'
  if (language.startsWith('es')) return '🇪🇸'
  if (language.startsWith('ru')) return '🇷🇺'
  return '🌐'
}

// 获取性别图标
function getGenderIcon(gender?: string): string {
  switch (gender) {
    case 'male':
      return '♂️'
    case 'female':
      return '♀️'
    default:
      return '⚧'
  }
}

interface CharacterPanelProps {
  characters: Character[]
  voices: TTSVoice[]
  selectedCharacterId?: string
  onSelectCharacter: (characterId: string) => void
  onCreateCharacter: (character: Omit<Character, 'id' | 'created_at' | 'updated_at'>) => void
  onUpdateCharacter: (id: string, data: Partial<Character>) => void
  onDeleteCharacter: (id: string) => void
  onPreviewVoice: (voiceId: string) => void
  projectId?: string
  episodeId?: string
  provider?: string // 当前 TTS provider，用于判断是否是 ComfyUI 模式
}

export function CharacterPanel({
  characters,
  voices,
  selectedCharacterId,
  onSelectCharacter,
  onCreateCharacter,
  onUpdateCharacter,
  onDeleteCharacter,
  onPreviewVoice,
  projectId,
  episodeId,
  provider,
}: CharacterPanelProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<CharacterTag | 'all'>('all')
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    image: '',
    default_voice_id: '',
    project_id: '',
    tag: 'other' as CharacterTag,
  })

  // 过滤角色
  const filteredCharacters = useMemo(() => {
    return characters.filter(character => {
      const matchesSearch =
        character.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (character.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
      const matchesTag = selectedTag === 'all' || character.tag === selectedTag
      return matchesSearch && matchesTag
    })
  }, [characters, searchQuery, selectedTag])

  const handleOpenCreate = () => {
    setEditingCharacter(null)
    setFormData({
      name: '',
      description: '',
      image: '',
      default_voice_id: voices[0]?.id || '',
      project_id: '',
      tag: 'other',
    })
    setIsDialogOpen(true)
  }

  const handleOpenEdit = (character: Character) => {
    setEditingCharacter(character)
    setFormData({
      name: character.name,
      description: character.description || '',
      image: character.image || '',
      default_voice_id: character.default_voice_id || '',
      project_id: character.project_id,
      tag: character.tag || 'other',
    })
    setIsDialogOpen(true)
  }

  const handleSave = () => {
    if (!formData.name.trim()) return

    const characterData: Partial<Character> = {
      name: formData.name,
      description: formData.description,
      image: formData.image,
      default_voice_id: formData.default_voice_id,
      tag: formData.tag,
    }

    if (editingCharacter) {
      onUpdateCharacter(editingCharacter.id, characterData)
    } else {
      onCreateCharacter({
        ...characterData,
        project_id: formData.project_id,
      } as Omit<Character, 'id' | 'created_at' | 'updated_at'>)
    }

    setIsDialogOpen(false)
  }

  const handleDelete = async (character: Character) => {
    const confirmed = await confirm(`确定要删除角色 "${character.name}" 吗？`, {
      title: '删除确认',
      kind: 'warning',
      okLabel: '确定',
      cancelLabel: '取消',
    })
    if (confirmed) {
      onDeleteCharacter(character.id)
    }
  }

  const getVoiceName = (voiceId?: string) => {
    if (!voiceId) return '未设置'
    // 先通过 id 查找
    const byId = voices.find(v => v.id === voiceId)
    if (byId) return byId.name
    // ComfyUI 模式下，voiceId 可能是文件路径，通过 filePath 或 preview_url 查找
    const byPath = voices.find(v => (v as any).filePath === voiceId || (v as any).preview_url === voiceId)
    if (byPath) return byPath.name
    // 如果是文件路径，显示文件名
    if (voiceId.includes('\\') || voiceId.includes('/')) {
      return voiceId.split(/[\\/]/).pop() || voiceId
    }
    return voiceId
  }

  const getVoiceInfo = (voiceId?: string): TTSVoice | undefined => {
    if (!voiceId) return undefined
    // 先通过 id 查找
    const byId = voices.find(v => v.id === voiceId)
    if (byId) return byId
    // ComfyUI 模式下，voiceId 可能是文件路径，通过 filePath 或 preview_url 查找
    return voices.find(v => (v as any).filePath === voiceId || (v as any).preview_url === voiceId)
  }

  // 保存当前播放的音频对象引用
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const handlePreviewVoice = async (voiceId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()

    // 如果点击的是当前正在播放的音频，则停止
    if (playingVoiceId === voiceId && audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
      setPlayingVoiceId(null)
      return
    }

    // 停止之前播放的音频
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    // 获取音频URL：优先使用voice的preview_url，否则使用voiceId（可能是文件路径）
    const voice = voices.find(v => v.id === voiceId)
    let audioUrl = voice?.preview_url

    // 如果没有preview_url但voiceId是文件路径，直接使用voiceId
    if (!audioUrl && (voiceId.includes('\\') || voiceId.includes('/'))) {
      const { getAssetUrl } = await import('@/utils/asset')
      audioUrl = getAssetUrl(voiceId) || undefined
    }

    if (!audioUrl) {
      // 如果没有音频URL，使用TTS生成示例
      onPreviewVoice(voiceId)
      return
    }

    // 播放新的预览音频
    setPlayingVoiceId(voiceId)
    const audio = new Audio(audioUrl)
    audioRef.current = audio

    audio.onended = () => {
      setPlayingVoiceId(null)
      audioRef.current = null
    }

    audio.onerror = () => {
      console.error('音频播放失败')
      setPlayingVoiceId(null)
      audioRef.current = null
    }

    try {
      await audio.play()
    } catch (error) {
      console.error('音频播放失败:', error)
      setPlayingVoiceId(null)
      audioRef.current = null
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">角色列表</h3>
          <Button size="sm" onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-1" />
            新建
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">管理配音角色和默认语音</p>
      </div>

      {/* 搜索和筛选 */}
      <div className="p-3 border-b space-y-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索角色..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-8 h-8"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge
            variant={selectedTag === 'all' ? 'default' : 'outline'}
            className="cursor-pointer text-xs"
            onClick={() => setSelectedTag('all')}
          >
            全部
          </Badge>
          {(Object.keys(CHARACTER_TAG_CONFIG) as CharacterTag[]).map(tag => (
            <Badge
              key={tag}
              variant={selectedTag === tag ? 'default' : 'outline'}
              className={cn(
                'cursor-pointer text-xs',
                selectedTag === tag && CHARACTER_TAG_CONFIG[tag].color
              )}
              onClick={() => setSelectedTag(tag)}
            >
              {CHARACTER_TAG_CONFIG[tag].label}
            </Badge>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {filteredCharacters.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <User className="h-12 w-12 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {searchQuery || selectedTag !== 'all' ? '没有匹配的角色' : '暂无角色'}
            </p>
            <Button variant="link" size="sm" onClick={handleOpenCreate}>
              创建第一个角色
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredCharacters.map(character => {
              const voiceInfo = getVoiceInfo(character.default_voice_id)
              const tagConfig = character.tag ? CHARACTER_TAG_CONFIG[character.tag] : null

              return (
                <Card
                  key={character.id}
                  className={cn(
                    'cursor-pointer transition-all hover:shadow-md',
                    selectedCharacterId === character.id && 'ring-2 ring-primary'
                  )}
                  onClick={() => onSelectCharacter(character.id)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center overflow-hidden shrink-0">
                        {getImageUrl(character.image) ? (
                          <img
                            src={getImageUrl(character.image)!}
                            alt={character.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User className="h-6 w-6 text-muted-foreground" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <h4 className="font-medium truncate">{character.name}</h4>
                            {tagConfig && (
                              <span
                                className={cn(
                                  'text-[10px] px-1.5 py-0.5 rounded text-white',
                                  tagConfig.color
                                )}
                              >
                                {tagConfig.label}
                              </span>
                            )}
                          </div>
                          {selectedCharacterId === character.id && (
                            <Check className="h-4 w-4 text-primary" />
                          )}
                        </div>

                        {character.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                            {character.description}
                          </p>
                        )}

                        {/* 语音信息优化显示 */}
                        {voiceInfo ? (
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-xs" title={voiceInfo.language}>
                              {getLanguageIcon(voiceInfo.language)}
                            </span>
                            <span className="text-xs" title={voiceInfo.gender}>
                              {getGenderIcon(voiceInfo.gender)}
                            </span>
                            <span className="text-xs text-muted-foreground truncate flex-1">
                              {voiceInfo.name}
                            </span>
                            {/* 快速试听按钮 */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 p-0"
                              onClick={e => handlePreviewVoice(voiceInfo.id, e)}
                            >
                              {playingVoiceId === voiceInfo.id ? (
                                <Pause className="h-3 w-3 text-primary" />
                              ) : (
                                <Play className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        ) : character.default_voice_id ? (
                          <div className="flex items-center gap-1 mt-1">
                            <Volume2 className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {getVoiceName(character.default_voice_id)}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-xs text-muted-foreground italic">未设置语音</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={e => {
                            e.stopPropagation()
                            handleOpenEdit(character)
                          }}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={e => {
                            e.stopPropagation()
                            handleDelete(character)
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCharacter ? '编辑角色' : '新建角色'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">角色名称</label>
              <Input
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="输入角色名称"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">角色标签</label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(CHARACTER_TAG_CONFIG) as CharacterTag[]).map(tag => (
                  <Badge
                    key={tag}
                    variant={formData.tag === tag ? 'default' : 'outline'}
                    className={cn(
                      'cursor-pointer',
                      formData.tag === tag && CHARACTER_TAG_CONFIG[tag].color
                    )}
                    onClick={() => setFormData({ ...formData, tag })}
                  >
                    {CHARACTER_TAG_CONFIG[tag].label}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">角色描述</label>
              <Textarea
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="描述角色特点..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">角色头像</label>
              <ImageUpload
                value={formData.image}
                onChange={value => setFormData({ ...formData, image: value })}
                placeholder="点击上传角色头像"
                previewClassName="w-24 h-24"
                useLocalPath={true}
                projectId={projectId}
                episodeId={episodeId}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                {provider === 'comfyui' ? '参考音频' : '默认语音'}
              </label>
              <div className="flex gap-2">
                <select
                  value={formData.default_voice_id}
                  onChange={e => setFormData({ ...formData, default_voice_id: e.target.value })}
                  className="flex-1 h-9 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">
                    {provider === 'comfyui' ? '选择参考音频' : '选择参考音频'}
                  </option>
                  {voices
                    .filter(voice => {
                      // 只显示本地音色（有非空 filePath 或 preview_url 的），用于音色克隆
                      const filePath = (voice as any).filePath
                      const previewUrl = (voice as any).preview_url
                      return (filePath && filePath.length > 0) || (previewUrl && previewUrl.length > 0)
                    })
                    .map(voice => (
                      <option
                        key={voice.id}
                        value={(voice as any).filePath || (voice as any).preview_url || voice.id}
                      >
                        {getLanguageIcon(voice.language)}{' '}
                        {getGenderIcon(voice.gender)} {voice.name}
                      </option>
                    ))}
                </select>
                {formData.default_voice_id && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handlePreviewVoice(formData.default_voice_id)}
                    title={provider === 'comfyui' ? '试听参考音频' : '试听语音'}
                  >
                    {playingVoiceId === formData.default_voice_id ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
              {provider === 'comfyui' && (
                <p className="text-xs text-muted-foreground">
                  选择本地音频文件作为声音克隆的参考音频（时长10秒-5分钟，支持mp3、m4a、wav格式）
                </p>
              )}
            </div>


          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={!formData.name.trim()}>
              {editingCharacter ? '保存' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
