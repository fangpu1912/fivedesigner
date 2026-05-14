import { useState, useCallback } from 'react'
import { Play, Loader2, AlertCircle, CheckCircle, MessageSquare, Bot, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/hooks/useToast'
import { replaceVariables } from '@/services/promptConfigService'
import { useTextGeneration } from '@/hooks/useVendorGeneration'
import { cn } from '@/lib/utils'
import type { PromptTemplate } from '@/types/prompt'

interface PromptTesterProps {
  template: PromptTemplate | null
}

interface TestMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

interface TestResult {
  success: boolean
  content?: string
  error?: string
  duration: number
  tokens?: {
    prompt: number
    completion: number
    total: number
  }
}

export function PromptTester({ template }: PromptTesterProps) {
  const { toast } = useToast()
  const textGeneration = useTextGeneration()
  const [variables, setVariables] = useState<Record<string, string>>({})
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [messages, setMessages] = useState<TestMessage[]>([])
  const [showMockResponse, setShowMockResponse] = useState(false)
  const [mockResponse, setMockResponse] = useState('')

  // 初始化变量
  const initializeVariables = useCallback(() => {
    if (!template) return
    const defaultVars: Record<string, string> = {}
    template.variables.forEach(v => {
      defaultVars[v] = variables[v] || getDefaultValue(v)
    })
    setVariables(defaultVars)
  }, [template])

  // 获取变量的默认值
  const getDefaultValue = (varName: string): string => {
    const defaults: Record<string, string> = {
      content: '这是一个示例剧本内容，描述了一个场景...',
      characterName: '小明',
      appearance: '银发蓝眼的少年，身穿白色衬衫',
      sceneDescription: '角色站在樱花树下，微风轻拂',
      shotDescription: '中景镜头，角色面向镜头微笑',
      characters: '[{"name":"小明","appearance":"银发少年"}]',
      scene: '{"name":"樱花庭院","description":"日式庭院"}',
      props: '[{"name":"折扇","description":"日式折扇"}]',
      name: '示例名称',
      description: '这是一个示例描述',
      maxLength: '4000',
    }
    return defaults[varName] || `[${varName}]`
  }

  // 运行测试
  const runTest = async () => {
    if (!template) return

    setIsTesting(true)
    setTestResult(null)

    const startTime = Date.now()

    try {
      // 替换变量
      const prompt = replaceVariables(template.content, variables)

      // 添加用户消息
      const userMessage: TestMessage = {
        role: 'user',
        content: prompt,
        timestamp: Date.now(),
      }
      setMessages(prev => [...prev, userMessage])

      // 检查是否使用模拟响应
      if (showMockResponse && mockResponse) {
        // 模拟延迟
        await new Promise(resolve => setTimeout(resolve, 1000))

        const assistantMessage: TestMessage = {
          role: 'assistant',
          content: mockResponse,
          timestamp: Date.now(),
        }
        setMessages(prev => [...prev, assistantMessage])

        setTestResult({
          success: true,
          content: mockResponse,
          duration: Date.now() - startTime,
          tokens: {
            prompt: Math.ceil(prompt.length / 4),
            completion: Math.ceil(mockResponse.length / 4),
            total: Math.ceil((prompt.length + mockResponse.length) / 4),
          },
        })
      } else {
        // 实际调用 AI
        const result = await textGeneration.mutateAsync({
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          maxTokens: 2000,
        })

        const responseText = result || ''

        const assistantMessage: TestMessage = {
          role: 'assistant',
          content: responseText,
          timestamp: Date.now(),
        }
        setMessages(prev => [...prev, assistantMessage])

        setTestResult({
          success: true,
          content: responseText,
          duration: Date.now() - startTime,
          tokens: {
            prompt: Math.ceil(prompt.length / 4),
            completion: Math.ceil(responseText.length / 4),
            total: Math.ceil((prompt.length + responseText.length) / 4),
          },
        })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '测试失败'

      const assistantMessage: TestMessage = {
        role: 'assistant',
        content: `错误: ${errorMessage}`,
        timestamp: Date.now(),
      }
      setMessages(prev => [...prev, assistantMessage])

      setTestResult({
        success: false,
        error: errorMessage,
        duration: Date.now() - startTime,
      })

      toast({
        title: '测试失败',
        description: errorMessage,
        variant: 'destructive',
      })
    } finally {
      setIsTesting(false)
    }
  }

  // 清空对话
  const clearMessages = () => {
    setMessages([])
    setTestResult(null)
  }

  if (!template) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>请选择一个模板进行测试</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 变量输入区域 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <User className="h-4 w-4" />
            变量输入
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {template.variables.length === 0 ? (
            <p className="text-sm text-muted-foreground">此模板不需要变量</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {template.variables.map(variable => (
                <div key={variable} className="space-y-1">
                  <label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Badge variant="outline" className="text-[10px] h-4">
                      {'{{'} {variable} {'}}'}
                    </Badge>
                  </label>
                  <Textarea
                    value={variables[variable] || ''}
                    onChange={e => setVariables(prev => ({ ...prev, [variable]: e.target.value }))}
                    placeholder={`输入 ${variable}`}
                    className="min-h-[60px] text-sm"
                  />
                </div>
              ))}
            </div>
          )}

          {/* 模拟响应设置 */}
          <div className="border rounded-md p-3 space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="mock-response"
                checked={showMockResponse}
                onChange={e => setShowMockResponse(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label htmlFor="mock-response" className="text-sm">
                使用模拟响应（不调用AI）
              </label>
            </div>
            {showMockResponse && (
              <Textarea
                value={mockResponse}
                onChange={e => setMockResponse(e.target.value)}
                placeholder="输入模拟的AI响应内容..."
                className="min-h-[100px] text-sm"
              />
            )}
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-2">
            <Button
              onClick={runTest}
              disabled={isTesting}
              className="flex-1"
            >
              {isTesting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  测试中...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  运行测试
                </>
              )}
            </Button>
            <Button variant="outline" onClick={clearMessages} disabled={messages.length === 0}>
              清空
            </Button>
            <Button variant="outline" onClick={initializeVariables}>
              重置变量
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 测试结果 */}
      {testResult && (
        <Card className={cn(testResult.success ? 'border-green-200' : 'border-red-200')}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              {testResult.success ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-500" />
              )}
              测试结果
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">状态:</span>
                <Badge
                  variant={testResult.success ? 'default' : 'destructive'}
                  className="ml-2"
                >
                  {testResult.success ? '成功' : '失败'}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">耗时:</span>
                <span className="ml-2">{testResult.duration}ms</span>
              </div>
              {testResult.tokens && (
                <div>
                  <span className="text-muted-foreground">Tokens:</span>
                  <span className="ml-2">{testResult.tokens.total}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 对话记录 */}
      {messages.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bot className="h-4 w-4" />
              对话记录
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={cn(
                      'flex gap-3',
                      message.role === 'user' ? 'flex-row' : 'flex-row-reverse'
                    )}
                  >
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                        message.role === 'user'
                          ? 'bg-blue-100 text-blue-600'
                          : message.role === 'system'
                          ? 'bg-red-100 text-red-600'
                          : 'bg-green-100 text-green-600'
                      )}
                    >
                      {message.role === 'user' ? (
                        <User className="h-4 w-4" />
                      ) : message.role === 'system' ? (
                        <AlertCircle className="h-4 w-4" />
                      ) : (
                        <Bot className="h-4 w-4" />
                      )}
                    </div>
                    <div
                      className={cn(
                        'rounded-lg p-3 max-w-[80%]',
                        message.role === 'user'
                          ? 'bg-muted'
                          : message.role === 'system'
                          ? 'bg-red-50 text-red-700'
                          : 'bg-green-50 text-green-700'
                      )}
                    >
                      <pre className="text-sm whitespace-pre-wrap font-mono">
                        {message.content}
                      </pre>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
