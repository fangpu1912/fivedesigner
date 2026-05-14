export interface AgentTool {
  name: string
  description: string
  parameters: Record<string, AgentToolParameter>
  required?: string[]
  execute: (args: Record<string, unknown>) => Promise<AgentToolResult>
}

export interface AgentToolParameter {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description: string
  enum?: string[]
  items?: AgentToolParameter
}

export interface AgentToolResult {
  success: boolean
  data?: unknown
  error?: string
  display?: string
}

export interface AgentToolCall {
  name: string
  arguments: Record<string, unknown>
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool_result' | 'system'
  content: string
  toolCall?: AgentToolCall
  toolResult?: AgentToolResult
  toolName?: string
  timestamp: number
}

export function buildToolsPrompt(tools: AgentTool[]): string {
  const toolDescriptions = tools.map(tool => {
    const params = Object.entries(tool.parameters)
      .map(([key, param]) => {
        const required = tool.required?.includes(key) ? '(必填)' : '(可选)'
        const enumStr = param.enum ? `, 可选值: ${param.enum.join('/')}` : ''
        return `    - ${key}: ${param.type} ${required} — ${param.description}${enumStr}`
      })
      .join('\n')

    return `## ${tool.name}\n${tool.description}\n参数:\n${params}`
  }).join('\n\n')

  return `你可以使用以下工具来帮助用户完成任务。当你需要调用工具时，请严格按照以下 JSON 格式回复，不要包含任何其他文字：

{"tool_call": {"name": "工具名称", "arguments": {"参数名": "参数值"}}}

如果你不需要调用工具，直接用自然语言回复即可。

可用工具：

${toolDescriptions}

重要规则：
1. 每次只调用一个工具
2. 参数值必须是正确的类型
3. 调用工具后，我会把结果告诉你，你可以根据结果继续回复用户或再次调用工具
4. 如果用户的需求不明确，先询问澄清，不要猜测参数
5. 不要编造不存在的工具`
}

export function parseToolCall(text: string): AgentToolCall | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*"tool_call"[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])
    if (parsed.tool_call?.name && parsed.tool_call?.arguments) {
      return {
        name: parsed.tool_call.name,
        arguments: parsed.tool_call.arguments,
      }
    }
  } catch {}

  try {
    const parsed = JSON.parse(text.trim())
    if (parsed.tool_call?.name && parsed.tool_call?.arguments) {
      return {
        name: parsed.tool_call.name,
        arguments: parsed.tool_call.arguments,
      }
    }
  } catch {}

  return null
}
