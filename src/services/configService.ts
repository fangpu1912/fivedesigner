import { type AIModelConfig } from '@/types'

import { secureStorage } from './secureStorage'

const CONFIG_KEY = 'fivedesigner_config'

// 存储在 localStorage 的配置（不包含敏感信息）
interface AppConfig {
  theme: 'light' | 'dark'
  aiConfigs: Array<Omit<AIModelConfig, 'apiKey'>> // 不包含 apiKey
  comfyUIServerUrl: string
  defaultAspectRatio: string
}

const defaultConfig: AppConfig = {
  theme: 'dark',
  aiConfigs: [],
  comfyUIServerUrl: 'http://127.0.0.1:8188',
  defaultAspectRatio: '16:9',
}

function sanitizeConfig(config: Partial<AppConfig> | null | undefined): AppConfig {
  const safeConfig = config ?? {}

  return {
    theme: safeConfig.theme === 'light' ? 'light' : defaultConfig.theme,
    aiConfigs: Array.isArray(safeConfig.aiConfigs)
      ? (safeConfig.aiConfigs.filter(Boolean) as Array<Omit<AIModelConfig, 'apiKey'>>)
      : defaultConfig.aiConfigs,
    comfyUIServerUrl:
      typeof safeConfig.comfyUIServerUrl === 'string' &&
      safeConfig.comfyUIServerUrl.trim().length > 0
        ? safeConfig.comfyUIServerUrl
        : defaultConfig.comfyUIServerUrl,
    defaultAspectRatio:
      typeof safeConfig.defaultAspectRatio === 'string' &&
      safeConfig.defaultAspectRatio.trim().length > 0
        ? safeConfig.defaultAspectRatio
        : defaultConfig.defaultAspectRatio,
  }
}

export function getConfig(): AppConfig {
  try {
    const stored = localStorage.getItem(CONFIG_KEY)
    if (!stored) {
      return defaultConfig
    }

    return sanitizeConfig(JSON.parse(stored) as Partial<AppConfig>)
  } catch (error) {
    console.error('[configService] Failed to load config, fallback to defaults:', error)
    localStorage.removeItem(CONFIG_KEY)
    return defaultConfig
  }
}

export function saveConfig(config: Partial<AppConfig>): AppConfig {
  const current = getConfig()
  const newConfig = sanitizeConfig({ ...current, ...config })
  localStorage.setItem(CONFIG_KEY, JSON.stringify(newConfig))
  return newConfig
}

// 获取 AI 配置（不包含 apiKey）
export function getAIConfigs(): Array<Omit<AIModelConfig, 'apiKey'>> {
  return getConfig().aiConfigs
}

// 获取完整的 AI 配置（包含 apiKey，异步）
export async function getAIConfigsWithSecrets(): Promise<AIModelConfig[]> {
  const configs = getConfig().aiConfigs
  const configsWithSecrets: AIModelConfig[] = []

  for (const config of configs) {
    const apiKey = await secureStorage.get(`api_key_${config.id}`)
    configsWithSecrets.push({
      ...config,
      apiKey: apiKey || '',
    } as AIModelConfig)
  }

  return configsWithSecrets
}

// 获取单个 AI 配置（包含 apiKey，异步）
export async function getAIConfigWithSecrets(id: string): Promise<AIModelConfig | null> {
  const config = getConfig().aiConfigs.find(c => c.id === id)
  if (!config) return null

  const apiKey = await secureStorage.get(`api_key_${id}`)
  return {
    ...config,
    apiKey: apiKey || '',
  } as AIModelConfig
}

export function getEnabledAIConfigs(): Array<Omit<AIModelConfig, 'apiKey'>> {
  return getAIConfigs().filter(config => config.enabled !== false)
}

// 获取启用的 AI 配置（包含 apiKey，异步）
export async function getEnabledAIConfigsWithSecrets(): Promise<AIModelConfig[]> {
  const configs = await getAIConfigsWithSecrets()
  return configs.filter(config => config.enabled !== false)
}

// 保存 AI 配置（apiKey 存储到安全存储）
export async function saveAIConfig(config: AIModelConfig): Promise<void> {
  const current = getConfig()
  const index = current.aiConfigs.findIndex(c => c.id === config.id)

  // 提取 apiKey
  const { apiKey, ...configWithoutKey } = config

  if (index >= 0) {
    current.aiConfigs[index] = configWithoutKey as Omit<AIModelConfig, 'apiKey'>
  } else {
    current.aiConfigs.push(configWithoutKey as Omit<AIModelConfig, 'apiKey'>)
  }

  // 保存配置（不含 apiKey）到 localStorage
  saveConfig({ aiConfigs: current.aiConfigs })

  // 保存 apiKey 到安全存储
  if (apiKey) {
    await secureStorage.set(`api_key_${config.id}`, apiKey)
  }
}

// 删除 AI 配置
export async function deleteAIConfig(id: string): Promise<void> {
  const current = getConfig()
  current.aiConfigs = current.aiConfigs.filter(c => c.id !== id)
  saveConfig({ aiConfigs: current.aiConfigs })

  // 同时删除安全存储中的 apiKey
  await secureStorage.delete(`api_key_${id}`)
}

export function getComfyUIServerUrl(): string {
  return getConfig().comfyUIServerUrl
}

export function saveComfyUIServerUrl(url: string): void {
  saveConfig({ comfyUIServerUrl: url })
}

export function getTheme(): 'light' | 'dark' {
  return getConfig().theme
}

export function saveTheme(theme: 'light' | 'dark'): void {
  saveConfig({ theme })
}
