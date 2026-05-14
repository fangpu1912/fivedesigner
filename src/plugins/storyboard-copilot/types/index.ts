// Storyboard Copilot 插件类型定义 - 集成版本
// 适配 FiveDesigner 项目数据字段和架构

// ==================== 节点类型 ====================
export const CANVAS_NODE_TYPES = {
  upload: 'uploadNode',
  imageEdit: 'imageNode',
  aiImageEdit: 'aiImageEditNode',
  textAnnotation: 'textAnnotationNode',
  blankImage: 'blankImageNode',
  storyboardSplit: 'storyboardNode',
  sceneDirector: 'sceneDirectorNode',
  upscale: 'upscaleNode',
  videoGen: 'videoGenNode',
  videoUpload: 'videoUploadNode',
  audioUpload: 'audioUploadNode',
  imageToPrompt: 'imageToPromptNode',
  imageCompare: 'imageCompareNode',
} as const

export type CanvasNodeType = (typeof CANVAS_NODE_TYPES)[keyof typeof CANVAS_NODE_TYPES]

// ==================== 基础常量 ====================
export const DEFAULT_ASPECT_RATIO = '16:9'
export const AUTO_REQUEST_ASPECT_RATIO = 'auto'
export const DEFAULT_NODE_WIDTH = 220
export const EXPORT_RESULT_NODE_DEFAULT_WIDTH = 384
export const EXPORT_RESULT_NODE_LAYOUT_HEIGHT = 288
export const IMAGE_SIZES = ['0.5K', '1K', '2K', '4K'] as const
export const IMAGE_ASPECT_RATIOS = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '21:9',
] as const

export type ImageSize = (typeof IMAGE_SIZES)[number]

// ==================== 节点数据类型 ====================
export interface NodeDisplayData {
  displayName?: string
  [key: string]: unknown
}

export interface NodeImageData extends NodeDisplayData {
  imageUrl: string | null
  previewImageUrl?: string | null
  aspectRatio: string
  isSizeManuallyAdjusted?: boolean
  [key: string]: unknown
}

// 上传节点数据
export interface UploadImageNodeData extends NodeImageData {
  sourceFileName?: string | null
}

// 空白图节点数据
export interface BlankImageNodeData extends NodeDisplayData {
  imageUrl: string | null
  previewImageUrl?: string | null
  gridRows: number
  gridCols: number
  aspectRatio: string
  size: ImageSize
  width?: number
  height?: number
}

// 文本标注节点数据
export interface TextAnnotationNodeData extends NodeDisplayData {
  content: string
  [key: string]: unknown
}

// AI图片编辑节点数据
export interface ImageEditNodeData extends NodeDisplayData {
  imageUrl: string | null
  previewImageUrl?: string | null
  aspectRatio?: string
  prompt: string
  model: string
  size: ImageSize
  requestAspectRatio?: string
  extraParams?: Record<string, unknown>
  isGenerating?: boolean
  generationStartedAt?: number | null
  generationDurationMs?: number
  annotations?: Array<{
    id: string
    type: 'rect' | 'ellipse' | 'arrow' | 'pen' | 'text'
    x: number
    y: number
    width?: number
    height?: number
    points?: number[]
    text?: string
    stroke?: string
    lineWidth?: number
    fontSize?: number
    color?: string
  }>
}

// 图片编辑节点数据（带参考图）
export interface AIImageEditNodeData extends NodeDisplayData {
  imageUrl: string | null
  previewImageUrl?: string | null
  aspectRatio?: string
  prompt: string
  model?: string
  referenceImages: string[]
  maskImage?: string | null
  brushSize: number
  isGenerating?: boolean
  generationStartedAt?: number | null
  generationDurationMs?: number
  generationError?: string
}

// ==================== 分镜相关类型 ====================
// 分镜帧
export interface StoryboardFrameItem {
  id: string
  imageUrl: string | null
  previewImageUrl?: string | null
  aspectRatio?: string
  note: string
  order: number
}

// 分镜拆分节点数据
export interface StoryboardSplitNodeData extends NodeDisplayData {
  gridRows: number
  gridCols: number
  gap?: number
  frames: StoryboardFrameItem[]
  _executeTrigger?: number
  inputImageUrl?: string
  inputFrames?: StoryboardFrameItem[]
  mergedImageUrl?: string
  outputImageUrl?: string
  _outputTrigger?: number
  onAddNode?: (type: string, position?: { x: number; y: number }, data?: Record<string, unknown>) => void
  nodePosition?: { x: number; y: number }
  [key: string]: unknown
}

// ==================== 场景编排器类型 ====================
// 角色姿态类型
export type CharacterPose = 'front' | 'side' | 'back' | '3/4'

// 场景中的人物
export interface SceneCharacter {
  id: string
  name: string
  imageUrl: string
  position: { x: number; y?: number; z?: number }
  rotation: number
  scale: number
  layer: 'foreground' | 'midground' | 'background'
  pose?: CharacterPose
}

// 相机参数
export interface CameraConfig {
  position: { x: number; y: number; z: number }
  target: { x: number; y: number; z: number }
  fov: number
}

// 截图数据
export interface SceneScreenshot {
  id: string
  dataUrl: string
  camera: CameraConfig
  timestamp: number
}

// 场景编排器节点数据
export interface SceneDirectorNodeData extends NodeDisplayData {
  panoramaUrl: string | null
  imageUrl: string | null
  characters: SceneCharacter[]
  camera: CameraConfig
  screenshots: SceneScreenshot[]
  gridSize: number
  showGrid: boolean
  screenshotRatio?: string
}

// 图片放大节点数据
export interface UpscaleNodeData extends NodeDisplayData {
  imageUrl: string | null | undefined
  scale?: number
  _mode?: 'bicubic' | 'comfyui'
  isProcessing?: boolean
  progress?: number
  workflowId?: string
  workflowName?: string
  _executeTrigger?: number
  metadata?: {
    originalWidth: number
    originalHeight: number
    upscaledWidth: number
    upscaledHeight: number
    scale: number
    model: string
  }
}

// 九宫格预览节点数据
// 视频生成节点数据
export interface VideoGenNodeData extends NodeDisplayData {
  items: Array<{
    id: string
    name: string
    prompt: string
    videoPrompt: string
    firstFrameUrl: string | null
    referenceImages?: string[]
    videoUrl: string | null
    status: 'pending' | 'generating' | 'completed' | 'failed'
  }>
  model: string
  duration: number
  generateAudio: boolean
  isRunning: boolean
  currentIndex: number
  aspectRatio?: string
  motionStrength?: number
  fps?: number
  rawVideoUrl?: string
  _aspectRatioManuallySet?: boolean
}


// 视频上传节点数据
export interface VideoUploadNodeData extends NodeDisplayData {
  videoUrl: string | null
  sourceFileName?: string | null
  duration?: number
  frameRate?: number
  width?: number
  height?: number
  extractedFrames?: Array<{
    id: string
    timestamp: number
    imageUrl: string
  }>
}

// 音频上传节点数据
export interface AudioUploadNodeData extends NodeDisplayData {
  audioUrl: string | null
  sourceFileName?: string | null
  duration?: number
  sampleRate?: number
  waveformData?: number[]
}

// 图片提示词反推节点数据
export interface ImageToPromptNodeData extends NodeDisplayData {
  imageUrl: string | null
  prompt: string // 下游节点通过 useUpstreamData 获取
  promptZh: string
  promptEn: string
  tags: string[]
  jsonResult: Record<string, unknown>
  isAnalyzing: boolean
}

// 文本注释节点数据（别名，用于 CanvasNodeData 联合类型）
export type TextNodeData = TextAnnotationNodeData

// 联合类型
export type CanvasNodeData =
  | UploadImageNodeData
  | TextAnnotationNodeData
  | ImageEditNodeData
  | AIImageEditNodeData
  | StoryboardSplitNodeData
  | SceneDirectorNodeData
  | UpscaleNodeData
  | VideoGenNodeData
  | TextNodeData
  | VideoUploadNodeData
  | AudioUploadNodeData
  | ImageToPromptNodeData

// ==================== 画布类型 ====================
export interface CanvasNode {
  id: string
  type: CanvasNodeType
  position: { x: number; y: number }
  data: CanvasNodeData
  width?: number
  height?: number
  parentId?: string
  draggable?: boolean
  selectable?: boolean
  hidden?: boolean
  dragHandle?: string
}

export interface CanvasEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  animated?: boolean
  type?: string
}

// ==================== 节点创建类型 ====================
export interface NodeCreationDto {
  type: CanvasNodeType
  position: { x: number; y: number }
  data?: Partial<CanvasNodeData>
}

export interface StoryboardNodeCreationDto {
  type: typeof CANVAS_NODE_TYPES.storyboardSplit
  position: { x: number; y: number }
  rows: number
  cols: number
  data?: Partial<StoryboardSplitNodeData>
}

// ==================== 节点定义类型 ====================
export interface NodePort {
  id: string
  name: string
  type: 'image' | 'text' | 'number' | 'data'
  label: string
  required?: boolean
}

export interface NodeDefinition {
  type: CanvasNodeType
  label: string
  category: string
  description: string
  inputs?: NodePort[]
  outputs?: NodePort[]
  defaultProperties: Record<string, unknown>
}

// ==================== 画布状态类型 ====================
export interface CanvasState {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  selectedNodeId: string | null
}

export interface CanvasHistorySnapshot {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

// ==================== 生成任务类型 ====================
export interface GenerationTask {
  id: string
  nodeId: string
  frameId?: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  result?: string
  error?: string
  createdAt: number
  updatedAt: number
}

// ==================== 插件配置类型 ====================
export interface StoryboardCopilotConfig {
  autoSave: boolean
  autoSaveInterval: number
  defaultAspectRatio: string
  defaultGridRows: number
  defaultGridCols: number
}

// ==================== 导出/导入类型 ====================
export interface ExportedCanvas {
  version: string
  exportedAt: string
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  metadata?: {
    projectId?: string
    episodeId?: string
    name?: string
  }
}
