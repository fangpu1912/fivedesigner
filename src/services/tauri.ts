import { invoke } from '@tauri-apps/api/core'

// 检测是否在Tauri环境中
const isTauri = () => {
  return typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).__TAURI__ !== undefined
}

export interface HttpRequest {
  method: string
  url: string
  headers?: Record<string, string>
  body?: unknown
}

export interface HttpResponse {
  status: number
  headers: Record<string, string>
  body: string
}

export interface FileInfo {
  name: string
  path: string
  is_dir: boolean
  size: number
  modified?: string
}

export async function httpProxy(request: HttpRequest): Promise<HttpResponse> {
  if (!isTauri()) {
    // 浏览器环境：直接使用fetch
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body ? JSON.stringify(request.body) : undefined,
    })
    const body = await response.text()
    const headers: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      headers[key] = value
    })
    return {
      status: response.status,
      headers,
      body,
    }
  }

  try {
    return await invoke('http_proxy', { request })
  } catch (error) {
    console.error('[httpProxy] Tauri 命令执行失败:', error)
    console.error('[httpProxy] 请求信息:', { url: request.url, method: request.method })
    throw error
  }
}

export async function getAppDataDir(): Promise<string> {
  if (!isTauri()) {
    return '/mock/data'
  }
  return invoke('get_app_data_dir')
}

export async function ensureDataDir(): Promise<string> {
  if (!isTauri()) {
    return '/mock/data'
  }
  return invoke('ensure_data_dir')
}

// 本地存储模拟文件系统
const mockFileStorage: Record<string, string> = {}

export async function saveFile(path: string, content: string): Promise<void> {
  if (!isTauri()) {
    mockFileStorage[path] = content
    return
  }
  return invoke('save_file', { path, content })
}

export async function readFile(path: string): Promise<string | null> {
  if (!isTauri()) {
    if (path in mockFileStorage) {
      return mockFileStorage[path] ?? null
    }
    return null
  }
  try {
    return await invoke('read_file', { path })
  } catch (error) {
    // 文件不存在时返回null
    return null
  }
}

export async function readFileBase64(path: string): Promise<string | null> {
  if (!isTauri()) {
    return null
  }
  try {
    return await invoke('read_file_base64', { path })
  } catch (error) {
    console.error('[readFileBase64] 读取文件失败:', error)
    return null
  }
}

export async function deleteFile(path: string): Promise<void> {
  if (!isTauri()) {
    delete mockFileStorage[path]
    return
  }
  return invoke('delete_file', { path })
}

export async function listDir(path: string): Promise<FileInfo[]> {
  if (!isTauri()) {
    return []
  }
  return invoke('list_dir', { path })
}

export async function copyFile(src: string, dst: string): Promise<void> {
  if (!isTauri()) {
    if (src in mockFileStorage) {
      mockFileStorage[dst] = mockFileStorage[src] ?? ''
    }
    return
  }
  return invoke('copy_file', { src, dst })
}

export async function fileExists(path: string): Promise<boolean> {
  if (!isTauri()) {
    return path in mockFileStorage
  }
  return invoke('file_exists', { path })
}
