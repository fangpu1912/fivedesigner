/**
 * 检测 React Flow 连接状态
 * 用于在拖拽连接线时自动放大连接点
 */

import { useState, useEffect } from 'react'
import { useStore } from '@xyflow/react'

interface ConnectionState {
  isConnecting: boolean
  connectingNodeId: string | null
  connectingHandleId: string | null
  connectingHandleType: 'source' | 'target' | null
}

/**
 * 监听连接状态
 */
export function useConnectionState(): ConnectionState {
  const [state, setState] = useState<ConnectionState>({
    isConnecting: false,
    connectingNodeId: null,
    connectingHandleId: null,
    connectingHandleType: null,
  })

  // 使用 React Flow 的内部 store 监听连接状态
  // @xyflow/react v12+ 使用 connection 替代 connectionStart
  const connection = useStore((s) => s.connection)

  useEffect(() => {
    if (connection && connection.fromNode) {
      setState({
        isConnecting: true,
        connectingNodeId: connection.fromNode.id || null,
        connectingHandleId: connection.fromHandle?.id || null,
        connectingHandleType: connection.fromHandle?.type || null,
      })
    } else {
      setState({
        isConnecting: false,
        connectingNodeId: null,
        connectingHandleId: null,
        connectingHandleType: null,
      })
    }
  }, [connection])

  return state
}

/**
 * 检查指定节点是否应该显示放大的连接点
 * 当正在连接时，目标节点（非起始节点）的输入连接点应该放大
 */
export function useShouldEnlargeHandles(
  nodeId: string,
  handleType: 'source' | 'target'
): boolean {
  const connectionState = useConnectionState()

  // 如果没有正在连接，不放大
  if (!connectionState.isConnecting) {
    return false
  }

  // 如果是起始节点，不放大（保持原始大小）
  if (connectionState.connectingNodeId === nodeId) {
    return false
  }

  // 如果是目标节点
  // 当正在从 source 拖拽时，target 类型的连接点应该放大
  // 当正在从 target 拖拽时，source 类型的连接点应该放大
  if (connectionState.connectingHandleType === 'source' && handleType === 'target') {
    return true
  }

  if (connectionState.connectingHandleType === 'target' && handleType === 'source') {
    return true
  }

  return false
}
