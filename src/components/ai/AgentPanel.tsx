import { useState, useCallback, useRef, useEffect } from 'react'
import { Wand2, Loader2, Image, Video, Music, MessageSquare, CheckCircle, AlertCircle, Play, Square, ChevronRight, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { createAgentController } from '@/services/agent/agentController'
import { vendorConfigService } from '@/services/vendor/configService'
import type { AgentState, ParsedIntent, TaskGraph } from '@/services/agent/types'
import type { VendorConfig } from '@/services/vendor/types'

type Step = 'model-select' | 'input' | 'executing'

export function AgentPanel() {
  const [step, setStep] = useState<Step>('model-select')
  const [input, setInput] = useState('')
  const [parsedIntent, setParsedIntent] = useState<ParsedIntent | null>(null)
  const [vendors, setVendors] = useState<VendorConfig[]>([])
  const [selectedImageModel, setSelectedImageModel] = useState('')
  const [selectedVideoModel, setSelectedVideoModel] = useState('')
  const [selectedAudioModel, setSelectedAudioModel] = useState('')
  const [selectedTextModel, setSelectedTextModel] = useState('')
  
  const [state, setState] = useState<AgentState>({
    phase: 'idle',
    progress: 0,
    message: '描述你的创作需求，AI 将自动完成创作...',
  })
  const [results, setResults] = useState<string[]>([])
  const controllerRef = useRef<ReturnType<typeof createAgentController> | null>(null)

  // 加载已启用的供应商
  useEffect(() => {
    const loadVendors = async () => {
      const allVendors = await vendorConfigService.getAllVendors()
      const enabledVendors = allVendors.filter(v => v.enable)
      setVendors(enabledVendors)
    }
    loadVendors()
  }, [])

  // 进入输入需求步骤
  const handleModelSelectNext = useCallback(() => {
    setStep('input')
  }, [])

  // 解析需求并开始创作
  const handleStart = useCallback(async () => {
    if (!input.trim()) return

    setStep('executing')
    setResults([])
    
    // 解析需求
    const { parseIntent } = await import('@/services/agent/intentParser')
    const intent = await parseIntent(input)
    setParsedIntent(intent)
    
    // 根据解析的类型选择模型
    const modelConfig: Record<string, string> = {}
    if (intent.type === 'mixed') {
      modelConfig.textModel = selectedTextModel
    }
    if (intent.type === 'image' || intent.type === 'mixed') {
      modelConfig.imageModel = selectedImageModel
    }
    if (intent.type === 'video' || intent.type === 'mixed') {
      modelConfig.videoModel = selectedVideoModel
      // 视频创作需要先生成关键帧图片，所以需要图片模型
      if (selectedImageModel) {
        modelConfig.imageModel = selectedImageModel
      }
    }
    if (intent.type === 'audio' || intent.type === 'mixed') {
      modelConfig.audioModel = selectedAudioModel
    }
    
    // 创建控制器
    controllerRef.current = createAgentController(modelConfig, (newState) => {
      setState(newState)
      
      // 收集完成的任务输出
      if (newState.taskGraph) {
        const outputs = newState.taskGraph.nodes
          .filter(n => n.status === 'completed' && n.output)
          .map(n => n.output!)
        setResults(outputs)
      }
    })

    try {
      await controllerRef.current.start(input)
    } catch (error) {
      console.error('Agent 创作失败:', error)
    }
  }, [input, selectedTextModel, selectedImageModel, selectedVideoModel, selectedAudioModel])

  const handleStop = useCallback(() => {
    controllerRef.current?.stop()
  }, [])

  const isRunning = state.phase !== 'idle' && state.phase !== 'completed' && state.phase !== 'failed'

  // 获取指定类型的可用模型
  const getModelsByType = (type: 'image' | 'video' | 'audio' | 'text') => {
    const models: { vendorId: string; model: { name: string; modelName: string; type: string } }[] = []
    vendors.forEach(vendor => {
      vendor.models
        .filter(m => m.type === type)
        .forEach(m => models.push({ vendorId: vendor.id, model: m }))
    })
    return models
  }

  // 渲染步骤指示器
  const renderStepIndicator = () => (
    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
      <span className={cn("px-2 py-1 rounded", step === 'model-select' && "bg-primary text-primary-foreground")}>1. 选择模型</span>
      <ChevronRight className="h-4 w-4" />
      <span className={cn("px-2 py-1 rounded", step === 'input' && "bg-primary text-primary-foreground")}>2. 输入需求</span>
      <ChevronRight className="h-4 w-4" />
      <span className={cn("px-2 py-1 rounded", step === 'executing' && "bg-primary text-primary-foreground")}>3. 执行创作</span>
    </div>
  )

  // 渲染模型选择步骤（第一步）
  const renderModelSelectStep = () => {
    const imageModels = getModelsByType('image')
    const videoModels = getModelsByType('video')
    const audioModels = getModelsByType('audio')
    const textModels = getModelsByType('text')
    
    return (
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">
          请选择创作可能用到的模型（Agent 会根据需求自动选择合适的类型）
        </div>
        
        {/* 文本模型选择 */}
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            文本生成模型
          </label>
          <select
            value={selectedTextModel}
            onChange={(e) => setSelectedTextModel(e.target.value)}
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">不选择 / 请选择文本模型</option>
            {textModels.map(({ vendorId, model }) => (
              <option key={`${vendorId}:${model.modelName}`} value={`${vendorId}:${model.modelName}`}>
                {model.name} ({vendorId})
              </option>
            ))}
          </select>
        </div>
        
        {/* 图片模型选择 */}
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <Image className="h-4 w-4" />
            图片生成模型
          </label>
          <select
            value={selectedImageModel}
            onChange={(e) => setSelectedImageModel(e.target.value)}
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">不选择 / 请选择图片模型</option>
            {imageModels.map(({ vendorId, model }) => (
              <option key={`${vendorId}:${model.modelName}`} value={`${vendorId}:${model.modelName}`}>
                {model.name} ({vendorId})
              </option>
            ))}
          </select>
        </div>
        
        {/* 视频模型选择 */}
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <Video className="h-4 w-4" />
            视频生成模型
          </label>
          <select
            value={selectedVideoModel}
            onChange={(e) => setSelectedVideoModel(e.target.value)}
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">不选择 / 请选择视频模型</option>
            {videoModels.map(({ vendorId, model }) => (
              <option key={`${vendorId}:${model.modelName}`} value={`${vendorId}:${model.modelName}`}>
                {model.name} ({vendorId})
              </option>
            ))}
          </select>
        </div>
        
        {/* 音频模型选择 */}
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <Music className="h-4 w-4" />
            音频生成模型
          </label>
          <select
            value={selectedAudioModel}
            onChange={(e) => setSelectedAudioModel(e.target.value)}
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">不选择 / 请选择音频模型</option>
            {audioModels.map(({ vendorId, model }) => (
              <option key={`${vendorId}:${model.modelName}`} value={`${vendorId}:${model.modelName}`}>
                {model.name} ({vendorId})
              </option>
            ))}
          </select>
        </div>
        
        {/* 没有可用模型的提示 */}
        {textModels.length === 0 && imageModels.length === 0 && videoModels.length === 0 && audioModels.length === 0 && (
          <div className="p-3 bg-yellow-500/10 text-yellow-700 rounded-lg text-sm">
            警告：没有检测到可用的模型。请先前往「设置 → 供应商配置」启用并配置相应的供应商。
          </div>
        )}
        
        {/* 提示信息 */}
        {selectedVideoModel && !selectedImageModel && (
          <div className="p-3 bg-blue-500/10 text-blue-700 rounded-lg text-sm">
            提示：视频创作需要生成关键帧图片，建议同时选择图片模型以获得更好的效果
          </div>
        )}
        
        <Button
          onClick={handleModelSelectNext}
          disabled={!selectedTextModel && !selectedImageModel && !selectedVideoModel && !selectedAudioModel}
          className="w-full"
        >
          <ChevronRight className="h-4 w-4 mr-2" />
          下一步：输入需求
        </Button>
      </div>
    )
  }

  // 渲染输入需求步骤（第二步）
  const renderInputStep = () => (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        已选择的模型：
        {selectedTextModel && <span className="mr-2">💬 文本</span>}
        {selectedImageModel && <span className="mr-2">📷 图片</span>}
        {selectedVideoModel && <span className="mr-2">🎬 视频</span>}
        {selectedAudioModel && <span>🎵 音频</span>}
      </div>
      
      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={`描述你的创作需求，例如：
做一套汉服电商海报，包含模特展示、细节特写、场景搭配
或者：做一个古风仙侠短视频，女主在桃花林舞剑，氛围感拉满`}
        className="min-h-[120px] resize-none"
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Agent 会根据需求自动规划任务流程</span>
        <span>{input.length} 字</span>
      </div>
      
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => setStep('model-select')}
          className="flex-1"
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          返回修改模型
        </Button>
        <Button
          onClick={handleStart}
          disabled={!input.trim()}
          className="flex-1"
        >
          <Play className="h-4 w-4 mr-2" />
          开始创作
        </Button>
      </div>
    </div>
  )

  // 渲染执行步骤（进度展示）
  const renderExecutingStep = () => (
    <div className="space-y-4">
      {/* 进度条 */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium">{state.message}</span>
          <span className="text-muted-foreground">{state.progress}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-500",
              state.phase === 'failed' ? 'bg-destructive' : 'bg-primary'
            )}
            style={{ width: `${state.progress}%` }}
          />
        </div>
      </div>

      {/* 阶段指示器 */}
      <div className="flex justify-between text-xs">
        {[
          { key: 'parsing', label: '解析需求', icon: Wand2 },
          { key: 'planning', label: '规划任务', icon: CheckCircle },
          { key: 'executing', label: '执行创作', icon: Loader2 },
          { key: 'completed', label: '完成', icon: CheckCircle },
        ].map((phase) => {
          const isActive = state.phase === phase.key
          const isPast = ['parsing', 'planning', 'executing', 'completed'].indexOf(state.phase) > 
            ['parsing', 'planning', 'executing', 'completed'].indexOf(phase.key)
          
          return (
            <div
              key={phase.key}
              className={cn(
                "flex items-center gap-1",
                isActive && "text-primary font-medium",
                isPast && "text-muted-foreground"
              )}
            >
              <phase.icon className={cn(
                "h-3 w-3",
                isActive && "animate-spin"
              )} />
              <span>{phase.label}</span>
            </div>
          )
        })}
      </div>

      {/* 任务图展示 */}
      {state.taskGraph && (
        <TaskGraphDisplay graph={state.taskGraph} currentTaskId={state.currentTaskId} />
      )}

      {/* 停止按钮 */}
      {isRunning && (
        <Button onClick={handleStop} variant="destructive" className="w-full">
          <Square className="h-4 w-4 mr-2" />
          停止创作
        </Button>
      )}

      {/* 结果展示 */}
      {results.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">创作结果</h4>
          <div className="grid grid-cols-2 gap-2">
            {results.map((url, index) => (
              <div
                key={index}
                className="aspect-video bg-muted rounded-lg overflow-hidden relative group"
              >
                <img
                  src={url}
                  alt={`结果 ${index + 1}`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button size="sm" variant="secondary">
                    使用
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wand2 className="h-5 w-5 text-primary" />
          AI 智能创作助手
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 步骤指示器 */}
        {renderStepIndicator()}
        
        {/* 根据步骤渲染不同内容 */}
        {step === 'model-select' && renderModelSelectStep()}
        {step === 'input' && renderInputStep()}
        {step === 'executing' && renderExecutingStep()}
      </CardContent>
    </Card>
  )
}

/**
 * 解析结果展示
 */
function IntentDisplay({ intent }: { intent: ParsedIntent }) {
  const typeIcons = {
    image: Image,
    video: Video,
    audio: Music,
    mixed: Wand2,
  }
  
  const Icon = typeIcons[intent.type]

  return (
    <div className="p-3 bg-muted rounded-lg space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4" />
        <span>已识别创作需求</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div><span className="text-muted-foreground">类型：</span>{intent.type === 'image' ? '图片' : intent.type === 'video' ? '视频' : '音频'}</div>
        <div><span className="text-muted-foreground">风格：</span>{intent.style}</div>
        <div><span className="text-muted-foreground">比例：</span>{intent.aspectRatio}</div>
        <div><span className="text-muted-foreground">数量：</span>{intent.outputCount} 张</div>
        {intent.subject && <div className="col-span-2"><span className="text-muted-foreground">主体：</span>{intent.subject}</div>}
        {intent.scene && <div className="col-span-2"><span className="text-muted-foreground">场景：</span>{intent.scene}</div>}
      </div>
    </div>
  )
}

/**
 * 任务图展示
 */
function TaskGraphDisplay({ graph, currentTaskId }: { graph: TaskGraph; currentTaskId?: string }) {
  return (
    <div className="p-3 bg-muted rounded-lg space-y-2">
      <div className="text-sm font-medium">任务规划</div>
      <div className="space-y-1">
        {graph.nodes.map((node) => (
          <div
            key={node.id}
            className={cn(
              "flex items-center gap-2 text-xs p-1.5 rounded",
              node.status === 'completed' && "bg-green-500/20 text-green-700",
              node.status === 'running' && "bg-blue-500/20 text-blue-700",
              node.status === 'failed' && "bg-red-500/20 text-red-700",
              node.status === 'pending' && "bg-muted-foreground/10",
              node.id === currentTaskId && "ring-1 ring-primary"
            )}
          >
            {node.status === 'completed' && <CheckCircle className="h-3 w-3" />}
            {node.status === 'running' && <Loader2 className="h-3 w-3 animate-spin" />}
            {node.status === 'failed' && <AlertCircle className="h-3 w-3" />}
            {node.status === 'pending' && <div className="h-3 w-3 rounded-full border border-muted-foreground/30" />}
            <span className="flex-1">{node.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
