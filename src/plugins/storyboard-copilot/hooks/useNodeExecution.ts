import { useState, useCallback, useRef } from 'react'
import type { Edge } from '@xyflow/react'
import type { CanvasNode } from '../types'

export interface NodeExecutionState {
  isExecuting: boolean
  progress: number
  error?: string
  result?: unknown
}

export function useNodeExecution() {
  const [executingNodes, setExecutingNodes] = useState<Map<string, NodeExecutionState>>(new Map())
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map())

  const executeNode = useCallback(async (
    nodeId: string,
    nodes: CanvasNode[],
    edges: Edge[],
    executor: (node: CanvasNode, inputData: unknown, signal: AbortSignal) => Promise<unknown>
  ): Promise<unknown> => {
    // 取消之前的执行
    const existingController = abortControllersRef.current.get(nodeId)
    if (existingController) {
      existingController.abort()
    }

    const controller = new AbortController()
    abortControllersRef.current.set(nodeId, controller)

    // 设置执行状态
    setExecutingNodes((prev) => {
      const newMap = new Map(prev)
      newMap.set(nodeId, { isExecuting: true, progress: 0 })
      return newMap
    })

    try {
      // 获取节点
      const node = nodes.find((n) => n.id === nodeId)
      if (!node) {
        throw new Error('节点不存在')
      }

      // 获取上游节点的输出作为输入
      const upstreamEdge = edges.find((e) => e.target === nodeId)
      let inputData: unknown = undefined

      if (upstreamEdge) {
        const upstreamNode = executingNodes.get(upstreamEdge.source)
        if (upstreamNode?.result) {
          inputData = upstreamNode.result
        }
      }

      // 更新进度
      setExecutingNodes((prev) => {
        const newMap = new Map(prev)
        newMap.set(nodeId, { isExecuting: true, progress: 50 })
        return newMap
      })

      // 执行节点
      const result = await executor(node, inputData, controller.signal)

      // 检查是否被取消
      if (controller.signal.aborted) {
        throw new Error('执行已取消')
      }

      // 设置成功状态
      setExecutingNodes((prev) => {
        const newMap = new Map(prev)
        newMap.set(nodeId, { isExecuting: false, progress: 100, result })
        return newMap
      })

      return result
    } catch (error) {
      // 设置错误状态
      setExecutingNodes((prev) => {
        const newMap = new Map(prev)
        newMap.set(nodeId, {
          isExecuting: false,
          progress: 0,
          error: error instanceof Error ? error.message : '执行失败',
        })
        return newMap
      })
      throw error
    } finally {
      abortControllersRef.current.delete(nodeId)
    }
  }, [executingNodes])

  const cancelNodeExecution = useCallback((nodeId: string) => {
    const controller = abortControllersRef.current.get(nodeId)
    if (controller) {
      controller.abort()
      abortControllersRef.current.delete(nodeId)
    }

    setExecutingNodes((prev) => {
      const newMap = new Map(prev)
      newMap.delete(nodeId)
      return newMap
    })
  }, [])

  const getNodeExecutionState = useCallback((nodeId: string): NodeExecutionState | undefined => {
    return executingNodes.get(nodeId)
  }, [executingNodes])

  const isNodeExecuting = useCallback((nodeId: string): boolean => {
    return executingNodes.get(nodeId)?.isExecuting ?? false
  }, [executingNodes])

  const resetNodeExecution = useCallback((nodeId?: string) => {
    if (nodeId) {
      const controller = abortControllersRef.current.get(nodeId)
      if (controller) {
        controller.abort()
        abortControllersRef.current.delete(nodeId)
      }
      setExecutingNodes((prev) => {
        const newMap = new Map(prev)
        newMap.delete(nodeId)
        return newMap
      })
    } else {
      // 重置所有
      abortControllersRef.current.forEach((controller) => controller.abort())
      abortControllersRef.current.clear()
      setExecutingNodes(new Map())
    }
  }, [])

  return {
    executeNode,
    cancelNodeExecution,
    getNodeExecutionState,
    isNodeExecuting,
    resetNodeExecution,
    executingNodes,
  }
}
