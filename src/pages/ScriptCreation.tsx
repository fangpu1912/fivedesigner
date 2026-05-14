import React, { useState, useCallback, useEffect, useRef } from 'react'

import { type Editor } from '@tiptap/react'
import { confirm, save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'
import {
  MessageSquare,
  Send,
  ChevronLeft,
  ChevronRight,
  Save,
  Sparkles,
  User,
  Bot,
  Copy,
  List,
  GripVertical,
  FileText,
  Users,
  MapPin,
  Plus,
  RefreshCw,
  Film,
  Package,
  Eye,
  EyeOff,
  Trash2,
  Download,
} from 'lucide-react'

import { RichTextEditor } from '@/components/editor'
import { MarkdownPreview } from '@/components/editor/MarkdownPreview'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import { AI } from '@/services/vendor'
import { getEnabledAIConfigsWithSecrets } from '@/services/configService'
import { getActivePrompt } from '@/services/promptConfigService'
import { useUIStore } from '@/store/useUIStore'
import { useEpisodeQuery } from '@/hooks/useEpisodes'
import { useScriptQuery, useUpdateScriptMutation, useCreateScriptMutation } from '@/hooks/useScript'
import { useCharacters } from '@/hooks/useCharacters'
import { useScenes } from '@/hooks/useAssetManager'
import { useProps } from '@/hooks/useAssetManager'
import { useStoryboardMutations, useStoryboards } from '@/hooks/useStoryboards'
import { useDubbingByEpisode } from '@/hooks/useDubbing'
import { useNovelPipeline } from '@/hooks/useNovelPipeline'
import { useAutoPipeline } from '@/hooks/useAutoPipeline'
import { AutoPipelinePanel } from '@/components/ai/AutoPipelinePanel'

interface OutlineItem {
  id: string
  level: number
  text: string
  position: number
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface AIAgentMessage extends Message {
  promptForImage?: string
  promptForVideo?: string
}

export const ScriptCreation: React.FC = () => {
  const { currentEpisodeId } = useUIStore()
  const { toast } = useToast()
  const { data: episode } = useEpisodeQuery(currentEpisodeId || '')
  const { data: script } = useScriptQuery(currentEpisodeId || '')
  const { data: dbCharacters = [] } = useCharacters(episode?.project_id || '')
  const storyboardMutations = useStoryboardMutations()
  const { data: dbStoryboards = [] } = useStoryboards(currentEpisodeId || '')
  const { data: dbScenes = [] } = useScenes(episode?.project_id || '', currentEpisodeId || '')
  const { data: dbProps = [] } = useProps(episode?.project_id || '', currentEpisodeId || '')
  const { data: dbDubbing = [] } = useDubbingByEpisode(currentEpisodeId || '')
  const novelPipeline = useNovelPipeline()
  const autoPipeline = useAutoPipeline()
  const updateScriptMutation = useUpdateScriptMutation()
  const createScriptMutation = useCreateScriptMutation()
  const resetEpisodeScopedState = useCallback(() => {
    setContent('')
    setTitle('未命名脚本')
    setScriptId(null)
    setLastSaved(null)
    setMessages([])
    setInputMessage('')
    setOutline([])
  }, [])

  const [aiConfigsWithSecrets, setAiConfigsWithSecrets] = useState<
    Awaited<ReturnType<typeof getEnabledAIConfigsWithSecrets>>
  >([])

  const [content, setContent] = useState<string>('')
  const [title, setTitle] = useState<string>('未命名脚本')
  const [scriptId, setScriptId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  const [aiPanelOpen, setAiPanelOpen] = useState(true)
  const [messages, setMessages] = useState<AIAgentMessage[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

  const [outline, setOutline] = useState<OutlineItem[]>([])

  const [activeTab, setActiveTab] = useState<'outline' | 'assets' | 'shots' | 'dubbing'>('outline')
  const [editorTab, setEditorTab] = useState<'script' | 'storyboard'>('script')
  const [showPreview, setShowPreview] = useState(false)

  const editorRef = useRef<Editor | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!currentEpisodeId) {
      resetEpisodeScopedState()
      return
    }

    resetEpisodeScopedState()

    if (episode) {
      setTitle(episode.name || '未命名脚本')
    }

    if (script) {
      setScriptId(script.id)
      setContent(script.content)
      setTitle(script.title)
    }
  }, [currentEpisodeId, episode?.id, script?.id, resetEpisodeScopedState])

  useEffect(() => {
    const loadAIConfigs = async () => {
      try {
        const configs = await getEnabledAIConfigsWithSecrets()
        setAiConfigsWithSecrets(configs)
      } catch (error) {
        console.error('Failed to load AI configs:', error)
      }
    }
    loadAIConfigs()
  }, [])

  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(() => {
      handleAutoSave()
    }, 2000)

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [content, title])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    extractOutline()
  }, [content])

  const handleAutoSave = async () => {
    if (!currentEpisodeId || !content) return

    setIsSaving(true)
    try {
      if (scriptId) {
        await updateScriptMutation.mutateAsync({ id: scriptId, data: { content, title } })
      } else {
        const newScript = await createScriptMutation.mutateAsync({
          episode_id: currentEpisodeId,
          title,
          content,
        })
        setScriptId(newScript.id)
      }
      setLastSaved(new Date())
    } catch (error) {
      console.error('Auto save failed:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleManualSave = async () => {
    await handleAutoSave()
    toast({
      title: '保存成功',
      description: '脚本已保存',
    })
  }

  const extractOutline = useCallback(() => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(content, 'text/html')
    const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6')

    const items: OutlineItem[] = []
    headings.forEach((heading, index) => {
      const level = parseInt(heading.tagName.charAt(1))
      items.push({
        id: `outline-${index}`,
        level,
        text: heading.textContent || '',
        position: index,
      })
    })

    setOutline(items)
  }, [content])

  const scrollToHeading = (position: number) => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(content, 'text/html')
    const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6')

    if (headings[position]) {
      const headingText = headings[position].textContent
      const editorElement = document.querySelector('.ProseMirror')
      if (editorElement && headingText) {
        const allHeadings = editorElement.querySelectorAll('h1, h2, h3, h4, h5, h6')
        allHeadings.forEach(h => {
          if (h.textContent === headingText) {
            h.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        })
      }
    }
  }

  const handleExportImagePrompts = async () => {
    const prompts: string[] = []
    
    if (dbCharacters.length > 0) {
      prompts.push('========== 角色提示词 ==========')
      dbCharacters.forEach(char => {
        if (char.prompt) {
          prompts.push(`【${char.name}】${char.prompt}`)
        }
      })
    }
    
    if (dbScenes.length > 0) {
      prompts.push('========== 场景提示词 ==========')
      dbScenes.forEach(scene => {
        if (scene.prompt) {
          prompts.push(`【${scene.name}】${scene.prompt}`)
        }
      })
    }
    
    if (dbProps.length > 0) {
      prompts.push('========== 道具提示词 ==========')
      dbProps.forEach(prop => {
        if (prop.prompt) {
          prompts.push(`【${prop.name}】${prop.prompt}`)
        }
      })
    }
    
    prompts.push('========== 分镜图片提示词 ==========')
    
    if (dbStoryboards.length > 0) {
      dbStoryboards
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .forEach((sb, idx) => {
          if (sb.prompt) {
            prompts.push(`【分镜 ${idx + 1}】${sb.prompt}`)
          }
        })
    }
    
    const content = prompts.join('\n')
    
    const savePath = await save({
      defaultPath: `图片提示词_${title}.txt`,
      filters: [
        { name: '文本文件', extensions: ['txt'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      title: '保存图片提示词',
    })
    
    if (!savePath) return
    
    const encoder = new TextEncoder()
    await writeFile(savePath, encoder.encode(content))
    
    toast({ title: '导出成功', description: `已保存到 ${savePath}` })
  }

  const handleExportVideoPrompts = async () => {
    const prompts: string[] = []
    
    prompts.push('========== 分镜视频提示词 ==========')
    
    if (dbStoryboards.length > 0) {
      dbStoryboards
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .forEach((sb, idx) => {
          if (sb.video_prompt) {
            prompts.push(`【分镜 ${idx + 1}】${sb.video_prompt}`)
          }
        })
    }
    
    const content = prompts.join('\n')
    
    const savePath = await save({
      defaultPath: `视频提示词_${title}.txt`,
      filters: [
        { name: '文本文件', extensions: ['txt'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      title: '保存视频提示词',
    })
    
    if (!savePath) return
    
    const encoder = new TextEncoder()
    await writeFile(savePath, encoder.encode(content))
    
    toast({ title: '导出成功', description: `已保存到 ${savePath}` })
  }

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isGenerating) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInputMessage('')
    setIsGenerating(true)

    try {
      let chatConfig = aiConfigsWithSecrets.find(c => c.type === 'chat' && c.apiKey)

      if (!chatConfig) {
        throw new Error('请先在设置中配置对话AI，或在下方直接输入API Key、地址和模型')
      }

      const systemPrompt = getActivePrompt('assistant_chat', {
        content: content.replace(/<[^>]*>/g, ' ').substring(0, 500),
        characters: dbCharacters
          .map(c => `- ${c.name}`)
          .join('\n'),
      })

      if (!systemPrompt) {
        throw new Error('未找到AI助手模板，请先在提示词设置中配置')
      }

      const response = await AI.Text.generate({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: inputMessage },
        ],
      })

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response || '抱歉，我没有理解您的问题。',
        timestamp: new Date(),
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `抱歉，发生了错误：${error instanceof Error ? error.message : '未知错误'}。请检查AI配置是否正确。`,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsGenerating(false)
    }
  }

  const insertToEditor = (text: string) => {
    if (editorRef.current) {
      editorRef.current.chain().focus().insertContent(text).run()
      toast({
        title: '已插入',
        description: '内容已插入到编辑器',
      })
    }
  }



  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* 左侧提取内容边栏 */}
      <div className="w-80 border-r bg-muted/20 flex flex-col">
        <div className="p-3 border-b bg-background">
          <div className="flex items-center gap-2 mb-3">
            <List className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">提取内容</span>
          </div>
          <div className="flex gap-1">
            <Button
              variant="default"
              size="sm"
              className="flex-1"
              onClick={() => novelPipeline.start(content)}
              disabled={novelPipeline.running || isGenerating || !content.trim()}
            >
              <Sparkles className="h-3 w-3 mr-2" />
              {novelPipeline.running ? '生成中...' : '一键生成分镜'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => autoPipeline.start(content)}
              disabled={autoPipeline.isRunning || isGenerating || !content.trim()}
            >
              <Film className="h-3 w-3 mr-2" />
              {autoPipeline.isRunning ? '流水线中...' : '全自动'}
            </Button>
          </div>

          <AutoPipelinePanel
            state={autoPipeline.state}
            isRunning={autoPipeline.isRunning}
            isWaitingForReview={autoPipeline.isWaitingForReview}
            onApprove={autoPipeline.approve}
            onCancel={autoPipeline.cancel}
          />

          {novelPipeline.running && novelPipeline.progress && (
            <div className="space-y-2 p-2 rounded bg-muted/50">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">
                  {novelPipeline.progress.stepName}
                </span>
                <span className="font-mono">{novelPipeline.progress.percent}%</span>
              </div>
              <Progress value={novelPipeline.progress.percent} className="h-1.5" />
              {novelPipeline.progress.sceneName && (
                <div className="text-xs text-muted-foreground">
                  场景 {novelPipeline.progress.currentScene}/{novelPipeline.progress.totalScenes}：{novelPipeline.progress.sceneName}
                </div>
              )}
              <Button
                variant="destructive"
                size="sm"
                className="w-full h-7 text-xs"
                onClick={novelPipeline.cancel}
              >
                取消生成
              </Button>
            </div>
          )}

          <Separator className="my-1" />

          <div className="flex gap-1">
            <Button
              variant={activeTab === 'outline' ? 'default' : 'ghost'}
              size="sm"
              className="flex-1 text-xs"
              onClick={() => setActiveTab('outline')}
            >
              大纲
            </Button>
            <Button
              variant={activeTab === 'assets' ? 'default' : 'ghost'}
              size="sm"
              className="flex-1 text-xs"
              onClick={() => setActiveTab('assets')}
            >
              资产
            </Button>
            <Button
              variant={activeTab === 'shots' ? 'default' : 'ghost'}
              size="sm"
              className="flex-1 text-xs"
              onClick={() => setActiveTab('shots')}
            >
              分镜
            </Button>
            <Button
              variant={activeTab === 'dubbing' ? 'default' : 'ghost'}
              size="sm"
              className="flex-1 text-xs"
              onClick={() => setActiveTab('dubbing')}
            >
              配音
            </Button>
          </div>
        </div>

        <div className="px-3 pb-2 space-y-1">
          <Button
            variant="outline"
            size="sm"
            className="w-full h-7 text-xs"
            onClick={handleExportImagePrompts}
            disabled={dbCharacters.length === 0 && dbScenes.length === 0 && dbProps.length === 0 && dbStoryboards.length === 0}
          >
            <Download className="h-3 w-3 mr-1" />
            导出图片提示词
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full h-7 text-xs"
            onClick={handleExportVideoPrompts}
            disabled={dbStoryboards.length === 0}
          >
            <Download className="h-3 w-3 mr-1" />
            导出视频提示词
          </Button>
        </div>

        <div className="flex-1 overflow-auto p-3">
          {activeTab === 'outline' && (
            <div className="space-y-1">
              {outline.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-8">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>暂无大纲</p>
                  <p className="text-xs mt-1">在编辑器中使用标题格式生成大纲</p>
                </div>
              ) : (
                outline.map((item, index) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 p-2 rounded hover:bg-accent cursor-pointer text-sm"
                    style={{ paddingLeft: `${item.level * 12}px` }}
                    onClick={() => scrollToHeading(index)}
                  >
                    <GripVertical className="h-3 w-3 text-muted-foreground" />
                    <span className="truncate">{item.text}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'assets' && (
            <div className="space-y-3">
              {dbCharacters.length === 0 && dbScenes.length === 0 && dbProps.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-8">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>暂无资产</p>
                  <p className="text-xs mt-1">点击"一键生成分镜"从脚本中提取</p>
                </div>
              ) : (
                <>
                  {dbCharacters.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                        <Users className="h-3 w-3" /> 角色 ({dbCharacters.length})
                      </h4>
                      <div className="space-y-2">
                        {dbCharacters.map((char) => (
                          <div key={char.id} className="p-2 rounded bg-background border text-sm">
                            <div className="font-medium flex items-center gap-2">
                              <Users className="h-3 w-3 text-blue-500" />
                              {char.name}
                            </div>
                            {char.description && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {char.description}
                              </div>
                            )}
                            {char.prompt && (
                              <div className="mt-2 p-1.5 bg-muted rounded text-xs">
                                <div className="text-muted-foreground mb-1">AI生图提示词:</div>
                                <div className="text-muted-foreground/80">
                                  {char.prompt}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {dbScenes.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> 场景 ({dbScenes.length})
                      </h4>
                      <div className="space-y-2">
                        {dbScenes.map((scene) => (
                          <div key={scene.id} className="p-2 rounded bg-background border text-sm">
                            <div className="font-medium flex items-center gap-2">
                              <MapPin className="h-3 w-3 text-green-500" />
                              {scene.name}
                            </div>
                            {scene.description && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {scene.description}
                              </div>
                            )}
                            {scene.prompt && (
                              <div className="mt-2 p-1.5 bg-muted rounded text-xs">
                                <div className="text-muted-foreground mb-1">AI生图提示词:</div>
                                <div className="text-muted-foreground/80">
                                  {scene.prompt}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {dbProps.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                        <Package className="h-3 w-3" /> 道具 ({dbProps.length})
                      </h4>
                      <div className="space-y-2">
                        {dbProps.map((prop) => (
                          <div key={prop.id} className="p-2 rounded bg-background border text-sm">
                            <div className="font-medium flex items-center gap-2">
                              <Package className="h-3 w-3 text-orange-500" />
                              {prop.name}
                            </div>
                            {prop.description && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {prop.description}
                              </div>
                            )}
                            {prop.prompt && (
                              <div className="mt-2 p-1.5 bg-muted rounded text-xs">
                                <div className="text-muted-foreground mb-1">AI生图提示词:</div>
                                <div className="text-muted-foreground/80">
                                  {prop.prompt}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'shots' && (
            <div className="space-y-2">
              {dbStoryboards.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-8">
                  <Film className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>暂无分镜</p>
                  <p className="text-xs mt-1">点击"一键生成分镜"从脚本中提取</p>
                </div>
              ) : (
                dbStoryboards
                  .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                  .map((sb, idx) => (
                    <div key={sb.id} className={`p-2 rounded border text-sm ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">分镜 {idx + 1}</span>
                        <div className="flex items-center gap-1">
                          <span className={cn(
                            'w-2 h-2 rounded-full',
                            sb.status === 'completed' ? 'bg-green-500' :
                            sb.status === 'generating' ? 'bg-blue-500' :
                            'bg-gray-400'
                          )} title={sb.status === 'completed' ? '完成' : sb.status === 'generating' ? '生成中' : '待处理'} />
                        </div>
                      </div>
                      
                      <div className="mt-2 space-y-2">
                        {sb.description && (
                          <div className="text-xs border-l-2 border-blue-400 pl-2">
                            {sb.description}
                          </div>
                        )}
                        
                        {sb.prompt && (
                          <div className="p-1.5 bg-green-50 rounded text-xs border border-green-200">
                            <div className="text-muted-foreground">
                              {sb.prompt}
                            </div>
                          </div>
                        )}
                        
                        {sb.video_prompt && (
                          <div className="p-1.5 bg-purple-50 rounded text-xs border border-purple-200">
                            <div className="text-muted-foreground">
                              {sb.video_prompt}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
              )}
            </div>
          )}

          {activeTab === 'dubbing' && (
            <div className="space-y-2">
              {dbDubbing.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-8">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>暂无配音内容</p>
                  <p className="text-xs mt-1">点击"一键生成分镜"从脚本中提取配音</p>
                </div>
              ) : (
                dbDubbing.map((dub) => (
                  <div key={dub.id} className="p-2 rounded bg-background border text-sm">
                    <div className="flex items-center gap-2">
                      <Users className="h-3 w-3 text-blue-500" />
                      <span className="font-medium">{dub.character_id || '未知角色'}</span>
                      {dub.emotion && (
                        <span className="text-xs px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded">
                          {dub.emotion}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm">&ldquo;{dub.text}&rdquo;</div>
                    {dub.audio_prompt && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span className="text-xs px-1.5 py-0.5 bg-muted rounded">
                          配音: {dub.audio_prompt}
                        </span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* 中间编辑器区域 */}
      <div className="flex flex-col min-w-0 flex-1 border-r">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
          <div className="flex items-center gap-4">
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="text-lg font-semibold border-none shadow-none focus-visible:ring-0 w-64"
              placeholder="脚本标题"
            />
            <div className="flex gap-1 bg-muted rounded-md p-0.5">
              <Button
                variant={editorTab === 'script' ? 'secondary' : 'ghost'}
                size="sm"
                className="text-xs h-7"
                onClick={() => setEditorTab('script')}
              >
                <FileText className="h-3 w-3 mr-1" />
                剧本
              </Button>
              <Button
                variant={editorTab === 'storyboard' ? 'secondary' : 'ghost'}
                size="sm"
                className="text-xs h-7"
                onClick={() => setEditorTab('storyboard')}
              >
                <Film className="h-3 w-3 mr-1" />
                分镜
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {lastSaved && (
              <span className="text-xs text-muted-foreground">
                上次保存: {lastSaved.toLocaleTimeString()}
              </span>
            )}
            {editorTab === 'script' && (
              <Button
                variant={showPreview ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
              >
                {showPreview ? (
                  <>
                    <EyeOff className="h-4 w-4 mr-2" />
                    编辑
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4 mr-2" />
                    预览
                  </>
                )}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleManualSave} disabled={isSaving}>
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? '保存中...' : '保存'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAiPanelOpen(!aiPanelOpen)}>
              {aiPanelOpen ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
              <MessageSquare className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {editorTab === 'script' ? (
            <div className="h-full p-4">
              {showPreview ? (
                <div className="h-full rounded-md border border-input bg-background">
                  <MarkdownPreview content={content} className="h-full" />
                </div>
              ) : (
                <RichTextEditor
                  content={content}
                  onChange={setContent}
                  placeholder="开始创作你的脚本..."
                  minHeight={200}
                  maxHeight={undefined}
                  showCharacterCount={true}
                  className="h-full"
                />
              )}
            </div>
          ) : (
            <div className="h-full overflow-auto p-4 space-y-2">
              {dbStoryboards.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Film className="h-12 w-12 mb-4 opacity-50" />
                  <p>暂无分镜</p>
                  <p className="text-sm mt-1">使用左侧"一键生成分镜"从剧本中提取</p>
                </div>
              ) : (
                dbStoryboards
                  .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                  .map((sb, idx) => (
                    <div key={sb.id} className={`p-2 rounded border text-sm ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">分镜 {idx + 1}</span>
                        <div className="flex items-center gap-1">
                          <span className={cn(
                            'w-2 h-2 rounded-full',
                            sb.status === 'completed' ? 'bg-green-500' :
                            sb.status === 'generating' ? 'bg-blue-500' :
                            'bg-gray-400'
                          )} title={sb.status === 'completed' ? '完成' : sb.status === 'generating' ? '生成中' : '待处理'} />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={async () => {
                              const confirmed = await confirm('确定要删除这个分镜吗？', {
                                title: '删除确认',
                                kind: 'warning',
                                okLabel: '确定',
                                cancelLabel: '取消',
                              })
                              if (confirmed) {
                                storyboardMutations.deleteStoryboard.mutate(sb.id)
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="mt-2 space-y-2">
                        <Textarea
                          key={`${sb.id}-description`}
                          defaultValue={sb.description || ''}
                          onBlur={e => {
                            const val = e.target.value
                            if (val !== (sb.description || '')) {
                              storyboardMutations.updateStoryboard.mutate({
                                id: sb.id,
                                data: { description: val },
                              })
                            }
                          }}
                          placeholder="画面描述..."
                          rows={2}
                          className="text-xs border-blue-200 focus-visible:ring-blue-400"
                        />
                        
                        <Textarea
                          key={`${sb.id}-prompt`}
                          defaultValue={sb.prompt || ''}
                          onBlur={e => {
                            const val = e.target.value
                            if (val !== (sb.prompt || '')) {
                              storyboardMutations.updateStoryboard.mutate({
                                id: sb.id,
                                data: { prompt: val },
                              })
                            }
                          }}
                          placeholder="生图提示词..."
                          rows={2}
                          className="text-xs border-green-200 focus-visible:ring-green-400 bg-green-50"
                        />
                        
                        <Textarea
                          key={`${sb.id}-video-prompt`}
                          defaultValue={sb.video_prompt || ''}
                          onBlur={e => {
                            const val = e.target.value
                            if (val !== (sb.video_prompt || '')) {
                              storyboardMutations.updateStoryboard.mutate({
                                id: sb.id,
                                data: { video_prompt: val },
                              })
                            }
                          }}
                          placeholder="视频提示词..."
                          rows={2}
                          className="text-xs border-purple-200 focus-visible:ring-purple-400 bg-purple-50"
                        />
                      </div>
                    </div>
                  ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* 右侧AI助手边栏 */}
      <div
        className={cn(
          'border-l bg-background transition-all duration-300 flex flex-col',
          aiPanelOpen ? 'w-80' : 'w-0 overflow-hidden'
        )}
      >
        <div className="border-t flex-1 flex flex-col min-h-0">
          <div className="p-3 border-b bg-muted/30">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">AI 助手</span>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-8">
                <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>AI 助手可以帮助你</p>
              </div>
            )}

            {messages.map(message => (
              <div
                key={message.id}
                className={cn(
                  'flex gap-2',
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {message.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Bot className="h-3 w-3 text-primary" />
                  </div>
                )}
                <div
                  className={cn(
                    'max-w-[80%] rounded-lg px-3 py-2 text-sm',
                    message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  )}
                >
                  <div className="whitespace-pre-wrap">{message.content}</div>
                  {message.role === 'assistant' && (
                    <div className="flex gap-1 mt-2 pt-2 border-t border-border/50">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                          navigator.clipboard.writeText(message.content)
                          toast({ title: '已复制' })
                        }}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        复制
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => insertToEditor(message.content)}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        插入
                      </Button>
                    </div>
                  )}
                </div>
                {message.role === 'user' && (
                  <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <User className="h-3 w-3 text-primary-foreground" />
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 border-t">
            <div className="flex gap-2">
              <Input
                value={inputMessage}
                onChange={e => setInputMessage(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage()
                  }
                }}
                placeholder="输入消息..."
                disabled={isGenerating}
                className="flex-1"
              />
              <Button
                size="icon"
                onClick={handleSendMessage}
                disabled={!inputMessage.trim() || isGenerating}
              >
                {isGenerating ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ScriptCreation
