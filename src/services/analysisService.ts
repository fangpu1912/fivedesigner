/**
 * 对标分析服务
 * 基于项目现有架构实现
 * - 分析视频并提取结构
 * - 分析结果直接创建为标准 Project/Episode/Storyboard
 */

import { readFile } from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'
import { v4 as uuidv4 } from 'uuid'

import { projectDB, episodeDB, scriptDB, storyboardDB, characterDB, sceneDB, propDB } from '@/db'
import type { AnalysisTask, AnalysisResult } from '@/types/analysis'
import type { ExtractedAsset, ExtractedDubbing, ExtractedShot } from '@/types'
import { AI } from './vendor/aiService'
import { db } from '@/db'
import { getActivePrompt } from './promptConfigService'
import logger from '@/utils/logger'
import { matchAssetsByName } from '@/utils/storyboardReferences'

// 定义数据库行类型
type AnalysisTaskRow = {
  id: string
  status: string
  filename: string | null
  file_path: string | null
  created_at: string
  result: string | null
  error: string | null
}

// 场景检测结果
type SceneDetectionInfo = {
  id: number
  start_time: number
   end_time: number
  start_time_formatted: string
  end_time_formatted: string
  duration: number
  duration_formatted: string
  screenshot_path: string
}

type SceneDetectionResult = {
  scenes: SceneDetectionInfo[]
  total_scenes: number
  video_duration: number
  video_fps: number
  video_width: number
  video_height: number
}

/**
 * 读取图片文件为 base64 Data URL
 */
async function readImageAsDataUrl(imagePath: string): Promise<string> {
  const imageData = await readFile(imagePath)
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < imageData.length; i += chunkSize) {
    binary += String.fromCharCode(...imageData.slice(i, i + chunkSize))
  }
  const base64 = btoa(binary)
  const ext = imagePath.split('.').pop()?.toLowerCase() || 'png'
  const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'
  return `data:${mimeType};base64,${base64}`
}

/**
 * 读取视频文件为 base64 Data URL
 */
async function readVideoAsDataUrl(videoPath: string): Promise<string> {
  const videoData = await readFile(videoPath)
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < videoData.length; i += chunkSize) {
    binary += String.fromCharCode(...videoData.slice(i, i + chunkSize))
  }
  const base64 = btoa(binary)
  const ext = videoPath.split('.').pop()?.toLowerCase() || 'mp4'
  const mimeType = ext === 'mov' ? 'video/quicktime' : 'video/mp4'
  return `data:${mimeType};base64,${base64}`
}

/**
 * 使用 FFmpeg 按场景（分镜）抽取关键帧
 *
 * 策略：
 * 1. 场景切换检测（分镜边界）
 * 2. 每个有效场景取3帧：开始帧、中间帧、结束帧
 * 3. 过滤微小场景（<1秒的接缝帧/转场）
 * 4. 场景前后帧（确保捕捉完整场景内容）
 *
 * 返回截图路径列表（按时间顺序）
 */
async function extractVideoFrames(filePath: string): Promise<string[]> {
  const allFramePaths: string[] = []

  try {
    // 1. 场景切换检测
    logger.info('[AnalysisService] Detecting scenes (shots)...')
    const result = await invoke<SceneDetectionResult>('detect_video_scenes', {
      request: {
        video_path: filePath,
        threshold: 0.25,
        output_dir: '',
      },
    })

    if (!result.scenes || result.scenes.length === 0) {
      throw new Error('未检测到场景切换')
    }

    logger.info(`[AnalysisService] Detected ${result.scenes.length} raw scenes`)

    // 2. 过滤微小场景（<1秒的可能是转场/闪烁）
    const validScenes = result.scenes.filter(s => s.duration >= 1.0)
    logger.info(`[AnalysisService] Valid scenes (>=1s): ${validScenes.length}`)

    // 3. 为每个有效场景提取关键帧
    for (const scene of validScenes) {
      const timestamps: number[] = []

      // 场景开始帧（延后0.2秒，避免切镜模糊）
      timestamps.push(scene.start_time + 0.2)

      // 场景中间帧（如果场景超过3秒）
      if (scene.duration > 3.0) {
        timestamps.push(scene.start_time + scene.duration * 0.5)
      }

      // 场景结束帧（提前0.3秒，避免切到下一个场景）
      if (scene.duration > 2.0) {
        timestamps.push(scene.end_time - 0.3)
      }

      // 截取帧
      for (const ts of timestamps) {
        try {
          const outputPath = await invoke<string>('capture_frame', {
            videoPath: filePath,
            timestamp: ts,
            outputPath: '',
          })
          if (outputPath && outputPath.length > 0) {
            allFramePaths.push(outputPath)
          }
        } catch (error) {
          logger.warn(`[AnalysisService] Failed to capture frame at ${ts}s:`, error)
        }
      }
    }

    // 4. 如果场景太少，补充首帧和尾帧
    if (validScenes.length < 3 && result.video_duration > 0) {
      // 首帧
      try {
        const firstFrame = await invoke<string>('capture_frame', {
          videoPath: filePath,
          timestamp: 0.5,
          outputPath: '',
        })
        if (firstFrame) allFramePaths.unshift(firstFrame)
      } catch { /* ignore */ }

      // 尾帧
      try {
        const lastFrame = await invoke<string>('capture_frame', {
          videoPath: filePath,
          timestamp: Math.max(0, result.video_duration - 1),
          outputPath: '',
        })
        if (lastFrame) allFramePaths.push(lastFrame)
      } catch { /* ignore */ }
    }
  } catch (error) {
    logger.error('[AnalysisService] Scene-based frame extraction failed:', error)
    throw error
  }

  // 去重
  const uniqueFrames = allFramePaths.filter((p, i, arr) =>
    p && p.length > 0 && arr.indexOf(p) === i
  )

  logger.info(`[AnalysisService] Total extracted frames: ${uniqueFrames.length}`)

  return uniqueFrames
}

// 视频分析服务
export const analysisService = {
  // 上传并分析视频
  async uploadAndAnalyze(
    filePath: string,
    filename: string,
    options: { mode?: 'frames' | 'video' } = {}
  ): Promise<string> {
    const analysisId = uuidv4()
    const now = new Date().toISOString()

    // 创建分析任务记录
    await db.execute(
      `INSERT INTO analysis_tasks (id, status, filename, file_path, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
      [analysisId, 'pending', filename, filePath, now, now]
    )

    // 异步开始分析
    this.processAnalysis(analysisId, filePath, options).catch(error => {
      logger.error('[AnalysisService] Analysis failed:', error)
      db.execute(
        `UPDATE analysis_tasks SET status = $1, error = $2, updated_at = $3 WHERE id = $4`,
        ['failed', error instanceof Error ? error.message : '分析失败', new Date().toISOString(), analysisId]
      )
    })

    return analysisId
  },

  // 获取分析任务
  async getAnalysisTask(analysisId: string): Promise<AnalysisTask | null> {
    const rows = await db.select<AnalysisTaskRow>('SELECT * FROM analysis_tasks WHERE id = $1', [analysisId])

    if (rows.length === 0) return null

    const row = rows[0]!
    return {
      analysis_id: row.id,
      status: row.status as AnalysisTask['status'],
      filename: row.filename || undefined,
      file_path: row.file_path || undefined,
      created_at: row.created_at,
      result: row.result ? JSON.parse(row.result) as AnalysisResult : null,
      error: row.error,
    }
  },

  // 获取所有分析任务（按时间倒序）
  async getAllAnalysisTasks(): Promise<AnalysisTask[]> {
    const rows = await db.select<AnalysisTaskRow>('SELECT * FROM analysis_tasks ORDER BY created_at DESC')

    return rows.map((row) => ({
      analysis_id: row.id,
      status: row.status as AnalysisTask['status'],
      filename: row.filename || undefined,
      file_path: row.file_path || undefined,
      created_at: row.created_at,
      result: row.result ? JSON.parse(row.result) as AnalysisResult : null,
      error: row.error,
    }))
  },

  // 删除分析任务
  async deleteAnalysisTask(analysisId: string): Promise<void> {
    await db.execute('DELETE FROM analysis_tasks WHERE id = $1', [analysisId])
  },

  // 处理分析任务
  async processAnalysis(
    analysisId: string,
    filePath: string,
    options: { mode?: 'frames' | 'video' } = {}
  ): Promise<void> {
    const mode = options.mode || 'frames'

    // 更新状态为处理中
    await db.execute(
      `UPDATE analysis_tasks SET status = $1, updated_at = $2 WHERE id = $3`,
      ['processing', new Date().toISOString(), analysisId]
    )

    try {
      let messages: { role: string; content: string }[]

      if (mode === 'video') {
        // ===== 视频上传模式 =====
        logger.info('[AnalysisService] Video upload mode: reading video file...')

        // 读取视频为 base64
        const videoDataUrl = await readVideoAsDataUrl(filePath)

        // 构建提示词
        const analysisPrompt = getActivePrompt('video_remake', {
          videoDescription: `【对标分析】请分析以下参考视频，拆解其核心创作要素，提取角色、场景、道具、分镜和整体风格特征。`,
        })

        // 构建消息：提示词 + 视频
        messages = [
          { role: 'user', content: analysisPrompt },
          { role: 'user', content: `参考视频: ${videoDataUrl}` },
        ]

        logger.info('[AnalysisService] Calling AI VL analyze with video upload...')
      } else {
        // ===== 关键帧模式（默认） =====
        logger.info('[AnalysisService] Frame extraction mode: extracting key frames...')

        // 1. 按场景（分镜）抽取关键帧
        const framePaths = await extractVideoFrames(filePath)

        if (framePaths.length === 0) {
          throw new Error('无法从视频中提取关键帧，请确保 FFmpeg 已安装')
        }

        // 2. 读取关键帧为 base64
        const frameDataUrls: string[] = []
        for (const framePath of framePaths) {
          try {
            const dataUrl = await readImageAsDataUrl(framePath)
            frameDataUrls.push(dataUrl)
          } catch (error) {
            logger.warn(`[AnalysisService] Failed to read frame ${framePath}:`, error)
          }
        }

        if (frameDataUrls.length === 0) {
          throw new Error('无法读取视频帧图片')
        }

        // 3. 构建提示词
        const analysisPrompt = getActivePrompt('video_remake', {
          videoDescription: `【对标分析】请分析以下参考视频的关键帧。这些帧按时间顺序排列，每个场景（分镜）包含开始帧、中间帧和结束帧，完整展示了视频的分镜结构和视觉内容。请基于这些帧提取所有可复用的创作要素，包括角色、场景、道具、分镜和整体风格特征。`,
        })

        // 4. 构建消息：提示词 + 关键帧图片
        messages = [{ role: 'user', content: analysisPrompt }]

        // 添加关键帧图片（按时间顺序，标注场景信息）
        for (let i = 0; i < frameDataUrls.length; i++) {
          messages.push({
            role: 'user',
            content: `关键帧 ${i + 1}/${frameDataUrls.length}: ${frameDataUrls[i]}`,
          })
        }

        logger.info(`[AnalysisService] Calling AI VL analyze with ${frameDataUrls.length} frames...`)
      }

      // 调用 AI 视觉分析
      const response = await AI.VL.analyze({
        messages,
        temperature: 0.7,
        maxTokens: 16384,
      })

      // 解析 AI 响应
      let result: AnalysisResult
      try {
        const text = typeof response === 'string' ? response : JSON.stringify(response)
        logger.info('[AnalysisService] AI response length:', text.length, 'first 200:', text.substring(0, 200))
        logger.info('[AnalysisService] AI response last 200:', text.substring(Math.max(0, text.length - 200)))
        
        let parsed: unknown = null
        
        // 1. 尝试直接解析整个文本
        try {
          parsed = JSON.parse(text)
          logger.info('[AnalysisService] Step 1 (direct parse) succeeded')
        } catch (e1) {
          logger.info('[AnalysisService] Step 1 (direct parse) failed:', e1 instanceof Error ? e1.message : String(e1))
        }
        
        // 2. 尝试提取 markdown 代码块中的 JSON
        if (!parsed) {
          const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
          if (codeBlockMatch && codeBlockMatch[1]) {
            const extracted = codeBlockMatch[1].trim()
            logger.info('[AnalysisService] Step 2 (code block) extracted length:', extracted.length, 'first 100:', extracted.substring(0, 100))
            try {
              parsed = JSON.parse(extracted)
              logger.info('[AnalysisService] Step 2 (code block) succeeded')
            } catch (e2) {
              logger.info('[AnalysisService] Step 2 (code block) parse failed:', e2 instanceof Error ? e2.message : String(e2))
            }
          } else {
            logger.info('[AnalysisService] Step 2: no code block match found')
          }
        }
        
        // 3. 尝试提取第一个 { 和最后一个 } 之间的内容
        if (!parsed) {
          const firstBrace = text.indexOf('{')
          const lastBrace = text.lastIndexOf('}')
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            const extracted = text.substring(firstBrace, lastBrace + 1)
            logger.info('[AnalysisService] Step 3 (brace extraction) length:', extracted.length)
            try {
              parsed = JSON.parse(extracted)
              logger.info('[AnalysisService] Step 3 (brace extraction) succeeded')
            } catch (e3) {
              logger.info('[AnalysisService] Step 3 (brace extraction) parse failed:', e3 instanceof Error ? e3.message : String(e3))
              // 尝试修复常见的 JSON 截断问题
              try {
                const fixed = extracted.replace(/,\s*([}\]])/g, '$1')
                parsed = JSON.parse(fixed)
                logger.info('[AnalysisService] Step 3 (fixed trailing comma) succeeded')
              } catch {
                // 最终尝试：逐字符匹配大括号
                let depth = 0
                let endIdx = -1
                for (let i = firstBrace; i < text.length; i++) {
                  if (text[i] === '{') depth++
                  else if (text[i] === '}') depth--
                  if (depth === 0) { endIdx = i; break }
                }
                if (endIdx > firstBrace) {
                  const balanced = text.substring(firstBrace, endIdx + 1)
                  try {
                    parsed = JSON.parse(balanced)
                    logger.info('[AnalysisService] Step 3 (balanced brace) succeeded')
                  } catch (e4) {
                    logger.info('[AnalysisService] Step 3 (balanced brace) failed:', e4 instanceof Error ? e4.message : String(e4))
                  }
                }
              }
            }
          }
        }
        
        if (parsed) {
          result = this.normalizeAnalysisResult(parsed)
        } else {
          logger.error('[AnalysisService] All JSON parsing attempts failed. Response type:', typeof response, 'length:', text.length)
          throw new Error('AI 返回的结果无法解析为 JSON')
        }
      } catch (parseError) {
        logger.error('[AnalysisService] Failed to parse analysis result:', parseError instanceof Error ? parseError.message : String(parseError))
        throw new Error('分析结果解析失败，请检查 AI 服务配置')
      }

      // 保存分析结果
      await db.execute(
        `UPDATE analysis_tasks SET status = $1, result = $2, updated_at = $3 WHERE id = $4`,
        ['completed', JSON.stringify(result), new Date().toISOString(), analysisId]
      )

      logger.info('[AnalysisService] Analysis completed successfully')
    } catch (error) {
      logger.error('[AnalysisService] Analysis error:', error)
      await db.execute(
        `UPDATE analysis_tasks SET status = $1, error = $2, updated_at = $3 WHERE id = $4`,
        ['failed', error instanceof Error ? error.message : '分析失败', new Date().toISOString(), analysisId]
      )
      throw error
    }
  },

  // 规范化分析结果
  normalizeAnalysisResult(parsed: unknown): AnalysisResult {
    const data = parsed as Record<string, unknown>

    // 辅助函数：获取数组字段（支持多种字段名变体）
    const getArrayField = (fieldNames: string[]): unknown[] => {
      for (const name of fieldNames) {
        const value = data[name]
        if (Array.isArray(value) && value.length > 0) {
          return value
        }
      }
      return []
    }

    // 提取角色列表（支持 characters / character / roles / casts 等字段名）
    const characterList = getArrayField(['characters', 'character', 'roles', 'casts', '人物', '角色'])
    const characters = characterList.length > 0
      ? characterList.map((c: unknown, index: number) => {
          const char = c as Record<string, unknown>
          return {
            character_id: Number(char.character_id || char.id || index + 1),
            name: String(char.name || char.character_name || `角色${index + 1}`),
            description: String(char.description || char.desc || char.introduction || ''),
            prompt: String(char.prompt || char.appearance_prompt || char.image_prompt || ''),
            wardrobeVariants: char.wardrobeVariants ? String(char.wardrobeVariants) : undefined,
            replacement_image: null,
          }
        })
      : []

    // 提取场景列表（支持 scenes / scene / locations / settings / backgrounds 等字段名）
    const sceneList = getArrayField(['scenes', 'scene', 'locations', 'settings', 'backgrounds', '场景', '地点'])
    const scenes = sceneList.length > 0
      ? sceneList.map((s: unknown, index: number) => {
          const scene = s as Record<string, unknown>
          return {
            scene_id: Number(scene.scene_id || scene.id || index + 1),
            name: String(scene.name || scene.scene_name || `场景${index + 1}`),
            description: String(scene.description || scene.desc || ''),
            prompt: String(scene.prompt || scene.image_prompt || ''),
          }
        })
      : []

    // 提取道具列表（支持 props / prop / items / objects 等字段名）
    const propList = getArrayField(['props', 'prop', 'items', 'objects', '道具', '物品'])
    const props = propList.length > 0
      ? propList.map((p: unknown, index: number) => {
          const prop = p as Record<string, unknown>
          return {
            prop_id: Number(prop.prop_id || prop.id || index + 1),
            name: String(prop.name || prop.prop_name || `道具${index + 1}`),
            description: String(prop.description || prop.desc || ''),
            prompt: String(prop.prompt || prop.image_prompt || ''),
          }
        })
      : []

    // 提取分镜列表（支持 storyboards / shots / scenes / cuts / frames / 分镜 / 镜头 等字段名）
    const storyboardList = getArrayField([
      'storyboards', 'shots', 'cuts', 'frames', '分镜', '镜头',
      'scenes', 'scene', 'shots_list', 'storyboard_list'
    ])
    // 处理分镜：直接使用AI返回的结果，不做自动生成
    const storyboards = storyboardList.length > 0
      ? storyboardList.map((s: unknown, index: number) => {
          const sb = s as Record<string, unknown>
          return {
            storyboard_id: Number(sb.storyboard_id || sb.shot_id || sb.scene_id || sb.id || index + 1),
            timestamp: String(sb.timestamp || sb.time || ''),
            duration: Number(sb.duration || sb.length || 5),
            shot_type: String(sb.shot_type || sb.shotType || sb.camera_angle || ''),
            camera_motion: String(sb.camera_motion || sb.cameraMovement || ''),
            description: String(sb.description || sb.desc || sb.voiceover || sb.content || ''),
            prompt: String(sb.prompt || sb.image_prompt || sb.imagePrompt || ''),
            videoPrompt: String(sb.videoPrompt || sb.video_prompt || sb.videoPrompt || sb.motion_prompt || ''),
            scene_id: sb.scene_id ? String(sb.scene_id) : undefined,
            characters: Array.isArray(sb.characters) ? sb.characters.map(String) : undefined,
            props: Array.isArray(sb.props) ? sb.props.map(String) : undefined,
            transition: String(sb.transition || ''),
          }
        })
      : []

    logger.info('[AnalysisService] Normalized result:', {
      characters: characters.length,
      scenes: scenes.length,
      props: props.length,
      storyboards: storyboards.length,
      availableFields: Object.keys(data),
    })

    return {
      title: String(data.title || data.name || '未命名视频'),
      style: String(data.style || data.visual_style || data.style_description || ''),
      aspect_ratio: String(data.aspect_ratio || data.aspectRatio || data.ratio || '9:16'),
      characters,
      scenes,
      props,
      storyboards,
      raw_analysis: JSON.stringify(data),
    }
  },

  // 从分析创建项目 - 使用现有的 projectDB, episodeDB, storyboardDB
  async createProjectFromAnalysis(
    analysisId: string,
    options: {
      useCharacterImages?: boolean
      customTitle?: string
      projectId?: string
    } = {}
  ): Promise<{ projectId: string; episodeId: string; characterCount: number; storyboardCount: number; sceneCount: number; propCount: number }> {
    const task = await this.getAnalysisTask(analysisId)
    if (!task || !task.result) {
      throw new Error('分析任务或结果不存在')
    }

    const result = task.result
    let projectId: string

    // 1. 如果传入了 projectId，使用现有项目；否则创建新项目
    if (options.projectId) {
      projectId = options.projectId
    } else {
      const project = await projectDB.create({
        name: options.customTitle || result.title,
        description: `从对标分析创建：${result.style}`,
        aspect_ratio: result.aspect_ratio,
        visual_style: result.style,
        quality_prompt: 'high quality, detailed',
      })
      projectId = project.id
    }

    // 2. 获取该项目已有剧集，计算新的剧集编号
    const existingEpisodes = await episodeDB.getByProject(projectId)
    const maxEpisodeNumber = existingEpisodes.reduce(
      (max, ep) => Math.max(max, ep.episode_number ?? 0),
      0
    )

    // 3. 创建剧集
    const episode = await episodeDB.create({
      project_id: projectId,
      name: options.customTitle || '主剧集',
      description: `从对标分析创建`,
      episode_number: maxEpisodeNumber + 1,
    })

    // 4. 创建角色，建立名称到ID的映射
    const existingMatch = await matchAssetsByName(
      episode.id,
      result.characters.map(c => c.name),
      result.scenes.map(s => s.name),
      result.props.map(p => p.name),
    )

    const characterMap = new Map<string, string>(existingMatch.characterMap) // name -> db id
    const characterIdMap = new Map<number, string>() // analysis character_id -> db id
    for (const char of result.characters) {
      if (characterMap.has(char.name)) {
        logger.info(`[Analysis] 复用已有角色: ${char.name}`)
        characterIdMap.set(char.character_id, characterMap.get(char.name)!)
        continue
      }
      const character = await characterDB.create({
        project_id: projectId,
        episode_id: episode.id,
        name: char.name,
        description: char.description,
        prompt: char.prompt,
        image: char.replacement_image || undefined,
      })
      characterMap.set(char.name, character.id)
      characterIdMap.set(char.character_id, character.id)
    }

    // 5. 创建场景，建立名称到ID的映射
    const sceneMap = new Map<string, string>(existingMatch.sceneMap) // name -> db id
    const sceneIdMap = new Map<number, string>() // analysis scene_id -> db id
    for (const scene of result.scenes) {
      if (sceneMap.has(scene.name)) {
        logger.info(`[Analysis] 复用已有场景: ${scene.name}`)
        sceneIdMap.set(scene.scene_id, sceneMap.get(scene.name)!)
        continue
      }
      const createdScene = await sceneDB.create({
        project_id: projectId,
        episode_id: episode.id,
        name: scene.name,
        description: scene.description,
        prompt: scene.prompt,
      })
      sceneMap.set(scene.name, createdScene.id)
      sceneIdMap.set(scene.scene_id, createdScene.id)
    }

    // 6. 创建道具，建立名称到ID的映射
    const propMap = new Map<string, string>(existingMatch.propMap) // name -> db id
    const propIdMap = new Map<number, string>() // analysis prop_id -> db id
    for (const prop of result.props) {
      if (propMap.has(prop.name)) {
        logger.info(`[Analysis] 复用已有道具: ${prop.name}`)
        propIdMap.set(prop.prop_id, propMap.get(prop.name)!)
        continue
      }
      const createdProp = await propDB.create({
        project_id: projectId,
        episode_id: episode.id,
        name: prop.name,
        description: prop.description,
        prompt: prop.prompt,
      })
      propMap.set(prop.name, createdProp.id)
      propIdMap.set(prop.prop_id, createdProp.id)
    }

    // 7. 创建剧本
    const scriptContent = result.storyboards.map((s, i) =>
      `分镜${i + 1}：${s.description}`
    ).join('\n\n')

    await scriptDB.create({
      episode_id: episode.id,
      title: result.title,
      content: scriptContent,
      extracted_assets: [
        ...result.characters.map(c => ({
          type: 'character' as const,
          name: c.name,
          description: c.description,
          prompt: c.prompt,
        })),
        ...result.scenes.map(s => ({
          type: 'scene' as const,
          name: s.name,
          description: s.description,
          prompt: s.prompt,
        })),
        ...result.props.map(p => ({
          type: 'prop' as const,
          name: p.name,
          description: p.description,
          prompt: p.prompt,
        })),
      ] as ExtractedAsset[],
      extracted_dubbing: result.storyboards.map(s => ({
        character: '',
        line: s.description,
      })) as ExtractedDubbing[],
      extracted_shots: result.storyboards.map(s => ({
        id: `shot_${s.storyboard_id}`,
        scene_id: '',
        scene: `分镜${s.storyboard_id}`,
        description: s.description,
        duration: `${s.duration}秒`,
        prompt: s.prompt,
        videoPrompt: s.videoPrompt,
      })) as ExtractedShot[],
    })

    // 8. 创建分镜，关联角色/场景/道具
    for (let i = 0; i < result.storyboards.length; i++) {
      const sb = result.storyboards[i]!

      // 解析分镜中提到的角色名称，匹配到数据库ID
      const characterIds: string[] = []
      if (sb.characters && sb.characters.length > 0) {
        for (const charName of sb.characters) {
          const charId = characterMap.get(charName)
          if (charId) {
            characterIds.push(charId)
          }
        }
      }

      // 解析分镜中提到的道具名称，匹配到数据库ID
      const propIds: string[] = []
      if (sb.props && sb.props.length > 0) {
        for (const propName of sb.props) {
          const propId = propMap.get(propName)
          if (propId) {
            propIds.push(propId)
          }
        }
      }

      // 尝试从分镜描述中匹配场景
      let sceneId: string | undefined
      for (const [sceneName, sid] of sceneMap) {
        if (sb.description.includes(sceneName)) {
          sceneId = sid
          break
        }
      }

      await storyboardDB.create({
        project_id: projectId,
        episode_id: episode.id,
        name: `分镜 ${i + 1}`,
        description: sb.description,
        prompt: sb.prompt,
        video_prompt: sb.videoPrompt,
        duration: sb.duration,
        sort_order: i,
        status: 'pending',
        scene_id: sceneId,
        character_ids: characterIds,
        prop_ids: propIds,
        reference_images: [],
        video_reference_images: [],
      })
    }

    return {
      projectId,
      episodeId: episode.id,
      characterCount: result.characters.length,
      storyboardCount: result.storyboards.length,
      sceneCount: result.scenes.length,
      propCount: result.props.length,
    }
  },

  // 更新分析结果中的角色图片
  async updateCharacterImage(
    analysisId: string,
    characterId: number,
    imageUrl: string | null
  ): Promise<void> {
    const task = await this.getAnalysisTask(analysisId)
    if (!task || !task.result) {
      throw new Error('分析任务或结果不存在')
    }

    const result = task.result
    const character = result.characters.find(c => c.character_id === characterId)
    if (!character) {
      throw new Error('角色不存在')
    }

    character.replacement_image = imageUrl

    await db.execute(
      `UPDATE analysis_tasks SET result = $1, updated_at = $2 WHERE id = $3`,
      [JSON.stringify(result), new Date().toISOString(), analysisId]
    )
  },
}

export default analysisService
