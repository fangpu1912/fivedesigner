import type { PromptTemplate, PromptType, PromptConfig, PromptPreset } from '@/types/prompt'
import {
  DEFAULT_PROMPT_TEMPLATES,
  POPULAR_PROMPT_PRESETS,
  PROMPT_TYPE_CONFIG,
} from '@/types/prompt'

const PROMPT_CONFIG_KEY = 'fivedesigner_prompt_config'
const PROMPT_CONFIG_VERSION_KEY = 'fivedesigner_prompt_config_version'
const CURRENT_CONFIG_VERSION = '4.0' // 4.0: 引入"脊骨与皮肉"创作哲学，强化台词与表演的联动关系，新增镜头组设计理念

// 生成唯一ID
function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// 替换模板变量
export function replaceVariables(
  template: string,
  variables: Record<string, string | number>
): string {
  let result = template
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g')
    result = result.replace(regex, String(value))
  }
  return result
}

// 获取默认配置
function getDefaultConfig(): PromptConfig {
  const defaultTemplates: PromptTemplate[] = DEFAULT_PROMPT_TEMPLATES.map(t => ({
    ...t,
    id: `default_${t.type}_${generateId()}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }))

  const activeTemplateIds: Record<string, string> = {}
  defaultTemplates.forEach(t => {
    if (t.isDefault) {
      activeTemplateIds[t.type] = t.id
    }
  })

  return {
    activeTemplateIds: activeTemplateIds as Record<PromptType, string>,
    customTemplates: defaultTemplates,
    lastModified: Date.now(),
  }
}

// 加载配置
export function loadPromptConfig(): PromptConfig {
  try {
    // 检查版本号，如果版本不匹配则重置配置
    const storedVersion = localStorage.getItem(PROMPT_CONFIG_VERSION_KEY)
    if (storedVersion !== CURRENT_CONFIG_VERSION) {
      console.log(`提示词配置版本更新: ${storedVersion} -> ${CURRENT_CONFIG_VERSION}，重置配置`)
      localStorage.setItem(PROMPT_CONFIG_VERSION_KEY, CURRENT_CONFIG_VERSION)
      const defaultConfig = getDefaultConfig()
      savePromptConfig(defaultConfig)
      return defaultConfig
    }

    const stored = localStorage.getItem(PROMPT_CONFIG_KEY)
    if (stored) {
      const config = JSON.parse(stored) as PromptConfig
      const defaultConfig = getDefaultConfig()

      // 清理无效的模板类型（类型定义中不存在的类型）
      const validTypes = Object.keys(PROMPT_TYPE_CONFIG) as PromptType[]
      const invalidTemplates = config.customTemplates.filter(
        t => !validTypes.includes(t.type)
      )
      if (invalidTemplates.length > 0) {
        console.log('清理无效模板类型:', invalidTemplates.map(t => t.type))
        config.customTemplates = config.customTemplates.filter(
          t => validTypes.includes(t.type)
        )
        // 清理无效的激活模板ID
        Object.keys(config.activeTemplateIds).forEach(type => {
          if (!validTypes.includes(type as PromptType)) {
            delete config.activeTemplateIds[type as PromptType]
          }
        })
      }

      // 确保所有类型都有默认模板
      const missingTypes = validTypes.filter(
        type => !config.activeTemplateIds[type]
      )

      if (missingTypes.length > 0) {
        missingTypes.forEach(type => {
          const defaultTemplate = defaultConfig.customTemplates.find(
            t => t.type === type && t.isDefault
          )
          if (defaultTemplate) {
            config.activeTemplateIds[type] = defaultTemplate.id
            config.customTemplates.push(defaultTemplate)
          }
        })
        savePromptConfig(config)
      }

      return config
    }
  } catch (error) {
    console.error('加载提示词配置失败:', error)
  }

  // 首次加载或出错时，设置版本号并返回默认配置
  localStorage.setItem(PROMPT_CONFIG_VERSION_KEY, CURRENT_CONFIG_VERSION)
  const defaultConfig = getDefaultConfig()
  savePromptConfig(defaultConfig)
  return defaultConfig
}

// 保存配置
export function savePromptConfig(config: PromptConfig): void {
  try {
    localStorage.setItem(
      PROMPT_CONFIG_KEY,
      JSON.stringify({
        ...config,
        lastModified: Date.now(),
      })
    )
  } catch (error) {
    console.error('保存提示词配置失败:', error)
  }
}

// 获取所有模板
export function getAllTemplates(): PromptTemplate[] {
  const config = loadPromptConfig()
  return config.customTemplates
}

// 获取指定类型的所有模板
export function getTemplatesByType(type: PromptType): PromptTemplate[] {
  const config = loadPromptConfig()
  return config.customTemplates.filter(t => t.type === type)
}

// 获取当前激活的模板
export function getActiveTemplate(type: PromptType): PromptTemplate | undefined {
  const config = loadPromptConfig()
  const templateId = config.activeTemplateIds[type]
  if (!templateId) return undefined

  return config.customTemplates.find(t => t.id === templateId)
}

// 获取当前激活模板的提示词内容（已替换变量）
export function getActivePrompt(
  type: PromptType,
  variables: Record<string, string | number>
): string {
  const template = getActiveTemplate(type)
  if (template) {
    return replaceVariables(template.content, variables)
  }

  const defaultTemplate = DEFAULT_PROMPT_TEMPLATES.find(t => t.type === type)
  if (defaultTemplate) {
    return replaceVariables(defaultTemplate.content, variables)
  }

  return ''
}

// 设置激活模板
export function setActiveTemplate(type: PromptType, templateId: string): void {
  const config = loadPromptConfig()
  const template = config.customTemplates.find(t => t.id === templateId)
  if (template && template.type === type) {
    config.activeTemplateIds[type] = templateId
    savePromptConfig(config)
  }
}

// 创建自定义模板
export function createTemplate(
  template: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>
): PromptTemplate {
  const config = loadPromptConfig()
  const newTemplate: PromptTemplate = {
    ...template,
    id: `custom_${template.type}_${generateId()}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  config.customTemplates.push(newTemplate)
  savePromptConfig(config)

  return newTemplate
}

// 更新模板
export function updateTemplate(
  templateId: string,
  updates: Partial<Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>>
): PromptTemplate | undefined {
  const config = loadPromptConfig()
  const index = config.customTemplates.findIndex(t => t.id === templateId)

  if (index === -1) {
    console.error('Template not found:', templateId)
    console.error('Available templates:', config.customTemplates.map(t => ({ id: t.id, name: t.name, type: t.type })))
    return undefined
  }

  // 预置模板不能修改 isPreset 和 type
  const template = config.customTemplates[index]
  if (template?.isPreset) {
    const { isPreset: _, type: __, ...restUpdates } = updates as Partial<PromptTemplate>
    updates = restUpdates
  }

  config.customTemplates[index] = {
    ...template,
    ...updates,
    updatedAt: Date.now(),
  } as PromptTemplate

  savePromptConfig(config)
  console.log('Template updated:', config.customTemplates[index])
  return config.customTemplates[index]
}

// 删除模板
export function deleteTemplate(templateId: string): boolean {
  const config = loadPromptConfig()
  const template = config.customTemplates.find(t => t.id === templateId)

  // 预置模板不能删除
  if (template?.isPreset) {
    return false
  }

  const index = config.customTemplates.findIndex(t => t.id === templateId)
  if (index === -1) return false

  config.customTemplates.splice(index, 1)

  // 如果删除的是当前激活的模板，切换到该类型的默认模板
  const type = template?.type
  if (type && config.activeTemplateIds[type] === templateId) {
    const defaultTemplate = config.customTemplates.find(t => t.type === type && t.isDefault)
    if (defaultTemplate) {
      config.activeTemplateIds[type] = defaultTemplate.id
    } else {
      delete config.activeTemplateIds[type]
    }
  }

  savePromptConfig(config)
  return true
}

// 重置为默认配置
export function resetToDefault(): void {
  const defaultConfig = getDefaultConfig()
  savePromptConfig(defaultConfig)
}

// 导入预设包
export function importPreset(preset: PromptPreset): void {
  const config = loadPromptConfig()

  preset.templates.forEach(template => {
    // 检查是否已存在同名同类型模板
    const existingIndex = config.customTemplates.findIndex(
      t => t.name === template.name && t.type === template.type && t.isPreset
    )

    const existingTemplate = existingIndex >= 0 ? config.customTemplates[existingIndex] : undefined
    const newTemplate: PromptTemplate = {
      ...template,
      id: existingTemplate?.id ?? `preset_${template.type}_${generateId()}`,
      createdAt: existingTemplate?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      isPreset: true,
    }

    if (existingIndex >= 0) {
      config.customTemplates[existingIndex] = newTemplate
    } else {
      config.customTemplates.push(newTemplate)
    }
  })

  savePromptConfig(config)
}

// 获取所有预设包
export function getAllPresets(): PromptPreset[] {
  return POPULAR_PROMPT_PRESETS
}

// 验证模板内容
export function validateTemplate(
  content: string,
  variables: string[]
): { valid: boolean; error?: string } {
  if (!content.trim()) {
    return { valid: false, error: '模板内容不能为空' }
  }

  // 检查变量格式是否正确
  const variableRegex = /{{\s*[\w]+\s*}}/g
  const usedVariables = content.match(variableRegex) || []

  // 提取变量名
  const usedVarNames = usedVariables.map(v => v.replace(/[{}\s]/g, ''))

  // 检查是否有未定义的变量
  const undefinedVars = usedVarNames.filter(v => !variables.includes(v))
  if (undefinedVars.length > 0) {
    return {
      valid: false,
      error: `使用了未定义的变量: ${undefinedVars.join(', ')}`,
    }
  }

  return { valid: true }
}

// 导出配置为JSON
export function exportConfig(): string {
  const config = loadPromptConfig()
  return JSON.stringify(config, null, 2)
}

// 从JSON导入配置
export function importConfig(jsonString: string): { success: boolean; error?: string } {
  try {
    const config = JSON.parse(jsonString) as PromptConfig

    // 验证配置结构
    if (!config.customTemplates || !Array.isArray(config.customTemplates)) {
      return { success: false, error: '无效的模板配置' }
    }

    if (!config.activeTemplateIds || typeof config.activeTemplateIds !== 'object') {
      return { success: false, error: '无效的激活模板配置' }
    }

    // 添加时间戳
    config.lastModified = Date.now()
    savePromptConfig(config)

    return { success: true }
  } catch (error) {
    return { success: false, error: 'JSON解析失败: ' + (error as Error).message }
  }
}

// 复制模板
export function duplicateTemplate(templateId: string): PromptTemplate | undefined {
  const config = loadPromptConfig()
  const template = config.customTemplates.find(t => t.id === templateId)

  if (!template) return undefined

  const newTemplate: PromptTemplate = {
    ...template,
    id: `custom_${template.type}_${generateId()}`,
    name: `${template.name} (复制)`,
    isDefault: false,
    isPreset: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  config.customTemplates.push(newTemplate)
  savePromptConfig(config)

  return newTemplate
}
