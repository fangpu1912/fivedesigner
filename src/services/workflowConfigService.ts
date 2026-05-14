import { type WorkflowConfig } from '@/types'

const WORKFLOW_CONFIGS_KEY = 'workflow_configs'

export function getWorkflowConfigs(): WorkflowConfig[] {
  const stored = localStorage.getItem(WORKFLOW_CONFIGS_KEY)
  return stored ? JSON.parse(stored) : []
}

export function getWorkflowConfigByType(type: string): WorkflowConfig | undefined {
  const configs = getWorkflowConfigs()
  return configs.find(c => c.type === type)
}

export function saveWorkflowConfig(config: WorkflowConfig): void {
  const configs = getWorkflowConfigs()
  const index = configs.findIndex(c => c.id === config.id)

  if (index >= 0) {
    configs[index] = config
  } else {
    configs.push(config)
  }

  localStorage.setItem(WORKFLOW_CONFIGS_KEY, JSON.stringify(configs))
}

export function deleteWorkflowConfig(id: string): void {
  const configs = getWorkflowConfigs()
  const filtered = configs.filter(c => c.id !== id)
  localStorage.setItem(WORKFLOW_CONFIGS_KEY, JSON.stringify(filtered))
}

export function parseComfyUIWorkflow(json: string): {
  workflow: Record<string, unknown>
  nodes: WorkflowConfig['nodes']
} {
  const workflow = JSON.parse(json)
  const nodes: WorkflowConfig['nodes'] = {}

  // 用于追踪 CLIPTextEncode 节点的顺序
  let clipTextEncodeCount = 0

  for (const [nodeId, node] of Object.entries(workflow) as [string, any][]) {
    const classType = node.class_type?.toLowerCase() || ''

    // CLIPTextEncode 节点 - 区分正向和负向提示词
    if (classType === 'cliptextencode' || classType.includes('cliptext')) {
      clipTextEncodeCount++
      if (clipTextEncodeCount === 1) {
        // 第一个 CLIPTextEncode 通常是正向提示词
        if (!nodes.prompt) nodes.prompt = nodeId
      } else if (clipTextEncodeCount === 2) {
        // 第二个 CLIPTextEncode 通常是负向提示词
        if (!nodes.negativePrompt) nodes.negativePrompt = nodeId
      }
    }

    // Text Multiline 节点（如果还没有找到 prompt）
    if (classType === 'text multiline' && !nodes.prompt) {
      nodes.prompt = nodeId
    }

    // 图像尺寸相关节点
    if (classType.includes('emptylatentimage') || classType === 'emptylatentimage') {
      if (!nodes.width) nodes.width = nodeId
      if (!nodes.height) nodes.height = nodeId
    }
    
    // Int 节点（用于宽高、种子等数值参数）
    if (classType === 'int' || classType.includes('primitiveint')) {
      const inputName = node.inputs?.input_name?.toLowerCase() || ''
      if (!nodes.width && (inputName.includes('width') || nodeId.toLowerCase().includes('width'))) {
        nodes.width = nodeId
      }
      if (!nodes.height && (inputName.includes('height') || nodeId.toLowerCase().includes('height'))) {
        nodes.height = nodeId
      }
      if (!nodes.seed && (inputName.includes('seed') || nodeId.toLowerCase().includes('seed'))) {
        nodes.seed = nodeId
        console.log(`[parseWorkflowParams] 从 ${nodeId} (${classType}) 解析出 seed 节点 (input_name: ${inputName})`)
      }
    }
    
    // 🔑 检查所有节点的 seed 输入（不仅仅是 Int 节点）
    if (node.inputs?.seed !== undefined && !nodes.seed) {
      nodes.seed = nodeId
      console.log(`[parseWorkflowParams] 从 ${nodeId} (${classType}) 解析出 seed 节点 (inputs.seed)`)
    }
    
    // 🔑 RandomNoise 节点的 seed 输入
    if ((classType === 'randomnoise' || classType.includes('randomnoise')) && node.inputs?.seed !== undefined) {
      if (!nodes.seed) {
        nodes.seed = nodeId
        console.log(`[parseWorkflowParams] 从 ${nodeId} (${classType}) 解析出 seed 节点 (RandomNoise)`)
      }
    }

    // 种子参数（KSampler 或独立种子节点）
    if (classType.includes('seed') && !nodes.seed) {
      nodes.seed = nodeId
    }
    
    // 🔑 KSampler 节点的 seed 输入
    if ((classType === 'ksampler' || classType.includes('ksampler')) && node.inputs?.seed !== undefined) {
      if (!nodes.seed) {
        nodes.seed = nodeId
        console.log(`[parseWorkflowParams] 从 ${nodeId} (${classType}) 解析出 seed 节点`)
      }
    }
    
    // 🔑 SamplerCustomAdvanced 等其他采样器节点的 seed 输入
    if (classType.includes('sampler') && node.inputs?.seed !== undefined && !nodes.seed) {
      nodes.seed = nodeId
      console.log(`[parseWorkflowParams] 从 ${nodeId} (${classType}) 解析出 seed 节点 (sampler)`)
    }

    // 输出/保存节点
    if (classType.includes('saveimage') || classType === 'saveimage' || 
        classType.includes('output') || classType.includes('preview')) {
      if (!nodes.output) nodes.output = nodeId
    }

    // 图像输入节点（图生图）- 明确匹配
    if (classType === 'loadimage' || classType.includes('loadimage')) {
      if (!nodes.imageInput) nodes.imageInput = nodeId
    }

    // TTS/音频相关节点
    if (classType.includes('tts') || classType.includes('speech') || classType.includes('voice')) {
      if (!nodes.text) nodes.text = nodeId
      if (!nodes.voice_id) nodes.voice_id = nodeId
    }
    
    // LoadAudio 节点用于加载参考音频
    if (classType === 'loadaudio' || classType.includes('loadaudio')) {
      if (!nodes.voice_id) nodes.voice_id = nodeId
    }
    
    // 其他音频节点（非加载类型）
    if (classType.includes('audio') && !classType.includes('load')) {
      if (!nodes.text) nodes.text = nodeId
    }
    
    // 情绪参数
    if (classType.includes('emotion')) {
      if (!nodes.emotion) nodes.emotion = nodeId
    }
    
    // 语速参数
    if (classType.includes('speed') || classType.includes('rate')) {
      if (!nodes.speed) nodes.speed = nodeId
    }
  }

  return { workflow, nodes }
}
