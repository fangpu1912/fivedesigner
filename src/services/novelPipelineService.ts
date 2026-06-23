import { characterDB, sceneDB, propDB, storyboardDB, dubbingDB } from '@/db'
import { getActivePrompt } from '@/services/promptConfigService'
import { parseJSON, callAI, splitContentIntoChunks, mergeSceneChunks } from '@/utils/aiHelper'
import type { PipelineSceneInput } from '@/utils/aiHelper'
import logger from '@/utils/logger'
import { matchAssetsByName } from '@/utils/storyboardReferences'

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
  scene_id: string
  props: string[]
  shot_type: string
  duration: number
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

async function segmentScenesForChunk(chunk: string): Promise<PipelineScene[]> {
  const prompt = getActivePrompt('pipeline_scene_segmentation', { content: chunk })
  const result = await callAI(prompt)
  return parseJSON<PipelineScene[]>(result)
}

async function segmentScenesFullContent(content: string, onProgress?: (msg: string) => void): Promise<PipelineScene[]> {
  if (content.length <= 12000) {
    onProgress?.('场景划分（单次）')
    return segmentScenesForChunk(content)
  }

  const chunks = splitContentIntoChunks(content, 10000)
  onProgress?.(`场景划分（分 ${chunks.length} 块处理）`)

  const allScenes: PipelineScene[] = []
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(`场景划分 - 第 ${i + 1}/${chunks.length} 块`)
    try {
      const chunkScenes = await segmentScenesForChunk(chunks[i]!)
      allScenes.push(...chunkScenes)
    } catch (e) {
      logger.error(`[Pipeline] 第 ${i + 1} 块场景划分失败:`, e)
    }
  }

  const merged = mergeSceneChunks(allScenes as PipelineSceneInput[]) as PipelineScene[]
  logger.info(`[Pipeline] 分块划分完成，合并后 ${merged.length} 个场景（原始 ${allScenes.length} 个）`)
  return merged
}

async function extractAssetsForContent(
  content: string,
  scenesSummary: string,
): Promise<{ characters: PipelineCharacter[]; scenes: PipelineSceneAsset[]; props: PipelineProp[] }> {
  if (content.length <= 12000) {
    const prompt = getActivePrompt('pipeline_asset_extraction', { content, scenes: scenesSummary })
    const result = await callAI(prompt)
    return parseJSON(result)
  }

  const chunks = splitContentIntoChunks(content, 10000)
  const allAssets: { characters: PipelineCharacter[]; scenes: PipelineSceneAsset[]; props: PipelineProp[] } = {
    characters: [], scenes: [], props: [],
  }

  for (let i = 0; i < chunks.length; i++) {
    try {
      const prompt = getActivePrompt('pipeline_asset_extraction', {
        content: chunks[i]!,
        scenes: scenesSummary,
      })
      const result = await callAI(prompt)
      const chunkAssets = parseJSON<{
        characters: PipelineCharacter[]
        scenes: PipelineSceneAsset[]
        props: PipelineProp[]
      }>(result)

      for (const char of chunkAssets.characters) {
        if (!allAssets.characters.find(c => c.name === char.name)) {
          allAssets.characters.push(char)
        }
      }
      for (const scene of chunkAssets.scenes) {
        if (!allAssets.scenes.find(s => s.name === scene.name)) {
          allAssets.scenes.push(scene)
        }
      }
      for (const prop of chunkAssets.props) {
        if (!allAssets.props.find(p => p.name === prop.name)) {
          allAssets.props.push(prop)
        }
      }
    } catch (e) {
      logger.error(`[Pipeline] 第 ${i + 1} 块资产提取失败:`, e)
    }
  }

  return allAssets
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

  // ====== Step 0: 场景划分（支持长文本分块） ======
  advanceStep('场景划分', 5)

  const scenes = await segmentScenesFullContent(content, (msg) => {
    onProgress?.({ step: currentStep, stepName: msg, percent: 8, totalSteps: 0 })
  })
  logger.info(`[Pipeline] 划分了 ${scenes.length} 个场景`)

  if (scenes.length === 0) {
    throw new Error('场景划分结果为空，请检查剧本内容')
  }

  // ====== Step 1: 全局资产提取（支持长文本分块） ======
  advanceStep('全局资产提取', 15)

  const scenesSummary = scenes.map((s, i) =>
    `场景${i + 1}: ${s.name} - ${s.summary} (角色: ${s.characters.join(', ')})`
  ).join('\n')

  const assets = await extractAssetsForContent(content, scenesSummary)
  logger.info(`[Pipeline] 提取了 ${assets.characters.length} 角色, ${assets.scenes.length} 场景, ${assets.props.length} 道具`)

  // ====== Step 1.5: 保存资产到数据库 ======
  const existingMatch = await matchAssetsByName(
    episodeId,
    assets.characters.map(c => c.name),
    assets.scenes.map(s => s.name),
    assets.props.map(p => p.name),
  )

  const characterIdMap = new Map<string, string>(existingMatch.characterMap)
  for (const char of assets.characters) {
    if (characterIdMap.has(char.name)) continue
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

  const sceneIdMap = new Map<string, string>(existingMatch.sceneMap)
  for (const scene of assets.scenes) {
    if (sceneIdMap.has(scene.name)) continue
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

  const propIdMap = new Map<string, string>(existingMatch.propMap)
  for (const prop of assets.props) {
    if (propIdMap.has(prop.name)) continue
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

  // ====== Step 2: 逐场景串行分镜拆解（保证连续性） ======
  advanceStep('分镜拆解', 25)

  const allShots: PipelineShot[] = []
  const allDubbing: PipelineDubbingResult[] = []
  let previousShotDesc = '（这是第一个场景，没有上一场景）'

  for (let sceneIdx = 0; sceneIdx < scenes.length; sceneIdx++) {
    const scene = scenes[sceneIdx]!
    const scenePercent = 25 + Math.floor((sceneIdx / scenes.length) * 55)

    onProgress?.({
      step: currentStep,
      stepName: `分镜拆解 (${sceneIdx + 1}/${scenes.length}): ${scene.name}`,
      percent: scenePercent,
      currentScene: sceneIdx + 1,
      totalScenes: scenes.length,
      sceneName: scene.name,
      totalSteps: 0,
    })

    const sceneInfo = `--- 场景${sceneIdx + 1}: ${scene.name} ---\n地点: ${scene.location}\n时间: ${scene.time}\n氛围: ${scene.mood}\n出场角色: ${scene.characters.join(', ')}\n叙事功能: ${scene.narrativeFunction}\n概要: ${scene.summary}`

    // 下一场景预告（用于场景退出铺垫）
    const nextScene = scenes[sceneIdx + 1]
    const nextSceneInfo = nextScene
      ? `下一场景: ${nextScene.name}\n地点: ${nextScene.location}\n时间: ${nextScene.time}\n氛围: ${nextScene.mood}\n概要: ${nextScene.summary}`
      : '（这是最后一个场景，无需退出铺垫）'

    const sceneOriginalText = scene.originalText || scene.summary

    const sceneCharacterNames = [...new Set(scene.characters)]
    const characterPromptsStr = sceneCharacterNames
      .map(name => `${name}: ${characterPromptMap.get(name) || '未知角色'}`)
      .join('\n')
    const scenePromptsStr = `${scene.name}: ${scenePromptMap.get(scene.name) || '未知场景'}`
    const propPromptsStr = assets.props
      .map(p => `${p.name}: ${p.prompt}`)
      .join('\n')

    try {
      const breakdownPrompt = getActivePrompt('pipeline_storyboard_breakdown', {
        sceneContent: sceneOriginalText,
        sceneInfo,
        previousShot: previousShotDesc,
        nextSceneInfo,
        assetList: assetListStr,
        characterPrompts: characterPromptsStr,
        scenePrompts: scenePromptsStr,
        propPrompts: propPromptsStr,
      })

      const breakdownResult = await callAI(breakdownPrompt, { maxTokens: 16384 })
      const shots: PipelineShot[] = parseJSON<PipelineShot[]>(breakdownResult)
      logger.info(`[Pipeline] 场景${sceneIdx + 1} "${scene.name}" 拆解了 ${shots.length} 个镜头`)

      if (shots.length > 0) {
        allShots.push(...shots)
        const lastShot = shots[shots.length - 1]!
        previousShotDesc = [
          `景别: ${lastShot.shot_type || '固定'}`,
          `画面: ${lastShot.prompt || lastShot.description || ''}`,
          `动态: ${lastShot.videoPrompt || ''}`,
        ].join('\n')
      }

      try {
        const shotsDescription = shots.map((shot, i) => {
          const parts = [
            `镜头${i + 1}:`,
            `  画面: ${shot.description}`,
            `  场景: ${shot.scene_id}`,
            `  景别运镜: ${shot.shot_type}`,
            `  时长: ${shot.duration}秒`,
            `  出场角色: ${shot.characters.join(', ')}`,
            `  出场道具: ${shot.props.join(', ') || '无'}`,
          ]
          return parts.join('\n')
        }).join('\n\n')

        const characterVoicesStr = assets.characters
          .map(c => c.voiceProfile ? `${c.name}: ${c.voiceProfile}` : '')
          .filter(Boolean)
          .join('\n')

        const dubbingPrompt = getActivePrompt('pipeline_dubbing_generation', {
          shotsDescription,
          characterVoices: characterVoicesStr || '无角色声音描述',
        })
        const dubbingResult = await callAI(dubbingPrompt)
        const dubbing: PipelineDubbingResult[] = parseJSON<PipelineDubbingResult[]>(dubbingResult)
        allDubbing.push(...dubbing)
      } catch (e) {
        logger.error(`[Pipeline] 配音生成失败，场景${sceneIdx + 1}`, e)
      }
    } catch (e) {
      logger.error(`[Pipeline] 分镜拆解失败，场景${sceneIdx + 1} "${scene.name}"`, e)
    }
  }

  // ====== Step 3: 保存分镜和配音到数据库 ======
  advanceStep('保存分镜数据', 85)

  let globalShotIndex = 0
  let dubbingIdx = 0

  for (const shot of allShots) {
    globalShotIndex++

    const promptText = shot.prompt || shot.description
    const videoPromptText = shot.videoPrompt || shot.description

    const characterIds = shot.characters
      .map(name => characterIdMap.get(name))
      .filter((id): id is string => !!id)
    const sceneId = sceneIdMap.get(shot.scene_id) || undefined
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

    const sceneDubbing = allDubbing.filter(d =>
      shot.characters.includes(d.character)
    )
    for (const item of sceneDubbing) {
      dubbingIdx++
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

  advanceStep('完成', 100)
  logger.info(`[Pipeline] 流水线完成，共生成 ${globalShotIndex} 个分镜`)
}
