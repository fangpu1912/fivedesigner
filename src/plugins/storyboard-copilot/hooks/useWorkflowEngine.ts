// 工作流执行引擎 - 按拓扑排序执行节点
import { useCallback, useRef, useState } from 'react'
import type { Edge } from '@xyflow/react'
import { useToast } from '@/hooks/useToast'
import type { CanvasNode } from '../types'

export interface WorkflowExecutionState {
  isRunning: boolean
  currentNodeId: string | null
  completedNodeIds: string[]
  failedNodeIds: string[]
  progress: number
  totalNodes: number
}

export interface WorkflowExecutionContext {
  nodeOutputs: Map<string, unknown>
  getInputData: (nodeId: string) => unknown
}

// 拓扑排序获取执行顺序
function topologicalSort(nodes: CanvasNode[], edges: Edge[]): string[] {
  const nodeIds = new Set(nodes.map(n => n.id))
  const inDegree = new Map<string, number>()
  const adjList = new Map<string, string[]>()

  // 初始化
  nodes.forEach(n => {
    inDegree.set(n.id, 0)
    adjList.set(n.id, [])
  })

  // 构建邻接表和入度
  edges.forEach(edge => {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      adjList.get(edge.source)?.push(edge.target)
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
    }
  })

  // Kahn算法
  const queue: string[] = []
  const result: string[] = []

  // 找到所有入度为0的节点
  inDegree.forEach((degree, nodeId) => {
    if (degree === 0) queue.push(nodeId)
  })

  while (queue.length > 0) {
    const currentId = queue.shift()!
    result.push(currentId)

    const neighbors = adjList.get(currentId) || []
    neighbors.forEach(neighborId => {
      const newDegree = (inDegree.get(neighborId) || 0) - 1
      inDegree.set(neighborId, newDegree)
      if (newDegree === 0) {
        queue.push(neighborId)
      }
    })
  }

  // 如果有环，剩下的节点也加入（按原始顺序）
  const remainingNodes = nodes
    .filter(n => !result.includes(n.id))
    .map(n => n.id)

  return [...result, ...remainingNodes]
}

// 获取节点的上游数据源
function getUpstreamNodeId(nodeId: string, edges: Edge[]): string | null {
  const incomingEdge = edges.find(e => e.target === nodeId)
  return incomingEdge?.source || null
}

export function useWorkflowEngine() {
  const { toast } = useToast()
  const [executionState, setExecutionState] = useState<WorkflowExecutionState>({
    isRunning: false,
    currentNodeId: null,
    completedNodeIds: [],
    failedNodeIds: [],
    progress: 0,
    totalNodes: 0,
  })

  const abortControllerRef = useRef<AbortController | null>(null)

  const resetExecution = useCallback(() => {
    setExecutionState({
      isRunning: false,
      currentNodeId: null,
      completedNodeIds: [],
      failedNodeIds: [],
      progress: 0,
      totalNodes: 0,
    })
    abortControllerRef.current = null
  }, [])

  const executeWorkflow = useCallback(async (
    nodes: CanvasNode[],
    edges: Edge[],
    nodeExecutors: Map<string, (inputData?: unknown) => Promise<unknown>>
  ): Promise<boolean> => {
    if (nodes.length === 0) {
      toast({ title: '没有可执行的节点', variant: 'destructive' })
      return false
    }

    abortControllerRef.current = new AbortController()
    const executionOrder = topologicalSort(nodes, edges)

    setExecutionState({
      isRunning: true,
      currentNodeId: null,
      completedNodeIds: [],
      failedNodeIds: [],
      progress: 0,
      totalNodes: executionOrder.length,
    })

    const nodeOutputs = new Map<string, unknown>()
    const completedIds: string[] = []
    const failedIds: string[] = []

    try {
      for (let i = 0; i < executionOrder.length; i++) {
        const nodeId = executionOrder[i]
        if (!nodeId) continue
        const node = nodes.find(n => n.id === nodeId)

        if (!node) continue

        // 检查是否被取消
        if (abortControllerRef.current.signal.aborted) {
          toast({ title: '工作流已取消' })
          return false
        }

        setExecutionState(prev => ({
          ...prev,
          currentNodeId: nodeId,
          progress: Math.round((i / executionOrder.length) * 100),
        }))

        // 获取上游节点的输出作为输入
        const upstreamNodeId = getUpstreamNodeId(nodeId, edges)
        const inputData = upstreamNodeId ? nodeOutputs.get(upstreamNodeId) : undefined

        // 执行节点
        const executor = nodeExecutors.get(nodeId)
        if (executor) {
          try {
            const output = await executor(inputData)
            nodeOutputs.set(nodeId, output)
            completedIds.push(nodeId)
          } catch (error) {
            console.error(`节点 ${nodeId} 执行失败:`, error)
            failedIds.push(nodeId)
            // 继续执行其他节点，不中断整个工作流
          }
        } else {
          // 没有执行器的节点（如上传节点），直接标记为完成
          completedIds.push(nodeId)
        }
      }

      setExecutionState(prev => ({
        ...prev,
        isRunning: false,
        currentNodeId: null,
        completedNodeIds: completedIds,
        failedNodeIds: failedIds,
        progress: 100,
      }))

      if (failedIds.length > 0) {
        toast({
          title: '工作流执行完成',
          description: `${completedIds.length} 个成功，${failedIds.length} 个失败`,
          variant: failedIds.length > 0 ? 'destructive' : 'default',
        })
      } else {
        toast({ title: '工作流执行完成', description: `成功执行 ${completedIds.length} 个节点` })
      }

      return failedIds.length === 0
    } catch (error) {
      console.error('工作流执行错误:', error)
      setExecutionState(prev => ({ ...prev, isRunning: false }))
      toast({
        title: '工作流执行失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      })
      return false
    }
  }, [toast])

  const cancelExecution = useCallback(() => {
    abortControllerRef.current?.abort()
    setExecutionState(prev => ({ ...prev, isRunning: false }))
    toast({ title: '工作流已取消' })
  }, [toast])

  return {
    executionState,
    executeWorkflow,
    cancelExecution,
    resetExecution,
  }
}
