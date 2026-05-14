/**
 * AI 服务配置面板
 * 参考 onedesigner 的 APIConfig 设计风格重构
 * 采用双栏布局：左侧配置列表，右侧编辑表单
 */

import { useState, useEffect, useCallback } from 'react'

import { confirm } from '@tauri-apps/plugin-dialog'
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
  Copy,
  CheckCircle,
  AlertCircle,
  Key,
  RefreshCw,
  Star,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/useToast'
import { cn, generateId } from '@/lib/utils'
import { saveAIConfig, deleteAIConfig, getAIConfigs } from '@/services/configService'
import { apiKeyStorage } from '@/services/secureStorage'

// 提供商名称映射
const PROVIDER_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  moonshot: 'Moonshot',
  zhipu: '智谱 AI',
  stability: 'Stability AI',
  midjourney: 'Midjourney',
  'google-gemma': 'Google Gemma',
  'google-gemini': 'Google Gemini',
  baidu: '百度文心',
  alibaba: '阿里通义',
  runway: 'Runway',
  kling: '可灵 AI',
  seedance: 'Seedance',
  google: 'Google (Veo)',
  vidu: 'Vidu',
  luma: 'Luma Dream Machine',
  pika: 'Pika',
  haiper: 'Haiper',
  minimax: 'MiniMax',
  elevenlabs: 'ElevenLabs',
  volcengine: '火山引擎',
  azure: 'Azure TTS',
  comfyui: 'ComfyUI',
  custom: '自定义/聚合API',
}

// 服务类型定义
const SERVICE_TYPES = [
  { value: 'chat', label: '对话', icon: MessageSquare, color: 'text-blue-500' },
  { value: 'image', label: '图片', icon: Image, color: 'text-green-500' },
  { value: 'video', label: '视频', icon: Video, color: 'text-purple-500' },
  { value: 'tts', label: 'TTS', icon: Mic, color: 'text-orange-500' },
] as const

type ServiceType = (typeof SERVICE_TYPES)[number]['value']

// 默认端点映射
const DEFAULT_ENDPOINTS: Record<ServiceType, string> = {
  chat: '/v1/chat/completions',
  image: '/v1/images/generations',
  video: '/v2/videos/generations',
  tts: '/v1/audio/speech',
}

// 预设供应商配置（2026年4月最新模型）
const PRESET_PROVIDERS: Record<
  string,
  { baseUrl: string; endpoint: string; models: { id: string; name: string }[] }
> = {
  // 对话模型
  openai: {
    baseUrl: 'https://api.openai.com',
    endpoint: '/v1/chat/completions',
    models: [
      { id: 'gpt-5.4', name: 'GPT-5.4' },
      { id: 'gpt-4.5', name: 'GPT-4.5' },
    ],
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    endpoint: '/v1/chat/completions',
    models: [
      { id: 'deepseek-v4', name: 'DeepSeek-V4' },
      { id: 'deepseek-chat', name: 'DeepSeek Chat' },
    ],
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com',
    endpoint: '/v1/messages',
    models: [
      { id: 'claude-3.5-ultra', name: 'Claude 3.5 Ultra' },
      { id: 'claude-opus-4', name: 'Claude Opus 4' },
    ],
  },
  'google-gemma': {
    baseUrl: 'https://api.google.com',
    endpoint: '/v1/chat/completions',
    models: [{ id: 'gemma-4-31b', name: 'Gemma 4 31B' }],
  },
  // 图片模型
  'google-gemini': {
    baseUrl: 'https://api.google.com',
    endpoint: '/v1/images/generations',
    models: [{ id: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro' }],
  },
  seedream: {
    baseUrl: 'https://api.seedream.ai',
    endpoint: '/v1/images/generations',
    models: [{ id: 'seedream-5.0', name: 'Seedream 5.0 (即梦5.0)' }],
  },
  'kling-image': {
    baseUrl: 'https://api.klingai.com',
    endpoint: '/v1/images/generations',
    models: [
      { id: 'kling-image-3.0-omni', name: '可灵图片3.0 Omni' },
      { id: 'kling-image-3.0', name: '可灵图片3.0' },
    ],
  },
  midjourney: {
    baseUrl: 'https://api.midjourney.com',
    endpoint: '/v1/images/generations',
    models: [{ id: 'midjourney-v7-beta', name: 'Midjourney V7 (Beta)' }],
  },
  // 视频模型
  'kling-video': {
    baseUrl: 'https://api.klingai.com',
    endpoint: '/v1/videos/text2video',
    models: [
      { id: 'kling-v3-omni', name: '可灵AI 3.0 Omni' },
      { id: 'kling-v3', name: '可灵AI 3.0' },
    ],
  },
  hailuo: {
    baseUrl: 'https://api.hailuo.ai',
    endpoint: '/v1/videos/generations',
    models: [{ id: 'hailuo-2.3-fast', name: '海螺2.3 Fast' }],
  },
  runway: {
    baseUrl: 'https://api.runwayml.com',
    endpoint: '/v1/videos/generations',
    models: [{ id: 'gen-3.5-turbo', name: 'Runway Gen-3.5 Turbo' }],
  },
  vidu: {
    baseUrl: 'https://api.vidu.ai',
    endpoint: '/v1/videos/generations',
    models: [{ id: 'vidu-2.0', name: 'Vidu 2.0' }],
  },
  'seedance-video': {
    baseUrl: 'https://api.seedance.ai',
    endpoint: '/v1/videos/generations',
    models: [{ id: 'seedance-2.0', name: 'Seedance 2.0' }],
  },
  // TTS 模型
  'minimax-audio': {
    baseUrl: 'https://api.minimax.chat',
    endpoint: '/v1/t2a_v2',
    models: [{ id: 'minimax-speech-2.5', name: 'MiniMax Speech 2.5' }],
  },
  elevenlabs: {
    baseUrl: 'https://api.elevenlabs.io',
    endpoint: '/v1/text-to-speech',
    models: [{ id: 'elevenlabs-3.0', name: 'ElevenLabs 3.0' }],
  },
  'bytedance-tts': {
    baseUrl: 'https://openspeech.bytedance.com',
    endpoint: '/api/v1/tts',
    models: [{ id: 'bytedance-tts-4.0', name: '字节跳动 4.0' }],
  },
}

// 供应商对应的服务类型
const PROVIDER_TYPES: Record<string, ServiceType> = {
  openai: 'chat',
  deepseek: 'chat',
  anthropic: 'chat',
  'google-gemma': 'chat',
  'google-gemini': 'image',
  seedream: 'image',
  'kling-image': 'image',
  midjourney: 'image',
  'kling-video': 'video',
  hailuo: 'video',
  runway: 'video',
  vidu: 'video',
  'seedance-video': 'video',
  'minimax-audio': 'tts',
  elevenlabs: 'tts',
  'bytedance-tts': 'tts',
  custom: 'chat',
}

// 默认模型映射
const DEFAULT_MODELS: Record<ServiceType, string> = {
  chat: 'gpt-5.0-high',
  image: 'gpt-image-1.5',
  video: 'veo-3',
  tts: 'speech-02-hd',
}

type AIProviderType = string

interface AIConfigItem {
  id: string
  name: string
  type: ServiceType
  provider: AIProviderType
  model: string
  baseUrl: string
  apiKey?: string
  endpoint?: string
  description?: string
  enabled: boolean
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export function AIConfigPanel() {
  const { toast } = useToast()

  // 本地配置列表
  const [configs, setConfigs] = useState<AIConfigItem[]>([])
  const [loading, setLoading] = useState(false)

  // 编辑状态
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  // 表单状态
  const [configName, setConfigName] = useState('')
  const [configType, setConfigType] = useState<ServiceType>('chat')
  const [provider, setProvider] = useState<AIProviderType>('openai')
  const [selectedModels, setSelectedModels] = useState<string[]>([]) // 多选模型
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [description, setDescription] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [isDefault, setIsDefault] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)

  // 自定义/聚合API模式
  const [useCustomProvider, setUseCustomProvider] = useState(false)
  const [customBaseUrl, setCustomBaseUrl] = useState('')
  const [customEndpoint, setCustomEndpoint] = useState('')
  const [_customModel, setCustomModel] = useState('')

  // 测试状态
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'failed' | null>(null)

  // 筛选状态
  const [filterType, setFilterType] = useState<ServiceType | 'all'>('all')
  useEffect(() => {
    loadConfigs()
  }, [])

  const loadConfigs = async () => {
    try {
      const allConfigs = await getAIConfigs()
      const items: AIConfigItem[] = allConfigs.map(cfg => {
        // 从 localStorage 读取扩展配置
        const extended = JSON.parse(localStorage.getItem(`ai_config_${cfg.id}`) || '{}')
        return {
          id: cfg.id,
          name: cfg.name,
          type: (cfg.type as ServiceType) || 'chat',
          provider: (cfg.provider as AIProviderType) || 'openai',
          model: cfg.modelName || '',
          baseUrl: cfg.baseUrl || '',
          endpoint: extended.endpoint || cfg.endpoint || '',
          description: extended.description || '',
          enabled: cfg.enabled !== false,
          isDefault: extended.isDefault || cfg.isDefault || false,
          createdAt: extended.createdAt || new Date().toISOString(),
          updatedAt: extended.updatedAt || new Date().toISOString(),
        }
      })
      setConfigs(items)
    } catch (error) {
      console.error('加载配置失败:', error)
      toast({ title: '加载配置失败', variant: 'destructive' })
    }
  }

  // 重置表单
  const resetForm = () => {
    setConfigName('')
    setConfigType('chat')
    setProvider('openai')
    setBaseUrl('')
    setApiKey('')
    setEndpoint(DEFAULT_ENDPOINTS['chat'])
    setDescription('')
    setEnabled(true)
    setIsDefault(false)
    setTestResult(null)
    setShowApiKey(false)
    setUseCustomProvider(false)
    setCustomBaseUrl('')
    setCustomEndpoint('')
    setCustomModel('')
    setSelectedModels([])
  }

  // 开始创建新配置
  const handleCreate = () => {
    resetForm()
    setIsCreating(true)
    setEditingId(null)
  }

  // 取消编辑
  const handleCancel = () => {
    setIsCreating(false)
    setEditingId(null)
    resetForm()
  }

  // 测试连接
  const handleTest = async () => {
    const testBaseUrl = useCustomProvider ? customBaseUrl : baseUrl
    const testEndpoint = useCustomProvider ? customEndpoint : endpoint

    if (!testBaseUrl.trim()) {
      toast({ title: '请输入 API 地址', variant: 'destructive' })
      return
    }

    setTesting(true)
    setTestResult(null)

    try {
      const response = await fetch(
        testBaseUrl.replace(/\/$/, '') + (testEndpoint || DEFAULT_ENDPOINTS[configType]),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: selectedModels[0] || DEFAULT_MODELS[configType],
            messages: [{ role: 'user', content: 'Hello' }],
            max_tokens: 10,
          }),
        }
      )

      const isValid = response.status === 200 || response.status === 401
      setTestResult(isValid ? 'success' : 'failed')
      toast({
        title: isValid ? '连接成功' : '连接失败',
        description: isValid ? 'AI 服务连接正常' : '无法连接到 AI 服务，请检查配置',
        variant: isValid ? 'default' : 'destructive',
      })
    } catch (error) {
      setTestResult('failed')
      toast({
        title: '连接失败',
        description: (error as Error).message,
        variant: 'destructive',
      })
    } finally {
      setTesting(false)
    }
  }

  // 保存配置
  const handleSave = useCallback(async () => {
    if (!configName.trim()) {
      toast({ title: '请输入配置名称', variant: 'destructive' })
      return
    }
    if (!baseUrl.trim()) {
      toast({ title: '请输入 API 地址', variant: 'destructive' })
      return
    }
    if (selectedModels.length === 0) {
      toast({ title: '请选择至少一个模型', variant: 'destructive' })
      return
    }

    setLoading(true)

    try {
      const configId = editingId || `custom_${generateId()}`
      const modelsString = selectedModels.join(',')

      // API Key 存储到安全存储（不存储到 zustand store）
      if (apiKey.trim()) {
        await apiKeyStorage.setApiKey(configId, apiKey.trim())
      }

      // 保存到 configService（不含 API Key）
      const fullConfig = {
        id: configId,
        name: configName.trim(),
        type: configType as 'image' | 'video' | 'tts' | 'chat',
        provider: configId,
        modelName: modelsString,
        baseUrl: baseUrl.trim(),
        endpoint: endpoint.trim(),
        enabled: enabled,
        isDefault: isDefault,
        description: description.trim(),
        createdAt: editingId
          ? configs.find(c => c.id === editingId)?.createdAt || new Date().toISOString()
          : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      await saveAIConfig(fullConfig)

      // 保存扩展配置（不含 API Key）
      const extendedConfig = {
        name: configName.trim(),
        type: configType,
        endpoint: endpoint.trim(),
        description: description.trim(),
        enabled,
        isDefault,
        createdAt: editingId
          ? configs.find(c => c.id === editingId)?.createdAt || new Date().toISOString()
          : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      localStorage.setItem(`ai_config_${configId}`, JSON.stringify(extendedConfig))

      // 如果设为默认，取消其他同类型的默认配置
      if (isDefault) {
        configs.forEach(c => {
          if (c.id !== configId && c.isDefault && c.type === configType) {
            const otherExtended = JSON.parse(localStorage.getItem(`ai_config_${c.id}`) || '{}')
            otherExtended.isDefault = false
            otherExtended.updatedAt = new Date().toISOString()
            localStorage.setItem(`ai_config_${c.id}`, JSON.stringify(otherExtended))
          }
        })
      }

      toast({ title: editingId ? '配置已更新' : '配置已保存' })

      // 刷新列表
      const newConfig: AIConfigItem = {
        id: configId,
        name: configName.trim(),
        type: configType,
        provider: configId as AIProviderType,
        model: selectedModels.join(','),
        baseUrl: baseUrl.trim(),
        endpoint: endpoint.trim(),
        description: description.trim(),
        enabled,
        isDefault,
        createdAt: editingId
          ? configs.find(c => c.id === editingId)?.createdAt || new Date().toISOString()
          : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      if (editingId) {
        setConfigs(prev => prev.map(c => (c.id === editingId ? newConfig : c)))
      } else {
        setConfigs(prev => [...prev, newConfig])
      }

      setIsCreating(false)
      setEditingId(null)
      resetForm()
    } catch (error) {
      console.error('保存配置失败:', error)
      toast({ title: '保存失败', description: (error as Error).message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [
    configName,
    configType,
    provider,
    selectedModels,
    baseUrl,
    apiKey,
    endpoint,
    description,
    enabled,
    isDefault,
    editingId,
    configs,
    toast,
  ])

  // 删除配置
  const handleDelete = async (id: string) => {
    const confirmed = await confirm('确定要删除这个配置吗？', {
      title: '删除确认',
      kind: 'warning',
      okLabel: '确定',
      cancelLabel: '取消',
    })

    if (!confirmed) return

    try {
      // 删除安全存储中的 API Key
      await apiKeyStorage.deleteApiKey(id)

      // 删除扩展配置
      localStorage.removeItem(`ai_config_${id}`)

      // 删除 configService 中的配置
      deleteAIConfig(id)

      setConfigs(prev => prev.filter(c => c.id !== id))

      if (editingId === id) {
        handleCancel()
      }

      toast({ title: '配置已删除' })
    } catch (error) {
      toast({ title: '删除失败', description: (error as Error).message, variant: 'destructive' })
    }
  }

  // 切换启用状态
  const handleToggleEnabled = useCallback(
    async (config: AIConfigItem) => {
      try {
        const newEnabled = !config.enabled

        // 更新本地状态
        setConfigs(prev => prev.map(c => (c.id === config.id ? { ...c, enabled: newEnabled } : c)))

        // 保存扩展配置到 localStorage
        const extended = JSON.parse(localStorage.getItem(`ai_config_${config.id}`) || '{}')
        extended.enabled = newEnabled
        extended.updatedAt = new Date().toISOString()
        localStorage.setItem(`ai_config_${config.id}`, JSON.stringify(extended))

        // 同步更新到 configService
        const allConfigs = await getAIConfigs()
        const existing = allConfigs.find(c => c.id === config.id)
        if (existing) {
          await saveAIConfig({ ...existing, enabled: newEnabled })
        }

        toast({ title: newEnabled ? '配置已启用' : '配置已禁用' })
      } catch (error) {
        toast({ title: '操作失败', description: (error as Error).message, variant: 'destructive' })
      }
    },
    [toast]
  )

  // 设置默认配置
  const handleSetDefault = useCallback(
    async (config: AIConfigItem) => {
      try {
        // 更新所有配置
        setConfigs(prev => {
          const updated = prev.map(c => {
            // 同类型的配置：当前选中的设为默认，其他取消默认
            // 不同类型的配置：保持原有状态不变
            if (c.type === config.type) {
              return { ...c, isDefault: c.id === config.id }
            }
            return c
          })
          return updated
        })

        // 保存到 localStorage
        configs.forEach(c => {
          if (c.type === config.type) {
            const extended = JSON.parse(localStorage.getItem(`ai_config_${c.id}`) || '{}')
            extended.isDefault = c.id === config.id
            extended.updatedAt = new Date().toISOString()
            localStorage.setItem(`ai_config_${c.id}`, JSON.stringify(extended))
          }
        })

        // 同步更新到 configService
        const allConfigs = await getAIConfigs()
        for (const c of allConfigs) {
          if (c.type === config.type) {
            await saveAIConfig({ ...c, isDefault: c.id === config.id })
          }
        }

        toast({
          title: '默认配置已设置',
          description: `${config.name} 已设为${SERVICE_TYPES.find(t => t.value === config.type)?.label}默认`,
        })
      } catch (error) {
        toast({ title: '设置失败', description: (error as Error).message, variant: 'destructive' })
      }
    },
    [configs, toast]
  )

  // 复制配置
  const handleDuplicate = useCallback(
    async (config: AIConfigItem) => {
      try {
        const newId = `custom_${generateId()}`
        const newConfig: AIConfigItem = {
          ...config,
          id: newId,
          name: `${config.name} (复制)`,
          isDefault: false, // 复制的配置不设为默认
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }

        // 复制 API Key
        const existingKey = await apiKeyStorage.getApiKey(config.id)
        if (existingKey) {
          await apiKeyStorage.setApiKey(newId, existingKey)
        }

        // 保存到 configService
        await saveAIConfig({
          id: newId,
          name: newConfig.name,
          type: config.type as 'image' | 'video' | 'tts' | 'chat',
          provider: newId,
          modelName: config.model,
          baseUrl: config.baseUrl,
          endpoint: config.endpoint,
          enabled: config.enabled,
          isDefault: false,
          description: config.description,
          createdAt: newConfig.createdAt,
          updatedAt: newConfig.updatedAt,
        })

        // 保存扩展配置
        localStorage.setItem(
          `ai_config_${newId}`,
          JSON.stringify({
            name: newConfig.name,
            type: config.type,
            endpoint: config.endpoint,
            description: config.description,
            enabled: config.enabled,
            isDefault: false,
            createdAt: newConfig.createdAt,
            updatedAt: newConfig.updatedAt,
          })
        )

        setConfigs(prev => [...prev, newConfig])
        toast({ title: '配置已复制' })
      } catch (error) {
        toast({ title: '复制失败', description: (error as Error).message, variant: 'destructive' })
      }
    },
    [toast]
  )

  // 筛选配置
  const filteredConfigs = configs.filter(config => {
    if (filterType === 'all') return true
    return config.type === filterType
  })

  return (
    <div className="flex h-full gap-6">
      {/* 左侧：配置列表 */}
      <Card className="flex-1 flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle>已配置的服务</CardTitle>
            <CardDescription>管理您的 AI 服务配置</CardDescription>
          </div>
          <Button onClick={handleCreate} size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            添加
          </Button>
        </CardHeader>

        {/* 类型筛选标签 */}
        <div className="px-6 pb-4 flex gap-2 flex-wrap">
          <Badge
            variant={filterType === 'all' ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setFilterType('all')}
          >
            <Globe className="w-3 h-3 mr-1" />
            <span>全部</span>
          </Badge>
          {SERVICE_TYPES.map(type => {
            const Icon = type.icon
            return (
              <Badge
                key={type.value}
                variant={filterType === type.value ? 'default' : 'outline'}
                className={cn('cursor-pointer', filterType === type.value && type.color)}
                onClick={() => setFilterType(type.value)}
              >
                <Icon className="w-3 h-3 mr-1" />
                <span>{type.label}</span>
              </Badge>
            )
          })}
        </div>

        <CardContent className="flex-1 overflow-auto">
          {filteredConfigs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Settings className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{configs.length === 0 ? '暂无配置' : '没有匹配的配置'}</p>
              <p className="text-sm mt-2">
                {configs.length === 0 ? '点击右上角添加您的第一个 AI 配置' : '请调整筛选条件'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredConfigs.map(config => {
                const serviceType = SERVICE_TYPES.find(t => t.value === config.type)
                const TypeIcon = serviceType?.icon || Globe

                return (
                  <div
                    key={config.id}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                      editingId === config.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                    )}
                    onClick={() => {
                      setEditingId(config.id)
                      setIsCreating(false)
                      // 加载配置到表单
                      setConfigName(config.name)
                      setConfigType(config.type)
                      setProvider(config.provider)
                      setSelectedModels(config.model ? [config.model] : [])
                      setBaseUrl(config.baseUrl)
                      setEndpoint(config.endpoint || '')
                      setDescription(config.description || '')
                      setEnabled(config.enabled)
                      setIsDefault(config.isDefault)
                      // 加载适配器类型
                      const isCustom =
                        config.provider?.startsWith('custom_') || config.id?.startsWith('custom_')
                      setUseCustomProvider(isCustom)
                      // 从安全存储加载 API Key
                      apiKeyStorage.getApiKey(config.id).then(key => {
                        setApiKey(key || '')
                      })
                    }}
                  >
                    <div
                      className={cn(
                        'p-2 rounded-md',
                        serviceType?.color.replace('text-', 'bg-').replace('500', '100')
                      )}
                    >
                      <TypeIcon className={cn('w-4 h-4', serviceType?.color)} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{config.name}</span>
                        {config.isDefault && (
                          <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                        )}
                        {!config.enabled && (
                          <Badge variant="secondary" className="text-xs">
                            已禁用
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {config.model} @ {config.baseUrl}
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* 启用/禁用切换 */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={e => {
                          e.stopPropagation()
                          handleToggleEnabled(config)
                        }}
                        title={config.enabled ? '点击禁用' : '点击启用'}
                      >
                        {config.enabled ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-muted-foreground" />
                        )}
                      </Button>

                      {/* 设为默认 */}
                      {!config.isDefault && config.enabled && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={e => {
                            e.stopPropagation()
                            handleSetDefault(config)
                          }}
                          title="设为默认"
                        >
                          <Star className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      )}

                      {/* 复制 */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={e => {
                          e.stopPropagation()
                          handleDuplicate(config)
                        }}
                        title="复制配置"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>

                      {/* 删除 */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={e => {
                          e.stopPropagation()
                          handleDelete(config.id)
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 右侧：编辑表单 */}
      <Card className="w-[480px] flex flex-col">
        <CardHeader>
          <CardTitle>
            {isCreating ? '添加 AI 服务配置' : editingId ? '编辑配置' : '配置详情'}
          </CardTitle>
          <CardDescription>
            {isCreating || editingId
              ? '配置 AI 服务连接参数'
              : '选择一个配置进行编辑，或创建新配置'}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex-1 overflow-auto">
          {isCreating || editingId ? (
            <div className="space-y-4">
              {/* 服务类型 */}
              <div className="space-y-2">
                <Label>服务类型</Label>
                <div className="grid grid-cols-2 gap-2">
                  {SERVICE_TYPES.map(type => {
                    const Icon = type.icon
                    return (
                      <Button
                        key={type.value}
                        type="button"
                        variant={configType === type.value ? 'default' : 'outline'}
                        className="justify-start gap-2"
                        onClick={() => {
                          setConfigType(type.value)
                          setProvider('openai') // 重置为默认
                          setUseCustomProvider(false)
                          setSelectedModels([])
                          setBaseUrl('')
                          setEndpoint(DEFAULT_ENDPOINTS[type.value])
                        }}
                      >
                        <Icon className={cn('w-4 h-4', type.color)} />
                        {type.label}
                      </Button>
                    )
                  })}
                </div>
              </div>

              {/* 配置名称 */}
              <div className="space-y-2">
                <Label>配置名称</Label>
                <Input
                  value={configName}
                  onChange={e => setConfigName(e.target.value)}
                  placeholder="如：OpenAI GPT-4"
                />
              </div>

              {/* 供应商 */}
              <div className="space-y-2">
                <Label>供应商</Label>
                <select
                  value={useCustomProvider ? 'custom' : provider}
                  onChange={e => {
                    const newProvider = e.target.value
                    if (newProvider === 'custom') {
                      setUseCustomProvider(true)
                      setProvider('custom' as AIProviderType)
                      setSelectedModels([])
                    } else {
                      setUseCustomProvider(false)
                      setProvider(newProvider as AIProviderType)
                      const preset = PRESET_PROVIDERS[newProvider]
                      if (preset) {
                        setBaseUrl(preset.baseUrl)
                        setEndpoint(preset.endpoint)
                        if (preset.models.length > 0) {
                          setSelectedModels([preset.models[0]!.id])
                        }
                      }
                    }
                  }}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                >
                  {Object.entries(PRESET_PROVIDERS)
                    .filter(([key]) => PROVIDER_TYPES[key] === configType)
                    .map(([key]) => (
                      <option key={key} value={key}>
                        {PROVIDER_NAMES[key] || key}
                      </option>
                    ))}
                  <option value="custom">+ 自定义</option>
                </select>
              </div>

              {/* API 地址 */}
              <div className="space-y-2">
                <Label>API 地址</Label>
                <Input
                  value={useCustomProvider ? customBaseUrl : baseUrl}
                  onChange={e =>
                    useCustomProvider
                      ? setCustomBaseUrl(e.target.value)
                      : setBaseUrl(e.target.value)
                  }
                  placeholder={
                    useCustomProvider ? 'https://api.example.com' : 'https://api.openai.com'
                  }
                />
              </div>

              {/* Endpoint */}
              <div className="space-y-2">
                <Label>Endpoint</Label>
                <Input
                  value={useCustomProvider ? customEndpoint : endpoint}
                  onChange={e =>
                    useCustomProvider
                      ? setCustomEndpoint(e.target.value)
                      : setEndpoint(e.target.value)
                  }
                  placeholder={DEFAULT_ENDPOINTS[configType]}
                />
              </div>

              {/* API Key */}
              <div className="space-y-2">
                <Label>API Key</Label>
                <div className="relative">
                  <Input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="sk-..."
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    <Key className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              {/* 模型名称 */}
              <div className="space-y-2">
                <Label>模型</Label>
                <Input
                  value={selectedModels.join(', ')}
                  onChange={e => {
                    const models = e.target.value
                      .split(',')
                      .map(m => m.trim())
                      .filter(Boolean)
                    setSelectedModels(models)
                  }}
                  placeholder="输入模型名称，多个用逗号分隔，如：gpt-4o, claude-3.5-sonnet"
                />
                <p className="text-xs text-muted-foreground">多个模型用逗号分隔</p>
              </div>

              {/* 描述 */}
              <div className="space-y-2">
                <Label>描述</Label>
                <Input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="可选"
                />
              </div>

              {/* 选项 */}
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={e => setEnabled(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm">启用</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={e => setIsDefault(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm">设为默认</span>
                </label>
              </div>

              {/* 测试连接 */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleTest}
                  disabled={testing || !(useCustomProvider ? customBaseUrl.trim() : baseUrl.trim())}
                  className="flex-1 gap-2"
                >
                  {testing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : testResult === 'success' ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : testResult === 'failed' ? (
                    <AlertCircle className="w-4 h-4 text-red-500" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  {testing ? '测试中...' : '测试连接'}
                </Button>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={handleCancel} className="flex-1">
                  取消
                </Button>
                <Button onClick={handleSave} disabled={loading} className="flex-1 gap-2">
                  <Save className="w-4 h-4" />
                  {loading ? '保存中...' : editingId ? '更新配置' : '保存配置'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Settings className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">选择一个配置进行编辑</p>
              <p className="text-sm mt-2">或点击左上角添加新配置</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
