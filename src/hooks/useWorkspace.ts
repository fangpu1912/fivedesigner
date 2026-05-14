import { useState, useCallback, useEffect } from 'react'

import { workspaceService, type AssetType, type FileMetadata } from '@/services/workspace'

interface UseWorkspaceOptions {
  autoInit?: boolean
}

export function useWorkspace(options: UseWorkspaceOptions = {}) {
  const { autoInit = true } = options
  const [initialized, setInitialized] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (autoInit) {
      initialize()
    }
  }, [autoInit])

  const initialize = useCallback(async () => {
    try {
      setLoading(true)
      await workspaceService.initialize()
      setInitialized(true)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize workspace')
    } finally {
      setLoading(false)
    }
  }, [])

  const saveFile = useCallback(
    async (
      data: Uint8Array,
      type: AssetType,
      originalName: string,
      options?: {
        projectId?: string
        episodeId?: string
        mimeType?: string
        metadata?: Record<string, unknown>
      }
    ): Promise<FileMetadata | null> => {
      try {
        setLoading(true)
        setError(null)
        const metadata = await workspaceService.saveFile(data, type, originalName, options)
        return metadata
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save file')
        return null
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const getAssetUrl = useCallback(async (relativePath: string): Promise<string | null> => {
    try {
      const url = await workspaceService.getAssetUrl(relativePath)
      return url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get asset URL')
      return null
    }
  }, [])

  const deleteFile = useCallback(async (relativePath: string): Promise<boolean> => {
    try {
      setLoading(true)
      setError(null)
      await workspaceService.deleteFile(relativePath)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete file')
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  const getMetadata = useCallback(async (relativePath: string): Promise<FileMetadata | null> => {
    try {
      const metadata = await workspaceService.getMetadata(relativePath)
      return metadata
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get metadata')
      return null
    }
  }, [])

  return {
    initialized,
    loading,
    error,
    initialize,
    saveFile,
    getAssetUrl,
    deleteFile,
    getMetadata,
  }
}
