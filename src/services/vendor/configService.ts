import { saveFile, readFile, getAppDataDir } from '@/services/tauri'
import { secureStorage } from '@/services/secureStorage'
import type { VendorConfig, AgentDeploy, TaskRecord } from './types'
import { defaultVendors, defaultAgentDeploys } from './seedData'
import { getVendorCode } from './codeLoader'

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

    this.baseDir = await getAppDataDir()
    console.log('[VendorConfigService] 数据目录:', this.baseDir)

    const vendorsData = await readFile(`${this.baseDir}/${VENDORS_FILE_NAME}`)

    if (vendorsData) {
      const savedVendors: VendorConfig[] = JSON.parse(vendorsData)
      this.vendors = savedVendors.filter(sv => defaultVendors.some(dv => dv.id === sv.id))
      let needSave = false
      // 同步配置元数据（inputs、models、description 等），但 code 由运行时注入
      for (const vendor of this.vendors) {
        const defaultVendor = defaultVendors.find(dv => dv.id === vendor.id)
        if (defaultVendor) {
          if (vendor.inputs === undefined && defaultVendor.inputs) {
            vendor.inputs = defaultVendor.inputs
            needSave = true
          }
          if (vendor.models === undefined && defaultVendor.models) {
            vendor.models = defaultVendor.models
            needSave = true
          }
        }
      }
      // 自动添加新供应商
      const newVendors = defaultVendors.filter(dv => !savedVendors.some(sv => sv.id === dv.id))
      if (newVendors.length > 0) {
        this.vendors.push(...newVendors)
        needSave = true
      }
      if (needSave || savedVendors.length !== this.vendors.length) {
        await this.saveVendors()
      }
    } else {
      this.vendors = [...defaultVendors]
      await this.saveVendors()
    }

    // 运行时注入最新代码（不依赖保存的代码）
    this.injectLatestCode()

    await this.loadSecureInputValues()

    const agentsData = await readFile(`${this.baseDir}/${AGENTS_FILE_NAME}`)
    if (agentsData) {
      const savedAgents = JSON.parse(agentsData) as AgentDeploy[]
      const mergedAgents: AgentDeploy[] = []
      for (const defaultAgent of defaultAgentDeploys) {
        const savedAgent = savedAgents.find(a => a.key === defaultAgent.key)
        if (savedAgent) {
          mergedAgents.push({ ...savedAgent, desc: defaultAgent.desc })
        } else {
          mergedAgents.push({ ...defaultAgent })
        }
      }
      this.agents = mergedAgents
      if (mergedAgents.length !== savedAgents.length) {
        await this.saveAgents()
      }
    } else {
      this.agents = [...defaultAgentDeploys]
      await this.saveAgents()
    }

    const tasksData = await readFile(`${this.baseDir}/${TASKS_FILE_NAME}`)
    if (tasksData) {
      this.tasks = JSON.parse(tasksData)
    }

    this.initialized = true
  }

  // 运行时注入最新代码：始终使用 codeLoader 中的源代码
  private injectLatestCode(): void {
    for (const vendor of this.vendors) {
      const latestCode = getVendorCode(vendor.id)
      if (latestCode) {
        vendor.code = latestCode
      }
    }
  }

  private async loadSecureInputValues(): Promise<void> {
    for (const vendor of this.vendors) {
      const secureInputs: Record<string, string> = {}
      const inputs = vendor.inputs || []
      for (const input of inputs) {
        if (input.type === 'password') {
          const key = `${SECURE_PREFIX}${vendor.id}_${input.key}`
          const value = await secureStorage.get(key)
          if (value) {
            secureInputs[input.key] = value
          }
        }
      }
      vendor.inputValues = { ...vendor.inputValues, ...secureInputs }
    }
  }

  private async saveSecureInputValues(vendor: VendorConfig): Promise<void> {
    const inputs = vendor.inputs || []
    for (const input of inputs) {
      if (input.type === 'password') {
        const key = `${SECURE_PREFIX}${vendor.id}_${input.key}`
        const value = vendor.inputValues?.[input.key]
        if (value) {
          await secureStorage.set(key, value)
        }
      }
    }
  }

  private async deleteSecureInputValues(vendorId: string, inputs: VendorConfig['inputs']): Promise<void> {
    for (const input of inputs) {
      if (input.type === 'password') {
        const key = `${SECURE_PREFIX}${vendorId}_${input.key}`
        await secureStorage.delete(key)
      }
    }
  }

  async getAllVendors(): Promise<VendorConfig[]> {
    await this.initialize()
    return this.vendors
  }

  async getVendor(id: string): Promise<VendorConfig | null> {
    await this.initialize()
    const vendor = this.vendors.find(v => v.id === id)
    if (!vendor) return null
    // 始终注入最新代码
    const latestCode = getVendorCode(id)
    if (latestCode) {
      vendor.code = latestCode
    }
    return vendor
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
    await this.saveSecureInputValues(config)
  }

  async deleteVendor(id: string): Promise<void> {
    await this.initialize()
    const vendor = this.vendors.find(v => v.id === id)
    if (vendor) {
      await this.deleteSecureInputValues(id, vendor.inputs)
    }
    this.vendors = this.vendors.filter(v => v.id !== id)
    await this.saveVendors()
  }

  private async saveVendors(): Promise<void> {
    const vendorsToSave = this.vendors.map(v => {
      const inputValues: Record<string, string> = {}
      const inputs = v.inputs || []
      for (const input of inputs) {
        const val = v.inputValues?.[input.key]
        if (input.type !== 'password' && val !== undefined) {
          inputValues[input.key] = val
        }
      }
      // 不保存 code 字段到文件，运行时从 codeLoader 注入
      return { ...v, inputValues, code: '' }
    })
    await saveFile(`${this.baseDir}/${VENDORS_FILE_NAME}`, JSON.stringify(vendorsToSave, null, 2))
  }

  async resetToDefaults(): Promise<void> {
    await this.initialize()
    this.vendors = [...defaultVendors]
    await this.saveVendors()
    console.log('[VendorConfigService] 已重置为默认配置')
  }

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

  async createTask(task: Omit<TaskRecord, 'id'>): Promise<(state: number, reason?: string) => Promise<void>> {
    await this.initialize()
    const id = this.tasks.length > 0 ? Math.max(...this.tasks.map(t => t.id)) + 1 : 1
    const newTask: TaskRecord = { ...task, id }
    this.tasks.push(newTask)
    await this.saveTasks()

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
