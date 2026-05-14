/**
 * 本地存储服务
 */

export const localStorageService = {
  async getSetting<T>(key: string): Promise<T | null> {
    try {
      const stored = localStorage.getItem(key)
      if (stored) {
        return JSON.parse(stored) as T
      }
      return null
    } catch {
      return null
    }
  },

  async setSetting<T>(key: string, value: T): Promise<void> {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (error) {
      console.error('保存设置失败:', error)
    }
  },

  async removeSetting(key: string): Promise<void> {
    try {
      localStorage.removeItem(key)
    } catch (error) {
      console.error('删除设置失败:', error)
    }
  },
}

export default localStorageService
