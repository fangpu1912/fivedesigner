/**
 * 安全存储服务
 * 使用 Tauri Store 加密存储敏感信息（如 API Key）
 */

import { Store } from '@tauri-apps/plugin-store'

class SecureStorageService {
  private store: Store | null = null
  private storeName = 'secure-config.json'
  private initialized = false

  /**
   * 初始化存储
   */
  async init(): Promise<void> {
    if (this.initialized) return

    try {
      this.store = await Store.load(this.storeName)
      this.initialized = true
    } catch (error) {
      console.error('Failed to initialize secure storage:', error)
      throw error
    }
  }

  /**
   * 确保存储已初始化
   */
  private async ensureInit(): Promise<void> {
    if (!this.initialized || !this.store) {
      await this.init()
    }
  }

  /**
   * 存储敏感数据
   * @param key 存储键
   * @param value 敏感值
   */
  async set(key: string, value: string): Promise<void> {
    await this.ensureInit()
    if (!this.store) throw new Error('Store not initialized')

    await this.store.set(key, value)
    await this.store.save()
  }

  /**
   * 获取敏感数据
   * @param key 存储键
   * @returns 敏感值，不存在则返回 null
   */
  async get(key: string): Promise<string | null> {
    await this.ensureInit()
    if (!this.store) throw new Error('Store not initialized')

    const value = await this.store.get<string>(key)
    return value ?? null
  }

  /**
   * 删除敏感数据
   * @param key 存储键
   */
  async delete(key: string): Promise<void> {
    await this.ensureInit()
    if (!this.store) throw new Error('Store not initialized')

    await this.store.delete(key)
    await this.store.save()
  }

  /**
   * 检查键是否存在
   * @param key 存储键
   */
  async has(key: string): Promise<boolean> {
    await this.ensureInit()
    if (!this.store) throw new Error('Store not initialized')

    const value = await this.store.get<string>(key)
    return value !== null && value !== undefined
  }

  /**
   * 清空所有数据
   */
  async clear(): Promise<void> {
    await this.ensureInit()
    if (!this.store) throw new Error('Store not initialized')

    await this.store.clear()
    await this.store.save()
  }

  /**
   * 获取所有键
   */
  async keys(): Promise<string[]> {
    await this.ensureInit()
    if (!this.store) throw new Error('Store not initialized')

    return this.store.keys()
  }
}

// 导出单例
export const secureStorage = new SecureStorageService()

// 便捷方法：API Key 存储
export const apiKeyStorage = {
  /**
   * 存储 API Key
   * @param provider 提供商标识
   * @param apiKey API Key
   */
  async setApiKey(provider: string, apiKey: string): Promise<void> {
    await secureStorage.set(`api_key_${provider}`, apiKey)
  },

  /**
   * 获取 API Key
   * @param provider 提供商标识
   */
  async getApiKey(provider: string): Promise<string | null> {
    return secureStorage.get(`api_key_${provider}`)
  },

  /**
   * 删除 API Key
   * @param provider 提供商标识
   */
  async deleteApiKey(provider: string): Promise<void> {
    await secureStorage.delete(`api_key_${provider}`)
  },

  /**
   * 检查 API Key 是否存在
   * @param provider 提供商标识
   */
  async hasApiKey(provider: string): Promise<boolean> {
    return secureStorage.has(`api_key_${provider}`)
  },
}
