import { AI, getAgentModel } from '@/services/vendor/aiService'
import { useUIStore } from '@/store/useUIStore'
import { characterDB, sceneDB, propDB, storyboardDB, dubbingDB, projectDB } from '@/db'
import { saveGeneratedImage, saveGeneratedVideo, saveGeneratedAudio } from '@/utils/mediaStorage'
import { getImageUrl } from '@/utils/asset'
import type { AgentTool, AgentToolResult } from './agentTools'

function getProjectContext() {
  const { currentProjectId, currentEpisodeId } = useUIStore.getState()
  return { projectId: currentProjectId, episodeId: currentEpisodeId }
}

async function getDefaultModel(agentType: 'productionAgent' | 'ttsDubbing' | 'vlAgent'): Promise<string | null> {
  const agentModel = await getAgentModel(agentType)
  if (!agentModel) return null
  return `${agentModel.vendorId}:${agentModel.modelName}`
}

export const generateImageTool: AgentTool = {
  name: 'generate_image',
  description: '根据文字描述生成图片。支持文生图和图生图模式。',
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
      description: '生成模型，默认使用系统配置的图片模型',
    },
  },
  required: ['prompt'],
  execute: async (args): Promise<AgentToolResult> => {
    const { projectId, episodeId } = getProjectContext()
    if (!projectId) return { success: false, error: '请先选择一个项目' }

    try {
      const model = (args.model as string) || await getDefaultModel('productionAgent')
      if (!model) return { success: false, error: '未配置图片生成模型，请在设置中配置 productionAgent' }

      const imageUrl = await AI.Image.generate(
        {
          prompt: args.prompt as string,
          width: (args.width as number) || 1024,
          height: (args.height as number) || 576,
        },
        model,
        0
      )

      if (!imageUrl) return { success: false, error: '图片生成失败，未返回结果' }

      let savedPath = imageUrl
      if (episodeId) {
        try {
          savedPath = await saveGeneratedImage(imageUrl, projectId, episodeId)
        } catch {}
      }

      return {
        success: true,
        data: { url: savedPath, displayUrl: getImageUrl(savedPath) || savedPath },
        display: `图片生成成功！`,
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
      description: '视频内容描述提示词',
    },
    firstImageUrl: {
      type: 'string',
      description: '首帧图片URL或本地路径（图生视频模式必填）',
    },
    duration: {
      type: 'number',
      description: '视频时长（秒），默认5秒',
    },
    model: {
      type: 'string',
      description: '生成模型，默认使用系统配置的视频模型',
    },
  },
  required: ['prompt'],
  execute: async (args): Promise<AgentToolResult> => {
    const { projectId, episodeId } = getProjectContext()
    if (!projectId) return { success: false, error: '请先选择一个项目' }

    try {
      const model = (args.model as string) || await getDefaultModel('productionAgent')
      if (!model) return { success: false, error: '未配置视频生成模型，请在设置中配置 productionAgent' }

      const videoUrl = await AI.Video.generate(
        {
          prompt: args.prompt as string,
          firstImageBase64: (args.firstImageUrl as string) || undefined,
          width: (args.width as number) || 1280,
          height: (args.height as number) || 720,
          duration: (args.duration as number) || 5,
          generateAudio: false,
        },
        model,
        0
      )

      if (!videoUrl) return { success: false, error: '视频生成失败，未返回结果' }

      let savedPath = videoUrl
      if (episodeId) {
        try {
          savedPath = await saveGeneratedVideo(videoUrl, projectId, episodeId)
        } catch {}
      }

      return {
        success: true,
        data: { url: savedPath },
        display: `视频生成成功！`,
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  },
}

export const generateTTSTool: AgentTool = {
  name: 'generate_tts',
  description: '将文本转换为语音（TTS文字转语音）。',
  parameters: {
    text: {
      type: 'string',
      description: '要转换为语音的文本内容',
    },
    voice: {
      type: 'string',
      description: '语音音色，默认使用系统配置',
    },
    emotion: {
      type: 'string',
      description: '情绪状态，如：开心、悲伤、愤怒、平静等',
    },
  },
  required: ['text'],
  execute: async (args): Promise<AgentToolResult> => {
    const { projectId, episodeId } = getProjectContext()
    if (!projectId) return { success: false, error: '请先选择一个项目' }

    try {
      const model = await getDefaultModel('ttsDubbing')
      if (!model) return { success: false, error: '未配置语音生成模型，请在设置中配置 ttsDubbing' }

      const audioUrl = await AI.Audio.generate(
        {
          text: args.text as string,
          voice: (args.voice as string) || 'default',
          emotion: (args.emotion as string) || undefined,
        },
        model,
        0
      )

      if (!audioUrl) return { success: false, error: '语音生成失败，未返回结果' }

      let savedPath = audioUrl as string
      if (episodeId) {
        try {
          savedPath = await saveGeneratedAudio(audioUrl as string, projectId, episodeId)
        } catch {}
      }

      return {
        success: true,
        data: { url: savedPath },
        display: `语音生成成功！`,
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  },
}

export const analyzeImageTool: AgentTool = {
  name: 'analyze_image',
  description: '分析图片内容，可用于反推提示词、识别图片中的元素等。',
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
        case 'project':
          data = await projectDB.getById(projectId)
          break
        case 'characters':
          data = await characterDB.getByEpisode(episodeId || '')
          break
        case 'scenes':
          data = await sceneDB.getByEpisode(episodeId || '')
          break
        case 'props':
          data = await propDB.getByEpisode(episodeId || '')
          break
        case 'storyboards':
          data = await storyboardDB.getAll(episodeId || '')
          break
        case 'dubbings':
          data = await dubbingDB.getByEpisode(episodeId || '')
          break
        default:
          return { success: false, error: `未知资产类型: ${assetType}` }
      }

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

export const builtInTools: AgentTool[] = [
  generateImageTool,
  generateVideoTool,
  generateTTSTool,
  analyzeImageTool,
  getProjectInfoTool,
]
