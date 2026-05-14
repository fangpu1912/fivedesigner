/**
 * 对标分析服务
 * 基于项目现有架构实现
 * - 分析视频并提取结构
 * - 分析结果直接创建为标准 Project/Episode/Storyboard
 */

import { readFile } from '@tauri-apps/plugin-fs'
import { v4 as uuidv4 } from 'uuid'

import { projectDB, episodeDB, scriptDB, storyboardDB, characterDB } from '@/db'
import type { AnalysisTask, AnalysisResult } from '@/types/analysis'
import type { ExtractedAsset, ExtractedDubbing, ExtractedShot } from '@/types'
import { AI } from './vendor/aiService'
import { db } from '@/db'
import { getActivePrompt } from './promptConfigService'

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

// 视频分析服务
export const analysisService = {
  // 上传并分析视频
  async uploadAndAnalyze(filePath: string, filename: string): Promise<string> {
    const analysisId = uuidv4()
    const now = new Date().toISOString()

    // 创建分析任务记录
    await db.execute(
      `INSERT INTO analysis_tasks (id, status, filename, file_path, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
      [analysisId, 'pending', filename, filePath, now, now]
    )

    // 异步开始分析
    this.processAnalysis(analysisId, filePath).catch(error => {
      console.error('[AnalysisService] Analysis failed:', error)
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
  async processAnalysis(analysisId: string, filePath: string): Promise<void> {
    // 更新状态为处理中
    await db.execute(
      `UPDATE analysis_tasks SET status = $1, updated_at = $2 WHERE id = $3`,
      ['processing', new Date().toISOString(), analysisId]
    )

    try {
      // 读取视频文件并转换为 base64（分块处理避免爆栈）
      const videoData = await readFile(filePath)
      let binary = ''
      const chunkSize = 8192
      for (let i = 0; i < videoData.length; i += chunkSize) {
        binary += String.fromCharCode(...videoData.slice(i, i + chunkSize))
      }
      const videoBase64 = btoa(binary)
      const videoDataUrl = `data:video/mp4;base64,${videoBase64}`

      const analysisPrompt = getActivePrompt('inspiration_creation', {
        topic: '【对标分析模式】请分析以下参考视频内容，提取所有可复用的创作要素',
      })

      // 调用项目中的 AI 视觉分析服务
      // 优先使用 vlAgent，如果没有配置则回退到 universalAi
      const response = await AI.VL.analyze({
        messages: [
          { role: 'user', content: analysisPrompt },
          { role: 'user', content: `视频文件: ${videoDataUrl}` }
        ],
        temperature: 0.7,
        maxTokens: 4096,
      })

      // 解析 AI 响应
      let result: AnalysisResult
      try {
        const text = typeof response === 'string' ? response : JSON.stringify(response)
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          result = this.normalizeAnalysisResult(parsed)
        } else {
          throw new Error('AI 返回的结果无法解析为 JSON')
        }
      } catch (parseError) {
        console.error('[AnalysisService] Failed to parse analysis result:', parseError)
        throw new Error('分析结果解析失败，请检查 AI 服务配置')
      }

      // 保存分析结果
      await db.execute(
        `UPDATE analysis_tasks SET status = $1, result = $2, updated_at = $3 WHERE id = $4`,
        ['completed', JSON.stringify(result), new Date().toISOString(), analysisId]
      )
    } catch (error) {
      console.error('[AnalysisService] Analysis error:', error)
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

    return {
      title: String(data.title || '未命名视频'),
      style: String(data.style || ''),
      aspect_ratio: String(data.aspect_ratio || '9:16'),
      total_duration: Number(data.total_duration || 0),
      bgm_style: String(data.bgm_style || ''),
      color_grade: String(data.color_grade || ''),
      overall_prompt: String(data.overall_prompt || ''),
      characters: Array.isArray(data.characters)
        ? data.characters.map((c: unknown, index: number) => {
            const char = c as Record<string, unknown>
            return {
              character_id: Number(char.character_id || index + 1),
              name: String(char.name || `角色${index + 1}`),
              description: String(char.description || ''),
              prompt: String(char.prompt || char.appearance_prompt || ''),
              staticViews: char.staticViews ? String(char.staticViews) : undefined,
              wardrobeVariants: char.wardrobeVariants ? String(char.wardrobeVariants) : undefined,
              replacement_image: null,
            }
          })
        : [],
      scenes: Array.isArray(data.scenes)
        ? data.scenes.map((s: unknown, index: number) => {
            const scene = s as Record<string, unknown>
            return {
              scene_id: Number(scene.scene_id || index + 1),
              name: String(scene.name || `场景${index + 1}`),
              description: String(scene.description || ''),
              prompt: String(scene.prompt || ''),
            }
          })
        : [],
      props: Array.isArray(data.props)
        ? data.props.map((p: unknown, index: number) => {
            const prop = p as Record<string, unknown>
            return {
              prop_id: Number(prop.prop_id || index + 1),
              name: String(prop.name || `道具${index + 1}`),
              description: String(prop.description || ''),
              prompt: String(prop.prompt || ''),
            }
          })
        : [],
      storyboards: Array.isArray(data.storyboards || data.scenes)
        ? ((data.storyboards || data.scenes) as unknown[]).map((s: unknown, index: number) => {
            const sb = s as Record<string, unknown>
            return {
              storyboard_id: Number(sb.storyboard_id || sb.scene_id || index + 1),
              timestamp: String(sb.timestamp || ''),
              duration: Number(sb.duration || 5),
              shot_type: String(sb.shot_type || ''),
              camera_motion: String(sb.camera_motion || ''),
              description: String(sb.description || sb.voiceover || ''),
              prompt: String(sb.prompt || sb.image_prompt || ''),
              videoPrompt: String(sb.videoPrompt || sb.video_prompt || ''),
              characters: Array.isArray(sb.characters) ? sb.characters.map(String) : undefined,
              props: Array.isArray(sb.props) ? sb.props.map(String) : undefined,
              transition: String(sb.transition || ''),
            }
          })
        : [],
      reverse_prompts: Array.isArray(data.reverse_prompts)
        ? data.reverse_prompts.map(String)
        : [],
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
  ): Promise<{ projectId: string; episodeId: string; characterCount: number; storyboardCount: number }> {
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
        visual_style: result.overall_prompt,
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
      description: `预估时长: ${result.total_duration}秒`,
      episode_number: maxEpisodeNumber + 1,
    })

    // 4. 创建角色
    const characterMap = new Map<number, string>()
    for (const char of result.characters) {
      const character = await characterDB.create({
        project_id: projectId,
        episode_id: episode.id,
        name: char.name,
        description: char.description,
        prompt: char.prompt,
        image: char.replacement_image || undefined,
      })
      characterMap.set(char.character_id, character.id)
    }

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
        scene: `分镜${s.storyboard_id}`,
        description: s.description,
        duration: `${s.duration}秒`,
        prompt: s.prompt,
        videoPrompt: s.videoPrompt,
      })) as ExtractedShot[],
    })

    for (let i = 0; i < result.storyboards.length; i++) {
      const sb = result.storyboards[i]!
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
        character_ids: [],
        prop_ids: [],
        reference_images: [],
        video_reference_images: [],
      })
    }

    return {
      projectId,
      episodeId: episode.id,
      characterCount: result.characters.length,
      storyboardCount: result.scenes.length,
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
