/**
 * Agent 模式类型定义
 */

export type CreationType = 'image' | 'video' | 'audio' | 'mixed'
export type CreationStyle = '古风' | '现代' | '科幻' | '悬疑' | '言情' | '奇幻' | '写实' | '动漫' | string

/**
 * 解析后的创作需求
 */
export interface ParsedIntent {
  /** 创作类型 */
  type: CreationType
  /** 风格 */
  style: CreationStyle
  /** 主体描述 */
  subject: string
  /** 场景描述 */
  scene?: string
  /** 动作/行为 */
  action?: string
  /** 情绪/氛围 */
  mood?: string
  /** 输出数量 */
  outputCount: number
  /** 比例 */
  aspectRatio: string
  /** 尺寸 */
  width: number
  height: number
  /** 时长（视频） */
  duration?: number
  /** 原始用户输入 */
  rawInput: string
  /** 优化后的提示词 */
  optimizedPrompt?: string
}

/**
 * 任务节点
 */
export interface TaskNode {
  /** 任务ID */
  id: string
  /** 任务名称 */
  name: string
  /** 任务类型 */
  type: 'image' | 'video' | 'audio' | 'analysis'
  /** 依赖的任务ID */
  deps: string[]
  /** 任务参数 */
  params: Record<string, unknown>
  /** 任务状态 */
  status: 'pending' | 'running' | 'completed' | 'failed'
  /** 输出结果 */
  output?: string
  /** 错误信息 */
  error?: string
}

/**
 * 任务依赖图
 */
export interface TaskGraph {
  /** 所有任务节点 */
  nodes: TaskNode[]
  /** 并行批次（每个批次内的任务可以并行执行） */
  batches: string[][]
}

/**
 * Agent 执行状态
 */
export interface AgentState {
  /** 当前阶段 */
  phase: 'idle' | 'parsing' | 'planning' | 'executing' | 'validating' | 'completed' | 'failed'
  /** 解析后的需求 */
  intent?: ParsedIntent
  /** 任务图 */
  taskGraph?: TaskGraph
  /** 当前执行的任务ID */
  currentTaskId?: string
  /** 总体进度 0-100 */
  progress: number
  /** 状态消息 */
  message: string
  /** 开始时间 */
  startTime?: number
  /** 预计剩余时间（秒） */
  estimatedTime?: number
}

/**
 * Agent 配置
 */
export interface AgentConfig {
  /** 默认输出数量 */
  defaultOutputCount: number
  /** 默认比例 */
  defaultAspectRatio: string
  /** 默认尺寸 */
  defaultWidth: number
  defaultHeight: number
  /** 是否自动优化提示词 */
  autoOptimizePrompt: boolean
  /** 是否启用质量校验 */
  enableQualityCheck: boolean
  /** 最大重试次数 */
  maxRetries: number
  /** 文本生成模型 */
  textModel?: string
  /** 图片生成模型 */
  imageModel?: string
  /** 视频生成模型 */
  videoModel?: string
  /** 音频生成模型 */
  audioModel?: string
}

/**
 * 模型推荐配置
 */
export interface ModelRecommendation {
  /** 任务类型 */
  taskType: string
  /** 推荐模型ID */
  modelId: string
  /** 推荐理由 */
  reason: string
  /** 备选模型 */
  alternatives: string[]
}

/**
 * 质量检查结果
 */
export interface QualityCheckResult {
  /** 是否通过 */
  passed: boolean
  /** 检查项 */
  checks: {
    /** 检查名称 */
    name: string
    /** 是否通过 */
    passed: boolean
    /** 分数 0-100 */
    score: number
    /** 建议 */
    suggestion?: string
  }[]
  /** 总体建议 */
  overallSuggestion?: string
}
