import { useEffect, useRef } from 'react'
import { useTaskQueueStore, type TaskQueueStatus } from '@/store/useTaskQueueStore'
import { taskDB } from '@/db'
import logger from '@/utils/logger'

const RESUMABLE_STATUSES: TaskQueueStatus[] = ['running', 'pending']

export function useTaskResume() {
  const hasResumed = useRef(false)

  useEffect(() => {
    if (hasResumed.current) return
    hasResumed.current = true

    const resumeStaleTasks = async () => {
      try {
        const store = useTaskQueueStore.getState()
        const runningTasks = store.getRunningTasks()

        for (const task of runningTasks) {
          store.updateTask(task.id, {
            status: 'failed',
            errorMessage: '应用重启，任务中断',
            completedAt: Date.now(),
          })
          try {
            await taskDB.update(task.id, {
              status: 'failed' as const,
              error: '应用重启，任务中断',
              completed_at: new Date().toISOString(),
            })
          } catch {}
        }

        const pendingTasks = store.getPendingTasks()
        if (pendingTasks.length > 0) {
          logger.info(`发现 ${pendingTasks.length} 个待执行任务，将在队列处理器中继续执行`)
        }

        try {
          const dbTasks = await taskDB.getAll({ status: 'running' })
          for (const dbTask of dbTasks) {
            await taskDB.update(dbTask.id, {
              status: 'failed' as const,
              error: '应用重启，任务中断',
              completed_at: new Date().toISOString(),
            })
          }
          if (dbTasks.length > 0) {
            logger.info(`已将 ${dbTasks.length} 个数据库中的运行中任务标记为失败`)
          }
        } catch (e) {
          logger.error('恢复数据库任务状态失败:', e)
        }
      } catch (error) {
        logger.error('任务恢复检查失败:', error)
      }
    }

    resumeStaleTasks()
  }, [])
}

export { RESUMABLE_STATUSES }
