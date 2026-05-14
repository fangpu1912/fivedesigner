/**
 * AI角色服务
 * 支持角色切换、系统提示词管理和多轮对话
 */

import { getRoleById } from '@/config/aiRoles'
import { AI } from '@/services/vendor'
import { useAIRoleStore } from '@/store/useAIRoleStore'

// 定义消息类型
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// 定义AI响应类型
export interface AIResponse {
  success: boolean
  content?: string
  text?: string
  error?: string
  assets?: {
    characters?: any[]
    scenes?: any[]
    props?: any[]
  }
  storyboards?: any[]
  dubbing?: any[]
}

export interface RoleBasedChatOptions {
  // 用户输入内容
  content: string
  // 指定角色ID（如果不指定则使用当前选中的角色）
  roleId?: string
  // 是否强制使用多轮输出
  forceMultiRound?: boolean
  // 多轮回调
  onRoundComplete?: (round: number, content: string) => void
  // 完成回调
  onComplete?: (fullResponse: AIResponse) => void
  // 错误回调
  onError?: (error: Error) => void
}

export class AIRoleService {
  constructor() {
    // 新的实现不需要传入 AIService 实例
  }

  /**
   * 基于角色的聊天
   * 先发送系统提示词，再发送用户内容
   * 支持多轮输出
   */
  async chatWithRole(options: RoleBasedChatOptions): Promise<AIResponse> {
    const {
      content,
      roleId,
      forceMultiRound = false,
      onRoundComplete,
      onComplete,
      onError,
    } = options

    // 获取角色store状态
    const roleStore = useAIRoleStore.getState()

    // 确定要使用的角色
    const targetRoleId = roleId || roleStore.selectedRoleId

    if (!targetRoleId) {
      // 没有指定角色，使用普通聊天
      const result = await AI.Text.generate(
        {
          messages: [{ role: 'user', content: content }],
          temperature: 0.7,
          maxTokens: 2048,
        },
        undefined,
        0
      )
      return {
        success: true,
        content: result,
        text: result,
      }
    }

    // 获取角色信息
    const role = getRoleById(targetRoleId)
    if (!role) {
      throw new Error(`未找到角色: ${targetRoleId}`)
    }

    // 构建消息列表
    const messages: ChatMessage[] = []

    // 1. 添加系统提示词
    const systemPrompt = roleStore.getCurrentSystemPrompt()
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt,
      })
    }

    // 2. 添加多轮输出提示词后缀（如果启用）
    const multiRoundSuffix = roleStore.getMultiRoundSuffix()
    let userContent = content

    if (roleStore.enableMultiRound && multiRoundSuffix) {
      userContent = `${content}\n\n${multiRoundSuffix}`
    }

    // 3. 添加用户消息
    messages.push({
      role: 'user',
      content: userContent,
    })

    // 重置多轮状态
    roleStore.resetMultiRoundState()
    roleStore.updateMultiRoundState({ isActive: true, currentRound: 1 })

    try {
      // 执行多轮对话
      const fullResponse = await this.executeMultiRoundChat(
        messages,
        roleStore.enableMultiRound || forceMultiRound,
        onRoundComplete,
        role.systemPrompt
      )

      // 更新最终状态
      roleStore.updateMultiRoundState({
        isActive: false,
        accumulatedContent: fullResponse.text,
      })

      onComplete?.(fullResponse)
      return fullResponse
    } catch (error) {
      roleStore.updateMultiRoundState({ isActive: false })
      const err = error instanceof Error ? error : new Error(String(error))
      onError?.(err)
      throw err
    }
  }

  /**
   * 执行多轮对话
   */
  private async executeMultiRoundChat(
    initialMessages: ChatMessage[],
    enableMultiRound: boolean,
    onRoundComplete?: (round: number, content: string) => void,
    _systemPrompt?: string
  ): Promise<AIResponse> {
    const roleStore = useAIRoleStore.getState()
    // 只保留初始的系统提示词和用户提示词
    const baseMessages = [...initialMessages]
    let fullResponse: AIResponse | null = null
    let round = 0
    const maxRounds = roleStore.multiRoundState.maxRounds

    while (round < maxRounds) {
      round++
      roleStore.updateMultiRoundState({ currentRound: round })

      console.log(`[AIRoleService] 第 ${round}/${maxRounds} 轮对话...`)

      // 构建本轮的提示词
      let currentPrompt: string
      if (round === 1) {
        // 第一轮：使用原始用户消息
        const userMessage = baseMessages.find(m => m.role === 'user')
        currentPrompt = userMessage?.content || ''
      } else {
        // 后续轮次：发送继续提示
        currentPrompt = `请继续输出剩余内容（第${round}轮）。注意：只输出新的内容，不要重复之前已经输出的内容。完成后添加 [END] 标记。`
      }

      // 发送请求
      const result = await AI.Text.generate(
        {
          messages: [
            ...baseMessages,
            { role: 'user', content: currentPrompt },
          ],
          temperature: 0.7,
          maxTokens: 2048,
        },
        undefined,
        0
      )

      if (!result) {
        console.warn('[AIRoleService] 第', round, '轮返回空结果')
        break
      }

      const responseText = result

      // 清理响应内容（移除标记）
      const cleanContent = responseText
        .replace(/\[CONTINUE\]/g, '')
        .replace(/\[END\]/g, '')
        .trim()

      // 合并响应
      if (!fullResponse) {
        fullResponse = {
          success: true,
          content: cleanContent,
          text: cleanContent,
        }
      } else {
        fullResponse.text += '\n\n' + cleanContent
        fullResponse.content = fullResponse.text
      }

      // 通知本轮完成
      onRoundComplete?.(round, cleanContent)

      // 检查是否需要继续
      const hasContinue = responseText.includes('[CONTINUE]')
      const hasEnd = responseText.includes('[END]')

      if (hasEnd || !hasContinue || !enableMultiRound) {
        console.log('[AIRoleService] 对话完成')
        break
      }

      roleStore.updateMultiRoundState({
        lastResponseHadContinue: true,
        accumulatedContent: fullResponse.text,
      })
    }

    return fullResponse || { success: false, content: '', text: '' }
  }

  /**
   * 继续多轮对话
   * 当用户点击"继续"时调用
   */
  async continueMultiRound(
    previousMessages: ChatMessage[],
    onRoundComplete?: (round: number, content: string) => void,
    systemPrompt?: string
  ): Promise<AIResponse> {
    const roleStore = useAIRoleStore.getState()

    if (!roleStore.multiRoundState.isActive) {
      throw new Error('没有活动的多轮对话')
    }

    const continuePrompt = roleStore.getContinuePrompt()
    const messages: ChatMessage[] = [...previousMessages, { role: 'user', content: continuePrompt }]

    return this.executeMultiRoundChat(messages, true, onRoundComplete, systemPrompt)
  }

  /**
   * 使用指定角色提取资产
   */
  async extractAssetsWithRole(
    script: string,
    roleId?: string,
    onProgress?: (round: number, totalRounds: number) => void
  ): Promise<AIResponse> {
    // 资产提取使用特定的角色或默认提示词
    const targetRoleId = roleId || 'asset-expert'

    return this.chatWithRole({
      content: `请从以下剧本中提取所有资产和台词：\n\n${script}`,
      roleId: targetRoleId,
      forceMultiRound: true,
      onRoundComplete: (round, _content) => {
        onProgress?.(round, 5)
      },
    })
  }

  /**
   * 使用指定角色生成分镜
   */
  async generateStoryboardsWithRole(
    script: string,
    roleId?: string,
    onProgress?: (round: number, totalRounds: number) => void
  ): Promise<AIResponse> {
    // 分镜生成使用分镜师角色
    const targetRoleId = roleId || 'storyboard-cinematographer'

    return this.chatWithRole({
      content: `请为以下剧本生成分镜：\n\n${script}`,
      roleId: targetRoleId,
      forceMultiRound: true,
      onRoundComplete: (round, _content) => {
        onProgress?.(round, 5)
      },
    })
  }

  /**
   * 使用指定角色生成剧本
   */
  async generateScriptWithRole(
    outline: string,
    roleId?: string,
    onProgress?: (round: number, totalRounds: number) => void
  ): Promise<AIResponse> {
    // 剧本生成使用剧本专家角色
    const targetRoleId = roleId || 'script-writer'

    return this.chatWithRole({
      content: `请根据以下大纲生成剧本：\n\n${outline}`,
      roleId: targetRoleId,
      forceMultiRound: true,
      onRoundComplete: (round, _content) => {
        onProgress?.(round, 5)
      },
    })
  }

  /**
   * 获取当前多轮对话状态
   */
  getMultiRoundStatus() {
    const roleStore = useAIRoleStore.getState()
    return {
      isActive: roleStore.multiRoundState.isActive,
      currentRound: roleStore.multiRoundState.currentRound,
      maxRounds: roleStore.multiRoundState.maxRounds,
      canContinue: roleStore.multiRoundState.currentRound < roleStore.multiRoundState.maxRounds,
    }
  }

  /**
   * 取消多轮对话
   */
  cancelMultiRound() {
    const roleStore = useAIRoleStore.getState()
    roleStore.resetMultiRoundState()
  }
}

// 导出单例创建函数
export function createAIRoleService(): AIRoleService {
  return new AIRoleService()
}
