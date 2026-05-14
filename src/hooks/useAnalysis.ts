/**
 * 对标分析 Hooks
 * 基于项目现有架构
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { analysisService } from '@/services/analysisService'
import type { AnalysisTask, CreateProjectFromAnalysisPayload } from '@/types/analysis'

const ANALYSIS_KEYS = {
  all: ['analysis'] as const,
  lists: () => [...ANALYSIS_KEYS.all, 'list'] as const,
  list: (filters: { status?: string }) => [...ANALYSIS_KEYS.lists(), filters] as const,
  details: () => [...ANALYSIS_KEYS.all, 'detail'] as const,
  detail: (id: string) => [...ANALYSIS_KEYS.details(), id] as const,
}

// 获取所有分析任务
export function useAnalysisTasks(filters: { status?: string } = {}) {
  return useQuery({
    queryKey: ANALYSIS_KEYS.list(filters),
    queryFn: () => analysisService.getAllAnalysisTasks(),
  })
}

// 获取单个分析任务
export function useAnalysisTask(id: string) {
  return useQuery({
    queryKey: ANALYSIS_KEYS.detail(id),
    queryFn: () => analysisService.getAnalysisTask(id),
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data as AnalysisTask | null
      // 如果任务正在处理中，每2秒刷新一次
      if (data?.status === 'processing' || data?.status === 'pending') {
        return 2000
      }
      return false
    },
  })
}

// 上传并分析视频
export function useUploadAndAnalyze() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ filePath, filename }: { filePath: string; filename: string }) =>
      analysisService.uploadAndAnalyze(filePath, filename),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ANALYSIS_KEYS.lists() })
    },
  })
}

// 从分析创建项目
export function useCreateProjectFromAnalysis() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      analysisId,
      payload,
    }: {
      analysisId: string
      payload?: CreateProjectFromAnalysisPayload
    }) => analysisService.createProjectFromAnalysis(analysisId, {
      customTitle: payload?.topic,
      projectId: payload?.projectId,
    }),
    onSuccess: () => {
      // 使项目列表缓存失效
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      // 使剧集列表缓存失效
      queryClient.invalidateQueries({ queryKey: ['episodes'] })
    },
  })
}

// 删除分析任务
export function useDeleteAnalysisTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (analysisId: string) => analysisService.deleteAnalysisTask(analysisId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ANALYSIS_KEYS.lists() })
    },
  })
}

// 替换角色图片
export function useReplaceCharacterImage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      analysisId,
      characterId,
      filePath,
    }: {
      analysisId: string
      characterId: number
      filePath: string
    }) => analysisService.updateCharacterImage(analysisId, characterId, filePath),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ANALYSIS_KEYS.detail(variables.analysisId) })
    },
  })
}

// 移除角色图片
export function useRemoveCharacterImage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      analysisId,
      characterId,
    }: {
      analysisId: string
      characterId: number
    }) => analysisService.updateCharacterImage(analysisId, characterId, null),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ANALYSIS_KEYS.detail(variables.analysisId) })
    },
  })
}

// 兼容旧命名的导出
export const useAnalysisTaskQuery = useAnalysisTask
export const useUploadAndAnalyzeMutation = useUploadAndAnalyze
export const useCreateProjectFromAnalysisMutation = useCreateProjectFromAnalysis
export const useDeleteAnalysisTaskMutation = useDeleteAnalysisTask
export const useReplaceCharacterImageMutation = useReplaceCharacterImage
export const useRemoveCharacterImageMutation = useRemoveCharacterImage
