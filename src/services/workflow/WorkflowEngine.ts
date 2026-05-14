import { NodeExecutor } from './NodeExecutor'
import {
  type Workflow,
  type WorkflowExecution,
  type ExecutionContext,
  type ExecutionCallback,
  type WorkflowNode,
  type NodeExecutionResult,
} from './types'

interface TopologicalSortResult {
  sorted: WorkflowNode[]
  parallel: WorkflowNode[][]
}

export class WorkflowEngine {
  private nodeExecutor: NodeExecutor
  private runningExecutions: Map<string, boolean> = new Map()

  constructor(nodeExecutor?: NodeExecutor) {
    this.nodeExecutor = nodeExecutor || new NodeExecutor()
  }

  async execute(
    workflow: Workflow,
    inputs: Record<string, unknown>,
    callback?: ExecutionCallback
  ): Promise<WorkflowExecution> {
    const executionId = this.generateId()

    const execution: WorkflowExecution = {
      id: executionId,
      workflowId: workflow.id,
      status: 'pending',
      progress: 0,
      inputs,
      outputs: {},
      logs: [],
    }

    const context: ExecutionContext = {
      workflow,
      execution,
      nodeOutputs: new Map(),
      variables: { ...workflow.variables },
      onProgress: callback?.onProgress,
      onLog: callback?.onLog,
    }

    this.runningExecutions.set(executionId, true)

    try {
      execution.status = 'running'
      execution.startedAt = Date.now()

      this.log(context, 'workflow', 'info', `开始执行工作流: ${workflow.name}`)

      const { parallel: executionLevels } = this.topologicalSort(workflow)

      const totalNodes = workflow.nodes.length
      let completedNodes = 0

      for (const level of executionLevels) {
        if (!this.runningExecutions.get(executionId)) {
          execution.status = 'cancelled'
          this.log(context, 'workflow', 'warn', '工作流被取消')
          break
        }

        const parallelResults = await Promise.all(
          level.map(async node => {
            execution.currentNode = node.id
            context.onProgress?.((completedNodes / totalNodes) * 100, node.id)

            const result = await this.executeWithRetry(node, context, 3)

            if (result.success) {
              context.nodeOutputs.set(node.id, result.outputs)
              callback?.onNodeComplete?.(node.id, result)
            }

            return { node, result }
          })
        )

        for (const { node, result } of parallelResults) {
          if (!result.success) {
            throw new Error(`节点 ${node.name} 执行失败: ${result.error}`)
          }
          completedNodes++
        }

        execution.progress = (completedNodes / totalNodes) * 100
      }

      execution.status = 'completed'
      execution.completedAt = Date.now()
      execution.outputs = this.collectOutputs(context)
      execution.progress = 100

      this.log(
        context,
        'workflow',
        'info',
        `工作流执行完成，耗时: ${execution.completedAt - (execution.startedAt || 0)}ms`
      )

      callback?.onComplete?.(execution)
    } catch (error) {
      execution.status = 'failed'
      execution.completedAt = Date.now()

      const errorMessage = error instanceof Error ? error.message : String(error)
      this.log(context, 'workflow', 'error', `工作流执行失败: ${errorMessage}`)

      callback?.onError?.(error instanceof Error ? error : new Error(errorMessage))
    } finally {
      this.runningExecutions.delete(executionId)
    }

    return execution
  }

  cancel(executionId: string): boolean {
    if (this.runningExecutions.has(executionId)) {
      this.runningExecutions.delete(executionId)
      return true
    }
    return false
  }

  private topologicalSort(workflow: Workflow): TopologicalSortResult {
    const nodeMap = new Map<string, WorkflowNode>()
    const inDegree = new Map<string, number>()
    const adjacencyList = new Map<string, string[]>()

    for (const node of workflow.nodes) {
      nodeMap.set(node.id, node)
      inDegree.set(node.id, 0)
      adjacencyList.set(node.id, [])
    }

    for (const edge of workflow.edges) {
      adjacencyList.get(edge.source)?.push(edge.target)
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
    }

    const parallel: WorkflowNode[][] = []
    const sorted: WorkflowNode[] = []

    while (sorted.length < workflow.nodes.length) {
      const currentLevel: string[] = []

      for (const [nodeId, degree] of inDegree.entries()) {
        if (degree === 0 && !sorted.find(n => n.id === nodeId)) {
          currentLevel.push(nodeId)
        }
      }

      if (currentLevel.length === 0) {
        throw new Error('工作流存在循环依赖')
      }

      const levelNodes = currentLevel.map(id => nodeMap.get(id)!).filter(Boolean)

      parallel.push(levelNodes)
      sorted.push(...levelNodes)

      for (const nodeId of currentLevel) {
        for (const neighbor of adjacencyList.get(nodeId) || []) {
          inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1)
        }
      }
    }

    return { sorted, parallel }
  }

  private async executeWithRetry(
    node: WorkflowNode,
    context: ExecutionContext,
    maxRetries: number
  ): Promise<NodeExecutionResult> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.nodeExecutor.execute(node, {}, context)
        return result
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        this.log(
          context,
          node.id,
          'warn',
          `节点执行失败，尝试重试 (${attempt}/${maxRetries}): ${lastError.message}`
        )

        if (attempt < maxRetries) {
          await this.delay(1000 * attempt)
        }
      }
    }

    return {
      success: false,
      outputs: {},
      error: lastError?.message || '未知错误',
    }
  }

  private collectOutputs(context: ExecutionContext): Record<string, unknown> {
    const outputs: Record<string, unknown> = {}

    const targetNodes = new Set(context.workflow.edges.map(e => e.target))

    for (const node of context.workflow.nodes) {
      if (!targetNodes.has(node.id)) {
        const nodeOutput = context.nodeOutputs.get(node.id)
        if (nodeOutput) {
          outputs[node.id] = nodeOutput
        }
      }
    }

    return outputs
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private log(
    context: ExecutionContext,
    nodeId: string,
    level: 'info' | 'warn' | 'error',
    message: string
  ): void {
    const log = {
      timestamp: Date.now(),
      nodeId,
      level,
      message,
    }

    context.execution.logs.push(log)
    context.onLog?.(log)
  }

  private generateId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

export const workflowEngine = new WorkflowEngine()
