import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import logger from '@/utils/logger'

export interface VideoDownloadTask {
  id: string
  url: string
  filename: string
  projectId?: string
  episodeId?: string
  needsBrowserDownload?: boolean
  status: 'pending' | 'downloading' | 'completed' | 'failed'
  progress: number
  downloaded: number
  total: number
  filePath?: string
  error?: string
}

export interface VideoDownloadProgress {
  url: string
  downloaded: number
  total: number | null
  filename: string
  taskId?: string
}

type DownloadEventType = 'progress' | 'completed' | 'failed' | 'allCompleted'

interface DownloadEvent {
  type: DownloadEventType
  task?: VideoDownloadTask
  tasks?: VideoDownloadTask[]
}

type DownloadEventHandler = (event: DownloadEvent) => void

const COOKIES_STORAGE_KEY = 'video_download_cookies'

let taskCounter = 0

function generateTaskId(): string {
  taskCounter += 1
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).substring(2, 6)
  return `${ts}_${rand}_${taskCounter}`
}

function shortId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 6)
}

export function makeUniqueFilename(title: string, ext: string): string {
  const sanitized = title
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 60) || 'video'
  return `${sanitized}_${shortId()}.${ext}`
}

class VideoBatchDownloadService {
  private tasks: Map<string, VideoDownloadTask> = new Map()
  private listeners: Map<string, Set<DownloadEventHandler>> = new Map()
  private tauriListener: UnlistenFn | null = null
  private isProcessing = false
  private concurrency = 2
  private _cookies: string = ''

  get cookies(): string {
    return this._cookies
  }

  setCookies(value: string) {
    this._cookies = value
    try {
      localStorage.setItem(COOKIES_STORAGE_KEY, value)
    } catch {}
  }

  loadCookies() {
    try {
      this._cookies = localStorage.getItem(COOKIES_STORAGE_KEY) || ''
    } catch {}
  }

  async init() {
    if (this.tauriListener) return
    this.loadCookies()

    this.tauriListener = await listen<VideoDownloadProgress>('download-video-progress', (event) => {
      const payload = event.payload
      const taskId = payload.taskId || payload.url
      const task = this.tasks.get(taskId)
      if (!task) {
        for (const t of this.tasks.values()) {
          if (t.url === payload.url) {
            t.downloaded = payload.downloaded
            t.total = payload.total || 0
            t.progress = payload.total ? Math.round((payload.downloaded / payload.total) * 100) : 0
            this.emit('progress', { task: t })
            return
          }
        }
        return
      }
      task.downloaded = payload.downloaded
      task.total = payload.total || 0
      task.progress = payload.total ? Math.round((payload.downloaded / payload.total) * 100) : 0
      this.emit('progress', { task })
    })
  }

  async destroy() {
    if (this.tauriListener) {
      this.tauriListener()
      this.tauriListener = null
    }
    this.tasks.clear()
    this.listeners.clear()
  }

  on(event: DownloadEventType, handler: DownloadEventHandler): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler)
    return () => {
      this.listeners.get(event)?.delete(handler)
    }
  }

  private emit(event: DownloadEventType, data: Partial<DownloadEvent>) {
    this.listeners.get(event)?.forEach(handler => handler({ type: event, ...data }))
  }

  getTasks(): VideoDownloadTask[] {
    return Array.from(this.tasks.values())
  }

  getTask(id: string): VideoDownloadTask | undefined {
    return this.tasks.get(id)
  }

  getStats() {
    const tasks = this.getTasks()
    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      downloading: tasks.filter(t => t.status === 'downloading').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
    }
  }

  clearCompleted() {
    for (const [id, task] of this.tasks) {
      if (task.status === 'completed' || task.status === 'failed') {
        this.tasks.delete(id)
      }
    }
  }

  removeTask(id: string) {
    this.tasks.delete(id)
  }

  addTasks(
    items: Array<{
      url: string
      filename: string
      projectId?: string
      episodeId?: string
      needsBrowserDownload?: boolean
    }>
  ): VideoDownloadTask[] {
    const newTasks: VideoDownloadTask[] = []

    for (const item of items) {
      const id = generateTaskId()

      const task: VideoDownloadTask = {
        id,
        url: item.url,
        filename: item.filename,
        projectId: item.projectId,
        episodeId: item.episodeId,
        needsBrowserDownload: item.needsBrowserDownload,
        status: 'pending',
        progress: 0,
        downloaded: 0,
        total: 0,
      }

      this.tasks.set(id, task)
      newTasks.push(task)
    }

    return newTasks
  }

  async startBatch(): Promise<void> {
    if (this.isProcessing) return
    await this.init()
    this.isProcessing = true

    const pendingTasks = this.getTasks().filter(t => t.status === 'pending')

    const queue = [...pendingTasks]
    const workers: Promise<void>[] = []

    for (let i = 0; i < this.concurrency; i++) {
      workers.push(this.processQueue(queue))
    }

    await Promise.all(workers)
    this.isProcessing = false

    this.emit('allCompleted', { tasks: this.getTasks() })
  }

  private async processQueue(queue: VideoDownloadTask[]): Promise<void> {
    while (queue.length > 0) {
      const task = queue.shift()
      if (!task) break

      await this.downloadSingle(task)
    }
  }

  private async downloadSingle(task: VideoDownloadTask): Promise<void> {
    task.status = 'downloading'
    task.progress = 0
    this.emit('progress', { task })

    try {
      let filePath: string

      if (task.needsBrowserDownload) {
        filePath = await invoke<string>('download_video_via_browser', {
          url: task.url,
          filename: task.filename,
          taskId: task.id,
          projectId: task.projectId || null,
          episodeId: task.episodeId || null,
        })
      } else {
        filePath = await invoke<string>('download_video', {
          url: task.url,
          filename: task.filename,
          taskId: task.id,
          projectId: task.projectId || null,
          episodeId: task.episodeId || null,
          cookies: this._cookies || null,
        })
      }

      task.status = 'completed'
      task.progress = 100
      task.filePath = filePath
      this.emit('completed', { task })
    } catch (error) {
      task.status = 'failed'
      task.error = error instanceof Error ? error.message : String(error)
      logger.error(`视频下载失败: ${task.filename}`, error)
      this.emit('failed', { task })
    }
  }

  async downloadSingleUrl(
    url: string,
    filename: string,
    projectId?: string,
    episodeId?: string
  ): Promise<VideoDownloadTask> {
    await this.init()

    const id = generateTaskId()
    const task: VideoDownloadTask = {
      id,
      url,
      filename,
      projectId,
      episodeId,
      status: 'pending',
      progress: 0,
      downloaded: 0,
      total: 0,
    }

    this.tasks.set(id, task)
    await this.downloadSingle(task)
    return task
  }

  setConcurrency(value: number) {
    this.concurrency = Math.max(1, Math.min(5, value))
  }
}

export const videoBatchDownloadService = new VideoBatchDownloadService()
