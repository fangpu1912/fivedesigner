/**
 * 统一日志工具
 * 开发环境直接输出到控制台，生产环境使用 Tauri log 插件
 */

import { info, warn, error, debug } from '@tauri-apps/plugin-log'

// 日志级别类型（供外部使用）
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const isDev = import.meta.env.DEV

// 将多个参数转换为字符串
function formatMessage(message: string, args: unknown[]): string {
  if (args.length === 0) return message
  const formatted = args
    .map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg)
        } catch {
          return String(arg)
        }
      }
      return String(arg)
    })
    .join(' ')
  return `${message} ${formatted}`
}

export const logger = {
  debug: (message: string, ...args: unknown[]) => {
    const formatted = formatMessage(message, args)
    if (isDev) {
      console.debug(`[DEBUG]`, formatted)
    } else {
      // 生产环境使用 Tauri log
      debug(formatted).catch(() => {
        // 如果 Tauri log 失败，静默忽略
      })
    }
  },

  info: (message: string, ...args: unknown[]) => {
    const formatted = formatMessage(message, args)
    if (isDev) {
      console.info(`[INFO]`, formatted)
    } else {
      info(formatted).catch(() => {
        // 如果 Tauri log 失败，静默忽略
      })
    }
  },

  warn: (message: string, ...args: unknown[]) => {
    const formatted = formatMessage(message, args)
    if (isDev) {
      console.warn(`[WARN]`, formatted)
    } else {
      warn(formatted).catch(() => {
        // 如果 Tauri log 失败，静默忽略
      })
    }
  },

  error: (message: string, ...args: unknown[]) => {
    const formatted = formatMessage(message, args)
    // 错误始终输出
    console.error(`[ERROR]`, formatted)
    if (!isDev) {
      error(formatted).catch(() => {
        // 如果 Tauri log 失败，静默忽略
      })
    }
  },

  log: (message: string, ...args: unknown[]) => {
    // log 是 debug 的别名
    logger.debug(message, ...args)
  },
}

export default logger
