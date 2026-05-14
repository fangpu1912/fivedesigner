import { useState, useEffect, useRef, useCallback } from 'react'

import { Volume2, Pause, RotateCcw, Settings, BookOpen } from 'lucide-react'

import { useUIStore } from '@/store/useUIStore'

import { VendorModelSelector } from '@/components/ai/VendorModelSelector'
import { ComfyUIParamsPanel, type ComfyUIParams } from '@/components/ai/ComfyUIParamsPanel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { TTSConfig, TTSVoice } from '@/hooks/useTTS'
import { ComfyUIClient } from '@/services/comfyui/ComfyUIClient'
import { getComfyUIServerUrl } from '@/services/configService'
import { getWorkflowConfigs } from '@/services/workflowConfigService'
import type { WorkflowConfig, Character, Project } from '@/types'

type GenerationMode = 'ai' | 'comfyui'

type AudioProviderType = 'openai' | 'azure' | 'elevenlabs' | 'volcengine' | 'minimax' | 'comfyui'

function _normalizeAudioProvider(provider: string): AudioProviderType {
  if (provider === 'hailuo') return 'minimax'
  if (
    provider === 'openai' ||
    provider === 'azure' ||
    provider === 'elevenlabs' ||
    provider === 'volcengine' ||
    provider === 'minimax' ||
    provider === 'comfyui'
  ) {
    return provider as AudioProviderType
  }
  return 'minimax'
}

interface DubbingConfigPanelProps {
  config: TTSConfig
  characters: Character[]
  voices: TTSVoice[]
  project?: Project | null
  generationMode?: GenerationMode
  comfyuiWorkflows?: WorkflowConfig[]
  selectedWorkflowId?: string
  comfyuiConnected?: boolean
  comfyUIParams?: ComfyUIParams
  onConfigChange: (updates: Partial<TTSConfig>) => void
  onResetConfig: () => void
  onGenerationModeChange?: (mode: GenerationMode) => void
  onWorkflowChange?: (workflowId: string) => void
  onWorkflowParamsChange?: (params: ComfyUIParams) => void
  getComfyUIParamsRef?: React.MutableRefObject<(() => ComfyUIParams) | null>
}

export function DubbingConfigPanel({
  config,
  characters: _characters,
  voices,
  project,
  generationMode: externalGenerationMode,
  comfyuiWorkflows: externalWorkflows,
  selectedWorkflowId: externalWorkflowId,
  comfyuiConnected: externalConnected,
  comfyUIParams: externalParams,
  onConfigChange,
  onResetConfig,
  onGenerationModeChange,
  onWorkflowChange,
  onWorkflowParamsChange,
  getComfyUIParamsRef: externalGetParamsRef,
}: DubbingConfigPanelProps) {
  const currentEpisodeId = useUIStore(state => state.currentEpisodeId)
  const [activeTab, setActiveTab] = useState<'config' | 'progress'>('config')
  const [internalGenerationMode, setInternalGenerationMode] = useState<GenerationMode>(
    config.provider === 'comfyui' ? 'comfyui' : 'ai'
  )

  // 使用外部或内部的 generationMode
  const generationMode = externalGenerationMode ?? internalGenerationMode
  const setGenerationMode = (mode: GenerationMode) => {
    setInternalGenerationMode(mode)
    onGenerationModeChange?.(mode)
  }


  // 试听功能
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const handlePreviewVoice = useCallback(async (voiceId: string) => {
    if (!voiceId) return

    try {
      // 如果点击的是当前正在播放的语音，则停止
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

      // 获取音频URL
      const voice = voices.find(v => v.id === voiceId)
      let audioUrl = voice?.preview_url

      // 如果没有preview_url但voiceId是文件路径，直接使用voiceId
      if (!audioUrl && (voiceId.includes('\\') || voiceId.includes('/'))) {
        const { getAssetUrl } = await import('@/utils/asset')
        audioUrl = getAssetUrl(voiceId) || undefined
      }

      if (!audioUrl) {
        console.warn('没有可用的音频URL')
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

      await audio.play()
    } catch (error) {
      console.error('试听失败:', error)
      setPlayingVoiceId(null)
    }
  }, [playingVoiceId, voices])

  // 组件卸载时停止播放
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])



  // ComfyUI related states - 使用外部传入的或内部的
  const [internalWorkflows, setInternalWorkflows] = useState<WorkflowConfig[]>([])
  const [internalSelectedWorkflowId, setInternalSelectedWorkflowId] = useState<string>(() => {
    if (config.provider === 'comfyui') {
      return config.voiceId || config.modelId || ''
    }
    return ''
  })
  const [internalConnected, setInternalConnected] = useState(false)
  const [internalParams, setInternalParams] = useState<ComfyUIParams>(() => config.workflowParams || {})
  const internalGetParamsRef = useRef<(() => ComfyUIParams) | null>(null)
  const comfyuiClientRef = useRef<ComfyUIClient | null>(null)

  // 使用外部或内部的 ComfyUI 状态
  const comfyuiWorkflows = externalWorkflows ?? internalWorkflows
  const selectedWorkflowId = externalWorkflowId ?? internalSelectedWorkflowId
  const comfyuiConnected = externalConnected ?? internalConnected
  const workflowParams = externalParams ?? internalParams
  const getComfyUIParamsRef = externalGetParamsRef ?? internalGetParamsRef

  const _setSelectedWorkflowId = (workflowId: string) => {
    setInternalSelectedWorkflowId(workflowId)
    onWorkflowChange?.(workflowId)
  }

  const _setWorkflowParams = (params: ComfyUIParams) => {
    setInternalParams(params)
    onWorkflowParamsChange?.(params)
  }

  // 当 config 变化时，同步 selectedWorkflowId 和 workflowParams
  useEffect(() => {
    if (config.provider === 'comfyui') {
      const workflowId = config.voiceId || config.modelId || ''
      if (workflowId && workflowId !== internalSelectedWorkflowId) {
        setInternalSelectedWorkflowId(workflowId)
      }
      if (config.workflowParams && Object.keys(config.workflowParams).length > 0) {
        setInternalParams(config.workflowParams)
      }
    }
  }, [config.provider, config.voiceId, config.modelId, config.workflowParams])

  // Initialize ComfyUI - 只在没有外部传入时初始化
  useEffect(() => {
    if (externalWorkflows) return // 如果外部传入了工作流，不需要内部加载

    const loadComfyUIWorkflows = () => {
      try {
        const workflows = getWorkflowConfigs()
        setInternalWorkflows(workflows)
      } catch (error) {
        console.error('Failed to load ComfyUI workflows:', error)
      }
    }

    const initComfyUIClient = async () => {
      try {
        const serverUrl = getComfyUIServerUrl()
        const client = new ComfyUIClient({ 
          serverUrl,
          projectId: project?.id,
          episodeId: currentEpisodeId ?? undefined,
        })
        await client.connect()
        comfyuiClientRef.current = client
        setInternalConnected(true)
      } catch (error) {
        console.error('Failed to connect to ComfyUI:', error)
        setInternalConnected(false)
      }
    }

    loadComfyUIWorkflows()
    initComfyUIClient()

    return () => {
      comfyuiClientRef.current?.disconnect()
    }
  }, [externalWorkflows])

  const handleModelChange = (vendorId: string, _modelName: string, fullValue: string) => {
    onConfigChange({
      modelId: fullValue,
      provider: vendorId,
      voiceId: fullValue,
    })
  }

  const handleWorkflowChange = (workflowId: string) => {
    setInternalSelectedWorkflowId(workflowId)
    onWorkflowChange?.(workflowId)
    // 更新 modelId 和 voiceId（ComfyUI 使用 workflowId 作为 voiceId）
    onConfigChange({
      modelId: workflowId,
      voiceId: workflowId,
      provider: 'comfyui',
      workflowParams: {},
    })
  }

  // 当工作流参数变化时，更新到配置中
  const handleWorkflowParamsChange = (params: ComfyUIParams) => {
    setInternalParams(params)
    onWorkflowParamsChange?.(params)
    onConfigChange({ workflowParams: params })
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <div className="flex items-center gap-2">
          <Button
            variant={activeTab === 'config' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('config')}
          >
            <Settings className="h-4 w-4 mr-1" />
            配置
          </Button>
          <Button
            variant={activeTab === 'progress' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('progress')}
          >
            进度
          </Button>
        </div>
      </div>

      {activeTab === 'config' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <Tabs
            value={generationMode}
            onValueChange={v => {
              const mode = v as GenerationMode
              setGenerationMode(mode)
              if (mode === 'ai' && config.provider === 'comfyui') {
                onConfigChange({ provider: 'minimax', modelId: 'speech-2.8-hd', voiceId: 'cloned' })
              } else if (mode === 'comfyui' && config.provider !== 'comfyui') {
                onConfigChange({ provider: 'comfyui' })
              }
            }}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="ai">AI 生成</TabsTrigger>
              <TabsTrigger value="comfyui">
                ComfyUI
                {!comfyuiConnected && (
                  <span className="ml-2 text-xs text-destructive">(未连接)</span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="ai" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">TTS 模型</CardTitle>
                </CardHeader>
                <CardContent>
                  <VendorModelSelector
                    type="tts"
                    value={config.modelId}
                    onChange={handleModelChange}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">语音参数</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm">语速</label>
                      <span className="text-sm text-muted-foreground">
                        {config.speed.toFixed(1)}x
                      </span>
                    </div>
                    <Input
                      type="range"
                      min="0.5"
                      max="2"
                      step="0.1"
                      value={config.speed}
                      onChange={e => onConfigChange({ speed: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>慢</span>
                      <span>正常</span>
                      <span>快</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm">音调</label>
                      <span className="text-sm text-muted-foreground">
                        {config.pitch.toFixed(1)}
                      </span>
                    </div>
                    <Input
                      type="range"
                      min="0.5"
                      max="2"
                      step="0.1"
                      value={config.pitch}
                      onChange={e => onConfigChange({ pitch: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>低</span>
                      <span>正常</span>
                      <span>高</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm">音量</label>
                      <span className="text-sm text-muted-foreground">
                        {Math.round(config.volume * 100)}%
                      </span>
                    </div>
                    <Input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={config.volume}
                      onChange={e => onConfigChange({ volume: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>静音</span>
                      <span>正常</span>
                      <span>最大</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Button variant="outline" className="w-full" onClick={onResetConfig}>
                <RotateCcw className="h-4 w-4 mr-2" />
                重置配置
              </Button>
            </TabsContent>

            <TabsContent value="comfyui" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">ComfyUI 工作流</CardTitle>
                </CardHeader>
                <CardContent>
                  <select
                    value={selectedWorkflowId}
                    onChange={e => handleWorkflowChange(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    disabled={!comfyuiConnected}
                  >
                    <option value="">选择工作流...</option>
                    {comfyuiWorkflows.map(workflow => (
                      <option key={workflow.id} value={workflow.id}>
                        {workflow.name}
                      </option>
                    ))}
                  </select>
                </CardContent>
              </Card>

              {selectedWorkflowId && (
                <ComfyUIParamsPanel
                  workflow={comfyuiWorkflows.find(w => w.id === selectedWorkflowId) || null}
                  params={workflowParams}
                  project={project}
                  onChange={handleWorkflowParamsChange}
                  onParamsReady={(getParams) => {
                    if (getComfyUIParamsRef) {
                      getComfyUIParamsRef.current = getParams
                    }
                  }}
                />
              )}

              <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                <p>使用 ComfyUI 工作流进行语音合成，支持 IndexTTS 等高级 TTS 模型。</p>
              </div>
            </TabsContent>
          </Tabs>

          {/* 旁白配置 - AI 和 ComfyUI 共用 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                旁白配置
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  参考音频
                </label>
                <div className="flex gap-2">
                  <select
                    value={config.narration?.voiceId || ''}
                    onChange={e =>
                      onConfigChange({
                        narration: {
                          ...config.narration,
                          voiceId: e.target.value || undefined,
                        },
                      })
                    }
                    className="flex-1 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">
                      使用默认音色
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
                          {voice.name} ({voice.language})
                        </option>
                      ))}
                  </select>
                  {config.narration?.voiceId && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handlePreviewVoice(config.narration?.voiceId || '')}
                      title="试听参考音频"
                    >
                      {playingVoiceId === config.narration?.voiceId ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Volume2 className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  选择本地音频文件作为声音克隆的参考音频（时长10秒-5分钟，支持mp3、m4a、wav格式）
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">旁白情绪</label>
                <select
                  value={config.narration?.emotion || '平静'}
                  onChange={e =>
                    onConfigChange({
                      narration: {
                        ...config.narration,
                        emotion: e.target.value,
                      },
                    })
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="默认">默认</option>
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
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">旁白配音提示词</label>
                <Textarea
                  placeholder="描述旁白的语气风格，如：沉稳的旁白声音，清晰流畅，带有神秘感"
                  value={config.narration?.audioPrompt || ''}
                  onChange={e =>
                    onConfigChange({
                      narration: {
                        ...config.narration,
                        audioPrompt: e.target.value,
                      },
                    })
                  }
                  className="min-h-[80px] resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  描述旁白的语气风格，将应用到所有旁白配音
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'progress' && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Volume2 className="h-12 w-12 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">任务队列功能已移除</p>
            <p className="text-xs text-muted-foreground mt-1">请在分镜绘制页面查看生成进度</p>
          </div>
        </div>
      )}
    </div>
  )
}
