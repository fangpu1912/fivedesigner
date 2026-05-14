/**
 * API 预设模板
 * 包含常用 AI 服务的推荐配置
 */

import type { APIEndpoint, APITemplate } from '@/types/apiMapping.types'

/**
 * ComfyUI 文生图模板
 */
export const comfyUI_Txt2Img: APIEndpoint = {
  id: 'comfyui_txt2img',
  name: 'ComfyUI 文生图',
  provider: 'comfyui',
  baseUrl: 'http://127.0.0.1:8000',
  authType: 'none',
  endpoints: {
    generate: '/prompt',
    status: '/history/{prompt_id}',
    result: '/view',
  },
  parameters: [
    { name: 'prompt', label: '提示词', type: 'string', required: true },
    { name: 'negative_prompt', label: '负面提示词', type: 'string', required: false },
    { name: 'seed', label: '随机种子', type: 'number', required: false, defaultValue: -1 },
    {
      name: 'steps',
      label: '步数',
      type: 'number',
      required: false,
      defaultValue: 20,
      validation: { min: 1, max: 100 },
    },
    {
      name: 'cfg',
      label: 'CFG Scale',
      type: 'number',
      required: false,
      defaultValue: 7,
      validation: { min: 1, max: 20 },
    },
    { name: 'width', label: '宽度', type: 'number', required: false, defaultValue: 512 },
    { name: 'height', label: '高度', type: 'number', required: false, defaultValue: 512 },
    {
      name: 'sampler_name',
      label: '采样器',
      type: 'string',
      required: false,
      defaultValue: 'euler',
    },
    { name: 'scheduler', label: '调度器', type: 'string', required: false, defaultValue: 'normal' },
  ],
  mappings: [
    { id: '1', apiParameter: 'prompt', sourceField: 'storyboard.prompt' },
    {
      id: '2',
      apiParameter: 'negative_prompt',
      sourceField: 'project.description',
      defaultValue: 'ugly, blurry, low quality',
    },
    { id: '3', apiParameter: 'width', sourceField: 'storyboard.width', defaultValue: 512 },
    { id: '4', apiParameter: 'height', sourceField: 'storyboard.height', defaultValue: 512 },
    { id: '5', apiParameter: 'seed', sourceField: 'system.random', defaultValue: -1 },
  ],
  headers: {
    'Content-Type': 'application/json',
  },
}

/**
 * Midjourney API 模板
 */
export const midjourney_imagine: APIEndpoint = {
  id: 'midjourney_imagine',
  name: 'Midjourney Imagine',
  provider: 'midjourney',
  baseUrl: 'https://api.midjourney.com',
  authType: 'bearer',
  endpoints: {
    generate: '/v1/imagine',
    status: '/v1/status/{taskId}',
    result: '/v1/result/{taskId}',
  },
  parameters: [
    { name: 'prompt', label: '提示词', type: 'string', required: true },
    {
      name: 'aspect_ratio',
      label: '宽高比',
      type: 'string',
      required: false,
      defaultValue: '16:9',
      validation: { enum: ['1:1', '16:9', '9:16', '4:3', '3:4'] },
    },
    { name: 'style', label: '风格', type: 'string', required: false, defaultValue: 'raw' },
    {
      name: 'quality',
      label: '质量',
      type: 'string',
      required: false,
      defaultValue: '1',
      validation: { enum: ['0.25', '0.5', '1', '2'] },
    },
    {
      name: 'chaos',
      label: '创意度',
      type: 'number',
      required: false,
      defaultValue: 0,
      validation: { min: 0, max: 100 },
    },
    {
      name: 'stylize',
      label: '风格化',
      type: 'number',
      required: false,
      defaultValue: 100,
      validation: { min: 0, max: 1000 },
    },
  ],
  mappings: [
    { id: '1', apiParameter: 'prompt', sourceField: 'storyboard.prompt' },
    {
      id: '2',
      apiParameter: 'aspect_ratio',
      sourceField: 'project.aspect_ratio',
      defaultValue: '16:9',
    },
    { id: '3', apiParameter: 'style', sourceField: 'project.visual_style', defaultValue: 'raw' },
    {
      id: '4',
      apiParameter: 'quality',
      sourceField: 'system.random',
      defaultValue: '1',
      transformation: 'template',
    },
  ],
  headers: {
    'Content-Type': 'application/json',
    Authorization: 'Bearer {api_key}',
  },
}

/**
 * Runway Gen-2 视频生成模板（支持多参考图片）
 */
export const runway_gen2: APIEndpoint = {
  id: 'runway_gen2',
  name: 'Runway Gen-2 (Multi-Image)',
  provider: 'runway',
  baseUrl: 'https://api.runwayml.com',
  authType: 'bearer',
  endpoints: {
    generate: '/v1/video/generate',
    status: '/v1/tasks/{taskId}',
    result: '/v1/videos/{videoId}',
  },
  parameters: [
    { name: 'prompt', label: '提示词', type: 'string', required: true },
    { name: 'image_url', label: '首帧图片', type: 'image', required: false },
    { name: 'last_frame_url', label: '尾帧图片', type: 'image', required: false },
    { name: 'reference_images', label: '参考图片数组', type: 'array', required: false },
    {
      name: 'motion',
      label: '运动强度',
      type: 'number',
      required: false,
      defaultValue: 5,
      validation: { min: 1, max: 10 },
    },
    {
      name: 'duration',
      label: '时长',
      type: 'number',
      required: false,
      defaultValue: 4,
      validation: { min: 1, max: 10 },
    },
    { name: 'seed', label: '随机种子', type: 'number', required: false },
  ],
  mappings: [
    { id: '1', apiParameter: 'prompt', sourceField: 'storyboard.video_prompt' },
    {
      id: '2',
      apiParameter: 'image_url',
      sourceField: 'reference.first_frame',
      transformation: 'base64',
    },
    {
      id: '3',
      apiParameter: 'last_frame_url',
      sourceField: 'reference.last_frame',
      transformation: 'base64',
    },
    {
      id: '4',
      apiParameter: 'reference_images',
      sourceField: 'reference.assets',
      transformation: 'base64',
    },
    { id: '5', apiParameter: 'motion', sourceField: 'system.random', defaultValue: 5 },
    { id: '6', apiParameter: 'duration', sourceField: 'system.random', defaultValue: 4 },
  ],
  headers: {
    'Content-Type': 'application/json',
    Authorization: 'Bearer {api_key}',
  },
}

/**
 * Stable Diffusion WebUI 模板
 */
export const stableDiffusion_webui: APIEndpoint = {
  id: 'sd_webui',
  name: 'Stable Diffusion WebUI',
  provider: 'stablediffusion',
  baseUrl: 'http://127.0.0.1:7860',
  authType: 'none',
  endpoints: {
    generate: '/sdapi/v1/txt2img',
    status: '/sdapi/v1/progress',
    result: '/sdapi/v1/txt2img',
  },
  parameters: [
    { name: 'prompt', label: '提示词', type: 'string', required: true },
    { name: 'negative_prompt', label: '负面提示词', type: 'string', required: false },
    { name: 'steps', label: '步数', type: 'number', required: false, defaultValue: 20 },
    { name: 'width', label: '宽度', type: 'number', required: false, defaultValue: 512 },
    { name: 'height', label: '高度', type: 'number', required: false, defaultValue: 512 },
    { name: 'cfg_scale', label: 'CFG Scale', type: 'number', required: false, defaultValue: 7 },
    { name: 'seed', label: '随机种子', type: 'number', required: false, defaultValue: -1 },
    {
      name: 'sampler_index',
      label: '采样器',
      type: 'string',
      required: false,
      defaultValue: 'Euler a',
    },
  ],
  mappings: [
    { id: '1', apiParameter: 'prompt', sourceField: 'storyboard.prompt' },
    {
      id: '2',
      apiParameter: 'negative_prompt',
      sourceField: 'project.visual_style',
      defaultValue: 'ugly, deformed, noisy, blurry',
    },
    { id: '3', apiParameter: 'width', sourceField: 'storyboard.width', defaultValue: 512 },
    { id: '4', apiParameter: 'height', sourceField: 'storyboard.height', defaultValue: 512 },
    { id: '5', apiParameter: 'cfg_scale', sourceField: 'system.random', defaultValue: 7 },
  ],
  headers: {
    'Content-Type': 'application/json',
  },
}

/**
 * 预设模板列表
 */
export const apiTemplates: APITemplate[] = [
  {
    id: 'comfyui_txt2img',
    name: 'ComfyUI 文生图',
    provider: 'comfyui',
    description: '使用 ComfyUI 进行文生图的标准配置',
    parameters: (comfyUI_Txt2Img.parameters || []).reduce(
      (acc: Record<string, unknown>, p: { name: string; defaultValue?: unknown }) => ({
        ...acc,
        [p.name]: p.defaultValue,
      }),
      {}
    ),
    mappings: comfyUI_Txt2Img.mappings || [],
  },
  {
    id: 'midjourney_imagine',
    name: 'Midjourney Imagine',
    provider: 'midjourney',
    description: '使用 Midjourney 生成高质量图像',
    parameters: (midjourney_imagine.parameters || []).reduce(
      (acc: Record<string, unknown>, p: { name: string; defaultValue?: unknown }) => ({
        ...acc,
        [p.name]: p.defaultValue,
      }),
      {}
    ),
    mappings: midjourney_imagine.mappings || [],
  },
  {
    id: 'runway_gen2',
    name: 'Runway Gen-2',
    provider: 'runway',
    description: '使用 Runway 生成视频',
    parameters: (runway_gen2.parameters || []).reduce(
      (acc: Record<string, unknown>, p: { name: string; defaultValue?: unknown }) => ({
        ...acc,
        [p.name]: p.defaultValue,
      }),
      {}
    ),
    mappings: runway_gen2.mappings || [],
  },
  {
    id: 'sd_webui',
    name: 'Stable Diffusion WebUI',
    provider: 'stablediffusion',
    description: '使用 SD WebUI 进行文生图',
    parameters: (stableDiffusion_webui.parameters || []).reduce(
      (acc: Record<string, unknown>, p: { name: string; defaultValue?: unknown }) => ({
        ...acc,
        [p.name]: p.defaultValue,
      }),
      {}
    ),
    mappings: stableDiffusion_webui.mappings || [],
  },
]

/**
 * 获取所有预设模板
 */
export function getApiTemplates() {
  return apiTemplates
}

/**
 * 根据提供商获取模板
 */
export function getTemplatesByProvider(provider: string) {
  return apiTemplates.filter(t => t.provider === provider)
}
