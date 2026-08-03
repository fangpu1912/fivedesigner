/**
 * 豆包配额 Service（模块级单例）
 *
 * 从 `useDoubaoQuota` hook 抽离的纯逻辑层，无 React 依赖。
 * 内存 Map 管理配额，供 `doubaoBrowserService` 和任务队列 executor 调用。
 *
 * 设计要点：
 * - **唯一数据源**：模块级 `memQuotas` 是配额的唯一真实来源，hook 通过 `subscribe` 同步 UI
 * - **同步操作**：getQuota/getAvailableAccount/consume 等都是同步操作内存 Map，JS 单线程无竞态
 * - **懒加载守卫**：`load()` 用 `loadingPromise` 防止并发重复加载；`generateVideo` 开头会 await load()
 * - **flush 落库**：批量生成时快速读写内存，结束后 flush 统一写 settingsDB
 */

import { settingsDB } from '@/db'
import { queryClient } from '@/providers/QueryProvider'
import { DOUBAO_HOME_URL } from '@/services/doubao/constants'
import logger from '@/utils/logger'

// ==================== 类型定义 ====================

/** 豆包账号配额（每个账号一条，存于 settingsDB，key = `doubao_quota_<accountId>`） */
export interface DoubaoAccountQuota {
  accountId: string
  /** 当前周期已用次数 */
  used: number
  /** 上限，默认 3 */
  limit: number
  /** 下次重置时间（epoch 毫秒） */
  resetAt: number
  lastUsedAt: number | null
  updatedAt: number
  /** 标记该账号不支持自动上传（DataTransfer/paste 均失败），自动跳过 */
  broken?: boolean
}

/** 全局配额配置（存于 settingsDB，key = `doubao_quota_config`） */
export interface DoubaoQuotaConfig {
  /** 默认每账号上限，默认 3 */
  defaultLimit: number
  /** 重置模式：daily=每日定时重置，manual=仅手动重置 */
  resetMode: 'daily' | 'manual'
  /** daily 模式下的重置小时（0-23），默认 0 */
  dailyResetHour: number
  /** 单条生成超时（毫秒），默认 300000（5 分钟） */
  perItemTimeoutMs: number
}

/** 豆包账号信息（与 BrowserManager 的 BrowserAccount 兼容，仅取需要的字段） */
export interface DoubaoAccountInfo {
  id: string
  name: string
  platform: 'doubao'
  url: string
  proxy?: string
  cookies?: string
}

// ==================== 常量 ====================

const QUOTA_KEY_PREFIX = 'doubao_quota_'
const CONFIG_KEY = 'doubao_quota_config'
const BROWSER_ACCOUNTS_KEY = 'browser_accounts'

const DEFAULT_CONFIG: DoubaoQuotaConfig = {
  defaultLimit: 3,
  resetMode: 'daily',
  dailyResetHour: 0,
  perItemTimeoutMs: 300000,
}

export const doubaoQuotaKeys = {
  all: ['doubao', 'quotas'] as const,
  config: ['doubao', 'config'] as const,
}

// ==================== 工具函数 ====================

/** 从 localStorage 读取豆包账号列表（platform === 'doubao'） */
export function getDoubaoAccounts(): DoubaoAccountInfo[] {
  try {
    const raw = localStorage.getItem(BROWSER_ACCOUNTS_KEY)
    if (!raw) return []
    const accounts = JSON.parse(raw) as Array<Record<string, unknown>>
    return accounts
      .filter(a => a.platform === 'doubao')
      .map(a => ({
        id: String(a.id ?? ''),
        name: String(a.name ?? '未命名'),
        platform: 'doubao' as const,
        url: String(a.url ?? DOUBAO_HOME_URL),
        proxy: a.proxy ? String(a.proxy) : undefined,
        cookies: a.cookies ? String(a.cookies) : undefined,
      }))
      .filter(a => a.id)
  } catch {
    return []
  }
}

/** 计算下一个重置时间（指定小时的下一个 0 点 epoch 毫秒） */
function computeNextReset(hour: number): number {
  const now = new Date()
  const next = new Date()
  next.setHours(hour, 0, 0, 0)
  // 若今天的重置点已过，则定为明天
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1)
  }
  return next.getTime()
}

/** 创建默认配额 */
function createDefaultQuota(accountId: string, config: DoubaoQuotaConfig): DoubaoAccountQuota {
  return {
    accountId,
    used: 0,
    limit: config.defaultLimit,
    resetAt: computeNextReset(config.dailyResetHour),
    lastUsedAt: null,
    updatedAt: Date.now(),
  }
}

/** 检查并执行自动重置（daily 模式下到期则 used 归零） */
function applyAutoReset(quota: DoubaoAccountQuota, config: DoubaoQuotaConfig): DoubaoAccountQuota {
  if (config.resetMode !== 'daily') return quota
  if (Date.now() < quota.resetAt) return quota
  return {
    ...quota,
    used: 0,
    resetAt: computeNextReset(config.dailyResetHour),
    updatedAt: Date.now(),
  }
}

/** 剩余可用次数 */
export function getRemaining(quota: DoubaoAccountQuota | undefined): number {
  if (!quota) return 0
  return Math.max(0, quota.limit - quota.used)
}

/** 从 settingsDB 加载所有豆包配额 + 配置 */
async function loadQuotasAndConfig(): Promise<{
  quotas: Record<string, DoubaoAccountQuota>
  config: DoubaoQuotaConfig
}> {
  const all = await settingsDB.get()
  const configRaw = all[CONFIG_KEY]
  const config: DoubaoQuotaConfig = {
    ...DEFAULT_CONFIG,
    ...(typeof configRaw === 'object' && configRaw !== null ? (configRaw as Partial<DoubaoQuotaConfig>) : {}),
  }

  const quotas: Record<string, DoubaoAccountQuota> = {}
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(QUOTA_KEY_PREFIX)) continue
    if (typeof value !== 'object' || value === null) continue
    const accountId = key.slice(QUOTA_KEY_PREFIX.length)
    const quota = value as DoubaoAccountQuota
    // 应用自动重置
    const resetQuota = applyAutoReset(quota, config)
    quotas[accountId] = resetQuota
  }

  return { quotas, config }
}

// ==================== 模块级状态 ====================

let memQuotas: Record<string, DoubaoAccountQuota> = {}
let memDirty: Set<string> = new Set()
let config: DoubaoQuotaConfig = { ...DEFAULT_CONFIG }
let loaded = false
let loadingPromise: Promise<void> | null = null
const listeners: Set<() => void> = new Set()

/** 通知所有订阅者（hook 用 forceUpdate 触发重渲染） */
function notifyListeners(): void {
  listeners.forEach(fn => {
    try {
      fn()
    } catch (e) {
      logger.warn('[DoubaoQuotaService] listener error:', e)
    }
  })
}

/**
 * 从 settingsDB 加载配额到内存（幂等，并发安全）
 * @param force 强制重新加载
 */
export async function load(force = false): Promise<void> {
  if (!force && loaded) return
  if (loadingPromise) return loadingPromise
  loadingPromise = (async () => {
    try {
      const { quotas, config: cfg } = await loadQuotasAndConfig()
      memQuotas = quotas
      config = cfg
      memDirty = new Set()
      loaded = true
      notifyListeners()
      logger.debug('[DoubaoQuotaService] loaded', Object.keys(quotas).length, 'quotas')
    } finally {
      loadingPromise = null
    }
  })()
  return loadingPromise
}

// ==================== 查询接口 ====================

/** 获取全局配置 */
export function getConfig(): DoubaoQuotaConfig {
  return config
}

/** 获取某账号配额（内存副本，不存在则创建默认） */
export function getQuota(accountId: string): DoubaoAccountQuota {
  const existing = memQuotas[accountId]
  if (existing) return applyAutoReset(existing, config)
  const fresh = createDefaultQuota(accountId, config)
  memQuotas[accountId] = fresh
  memDirty.add(accountId)
  return fresh
}

/**
 * 选择一个可用账号。
 * @param preferId 优先账号；若该账号仍有配额则返回它
 * @returns accountId 或 null（无可用账号）
 */
export function getAvailableAccount(preferId?: string): string | null {
  const accounts = getDoubaoAccounts()
  if (accounts.length === 0) return null

  // 优先账号仍有配额则返回
  if (preferId) {
    const preferQuota = getQuota(preferId)
    if (!preferQuota.broken && getRemaining(preferQuota) > 0) {
      return preferId
    }
  }

  // 按剩余配额降序选择
  let best: { id: string; remaining: number } | null = null
  for (const acc of accounts) {
    const q = getQuota(acc.id)
    if (q.broken) continue
    const remaining = getRemaining(q)
    if (remaining <= 0) continue
    if (!best || remaining > best.remaining) {
      best = { id: acc.id, remaining }
    }
  }
  return best?.id ?? null
}

// ==================== 内存操作（批量生成时快速读写） ====================

/** 消费一次配额（内存操作，需 flush 落库） */
export function consume(accountId: string): void {
  const q = getQuota(accountId)
  memQuotas[accountId] = {
    ...q,
    used: q.used + 1,
    lastUsedAt: Date.now(),
    updatedAt: Date.now(),
  }
  memDirty.add(accountId)
  notifyListeners()
  logger.debug(`[DoubaoQuotaService] consume ${accountId}: ${q.used + 1}/${q.limit}`)
}

/** 回滚一次配额（失败时调用） */
export function release(accountId: string): void {
  const q = getQuota(accountId)
  if (q.used <= 0) return
  memQuotas[accountId] = {
    ...q,
    used: q.used - 1,
    updatedAt: Date.now(),
  }
  memDirty.add(accountId)
  notifyListeners()
  logger.debug(`[DoubaoQuotaService] release ${accountId}: ${q.used - 1}/${q.limit}`)
}

/** 标记账号不支持自动上传，后续自动跳过 */
export function markBroken(accountId: string): void {
  const q = getQuota(accountId)
  memQuotas[accountId] = {
    ...q,
    broken: true,
    updatedAt: Date.now(),
  }
  memDirty.add(accountId)
  notifyListeners()
  logger.warn(`[DoubaoQuotaService] markBroken ${accountId}`)
}

/** 清除 broken 标记（重试时用） */
export function clearBroken(accountId: string): void {
  const q = getQuota(accountId)
  if (!q.broken) return
  memQuotas[accountId] = {
    ...q,
    broken: false,
    updatedAt: Date.now(),
  }
  memDirty.add(accountId)
  notifyListeners()
}

// ==================== 落库与管理 ====================

/** 把内存改动写回 settingsDB 并刷新 query */
export async function flush(): Promise<void> {
  if (memDirty.size === 0) return
  const toSave: Record<string, unknown> = {}
  for (const accountId of memDirty) {
    const q = memQuotas[accountId]
    if (q) {
      toSave[QUOTA_KEY_PREFIX + accountId] = q
    }
  }
  memDirty = new Set()
  if (Object.keys(toSave).length === 0) return
  try {
    await settingsDB.save(toSave)
    await queryClient.invalidateQueries({ queryKey: doubaoQuotaKeys.all })
    logger.debug(`[DoubaoQuotaService] flushed ${Object.keys(toSave).length} quotas`)
  } catch (err) {
    logger.error('[DoubaoQuotaService] flush failed:', err)
  }
}

/** 手动重置某账号配额 */
export async function resetAccount(accountId: string): Promise<void> {
  const fresh = createDefaultQuota(accountId, config)
  memQuotas[accountId] = fresh
  memDirty.add(accountId)
  notifyListeners()
  await flush()
}

/** 更新全局配置 */
export async function updateConfig(newConfig: Partial<DoubaoQuotaConfig>): Promise<void> {
  const merged = { ...config, ...newConfig }
  await settingsDB.save({ [CONFIG_KEY]: merged })
  // 重新加载以同步内存
  await load(true)
}

// ==================== UI 辅助 ====================

/** 获取账号列表（带配额信息，供 UI 渲染） */
export function getAccountsWithQuota(): Array<DoubaoAccountInfo & {
  quota: DoubaoAccountQuota
  remaining: number
}> {
  const accounts = getDoubaoAccounts()
  return accounts.map(acc => {
    const quota = getQuota(acc.id)
    return { ...acc, quota, remaining: getRemaining(quota) }
  })
}

/** 订阅配额变化（hook 用 forceUpdate 触发重渲染），返回取消订阅函数 */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 是否已加载（调试用） */
export function isLoaded(): boolean {
  return loaded
}
