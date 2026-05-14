import { describe, it, expect, vi, beforeEach } from 'vitest'

import { getAIConfigsWithSecrets, saveAIConfig, deleteAIConfig } from '../configService'

vi.mock('../configService', () => ({
  getAIConfigsWithSecrets: vi.fn(),
  saveAIConfig: vi.fn(),
  deleteAIConfig: vi.fn(),
}))

describe('configService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getAIConfigsWithSecrets', () => {
    it('should return AI configs with secrets', async () => {
      const mockConfigs = [
        {
          id: 'test-model',
          name: 'Test Model',
          type: 'image' as const,
          provider: 'openai' as const,
          apiKey: 'test-key',
          baseUrl: 'https://api.test.com',
          modelName: 'test-model',
          endpoints: {},
          enabled: true,
        },
      ]
      vi.mocked(getAIConfigsWithSecrets).mockResolvedValue(mockConfigs)

      const result = await getAIConfigsWithSecrets()
      expect(result).toEqual(mockConfigs)
    })
  })

  describe('saveAIConfig', () => {
    it('should save AI config', async () => {
      const mockConfig = {
        id: 'test-model',
        name: 'Test Model',
        type: 'image' as const,
        provider: 'openai' as const,
        apiKey: 'test-key',
        baseUrl: 'https://api.test.com',
        modelName: 'test-model',
        endpoints: {},
        enabled: true,
      }
      vi.mocked(saveAIConfig).mockResolvedValue(undefined)

      await saveAIConfig(mockConfig)
      expect(saveAIConfig).toHaveBeenCalledWith(mockConfig)
    })
  })

  describe('deleteAIConfig', () => {
    it('should delete AI config', async () => {
      vi.mocked(deleteAIConfig).mockResolvedValue(undefined)

      await deleteAIConfig('test-model')
      expect(deleteAIConfig).toHaveBeenCalledWith('test-model')
    })
  })
})
