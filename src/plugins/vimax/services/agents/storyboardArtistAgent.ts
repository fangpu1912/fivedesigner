/**
 * 分镜设计 Agent
 * 将场景转换为详细的分镜描述
 */

import { v4 as uuidv4 } from 'uuid';

import type {
  AgentConfig,
  AgentContext,
  ViMaxScene,
  ViMaxShotDescription,
  ViMaxCharacterInScene,
} from '@/plugins/vimax/types';
import { AI } from '@/services/vendor';

export const storyboardArtistAgentConfig: AgentConfig = {
  type: 'storyboardArtist',
  name: '分镜设计 Agent',
  description: '将场景转换为详细的分镜描述',
  systemPrompt: `你是一位专业的分镜设计师，擅长将场景描述转换为详细的分镜脚本。

你的任务：
1. 分析场景内容和角色动作
2. 设计每个镜头的：
   - 镜头角度（特写/近景/中景/全景/远景）
   - 镜头运动（推/拉/摇/移/跟/升/降）
   - 画面构图
   - 角色位置和动作
   - 光影效果
3. 生成 AI 生图提示词和生视频提示词
4. 设计配音内容（如有对话）

输出格式要求（JSON）：
{
  "shots": [
    {
      "sequence": 1,
      "description": "分镜描述（画面内容+角色动作+环境氛围）",
      "cameraAngle": "镜头角度（特写/近景/中景/全景/远景）",
      "cameraMovement": "镜头运动",
      "characters": ["角色名1", "角色名2"],
      "props": ["道具1"],
      "prompt": "AI生图提示词（中文，包含：视角+场景+角色+服装+动作+道具+光影）",
      "videoPrompt": "AI生视频提示词（中文，包含：镜头运动+角色动态+环境变化+时长）",
      "duration": 5,
      "dubbing": {
        "character": "说话角色",
        "line": "台词内容",
        "emotion": "情绪状态",
        "audioPrompt": "配音提示词（中文，包含：角色身份+情绪强度+语气+语速+声音质感）"
      }
    }
  ]
}

注意事项：
- prompt 和 videoPrompt 必须使用中文
- 不得包含风格词或画质关键词
- 保留角色名和台词原文`,
  model: 'official:claude-sonnet-4-6',
  temperature: 0.8,
  maxTokens: 8192,
};

export interface StoryboardArtistInput {
  scene: ViMaxScene;
  characters: ViMaxCharacterInScene[];
  scriptSummary?: string;
  previousShots?: ViMaxShotDescription[];
}

export interface StoryboardArtistOutput {
  shots: ViMaxShotDescription[];
  rawResponse: string;
}

export async function runStoryboardArtistAgent(
  input: StoryboardArtistInput,
  _context?: AgentContext
): Promise<StoryboardArtistOutput> {
  const { scene, characters, scriptSummary, previousShots } = input;

  const prompt = buildStoryboardPrompt(scene, characters, scriptSummary, previousShots);

  const response = await AI.Text.generate(
    {
      messages: [
        { role: 'system', content: storyboardArtistAgentConfig.systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: storyboardArtistAgentConfig.temperature ?? 0.8,
      maxTokens: storyboardArtistAgentConfig.maxTokens ?? 8192,
    },
    storyboardArtistAgentConfig.model
  );

  const shots = parseShotResponse(response, scene.id);

  return {
    shots,
    rawResponse: response,
  };
}

function buildStoryboardPrompt(
  scene: ViMaxScene,
  characters: ViMaxCharacterInScene[],
  scriptSummary?: string,
  previousShots?: ViMaxShotDescription[]
): string {
  let prompt = `请为以下场景设计分镜：\n\n`;

  prompt += `场景名称：${scene.name}\n`;
  prompt += `场景描述：${scene.description}\n`;
  prompt += `场景提示词：${scene.prompt}\n`;
  prompt += `地点：${scene.location || '未指定'}\n`;
  prompt += `时间：${scene.timeOfDay || '未指定'}\n`;
  prompt += `氛围：${scene.mood || '未指定'}\n\n`;

  prompt += `场景中的角色：\n`;
  for (const charName of scene.characters) {
    const charNameStr = typeof charName === 'string' ? charName : charName.name;
    const char = characters.find((c) => c.name === charNameStr);
    if (char) {
      prompt += `- ${char.name}：${char.description}\n`;
      prompt += `  生图提示词：${char.prompt}\n`;
    } else {
      prompt += `- ${charNameStr}（暂无详细信息）\n`;
    }
  }

  if (scene.props.length > 0) {
    prompt += `\n场景中的道具：${scene.props.join('、')}\n`;
  }

  if (scriptSummary) {
    prompt += `\n剧本概要：${scriptSummary}\n`;
  }

  if (previousShots && previousShots.length > 0) {
    prompt += `\n之前的分镜（请保持连贯性）：\n`;
    for (const shot of previousShots.slice(-3)) {
      prompt += `- 镜头 ${shot.sequence}：${shot.description}\n`;
    }
  }

  prompt += `\n请为每个镜头生成详细的描述和提示词，严格按照 JSON 格式输出。`;

  return prompt;
}

function parseShotResponse(response: string, sceneId: string): ViMaxShotDescription[] {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('无法从响应中解析 JSON');
    }

    const data = JSON.parse(jsonMatch[0]);

    return (data.shots || []).map(
      (shot: Record<string, unknown>, index: number) => ({
        id: uuidv4(),
        sceneId,
        sequence: (shot.sequence as number) || index + 1,
        description: String(shot.description || ''),
        cameraAngle: String(shot.cameraAngle || '中景'),
        cameraMovement: shot.cameraMovement ? String(shot.cameraMovement) : undefined,
        characters: Array.isArray(shot.characters) ? shot.characters.map((c: unknown) => String(c)) : [],
        props: Array.isArray(shot.props) ? shot.props.map((p: unknown) => String(p)) : [],
        prompt: String(shot.prompt || ''),
        videoPrompt: shot.videoPrompt ? String(shot.videoPrompt) : undefined,
        duration: shot.duration ? Number(shot.duration) : 5,
        dubbing: shot.dubbing
          ? {
              character: String((shot.dubbing as Record<string, unknown>).character || ''),
              line: String((shot.dubbing as Record<string, unknown>).line || ''),
              emotion: String((shot.dubbing as Record<string, unknown>).emotion || '平静'),
              audioPrompt: String(
                (shot.dubbing as Record<string, unknown>).audioPrompt || ''
              ),
            }
          : undefined,
        status: 'pending' as const,
      })
    );
  } catch (error) {
    console.error('解析分镜响应失败:', error);
    return [];
  }
}
