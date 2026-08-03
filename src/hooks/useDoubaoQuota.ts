import { useEffect, useReducer } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as doubaoQuotaService from '@/services/doubaoQuotaService'
import type {
  DoubaoAccountQuota,
  DoubaoQuotaConfig,
} from '@/services/doubaoQuotaService'

// re-export 类型与纯函数，保持外部 import 路径不变
export {
  type DoubaoAccountQuota,
  type DoubaoQuotaConfig,
  type DoubaoAccountInfo,
  getDoubaoAccounts,
  getRemaining,
  doubaoQuotaKeys,
} from '@/services/doubaoQuotaService'

/**
 * 豆包配额 Hook（UI 同步层）
 *
 * 薄包装：实际逻辑在 `doubaoQuotaService` 单例，本 hook 仅负责：
 * 1. 挂载时触发 `service.load()` 加载配额
 * 2. 通过 `service.subscribe` 订阅变化，配额变更时 forceUpdate 触发重渲染
 * 3. 代理 service 的方法供组件调用
 *
 * 数据唯一来源是 service 的模块级内存 Map，hook 不自维护状态。
 */
export function useDoubaoQuota() {
  // 用 useQuery 触发 load（跨组件共享 + staleTime 避免重复加载）
  const { isLoading } = useQuery({
    queryKey: doubaoQuotaService.doubaoQuotaKeys.all,
    queryFn: () => doubaoQuotaService.load(),
    staleTime: 10_000,
  })

  // 订阅 service 变化，forceUpdate 触发重渲染
  const [, forceUpdate] = useReducer(x => x + 1, 0)
  useEffect(() => {
    doubaoQuotaService.load()
    const unsub = doubaoQuotaService.subscribe(() => forceUpdate())
    return unsub
  }, [])

  // 从 service 派生 quotas（Record 形式，兼容旧返回结构）
  const accountsWithQuota = doubaoQuotaService.getAccountsWithQuota()
  const quotas: Record<string, DoubaoAccountQuota> = {}
  for (const a of accountsWithQuota) {
    quotas[a.id] = a.quota
  }

  const config: DoubaoQuotaConfig = doubaoQuotaService.getConfig()

  return {
    quotas,
    config,
    isLoading,
    // 账号列表
    getAccountsWithQuota: doubaoQuotaService.getAccountsWithQuota,
    getDoubaoAccounts: doubaoQuotaService.getDoubaoAccounts,
    // 配额查询
    getQuota: doubaoQuotaService.getQuota,
    getAvailableAccount: doubaoQuotaService.getAvailableAccount,
    // 内存操作（批量生成时用）
    consume: doubaoQuotaService.consume,
    release: doubaoQuotaService.release,
    markBroken: doubaoQuotaService.markBroken,
    clearBroken: doubaoQuotaService.clearBroken,
    flush: doubaoQuotaService.flush,
    // 管理
    resetAccount: doubaoQuotaService.resetAccount,
    updateConfig: doubaoQuotaService.updateConfig,
  }
}
