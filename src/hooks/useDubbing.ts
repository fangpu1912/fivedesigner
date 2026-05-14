import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { dubbingDB } from '@/db'
import { type Dubbing } from '@/types'

export const dubbingKeys = {
  all: ['dubbings'] as const,
  byStoryboard: (storyboardId: string) => [...dubbingKeys.all, 'storyboard', storyboardId] as const,
  byEpisode: (episodeId: string) => [...dubbingKeys.all, 'episode', episodeId] as const,
  detail: (id: string) => [...dubbingKeys.all, 'detail', id] as const,
}

export function useDubbingsByStoryboard(storyboardId: string) {
  return useQuery({
    queryKey: dubbingKeys.byStoryboard(storyboardId),
    queryFn: async () => {
      const dubbings = await dubbingDB.getByStoryboard(storyboardId)
      return dubbings.sort((a, b) => a.sequence - b.sequence)
    },
    enabled: !!storyboardId,
  })
}

export function useDubbing(storyboardId: string) {
  return useQuery({
    queryKey: dubbingKeys.byStoryboard(storyboardId),
    queryFn: () => dubbingDB.getByStoryboard(storyboardId),
    enabled: !!storyboardId,
  })
}

export function useDubbingByEpisode(episodeId: string) {
  return useQuery({
    queryKey: dubbingKeys.byEpisode(episodeId),
    queryFn: () => dubbingDB.getByEpisode(episodeId),
    enabled: !!episodeId,
  })
}

export function useCreateDubbing(episodeId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (dubbing: Omit<Dubbing, 'id' | 'created_at' | 'updated_at'>) =>
      dubbingDB.create(dubbing),
    onSuccess: newDubbing => {
      queryClient.invalidateQueries({
        queryKey: dubbingKeys.byStoryboard(newDubbing.storyboard_id),
      })
      if (episodeId) {
        queryClient.invalidateQueries({
          queryKey: dubbingKeys.byEpisode(episodeId),
        })
      }
    },
  })
}

export function useUpdateDubbing() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Dubbing> }) =>
      dubbingDB.update(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: dubbingKeys.all })

      const previousDubbing = queryClient.getQueryData<Dubbing>(dubbingKeys.detail(id))
      const previousByStoryboard = previousDubbing?.storyboard_id
        ? queryClient.getQueryData<Dubbing[]>(dubbingKeys.byStoryboard(previousDubbing.storyboard_id))
        : undefined

      if (previousDubbing) {
        queryClient.setQueryData<Dubbing>(dubbingKeys.detail(id), {
          ...previousDubbing,
          ...data,
        })
      }

      if (previousDubbing?.storyboard_id && previousByStoryboard) {
        const storyboardQueryKey = dubbingKeys.byStoryboard(previousDubbing.storyboard_id)
        queryClient.setQueryData<Dubbing[]>(
          storyboardQueryKey,
          previousByStoryboard.map(d => (d.id === id ? { ...d, ...data } : d))
        )
      }

      return { previousDubbing, previousByStoryboard }
    },
    onError: (_err, { id }, context) => {
      if (context?.previousDubbing) {
        queryClient.setQueryData(dubbingKeys.detail(id), context.previousDubbing)
      }
      if (context?.previousByStoryboard && context?.previousDubbing?.storyboard_id) {
        const storyboardQueryKey = dubbingKeys.byStoryboard(context.previousDubbing.storyboard_id)
        queryClient.setQueryData(storyboardQueryKey, context.previousByStoryboard)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: dubbingKeys.all })
    },
  })
}

export function useDeleteDubbing() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => dubbingDB.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dubbingKeys.all })
    },
  })
}

export function useBatchDeleteDubbings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await dubbingDB.delete(id)
      }
      return ids
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dubbingKeys.all })
    },
  })
}

export function useDubbingMutations(episodeId?: string) {
  const createDubbing = useCreateDubbing(episodeId)
  const updateDubbing = useUpdateDubbing()
  const deleteDubbing = useDeleteDubbing()
  const batchDeleteDubbings = useBatchDeleteDubbings()

  return {
    createDubbing,
    updateDubbing,
    deleteDubbing,
    batchDeleteDubbings,
    createDubbingAsync: createDubbing.mutateAsync,
    updateDubbingAsync: updateDubbing.mutateAsync,
    deleteDubbingAsync: deleteDubbing.mutateAsync,
  }
}

export function useBatchCreateDubbings(episodeId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (dubbings: Array<Omit<Dubbing, 'id' | 'created_at' | 'updated_at'>>) => {
      const results: Dubbing[] = []
      for (const dubbing of dubbings) {
        const result = await dubbingDB.create(dubbing)
        results.push(result)
      }
      return results
    },
    onSuccess: newDubbings => {
      newDubbings.forEach(dubbing => {
        queryClient.invalidateQueries({
          queryKey: dubbingKeys.byStoryboard(dubbing.storyboard_id),
        })
      })
      if (episodeId) {
        queryClient.invalidateQueries({
          queryKey: dubbingKeys.byEpisode(episodeId),
        })
      }
    },
  })
}

export function useReorderDubbings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (updates: Array<{ id: string; sequence: number }>) => {
      const results: Dubbing[] = []
      for (const { id, sequence } of updates) {
        const result = await dubbingDB.update(id, { sequence })
        results.push(result)
      }
      return results
    },
    onSuccess: updatedDubbings => {
      const storyboardIds = new Set(updatedDubbings.map(d => d.storyboard_id))
      storyboardIds.forEach(storyboardId => {
        queryClient.invalidateQueries({
          queryKey: dubbingKeys.byStoryboard(storyboardId),
        })
      })
    },
  })
}
