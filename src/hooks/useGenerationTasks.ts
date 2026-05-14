import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { taskDB } from '@/db'
import type { GenerationTask } from '@/types'
import { taskLog } from '@/utils/logBuffer'

const taskKeys = {
  all: ['generationTasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  list: (filters?: { status?: string; type?: string; projectId?: string; episodeId?: string }) =>
    [...taskKeys.lists(), filters] as const,
  detail: (id: string) => [...taskKeys.all, 'detail', id] as const,
  logs: (taskId: string) => [...taskKeys.all, 'logs', taskId] as const,
}

export function useGenerationTasksQuery(filters?: {
  status?: string
  type?: string
  projectId?: string
  episodeId?: string
  limit?: number
}) {
  return useQuery({
    queryKey: taskKeys.list(filters),
    queryFn: () => taskDB.getAll(filters),
    staleTime: 5000,
  })
}

export function useGenerationTaskQuery(id: string) {
  return useQuery({
    queryKey: taskKeys.detail(id),
    queryFn: () => taskDB.getById(id),
    enabled: !!id,
  })
}

export function useCreateGenerationTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (task: Omit<GenerationTask, 'id' | 'created_at' | 'updated_at'>) => {
      const created = await taskDB.create(task)
      taskLog(created.id, 'info', `任务创建: ${task.name || task.type}`, {
        type: task.type,
        model: task.model,
        status: task.status,
      })
      return created
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all })
    },
  })
}

export function useUpdateGenerationTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<GenerationTask> }) => {
      const previousTask = queryClient.getQueryData<GenerationTask>(taskKeys.detail(id))

      if (previousTask) {
        queryClient.setQueryData(taskKeys.detail(id), { ...previousTask, ...data })
      }

      try {
        const updated = await taskDB.update(id, data)

        if (data.status) {
          taskLog(id, 'info', `状态变更: ${data.status}`, {
            previousStatus: previousTask?.status,
            newStatus: data.status,
            progress: data.progress,
            stepName: data.step_name,
          })
        } else if (data.progress !== undefined) {
          taskLog(id, 'debug', `进度更新: ${data.progress}%${data.step_name ? ` - ${data.step_name}` : ''}`, {
            progress: data.progress,
            stepName: data.step_name,
          })
        }

        return updated
      } catch (error) {
        if (previousTask) {
          queryClient.setQueryData(taskKeys.detail(id), previousTask)
        }
        throw error
      }
    },
    onSettled: (_data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() })
    },
  })
}

export function useDeleteGenerationTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      await taskDB.delete(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all })
    },
  })
}

export function useTaskLogsQuery(taskId: string, options?: {
  level?: string
  limit?: number
  enabled?: boolean
}) {
  return useQuery({
    queryKey: taskKeys.logs(taskId),
    queryFn: () => taskDB.getLogs(taskId, { level: options?.level, limit: options?.limit }),
    enabled: options?.enabled !== false && !!taskId,
    refetchInterval: 3000,
  })
}

export function useTaskLogMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      taskId,
      level,
      message,
      data,
    }: {
      taskId: string
      level: 'debug' | 'info' | 'warn' | 'error'
      message: string
      data?: Record<string, unknown>
    }) => {
      taskLog(taskId, level, message, data)
      return taskDB.addLog(taskId, level, message, data)
    },
    onSettled: (_data, _error, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.logs(taskId) })
    },
  })
}

export { taskKeys }
