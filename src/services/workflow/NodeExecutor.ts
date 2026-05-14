import { AI, AiAudio } from '@/services/vendor'

import { type WorkflowNode, type NodeExecutionResult, type ExecutionContext } from './types'

export interface NodeExecutorConfig {
  timeout?: number
  retryCount?: number
  retryDelay?: number
}

export class NodeExecutor {
  private config: NodeExecutorConfig

  constructor(config: NodeExecutorConfig = {}) {
    this.config = {
      timeout: 300000,
      retryCount: 3,
      retryDelay: 1000,
      ...config,
    }
  }

  getConfig(): NodeExecutorConfig {
    return this.config
  }

  async execute(
    node: WorkflowNode,
    inputs: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now()

    try {
      // 合并节点输入和上下文变量
      const mergedInputs = this.prepareInputs(node, context, inputs)
      let result: NodeExecutionResult

      switch (node.type) {
        case 'script':
          result = await this.executeTextGen(mergedInputs, context)
          break
        case 'image_gen':
          result = await this.executeImageGen(mergedInputs, context)
          break
        case 'video_gen':
          result = await this.executeVideoGen(mergedInputs)
          break
        case 'tts':
          result = await this.executeTTS(mergedInputs, context)
          break
        default:
          throw new Error(`未知的节点类型: ${node.type}`)
      }

      const duration = Date.now() - startTime
      return {
        ...result,
        outputs: {
          ...result.outputs,
          _executionTime: duration,
        },
      }
    } catch (error) {
      const duration = Date.now() - startTime
      return {
        success: false,
        outputs: {
          _executionTime: duration,
        },
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  private log(context: ExecutionContext, nodeId: string, level: 'info' | 'warn' | 'error', message: string) {
    if (context.onLog) {
      context.onLog({ timestamp: Date.now(), nodeId, level, message })
    }
  }

  private async executeTextGen(
    inputs: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const prompt = inputs.prompt as string
    const model = (inputs.model as string) || 'official:claude-sonnet-4-6'

    if (!prompt?.trim()) {
      throw new Error('文本生成失败: 提示词为空')
    }

    try {
      this.log(context, 'text_gen', 'info', `文本生成: 提示词长度 ${prompt.length}`)

      const result = await AI.Text.generate(
        {
          messages: [{ role: 'user', content: prompt }],
          temperature: (inputs.temperature as number) ?? 0.7,
          maxTokens: (inputs.maxTokens as number) ?? 2048,
        },
        model,
        0
      )

      return {
        success: true,
        outputs: {
          text: result,
        },
      }
    } catch (error) {
      this.log(
        context,
        'text_gen',
        'error',
        `文本生成失败: ${error instanceof Error ? error.message : String(error)}`
      )
      throw new Error(`文本生成失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private prepareInputs(
    node: WorkflowNode,
    context: ExecutionContext,
    externalInputs: Record<string, unknown>
  ): Record<string, unknown> {
    const inputs: Record<string, unknown> = { ...externalInputs }

    // 从上下文变量中解析输入（会覆盖外部传入的同名参数）
    if (node.inputMapping) {
      for (const [inputKey, varPath] of Object.entries(node.inputMapping)) {
        const value = this.getVariableValue(context, varPath as string)
        if (value !== undefined) {
          inputs[inputKey] = value
        }
      }
    }

    return inputs
  }

  private getVariableValue(context: ExecutionContext, varPath: string): unknown {
    // 支持简单的变量路径，如: nodeId.outputKey
    const parts = varPath.split('.')
    if (parts.length >= 2) {
      const [nodeId, ...keyParts] = parts
      const key = keyParts.join('.')
      const nodeOutput = nodeId ? context.variables[nodeId] : undefined
      if (nodeOutput && typeof nodeOutput === 'object') {
        return (nodeOutput as Record<string, unknown>)[key]
      }
    }
    return undefined
  }

  private async executeImageGen(
    inputs: Record<string, unknown>,
    _context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    try {
      const imageUrl = await AI.Image.generate(
        {
          prompt: inputs.prompt as string,
          imageBase64: [],
          size: '1K',
          aspectRatio: `${inputs.width || 1024}:${inputs.height || 1024}`,
        },
        'official:claude-sonnet-4-6',
        0
      )

      return {
        success: true,
        outputs: {
          image: imageUrl,
          seed: inputs.seed as number,
        },
      }
    } catch (error) {
      throw new Error(`图片生成失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async executeVideoGen(inputs: Record<string, unknown>): Promise<NodeExecutionResult> {
    try {
      const videoUrl = await AI.Video.generate(
        {
          prompt: inputs.prompt as string,
          firstImageBase64: inputs.image as string || undefined,
          aspectRatio: `${inputs.width || 1280}:${inputs.height || 720}`,
          duration: 5,
          resolution: '1080p',
          generateAudio: true,
        },
        'official:Wan2.6-I2V-1080P',
        0
      )

      return {
        success: true,
        outputs: {
          video: videoUrl,
        },
      }
    } catch (error) {
      throw new Error(`视频生成失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async executeTTS(
    inputs: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const text = inputs.text as string
    const voiceId = inputs.voice as string | undefined
    const vendorId = (inputs.vendor as string) || 'minimax'
    const modelName = (inputs.model as string) || 'speech-01-turbo'

    if (!text?.trim()) {
      throw new Error('TTS 合成失败: 文本内容为空')
    }

    try {
      this.log(context, 'tts_node', 'info', `TTS 合成: 文本长度 ${text.length}`)

      // 使用 Vendor 系统的 AiAudio
      const audioUrl = await AiAudio.generate(
        {
          text,
          voice: voiceId || 'female-shaonv',
          voiceId: voiceId || 'female-shaonv',
          speed: (inputs.speed as number) || 1.0,
          pitch: (inputs.pitch as number) || 0,
          volume: (inputs.volume as number) || 1.0,
          format: 'mp3',
        },
        `${vendorId}:${modelName}`,
        0
      )

      return {
        success: true,
        outputs: {
          audio: audioUrl,
          duration: text.length * 0.1,
        },
      }
    } catch (error) {
      this.log(
        context,
        'tts_node',
        'error',
        `TTS 合成失败: ${error instanceof Error ? error.message : String(error)}`
      )
      throw new Error(`TTS 合成失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async executeScript(
    inputs: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const prompt = inputs.prompt as string

    if (!prompt?.trim()) {
      throw new Error('脚本生成失败: 提示词为空')
    }

    try {
      this.log(context, 'script', 'info', `脚本生成: 提示词长度 ${prompt.length}`)

      const result = await AI.Text.generate(
        {
          messages: [
            {
              role: 'system',
              content:
                '你是一个专业的剧本创作助手。请根据用户的要求创作剧本，包括场景描述、角色对话、动作指示等。',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.8,
          maxTokens: 4096,
        },
        'official:claude-sonnet-4-6',
        0
      )

      return {
        success: true,
        outputs: {
          script: result,
        },
      }
    } catch (error) {
      this.log(
        context,
        'script',
        'error',
        `脚本生成失败: ${error instanceof Error ? error.message : String(error)}`
      )
      throw new Error(`脚本生成失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
