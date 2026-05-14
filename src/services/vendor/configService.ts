/**
 * 供应商配置服务
 * 管理供应商配置和Agent部署
 * API密钥等敏感信息使用secureStorage加密存储
 */

import { saveFile, readFile, getAppDataDir } from '@/services/tauri'
import { secureStorage } from '@/services/secureStorage'
import type { VendorConfig, AgentDeploy, TaskRecord } from './types'
import { defaultVendors, defaultAgentDeploys } from './seedData'

const VENDORS_FILE_NAME = 'vendors.json'
const AGENTS_FILE_NAME = 'agents.json'
const TASKS_FILE_NAME = 'tasks.json'
const SECURE_PREFIX = 'vendor_input_'

class VendorConfigService {
  private vendors: VendorConfig[] = []
  private agents: AgentDeploy[] = []
  private tasks: TaskRecord[] = []
  private initialized = false
  private baseDir = ''

  async initialize(): Promise<void> {
    if (this.initialized) return

    // 获取应用数据目录
    this.baseDir = await getAppDataDir()
    console.log('[VendorConfigService] 数据目录:', this.baseDir)

    // 加载供应商配置
    const vendorsData = await readFile(`${this.baseDir}/${VENDORS_FILE_NAME}`)
    
    if (vendorsData) {
      // 正常情况：使用保存的配置
      this.vendors = JSON.parse(vendorsData)
      // 自动同步 code 字段：确保已保存的供应商使用最新的源代码
      let codeUpdated = false
      for (const vendor of this.vendors) {
        const defaultVendor = defaultVendors.find(dv => dv.id === vendor.id)
        if (defaultVendor && defaultVendor.code !== vendor.code) {
          vendor.code = defaultVendor.code
          codeUpdated = true
        }
      }
      if (codeUpdated) {
        await this.saveVendors()
      }
    } else {
      // 首次使用：写入默认配置
      this.vendors = [...defaultVendors]
      await this.saveVendors()
    }

    // 加载加密的inputValues
    await this.loadSecureInputValues()

    // 加载Agent配置
    const agentsData = await readFile(`${this.baseDir}/${AGENTS_FILE_NAME}`)
    if (agentsData) {
      const savedAgents = JSON.parse(agentsData) as AgentDeploy[]
      // 合并默认Agent：添加新的默认Agent，保留用户配置
      const mergedAgents: AgentDeploy[] = []
      for (const defaultAgent of defaultAgentDeploys) {
        const savedAgent = savedAgents.find(a => a.key === defaultAgent.key)
        if (savedAgent) {
          // 保留用户配置，但更新描述等元数据
          mergedAgents.push({
            ...savedAgent,
            desc: defaultAgent.desc, // 更新描述
          })
        } else {
          // 添加新的默认Agent
          mergedAgents.push({ ...defaultAgent })
        }
      }
      this.agents = mergedAgents
      // 如果有新增Agent，保存更新
      if (mergedAgents.length !== savedAgents.length) {
        await this.saveAgents()
      }
    } else {
      this.agents = [...defaultAgentDeploys]
      await this.saveAgents()
    }

    // 加载任务记录
    const tasksData = await readFile(`${this.baseDir}/${TASKS_FILE_NAME}`)
    if (tasksData) {
      this.tasks = JSON.parse(tasksData)
    }

    this.initialized = true
  }

  // 加载加密的inputValues
  private async loadSecureInputValues(): Promise<void> {
    for (const vendor of this.vendors) {
      const secureInputs: Record<string, string> = {}
      for (const input of vendor.inputs) {
        if (input.type === 'password') {
          const key = `${SECURE_PREFIX}${vendor.id}_${input.key}`
          const value = await secureStorage.get(key)
          if (value) {
            secureInputs[input.key] = value
          }
        }
      }
      // 合并明文和加密的inputValues
      vendor.inputValues = { ...vendor.inputValues, ...secureInputs }
    }
  }

  // 保存加密的inputValues
  private async saveSecureInputValues(vendor: VendorConfig): Promise<void> {
    for (const input of vendor.inputs) {
      if (input.type === 'password') {
        const key = `${SECURE_PREFIX}${vendor.id}_${input.key}`
        const value = vendor.inputValues[input.key]
        if (value) {
          await secureStorage.set(key, value)
        }
      }
    }
  }

  // 删除供应商时清理加密数据
  private async deleteSecureInputValues(vendorId: string, inputs: VendorConfig['inputs']): Promise<void> {
    for (const input of inputs) {
      if (input.type === 'password') {
        const key = `${SECURE_PREFIX}${vendorId}_${input.key}`
        await secureStorage.delete(key)
      }
    }
  }

  // 供应商配置管理
  async getAllVendors(): Promise<VendorConfig[]> {
    await this.initialize()
    return this.vendors
  }

  async getVendor(id: string): Promise<VendorConfig | null> {
    await this.initialize()
    return this.vendors.find(v => v.id === id) || null
  }

  async saveVendor(config: VendorConfig): Promise<void> {
    await this.initialize()
    const index = this.vendors.findIndex(v => v.id === config.id)
    if (index >= 0) {
      this.vendors[index] = config
    } else {
      this.vendors.push(config)
    }
    await this.saveVendors()
    // 保存加密的inputValues
    await this.saveSecureInputValues(config)
  }

  async deleteVendor(id: string): Promise<void> {
    await this.initialize()
    const vendor = this.vendors.find(v => v.id === id)
    if (vendor) {
      // 删除加密数据
      await this.deleteSecureInputValues(id, vendor.inputs)
    }
    this.vendors = this.vendors.filter(v => v.id !== id)
    await this.saveVendors()
  }

  private async saveVendors(): Promise<void> {
    // 保存时移除敏感信息（只保存非password类型的inputValues）
    const vendorsToSave = this.vendors.map(v => {
      const inputValues: Record<string, string> = {}
      for (const input of v.inputs) {
        const val = v.inputValues[input.key]
        if (input.type !== 'password' && val !== undefined) {
          inputValues[input.key] = val
        }
      }
      return { ...v, inputValues }
    })
    await saveFile(`${this.baseDir}/${VENDORS_FILE_NAME}`, JSON.stringify(vendorsToSave, null, 2))
  }

  /**
   * 重置为默认配置
   * 用于需要完全重置供应商配置的场景
   */
  async resetToDefaults(): Promise<void> {
    await this.initialize()
    this.vendors = [...defaultVendors]
    await this.saveVendors()
    console.log('[VendorConfigService] 已重置为默认配置')
  }

  // Agent部署管理
  async getAllAgents(): Promise<AgentDeploy[]> {
    await this.initialize()
    return this.agents
  }

  async getAgent(key: string): Promise<AgentDeploy | null> {
    await this.initialize()
    return this.agents.find(a => a.key === key) || null
  }

  async saveAgent(agent: AgentDeploy): Promise<void> {
    await this.initialize()
    const index = this.agents.findIndex(a => a.key === agent.key)
    if (index >= 0) {
      this.agents[index] = agent
    } else {
      this.agents.push(agent)
    }
    await this.saveAgents()
  }

  private async saveAgents(): Promise<void> {
    await saveFile(`${this.baseDir}/${AGENTS_FILE_NAME}`, JSON.stringify(this.agents, null, 2))
  }

  // 任务记录管理
  async createTask(task: Omit<TaskRecord, 'id'>): Promise<(state: number, reason?: string) => Promise<void>> {
    await this.initialize()
    const id = this.tasks.length > 0 ? Math.max(...this.tasks.map(t => t.id)) + 1 : 1
    const newTask: TaskRecord = { ...task, id }
    this.tasks.push(newTask)
    await this.saveTasks()

    // 返回更新函数
    return async (state: number, reason?: string) => {
      const taskIndex = this.tasks.findIndex(t => t.id === id)
      if (taskIndex >= 0) {
        const task = this.tasks[taskIndex]
        if (task) {
          task.state = state === 1 ? 'completed' : state === -1 ? 'failed' : 'running'
          if (reason) task.reason = reason
          await this.saveTasks()
        }
      }
    }
  }

  async getTasks(projectId?: number): Promise<TaskRecord[]> {
    await this.initialize()
    if (projectId) {
      return this.tasks.filter(t => t.projectId === projectId)
    }
    return this.tasks
  }

  private async saveTasks(): Promise<void> {
    await saveFile(`${this.baseDir}/${TASKS_FILE_NAME}`, JSON.stringify(this.tasks, null, 2))
  }
}

export const vendorConfigService = new VendorConfigService()
