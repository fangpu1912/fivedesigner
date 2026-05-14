import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { sceneDB, propDB } from '@/db'
import type { Scene, Prop } from '@/types'
import { useCharactersByEpisode, useCharacterMutations, useAllCharacters } from './useCharacters'

export { useCharactersByEpisode, useCharacterMutations, useAllCharacters }

export const sceneKeys = {
  all: ['scenes'] as const,
  lists: () => [...sceneKeys.all, 'list'] as const,
  list: (projectId: string, episodeId?: string) =>
    [...sceneKeys.lists(), projectId, episodeId] as const,
  byEpisode: (episodeId: string) => [...sceneKeys.all, 'episode', episodeId] as const,
  details: () => [...sceneKeys.all, 'detail'] as const,
  detail: (id: string) => [...sceneKeys.details(), id] as const,
}

export const propKeys = {
  all: ['props'] as const,
  lists: () => [...propKeys.all, 'list'] as const,
  list: (projectId: string, episodeId?: string) =>
    [...propKeys.lists(), projectId, episodeId] as const,
  byEpisode: (episodeId: string) => [...propKeys.all, 'episode', episodeId] as const,
  details: () => [...propKeys.all, 'detail'] as const,
  detail: (id: string) => [...propKeys.details(), id] as const,
}

export function useScenes(projectId: string, episodeId?: string) {
  return useQuery({
    queryKey: sceneKeys.list(projectId, episodeId),
    queryFn: () => {
      if (episodeId) return sceneDB.getByEpisode(episodeId)
      return sceneDB.getAll(projectId)
    },
    enabled: !!projectId || !!episodeId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useScenesByEpisode(episodeId?: string) {
  return useQuery({
    queryKey: sceneKeys.byEpisode(episodeId || ''),
    queryFn: async () => {
      if (!episodeId) return []
      return await sceneDB.getByEpisode(episodeId)
    },
    enabled: !!episodeId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useScene(sceneId: string) {
  return useQuery({
    queryKey: sceneKeys.detail(sceneId),
    queryFn: () => sceneDB.getById(sceneId),
    enabled: !!sceneId,
  })
}

export function useProps(projectId: string, episodeId?: string) {
  return useQuery({
    queryKey: propKeys.list(projectId, episodeId),
    queryFn: () => {
      if (episodeId) return propDB.getByEpisode(episodeId)
      return propDB.getAll(projectId)
    },
    enabled: !!projectId || !!episodeId,
    staleTime: 5 * 60 * 1000,
  })
}

export function usePropsByEpisode(episodeId?: string) {
  return useQuery({
    queryKey: propKeys.byEpisode(episodeId || ''),
    queryFn: async () => {
      if (!episodeId) return []
      return await propDB.getByEpisode(episodeId)
    },
    enabled: !!episodeId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useProp(propId: string) {
  return useQuery({
    queryKey: propKeys.detail(propId),
    queryFn: () => propDB.getById(propId),
    enabled: !!propId,
  })
}

export function useSceneMutations() {
  const queryClient = useQueryClient()

  const create = useMutation({
    mutationFn: async (data: Omit<Scene, 'id' | 'created_at' | 'updated_at'>) => {
      return await sceneDB.create(data)
    },
    onSuccess: scene => {
      if (scene.episode_id) {
        queryClient.invalidateQueries({ queryKey: sceneKeys.byEpisode(scene.episode_id) })
      }
      queryClient.invalidateQueries({ queryKey: sceneKeys.all })
    },
  })

  const update = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Scene> }) => {
      return await sceneDB.update(id, data)
    },
    onSuccess: scene => {
      if (scene.episode_id) {
        queryClient.invalidateQueries({ queryKey: sceneKeys.byEpisode(scene.episode_id) })
      }
      queryClient.invalidateQueries({ queryKey: sceneKeys.all })
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await sceneDB.delete(id)
      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sceneKeys.all })
    },
  })

  const createBatch = useMutation({
    mutationFn: async (items: Array<Omit<Scene, 'id' | 'created_at' | 'updated_at'>>) => {
      const scenes: Scene[] = []
      for (const item of items) {
        const scene = await sceneDB.create(item)
        scenes.push(scene)
      }
      return scenes
    },
    onSuccess: scenes => {
      const episodeIds = [...new Set(scenes.map(s => s.episode_id))]
      episodeIds.forEach(id => {
        if (id) queryClient.invalidateQueries({ queryKey: sceneKeys.byEpisode(id) })
      })
      queryClient.invalidateQueries({ queryKey: sceneKeys.all })
    },
  })

  const batchDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await sceneDB.delete(id)
      }
      return ids
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sceneKeys.all })
    },
  })

  return { create, update, remove, createBatch, batchDelete }
}

export function usePropMutations() {
  const queryClient = useQueryClient()

  const create = useMutation({
    mutationFn: async (data: Omit<Prop, 'id' | 'created_at' | 'updated_at'>) => {
      return await propDB.create(data)
    },
    onSuccess: prop => {
      if (prop.episode_id) {
        queryClient.invalidateQueries({ queryKey: propKeys.byEpisode(prop.episode_id) })
      }
      queryClient.invalidateQueries({ queryKey: propKeys.all })
    },
  })

  const update = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Prop> }) => {
      return await propDB.update(id, data)
    },
    onSuccess: prop => {
      if (prop.episode_id) {
        queryClient.invalidateQueries({ queryKey: propKeys.byEpisode(prop.episode_id) })
      }
      queryClient.invalidateQueries({ queryKey: propKeys.all })
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await propDB.delete(id)
      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: propKeys.all })
    },
  })

  const createBatch = useMutation({
    mutationFn: async (items: Array<Omit<Prop, 'id' | 'created_at' | 'updated_at'>>) => {
      const props: Prop[] = []
      for (const item of items) {
        const prop = await propDB.create(item)
        props.push(prop)
      }
      return props
    },
    onSuccess: props => {
      const episodeIds = [...new Set(props.map(p => p.episode_id))]
      episodeIds.forEach(id => {
        if (id) queryClient.invalidateQueries({ queryKey: propKeys.byEpisode(id) })
      })
      queryClient.invalidateQueries({ queryKey: propKeys.all })
    },
  })

  const batchDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await propDB.delete(id)
      }
      return ids
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: propKeys.all })
    },
  })

  return { create, update, remove, createBatch, batchDelete }
}

export const useAssetManager = {
  characters: {
    byEpisode: useCharactersByEpisode,
    mutations: useCharacterMutations,
  },
  scenes: {
    byEpisode: useScenesByEpisode,
    mutations: useSceneMutations,
  },
  props: {
    byEpisode: usePropsByEpisode,
    mutations: usePropMutations,
  },
}
