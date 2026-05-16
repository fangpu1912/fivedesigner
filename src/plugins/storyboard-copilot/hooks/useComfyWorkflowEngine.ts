// ComfyUI 风格的工作流引擎 - 支持按需执行
import { useCallback, useRef, useState } from 'react'
import type { Edge } from '@xyflow/react'
import { useToast } from '@/hooks/useToast'
import type { CanvasNode } from '../types'

export interface NodeExecutionState {
  isExecuting: boolean
  isCompleted: boolean
  isFailed: boolean
  progress: number
  status?: string
  output?: unknown
  error?: string
}

export interface WorkflowExecutionState {
  isRunning: boolean
  currentNodeId: string | null
  nodeStates: Map<string, NodeExecutionState>
  globalProgress: number
}

export type NodeExecutor = (
  nodeId: string,
  inputData: unknown,
  context: ExecutionContext
) => Promise<unknown>

export interface ExecutionContext {
  // 获取上游节点的输出
  getUpstreamOutput: (nodeId: string) => unknown
  // 获取所有上游节点的输出（用于多输入）
  getAllUpstreamOutputs: () => unknown[]
  // 更新节点状态
  updateNodeState: (nodeId: string, state: Partial<NodeExecutionState>) => void
  // 信号用于取消执行
  signal: AbortSignal
}

// 获取节点的上游节点ID列表
function getUpstreamNodeIds(nodeId: string, edges: Edge[]): string[] {
  const incomingEdges = edges.filter((e) => e.target === nodeId)
  return incomingEdges.map((e) => e.source)
}

// 获取节点的下游节点ID列表
function getDownstreamNodeIds(nodeId: string, edges: Edge[]): string[] {
  const outgoingEdges = edges.filter((e) => e.source === nodeId)
  return outgoingEdges.map((e) => e.target)
}

// 构建执行链（从当前节点向上游追溯）
function buildExecutionChain(
  startNodeId: string,
  nodes: CanvasNode[],
  edges: Edge[],
  visited: Set<string> = new Set()
): string[] {
  if (visited.has(startNodeId)) return []
  visited.add(startNodeId)

  const upstreamIds = getUpstreamNodeIds(startNodeId, edges)
  const chain: string[] = []

  // 先执行上游节点
  for (const upstreamId of upstreamIds) {
    chain.push(...buildExecutionChain(upstreamId, nodes, edges, visited))
  }

  // 再执行当前节点
  chain.push(startNodeId)

  return chain
}

// 构建下游执行链（用于级联执行）
function buildDownstreamChain(
  startNodeId: string,
  nodes: CanvasNode[],
  edges: Edge[],
  visited: Set<string> = new Set()
): string[] {
  if (visited.has(startNodeId)) return []
  visited.add(startNodeId)

  const downstreamIds = getDownstreamNodeIds(startNodeId, edges)
  const chain: string[] = [startNodeId]

  // 再执行下游节点
  for (const downstreamId of downstreamIds) {
    chain.push(...buildDownstreamChain(downstreamId, nodes, edges, visited))
  }

  return chain
}

export function useComfyWorkflowEngine() {
  const { toast } = useToast()
  const [executionState, setExecutionState] = useState<WorkflowExecutionState>({
    isRunning: false,
    currentNodeId: null,
    nodeStates: new Map(),
    globalProgress: 0,
  })

  const abortControllerRef = useRef<AbortController | null>(null)
  const nodeOutputsRef = useRef<Map<string, unknown>>(new Map())

  const resetExecution = useCallback(() => {
    setExecutionState({
      isRunning: false,
      currentNodeId: null,
      nodeStates: new Map(),
      globalProgress: 0,
    })
    nodeOutputsRef.current = new Map()
    abortControllerRef.current = null
  }, [])

  const updateNodeState = useCallback((nodeId: string, state: Partial<NodeExecutionState>) => {
    setExecutionState((prev) => {
      const newStates = new Map(prev.nodeStates)
      const currentState = newStates.get(nodeId) || {
        isExecuting: false,
        isCompleted: false,
        isFailed: false,
        progress: 0,
      }
      newStates.set(nodeId, { ...currentState, ...state })
      return { ...prev, nodeStates: newStates }
    })
  }, [])

  const getUpstreamOutput = useCallback(
    (nodeId: string, edges: Edge[]) => {
      const upstreamIds = getUpstreamNodeIds(nodeId, edges)
      if (upstreamIds.length === 0) return undefined
      // 返回第一个上游节点的输出
      const firstUpstreamId = upstreamIds[0]
      if (!firstUpstreamId) return undefined
      return nodeOutputsRef.current.get(firstUpstreamId)
    },
    []
  )

  // 执行单个节点
  const executeSingleNode = useCallback(
    async (
      nodeId: string,
      nodes: CanvasNode[],
      edges: Edge[],
      executors: Map<string, NodeExecutor>
    ): Promise<boolean> => {
      const node = nodes.find((n) => n.id === nodeId)
      if (!node) return false

      const executor = executors.get(nodeId)
      if (!executor) {
        // 没有执行器的节点直接标记为完成
        updateNodeState(nodeId, { isCompleted: true, progress: 100 })
        return true
      }

      // 检查是否被取消
      if (abortControllerRef.current?.signal.aborted) {
        return false
      }

      // 设置执行中状态
      setExecutionState((prev) => ({ ...prev, currentNodeId: nodeId }))
      updateNodeState(nodeId, { isExecuting: true, isCompleted: false, isFailed: false, progress: 0 })

      try {
        // 获取上游输入
        const inputData = getUpstreamOutput(nodeId, edges)

        // 创建执行上下文
        const context: ExecutionContext = {
          getUpstreamOutput: (id) => nodeOutputsRef.current.get(id),
          getAllUpstreamOutputs: () => {
            const upstreamIds = getUpstreamNodeIds(nodeId, edges)
            return upstreamIds.map((id) => nodeOutputsRef.current.get(id)).filter(Boolean)
          },
          updateNodeState: (id, state) => updateNodeState(id, state),
          signal: abortControllerRef.current!.signal,
        }

        // 执行节点
        const output = await executor(nodeId, inputData, context)

        // 保存输出
        nodeOutputsRef.current.set(nodeId, output)

        // 标记完成
        updateNodeState(nodeId, {
          isExecuting: false,
          isCompleted: true,
          progress: 100,
          output,
        })

        return true
      } catch (error) {
        console.error(`节点 ${nodeId} 执行失败:`, error)
        updateNodeState(nodeId, {
          isExecuting: false,
          isFailed: true,
          error: error instanceof Error ? error.message : '执行失败',
        })
        return false
      }
    },
    [getUpstreamOutput, updateNodeState]
  )

  // 执行指定节点及其上游依赖
  const executeNode = useCallback(
    async (
      nodeId: string,
      nodes: CanvasNode[],
      edges: Edge[],
      executors: Map<string, NodeExecutor>,
      options?: { cascade?: boolean }
    ): Promise<boolean> => {
      if (nodes.length === 0) {
        toast({ title: '没有可执行的节点', variant: 'destructive' })
        return false
      }

      abortControllerRef.current = new AbortController()

      setExecutionState((prev) => ({
        ...prev,
        isRunning: true,
        currentNodeId: null,
      }))

      try {
        // 构建执行链
        let executionChain: string[]
        if (options?.cascade) {
          // 级联模式：执行当前节点及其所有下游节点
          executionChain = buildDownstreamChain(nodeId, nodes, edges)
        } else {
          // 单节点模式：只执行当前节点及其上游依赖
          executionChain = buildExecutionChain(nodeId, nodes, edges)
        }

        // 去重并保持顺序
        executionChain = [...new Set(executionChain)]

        let successCount = 0
        let failCount = 0

        for (let i = 0; i < executionChain.length; i++) {
          const currentNodeId = executionChain[i]
          if (!currentNodeId) continue

          // 更新全局进度
          setExecutionState((prev) => ({
            ...prev,
            globalProgress: Math.round((i / executionChain.length) * 100),
          }))

          const success = await executeSingleNode(currentNodeId, nodes, edges, executors)
          if (success) {
            successCount++
          } else {
            failCount++
          }
        }

        setExecutionState((prev) => ({
          ...prev,
          isRunning: false,
          currentNodeId: null,
          globalProgress: 100,
        }))

        if (failCount > 0) {
          toast({
            title: '执行完成',
            description: `${successCount} 个成功，${failCount} 个失败`,
            variant: 'destructive',
          })
        } else {
          toast({ title: '执行完成', description: `成功执行 ${successCount} 个节点` })
        }

        return failCount === 0
      } catch (error) {
        console.error('执行错误:', error)
        setExecutionState((prev) => ({ ...prev, isRunning: false }))
        toast({
          title: '执行失败',
          description: error instanceof Error ? error.message : '未知错误',
          variant: 'destructive',
        })
        return false
      }
    },
    [executeSingleNode, toast]
  )

  // 执行整个工作流
  const executeWorkflow = useCallback(
    async (
      nodes: CanvasNode[],
      edges: Edge[],
      executors: Map<string, NodeExecutor>,
      options?: { onNodeComplete?: (nodeId: string, output: unknown) => void }
    ): Promise<boolean> => {
      if (nodes.length === 0) {
        toast({ title: '没有可执行的节点', variant: 'destructive' })
        return false
      }

      // 找出所有没有下游节点的终点节点
      const endNodes = nodes.filter((n) => {
        const hasDownstream = edges.some((e) => e.source === n.id)
        return !hasDownstream
      })

      // 如果没有终点节点，执行所有节点
      const targetNodes = endNodes.length > 0 ? endNodes : nodes

      abortControllerRef.current = new AbortController()

      setExecutionState((prev) => ({
        ...prev,
        isRunning: true,
        currentNodeId: null,
      }))

      try {
        // 为每个终点节点构建执行链并合并
        const allChains: string[][] = []
        for (const endNode of targetNodes) {
          const chain = buildExecutionChain(endNode.id, nodes, edges)
          allChains.push(chain)
        }

        // 合并并去重执行链
        const executionChain = [...new Set(allChains.flat())]

        let successCount = 0
        let failCount = 0

        for (let i = 0; i < executionChain.length; i++) {
          const currentNodeId = executionChain[i]
          if (!currentNodeId) continue

          setExecutionState((prev) => ({
            ...prev,
            globalProgress: Math.round((i / executionChain.length) * 100),
          }))

          const success = await executeSingleNode(currentNodeId, nodes, edges, executors)
          if (success) {
            successCount++
            // 触发节点完成回调
            const output = nodeOutputsRef.current.get(currentNodeId)
            if (output && options?.onNodeComplete) {
              options.onNodeComplete(currentNodeId, output)
            }
          } else {
            failCount++
          }
        }

        setExecutionState((prev) => ({
          ...prev,
          isRunning: false,
          currentNodeId: null,
          globalProgress: 100,
        }))

        if (failCount > 0) {
          toast({
            title: '工作流执行完成',
            description: `${successCount} 个成功，${failCount} 个失败`,
            variant: 'destructive',
          })
        } else {
          toast({ title: '工作流执行完成', description: `成功执行 ${successCount} 个节点` })
        }

        return failCount === 0
      } catch (error) {
        console.error('工作流执行错误:', error)
        setExecutionState((prev) => ({ ...prev, isRunning: false }))
        toast({
          title: '工作流执行失败',
          description: error instanceof Error ? error.message : '未知错误',
          variant: 'destructive',
        })
        return false
      }
    },
    [executeSingleNode, toast]
  )

  const cancelExecution = useCallback(() => {
    abortControllerRef.current?.abort()
    setExecutionState((prev) => ({ ...prev, isRunning: false }))
    toast({ title: '执行已取消' })
  }, [toast])

  const getNodeState = useCallback(
    (nodeId: string): NodeExecutionState => {
      return (
        executionState.nodeStates.get(nodeId) || {
          isExecuting: false,
          isCompleted: false,
          isFailed: false,
          progress: 0,
        }
      )
    },
    [executionState.nodeStates]
  )

  return {
    executionState,
    executeNode,
    executeWorkflow,
    cancelExecution,
    resetExecution,
    getNodeState,
  }
}
