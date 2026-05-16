﻿/**
 * 专业工作台服务
 * 基于项目现有架构实现
 * - 复用现有的 Project/Episode/Storyboard 结构
 * - 提供一键式工作流：剧本 -> 分镜 -> 图片 -> 视频 -> 配音 -> 合成
 */

import { projectDB, episodeDB, scriptDB, storyboardDB, characterDB, dubbingDB } from '@/db'
import type { ExtractedAsset, ExtractedDubbing, ExtractedShot, Script } from '@/types'
import { AI, getAgentModel } from './vendor/aiService'
import type { ImageConfig, VideoConfig, TTSConfig } from './vendor/types'

export interface StudioWorkflowRequest {
  projectId: string
  episodeId: string
  scriptContent?: string
  videoEngine?: 'auto' | 'kling' | 'hailuo' | 'vidu' | 'seedance'
  addSubtitles?: boolean
  voiceId?: string
  imageModel?: string
  videoModel?: string
  ttsModel?: string
}

export interface StudioWorkflowStatus {
  stage: 'idle' | 'script' | 'assets' | 'storyboard' | 'image' | 'video' | 'audio' | 'compose' | 'completed' | 'error'
  progress: number
  message: string
  currentTask?: string
}

// 专业工作台服务
export const studioService = {
  // 从主题创建完整项目
  async createProjectFromTopic(
    topic: string,
    options: {
      aspectRatio?: string
      visualStyle?: string
      duration?: number
    } = {}
  ): Promise<{ projectId: string; episodeId: string }> {
    // 1. 创建项目
    const project = await projectDB.create({
      name: topic,
      description: `AI创作: ${topic}`,
      aspect_ratio: options.aspectRatio || '9:16',
      visual_style: options.visualStyle || '',
    })

    // 2. 创建剧集
    const episode = await episodeDB.create({
      project_id: project.id,
      name: '主剧集',
      description: `预计时长: ${options.duration || 30}秒`,
      episode_number: 1,
    })

    return { projectId: project.id, episodeId: episode.id }
  },

  // 生成剧本
  async generateScript(projectId: string, episodeId: string, topic: string): Promise<Script> {
    // AI.Text.generate 内部会自动获取 universalAi agent 配置

    const prompt = `请为以下主题创作一个短视频剧本：

主题：${topic}

要求：
1. 适合短视频平台（抖音/快手/小红书）
2. 时长控制在30-60秒
3. 包含完整的分镜描述
4. 每个分镜包含：场景描述、旁白/台词、画面提示词

请以JSON格式返回：
{
  "title": "剧本标题",
  "content": "完整的剧本内容",
  "scenes": [
    {
      "scene": "场景1",
      "description": "画面描述",
      "voiceover": "旁白或台词",
      "image_prompt": "图像生成提示词",
      "video_prompt": "视频生成提示词",
      "duration": "5秒"
    }
  ],
  "characters": [
    {
      "name": "角色名",
      "description": "角色描述",
      "prompt": "角色形象提示词"
    }
  ]
}`

    const response = await AI.Text.generate({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      maxTokens: 4096,
    })

    const text = response || ''
    let parsed: Record<string, unknown>

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('无法解析AI响应')
      }
    } catch {
      // 如果解析失败，创建一个基础结构
      parsed = {
        title: topic,
        content: text,
        scenes: [],
        characters: [],
      }
    }

    // 提取资产
    const extractedAssets: ExtractedAsset[] = (parsed.characters as unknown[] || []).map((c: unknown) => {
      const char = c as Record<string, unknown>
      return {
        type: 'character',
        name: String(char.name || ''),
        description: String(char.description || ''),
        prompt: String(char.prompt || ''),
      }
    })

    const extractedShots: ExtractedShot[] = (parsed.scenes as unknown[] || []).map((s: unknown, i: number) => {
      const scene = s as Record<string, unknown>
      return {
        id: `shot_${i + 1}`,
        scene: String(scene.scene || `场景${i + 1}`),
        description: String(scene.description || ''),
        duration: String(scene.duration || '5秒'),
        prompt: String(scene.image_prompt || ''),
        videoPrompt: String(scene.video_prompt || ''),
        dubbing: {
          line: String(scene.voiceover || ''),
        },
      }
    })

    const extractedDubbing: ExtractedDubbing[] = extractedShots
      .filter(s => s.dubbing?.line)
      .map(s => ({
        character: s.dubbing?.character || '',
        line: s.dubbing?.line || '',
      }))

    // 创建脚本
    const script = await scriptDB.create({
      episode_id: episodeId,
      title: String(parsed.title || topic),
      content: String(parsed.content || text),
      extracted_assets: extractedAssets,
      extracted_shots: extractedShots,
      extracted_dubbing: extractedDubbing,
    })

    // 创建角色
    for (const asset of extractedAssets) {
      if (asset.type === 'character') {
        await characterDB.create({
          project_id: projectId,
          episode_id: episodeId,
          name: asset.name,
          description: asset.description,
          prompt: asset.prompt,
        })
      }
    }

    // 创建分镜
    for (let i = 0; i < extractedShots.length; i++) {
      const shot = extractedShots[i]!
      await storyboardDB.create({
        project_id: projectId,
        episode_id: episodeId,
        name: `分镜 ${i + 1}`,
        description: shot.description,
        prompt: shot.prompt,
        video_prompt: shot.videoPrompt,
        duration: parseInt(shot.duration || '5') || 5,
        sort_order: i,
        status: 'pending',
        character_ids: [],
        prop_ids: [],
        reference_images: [],
        video_reference_images: [],
      })
    }

    return script
  },

  // 执行完整工作流
  async *executeWorkflow(request: StudioWorkflowRequest): AsyncGenerator<StudioWorkflowStatus, void, unknown> {
    const { projectId, episodeId, scriptContent, voiceId, imageModel, videoModel, ttsModel } = request

    // 获取项目信息
    const project = await projectDB.getById(projectId)
    if (!project) {
      throw new Error('项目不存在')
    }

    // 阶段1: 生成/更新剧本
    yield { stage: 'script', progress: 10, message: '生成剧本...', currentTask: 'script' }

    let script: Script | null = null
    if (scriptContent) {
      // 使用提供的剧本内容
      const existingScript = await scriptDB.getByEpisode(episodeId)
      if (existingScript) {
        script = await scriptDB.update(existingScript.id, { content: scriptContent })
      } else {
        script = await scriptDB.create({
          episode_id: episodeId,
          title: project.name,
          content: scriptContent,
        })
      }
    } else {
      // 检查是否已有剧本
      script = await scriptDB.getByEpisode(episodeId)
    }

    if (!script) {
      throw new Error('没有可用的剧本')
    }

    // 阶段2: 提取资产
    yield { stage: 'assets', progress: 20, message: '提取角色和场景...', currentTask: 'assets' }

    // 资产已经在生成剧本时创建好了

    // 阶段3: 生成关键帧图片
    yield { stage: 'image', progress: 30, message: '生成分镜图片...', currentTask: 'image' }

    const storyboards = await storyboardDB.getAll(episodeId)

    // 获取默认图片模型
    let defaultImageModel = imageModel
    if (!defaultImageModel) {
      const agentModel = await getAgentModel('productionAgent')
      defaultImageModel = agentModel ? `${agentModel.vendorId}:${agentModel.modelName}` : undefined
    }
    if (!defaultImageModel) {
      throw new Error('未配置图片生成模型')
    }

    for (let i = 0; i < storyboards.length; i++) {
      const sb = storyboards[i]!
      if (!sb.prompt) continue

      yield {
        stage: 'image',
        progress: 30 + (i / storyboards.length) * 30,
        message: `生成分镜 ${i + 1}/${storyboards.length}...`,
        currentTask: 'image',
      }

      try {
        const aspectRatio = project.aspect_ratio === '9:16' ? '9:16' : '16:9'
        const isPortrait = aspectRatio === '9:16'
        const imageConfig: ImageConfig = {
          prompt: sb.prompt,
          width: isPortrait ? 720 : 1280,
          height: isPortrait ? 1280 : 720,
          aspectRatio,
        }

        const imageUrl = await AI.Image.generate(imageConfig, defaultImageModel, 0)
        await storyboardDB.update(sb.id, { image: imageUrl })
      } catch (error) {
        console.error(`[StudioService] Failed to generate image for storyboard ${sb.id}:`, error)
      }
    }

    // 阶段4: 生成视频
    yield { stage: 'video', progress: 60, message: '生成视频片段...', currentTask: 'video' }

    // 获取默认视频模型
    let defaultVideoModel = videoModel
    if (!defaultVideoModel) {
      const agentModel = await getAgentModel('productionAgent')
      defaultVideoModel = agentModel ? `${agentModel.vendorId}:${agentModel.modelName}` : undefined
    }
    if (!defaultVideoModel) {
      throw new Error('未配置视频生成模型')
    }

    const updatedStoryboards = await storyboardDB.getAll(episodeId)

    for (let i = 0; i < updatedStoryboards.length; i++) {
      const sb = updatedStoryboards[i]!
      if (!sb.image || !sb.video_prompt) continue

      yield {
        stage: 'video',
        progress: 60 + (i / updatedStoryboards.length) * 20,
        message: `生成视频 ${i + 1}/${updatedStoryboards.length}...`,
        currentTask: 'video',
      }

      try {
        const videoConfig: VideoConfig = {
          prompt: sb.video_prompt,
          referenceImages: sb.image ? [sb.image] : undefined,
          width: 1280,
          height: 720,
          duration: sb.duration || 5,
        }

        const videoUrl = await AI.Video.generate(videoConfig, defaultVideoModel, 0)
        await storyboardDB.update(sb.id, { video: videoUrl })
      } catch (error) {
        console.error(`[StudioService] Failed to generate video for storyboard ${sb.id}:`, error)
      }
    }

    // 阶段5: 生成配音
    if (voiceId) {
      yield { stage: 'audio', progress: 80, message: '生成配音...', currentTask: 'audio' }

      // 获取默认TTS模型
      let defaultTtsModel = ttsModel
      if (!defaultTtsModel) {
        const agentModel = await getAgentModel('ttsDubbing')
        defaultTtsModel = agentModel ? `${agentModel.vendorId}:${agentModel.modelName}` : undefined
      }
      if (!defaultTtsModel) {
        console.warn('[StudioService] 未配置TTS模型，跳过配音生成')
      } else {
        const finalStoryboards = await storyboardDB.getAll(episodeId)

        for (let i = 0; i < finalStoryboards.length; i++) {
          const sb = finalStoryboards[i]!
          if (!sb.description) continue

          try {
            const ttsConfig: TTSConfig = {
              text: sb.description,
              voice: voiceId,
              voiceId: voiceId,
            }

            const audioUrl = await AI.Audio.generate(ttsConfig, defaultTtsModel, 0)

            await dubbingDB.create({
              project_id: projectId,
              storyboard_id: sb.id,
              text: sb.description,
              audio_url: audioUrl,
              sequence: i,
              status: 'completed',
            })
          } catch (error) {
            console.error(`[StudioService] Failed to generate audio for storyboard ${sb.id}:`, error)
          }
        }
      }
    }

    // 阶段6: 完成
    yield { stage: 'completed', progress: 100, message: '创作完成！', currentTask: 'completed' }
  },

  // 获取工作流状态
  async getWorkflowStatus(_projectId: string, episodeId: string): Promise<StudioWorkflowStatus> {
    const storyboards = await storyboardDB.getAll(episodeId)

    if (storyboards.length === 0) {
      return { stage: 'idle', progress: 0, message: '等待开始' }
    }

    const hasImages = storyboards.some(sb => sb.image)
    const hasVideos = storyboards.some(sb => sb.video)
    const dubbings = await dubbingDB.getByEpisode(episodeId)

    if (hasVideos) {
      return {
        stage: 'completed',
        progress: 100,
        message: `已完成 ${storyboards.length} 个分镜，${dubbings.length} 条配音`,
      }
    }

    if (hasImages) {
      const imageCount = storyboards.filter(sb => sb.image).length
      return {
        stage: 'video',
        progress: 60 + (imageCount / storyboards.length) * 20,
        message: `已生成 ${imageCount}/${storyboards.length} 张图片，正在生成视频...`,
      }
    }

    return {
      stage: 'script',
      progress: 20,
      message: `已创建 ${storyboards.length} 个分镜，等待生成图片...`,
    }
  },
}

export default studioService
