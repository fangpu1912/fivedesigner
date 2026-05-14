import { useState, useEffect, useCallback, useRef } from 'react'

import { open, save, confirm } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'
import {
  Save,
  Key,
  Server,
  Plus,
  Trash2,
  Palette,
  Moon,
  Sun,
  Trash,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  Globe,
  FolderOpen,
  Film,
  AlertCircle,
  Mic,
  Check,
  Monitor,
  Sparkles,
  GlassWater,
  Minimize2,
  Upload,
  Play,
  X,
  Edit2,
  FileJson,
  Settings2,
} from 'lucide-react'

import { VendorConfigPanel } from '@/components/settings/VendorConfigPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { VoiceList } from '@/components/voice/VoiceList'
import { WorkspaceInfo } from '@/components/workspace'
import { usePersistentUIState } from '@/hooks/usePersistentUIState'
import { useToast } from '@/hooks/useToast'
import { cn, generateId } from '@/lib/utils'
import { ComfyUIClient } from '@/services/comfyui/ComfyUIClient'
import {
  getConfig,
  saveComfyUIServerUrl,
  saveTheme,
  getAIConfigs,
  getAIConfigsWithSecrets,
  saveAIConfig,
} from '@/services/configService'
import {
  getWorkflowConfigs,
  saveWorkflowConfig,
  deleteWorkflowConfig,
  parseComfyUIWorkflow,
} from '@/services/workflowConfigService'
import { themes, useThemeStore } from '@/store/useThemeStore'
import { useUIStore } from '@/store/useUIStore'
import type { AIModelConfig, WorkflowConfig } from '@/types'

interface CustomProvider {
  id: string
  name: string
  type: 'chat' | 'image' | 'video' | 'audio'
  baseUrl: string
  apiKey?: string
  models: { id: string; name: string }[]
}

interface EditWorkflowFormState {
  name: string
  type: WorkflowConfig['type']
  workflowJson: string
  nodes: Record<string, string | string[]>
  description: string
  tags: string[]
}

/*

// 默认提供商信息（简化版）
const DEFAULT_PROVIDERS: Record<string, { name: string; type: 'chat' | 'image' | 'video' | 'audio' }> = {
  openai: { name: 'OpenAI', type: 'chat' },
  stability: { name: 'Stability AI', type: 'image' },
  midjourney: { name: 'Midjourney', type: 'image' },
  runway: { name: 'Runway', type: 'video' },
  kling: { name: '可灵 AI', type: 'video' },
  google: { name: 'Google', type: 'video' },
  vidu: { name: 'Vidu', type: 'video' },
  luma: { name: 'Luma', type: 'video' },
  pika: { name: 'Pika', type: 'video' },
  haiper: { name: 'Haiper', type: 'video' },
  minimax: { name: 'MiniMax', type: 'audio' },
*/
export function Settings() {
  const { toast } = useToast()
  const { theme, setTheme } = useUIStore()

  // 从 configService 获取遗留 AI 配置，仅用于兼容旧设置文件
  const aiConfigs = getAIConfigs()

  // 主题设置
  const {
    currentTheme,
    radius,
    fontSize,
    compactMode,
    animationsEnabled,
    glassEffects,
    setTheme: setAppTheme,
    setRadius,
    setFontSize,
    setCompactMode,
    setAnimationsEnabled,
    setGlassEffects,
  } = useThemeStore()

  const [config, setConfig] = useState(getConfig)
  const [activeTab, setActiveTab] = usePersistentUIState<string>('settings.activeTab', 'ai')
  const [hasChanges, setHasChanges] = useState(false)

  // 主题分类
  const categoryIcons = {
    light: Sun,
    dark: Moon,
    special: Sparkles,
  }

  const categoryNames = {
    light: '浅色主题',
    dark: '深色主题',
    special: '特色主题',
  }

  const radiusLabels = {
    none: '无',
    sm: '小',
    md: '中',
    lg: '大',
    xl: '特大',
    full: '圆形',
  }

  const fontSizeLabels = {
    sm: '小',
    base: '标准',
    lg: '大',
  }

  const [customProviders, setCustomProviders] = useState<CustomProvider[]>(() => {
    const stored = localStorage.getItem('custom_providers')
    return stored ? JSON.parse(stored) : []
  })

  const [shortcuts, setShortcuts] = useState<Record<string, string>>(() => {
    const stored = localStorage.getItem('shortcuts_config')
    return stored ? JSON.parse(stored) : {}
  })

  /*
  const [aiForm, setAIForm] = useState<{
    provider: string;
    customProvider: string;
    isCustomProvider: boolean;
    apiKey: string;
    baseUrl: string;
    endpoint: string;
    model: string;
    customModel: string;
    isCustomModel: boolean;
    testing: boolean;
    testResult: 'success' | 'failed' | null;
    serviceType: 'chat' | 'image' | 'video' | 'audio';
  }>({
    provider: '',
    customProvider: '',
    isCustomProvider: false,
    apiKey: '',
    baseUrl: '',
    endpoint: '/v1/chat/completions',
    model: '',
    customModel: '',
    isCustomModel: false,
    testing: false,
    testResult: null,
    serviceType: 'chat',
  });

  // 根据服务类型获取默认 endpoint
  const getDefaultEndpoint = (serviceType: 'chat' | 'image' | 'video' | 'audio') => {
    switch (serviceType) {
      case 'chat':
        return '/v1/chat/completions';
      case 'image':
        return '/v1/images/generations';
      case 'video':
        return '/v2/videos/generations';
      case 'audio':
        return '/v1/audio/speech';
      default:
        return '/v1/chat/completions';
    }
  };

  const [showApiKey, setShowApiKey] = useState(false);
  const [isAddingCustomProvider, setIsAddingCustomProvider] = useState(false);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [newCustomProvider, setNewCustomProvider] = useState<Partial<CustomProvider>>({
    name: '',
    type: 'chat',
    baseUrl: '',
    models: [],
  });
  const [newModelInput, setNewModelInput] = useState({ id: '', name: '' });
  */

  const [comfyUIForm, setComfyUIForm] = useState<{
    serverUrl: string
    testing: boolean
    testResult: 'success' | 'failed' | null
  }>({
    serverUrl: config.comfyUIServerUrl,
    testing: false,
    testResult: null,
  })

  // 剪映路径配置
  const [capcutPath, setCapcutPath] = useState<string>('')
  const [isLoadingCapcutPath, setIsLoadingCapcutPath] = useState(false)

  const [workflows, setWorkflows] = useState<WorkflowConfig[]>([])
  const [newWorkflow, setNewWorkflow] = useState({
    name: '',
    type: 'txt2img' as const,
    workflowJson: '',
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 工作流编辑状态
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowConfig | null>(null)
  const [editWorkflowForm, setEditWorkflowForm] = useState<EditWorkflowFormState>({
    name: '',
    type: 'txt2img',
    workflowJson: '',
    nodes: {},
    description: '',
    tags: [],
  })
  const [parsedWorkflowNodes, setParsedWorkflowNodes] = useState<
    Array<{ id: string; type: string; title?: string }>
  >([])
  const [newNodeKey, setNewNodeKey] = useState('')
  const [newNodeValue, setNewNodeValue] = useState('')
  const [newTag, setNewTag] = useState('')
  const [testingWorkflowId, setTestingWorkflowId] = useState<string | null>(null)
  const [testWorkflowResult, setTestWorkflowResult] = useState<{
    id: string
    success: boolean
    message: string
  } | null>(null)

  useEffect(() => {
    // 组件挂载时加载工作流配置
    setWorkflows(getWorkflowConfigs())
  }, [])

  // 加载剪映路径配置
  useEffect(() => {
    const loadCapcutPath = async () => {
      try {
        const { settingsDB } = await import('@/db')
        const settings = await settingsDB.get()
        if (settings.capcutPath) {
          setCapcutPath(settings.capcutPath as string)
        }
      } catch (error) {
        console.error('Failed to load CapCut path:', error)
      }
    }
    loadCapcutPath()
  }, [])

  const [language, setLanguage] = useState(() => {
    return localStorage.getItem('language') || 'zh-CN'
  })

  const [cacheSize, setCacheSize] = useState('0 MB')

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    if (activeTab === 'workflow') {
      setActiveTab('comfyui')
    }
  }, [activeTab, setActiveTab])

  /*
  useEffect(() => {
    if (aiForm.isCustomProvider) {
      setAIForm(prev => ({
        ...prev,
        baseUrl: '',
        model: '',
        testResult: null,
      }));
    } else if (aiForm.provider) {
      const providerInfo = DEFAULT_PROVIDERS[aiForm.provider];
      if (providerInfo) {
        setAIForm(prev => ({
          ...prev,
          baseUrl: providerInfo.baseUrl,
          model: providerInfo.models[0]?.id || '',
          testResult: null,
        }));
      }
    }
  }, [aiForm.provider, aiForm.isCustomProvider]);

  const calculateCacheSize = async () => {
    try {
      let totalSize = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          if (value) {
            totalSize += value.length * 2;
          }
        }
      }
      const sizeMB = (totalSize / 1024 / 1024).toFixed(2);
      setCacheSize(`${sizeMB} MB`);
    } catch {
      setCacheSize('未知');
    }
  };

  const handleTestAIConnection = async () => {
    const providerName = aiForm.isCustomProvider ? aiForm.customProvider : aiForm.provider;
    if (!providerName) {
      toast({ title: '请选择或输入提供商', variant: 'destructive' });
      return;
    }

    const modelName = aiForm.isCustomModel ? aiForm.customModel : aiForm.model;
    if (!modelName) {
      toast({ title: '请选择或输入模型', variant: 'destructive' });
      return;
    }

    setAIForm(prev => ({ ...prev, testing: true, testResult: null }));

    try {
      // 组合 baseUrl 和 endpoint
      // 对于预设提供商，只使用 baseUrl（到域名部分），endpoint 由 provider 自己处理
      // 对于自定义提供商，使用完整的 URL（baseUrl + endpoint）
      let fullBaseUrl = aiForm.baseUrl;
      if (aiForm.isCustomProvider && fullBaseUrl && aiForm.endpoint && aiForm.endpoint !== '/') {
        fullBaseUrl = fullBaseUrl.replace(/\/$/, '') + aiForm.endpoint;
      }
      
      const config: AIConfig = {
        provider: (aiForm.provider || 'custom') as AIProviderType,
        apiKey: aiForm.apiKey,
        baseUrl: fullBaseUrl,
        model: modelName,
      };

      const response = await fetch(`${config.baseUrl}/v1/models`, {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
        },
      });
      const isValid = response.ok;

      setAIForm(prev => ({ ...prev, testResult: isValid ? 'success' : 'failed' }));

      toast({
        title: isValid ? '连接成功' : '连接失败',
        description: isValid ? 'AI 服务连接正常' : '无法连接到 AI 服务，请检查配置',
        variant: isValid ? 'default' : 'destructive',
      });
    } catch (error) {
      setAIForm(prev => ({ ...prev, testResult: 'failed' }));
      toast({
        title: '连接失败',
        description: (error as Error).message,
        variant: 'destructive',
      });
    } finally {
      setAIForm(prev => ({ ...prev, testing: false }));
    }
  };

  const handleSaveAIConfig = () => {
    const providerName = aiForm.isCustomProvider ? aiForm.customProvider : aiForm.provider;
    if (!providerName) {
      toast({ title: '请选择或输入提供商', variant: 'destructive' });
      return;
    }

    const modelName = aiForm.isCustomModel ? aiForm.customModel : aiForm.model;
    if (!modelName) {
      toast({ title: '请选择或输入模型', variant: 'destructive' });
      return;
    }

    const providerKey = aiForm.isCustomProvider 
      ? `custom_${aiForm.customProvider.toLowerCase().replace(/\s+/g, '_')}` 
      : aiForm.provider;
    const providerInfo = DEFAULT_PROVIDERS[aiForm.provider];

    // 分开保存 baseUrl 和 endpoint
    // 对于预设提供商，只保存 baseUrl（到域名部分），endpoint 由 provider 自己处理
    // 对于自定义提供商，分开保存 baseUrl 和 endpoint
    let fullBaseUrl = aiForm.baseUrl;
    let endpoint = aiForm.endpoint;
    if (aiForm.isCustomProvider && fullBaseUrl && aiForm.endpoint && aiForm.endpoint !== '/') {
      fullBaseUrl = fullBaseUrl.replace(/\/$/, '') + aiForm.endpoint;
    } else {
      endpoint = undefined;
    }

    const aiConfig: AIConfig = {
      provider: providerKey as AIProviderType,
      apiKey: aiForm.apiKey,
      baseUrl: aiForm.isCustomProvider ? aiForm.baseUrl : fullBaseUrl,
      endpoint: aiForm.isCustomProvider ? aiForm.endpoint : undefined,
      model: modelName,
    };

    setAIServiceConfig(providerKey as AIProviderType, aiConfig);

    const legacyConfig: AIModelConfig = {
      id: generateId(),
      name: providerInfo?.name || aiForm.customProvider || aiForm.provider,
      type: aiForm.serviceType === 'audio' ? 'tts' : aiForm.serviceType,
      provider: providerKey,
      modelName: modelName,
      apiKey: aiForm.apiKey,
      baseUrl: aiForm.isCustomProvider ? aiForm.baseUrl : fullBaseUrl,
      endpoints: aiForm.isCustomProvider ? {
        [aiForm.serviceType === 'audio' ? 'tts' : aiForm.serviceType]: aiForm.endpoint
      } : {},
      enabled: true,
    };

    saveAIConfig(legacyConfig);
    setConfig(getConfig());
    setHasChanges(false);

    toast({ title: editingProvider ? '配置已更新' : '配置已保存' });

    setAIForm({
      provider: '',
      customProvider: '',
      isCustomProvider: false,
      apiKey: '',
      baseUrl: '',
      endpoint: getDefaultEndpoint('chat'),
      model: '',
      customModel: '',
      isCustomModel: false,
      testing: false,
      testResult: null,
      serviceType: 'chat',
    });
    setEditingProvider(null);
  };

  const handleDeleteAIConfig = (provider: AIProviderType) => {
    removeAIServiceConfig(provider);
    deleteAIConfig(provider);
    setConfig(getConfig());
    toast({ title: '配置已删除' });
  };

  const handleEditAIConfig = (provider: AIProviderType) => {
    const cfg = aiConfigs[provider];
    if (!cfg) return;

    const isCustom = provider.startsWith('custom_');
    const providerInfo = DEFAULT_PROVIDERS[provider];
    const customProviderInfo = customProviders.find(p => p.id === provider);

    const serviceType = customProviderInfo?.type || DEFAULT_PROVIDERS[provider]?.type || 'chat';

    // 从完整的 baseUrl 中分离出 baseUrl 和 endpoint
    let baseUrl = cfg.baseUrl || '';
    let endpoint = getDefaultEndpoint(serviceType as 'chat' | 'image' | 'video' | 'audio');
    
    // 尝试从 baseUrl 中提取 endpoint
    const endpointPatterns = [
      '/v1/chat/completions',
      '/v1/images/generations',
      '/v1/images/edits',
      '/v2/videos/generations',
      '/v1/audio/speech',
      '/v1'
    ];
    
    for (const pattern of endpointPatterns) {
      if (baseUrl.endsWith(pattern)) {
        endpoint = pattern;
        baseUrl = baseUrl.slice(0, -pattern.length);
        break;
      }
    }

    setAIForm({
      provider: isCustom ? '' : provider,
      customProvider: isCustom ? (customProviderInfo?.name || provider.replace('custom_', '')) : '',
      isCustomProvider: isCustom,
      apiKey: cfg.apiKey || '',
      baseUrl: baseUrl,
      endpoint: endpoint,
      model: (providerInfo?.models?.find(m => m.id === cfg.model) ? cfg.model : '') || '',
      customModel: providerInfo?.models?.find(m => m.id === cfg.model) ? '' : (cfg.model || ''),
      isCustomModel: !providerInfo?.models?.find(m => m.id === cfg.model),
      testing: false,
      testResult: null,
      serviceType: serviceType as 'chat' | 'image' | 'video' | 'audio',
    });
    setEditingProvider(provider);
  };

  const handleAddCustomProvider = () => {
    if (!newCustomProvider.name || !newCustomProvider.baseUrl) {
      toast({ title: '请填写提供商名称和 Base URL', variant: 'destructive' });
      return;
    }

    const provider: CustomProvider = {
      id: generateId(),
      name: newCustomProvider.name,
      type: newCustomProvider.type || 'chat',
      baseUrl: newCustomProvider.baseUrl,
      apiKey: newCustomProvider.apiKey,
      models: newCustomProvider.models || [],
    };

    const updated = [...customProviders, provider];
    setCustomProviders(updated);
    localStorage.setItem('custom_providers', JSON.stringify(updated));

    setNewCustomProvider({
      name: '',
      type: 'chat',
      baseUrl: '',
      models: [],
    });
    setIsAddingCustomProvider(false);
    toast({ title: '自定义提供商已添加' });
  };

  const handleAddModelToCustomProvider = () => {
    if (!newModelInput.id || !newModelInput.name) {
      toast({ title: '请填写模型 ID 和名称', variant: 'destructive' });
      return;
    }

    setNewCustomProvider(prev => ({
      ...prev,
      models: [...(prev.models || []), { id: newModelInput.id, name: newModelInput.name }],
    }));
    setNewModelInput({ id: '', name: '' });
  };

  const handleDeleteCustomProvider = (id: string) => {
    const updated = customProviders.filter(p => p.id !== id);
    setCustomProviders(updated);
    localStorage.setItem('custom_providers', JSON.stringify(updated));
    toast({ title: '自定义提供商已删除' });
  };

  */

  const calculateCacheSize = useCallback(() => {
    try {
      let totalSize = 0
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key) {
          continue
        }

        const value = localStorage.getItem(key)
        if (value) {
          totalSize += value.length * 2
        }
      }

      const sizeMB = (totalSize / 1024 / 1024).toFixed(2)
      setCacheSize(`${sizeMB} MB`)
    } catch {
      setCacheSize('未知')
    }
  }, [])

  const handleTestComfyUI = async () => {
    setComfyUIForm(prev => ({ ...prev, testing: true, testResult: null }))

    try {
      const client = new ComfyUIClient({ serverUrl: comfyUIForm.serverUrl })
      const isConnected = await client.checkConnection()

      setComfyUIForm(prev => ({ ...prev, testResult: isConnected ? 'success' : 'failed' }))

      toast({
        title: isConnected ? '连接成功' : '连接失败',
        description: isConnected ? 'ComfyUI 服务器正常运行' : '无法连接到 ComfyUI 服务器',
        variant: isConnected ? 'default' : 'destructive',
      })
    } catch (error) {
      setComfyUIForm(prev => ({ ...prev, testResult: 'failed' }))
      toast({
        title: '连接失败',
        description: '无法连接到 ComfyUI 服务器',
        variant: 'destructive',
      })
    } finally {
      setComfyUIForm(prev => ({ ...prev, testing: false }))
    }
  }

  const handleSaveComfyUI = () => {
    saveComfyUIServerUrl(comfyUIForm.serverUrl)
    setConfig(getConfig())
    setHasChanges(false)
    toast({ title: 'ComfyUI 配置已保存' })
  }

  const handleAddWorkflow = () => {
    if (!newWorkflow.name || !newWorkflow.workflowJson) {
      toast({ title: '请填写模板名称和配置', variant: 'destructive' })
      return
    }

    try {
      const parsed = JSON.parse(newWorkflow.workflowJson)
      const workflow: WorkflowConfig = {
        id: generateId(),
        name: newWorkflow.name,
        type: newWorkflow.type,
        workflow: parsed,
        nodes: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      saveWorkflowConfig(workflow)
      setWorkflows(getWorkflowConfigs())
      setNewWorkflow({ name: '', type: 'txt2img', workflowJson: '' })
      toast({ title: '模板已添加' })
    } catch {
      toast({ title: '模板 JSON 格式无效', variant: 'destructive' })
    }
  }

  const handleDeleteWorkflow = (id: string) => {
    deleteWorkflowConfig(id)
    setWorkflows(getWorkflowConfigs())
    toast({ title: '模板已删除' })
  }

  // 解析工作流 JSON 提取节点列表
  const extractNodesFromWorkflow = useCallback((workflowJson: string) => {
    try {
      const workflow = JSON.parse(workflowJson)
      const nodes = Object.entries(workflow).map(([id, node]: [string, any]) => ({
        id,
        type: node.class_type || node._meta?.title || 'Unknown',
        title: node._meta?.title || node.class_type || id,
      }))
      return nodes
    } catch {
      return []
    }
  }, [])

  // 打开编辑工作流
  const openEditWorkflow = useCallback(
    (workflow: WorkflowConfig) => {
      const workflowJson = JSON.stringify(workflow.workflow, null, 2)
      setEditingWorkflow(workflow)
      setEditWorkflowForm({
        name: workflow.name,
        type: workflow.type,
        workflowJson,
        nodes: sanitizeNodeMap(workflow.nodes),
        description: (workflow as any).description || '',
        tags: (workflow as any).tags || [],
      })
      setParsedWorkflowNodes(extractNodesFromWorkflow(workflowJson))
      setNewNodeKey('')
      setNewNodeValue('')
      setNewTag('')
    },
    [extractNodesFromWorkflow]
  )

  // 关闭编辑
  const closeEditWorkflow = useCallback(() => {
    setEditingWorkflow(null)
    setEditWorkflowForm({
      name: '',
      type: 'txt2img',
      workflowJson: '',
      nodes: {},
      description: '',
      tags: [],
    })
    setParsedWorkflowNodes([])
  }, [])

  // 保存工作流编辑
  const handleSaveWorkflowEdit = useCallback(() => {
    if (!editingWorkflow || !editWorkflowForm.name.trim()) return

    try {
      let workflow: Record<string, any> = {}
      if (editWorkflowForm.workflowJson.trim()) {
        workflow = JSON.parse(editWorkflowForm.workflowJson)
      }

      const updatedWorkflow: WorkflowConfig = {
        ...editingWorkflow,
        name: editWorkflowForm.name,
        type: editWorkflowForm.type,
        workflow,
        nodes: editWorkflowForm.nodes,
        updated_at: new Date().toISOString(),
        ...(editWorkflowForm.description && { description: editWorkflowForm.description }),
        ...(editWorkflowForm.tags.length > 0 && { tags: editWorkflowForm.tags }),
      }

      saveWorkflowConfig(updatedWorkflow)
      setWorkflows(getWorkflowConfigs())
      closeEditWorkflow()
      toast({ title: '模板已更新' })
    } catch (error) {
      toast({ title: '保存失败: ' + (error as Error).message, variant: 'destructive' })
    }
  }, [editingWorkflow, editWorkflowForm, closeEditWorkflow])

  // 添加节点映射（支持一个参数映射到多个节点）
  const handleAddNode = useCallback(() => {
    if (newNodeKey.trim() && newNodeValue.trim()) {
      const key = newNodeKey.trim()
      const value = newNodeValue.trim()
      setEditWorkflowForm(prev => {
        const existingValue = prev.nodes[key]
        let newValue: string | string[]
        if (existingValue) {
          // 如果已存在，转换为数组并追加
          newValue = Array.isArray(existingValue) ? [...existingValue, value] : [existingValue, value]
        } else {
          newValue = value
        }
        return {
          ...prev,
          nodes: { ...prev.nodes, [key]: newValue },
        }
      })
      setNewNodeKey('')
      setNewNodeValue('')
    }
  }, [newNodeKey, newNodeValue])

  // 删除节点映射（整个键）
  const handleRemoveNode = useCallback((key: string) => {
    setEditWorkflowForm(prev => {
      const newNodes = { ...prev.nodes }
      delete newNodes[key]
      return { ...prev, nodes: newNodes }
    })
  }, [])

  // 从数组中删除特定节点（用于多节点映射）
  const handleRemoveNodeFromArray = useCallback((key: string, nodeIdToRemove: string) => {
    setEditWorkflowForm(prev => {
      const existingValue = prev.nodes[key]
      if (!existingValue) return prev

      if (Array.isArray(existingValue)) {
        const newValue = existingValue.filter(id => id !== nodeIdToRemove)
        // 如果只剩一个，转回字符串
        if (newValue.length === 1) {
          return { ...prev, nodes: { ...prev.nodes, [key]: newValue[0]! } }
        }
        return { ...prev, nodes: { ...prev.nodes, [key]: newValue } }
      } else {
        // 单个值直接删除
        const newNodes = { ...prev.nodes }
        delete newNodes[key]
        return { ...prev, nodes: newNodes }
      }
    })
  }, [])

  // 添加标签
  const handleAddTag = useCallback(() => {
    if (newTag.trim() && !editWorkflowForm.tags.includes(newTag.trim())) {
      setEditWorkflowForm(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()],
      }))
      setNewTag('')
    }
  }, [newTag, editWorkflowForm.tags])

  // 删除标签
  const handleRemoveTag = useCallback((tag: string) => {
    setEditWorkflowForm(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag),
    }))
  }, [])

  // 从文件上传工作流
  const handleWorkflowFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const content = await file.text()
    try {
      const { workflow, nodes } = parseComfyUIWorkflow(content)

      const newConfig: WorkflowConfig = {
        id: generateId(),
        name: file.name.replace('.json', ''),
        type: 'txt2img',
        workflow,
        nodes,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      saveWorkflowConfig(newConfig)
      setWorkflows(getWorkflowConfigs())
      toast({ title: '模板已导入' })
    } catch (error) {
      toast({ title: '解析模板文件失败: ' + (error as Error).message, variant: 'destructive' })
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // 测试工作流
  const handleTestWorkflow = async (workflow: WorkflowConfig) => {
    setTestingWorkflowId(workflow.id)
    setTestWorkflowResult(null)

    try {
      const { ComfyUIClient } = await import('@/services/comfyui')
      const { getComfyUIServerUrl } = await import('@/services/configService')
      const serverUrl = getComfyUIServerUrl()
      const client = new ComfyUIClient({ serverUrl })
      const connected = await client.checkConnection()

      if (connected) {
        setTestWorkflowResult({ id: workflow.id, success: true, message: 'ComfyUI 连接成功' })
      } else {
        setTestWorkflowResult({ id: workflow.id, success: false, message: 'ComfyUI 连接失败' })
      }
    } catch (error) {
      setTestWorkflowResult({ id: workflow.id, success: false, message: (error as Error).message })
    } finally {
      setTestingWorkflowId(null)
    }
  }

  function sanitizeNodeMap(nodes: Record<string, string | string[] | undefined>) {
    return Object.fromEntries(
      Object.entries(nodes).filter(
        (entry): entry is [string, string | string[]] =>
          typeof entry[1] === 'string' || Array.isArray(entry[1])
      )
    )
  }

  const WORKFLOW_TYPES = [
    { value: 'txt2img', label: '文生图' },
    { value: 'img2img', label: '图生图' },
    { value: 'img2vid', label: '图生视频' },
    { value: 'txt2vid', label: '文生视频' },
    { value: 'tts', label: '语音合成' },
    { value: 'other', label: '其他' },
  ] as const

  // 节点映射参数列表 - 与项目数据字段对应
  const NODE_KEY_CATEGORIES = [
    {
      label: '基础参数',
      keys: [
        'prompt',
        'negativePrompt',
        'width',
        'height',
        'seed',
        'steps',
        'cfg',
        'sampler',
        'model',
        'output',
      ],
    },
    {
      label: '参考图/视频',
      keys: ['imageInput', 'referenceImages', 'videoUrl', 'firstFrame', 'lastFrame', 'strength'],
    },
    {
      label: '视频参数',
      keys: ['duration', 'fps', 'motionStrength'],
    },
    {
      label: '风格与质量',
      keys: ['style', 'quality', 'aspectRatio'],
    },
    {
      label: '配音/TTS',
      keys: ['text', 'voiceId', 'speed', 'emotion', 'language'],
    },
  ]

  // 根据工作流类型获取推荐的节点映射
  const getRecommendedNodesForType = (type: WorkflowConfig['type']): string[] => {
    switch (type) {
      case 'txt2img':
        return ['prompt', 'negativePrompt', 'width', 'height', 'seed', 'steps', 'cfg', 'output']
      case 'img2img':
        return ['prompt', 'negativePrompt', 'imageInput', 'strength', 'width', 'height', 'output']
      case 'img2vid':
        return ['prompt', 'imageInput', 'duration', 'fps', 'motionStrength', 'output']
      case 'txt2vid':
        return [
          'prompt',
          'negativePrompt',
          'duration',
          'fps',
          'motionStrength',
          'width',
          'height',
          'output',
        ]
      case 'tts':
        return ['text', 'voiceId', 'speed', 'emotion', 'output']
      default:
        return ['prompt', 'output']
    }
  }

  const getWorkflowTypeLabel = (type: string) => {
    return WORKFLOW_TYPES.find(t => t.value === type)?.label || type
  }

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme)
    saveTheme(newTheme)
    toast({ title: `主题已切换为 ${newTheme === 'dark' ? '深色' : '浅色'}模式` })
  }

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang)
    localStorage.setItem('language', lang)
    toast({ title: '语言设置已保存' })
  }

  // 选择剪映可执行文件路径
  const handleSelectCapcutPath = async () => {
    try {
      const selected = await open({
        title: '选择剪映专业版可执行文件',
        filters: [
          { name: '可执行文件', extensions: ['exe'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      })

      if (selected && typeof selected === 'string') {
        setCapcutPath(selected)
        // 保存到数据库
        const { settingsDB } = await import('@/db')
        await settingsDB.save({ capcutPath: selected })
        toast({ title: '剪映路径已保存' })
      }
    } catch (error) {
      toast({
        title: '选择路径失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      })
    }
  }

  // 清除剪映路径
  const handleClearCapcutPath = async () => {
    setCapcutPath('')
    const { settingsDB } = await import('@/db')
    await settingsDB.save({ capcutPath: '' })
    toast({ title: '剪映路径已清除，将使用自动检测' })
  }

  const handleClearCache = async () => {
    const confirmed = await confirm('确定要清理缓存吗？', {
      title: '清理缓存',
      kind: 'warning',
      okLabel: '确定清理',
      cancelLabel: '取消',
    })

    if (!confirmed) return

    const keysToKeep = [
      'fivedesigner-ui',
      'app-storage',
      'fivedesigner-theme',
      'workflow-storage',
      'ai-role-storage',
      'ai-service-storage',
      'fivedesigner_config',
      'shortcuts_config',
      'language',
      'custom_providers',
    ]
    const keysToRemove: string[] = []

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && !keysToKeep.includes(key)) {
        keysToRemove.push(key)
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key))
    calculateCacheSize()
    toast({ title: `已清理 ${keysToRemove.length} 项缓存数据` })
  }

  const handleExportSettings = async () => {
    try {
      const modelConfigs = await getAIConfigsWithSecrets()
      const settings = {
        theme,
        appearance: {
          currentTheme,
          radius,
          fontSize,
          compactMode,
          animationsEnabled,
          glassEffects,
        },
        language,
        shortcuts,
        aiConfigs,
        modelConfigs,
        customProviders,
        comfyUIServerUrl: config.comfyUIServerUrl,
      }

      const json = JSON.stringify(settings, null, 2)

      // 打开保存对话框
      const savePath = await save({
        defaultPath: `fivedesigner-settings-${new Date().toISOString().split('T')[0]}.json`,
        filters: [
          { name: 'JSON 文件', extensions: ['json'] },
          { name: '所有文件', extensions: ['*'] },
        ],
        title: '导出设置',
      })

      if (!savePath) return

      // 写入文件
      await writeFile(savePath, new TextEncoder().encode(json))

      toast({
        title: '设置已导出',
        description: `设置已保存到: ${savePath}`,
      })
    } catch (error) {
      console.error('导出设置失败:', error)
      toast({
        title: '导出失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      })
    }
  }

  const handleImportSettings = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async e => {
      try {
        const settings = JSON.parse(e.target?.result as string)

        if (settings.theme) {
          handleThemeChange(settings.theme)
        }
        const appearance =
          settings.appearance && typeof settings.appearance === 'object'
            ? (settings.appearance as Record<string, unknown>)
            : null
        if (appearance?.currentTheme) {
          setAppTheme(appearance.currentTheme as typeof currentTheme)
        }
        if (appearance?.radius) {
          setRadius(appearance.radius as typeof radius)
        }
        if (appearance?.fontSize) {
          setFontSize(appearance.fontSize as typeof fontSize)
        }
        if (typeof appearance?.compactMode === 'boolean') {
          setCompactMode(appearance.compactMode)
        }
        if (typeof appearance?.animationsEnabled === 'boolean') {
          setAnimationsEnabled(appearance.animationsEnabled)
        }
        if (typeof appearance?.glassEffects === 'boolean') {
          setGlassEffects(appearance.glassEffects)
        }
        if (settings.language) {
          handleLanguageChange(settings.language)
        }
        if (settings.shortcuts) {
          setShortcuts(settings.shortcuts)
          localStorage.setItem('shortcuts_config', JSON.stringify(settings.shortcuts))
        }
        if (settings.customProviders) {
          setCustomProviders(settings.customProviders)
          localStorage.setItem('custom_providers', JSON.stringify(settings.customProviders))
        }
        if (settings.comfyUIServerUrl) {
          saveComfyUIServerUrl(settings.comfyUIServerUrl)
          setComfyUIForm(prev => ({ ...prev, serverUrl: settings.comfyUIServerUrl }))
        }

        const importedModelConfigs = Array.isArray(settings.modelConfigs)
          ? settings.modelConfigs
          : Array.isArray(settings.aiConfigs)
            ? settings.aiConfigs
            : null

        if (importedModelConfigs) {
          // 逐个保存 AI 配置
          for (const modelConfig of importedModelConfigs as AIModelConfig[]) {
            await saveAIConfig(modelConfig)
          }
        }

        toast({ title: '设置已导入' })
      } catch {
        toast({ title: '导入失败：文件格式无效', variant: 'destructive' })
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  const renderStatusIcon = (result: 'success' | 'failed' | null, testing: boolean) => {
    if (testing) {
      return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
    }
    if (result === 'success') {
      return <CheckCircle className="w-4 h-4 text-green-500" />
    }
    if (result === 'failed') {
      return <XCircle className="w-4 h-4 text-red-500" />
    }
    return null
  }

  return (
    <div className="h-full overflow-y-auto p-6 max-w-5xl mx-auto">
      {hasChanges && (
        <div className="mb-6 flex items-center gap-2 text-amber-500">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">有未保存的更改</span>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6 flex-wrap h-auto gap-1">
          <TabsTrigger value="ai" className="gap-2">
            <Key className="w-4 h-4" />
            AI 服务
          </TabsTrigger>
          <TabsTrigger value="comfyui" className="gap-2">
            <Server className="w-4 h-4" />
            ComfyUI
          </TabsTrigger>
          <TabsTrigger value="voice" className="gap-2">
            <Mic className="w-4 h-4" />
            音色管理
          </TabsTrigger>
          <TabsTrigger value="appearance" className="gap-2">
            <Palette className="w-4 h-4" />
            外观
          </TabsTrigger>
          <TabsTrigger value="workspace" className="gap-2">
            <FolderOpen className="w-4 h-4" />
            工作目录
          </TabsTrigger>
          <TabsTrigger value="other" className="gap-2">
            <Settings2 className="w-4 h-4" />
            其他
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai">
          <VendorConfigPanel />
        </TabsContent>

        <TabsContent value="comfyui">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>ComfyUI 配置</CardTitle>
                <CardDescription>配置 ComfyUI 服务器连接</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">服务器地址</label>
                  <Input
                    value={comfyUIForm.serverUrl}
                    onChange={e => {
                      setComfyUIForm(prev => ({ ...prev, serverUrl: e.target.value }))
                      setHasChanges(true)
                    }}
                    placeholder="http://127.0.0.1:8188"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleTestComfyUI}
                    disabled={comfyUIForm.testing}
                    className="gap-2"
                  >
                    {renderStatusIcon(comfyUIForm.testResult, comfyUIForm.testing)}
                    {comfyUIForm.testing ? '测试中...' : '测试连接'}
                  </Button>
                  <Button onClick={handleSaveComfyUI} className="gap-2">
                    <Save className="w-4 h-4" />
                    保存
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>ComfyUI 模板</CardTitle>
                    <CardDescription>管理分镜、视频与配音生成所使用的 ComfyUI 模板</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="file"
                      accept=".json"
                      ref={fileInputRef}
                      onChange={handleWorkflowFileUpload}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      导入 JSON
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {workflows.length > 0 && (
                  <div className="space-y-2">
                    {workflows.map(workflow => (
                      <div
                        key={workflow.id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{workflow.name}</span>
                            <Badge variant="secondary">{getWorkflowTypeLabel(workflow.type)}</Badge>
                            {(workflow as any).tags?.map((tag: string) => (
                              <Badge key={tag} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                          {(workflow as any).description && (
                            <div className="text-sm text-muted-foreground mt-1 line-clamp-1">
                              {(workflow as any).description}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-1 mt-2">
                            {Object.entries(workflow.nodes)
                              .slice(0, 4)
                              .map(([key, value]) => (
                                <Badge key={key} variant="outline" className="text-xs font-mono">
                                  {key}: {value}
                                </Badge>
                              ))}
                            {Object.keys(workflow.nodes).length > 4 && (
                              <Badge variant="outline" className="text-xs">
                                +{Object.keys(workflow.nodes).length - 4}
                              </Badge>
                            )}
                          </div>
                          {testWorkflowResult?.id === workflow.id && (
                            <div
                              className={`mt-2 flex items-center gap-2 text-sm ${testWorkflowResult.success ? 'text-green-500' : 'text-red-500'}`}
                            >
                              {testWorkflowResult.success ? (
                                <Check className="w-4 h-4" />
                              ) : (
                                <X className="w-4 h-4" />
                              )}
                              {testWorkflowResult.message}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1 ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEditWorkflow(workflow)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleTestWorkflow(workflow)}
                            disabled={testingWorkflowId === workflow.id}
                          >
                            {testingWorkflowId === workflow.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteWorkflow(workflow.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 添加新模板表单 */}
                <div className="space-y-4 p-4 border rounded-lg">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">模板名称</label>
                      <Input
                        value={newWorkflow.name}
                        onChange={e => setNewWorkflow(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="输入名称"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">类型</label>
                      <select
                        className="w-full h-10 px-3 rounded-md border border-input bg-background"
                        value={newWorkflow.type}
                        onChange={e =>
                          setNewWorkflow(prev => ({ ...prev, type: e.target.value as 'txt2img' }))
                        }
                      >
                        {WORKFLOW_TYPES.map(type => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">模板 JSON</label>
                    <Textarea
                      className="h-32 font-mono"
                      value={newWorkflow.workflowJson}
                      onChange={e =>
                        setNewWorkflow(prev => ({ ...prev, workflowJson: e.target.value }))
                      }
                      placeholder="粘贴 ComfyUI 模板 JSON"
                    />
                  </div>

                  <Button onClick={handleAddWorkflow} className="gap-2">
                    <Plus className="w-4 h-4" />
                    添加模板
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 编辑模板对话框 */}
            {editingWorkflow && (
              <Card className="border-primary">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>编辑 ComfyUI 模板：{editingWorkflow.name}</CardTitle>
                    <Button variant="ghost" size="icon" onClick={closeEditWorkflow}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* 基本信息 */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">模板名称</label>
                      <Input
                        value={editWorkflowForm.name}
                        onChange={e =>
                          setEditWorkflowForm(prev => ({ ...prev, name: e.target.value }))
                        }
                        placeholder="输入名称"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">类型</label>
                      <select
                        className="w-full h-10 px-3 rounded-md border border-input bg-background"
                        value={editWorkflowForm.type}
                        onChange={e =>
                          setEditWorkflowForm(prev => ({
                            ...prev,
                            type: e.target.value as WorkflowConfig['type'],
                          }))
                        }
                      >
                        {WORKFLOW_TYPES.map(type => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* 描述 */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">描述</label>
                    <Textarea
                      className="h-20"
                      value={editWorkflowForm.description}
                      onChange={e =>
                        setEditWorkflowForm(prev => ({ ...prev, description: e.target.value }))
                      }
                      placeholder="输入模板描述（可选）"
                    />
                  </div>

                  {/* 标签 */}
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
                        添加
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {editWorkflowForm.tags.map(tag => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="cursor-pointer"
                          onClick={() => handleRemoveTag(tag)}
                        >
                          {tag} <X className="w-3 h-3 ml-1" />
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* 节点映射 */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">节点映射</label>
                    <div className="text-sm text-muted-foreground mb-2">
                      配置模板中的节点 ID 映射，方便在生成时自动填充参数。
                    </div>

                    {/* 推荐节点映射提示 */}
                    <div className="bg-muted/50 p-3 rounded-lg mb-3">
                      <div className="text-xs text-muted-foreground mb-2">
                        {getWorkflowTypeLabel(editWorkflowForm.type)} 模板推荐节点：
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {getRecommendedNodesForType(editWorkflowForm.type).map(key => (
                          <Badge
                            key={key}
                            variant={editWorkflowForm.nodes[key] ? 'default' : 'outline'}
                            className="text-xs cursor-pointer"
                            onClick={() => {
                              if (!editWorkflowForm.nodes[key]) {
                                setNewNodeKey(key)
                              }
                            }}
                          >
                            {key}
                            {editWorkflowForm.nodes[key] && ' ✓'}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <select
                        value={newNodeKey}
                        onChange={e => setNewNodeKey(e.target.value)}
                        className="flex-1 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">选择参数...</option>
                        {NODE_KEY_CATEGORIES.map(category => (
                          <optgroup key={category.label} label={category.label}>
                            {category.keys.map(key => (
                              <option key={key} value={key}>
                                {key}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                        <option value="__custom__">✏️ 自定义参数...</option>
                      </select>
                      {newNodeKey === '__custom__' && (
                        <Input
                          placeholder="输入自定义参数名"
                          className="flex-1"
                          onChange={e => setNewNodeKey(e.target.value)}
                        />
                      )}

                      {/* 节点 ID 下拉选择 */}
                      {parsedWorkflowNodes.length > 0 ? (
                        <select
                          value={newNodeValue}
                          onChange={e => setNewNodeValue(e.target.value)}
                          className="flex-1 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          <option value="">选择节点...</option>
                          {parsedWorkflowNodes.map(node => (
                            <option key={node.id} value={node.id}>
                              {node.id} - {node.title}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          value={newNodeValue}
                          onChange={e => setNewNodeValue(e.target.value)}
                          placeholder="ComfyUI 节点 ID"
                          className="flex-1"
                        />
                      )}

                      <Button type="button" onClick={handleAddNode} variant="outline">
                        <Plus className="w-4 h-4" />
                      </Button>

                      {/* 提示：如果参数已存在，将添加为多节点映射 */}
                      {newNodeKey && editWorkflowForm.nodes[newNodeKey] && (
                        <div className="text-xs text-amber-500 mt-1">
                          该参数已映射到 {Array.isArray(editWorkflowForm.nodes[newNodeKey]) ? (editWorkflowForm.nodes[newNodeKey] as string[]).length : 1} 个节点，点击 + 将添加更多
                        </div>
                      )}
                    </div>

                    {/* 显示解析出的节点数量 */}
                    {parsedWorkflowNodes.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        已解析 {parsedWorkflowNodes.length} 个节点
                      </div>
                    )}

                    <div className="border rounded-lg divide-y mt-2">
                      {Object.entries(editWorkflowForm.nodes).map(([key, value]) => {
                        // 支持数组类型的值（多节点映射）
                        const nodeIds = Array.isArray(value) ? value : [value]
                        return (
                          <div key={key} className="p-3">
                            <div className="flex items-center justify-between mb-2">
                              <Badge variant="secondary">{key}</Badge>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={() => handleRemoveNode(key)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                            <div className="space-y-1 pl-2">
                              {nodeIds.map((nodeId, index) => (
                                <div key={`${key}-${index}`} className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">{index + 1}.</span>
                                  <span className="text-sm font-mono text-muted-foreground">{nodeId}</span>
                                  {nodeIds.length > 1 && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-destructive/70"
                                      onClick={() => handleRemoveNodeFromArray(key, nodeId)}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                      {Object.keys(editWorkflowForm.nodes).length === 0 && (
                        <div className="p-4 text-center text-muted-foreground text-sm">
                          暂无节点映射
                        </div>
                      )}
                    </div>
                  </div>

                  {/* JSON 配置 */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">JSON 配置</label>
                    <Textarea
                      className="h-40 font-mono"
                      value={editWorkflowForm.workflowJson}
                      onChange={e => {
                        const newJson = e.target.value
                        setEditWorkflowForm(prev => ({ ...prev, workflowJson: newJson }))
                        // 实时解析节点
                        setParsedWorkflowNodes(extractNodesFromWorkflow(newJson))
                      }}
                      placeholder="粘贴 ComfyUI 模板 JSON"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          try {
                            const { nodes } = parseComfyUIWorkflow(editWorkflowForm.workflowJson)
                            setEditWorkflowForm(prev => ({
                              ...prev,
                              nodes: sanitizeNodeMap({ ...prev.nodes, ...nodes }),
                            }))
                            toast({ title: '解析成功，已自动添加节点映射' })
                          } catch (error) {
                            toast({
                              title: '解析失败: ' + (error as Error).message,
                              variant: 'destructive',
                            })
                          }
                        }}
                      >
                        <FileJson className="w-4 h-4 mr-2" />
                        自动解析节点
                      </Button>
                      {parsedWorkflowNodes.length > 0 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            // 刷新节点列表
                            setParsedWorkflowNodes(
                              extractNodesFromWorkflow(editWorkflowForm.workflowJson)
                            )
                            toast({
                              title: `已刷新节点列表 (${parsedWorkflowNodes.length} 个节点)`,
                            })
                          }}
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />
                          刷新节点
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* 保存按钮 */}
                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button variant="outline" onClick={closeEditWorkflow}>
                      取消
                    </Button>
                    <Button onClick={handleSaveWorkflowEdit}>
                      <Save className="w-4 h-4 mr-2" />
                      保存修改
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="appearance">
          <Card>
            <CardContent className="space-y-6 pt-6">
              {/* 主题选择 */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">主题选择</h3>
                {Object.entries(
                  themes.reduce(
                    (acc, theme) => {
                      const category = theme.category
                      if (!acc[category]) {
                        acc[category] = []
                      }
                      acc[category]!.push(theme)
                      return acc
                    },
                    {} as Record<string, typeof themes>
                  )
                ).map(([category, categoryThemes]) => {
                  const Icon = categoryIcons[category as keyof typeof categoryIcons]
                  return (
                    <div key={category} className="space-y-3">
                      <div className="flex items-center gap-2">
                        {Icon && <Icon className="h-4 w-4" />}
                        <h4 className="text-sm font-medium">
                          {categoryNames[category as keyof typeof categoryNames]}
                        </h4>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {categoryThemes.map(themeItem => {
                          const isActive = currentTheme === themeItem.id
                          return (
                            <button
                              key={themeItem.id}
                              onClick={() => setAppTheme(themeItem.id)}
                              className={cn(
                                'relative p-3 rounded-lg border transition-all text-left',
                                isActive
                                  ? 'border-primary bg-primary/5'
                                  : 'border-border hover:border-primary/50 hover:bg-muted/50'
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <div
                                  className="h-6 w-6 rounded"
                                  style={{ background: themeItem.preview }}
                                />
                                <div className="flex-1">
                                  <div className="text-sm font-medium">{themeItem.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {themeItem.description}
                                  </div>
                                </div>
                                {isActive && (
                                  <div className="absolute top-2 right-2">
                                    <div className="bg-primary text-primary-foreground rounded-full p-0.5">
                                      <Check className="h-3 w-3" />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* 外观设置 */}
              <div className="space-y-6">

                {/* 圆角设置 */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <Monitor className="h-4 w-4" />
                      圆角大小
                    </Label>
                    <span className="text-sm text-muted-foreground">{radiusLabels[radius]}</span>
                  </div>
                  <div className="flex gap-2">
                    {(['none', 'sm', 'md', 'lg', 'xl', 'full'] as const).map(r => (
                      <button
                        key={r}
                        onClick={() => setRadius(r)}
                        className={cn(
                          'flex-1 py-2 rounded-md border text-sm transition-all',
                          radius === r
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border hover:border-primary/50'
                        )}
                      >
                        {radiusLabels[r]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 字体大小 */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <Minimize2 className="h-4 w-4" />
                      字体大小
                    </Label>
                    <span className="text-sm text-muted-foreground">
                      {fontSizeLabels[fontSize]}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {(['sm', 'base', 'lg'] as const).map(size => (
                      <button
                        key={size}
                        onClick={() => setFontSize(size)}
                        className={cn(
                          'flex-1 py-2 rounded-md border text-sm transition-all',
                          fontSize === size
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border hover:border-primary/50'
                        )}
                      >
                        {fontSizeLabels[size]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 其他设置 */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="flex items-center gap-2">
                        <Minimize2 className="h-4 w-4" />
                        紧凑模式
                      </Label>
                      <p className="text-xs text-muted-foreground">减少界面元素间距</p>
                    </div>
                    <Switch checked={compactMode} onCheckedChange={setCompactMode} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4" />
                        动画效果
                      </Label>
                      <p className="text-xs text-muted-foreground">启用界面过渡动画</p>
                    </div>
                    <Switch checked={animationsEnabled} onCheckedChange={setAnimationsEnabled} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="flex items-center gap-2">
                        <GlassWater className="h-4 w-4" />
                        玻璃效果
                      </Label>
                      <p className="text-xs text-muted-foreground">启用毛玻璃背景效果</p>
                    </div>
                    <Switch checked={glassEffects} onCheckedChange={setGlassEffects} />
                  </div>
                </div>
              </div>

              {/* 预览区域 */}
              <div className="mt-4 p-4 rounded-lg bg-muted/50 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">预览</p>
                <div className="flex items-center gap-2">
                  <Button size="sm">主要按钮</Button>
                  <Button size="sm" variant="secondary">
                    次要按钮
                  </Button>
                  <Button size="sm" variant="outline">
                    边框按钮
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-md bg-primary" />
                  <div className="h-8 w-8 rounded-md bg-secondary" />
                  <div className="h-8 w-8 rounded-md bg-accent" />
                  <div className="h-8 w-8 rounded-md bg-muted" />
                  <div className="h-8 w-8 rounded-md bg-destructive" />
                </div>
              </div>

              {/* 语言设置 */}
              <div className="space-y-2">
                <label className="text-sm font-medium">语言</label>
                <select
                  className="w-full h-10 px-3 rounded-md border border-input bg-background"
                  value={language}
                  onChange={e => handleLanguageChange(e.target.value)}
                >
                  <option value="zh-CN">简体中文</option>
                  <option value="en-US">English</option>
                </select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="voice">
          <VoiceList />
        </TabsContent>

        <TabsContent value="workspace">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>工作目录</CardTitle>
                <CardDescription>管理媒体文件的存储位置</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <WorkspaceInfo />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>目录结构</CardTitle>
                <CardDescription>媒体文件按项目/剧集/类型组织</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-muted-foreground" />
                    <code className="bg-muted px-2 py-1 rounded">
                      projects/{'{projectId}'}/{'{episodeId}'}/characters/
                    </code>
                    <span className="text-muted-foreground">角色图片</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-muted-foreground" />
                    <code className="bg-muted px-2 py-1 rounded">
                      projects/{'{projectId}'}/{'{episodeId}'}/scenes/
                    </code>
                    <span className="text-muted-foreground">场景图片</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-muted-foreground" />
                    <code className="bg-muted px-2 py-1 rounded">
                      projects/{'{projectId}'}/{'{episodeId}'}/props/
                    </code>
                    <span className="text-muted-foreground">道具图片</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-muted-foreground" />
                    <code className="bg-muted px-2 py-1 rounded">
                      projects/{'{projectId}'}/{'{episodeId}'}/storyboards/
                    </code>
                    <span className="text-muted-foreground">分镜图片</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-muted-foreground" />
                    <code className="bg-muted px-2 py-1 rounded">
                      projects/{'{projectId}'}/{'{episodeId}'}/videos/
                    </code>
                    <span className="text-muted-foreground">生成视频</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-muted-foreground" />
                    <code className="bg-muted px-2 py-1 rounded">
                      projects/{'{projectId}'}/{'{episodeId}'}/audios/
                    </code>
                    <span className="text-muted-foreground">配音音频</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="other">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>剪映专业版</CardTitle>
                <CardDescription>配置剪映软件路径，用于导出样片审阅草稿</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">可执行文件路径</label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={capcutPath}
                      placeholder="未配置，将自动检测常见路径"
                      readOnly
                      className="flex-1"
                    />
                    <Button variant="outline" onClick={handleSelectCapcutPath}>
                      <FolderOpen className="w-4 h-4 mr-2" />
                      选择
                    </Button>
                    {capcutPath && (
                      <Button variant="ghost" size="icon" onClick={handleClearCapcutPath}>
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    例如：C:\Program Files\JianyingPro\JianyingPro.exe
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>数据存储</CardTitle>
                <CardDescription>管理应用数据</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">缓存大小</label>
                  <div className="flex items-center gap-4">
                    <span className="text-muted-foreground">{cacheSize}</span>
                    <Button variant="outline" size="sm" onClick={handleClearCache}>
                      <Trash className="w-4 h-4 mr-2" />
                      清理缓存
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>设置导入导出</CardTitle>
                <CardDescription>备份和恢复设置</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleExportSettings} className="gap-2">
                    <Globe className="w-4 h-4" />
                    导出设置
                  </Button>
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportSettings}
                      className="hidden"
                    />
                    <Button variant="outline" className="gap-2 pointer-events-none">
                      <FolderOpen className="w-4 h-4" />
                      导入设置
                    </Button>
                  </label>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
