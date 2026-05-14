import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { outfitDB } from '@/db'
import type { CharacterOutfit } from '@/types'

export const outfitKeys = {
  all: ['outfits'] as const,
  byCharacter: (characterId: string) =>
    [...outfitKeys.all, 'character', characterId] as const,
  detail: (id: string) => [...outfitKeys.all, 'detail', id] as const,
}

export function useOutfitsByCharacter(characterId: string) {
  return useQuery({
    queryKey: outfitKeys.byCharacter(characterId),
    queryFn: () => outfitDB.getByCharacter(characterId),
    enabled: !!characterId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useOutfit(id: string) {
  return useQuery({
    queryKey: outfitKeys.detail(id),
    queryFn: () => outfitDB.getById(id),
    enabled: !!id,
  })
}

export function useCreateOutfit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (outfit: Omit<CharacterOutfit, 'id' | 'created_at' | 'updated_at'>) =>
      outfitDB.create(outfit),
    onSuccess: newOutfit => {
      queryClient.invalidateQueries({
        queryKey: outfitKeys.byCharacter(newOutfit.character_id),
      })
    },
  })
}

export function useUpdateOutfit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CharacterOutfit> }) =>
      outfitDB.update(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: outfitKeys.detail(id) })

      const previousOutfit = queryClient.getQueryData<CharacterOutfit>(
        outfitKeys.detail(id)
      )

      if (previousOutfit) {
        queryClient.setQueryData<CharacterOutfit>(outfitKeys.detail(id), {
          ...previousOutfit,
          ...data,
        })
      }

      return { previousOutfit }
    },
    onError: (_err, { id }, context) => {
      if (context?.previousOutfit) {
        queryClient.setQueryData(outfitKeys.detail(id), context.previousOutfit)
      }
    },
    onSettled: (_data, _err, { id, data }) => {
      queryClient.invalidateQueries({ queryKey: outfitKeys.detail(id) })
      if (data.character_id) {
        queryClient.invalidateQueries({
          queryKey: outfitKeys.byCharacter(data.character_id),
        })
      }
    },
  })
}

export function useDeleteOutfit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id }: { id: string; characterId: string }) =>
      outfitDB.delete(id),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: outfitKeys.byCharacter(variables.characterId),
      })
    },
  })
}

export function useSetDefaultOutfit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ characterId, outfitId }: { characterId: string; outfitId: string }) =>
      outfitDB.setDefault(characterId, outfitId),
    onSuccess: (_data, { characterId }) => {
      queryClient.invalidateQueries({
        queryKey: outfitKeys.byCharacter(characterId),
      })
    },
  })
}

export function useOutfitMutations() {
  const createOutfit = useCreateOutfit()
  const updateOutfit = useUpdateOutfit()
  const deleteOutfit = useDeleteOutfit()
  const setDefaultOutfit = useSetDefaultOutfit()

  return {
    create: createOutfit,
    update: updateOutfit,
    remove: deleteOutfit,
    setDefault: setDefaultOutfit,
    createAsync: createOutfit.mutateAsync,
    updateAsync: updateOutfit.mutateAsync,
    deleteAsync: deleteOutfit.mutateAsync,
    setDefaultAsync: setDefaultOutfit.mutateAsync,
  }
}
