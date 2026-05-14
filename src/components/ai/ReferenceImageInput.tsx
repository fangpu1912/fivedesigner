import { useState, useMemo, useEffect, useRef } from 'react'

import {
  ImageIcon,
  X,
  Upload,
  Film,
  Users,
  Box,
  Layers,
  Eye,
  Video,
  Music,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { getImageUrl } from '@/utils/asset'
import { MediaThumbnail as SharedMediaThumbnail, isVideoMediaType, isAudioMediaType } from '@/components/media/MediaThumbnail'
import { open } from '@tauri-apps/plugin-dialog'

interface Episode {
  id: string
  name: string
}

export type ReferenceMediaType = 'storyboard' | 'character' | 'scene' | 'prop' | 'upload-image' | 'upload-video' | 'upload-audio'

export interface ReferenceItem {
  id: string
  url: string
  name: string
  type: ReferenceMediaType
  episodeId?: string
  episodeName?: string
  prompt?: string
  description?: string
}

interface LinkedAsset {
  id: string
  type: 'character' | 'scene' | 'prop'
  name: string
  image?: string
  color: string
}

interface ReferenceImageInputProps {
  label?: string
  placeholder?: string
  value: string[]
  onChange: (value: string[]) => void
  onItemsChange?: (items: ReferenceItem[]) => void
  onAvailableItemsChange?: (items: ReferenceItem[]) => void
  maxReferences?: number
  episodes?: Episode[]
  storyboards?: Array<{
    id: string
    name: string
    image?: string
    episode_id?: string
    episode_name?: string
    prompt?: string
    description?: string
  }>
  characters?: Array<{
    id: string
    name: string
    image?: string
    avatar?: string
    episode_id?: string
    prompt?: string
    description?: string
  }>
  scenes?: Array<{ id: string; name: string; image?: string; episode_id?: string; prompt?: string; description?: string }>
  props?: Array<{ id: string; name: string; image?: string; episode_id?: string; prompt?: string; description?: string }>
  currentEpisodeId?: string
  currentProjectId?: string
  displayMode?: 'thumbnail' | 'large'
  linkedAssets?: LinkedAsset[]
  allowVideo?: boolean
  allowAudio?: boolean
}

const TABS = [
  { id: 'storyboard', name: '分镜', icon: Film },
  { id: 'character', name: '角色', icon: Users },
  { id: 'scene', name: '场景', icon: Box },
  { id: 'prop', name: '道具', icon: Layers },
  { id: 'upload', name: '上传', icon: Upload },
]

const UPLOAD_SUBTYPES = [
  { id: 'upload-image', name: '图片', icon: ImageIcon, extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
  { id: 'upload-video', name: '视频', icon: Video, extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv'] },
  { id: 'upload-audio', name: '音频', icon: Music, extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'] },
]

function getMediaTypeLabel(type: ReferenceMediaType): string {
  switch (type) {
    case 'storyboard': return '分镜'
    case 'character': return '角色'
    case 'scene': return '场景'
    case 'prop': return '道具'
    case 'upload-image': return '图片'
    case 'upload-video': return '视频'
    case 'upload-audio': return '音频'
  }
}



function toMediaType(type: ReferenceMediaType): 'image' | 'video' | 'audio' {
  if (isVideoMediaType(type)) return 'video'
  if (isAudioMediaType(type)) return 'audio'
  return 'image'
}

export function ReferenceImageInput({
  label = '参考媒体',
  placeholder = '点击选择参考媒体',
  value = [],
  onChange,
  onItemsChange,
  onAvailableItemsChange,
  maxReferences = 10,
  episodes = [],
  storyboards = [],
  characters = [],
  scenes = [],
  props = [],
  currentEpisodeId,
  displayMode = 'thumbnail',
  linkedAssets = [],
  allowVideo = true,
  allowAudio = true,
}: ReferenceImageInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<string>('storyboard')
  const [uploadSubtype, setUploadSubtype] = useState<string>('upload-image')
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string>(currentEpisodeId || 'all')
  const [uploadedFiles, setUploadedFiles] = useState<ReferenceItem[]>([])
  const selectedItemMap = useRef<Map<string, ReferenceItem>>(new Map())

  const availableUploadSubtypes = useMemo(() => {
    return UPLOAD_SUBTYPES.filter(st => {
      if (st.id === 'upload-video') return allowVideo
      if (st.id === 'upload-audio') return allowAudio
      return true
    })
  }, [allowVideo, allowAudio])

  const availableEpisodes = useMemo(() => {
    const episodeIds = new Set<string>()

    if (activeTab === 'storyboard') {
      storyboards.forEach(sb => sb.episode_id && episodeIds.add(sb.episode_id))
    } else if (activeTab === 'character') {
      characters.forEach(char => char.episode_id && episodeIds.add(char.episode_id))
    } else if (activeTab === 'scene') {
      scenes.forEach(scene => scene.episode_id && episodeIds.add(scene.episode_id))
    } else if (activeTab === 'prop') {
      props.forEach(prop => prop.episode_id && episodeIds.add(prop.episode_id))
    }

    return episodes.filter(ep => episodeIds.has(ep.id))
  }, [activeTab, storyboards, characters, scenes, props, episodes])

  const availableRefs = useMemo(() => {
    const refs: ReferenceItem[] = []

    if (activeTab === 'storyboard') {
      storyboards.forEach(sb => {
        if (sb.image && (selectedEpisodeId === 'all' || sb.episode_id === selectedEpisodeId)) {
          refs.push({
            id: sb.id,
            url: sb.image,
            name: sb.name,
            type: 'storyboard',
            episodeId: sb.episode_id,
            episodeName: sb.episode_name,
            prompt: sb.prompt,
            description: sb.description,
          })
        }
      })
    } else if (activeTab === 'character') {
      characters.forEach(char => {
        if (char.image && (selectedEpisodeId === 'all' || char.episode_id === selectedEpisodeId)) {
          refs.push({
            id: char.id,
            url: char.image,
            name: char.name,
            type: 'character',
            episodeId: char.episode_id,
            prompt: char.prompt,
            description: char.description,
          })
        }
      })
    } else if (activeTab === 'scene') {
      scenes.forEach(scene => {
        if (scene.image && (selectedEpisodeId === 'all' || scene.episode_id === selectedEpisodeId)) {
          refs.push({
            id: scene.id,
            url: scene.image,
            name: scene.name,
            type: 'scene',
            episodeId: scene.episode_id,
            prompt: scene.prompt,
            description: scene.description,
          })
        }
      })
    } else if (activeTab === 'prop') {
      props.forEach(prop => {
        if (prop.image && (selectedEpisodeId === 'all' || prop.episode_id === selectedEpisodeId)) {
          refs.push({
            id: prop.id,
            url: prop.image,
            name: prop.name,
            type: 'prop',
            episodeId: prop.episode_id,
            prompt: prop.prompt,
            description: prop.description,
          })
        }
      })
    } else if (activeTab === 'upload') {
      return uploadedFiles.filter(f => f.type === uploadSubtype)
    }

    return refs
  }, [activeTab, uploadSubtype, selectedEpisodeId, storyboards, characters, scenes, props, uploadedFiles])

  const allRefItems = useMemo(() => {
    const items: ReferenceItem[] = []
    storyboards.forEach(sb => {
      if (sb.image) {
        items.push({
          id: sb.id,
          url: sb.image,
          name: sb.name,
          type: 'storyboard',
          episodeId: sb.episode_id,
          episodeName: sb.episode_name,
          prompt: sb.prompt,
          description: sb.description,
        })
      }
    })
    characters.forEach(char => {
      if (char.image) {
        items.push({
          id: char.id,
          url: char.image,
          name: char.name,
          type: 'character',
          episodeId: char.episode_id,
          prompt: char.prompt,
          description: char.description,
        })
      }
    })
    scenes.forEach(scene => {
      if (scene.image) {
        items.push({
          id: scene.id,
          url: scene.image,
          name: scene.name,
          type: 'scene',
          episodeId: scene.episode_id,
          prompt: scene.prompt,
          description: scene.description,
        })
      }
    })
    props.forEach(prop => {
      if (prop.image) {
        items.push({
          id: prop.id,
          url: prop.image,
          name: prop.name,
          type: 'prop',
          episodeId: prop.episode_id,
          prompt: prop.prompt,
          description: prop.description,
        })
      }
    })
    items.push(...uploadedFiles)
    return items
  }, [storyboards, characters, scenes, props, uploadedFiles])

  const [mapVersion, setMapVersion] = useState(0)

  useEffect(() => {
    let changed = false
    for (const url of value) {
      if (!selectedItemMap.current.has(url)) {
        const item = allRefItems.find(r => r.url === url)
        if (item) {
          selectedItemMap.current.set(url, item)
          changed = true
        }
      }
    }
    if (changed) {
      setMapVersion(v => v + 1)
    }
  }, [value, allRefItems])

  const selectedRefItems = useMemo(() => {
    void mapVersion
    return value
      .map(url => selectedItemMap.current.get(url))
      .filter((item): item is ReferenceItem => item != null)
  }, [value, mapVersion])

  useEffect(() => {
    onItemsChange?.(selectedRefItems)
  }, [selectedRefItems, onItemsChange])

  useEffect(() => {
    onAvailableItemsChange?.(allRefItems)
  }, [allRefItems, onAvailableItemsChange])

  const toggleReference = (ref: ReferenceItem) => {
    const url = ref.url
    if (value.includes(url)) {
      selectedItemMap.current.delete(url)
      onChange(value.filter(u => u !== url))
    } else {
      if (value.length >= maxReferences) {
        alert(`最多可选择 ${maxReferences} 个参考`)
        return
      }
      selectedItemMap.current.set(url, ref)
      onChange([...value, url])
    }
  }

  const handleFileUpload = async (subtype: ReferenceMediaType) => {
    if (value.length >= maxReferences) {
      alert(`最多可选择 ${maxReferences} 个参考`)
      return
    }

    const subtypeConfig = UPLOAD_SUBTYPES.find(s => s.id === subtype)
    if (!subtypeConfig) return

    try {
      const selected = await open({
        multiple: true,
        filters: [
          { name: `${subtypeConfig.name}文件`, extensions: subtypeConfig.extensions },
        ],
        title: `选择参考${subtypeConfig.name}`,
      })

      if (!selected) return

      const paths = Array.isArray(selected) ? selected : [selected]

      for (const filePath of paths) {
        if (value.length >= maxReferences) {
          alert(`最多可选择 ${maxReferences} 个参考`)
          break
        }

        const fileName = filePath.split(/[/\\]/).pop() || 'unknown'

        const newFile: ReferenceItem = {
          id: `upload-${Date.now()}-${Math.random()}`,
          url: filePath,
          name: fileName,
          type: subtype,
        }
        selectedItemMap.current.set(filePath, newFile)
        setUploadedFiles(prev => [...prev, newFile])
        onChange([...value, filePath])
      }
    } catch (error) {
      console.error('选择文件失败:', error)
      alert(`选择文件失败: ${error}`)
    }
  }

  const removeReference = (url: string) => {
    selectedItemMap.current.delete(url)
    onChange(value.filter(u => u !== url))
  }

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId)
    setSelectedEpisodeId(currentEpisodeId || 'all')
  }

  const findRefInfo = (url: string) => allRefItems.find(r => r.url === url)

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
        <ImageIcon className="w-3.5 h-3.5" />
        {label}
        <span className="text-[10px] text-muted-foreground">
          ({value.length}/{maxReferences})
        </span>
      </Label>

      {displayMode === 'large' && value.length > 0 ? (
        <div className="relative aspect-video bg-muted rounded-lg overflow-hidden group border">
          {(() => {
            const firstUrl = value[0] ?? ''
            const refInfo = findRefInfo(firstUrl)
            return refInfo ? (
              <SharedMediaThumbnail url={firstUrl} mediaType={toMediaType(refInfo.type)} alt={refInfo.name} />
            ) : (
              <img src={getImageUrl(firstUrl) ?? firstUrl} alt={label} className="w-full h-full object-cover" />
            )
          })()}
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setIsOpen(true)}>
              <Eye className="w-4 h-4" />
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onChange([])}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 p-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 cursor-pointer hover:bg-muted/50 hover:border-muted-foreground/50 transition-all"
        >
          <div className="flex-1 flex items-center gap-2">
            {value.length > 0 || linkedAssets.length > 0 ? (
              <div className="flex -space-x-2">
                {value.slice(0, 5).map((url, index) => {
                  const refInfo = findRefInfo(url)
                  return (
                    <div
                      key={index}
                      className="w-8 h-8 rounded-full border-2 border-background overflow-hidden bg-muted"
                    >
                      {refInfo && isAudioMediaType(refInfo.type) ? (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music className="w-3 h-3 text-muted-foreground" />
                        </div>
                      ) : refInfo && isVideoMediaType(refInfo.type) ? (
                        <div className="w-full h-full">
                          <SharedMediaThumbnail url={url} mediaType="video" alt="" className="w-8 h-8" iconClassName="w-3 h-3" />
                        </div>
                      ) : (
                        <img src={getImageUrl(url) ?? url} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                  )
                })}
                {linkedAssets
                  .filter(asset => !asset.image)
                  .slice(0, Math.max(0, 5 - value.length))
                  .map((asset) => (
                    <div
                      key={`linked-${asset.id}`}
                      className={`w-8 h-8 rounded-full border-2 border-background ${asset.color} flex items-center justify-center text-white text-xs font-medium`}
                      title={`${asset.type === 'character' ? '角色' : asset.type === 'scene' ? '场景' : '道具'}: ${asset.name}（无图片）`}
                    >
                      {asset.name.charAt(0)}
                    </div>
                  ))}
                {value.length + linkedAssets.filter(a => !a.image).length > 5 && (
                  <div className="w-8 h-8 rounded-full border-2 border-background bg-muted flex items-center justify-center text-xs text-muted-foreground">
                    +{value.length + linkedAssets.filter(a => !a.image).length - 5}
                  </div>
                )}
              </div>
            ) : (
              <ImageIcon className="w-5 h-5 text-muted-foreground" />
            )}
            <span className="text-sm text-muted-foreground">
              {value.length > 0 || linkedAssets.length > 0
                ? `已选择 ${value.length} 个参考${linkedAssets.filter(a => !a.image).length > 0 ? `，${linkedAssets.filter(a => !a.image).length}个资产待添加图片` : ''}`
                : placeholder}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={e => {
              e.stopPropagation()
              setIsOpen(true)
            }}
            className="h-7 px-2 text-xs"
          >
            {value.length > 0 || linkedAssets.length > 0 ? '管理' : '选择'}
          </Button>
        </div>
      )}

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-background rounded-lg w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col shadow-lg border"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h3 className="font-semibold">选择参考媒体</h3>
                <p className="text-xs text-muted-foreground">
                  已选择 {value.length} / {maxReferences} 个
                </p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-md hover:bg-muted flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {availableEpisodes.length > 0 && activeTab !== 'upload' && (
              <div className="border-b bg-muted/30">
                <div className="flex items-center gap-2 px-4 py-3">
                  <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                    剧集:
                  </span>
                  <ScrollArea className="flex-1 whitespace-nowrap">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedEpisodeId('all')}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-xs font-medium transition-all border',
                          selectedEpisodeId === 'all'
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background hover:bg-muted border-border'
                        )}
                      >
                        全部
                      </button>
                      {availableEpisodes.map(ep => (
                        <button
                          key={ep.id}
                          onClick={() => setSelectedEpisodeId(ep.id)}
                          className={cn(
                            'px-3 py-1.5 rounded-full text-xs font-medium transition-all border',
                            selectedEpisodeId === ep.id
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background hover:bg-muted border-border'
                          )}
                        >
                          {ep.name}
                        </button>
                      ))}
                    </div>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                </div>
              </div>
            )}

            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-3 border-b">
                  <div className="flex gap-1">
                    {TABS.map(tab => {
                      const Icon = tab.icon
                      const count =
                        tab.id === 'storyboard'
                          ? storyboards.filter(s => s.image).length
                          : tab.id === 'character'
                            ? characters.filter(c => c.image).length
                            : tab.id === 'scene'
                              ? scenes.filter(s => s.image).length
                              : tab.id === 'prop'
                                ? props.filter(p => p.image).length
                                : uploadedFiles.length
                      return (
                        <button
                          key={tab.id}
                          onClick={() => handleTabChange(tab.id)}
                          className={cn(
                            'flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all',
                            activeTab === tab.id
                              ? 'bg-primary text-primary-foreground'
                              : 'hover:bg-muted text-muted-foreground'
                          )}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {tab.name}
                          <Badge variant="secondary" className="text-[10px] h-4 min-w-4 px-1">
                            {count}
                          </Badge>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3">
                  {activeTab === 'upload' ? (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        {availableUploadSubtypes.map(st => {
                          const Icon = st.icon
                          return (
                            <button
                              key={st.id}
                              onClick={() => setUploadSubtype(st.id)}
                              className={cn(
                                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all border',
                                uploadSubtype === st.id
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-background hover:bg-muted border-border'
                              )}
                            >
                              <Icon className="w-3.5 h-3.5" />
                              {st.name}
                            </button>
                          )
                        })}
                      </div>

                      <button
                        onClick={() => handleFileUpload(uploadSubtype as ReferenceMediaType)}
                        className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-muted rounded-lg cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all w-full"
                      >
                        <Upload className="w-6 h-6 text-muted-foreground mb-2" />
                        <span className="text-sm font-medium">
                          点击选择{UPLOAD_SUBTYPES.find(s => s.id === uploadSubtype)?.name ?? '文件'}
                        </span>
                        <span className="text-xs text-muted-foreground mt-1">
                          支持 {UPLOAD_SUBTYPES.find(s => s.id === uploadSubtype)?.extensions.join('、').toUpperCase()}
                        </span>
                      </button>

                      {uploadedFiles.filter(f => f.type === uploadSubtype).length > 0 && (
                        <div>
                          <h4 className="text-xs font-medium text-muted-foreground mb-2">已上传</h4>
                          <div className={cn(
                            "grid gap-2",
                            uploadSubtype === 'upload-audio' ? "grid-cols-2" : "grid-cols-4"
                          )}>
                            {uploadedFiles.filter(f => f.type === uploadSubtype).map(file => (
                              <button
                                key={file.id}
                                onClick={() => toggleReference(file)}
                                className={cn(
                                  'relative rounded-lg overflow-hidden border-2 transition-all',
                                  uploadSubtype === 'upload-audio' ? 'h-12' : 'aspect-square',
                                  value.includes(file.url)
                                    ? 'border-primary ring-2 ring-primary/20'
                                    : 'border-transparent hover:border-primary/50'
                                )}
                              >
                                <SharedMediaThumbnail url={file.url} mediaType={toMediaType(file.type)} alt={file.name} />
                                {uploadSubtype === 'upload-audio' && (
                                  <div className="absolute inset-0 flex items-center px-3">
                                    <Music className="w-4 h-4 text-muted-foreground shrink-0" />
                                    <span className="ml-2 text-xs truncate">{file.name}</span>
                                  </div>
                                )}
                                {value.includes(file.url) && (
                                  <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                    <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                                      <span className="text-white text-xs font-bold">
                                        {value.indexOf(file.url) + 1}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {availableRefs.map(ref => (
                        <button
                          key={ref.id}
                          onClick={() => toggleReference(ref)}
                          className={cn(
                            'group relative aspect-video rounded-lg overflow-hidden border-2 transition-all',
                            value.includes(ref.url)
                              ? 'border-primary ring-2 ring-primary/20'
                              : 'border-transparent hover:border-primary/50'
                          )}
                        >
                          <SharedMediaThumbnail url={ref.url} mediaType={toMediaType(ref.type)} alt={ref.name} />

                          {ref.episodeName && (
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1">
                              <span className="text-[9px] text-white/90 truncate block">
                                {ref.episodeName}
                              </span>
                            </div>
                          )}

                          {value.includes(ref.url) && (
                            <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                              <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow">
                                <span className="text-white text-xs font-bold">
                                  {value.indexOf(ref.url) + 1}
                                </span>
                              </div>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {availableRefs.length === 0 && activeTab !== 'upload' && (
                    <div className="text-center py-8 text-muted-foreground">
                      <div className="w-12 h-12 mx-auto mb-2 rounded-lg bg-muted flex items-center justify-center">
                        <ImageIcon className="w-6 h-6 opacity-50" />
                      </div>
                      <p className="text-xs">
                        {selectedEpisodeId === 'all'
                          ? `暂无${activeTab === 'storyboard' ? '分镜' : activeTab === 'character' ? '角色' : activeTab === 'scene' ? '场景' : '道具'}`
                          : '该剧集暂无相关资产'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {value.length > 0 && (
                <div className="w-48 border-l bg-muted/20 flex flex-col">
                  <div className="p-3 border-b bg-muted/30">
                    <h4 className="text-xs font-medium">已选择</h4>
                    <p className="text-[10px] text-muted-foreground">
                      {value.length} / {maxReferences}
                    </p>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2">
                    <div className="space-y-2">
                      {value.map((url, index) => {
                        const refInfo = findRefInfo(url)

                        return (
                          <div
                            key={url}
                            className="group relative bg-background rounded-lg border overflow-hidden"
                          >
                            <div className="aspect-video relative">
                              {refInfo ? (
                                <SharedMediaThumbnail url={url} mediaType={toMediaType(refInfo.type)} alt={refInfo.name} />
                              ) : (
                                <img src={getImageUrl(url) ?? url} alt="" className="w-full h-full object-cover" />
                              )}
                              <div className="absolute top-1 left-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center shadow">
                                <span className="text-white text-xs font-bold">{index + 1}</span>
                              </div>
                              <button
                                onClick={() => removeReference(url)}
                                className="absolute top-1 right-1 w-5 h-5 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="w-3 h-3 text-white" />
                              </button>
                            </div>
                            {refInfo && (
                              <div className="px-2 py-1.5 border-t">
                                <p className="text-[10px] truncate" title={refInfo.name}>
                                  {refInfo.name}
                                </p>
                                <Badge variant="secondary" className="text-[9px] mt-0.5">
                                  {getMediaTypeLabel(refInfo.type)}
                                </Badge>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 border-t flex justify-between items-center bg-muted/30">
              <span className="text-xs text-muted-foreground">
                已选择 {value.length} / {maxReferences} 个
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsOpen(false)}>
                  取消
                </Button>
                <Button size="sm" onClick={() => setIsOpen(false)}>
                  确定
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
