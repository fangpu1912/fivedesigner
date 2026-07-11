/**
 * 抖音 a_bogus 签名器(主线程管理器)
 * 通过 Web Worker 执行 a_bogus.js 生成请求签名,避免阻塞 UI
 */
import aBogusCode from '../a_bogus.js?raw'

const SIGN_TIMEOUT = 10_000

class DouyinSigner {
  private worker: Worker | null = null
  private readyPromise: Promise<void> | null = null
  private pending = new Map<number, { resolve: (v: string) => void; reject: (e: Error) => void }>()
  private seq = 0

  /** 懒加载 Worker 并完成初始化 */
  private ensureReady(): Promise<void> {
    if (this.readyPromise) return this.readyPromise
    this.readyPromise = this.init()
    return this.readyPromise
  }

  private init(): Promise<void> {
    const workerUrl = new URL('./douyinSigner.worker.js', import.meta.url).href
    this.worker = new Worker(workerUrl)

    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('创建签名 Worker 失败'))
        return
      }

      this.worker.onmessage = (e: MessageEvent) => {
        const d = e.data
        if (!d) return

        if (d.type === 'ready') {
          resolve()
          return
        }

        if (d.type === 'init-error') {
          reject(new Error(`签名 Worker 初始化失败: ${d.error}`))
          return
        }

        if (d.type === 'result') {
          const p = this.pending.get(d.id)
          if (p) {
            this.pending.delete(d.id)
            if (d.success) {
              p.resolve(d.data as string)
            } else {
              p.reject(new Error(d.error))
            }
          }
        }
      }

      this.worker.onerror = (e: ErrorEvent) => {
        reject(new Error(`签名 Worker 错误: ${e.message}`))
      }

      this.worker.postMessage({ type: 'init', code: aBogusCode })
    })
  }

  /** 生成 a_bogus 签名。query 为未编码的 k=v&k=v 形式 */
  async sign(query: string, userAgent: string): Promise<string> {
    await this.ensureReady()
    if (!this.worker) throw new Error('签名 Worker 未就绪')

    const id = ++this.seq

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('签名超时,请重试'))
      }, SIGN_TIMEOUT)

      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer)
          resolve(v)
        },
        reject: (e) => {
          clearTimeout(timer)
          reject(e)
        },
      })

      this.worker!.postMessage({ type: 'sign', id, query, userAgent })
    })
  }

  /** 销毁 Worker(页面卸载时调用) */
  dispose(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    this.readyPromise = null
    this.pending.clear()
  }
}

export const douyinSigner = new DouyinSigner()
