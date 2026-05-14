import type { NodeDefinition, CanvasNodeType } from '../types'
import { CANVAS_NODE_TYPES, DEFAULT_ASPECT_RATIO } from '../types'

export const nodeDefinitions: NodeDefinition[] = [
  // ==================== 输入 ====================
  {
    type: CANVAS_NODE_TYPES.upload,
    label: '上传图片',
    category: 'input',
    description: '从本地上传图片到画布',
    outputs: [{ id: 'source', name: 'source', type: 'image', label: '图片' }],
    defaultProperties: {
      imageUrl: null,
      previewImageUrl: null,
      aspectRatio: DEFAULT_ASPECT_RATIO,
      sourceFileName: null,
    },
  },
  {
    type: CANVAS_NODE_TYPES.videoUpload,
    label: '上传视频',
    category: 'input',
    description: '从本地上传视频，支持帧提取',
    outputs: [
      { id: 'video', name: 'video', type: 'data', label: '视频' },
      { id: 'frames', name: 'frames', type: 'image', label: '提取帧' },
    ],
    defaultProperties: {
      videoUrl: null,
      sourceFileName: null,
      duration: 0,
      frameRate: 30,
      width: 0,
      height: 0,
      extractedFrames: [],
    },
  },
  {
    type: CANVAS_NODE_TYPES.audioUpload,
    label: '上传音频',
    category: 'input',
    description: '从本地上传音频文件',
    outputs: [
      { id: 'audio', name: 'audio', type: 'data', label: '音频' },
    ],
    defaultProperties: {
      audioUrl: null,
      sourceFileName: null,
      duration: 0,
      sampleRate: 44100,
      waveformData: [],
    },
  },
  {
    type: CANVAS_NODE_TYPES.textAnnotation,
    label: '文本标注',
    category: 'input',
    description: '添加文本标注，可连接下游节点传递文本内容',
    inputs: [
      { id: 'text', name: 'text', type: 'data', label: '输入文本', required: false },
    ],
    outputs: [
      { id: 'text', name: 'text', type: 'data', label: '输出文本' },
    ],
    defaultProperties: {
      content: '',
    },
  },
  {
    type: CANVAS_NODE_TYPES.blankImage,
    label: '空白图',
    category: 'input',
    description: '生成指定比例和分辨率的空白图',
    outputs: [{ id: 'source', name: 'source', type: 'image', label: '图片' }],
    defaultProperties: {
      imageUrl: null,
      previewImageUrl: null,
      gridRows: 2,
      gridCols: 2,
      aspectRatio: DEFAULT_ASPECT_RATIO,
      size: '1K',
      width: 0,
      height: 0,
    },
  },

  // ==================== 图片生成 ====================
  {
    type: CANVAS_NODE_TYPES.imageEdit,
    label: '图片生成',
    category: 'image',
    description: '使用AI模型生成图片，支持文生图和图生图',
    inputs: [
      { id: 'target', name: 'target', type: 'image', label: '参考图', required: false },
    ],
    outputs: [{ id: 'source', name: 'source', type: 'image', label: '图片' }],
    defaultProperties: {
      imageUrl: null,
      previewImageUrl: null,
      aspectRatio: DEFAULT_ASPECT_RATIO,
      prompt: '',
      model: '',
      size: '1K',
      requestAspectRatio: 'auto',
      extraParams: {},
      isGenerating: false,
      generationStartedAt: null,
      generationDurationMs: 0,
    },
  },
  {
    type: CANVAS_NODE_TYPES.aiImageEdit,
    label: '图片编辑',
    category: 'image',
    description: '使用AI编辑图片，支持参考图、蒙版和局部重绘',
    inputs: [
      { id: 'target', name: 'target', type: 'image', label: '原图', required: true },
    ],
    outputs: [{ id: 'source', name: 'source', type: 'image', label: '编辑结果' }],
    defaultProperties: {
      imageUrl: null,
      previewImageUrl: null,
      aspectRatio: DEFAULT_ASPECT_RATIO,
      prompt: '',
      model: '',
      referenceImages: [],
      maskImage: null,
      brushSize: 30,
      isGenerating: false,
      generationStartedAt: null,
      generationDurationMs: 0,
      generationError: '',
    },
  },
  {
    type: CANVAS_NODE_TYPES.upscale,
    label: '图片放大',
    category: 'image',
    description: '使用AI超分或高质量插值算法放大图片',
    inputs: [
      { id: 'target', name: 'target', type: 'image', label: '图片', required: true },
    ],
    outputs: [{ id: 'source', name: 'source', type: 'image', label: '放大结果' }],
    defaultProperties: {
      imageUrl: null,
      scale: 2,
      model: 'bicubic',
      isProcessing: false,
      progress: 0,
    },
  },
  {
    type: CANVAS_NODE_TYPES.imageToPrompt,
    label: '图片反推',
    category: 'image',
    description: '使用AI分析图片，反推出生成提示词',
    inputs: [
      { id: 'target', name: 'target', type: 'image', label: '图片', required: false },
    ],
    outputs: [
      { id: 'prompt', name: 'prompt', type: 'data', label: '提示词' },
    ],
    defaultProperties: {
      imageUrl: null,
      promptZh: '',
      promptEn: '',
      tags: [],
      jsonResult: {},
      isAnalyzing: false,
    },
  },
  {
    type: CANVAS_NODE_TYPES.imageCompare,
    label: '图片对比',
    category: 'image',
    description: '左右滑动对比两张图片（Before/After）',
    inputs: [
      { id: 'left', name: 'left', type: 'image', label: 'Before', required: false },
      { id: 'right', name: 'right', type: 'image', label: 'After', required: false },
    ],
    outputs: [],
    defaultProperties: {
      imageUrl: null,
      videoUrl: null,
    },
  },

  // ==================== 视频生成 ====================
  {
    type: CANVAS_NODE_TYPES.videoGen,
    label: '视频生成',
    category: 'video',
    description: '图生视频，支持多种AI模型',
    inputs: [
      { id: 'input', name: 'input', type: 'data', label: '数据输入', required: true },
    ],
    outputs: [
      { id: 'videos', name: 'videos', type: 'data', label: '视频数据' },
    ],
    defaultProperties: {
      items: [],
      model: '',
      duration: 5,
      generateAudio: true,
      isRunning: false,
      currentIndex: 0,
    },
  },

  // ==================== 分镜 ====================
  {
    type: CANVAS_NODE_TYPES.storyboardSplit,
    label: '分镜拆分',
    category: 'storyboard',
    description: '将图片拆分为网格分镜',
    inputs: [
      { id: 'target', name: 'target', type: 'image', label: '图片', required: true },
    ],
    outputs: [{ id: 'source', name: 'source', type: 'image', label: '分镜' }],
    defaultProperties: {
      gridRows: 2,
      gridCols: 2,
      frames: [],
    },
  },
  {
    type: CANVAS_NODE_TYPES.sceneDirector,
    label: '场景编排',
    category: 'storyboard',
    description: '在360°全景场景中布置人物，调整相机角度截图',
    inputs: [
      { id: 'target', name: 'target', type: 'image', label: '全景图', required: false },
    ],
    outputs: [{ id: 'source', name: 'source', type: 'image', label: '截图' }],
    defaultProperties: {
      panoramaUrl: null,
      imageUrl: null,
      characters: [],
      camera: {
        position: { x: 0, y: 5, z: 10 },
        target: { x: 0, y: 0, z: 0 },
        fov: 50,
      },
      screenshots: [],
      gridSize: 50,
      showGrid: true,
    },
  },
]

export const nodeCategories = [
  { id: 'input', label: '输入', color: '#52c41a' },
  { id: 'image', label: '图片', color: '#1890ff' },
  { id: 'video', label: '视频', color: '#f5222d' },
  { id: 'storyboard', label: '分镜', color: '#722ed1' },
]

export function getNodeDefinition(type: CanvasNodeType): NodeDefinition | undefined {
  return nodeDefinitions.find(def => def.type === type)
}

export function getDefaultNodeProperties(type: CanvasNodeType): Record<string, unknown> {
  const def = getNodeDefinition(type)
  return def?.defaultProperties || {}
}

export function createDefaultFrames(rows: number, cols: number) {
  const frames = []
  for (let i = 0; i < rows * cols; i++) {
    frames.push({
      id: `frame-${Date.now()}-${i}`,
      imageUrl: null,
      previewImageUrl: null,
      note: '',
      order: i,
    })
  }
  return frames
}

export function getDefaultNodeDimensions(type: CanvasNodeType) {
  const defaults: Record<CanvasNodeType, { width: number; height: number }> = {
    [CANVAS_NODE_TYPES.upload]: { width: 280, height: 280 },
    [CANVAS_NODE_TYPES.imageEdit]: { width: 320, height: 400 },
    [CANVAS_NODE_TYPES.aiImageEdit]: { width: 280, height: 200 },
    [CANVAS_NODE_TYPES.textAnnotation]: { width: 200, height: 120 },
    [CANVAS_NODE_TYPES.blankImage]: { width: 260, height: 340 },
    [CANVAS_NODE_TYPES.storyboardSplit]: { width: 318, height: 320 },
    [CANVAS_NODE_TYPES.sceneDirector]: { width: 360, height: 400 },
    [CANVAS_NODE_TYPES.upscale]: { width: 260, height: 380 },
    [CANVAS_NODE_TYPES.videoGen]: { width: 400, height: 500 },
    [CANVAS_NODE_TYPES.videoUpload]: { width: 320, height: 260 },
    [CANVAS_NODE_TYPES.audioUpload]: { width: 280, height: 140 },
    [CANVAS_NODE_TYPES.imageToPrompt]: { width: 360, height: 420 },
    [CANVAS_NODE_TYPES.imageCompare]: { width: 320, height: 280 },
  }
  return defaults[type]
}

export function generateNodeId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export function generateEdgeId(source: string, target: string): string {
  return `edge_${source}_${target}_${Date.now()}`
}

export const NODE_HANDLES: Record<string, { source: string[]; target: string[] }> = {
  [CANVAS_NODE_TYPES.upload]: { source: ['source'], target: ['target'] },
  [CANVAS_NODE_TYPES.imageEdit]: { source: ['source'], target: ['target'] },
  [CANVAS_NODE_TYPES.aiImageEdit]: { source: ['source'], target: ['target'] },
  [CANVAS_NODE_TYPES.textAnnotation]: { source: ['text'], target: ['text'] },
  [CANVAS_NODE_TYPES.blankImage]: { source: ['source'], target: ['target'] },
  [CANVAS_NODE_TYPES.storyboardSplit]: { source: ['source'], target: ['target'] },
  [CANVAS_NODE_TYPES.sceneDirector]: { source: ['source'], target: ['target'] },
  [CANVAS_NODE_TYPES.upscale]: { source: ['source'], target: ['target'] },
  [CANVAS_NODE_TYPES.videoGen]: { source: ['videos'], target: ['input'] },
  [CANVAS_NODE_TYPES.videoUpload]: { source: ['video'], target: ['target'] },
  [CANVAS_NODE_TYPES.audioUpload]: { source: ['audio'], target: ['target'] },
  [CANVAS_NODE_TYPES.imageToPrompt]: { source: ['prompt'], target: ['target'] },
  [CANVAS_NODE_TYPES.imageCompare]: { source: [], target: ['left', 'right'] },
}

export function isValidEdge(
  edge: { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null },
  nodeTypes: Map<string, string | undefined>
): boolean {
  const sourceType = nodeTypes.get(edge.source)
  const targetType = nodeTypes.get(edge.target)
  if (!sourceType || !targetType) return false

  const sourceHandles = NODE_HANDLES[sourceType]
  const targetHandles = NODE_HANDLES[targetType]
  if (!sourceHandles || !targetHandles) return true

  if (edge.sourceHandle && !sourceHandles.source.includes(edge.sourceHandle)) return false
  if (edge.targetHandle && !targetHandles.target.includes(edge.targetHandle)) return false

  return true
}

export const autoConnectRules: Array<{
  sourceType: CanvasNodeType
  sourceHandle: string
  targetType: CanvasNodeType
  targetHandle: string
}> = []

export function getAutoConnectEdges(
  newNodeId: string,
  newNodeType: CanvasNodeType,
  existingNodes: Array<{ id: string; type: string }>,
  existingEdges: Array<{ source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }>,
): Array<{ source: string; target: string; sourceHandle: string; targetHandle: string }> {
  const newEdges: Array<{ source: string; target: string; sourceHandle: string; targetHandle: string }> = []

  for (const rule of autoConnectRules) {
    if (rule.targetType === newNodeType) {
      const sourceNode = existingNodes.find(n => n.type === rule.sourceType && n.id !== newNodeId)
      if (!sourceNode) continue

      const alreadyConnected = existingEdges.some(
        e => e.source === sourceNode.id && e.target === newNodeId && e.sourceHandle === rule.sourceHandle && e.targetHandle === rule.targetHandle
      )
      if (alreadyConnected) continue

      const targetPortOccupied = existingEdges.some(
        e => e.target === newNodeId && e.targetHandle === rule.targetHandle
      ) || newEdges.some(e => e.target === newNodeId && e.targetHandle === rule.targetHandle)
      if (targetPortOccupied) continue

      newEdges.push({
        source: sourceNode.id,
        target: newNodeId,
        sourceHandle: rule.sourceHandle,
        targetHandle: rule.targetHandle,
      })
    }

    if (rule.sourceType === newNodeType) {
      const targetNode = existingNodes.find(n => n.type === rule.targetType && n.id !== newNodeId)
      if (!targetNode) continue

      const alreadyConnected = existingEdges.some(
        e => e.source === newNodeId && e.target === targetNode.id && e.sourceHandle === rule.sourceHandle && e.targetHandle === rule.targetHandle
      )
      if (alreadyConnected) continue

      const targetPortOccupied = existingEdges.some(
        e => e.target === targetNode.id && e.targetHandle === rule.targetHandle
      ) || newEdges.some(e => e.target === targetNode.id && e.targetHandle === rule.targetHandle)
      if (targetPortOccupied) continue

      newEdges.push({
        source: newNodeId,
        target: targetNode.id,
        sourceHandle: rule.sourceHandle,
        targetHandle: rule.targetHandle,
      })
    }
  }

  return newEdges
}
