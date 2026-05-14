import { ComfyUIClient } from '@/services/comfyui/ComfyUIClient'
import { getComfyUIServerUrl } from '@/services/configService'
import { getWorkflowConfigs } from '@/services/workflowConfigService'
import { pollComfyUIHistoryUntilDone, extractComfyUIMediaOutputs } from '@/services/comfyui/resultUtils'

export interface ComfyUITTSRequest {
  text: string
  voice?: string
  voiceSampleUrl?: string
  workflowId: string
  workflowParams?: Record<string, unknown>
  projectId?: string
  episodeId?: string
}

export interface ComfyUITTSResult {
  audioUrl: string
  duration: number
}

function findInputField(node: Record<string, unknown>, paramName: string): string | null {
  const inputs = node.inputs as Record<string, unknown> | undefined
  if (!inputs) return null

  const inputMap: Record<string, string[]> = {
    text: ['text', 'prompt', 'input_text', 'text_input'],
    voice_id: ['voice_id', 'voice', 'speaker', 'voiceId', 'reference_audio'],
    seed: ['seed', 'noise_seed'],
  }

  const possibleNames = inputMap[paramName] || [paramName]

  for (const name of possibleNames) {
    if (inputs[name] !== undefined) {
      return name
    }
  }

  const inputKeys = Object.keys(inputs)
  if (inputKeys.length > 0) {
    return inputKeys[0]!
  }

  return null
}

export async function generateTTSWithComfyUI(request: ComfyUITTSRequest): Promise<ComfyUITTSResult> {
  const serverUrl = getComfyUIServerUrl()
  if (!serverUrl) {
    throw new Error('ComfyUI 服务器未配置')
  }

  const client = new ComfyUIClient({
    serverUrl,
    projectId: request.projectId,
    episodeId: request.episodeId,
  })
  await client.connect()

  try {
    const workflows = await getWorkflowConfigs()
    const workflowConfig = workflows.find(w => w.id === request.workflowId)
    if (!workflowConfig) {
      throw new Error('未找到工作流配置')
    }

    const workflow = JSON.parse(JSON.stringify(workflowConfig.workflow))

    const paramValues: Record<string, unknown> = {
      text: request.text,
      voice_id: request.voiceSampleUrl || request.voice,
      ...request.workflowParams,
    }

    const nodes = workflowConfig.nodes as Record<string, string | undefined> | undefined
    if (nodes) {
      for (const [paramName, nodeId] of Object.entries(nodes)) {
        if (!nodeId) continue
        const value = paramValues[paramName]
        if (value === undefined || value === null) continue

        const node = workflow[nodeId] as Record<string, unknown> | undefined
        if (!node) continue

        const fieldName = findInputField(node, paramName)
        if (fieldName) {
          if (!node.inputs) node.inputs = {}
          ;(node.inputs as Record<string, unknown>)[fieldName] = value
        }
      }
    }

    const response = await client.queuePrompt(workflow)
    const historyItem = await pollComfyUIHistoryUntilDone(
      client,
      response.prompt_id,
      { timeoutMs: 10 * 60 * 1000, intervalMs: 1000 }
    )

    const mediaOutputs = extractComfyUIMediaOutputs(historyItem)
    const audioOutput = mediaOutputs.find(item => item.mediaType === 'audio')

    if (!audioOutput) {
      throw new Error('ComfyUI 未返回音频')
    }

    const audioUrl = await client.getFile(
      audioOutput.filename,
      audioOutput.subfolder,
      audioOutput.type,
      'audio'
    )

    return { audioUrl, duration: 0 }
  } finally {
    await client.disconnect()
  }
}
