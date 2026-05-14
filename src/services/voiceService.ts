import type { Voice, VoiceFilter, VoiceTrimConfig, VoiceUploadConfig } from '@/types/voice'
import { DEFAULT_VOICE_UPLOAD_CONFIG } from '@/types/voice'
import { getAssetUrl } from '@/utils/asset'
import { saveVoiceFile, deleteVoiceDirectory } from '@/utils/mediaStorage'

// 本地存储键 - 只存储元数据
const VOICES_STORAGE_KEY = 'fivedesigner_voices'

class VoiceService {
  private voices: Voice[] = []
  private uploadConfig: VoiceUploadConfig = DEFAULT_VOICE_UPLOAD_CONFIG
  private loadPromise: Promise<void> | null = null

  constructor() {
    this.loadPromise = this.loadFromStorage()
  }

  // 等待数据加载完成
  async waitForLoad(): Promise<void> {
    if (this.loadPromise) {
      await this.loadPromise
    }
  }

  // 从本地存储加载（只加载元数据）
  private async loadFromStorage(): Promise<void> {
    try {
      const stored = localStorage.getItem(VOICES_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        // 加载时使用 convertFileSrc 获取音频 URL
        this.voices = await Promise.all(
          parsed.map(async (v: any) => {
            let audioUrl = v.audioUrl
            // 如果有文件路径，使用 getAssetUrl 获取 URL
            if (v.filePath) {
              try {
                audioUrl = getAssetUrl(v.filePath)
              } catch (e) {
                console.error('加载音频文件 URL 失败:', e)
                audioUrl = ''
              }
            }

            return {
              ...v,
              audioUrl,
              // 恢复 Date 对象
              createdAt: v.createdAt,
              updatedAt: v.updatedAt,
            }
          })
        )
      }
    } catch (error) {
      console.error('加载音色数据失败:', error)
      this.voices = []
    }
  }

  // 保存到本地存储（只保存元数据，不保存音频数据）
  private saveToStorage(): void {
    try {
      // 存储时不包含 audioUrl (Blob URL) 和 audioData
      const storageData = this.voices.map(v => ({
        ...v,
        audioUrl: undefined,
        audioData: undefined,
      }))
      localStorage.setItem(VOICES_STORAGE_KEY, JSON.stringify(storageData))
    } catch (error) {
      console.error('保存音色数据失败:', error)
    }
  }

  // 获取所有音色
  getAllVoices(filter?: VoiceFilter): Voice[] {
    let result = [...this.voices]

    if (filter) {
      if (filter.type) {
        result = result.filter(v => v.type === filter.type)
      }
      if (filter.status) {
        result = result.filter(v => v.status === filter.status)
      }
      if (filter.language) {
        result = result.filter(v => v.language === filter.language)
      }
      if (filter.search) {
        const search = filter.search.toLowerCase()
        result = result.filter(
          v =>
            v.name.toLowerCase().includes(search) || v.description?.toLowerCase().includes(search)
        )
      }
    }

    // 按创建时间倒序
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  // 获取单个音色
  getVoiceById(id: string): Voice | undefined {
    return this.voices.find(v => v.id === id)
  }

  // 验证音频文件
  validateAudioFile(file: File): { valid: boolean; error?: string } {
    // 检查文件类型
    if (!this.uploadConfig.supportedFormats.includes(file.type)) {
      return {
        valid: false,
        error: `不支持的文件格式。支持的格式: ${this.uploadConfig.supportedFormats.join(', ')}`,
      }
    }

    // 检查文件大小
    if (file.size > this.uploadConfig.maxFileSize) {
      return {
        valid: false,
        error: `文件过大。最大允许: ${this.uploadConfig.maxFileSize / 1024 / 1024}MB`,
      }
    }

    return { valid: true }
  }

  // 获取音频时长
  async getAudioDuration(file: File): Promise<number> {
    return new Promise((resolve, reject) => {
      const audio = new Audio()
      audio.preload = 'metadata'

      audio.onloadedmetadata = () => {
        resolve(audio.duration)
      }

      audio.onerror = () => {
        reject(new Error('无法读取音频文件'))
      }

      audio.src = URL.createObjectURL(file)
    })
  }

  // 上传音色
  async uploadVoice(file: File, name: string, description?: string): Promise<Voice> {
    // 验证文件
    const validation = this.validateAudioFile(file)
    if (!validation.valid) {
      throw new Error(validation.error)
    }

    // 获取音频时长
    const duration = await this.getAudioDuration(file)

    // 检查时长限制
    if (duration < this.uploadConfig.minDuration) {
      throw new Error(`音频时长太短。最小要求: ${this.uploadConfig.minDuration}秒`)
    }
    if (duration > this.uploadConfig.maxDuration) {
      throw new Error(`音频时长太长。最大允许: ${this.uploadConfig.maxDuration}秒`)
    }

    // 读取文件为 ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()

    const now = new Date().toISOString()
    const voiceId = `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // 保存文件到本地存储
    const fileName = `${voiceId}_${file.name}`
    const filePath = await saveVoiceFile(voiceId, arrayBuffer, fileName)

    // 使用 getAssetUrl 获取音频 URL
    const audioUrl = getAssetUrl(filePath) || ''

    const voice: Voice = {
      id: voiceId,
      name,
      description,
      type: 'custom',
      status: 'active',
      audioUrl,
      filePath, // 存储文件路径
      mimeType: file.type,
      duration,
      createdAt: now,
      updatedAt: now,
    }

    this.voices.push(voice)
    this.saveToStorage()

    return voice
  }

  // 更新音色
  updateVoice(id: string, updates: Partial<Voice>): Voice {
    const index = this.voices.findIndex(v => v.id === id)
    if (index === -1) {
      throw new Error('音色不存在')
    }

    const existingVoice = this.voices[index]
    if (!existingVoice) {
      throw new Error('音色不存在')
    }

    this.voices[index] = {
      ...existingVoice,
      ...updates,
      updatedAt: new Date().toISOString(),
    }

    this.saveToStorage()
    return this.voices[index]!
  }

  // 删除音色
  async deleteVoice(id: string): Promise<void> {
    const index = this.voices.findIndex(v => v.id === id)
    if (index === -1) {
      throw new Error('音色不存在')
    }

    // 删除本地文件
    try {
      await deleteVoiceDirectory(id)
    } catch (e) {
      console.error('删除音频文件失败:', e)
    }

    this.voices.splice(index, 1)
    this.saveToStorage()
  }

  // 裁剪音色
  async trimVoice(id: string, trimConfig: VoiceTrimConfig): Promise<Voice> {
    const voice = this.getVoiceById(id)
    if (!voice) {
      throw new Error('音色不存在')
    }

    // 验证裁剪范围
    if (trimConfig.start < 0 || trimConfig.end > voice.duration) {
      throw new Error('裁剪范围无效')
    }
    if (trimConfig.end - trimConfig.start < this.uploadConfig.minDuration) {
      throw new Error(`裁剪后音频太短。最小要求: ${this.uploadConfig.minDuration}秒`)
    }

    // 更新裁剪信息
    const updated = this.updateVoice(id, {
      trimStart: trimConfig.start,
      trimEnd: trimConfig.end,
    })

    return updated
  }

  // 绑定音色到提供商
  bindVoice(voiceId: string, provider: string, providerVoiceId: string): Voice {
    const voice = this.getVoiceById(voiceId)
    if (!voice) {
      throw new Error('音色不存在')
    }

    const updated = this.updateVoice(voiceId, {
      boundProvider: provider,
      boundVoiceId: providerVoiceId,
    })

    return updated
  }

  // 解绑音色
  unbindVoice(voiceId: string): Voice {
    const voice = this.getVoiceById(voiceId)
    if (!voice) {
      throw new Error('音色不存在')
    }

    const updated = this.updateVoice(voiceId, {
      boundProvider: undefined,
      boundVoiceId: undefined,
    })

    return updated
  }

  // 获取绑定的音色
  getBoundVoices(provider?: string): Voice[] {
    let result = this.voices.filter(v => v.boundProvider && v.boundVoiceId)
    if (provider) {
      result = result.filter(v => v.boundProvider === provider)
    }
    return result
  }

  // 导出音色数据
  async exportVoice(voiceId: string): Promise<{ voice: Voice; blob: Blob } | null> {
    const voice = this.getVoiceById(voiceId)
    if (!voice || !voice.filePath) {
      return null
    }

    try {
      const { readVoiceFile } = await import('@/utils/mediaStorage')
      const audioData = await readVoiceFile(voice.filePath)
      const blob = new Blob([audioData], { type: voice.mimeType || 'audio/wav' })
      return { voice, blob }
    } catch (e) {
      console.error('导出音色失败:', e)
      return null
    }
  }

  // 更新音色音频文件
  async updateVoiceAudio(id: string, file: File): Promise<Voice> {
    const index = this.voices.findIndex(v => v.id === id)
    if (index === -1) {
      throw new Error('音色不存在')
    }

    const voice = this.voices[index]
    if (!voice) {
      throw new Error('音色不存在')
    }

    // 验证文件
    const validation = this.validateAudioFile(file)
    if (!validation.valid) {
      throw new Error(validation.error)
    }

    // 获取音频时长
    const duration = await this.getAudioDuration(file)

    // 读取文件为 ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()

    // 删除旧文件并保存新文件
    try {
      await deleteVoiceDirectory(id)
    } catch (e) {
      console.error('删除旧音频文件失败:', e)
    }

    // 保存新文件
    const fileName = `${id}_${file.name}`
    const filePath = await saveVoiceFile(id, arrayBuffer, fileName)

    // 使用 getAssetUrl 获取新的音频 URL
    const audioUrl = getAssetUrl(filePath) || ''

    // 更新音色数据
    const updatedVoice: Voice = {
      ...voice,
      id: voice.id || id,
      name: voice.name || '未命名音色',
      type: voice.type || 'custom',
      status: voice.status || 'active',
      audioUrl,
      filePath,
      mimeType: file.type,
      duration,
      trimStart: undefined,
      trimEnd: undefined,
      createdAt: voice.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    this.voices[index] = updatedVoice

    this.saveToStorage()
    return updatedVoice
  }

  // 获取上传配置
  getUploadConfig(): VoiceUploadConfig {
    return { ...this.uploadConfig }
  }

  // 设置上传配置
  setUploadConfig(config: Partial<VoiceUploadConfig>): void {
    this.uploadConfig = { ...this.uploadConfig, ...config }
  }
}

// 导出单例
export const voiceService = new VoiceService()
