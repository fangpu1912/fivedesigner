/**
 * ViMax 插件类型定义
 * 适配 FiveDesigner 数据模型
 */

// ==================== 核心 ViMax 类型 ====================

/** 角色在场景中的信息 */
export interface ViMaxCharacterInScene {
  name: string;
  description: string;
  prompt: string;
  portraitUrl?: string;
  age?: string;
  gender?: string;
  appearance?: string;
  clothing?: string;
}

/** 场景定义 */
export interface ViMaxScene {
  id: string;
  name: string;
  description: string;
  prompt: string;
  characters: ViMaxCharacterInScene[];
  props: string[];
  location?: string;
  timeOfDay?: string;
  mood?: string;
  referenceImageUrl?: string;
}

/** 镜头描述 */
export interface ViMaxShotDescription {
  id: string;
  sceneId: string;
  sequence: number;
  description: string;
  cameraAngle: string;
  cameraMovement?: string;
  characters: string[];
  props: string[];
  prompt: string;
  videoPrompt?: string;
  duration?: number;
  dubbing?: {
    character: string;
    line: string;
    emotion: string;
    audioPrompt: string;
  };
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  status: 'pending' | 'generating_image' | 'generating_video' | 'generating_audio' | 'completed' | 'error';
}

/** 剧本结构 */
export interface ViMaxScript {
  title: string;
  summary: string;
  scenes: ViMaxScene[];
  shots: ViMaxShotDescription[];
  characters: ViMaxCharacterInScene[];
}

/** 创意输入 */
export interface ViMaxIdea {
  title?: string;
  content: string;
  genre?: string;
  style?: string;
  targetDuration?: number;
  targetAudience?: string;
}

/** 小说输入 */
export interface ViMaxNovel {
  title: string;
  content: string;
  author?: string;
  chapters?: string[];
}

// ==================== Agent 类型 ====================

export type AgentType =
  | 'screenwriter'
  | 'characterExtractor'
  | 'storyboardArtist'
  | 'cameraPlanner'
  | 'characterPortrait'
  | 'referenceImageSelector';

export interface AgentMessage {
  id: string;
  agentType: AgentType;
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface AgentConfig {
  type: AgentType;
  name: string;
  description: string;
  systemPrompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (params: Record<string, unknown>) => Promise<unknown>;
}

export interface AgentContext {
  projectId: string;
  episodeId?: string;
  messages: AgentMessage[];
  tools: AgentTool[];
  metadata?: Record<string, unknown>;
}

// ==================== Pipeline 类型 ====================

export type PipelineType = 'script2video' | 'idea2video' | 'novel2video';

export interface PipelineStep {
  id: string;
  name: string;
  description: string;
  agentType?: AgentType;
  status: 'pending' | 'running' | 'completed' | 'error' | 'skipped';
  progress: number;
  result?: unknown;
  error?: string;
  startTime?: number;
  endTime?: number;
}

export interface PipelineConfig {
  type: PipelineType;
  name: string;
  description: string;
  steps: PipelineStep[];
  input: unknown;
  options?: PipelineOptions;
}

export interface PipelineOptions {
  generateImages?: boolean;
  generateVideos?: boolean;
  generateAudio?: boolean;
  parallelLimit?: number;
  skipExisting?: boolean;
  autoSave?: boolean;
}

export interface PipelineState {
  id: string;
  config: PipelineConfig;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error' | 'cancelled';
  currentStepIndex: number;
  steps: PipelineStep[];
  startTime?: number;
  endTime?: number;
  error?: string;
}

export interface PipelineProgressCallback {
  onStepStart?: (step: PipelineStep, stepIndex: number) => void;
  onStepProgress?: (step: PipelineStep, stepIndex: number, progress: number) => void;
  onStepComplete?: (step: PipelineStep, stepIndex: number, result: unknown) => void;
  onStepError?: (step: PipelineStep, stepIndex: number, error: string) => void;
  onPipelineComplete?: (state: PipelineState) => void;
  onPipelineError?: (state: PipelineState, error: string) => void;
  onPipelineCancel?: (state: PipelineState) => void;
}

// ==================== 工具类型 ====================

export interface ImageGenerationParams {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  seed?: number;
  referenceImage?: string;
  projectId: string;
  episodeId?: string;
  model?: string;
}

export interface VideoGenerationParams {
  prompt: string;
  width?: number;
  height?: number;
  duration?: number;
  firstFrame?: string;
  lastFrame?: string;
  referenceImages?: string[];
  projectId: string;
  episodeId?: string;
  model?: string;
  generateAudio?: boolean;
}

export interface AudioGenerationParams {
  text: string;
  voice?: string;
  speed?: number;
  emotion?: string;
  projectId: string;
  episodeId?: string;
}

export interface RenderTask {
  id: string;
  type: 'image' | 'video' | 'audio';
  params: ImageGenerationParams | VideoGenerationParams | AudioGenerationParams;
  status: 'pending' | 'running' | 'completed' | 'error';
  result?: string;
  error?: string;
}

// ==================== Store 类型 ====================

export interface ViMaxStoreState {
  // Agent 状态
  activeAgents: AgentType[];
  agentMessages: Record<AgentType, AgentMessage[]>;
  isAgentRunning: boolean;

  // Pipeline 状态
  activePipeline: PipelineState | null;
  pipelineHistory: PipelineState[];
  isPipelineRunning: boolean;

  // UI 状态
  isPanelOpen: boolean;
  activeTab: 'agents' | 'pipelines' | 'chat';
  selectedAgent: AgentType | null;

  // 操作
  setPanelOpen: (open: boolean) => void;
  setActiveTab: (tab: 'agents' | 'pipelines' | 'chat') => void;
  setSelectedAgent: (agent: AgentType | null) => void;
  addAgentMessage: (agentType: AgentType, message: AgentMessage) => void;
  clearAgentMessages: (agentType: AgentType) => void;
  setActivePipeline: (pipeline: PipelineState | null) => void;
  updatePipelineStep: (stepId: string, updates: Partial<PipelineStep>) => void;
  addPipelineToHistory: (pipeline: PipelineState) => void;
  setIsAgentRunning: (running: boolean) => void;
  setIsPipelineRunning: (running: boolean) => void;
}

// ==================== 组件 Props 类型 ====================

export interface ViMaxAgentPanelProps {
  projectId: string;
  episodeId?: string;
  onClose?: () => void;
}

export interface PipelineExecutorProps {
  pipeline: PipelineState;
  onCancel?: () => void;
  onRetry?: () => void;
}

export interface AgentChatMessageProps {
  message: AgentMessage;
  onAction?: (action: string, payload?: unknown) => void;
}

export interface PipelineStepIndicatorProps {
  steps: PipelineStep[];
  currentStepIndex: number;
  onStepClick?: (stepIndex: number) => void;
}

// ==================== 数据适配类型 ====================

export interface FDCharacterData {
  id: string;
  name: string;
  description: string;
  prompt: string;
  image?: string;
  project_id: string;
}

export interface FDSceneData {
  id: string;
  name: string;
  description: string;
  prompt: string;
  characters?: string[];
  props?: string[];
  image?: string;
  project_id: string;
  episode_id?: string;
}

export interface FDStoryboardData {
  id: string;
  sequence: number;
  description: string;
  camera_angle?: string;
  camera_movement?: string;
  characters?: string[];
  props?: string[];
  prompt?: string;
  video_prompt?: string;
  image?: string;
  video?: string;
  audio_url?: string;
  episode_id: string;
  scene_id?: string;
}
