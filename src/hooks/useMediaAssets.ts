import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { mediaAssetDB } from '@/db'
import type { MediaAsset } from '@/types'

export const mediaAssetKeys = {
  all: ['mediaAssets'] as const,
  lists: () => [...mediaAssetKeys.all, 'list'] as const,
  list: (filters?: { type?: string; tag?: string; search?: string }) =>
    [...mediaAssetKeys.lists(), filters] as const,
  details: () => [...mediaAssetKeys.all, 'detail'] as const,
  detail: (id: string) => [...mediaAssetKeys.details(), id] as const,
}

export function useMediaAssets(filters?: { type?: string; tag?: string; search?: string }) {
  return useQuery({
    queryKey: mediaAssetKeys.list(filters),
    queryFn: () => mediaAssetDB.getAll(filters),
    staleTime: 5 * 60 * 1000,
  })
}

export function useMediaAsset(id: string) {
  return useQuery({
    queryKey: mediaAssetKeys.detail(id),
    queryFn: () => mediaAssetDB.getById(id),
    enabled: !!id,
  })
}

export function useMediaAssetMutations() {
  const queryClient = useQueryClient()

  const create = useMutation({
    mutationFn: async (data: Omit<MediaAsset, 'id' | 'created_at' | 'updated_at'>) => {
      return await mediaAssetDB.create(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaAssetKeys.all })
    },
  })

  const update = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<MediaAsset> }) => {
      return await mediaAssetDB.update(id, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaAssetKeys.all })
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await mediaAssetDB.delete(id)
      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaAssetKeys.all })
    },
  })

  return { create, update, remove }
}
