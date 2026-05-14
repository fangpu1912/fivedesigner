import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { episodeDB } from '@/db'
import { type Episode } from '@/types'

// Query keys
export const episodeKeys = {
  all: ['episodes'] as const,
  lists: () => [...episodeKeys.all, 'list'] as const,
  list: (projectId: string) => [...episodeKeys.lists(), projectId] as const,
  details: () => [...episodeKeys.all, 'detail'] as const,
  detail: (id: string) => [...episodeKeys.details(), id] as const,
}

// 获取剧集列表
export function useEpisodesQuery(projectId: string) {
  return useQuery({
    queryKey: episodeKeys.list(projectId),
    queryFn: () => episodeDB.getAll(projectId),
    enabled: !!projectId,
  })
}

// 获取单个剧集
export function useEpisodeQuery(id: string) {
  return useQuery({
    queryKey: episodeKeys.detail(id),
    queryFn: () => episodeDB.getById(id),
    enabled: !!id,
  })
}

// 创建剧集
export function useCreateEpisodeMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (episode: Omit<Episode, 'id' | 'created_at' | 'updated_at'>) =>
      episodeDB.create(episode),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: episodeKeys.list(variables.project_id) })
    },
  })
}

// 更新剧集
export function useUpdateEpisodeMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Episode> }) =>
      episodeDB.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: episodeKeys.lists() })
      queryClient.invalidateQueries({ queryKey: episodeKeys.detail(variables.id) })
    },
  })
}

// 删除剧集
export function useDeleteEpisodeMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => episodeDB.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: episodeKeys.lists() })
      queryClient.invalidateQueries({ queryKey: ['characters'] })
      queryClient.invalidateQueries({ queryKey: ['scenes'] })
      queryClient.invalidateQueries({ queryKey: ['props'] })
    },
  })
}
