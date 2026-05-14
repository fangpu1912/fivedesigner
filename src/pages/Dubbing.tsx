import { useState, useCallback, useEffect, useMemo, useRef } from 'react'

import { confirm, open } from '@tauri-apps/plugin-dialog'
import { writeFile, readFile, exists } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import { Mic, Loader2, BookOpen, MessageSquare } from 'lucide-react'

import { ComfyUIClient } from '@/services/comfyui/ComfyUIClient'
import { getComfyUIServerUrl } from '@/services/configService'
import { getWorkflowConfigs } from '@/services/workflowConfigService'
import { type WorkflowConfig } from '@/types'
import { pollComfyUIHistoryUntilDone, extractComfyUIMediaOutputs } from '@/services/comfyui/resultUtils'
import {
  type ComfyUIParams,
} from '@/components/ai'

import { CharacterPanel } from '@/components/dubbing/CharacterPanel'
import { DubbingConfigPanel } from '@/components/dubbing/DubbingConfigPanel'
import { StoryboardDubbingPanel } from '@/components/dubbing/StoryboardDubbingPanel'
import { Switch } from '@/components/ui/switch'
import {
  useDubbingByEpisode,
  useDubbingMutations,
  useReorderDubbings,
} from '@/hooks/useDubbing'
import {
  useCharacters,
  useCharacterMutations,
} from '@/hooks/useCharacters'
import { useProjectQuery } from '@/hooks/useProjects'
import { useStoryboards } from '@/hooks/useStoryboards'
import { useToast } from '@/hooks/useToast'
import { useTTS } from '@/hooks/useTTS'
import { useTTSGeneration } from '@/hooks/useVendorGeneration'
import { trimAudio } from '@/services/audioProcessor'
import { voiceService } from '@/services/voiceService'
import { useUIStore } from '@/store/useUIStore'
import { getAudioUrl } from '@/utils/asset'
import type { Dubbing, Character } from '@/types'
import logger from '@/utils/logger'

// 配音类型
type DubbingType = 'narration' | 'character' | 'extra'

// 生成模式
type GenerationMode = 'ai' | 'comfyui'

// 本地配音状态
interface LocalDubbingLine {
  id?: string
  tempId: string
  text: string
  character_id?: string
  emotion?: string
  audio_prompt?: string
  audio_url?: string
  status?: Dubbing['status']
  duration?: number
  sequence: number
  type: DubbingType
  isFromMetadata?: boolean
}

export function Dubbing() {
  const { currentProjectId, currentEpisodeId } = useUIStore()
  const { config, voices: ttsVoices, generateSpeech: _generateSpeech, previewVoice, loadVoices, updateConfig, resetConfig } = useTTS()
  const ttsGeneration = useTTSGeneration()
  const { createDubbingAsync, updateDubbingAsync, deleteDubbingAsync } = useDubbingMutations(
    currentEpisodeId || undefined
  )
  const { createCharacterAsync, updateCharacterAsync, deleteCharacterAsync } =
    useCharacterMutations()
  const reorderDubbings = useReorderDubbings()
  const { toast } = useToast()

  // 获取本地音色列表
  const [localVoices, setLocalVoices] = useState<
    Array<{
      id: string
      name: string
      language: string
      gender: 'male' | 'female' | 'neutral'
      preview_url?: string
    }>
  >([])

  // 等待 voiceService 加载完成后获取本地音色
  useEffect(() => {
    const loadLocalVoices = async () => {
      await voiceService.waitForLoad()
      const voices = voiceService.getAllVoices()
      console.log('[Dubbing] voiceService voices:', voices)
      console.log('[Dubbing] voiceService voices filePath:', voices.map(v => v.filePath))
      setLocalVoices(
        voices.map(v => ({
          id: v.id,
          name: v.name,
          language: v.language || 'zh-CN',
          gender: v.gender || 'neutral',
          preview_url: v.audioUrl,
          filePath: v.filePath || '', // 使用原始文件路径
        }))
      )
    }

    loadLocalVoices()
  }, [])

  // 合并 TTS 音色和本地音色
  const voices = useMemo(() => {
    return [...localVoices, ...ttsVoices]
  }, [localVoices, ttsVoices])

  const [selectedCharacterId, setSelectedCharacterId] = useState<string | undefined>()
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set())

  // 是否加载旁白/解说模式
  const [loadNarration, setLoadNarration] = useState(true)

  // 生成模式：AI 或 ComfyUI
  const [generationMode, setGenerationMode] = useState<GenerationMode>('ai')

  // ComfyUI 状态
  const [comfyuiWorkflows, setComfyuiWorkflows] = useState<WorkflowConfig[]>([])
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('')
  const [comfyuiConnected, setComfyuiConnected] = useState(false)
  const [comfyUIParams, setComfyUIParams] = useState<ComfyUIParams>({})
  const getComfyUIParamsRef = useRef<(() => ComfyUIParams) | null>(null)
  const comfyuiClientRef = useRef<ComfyUIClient | null>(null)

  // 本地配音状态：storyboardId -> tempId -> LocalDubbingLine
  const [localDubbings, setLocalDubbings] = useState<
    Record<string, Record<string, LocalDubbingLine>>
  >({})

  // 加载 TTS 音色列表
  useEffect(() => {
    const loadTTSVoices = async () => {
      if (config.provider && config.provider !== 'comfyui') {
        try {
          // 新的 loadVoices 只需要 vendorId
          await loadVoices(config.provider)
        } catch (error) {
          console.error('加载 TTS 音色列表失败:', error)
        }
      }
    }

    loadTTSVoices()
  }, [config.provider, loadVoices])

  // 加载 ComfyUI 工作流
  useEffect(() => {
    try {
      const workflows = getWorkflowConfigs()
      // 只显示 TTS 类型的工作流
      const ttsWorkflows = workflows.filter(w => w.type === 'tts')
      setComfyuiWorkflows(ttsWorkflows)
    } catch (error) {
      console.error('加载 ComfyUI 工作流失败:', error)
    }
  }, [])

  // 初始化 ComfyUI Client
  const initComfyUIClient = useCallback(async () => {
    try {
      if (comfyuiClientRef.current?.isConnected()) {
        setComfyuiConnected(true)
        return
      }

      const serverUrl = await getComfyUIServerUrl()
      const client = new ComfyUIClient({ serverUrl })

      const connectPromise = client.connect()
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('连接超时')), 5000)
      )

      await Promise.race([connectPromise, timeoutPromise])
      client.setContext(currentProjectId ?? undefined, currentEpisodeId ?? undefined)
      comfyuiClientRef.current = client
      setComfyuiConnected(true)
    } catch (error) {
      console.error('连接 ComfyUI 失败:', error)
      setComfyuiConnected(false)
      toast({
        title: 'ComfyUI 连接失败',
        description: '请检查 ComfyUI 服务是否已启动',
        variant: 'destructive',
      })
    }
  }, [currentProjectId, currentEpisodeId, toast])

  // 当切换到 ComfyUI 模式时连接，并同步 provider 到 config
  useEffect(() => {
    if (generationMode === 'comfyui') {
      initComfyUIClient()
      // 同步 provider 到 config
      if (config.provider !== 'comfyui') {
        updateConfig({ provider: 'comfyui' })
      }
    } else {
      // 切换回 AI 模式时，恢复默认 provider
      if (config.provider === 'comfyui') {
        updateConfig({ provider: 'minimax', modelId: 'speech-2.8-hd', voiceId: 'female-shaonv' })
      }
    }
  }, [generationMode, initComfyUIClient, config.provider, updateConfig])

  // 当项目/剧集变化时更新 ComfyUI 上下文
  useEffect(() => {
    if (comfyuiClientRef.current && currentProjectId && currentEpisodeId) {
      comfyuiClientRef.current.setContext(currentProjectId, currentEpisodeId)
    }
  }, [currentProjectId, currentEpisodeId])

  // 清理 ComfyUI 连接
  useEffect(() => {
    return () => {
      comfyuiClientRef.current?.disconnect()
      comfyuiClientRef.current = null
    }
  }, [])

  const { data: storyboards = [], isLoading: isLoadingStoryboards } = useStoryboards(
    currentEpisodeId || ''
  )

  const { data: dubbings = [], isLoading: isLoadingDubbings } = useDubbingByEpisode(
    currentEpisodeId || ''
  )
  console.log('[Dubbing] dubbings loaded:', dubbings.length, dubbings)
  const { data: characters = [], isLoading: isLoadingCharacters } = useCharacters(
    currentProjectId || '',
    currentEpisodeId || undefined
  )
  const { data: currentProject } = useProjectQuery(currentProjectId || '')

  // 从 metadata 提取配音信息
  const extractDubbingFromMetadata = (storyboard: (typeof storyboards)[0]): LocalDubbingLine[] => {
    const extracted: LocalDubbingLine[] = []
    const metadata = storyboard.metadata as
      | {
          dubbing?: {
            character?: string
            line?: string
            emotion?: string
            audio_prompt?: string
          }
          dubbingText?: string
          dubbingCharacter?: string
          emotion?: string
          audio_prompt?: string
        }
      | undefined

    console.log('[extractDubbingFromMetadata] storyboard:', storyboard.id, 'metadata:', metadata)

    if (!metadata) return extracted

    // 优先使用 dubbing 对象，否则使用扁平字段
    const dubbingData = metadata.dubbing
    const text = dubbingData?.line || metadata.dubbingText
    const characterName = dubbingData?.character || metadata.dubbingCharacter
    const emotion = dubbingData?.emotion || metadata.emotion
    const audioPrompt = dubbingData?.audio_prompt || metadata.audio_prompt

    console.log('[extractDubbingFromMetadata] extracted:', { text, characterName, emotion, audioPrompt, dubbingData })

    if (text) {
      // 查找角色ID
      const character = characters.find(c => c.name === characterName)

      extracted.push({
        tempId: `metadata_${storyboard.id}_${Date.now()}`,
        text,
        character_id: character?.id,
        emotion,
        audio_prompt: audioPrompt,
        sequence: 0,
        type: 'character',
        isFromMetadata: true,
      })
    }

    return extracted
  }

  useEffect(() => {
    setLocalDubbings({})
    setSelectedCharacterId(undefined)
    setGeneratingIds(new Set())
  }, [currentEpisodeId])

  // 初始化本地配音数据 - 只在必要时初始化，避免重复
  useEffect(() => {
    if (storyboards.length === 0) return
    if (isLoadingStoryboards || isLoadingDubbings || isLoadingCharacters) return

    console.log('[Dubbing] Initializing local dubbings, storyboards:', storyboards.length)
    console.log('[Dubbing] dubbings from DB:', dubbings.length)

    setLocalDubbings(prev => {
      // 如果已经有数据，不要重新初始化（避免覆盖用户编辑）
      if (Object.keys(prev).length > 0) {
        console.log('[Dubbing] localDubbings already initialized, skipping')
        return prev
      }

      const initialDubbings: Record<string, Record<string, LocalDubbingLine>> = {}

      storyboards.forEach(storyboard => {
        const storyboardDubbings = dubbings.filter(d => d.storyboard_id === storyboard.id)
        console.log(`[Dubbing] Storyboard ${storyboard.id} has ${storyboardDubbings.length} dubbings`)

        initialDubbings[storyboard.id] = {}
        const storyboardDubbingsMap = initialDubbings[storyboard.id]
        if (!storyboardDubbingsMap) return initialDubbings

        let sequence = 0

        if (storyboardDubbings.length > 0) {
          // 使用已保存的配音数据
          storyboardDubbings
            .sort((a, b) => a.sequence - b.sequence)
            .forEach((d, index) => {
              // 判断类型：优先使用数据库中保存的 type，如果没有则根据 character_id 判断
              let type: LocalDubbingLine['type']
              if ((d as any).type) {
                type = (d as any).type
              } else if (d.character_id) {
                type = 'character'
              } else {
                type = 'extra'
              }
              storyboardDubbingsMap[d.id] = {
                id: d.id,
                tempId: d.id,
                text: d.text,
                character_id: d.character_id,
                emotion: d.emotion,
                audio_prompt: d.audio_prompt,
                audio_url: d.audio_url,
                status: d.status,
                duration: d.duration,
                sequence: index,
                type,
              }
            })
        } else {
          // 初始化三层配音结构
          // 第一层：旁白/解说（分镜描述）
          if (loadNarration && storyboard.description) {
            const narrationTempId = `narration_${storyboard.id}`
            storyboardDubbingsMap[narrationTempId] = {
              tempId: narrationTempId,
              text: storyboard.description,
              sequence: sequence++,
              type: 'narration',
            }
          }

          // 第二层：从 metadata 加载的角色配音
          const metadataDubbings = extractDubbingFromMetadata(storyboard)
          console.log(`[Dubbing] Storyboard ${storyboard.id} metadataDubbings:`, metadataDubbings)
          metadataDubbings.forEach(d => {
            const tempId = `metadata_${storyboard.id}_${d.tempId}`
            storyboardDubbingsMap[tempId] = {
              ...d,
              tempId,
              sequence: sequence++,
            }
          })
        }
      })

      return initialDubbings
    })
  }, [storyboards, dubbings, characters, loadNarration, currentEpisodeId, isLoadingStoryboards, isLoadingDubbings, isLoadingCharacters])

  // 当切换旁白模式时，重新初始化
  useEffect(() => {
    if (storyboards.length > 0) {
      setLocalDubbings(prev => {
        const newDubbings: Record<string, Record<string, LocalDubbingLine>> = {}

        storyboards.forEach(storyboard => {
          const existingDubbings = prev[storyboard.id] || {}

          // 保留已保存的配音和手动添加的配音
          const savedDubbings = Object.values(existingDubbings).filter(
            d => d.id || d.type === 'extra'
          )

          // 保留 metadata 加载的配音
          const metadataDubbings = Object.values(existingDubbings).filter(d => d.isFromMetadata)

          newDubbings[storyboard.id] = {}
          let sequence = 0

          const newDubbingsMap = newDubbings[storyboard.id]
          if (!newDubbingsMap) return

          // 第一层：旁白/解说
          if (loadNarration && storyboard.description) {
            // 检查是否已有旁白
            const existingNarration = Object.values(existingDubbings).find(
              d => d.type === 'narration'
            )

            if (existingNarration) {
              newDubbingsMap[existingNarration.tempId] = {
                ...existingNarration,
                sequence: sequence++,
              }
            } else {
              const narrationTempId = `narration_${storyboard.id}_${Date.now()}`
              newDubbingsMap[narrationTempId] = {
                tempId: narrationTempId,
                text: storyboard.description,
                sequence: sequence++,
                type: 'narration',
              }
            }
          } else {
            // 如果不加载旁白，不添加任何旁白配音（已生成的旁白在UI层过滤）
            // 旁白配音不会被保存到数据库，所以关掉开关后自然消失
          }

          // 第二层：metadata 配音
          metadataDubbings.forEach(d => {
            newDubbingsMap[d.tempId] = {
              ...d,
              sequence: sequence++,
            }
          })

          // 第三层：已保存和手动添加的配音
          savedDubbings.forEach(d => {
            newDubbingsMap[d.tempId] = {
              ...d,
              sequence: sequence++,
            }
          })
        })

        return newDubbings
      })
    }
  }, [loadNarration])

  const handleCreateCharacter = useCallback(
    async (characterData: Omit<Character, 'id' | 'created_at' | 'updated_at'>) => {
      if (!currentProjectId) return
      console.log('[Dubbing] handleCreateCharacter data:', characterData)
      await createCharacterAsync({
        ...characterData,
        project_id: currentProjectId,
        episode_id: currentEpisodeId || undefined,
      })
    },
    [currentProjectId, currentEpisodeId, createCharacterAsync]
  )

  const handleUpdateCharacterInfo = useCallback(
    async (id: string, data: Partial<Character>) => {
      console.log('[Dubbing] handleUpdateCharacterInfo id:', id, 'data:', data)
      await updateCharacterAsync({ id, data })
    },
    [updateCharacterAsync]
  )

  const handleDeleteCharacter = useCallback(
    async (id: string) => {
      const character = characters.find(c => c.id === id)
      const confirmed = await confirm(`确定要删除角色 "${character?.name || '未知'}" 吗？`, {
        title: '删除确认',
        kind: 'warning',
        okLabel: '确定',
        cancelLabel: '取消',
      })
      if (!confirmed) return
      await deleteCharacterAsync(id)
      if (selectedCharacterId === id) {
        setSelectedCharacterId(undefined)
      }
    },
    [deleteCharacterAsync, selectedCharacterId, characters]
  )

  // 添加新的配音行（第三层：手动添加）
  const handleAddDubbing = useCallback((storyboardId: string) => {
    const newTempId = `extra_${storyboardId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    setLocalDubbings(prev => {
      const currentDubbings = prev[storyboardId] || {}
      const newSequence = Object.values(currentDubbings).length

      return {
        ...prev,
        [storyboardId]: {
          ...currentDubbings,
          [newTempId]: {
            tempId: newTempId,
            text: '',
            sequence: newSequence,
            type: 'extra',
          },
        },
      }
    })
  }, [])

  // 更新配音数据
  const handleUpdateDubbing = useCallback(
    (storyboardId: string, tempId: string, data: Partial<LocalDubbingLine>) => {
      setLocalDubbings(prev => {
        const currentStoryboardDubbings = prev[storyboardId] || {}
        const currentDubbing = currentStoryboardDubbings[tempId]
        if (!currentDubbing) return prev

        return {
          ...prev,
          [storyboardId]: {
            ...currentStoryboardDubbings,
            [tempId]: {
              ...currentDubbing,
              ...data,
            },
          },
        }
      })
    },
    []
  )

  // 删除配音
  const handleDeleteDubbing = useCallback(
    async (storyboardId: string, tempId: string) => {
      const localDubbing = localDubbings[storyboardId]?.[tempId]

      // 确认删除
      const confirmed = await confirm('确定要删除这条配音吗？', {
        title: '删除确认',
        kind: 'warning',
        okLabel: '确定',
        cancelLabel: '取消',
      })
      if (!confirmed) return

      // 如果已保存到数据库，先删除数据库记录
      if (localDubbing?.id) {
        await deleteDubbingAsync(localDubbing.id)
      }

      // 更新本地状态
      setLocalDubbings(prev => {
        const storyboardDubbings = { ...prev[storyboardId] }
        delete storyboardDubbings[tempId]

        // 重新排序
        const sorted = Object.values(storyboardDubbings)
          .sort((a, b) => a.sequence - b.sequence)
          .map((d, index) => ({ ...d, sequence: index }))

        const newDubbings: Record<string, LocalDubbingLine> = {}
        sorted.forEach(d => {
          newDubbings[d.tempId] = d
        })

        return {
          ...prev,
          [storyboardId]: newDubbings,
        }
      })
    },
    [localDubbings, deleteDubbingAsync]
  )

  // 移动配音顺序
  const handleMoveDubbing = useCallback(
    async (storyboardId: string, tempId: string, direction: 'up' | 'down') => {
      const storyboardDubbings = localDubbings[storyboardId]
      if (!storyboardDubbings) return

      const dubbingsList = Object.values(storyboardDubbings)
      const index = dubbingsList.findIndex(d => d.tempId === tempId)
      if (index === -1) return

      const newIndex = direction === 'up' ? index - 1 : index + 1
      if (newIndex < 0 || newIndex >= dubbingsList.length) return

      // 交换位置
      const temp = dubbingsList[index]
      if (temp && dubbingsList[newIndex]) {
        dubbingsList[index] = dubbingsList[newIndex]
        dubbingsList[newIndex] = temp
      }

      // 更新 sequence
      const updatedDubbings: Record<string, LocalDubbingLine> = {}
      dubbingsList.forEach((d, i) => {
        updatedDubbings[d.tempId] = { ...d, sequence: i }
      })

      setLocalDubbings(prev => ({
        ...prev,
        [storyboardId]: updatedDubbings,
      }))

      // 同步到数据库
      const updates = dubbingsList.filter(d => d.id).map((d, i) => ({ id: d.id!, sequence: i }))

      if (updates.length > 0) {
        await reorderDubbings.mutateAsync(updates)
      }
    },
    [localDubbings, reorderDubbings]
  )

  // 生成配音
  const handleGenerateDubbing = useCallback(
    async (storyboardId: string, tempId: string) => {
      const localDubbing = localDubbings[storyboardId]?.[tempId]
      if (!localDubbing || !localDubbing.text?.trim()) return

      setGeneratingIds(prev => new Set(prev).add(tempId))

      try {
        // 判断是否为旁白类型
        const isNarration = localDubbing.type === 'narration'

        // 获取角色和音色
        const characterId = localDubbing.character_id
        let emotion = localDubbing.emotion
        let audioPrompt = localDubbing.audio_prompt

        // 如果是旁白，使用统一配置
        if (isNarration && config.narration) {
          // 旁白使用 voiceId 作为音色，不需要 characterId
          emotion = config.narration.emotion
          audioPrompt = config.narration.audioPrompt
        }

        console.log('[Dubbing] characterId:', characterId)
        console.log('[Dubbing] isNarration:', isNarration)
        console.log(
          '[Dubbing] characters:',
          characters.map(c => ({ id: c.id, name: c.name }))
        )

        const character = characters.find(c => c.id === characterId)
        console.log('[Dubbing] 找到的角色:', character)

        // 检查是否有 MiniMax 复刻音色
        let minimaxVoiceId = character?.minimax_voice_id
        let minimaxFileId = character?.minimax_file_id

        // 验证 voice_id 格式（首字符必须为英文字母）
        if (minimaxVoiceId && !/^[a-zA-Z]/.test(minimaxVoiceId)) {
          console.warn('[Dubbing] 角色的 MiniMax voice_id 格式无效，需要重新复刻:', minimaxVoiceId)
          toast({
            title: '音色格式无效',
            description: '角色的 MiniMax 复刻音色格式已过期，请重新上传音频复刻',
            variant: 'destructive',
          })
          minimaxVoiceId = undefined
          minimaxFileId = undefined
        }

        console.log('[Dubbing] 角色 MiniMax voice_id:', minimaxVoiceId)
        console.log('[Dubbing] 角色 MiniMax file_id:', minimaxFileId)
        console.log('[Dubbing] 角色 default_voice_id:', character?.default_voice_id)
        console.log('[Dubbing] config.provider:', config.provider)
        console.log('[Dubbing] config.voiceId:', config.voiceId)
        console.log('[Dubbing] config.workflowParams:', config.workflowParams)

        // API Key 已从 Vendor 配置中自动加载
        if (config.provider !== 'comfyui' && !config.apiKey) {
          throw new Error('未找到 API Key，请在设置中配置 TTS 服务的 API Key')
        }

        // 获取参考音频路径（从下拉列表选择）
        // 旁白使用 config.narration?.voiceId，角色使用 character?.default_voice_id
        const voiceSampleUrl = isNarration
          ? config.narration?.voiceId // 旁白使用 narration.voiceId 作为参考音频
          : character?.default_voice_id // 角色使用 default_voice_id 作为参考音频
        
        console.log('[Dubbing] 获取 voiceSampleUrl:', {
          isNarration,
          characterId,
          narrationVoiceId: config.narration?.voiceId,
          characterDefaultVoiceId: character?.default_voice_id,
          voiceSampleUrl,
        })
        
        // ComfyUI 模式下：voiceId 始终是工作流 ID，参考音频通过 workflowParams.voiceId 传递
        // MiniMax 模式下：如果有参考音频路径使用即时音色克隆，否则使用标准音色
        // 其他模式：使用角色的 default_voice_id 或配置中的 voiceId
        // 注意：provider 可能不是 'minimax'（如 'deepseek'），但 modelName 可能包含 'minimax'
        const isMiniMaxProvider = config.provider === 'minimax' || config.modelId?.includes('minimax')
        let voiceId: string
        let useClonedVoice = false
        
        if (config.provider === 'comfyui') {
          voiceId = config.voiceId // ComfyUI 模式下 voiceId 始终是工作流 ID
        } else if (isMiniMaxProvider && voiceSampleUrl) {
          // MiniMax 有参考音频时使用即时音色克隆
          voiceId = 'voice-clone' // 使用特殊标识表示音色克隆
          useClonedVoice = true
        } else if (isMiniMaxProvider && minimaxVoiceId && minimaxFileId) {
          // MiniMax 有预克隆音色时使用（兼容旧模式）
          voiceId = minimaxVoiceId
          useClonedVoice = true
        } else {
          // 其他情况使用标准音色
          voiceId = config.voiceId || 'female-shaonv'
        }
        
        console.log('[Dubbing] 最终使用的 voiceId:', voiceId)
        console.log('[Dubbing] 使用克隆音色:', useClonedVoice)
        console.log('[Dubbing] 参考音频路径:', voiceSampleUrl)
        console.log('[Dubbing] isMiniMaxProvider:', isMiniMaxProvider)

        // 构建 TTS 选项
        const ttsOptions: any = {
          ...config,
          voiceId,
        }

        // 如果是 MiniMax 且使用音色克隆，传入参考音频路径
        if (isMiniMaxProvider && useClonedVoice) {
          if (voiceSampleUrl) {
            // 新模式：使用参考音频路径进行即时音色克隆
            ttsOptions.voiceSampleUrl = voiceSampleUrl
          } else if (minimaxVoiceId && minimaxFileId) {
            // 旧模式：使用预克隆的音色
            ttsOptions.voiceId = minimaxVoiceId
            ttsOptions.fileId = minimaxFileId
          }
        }

        // 如果是 ComfyUI，传入工作流参数
        if (config.provider === 'comfyui') {
          ttsOptions.workflowParams = {
            ...config.workflowParams,
          }
          // 将参考音频路径作为 voiceId 传入 workflowParams
          if (voiceSampleUrl) {
            ttsOptions.workflowParams.voiceId = voiceSampleUrl
          }
        }

        // 调用 TTS 生成 - 使用任务队列
        const result = await ttsGeneration.mutateAsync({
          text: localDubbing.text,
          voice: voiceId,
          speed: config.speed,
          pitch: config.pitch,
          volume: config.volume,
          model: config.modelId,
          provider: config.provider,
          // 音色克隆
          voiceSampleUrl: voiceSampleUrl || undefined,
          fileId: minimaxFileId || undefined,
          // ComfyUI 相关
          workflowId: generationMode === 'comfyui' ? selectedWorkflowId || undefined : undefined,
          workflowParams: generationMode === 'comfyui' ? ttsOptions.workflowParams : undefined,
          // 项目信息
          projectId: currentProjectId || undefined,
          episodeId: currentEpisodeId || undefined,
          name: `配音 - ${character?.name || '旁白'}`,
        })

        console.log('[Dubbing] generateSpeech result:', result)
        console.log('[Dubbing] result.audioUrl:', result.audioUrl)

        // 更新本地状态
        handleUpdateDubbing(storyboardId, tempId, {
          audio_url: result.audioUrl,
          duration: result.duration,
          status: 'completed',
        })

        // 保存到数据库
        let savedDubbing: Dubbing | null = null
        // 确定配音类型
        const dubbingType: DubbingType = localDubbing.type || (characterId ? 'character' : 'extra')
        if (localDubbing.id) {
          // 更新现有记录
          savedDubbing = await updateDubbingAsync({
            id: localDubbing.id,
            data: {
              text: localDubbing.text,
              character_id: characterId,
              audio_url: result.audioUrl,
              duration: result.duration,
              voice_id: voiceId,
              provider: config.provider,
              status: 'completed',
              emotion: emotion,
              audio_prompt: audioPrompt,
              type: dubbingType,
            },
          })
          console.log('[Dubbing] Updated existing dubbing:', savedDubbing)
        } else {
          // 创建新记录
          savedDubbing = await createDubbingAsync({
            project_id: currentProjectId || '',
            storyboard_id: storyboardId,
            text: localDubbing.text,
            character_id: characterId,
            audio_url: result.audioUrl,
            duration: result.duration,
            voice_id: voiceId,
            provider: config.provider,
            status: 'completed',
            emotion: emotion,
            audio_prompt: audioPrompt,
            sequence: localDubbing.sequence,
            type: dubbingType,
          })
          console.log('[Dubbing] Created new dubbing:', savedDubbing)

          // 更新本地状态中的 id 和 audio_url（确保数据一致）
          if (savedDubbing) {
            handleUpdateDubbing(storyboardId, tempId, {
              id: savedDubbing.id,
              audio_url: savedDubbing.audio_url,
              duration: savedDubbing.duration,
              status: savedDubbing.status,
            })
          }
        }
        
        if (!savedDubbing) {
          console.error('[Dubbing] Failed to save dubbing to database')
          throw new Error('保存到数据库失败')
        }
      } catch (error) {
        handleUpdateDubbing(storyboardId, tempId, {
          status: 'failed',
        })

        if (localDubbing.id) {
          await updateDubbingAsync({
            id: localDubbing.id,
            data: { status: 'failed' },
          })
        }
      } finally {
        setGeneratingIds(prev => {
          const newSet = new Set(prev)
          newSet.delete(tempId)
          return newSet
        })
      }
    },
    [
      localDubbings,
      config,
      characters,
      ttsGeneration,
      currentProjectId,
      currentEpisodeId,
      createDubbingAsync,
      updateDubbingAsync,
      handleUpdateDubbing,
      selectedWorkflowId,
      generationMode,
    ]
  )

  // 修剪音频
  const handleTrim = useCallback(
    async (storyboardId: string, tempId: string, start: number, end: number) => {
      const localDubbing = localDubbings[storyboardId]?.[tempId]
      if (!localDubbing?.audio_url) return

      try {
        // 转换音频 URL（本地路径需要转换为 asset:// URL）
        const audioUrl = getAudioUrl(localDubbing.audio_url)
        if (!audioUrl) {
          throw new Error('无法获取音频 URL')
        }

        // 使用音频处理服务修剪音频
        const result = await trimAudio(audioUrl, start, end)

        // 更新本地状态
        handleUpdateDubbing(storyboardId, tempId, {
          audio_url: result.audioUrl,
          duration: result.duration,
        })

        // 如果已保存到数据库，更新数据库记录
        if (localDubbing.id) {
          await updateDubbingAsync({
            id: localDubbing.id,
            data: {
              audio_url: result.audioUrl,
              duration: result.duration,
            },
          })
        }
      } catch (error) {
        logger.error('音频修剪失败:', error)
        alert('音频修剪失败: ' + (error instanceof Error ? error.message : '未知错误'))
      }
    },
    [localDubbings, updateDubbingAsync, handleUpdateDubbing]
  )

  // 重新生成
  const handleReplace = useCallback(
    (storyboardId: string, tempId: string) => {
      handleGenerateDubbing(storyboardId, tempId)
    },
    [handleGenerateDubbing]
  )

  // 批量生成
  const handleBatchGenerate = useCallback(
    async (storyboardIds: string[]) => {
      for (const storyboardId of storyboardIds) {
        const storyboardDubbings = localDubbings[storyboardId]
        if (!storyboardDubbings) continue

        for (const localDubbing of Object.values(storyboardDubbings)) {
          if (localDubbing.text?.trim()) {
            await handleGenerateDubbing(storyboardId, localDubbing.tempId)
          }
        }
      }
    },
    [localDubbings, handleGenerateDubbing]
  )

  // 导出所有配音
  const handleExportAll = useCallback(async () => {
    // 筛选有音频文件的配音（不强制要求 status === 'completed'，因为数据库中的 status 可能不一致）
    const completedDubbings = dubbings.filter(d => d.audio_url)

    if (completedDubbings.length === 0) {
      return
    }

    const saveDir = await open({
      directory: true,
      title: '选择保存目录',
    })

    if (!saveDir) return

    console.log('[Export] Save directory selected:', saveDir)
    console.log('[Export] Total dubbings to export:', completedDubbings.length)
    console.log('[Export] Dubbings list:', completedDubbings.map(d => ({ id: d.id, audio_url: d.audio_url, sequence: d.sequence })))

    let successCount = 0
    for (let i = 0; i < completedDubbings.length; i++) {
      const dubbing = completedDubbings[i]
      if (!dubbing?.audio_url) continue

      try {
        // 使用原始路径，不经过 getAudioUrl 转换
        const src = dubbing.audio_url
        if (!src) continue

        let fileData: Uint8Array

        // 判断是 URL 还是本地路径（与 AudioPlayer.tsx 相同的逻辑）
        if (src.startsWith('http') || src.startsWith('asset://') || src.startsWith('blob:')) {
          // URL: 使用 fetch 下载
          console.log('[Export] Fetching URL:', src)
          const response = await fetch(src)
          if (!response.ok) {
            throw new Error(`下载失败: ${response.status}`)
          }
          const blob = await response.blob()
          const arrayBuffer = await blob.arrayBuffer()
          fileData = new Uint8Array(arrayBuffer)
          console.log('[Export] Fetched successfully, size:', fileData.byteLength)
        } else {
          // 本地路径: 使用 readFile 读取
          console.log('[Export] Reading local file:', src)
          fileData = await readFile(src)
          console.log('[Export] File read successfully, size:', fileData.byteLength)
        }

        const storyboard = storyboards.find(s => s.id === dubbing?.storyboard_id)
        const character = characters.find(c => c.id === dubbing?.character_id)

        // 使用配音的 sequence 字段作为序号，而不是数组索引
        const sequence = String(dubbing.sequence || i + 1).padStart(3, '0')
        // 清理所有名称字段中的 Windows 非法字符
        const sanitizeFilename = (name: string) => name.replace(/[\\/:*?"<>|]/g, '_')
        const storyboardName = sanitizeFilename(storyboard?.name || '未知分镜')
        const characterName = sanitizeFilename(character?.name || '未知角色')
        const text = sanitizeFilename((dubbing?.text || '').slice(0, 20))
        const filename = `${sequence}_${storyboardName}_${characterName}_${text}.wav`

        // 使用 Tauri 的 join 函数正确处理路径
        const savePath = await join(saveDir, filename)
        console.log('[Export] Saving to:', savePath, 'size:', fileData.byteLength)
        await writeFile(savePath, fileData)
        console.log('[Export] File saved successfully:', savePath)
        
        // 验证文件是否实际存在
        const fileExists = await exists(savePath)
        console.log('[Export] File exists check:', fileExists, 'path:', savePath)
        
        successCount++
      } catch (error) {
        logger.error('导出配音失败:', dubbing.id, error)
      }
    }

    if (successCount > 0) {
      toast({ title: '导出成功', description: `已导出 ${successCount} 条配音` })
    }
  }, [dubbings, storyboards, characters, toast])

  if (!currentEpisodeId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Mic className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">请先选择剧集</h3>
          <p className="text-muted-foreground mt-1">在项目管理中选择一个剧集开始配音</p>
        </div>
      </div>
    )
  }

  const isLoading = isLoadingStoryboards || isLoadingDubbings || isLoadingCharacters

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* 顶部模式切换栏 */}
      <div className="h-14 border-b flex items-center justify-between px-4 bg-muted/30">
        <div className="flex items-center gap-4">
          <h3 className="font-semibold flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            分镜配音
          </h3>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">旁白解说模式</span>
            <Switch checked={loadNarration} onCheckedChange={setLoadNarration} />
          </div>

        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            旁白
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            角色
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-orange-500" />
            额外
          </span>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-80 border-r flex-shrink-0 overflow-hidden">
          <CharacterPanel
            characters={characters}
            voices={voices}
            selectedCharacterId={selectedCharacterId}
            onSelectCharacter={setSelectedCharacterId}
            onCreateCharacter={handleCreateCharacter}
            onUpdateCharacter={handleUpdateCharacterInfo}
            onDeleteCharacter={handleDeleteCharacter}
            onPreviewVoice={previewVoice}
            projectId={currentProjectId || undefined}
            episodeId={currentEpisodeId || undefined}
            provider={config.provider}
          />
        </div>

        <div className="flex-1 overflow-hidden">
          <StoryboardDubbingPanel
            storyboards={storyboards}
            dubbings={dubbings}
            localDubbings={localDubbings}
            characters={characters}
            generatingIds={generatingIds}
            provider={config.provider}
            loadNarration={loadNarration}
            onAddDubbing={handleAddDubbing}
            onUpdateDubbing={handleUpdateDubbing}
            onDeleteDubbing={handleDeleteDubbing}
            onMoveDubbing={handleMoveDubbing}
            onGenerate={handleGenerateDubbing}
            onTrim={handleTrim}
            onReplace={handleReplace}
            onSaveDubbing={async () => {}}
            onBatchGenerate={handleBatchGenerate}
            onExportAll={handleExportAll}
          />
        </div>

        <div className="w-80 border-l flex-shrink-0 overflow-hidden">
          <DubbingConfigPanel
            config={config}
            characters={characters}
            voices={voices}
            project={currentProject}
            generationMode={generationMode}
            comfyuiWorkflows={comfyuiWorkflows}
            selectedWorkflowId={selectedWorkflowId}
            comfyuiConnected={comfyuiConnected}
            comfyUIParams={comfyUIParams}
            onConfigChange={updateConfig}
            onResetConfig={resetConfig}
            onGenerationModeChange={setGenerationMode}
            onWorkflowChange={setSelectedWorkflowId}
            onWorkflowParamsChange={setComfyUIParams}
            getComfyUIParamsRef={getComfyUIParamsRef}
          />
        </div>
      </div>
    </div>
  )
}
