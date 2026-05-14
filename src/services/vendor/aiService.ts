/**
 * AI服务核心类
 */

import { vendorConfigService } from './configService'
import { vendorSandbox } from './vendorSandbox'
import type {
  VendorConfig,
  AiType,
  ImageConfig,
  VideoConfig,
  TTSConfig,
  TTSVoiceInfo,
} from './types'

async function executeVendorCode(
  code: string,
  config: VendorConfig,
  method: string,
  model: any,
  input?: any
): Promise<any> {
  return vendorSandbox.execute(code, config, method, model, input)
}

// 解析模型名称
function resolveModelName(value: AiType | `${string}:${string}`): {
  vendorId: string | null
  modelName: string
} {
  // 检查是否是Agent类型
  const agentTypes: AiType[] = ['scriptAgent', 'productionAgent', 'universalAi', 'vlAgent', 'ttsDubbing']
  if (agentTypes.includes(value as AiType)) {
    return { vendorId: null, modelName: value as string }
  }

  // 解析 vendorId:modelName 格式
  const parts = value.split(':')
  if (parts.length === 2) {
    return { vendorId: parts[0]!, modelName: parts[1]! }
  }

  // 默认格式
  return { vendorId: null, modelName: value }
}

// 获取Agent部署配置
async function getAgentModel(agentType: AiType): Promise<{ vendorId: string; modelName: string } | null> {
  const agent = await vendorConfigService.getAgent(agentType)
  console.log('getAgentModel:', agentType, agent)
  if (!agent || agent.disabled || !agent.modelName) {
    console.log('Agent not found or disabled or no modelName')
    return null
  }

  // 优先使用agent.vendorId，如果没有再从modelName解析
  if (agent.vendorId && agent.vendorId.trim() !== '') {
    console.log('Using agent.vendorId:', agent.vendorId)
    return { vendorId: agent.vendorId, modelName: agent.modelName }
  }

  const resolved = resolveModelName(agent.modelName as `${string}:${string}`)
  console.log('Resolved from modelName:', resolved)
  if (resolved.vendorId) {
    return { vendorId: resolved.vendorId, modelName: resolved.modelName }
  }

  return null
}

// 任务记录包装器
async function withTaskRecord<T>(
  taskClass: string,
  describe: string,
  model: string,
  projectId: number,
  fn: (updateTask: (state: number, reason?: string) => Promise<void>) => Promise<T>
): Promise<T> {
  // 创建任务记录
  const updateTask = await vendorConfigService.createTask({
    projectId,
    taskClass,
    relatedObjects: '',
    model,
    describe,
    state: 'running',
    startTime: Date.now(),
  })

  try {
    const result = await fn(updateTask)
    await updateTask(1) // 成功
    return result
  } catch (error) {
    await updateTask(-1, error instanceof Error ? error.message : String(error)) // 失败
    throw error
  }
}

// AI文本服务
export class AiText {
  static async generate(
    params: {
      messages: { role: string; content: string }[]
      temperature?: number
      maxTokens?: number
    },
    modelName?: string,
    projectId: number = 0
  ): Promise<string> {
    console.log('[AiText.generate] 开始生成，传入modelName:', modelName)

    // 如果没有指定模型，使用universalAi
    if (!modelName) {
      console.log('[AiText.generate] 未指定模型，尝试获取universalAi配置')
      const agent = await vendorConfigService.getAgent('universalAi')
      console.log('[AiText.generate] 获取到的agent:', agent)

      if (!agent) {
        console.error('[AiText.generate] 未找到通用AI配置')
        throw new Error('未找到通用AI配置，请在AI服务设置中配置')
      }
      if (agent.disabled) {
        console.error('[AiText.generate] 通用AI已禁用')
        throw new Error('通用AI已禁用，请在AI服务设置中启用')
      }
      if (!agent.modelName) {
        console.error('[AiText.generate] 通用AI未配置模型')
        throw new Error('通用AI未配置模型，请在AI服务 -> Agent配置中选择模型')
      }

      console.log('[AiText.generate] agent.modelName:', agent.modelName, 'agent.vendorId:', agent.vendorId)

      const agentModel = await getAgentModel('universalAi')
      console.log('[AiText.generate] 解析后的agentModel:', agentModel)

      if (!agentModel) {
        console.error('[AiText.generate] 无法解析agentModel，agent.modelName:', agent.modelName, 'agent.vendorId:', agent.vendorId)
        throw new Error('通用AI模型配置无效，请检查Agent配置中的模型选择')
      }
      modelName = `${agentModel.vendorId}:${agentModel.modelName}`
      console.log('[AiText.generate] 最终modelName:', modelName)
    }

    const { vendorId, modelName: resolvedModelName } = resolveModelName(modelName as `${string}:${string}`)
    console.log('[AiText.generate] 解析modelName:', { vendorId, resolvedModelName })

    if (!vendorId) {
      console.error('[AiText.generate] 无效的模型名称，无法解析vendorId:', modelName)
      throw new Error(`无效的模型名称: ${modelName}，格式应为 "vendorId:modelName"`)
    }

    const vendor = await vendorConfigService.getVendor(vendorId)
    console.log('[AiText.generate] 获取供应商:', vendorId, vendor ? '成功' : '失败')

    if (!vendor || !vendor.enable) {
      console.error('[AiText.generate] 供应商未启用:', vendorId)
      throw new Error(`供应商未启用: ${vendorId}`)
    }

    const model = vendor.models.find((m) => m.modelName === resolvedModelName && m.type === 'text')
    console.log('[AiText.generate] 查找模型:', resolvedModelName, model ? '成功' : '失败')

    if (!model) {
      console.error('[AiText.generate] 模型不存在:', resolvedModelName, '供应商可用模型:', vendor.models.map(m => m.modelName))
      throw new Error(`模型不存在: ${resolvedModelName}，请检查供应商配置`)
    }

    console.log('[AiText.generate] 开始执行生成任务')

    return withTaskRecord(
      'text',
      `文本生成: ${params.messages[0]?.content?.slice(0, 50)}...`,
      modelName,
      projectId,
      async (_updateTask) => {
        try {
          const result = await executeVendorCode(vendor.code, vendor, 'textRequest', model, params)
          console.log('[AiText.generate] 生成成功')
          return result
        } catch (error) {
          console.error('[AiText.generate] 生成失败:', error)
          throw error
        }
      }
    )
  }
}

// AI图片服务
export class AiImage {
  static async generate(
    config: ImageConfig,
    modelName: string,
    projectId: number = 0
  ): Promise<string> {
    const { vendorId, modelName: resolvedModelName } = resolveModelName(modelName as `${string}:${string}`)

    if (!vendorId) {
      throw new Error(`无效的模型名称: ${modelName}`)
    }

    const vendor = await vendorConfigService.getVendor(vendorId)
    if (!vendor || !vendor.enable) {
      throw new Error(`供应商未启用: ${vendorId}`)
    }

    const model = vendor.models.find((m) => m.modelName === resolvedModelName && m.type === 'image')
    if (!model) {
      throw new Error(`模型不存在: ${resolvedModelName}`)
    }

    return withTaskRecord(
      'image',
      `图片生成: ${config.prompt.slice(0, 50)}...`,
      modelName,
      projectId,
      async () => {
        const result = await executeVendorCode(vendor.code, vendor, 'imageRequest', model, config)
        return result
      }
    )
  }
}

// AI视频服务
export class AiVideo {
  static async generate(
    config: VideoConfig,
    modelName: string,
    projectId: number = 0
  ): Promise<string> {
    const { vendorId, modelName: resolvedModelName } = resolveModelName(modelName as `${string}:${string}`)

    if (!vendorId) {
      throw new Error(`无效的模型名称: ${modelName}`)
    }

    const vendor = await vendorConfigService.getVendor(vendorId)
    console.log('[AiVideo.generate] 供应商配置:', {
      id: vendor?.id,
      enable: vendor?.enable,
      inputValues: vendor?.inputValues ? Object.keys(vendor.inputValues) : '无',
      hasApiKey: vendor?.inputValues?.apiKey ? '有' : '无',
    })
    if (!vendor || !vendor.enable) {
      throw new Error(`供应商未启用: ${vendorId}`)
    }

    const model = vendor.models.find((m) => m.modelName === resolvedModelName && m.type === 'video')
    if (!model) {
      throw new Error(`模型不存在: ${resolvedModelName}`)
    }

    return withTaskRecord(
      'video',
      `视频生成: ${config.prompt.slice(0, 50)}...`,
      modelName,
      projectId,
      async () => {
        const result = await executeVendorCode(vendor.code, vendor, 'videoRequest', model, config)
        return result
      }
    )
  }
}

// AI语音服务
export class AiAudio {
  static async generate(
    config: TTSConfig,
    modelName: string,
    projectId: number = 0
  ): Promise<string> {
    const { vendorId, modelName: resolvedModelName } = resolveModelName(modelName as `${string}:${string}`)

    if (!vendorId) {
      throw new Error(`无效的模型名称: ${modelName}`)
    }

    const vendor = await vendorConfigService.getVendor(vendorId)
    if (!vendor || !vendor.enable) {
      throw new Error(`供应商未启用: ${vendorId}`)
    }

    const model = vendor.models.find((m) => m.modelName === resolvedModelName && m.type === 'tts')
    if (!model) {
      throw new Error(`模型不存在: ${resolvedModelName}`)
    }

    return withTaskRecord(
      'tts',
      `语音生成: ${config.text.slice(0, 50)}...`,
      modelName,
      projectId,
      async () => {
        const result = await executeVendorCode(vendor.code, vendor, 'ttsRequest', model, config)
        return result
      }
    )
  }

  /**
   * 上传音频文件用于声音克隆
   * @param audioFile 音频文件
   * @param vendorId 供应商ID
   * @returns 上传结果，包含 fileId
   */
  static async uploadVoiceCloneAudio(
    audioFile: File,
    vendorId: string,
    projectId: number = 0
  ): Promise<{ fileId: string | number; voiceId?: string }> {
    const vendor = await vendorConfigService.getVendor(vendorId)
    if (!vendor || !vendor.enable) {
      throw new Error(`供应商未启用: ${vendorId}`)
    }

    // 检查供应商是否支持声音克隆
    const hasVoiceClone = vendor.models.some((m) => m.type === 'tts')
    if (!hasVoiceClone) {
      throw new Error(`供应商 ${vendorId} 不支持 TTS 声音克隆`)
    }

    return withTaskRecord(
      'tts_upload',
      `上传声音克隆音频: ${audioFile.name}`,
      `${vendorId}:voice_clone`,
      projectId,
      async () => {
        // 创建 FormData
        const formData = new FormData()
        formData.append('file', audioFile)
        formData.append('purpose', 'voice_clone')

        const result = await executeVendorCode(
          vendor.code,
          vendor,
          'voiceCloneUploadRequest',
          { modelName: 'voice_clone' },
          { formData }
        )

        if (!result || !result.fileId) {
          throw new Error('上传声音克隆音频失败: 未返回 fileId')
        }

        return { fileId: result.fileId, voiceId: result.voiceId }
      }
    )
  }

  /**
   * 使用克隆的声音生成语音
   * @param config TTS 配置，需要包含 fileId 或 voiceId
   * @param modelName 模型名称
   * @param projectId 项目ID
   * @returns 生成的音频 URL
   */
  static async generateWithClonedVoice(
    config: TTSConfig,
    modelName: string,
    projectId: number = 0
  ): Promise<string> {
    const { vendorId, modelName: resolvedModelName } = resolveModelName(modelName as `${string}:${string}`)

    if (!vendorId) {
      throw new Error(`无效的模型名称: ${modelName}`)
    }

    if (!config.fileId && !config.voiceId) {
      throw new Error('声音克隆需要提供 fileId 或 voiceId')
    }

    const vendor = await vendorConfigService.getVendor(vendorId)
    if (!vendor || !vendor.enable) {
      throw new Error(`供应商未启用: ${vendorId}`)
    }

    const model = vendor.models.find((m) => m.modelName === resolvedModelName && m.type === 'tts')
    if (!model) {
      throw new Error(`模型不存在: ${resolvedModelName}`)
    }

    return withTaskRecord(
      'tts_clone',
      `克隆语音生成: ${config.text.slice(0, 50)}...`,
      modelName,
      projectId,
      async () => {
        const result = await executeVendorCode(
          vendor.code,
          vendor,
          'voiceCloneRequest',
          model,
          config
        )
        return result
      }
    )
  }

  /**
   * 获取 TTS 可用音色列表
   * @param vendorId 供应商ID
   * @returns 音色列表
   */
  static async getVoices(vendorId: string): Promise<TTSVoiceInfo[]> {
    const vendor = await vendorConfigService.getVendor(vendorId)
    if (!vendor || !vendor.enable) {
      throw new Error(`供应商未启用: ${vendorId}`)
    }

    // 从模型配置中提取音色信息
    const ttsModels = vendor.models.filter((m) => m.type === 'tts')
    const voices: TTSVoiceInfo[] = []

    for (const model of ttsModels) {
      if ('voices' in model && Array.isArray(model.voices)) {
        for (const v of model.voices) {
          voices.push({
            id: v.voice,
            name: v.title,
            language: 'zh-CN',
            gender: 'neutral',
          })
        }
      }
    }

    return voices
  }

}

// AI视觉分析服务（Vision-Language）
export class AiVL {
  static async analyze(
    params: {
      messages: { role: string; content: string }[]
      temperature?: number
      maxTokens?: number
    },
    modelName?: string,
    projectId: number = 0
  ): Promise<string> {
    console.log('[AiVL.analyze] 开始视觉分析，传入modelName:', modelName)

    // 如果没有指定模型，使用vlAgent
    if (!modelName) {
      console.log('[AiVL.analyze] 未指定模型，尝试获取vlAgent配置')
      const agent = await vendorConfigService.getAgent('vlAgent')
      console.log('[AiVL.analyze] 获取到的agent:', agent)

      if (!agent) {
        console.log('[AiVL.analyze] 未找到vlAgent配置，回退到universalAi')
        // 如果没有配置vlAgent，回退到universalAi
        const fallbackAgent = await vendorConfigService.getAgent('universalAi')
        if (!fallbackAgent) {
          console.error('[AiVL.analyze] 未找到通用AI配置')
          throw new Error('未找到视觉分析AI配置，请在AI服务设置中配置视觉分析Agent')
        }
        if (fallbackAgent.disabled) {
          console.error('[AiVL.analyze] 通用AI已禁用')
          throw new Error('通用AI已禁用，请在AI服务设置中启用')
        }
        if (!fallbackAgent.modelName) {
          console.error('[AiVL.analyze] 通用AI未配置模型')
          throw new Error('通用AI未配置模型，请在AI服务 -> Agent配置中选择模型')
        }

        const agentModel = await getAgentModel('universalAi')
        if (!agentModel) {
          throw new Error('通用AI模型配置无效，请检查Agent配置中的模型选择')
        }
        modelName = `${agentModel.vendorId}:${agentModel.modelName}`
      } else {
        if (agent.disabled) {
          console.error('[AiVL.analyze] 视觉分析Agent已禁用')
          throw new Error('视觉分析Agent已禁用，请在AI服务设置中启用')
        }
        if (!agent.modelName) {
          console.error('[AiVL.analyze] 视觉分析Agent未配置模型')
          throw new Error('视觉分析Agent未配置模型，请在AI服务 -> Agent配置中选择模型')
        }

        const agentModel = await getAgentModel('vlAgent')
        if (!agentModel) {
          throw new Error('视觉分析Agent模型配置无效，请检查Agent配置中的模型选择')
        }
        modelName = `${agentModel.vendorId}:${agentModel.modelName}`
      }
    }

    console.log('[AiVL.analyze] 最终modelName:', modelName)

    const { vendorId, modelName: resolvedModelName } = resolveModelName(modelName as `${string}:${string}`)

    if (!vendorId) {
      console.error('[AiVL.analyze] 无效的模型名称，无法解析vendorId:', modelName)
      throw new Error(`无效的模型名称: ${modelName}，格式应为 "vendorId:modelName"`)
    }

    const vendor = await vendorConfigService.getVendor(vendorId)
    console.log('[AiVL.analyze] 获取供应商:', vendorId, vendor ? '成功' : '失败')

    if (!vendor || !vendor.enable) {
      console.error('[AiVL.analyze] 供应商未启用:', vendorId)
      throw new Error(`供应商未启用: ${vendorId}`)
    }

    const model = vendor.models.find((m) => m.modelName === resolvedModelName && m.type === 'text')
    console.log('[AiVL.analyze] 查找模型:', resolvedModelName, model ? '成功' : '失败')

    if (!model) {
      console.error('[AiVL.analyze] 模型不存在:', resolvedModelName, '供应商可用模型:', vendor.models.map(m => m.modelName))
      throw new Error(`模型不存在: ${resolvedModelName}，请检查供应商配置`)
    }

    console.log('[AiVL.analyze] 开始执行视觉分析任务')

    return withTaskRecord(
      'text',
      `视觉分析: ${params.messages[0]?.content?.slice(0, 50)}...`,
      modelName,
      projectId,
      async (_updateTask) => {
        try {
          const result = await executeVendorCode(vendor.code, vendor, 'textRequest', model, params)
          console.log('[AiVL.analyze] 分析成功')
          return result
        } catch (error) {
          console.error('[AiVL.analyze] 分析失败:', error)
          throw error
        }
      }
    )
  }
}

// 导出统一接口
export const AI = {
  Text: AiText,
  Image: AiImage,
  Video: AiVideo,
  Audio: AiAudio,
  VL: AiVL,
}

// 导出工具函数
export { resolveModelName, getAgentModel, withTaskRecord }
