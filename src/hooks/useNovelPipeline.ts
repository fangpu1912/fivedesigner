import { useState, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { runPipeline, type PipelineProgress } from '@/services/novelPipelineService'
import { useUIStore } from '@/store/useUIStore'
import { useToast } from '@/hooks/useToast'
import { characterDB, sceneDB, propDB, storyboardDB, dubbingDB } from '@/db'
import logger from '@/utils/logger'

export function useNovelPipeline() {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<PipelineProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef(false)
  const runningRef = useRef(false)
  const queryClient = useQueryClient()
  const { currentProjectId, currentEpisodeId } = useUIStore()
  const { toast } = useToast()

  const start = useCallback(async (content?: string) => {
    if (runningRef.current) return
    if (!currentProjectId || !currentEpisodeId) {
      toast({ title: '请先选择项目和剧集', variant: 'destructive' })
      return
    }

    const scriptContent = content?.trim()
    if (!scriptContent) {
      toast({ title: '请先输入小说内容', variant: 'destructive' })
      return
    }

    runningRef.current = true
    abortRef.current = false
    setRunning(true)
    setError(null)
    setProgress({ step: 0, stepName: '准备中', percent: 0, totalSteps: 0 })

    try {
      const existingChars = await characterDB.getByEpisode(currentEpisodeId)
      const existingScenes = await sceneDB.getByEpisode(currentEpisodeId)
      const existingProps = await propDB.getByEpisode(currentEpisodeId)
      const existingStoryboards = await storyboardDB.getAll(currentEpisodeId)
      const existingDubbings = await dubbingDB.getByEpisode(currentEpisodeId)
      const orphanedDubbings = await dubbingDB.getOrphaned(currentProjectId)

      for (const d of existingDubbings) {
        await dubbingDB.delete(d.id)
      }
      for (const d of orphanedDubbings) {
        await dubbingDB.delete(d.id)
      }
      for (const sb of existingStoryboards) {
        await storyboardDB.delete(sb.id)
      }
      for (const p of existingProps) {
        await propDB.delete(p.id)
      }
      for (const s of existingScenes) {
        await sceneDB.delete(s.id)
      }
      for (const c of existingChars) {
        await characterDB.delete(c.id)
      }

      await runPipeline(
        scriptContent,
        currentProjectId,
        currentEpisodeId,
        (p) => {
          if (abortRef.current) return
          setProgress(p)
        }
      )

      if (abortRef.current) {
        toast({ title: '流水线已取消' })
        return
      }

      await queryClient.invalidateQueries({ queryKey: ['characters'] })
      await queryClient.invalidateQueries({ queryKey: ['scenes'] })
      await queryClient.invalidateQueries({ queryKey: ['props'] })
      await queryClient.invalidateQueries({ queryKey: ['storyboards'] })
      await queryClient.invalidateQueries({ queryKey: ['dubbings'] })

      toast({ title: '流水线完成', description: '所有资产和分镜已生成' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : (typeof e === 'string' ? e : JSON.stringify(e))
      setError(msg || '未知错误')
      logger.error('[useNovelPipeline] 流水线失败:', e)
      toast({ title: '流水线失败', description: msg || '未知错误', variant: 'destructive' })
    } finally {
      runningRef.current = false
      setRunning(false)
    }
  }, [currentProjectId, currentEpisodeId, queryClient, toast])

  const cancel = useCallback(() => {
    abortRef.current = true
    runningRef.current = false
    setRunning(false)
  }, [])

  return { running, progress, error, start, cancel }
}
