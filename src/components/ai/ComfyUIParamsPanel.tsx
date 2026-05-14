﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿/**
 * ComfyUI 参数面板
 * 选择工作流后，自动解析并显示可配置参数
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'

import { Settings, RefreshCw, Wand2, Film, Image, Mic } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { WorkflowConfig, Project } from '@/types'

// ComfyUI 参数类型
export interface ComfyUIParam {
  nodeId: string
  field: string
  label: string
  type: 'string' | 'number' | 'integer' | 'boolean' | 'select' | 'image' | 'video' | 'audio'
  value: any
  min?: number
  max?: number
  step?: number
  options?: string[]
  description?: string
  category?: 'prompt' | 'image' | 'video' | 'audio' | 'sampling' | 'size' | 'other'
}

export interface ComfyUIParams {
  prompt?: string
  negativePrompt?: string
  width?: number
  height?: number
  seed?: number
  steps?: number
  cfg?: number
  sampler?: string
  scheduler?: string
  // 视频相关
  frameCount?: number
  fps?: number
  videoLength?: number
  videoInput?: string // 输入视频路径
  // 音频相关
  audioText?: string
  voiceId?: string
  emotion?: string
  audioInput?: string // 输入音频路径
  // 图像输入
  imageInput?: string // 主输入图像（单张）
  referenceImages?: string[] // 参考图数组（多张）
  // 其他
  [key: string]: any
}

interface ComfyUIParamsPanelProps {
  workflow: WorkflowConfig | null
  params: ComfyUIParams
  onChange?: (params: ComfyUIParams) => void // 可选，用于实时更新
  onParamsReady?: (getParams: () => ComfyUIParams) => void // 用于获取当前参数
  onPromptChange?: (prompt: string, negativePrompt: string) => void // 提示词变化时回调，用于同步到 AI 面板
  className?: string
  project?: Project | null
  defaultPrompt?: string
  defaultNegativePrompt?: string
  // 当前分镜数据
  storyboard?: {
    prompt?: string
    negativePrompt?: string
    image?: string
    video?: string
    width?: number
    height?: number
  } | null
  // 当前配音数据
  dubbing?: { text?: string; audio_url?: string } | null
  // 角色、场景、道具提示词
  characterPrompts?: string[]
  scenePrompts?: string[]
  propPrompts?: string[]
}

// 节点类型分类
const NODE_CATEGORIES = {
  // 提示词相关
  PROMPT: ['CLIPTextEncode', 'Text Multiline', 'Prompt', 'Text'],
  // 图像生成
  IMAGE_GEN: ['EmptyLatentImage', 'LatentImage', 'LoadImage', 'Image'],
  // 视频生成
  VIDEO_GEN: ['WanVaceToVideo', 'WanVideo', 'Video', 'AnimateDiff', 'Frame'],
  // 音频生成
  AUDIO_GEN: ['TTS', 'Audio', 'Voice', 'Speech'],
  // 采样器
  SAMPLER: ['KSampler', 'Sampler'],
  // 尺寸
  SIZE: ['EmptyLatentImage', 'LatentImage'],
}

// 获取节点分类
function _getNodeCategory(classType: string): ComfyUIParam['category'] {
  if (NODE_CATEGORIES.PROMPT.some(t => classType?.includes(t))) return 'prompt'
  if (NODE_CATEGORIES.VIDEO_GEN.some(t => classType?.includes(t))) return 'video'
  if (NODE_CATEGORIES.AUDIO_GEN.some(t => classType?.includes(t))) return 'audio'
  if (NODE_CATEGORIES.SAMPLER.some(t => classType?.includes(t))) return 'sampling'
  if (NODE_CATEGORIES.SIZE.some(t => classType?.includes(t))) return 'size'
  return 'other'
}

// 从项目获取风格提示词
function getProjectStylePrompt(project: Project | null | undefined): {
  prompt: string
  negativePrompt: string
} {
  if (!project) return { prompt: '', negativePrompt: '' }

  let stylePrompt = ''
  let negativePrompt = ''

  // 从 visual_style 获取风格
  if (project.visual_style) {
    // 尝试解析风格（可能是 JSON 字符串或直接使用）
    try {
      const style = JSON.parse(project.visual_style)
      stylePrompt = style.prompt || ''
      negativePrompt = style.negativePrompt || ''
    } catch {
      // 如果不是 JSON，直接使用
      stylePrompt = project.visual_style
    }
  }

  // 从 custom_style 获取自定义风格
  if (project.custom_style) {
    stylePrompt = project.custom_style.prompt || stylePrompt
    negativePrompt = project.custom_style.negativePrompt || negativePrompt
  }

  // 添加质量提示词
  if (project.quality_prompt) {
    stylePrompt = stylePrompt ? `${stylePrompt}, ${project.quality_prompt}` : project.quality_prompt
  }

  return { prompt: stylePrompt, negativePrompt }
}

// 从项目宽高比获取默认宽高
function getProjectDimensions(project: Project | null | undefined): {
  width: number
  height: number
} {
  if (!project?.aspect_ratio) {
    return { width: 512, height: 512 }
  }

  // 解析宽高比，格式如 "16:9", "4:3", "1:1", "9:16"
  const ratio = project.aspect_ratio

  switch (ratio) {
    case '16:9':
      return { width: 1024, height: 576 }
    case '4:3':
      return { width: 1024, height: 768 }
    case '3:4':
      return { width: 768, height: 1024 }
    case '9:16':
      return { width: 576, height: 1024 }
    case '1:1':
    default:
      return { width: 1024, height: 1024 }
  }
}

// 从项目获取所有可映射的参数
function getProjectMappedParams(project: Project | null | undefined): Partial<ComfyUIParams> {
  if (!project) return {}

  const params: Partial<ComfyUIParams> = {}
  const dimensions = getProjectDimensions(project)
  const style = getProjectStylePrompt(project)

  // 映射尺寸
  params.width = dimensions.width
  params.height = dimensions.height

  // 映射风格提示词
  if (style.prompt) {
    params.prompt = style.prompt
  }
  if (style.negativePrompt) {
    params.negativePrompt = style.negativePrompt
  }

  // 映射项目名称到提示词（如果没有风格提示词）
  if (!params.prompt && project.name) {
    params.prompt = project.name
  }

  // 映射项目描述到提示词（追加）
  if (project.description && params.prompt) {
    params.prompt = `${params.prompt}, ${project.description}`
  } else if (project.description) {
    params.prompt = project.description
  }

  return params
}

// 解析 ComfyUI 工作流，提取可配置参数
export function parseWorkflowParams(workflow: Record<string, unknown>): ComfyUIParam[] {
  const params: ComfyUIParam[] = []

  // 首先找到 KSampler 节点，确定正负提示词的连接关系
  let positivePromptRef: [string, number] | null = null
  let negativePromptRef: [string, number] | null = null

  for (const [, node] of Object.entries(workflow)) {
    const nodeData = node as any
    if (nodeData.class_type === 'KSampler' || nodeData.class_type?.includes('Sampler')) {
      // KSampler 的 positive 输入
      if (nodeData.inputs?.positive) {
        if (Array.isArray(nodeData.inputs.positive) && nodeData.inputs.positive.length >= 2) {
          positivePromptRef = [nodeData.inputs.positive[0], nodeData.inputs.positive[1]]
        }
      }
      // KSampler 的 negative 输入
      if (nodeData.inputs?.negative) {
        if (Array.isArray(nodeData.inputs.negative) && nodeData.inputs.negative.length >= 2) {
          negativePromptRef = [nodeData.inputs.negative[0], nodeData.inputs.negative[1]]
        }
      }
    }
  }

  // 如果正负提示词引用同一个节点（如 Conditioning Combine 或 WanVaceToVideo），需要追踪原始 CLIPTextEncode
  let positivePromptNodeId: string | null = null
  let negativePromptNodeId: string | null = null

  if (positivePromptRef && negativePromptRef && positivePromptRef[0] === negativePromptRef[0]) {
    const combineNodeId = positivePromptRef[0]
    const combineNode = workflow[combineNodeId] as any

    if (combineNode?.inputs) {
      const textEncodeInputs: { inputName: string; sourceNodeId: string; outputIndex: number }[] =
        []

      for (const [inputName, inputValue] of Object.entries(combineNode.inputs)) {
        if (Array.isArray(inputValue) && inputValue.length >= 2) {
          const sourceNodeId = inputValue[0]
          const outputIndex = inputValue[1]
          const sourceNode = workflow[sourceNodeId] as any

          if (
            sourceNode?.class_type?.includes('CLIP') ||
            sourceNode?.class_type?.includes('Text') ||
            sourceNode?.class_type?.includes('Prompt')
          ) {
            textEncodeInputs.push({ inputName, sourceNodeId, outputIndex })
          }
        }
      }

      // 根据输入名称判断是正面还是负面
      for (const item of textEncodeInputs) {
        const inputName = item.inputName.toLowerCase()
        if (
          inputName.includes('positive') ||
          inputName.includes('pos') ||
          (inputName.includes('1') && !inputName.includes('2'))
        ) {
          positivePromptNodeId = item.sourceNodeId
        } else if (
          inputName.includes('negative') ||
          inputName.includes('neg') ||
          inputName.includes('2')
        ) {
          negativePromptNodeId = item.sourceNodeId
        }
      }

      // 如果根据名称无法判断，根据 outputIndex 判断
      if (!positivePromptNodeId || !negativePromptNodeId) {
        for (const item of textEncodeInputs) {
          if (item.outputIndex === positivePromptRef[1]) {
            positivePromptNodeId = item.sourceNodeId
          }
          if (item.outputIndex === negativePromptRef[1]) {
            negativePromptNodeId = item.sourceNodeId
          }
        }
      }
    }
  } else {
    positivePromptNodeId = positivePromptRef?.[0] || null
    negativePromptNodeId = negativePromptRef?.[0] || null
  }

  for (const [nodeId, node] of Object.entries(workflow)) {
    const nodeData = node as any
    if (!nodeData.inputs) continue

    // 跳过提示词节点 - 提示词由 AI 面板统一管理
    if (
      nodeData.class_type === 'CLIPTextEncode' ||
      nodeData.class_type?.includes('TextEncode') ||
      nodeData.class_type === 'Text Multiline'
    ) {
      continue
    }

    // 解析 KSampler 节点（采样器参数）
    // 支持多种采样器类型：KSampler, SamplerCustom, SamplerCustomAdvanced, BasicScheduler 等
    const isSamplerNode = nodeData.class_type === 'KSampler' ||
                          nodeData.class_type?.includes('Sampler') ||
                          nodeData.class_type?.includes('scheduler') ||
                          nodeData.class_type === 'RandomNoise'
    
    if (isSamplerNode) {
      console.log('[parseWorkflowParams] 发现采样器节点:', nodeId, nodeData.class_type, 'inputs:', Object.keys(nodeData.inputs))
      
      // 处理普通 seed
      if (nodeData.inputs.seed !== undefined) {
        params.push({
          nodeId,
          field: 'seed',
          label: '种子',
          type: 'integer',
          value: nodeData.inputs.seed || -1,
          min: -1,
          max: 2147483647,
          description: '-1 表示随机种子',
          category: 'sampling',
        })
      }
      
      // 处理 RandomNoise 节点的 noise_seed
      if (nodeData.inputs.noise_seed !== undefined) {
        params.push({
          nodeId,
          field: 'seed',
          label: '种子',
          type: 'integer',
          value: Number(nodeData.inputs.noise_seed) || -1,
          min: -1,
          max: 2147483647,
          description: '-1 表示随机种子',
          category: 'sampling',
        })
      }
      
      // 处理 RandomNoise 节点的 control_after_generate
      if (nodeData.inputs.control_after_generate !== undefined) {
        params.push({
          nodeId,
          field: 'control_after_generate',
          label: '生成后控制',
          type: 'select',
          value: nodeData.inputs.control_after_generate || 'fixed',
          options: [
            'fixed',
            'increment',
            'decrement',
            'randomize',
          ],
          description: '生成后种子的变化方式',
          category: 'sampling',
        })
      }
      
      if (nodeData.inputs.steps !== undefined) {
        params.push({
          nodeId,
          field: 'steps',
          label: '步数',
          type: 'integer',
          value: nodeData.inputs.steps || 20,
          min: 1,
          max: 150,
          description: '采样步数',
          category: 'sampling',
        })
      }
      if (nodeData.inputs.cfg !== undefined) {
        params.push({
          nodeId,
          field: 'cfg',
          label: 'CFG Scale',
          type: 'number',
          value: nodeData.inputs.cfg || 7,
          min: 1,
          max: 30,
          step: 0.5,
          description: '提示词相关性',
          category: 'sampling',
        })
      }
      if (nodeData.inputs.sampler_name !== undefined) {
        params.push({
          nodeId,
          field: 'sampler_name',
          label: '采样器',
          type: 'select',
          value: nodeData.inputs.sampler_name || 'euler',
          options: [
            'euler',
            'euler_ancestral',
            'heun',
            'dpm_2',
            'dpm_2_ancestral',
            'lms',
            'dpm_fast',
            'dpm_adaptive',
            'dpmpp_2s_ancestral',
            'dpmpp_sde',
            'dpmpp_sde_gpu',
            'dpmpp_2m',
            'dpmpp_2m_sde',
            'dpmpp_2m_sde_gpu',
            'ddim',
            'uni_pc',
            'uni_pc_bh2',
          ],
          description: '采样算法',
          category: 'sampling',
        })
      }
      if (nodeData.inputs.scheduler !== undefined) {
        params.push({
          nodeId,
          field: 'scheduler',
          label: '调度器',
          type: 'select',
          value: nodeData.inputs.scheduler || 'normal',
          options: ['normal', 'karras', 'exponential', 'sgm_uniform', 'simple', 'ddim_uniform'],
          description: '调度算法',
          category: 'sampling',
        })
      }
    }

    // 解析 EmptyLatentImage 节点（图像尺寸）
    if (
      nodeData.class_type === 'EmptyLatentImage' ||
      nodeData.class_type?.includes('LatentImage')
    ) {
      if (nodeData.inputs.width !== undefined) {
        params.push({
          nodeId,
          field: 'width',
          label: '宽度',
          type: 'integer',
          value: nodeData.inputs.width || 512,
          min: 64,
          max: 4096,
          step: 64,
          description: '图像/视频宽度',
          category: 'size',
        })
      }
      if (nodeData.inputs.height !== undefined) {
        params.push({
          nodeId,
          field: 'height',
          label: '高度',
          type: 'integer',
          value: nodeData.inputs.height || 512,
          min: 64,
          max: 4096,
          step: 64,
          description: '图像/视频高度',
          category: 'size',
        })
      }
      // 视频帧数
      if (nodeData.inputs.batch_size !== undefined) {
        params.push({
          nodeId,
          field: 'batch_size',
          label: '帧数',
          type: 'integer',
          value: nodeData.inputs.batch_size || 1,
          min: 1,
          max: 256,
          description: '视频帧数',
          category: 'video',
        })
      }
    }

    // LoadImage 节点已在 Settings 中配置，不在参数面板显示
    // if (nodeData.class_type === 'LoadImage' || nodeData.class_type?.includes('LoadImage')) {
    //   params.push({
    //     nodeId,
    //     field: 'image',
    //     label: '输入图像',
    //     type: 'image',
    //     value: nodeData.inputs.image || '',
    //     description: '输入参考图像',
    //     category: 'image',
    //   })
    // }

    // 解析 WanVaceToVideo 等视频节点参数
    if (nodeData.class_type?.includes('Wan') || nodeData.class_type?.includes('Video')) {
      // 帧率
      if (nodeData.inputs.fps !== undefined) {
        params.push({
          nodeId,
          field: 'fps',
          label: '帧率',
          type: 'integer',
          value: nodeData.inputs.fps || 16,
          min: 1,
          max: 60,
          description: '视频帧率',
          category: 'video',
        })
      }
      // 视频长度/帧数
      if (nodeData.inputs.frame_count !== undefined) {
        params.push({
          nodeId,
          field: 'frame_count',
          label: '帧数',
          type: 'integer',
          value: nodeData.inputs.frame_count || 81,
          min: 1,
          max: 257,
          description: '视频总帧数',
          category: 'video',
        })
      }
      // 视频长度（秒）
      if (nodeData.inputs.video_length !== undefined) {
        params.push({
          nodeId,
          field: 'video_length',
          label: '视频长度',
          type: 'integer',
          value: nodeData.inputs.video_length || 5,
          min: 1,
          max: 60,
          description: '视频长度（秒）',
          category: 'video',
        })
      }
    }

    // 解析 TTS/音频节点参数
    if (
      nodeData.class_type?.includes('TTS') ||
      nodeData.class_type?.includes('Audio') ||
      nodeData.class_type?.includes('Voice')
    ) {
      console.log(
        '[ComfyUIParamsPanel] Found audio node:',
        nodeId,
        nodeData.class_type,
        nodeData.inputs
      )
      // 文本输入
      if (nodeData.inputs.text !== undefined || nodeData.inputs.input_string !== undefined) {
        const field = nodeData.inputs.text !== undefined ? 'text' : 'input_string'
        const value = nodeData.inputs[field]
        // 如果值是数组（节点引用），则跳过
        if (Array.isArray(value)) {
          console.log('[ComfyUIParamsPanel] Skipping text param - is node reference:', field, value)
        } else {
          params.push({
            nodeId,
            field,
            label: '配音文本',
            type: 'string',
            value: value || '',
            description: '输入要转换为语音的文本',
            category: 'audio',
          })
        }
      }
      // 音色/声音ID - 支持 voice_id, voice, audio 字段
      if (
        nodeData.inputs.voice_id !== undefined ||
        nodeData.inputs.voice !== undefined ||
        nodeData.inputs.audio !== undefined
      ) {
        const field =
          nodeData.inputs.voice_id !== undefined
            ? 'voice_id'
            : nodeData.inputs.voice !== undefined
              ? 'voice'
              : 'audio'
        const value = nodeData.inputs[field]

        // 如果值是数组（节点引用），则跳过，不作为可配置参数
        if (Array.isArray(value)) {
          console.log(
            '[ComfyUIParamsPanel] Skipping voice param - is node reference:',
            field,
            value
          )
          continue
        }
        console.log('[ComfyUIParamsPanel] Adding voice param:', field, value)
        params.push({
          nodeId,
          field,
          label: '音色',
          type: 'audio',
          value: value || '',
          description: '选择配音音色（音频文件）',
          category: 'audio',
        })
      }
      // 情绪
      if (nodeData.inputs.emotion !== undefined) {
        params.push({
          nodeId,
          field: 'emotion',
          label: '情绪',
          type: 'select',
          value: nodeData.inputs.emotion || 'default',
          options: [
            'default',
            'happy',
            'sad',
            'angry',
            'excited',
            'calm',
            'fearful',
            'disgusted',
            'surprised',
          ],
          description: '配音情绪',
          category: 'audio',
        })
      }
      // 语速
      if (nodeData.inputs.speed !== undefined) {
        params.push({
          nodeId,
          field: 'speed',
          label: '语速',
          type: 'number',
          value: nodeData.inputs.speed || 1.0,
          min: 0.5,
          max: 2.0,
          step: 0.1,
          description: '语速倍率',
          category: 'audio',
        })
      }
    }

    // 解析独立的 seed 节点（Primitive_int, Int 等，用于非 KSampler 工作流如 Flux）
    // 只有当还没有从 KSampler 提取到 seed 时才处理
    const hasSeed = params.some(p => p.field === 'seed')
    if (!hasSeed) {
      const isIntNode =
        nodeData.class_type === 'Primitive_int' ||
        nodeData.class_type === 'Int' ||
        nodeData.class_type?.toLowerCase() === 'int' ||
        (nodeData.class_type?.includes('primitive') && nodeData.class_type?.includes('int'))

      const inputName = (nodeData.inputs?.input_name || '').toLowerCase()
      const nodeIdLower = nodeId.toLowerCase()

      const isSeedNode =
        isIntNode &&
        (inputName.includes('seed') || nodeIdLower.includes('seed')) &&
        nodeData.inputs?.value !== undefined

      if (isSeedNode) {
        params.push({
          nodeId,
          field: 'seed',
          label: '种子',
          type: 'integer',
          value: nodeData.inputs.value || -1,
          min: -1,
          max: 2147483647,
          description: '-1 表示随机种子',
          category: 'sampling',
        })
      }
    }
  }

  // 如果没有检测到种子参数，添加一个默认的
  const hasSeedParam = params.some(p => p.field === 'seed')
  if (!hasSeedParam) {
    console.log('[parseWorkflowParams] 未检测到种子参数，添加默认值')
    params.push({
      nodeId: 'default',
      field: 'seed',
      label: '种子',
      type: 'integer',
      value: -1,
      min: -1,
      max: 2147483647,
      description: '-1 表示随机种子',
      category: 'sampling',
    })
  }

  console.log('[parseWorkflowParams] 解析完成，参数列表:', params.map(p => ({ field: p.field, nodeId: p.nodeId })))

  return params
}

// 将参数应用到工作流
export function applyParamsToWorkflow(
  workflow: Record<string, unknown>,
  params: ComfyUIParams,
  nodes?: Record<string, string | string[] | undefined>
): Record<string, unknown> {
  const newWorkflow = JSON.parse(JSON.stringify(workflow))

  // 🔑 统一处理种子：如果没有提供种子或种子为 -1，生成随机种子
  const effectiveSeed = params.seed !== undefined && params.seed !== -1
    ? params.seed
    : Math.floor(Math.random() * 2147483647)

  console.log('[applyParamsToWorkflow] 输入种子:', params.seed, '使用种子:', effectiveSeed)
  console.log('[applyParamsToWorkflow] nodes 映射:', nodes)

  // 首先找到 KSampler 节点，确定正负提示词的连接关系
  let positivePromptRef: [string, number] | null = null
  let negativePromptRef: [string, number] | null = null

  for (const [, node] of Object.entries(newWorkflow)) {
    const nodeData = node as any
    if (nodeData.class_type === 'KSampler' || nodeData.class_type?.includes('Sampler')) {
      if (nodeData.inputs?.positive) {
        if (Array.isArray(nodeData.inputs.positive) && nodeData.inputs.positive.length >= 2) {
          positivePromptRef = [nodeData.inputs.positive[0], nodeData.inputs.positive[1]]
        }
      }
      if (nodeData.inputs?.negative) {
        if (Array.isArray(nodeData.inputs.negative) && nodeData.inputs.negative.length >= 2) {
          negativePromptRef = [nodeData.inputs.negative[0], nodeData.inputs.negative[1]]
        }
      }
    }
  }

  // 如果正负提示词引用同一个节点，需要追踪原始 CLIPTextEncode
  let positivePromptNodeId: string | null = null
  let negativePromptNodeId: string | null = null

  if (positivePromptRef && negativePromptRef && positivePromptRef[0] === negativePromptRef[0]) {
    const combineNodeId = positivePromptRef[0]
    const combineNode = newWorkflow[combineNodeId] as any

    if (combineNode?.inputs) {
      const textEncodeInputs: { inputName: string; sourceNodeId: string; outputIndex: number }[] =
        []

      for (const [inputName, inputValue] of Object.entries(combineNode.inputs)) {
        if (Array.isArray(inputValue) && inputValue.length >= 2) {
          const sourceNodeId = inputValue[0]
          const outputIndex = inputValue[1]
          const sourceNode = newWorkflow[sourceNodeId] as any

          if (
            sourceNode?.class_type?.includes('CLIP') ||
            sourceNode?.class_type?.includes('Text') ||
            sourceNode?.class_type?.includes('Prompt')
          ) {
            textEncodeInputs.push({ inputName, sourceNodeId, outputIndex })
          }
        }
      }

      // 根据输入名称判断
      for (const item of textEncodeInputs) {
        const inputName = item.inputName.toLowerCase()
        if (
          inputName.includes('positive') ||
          inputName.includes('pos') ||
          (inputName.includes('1') && !inputName.includes('2'))
        ) {
          positivePromptNodeId = item.sourceNodeId
        } else if (
          inputName.includes('negative') ||
          inputName.includes('neg') ||
          inputName.includes('2')
        ) {
          negativePromptNodeId = item.sourceNodeId
        }
      }

      // 如果根据名称无法判断，根据 outputIndex 判断
      if (!positivePromptNodeId || !negativePromptNodeId) {
        for (const item of textEncodeInputs) {
          if (item.outputIndex === positivePromptRef[1]) {
            positivePromptNodeId = item.sourceNodeId
          }
          if (item.outputIndex === negativePromptRef[1]) {
            negativePromptNodeId = item.sourceNodeId
          }
        }
      }
    }
  } else {
    positivePromptNodeId = positivePromptRef?.[0] || null
    negativePromptNodeId = negativePromptRef?.[0] || null
  }

  // 使用 Settings 中配置的 nodes 映射应用参数
  if (nodes) {
    for (const [paramKey, targetNodeIdOrIds] of Object.entries(nodes)) {
      // 支持一个参数映射到多个节点（数组或字符串）
      const targetNodeIds = Array.isArray(targetNodeIdOrIds) ? targetNodeIdOrIds : [targetNodeIdOrIds]
      
      for (const targetNodeId of targetNodeIds) {
        if (!targetNodeId) continue

        const nodeData = newWorkflow[targetNodeId] as any
        if (!nodeData?.inputs) continue

        // 根据参数类型应用到对应字段
        switch (paramKey) {
          case 'prompt':
            if (params.prompt !== undefined && nodeData.inputs.text !== undefined) {
              nodeData.inputs.text = params.prompt
            }
            break
          case 'negativePrompt':
            if (params.negativePrompt !== undefined && nodeData.inputs.text !== undefined) {
              nodeData.inputs.text = params.negativePrompt
            }
            break
          case 'imageInput':
            // 主输入图片（单张）
            if (params.imageInput !== undefined && nodeData.inputs.image !== undefined) {
              nodeData.inputs.image = params.imageInput
            }
            break
          case 'referenceImages':
            // 参考图片数组 - 支持多张图片分别设置到不同节点
            if (params.referenceImages && params.referenceImages.length > 0) {
              // 获取 referenceImages 配置的节点 ID 列表（支持字符串或数组）
              const refNodeConfig = nodes.referenceImages
              const refNodeIds = Array.isArray(refNodeConfig) ? refNodeConfig : [refNodeConfig]
              // 找到当前 targetNodeId 在 referenceImages 节点列表中的索引
              const refIndex = refNodeIds.findIndex(n => n === targetNodeId)
              if (refIndex >= 0 && refIndex < params.referenceImages!.length) {
                const refImage = params.referenceImages![refIndex]
                if (refImage !== undefined && nodeData.inputs.image !== undefined) {
                  nodeData.inputs.image = refImage
                }
              } else if (nodeData.inputs.image !== undefined) {
                // 如果找不到对应索引，使用第一张参考图作为后备
                nodeData.inputs.image = params.referenceImages[0]
              }
            }
            break
          case 'width':
            if (params.width !== undefined) {
              if (nodeData.inputs.width !== undefined) nodeData.inputs.width = params.width
              if (nodeData.inputs.value !== undefined) nodeData.inputs.value = params.width
            }
            break
          case 'height':
            if (params.height !== undefined) {
              if (nodeData.inputs.height !== undefined) nodeData.inputs.height = params.height
              if (nodeData.inputs.value !== undefined) nodeData.inputs.value = params.height
            }
            break
          case 'seed':
            // 使用 effectiveSeed（已处理随机种子逻辑）
            if (nodeData.inputs.seed !== undefined) {
              nodeData.inputs.seed = effectiveSeed
              console.log(`[ComfyUI] 设置种子到节点 ${targetNodeId}:`, effectiveSeed)
            }
            if (nodeData.inputs.value !== undefined) {
              nodeData.inputs.value = effectiveSeed
              console.log(`[ComfyUI] 设置种子值到节点 ${targetNodeId}:`, effectiveSeed)
            }
            // RandomNoise 节点使用 noise_seed
            if (nodeData.inputs.noise_seed !== undefined) {
              nodeData.inputs.noise_seed = effectiveSeed
              console.log(`[ComfyUI] 设置 noise_seed 到节点 ${targetNodeId}:`, effectiveSeed)
            }
            break
          case 'steps':
            if (params.steps !== undefined) nodeData.inputs.steps = params.steps
            break
          case 'cfg':
            if (params.cfg !== undefined) nodeData.inputs.cfg = params.cfg
            break
          case 'sampler':
            if (params.sampler !== undefined) nodeData.inputs.sampler_name = params.sampler
            break
          case 'scheduler':
            if (params.scheduler !== undefined) nodeData.inputs.scheduler = params.scheduler
            break
          case 'control_after_generate':
            if (params.control_after_generate !== undefined && nodeData.inputs.control_after_generate !== undefined) {
              nodeData.inputs.control_after_generate = params.control_after_generate
              console.log(`[ComfyUI] 设置 control_after_generate 到节点 ${targetNodeId}:`, params.control_after_generate)
            }
            break
          default:
            // 处理额外的图片输入节点（imageInput2, imageInput3, ...）
            if (paramKey.startsWith('imageInput') && paramKey !== 'imageInput') {
              const imageValue = params[paramKey]
              if (imageValue !== undefined && nodeData.inputs.image !== undefined) {
                nodeData.inputs.image = imageValue
                console.log(`[ComfyUI] 设置 ${paramKey} 到节点 ${targetNodeId}:`, imageValue)
              }
            }
            break
        }
      }
    }
  }

  for (const [nodeId, node] of Object.entries(newWorkflow)) {
    const nodeData = node as any
    if (!nodeData.inputs) continue

    // 如果没有配置 nodes 映射，使用自动检测逻辑
    if (!nodes) {
      // 应用提示词
      if (params.prompt !== undefined && positivePromptNodeId) {
        if (
          (nodeData.class_type === 'CLIPTextEncode' || nodeData.class_type?.includes('TextEncode')) &&
          nodeId === positivePromptNodeId
        ) {
          nodeData.inputs.text = params.prompt
        }
        if (nodeData.class_type === 'Text Multiline' && nodeId === positivePromptNodeId) {
          nodeData.inputs.text = params.prompt
        }
      }

      // 应用负面提示词
      if (params.negativePrompt !== undefined && negativePromptNodeId) {
        if (
          (nodeData.class_type === 'CLIPTextEncode' || nodeData.class_type?.includes('TextEncode')) &&
          nodeId === negativePromptNodeId
        ) {
          nodeData.inputs.text = params.negativePrompt
        }
        if (nodeData.class_type === 'Text Multiline' && nodeId === negativePromptNodeId) {
          nodeData.inputs.text = params.negativePrompt
        }
      }
    }

    // 应用采样器参数
    if (nodeData.class_type === 'KSampler' || nodeData.class_type?.includes('Sampler')) {
      // 使用 effectiveSeed（已处理随机种子逻辑）
      const oldSeed = nodeData.inputs.seed
      nodeData.inputs.seed = effectiveSeed
      console.log(`[applyParamsToWorkflow] 设置 ${nodeId} (${nodeData.class_type}) 种子: ${oldSeed} -> ${effectiveSeed}`)
      if (params.steps !== undefined) nodeData.inputs.steps = params.steps
      if (params.cfg !== undefined) nodeData.inputs.cfg = params.cfg
      if (params.sampler !== undefined) nodeData.inputs.sampler_name = params.sampler
      if (params.scheduler !== undefined) nodeData.inputs.scheduler = params.scheduler
    }

    // 应用图像尺寸
    if (
      nodeData.class_type === 'EmptyLatentImage' ||
      nodeData.class_type?.includes('LatentImage')
    ) {
      if (params.width !== undefined) nodeData.inputs.width = params.width
      if (params.height !== undefined) nodeData.inputs.height = params.height
      if (params.frameCount !== undefined) nodeData.inputs.batch_size = params.frameCount
    }

    // 应用 Int 类型节点（宽度、高度、种子等）
    if (
      nodeData.class_type === 'Int' ||
      nodeData.class_type === 'Primitive_int' ||
      nodeData.class_type?.toLowerCase() === 'int' ||
      (nodeData.class_type?.includes('primitive') && nodeData.class_type?.includes('int'))
    ) {
      // 根据节点名称或连接关系判断是哪种参数
      const inputName = nodeData.inputs?.input_name?.toLowerCase() || ''
      const nodeIdLower = nodeId.toLowerCase()
      if (params.width !== undefined && (inputName.includes('width') || nodeIdLower.includes('width'))) {
        nodeData.inputs.value = params.width
      }
      if (params.height !== undefined && (inputName.includes('height') || nodeIdLower.includes('height'))) {
        nodeData.inputs.value = params.height
      }
      // seed：通过名称匹配或作为 fallback（当该 Int 节点被识别为 seed 时）
      // 使用 effectiveSeed（已处理随机种子逻辑）
      if (inputName.includes('seed') || nodeIdLower.includes('seed')) {
        const oldValue = nodeData.inputs.value
        nodeData.inputs.value = effectiveSeed
        console.log(`[applyParamsToWorkflow] 设置 Int节点 ${nodeId} 种子: ${oldValue} -> ${effectiveSeed}`)
      } else if (nodeData.inputs?.value !== undefined && typeof nodeData.inputs.value === 'number') {
        // 如果这个 Int 节点在 parseWorkflowParams 中被识别为 seed 节点（field='seed'），也应用值
        // 通过检查节点是否在 nodes 映射中标记为 seed
        const isMappedAsSeed = nodes?.seed === nodeId || (Array.isArray(nodes?.seed) && nodes?.seed?.includes(nodeId))
        if (isMappedAsSeed) {
          const oldValue = nodeData.inputs.value
          nodeData.inputs.value = effectiveSeed
          console.log(`[applyParamsToWorkflow] 设置映射Int节点 ${nodeId} 种子: ${oldValue} -> ${effectiveSeed}`)
        }
      }
      if (params.frameCount !== undefined && (inputName.includes('frame') || nodeId.includes('frame'))) {
        nodeData.inputs.value = params.frameCount
      }
      if (params.fps !== undefined && (inputName.includes('fps') || nodeId.includes('fps'))) {
        nodeData.inputs.value = params.fps
      }
      if (params.videoLength !== undefined && (inputName.includes('length') || nodeId.includes('length'))) {
        nodeData.inputs.value = params.videoLength
      }
    }

    // 应用视频参数
    if (nodeData.class_type?.includes('Wan') || nodeData.class_type?.includes('Video')) {
      if (params.fps !== undefined) nodeData.inputs.fps = params.fps
      if (params.frameCount !== undefined) nodeData.inputs.frame_count = params.frameCount
      if (params.videoLength !== undefined) nodeData.inputs.video_length = params.videoLength
    }

    // 应用音频参数
    if (
      nodeData.class_type?.includes('TTS') ||
      nodeData.class_type?.includes('Audio') ||
      nodeData.class_type?.includes('Voice')
    ) {
      if (params.audioText !== undefined) {
        if (nodeData.inputs.text !== undefined) nodeData.inputs.text = params.audioText
        if (nodeData.inputs.input_string !== undefined)
          nodeData.inputs.input_string = params.audioText
      }
      if (params.voiceId !== undefined) {
        if (nodeData.inputs.voice_id !== undefined) nodeData.inputs.voice_id = params.voiceId
        if (nodeData.inputs.voice !== undefined) nodeData.inputs.voice = params.voiceId
        // 支持 LoadAudio 节点的 audio 字段
        if (nodeData.inputs.audio !== undefined) nodeData.inputs.audio = params.voiceId
      }
      if (params.emotion !== undefined) nodeData.inputs.emotion = params.emotion
      // 应用输入音频
      if (params.audioInput !== undefined && nodeData.inputs.audio !== undefined) {
        nodeData.inputs.audio = params.audioInput
      }
    }

    // 应用输入图像到 LoadImage 节点（支持 imageInput 和 referenceImages）
    // 只有在没有配置 nodes 映射时才使用自动逻辑
    if (!nodes && (nodeData.class_type === 'LoadImage' || nodeData.class_type?.includes('LoadImage'))) {
      const imageValue = params.imageInput || params.referenceImages?.[0]
      if (imageValue !== undefined) {
        nodeData.inputs.image = imageValue
      }
    }

    // 应用输入视频到视频节点
    if (nodeData.class_type?.includes('Wan') || nodeData.class_type?.includes('Video')) {
      if (params.videoInput !== undefined && nodeData.inputs.video !== undefined) {
        nodeData.inputs.video = params.videoInput
      }
    }
  }

  return newWorkflow
}

// 从工作流提取默认参数
export function extractDefaultParams(workflow: Record<string, unknown>): ComfyUIParams {
  const params: ComfyUIParams = {}
  const parsed = parseWorkflowParams(workflow)

  console.log(
    '[ComfyUIParamsPanel] extractDefaultParams - parsed params:',
    parsed.map(p => ({ label: p.label, value: p.value }))
  )

  for (const param of parsed) {
    // 跳过节点引用（数组类型）
    if (Array.isArray(param.value)) {
      console.log(
        '[ComfyUIParamsPanel] Skipping param - is node reference:',
        param.label,
        param.value
      )
      continue
    }
    switch (param.label) {
      case '提示词':
        params.prompt = param.value
        break
      case '负面提示词':
        params.negativePrompt = param.value
        break
      case '宽度':
        params.width = param.value
        break
      case '高度':
        params.height = param.value
        break
      case '种子':
        params.seed = param.value
        break
      case '步数':
        params.steps = param.value
        break
      case 'CFG Scale':
        params.cfg = param.value
        break
      case '采样器':
        params.sampler = param.value
        break
      case '调度器':
        params.scheduler = param.value
        break
      case '帧数':
        params.frameCount = param.value
        break
      case '帧率':
        params.fps = param.value
        break
      case '视频长度':
        params.videoLength = param.value
        break
      case '配音文本':
        params.audioText = param.value
        break
      case '音色':
        params.voiceId = param.value
        break
      case '情绪':
        params.emotion = param.value
        break
    }
  }

  return params
}

export function ComfyUIParamsPanel({
  workflow,
  params,
  onChange,
  onParamsReady,
  onPromptChange,
  className,
  project,
  defaultPrompt = '',
  defaultNegativePrompt = '',
  storyboard,
  dubbing,
  characterPrompts = [],
  scenePrompts = [],
  propPrompts = [],
}: ComfyUIParamsPanelProps) {
  const [localParams, setLocalParams] = useState<ComfyUIParams>(params)
  // 使用 ref 存储最新的参数，供 getCurrentParams 使用（避免闭包问题）
  const localParamsRef = useRef<ComfyUIParams>(params)
  // 使用 ref 跟踪是否已经初始化，避免初始时的无限循环
  const hasInitializedRef = useRef(false)

  // 同步 state 到 ref
  useEffect(() => {
    localParamsRef.current = localParams
  }, [localParams])

  // 从项目获取映射的参数
  const projectMappedParams = useMemo(() => getProjectMappedParams(project), [project])

  // 只在初始化时解析一次参数
  useEffect(() => {
    if (!workflow?.workflow || hasInitializedRef.current) return

    hasInitializedRef.current = true

    const defaultParams = extractDefaultParams(workflow.workflow)
    console.log('[ComfyUIParamsPanel] defaultParams:', defaultParams)

    // 合并参数优先级：外部传入的 params（包含上次保存的宽高）> 分镜宽高（modelParams）> 项目映射的参数 > 工作流默认参数
    // 这样用户的宽高设置会被持久化保存
    const mergedParams: ComfyUIParams = {
      ...defaultParams,
      ...projectMappedParams,
      ...(storyboard?.width ? { width: storyboard.width } : {}),
      ...(storyboard?.height ? { height: storyboard.height } : {}),
      ...params,
    }

    console.log('[ComfyUIParamsPanel] mergedParams:', mergedParams)

    // 特别处理提示词：如果外部传入了 defaultPrompt，追加到项目提示词后面
    if (defaultPrompt) {
      mergedParams.prompt = projectMappedParams.prompt
        ? `${projectMappedParams.prompt}, ${defaultPrompt}`
        : defaultPrompt
    }

    // 特别处理负面提示词
    if (defaultNegativePrompt) {
      mergedParams.negativePrompt = projectMappedParams.negativePrompt
        ? `${projectMappedParams.negativePrompt}, ${defaultNegativePrompt}`
        : defaultNegativePrompt
    }

    // 映射分镜数据到工作流参数（分镜数据优先级最高）
    if (storyboard) {
      if (storyboard.prompt) mergedParams.prompt = storyboard.prompt
      if (storyboard.negativePrompt) mergedParams.negativePrompt = storyboard.negativePrompt
      if (storyboard.image) mergedParams.imageInput = storyboard.image
      if (storyboard.video) mergedParams.videoInput = storyboard.video
    }

    // 映射配音数据到工作流参数
    if (dubbing) {
      if (dubbing.text) mergedParams.audioText = dubbing.text
      if (dubbing.audio_url) mergedParams.audioInput = dubbing.audio_url
    }

    // 合并角色、场景、道具提示词到主提示词
    const additionalPrompts: string[] = []
    if (characterPrompts.length > 0) additionalPrompts.push(...characterPrompts)
    if (scenePrompts.length > 0) additionalPrompts.push(...scenePrompts)
    if (propPrompts.length > 0) additionalPrompts.push(...propPrompts)
    if (additionalPrompts.length > 0) {
      mergedParams.prompt = mergedParams.prompt
        ? `${mergedParams.prompt}, ${additionalPrompts.join(', ')}`
        : additionalPrompts.join(', ')
    }

    setLocalParams(mergedParams)

    // 通知父组件获取参数的方法
    if (onParamsReady) {
      onParamsReady(getCurrentParams)
    }
    // 可选的实时更新
    if (onChange) {
      onChange(mergedParams)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow?.id]) // 只在工作流切换时执行

  // 只同步宽高、种子等可调参数，不同步提示词和图片（已在 Settings 中配置）
  useEffect(() => {
    if (!hasInitializedRef.current) return

    setLocalParams(prev => {
      const updated = { ...prev }
      // 只同步数值类参数
      if (storyboard?.width !== undefined) updated.width = storyboard.width
      if (storyboard?.height !== undefined) updated.height = storyboard.height
      return updated
    })
  }, [storyboard?.width, storyboard?.height])

  // 解析参数列表
  const paramList = useMemo(() => {
    if (!workflow?.workflow) return []
    return parseWorkflowParams(workflow.workflow)
  }, [workflow?.workflow])

  // 按分类分组参数
  const groupedParams = useMemo(() => {
    const groups: Record<string, ComfyUIParam[]> = {
      prompt: [],
      image: [],
      video: [],
      audio: [],
      sampling: [],
      size: [],
      other: [],
    }

    for (const param of paramList) {
      const category = param.category || 'other'
      if (!groups[category]) groups[category] = []
      groups[category].push(param)
    }

    return groups
  }, [paramList])

  // 处理参数变化 - 更新本地状态并通知父组件
  const handleParamChange = useCallback((key: string, value: any) => {
    setLocalParams(prev => {
      const updated = { ...prev, [key]: value }
      // 当提示词变化时，通知父组件同步到 AI 面板
      if ((key === 'prompt' || key === 'negativePrompt') && onPromptChange) {
        onPromptChange(
          key === 'prompt' ? value : updated.prompt || '',
          key === 'negativePrompt' ? value : updated.negativePrompt || ''
        )
      }
      // 通知父组件参数变化（用于持久化保存）
      if (onChange) {
        onChange(updated)
      }
      return updated
    })
  }, [onChange, onPromptChange])

  // 获取当前参数的方法（使用 ref 避免闭包问题）
  const getCurrentParams = useCallback(() => localParamsRef.current, [])

  // 随机种子
  const handleRandomSeed = () => {
    const randomSeed = Math.floor(Math.random() * 2147483647)
    handleParamChange('seed', randomSeed)
  }

  // 渲染参数输入控件
  const renderParamInput = (param: ComfyUIParam) => {
    const paramKey =
      param.label === '提示词'
        ? 'prompt'
        : param.label === '负面提示词'
          ? 'negativePrompt'
          : param.label === '宽度'
            ? 'width'
            : param.label === '高度'
              ? 'height'
              : param.label === '种子'
                ? 'seed'
                : param.label === '步数'
                  ? 'steps'
                  : param.label === 'CFG Scale'
                    ? 'cfg'
                    : param.label === '采样器'
                      ? 'sampler'
                      : param.label === '调度器'
                        ? 'scheduler'
                        : param.label === '帧数'
                          ? 'frameCount'
                          : param.label === '帧率'
                            ? 'fps'
                            : param.label === '视频长度'
                              ? 'videoLength'
                              : param.label === '配音文本'
                                ? 'audioText'
                                : param.label === '音色'
                                  ? 'voiceId'
                                  : param.label === '情绪'
                                    ? 'emotion'
                                    : param.label === '输入图像'
                                      ? 'imageInput'
                                      : null
    const value = paramKey ? localParams[paramKey] : undefined

    switch (param.type) {
      case 'string':
        if (
          param.label === '提示词' ||
          param.label === '负面提示词' ||
          param.label === '配音文本'
        ) {
          return (
            <Textarea
              value={value || ''}
              onChange={e => {
                const key =
                  param.label === '提示词'
                    ? 'prompt'
                    : param.label === '负面提示词'
                      ? 'negativePrompt'
                      : 'audioText'
                handleParamChange(key, e.target.value)
              }}
              placeholder={param.description}
              className="min-h-[80px] text-sm"
            />
          )
        }
        // 根据标签映射到标准化的 key
        const keyMap: Record<string, string> = {
          音色: 'voiceId',
          情绪: 'emotion',
          配音文本: 'audioText',
        }
        const key = keyMap[param.label] || param.field
        return (
          <Input
            value={value || ''}
            onChange={e => handleParamChange(key, e.target.value)}
            placeholder={param.description}
            className="h-8 text-sm"
          />
        )

      case 'integer':
      case 'number':
        if (param.label === '种子') {
          return (
            <div className="flex gap-2">
              <Input
                type="number"
                value={value || -1}
                onChange={e => handleParamChange('seed', parseInt(e.target.value) || -1)}
                className="h-8 text-xs"
                min={-1}
              />
              <Button variant="outline" size="sm" className="h-8 px-2" onClick={handleRandomSeed}>
                <RefreshCw className="w-3 h-3" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2"
                onClick={() => handleParamChange('seed', -1)}
              >
                <Wand2 className="w-3 h-3" />
              </Button>
            </div>
          )
        }

        if (param.label === '步数' || param.label === 'CFG Scale') {
          return (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{value}</span>
              </div>
              <Slider
                value={[value || param.value]}
                onValueChange={([v]) => {
                  const key = param.label === '步数' ? 'steps' : 'cfg'
                  handleParamChange(key, v)
                }}
                min={param.min}
                max={param.max}
                step={param.step || 1}
              />
            </div>
          )
        }

        if (param.label === '宽度' || param.label === '高度') {
          return (
            <Input
              type="number"
              value={value || param.value}
              onChange={e => {
                const key = param.label === '宽度' ? 'width' : 'height'
                handleParamChange(key, parseInt(e.target.value) || 512)
              }}
              className="h-8 text-xs"
              min={256}
              max={4096}
              step={64}
            />
          )
        }

        return (
          <Input
            type="number"
            value={value || param.value}
            onChange={e => handleParamChange(param.field, parseFloat(e.target.value))}
            className="h-8 text-xs"
            min={param.min}
            max={param.max}
            step={param.step}
          />
        )

      case 'select':
        return (
          <Select
            value={value || param.value}
            onValueChange={v => {
              const key =
                param.label === '采样器'
                  ? 'sampler'
                  : param.label === '调度器'
                    ? 'scheduler'
                    : param.label === '情绪'
                      ? 'emotion'
                      : param.field
              handleParamChange(key, v)
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {param.options?.map(opt => (
                <SelectItem key={opt} value={opt} className="text-xs">
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )

      case 'image':
        return (
          <div className="space-y-2">
            <Input
              value={value || ''}
              onChange={e => handleParamChange('imageInput', e.target.value)}
              placeholder="输入图像路径或URL"
              className="h-8 text-xs"
            />
            <p className="text-xs text-muted-foreground">{param.description}</p>
          </div>
        )

      case 'audio':
        return (
          <div className="space-y-2">
            <Input
              value={value || ''}
              onChange={e => handleParamChange('voiceId', e.target.value)}
              placeholder="输入音频文件名（如: voice.wav）"
              className="h-8 text-xs"
            />
            <p className="text-xs text-muted-foreground">{param.description}</p>
          </div>
        )

      default:
        return null
    }
  }

  // 渲染参数组
  const renderParamGroup = (_title: string, _icon: React.ReactNode, params: ComfyUIParam[]) => {
    if (params.length === 0) return null

    return (
      <div className="space-y-3">
        <div className="space-y-3">
          {params.map(param => (
            <div key={`${param.nodeId}-${param.field}`} className="space-y-1.5">
              <Label className="text-xs">{param.label}</Label>
              {renderParamInput(param)}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!workflow) {
    return (
      <div className={cn('p-4 text-center text-muted-foreground', className)}>
        请先选择一个工作流
      </div>
    )
  }

  if (paramList.length === 0) {
    return (
      <div className={cn('p-4 text-center text-muted-foreground', className)}>
        未能从工作流中解析出可配置参数
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* 提示词组 */}
      {renderParamGroup('提示词', <Wand2 className="w-4 h-4" />, groupedParams.prompt ?? [])}

      {/* 图像参数组 */}
      {renderParamGroup('图像输入', <Image className="w-4 h-4" />, groupedParams.image ?? [])}

      {/* 尺寸参数组 */}
      {renderParamGroup('图像尺寸', <Settings className="w-4 h-4" />, groupedParams.size ?? [])}

      {/* 视频参数组 */}
      {renderParamGroup('视频参数', <Film className="w-4 h-4" />, groupedParams.video ?? [])}

      {/* 音频参数组 */}
      {renderParamGroup('音频参数', <Mic className="w-4 h-4" />, groupedParams.audio ?? [])}

      {/* 采样参数组 */}
      {renderParamGroup('采样参数', <Settings className="w-4 h-4" />, groupedParams.sampling ?? [])}

      {/* 其他参数组 */}
      {renderParamGroup('其他参数', <Settings className="w-4 h-4" />, groupedParams.other ?? [])}
    </div>
  )
}

export default ComfyUIParamsPanel
