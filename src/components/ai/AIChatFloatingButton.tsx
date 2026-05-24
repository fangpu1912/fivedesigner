import { useState, useRef, useEffect, useCallback } from 'react'
import { MessageCircle, X, Send, Minimize2, GripHorizontal, Wrench, Loader2, CheckCircle, XCircle, Trash2, ImagePlus } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { AgentOrchestrator } from '@/services/agent/agentOrchestrator'
import { builtInTools } from '@/services/agent/builtInTools'
import { bridgeEvents } from '@/plugins/storyboard-copilot/bridge/bridgeEvents'
import type { AgentMessage, AgentToolResult } from '@/services/agent/agentTools'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result'
  content: string
  timestamp: number
  toolName?: string
  toolResult?: AgentToolResult
  isExecuting?: boolean
}

const CHAT_HISTORY_KEY = 'ai_chat_history'
const MAX_HISTORY_MESSAGES = 200

function loadChatHistory(): ChatMessage[] {
  try {
    const stored = localStorage.getItem(CHAT_HISTORY_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // 忽略解析错误
  }
  return []
}

function saveChatHistory(messages: ChatMessage[]) {
  try {
    // 只保留最近的消息，避免 localStorage 溢出
    const trimmed = messages.slice(-MAX_HISTORY_MESSAGES)
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(trimmed))
  } catch {
    // 忽略保存错误（可能是存储空间不足）
  }
}

/**
 * 从 Markdown 内容中提取媒体 URL（图片、视频、音频）
 */
function extractMediaUrls(content: string): Array<{ url: string; type: 'image' | 'video' | 'audio' }> {
  const results: Array<{ url: string; type: 'image' | 'video' | 'audio' }> = []

  // 提取图片 ![alt](url)
  const imageRegex = /!\[.*?\]\((.*?)\)/g
  let match
  while ((match = imageRegex.exec(content)) !== null) {
    if (match[1]) {
      results.push({ url: match[1], type: 'image' })
    }
  }

  // 提取视频链接 [视频](url)
  const videoRegex = /\[.*?视频.*?\]\((.*?)\)/gi
  while ((match = videoRegex.exec(content)) !== null) {
    if (match[1]) {
      results.push({ url: match[1], type: 'video' })
    }
  }

  // 提取音频链接 [音频](url) 或 [配音](url)
  const audioRegex = /\[.*?(音频|配音|语音).*?\]\((.*?)\)/gi
  while ((match = audioRegex.exec(content)) !== null) {
    if (match[2]) {
      results.push({ url: match[2], type: 'audio' })
    }
  }

  return results
}

/**
 * 发送媒体到画布
 */
function sendMediaToCanvas(url: string, type: 'image' | 'video' | 'audio') {
  const labelMap = { image: 'AI 生成图片', video: 'AI 生成视频', audio: 'AI 生成音频' }
  bridgeEvents.emit('canvas:node-added', {
    type,
    data: {
      url,
      label: labelMap[type],
    },
  })
}

export function AIChatFloatingButton() {
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>(loadChatHistory)
  const [input, setInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [position, setPosition] = useState({ x: window.innerWidth - 80, y: window.innerHeight - 120 })
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)
  const chatRef = useRef<HTMLDivElement>(null)
  const orchestratorRef = useRef<AgentOrchestrator | null>(null)
  const agentMessagesRef = useRef<AgentMessage[]>([])
  const messagesRef = useRef<ChatMessage[]>([])

  // 同步 messages 到 ref，用于持久化
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // 组件卸载时保存聊天记录
  useEffect(() => {
    return () => {
      saveChatHistory(messagesRef.current)
    }
  }, [])

  // 定期保存聊天记录（每 10 秒）
  useEffect(() => {
    const interval = setInterval(() => {
      saveChatHistory(messagesRef.current)
    }, 10000)
    return () => clearInterval(interval)
  }, [])

    useEffect(() => {
    const orchestrator = new AgentOrchestrator(builtInTools, {
      onMessage: (msg: AgentMessage) => {
        const chatMsg: ChatMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          role: msg.role === 'tool_result' ? 'tool_result' : msg.toolCall ? 'tool_call' : msg.role === 'system' ? 'assistant' : msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          toolName: msg.toolName,
          toolResult: msg.toolResult,
        }
        setMessages(prev => [...prev, chatMsg])
      },
      onToolExecuting: (toolName: string) => {
        setMessages(prev =>
          prev.map(msg =>
            msg.role === 'tool_call' && msg.toolName === toolName && msg.isExecuting === undefined
              ? { ...msg, isExecuting: true }
              : msg
          )
        )
      },
      onToolResult: (toolName: string, _result: AgentToolResult) => {
        setMessages(prev =>
          prev.map(msg =>
            msg.role === 'tool_call' && msg.toolName === toolName
              ? { ...msg, isExecuting: false }
              : msg
          )
        )
      },
      onError: (error: string) => {
        const errorMsg: ChatMessage = {
          id: `error_${Date.now()}`,
          role: 'assistant',
          content: `错误: ${error}`,
          timestamp: Date.now(),
        }
        setMessages(prev => [...prev, errorMsg])
      },
    })
    orchestratorRef.current = orchestrator

    return () => {
      orchestrator.abort()
    }
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.chat-content')) return
    e.preventDefault()
    setIsDragging(true)
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: position.x,
      startPosY: position.y,
    }
  }, [position])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !dragRef.current) return
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      const newX = Math.max(0, Math.min(window.innerWidth - 60, dragRef.current.startPosX + dx))
      const newY = Math.max(0, Math.min(window.innerHeight - 60, dragRef.current.startPosY + dy))
      setPosition({ x: newX, y: newY })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      dragRef.current = null
    }

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return

    const userInput = input.trim()
    setInput('')
    setIsProcessing(true)

    try {
      const result = await orchestratorRef.current?.run(userInput, agentMessagesRef.current)
      if (result) {
        agentMessagesRef.current = result
      }
    } catch (error) {
      const errorMsg: ChatMessage = {
        id: `error_${Date.now()}`,
        role: 'assistant',
        content: `抱歉，发生了错误：${error instanceof Error ? error.message : '未知错误'}`,
        timestamp: Date.now(),
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setIsProcessing(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!isOpen) {
    return (
      <div
        className="fixed z-50"
        style={{
          left: position.x,
          top: position.y,
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
        onMouseDown={handleMouseDown}
      >
        <Button
          variant="default"
          size="icon"
          className="h-14 w-14 rounded-full shadow-2xl bg-primary hover:bg-primary/90"
          onClick={() => setIsOpen(true)}
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      </div>
    )
  }

  if (isMinimized) {
    return (
      <div
        className="fixed z-50 flex flex-col items-end gap-2"
        style={{
          left: position.x,
          top: position.y,
        }}
        onMouseDown={handleMouseDown}
      >
        <Button
          variant="default"
          size="icon"
          className="h-12 w-12 rounded-full shadow-2xl bg-primary hover:bg-primary/90"
          onClick={() => setIsMinimized(false)}
        >
          <MessageCircle className="h-5 w-5" />
        </Button>
      </div>
    )
  }

  return (
    <div
      ref={chatRef}
      className="fixed z-50 bg-background border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      style={{
        right: Math.min(window.innerWidth - position.x - 60, window.innerWidth - 420),
        top: Math.min(position.y, window.innerHeight - 600),
        width: 420,
        height: 600,
        maxHeight: '85vh',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b bg-muted/50 cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold text-sm">AI 助手</span>
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Agent</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              if (confirm('确定要清空聊天记录吗？')) {
                setMessages([])
                localStorage.removeItem(CHAT_HISTORY_KEY)
              }
            }}
            title="清空聊天记录"
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsMinimized(true)}
          >
            <Minimize2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4 chat-content">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <MessageCircle className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">开始和 AI 助手对话吧</p>
            <p className="text-xs mt-1">我可以帮你生成图片、视频、配音，或查询项目信息</p>
            <div className="mt-4 space-y-1.5 text-xs">
              <p className="text-muted-foreground/70">试试说：</p>
              <p className="text-muted-foreground/50">"帮我生成一张日落海滩的图片"</p>
              <p className="text-muted-foreground/50">"查看当前项目的角色列表"</p>
              <p className="text-muted-foreground/50">"分析这张图片的内容"</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map(message => (
              <div
                key={message.id}
                className={cn(
                  'flex',
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[90%] rounded-2xl px-4 py-2.5 text-sm',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : message.role === 'tool_call'
                      ? 'bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-bl-md'
                      : message.role === 'tool_result'
                      ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-bl-md'
                      : 'bg-muted rounded-bl-md'
                  )}
                >
                  {message.role === 'tool_call' && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <Wrench className="h-3 w-3 text-blue-500" />
                      <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                        {message.toolName}
                      </span>
                      {message.isExecuting && (
                        <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                      )}
                    </div>
                  )}
                  {message.role === 'tool_result' && (
                    <div className="flex items-center gap-1.5 mb-1">
                      {message.toolResult?.success ? (
                        <CheckCircle className="h-3 w-3 text-green-500" />
                      ) : (
                        <XCircle className="h-3 w-3 text-red-500" />
                      )}
                      <span className="text-xs font-medium text-green-600 dark:text-green-400">
                        {message.toolName} 结果
                      </span>
                    </div>
                  )}
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        img: ({ node, ...props }) => (
                          <img
                            {...props}
                            className="rounded-lg max-w-full h-auto mt-2"
                            style={{ maxHeight: '300px' }}
                            alt={props.alt || '图片'}
                          />
                        ),
                        a: ({ node, ...props }) => (
                          <a
                            {...props}
                            className="text-primary hover:underline"
                            target="_blank"
                            rel="noopener noreferrer"
                          />
                        ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                  {/* 发送到画布按钮 */}
                  {message.role === 'assistant' && extractMediaUrls(message.content).length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {extractMediaUrls(message.content).map((item, idx) => (
                        <Button
                          key={idx}
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => sendMediaToCanvas(item.url, item.type)}
                        >
                          <ImagePlus className="h-3 w-3 mr-1" />
                          发送{item.type === 'image' ? '图片' : item.type === 'video' ? '视频' : '音频'}到画布
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isProcessing && messages[messages.length - 1]?.role !== 'tool_call' && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-2.5">
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t bg-muted/30">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='输入消息，如"生成一张图片"...'
            className="min-h-[44px] max-h-[120px] resize-none chat-content"
            disabled={isProcessing}
          />
          <Button
            size="icon"
            className="h-11 w-11 shrink-0"
            onClick={handleSend}
            disabled={!input.trim() || isProcessing}
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
