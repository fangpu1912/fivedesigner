import { characterDB, sceneDB, propDB, storyboardDB, dubbingDB, projectDB } from '@/db'
import {
  runScreenwriterAgent,
  runCharacterExtractorAgent,
  runStoryboardArtistAgent,
} from '@/plugins/vimax/services/agents'
import {
  createScript2VideoPipeline,
  runScript2VideoPipeline,
  createIdea2VideoPipeline,
  runIdea2VideoPipeline,
  createNovel2VideoPipeline,
  runNovel2VideoPipeline,
} from '@/plugins/vimax/services/pipelines'
import { getComfyUIService } from '@/services/comfyuiService'
import { getWorkflowConfigs } from '@/services/workflowConfigService'
import { vendorConfigService } from '@/services/vendor/configService'
import { AI } from '@/services/vendor/aiService'
import { useUIStore } from '@/store/useUIStore'
import { getImageUrl } from '@/utils/asset'
import { saveGeneratedImage, saveGeneratedVideo, saveGeneratedAudio } from '@/utils/mediaStorage'

import type { AgentTool, AgentToolResult } from './agentTools'

function getProjectContext() {
  const { currentProjectId, currentEpisodeId } = useUIStore.getState()
  return { projectId: currentProjectId, episodeId: currentEpisodeId }
}

/**
 * 获取所有可用的图片生成模型列表
 */
async function getAvailableImageModels(): Promise<Array<{ id: string; name: string; vendor: string }>> {
  const vendors = await vendorConfigService.getAllVendors()
  const models: Array<{ id: string; name: string; vendor: string }> = []
  for (const vendor of vendors) {
    if (!vendor.enable) continue
    for (const model of vendor.models || []) {
      if (model.type === 'image') {
        models.push({
          id: `${vendor.id}:${model.modelName}`,
          name: `${vendor.name} - ${model.modelName}`,
          vendor: vendor.id,
        })
      }
    }
  }
  return models
}

/**
 * 获取所有可用的视频生成模型列表
 */
async function getAvailableVideoModels(): Promise<Array<{ id: string; name: string; vendor: string }>> {
  const vendors = await vendorConfigService.getAllVendors()
  const models: Array<{ id: string; name: string; vendor: string }> = []
  for (const vendor of vendors) {
    if (!vendor.enable) continue
    for (const model of vendor.models || []) {
      if (model.type === 'video') {
        models.push({
          id: `${vendor.id}:${model.modelName}`,
          name: `${vendor.name} - ${model.modelName}`,
          vendor: vendor.id,
        })
      }
    }
  }
  return models
}

/**
 * 获取第一个可用的图片生成模型
 */
async function getDefaultImageModel(): Promise<string | null> {
  const models = await getAvailableImageModels()
  return models.length > 0 ? models[0]!.id : null
}

/**
 * 获取第一个可用的视频生成模型
 */
async function getDefaultVideoModel(): Promise<string | null> {
  const models = await getAvailableVideoModels()
  return models.length > 0 ? models[0]!.id : null
}

export const generateImageTool: AgentTool = {
  name: 'generate_image',
  description: '根据文字描述生成图片。支持使用 AI 供应商模型或 ComfyUI 工作流生成。',
  parameters: {
    prompt: {
      type: 'string',
      description: '图片生成提示词，描述你想要生成的画面内容',
    },
    width: {
      type: 'number',
      description: '图片宽度，默认1024',
    },
    height: {
      type: 'number',
      description: '图片高度，默认576',
    },
    model: {
      type: 'string',
      description: 'AI 生成模型 ID（如 geekai:doubao-seedream-5-0），不传则使用默认模型',
    },
    workflowId: {
      type: 'string',
      description: 'ComfyUI 工作流 ID，传入则使用 ComfyUI 生成而非 AI 供应商',
    },
  },
  required: ['prompt'],
  execute: async (args): Promise<AgentToolResult> => {
    const { projectId, episodeId } = getProjectContext()
    if (!projectId) return { success: false, error: '请先选择一个项目' }

    try {
      // 如果指定了工作流 ID，使用 ComfyUI 生成
      const workflowId = args.workflowId as string | undefined
      if (workflowId) {
        const configs = getWorkflowConfigs()
        const workflowConfig = configs.find((c) => c.id === workflowId)
        if (!workflowConfig) {
          return { success: false, error: `未找到工作流: ${workflowId}` }
        }

        const comfyUI = getComfyUIService()
        comfyUI.setContext(projectId, episodeId || undefined)

        const images = await comfyUI.generateImage(workflowConfig, args.prompt as string)
        if (!images || images.length === 0) {
          return { success: false, error: 'ComfyUI 生成失败，未返回图片' }
        }

        return {
          success: true,
          data: { url: images[0], displayUrl: images[0] },
          display: `图片生成成功！(ComfyUI 工作流: ${workflowConfig.name})`,
        }
      }

      // 使用 AI 供应商生成
      const model = (args.model as string) || await getDefaultImageModel()
      if (!model) {
        return {
          success: false,
          error: '未找到可用的图片生成模型。请先在设置中配置图片生成供应商，或指定 ComfyUI 工作流。',
        }
      }

      const imageUrl = await AI.Image.generate(
        {
          prompt: args.prompt as string,
          aspectRatio: `${(args.width as number) || 1024}:${(args.height as number) || 576}`,
        },
        model,
        0
      )

      if (!imageUrl) return { success: false, error: '图片生成失败，未返回结果' }

      // 保存图片到本地（有 episodeId 保存到项目目录，没有则保存到 temp 目录）
      let savedPath = imageUrl
      try {
        savedPath = await saveGeneratedImage(imageUrl, projectId, episodeId || '')
      } catch (saveError) {
        console.warn('[generate_image] 保存图片失败，使用原始 URL:', saveError)
        savedPath = imageUrl
      }

      // 确保 displayUrl 正确转换
      const displayUrl = getImageUrl(savedPath) || savedPath

      return {
        success: true,
        data: { url: savedPath, displayUrl },
        display: `图片生成成功！(模型: ${model})\n\n![生成的图片](${displayUrl})`,
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  },
}

export const generateVideoTool: AgentTool = {
  name: 'generate_video',
  description: '根据提示词或首帧图片生成视频。支持文生视频和图生视频模式。',
  parameters: {
    prompt: {
      type: 'string',
      description: '视频生成提示词',
    },
    firstFrame: {
      type: 'string',
      description: '首帧图片路径或URL（可选，用于图生视频）',
    },
    lastFrame: {
      type: 'string',
      description: '尾帧图片路径或URL（可选，用于首尾帧生视频）',
    },
    duration: {
      type: 'number',
      description: '视频时长（秒），默认5秒',
    },
    model: {
      type: 'string',
      description: 'AI 视频生成模型 ID（如 kling:Kling-Video），不传则使用默认模型',
    },
  },
  required: ['prompt'],
  execute: async (args): Promise<AgentToolResult> => {
    const { projectId, episodeId } = getProjectContext()
    if (!projectId) return { success: false, error: '请先选择一个项目' }

    try {
      const model = (args.model as string) || await getDefaultVideoModel()
      if (!model) {
        return {
          success: false,
          error: '未找到可用的视频生成模型。请先在设置中配置视频生成供应商（如可灵、海螺、Vidu 等）。',
        }
      }

      const videoUrl = await AI.Video.generate(
        {
          prompt: args.prompt as string,
          duration: (args.duration as number) || 5,
        },
        model
      )

      if (!videoUrl) return { success: false, error: '视频生成失败，未返回结果' }

      // 保存视频到本地（有 episodeId 保存到项目目录，没有则保存到 temp 目录）
      let savedPath = videoUrl
      try {
        savedPath = await saveGeneratedVideo(videoUrl, projectId, episodeId || '')
      } catch (saveError) {
        console.warn('[generate_video] 保存视频失败，使用原始 URL:', saveError)
        savedPath = videoUrl
      }

      // 确保 displayUrl 正确转换
      const displayUrl = getImageUrl(savedPath) || savedPath

      return {
        success: true,
        data: { url: savedPath, displayUrl },
        display: `视频生成成功！(模型: ${model})\n\n[点击播放视频](${displayUrl})`,
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  },
}

export const generateTTSTool: AgentTool = {
  name: 'generate_tts',
  description: '根据文本生成配音音频。支持多种音色和情感。',
  parameters: {
    text: {
      type: 'string',
      description: '要转换为语音的文本内容',
    },
    voice: {
      type: 'string',
      description: '音色ID，默认使用系统配置的默认音色',
    },
    speed: {
      type: 'number',
      description: '语速，范围0.5-2.0，默认1.0',
    },
    emotion: {
      type: 'string',
      description: '情感类型，如开心、悲伤、愤怒等',
    },
  },
  required: ['text'],
  execute: async (args): Promise<AgentToolResult> => {
    const { projectId, episodeId } = getProjectContext()
    if (!projectId) return { success: false, error: '请先选择一个项目' }

    try {
      const audioUrl = await AI.Audio.generate({
        text: args.text as string,
        voice: args.voice as string,
        speed: (args.speed as number) || 1.0,
        emotion: args.emotion as string,
      }, 'official:default')

      if (!audioUrl) return { success: false, error: '配音生成失败，未返回结果' }

      let savedPath = audioUrl
      if (episodeId) {
        try {
          savedPath = await saveGeneratedAudio(audioUrl, projectId, episodeId)
        } catch {
          // 忽略保存错误，使用原始 URL
        }
      }

      return {
        success: true,
        data: { url: savedPath, displayUrl: getImageUrl(savedPath) || savedPath },
        display: `配音生成成功！`,
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  },
}

export const analyzeImageTool: AgentTool = {
  name: 'analyze_image',
  description: '分析图片内容，可以反推提示词、描述画面内容、检查角色一致性等。',
  parameters: {
    imageUrl: {
      type: 'string',
      description: '要分析的图片URL或本地路径',
    },
    question: {
      type: 'string',
      description: '对图片提出的问题，如"描述这张图片的内容"或"反推生成提示词"',
    },
  },
  required: ['imageUrl', 'question'],
  execute: async (args): Promise<AgentToolResult> => {
    try {
      const result = await AI.VL.analyze({
        messages: [
          { role: 'user', content: args.question as string },
          { role: 'user', content: `图片: ${args.imageUrl}` },
        ],
        temperature: 0.7,
        maxTokens: 2048,
      })

      return {
        success: true,
        data: { analysis: result },
        display: `图片分析结果：${typeof result === 'string' ? result : JSON.stringify(result)}`,
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  },
}

export const getProjectInfoTool: AgentTool = {
  name: 'get_project_info',
  description: '获取当前项目信息，包括角色、场景、道具、分镜等资产列表。',
  parameters: {
    assetType: {
      type: 'string',
      description: '要查询的资产类型',
      enum: ['characters', 'scenes', 'props', 'storyboards', 'dubbings', 'project'],
    },
  },
  required: ['assetType'],
  execute: async (args): Promise<AgentToolResult> => {
    const { projectId, episodeId } = getProjectContext()
    if (!projectId) return { success: false, error: '请先选择一个项目' }

    try {
      const assetType = args.assetType as string
      let data: unknown

      switch (assetType) {
        case 'characters':
          data = await characterDB.getByProject(projectId)
          break
        case 'scenes':
          data = await sceneDB.getByProject(projectId)
          break
        case 'props':
          data = await propDB.getByProject(projectId)
          break
        case 'storyboards':
          data = await storyboardDB.getAll(episodeId || '')
          break
        case 'dubbings':
          data = await dubbingDB.getByEpisode(episodeId || '')
          break
        case 'project':
          data = await projectDB.getById(projectId)
          break
        default:
          return { success: false, error: `未知资产类型: ${assetType}` }
      }
      void episodeId

      const items = Array.isArray(data) ? data : [data]
      const summary = Array.isArray(data)
        ? `${assetType}共 ${items.length} 项`
        : `项目信息已获取`

      return {
        success: true,
        data,
        display: summary,
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  },
}

// ==================== ViMax Agent Tools ====================

export const vimaxScreenwriterTool: AgentTool = {
  name: 'vimax_screenwriter',
  description: 'ViMax 编剧 Agent：根据创意想法、故事梗概或小说片段生成完整的剧本。支持多种输入类型（idea/novel/script）。',
  parameters: {
    inputType: {
      type: 'string',
      description: '输入类型',
      enum: ['idea', 'novel', 'script'],
    },
    content: {
      type: 'string',
      description: '输入内容：创意想法、小说片段或现有剧本',
    },
    style: {
      type: 'string',
      description: '视频风格描述，如"赛博朋克"、"日式动漫"、"写实风格"等',
    },
    requirement: {
      type: 'string',
      description: '额外要求或限制条件',
    },
  },
  required: ['inputType', 'content'],
  execute: async (args): Promise<AgentToolResult> => {
    const { projectId, episodeId } = getProjectContext()
    if (!projectId) return { success: false, error: '请先选择一个项目' }

    try {
      const result = await runScreenwriterAgent({
        type: args.inputType as 'idea' | 'novel' | 'script',
        content: args.content as string,
        style: (args.style as string) || '写实风格',
      }, { projectId, episodeId: episodeId || undefined, messages: [], tools: [] })

      return {
        success: true,
        data: result,
        display: `剧本生成完成！共 ${result.script.scenes?.length || 0} 个场景，${result.script.characters?.length || 0} 个角色。`,
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  },
}

export const vimaxCharacterExtractorTool: AgentTool = {
  name: 'vimax_extract_characters',
  description: 'ViMax 角色提取 Agent：从剧本中提取角色信息，包括静态特征（外貌、体型）和动态特征（服装、配饰）。',
  parameters: {
    script: {
      type: 'string',
      description: '剧本内容',
    },
  },
  required: ['script'],
  execute: async (args): Promise<AgentToolResult> => {
    const { projectId, episodeId } = getProjectContext()
    if (!projectId) return { success: false, error: '请先选择一个项目' }

    try {
      void episodeId
      const result = await runCharacterExtractorAgent({
        script: args.script as string,
      })

      return {
        success: true,
        data: result,
        display: `角色提取完成！共提取 ${result.characters?.length || 0} 个角色。`,
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  },
}

export const vimaxStoryboardTool: AgentTool = {
  name: 'vimax_design_storyboard',
  description: 'ViMax 分镜设计 Agent：根据剧本和角色信息设计分镜，包括镜头角度、视觉描述、音频描述等。',
  parameters: {
    script: {
      type: 'string',
      description: '剧本内容',
    },
    characters: {
      type: 'string',
      description: '角色信息 JSON 字符串',
    },
    style: {
      type: 'string',
      description: '视觉风格',
    },
  },
  required: ['script'],
  execute: async (args): Promise<AgentToolResult> => {
    const { projectId, episodeId } = getProjectContext()
    if (!projectId) return { success: false, error: '请先选择一个项目' }

    try {
      void episodeId
      const result = await runStoryboardArtistAgent({
        scene: args.script ? JSON.parse(args.script as string) : { id: '', name: '', description: '', prompt: '', characters: [], props: [] },
        characters: args.characters ? JSON.parse(args.characters as string) : [],
      })

      return {
        success: true,
        data: result,
        display: `分镜设计完成！共设计 ${result.shots?.length || 0} 个分镜。`,
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  },
}

export const vimaxPipelineTool: AgentTool = {
  name: 'vimax_pipeline',
  description: 'ViMax Pipeline：执行完整的视频生成流水线。支持 script2video（剧本→视频）、idea2video（创意→视频）、novel2video（小说→视频）三种模式。',
  parameters: {
    pipelineType: {
      type: 'string',
      description: 'Pipeline 类型',
      enum: ['script2video', 'idea2video', 'novel2video'],
    },
    content: {
      type: 'string',
      description: '输入内容：剧本、创意想法或小说片段',
    },
    style: {
      type: 'string',
      description: '视觉风格',
    },
    generateVideo: {
      type: 'boolean',
      description: '是否生成视频（true）或仅生成分镜图片（false）',
    },
  },
  required: ['pipelineType', 'content'],
  execute: async (args): Promise<AgentToolResult> => {
    const { projectId, episodeId } = getProjectContext()
    if (!projectId) return { success: false, error: '请先选择一个项目' }

    try {
      const pipelineType = args.pipelineType as string
      void args.style
      void args.generateVideo

      let result: unknown

      switch (pipelineType) {
        case 'script2video': {
          const scriptState = createScript2VideoPipeline({
            script: { title: '', summary: '', scenes: [], shots: [], characters: [] },
            projectId,
            episodeId: episodeId || undefined,
          })
          result = await runScript2VideoPipeline(scriptState, {
            script: { title: '', summary: '', scenes: [], shots: [], characters: [] },
            projectId,
            episodeId: episodeId || undefined,
          })
          break
        }
        case 'idea2video': {
          const ideaState = createIdea2VideoPipeline({
            idea: { content: args.content as string },
            projectId,
            episodeId: episodeId || undefined,
          })
          result = await runIdea2VideoPipeline(ideaState, {
            idea: { content: args.content as string },
            projectId,
            episodeId: episodeId || undefined,
          })
          break
        }
        case 'novel2video': {
          const novelState = createNovel2VideoPipeline({
            novel: { title: '', content: args.content as string },
            projectId,
            episodeId: episodeId || undefined,
          })
          result = await runNovel2VideoPipeline(novelState, {
            novel: { title: '', content: args.content as string },
            projectId,
            episodeId: episodeId || undefined,
          })
          break
        }
        default:
          return { success: false, error: `未知的 Pipeline 类型: ${pipelineType}` }
      }

      return {
        success: true,
        data: result,
        display: `Pipeline 执行完成！类型: ${pipelineType}`,
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  },
}

export const listImageModelsTool: AgentTool = {
  name: 'list_image_models',
  description: '列出所有图片生成模型（包括未启用的）和 ComfyUI 工作流，供用户选择。',
  parameters: {},
  required: [],
  execute: async (): Promise<AgentToolResult> => {
    try {
      const vendors = await vendorConfigService.getAllVendors()
      const enabledModels: Array<{ id: string; name: string; vendor: string }> = []
      const disabledModels: Array<{ id: string; name: string; vendor: string }> = []

      for (const vendor of vendors) {
        for (const model of vendor.models || []) {
          if (model.type === 'image') {
            const item = {
              id: `${vendor.id}:${model.modelName}`,
              name: `${vendor.name} - ${model.name}`,
              vendor: vendor.id,
            }
            if (vendor.enable) {
              enabledModels.push(item)
            } else {
              disabledModels.push(item)
            }
          }
        }
      }

      const workflows = getWorkflowConfigs().filter((w) => w.type === 'txt2img' || w.type === 'img2img')

      const enabledList = enabledModels.map((m) => `  ✅ ${m.id}: ${m.name}`).join('\n') || '  暂无已启用的模型'
      const disabledList = disabledModels.map((m) => `  ❌ ${m.id}: ${m.name} (供应商未启用)`).join('\n') || '  暂无未启用的模型'
      const workflowList = workflows.map((w) => `  - ${w.id}: ${w.name} (${w.type})`).join('\n') || '  暂无可用工作流'

      const vendorSummary = vendors.map(v => `${v.name}: enable=${v.enable}, models=${v.models?.length || 0}`).join('\n')

      return {
        success: true,
        data: { enabledModels, disabledModels, workflows },
        display: `【已启用的 AI 图片模型】\n${enabledList}\n\n【未启用的 AI 图片模型】\n${disabledList}\n\n【ComfyUI 工作流】\n${workflowList}\n\n【供应商状态】\n${vendorSummary}\n\n使用说明：\n- 已启用模型：直接在 generate_image 的 model 参数中传入模型 ID\n- 未启用模型：先去设置 → AI 供应商中启用对应供应商\n- ComfyUI 工作流：在 generate_image 的 workflowId 参数中传入工作流 ID`,
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  },
}

export const listVideoModelsTool: AgentTool = {
  name: 'list_video_models',
  description: '列出所有视频生成模型（包括未启用的），供用户选择。',
  parameters: {},
  required: [],
  execute: async (): Promise<AgentToolResult> => {
    try {
      const vendors = await vendorConfigService.getAllVendors()
      const enabledModels: Array<{ id: string; name: string; vendor: string }> = []
      const disabledModels: Array<{ id: string; name: string; vendor: string }> = []

      for (const vendor of vendors) {
        for (const model of vendor.models || []) {
          if (model.type === 'video') {
            const item = {
              id: `${vendor.id}:${model.modelName}`,
              name: `${vendor.name} - ${model.name}`,
              vendor: vendor.id,
            }
            if (vendor.enable) {
              enabledModels.push(item)
            } else {
              disabledModels.push(item)
            }
          }
        }
      }

      const enabledList = enabledModels.map((m) => `  ✅ ${m.id}: ${m.name}`).join('\n') || '  暂无已启用的模型'
      const disabledList = disabledModels.map((m) => `  ❌ ${m.id}: ${m.name} (供应商未启用)`).join('\n') || '  暂无未启用的模型'

      return {
        success: true,
        data: { enabledModels, disabledModels },
        display: `【已启用的视频生成模型】\n${enabledList}\n\n【未启用的视频生成模型】\n${disabledList}\n\n使用说明：\n- 已启用模型：直接在 generate_video 的 model 参数中传入模型 ID\n- 未启用模型：先去设置 → AI 供应商中启用对应供应商`,
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  },
}

export const builtInTools: AgentTool[] = [
  generateImageTool,
  generateVideoTool,
  generateTTSTool,
  analyzeImageTool,
  getProjectInfoTool,
  listImageModelsTool,
  listVideoModelsTool,
  vimaxScreenwriterTool,
  vimaxCharacterExtractorTool,
  vimaxStoryboardTool,
  vimaxPipelineTool,
]
