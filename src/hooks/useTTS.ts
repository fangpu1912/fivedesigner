import { useState, useCallback, useEffect } from 'react'

import { join } from '@tauri-apps/api/path'
import { writeFile, mkdir, exists } from '@tauri-apps/plugin-fs'

import { AiAudio } from '@/services/vendor/aiService'
import { getEnabledAIConfigsWithSecrets } from '@/services/configService'
import { workspaceService } from '@/services/workspace/WorkspaceService'
import type { TTSVoiceInfo } from '@/services/vendor/types'

export interface TTSVoice {
  id: string
  name: string
  language: string
  gender: 'male' | 'female' | 'neutral'
  preview_url?: string
}

// 旁白配置
export interface NarrationConfig {
  voiceId?: string // 旁白音色ID（直接选择音色）
  emotion?: string // 旁白情绪
  audioPrompt?: string // 旁白配音提示词
}

export interface TTSConfig {
  modelId: string
  provider: string
  voiceId: string
  speed: number
  pitch: number
  volume: number
  apiKey?: string
  baseUrl?: string
  narration?: NarrationConfig // 旁白统一配置
  fileId?: number // MiniMax 复刻音色使用的 file_id
  voiceSampleUrl?: string // 参考音频路径（用于即时音色克隆）
  workflowParams?: Record<string, unknown> // ComfyUI 工作流参数
  projectId?: string // 项目ID，用于保存文件
  episodeId?: string // 剧集ID，用于保存文件
}

export interface TTSResult {
  audioUrl: string
  duration: number
}

const TTS_RUNTIME_CONFIG_KEY = 'fivedesigner_tts_runtime_config'

const defaultRuntimeConfig = {
  modelId: 'speech-01-turbo',
  provider: 'minimax',
  voiceId: 'female-shaonv',
  speed: 1.0,
  pitch: 0,
  volume: 1.0,
  narration: {
    emotion: '平静',
    audioPrompt: '沉稳的旁白声音，清晰流畅',
    voiceId: '', // 旁白参考音频路径
  },
  workflowParams: {} as Record<string, unknown>,
}

export function useTTS() {
  const [voices, setVoices] = useState<TTSVoice[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [isLoadingVoices, setIsLoadingVoices] = useState(false)

  // 加载可用音色列表
  const loadVoices = useCallback(
    async (vendorId: string) => {
      setIsLoadingVoices(true)
      try {
        const voiceInfos = await AiAudio.getVoices(vendorId)

        const mappedVoices: TTSVoice[] = voiceInfos.map((v: TTSVoiceInfo) => ({
          id: v.id,
          name: v.name,
          language: v.language,
          gender: v.gender || 'neutral',
          preview_url: v.previewUrl,
        }))

        setVoices(mappedVoices)
        return mappedVoices
      } catch (error) {
        console.error('加载音色列表失败:', error)
        setVoices([])
        return []
      } finally {
        setIsLoadingVoices(false)
      }
    },
    []
  )

  // 生成语音
  const generateSpeech = useCallback(
    async (
      text: string,
      config: TTSConfig,
      vendorId: string = 'minimax',
      modelName: string = 'speech-01-turbo'
    ): Promise<TTSResult> => {
      setIsGenerating(true)
      setProgress(0)

      try {
        setProgress(30)

        // 构建完整的模型名称
        // 如果 modelName 已经包含 ':'，说明已经是完整格式，直接使用
        // 否则，组合成 vendorId:modelName 格式
        const fullModelName = modelName.includes(':') ? modelName : `${vendorId}:${modelName}`
        console.log('[useTTS.generateSpeech] 使用模型:', fullModelName, { vendorId, modelName })

        // 执行合成
        const audioUrl = await AiAudio.generate(
          {
            text,
            voice: config.voiceId,
            voiceId: config.voiceId,
            speed: config.speed,
            pitch: config.pitch,
            volume: config.volume,
            format: 'mp3',
            voiceSampleUrl: config.voiceSampleUrl, // 参考音频路径
          },
          fullModelName,
          parseInt(config.projectId || '0', 10)
        )

        setProgress(80)

        // 下载音频文件
        let audioPath = ''
        const response = await fetch(audioUrl)
        if (response.ok) {
          const audioData = await response.arrayBuffer()

          const baseDir = await workspaceService.getWorkspacePath()
          const fileName = `tts_${Date.now()}.mp3`
          const dirPath = await join(baseDir, 'temp', 'audio')
          const filePath = await join(dirPath, fileName)

          // 确保目录存在
          try {
            const dirExists = await exists(dirPath)
            if (!dirExists) {
              await mkdir(dirPath, { recursive: true })
            }
            await writeFile(filePath, new Uint8Array(audioData))
            audioPath = filePath
            console.log('[useTTS] saved audio to:', audioPath)
          } catch (error) {
            console.error('保存音频文件失败:', error)
            // 如果保存失败，使用原始 URL
            audioPath = audioUrl
          }
        } else {
          // 如果下载失败，使用原始 URL
          audioPath = audioUrl
        }

        setProgress(100)

        return {
          audioUrl: audioPath || audioUrl,
          duration: 0, // TODO: 计算音频时长
        }
      } catch (error) {
        console.error('TTS 生成失败:', error)
        throw error
      } finally {
        setIsGenerating(false)
      }
    },
    []
  )

  // 使用克隆的声音生成语音
  const generateWithClonedVoice = useCallback(
    async (
      text: string,
      config: TTSConfig,
      vendorId: string = 'minimax',
      modelName: string = 'speech-2.8-hd'
    ): Promise<TTSResult> => {
      setIsGenerating(true)
      setProgress(0)

      try {
        if (!config.fileId && !config.voiceId) {
          throw new Error('声音克隆需要提供 fileId 或 voiceId')
        }

        setProgress(30)

        // 构建完整的模型名称
        const fullModelName = modelName.includes(':') ? modelName : `${vendorId}:${modelName}`
        console.log('[useTTS.generateWithClonedVoice] 使用模型:', fullModelName, { vendorId, modelName })

        // 执行克隆语音合成
        const audioUrl = await AiAudio.generateWithClonedVoice(
          {
            text,
            voice: config.voiceId || 'cloned',
            voiceId: config.voiceId,
            fileId: config.fileId,
            speed: config.speed,
            pitch: config.pitch,
            volume: config.volume,
            format: 'mp3',
          },
          fullModelName,
          parseInt(config.projectId || '0', 10)
        )

        setProgress(80)

        // 下载音频文件
        let audioPath = ''
        const response = await fetch(audioUrl)
        if (response.ok) {
          const audioData = await response.arrayBuffer()

          const baseDir = await workspaceService.getWorkspacePath()
          const fileName = `tts_cloned_${Date.now()}.mp3`
          const dirPath = await join(baseDir, 'temp', 'audio')
          const filePath = await join(dirPath, fileName)

          // 确保目录存在
          try {
            const dirExists = await exists(dirPath)
            if (!dirExists) {
              await mkdir(dirPath, { recursive: true })
            }
            await writeFile(filePath, new Uint8Array(audioData))
            audioPath = filePath
            console.log('[useTTS] saved cloned audio to:', audioPath)
          } catch (error) {
            console.error('保存音频文件失败:', error)
            audioPath = audioUrl
          }
        } else {
          audioPath = audioUrl
        }

        setProgress(100)

        return {
          audioUrl: audioPath || audioUrl,
          duration: 0,
        }
      } catch (error) {
        console.error('克隆语音生成失败:', error)
        throw error
      } finally {
        setIsGenerating(false)
      }
    },
    []
  )

  // 上传音频用于声音克隆
  const uploadVoiceCloneAudio = useCallback(
    async (audioFile: File, vendorId: string = 'minimax'): Promise<{ fileId: number; voiceId?: string }> => {
      try {
        const result = await AiAudio.uploadVoiceCloneAudio(
          audioFile,
          vendorId,
          0
        )
        return {
          fileId: typeof result.fileId === 'string' ? parseInt(result.fileId, 10) : result.fileId,
          voiceId: result.voiceId,
        }
      } catch (error) {
        console.error('上传声音克隆音频失败:', error)
        throw error
      }
    },
    []
  )

  // 预览音色
  const previewVoice = useCallback(
    async (voiceId: string, vendorId: string = 'minimax', modelName: string = 'speech-01-turbo') => {
      try {
        const audioUrl = await AiAudio.generate(
          {
            text: '你好，这是一段测试语音。',
            voice: voiceId,
            voiceId: voiceId,
            speed: 1.0,
            format: 'mp3',
          },
          `${vendorId}:${modelName}`,
          0
        )

        const audio = new Audio(audioUrl)
        await audio.play()
      } catch (error) {
        console.error('预览音色失败:', error)
        throw error
      }
    },
    []
  )

  // 运行时配置状态
  const [runtimeConfig, setRuntimeConfig] = useState(() => {
    try {
      const saved = localStorage.getItem(TTS_RUNTIME_CONFIG_KEY)
      if (saved) {
        return { ...defaultRuntimeConfig, ...JSON.parse(saved) }
      }
    } catch (error) {
      console.error('加载 TTS 运行时配置失败:', error)
    }
    return defaultRuntimeConfig
  })

  // Provider 配置状态
  const [providerConfig, setProviderConfig] = useState<{
    vendorId: string
    modelName: string
    apiKey?: string
  } | null>(null)

  // 加载 Provider 配置
  useEffect(() => {
    const loadProviderConfig = async () => {
      try {
        const aiConfigs = await getEnabledAIConfigsWithSecrets()
        // 优先使用 MiniMax TTS 配置（检查 provider、baseUrl 或 modelName）
        const minimaxConfig = aiConfigs.find(
          (c) => c.type === 'tts' && (
            c.provider === 'minimax' ||
            c.baseUrl?.includes('minimax') ||
            c.modelName?.includes('minimax')
          )
        )
        const ttsConfig = aiConfigs.find((c) => c.type === 'tts')
        const defaultConfig = aiConfigs.find((c) => c.isDefault)
        const config = minimaxConfig || ttsConfig || defaultConfig || aiConfigs[0]

        if (config) {
          setProviderConfig({
            vendorId: config.provider || 'minimax',
            modelName: config.modelName || 'speech-01-turbo',
            apiKey: config.apiKey,
          })
        }
      } catch (error) {
        console.error('加载 Provider 配置失败:', error)
      }
    }

    loadProviderConfig()
  }, [])

  // 合并配置
  const config: TTSConfig = {
    modelId: runtimeConfig.modelId || providerConfig?.modelName || 'speech-01-turbo',
    provider: runtimeConfig.provider || providerConfig?.vendorId || 'minimax',
    voiceId: runtimeConfig.voiceId || defaultRuntimeConfig.voiceId,
    speed: runtimeConfig.speed ?? defaultRuntimeConfig.speed,
    pitch: runtimeConfig.pitch ?? defaultRuntimeConfig.pitch,
    volume: runtimeConfig.volume ?? defaultRuntimeConfig.volume,
    apiKey: providerConfig?.apiKey || '',
    narration: {
      ...defaultRuntimeConfig.narration,
      ...runtimeConfig.narration,
    },
    workflowParams: runtimeConfig.workflowParams || defaultRuntimeConfig.workflowParams,
  }

  const updateConfig = useCallback((updates: Partial<TTSConfig>) => {
    setRuntimeConfig((prev: typeof defaultRuntimeConfig) => {
      const newRuntimeConfig = {
        ...prev,
        ...(updates.modelId && { modelId: updates.modelId }),
        ...(updates.provider && { provider: updates.provider }),
        ...(updates.voiceId && { voiceId: updates.voiceId }),
        ...(updates.speed !== undefined && { speed: updates.speed }),
        ...(updates.pitch !== undefined && { pitch: updates.pitch }),
        ...(updates.volume !== undefined && { volume: updates.volume }),
        ...(updates.narration && { narration: updates.narration }),
        ...(updates.workflowParams && { workflowParams: updates.workflowParams }),
      }
      // 保存到 localStorage
      try {
        localStorage.setItem(TTS_RUNTIME_CONFIG_KEY, JSON.stringify(newRuntimeConfig))
      } catch (error) {
        console.error('保存 TTS 运行时配置失败:', error)
      }
      return newRuntimeConfig
    })
  }, [])

  const resetConfig = useCallback(() => {
    setRuntimeConfig(defaultRuntimeConfig)
    try {
      localStorage.removeItem(TTS_RUNTIME_CONFIG_KEY)
    } catch (error) {
      console.error('清除 TTS 运行时配置失败:', error)
    }
  }, [])

  return {
    voices,
    isGenerating,
    progress,
    isLoadingVoices,
    config,
    loadVoices,
    generateSpeech,
    generateWithClonedVoice,
    uploadVoiceCloneAudio,
    previewVoice,
    updateConfig,
    resetConfig,
  }
}

// TTS 配置 hook
export function useTTSConfig() {
  const [config, setConfig] = useState<{
    vendorId: string
    modelName: string
    apiKey?: string
  } | null>(null)

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const aiConfigs = await getEnabledAIConfigsWithSecrets()
        const minimaxConfig = aiConfigs.find(
          (c) => c.type === 'tts' && c.provider === 'minimax'
        )
        const ttsConfig = aiConfigs.find((c) => c.type === 'tts')
        const defaultConfig = aiConfigs.find((c) => c.isDefault)
        const aiConfig = minimaxConfig || ttsConfig || defaultConfig || aiConfigs[0]

        if (aiConfig) {
          setConfig({
            vendorId: aiConfig.provider || 'minimax',
            modelName: aiConfig.modelName || 'speech-01-turbo',
            apiKey: aiConfig.apiKey,
          })
        }
      } catch (error) {
        console.error('加载 TTS 配置失败:', error)
      }
    }

    loadConfig()
  }, [])

  return config
}
