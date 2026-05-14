import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { storyboardDB } from '@/db'
import { type Storyboard } from '@/types'

export const storyboardKeys = {
  all: ['storyboards'] as const,
  lists: () => [...storyboardKeys.all, 'list'] as const,
  list: (episodeId: string) => [...storyboardKeys.lists(), episodeId] as const,
  details: () => [...storyboardKeys.all, 'detail'] as const,
  detail: (id: string) => [...storyboardKeys.details(), id] as const,
}

export function useStoryboards(episodeId: string) {
  return useQuery({
    queryKey: storyboardKeys.list(episodeId),
    queryFn: () => storyboardDB.getAll(episodeId),
    enabled: !!episodeId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useStoryboard(storyboardId: string) {
  return useQuery({
    queryKey: storyboardKeys.detail(storyboardId),
    queryFn: () => storyboardDB.getById(storyboardId),
    enabled: !!storyboardId,
  })
}

export function useCreateStoryboard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (storyboard: Omit<Storyboard, 'id' | 'created_at' | 'updated_at'>) =>
      storyboardDB.create(storyboard),
    onSuccess: newStoryboard => {
      queryClient.invalidateQueries({
        queryKey: storyboardKeys.list(newStoryboard.episode_id),
      })
      queryClient.setQueryData(storyboardKeys.detail(newStoryboard.id), newStoryboard)
    },
  })
}

export function useUpdateStoryboard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Storyboard> }) =>
      storyboardDB.update(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: storyboardKeys.detail(id) })

      const previousStoryboard = queryClient.getQueryData<Storyboard>(storyboardKeys.detail(id))

      if (previousStoryboard) {
        queryClient.setQueryData<Storyboard>(storyboardKeys.detail(id), {
          ...previousStoryboard,
          ...data,
        })
      }

      return { previousStoryboard }
    },
    onError: (_err, { id }, context) => {
      if (context?.previousStoryboard) {
        queryClient.setQueryData(storyboardKeys.detail(id), context.previousStoryboard)
      }
    },
    onSettled: (_data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: storyboardKeys.lists() })
      queryClient.invalidateQueries({ queryKey: storyboardKeys.detail(id) })
    },
  })
}

export function useDeleteStoryboard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => storyboardDB.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storyboardKeys.lists() })
    },
  })
}

export function useBatchCreateStoryboards() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (storyboards: Array<Omit<Storyboard, 'id' | 'created_at' | 'updated_at'>>) =>
      storyboardDB.batchCreate(storyboards),
    onSuccess: (_, variables) => {
      const firstStoryboard = variables[0]
      if (firstStoryboard) {
        queryClient.invalidateQueries({
          queryKey: storyboardKeys.list(firstStoryboard.episode_id),
        })
      }
    },
  })
}

export function useBatchUpdateStoryboards() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (updates: Array<{ id: string; data: Partial<Storyboard> }>) =>
      storyboardDB.batchUpdate(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storyboardKeys.lists() })
    },
  })
}

export function useBatchDeleteStoryboards() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (ids: string[]) => storyboardDB.batchDelete(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storyboardKeys.lists() })
    },
  })
}

export function useReorderStoryboards() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ episodeId, orderedIds }: { episodeId: string; orderedIds: string[] }) =>
      storyboardDB.reorder(episodeId, orderedIds),
    onMutate: async ({ episodeId, orderedIds }) => {
      await queryClient.cancelQueries({ queryKey: storyboardKeys.list(episodeId) })

      const previousStoryboards = queryClient.getQueryData<Storyboard[]>(
        storyboardKeys.list(episodeId)
      )

      if (previousStoryboards) {
        const reordered = orderedIds
          .map((id, index) => {
            const storyboard = previousStoryboards.find(s => s.id === id)
            return storyboard ? { ...storyboard, sort_order: index } : null
          })
          .filter((s): s is Storyboard & { sort_order: number } => s !== null)

        queryClient.setQueryData(storyboardKeys.list(episodeId), reordered as Storyboard[])
      }

      return { previousStoryboards }
    },
    onError: (_err, { episodeId }, context) => {
      if (context?.previousStoryboards) {
        queryClient.setQueryData(storyboardKeys.list(episodeId), context.previousStoryboards)
      }
    },
    onSettled: (_, __, { episodeId }) => {
      queryClient.invalidateQueries({ queryKey: storyboardKeys.list(episodeId) })
    },
  })
}

export function useStoryboardMutations() {
  const createStoryboard = useCreateStoryboard()
  const updateStoryboard = useUpdateStoryboard()
  const deleteStoryboard = useDeleteStoryboard()
  const batchCreateStoryboards = useBatchCreateStoryboards()
  const batchUpdateStoryboards = useBatchUpdateStoryboards()
  const batchDeleteStoryboards = useBatchDeleteStoryboards()
  const reorderStoryboards = useReorderStoryboards()

  return {
    createStoryboard,
    updateStoryboard,
    deleteStoryboard,
    batchCreateStoryboards,
    batchUpdateStoryboards,
    batchDeleteStoryboards,
    reorderStoryboards,
    createStoryboardAsync: createStoryboard.mutateAsync,
    updateStoryboardAsync: updateStoryboard.mutateAsync,
    deleteStoryboardAsync: deleteStoryboard.mutateAsync,
    batchCreateStoryboardsAsync: batchCreateStoryboards.mutateAsync,
    batchUpdateStoryboardsAsync: batchUpdateStoryboards.mutateAsync,
    batchDeleteStoryboardsAsync: batchDeleteStoryboards.mutateAsync,
    reorderStoryboardsAsync: reorderStoryboards.mutateAsync,
  }
}
