import { AI } from '@/services/vendor/aiService'
import { getActivePrompt } from '@/services/promptConfigService'
import {
  type AgentTool,
  type AgentMessage,
  type AgentToolCall,
  type AgentToolResult,
  buildToolsPrompt,
  parseToolCall,
} from './agentTools'

const MAX_TOOL_ROUNDS = 5

export interface OrchestratorCallbacks {
  onMessage: (message: AgentMessage) => void
  onToolExecuting: (toolName: string) => void
  onToolResult: (toolName: string, result: AgentToolResult) => void
  onError: (error: string) => void
}

export class AgentOrchestrator {
  private tools: Map<string, AgentTool> = new Map()
  private callbacks: OrchestratorCallbacks
  private abortController = new AbortController()

  constructor(tools: AgentTool[], callbacks: OrchestratorCallbacks) {
    for (const tool of tools) {
      this.tools.set(tool.name, tool)
    }
    this.callbacks = callbacks
  }

  abort() {
    this.abortController.abort()
  }

  async run(userInput: string, history: AgentMessage[]): Promise<AgentMessage[]> {
    this.abortController = new AbortController()
    const messages: AgentMessage[] = [...history]

    const userMessage: AgentMessage = {
      role: 'user',
      content: userInput,
      timestamp: Date.now(),
    }
    messages.push(userMessage)
    this.callbacks.onMessage(userMessage)

    const systemPrompt = this.buildSystemPrompt()
    let round = 0

    while (round < MAX_TOOL_ROUNDS) {
      if (this.abortController.signal.aborted) break
      round++

      const llmMessages = this.buildLLMMessages(systemPrompt, messages)

      let response: string
      try {
        response = await AI.Text.generate({
          messages: llmMessages,
          temperature: 0.7,
          maxTokens: 4096,
        })
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        this.callbacks.onError(errMsg)
        const errorMessage: AgentMessage = {
          role: 'assistant',
          content: `抱歉，AI 服务出错：${errMsg}`,
          timestamp: Date.now(),
        }
        messages.push(errorMessage)
        return messages
      }

      const toolCall = parseToolCall(response)

      if (!toolCall) {
        const assistantMessage: AgentMessage = {
          role: 'assistant',
          content: response,
          timestamp: Date.now(),
        }
        messages.push(assistantMessage)
        this.callbacks.onMessage(assistantMessage)
        break
      }

      const toolCallMessage: AgentMessage = {
        role: 'assistant',
        content: `正在调用工具: ${toolCall.name}`,
        toolCall,
        toolName: toolCall.name,
        timestamp: Date.now(),
      }
      messages.push(toolCallMessage)
      this.callbacks.onMessage(toolCallMessage)

      const result = await this.executeTool(toolCall)

      const toolResultMessage: AgentMessage = {
        role: 'tool_result',
        content: result.display || (result.success ? JSON.stringify(result.data) : result.error || '执行失败'),
        toolResult: result,
        toolName: toolCall.name,
        timestamp: Date.now(),
      }
      messages.push(toolResultMessage)
      this.callbacks.onMessage(toolResultMessage)
    }

    if (round >= MAX_TOOL_ROUNDS) {
      const finalMessage: AgentMessage = {
        role: 'assistant',
        content: '已达到最大工具调用次数，如果还需要继续操作，请发送新的消息。',
        timestamp: Date.now(),
      }
      messages.push(finalMessage)
      this.callbacks.onMessage(finalMessage)
    }

    return messages
  }

  private async executeTool(toolCall: AgentToolCall): Promise<AgentToolResult> {
    const tool = this.tools.get(toolCall.name)
    if (!tool) {
      return { success: false, error: `未知工具: ${toolCall.name}` }
    }

    this.callbacks.onToolExecuting(toolCall.name)

    try {
      const result = await tool.execute(toolCall.arguments)
      this.callbacks.onToolResult(toolCall.name, result)
      return result
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      const result: AgentToolResult = { success: false, error: errMsg }
      this.callbacks.onToolResult(toolCall.name, result)
      return result
    }
  }

  private buildSystemPrompt(): string {
    const tools = Array.from(this.tools.values())
    const toolsPrompt = buildToolsPrompt(tools)

    let basePrompt = ''
    try {
      basePrompt = getActivePrompt('assistant_chat', {})
    } catch {}

    if (!basePrompt) {
      basePrompt = '你是 FiveDesigner 的 AI 创作助手，帮助用户完成影视创作相关的任务。'
    }

    return `${basePrompt}\n\n${toolsPrompt}`
  }

  private buildLLMMessages(systemPrompt: string, messages: AgentMessage[]): { role: string; content: string }[] {
    const result: { role: string; content: string }[] = [
      { role: 'system', content: systemPrompt },
    ]

    for (const msg of messages) {
      if (msg.role === 'user') {
        result.push({ role: 'user', content: msg.content })
      } else if (msg.role === 'assistant' && !msg.toolCall) {
        result.push({ role: 'assistant', content: msg.content })
      } else if (msg.role === 'assistant' && msg.toolCall) {
        result.push({ role: 'assistant', content: `我调用了工具 ${msg.toolCall.name}，参数: ${JSON.stringify(msg.toolCall.arguments)}` })
      } else if (msg.role === 'tool_result') {
        result.push({ role: 'user', content: `[工具 ${msg.toolName} 执行结果] ${msg.content}` })
      }
    }

    return result
  }
}
