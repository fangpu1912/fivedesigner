import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CanvasNode, CanvasEdge, ExportedCanvas } from '../types'
import { canvasDB } from '@/db'

interface CanvasData {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

// Query keys
export const canvasKeys = {
  all: ['storyboard-copilot'] as const,
  canvas: (episodeId: string) => [...canvasKeys.all, 'canvas', episodeId] as const,
}

// 获取画布数据
export function useCanvasQuery(episodeId: string) {
  return useQuery({
    queryKey: canvasKeys.canvas(episodeId),
    queryFn: async (): Promise<CanvasData> => {
      if (!episodeId) return { nodes: [], edges: [] }

      try {
        const data = await canvasDB.getByEpisode(episodeId)

        if (!data) {
          return { nodes: [], edges: [] }
        }

        return {
          nodes: (data.nodes as CanvasNode[]) || [],
          edges: (data.edges as CanvasEdge[]) || [],
        }
      } catch (error) {
        console.error('[useCanvasQuery] 加载画布失败:', error)
        return { nodes: [], edges: [] }
      }
    },
    enabled: !!episodeId,
    staleTime: 5 * 60 * 1000,
  })
}

// 保存画布数据
export function useSaveCanvasMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      episodeId,
      nodes,
      edges,
      projectId,
      name,
    }: {
      episodeId: string
      nodes: CanvasNode[]
      edges: CanvasEdge[]
      projectId?: string
      name?: string
    }) => {
      const version = '1.0.0'
      await canvasDB.save(episodeId, nodes, edges, version)

      return { success: true, episodeId, projectId, name }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: canvasKeys.canvas(variables.episodeId),
      })
    },
  })
}

// 导出画布到指定路径
export function useExportCanvas() {
  return useCallback(
    async (
      filePath: string,
      nodes: CanvasNode[],
      edges: CanvasEdge[],
      metadata?: { projectId?: string; episodeId?: string; name?: string }
    ) => {
      const exportData: ExportedCanvas = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        nodes,
        edges,
        metadata,
      }

      const content = JSON.stringify(exportData, null, 2)

      // 使用 Tauri 的文件保存
      const { saveFile } = await import('@/services/tauri')
      await saveFile(filePath, content)

      return { success: true, filePath }
    },
    []
  )
}

// 导入画布从指定路径
export function useImportCanvas() {
  return useCallback(async (filePath: string): Promise<CanvasData> => {
    const { readFile } = await import('@/services/tauri')
    const content = await readFile(filePath)

    if (!content) {
      throw new Error('文件内容为空')
    }

    const cleanedContent = content.replace(/^\uFEFF/, '').trim()
    if (!cleanedContent) {
      throw new Error('文件内容为空')
    }

    const data = JSON.parse(cleanedContent) as ExportedCanvas

    return {
      nodes: data.nodes || [],
      edges: data.edges || [],
    }
  }, [])
}

// 删除画布数据
export function useDeleteCanvasMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (episodeId: string) => {
      await canvasDB.delete(episodeId)
      return { success: true }
    },
    onSuccess: (_, episodeId) => {
      queryClient.invalidateQueries({
        queryKey: canvasKeys.canvas(episodeId),
      })
    },
  })
}
