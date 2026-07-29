/**
 * 灵感创作组件 - 自由发挥模式
 * 输入主题，AI 自由发挥生成完整的角色、场景、道具和分镜
 */

import { useState, useEffect } from 'react'

import { Sparkles, Loader2, Wand2, Save, AlertCircle, CheckCircle2, History, Trash2, ChevronRight, Clock, Play, RefreshCw } from 'lucide-react'

import { ContentResultDisplay, ContentResultEmpty } from '@/components/analysis/ContentResultDisplay'
import type { ContentData } from '@/components/analysis/ContentResultDisplay'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { useSceneMutations, useScenesByEpisode , usePropMutations, usePropsByEpisode } from '@/hooks/useAssetManager'
import { useCharacterMutations, useCharactersByEpisode } from '@/hooks/useCharacters'
import { useDubbingMutations, useDubbingByEpisode } from '@/hooks/useDubbing'
import { useEpisodeQuery } from '@/hooks/useEpisodes'
import { useProjectQuery } from '@/hooks/useProjects'
import { useStoryboardMutations, useStoryboards } from '@/hooks/useStoryboards'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import { getActivePrompt } from '@/services/promptConfigService'
import { useUIStore } from '@/store/useUIStore'
import { callAI, parseJSON } from '@/utils/aiHelper'
import logger from '@/utils/logger'
import { matchAssetsByName } from '@/utils/storyboardReferences'

type GeneratedContent = ContentData

interface InspirationScene {
  name: string
  summary: string
  storyText: string
  location: string
  time: string
  mood: string
  characters: string[]
  narrativeFunction: string
}

interface InspirationAsset {
  characters: Array<{ name: string; description: string; prompt: string; wardrobeVariants?: string }>
  scenes: Array<{ name: string; description: string; prompt: string }>
  props: Array<{ name: string; description: string; prompt: string }>
}

interface InspirationShot {
  description: string
  prompt: string
  videoPrompt: string
  characters: string[]
  scene: string
  props: string[]
  shot_type: string
  duration: number
}

interface PipelineStepInfo {
  step: number
  totalSteps: number
  label: string
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

/** 通用精修调用：取精修提示词 → 调用AI → 解析JSON */
async function runRefinement<T>(type: string, inputData: T): Promise<T> {
  // 检查精修开关
  try {
    const { settingsDB } = await import('@/db')
    const settings = await settingsDB.get()
    if (settings.refinement_enabled === false) {
      return inputData
    }
  } catch {
    // 加载失败则默认执行精修
  }
  const prompt = getActivePrompt(type as any, { inputData: JSON.stringify(inputData, null, 2) })
  const result = await callAI(prompt, { maxTokens: 16384 })
  return parseJSON<T>(result)
}

export function InspirationCreator() {
  const { toast } = useToast()
  const [topic, setTopic] = useState('')
  const [duration, setDuration] = useState('1-2分钟')
  const [generating, setGenerating] = useState(false)
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null)
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [continueDirection, setContinueDirection] = useState('')
  const [continuing, setContinuing] = useState(false)
  const [pipelineStep, setPipelineStep] = useState<PipelineStepInfo | null>(null)
  // 中间状态（用于分步重试）
  const [currentScenes, setCurrentScenes] = useState<InspirationScene[]>([])
  const [currentAssets, setCurrentAssets] = useState<InspirationAsset | null>(null)
  const [, setCurrentShots] = useState<InspirationShot[]>([])
  const [isRetrying, setIsRetrying] = useState({ story: false, storyboard: false, dubbing: false })

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
    setPipelineStep({ step: 1, totalSteps: 7, label: '生成故事' })
    try {
      // ====== Step 1: 生成完整故事 + 场景划分 ======
      setPipelineStep({ step: 1, totalSteps: 7, label: '生成故事与场景划分' })
      const storyPrompt = getActivePrompt('inspiration_story_generation', { topic: topic.trim(), duration })
      const storyResult = await callAI(storyPrompt, { temperature: 0.9, maxTokens: 16384 })
      const storyData = parseJSON<{ title?: string; storySummary?: string; scenes: InspirationScene[] }>(storyResult)
      const scenes = storyData.scenes || []
      logger.info(`[Inspiration] 生成了 ${scenes.length} 个场景`)

      if (scenes.length === 0) {
        throw new Error('故事生成结果为空，请重试')
      }

      // ====== Step 2: 全局资产提取 ======
      setPipelineStep({ step: 2, totalSteps: 7, label: '提取角色、场景、道具' })
      const fullStoryText = scenes.map((s, i) =>
        `--- 场景${i + 1}: ${s.name} ---\n${s.storyText || s.summary}`
      ).join('\n\n')
      const scenesSummary = scenes.map((s, i) =>
        `场景${i + 1}: ${s.name} - ${s.summary} (角色: ${s.characters.join(', ')})`
      ).join('\n')

      const assetPrompt = getActivePrompt('pipeline_asset_extraction', {
        content: fullStoryText,
        scenes: scenesSummary,
      })
      const assetResult = await callAI(assetPrompt, { maxTokens: 16384 })
      const assets = parseJSON<InspirationAsset>(assetResult)
      logger.info(`[Inspiration] 提取了 ${assets.characters?.length || 0} 角色, ${assets.scenes?.length || 0} 场景, ${assets.props?.length || 0} 道具`)

      // ====== Step 3: 分镜拆解（3场景一批） ======
      const BATCH_SIZE = 3
      const totalBatches = Math.ceil(scenes.length / BATCH_SIZE)
      setPipelineStep({ step: 3, totalSteps: 7, label: '分镜拆解 (0/' + scenes.length + ')' })
      const allShots: InspirationShot[] = []
      let previousShotDesc = '（这是第一个场景，没有上一场景）'

      const characterPromptMap = new Map<string, string>()
      for (const char of (assets.characters || [])) {
        characterPromptMap.set(char.name, char.prompt)
      }
      const scenePromptMap = new Map<string, string>()
      for (const scene of (assets.scenes || [])) {
        scenePromptMap.set(scene.name, scene.prompt)
      }
      const propPromptMap = new Map<string, string>()
      for (const prop of (assets.props || [])) {
        propPromptMap.set(prop.name, prop.prompt)
      }

      const assetListStr = [
        `角色: ${(assets.characters || []).map(c => c.name).join(', ')}`,
        `场景: ${(assets.scenes || []).map(s => s.name).join(', ')}`,
        `道具: ${(assets.props || []).map(p => p.name).join(', ')}`,
      ].join('\n')

      for (let batchStart = 0; batchStart < scenes.length; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, scenes.length)
        const batchScenes = scenes.slice(batchStart, batchEnd)

        // 拼接本次批次所有场景的信息
        const batchScenesStr = batchScenes.map((scene, idx) => {
          const globalIdx = batchStart + idx
          const sceneCharacterNames = [...new Set(scene.characters)]
          const characterPromptsStr = sceneCharacterNames
            .map(name => `${name}: ${characterPromptMap.get(name) || '未知角色'}`)
            .join('\n')

          return [
            `=== 场景${globalIdx + 1}: ${scene.name} ===`,
            `地点: ${scene.location}`,
            `时间: ${scene.time}`,
            `氛围: ${scene.mood}`,
            `出场角色: ${scene.characters.join(', ')}`,
            `叙事功能: ${scene.narrativeFunction}`,
            `概要: ${scene.summary}`,
            ``,
            `【原文片段】`,
            scene.storyText || scene.summary,
            ``,
            `【角色视觉描述】`,
            characterPromptsStr,
            ``,
            `【场景视觉描述】`,
            `${scene.name}: ${scenePromptMap.get(scene.name) || '未知场景'}`,
            ``,
            `【道具视觉描述】`,
            (assets.props || []).map(p => `${p.name}: ${propPromptMap.get(p.name) || ''}`).join('\n'),
          ].join('\n')
        }).join('\n\n---\n\n')

        setPipelineStep({
          step: 3,
          totalSteps: 7,
          label: `分镜拆解 (${Math.min(batchEnd, scenes.length)}/${scenes.length})`,
        })

        try {
          const breakdownPrompt = getActivePrompt('pipeline_storyboard_breakdown_batch', {
            batchScenes: batchScenesStr,
            previousShot: previousShotDesc,
            assetList: assetListStr,
          })
          const breakdownResult = await callAI(breakdownPrompt, { maxTokens: 16384 })
          const shots = parseJSON<InspirationShot[]>(breakdownResult)
          logger.info(`[Inspiration] 批次 ${batchStart / BATCH_SIZE + 1}/${totalBatches} 拆解了 ${shots.length} 个镜头`)

          if (shots.length > 0) {
            allShots.push(...shots)
            const lastShot = shots[shots.length - 1]!
            previousShotDesc = [
              `景别: ${lastShot.shot_type || '固定'}`,
              `画面: ${lastShot.prompt || lastShot.description || ''}`,
              `动态: ${lastShot.videoPrompt || ''}`,
            ].join('\n')
          }
        } catch (e) {
          logger.error(`[Inspiration] 分镜拆解失败，批次${batchStart / BATCH_SIZE + 1}`, e)
        }
      }

      // ====== Step 4: 摄影方案精修（精修 prompt 首帧描述） ======
      if (allShots.length > 0) {
        setPipelineStep({ step: 4, totalSteps: 7, label: '精修摄影方案' })
        try {
          const refined = await runRefinement<typeof allShots>('refinement_cinematography', allShots)
          if (refined && refined.length === allShots.length) {
            allShots.splice(0, allShots.length, ...refined)
          }
        } catch (e) {
          logger.error('[Inspiration] 摄影精修失败', e)
        }
      }

      // ====== Step 5: 表演精修（精修 videoPrompt 表演描述） ======
      if (allShots.length > 0) {
        setPipelineStep({ step: 5, totalSteps: 7, label: '精修表演细节' })
        try {
          const refined = await runRefinement<typeof allShots>('refinement_performance', allShots)
          if (refined && refined.length === allShots.length) {
            allShots.splice(0, allShots.length, ...refined)
          }
        } catch (e) {
          logger.error('[Inspiration] 表演精修失败', e)
        }
      }

      // ====== Step 6: 剪辑节奏精修 ======
      if (allShots.length > 0) {
        setPipelineStep({ step: 6, totalSteps: 7, label: '精修剪辑节奏' })
        try {
          const refined = await runRefinement<typeof allShots>('refinement_editing', allShots)
          if (refined && refined.length === allShots.length) {
            allShots.splice(0, allShots.length, ...refined)
          }
        } catch (e) {
          logger.error('[Inspiration] 剪辑精修失败', e)
        }
      }

      // ====== Step 7: 配音生成 ======
      setPipelineStep({ step: 7, totalSteps: 7, label: '生成配音提示词' })
      const allDubbing: Array<{ character: string; line: string; emotion: string; audio_prompt: string }> = []

      const shotsDescription = allShots.map((shot, i) => {
        const parts = [
          `镜头${i + 1}:`,
          `  画面: ${shot.description}`,
          `  场景: ${shot.scene}`,
          `  景别运镜: ${shot.shot_type}`,
          `  时长: ${shot.duration}秒`,
          `  出场角色: ${shot.characters.join(', ')}`,
          `  出场道具: ${shot.props.join(', ') || '无'}`,
        ]
        return parts.join('\n')
      }).join('\n\n')

      try {
        const characterVoicesStr = (assets.characters || [])
          .map(c => c.wardrobeVariants ? `${c.name}: ${c.wardrobeVariants}` : '')
          .filter(Boolean)
          .join('\n')

        const dubbingPrompt = getActivePrompt('pipeline_dubbing_generation', {
          shotsDescription,
          characterVoices: characterVoicesStr || '无角色声音描述',
        })
        const dubbingResult = await callAI(dubbingPrompt)
        const dubbing = parseJSON<Array<{ character: string; line: string; emotion: string; audio_prompt: string }>>(dubbingResult)
        allDubbing.push(...dubbing)
      } catch (e) {
        logger.error('[Inspiration] 配音生成失败', e)
      }

      // 配音精修
      if (allDubbing.length > 0) {
        setPipelineStep({ step: 7, totalSteps: 7, label: '精修配音方案' })
        try {
          const refined = await runRefinement<typeof allDubbing>('refinement_dubbing', allDubbing)
          if (refined && refined.length === allDubbing.length) {
            allDubbing.splice(0, allDubbing.length, ...refined)
          }
        } catch (e) {
          logger.error('[Inspiration] 配音精修失败', e)
        }
      }

      // 保存中间状态（用于分步重试）
      setCurrentScenes(scenes)
      setCurrentAssets(assets)
      setCurrentShots([...allShots])

      // ====== 组装结果 ======
      const content: GeneratedContent = {
        characters: (assets.characters || []).map(c => ({
          name: c.name,
          description: c.description,
          prompt: c.prompt,
          wardrobeVariants: c.wardrobeVariants,
        })),
        scenes: (assets.scenes || []).map(s => ({
          name: s.name,
          description: s.description,
          prompt: s.prompt,
        })),
        props: (assets.props || []).map(p => ({
          name: p.name,
          description: p.description,
          prompt: p.prompt,
        })),
        storyboards: allShots.map(sb => ({
          description: sb.description,
          prompt: sb.prompt,
          videoPrompt: sb.videoPrompt,
          scene: sb.scene ? String(sb.scene) : undefined,
          characters: normalizeStringArray(sb.characters),
          props: normalizeStringArray(sb.props),
          shotType: sb.shot_type ? String(sb.shot_type) : undefined,
          duration: sb.duration ? String(sb.duration) : undefined,
        })),
        dubbing: allDubbing.map(d => ({
          character: d.character,
          line: d.line,
          emotion: d.emotion,
          audio_prompt: d.audio_prompt,
        })),
      }

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

      toast({
        title: '创作完成！',
        description: `${scenes.length}个场景，${allShots.length}个分镜，${(assets.characters || []).length}个角色`,
      })
    } catch (error) {
      logger.error('[Inspiration] 生成失败:', error)
      toast({
        title: '生成失败',
        description: (error as Error).message,
        variant: 'destructive',
      })
    } finally {
      setGenerating(false)
      setPipelineStep(null)
    }
  }

  const handleContinueStory = async () => {
    if (!generatedContent) {
      toast({ title: '请先生成内容', variant: 'destructive' })
      return
    }

    setContinuing(true)
    setPipelineStep({ step: 1, totalSteps: 6, label: '延伸故事' })
    try {
      const lastScene = generatedContent.scenes[generatedContent.scenes.length - 1]
      const lastStoryboards = generatedContent.storyboards.slice(-3).map(sb => {
        const parts = [`画面: ${sb.description || sb.prompt || ''}`]
        if (sb.videoPrompt) parts.push(`动态: ${sb.videoPrompt}`)
        if (sb.shotType) parts.push(`景别: ${sb.shotType}`)
        if (sb.duration) parts.push(`时长: ${sb.duration}s`)
        return parts.join(' | ')
      }).join('\n')

      const direction = continueDirection.trim() || '自然延续剧情,推动故事发展'
      const topicInput = `【延伸剧情模式】
已有资产（请勿重复生成新的角色、场景、道具，直接使用已有资产）：
- 角色：${generatedContent.characters.map(c => c.name).join('、') || '无'}
- 场景：${generatedContent.scenes.map(s => s.name).join('、') || '无'}
- 道具：${generatedContent.props.map(p => p.name).join('、') || '无'}

【上一个场景结尾（请从此处继续）】
场景名：${lastScene?.name || '无'}
场景描述：${lastScene?.description || '无'}

【最近分镜结局】
${lastStoryboards || '无'}

【延伸方向】
${direction}

重要：必须紧接上一个场景的结尾继续叙事，保证故事线的连续性。不要重新开始一个独立故事，不要重复已有场景/角色/道具。只生成全新的场景。`

      // ====== Step 1: 延伸故事 ======
      setPipelineStep({ step: 1, totalSteps: 6, label: '延伸故事与场景划分' })
      const storyPrompt = getActivePrompt('inspiration_story_continuation', { topic: topicInput, duration })
      const storyResult = await callAI(storyPrompt, { temperature: 0.9, maxTokens: 16384 })
      const storyData = parseJSON<{ title?: string; storySummary?: string; scenes: InspirationScene[] }>(storyResult)
      const newScenes = storyData.scenes || []
      logger.info(`[Inspiration] 延伸了 ${newScenes.length} 个新场景`)

      if (newScenes.length === 0) {
        throw new Error('延伸故事结果为空，请重试')
      }

      // ====== Step 2: 资产提取（仅新增） ======
      setPipelineStep({ step: 2, totalSteps: 6, label: '提取新角色、场景、道具' })
      const newStoryText = newScenes.map((s, i) =>
        `--- 场景${i + 1}: ${s.name} ---\n${s.storyText || s.summary}`
      ).join('\n\n')
      const newScenesSummary = newScenes.map((s, i) =>
        `场景${i + 1}: ${s.name} - ${s.summary} (角色: ${s.characters.join(', ')})`
      ).join('\n')

      const assetPrompt = getActivePrompt('pipeline_asset_extraction', {
        content: newStoryText,
        scenes: newScenesSummary,
      })
      const assetResult = await callAI(assetPrompt, { maxTokens: 16384 })
      const newAssets = parseJSON<InspirationAsset>(assetResult)

      const existingCharNames = new Set(generatedContent.characters.map(c => c.name))
      const existingSceneNames = new Set(generatedContent.scenes.map(s => s.name))
      const existingPropNames = new Set(generatedContent.props.map(p => p.name))

      const addedCharacters = (newAssets.characters || []).filter(c => !existingCharNames.has(c.name))
      const addedScenes = (newAssets.scenes || []).filter(s => !existingSceneNames.has(s.name))
      const addedProps = (newAssets.props || []).filter(p => !existingPropNames.has(p.name))

      // ====== Step 3: 分镜拆解（3场景一批） ======
      setPipelineStep({ step: 3, totalSteps: 6, label: '分镜拆解 (0/' + newScenes.length + ')' })

      const allCharacterPrompts = new Map<string, string>()
      for (const c of generatedContent.characters) allCharacterPrompts.set(c.name, c.prompt)
      for (const c of addedCharacters) allCharacterPrompts.set(c.name, c.prompt)
      const allScenePrompts = new Map<string, string>()
      for (const s of generatedContent.scenes) allScenePrompts.set(s.name, s.prompt)
      for (const s of addedScenes) allScenePrompts.set(s.name, s.prompt)
      const allPropPrompts = new Map<string, string>()
      for (const p of generatedContent.props) allPropPrompts.set(p.name, p.prompt)
      for (const p of addedProps) allPropPrompts.set(p.name, p.prompt)

      const allAssetListStr = [
        `角色: ${[...generatedContent.characters, ...addedCharacters].map(c => c.name).join(', ')}`,
        `场景: ${[...generatedContent.scenes, ...addedScenes].map(s => s.name).join(', ')}`,
        `道具: ${[...generatedContent.props, ...addedProps].map(p => p.name).join(', ')}`,
      ].join('\n')

      const lastExistingShot = generatedContent.storyboards[generatedContent.storyboards.length - 1]
      let previousShotDesc = lastExistingShot
        ? `景别: ${lastExistingShot.shotType || '固定'}\n画面: ${lastExistingShot.prompt || ''}\n动态: ${lastExistingShot.videoPrompt || ''}`
        : '（这是第一个场景，没有上一场景）'

      const allPropsForBatch = [...generatedContent.props, ...addedProps]
      const BATCH_SIZE_EXT = 3
      const newShots: InspirationShot[] = []

      for (let batchStart = 0; batchStart < newScenes.length; batchStart += BATCH_SIZE_EXT) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE_EXT, newScenes.length)
        const batchScenes = newScenes.slice(batchStart, batchEnd)

        const batchScenesStr = batchScenes.map((scene, idx) => {
          const globalIdx = batchStart + idx
          const sceneCharacterNames = [...new Set(scene.characters)]
          const characterPromptsStr = sceneCharacterNames
            .map(name => `${name}: ${allCharacterPrompts.get(name) || '未知角色'}`)
            .join('\n')

          return [
            `=== 场景${globalIdx + 1}: ${scene.name} ===`,
            `地点: ${scene.location}`,
            `时间: ${scene.time}`,
            `氛围: ${scene.mood}`,
            `出场角色: ${scene.characters.join(', ')}`,
            `叙事功能: ${scene.narrativeFunction}`,
            `概要: ${scene.summary}`,
            ``,
            `【原文片段】`,
            scene.storyText || scene.summary,
            ``,
            `【角色视觉描述】`,
            characterPromptsStr,
            ``,
            `【场景视觉描述】`,
            `${scene.name}: ${allScenePrompts.get(scene.name) || '未知场景'}`,
            ``,
            `【道具视觉描述】`,
            allPropsForBatch.map(p => `${p.name}: ${allPropPrompts.get(p.name) || ''}`).join('\n'),
          ].join('\n')
        }).join('\n\n---\n\n')

        setPipelineStep({
          step: 3,
          totalSteps: 6,
          label: `分镜拆解 (${Math.min(batchEnd, newScenes.length)}/${newScenes.length})`,
        })

        try {
          const breakdownPrompt = getActivePrompt('pipeline_storyboard_breakdown_batch', {
            batchScenes: batchScenesStr,
            previousShot: previousShotDesc,
            assetList: allAssetListStr,
          })
          const breakdownResult = await callAI(breakdownPrompt, { maxTokens: 16384 })
          const shots = parseJSON<InspirationShot[]>(breakdownResult)

          if (shots.length > 0) {
            newShots.push(...shots)
            const lastShot = shots[shots.length - 1]!
            previousShotDesc = [
              `景别: ${lastShot.shot_type || '固定'}`,
              `画面: ${lastShot.prompt || lastShot.description || ''}`,
              `动态: ${lastShot.videoPrompt || ''}`,
            ].join('\n')
          }
        } catch (e) {
          logger.error(`[Inspiration] 延伸分镜拆解失败，批次${batchStart / BATCH_SIZE_EXT + 1}`, e)
        }
      }

      // ====== Step 4: 摄影方案精修 ======
      if (newShots.length > 0) {
        setPipelineStep({ step: 4, totalSteps: 6, label: '精修摄影方案' })
        try {
          const refined = await runRefinement<typeof newShots>('refinement_cinematography', newShots)
          if (refined && refined.length === newShots.length) {
            newShots.splice(0, newShots.length, ...refined)
          }
        } catch (e) {
          logger.error('[Inspiration] 延伸摄影精修失败', e)
        }
      }

      // ====== Step 5: 表演精修 ======
      if (newShots.length > 0) {
        setPipelineStep({ step: 5, totalSteps: 6, label: '精修表演细节' })
        try {
          const refined = await runRefinement<typeof newShots>('refinement_performance', newShots)
          if (refined && refined.length === newShots.length) {
            newShots.splice(0, newShots.length, ...refined)
          }
        } catch (e) {
          logger.error('[Inspiration] 延伸表演精修失败', e)
        }
      }

      // ====== Step 6: 剪辑节奏精修 ======
      if (newShots.length > 0) {
        setPipelineStep({ step: 6, totalSteps: 6, label: '精修剪辑节奏' })
        try {
          const refined = await runRefinement<typeof newShots>('refinement_editing', newShots)
          if (refined && refined.length === newShots.length) {
            newShots.splice(0, newShots.length, ...refined)
          }
        } catch (e) {
          logger.error('[Inspiration] 延伸剪辑精修失败', e)
        }
      }

      // ====== 合并结果 ======
      const mergedContent: GeneratedContent = {
        characters: [...generatedContent.characters, ...addedCharacters.map(c => ({
          name: c.name, description: c.description, prompt: c.prompt, wardrobeVariants: c.wardrobeVariants,
        }))],
        scenes: [...generatedContent.scenes, ...addedScenes.map(s => ({
          name: s.name, description: s.description, prompt: s.prompt,
        }))],
        props: [...generatedContent.props, ...addedProps.map(p => ({
          name: p.name, description: p.description, prompt: p.prompt,
        }))],
        storyboards: [...generatedContent.storyboards, ...newShots.map(sb => ({
          description: sb.description,
          prompt: sb.prompt,
          videoPrompt: sb.videoPrompt,
          scene: sb.scene ? String(sb.scene) : undefined,
          characters: normalizeStringArray(sb.characters),
          props: normalizeStringArray(sb.props),
          shotType: sb.shot_type ? String(sb.shot_type) : undefined,
          duration: sb.duration ? String(sb.duration) : undefined,
        }))],
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
        description: `新增${newScenes.length}个场景，${newShots.length}个分镜，${addedCharacters.length}个角色，${addedScenes.length}个场景`,
      })
    } catch (error) {
      logger.error('[Inspiration] 延伸剧情失败:', error)
      toast({
        title: '延伸失败',
        description: (error as Error).message,
        variant: 'destructive',
      })
    } finally {
      setContinuing(false)
      setPipelineStep(null)
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

  /** 重试：重新生成故事 */
  const handleRetryStory = async () => {
    if (!topic.trim() || !currentAssets) return
    setIsRetrying(r => ({ ...r, story: true }))
    setPipelineStep({ step: 1, totalSteps: 1, label: '重新生成故事' })
    try {
      const storyPrompt = getActivePrompt('inspiration_story_generation', { topic: topic.trim(), duration })
      const result = await callAI(storyPrompt, { temperature: 0.9, maxTokens: 16384 })
      const storyData = parseJSON<{ title?: string; storySummary?: string; scenes: InspirationScene[] }>(result)
      const newScenes = storyData.scenes || []
      if (newScenes.length === 0) throw new Error('故事为空')
      setCurrentScenes(newScenes)

      // 重新跑后面所有步骤
      const fullStoryText = newScenes.map((s, i) =>
        `--- 场景${i + 1}: ${s.name} ---\n${s.storyText || s.summary}`
      ).join('\n\n')
      const scenesSummary = newScenes.map((s, i) =>
        `场景${i + 1}: ${s.name} - ${s.summary} (角色: ${s.characters.join(', ')})`
      ).join('\n')
      const assetPrompt = getActivePrompt('pipeline_asset_extraction', { content: fullStoryText, scenes: scenesSummary })
      const assetResult = await callAI(assetPrompt, { maxTokens: 16384 })
      const newAssets = parseJSON<InspirationAsset>(assetResult)
      setCurrentAssets(newAssets)

      // 重新拆解分镜
      await handleRegenerateShots(newScenes, newAssets)

      toast({ title: '故事已重新生成' })
    } catch (error) {
      toast({ title: '重试失败', description: (error as Error).message, variant: 'destructive' })
    } finally {
      setIsRetrying(r => ({ ...r, story: false }))
      setPipelineStep(null)
    }
  }

  /** 重试：重新生成分镜 + 配音 */
  const handleRetryStoryboard = async () => {
    if (!currentScenes.length || !currentAssets) return
    setIsRetrying(r => ({ ...r, storyboard: true }))
    setPipelineStep({ step: 1, totalSteps: 1, label: '重新生成分镜' })
    try {
      await handleRegenerateShots(currentScenes, currentAssets)
      toast({ title: '分镜已重新生成' })
    } catch (error) {
      toast({ title: '重试失败', description: (error as Error).message, variant: 'destructive' })
    } finally {
      setIsRetrying(r => ({ ...r, storyboard: false }))
      setPipelineStep(null)
    }
  }

  /** 重新生成分镜+配音（被重试函数复用） */
  const handleRegenerateShots = async (scenes: InspirationScene[], assets: InspirationAsset) => {
    const BATCH = 3
    const allShots: InspirationShot[] = []
    let prevShot = '（首场景，无上一场景）'

    const charMap = new Map(assets.characters?.map(c => [c.name, c.prompt]) || [])
    const sceneMap = new Map(assets.scenes?.map(s => [s.name, s.prompt]) || [])
    const propMap = new Map(assets.props?.map(p => [p.name, p.prompt]) || [])
    const assetListStr = [
      `角色: ${(assets.characters || []).map(c => c.name).join(', ')}`,
      `场景: ${(assets.scenes || []).map(s => s.name).join(', ')}`,
      `道具: ${(assets.props || []).map(p => p.name).join(', ')}`,
    ].join('\n')

    for (let start = 0; start < scenes.length; start += BATCH) {
      const end = Math.min(start + BATCH, scenes.length)
      const batch = scenes.slice(start, end)
      const batchStr = batch.map((scene, idx) => {
        const gIdx = start + idx
        const chars = [...new Set(scene.characters)]
        return [
          `=== 场景${gIdx + 1}: ${scene.name} ===`,
          `地点: ${scene.location}`, `时间: ${scene.time}`, `氛围: ${scene.mood}`,
          `出场角色: ${scene.characters.join(', ')}`, `叙事功能: ${scene.narrativeFunction}`,
          `概要: ${scene.summary}`, ``, `【原文片段】`, scene.storyText || scene.summary, ``,
          `【角色视觉描述】`, chars.map(n => `${n}: ${charMap.get(n) || '未知'}`).join('\n'), ``,
          `【场景视觉描述】`, `${scene.name}: ${sceneMap.get(scene.name) || '未知'}`, ``,
          `【道具视觉描述】`, (assets.props || []).map(p => `${p.name}: ${propMap.get(p.name) || ''}`).join('\n'),
        ].join('\n')
      }).join('\n\n---\n\n')

      const prompt = getActivePrompt('pipeline_storyboard_breakdown_batch', {
        batchScenes: batchStr, previousShot: prevShot, assetList: assetListStr,
      })
      const result = await callAI(prompt, { maxTokens: 16384 })
      const shots = parseJSON<InspirationShot[]>(result)
      if (shots.length > 0) {
        allShots.push(...shots)
        const last = shots[shots.length - 1]!
        prevShot = `景别: ${last.shot_type || '固定'}\n画面: ${last.prompt || ''}\n动态: ${last.videoPrompt || ''}`
      }
    }

    // 精修
    if (allShots.length > 0) {
      for (const refinementType of ['refinement_cinematography', 'refinement_performance', 'refinement_editing']) {
        try {
          const refined = await runRefinement<typeof allShots>(refinementType, allShots)
          if (refined && refined.length === allShots.length) allShots.splice(0, allShots.length, ...refined)
        } catch {}
      }
    }

    setCurrentShots([...allShots])
    handleUpdateGeneratedContent(scenes, assets, allShots)
  }

  /** 更新最终展示结果 */
  const handleUpdateGeneratedContent = (
    _scenes: InspirationScene[], assets: InspirationAsset, shots: InspirationShot[],
  ) => {
    const content: GeneratedContent = {
      characters: (assets.characters || []).map(c => ({
        name: c.name, description: c.description, prompt: c.prompt, wardrobeVariants: c.wardrobeVariants,
      })),
      scenes: (assets.scenes || []).map(s => ({ name: s.name, description: s.description, prompt: s.prompt })),
      props: (assets.props || []).map(p => ({ name: p.name, description: p.description, prompt: p.prompt })),
      storyboards: shots.map(sb => ({
        description: sb.description, prompt: sb.prompt, videoPrompt: sb.videoPrompt,
        scene: sb.scene ? String(sb.scene) : undefined, characters: normalizeStringArray(sb.characters),
        props: normalizeStringArray(sb.props), shotType: sb.shot_type ? String(sb.shot_type) : undefined,
        duration: sb.duration ? String(sb.duration) : undefined,
      })),
      dubbing: [],
    }
    setGeneratedContent(content)
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

      const existingMatch = await matchAssetsByName(
        currentEpisodeId,
        generatedContent.characters.map(c => c.name),
        generatedContent.scenes.map(s => s.name),
        generatedContent.props.map(p => p.name),
      )

      const characterIdMap = new Map<string, string>(existingMatch.characterMap)
      for (const char of generatedContent.characters) {
        if (characterIdMap.has(char.name)) continue
        const created = await characterMutations.create.mutateAsync({
          project_id: currentProjectId,
          episode_id: currentEpisodeId,
          name: char.name,
          description: char.description,
          prompt: char.prompt,
        })
        characterIdMap.set(char.name, created.id)
      }

      const sceneIdMap = new Map<string, string>(existingMatch.sceneMap)
      for (const scene of generatedContent.scenes) {
        if (sceneIdMap.has(scene.name)) continue
        const created = await sceneMutations.create.mutateAsync({
          project_id: currentProjectId,
          episode_id: currentEpisodeId,
          name: scene.name,
          description: scene.description,
          prompt: scene.prompt,
        })
        sceneIdMap.set(scene.name, created.id)
      }

      const propIdMap = new Map<string, string>(existingMatch.propMap)
      for (const prop of generatedContent.props) {
        if (propIdMap.has(prop.name)) continue
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
              <div className="space-y-2">
                <Label>目标时长</Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: '30秒以内', label: '30秒以内', desc: '1场景' },
                    { value: '30秒-1分钟', label: '30秒-1分钟', desc: '2-3场景' },
                    { value: '1-2分钟', label: '1-2分钟', desc: '3-5场景' },
                    { value: '3-5分钟', label: '3-5分钟', desc: '5-8场景' },
                    { value: '5-10分钟', label: '5-10分钟', desc: '8-12场景' },
                    { value: '10分钟以上', label: '10分钟+', desc: '12+场景' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setDuration(opt.value)}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                        duration === opt.value
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : 'border-border hover:border-primary/50 text-muted-foreground'
                      }`}
                    >
                      <span>{opt.label}</span>
                      <span className="text-xs ml-1 opacity-60">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
              <Button
                onClick={handleGenerate}
                disabled={generating || !topic.trim()}
                className="w-full"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {pipelineStep ? `${pipelineStep.label} (${pipelineStep.step}/${pipelineStep.totalSteps})` : 'AI 创作中...'}
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
            <ContentResultDisplay
              content={generatedContent}
              title="创作结果"
              showExport
              projectId={currentProjectId || undefined}
              actions={
                <Button
                  onClick={handleSaveToEpisode}
                  disabled={saving || !hasSelectedProjectAndEpisode}
                  className="w-full"
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
              }
              extraSections={
                <>
                {/* 重试按钮区 */}
                {currentScenes.length > 0 && currentAssets && (
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-amber-800">
                      <RefreshCw className="w-4 h-4" />
                      <span className="font-medium">不满意？可选择性重新生成</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRetryStory}
                        disabled={isRetrying.story}
                        className="text-xs border-amber-300 hover:bg-amber-100"
                      >
                        {isRetrying.story ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                        重新生成故事
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRetryStoryboard}
                        disabled={isRetrying.storyboard}
                        className="text-xs border-amber-300 hover:bg-amber-100"
                      >
                        {isRetrying.storyboard ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                        重新生成分镜
                      </Button>
                    </div>
                  </div>
                )}
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
                          {pipelineStep ? `${pipelineStep.label} (${pipelineStep.step}/${pipelineStep.totalSteps})` : '延伸中...'}
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
              </>
              }
            />
          ) : (
            <ContentResultEmpty
              text="输入主题开始创作"
              subText="或从历史记录中选择查看"
            />
          )}
        </div>
      </div>
    </div>
  )
}
