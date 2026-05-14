/**
 * 供应商配置面板
 * 简化设计：突出主要配置，隐藏高级选项
 */

import { useState, useEffect } from 'react'

import {
  Save,
  Trash2,
  Plus,
  Globe,
  Image,
  Video,
  Mic,
  MessageSquare,
  Settings,
  Key,
  RefreshCw,
  Pencil,
  X,
  Power,
  Code,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/useToast'
import { cn, generateId } from '@/lib/utils'
import { vendorConfigService, defaultVendors } from '@/services/vendor'
import type { VendorConfig, AgentDeploy } from '@/services/vendor'

// 服务类型图标
const SERVICE_ICONS = {
  text: MessageSquare,
  image: Image,
  video: Video,
  tts: Mic,
}

const SERVICE_COLORS = {
  text: 'text-blue-500',
  image: 'text-green-500',
  video: 'text-purple-500',
  tts: 'text-orange-500',
}

// 供应商编辑表单 - 提前定义避免渲染时未定义
interface VendorEditFormProps {
  vendor: VendorConfig
  isEditing: boolean
  showAdvanced: boolean
  onToggleAdvanced: () => void
  onEdit: () => void
  onCancel: () => void
  onSave: (vendor: VendorConfig) => void
  onDelete: () => void
}

function VendorEditForm({
  vendor,
  isEditing,
  showAdvanced,
  onToggleAdvanced,
  onEdit,
  onCancel,
  onSave,
  onDelete,
}: VendorEditFormProps) {
  const { toast } = useToast()
  const [formData, setFormData] = useState<VendorConfig>(vendor)

  useEffect(() => {
    setFormData(vendor)
  }, [vendor])

  // 查看模式
  if (!isEditing) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">{vendor.name}</CardTitle>
              <CardDescription className="text-xs mt-1">
                {vendor.enable ? '已启用' : '已禁用'} · {vendor.models.length}个模型
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Pencil className="w-4 h-4 mr-1" />
                编辑
              </Button>
              <Button variant="destructive" size="sm" onClick={onDelete}>
                <Trash2 className="w-4 h-4 mr-1" />
                删除
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto space-y-6">
          {/* API密钥等配置值 */}
          {vendor.inputs.length > 0 && (
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Key className="w-4 h-4" />
                API配置
              </Label>
              <div className="space-y-2">
                {vendor.inputs.map(input => (
                  <div key={input.key} className="p-3 rounded border bg-muted/50">
                    <div className="text-sm font-medium">{input.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {vendor.inputValues[input.key] 
                        ? (input.type === 'password' ? '••••••••' : vendor.inputValues[input.key])
                        : '未配置'
                      }
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 模型列表 */}
          <div className="space-y-2">
            <Label>模型列表</Label>
            <div className="grid grid-cols-2 gap-2">
              {vendor.models.map(model => {
                const Icon = SERVICE_ICONS[model.type as keyof typeof SERVICE_ICONS] || MessageSquare
                const colorClass = SERVICE_COLORS[model.type as keyof typeof SERVICE_COLORS] || 'text-gray-500'
                return (
                  <div key={model.modelName} className="p-2 rounded border">
                    <div className="flex items-center gap-2">
                      <Icon className={cn('w-4 h-4', colorClass)} />
                      <span className="text-sm font-medium">{model.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{model.modelName}</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 描述 */}
          {vendor.description && (
            <div className="space-y-2">
              <Label>描述</Label>
              <div className="p-3 rounded border bg-muted/50 text-sm">
                {vendor.description}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // 编辑模式
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">编辑供应商</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCancel}>
              <X className="w-4 h-4 mr-1" />
              取消
            </Button>
            <Button size="sm" onClick={() => onSave(formData)}>
              <Save className="w-4 h-4 mr-1" />
              保存
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto space-y-6">
        {/* 主要配置 */}
        <div className="space-y-4">
          {/* 名称 */}
          <div className="space-y-2">
            <Label>供应商名称</Label>
            <Input
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="例如：官方中转平台"
            />
          </div>

          {/* 启用状态 */}
          <div className="flex items-center justify-between p-3 rounded border">
            <div className="flex items-center gap-2">
              <Power className="w-4 h-4" />
              <span>启用供应商</span>
            </div>
            <Switch
              checked={formData.enable}
              onCheckedChange={checked => setFormData({ ...formData, enable: checked })}
            />
          </div>
        </div>

        {/* API配置值 */}
        {formData.inputs.length > 0 && (
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Key className="w-4 h-4" />
              API配置
            </Label>
            <div className="space-y-3">
              {formData.inputs.map(input => (
                <div key={input.key} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{input.label}</Label>
                  <Input
                    type={input.type === 'password' ? 'password' : 'text'}
                    placeholder={input.placeholder || `输入${input.label}`}
                    value={formData.inputValues[input.key] || ''}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        inputValues: {
                          ...formData.inputValues,
                          [input.key]: e.target.value,
                        },
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 模型管理 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Globe className="w-4 h-4" />
              模型列表
            </Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const newModel = {
                  name: '新模型',
                  modelName: `model_${Date.now()}`,
                  type: 'text' as const,
                  think: false,
                }
                setFormData({
                  ...formData,
                  models: [...formData.models, newModel],
                })
              }}
            >
              <Plus className="w-3 h-3 mr-1" />
              添加模型
            </Button>
          </div>
          <div className="space-y-2">
            {formData.models.map((model, index) => (
              <div key={model.modelName} className="p-3 rounded border space-y-2">
                <div className="flex items-center gap-2">
                  {model.type === 'text' && <MessageSquare className="w-4 h-4 text-blue-500" />}
                  {model.type === 'image' && <Image className="w-4 h-4 text-green-500" />}
                  {model.type === 'video' && <Video className="w-4 h-4 text-purple-500" />}
                  {model.type === 'tts' && <Mic className="w-4 h-4 text-orange-500" />}
                  <Input
                    className="flex-1 h-8"
                    value={model.name}
                    onChange={e => {
                      const newModels = [...formData.models]
                      newModels[index] = { ...model, name: e.target.value }
                      setFormData({ ...formData, models: newModels })
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => {
                      const newModels = formData.models.filter((_, i) => i !== index)
                      setFormData({ ...formData, models: newModels })
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 pl-6">
                  <Input
                    className="flex-1 h-7 text-xs"
                    placeholder="模型ID"
                    value={model.modelName}
                    onChange={e => {
                      const newModels = [...formData.models]
                      newModels[index] = { ...model, modelName: e.target.value }
                      setFormData({ ...formData, models: newModels })
                    }}
                  />
                  <select
                    className="h-7 text-xs rounded border bg-background px-2"
                    value={model.type}
                    onChange={e => {
                      const newModels = [...formData.models]
                      newModels[index] = { ...model, type: e.target.value as any }
                      setFormData({ ...formData, models: newModels })
                    }}
                  >
                    <option value="text">文本</option>
                    <option value="image">图片</option>
                    <option value="video">视频</option>
                    <option value="tts">语音</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 高级选项 */}
        <div className="border rounded-lg">
          <button
            className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
            onClick={onToggleAdvanced}
          >
            <span className="font-medium">高级选项</span>
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showAdvanced && (
            <div className="p-3 pt-0 space-y-4 border-t">
              {/* 描述 */}
              <div className="space-y-2 pt-3">
                <Label>描述</Label>
                <Textarea
                  value={formData.description || ''}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="输入供应商描述..."
                  rows={3}
                />
              </div>

              {/* 作者 */}
              <div className="space-y-2">
                <Label>作者</Label>
                <Input
                  value={formData.author}
                  onChange={e => setFormData({ ...formData, author: e.target.value })}
                />
              </div>

              {/* 执行代码 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <Code className="w-4 h-4" />
                    执行代码
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      // 先尝试通过 id 匹配，再通过 author 匹配
                      let defaultVendor = defaultVendors.find(v => v.id === formData.id)
                      if (!defaultVendor && formData.author) {
                        defaultVendor = defaultVendors.find(v => v.author === formData.author)
                      }
                      if (!defaultVendor && formData.name?.toLowerCase().includes('toonflow')) {
                        defaultVendor = defaultVendors.find(v => v.id === 'toonflow')
                      }
                      if (defaultVendor?.code) {
                        setFormData({ ...formData, code: defaultVendor.code })
                        toast({ title: '已恢复默认代码' })
                      } else {
                        toast({ title: '未找到默认代码', variant: 'destructive' })
                      }
                    }}
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    恢复默认
                  </Button>
                </div>
                <Textarea
                  value={formData.code}
                  onChange={e => setFormData({ ...formData, code: e.target.value })}
                  rows={10}
                  className="font-mono text-xs"
                  placeholder="输入供应商执行代码..."
                />
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function VendorConfigPanel() {
  const { toast } = useToast()
  const [vendors, setVendors] = useState<VendorConfig[]>([])
  const [agents, setAgents] = useState<AgentDeploy[]>([])
  const [originalAgents, setOriginalAgents] = useState<AgentDeploy[]>([])
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [activeTab, setActiveTab] = useState('vendors')

  // 检查Agent配置是否有变更
  const hasAgentChanges = JSON.stringify(agents) !== JSON.stringify(originalAgents)

  // 加载配置
  useEffect(() => {
    loadConfigs()
  }, [])

  const loadConfigs = async () => {
    const [vendorList, agentList] = await Promise.all([
      vendorConfigService.getAllVendors(),
      vendorConfigService.getAllAgents(),
    ])
    console.log('Loaded vendors:', vendorList.length)
    console.log('Loaded agents:', agentList.length, agentList)
    setVendors(vendorList)
    setAgents(agentList)
    setOriginalAgents(agentList)
  }

  const selectedVendor = vendors.find(v => v.id === selectedVendorId)

  // 保存供应商配置（不刷新列表）
  const handleSaveVendor = async (vendor: VendorConfig) => {
    await vendorConfigService.saveVendor(vendor)
    // 更新本地状态，不调用loadConfigs避免刷新
    setVendors(prev => prev.map(v => v.id === vendor.id ? vendor : v))
    setIsEditing(false)
    toast({ title: '配置已保存' })
  }

  // 删除供应商
  const handleDeleteVendor = async (id: string) => {
    await vendorConfigService.deleteVendor(id)
    // 更新本地状态
    setVendors(prev => prev.filter(v => v.id !== id))
    setSelectedVendorId(null)
    toast({ title: '配置已删除' })
  }

  // 添加新供应商
  const handleAddVendor = async () => {
    const newVendor: VendorConfig = {
      id: generateId(),
      author: 'Custom',
      name: '新供应商',
      inputs: [{ key: 'apiKey', label: 'API密钥', type: 'password', required: true }],
      inputValues: { apiKey: '' },
      models: [],
      code: '',
      enable: false,
      createTime: Date.now(),
    }
    await vendorConfigService.saveVendor(newVendor)
    // 添加到本地状态
    setVendors(prev => [...prev, newVendor])
    setSelectedVendorId(newVendor.id)
    setIsEditing(true)
    toast({ title: '新供应商已创建' })
  }

  // 处理Agent配置变更
  const handleAgentChange = (agentId: string, updatedAgent: AgentDeploy) => {
    console.log('Agent change:', agentId, updatedAgent)
    setAgents(prev => prev.map(a => a.id === agentId ? updatedAgent : a))
  }

  // 保存所有Agent配置
  const handleSaveAllAgents = async () => {
    console.log('Saving agents:', agents)
    for (const agent of agents) {
      console.log('Saving agent:', agent.id, 'vendorId:', agent.vendorId, 'modelName:', agent.modelName)
      await vendorConfigService.saveAgent(agent)
    }
    setOriginalAgents(agents)
    toast({ title: '所有配置已保存' })
  }

  // 刷新默认配置（保留用户已配置的API密钥等）
  const handleRefreshDefaults = async () => {
    let addedCount = 0
    let updatedCount = 0
    
    for (const defaultVendor of defaultVendors) {
      // 检查是否已存在该供应商（通过author或id匹配）
      const existingVendor = vendors.find(v => 
        v.author === defaultVendor.author || 
        v.id === defaultVendor.id ||
        v.name === defaultVendor.name
      )
      
      if (existingVendor) {
        // 已存在，保留用户的inputValues，更新其他配置
        const updatedVendor = {
          ...defaultVendor,
          id: existingVendor.id,
          inputValues: existingVendor.inputValues, // 保留用户配置的API密钥等
          enable: existingVendor.enable, // 保留启用状态
        }
        await vendorConfigService.saveVendor(updatedVendor)
        updatedCount++
      } else {
        // 不存在，添加新的默认供应商
        await vendorConfigService.saveVendor({ ...defaultVendor, id: generateId() })
        addedCount++
      }
    }
    
    await loadConfigs()
    setSelectedVendorId(null)
    
    const message = []
    if (addedCount > 0) message.push(`新增${addedCount}个供应商`)
    if (updatedCount > 0) message.push(`更新${updatedCount}个供应商`)
    
    toast({ 
      title: '刷新完成', 
      description: message.join('，') || '所有供应商已是最新' 
    })
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="vendors" className="gap-2">
          <Globe className="w-4 h-4" />
          AI供应商
        </TabsTrigger>
        <TabsTrigger value="agents" className="gap-2">
          <Settings className="w-4 h-4" />
          Agent配置
        </TabsTrigger>
      </TabsList>

      {/* 供应商标签页 */}
      <TabsContent value="vendors" className="flex-1 mt-4 flex flex-col">
        {/* 工具栏 */}
        <div className="flex justify-end gap-2 mb-4">
          <Button variant="outline" size="sm" onClick={handleAddVendor}>
            <Plus className="w-4 h-4 mr-1" />
            添加供应商
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRefreshDefaults} title="刷新默认供应商（保留API密钥）">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* 供应商卡片网格 */}
        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {vendors.map(vendor => (
              <Card
                key={vendor.id}
                className={cn(
                  'cursor-pointer transition-all hover:border-primary/50',
                  selectedVendorId === vendor.id && 'border-primary ring-1 ring-primary'
                )}
                onClick={() => {
                  setSelectedVendorId(vendor.id)
                  setIsEditing(false)
                }}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'w-3 h-3 rounded-full',
                          vendor.enable ? 'bg-green-500' : 'bg-gray-300'
                        )}
                      />
                      <div>
                        <CardTitle className="text-base">{vendor.name}</CardTitle>
                        <CardDescription className="text-xs">
                          {vendor.author} · {vendor.models.length}个模型
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant={vendor.enable ? 'default' : 'secondary'} className="text-[10px]">
                      {vendor.enable ? '启用' : '禁用'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-1">
                    {vendor.models.slice(0, 4).map(model => {
                      const Icon = SERVICE_ICONS[model.type as keyof typeof SERVICE_ICONS] || MessageSquare
                      const colorClass = SERVICE_COLORS[model.type as keyof typeof SERVICE_COLORS] || 'text-gray-500'
                      return (
                        <Badge
                          key={model.modelName}
                          variant="outline"
                          className={cn('text-[10px] gap-1', colorClass)}
                        >
                          <Icon className="w-3 h-3" />
                          {model.name}
                        </Badge>
                      )
                    })}
                    {vendor.models.length > 4 && (
                      <Badge variant="outline" className="text-[10px]">
                        +{vendor.models.length - 4}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* 编辑面板 - 选中时显示在下方 */}
        {selectedVendor && (
          <div className="mt-4 border-t pt-4">
            <VendorEditForm
              vendor={selectedVendor}
              isEditing={isEditing}
              showAdvanced={showAdvanced}
              onToggleAdvanced={() => setShowAdvanced(!showAdvanced)}
              onEdit={() => setIsEditing(true)}
              onCancel={() => {
                setIsEditing(false)
                setSelectedVendorId(null)
              }}
              onSave={handleSaveVendor}
              onDelete={() => handleDeleteVendor(selectedVendor.id)}
            />
          </div>
        )}
      </TabsContent>

      {/* Agent配置标签页 */}
      <TabsContent value="agents" className="flex-1 mt-4 flex flex-col">
        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agents.map(agent => (
              <AgentConfigCard
                key={agent.id}
                agent={agent}
                vendors={vendors}
                onChange={(updatedAgent) => handleAgentChange(agent.id, updatedAgent)}
              />
            ))}
          </div>
        </div>
        {/* 全局保存按钮 */}
        {hasAgentChanges && (
          <div className="flex justify-end pt-4 border-t mt-4">
            <Button onClick={handleSaveAllAgents}>
              <Save className="w-4 h-4 mr-2" />
              保存所有配置
            </Button>
          </div>
        )}
      </TabsContent>
    </Tabs>
  )
}

// Agent配置卡片组件
interface AgentConfigCardProps {
  agent: AgentDeploy
  vendors: VendorConfig[]
  onChange: (agent: AgentDeploy) => void
}

function AgentConfigCard({ agent, vendors, onChange }: AgentConfigCardProps) {
  const Icon = SERVICE_ICONS[agent.key === 'ttsDubbing' ? 'tts' : 'text']
  const colorClass = agent.key === 'ttsDubbing' ? 'text-orange-500' : 'text-blue-500'

  // 处理开关变化
  const handleToggle = (checked: boolean) => {
    onChange({ ...agent, disabled: !checked })
  }

  // 处理模型选择变化
  const handleModelChange = (value: string) => {
    if (!value) {
      onChange({
        ...agent,
        vendorId: '',
        modelName: '',
      })
      return
    }
    const [vendorId, ...modelNameParts] = value.split(':')
    const modelName = modelNameParts.join(':') // 处理modelName中可能包含:的情况
    console.log('Model change:', value, '-> vendorId:', vendorId, 'modelName:', modelName)
    onChange({
      ...agent,
      vendorId: vendorId || '',
      modelName: modelName || '',
    })
  }

  return (
    <Card className={cn('transition-all', agent.disabled && 'opacity-60')}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg bg-muted', colorClass)}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base">{agent.name}</CardTitle>
              <CardDescription className="text-xs mt-0.5">{agent.desc}</CardDescription>
            </div>
          </div>
          <Switch
            checked={!agent.disabled}
            onCheckedChange={handleToggle}
          />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">选择模型</Label>
          <select
            className="w-full p-2 rounded-md border bg-background text-sm"
            value={agent.vendorId && agent.modelName ? `${agent.vendorId}:${agent.modelName}` : ''}
            onChange={e => handleModelChange(e.target.value)}
            disabled={agent.disabled}
          >
            <option value="">-- 选择模型 --</option>
            {vendors
              .filter(v => v.enable)
              .flatMap(vendor =>
                vendor.models.map(model => (
                  <option key={`${vendor.id}:${model.modelName}`} value={`${vendor.id}:${model.modelName}`}>
                    [{vendor.name}] {model.name}
                  </option>
                ))
              )}
          </select>
          {agent.modelName && (
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="text-[10px]">
                {agent.vendorId || '未选择供应商'}
              </Badge>
              <span className="text-xs text-muted-foreground truncate">
                {agent.modelName}
              </span>
            </div>
          )}
          {agent.modelName && !agent.vendorId && (
            <div className="text-xs text-amber-500 mt-1">
              警告：供应商ID为空，请重新选择模型
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}


