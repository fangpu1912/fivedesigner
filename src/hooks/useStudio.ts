/**
 * 专业工作台 Hooks
 * 基于项目现有架构 - 复用 Project/Episode/Storyboard
 */

import { useState, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { studioService, type StudioWorkflowStatus } from '@/services/studioService'
import { projectDB, episodeDB, storyboardDB, dubbingDB } from '@/db'

const STUDIO_KEYS = {
  all: ['studio'] as const,
  workflow: (projectId: string, episodeId: string) =>
    [...STUDIO_KEYS.all, 'workflow', projectId, episodeId] as const,
  logs: (projectId: string) => [...STUDIO_KEYS.all, 'logs', projectId] as const,
  tasks: (projectId: string) => [...STUDIO_KEYS.all, 'tasks', projectId] as const,
}

// 从主题创建项目
export function useCreateProjectFromTopic() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      topic,
      options,
    }: {
      topic: string
      options?: { aspectRatio?: string; visualStyle?: string; duration?: number }
    }) => studioService.createProjectFromTopic(topic, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

// 生成剧本
export function useGenerateScript() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      projectId,
      episodeId,
      topic,
    }: {
      projectId: string
      episodeId: string
      topic: string
    }) => studioService.generateScript(projectId, episodeId, topic),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['scripts', variables.episodeId] })
      queryClient.invalidateQueries({ queryKey: ['storyboards', variables.episodeId] })
      queryClient.invalidateQueries({ queryKey: ['characters', variables.projectId] })
    },
  })
}

// 执行工作流
export function useStudioWorkflow() {
  const [status, setStatus] = useState<StudioWorkflowStatus>({
    stage: 'idle',
    progress: 0,
    message: '等待开始',
  })
  const [isRunning, setIsRunning] = useState(false)
  const abortRef = useRef(false)

  const executeWorkflow = useCallback(
    async (request: {
      projectId: string
      episodeId: string
      scriptContent?: string
      voiceId?: string
      imageModel?: string
      videoModel?: string
      ttsModel?: string
    }) => {
      if (isRunning) return

      setIsRunning(true)
      abortRef.current = false

      try {
        const generator = studioService.executeWorkflow(request)

        for await (const update of generator) {
          if (abortRef.current) break
          setStatus(update)
        }
      } catch (error) {
        setStatus({
          stage: 'error',
          progress: 0,
          message: error instanceof Error ? error.message : '执行失败',
        })
      } finally {
        setIsRunning(false)
      }
    },
    [isRunning]
  )

  const cancelWorkflow = useCallback(() => {
    abortRef.current = true
    setIsRunning(false)
  }, [])

  return {
    status,
    isRunning,
    executeWorkflow,
    cancelWorkflow,
  }
}

// 获取工作流状态
export function useWorkflowStatus(projectId: string, episodeId: string) {
  return useQuery({
    queryKey: STUDIO_KEYS.workflow(projectId, episodeId),
    queryFn: () => studioService.getWorkflowStatus(projectId, episodeId),
    enabled: !!projectId && !!episodeId,
    refetchInterval: 3000,
  })
}

// Studio项目类型（包含status）
export interface StudioProject {
  id: string
  name: string
  title: string
  topic: string
  description?: string
  aspect_ratio?: string
  visual_style?: string
  status: {
    stage: 'idle' | 'script' | 'assets' | 'storyboard' | 'image' | 'video' | 'audio' | 'compose' | 'completed' | 'failed'
    progress: number
    message: string
  }
  created_at: string
  updated_at: string
}

// 获取Studio项目列表（复用现有的projects，并添加status）
export function useStudioProjects() {
  return useQuery({
    queryKey: [...STUDIO_KEYS.all, 'projects'],
    queryFn: async () => {
      const projects = await projectDB.getAll()

      // 为每个项目获取状态
      const projectsWithStatus: StudioProject[] = await Promise.all(
        projects.map(async (project) => {
          // 获取项目的主剧集
          const episodes = await episodeDB.getAll(project.id)
          let status: StudioProject['status'] = {
            stage: 'idle',
            progress: 0,
            message: '等待开始',
          }

          if (episodes.length > 0) {
            const episode = episodes[0]!
            const workflowStatus = await studioService.getWorkflowStatus(project.id, episode.id)
            status = {
              stage: workflowStatus.stage === 'error' ? 'failed' : workflowStatus.stage,
              progress: workflowStatus.progress,
              message: workflowStatus.message,
            }
          }

          return {
            ...project,
            title: project.name,
            topic: project.name,
            status,
          }
        })
      )

      return projectsWithStatus
    },
  })
}

// 获取项目详情（带status）
export function useStudioProject(projectId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'studio'],
    queryFn: async () => {
      const project = await projectDB.getById(projectId)
      if (!project) return null

      // 获取项目状态
      const episodes = await episodeDB.getAll(project.id)
      let status: StudioProject['status'] = {
        stage: 'idle',
        progress: 0,
        message: '等待开始',
      }

      if (episodes.length > 0) {
        const episode = episodes[0]!
        const workflowStatus = await studioService.getWorkflowStatus(project.id, episode.id)
        status = {
          stage: workflowStatus.stage === 'error' ? 'failed' : workflowStatus.stage,
          progress: workflowStatus.progress,
          message: workflowStatus.message,
        }
      }

      return {
        ...project,
        title: project.name,
        topic: project.name,
        status,
      } as StudioProject
    },
    enabled: !!projectId,
  })
}

// 获取剧集详情
export function useStudioEpisode(episodeId: string) {
  return useQuery({
    queryKey: ['episodes', episodeId],
    queryFn: () => episodeDB.getById(episodeId),
    enabled: !!episodeId,
  })
}

// 获取项目日志（基于分镜状态）
export function useStudioProjectLogs(projectId: string) {
  return useQuery({
    queryKey: STUDIO_KEYS.logs(projectId),
    queryFn: async () => {
      // 获取项目的所有剧集
      const episodes = await episodeDB.getAll(projectId)
      const logs: Array<{
        id: string
        timestamp: string
        level: 'info' | 'warning' | 'error' | 'success'
        message: string
        details?: string
      }> = []

      for (const episode of episodes) {
        const storyboards = await storyboardDB.getAll(episode.id)
        const dubbings = await dubbingDB.getByEpisode(episode.id)

        // 根据分镜状态生成日志
        for (const sb of storyboards) {
          if (sb.image) {
            logs.push({
              id: `img_${sb.id}`,
              timestamp: sb.updated_at || new Date().toISOString(),
              level: 'success',
              message: `分镜 "${sb.name}" 图片已生成`,
            })
          }
          if (sb.video) {
            logs.push({
              id: `vid_${sb.id}`,
              timestamp: sb.updated_at || new Date().toISOString(),
              level: 'success',
              message: `分镜 "${sb.name}" 视频已生成`,
            })
          }
        }

        for (const d of dubbings) {
          if (d.audio_url) {
            logs.push({
              id: `audio_${d.id}`,
              timestamp: d.updated_at || new Date().toISOString(),
              level: 'success',
              message: `配音片段已生成`,
            })
          }
        }
      }

      return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    },
    enabled: !!projectId,
  })
}

// 获取项目任务（基于分镜）
export function useStudioProjectTasks(projectId: string) {
  return useQuery({
    queryKey: STUDIO_KEYS.tasks(projectId),
    queryFn: async () => {
      const episodes = await episodeDB.getAll(projectId)
      const tasks: Array<{
        id: string
        type: 'script' | 'image' | 'video' | 'audio' | 'compose'
        status: 'pending' | 'running' | 'completed' | 'failed'
        progress: number
        message: string
        createdAt: string
        updatedAt: string
      }> = []

      for (const episode of episodes) {
        const storyboards = await storyboardDB.getAll(episode.id)

        // 剧本任务
        tasks.push({
          id: `script_${episode.id}`,
          type: 'script',
          status: storyboards.length > 0 ? 'completed' : 'pending',
          progress: storyboards.length > 0 ? 100 : 0,
          message: storyboards.length > 0 ? '剧本已生成' : '等待生成剧本',
          createdAt: episode.created_at,
          updatedAt: episode.updated_at,
        })

        // 图片生成任务
        const imageCount = storyboards.filter(sb => sb.image).length
        tasks.push({
          id: `image_${episode.id}`,
          type: 'image',
          status: imageCount === storyboards.length && storyboards.length > 0 ? 'completed' : imageCount > 0 ? 'running' : 'pending',
          progress: storyboards.length > 0 ? Math.round((imageCount / storyboards.length) * 100) : 0,
          message: `已生成 ${imageCount}/${storyboards.length} 张图片`,
          createdAt: episode.created_at,
          updatedAt: episode.updated_at,
        })

        // 视频生成任务
        const videoCount = storyboards.filter(sb => sb.video).length
        tasks.push({
          id: `video_${episode.id}`,
          type: 'video',
          status: videoCount === storyboards.length && storyboards.length > 0 ? 'completed' : videoCount > 0 ? 'running' : 'pending',
          progress: storyboards.length > 0 ? Math.round((videoCount / storyboards.length) * 100) : 0,
          message: `已生成 ${videoCount}/${storyboards.length} 个视频`,
          createdAt: episode.created_at,
          updatedAt: episode.updated_at,
        })
      }

      return tasks
    },
    enabled: !!projectId,
  })
}

// 删除项目
export function useDeleteStudioProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (projectId: string) => projectDB.delete(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

// 恢复项目（重新执行工作流）
export function useResumeStudioProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      projectId,
      videoEngine: _videoEngine,
      addSubtitles: _addSubtitles,
      voiceId: _voiceId,
    }: {
      projectId: string
      videoEngine?: string
      addSubtitles?: boolean
      voiceId?: string
    }) => {
      // 获取项目的主剧集
      return episodeDB.getAll(projectId).then(episodes => {
        if (episodes.length === 0) {
          throw new Error('项目没有剧集')
        }
        const episode = episodes[0]!
        // 返回项目信息供工作流使用
        return { projectId, episodeId: episode.id }
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['storyboards'] })
    },
  })
}

// 取消项目（停止工作流）
export function useCancelStudioProject() {
  return useMutation({
    mutationFn: async (_projectId: string) => {
      // 取消操作由 useStudioWorkflow 的 cancelWorkflow 处理
      return Promise.resolve()
    },
  })
}

// 兼容旧命名的导出
export const useStudioProjectsQuery = useStudioProjects
export const useStudioProjectQuery = useStudioProject
export const useStudioProjectLogsQuery = useStudioProjectLogs
export const useStudioProjectTasksQuery = useStudioProjectTasks
export const useDeleteStudioProjectMutation = useDeleteStudioProject
export const useResumeStudioProjectMutation = useResumeStudioProject
export const useCancelStudioProjectMutation = useCancelStudioProject
