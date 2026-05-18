import type { VendorConfig } from './types'

const ALLOWED_TAURI_COMMANDS = new Set([
  'modelscope_chat',
  'modelscope_submit_task',
  'modelscope_check_status',
  'download_image_to_base64',
  'http_request',
])

const DEFAULT_TIMEOUT = 10 * 60 * 1000

const workerUrl = new URL('./sandboxWorker.js', import.meta.url).href

export class VendorSandbox {
  async execute(
    code: string,
    config: VendorConfig,
    method: string,
    model: any,
    input?: any,
    timeout: number = DEFAULT_TIMEOUT
  ): Promise<any> {
    const worker = new Worker(workerUrl)

    const id = Math.random().toString(36).slice(2) + Date.now().toString(36)

    const configForWorker: Record<string, unknown> = { ...config, code: undefined }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        worker.terminate()
        reject(new Error('供应商代码执行超时'))
      }, timeout)

      const cleanup = () => {
        clearTimeout(timeoutId)
        worker.terminate()
      }

      worker.onmessage = (e: MessageEvent) => {
        const data = e.data

        if (data.type === 'result' && data.id === id) {
          cleanup()
          if (data.success) {
            resolve(data.data)
          } else {
            reject(new Error(data.error))
          }
          return
        }

        if (data.type === 'api-call' && data.id) {
          this.handleApiCall(data.method, data.args)
            .then((result) => {
              worker.postMessage({ type: 'api-response', id: data.id, result })
            })
            .catch((error) => {
              worker.postMessage({
                type: 'api-response',
                id: data.id,
                error: error instanceof Error ? error.message : String(error),
              })
            })
        }
      }

      worker.onerror = (e: ErrorEvent) => {
        cleanup()
        reject(new Error('Worker 执行错误: ' + e.message))
      }

      worker.postMessage({
        type: 'execute',
        id,
        code,
        config: configForWorker,
        method,
        model,
        input,
      })
    })
  }

  private async handleApiCall(method: string, args: any[]): Promise<any> {
    switch (method) {
      case 'readFile': {
        const [filePath] = args as [string]
        const { readFile } = await import('@tauri-apps/plugin-fs')
        return await readFile(filePath)
      }

      case 'tauriInvoke': {
        const [cmd, cmdArgs] = args as [string, any?]
        if (!ALLOWED_TAURI_COMMANDS.has(cmd)) {
          throw new Error(
            `安全限制: 不允许的 Tauri 命令 "${cmd}"，允许的命令: ${[...ALLOWED_TAURI_COMMANDS].join(', ')}`
          )
        }
        const { invoke } = await import('@tauri-apps/api/core')
        return await invoke(cmd, cmdArgs)
      }

      case 'urlToBase64': {
        const [url] = args as [string]
        return await this.urlToBase64(url)
      }

      case 'tauriFetch': {
        const [url, options] = args as [string, any]
        return await this.tauriFetch(url, options)
      }

      default:
        throw new Error(`安全限制: 未知的 API 调用 "${method}"`)
    }
  }

  private async urlToBase64(url: string): Promise<string> {
    if (url.startsWith('/') || url.match(/^[a-zA-Z]:[\\/]/)) {
      const { readFile } = await import('@tauri-apps/plugin-fs')
      const data = await readFile(url)
      let binary = ''
      for (let i = 0; i < data.length; i++) {
        binary += String.fromCharCode(data[i])
      }
      const base64 = btoa(binary)
      return `data:image/png;base64,${base64}`
    }
    const { invoke } = await import('@tauri-apps/api/core')
    const result = await invoke<{ success: boolean; data?: string; error?: string }>(
      'download_image_to_base64',
      { request: { url } }
    )
    if (!result.success || !result.data) {
      throw new Error(result.error || '下载图片失败')
    }
    return result.data
  }

  // 使用 Tauri HTTP 插件发送请求（绕过 CORS）
  private async tauriFetch(url: string, options: any = {}): Promise<any> {
    const { invoke } = await import('@tauri-apps/api/core')
    
    const result = await invoke<{
      success: boolean
      status: number
      headers: Record<string, string>
      body: string
      error?: string
    }>('http_request', {
      request: {
        url,
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body,
        timeout: options.timeout || 60000,
      }
    })

    if (!result.success) {
      throw new Error(result.error || 'HTTP 请求失败')
    }

    // 尝试解析 JSON 响应
    let parsedData: any = result.body
    try {
      parsedData = JSON.parse(result.body)
    } catch {
      // 如果不是 JSON，保持原始字符串
    }

    // 返回可序列化的对象（不包含函数）
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      headers: result.headers,
      _parsedData: parsedData,
      _body: result.body,
    }
  }
}

export const vendorSandbox = new VendorSandbox()
