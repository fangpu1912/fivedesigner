import {
  type Workflow,
  type WorkflowExecution,
  type WorkflowTemplate,
  type ExecutionCallback,
} from './types'
import { WorkflowEngine } from './WorkflowEngine'

const WORKFLOWS_KEY = 'workflows'
const EXECUTIONS_KEY = 'workflow_executions'
const TEMPLATES_KEY = 'workflow_templates'

export class WorkflowService {
  private engine: WorkflowEngine
  private workflows: Map<string, Workflow> = new Map()
  private executions: Map<string, WorkflowExecution> = new Map()
  private templates: Map<string, WorkflowTemplate> = new Map()

  constructor(engine?: WorkflowEngine) {
    this.engine = engine || new WorkflowEngine()
    this.loadFromStorage()
    this.initializeDefaultTemplates()
  }

  private loadFromStorage(): void {
    try {
      const storedWorkflows = localStorage.getItem(WORKFLOWS_KEY)
      if (storedWorkflows) {
        const workflows = JSON.parse(storedWorkflows) as Workflow[]
        workflows.forEach(w => this.workflows.set(w.id, w))
      }

      const storedExecutions = localStorage.getItem(EXECUTIONS_KEY)
      if (storedExecutions) {
        const executions = JSON.parse(storedExecutions) as WorkflowExecution[]
        executions.forEach(e => this.executions.set(e.id, e))
      }

      const storedTemplates = localStorage.getItem(TEMPLATES_KEY)
      if (storedTemplates) {
        const templates = JSON.parse(storedTemplates) as WorkflowTemplate[]
        templates.forEach(t => this.templates.set(t.id, t))
      }
    } catch (error) {
      console.error('加载工作流数据失败:', error)
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(Array.from(this.workflows.values())))
      localStorage.setItem(EXECUTIONS_KEY, JSON.stringify(Array.from(this.executions.values())))
      localStorage.setItem(TEMPLATES_KEY, JSON.stringify(Array.from(this.templates.values())))
    } catch (error) {
      console.error('保存工作流数据失败:', error)
    }
  }

  private initializeDefaultTemplates(): void {
    if (this.templates.size === 0) {
      const defaultTemplates: WorkflowTemplate[] = [
        {
          id: 'template_txt2img',
          name: '文生图工作流',
          description: '从文本提示生成图片',
          category: 'image',
          workflow: {
            name: '文生图',
            description: '从文本提示生成图片',
            nodes: [
              {
                id: 'node_prompt',
                type: 'script',
                name: '提示词处理',
                config: { script: 'return inputs.prompt;' },
                inputs: [{ id: 'prompt_in', name: 'prompt', type: 'text', required: true }],
                outputs: [{ id: 'prompt_out', name: 'prompt', type: 'text', required: true }],
                position: { x: 100, y: 100 },
              },
              {
                id: 'node_image_gen',
                type: 'image_gen',
                name: '图片生成',
                config: { width: 1024, height: 1024 },
                inputs: [{ id: 'prompt', name: 'prompt', type: 'text', required: true }],
                outputs: [{ id: 'image', name: 'image', type: 'image', required: true }],
                position: { x: 300, y: 100 },
              },
            ],
            edges: [
              {
                id: 'edge_1',
                source: 'node_prompt',
                sourcePort: 'prompt_out',
                target: 'node_image_gen',
                targetPort: 'prompt',
              },
            ],
            variables: {},
          },
        },
        {
          id: 'template_img2vid',
          name: '图生视频工作流',
          description: '从图片生成视频',
          category: 'video',
          workflow: {
            name: '图生视频',
            description: '从图片生成视频',
            nodes: [
              {
                id: 'node_image_input',
                type: 'script',
                name: '图片输入',
                config: {},
                inputs: [{ id: 'image_in', name: 'image', type: 'image', required: true }],
                outputs: [{ id: 'image_out', name: 'image', type: 'image', required: true }],
                position: { x: 100, y: 100 },
              },
              {
                id: 'node_video_gen',
                type: 'video_gen',
                name: '视频生成',
                config: { duration: 4 },
                inputs: [
                  { id: 'image', name: 'image', type: 'image', required: true },
                  { id: 'prompt', name: 'prompt', type: 'text', required: false },
                ],
                outputs: [{ id: 'video', name: 'video', type: 'video', required: true }],
                position: { x: 300, y: 100 },
              },
            ],
            edges: [
              {
                id: 'edge_1',
                source: 'node_image_input',
                sourcePort: 'image_out',
                target: 'node_video_gen',
                targetPort: 'image',
              },
            ],
            variables: {},
          },
        },
        {
          id: 'template_story_pipeline',
          name: '故事分镜流水线',
          description: '从剧本生成分镜图片和视频',
          category: 'pipeline',
          workflow: {
            name: '故事分镜流水线',
            description: '从剧本生成分镜图片和视频',
            nodes: [
              {
                id: 'node_script',
                type: 'script',
                name: '剧本输入',
                config: {},
                inputs: [{ id: 'script', name: 'script', type: 'text', required: true }],
                outputs: [{ id: 'script_out', name: 'script', type: 'text', required: true }],
                position: { x: 100, y: 200 },
              },
              {
                id: 'node_image_gen',
                type: 'image_gen',
                name: '生成分镜图',
                config: { width: 1920, height: 1080 },
                inputs: [{ id: 'prompt', name: 'prompt', type: 'text', required: true }],
                outputs: [{ id: 'image', name: 'image', type: 'image', required: true }],
                position: { x: 300, y: 100 },
              },
              {
                id: 'node_video_gen',
                type: 'video_gen',
                name: '生成视频',
                config: { duration: 4 },
                inputs: [
                  { id: 'image', name: 'image', type: 'image', required: true },
                  { id: 'prompt', name: 'prompt', type: 'text', required: false },
                ],
                outputs: [{ id: 'video', name: 'video', type: 'video', required: true }],
                position: { x: 500, y: 100 },
              },
            ],
            edges: [
              {
                id: 'edge_1',
                source: 'node_script',
                sourcePort: 'script_out',
                target: 'node_image_gen',
                targetPort: 'prompt',
              },
              {
                id: 'edge_2',
                source: 'node_image_gen',
                sourcePort: 'image',
                target: 'node_video_gen',
                targetPort: 'image',
              },
            ],
            variables: {},
          },
        },
      ]

      defaultTemplates.forEach(t => this.templates.set(t.id, t))
      this.saveToStorage()
    }
  }

  create(workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Workflow {
    const now = Date.now()
    const newWorkflow: Workflow = {
      ...workflow,
      id: this.generateId(),
      createdAt: now,
      updatedAt: now,
    }

    this.workflows.set(newWorkflow.id, newWorkflow)
    this.saveToStorage()

    return newWorkflow
  }

  getById(id: string): Workflow | undefined {
    return this.workflows.get(id)
  }

  getAll(): Workflow[] {
    return Array.from(this.workflows.values())
  }

  update(id: string, updates: Partial<Omit<Workflow, 'id' | 'createdAt'>>): Workflow | undefined {
    const workflow = this.workflows.get(id)
    if (!workflow) return undefined

    const updated: Workflow = {
      ...workflow,
      ...updates,
      updatedAt: Date.now(),
    }

    this.workflows.set(id, updated)
    this.saveToStorage()

    return updated
  }

  delete(id: string): boolean {
    if (this.workflows.has(id)) {
      this.workflows.delete(id)
      this.saveToStorage()
      return true
    }
    return false
  }

  duplicate(id: string): Workflow | undefined {
    const original = this.workflows.get(id)
    if (!original) return undefined

    const now = Date.now()
    const duplicate: Workflow = {
      ...original,
      id: this.generateId(),
      name: `${original.name} (副本)`,
      createdAt: now,
      updatedAt: now,
    }

    this.workflows.set(duplicate.id, duplicate)
    this.saveToStorage()

    return duplicate
  }

  async execute(
    workflowId: string,
    inputs: Record<string, unknown>,
    callback?: ExecutionCallback
  ): Promise<WorkflowExecution> {
    const workflow = this.workflows.get(workflowId)
    if (!workflow) {
      throw new Error(`工作流不存在: ${workflowId}`)
    }

    const execution = await this.engine.execute(workflow, inputs, callback)

    this.executions.set(execution.id, execution)
    this.saveToStorage()

    return execution
  }

  getExecution(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId)
  }

  getExecutionsByWorkflow(workflowId: string): WorkflowExecution[] {
    return Array.from(this.executions.values()).filter(e => e.workflowId === workflowId)
  }

  cancelExecution(executionId: string): boolean {
    return this.engine.cancel(executionId)
  }

  getTemplates(): WorkflowTemplate[] {
    return Array.from(this.templates.values())
  }

  getTemplatesByCategory(category: string): WorkflowTemplate[] {
    return Array.from(this.templates.values()).filter(t => t.category === category)
  }

  createFromTemplate(templateId: string, name?: string): Workflow | undefined {
    const template = this.templates.get(templateId)
    if (!template) return undefined

    return this.create({
      ...template.workflow,
      name: name || template.name,
    })
  }

  createTemplate(template: Omit<WorkflowTemplate, 'id'>): WorkflowTemplate {
    const newTemplate: WorkflowTemplate = {
      ...template,
      id: this.generateId(),
    }

    this.templates.set(newTemplate.id, newTemplate)
    this.saveToStorage()

    return newTemplate
  }

  deleteTemplate(id: string): boolean {
    if (this.templates.has(id)) {
      this.templates.delete(id)
      this.saveToStorage()
      return true
    }
    return false
  }

  validateWorkflow(workflow: Workflow): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!workflow.name || workflow.name.trim() === '') {
      errors.push('工作流名称不能为空')
    }

    if (workflow.nodes.length === 0) {
      errors.push('工作流至少需要一个节点')
    }

    const nodeIds = new Set(workflow.nodes.map(n => n.id))
    for (const edge of workflow.edges) {
      if (!nodeIds.has(edge.source)) {
        errors.push(`边引用了不存在的源节点: ${edge.source}`)
      }
      if (!nodeIds.has(edge.target)) {
        errors.push(`边引用了不存在的目标节点: ${edge.target}`)
      }
    }

    try {
      const visited = new Set<string>()
      const recursionStack = new Set<string>()

      const hasCycle = (nodeId: string): boolean => {
        visited.add(nodeId)
        recursionStack.add(nodeId)

        const outgoingEdges = workflow.edges.filter(e => e.source === nodeId)
        for (const edge of outgoingEdges) {
          if (!visited.has(edge.target)) {
            if (hasCycle(edge.target)) return true
          } else if (recursionStack.has(edge.target)) {
            return true
          }
        }

        recursionStack.delete(nodeId)
        return false
      }

      for (const node of workflow.nodes) {
        if (!visited.has(node.id)) {
          if (hasCycle(node.id)) {
            errors.push('工作流存在循环依赖')
            break
          }
        }
      }
    } catch (error) {
      errors.push('工作流验证失败')
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

export const workflowService = new WorkflowService()
