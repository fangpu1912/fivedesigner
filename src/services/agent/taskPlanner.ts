/**
 * 任务规划器
 * 根据解析后的需求生成任务依赖图
 */

import type { ParsedIntent, TaskGraph, TaskNode } from './types'

/**
 * 生成任务图
 */
export function generateTaskGraph(intent: ParsedIntent): TaskGraph {
  const nodes: TaskNode[] = []

  switch (intent.type) {
    case 'image':
      return generateImageTasks(intent)
    case 'video':
      return generateVideoTasks(intent)
    case 'audio':
      return generateAudioTasks(intent)
    case 'mixed':
      return generateMixedTasks(intent)
    default:
      return generateImageTasks(intent)
  }
}

/**
 * 生成图片创作任务
 */
function generateImageTasks(intent: ParsedIntent): TaskGraph {
  const nodes: TaskNode[] = []

  // 根据输出数量生成并行任务
  for (let i = 0; i < intent.outputCount; i++) {
    nodes.push({
      id: `image_${i}`,
      name: `生成图片 ${i + 1}/${intent.outputCount}`,
      type: 'image',
      deps: [],
      params: {
        prompt: intent.optimizedPrompt,
        aspectRatio: intent.aspectRatio,
        width: intent.width,
        height: intent.height,
        style: intent.style,
      },
      status: 'pending',
    })
  }

  // 所有图片任务可以并行执行
  const batches = [nodes.map(n => n.id)]

  return { nodes, batches }
}

/**
 * 生成视频创作任务
 */
function generateVideoTasks(intent: ParsedIntent): TaskGraph {
  const nodes: TaskNode[] = []

  // 1. 角色设计（如果有主体）
  if (intent.subject) {
    nodes.push({
      id: 'character_design',
      name: '设计角色形象',
      type: 'image',
      deps: [],
      params: {
        prompt: `${intent.style}风格, ${intent.subject}, 人物设计, 正面全身照, 高质量`,
        aspectRatio: '3:4',
        width: 768,
        height: 1024,
      },
      status: 'pending',
    })
  }

  // 2. 场景设计（如果有场景）
  if (intent.scene) {
    nodes.push({
      id: 'scene_design',
      name: '设计场景',
      type: 'image',
      deps: [],
      params: {
        prompt: `${intent.style}风格, ${intent.scene}, 场景设计, 氛围感, 高质量`,
        aspectRatio: intent.aspectRatio,
        width: intent.width,
        height: intent.height,
      },
      status: 'pending',
    })
  }

  // 3. 生成关键帧（4-6张）
  const frameCount = intent.duration ? Math.min(Math.max(Math.ceil(intent.duration / 2), 4), 8) : 4

  for (let i = 0; i < frameCount; i++) {
    const deps: string[] = []
    if (intent.subject) deps.push('character_design')
    if (intent.scene) deps.push('scene_design')

    nodes.push({
      id: `storyboard_${i}`,
      name: `生成分镜 ${i + 1}/${frameCount}`,
      type: 'image',
      deps,
      params: {
        prompt: generateStoryboardPrompt(intent, i, frameCount),
        aspectRatio: intent.aspectRatio,
        width: intent.width,
        height: intent.height,
        sequence: i,
        totalFrames: frameCount,
      },
      status: 'pending',
    })
  }

  // 4. 视频合成
  const storyboardIds = Array.from({ length: frameCount }, (_, i) => `storyboard_${i}`)
  nodes.push({
    id: 'video_compose',
    name: '合成视频',
    type: 'video',
    deps: storyboardIds,
    params: {
      prompt: intent.optimizedPrompt,
      duration: intent.duration || 5,
      fps: 24,
      frameIds: storyboardIds,
    },
    status: 'pending',
  })

  // 构建批次（考虑依赖关系）
  const batches = buildBatches(nodes)

  return { nodes, batches }
}

/**
 * 生成音频创作任务
 */
function generateAudioTasks(intent: ParsedIntent): TaskGraph {
  const nodes: TaskNode[] = []

  nodes.push({
    id: 'audio_generate',
    name: '生成音频',
    type: 'audio',
    deps: [],
    params: {
      text: intent.subject || intent.optimizedPrompt,
      voice: 'default',
      speed: 1.0,
      emotion: intent.mood || 'neutral',
    },
    status: 'pending',
  })

  return { nodes, batches: [['audio_generate']] }
}

/**
 * 生成混合创作任务（套图/系列）
 */
function generateMixedTasks(intent: ParsedIntent): TaskGraph {
  const nodes: TaskNode[] = []

  // 先生成统一的角色/风格参考
  nodes.push({
    id: 'style_reference',
    name: '生成风格参考',
    type: 'image',
    deps: [],
    params: {
      prompt: `${intent.style}风格, 参考图, 统一风格, ${intent.subject || ''}`,
      aspectRatio: '1:1',
      width: 1024,
      height: 1024,
      isReference: true,
    },
    status: 'pending',
  })

  // 生成系列图片
  const variations = ['正面', '侧面', '细节', '场景']
  for (let i = 0; i < intent.outputCount; i++) {
    const variation = variations[i % variations.length]
    nodes.push({
      id: `mixed_image_${i}`,
      name: `生成${variation}图 ${i + 1}/${intent.outputCount}`,
      type: 'image',
      deps: ['style_reference'],
      params: {
        prompt: `${intent.optimizedPrompt}, ${variation}视角`,
        aspectRatio: intent.aspectRatio,
        width: intent.width,
        height: intent.height,
        referenceImage: 'style_reference',
      },
      status: 'pending',
    })
  }

  const batches = buildBatches(nodes)
  return { nodes, batches }
}

/**
 * 构建执行批次（考虑依赖关系）
 */
function buildBatches(nodes: TaskNode[]): string[][] {
  const batches: string[][] = []
  const completed = new Set<string>()
  const remaining = new Set(nodes.map(n => n.id))

  while (remaining.size > 0) {
    const batch: string[] = []

    for (const nodeId of remaining) {
      const node = nodes.find(n => n.id === nodeId)!
      // 检查所有依赖是否已完成
      const depsCompleted = node.deps.every(dep => completed.has(dep))
      if (depsCompleted) {
        batch.push(nodeId)
      }
    }

    if (batch.length === 0) {
      // 有循环依赖或其他问题
      console.error('无法构建批次，可能存在循环依赖')
      break
    }

    batches.push(batch)
    batch.forEach(id => {
      completed.add(id)
      remaining.delete(id)
    })
  }

  return batches
}

/**
 * 生成分镜提示词
 */
function generateStoryboardPrompt(intent: ParsedIntent, index: number, total: number): string {
  const progress = index / (total - 1)

  let actionDesc = ''
  if (intent.action) {
    // 根据进度描述动作阶段
    if (progress < 0.25) {
      actionDesc = `${intent.action}起始动作`
    } else if (progress < 0.5) {
      actionDesc = `${intent.action}进行中的动作`
    } else if (progress < 0.75) {
      actionDesc = `${intent.action}高潮动作`
    } else {
      actionDesc = `${intent.action}结束动作`
    }
  }

  const parts = [
    intent.style,
    intent.subject,
    intent.scene,
    actionDesc,
    intent.mood,
    '高质量',
  ].filter(Boolean)

  return parts.join(', ')
}

/**
 * 计算任务图总体进度
 */
export function calculateProgress(graph: TaskGraph): number {
  if (graph.nodes.length === 0) return 0

  const completed = graph.nodes.filter(n => n.status === 'completed').length
  const running = graph.nodes.filter(n => n.status === 'running').length

  // 已完成的 + 进行中的按 50% 计算
  return Math.round(((completed + running * 0.5) / graph.nodes.length) * 100)
}

/**
 * 获取当前可执行的任务
 */
export function getExecutableTasks(graph: TaskGraph): TaskNode[] {
  return graph.nodes.filter(node => {
    if (node.status !== 'pending') return false
    // 检查所有依赖是否已完成
    return node.deps.every(depId => {
      const dep = graph.nodes.find(n => n.id === depId)
      return dep?.status === 'completed'
    })
  })
}
