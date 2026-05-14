import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { sampleProjectDB } from '@/db'
import type { SampleProject, Track, TrackItem } from '@/types'

const sampleProjectKeys = {
  all: ['sampleProjects'] as const,
  byEpisode: (episodeId: string) => [...sampleProjectKeys.all, 'episode', episodeId] as const,
  detail: (id: string) => [...sampleProjectKeys.all, 'detail', id] as const,
}

// 获取剧集的所有样片项目
export function useSampleProjects(episodeId: string) {
  return useQuery({
    queryKey: sampleProjectKeys.byEpisode(episodeId),
    queryFn: () => sampleProjectDB.getAll(episodeId),
    enabled: !!episodeId,
  })
}

// 获取单个样片项目
export function useSampleProject(id: string) {
  return useQuery({
    queryKey: sampleProjectKeys.detail(id),
    queryFn: () => sampleProjectDB.getById(id),
    enabled: !!id,
  })
}

// 创建样片项目
export function useCreateSampleProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (project: Omit<SampleProject, 'id' | 'created_at' | 'updated_at'>) =>
      sampleProjectDB.create(project),
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: sampleProjectKeys.byEpisode(data.episode_id) })
    },
  })
}

// 更新样片项目
export function useUpdateSampleProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<SampleProject> }) =>
      sampleProjectDB.update(id, data),
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: sampleProjectKeys.detail(data.id) })
      queryClient.invalidateQueries({ queryKey: sampleProjectKeys.byEpisode(data.episode_id) })
    },
  })
}

// 删除样片项目
export function useDeleteSampleProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (project: SampleProject) => {
      await sampleProjectDB.delete(project.id)
      return project
    },
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: sampleProjectKeys.byEpisode(data.episode_id) })
    },
  })
}

// 添加轨道
export function useAddTrack() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, track }: { projectId: string; track: Track }) => {
      const project = await sampleProjectDB.getById(projectId)
      if (!project) throw new Error('Project not found')

      const updatedTracks = [...project.tracks, track]
      return sampleProjectDB.update(projectId, { tracks: updatedTracks })
    },
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: sampleProjectKeys.detail(data.id) })
      queryClient.invalidateQueries({ queryKey: sampleProjectKeys.byEpisode(data.episode_id) })
    },
  })
}

// 删除轨道
export function useDeleteTrack() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, trackId }: { projectId: string; trackId: string }) => {
      const project = await sampleProjectDB.getById(projectId)
      if (!project) throw new Error('Project not found')

      const updatedTracks = project.tracks.filter(t => t.id !== trackId)
      return sampleProjectDB.update(projectId, { tracks: updatedTracks })
    },
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: sampleProjectKeys.detail(data.id) })
      queryClient.invalidateQueries({ queryKey: sampleProjectKeys.byEpisode(data.episode_id) })
    },
  })
}

// 更新轨道
export function useUpdateTrack() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, track }: { projectId: string; track: Track }) => {
      const project = await sampleProjectDB.getById(projectId)
      if (!project) throw new Error('Project not found')

      const updatedTracks = project.tracks.map(t => (t.id === track.id ? track : t))
      return sampleProjectDB.update(projectId, { tracks: updatedTracks })
    },
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: sampleProjectKeys.detail(data.id) })
      queryClient.invalidateQueries({ queryKey: sampleProjectKeys.byEpisode(data.episode_id) })
    },
  })
}

// 添加片段到轨道
export function useAddTrackItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectId,
      trackId,
      item,
    }: {
      projectId: string
      trackId: string
      item: TrackItem
    }) => {
      const project = await sampleProjectDB.getById(projectId)
      if (!project) throw new Error('Project not found')

      const updatedTracks = project.tracks.map(t => {
        if (t.id === trackId) {
          return { ...t, items: [...t.items, item] }
        }
        return t
      })

      return sampleProjectDB.update(projectId, { tracks: updatedTracks })
    },
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: sampleProjectKeys.detail(data.id) })
      queryClient.invalidateQueries({ queryKey: sampleProjectKeys.byEpisode(data.episode_id) })
    },
  })
}

// 删除片段
export function useDeleteTrackItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectId,
      trackId,
      itemId,
    }: {
      projectId: string
      trackId: string
      itemId: string
    }) => {
      const project = await sampleProjectDB.getById(projectId)
      if (!project) throw new Error('Project not found')

      const updatedTracks = project.tracks.map(t => {
        if (t.id === trackId) {
          return { ...t, items: t.items.filter(i => i.id !== itemId) }
        }
        return t
      })

      return sampleProjectDB.update(projectId, { tracks: updatedTracks })
    },
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: sampleProjectKeys.detail(data.id) })
      queryClient.invalidateQueries({ queryKey: sampleProjectKeys.byEpisode(data.episode_id) })
    },
  })
}

// 更新片段
export function useUpdateTrackItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectId,
      trackId,
      item,
    }: {
      projectId: string
      trackId: string
      item: TrackItem
    }) => {
      const project = await sampleProjectDB.getById(projectId)
      if (!project) throw new Error('Project not found')

      const updatedTracks = project.tracks.map(t => {
        if (t.id === trackId) {
          return {
            ...t,
            items: t.items.map(i => (i.id === item.id ? item : i)),
          }
        }
        return t
      })

      return sampleProjectDB.update(projectId, { tracks: updatedTracks })
    },
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: sampleProjectKeys.detail(data.id) })
      queryClient.invalidateQueries({ queryKey: sampleProjectKeys.byEpisode(data.episode_id) })
    },
  })
}

// 移动片段（改变顺序或时间）
export function useMoveTrackItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectId,
      trackId,
      itemId,
      newStartTime,
    }: {
      projectId: string
      trackId: string
      itemId: string
      newStartTime: number
    }) => {
      const project = await sampleProjectDB.getById(projectId)
      if (!project) throw new Error('Project not found')

      const updatedTracks = project.tracks.map(t => {
        if (t.id === trackId) {
          return {
            ...t,
            items: t.items.map(i => (i.id === itemId ? { ...i, start_time: newStartTime } : i)),
          }
        }
        return t
      })

      return sampleProjectDB.update(projectId, { tracks: updatedTracks })
    },
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: sampleProjectKeys.detail(data.id) })
      queryClient.invalidateQueries({ queryKey: sampleProjectKeys.byEpisode(data.episode_id) })
    },
  })
}
