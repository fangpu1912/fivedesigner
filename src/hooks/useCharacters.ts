import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { characterDB } from '@/db'
import type { Character } from '@/types'

export const characterKeys = {
  all: ['characters'] as const,
  lists: () => [...characterKeys.all, 'list'] as const,
  list: (projectId: string, episodeId?: string) =>
    [...characterKeys.lists(), projectId, episodeId] as const,
  byEpisode: (episodeId: string) =>
    [...characterKeys.all, 'episode', episodeId] as const,
  allList: () => [...characterKeys.all, 'all'] as const,
  details: () => [...characterKeys.all, 'detail'] as const,
  detail: (id: string) => [...characterKeys.details(), id] as const,
}

export function useCharacters(projectId: string, episodeId?: string) {
  return useQuery({
    queryKey: characterKeys.list(projectId, episodeId),
    queryFn: () => {
      if (episodeId) {
        return characterDB.getByEpisode(episodeId)
      }
      return characterDB.getAll(projectId)
    },
    enabled: !!projectId || !!episodeId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCharactersByEpisode(episodeId?: string) {
  return useQuery({
    queryKey: characterKeys.byEpisode(episodeId || ''),
    queryFn: async () => {
      if (!episodeId) return []
      return await characterDB.getByEpisode(episodeId)
    },
    enabled: !!episodeId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useAllCharacters() {
  return useQuery({
    queryKey: characterKeys.allList(),
    queryFn: () => characterDB.getAllCharacters(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCharacter(characterId: string) {
  return useQuery({
    queryKey: characterKeys.detail(characterId),
    queryFn: () => characterDB.getById(characterId),
    enabled: !!characterId,
  })
}

export function useCreateCharacter() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (character: Omit<Character, 'id' | 'created_at' | 'updated_at'>) =>
      characterDB.create(character),
    onSuccess: newCharacter => {
      queryClient.invalidateQueries({ queryKey: characterKeys.all })
      if (newCharacter.episode_id) {
        queryClient.invalidateQueries({ queryKey: characterKeys.byEpisode(newCharacter.episode_id) })
      }
    },
  })
}

export function useUpdateCharacter() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Character> }) =>
      characterDB.update(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: characterKeys.detail(id) })

      const previousCharacter = queryClient.getQueryData<Character>(characterKeys.detail(id))

      if (previousCharacter) {
        queryClient.setQueryData<Character>(characterKeys.detail(id), {
          ...previousCharacter,
          ...data,
        })
      }

      return { previousCharacter }
    },
    onError: (_err, { id }, context) => {
      if (context?.previousCharacter) {
        queryClient.setQueryData(characterKeys.detail(id), context.previousCharacter)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: characterKeys.all })
    },
  })
}

export function useDeleteCharacter() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => characterDB.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: characterKeys.all })
    },
  })
}

export function useBatchDeleteCharacters() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await characterDB.delete(id)
      }
      return ids
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: characterKeys.all })
    },
  })
}

export function useCharacterMutations() {
  const createCharacter = useCreateCharacter()
  const updateCharacter = useUpdateCharacter()
  const deleteCharacter = useDeleteCharacter()
  const batchDeleteCharacters = useBatchDeleteCharacters()

  return {
    create: createCharacter,
    update: updateCharacter,
    remove: deleteCharacter,
    batchDelete: batchDeleteCharacters,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    batchDeleteCharacters,
    createCharacterAsync: createCharacter.mutateAsync,
    updateCharacterAsync: updateCharacter.mutateAsync,
    deleteCharacterAsync: deleteCharacter.mutateAsync,
  }
}
