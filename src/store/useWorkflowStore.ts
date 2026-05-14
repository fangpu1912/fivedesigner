import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

import type { WorkflowConfig } from '../types'

export type WorkflowStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled'
export type WorkflowNodeType = 'txt2img' | 'img2img' | 'img2vid' | 'tts'

export interface WorkflowNode {
  id: string
  type: WorkflowNodeType
  name: string
  config: Record<string, unknown>
  position: { x: number; y: number }
  inputs: string[]
  outputs: string[]
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

export interface Workflow {
  id: string
  name: string
  description?: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  variables: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export interface WorkflowExecution {
  id: string
  workflowId: string
  status: WorkflowStatus
  progress: number
  currentNodeId?: string
  results: Record<string, unknown>
  error?: string
  startedAt: number
  completedAt?: number
}

interface WorkflowState {
  workflows: Workflow[]
  activeWorkflowId: string | null
  executions: WorkflowExecution[]
  activeExecutionId: string | null

  addWorkflow: (workflow: Workflow) => void
  updateWorkflow: (id: string, updates: Partial<Workflow>) => void
  deleteWorkflow: (id: string) => void
  duplicateWorkflow: (id: string) => string | null
  setActiveWorkflow: (id: string | null) => void
  getWorkflow: (id: string) => Workflow | undefined

  addExecution: (execution: WorkflowExecution) => void
  updateExecution: (id: string, updates: Partial<WorkflowExecution>) => void
  setActiveExecution: (id: string | null) => void
  getExecution: (id: string) => WorkflowExecution | undefined
  getExecutionsByWorkflow: (workflowId: string) => WorkflowExecution[]
  clearExecutions: (workflowId?: string) => void

  importFromConfig: (config: WorkflowConfig) => Workflow
  exportToConfig: (id: string) => WorkflowConfig | null
}

const generateId = () => `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    immer((set, get) => ({
      workflows: [],
      activeWorkflowId: null,
      executions: [],
      activeExecutionId: null,

      addWorkflow: workflow =>
        set(state => {
          state.workflows.push(workflow)
        }),

      updateWorkflow: (id, updates) =>
        set(state => {
          const index = state.workflows.findIndex(w => w.id === id)
          if (index !== -1 && state.workflows[index]) {
            Object.assign(state.workflows[index]!, updates, { updatedAt: Date.now() })
          }
        }),

      deleteWorkflow: id =>
        set(state => {
          const index = state.workflows.findIndex(w => w.id === id)
          if (index !== -1) {
            state.workflows.splice(index, 1)
          }
          if (state.activeWorkflowId === id) {
            state.activeWorkflowId = null
          }
          state.executions = state.executions.filter(e => e.workflowId !== id)
        }),

      duplicateWorkflow: id => {
        const workflow = get().workflows.find(w => w.id === id)
        if (!workflow) return null

        const newId = generateId()
        const duplicated: Workflow = {
          ...workflow,
          id: newId,
          name: `${workflow.name} (副本)`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }

        set(state => {
          state.workflows.push(duplicated)
        })

        return newId
      },

      setActiveWorkflow: id =>
        set(state => {
          state.activeWorkflowId = id
        }),

      getWorkflow: id => get().workflows.find(w => w.id === id),

      addExecution: execution =>
        set(state => {
          state.executions.push(execution)
        }),

      updateExecution: (id, updates) =>
        set(state => {
          const index = state.executions.findIndex(e => e.id === id)
          if (index !== -1 && state.executions[index]) {
            Object.assign(state.executions[index]!, updates)
          }
        }),

      setActiveExecution: id =>
        set(state => {
          state.activeExecutionId = id
        }),

      getExecution: id => get().executions.find(e => e.id === id),

      getExecutionsByWorkflow: workflowId =>
        get().executions.filter(e => e.workflowId === workflowId),

      clearExecutions: workflowId =>
        set(state => {
          if (workflowId) {
            state.executions = state.executions.filter(e => e.workflowId !== workflowId)
          } else {
            state.executions = []
          }
          state.activeExecutionId = null
        }),

      importFromConfig: config => {
        const workflow: Workflow = {
          id: config.id || generateId(),
          name: config.name,
          description: `Imported from ${config.type}`,
          nodes: [
            {
              id: 'node_1',
              type: config.type as WorkflowNodeType,
              name: config.name,
              config: config.workflow,
              position: { x: 100, y: 100 },
              inputs: [],
              outputs: [],
            },
          ],
          edges: [],
          variables: config.nodes as Record<string, unknown>,
          createdAt: new Date(config.created_at).getTime(),
          updatedAt: new Date(config.updated_at).getTime(),
        }

        set(state => {
          state.workflows.push(workflow)
        })

        return workflow
      },

      exportToConfig: id => {
        const workflow = get().workflows.find(w => w.id === id)
        if (!workflow) return null

        const firstNode = workflow.nodes[0]
        return {
          id: workflow.id,
          name: workflow.name,
          type: firstNode?.type || 'txt2img',
          workflow: firstNode?.config || {},
          nodes: workflow.variables as WorkflowConfig['nodes'],
          created_at: new Date(workflow.createdAt).toISOString(),
          updated_at: new Date(workflow.updatedAt).toISOString(),
        }
      },
    })),
    {
      name: 'workflow-storage',
      partialize: state => ({
        workflows: state.workflows,
        activeWorkflowId: state.activeWorkflowId,
      }),
    }
  )
)
