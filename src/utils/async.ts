/**
 * 异步工具函数
 */

/**
 * 延时等待（Promise 版 setTimeout）
 * @param ms 毫秒数
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
