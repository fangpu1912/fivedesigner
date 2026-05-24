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

interface VendorEditFormProps {
  vendor: VendorConfig
  isEditing: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: (vendor: VendorConfig) => void
  onDelete: () => void
}

function VendorEditForm({
  vendor,
  isEditing,
  onEdit,
  onCancel,
  onSave,
  onDelete,
}: VendorEditFormProps) {
  const [formData, setFormData] = useState<VendorConfig>(vendor)

  useEffect(() => {
    setFormData(vendor)
  }, [vendor])

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
          {vendor.description && (
            <div className="p-3 rounded border bg-muted/50 text-sm whitespace-pre-line">
              {vendor.description}
            </div>
          )}

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
        </CardContent>
      </Card>
    )
  }

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
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>供应商名称</Label>
            <Input
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="例如：官方中转平台"
            />
          </div>

          <div className="space-y-2">
            <Label>描述</Label>
            <Textarea
              value={formData.description || ''}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder="输入供应商描述..."
              rows={3}
            />
          </div>

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
  const [activeTab, setActiveTab] = useState('vendors')

  const hasAgentChanges = JSON.stringify(agents) !== JSON.stringify(originalAgents)

  useEffect(() => {
    loadConfigs()
  }, [])

  const loadConfigs = async () => {
    const [vendorList, agentList] = await Promise.all([
      vendorConfigService.getAllVendors(),
      vendorConfigService.getAllAgents(),
    ])
    setVendors(vendorList)
    setAgents(agentList)
    setOriginalAgents(agentList)
  }

  const selectedVendor = vendors.find(v => v.id === selectedVendorId)

  const handleSaveVendor = async (vendor: VendorConfig) => {
    await vendorConfigService.saveVendor(vendor)
    setVendors(prev => prev.map(v => v.id === vendor.id ? vendor : v))
    setIsEditing(false)
    toast({ title: '配置已保存' })
  }

  const handleDeleteVendor = async (id: string) => {
    await vendorConfigService.deleteVendor(id)
    setVendors(prev => prev.filter(v => v.id !== id))
    setSelectedVendorId(null)
    toast({ title: '配置已删除' })
  }

  const handleAddVendor = async () => {
    const newVendor: VendorConfig = {
      id: generateId(),
      name: '新供应商',
      description: '',
      inputs: [{ key: 'apiKey', label: 'API密钥', type: 'password', required: true }],
      inputValues: { apiKey: '' },
      models: [],
      code: '',
      enable: false,
      createTime: Date.now(),
    }
    await vendorConfigService.saveVendor(newVendor)
    setVendors(prev => [...prev, newVendor])
    setSelectedVendorId(newVendor.id)
    setIsEditing(true)
    toast({ title: '新供应商已创建' })
  }

  const handleAgentChange = (agentId: string, updatedAgent: AgentDeploy) => {
    setAgents(prev => prev.map(a => a.id === agentId ? updatedAgent : a))
  }

  const handleSaveAllAgents = async () => {
    for (const agent of agents) {
      await vendorConfigService.saveAgent(agent)
    }
    setOriginalAgents(agents)
    toast({ title: '所有配置已保存' })
  }

  const handleRefreshDefaults = async () => {
    let addedCount = 0
    let updatedCount = 0

    for (const defaultVendor of defaultVendors) {
      const existingVendor = vendors.find(v =>
        v.id === defaultVendor.id ||
        v.name === defaultVendor.name
      )

      if (existingVendor) {
        const updatedVendor = {
          ...defaultVendor,
          id: existingVendor.id,
          inputValues: existingVendor.inputValues,
          enable: existingVendor.enable,
        }
        await vendorConfigService.saveVendor(updatedVendor)
        updatedCount++
      } else {
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

      <TabsContent value="vendors" className="flex-1 mt-4 flex flex-col">
        <div className="flex justify-end gap-2 mb-4">
          <Button variant="outline" size="sm" onClick={handleAddVendor}>
            <Plus className="w-4 h-4 mr-1" />
            添加供应商
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRefreshDefaults} title="刷新默认供应商（保留API密钥）">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

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
                          {vendor.models.length}个模型
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant={vendor.enable ? 'default' : 'secondary'} className="text-[10px]">
                      {vendor.enable ? '启用' : '禁用'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {vendor.description && (
                    <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                      {vendor.description.split('\n')[0]}
                    </p>
                  )}
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

        {selectedVendor && (
          <div className="mt-4 border-t pt-4">
            <VendorEditForm
              vendor={selectedVendor}
              isEditing={isEditing}
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

interface AgentConfigCardProps {
  agent: AgentDeploy
  vendors: VendorConfig[]
  onChange: (agent: AgentDeploy) => void
}

function AgentConfigCard({ agent, vendors, onChange }: AgentConfigCardProps) {
  const Icon = SERVICE_ICONS[agent.key === 'ttsDubbing' ? 'tts' : 'text']
  const colorClass = agent.key === 'ttsDubbing' ? 'text-orange-500' : 'text-blue-500'

  const handleToggle = (checked: boolean) => {
    onChange({ ...agent, disabled: !checked })
  }

  const handleModelChange = (value: string) => {
    if (!value) {
      onChange({ ...agent, vendorId: '', modelName: '' })
      return
    }
    const [vendorId, ...modelNameParts] = value.split(':')
    const modelName = modelNameParts.join(':')
    onChange({ ...agent, vendorId: vendorId || '', modelName: modelName || '' })
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
          <Switch checked={!agent.disabled} onCheckedChange={handleToggle} />
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
