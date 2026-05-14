/**
 * 简化版：获取当前节点是否应该放大连接点
 * 用于在节点组件中快速应用连接点放大效果
 */

import { useShouldEnlargeHandles } from './useConnectionState'

interface EnlargedHandlesState {
  target: boolean
  source: boolean
}

/**
 * 获取节点连接点放大状态
 * @param nodeId 节点ID
 * @returns 连接点放大状态
 */
export function useEnlargedHandles(nodeId: string): EnlargedHandlesState {
  const shouldEnlargeTarget = useShouldEnlargeHandles(nodeId, 'target')
  const shouldEnlargeSource = useShouldEnlargeHandles(nodeId, 'source')

  return {
    target: shouldEnlargeTarget,
    source: shouldEnlargeSource,
  }
}
