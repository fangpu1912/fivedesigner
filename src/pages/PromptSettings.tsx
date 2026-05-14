import { useState, useCallback, useEffect, useMemo } from 'react'

import { confirm, save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'
import {
  Settings,
  Plus,
  Trash2,
  Copy,
  Download,
  Upload,
  RefreshCw,
  Save,
  Play,
  Package,
  Edit3,
  Check,
  X,
  Search,
  Tag,
  AlertCircle,
  ChevronDown,
  Sparkles,
  BookOpen,
  Film,
  Mic,
  MapPin,
  Layers,
  Bot,
  Users,
  GitBranch,
  ListTree,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
// ScrollArea imported but not used in this file
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import {
  getAllTemplates,
  getActiveTemplate,
  setActiveTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  duplicateTemplate,
  resetToDefault,
  importPreset,
  exportConfig,
  importConfig,
  replaceVariables,
  validateTemplate,
} from '@/services/promptConfigService'
import type { PromptTemplate, PromptType, PromptPreset } from '@/types/prompt'
import { PROMPT_TYPE_CONFIG, POPULAR_PROMPT_PRESETS } from '@/types/prompt'
import { PromptEditor } from '@/components/prompt/PromptEditor'
import { PromptTester } from '@/components/prompt/PromptTester'
// PromptDiffViewer imported for future use in version comparison feature
import { optimizePrompt } from '@/utils/promptAnalyzer'

const hasTauriInvoke = () =>
  typeof window !== 'undefined' &&
  typeof (window as Window & { __TAURI_INTERNALS__?: { invoke?: unknown } }).__TAURI_INTERNALS__
    ?.invoke === 'function'

// 类型图标映射
const TYPE_ICONS: Record<PromptType, React.ReactNode> = {
  assistant_chat: <Bot className="h-4 w-4" />,
  pipeline_scene_segmentation: <MapPin className="h-4 w-4" />,
  pipeline_asset_extraction: <Layers className="h-4 w-4" />,
  pipeline_storyboard_breakdown: <Film className="h-4 w-4" />,
  pipeline_dubbing_generation: <Mic className="h-4 w-4" />,
  script_structure_analysis: <BookOpen className="h-4 w-4" />,
  script_character_arc: <Users className="h-4 w-4" />,
  script_adaptation_strategy: <GitBranch className="h-4 w-4" />,
  script_outline_generation: <ListTree className="h-4 w-4" />,
  inspiration_creation: <Sparkles className="h-4 w-4" />,
}

// 模板编辑器组件
function TemplateEditorEnhanced({
  template,
  onSave,
  onCancel,
}: {
  template: PromptTemplate | null
  onSave: (template: Partial<PromptTemplate>) => void
  onCancel: () => void
}) {
  const [formData, setFormData] = useState<Partial<PromptTemplate>>({
    name: '',
    description: '',
    type: 'pipeline_scene_segmentation',
    content: '',
    variables: [],
    category: '自定义',
    tags: [],
  })
  const [newVariable, setNewVariable] = useState('')
  const [newTag, setNewTag] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [optimizationResult, setOptimizationResult] = useState<{
    optimized: string
    suggestions: string[]
  } | null>(null)

  useEffect(() => {
    if (template) {
      setFormData({
        name: template.name,
        description: template.description,
        type: template.type,
        content: template.content,
        variables: [...template.variables],
        category: template.category,
        tags: [...template.tags],
      })
    }
  }, [template])

  const handleAddVariable = () => {
    if (newVariable && !formData.variables?.includes(newVariable)) {
      setFormData(prev => ({
        ...prev,
        variables: [...(prev.variables || []), newVariable],
      }))
      setNewVariable('')
    }
  }

  const handleRemoveVariable = (variable: string) => {
    setFormData(prev => ({
      ...prev,
      variables: prev.variables?.filter(v => v !== variable) || [],
    }))
  }

  const handleAddTag = () => {
    if (newTag && !formData.tags?.includes(newTag)) {
      setFormData(prev => ({
        ...prev,
        tags: [...(prev.tags || []), newTag],
      }))
      setNewTag('')
    }
  }

  const handleRemoveTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags?.filter(t => t !== tag) || [],
    }))
  }

  const handleValidate = () => {
    if (!formData.content || !formData.variables) return false
    const result = validateTemplate(formData.content, formData.variables)
    if (!result.valid) {
      setValidationError(result.error || '验证失败')
      return false
    }
    setValidationError(null)
    return true
  }

  const handleSave = () => {
    if (!formData.name?.trim()) {
      setValidationError('模板名称不能为空')
      return
    }
    if (!formData.content?.trim()) {
      setValidationError('模板内容不能为空')
      return
    }
    if (handleValidate()) {
      onSave(formData)
    }
  }

  const handleOptimize = () => {
    if (!formData.content) return
    const result = optimizePrompt(formData.content)
    setOptimizationResult(result)
    if (result.suggestions.length > 0) {
      setFormData(prev => ({ ...prev, content: result.optimized }))
    }
  }

  return (
    <div className="space-y-4">
      {validationError && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
          <span className="text-sm text-red-600">{validationError}</span>
        </div>
      )}

      {optimizationResult && optimizationResult.suggestions.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-md p-3">
          <div className="text-sm font-medium text-green-700 mb-1">优化建议已应用:</div>
          <ul className="text-sm text-green-600 list-disc list-inside">
            {optimizationResult.suggestions.map((suggestion, index) => (
              <li key={index}>{suggestion}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">模板名称</label>
          <Input
            value={formData.name}
            onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
            placeholder="输入模板名称"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">模板类型</label>
          <Select
            value={formData.type}
            onValueChange={(value: PromptType) => setFormData(prev => ({ ...prev, type: value }))}
            disabled={!!template?.isPreset}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PROMPT_TYPE_CONFIG).map(([type, config]) => (
                <SelectItem key={type} value={type}>
                  <div className="flex items-center gap-2">
                    {TYPE_ICONS[type as PromptType]}
                    {config.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">描述</label>
        <Input
          value={formData.description}
          onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
          placeholder="输入模板描述"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">分类</label>
        <Input
          value={formData.category}
          onChange={e => setFormData(prev => ({ ...prev, category: e.target.value }))}
          placeholder="输入分类"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">变量定义</label>
        <div className="flex gap-2">
          <Input
            value={newVariable}
            onChange={e => setNewVariable(e.target.value)}
            placeholder="添加变量名（如：content, characterName）"
            onKeyDown={e => e.key === 'Enter' && handleAddVariable()}
          />
          <Button type="button" onClick={handleAddVariable} variant="outline">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {formData.variables?.map(variable => (
            <Badge key={variable} variant="secondary" className="flex items-center gap-1">
              {'{{'} {variable} {'}}'}
              <button
                onClick={() => handleRemoveVariable(variable)}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          在模板内容中使用 {'{{'} 变量名 {'}}'} 格式插入变量
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">标签</label>
        <div className="flex gap-2">
          <Input
            value={newTag}
            onChange={e => setNewTag(e.target.value)}
            placeholder="添加标签"
            onKeyDown={e => e.key === 'Enter' && handleAddTag()}
          />
          <Button type="button" onClick={handleAddTag} variant="outline">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {formData.tags?.map(tag => (
            <Badge key={tag} variant="outline" className="flex items-center gap-1">
              <Tag className="h-3 w-3" />
              {tag}
              <button onClick={() => handleRemoveTag(tag)} className="ml-1 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">模板内容</label>
          <Button variant="ghost" size="sm" onClick={handleOptimize}>
            <Sparkles className="h-4 w-4 mr-1" />
            优化提示词
          </Button>
        </div>
        <PromptEditor
          value={formData.content || ''}
          onChange={content => setFormData(prev => ({ ...prev, content }))}
          variables={formData.variables || []}
          placeholder="输入提示词模板内容..."
          showAnalysis={true}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          <X className="h-4 w-4 mr-2" />
          取消
        </Button>
        <Button onClick={handleSave}>
          <Save className="h-4 w-4 mr-2" />
          保存
        </Button>
      </div>
    </div>
  )
}

// 提示词预览组件（用于详情页）
function PromptPreview({ template }: { template: PromptTemplate | null }) {
  const [variables, setVariables] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState('')

  useEffect(() => {
    if (template) {
      // 初始化变量默认值
      const defaultVars: Record<string, string> = {}
      template.variables.forEach(v => {
        defaultVars[v] = variables[v] || ''
      })
      setVariables(defaultVars)
    }
  }, [template])

  useEffect(() => {
    if (template) {
      const result = replaceVariables(template.content, variables)
      setPreview(result)
    }
  }, [template, variables])

  if (!template) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        请选择一个模板进行测试
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h4 className="font-medium">变量输入</h4>
        <div className="grid grid-cols-2 gap-3">
          {template.variables.map(variable => (
            <div key={variable} className="space-y-1">
              <label className="text-xs text-muted-foreground">
                {'{{'} {variable} {'}}'}
              </label>
              <Input
                value={variables[variable] || ''}
                onChange={e => setVariables(prev => ({ ...prev, [variable]: e.target.value }))}
                placeholder={`输入 ${variable}`}
              />
            </div>
          ))}
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">实时预览</h4>
          <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(preview)}>
            <Copy className="h-4 w-4 mr-2" />
            复制
          </Button>
        </div>
        <Textarea
          value={preview}
          readOnly
          className="min-h-[300px] font-mono text-sm bg-muted scrollbar-hide"
        />
      </div>
    </div>
  )
}

// 预设市场组件
function PresetMarket({ onImport }: { onImport: () => void }) {
  const [importJson, setImportJson] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState(false)

  const handleImportPreset = (preset: PromptPreset) => {
    importPreset(preset)
    onImport()
  }

  const handleImportJson = () => {
    setImportError(null)
    setImportSuccess(false)
    const result = importConfig(importJson)
    if (result.success) {
      setImportSuccess(true)
      setImportJson('')
      onImport()
    } else {
      setImportError(result.error || '导入失败')
    }
  }

  return (
    <div className="space-y-6">
      {/* 官方预设 */}
      <div className="space-y-3">
        <h3 className="font-medium flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          官方预设包
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {POPULAR_PROMPT_PRESETS.map(preset => (
            <Card key={preset.id} className="hover:border-primary transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{preset.name}</CardTitle>
                  {preset.isOfficial && (
                    <Badge variant="secondary" className="text-xs">
                      官方
                    </Badge>
                  )}
                </div>
                <CardDescription className="text-xs">{preset.description}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                  <span>作者: {preset.author}</span>
                  <span>{preset.templates.length} 个模板</span>
                </div>
                <Button className="w-full" size="sm" onClick={() => handleImportPreset(preset)}>
                  <Download className="h-4 w-4 mr-2" />
                  导入
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Separator />

      {/* JSON导入 */}
      <div className="space-y-3">
        <h3 className="font-medium flex items-center gap-2">
          <Upload className="h-4 w-4" />
          导入自定义配置
        </h3>
        {importError && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
            <span className="text-sm text-red-600">{importError}</span>
          </div>
        )}
        {importSuccess && (
          <div className="bg-green-50 border border-green-200 rounded-md p-3 flex items-start gap-2">
            <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
            <span className="text-sm text-green-600">导入成功！</span>
          </div>
        )}
        <Textarea
          value={importJson}
          onChange={e => setImportJson(e.target.value)}
          placeholder="粘贴 JSON 配置..."
          className="min-h-[150px] font-mono text-sm"
        />
        <Button onClick={handleImportJson} disabled={!importJson.trim()}>
          <Upload className="h-4 w-4 mr-2" />
          导入配置
        </Button>
      </div>
    </div>
  )
}

// 主页面组件
export function PromptSettings() {
  const { toast } = useToast()
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [selectedType, setSelectedType] = useState<PromptType | 'all'>('all')
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState('templates')

  // 加载模板
  const loadTemplates = useCallback(() => {
    const allTemplates = getAllTemplates()
    setTemplates(allTemplates)
  }, [])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  // 过滤模板
  const filteredTemplates = useMemo(() => {
    let result = templates

    if (selectedType !== 'all') {
      result = result.filter(t => t.type === selectedType)
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        t =>
          t.name.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query) ||
          t.tags.some(tag => tag.toLowerCase().includes(query))
      )
    }

    return result
  }, [templates, selectedType, searchQuery])

  // 按类型分组
  const groupedTemplates = useMemo(() => {
    const groups: Record<string, PromptTemplate[]> = {}
    filteredTemplates.forEach(template => {
      const typeConfig = PROMPT_TYPE_CONFIG[template.type]
      if (!typeConfig) {
        console.warn(`Unknown prompt type: ${template.type}`)
        return
      }
      const typeLabel = typeConfig.label
      if (!groups[typeLabel]) {
        groups[typeLabel] = []
      }
      groups[typeLabel].push(template)
    })
    return groups
  }, [filteredTemplates])

  // 处理创建模板
  const handleCreate = () => {
    setSelectedTemplate(null)
    setIsEditing(true)
  }

  // 处理编辑模板
  const handleEdit = (template: PromptTemplate) => {
    setSelectedTemplate(template)
    setIsEditing(true)
  }

  // 处理保存模板
  const handleSave = (formData: Partial<PromptTemplate>) => {
    try {
      if (selectedTemplate) {
        const result = updateTemplate(selectedTemplate.id, formData)
        if (!result) {
          toast({
            title: '保存失败',
            description: '未找到模板，请刷新页面后重试',
            variant: 'destructive',
          })
          return
        }
      } else {
        createTemplate(formData as Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>)
      }
      loadTemplates()
      setIsEditing(false)
      toast({
        title: '保存成功',
        description: '模板已更新',
      })
    } catch (error) {
      console.error('Save template error:', error)
      toast({
        title: '保存失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      })
    }
  }

  // 处理删除模板
  const handleDelete = async (templateId: string) => {
    const confirmed = hasTauriInvoke()
      ? await confirm('确定要删除这个模板吗？', {
          title: '删除确认',
          kind: 'warning',
          okLabel: '确定',
          cancelLabel: '取消',
        })
      : window.confirm('确定要删除这个模板吗？')
    if (confirmed) {
      deleteTemplate(templateId)
      loadTemplates()
      if (selectedTemplate?.id === templateId) {
        setSelectedTemplate(null)
      }
    }
  }

  // 处理复制模板
  const handleDuplicate = (templateId: string) => {
    duplicateTemplate(templateId)
    loadTemplates()
  }

  // 处理设置激活模板
  const handleSetActive = (template: PromptTemplate) => {
    setActiveTemplate(template.type, template.id)
    loadTemplates()
  }

  // 处理导出
  const handleExport = async () => {
    try {
      const json = exportConfig()

      if (!hasTauriInvoke()) {
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `prompt_config_${new Date().toISOString().slice(0, 10)}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        toast({
          title: '导出成功',
          description: '已下载 JSON 配置文件',
        })
        return
      }

      // 打开保存对话框
      const savePath = await save({
        defaultPath: `prompt_config_${new Date().toISOString().slice(0, 10)}.json`,
        filters: [
          { name: 'JSON 文件', extensions: ['json'] },
          { name: '所有文件', extensions: ['*'] },
        ],
        title: '导出提示词配置',
      })

      if (!savePath) return

      // 写入文件
      await writeFile(savePath, new TextEncoder().encode(json))

      toast({
        title: '导出成功',
        description: `配置已保存到: ${savePath}`,
      })
    } catch (error) {
      console.error('导出失败:', error)
      toast({
        title: '导出失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      })
    }
  }

  // 处理重置
  const handleReset = async () => {
    const confirmed = hasTauriInvoke()
      ? await confirm('确定要重置为默认配置吗？所有自定义模板将被删除。', {
          title: '重置确认',
          kind: 'warning',
          okLabel: '确定',
          cancelLabel: '取消',
        })
      : window.confirm('确定要重置为默认配置吗？所有自定义模板将被删除。')
    if (confirmed) {
      resetToDefault()
      loadTemplates()
      setSelectedTemplate(null)
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 头部 */}
      <div className="h-14 border-b flex items-center justify-between px-4 bg-muted/30">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          <h1 className="font-semibold">提示词设置</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            导出
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RefreshCw className="h-4 w-4 mr-2" />
            重置
          </Button>
        </div>
      </div>

      {/* 主内容 */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="px-4 pt-4">
          <TabsList>
            <TabsTrigger value="templates">
              <BookOpen className="h-4 w-4 mr-2" />
              模板管理
            </TabsTrigger>
            <TabsTrigger value="market">
              <Package className="h-4 w-4 mr-2" />
              预设市场
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="templates"
          className="flex-1 flex m-0 p-4 overflow-hidden"
          style={{ height: 'calc(100vh - 120px)' }}
        >
          {/* 左侧模板列表 */}
          <div className="w-80 border-r flex flex-col pr-4" style={{ height: '100%' }}>
            {/* 搜索和过滤 */}
            <div className="space-y-3 mb-4 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="搜索模板..."
                  className="pl-9"
                />
              </div>
              <Select
                value={selectedType}
                onValueChange={v => setSelectedType(v as PromptType | 'all')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  {Object.entries(PROMPT_TYPE_CONFIG).map(([type, config]) => (
                    <SelectItem key={type} value={type}>
                      <div className="flex items-center gap-2">
                        {TYPE_ICONS[type as PromptType]}
                        {config.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button className="w-full" onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-2" />
                新建模板
              </Button>
            </div>

            {/* 模板列表 */}
            <div className="flex-1 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
              <div className="space-y-4 pr-2 pb-4">
                {Object.entries(groupedTemplates).map(([typeLabel, typeTemplates]) => (
                  <div key={typeLabel}>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <ChevronDown className="h-3 w-3" />
                      {typeLabel}
                    </h4>
                    <div className="space-y-1">
                      {typeTemplates.map(template => {
                        const isActive = getActiveTemplate(template.type)?.id === template.id
                        return (
                          <div
                            key={template.id}
                            className={cn(
                              'p-2 rounded-md transition-colors group',
                              selectedTemplate?.id === template.id
                                ? 'bg-primary/10 border border-primary/30'
                                : 'hover:bg-muted border border-transparent',
                              isEditing ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                            )}
                            onClick={() => {
                              if (!isEditing) {
                                setSelectedTemplate(template)
                              }
                            }}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1">
                                  <span className="font-medium text-sm truncate">
                                    {template.name}
                                  </span>
                                  {isActive && (
                                    <Badge variant="default" className="text-[10px] px-1 py-0 h-4">
                                      使用中
                                    </Badge>
                                  )}
                                  {template.isPreset && (
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px] px-1 py-0 h-4"
                                    >
                                      预置
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground truncate">
                                  {template.description}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {!isActive && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={e => {
                                    e.stopPropagation()
                                    handleSetActive(template)
                                  }}
                                  title="设为默认"
                                >
                                  <Check className="h-3 w-3" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={e => {
                                  e.stopPropagation()
                                  handleEdit(template)
                                }}
                                title="编辑"
                              >
                                <Edit3 className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={e => {
                                  e.stopPropagation()
                                  handleDuplicate(template.id)
                                }}
                                title="复制"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                              {!template.isPreset && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-destructive"
                                  onClick={e => {
                                    e.stopPropagation()
                                    handleDelete(template.id)
                                  }}
                                  title="删除"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 右侧编辑/预览区 */}
          <div className="flex-1 pl-4 overflow-hidden">
            {isEditing ? (
              <Card className="h-full flex flex-col">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    {selectedTemplate ? '编辑模板' : '新建模板'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-auto">
                  <TemplateEditorEnhanced
                    template={selectedTemplate}
                    onSave={handleSave}
                    onCancel={() => setIsEditing(false)}
                  />
                </CardContent>
              </Card>
            ) : selectedTemplate ? (
              <Tabs defaultValue="test" className="h-full flex flex-col">
                <TabsList className="w-fit">
                  <TabsTrigger value="test">
                    <Play className="h-4 w-4 mr-2" />
                    效果测试
                  </TabsTrigger>
                  <TabsTrigger value="preview">
                    <Edit3 className="h-4 w-4 mr-2" />
                    变量预览
                  </TabsTrigger>
                  <TabsTrigger value="detail">
                    <Settings className="h-4 w-4 mr-2" />
                    详情
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="test" className="flex-1 m-0 pt-4 overflow-auto">
                  <Card>
                    <CardContent className="pt-6">
                      <PromptTester template={selectedTemplate} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="preview" className="flex-1 m-0 pt-4">
                  <Card>
                    <CardContent className="pt-6">
                      <PromptPreview template={selectedTemplate} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="detail" className="flex-1 m-0 pt-4">
                  <Card>
                    <CardContent className="pt-6 space-y-4">
                      <div>
                        <label className="text-sm font-medium">名称</label>
                        <p className="text-sm text-muted-foreground">{selectedTemplate.name}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium">描述</label>
                        <p className="text-sm text-muted-foreground">
                          {selectedTemplate.description}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium">类型</label>
                        <p className="text-sm text-muted-foreground">
                          {PROMPT_TYPE_CONFIG[selectedTemplate.type]?.label || selectedTemplate.type}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium">变量</label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {selectedTemplate.variables.map(v => (
                            <Badge key={v} variant="secondary">
                              {'{{'} {v} {'}}'}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium">标签</label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {selectedTemplate.tags.map(tag => (
                            <Badge key={tag} variant="outline">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium">内容</label>
                        <Textarea
                          value={selectedTemplate.content}
                          readOnly
                          className="min-h-[200px] font-mono text-sm mt-1"
                        />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>选择一个模板查看详情或点击"新建模板"创建</p>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="market" className="flex-1 overflow-auto m-0 p-4">
          <PresetMarket onImport={loadTemplates} />
        </TabsContent>
      </Tabs>

      {/* 编辑对话框 */}
      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{selectedTemplate ? '编辑模板' : '新建模板'}</DialogTitle>
            <DialogDescription>
              {selectedTemplate ? '修改模板内容' : '创建新的提示词模板'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto scrollbar-hide">
            <TemplateEditorEnhanced
              template={selectedTemplate}
              onSave={handleSave}
              onCancel={() => setIsEditing(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
