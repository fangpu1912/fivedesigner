/**
 * 灵感创作组件 - 自由发挥模式
 * 输入主题，AI 自由发挥生成完整的角色、场景、道具和分镜
 */

import { useState, useEffect } from 'react'
import { Sparkles, Loader2, Wand2, Save, AlertCircle, CheckCircle2, History, Trash2, ChevronRight, Clock, FileText, Video, Play } from 'lucide-react'
import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/hooks/useToast'
import { AI } from '@/services/vendor/aiService'
import { getActivePrompt } from '@/services/promptConfigService'
import { useUIStore } from '@/store/useUIStore'
import { useProjectQuery } from '@/hooks/useProjects'
import { useEpisodeQuery } from '@/hooks/useEpisodes'
import { useCharacterMutations, useCharactersByEpisode } from '@/hooks/useCharacters'
import { useSceneMutations, useScenesByEpisode } from '@/hooks/useAssetManager'
import { usePropMutations, usePropsByEpisode } from '@/hooks/useAssetManager'
import { useStoryboardMutations, useStoryboards } from '@/hooks/useStoryboards'
import { useDubbingMutations, useDubbingByEpisode } from '@/hooks/useDubbing'
import { cn } from '@/lib/utils'
import logger from '@/utils/logger'

interface GeneratedContent {
  characters: Array<{
    name: string
    description: string
    prompt: string
    staticViews?: string
    wardrobeVariants?: string
  }>
  scenes: Array<{
    name: string
    description: string
    prompt: string
  }>
  props: Array<{
    name: string
    description: string
    prompt: string
  }>
  storyboards: Array<{
    description: string
    prompt: string
    videoPrompt: string
    characters?: string[]
    props?: string[]
    camera?: string
    shotType?: string
    duration?: string
  }>
}

interface HistoryItem {
  id: string
  topic: string
  content: GeneratedContent
  createdAt: number
}

const HISTORY_KEY = 'fivedesigner_inspiration_history'

function normalizeStringArray(arr: unknown): string[] {
  if (!Array.isArray(arr)) return []
  return arr.map(item => {
    if (typeof item === 'string') return item
    if (typeof item === 'object' && item !== null) {
      const obj = item as Record<string, unknown>
      return String(obj.name || obj.character || obj.prop || JSON.stringify(item))
    }
    return String(item)
  })
}

function normalizeGeneratedContent(raw: Record<string, unknown>): GeneratedContent {
  return {
    characters: Array.isArray(raw.characters)
      ? raw.characters.map((c: unknown) => {
          if (typeof c === 'string') return { name: c, description: '', prompt: '' }
          const obj = c as Record<string, unknown>
          return {
            name: String(obj.name || ''),
            description: String(obj.description || ''),
            prompt: String(obj.prompt || obj.appearance_prompt || ''),
            staticViews: obj.staticViews ? String(obj.staticViews) : undefined,
            wardrobeVariants: obj.wardrobeVariants ? String(obj.wardrobeVariants) : undefined,
          }
        })
      : [],
    scenes: Array.isArray(raw.scenes)
      ? raw.scenes.map((s: unknown) => {
          if (typeof s === 'string') return { name: s, description: '', prompt: '' }
          const obj = s as Record<string, unknown>
          return {
            name: String(obj.name || ''),
            description: String(obj.description || ''),
            prompt: String(obj.prompt || obj.image_prompt || ''),
          }
        })
      : [],
    props: Array.isArray(raw.props)
      ? raw.props.map((p: unknown) => {
          if (typeof p === 'string') return { name: p, description: '', prompt: '' }
          const obj = p as Record<string, unknown>
          return {
            name: String(obj.name || ''),
            description: String(obj.description || ''),
            prompt: String(obj.prompt || ''),
          }
        })
      : [],
    storyboards: Array.isArray(raw.storyboards)
      ? raw.storyboards.map((sb: unknown) => {
          const obj = sb as Record<string, unknown>
          return {
            description: String(obj.description || ''),
            prompt: String(obj.prompt || obj.image_prompt || ''),
            videoPrompt: String(obj.videoPrompt || obj.video_prompt || ''),
            characters: normalizeStringArray(obj.characters),
            props: normalizeStringArray(obj.props),
            camera: obj.camera ? String(obj.camera) : undefined,
            shotType: obj.shotType || obj.shot_type ? String(obj.shotType || obj.shot_type) : undefined,
            duration: obj.duration ? String(obj.duration) : undefined,
          }
        })
      : [],
  }
}

function loadHistory(): HistoryItem[] {
  try {
    const stored = localStorage.getItem(HISTORY_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    console.error('加载历史记录失败:', error)
  }
  return []
}

function saveHistory(history: HistoryItem[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)))
  } catch (error) {
    console.error('保存历史记录失败:', error)
  }
}

export function InspirationCreator() {
  const { toast } = useToast()
  const [topic, setTopic] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null)
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [continueDirection, setContinueDirection] = useState('')
  const [continuing, setContinuing] = useState(false)

  // 获取当前项目和剧集
  const { currentProjectId, currentEpisodeId } = useUIStore()
  const { data: currentProject } = useProjectQuery(currentProjectId || '')
  const { data: currentEpisode } = useEpisodeQuery(currentEpisodeId || '')
  const characterMutations = useCharacterMutations()
  const sceneMutations = useSceneMutations()
  const propMutations = usePropMutations()
  const storyboardMutations = useStoryboardMutations()
  const dubbingMutations = useDubbingMutations(currentEpisodeId || undefined)
  const { data: existingCharacters = [] } = useCharactersByEpisode(currentEpisodeId || undefined)
  const { data: existingScenes = [] } = useScenesByEpisode(currentEpisodeId || undefined)
  const { data: existingProps = [] } = usePropsByEpisode(currentEpisodeId || undefined)
  const { data: existingStoryboards = [] } = useStoryboards(currentEpisodeId || '')
  const { data: existingDubbings = [] } = useDubbingByEpisode(currentEpisodeId || '')

  // 检查是否已选择项目和剧集
  const hasSelectedProjectAndEpisode = !!currentProjectId && !!currentEpisodeId

  // 加载历史记录
  useEffect(() => {
    setHistory(loadHistory())
  }, [])

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast({ title: '请输入主题', variant: 'destructive' })
      return
    }

    setGenerating(true)
    try {
      const prompt = getActivePrompt('inspiration_creation', { topic: topic.trim() })

      const response = await AI.Text.generate({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.9,
        maxTokens: 32768,
      })

      const text = typeof response === 'string' ? response : JSON.stringify(response)
      
      logger.debug('AI返回的原始文本长度:', text.length)
      
      // 尝试提取JSON
      let jsonStr = text
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        jsonStr = jsonMatch[0]
      }

      logger.debug('提取的JSON字符串长度:', jsonStr.length)

      // 检查JSON是否完整（是否以}结尾）
      const trimmedJson = jsonStr.trim()
      if (!trimmedJson.endsWith('}')) {
        logger.error('JSON被截断，最后100字符:', trimmedJson.slice(-100))
        throw new Error('AI生成的内容过长被截断。请尝试简化主题，或减少生成内容的复杂度。')
      }

      try {
        const raw = JSON.parse(jsonStr) as Record<string, unknown>
        const content = normalizeGeneratedContent(raw)
        setGeneratedContent(content)

        // 保存到历史记录
        const newItem: HistoryItem = {
          id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          topic: topic.trim(),
          content,
          createdAt: Date.now(),
        }
        const updatedHistory = [newItem, ...history]
        setHistory(updatedHistory)
        saveHistory(updatedHistory)

        toast({ title: '创作完成！' })
      } catch (parseError) {
        logger.error('JSON解析失败:', parseError)
        logger.error('问题JSON前500字符:', jsonStr.substring(0, 500))
        logger.error('问题JSON后500字符:', jsonStr.slice(-500))
        
        // 尝试修复常见的JSON格式问题
        let fixedJson = jsonStr
          // 修复未转义的引号（在字符串值内部）
          .replace(/"([^"]*)"(?=\s*:)/g, (match, key) => `"${key}"`) // 保留键名的引号
          .replace(/:(\s*)"([^"]*)"([^":,}\]]*)"([^"]*)"([^"]*)"/g, ': "$2$3\\"$4$5"') // 修复值中的引号
          // 修复多余的逗号
          .replace(/,\s*([\]}])/g, '$1')
          // 修复缺少引号的键名
          .replace(/(\w+)(?=\s*:)/g, '"$1"')
        
        logger.debug('尝试修复后的JSON前500字符:', fixedJson.substring(0, 500))
        
        try {
          const raw = JSON.parse(fixedJson) as Record<string, unknown>
          const content = normalizeGeneratedContent(raw)
          setGeneratedContent(content)

          const newItem: HistoryItem = {
            id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            topic: topic.trim(),
            content,
            createdAt: Date.now(),
          }
          const updatedHistory = [newItem, ...history]
          setHistory(updatedHistory)
          saveHistory(updatedHistory)

          toast({ title: '创作完成！' })
        } catch (fixError) {
          logger.error('JSON修复失败:', fixError)
          throw new Error('AI返回的数据格式错误。请尝试简化主题，或检查提示词设置。')
        }
      }
    } catch (error) {
      console.error('生成失败:', error)
      toast({
        title: '生成失败',
        description: (error as Error).message,
        variant: 'destructive',
      })
    } finally {
      setGenerating(false)
    }
  }

  const handleContinueStory = async () => {
    if (!generatedContent) {
      toast({ title: '请先生成内容', variant: 'destructive' })
      return
    }

    setContinuing(true)
    try {
      const existingNames = {
        characters: generatedContent.characters.map(c => c.name),
        scenes: generatedContent.scenes.map(s => s.name),
        props: generatedContent.props.map(p => p.name),
      }
      const lastStoryboards = generatedContent.storyboards.slice(-3).map(sb => ({
        description: sb.description,
        videoPrompt: sb.videoPrompt,
      }))

      const direction = continueDirection.trim() || '自然延续剧情,推动故事发展'
      const topicInput = `【延伸剧情模式】
已有角色（请勿重复生成）：${existingNames.characters.join('、') || '无'}
已有场景（请勿重复生成）：${existingNames.scenes.join('、') || '无'}
已有道具（请勿重复生成）：${existingNames.props.join('、') || '无'}
最近分镜：${JSON.stringify(lastStoryboards)}
延伸方向：${direction}
请只生成新的角色、场景、道具和后续分镜，已有资产不要重复出现在characters/scenes/props数组中。`

      const prompt = getActivePrompt('inspiration_creation', {
        topic: topicInput,
      })

      const response = await AI.Text.generate({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.9,
        maxTokens: 32768,
      })

      const text = typeof response === 'string' ? response : JSON.stringify(response)
      logger.debug('延伸剧情AI返回文本长度:', text.length)

      let jsonStr = text
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) jsonStr = jsonMatch[0]

      const trimmedJson = jsonStr.trim()
      if (!trimmedJson.endsWith('}')) {
        throw new Error('AI生成的内容过长被截断。请尝试简化延伸方向。')
      }

      let continuedContent: GeneratedContent
      try {
        const raw = JSON.parse(jsonStr) as Record<string, unknown>
        continuedContent = normalizeGeneratedContent(raw)
      } catch {
        const fixedJson = jsonStr
          .replace(/,\s*([\]}])/g, '$1')
        try {
          const raw = JSON.parse(fixedJson) as Record<string, unknown>
          continuedContent = normalizeGeneratedContent(raw)
        } catch {
          throw new Error('AI返回的数据格式错误。请重试。')
        }
      }

      const existingCharNames = new Set(generatedContent.characters.map(c => c.name))
      const existingSceneNames = new Set(generatedContent.scenes.map(s => s.name))
      const existingPropNames = new Set(generatedContent.props.map(p => p.name))

      const newCharacters = (continuedContent.characters || []).filter(c => !existingCharNames.has(c.name))
      const newScenes = (continuedContent.scenes || []).filter(s => !existingSceneNames.has(s.name))
      const newProps = (continuedContent.props || []).filter(p => !existingPropNames.has(p.name))

      const mergedContent: GeneratedContent = {
        characters: [...generatedContent.characters, ...newCharacters],
        scenes: [...generatedContent.scenes, ...newScenes],
        props: [...generatedContent.props, ...newProps],
        storyboards: [...generatedContent.storyboards, ...(continuedContent.storyboards || [])],
      }

      setGeneratedContent(mergedContent)
      setContinueDirection('')

      const newItem: HistoryItem = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        topic: `${topic.trim()}（延伸）`,
        content: mergedContent,
        createdAt: Date.now(),
      }
      const updatedHistory = [newItem, ...history]
      setHistory(updatedHistory)
      saveHistory(updatedHistory)

      toast({
        title: '延伸完成！',
        description: `新增${continuedContent.storyboards?.length || 0}个镜头组,${continuedContent.characters?.length || 0}个角色,${continuedContent.scenes?.length || 0}个场景`,
      })
    } catch (error) {
      logger.error('延伸剧情失败:', error)
      toast({
        title: '延伸失败',
        description: (error as Error).message,
        variant: 'destructive',
      })
    } finally {
      setContinuing(false)
    }
  }

  const handleLoadHistory = (item: HistoryItem) => {
    setTopic(item.topic)
    setGeneratedContent(item.content)
    setShowHistory(false)
  }

  const handleDeleteHistory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const updated = history.filter(h => h.id !== id)
    setHistory(updated)
    saveHistory(updated)
  }

  const handleSaveToEpisode = async () => {
    if (!currentProjectId || !currentEpisodeId) {
      toast({
        title: '未选择项目或剧集',
        description: '请先在项目管理中选择项目和剧集',
        variant: 'destructive',
      })
      return
    }
    if (!generatedContent) {
      toast({ title: '请先生成内容', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      for (const dub of existingDubbings) {
        await dubbingMutations.deleteDubbing.mutateAsync(dub.id)
      }

      for (const sb of existingStoryboards) {
        await storyboardMutations.deleteStoryboard.mutateAsync(sb.id)
      }

      for (const prop of existingProps) {
        await propMutations.remove.mutateAsync(prop.id)
      }

      for (const scene of existingScenes) {
        await sceneMutations.remove.mutateAsync(scene.id)
      }

      for (const char of existingCharacters) {
        await characterMutations.remove.mutateAsync(char.id)
      }

      const characterIdMap = new Map<string, string>()
      for (const char of generatedContent.characters) {
        const created = await characterMutations.create.mutateAsync({
          project_id: currentProjectId,
          episode_id: currentEpisodeId,
          name: char.name,
          description: char.description,
          prompt: char.prompt,
        })
        characterIdMap.set(char.name, created.id)
      }

      const sceneIdMap = new Map<string, string>()
      for (const scene of generatedContent.scenes) {
        const created = await sceneMutations.create.mutateAsync({
          project_id: currentProjectId,
          episode_id: currentEpisodeId,
          name: scene.name,
          description: scene.description,
          prompt: scene.prompt,
        })
        sceneIdMap.set(scene.name, created.id)
      }

      const propIdMap = new Map<string, string>()
      for (const prop of generatedContent.props) {
        const created = await propMutations.create.mutateAsync({
          project_id: currentProjectId,
          episode_id: currentEpisodeId,
          name: prop.name,
          description: prop.description,
          prompt: prop.prompt,
        })
        propIdMap.set(prop.name, created.id)
      }

      for (let i = 0; i < generatedContent.storyboards.length; i++) {
        const sb = generatedContent.storyboards[i]!

        const characterIds = (sb.characters || [])
          .map(name => characterIdMap.get(name))
          .filter((id): id is string => !!id)

        const propIds = (sb.props || [])
          .map(name => propIdMap.get(name))
          .filter((id): id is string => !!id)

        const sceneId = sb.characters && sb.characters.length > 0
          ? undefined
          : (generatedContent.scenes.length > 0 ? sceneIdMap.values().next().value as string | undefined : undefined)

        await storyboardMutations.createStoryboard.mutateAsync({
          project_id: currentProjectId,
          episode_id: currentEpisodeId,
          name: `分镜 ${i + 1}`,
          description: sb.description,
          prompt: sb.prompt,
          video_prompt: sb.videoPrompt,
          sort_order: i,
          status: 'pending',
          character_ids: characterIds,
          scene_id: sceneId,
          prop_ids: propIds,
          reference_images: [],
          video_reference_images: [],
        })
      }

      toast({
        title: '保存成功',
        description: `已清空原有数据，保存${generatedContent.characters.length}个角色、${generatedContent.scenes.length}个场景、${generatedContent.props.length}个道具、${generatedContent.storyboards.length}个分镜到「${currentEpisode?.name || '当前剧集'}」`,
      })

      // 清空内容
      setGeneratedContent(null)
      setTopic('')
    } catch (error) {
      console.error('保存失败:', error)
      toast({
        title: '保存失败',
        description: (error as Error).message,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  // 导出生图提示词
  const handleExportImagePrompts = async () => {
    if (!generatedContent) {
      toast({ title: '请先生成内容', variant: 'destructive' })
      return
    }

    const lines: string[] = []
    lines.push('========== 角色提示词 ==========')
    generatedContent.characters.forEach((char, index) => {
      lines.push(`【角色 ${index + 1}】${char.name}`)
      lines.push(`${char.prompt}`)
      if (char.staticViews) {
        lines.push(`${char.staticViews}`)
      }
      if (char.wardrobeVariants) {
        lines.push(`${char.wardrobeVariants}`)
      }
    })

    lines.push('========== 场景提示词 ==========')
    generatedContent.scenes.forEach((scene, index) => {
      lines.push(`【场景 ${index + 1}】${scene.name}`)
      lines.push(`${scene.prompt}`)
    })

    lines.push('========== 道具提示词 ==========')
    generatedContent.props.forEach((prop, index) => {
      lines.push(`【道具 ${index + 1}】${prop.name}`)
      lines.push(`${prop.prompt}`)
    })

    lines.push('========== 分镜图片提示词 ==========')
    generatedContent.storyboards.forEach((sb, index) => {
      lines.push(`【分镜 ${index + 1}】`)
      lines.push(`${sb.prompt}`)
    })

    const content = lines.join('\n')
    const defaultName = `生图提示词_${topic.slice(0, 20)}_${new Date().toISOString().slice(0, 10)}.txt`

    const savePath = await save({
      defaultPath: defaultName,
      filters: [{ name: '文本文件', extensions: ['txt'] }],
      title: '保存生图提示词',
    })

    if (!savePath) return

    const encoder = new TextEncoder()
    await writeFile(savePath, encoder.encode(content))
    toast({ title: '导出成功', description: `已保存到 ${savePath}` })
  }

  // 导出生视频提示词
  const handleExportVideoPrompts = async () => {
    if (!generatedContent) {
      toast({ title: '请先生成内容', variant: 'destructive' })
      return
    }

    const lines: string[] = []
    lines.push('========== 分镜视频提示词 ==========')
    
    generatedContent.storyboards.forEach((sb, index) => {
      lines.push(`【分镜 ${index + 1}】`)
      if (sb.characters && sb.characters.length > 0) {
        lines.push(`角色：${sb.characters.join('、')}`)
      }
      if (sb.props && sb.props.length > 0) {
        lines.push(`道具：${sb.props.join('、')}`)
      }
      if (sb.shotType) {
        lines.push(`镜头类型：${sb.shotType}`)
      }
      if (sb.camera) {
        lines.push(`机位：${sb.camera}`)
      }
      if (sb.duration) {
        lines.push(`时长：${sb.duration}`)
      }
      lines.push(`${sb.videoPrompt}`)
      lines.push('---')
    })

    const content = lines.join('\n')
    const defaultName = `视频提示词_${topic.slice(0, 20)}_${new Date().toISOString().slice(0, 10)}.txt`

    const savePath = await save({
      defaultPath: defaultName,
      filters: [{ name: '文本文件', extensions: ['txt'] }],
      title: '保存视频提示词',
    })

    if (!savePath) return

    const encoder = new TextEncoder()
    await writeFile(savePath, encoder.encode(content))
    toast({ title: '导出成功', description: `已保存到 ${savePath}` })
  }

  return (
    <div className="space-y-6">
      {/* 当前项目/剧集信息 */}
      <Alert className={hasSelectedProjectAndEpisode ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}>
        <AlertDescription className="flex items-center gap-2">
          {hasSelectedProjectAndEpisode ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="text-green-800">
                当前项目：{currentProject?.name || '加载中...'} | 当前剧集：{currentEpisode?.name || '加载中...'}
              </span>
            </>
          ) : (
            <>
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <span className="text-amber-800">
                请先选择项目和剧集，生成的内容将保存到当前剧集
              </span>
            </>
          )}
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：输入和历史 */}
        <div className="space-y-6">
          {/* 主题输入 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-yellow-500" />
                灵感创作
              </CardTitle>
              <CardDescription>
                输入主题，AI 将自由发挥为你生成完整的影视分镜方案
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>创作主题</Label>
                <Textarea
                  placeholder="例如：一个关于未来城市中人工智能觉醒的科幻短片，主角是一位发现AI秘密的年轻程序员..."
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  rows={6}
                  className="resize-none"
                />
              </div>
              <Button
                onClick={handleGenerate}
                disabled={generating || !topic.trim()}
                className="w-full"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    AI 创作中...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 mr-2" />
                    开始创作
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* 历史记录 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="w-4 h-4" />
                创作历史
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHistory(!showHistory)}
              >
                {showHistory ? '收起' : '展开'}
              </Button>
            </CardHeader>
            {showHistory && (
              <CardContent>
                <ScrollArea className="h-[300px]">
                  {history.length > 0 ? (
                    <div className="space-y-2">
                      {history.map((item) => (
                        <div
                          key={item.id}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors",
                            generatedContent === item.content
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-muted/50"
                          )}
                          onClick={() => handleLoadHistory(item)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">
                              {item.topic}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="secondary" className="text-[10px]">
                                {item.content.characters.length}角色
                              </Badge>
                              <Badge variant="secondary" className="text-[10px]">
                                {item.content.scenes.length}场景
                              </Badge>
                              <Badge variant="secondary" className="text-[10px]">
                                {item.content.storyboards.length}分镜
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(item.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 ml-2">
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={(e) => handleDeleteHistory(item.id, e)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      暂无创作记录
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            )}
          </Card>
        </div>

        {/* 右侧：生成结果 */}
        <div className="lg:col-span-2">
          {generatedContent ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>创作结果</span>
                  <Badge variant="secondary">
                    {generatedContent.characters.length}角色 · {generatedContent.scenes.length}场景 · {generatedContent.props.length}道具 · {generatedContent.storyboards.length}分镜
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* 操作按钮组 */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={handleSaveToEpisode}
                    disabled={saving || !hasSelectedProjectAndEpisode}
                    className="flex-1"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        保存中...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        保存到剧集
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleExportImagePrompts}
                    disabled={!generatedContent}
                    title="导出所有生图提示词（角色、场景、道具、分镜首帧）"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    导出生图提示词
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleExportVideoPrompts}
                    disabled={!generatedContent}
                    title="导出所有视频提示词（分镜动态）"
                  >
                    <Video className="w-4 h-4 mr-2" />
                    导出视频提示词
                  </Button>
                </div>

                {/* 延伸剧情 */}
                <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-100 space-y-3">
                  <div className="flex items-center gap-2">
                    <Play className="w-4 h-4 text-indigo-600" />
                    <span className="text-sm font-medium text-indigo-900">延伸剧情</span>
                    <span className="text-xs text-indigo-600">在已有内容基础上继续编写后续剧情</span>
                  </div>
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="输入延伸方向（可选），如：冲突升级、真相揭露、新角色登场、反转为敌...留空则AI自由延续"
                      value={continueDirection}
                      onChange={(e) => setContinueDirection(e.target.value)}
                      rows={2}
                      className="resize-none flex-1 text-sm"
                    />
                    <Button
                      onClick={handleContinueStory}
                      disabled={continuing || !generatedContent}
                      className="self-end bg-indigo-600 hover:bg-indigo-700"
                    >
                      {continuing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          延伸中...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          继续编写
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* 角色 */}
                {generatedContent.characters.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-blue-500" />
                      角色设定
                    </h3>
                    {generatedContent.characters.map((char, index) => (
                      <div key={index} className="p-4 bg-muted/30 rounded-lg space-y-3">
                        <div className="font-medium text-base">{char.name}</div>
                        <div className="text-sm text-muted-foreground">{char.description}</div>
                        
                        {/* 当前状态剧照 */}
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-muted-foreground">当前状态剧照</div>
                          <div className="text-xs text-muted-foreground/70 bg-muted p-2 rounded">{char.prompt}</div>
                        </div>
                        
                        {/* 静态四视图 */}
                        {char.staticViews && (
                          <div className="space-y-1">
                            <div className="text-xs font-medium text-blue-600">静态四视图（无道具）</div>
                            <div className="text-xs text-muted-foreground/70 bg-blue-50 p-2 rounded border border-blue-100">{char.staticViews}</div>
                          </div>
                        )}
                        
                        {/* 衍生状态四视图 */}
                        {char.wardrobeVariants && (
                          <div className="space-y-1">
                            <div className="text-xs font-medium text-purple-600">衍生衣橱（场景服装转变）</div>
                            <div className="text-xs text-muted-foreground/70 bg-purple-50 p-2 rounded border border-purple-100">{char.wardrobeVariants}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* 场景 */}
                {generatedContent.scenes.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-green-500" />
                      场景设定
                    </h3>
                    {generatedContent.scenes.map((scene, index) => (
                      <div key={index} className="p-4 bg-muted/30 rounded-lg space-y-2">
                        <div className="font-medium text-base">{scene.name}</div>
                        <div className="text-sm text-muted-foreground">{scene.description}</div>
                        <div className="text-xs text-muted-foreground/70 bg-muted p-2 rounded">
                          <span className="font-medium">生图提示词：</span>{scene.prompt}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 道具 */}
                {generatedContent.props.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-orange-500" />
                      道具设定
                    </h3>
                    {generatedContent.props.map((prop, index) => (
                      <div key={index} className="p-4 bg-muted/30 rounded-lg space-y-2">
                        <div className="font-medium text-base">{prop.name}</div>
                        <div className="text-sm text-muted-foreground">{prop.description}</div>
                        <div className="text-xs text-muted-foreground/70 bg-muted p-2 rounded">
                          <span className="font-medium">生图提示词：</span>{prop.prompt}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 分镜 */}
                {generatedContent.storyboards.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-purple-500" />
                      分镜脚本
                    </h3>
                    {generatedContent.storyboards.map((sb, index) => (
                      <div key={index} className="p-4 bg-muted/30 rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-base">分镜 {index + 1}</div>
                          <div className="flex gap-1">
                            {sb.duration && (
                              <Badge variant="secondary" className="text-[10px]">{sb.duration}</Badge>
                            )}
                            {sb.shotType && (
                              <Badge variant="outline" className="text-[10px]">{sb.shotType}</Badge>
                            )}
                            {sb.camera && (
                              <Badge variant="outline" className="text-[10px]">{sb.camera}</Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground">{sb.description}</div>
                        
                        {sb.characters && sb.characters.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {sb.characters.map((c, i) => (
                              <Badge key={i} variant="outline" className="text-xs">{c}</Badge>
                            ))}
                          </div>
                        )}
                        
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-muted-foreground">首帧画面提示词</div>
                          <div className="text-xs text-muted-foreground/70 bg-muted p-2 rounded">{sb.prompt}</div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-muted-foreground">视频动态提示词</div>
                          <div className="text-xs text-muted-foreground/70 bg-muted p-2 rounded">{sb.videoPrompt}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>输入主题开始创作</p>
                <p className="text-sm mt-2">或从历史记录中选择查看</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
