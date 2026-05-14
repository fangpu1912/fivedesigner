/**
 * Python 后端生成 Hooks
 * 使用 TanStack Query 与 Python 后端通信
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pythonApi } from '@/services/pythonApi';
import type {
  ImageGenerationRequest,
  VideoGenerationRequest,
  TTSGenerationRequest,
  BatchGenerationRequest,
  BatchTTSRequest,
  ModelListRequest,
} from '@/services/pythonApi';

// Query Keys
export const pythonQueryKeys = {
  all: ['python'] as const,
  modelList: (type: string) => [...pythonQueryKeys.all, 'models', type] as const,
  voiceList: () => [...pythonQueryKeys.all, 'voices'] as const,
  taskRecords: (projectId: string) => [...pythonQueryKeys.all, 'tasks', projectId] as const,
};

/**
 * 图片生成 Hook
 */
export function usePythonImageGeneration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: ImageGenerationRequest) => pythonApi.generateImage(request),
    onSuccess: (_, variables) => {
      // 成功后刷新任务记录
      queryClient.invalidateQueries({
        queryKey: pythonQueryKeys.taskRecords(variables.project_id),
      });
    },
  });
}

/**
 * 视频生成 Hook
 */
export function usePythonVideoGeneration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: VideoGenerationRequest) => pythonApi.generateVideo(request),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: pythonQueryKeys.taskRecords(variables.project_id),
      });
    },
  });
}

/**
 * TTS 生成 Hook
 */
export function usePythonTTSGeneration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: TTSGenerationRequest) => pythonApi.generateTTS(request),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: pythonQueryKeys.taskRecords(variables.project_id),
      });
    },
  });
}

/**
 * TTS 流式生成 Hook
 */
export function usePythonTTSStream() {
  return useMutation({
    mutationFn: (request: TTSGenerationRequest) => pythonApi.generateTTSStream(request),
  });
}

/**
 * 批量图片生成 Hook
 */
export function usePythonBatchImageGeneration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: BatchGenerationRequest) => pythonApi.batchGenerateImage(request),
    onSuccess: () => {
      // 批量生成后刷新所有任务记录
      queryClient.invalidateQueries({
        queryKey: pythonQueryKeys.all,
      });
    },
  });
}

/**
 * 批量 TTS 生成 Hook
 */
export function usePythonBatchTTSGeneration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: BatchTTSRequest) => pythonApi.batchGenerateTTS(request),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: pythonQueryKeys.all,
      });
    },
  });
}

/**
 * 模型列表 Hook
 */
export function usePythonModelList(type: ModelListRequest['type']) {
  return useQuery({
    queryKey: pythonQueryKeys.modelList(type),
    queryFn: () => pythonApi.getModelList({ type }),
    staleTime: 5 * 60 * 1000, // 5 分钟内不重新获取
  });
}

/**
 * 音色列表 Hook
 */
export function usePythonVoiceList() {
  return useQuery({
    queryKey: pythonQueryKeys.voiceList(),
    queryFn: () => pythonApi.getVoiceList(),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * 任务记录 Hook
 */
export function usePythonTaskRecords(projectId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: pythonQueryKeys.taskRecords(projectId),
    queryFn: () => pythonApi.getTaskRecords(projectId),
    refetchInterval: 5000, // 每 5 秒刷新
    enabled: options?.enabled !== false && !!projectId,
  });
}

/**
 * 健康检查 Hook
 */
export function usePythonHealthCheck() {
  return useQuery({
    queryKey: [...pythonQueryKeys.all, 'health'],
    queryFn: () => pythonApi.healthCheck(),
    refetchInterval: 10000, // 每 10 秒检查
  });
}
