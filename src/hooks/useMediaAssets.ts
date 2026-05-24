import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { mediaAssetDB, settingsDB } from '@/db'
import type { MediaAsset } from '@/types'

const MEDIA_CATEGORIES_KEY = 'media_asset_categories'

export const mediaAssetKeys = {
  all: ['mediaAssets'] as const,
  lists: () => [...mediaAssetKeys.all, 'list'] as const,
  list: (filters?: { type?: string; tag?: string; category?: string; search?: string }) =>
    [...mediaAssetKeys.lists(), filters] as const,
  details: () => [...mediaAssetKeys.all, 'detail'] as const,
  detail: (id: string) => [...mediaAssetKeys.all, 'detail', id] as const,
  categories: () => [...mediaAssetKeys.all, 'categories'] as const,
}

export function useMediaAssets(filters?: { type?: string; tag?: string; category?: string; search?: string }) {
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

export function useMediaCategories() {
  return useQuery({
    queryKey: mediaAssetKeys.categories(),
    queryFn: async () => {
      const dbCategories = await mediaAssetDB.getCategories()
      const settings = await settingsDB.get()
      const customCategories = (settings[MEDIA_CATEGORIES_KEY] as string[]) || []
      const merged = [...new Set([...dbCategories, ...customCategories])].sort()
      return merged
    },
    staleTime: 5 * 60 * 1000,
  })
}

export async function saveMediaCategory(name: string) {
  const settings = await settingsDB.get()
  const existing = (settings[MEDIA_CATEGORIES_KEY] as string[]) || []
  if (existing.includes(name)) return
  await settingsDB.save({ [MEDIA_CATEGORIES_KEY]: [...existing, name] })
}

export async function deleteMediaCategory(name: string) {
  const settings = await settingsDB.get()
  const existing = (settings[MEDIA_CATEGORIES_KEY] as string[]) || []
  await settingsDB.save({ [MEDIA_CATEGORIES_KEY]: existing.filter(c => c !== name) })
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

  const batchDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      await mediaAssetDB.batchDelete(ids)
      return ids
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaAssetKeys.all })
    },
  })

  const batchUpdateCategory = useMutation({
    mutationFn: async ({ ids, category }: { ids: string[]; category: string | null }) => {
      await mediaAssetDB.batchUpdateCategory(ids, category)
      return { ids, category }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaAssetKeys.all })
    },
  })

  const batchAddTags = useMutation({
    mutationFn: async ({ ids, tags }: { ids: string[]; tags: string[] }) => {
      await mediaAssetDB.batchAddTags(ids, tags)
      return { ids, tags }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaAssetKeys.all })
    },
  })

  return { create, update, remove, batchDelete, batchUpdateCategory, batchAddTags }
}
