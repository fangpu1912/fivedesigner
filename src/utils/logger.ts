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
      if (arg instanceof Error) {
        // Error 的 message/stack 不可枚举，JSON.stringify 会输出 {}，
        // 需要手动提取
        const parts = [arg.message]
        const cause = (arg as Error & { cause?: unknown }).cause
        if (cause) {
          parts.push(`cause: ${formatSingle(cause)}`)
        }
        if (isDev) {
          // 开发环境附带堆栈前几行，方便定位
          const stack = arg.stack?.split('\n').slice(0, 4).join('\n')
          if (stack) parts.push(stack)
        }
        return parts.join('\n')
      }
      return formatSingle(arg)
    })
    .join(' ')
  return `${message} ${formatted}`
}

/** 格式化单个参数（非 Error） */
function formatSingle(arg: unknown): string {
  if (typeof arg === 'object') {
    try {
      return JSON.stringify(arg)
    } catch {
      return String(arg)
    }
  }
  return String(arg)
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
