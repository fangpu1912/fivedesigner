import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { scriptDB } from '@/db'
import type { Script, ExtractedAsset, ExtractedDubbing, ExtractedShot } from '@/types'

// Query keys
export const scriptKeys = {
  all: ['scripts'] as const,
  byEpisode: (episodeId: string) => [...scriptKeys.all, 'episode', episodeId] as const,
  detail: (id: string) => [...scriptKeys.all, 'detail', id] as const,
}

// Hook: 获取剧集的脚本
export function useScriptQuery(episodeId: string | null) {
  return useQuery({
    queryKey: scriptKeys.byEpisode(episodeId || ''),
    queryFn: async () => {
      if (!episodeId) return null
      const script = await scriptDB.getByEpisode(episodeId)
      return script
    },
    enabled: !!episodeId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Hook: 获取单个脚本详情
export function useScriptDetailQuery(scriptId: string | null) {
  return useQuery({
    queryKey: scriptKeys.detail(scriptId || ''),
    queryFn: async () => {
      if (!scriptId) return null
      const script = await scriptDB.getById(scriptId)
      return script
    },
    enabled: !!scriptId,
    staleTime: 5 * 60 * 1000,
  })
}

// Hook: 创建脚本
export function useCreateScriptMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: {
      episode_id: string
      title: string
      content: string
    }) => {
      const script = await scriptDB.create(data)
      return script
    },
    onSuccess: (data) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: scriptKeys.all })
      queryClient.invalidateQueries({ queryKey: scriptKeys.byEpisode(data.episode_id) })
    },
  })
}

// Hook: 更新脚本
export function useUpdateScriptMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string
      data: Partial<Script>
    }) => {
      await scriptDB.update(id, data)
    },
    onSuccess: (_, variables) => {
      // Invalidate specific script query
      queryClient.invalidateQueries({ queryKey: scriptKeys.detail(variables.id) })
      // Also invalidate all scripts list
      queryClient.invalidateQueries({ queryKey: scriptKeys.all })
    },
  })
}

// Hook: 删除脚本
export function useDeleteScriptMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      await scriptDB.delete(id)
      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scriptKeys.all })
    },
  })
}

// Hook: 保存脚本内容（自动保存用）
export function useSaveScriptContentMutation() {
  const queryClient = useQueryClient()
  const createMutation = useCreateScriptMutation()
  const updateMutation = useUpdateScriptMutation()

  return useMutation({
    mutationFn: async ({
      scriptId,
      episodeId,
      title,
      content,
      extracted_assets,
      extracted_dubbing,
      extracted_shots,
    }: {
      scriptId: string | null
      episodeId: string
      title: string
      content: string
      extracted_assets?: ExtractedAsset[]
      extracted_dubbing?: ExtractedDubbing[]
      extracted_shots?: ExtractedShot[]
    }) => {
      if (scriptId) {
        // Update existing
        await scriptDB.update(scriptId, {
          title,
          content,
          ...(extracted_assets && { extracted_assets }),
          ...(extracted_dubbing && { extracted_dubbing }),
          ...(extracted_shots && { extracted_shots }),
        })
        return { id: scriptId, episode_id: episodeId, created: false }
      } else {
        // Create new
        const script = await scriptDB.create({
          episode_id: episodeId,
          title,
          content,
          extracted_assets,
          extracted_dubbing,
          extracted_shots,
        })
        return { id: script.id, episode_id: episodeId, created: true }
      }
    },
    onSuccess: (result) => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: scriptKeys.byEpisode(result.episode_id) })
      if (result.id) {
        queryClient.invalidateQueries({ queryKey: scriptKeys.detail(result.id) })
      }
    },
  })
}
