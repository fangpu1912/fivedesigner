import type { TaskLogLevel } from '@/types'

export interface BufferedLogEntry {
  index: number
  timestamp: string
  level: TaskLogLevel
  message: string
  taskId?: string
  data?: Record<string, unknown>
}

type LogListener = (entries: BufferedLogEntry[]) => void

class LogBuffer {
  private buffer: BufferedLogEntry[] = []
  private index = 0
  private listeners: Set<LogListener> = new Set()
  private maxBufferSize = 2000
  private flushInterval = 2000
  private pendingDbWrites: Array<{
    taskId: string
    level: TaskLogLevel
    message: string
    data?: Record<string, unknown>
  }> = []
  private flushTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.startFlushTimer()
  }

  append(
    level: TaskLogLevel,
    message: string,
    taskId?: string,
    data?: Record<string, unknown>
  ): BufferedLogEntry {
    const entry: BufferedLogEntry = {
      index: ++this.index,
      timestamp: new Date().toISOString(),
      level,
      message,
      taskId,
      data,
    }

    this.buffer.push(entry)
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer = this.buffer.slice(-this.maxBufferSize)
    }

    if (taskId) {
      this.pendingDbWrites.push({ taskId, level, message, data })
    }

    this.notifyListeners()
    return entry
  }

  getSince(sinceIndex: number): BufferedLogEntry[] {
    return this.buffer.filter(e => e.index > sinceIndex)
  }

  getByTaskId(taskId: string, sinceIndex?: number): BufferedLogEntry[] {
    return this.buffer.filter(
      e => e.taskId === taskId && (sinceIndex === undefined || e.index > sinceIndex)
    )
  }

  subscribe(listener: LogListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notifyListeners() {
    if (this.listeners.size === 0) return
    const recentEntries = this.buffer.slice(-50)
    for (const listener of this.listeners) {
      try {
        listener(recentEntries)
      } catch {}
    }
  }

  private startFlushTimer() {
    this.flushTimer = setInterval(() => {
      this.flushToDb()
    }, this.flushInterval)
  }

  private async flushToDb() {
    if (this.pendingDbWrites.length === 0) return

    const entries = [...this.pendingDbWrites]
    this.pendingDbWrites = []

    try {
      const { taskDB } = await import('@/db')
      await taskDB.addLogsBatch(entries)
    } catch {}
  }

  async forceFlush(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
    }
    await this.flushToDb()
    this.startFlushTimer()
  }

  clear() {
    this.buffer = []
    this.index = 0
  }

  destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    this.listeners.clear()
    this.flushToDb()
  }
}

export const logBuffer = new LogBuffer()

export function taskLog(
  taskId: string,
  level: TaskLogLevel,
  message: string,
  data?: Record<string, unknown>
): BufferedLogEntry {
  return logBuffer.append(level, message, taskId, data)
}

export function useLogBufferSubscribe(listener: LogListener): () => void {
  return logBuffer.subscribe(listener)
}
