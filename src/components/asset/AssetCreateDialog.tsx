import { useState, useCallback, useEffect } from 'react'

import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { copyFile, mkdir } from '@tauri-apps/plugin-fs'
import { appDataDir, join } from '@tauri-apps/api/path'
import {
  Box,
  Check,
  FileJson,
  FileUp,
  Image as ImageIcon,
  Loader2,
  Mountain,
  User,
  Video,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/useToast'

export type AssetCreateCategory = 'character' | 'scene' | 'prop' | 'storyboard'

export interface AssetCreateData {
  category: AssetCreateCategory
  name: string
  description: string
  prompt: string
  videoPrompt: string
  tags: string[]
  image?: string
  insertPosition: 'end' | 'start' | number
  jsonItems?: AssetCreateData[]
}

interface AssetCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultCategory?: AssetCreateCategory
  projectId?: string
  episodeId?: string
  existingCount?: number
  existingItems?: { id: string; name: string }[]
  onSubmit: (data: AssetCreateData) => Promise<void>
}

const CATEGORY_CONFIG: Record<
  AssetCreateCategory,
  { label: string; icon: React.ReactNode; acceptTypes?: string }
> = {
  character: {
    label: '角色',
    icon: <User className="w-4 h-4" />,
    acceptTypes: '.jpg,.jpeg,.png,.webp',
  },
  scene: {
    label: '场景',
    icon: <Mountain className="w-4 h-4" />,
    acceptTypes: '.jpg,.jpeg,.png,.webp',
  },
  prop: {
    label: '道具',
    icon: <Box className="w-4 h-4" />,
    acceptTypes: '.jpg,.jpeg,.png,.webp',
  },
  storyboard: {
    label: '分镜',
    icon: <ImageIcon className="w-4 h-4" />,
    acceptTypes: '.jpg,.jpeg,.png,.webp',
  },
}

const getDefaultJsonTemplate = (cat: AssetCreateCategory): string => {
  const config = CATEGORY_CONFIG[cat]
  const label = config?.label || '资产'
  const template: Record<string, unknown> = {
    name: `${label}名称`,
    description: '描述',
    prompt: '提示词',
    tags: ['标签1'],
  }
  if (cat === 'storyboard') {
    template.videoPrompt = '视频提示词'
  }
  return JSON.stringify([template], null, 2)
}

export function AssetCreateDialog({
  open,
  onOpenChange,
  defaultCategory = 'character',
  projectId,
  episodeId,
  existingCount = 0,
  existingItems = [],
  onSubmit,
}: AssetCreateDialogProps) {
  const { toast } = useToast()

  const [category, setCategory] = useState<AssetCreateCategory>(defaultCategory)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [prompt, setPrompt] = useState('')
  const [videoPrompt, setVideoPrompt] = useState('')
  const [tags, setTags] = useState('')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [insertPosition, setInsertPosition] = useState<'end' | 'start' | number>('end')
  const [useJsonMode, setUseJsonMode] = useState(false)
  const [jsonInput, setJsonInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const prefillJsonInput = useCallback(() => {
    setJsonInput(getDefaultJsonTemplate(category))
  }, [category])

  const handleJsonModeToggle = useCallback((checked: boolean) => {
    setUseJsonMode(checked)
  }, [])

  useEffect(() => {
    if (!open) {
      setJsonInput('')
      setUseJsonMode(false)
    }
  }, [open])

  const resetForm = useCallback(() => {
    setName('')
    setDescription('')
    setPrompt('')
    setVideoPrompt('')
    setTags('')
    setSelectedFile(null)
    setInsertPosition('end')
    setUseJsonMode(false)
  }, [])

  const handleCategoryChange = useCallback((cat: AssetCreateCategory) => {
    setCategory(cat)
    setSelectedFile(null)
  }, [])

  const handleSelectFile = async () => {
    const config = CATEGORY_CONFIG[category]
    if (!config.acceptTypes) return

    try {
      const selected = await openDialog({
        multiple: false,
        filters: [
          {
            name: config.label,
            extensions: config.acceptTypes.replace(/\./g, '').split(','),
          },
        ],
      })

      if (selected) {
        setSelectedFile(selected as string)
        const fileName = (selected as string).split(/[\\/]/).pop()?.split('.')[0] || ''
        if (!name) {
          setName(fileName)
        }
      }
    } catch (error) {
      toast({ title: '选择文件失败', variant: 'destructive' })
    }
  }

  const uploadFile = async (sourcePath: string): Promise<string> => {
    const appData = await appDataDir()
    const assetsDir = await join(appData, 'assets', category)
    await mkdir(assetsDir, { recursive: true })
    const fileName = sourcePath.split(/[\\/]/).pop() || `file_${Date.now()}`
    const destPath = await join(assetsDir, `${Date.now()}_${fileName}`)
    await copyFile(sourcePath, destPath)
    return destPath
  }

  const handleSubmit = async () => {
    if (isSubmitting) return

    if (useJsonMode) {
      try {
        const jsonData = JSON.parse(jsonInput)
        const items = Array.isArray(jsonData) ? jsonData : [jsonData]

        const jsonItems: AssetCreateData[] = items.map(item => ({
          category: item.category || category,
          name: item.name || '未命名',
          description: item.description || '',
          prompt: item.prompt || '',
          videoPrompt: item.videoPrompt || '',
          tags: item.tags || [],
          insertPosition: insertPosition,
        }))

        setIsSubmitting(true)
        await onSubmit({
          category,
          name: '',
          description: '',
          prompt: '',
          videoPrompt: '',
          tags: [],
          insertPosition,
          jsonItems,
        })
        resetForm()
        onOpenChange(false)
      } catch (error) {
        toast({ title: 'JSON 格式错误', variant: 'destructive' })
      }
      return
    }

    if (!name.trim()) {
      toast({ title: '请输入名称', variant: 'destructive' })
      return
    }

    setIsSubmitting(true)
    try {
      let filePath: string | undefined
      if (selectedFile) {
        filePath = await uploadFile(selectedFile)
      }

      await onSubmit({
        category,
        name: name.trim(),
        description,
        prompt,
        videoPrompt,
        tags: tags
          .split(',')
          .map(t => t.trim())
          .filter(Boolean),
        image: filePath,
        insertPosition,
      })

      resetForm()
      onOpenChange(false)
    } catch (error) {
      toast({ title: '创建失败', variant: 'destructive' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    resetForm()
    onOpenChange(false)
  }

  const config = CATEGORY_CONFIG[category]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>新建资产</DialogTitle>
          <DialogDescription>创建新的资产，支持普通模式和 JSON 批量模式</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              <FileJson className="h-4 w-4" />
              <span className="text-sm font-medium">JSON 批量模式</span>
            </div>
            <Switch
              checked={useJsonMode}
              onCheckedChange={checked => {
                handleJsonModeToggle(checked)
                if (checked) {
                  prefillJsonInput()
                }
              }}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">资产类型</label>
            <Select value={category} onValueChange={v => handleCategoryChange(v as AssetCreateCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CATEGORY_CONFIG) as AssetCreateCategory[]).map(cat => (
                  <SelectItem key={cat} value={cat}>
                    <div className="flex items-center gap-2">
                      {CATEGORY_CONFIG[cat].icon}
                      {CATEGORY_CONFIG[cat].label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {useJsonMode ? (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">JSON 数据</label>
                <Textarea
                  value={jsonInput}
                  onChange={e => setJsonInput(e.target.value)}
                  className="font-mono text-xs min-h-[200px]"
                />
                <p className="text-xs text-muted-foreground">
                  支持单条对象或对象数组格式，可包含 name、description、prompt
                  {category === 'storyboard' ? '、videoPrompt' : ''}、tags 字段
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">插入位置</label>
                <Select
                  value={
                    insertPosition === 'end'
                      ? 'end'
                      : insertPosition === 'start'
                        ? 'start'
                        : String(insertPosition)
                  }
                  onValueChange={v => {
                    if (v === 'end') setInsertPosition('end')
                    else if (v === 'start') setInsertPosition('start')
                    else setInsertPosition(parseInt(v))
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="end">添加到最后</SelectItem>
                    <SelectItem value="start">插入到开头</SelectItem>
                    {existingItems.map((item, index) => (
                      <SelectItem key={item.id} value={String(index)}>
                        插入到第 {index + 1} 位（{item.name} 之前）
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <>
              {config.acceptTypes && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">文件</label>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={handleSelectFile} className="flex-1">
                      <FileUp className="h-4 w-4 mr-2" />
                      {selectedFile ? '更换文件' : '选择文件'}
                    </Button>
                    {selectedFile && (
                      <Button type="button" variant="ghost" size="icon" onClick={() => setSelectedFile(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {selectedFile && (
                    <p className="text-xs text-muted-foreground truncate">
                      已选择: {selectedFile.split(/[\\/]/).pop()}
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">名称</label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={`请输入${config.label}名称`}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">描述</label>
                <Textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="请输入描述（可选）"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">提示词</label>
                <Textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="AI 生图提示词（可选）"
                  rows={3}
                />
              </div>

              {category === 'storyboard' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-1">
                    <Video className="h-3 w-3" />
                    视频提示词
                  </label>
                  <Textarea
                    value={videoPrompt}
                    onChange={e => setVideoPrompt(e.target.value)}
                    placeholder="AI 生视频提示词（可选）"
                    rows={3}
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">标签</label>
                <Input
                  value={tags}
                  onChange={e => setTags(e.target.value)}
                  placeholder="多个标签用逗号分隔"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">插入位置</label>
                <Select
                  value={
                    insertPosition === 'end'
                      ? 'end'
                      : insertPosition === 'start'
                        ? 'start'
                        : String(insertPosition)
                  }
                  onValueChange={v => {
                    if (v === 'end') setInsertPosition('end')
                    else if (v === 'start') setInsertPosition('start')
                    else setInsertPosition(parseInt(v))
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="end">添加到最后</SelectItem>
                    <SelectItem value="start">插入到开头</SelectItem>
                    {existingItems.map((item, index) => (
                      <SelectItem key={item.id} value={String(index)}>
                        插入到第 {index + 1} 位（{item.name} 之前）
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                创建中...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-1" />
                创建
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
