import { AI } from '@/services/vendor/aiService'
import { getActivePrompt } from '@/services/promptConfigService'
import { characterDB, sceneDB, propDB, storyboardDB, dubbingDB } from '@/db'
import logger from '@/utils/logger'
import { createProductionScheduler, ProductionTask, ProductionProgress } from '@/services/productionAgentService'

export interface PipelineScene {
  name: string
  summary: string
  originalText: string
  location: string
  time: string
  mood: string
  characters: string[]
  narrativeFunction: string
}

export interface PipelineCharacter {
  name: string
  description: string
  prompt: string
  staticViews?: string
  wardrobeVariants?: string
  voiceProfile?: string
}

export interface PipelineSceneAsset {
  name: string
  description: string
  prompt: string
}

export interface PipelineProp {
  name: string
  description: string
  prompt: string
}

export interface PipelineShot {
  description: string
  prompt: string
  videoPrompt: string
  characters: string[]
  scene: string
  props: string[]
  cameraAngle: string
  duration: number
  dialogues: PipelineDialogue[]
}

export interface PipelineDialogue {
  character: string
  line: string
  emotion: string
}

export interface PipelineDubbingResult {
  character: string
  line: string
  emotion: string
  audio_prompt: string
}

export interface PipelineProgress {
  step: number
  stepName: string
  currentScene?: number
  totalScenes?: number
  sceneName?: string
  percent: number
  totalSteps: number
}

export type PipelineProgressCallback = (progress: PipelineProgress) => void

function parseJSON<T>(text: string): T {
  let cleaned = text.trim()

  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1]!.trim()
  }

  try {
    return JSON.parse(cleaned) as T
  } catch {}

  const firstArr = cleaned.indexOf('[')
  const firstObj = cleaned.indexOf('{')
  const startIdx = firstArr === -1 ? firstObj : firstObj === -1 ? firstArr : Math.min(firstArr, firstObj)

  if (startIdx === -1) {
    throw new Error(`无法从AI响应中提取JSON: ${cleaned.substring(0, 200)}`)
  }

  const openChar = cleaned[startIdx]
  const closeChar = openChar === '[' ? ']' : '}'

  let depth = 0
  let inStr = false
  let escape = false
  for (let i = startIdx; i < cleaned.length; i++) {
    const ch = cleaned[i]
    if (escape) { escape = false; continue }
    if (ch === '\\' && inStr) { escape = true; continue }
    if (ch === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (ch === openChar) depth++
    if (ch === closeChar) {
      depth--
      if (depth === 0) {
        const candidate = cleaned.substring(startIdx, i + 1)
        try {
          return JSON.parse(candidate) as T
        } catch {}
        break
      }
    }
  }

  const arrMatch = cleaned.match(/\[[\s\S]*?\]/)
  const objMatch = cleaned.match(/\{[\s\S]*?\}/)
  const fallback = arrMatch?.[0] || objMatch?.[0]
  if (fallback) {
    return JSON.parse(fallback) as T
  }

  throw new Error(`无法解析AI响应为JSON: ${cleaned.substring(0, 300)}`)
}

async function callAI(prompt: string): Promise<string> {
  try {
    const result = await AI.Text.generate({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      maxTokens: 8192,
    })
    if (!result) {
      throw new Error('AI 返回了空结果')
    }
    return result
  } catch (error) {
    const msg = error instanceof Error ? error.message : (typeof error === 'string' ? error : JSON.stringify(error))
    throw new Error(`AI 生成失败: ${msg}`)
  }
}

export async function runPipeline(
  content: string,
  projectId: string,
  episodeId: string,
  onProgress?: PipelineProgressCallback
): Promise<void> {
  let currentStep = 0
  const advanceStep = (stepName: string, percent: number, sceneInfo?: { current: number; total: number; name: string }) => {
    currentStep++
    onProgress?.({
      step: currentStep,
      stepName,
      percent,
      currentScene: sceneInfo?.current,
      totalScenes: sceneInfo?.total,
      sceneName: sceneInfo?.name,
      totalSteps: 0,
    })
  }

  advanceStep('场景划分', 5)

  const segmentationPrompt = getActivePrompt('pipeline_scene_segmentation', {
    content: content.substring(0, 12000),
  })

  const segmentationResult = await callAI(segmentationPrompt)
  const scenes: PipelineScene[] = parseJSON<PipelineScene[]>(segmentationResult)
  logger.info(`[Pipeline] 划分了 ${scenes.length} 个场景`)

  advanceStep('全局资产提取', 15)

  const scenesSummary = scenes.map((s, i) => `场景${i + 1}: ${s.name} - ${s.summary} (角色: ${s.characters.join(', ')})`).join('\n')

  const assetPrompt = getActivePrompt('pipeline_asset_extraction', {
    content: content.substring(0, 12000),
    scenes: scenesSummary,
  })

  const assetResult = await callAI(assetPrompt)
  const assets = parseJSON<{
    characters: PipelineCharacter[]
    scenes: PipelineSceneAsset[]
    props: PipelineProp[]
  }>(assetResult)
  logger.info(`[Pipeline] 提取了 ${assets.characters.length} 角色, ${assets.scenes.length} 场景, ${assets.props.length} 道具`)

  const characterIdMap = new Map<string, string>()
  for (const char of assets.characters) {
    try {
      const created = await characterDB.create({
        project_id: projectId,
        episode_id: episodeId,
        name: char.name,
        description: char.description,
        prompt: char.prompt,
        voice_description: char.voiceProfile,
      })
      characterIdMap.set(char.name, created.id)
    } catch (e) {
      logger.error(`[Pipeline] 创建角色失败: ${char.name}`, e)
    }
  }

  const sceneIdMap = new Map<string, string>()
  for (const scene of assets.scenes) {
    try {
      const created = await sceneDB.create({
        project_id: projectId,
        episode_id: episodeId,
        name: scene.name,
        description: scene.description,
        prompt: scene.prompt,
      })
      sceneIdMap.set(scene.name, created.id)
    } catch (e) {
      logger.error(`[Pipeline] 创建场景失败: ${scene.name}`, e)
    }
  }

  const propIdMap = new Map<string, string>()
  for (const prop of assets.props) {
    try {
      const created = await propDB.create({
        project_id: projectId,
        episode_id: episodeId,
        name: prop.name,
        description: prop.description,
        prompt: prop.prompt,
      })
      propIdMap.set(prop.name, created.id)
    } catch (e) {
      logger.error(`[Pipeline] 创建道具失败: ${prop.name}`, e)
    }
  }

  const characterPromptMap = new Map<string, string>()
  for (const char of assets.characters) {
    characterPromptMap.set(char.name, char.prompt)
  }
  const scenePromptMap = new Map<string, string>()
  for (const scene of assets.scenes) {
    scenePromptMap.set(scene.name, scene.prompt)
  }
  const propPromptMap = new Map<string, string>()
  for (const prop of assets.props) {
    propPromptMap.set(prop.name, prop.prompt)
  }

  const assetListStr = [
    `角色: ${assets.characters.map(c => c.name).join(', ')}`,
    `场景: ${assets.scenes.map(s => s.name).join(', ')}`,
    `道具: ${assets.props.map(p => p.name).join(', ')}`,
  ].join('\n')

  const SEGMENT_SIZE = 3
  const segments: PipelineScene[][] = []
  for (let i = 0; i < scenes.length; i += SEGMENT_SIZE) {
    segments.push(scenes.slice(i, i + SEGMENT_SIZE))
  }

  interface SegmentResult {
    segIdx: number
    shots: PipelineShot[]
    dubbingResults: PipelineDubbingResult[]
    error?: string
  }

  const segmentResults: SegmentResult[] = []

  advanceStep('并行分镜拆解', 30)

  const scheduler = createProductionScheduler({ maxConcurrency: 3 })

  scheduler.setProgressCallback((progress: ProductionProgress) => {
    onProgress?.({
      step: currentStep,
      stepName: `并行分镜拆解 (${progress.running}运行中 / ${progress.completed}完成 / ${progress.failed}失败)`,
      percent: 30 + Math.floor(progress.percent * 0.5),
      totalSteps: 0,
    })
  })

  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const segment = segments[segIdx]!
    const segmentScenesInfo = segment.map((scene, i) => {
      const idx = segIdx * SEGMENT_SIZE + i + 1
      return `--- 场景${idx}: ${scene.name} ---\n地点: ${scene.location}\n时间: ${scene.time}\n氛围: ${scene.mood}\n出场角色: ${scene.characters.join(', ')}\n叙事功能: ${scene.narrativeFunction}\n概要: ${scene.summary}`
    }).join('\n\n')

    const segmentOriginalText = segment
      .map(s => s.originalText || s.summary)
      .filter(Boolean)
      .join('\n')

    const segmentCharacterNames = [...new Set(segment.flatMap(s => s.characters))]
    const characterPromptsStr = segmentCharacterNames
      .map(name => `${name}: ${characterPromptMap.get(name) || '未知角色'}`)
      .join('\n')
    const scenePromptsStr = segment
      .map(s => `${s.name}: ${scenePromptMap.get(s.name) || '未知场景'}`)
      .join('\n')
    const propPromptsStr = assets.props
      .map(p => `${p.name}: ${p.prompt}`)
      .join('\n')

    scheduler.addTask({
      id: `segment-${segIdx}`,
      type: 'storyboard_breakdown',
      name: `片段${segIdx + 1}: ${segment.map(s => s.name).join(' / ')}`,
      maxRetries: 2,
      metadata: {
        segIdx,
        segmentScenesInfo,
        segmentOriginalText,
        characterPromptsStr,
        scenePromptsStr,
        propPromptsStr,
      },
    })
  }

  scheduler.registerExecutor('storyboard_breakdown', async (task: ProductionTask) => {
    const { segIdx, segmentScenesInfo, segmentOriginalText, characterPromptsStr, scenePromptsStr, propPromptsStr } = task.metadata as {
      segIdx: number
      segmentScenesInfo: string
      segmentOriginalText: string
      characterPromptsStr: string
      scenePromptsStr: string
      propPromptsStr: string
    }

    const prevSegIdx = segIdx - 1
    const previousShot = prevSegIdx >= 0 && segmentResults[prevSegIdx]
      ? `镜号：${segmentResults[prevSegIdx]!.shots.slice(-1)[0]?.cameraAngle || '固定'}，${segmentResults[prevSegIdx]!.shots.slice(-1)[0]?.description || ''}`
      : '（这是第一个场景，没有上一场景）'

    const breakdownPrompt = getActivePrompt('pipeline_storyboard_breakdown', {
      sceneContent: segmentOriginalText,
      sceneInfo: segmentScenesInfo,
      previousShot,
      assetList: assetListStr,
      characterPrompts: characterPromptsStr,
      scenePrompts: scenePromptsStr,
      propPrompts: propPromptsStr,
    })

    const breakdownResult = await callAI(breakdownPrompt)
    const shots: PipelineShot[] = parseJSON<PipelineShot[]>(breakdownResult)
    logger.info(`[Pipeline] 片段${segIdx + 1} 拆解了 ${shots.length} 个镜头`)

    const allDialogues: Array<{ shotIdx: number; dialogue: PipelineDialogue }> = []
    for (let shotIdx = 0; shotIdx < shots.length; shotIdx++) {
      for (const d of shots[shotIdx]!.dialogues) {
        allDialogues.push({ shotIdx, dialogue: d })
      }
    }

    let dubbingResults: PipelineDubbingResult[] = []
    if (allDialogues.length > 0) {
      const shotsDescription = shots.map((shot, i) => {
        const parts = [
          `镜头${i + 1}:`,
          `  画面: ${shot.description}`,
          `  场景: ${shot.scene}`,
          `  景别运镜: ${shot.cameraAngle}`,
          `  时长: ${shot.duration}秒`,
          `  出场角色: ${shot.characters.join(', ')}`,
          `  出场道具: ${shot.props.join(', ') || '无'}`,
        ]
        if (shot.dialogues.length > 0) {
          parts.push(`  台词: ${shot.dialogues.map(d => `${d.character}（${d.emotion}）："${d.line}"`).join('；')}`)
        }
        return parts.join('\n')
      }).join('\n\n')

      const dialoguesStr = allDialogues
        .map(d => `镜头${d.shotIdx + 1} - ${d.dialogue.character}（${d.dialogue.emotion}）："${d.dialogue.line}"`)
        .join('\n')

      const dubbingPrompt = getActivePrompt('pipeline_dubbing_generation', {
        dialogues: dialoguesStr,
        shotsDescription,
      })

      try {
        const dubbingResult = await callAI(dubbingPrompt)
        dubbingResults = parseJSON<PipelineDubbingResult[]>(dubbingResult)
      } catch (e) {
        logger.error(`[Pipeline] 配音生成失败，片段${segIdx + 1}`, e)
        dubbingResults = allDialogues.map(d => ({
          character: d.dialogue.character,
          line: d.dialogue.line,
          emotion: d.dialogue.emotion,
          audio_prompt: `${d.dialogue.character}，${d.dialogue.emotion}语气`,
        }))
      }
    }

    segmentResults[segIdx] = { segIdx, shots, dubbingResults }
    return { shots, dubbingResults }
  })

  await scheduler.start()

  advanceStep('保存分镜数据', 85)

  let globalShotIndex = 0
  for (let segIdx = 0; segIdx < segmentResults.length; segIdx++) {
    const result = segmentResults[segIdx]
    if (!result || result.shots.length === 0) continue

    const { shots, dubbingResults } = result
    let dubbingIdx = 0

    for (let shotIdx = 0; shotIdx < shots.length; shotIdx++) {
      const shot = shots[shotIdx]!
      globalShotIndex++

      const promptText = shot.prompt || shot.description
      const videoPromptText = shot.videoPrompt || shot.description

      const characterIds = shot.characters
        .map(name => characterIdMap.get(name))
        .filter((id): id is string => !!id)
      const sceneId = sceneIdMap.get(shot.scene) || undefined
      const propIds = shot.props
        .map(name => propIdMap.get(name))
        .filter((id): id is string => !!id)

      let createdStoryboard
      try {
        createdStoryboard = await storyboardDB.create({
          project_id: projectId,
          episode_id: episodeId,
          name: `分镜 ${globalShotIndex}`,
          description: shot.description,
          prompt: promptText,
          video_prompt: videoPromptText,
          sort_order: globalShotIndex - 1,
          status: 'pending',
          character_ids: characterIds,
          scene_id: sceneId,
          prop_ids: propIds,
          reference_images: [],
          video_reference_images: [],
        })
      } catch (e) {
        logger.error(`[Pipeline] 创建分镜失败: 分镜${globalShotIndex}`, e)
        continue
      }

      if (shot.dialogues.length > 0) {
        for (const _d of shot.dialogues) {
          const item = dubbingResults[dubbingIdx]
          dubbingIdx++
          if (!item) continue
          const characterId = characterIdMap.get(item.character)
          try {
            await dubbingDB.create({
              project_id: projectId,
              storyboard_id: createdStoryboard.id,
              character_id: characterId || undefined,
              text: item.line,
              emotion: item.emotion,
              audio_prompt: item.audio_prompt,
              status: 'pending',
              sequence: dubbingIdx,
            })
          } catch (e) {
            logger.error(`[Pipeline] 创建配音失败: ${item.character}`, e)
          }
        }
      }
    }
  }

  advanceStep('完成', 100)
  logger.info(`[Pipeline] 流水线完成，共生成 ${globalShotIndex} 个分镜`)
}
