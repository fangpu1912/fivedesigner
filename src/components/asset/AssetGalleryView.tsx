/**
 * 资产画廊轮播视图
 * 大图展示，布局规整，提示词一目了然
 */

import { useState, useRef, useEffect } from 'react'
import { 
  ChevronLeft, 
  ChevronRight, 
  X, 
  Edit3, 
  Trash2, 
  Copy, 
  Check,
  Sparkles,
  Video,
  User,
  Mountain,
  Box,
  Image as ImageIcon,
  MapPin,
  Maximize2,
  Tag,
  Calendar
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { cn } from "@/lib/utils"
import { useToast } from '@/hooks/useToast'
import type { AssetItem, AssetCategory } from './AssetManagerPanel'

interface AssetGalleryViewProps {
  assets: AssetItem[]
  activeCategory: AssetCategory
  selectedAssetId: string | null
  onSelect: (id: string | null) => void
  onEdit: (asset: AssetItem) => void
  onDelete: (asset: AssetItem) => void
  onImageUpload?: (asset: AssetItem, imagePath: string) => void
  onImageRemove?: (asset: AssetItem) => void
  onSave?: (asset: AssetItem) => Promise<void>
  getFileUrl: (path?: string) => string | null
  projectId?: string
  episodeId?: string
}

// 分类配置
const CATEGORY_CONFIG: Record<
  AssetCategory,
  {
    label: string
    icon: React.ReactNode
    color: string
    bgColor: string
    gradient: string
  }
> = {
  character: {
    label: '角色',
    icon: <User className="w-5 h-5" />,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    gradient: 'from-blue-500/20 to-cyan-500/20',
  },
  scene: {
    label: '场景',
    icon: <Mountain className="w-5 h-5" />,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    gradient: 'from-green-500/20 to-emerald-500/20',
  },
  prop: {
    label: '道具',
    icon: <Box className="w-5 h-5" />,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    gradient: 'from-orange-500/20 to-amber-500/20',
  },
  storyboard: {
    label: '分镜',
    icon: <ImageIcon className="w-5 h-5" />,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    gradient: 'from-purple-500/20 to-pink-500/20',
  },
}

export function AssetGalleryView({
  assets,
  activeCategory,
  selectedAssetId,
  onSelect,
  onEdit,
  onDelete,
  onImageUpload: _onImageUpload,
  onImageRemove: _onImageRemove,
  onSave,
  getFileUrl,
}: AssetGalleryViewProps) {
  const { toast } = useToast()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showFullscreen, setShowFullscreen] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [showPromptPanel, setShowPromptPanel] = useState(true)
  const [editingAsset, setEditingAsset] = useState<AssetItem | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    prompt: '',
    videoPrompt: '',
  })
  const [isSaving, setIsSaving] = useState(false)
  const mainImageRef = useRef<HTMLDivElement>(null)

  // 当前资产
  const currentAsset = assets[currentIndex]
  const config = currentAsset ? CATEGORY_CONFIG[currentAsset.category] : CATEGORY_CONFIG[activeCategory]

  // 同步外部选中状态
  useEffect(() => {
    if (selectedAssetId) {
      const index = assets.findIndex(a => a.id === selectedAssetId)
      if (index !== -1) {
        setCurrentIndex(index)
      }
    }
  }, [selectedAssetId, assets])

  // 切换资产时通知外部
  useEffect(() => {
    if (currentAsset) {
      onSelect(currentAsset.id)
      // 重置编辑状态
      setEditingAsset(null)
      setEditForm({
        name: currentAsset.name,
        description: currentAsset.description || '',
        prompt: currentAsset.prompt || '',
        videoPrompt: currentAsset.videoPrompt || '',
      })
    }
  }, [currentIndex, currentAsset, onSelect])

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showFullscreen) return
      if (e.key === 'ArrowLeft') {
        goToPrev()
      } else if (e.key === 'ArrowRight') {
        goToNext()
      } else if (e.key === 'Escape') {
        onSelect(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, assets.length, showFullscreen])

  const goToPrev = () => {
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : assets.length - 1))
  }

  const goToNext = () => {
    setCurrentIndex(prev => (prev < assets.length - 1 ? prev + 1 : 0))
  }

  const goToIndex = (index: number) => {
    setCurrentIndex(index)
  }

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    toast({ title: '已复制到剪贴板' })
    setTimeout(() => setCopiedField(null), 2000)
  }

  // 开始编辑
  const startEditing = (_field: 'name' | 'description' | 'prompt' | 'videoPrompt') => {
    if (!currentAsset) return
    setEditingAsset(currentAsset)
    setEditForm({
      name: currentAsset.name,
      description: currentAsset.description || '',
      prompt: currentAsset.prompt || '',
      videoPrompt: currentAsset.videoPrompt || '',
    })
  }

  // 自动保存
  const autoSave = async () => {
    if (!currentAsset || !onSave || isSaving) return
    
    // 检查是否有变化
    const hasChanges = 
      editForm.name !== currentAsset.name ||
      editForm.description !== (currentAsset.description || '') ||
      editForm.prompt !== (currentAsset.prompt || '') ||
      editForm.videoPrompt !== (currentAsset.videoPrompt || '')
    
    if (!hasChanges) return

    setIsSaving(true)
    try {
      await onSave({
        ...currentAsset,
        name: editForm.name,
        description: editForm.description,
        prompt: editForm.prompt,
        videoPrompt: editForm.videoPrompt,
      })
      toast({ title: '已自动保存' })
    } catch (error) {
      toast({ title: '保存失败', variant: 'destructive' })
    } finally {
      setIsSaving(false)
      setEditingAsset(null)
    }
  }

  if (assets.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <div className={cn('w-20 h-20 mx-auto mb-4 rounded-2xl flex items-center justify-center', config.bgColor)}>
            {config.icon}
          </div>
          <p className="text-lg font-medium">暂无{config.label}</p>
          <p className="text-sm mt-1">点击右上角"新建"按钮创建</p>
        </div>
      </div>
    )
  }

  if (!currentAsset) return null

  const thumbnail = currentAsset.thumbnail ? getFileUrl(currentAsset.thumbnail) : null
  const _hasPrompt = !!currentAsset.prompt
  const _hasVideoPrompt = !!currentAsset.videoPrompt

  return (
    <div className="h-full flex flex-col bg-background">
      {/* 顶部信息栏 */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-card/50">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <Badge className={cn('gap-1.5 px-3 py-1', config.bgColor, config.color)}>
            {config.icon}
            {config.label}
          </Badge>
          <div className="flex-1 min-w-0">
            {/* 名称 - 点击编辑 */}
            <div 
              className="group cursor-text"
              onClick={() => startEditing('name')}
            >
              {editingAsset?.id === currentAsset.id ? (
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  onBlur={autoSave}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      autoSave()
                    }
                  }}
                  className="h-8 text-lg font-semibold px-0 border-0 border-b border-primary rounded-none bg-transparent focus-visible:ring-0"
                  autoFocus
                />
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold group-hover:text-primary transition-colors">
                    {currentAsset.name}
                  </h2>
                  <Edit3 className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              )}
            </div>
            {/* 描述 - 点击编辑 */}
            <div 
              className="group cursor-text mt-1"
              onClick={() => startEditing('description')}
            >
              {editingAsset?.id === currentAsset.id ? (
                <Input
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  onBlur={autoSave}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      autoSave()
                    }
                  }}
                  placeholder="添加描述..."
                  className="h-6 text-sm text-muted-foreground px-0 border-0 border-b border-primary rounded-none bg-transparent focus-visible:ring-0"
                  autoFocus
                />
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                    {currentAsset.description || '点击添加描述...'}
                  </p>
                  <Edit3 className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <span className="text-sm text-muted-foreground">
            {currentIndex + 1} / {assets.length}
          </span>
          {isSaving && (
            <span className="text-xs text-muted-foreground">保存中...</span>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowFullscreen(true)}>
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：大图展示区 */}
        <div className="flex-1 flex flex-col relative min-w-0">
          {/* 主图 */}
          <div 
            ref={mainImageRef}
            className="flex-1 relative bg-muted/30 flex items-center justify-center p-8 overflow-hidden"
          >
            {thumbnail ? (
              <img
                src={thumbnail}
                alt={currentAsset.name}
                className="max-w-full max-h-full w-auto h-auto object-contain rounded-lg shadow-2xl cursor-zoom-in"
                style={{ maxHeight: 'calc(100% - 2rem)' }}
                onClick={() => setShowFullscreen(true)}
              />
            ) : (
              <div className={cn('w-64 h-64 rounded-2xl flex flex-col items-center justify-center', config.bgColor)}>
                <div className={cn('opacity-50 mb-4', config.color)}>{config.icon}</div>
                <span className="text-muted-foreground">暂无图片</span>
              </div>
            )}

            {/* 左右切换按钮 */}
            <button
              onClick={goToPrev}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-background/90 shadow-lg flex items-center justify-center hover:bg-background transition-colors"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              onClick={goToNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-background/90 shadow-lg flex items-center justify-center hover:bg-background transition-colors"
            >
              <ChevronRight className="w-6 h-6" />
            </button>

            {/* 图片计数器 */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-background/90 shadow-lg text-sm font-medium">
              {currentIndex + 1} / {assets.length}
            </div>
          </div>

          {/* 底部缩略图栏 */}
          <div className="h-28 border-t bg-card/50 p-2 flex-shrink-0">
            <ScrollArea className="h-full w-full whitespace-nowrap overflow-hidden">
              <div className="flex gap-2 px-2">
                {assets.map((asset, index) => {
                  const thumb = asset.thumbnail ? getFileUrl(asset.thumbnail) : null
                  const isActive = index === currentIndex
                  return (
                    <button
                      key={asset.id}
                      onClick={() => goToIndex(index)}
                      className={cn(
                        'relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 transition-all inline-block',
                        isActive ? 'ring-2 ring-primary ring-offset-2' : 'opacity-60 hover:opacity-100'
                      )}
                    >
                      {thumb ? (
                        <img src={thumb} alt={asset.name} className="w-full h-full object-contain bg-muted" />
                      ) : (
                        <div className={cn('w-full h-full flex items-center justify-center', CATEGORY_CONFIG[asset.category].bgColor)}>
                          {CATEGORY_CONFIG[asset.category].icon}
                        </div>
                      )}
                      {isActive && (
                        <div className="absolute inset-0 bg-primary/10" />
                      )}
                    </button>
                  )
                })}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
        </div>

        {/* 右侧：提示词面板 */}
        <div 
          className={cn(
            'border-l bg-card transition-all duration-300 flex flex-col',
            showPromptPanel ? 'w-[450px]' : 'w-0 overflow-hidden'
          )}
        >
          {/* 面板头部 */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="font-medium">提示词详情</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowPromptPanel(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* 面板内容 */}
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              {/* 基本信息 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>创建于 {new Date(currentAsset.createdAt).toLocaleDateString()}</span>
                </div>
                {currentAsset.tags && currentAsset.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {currentAsset.tags.map((tag, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        <Tag className="h-3 w-3 mr-1" />
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* 图片提示词 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-blue-500" />
                    图片提示词
                  </label>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(editForm.prompt || currentAsset.prompt || '', 'prompt')}
                    >
                      {copiedField === 'prompt' ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="relative">
                  <Textarea
                    value={editingAsset?.id === currentAsset.id ? editForm.prompt : (currentAsset.prompt || '')}
                    onChange={(e) => setEditForm({ ...editForm, prompt: e.target.value })}
                    onBlur={autoSave}
                    onFocus={() => startEditing('prompt')}
                    placeholder="点击编辑图片提示词..."
                    className="min-h-[120px] font-mono text-xs bg-muted/50 resize-none focus:bg-background transition-colors"
                  />
                </div>
              </div>

              {/* 视频提示词 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <Video className="h-4 w-4 text-purple-500" />
                    视频提示词
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(editForm.videoPrompt || currentAsset.videoPrompt || '', 'videoPrompt')}
                  >
                    {copiedField === 'videoPrompt' ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <div className="relative">
                  <Textarea
                    value={editingAsset?.id === currentAsset.id ? editForm.videoPrompt : (currentAsset.videoPrompt || '')}
                    onChange={(e) => setEditForm({ ...editForm, videoPrompt: e.target.value })}
                    onBlur={autoSave}
                    onFocus={() => startEditing('videoPrompt')}
                    placeholder="点击编辑视频提示词..."
                    className="min-h-[100px] font-mono text-xs bg-muted/50 resize-none focus:bg-background transition-colors"
                  />
                </div>
              </div>

              {/* 关联资产（仅分镜） */}
              {currentAsset.category === 'storyboard' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">关联资产</label>
                  <div className="space-y-2">
                    {currentAsset.scene_name && (
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-green-50">
                        <MapPin className="h-4 w-4 text-green-600" />
                        <span className="text-sm">{currentAsset.scene_name}</span>
                      </div>
                    )}
                    {currentAsset.character_names && currentAsset.character_names.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {currentAsset.character_names.map((name, i) => (
                          <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-blue-50 text-sm">
                            <User className="h-3.5 w-3.5 text-blue-600" />
                            {name}
                          </div>
                        ))}
                      </div>
                    )}
                    {currentAsset.prop_names && currentAsset.prop_names.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {currentAsset.prop_names.map((name, i) => (
                          <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-orange-50 text-sm">
                            <Box className="h-3.5 w-3.5 text-orange-600" />
                            {name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="pt-4 flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1" 
                  onClick={() => onDelete(currentAsset)}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  删除
                </Button>
                <Button 
                  className="flex-1" 
                  onClick={() => onEdit(currentAsset)}
                >
                  <Edit3 className="h-4 w-4 mr-1" />
                  编辑
                </Button>
              </div>
            </div>
            <ScrollBar orientation="vertical" />
          </ScrollArea>
        </div>

        {/* 展开提示词面板按钮 */}
        {!showPromptPanel && (
          <button
            onClick={() => setShowPromptPanel(true)}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-20 bg-card border rounded-l-lg shadow-lg flex items-center justify-center hover:bg-accent transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* 全屏预览 */}
      {showFullscreen && thumbnail && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setShowFullscreen(false)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); goToPrev() }}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <ChevronLeft className="w-8 h-8 text-white" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); goToNext() }}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <ChevronRight className="w-8 h-8 text-white" />
          </button>
          <button
            onClick={() => setShowFullscreen(false)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <X className="w-6 h-6 text-white" />
          </button>
          <img
            src={thumbnail}
            alt={currentAsset.name}
            className="max-w-[90vw] max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white text-center">
            <p className="text-lg font-medium">{currentAsset.name}</p>
            <p className="text-sm text-white/60">{currentIndex + 1} / {assets.length}</p>
          </div>
        </div>
      )}
    </div>
  )
}
