/**
 * 编剧 Agent
 * 将创意/小说/剧本输入转换为结构化剧本
 */

import { v4 as uuidv4 } from 'uuid';

import type {
  AgentConfig,
  AgentContext,
  ViMaxScript,
  ViMaxCharacterInScene,
  ViMaxScene,
} from '@/plugins/vimax/types';
import { AI } from '@/services/vendor';

export const screenwriterAgentConfig: AgentConfig = {
  type: 'screenwriter',
  name: '编剧 Agent',
  description: '将创意或小说转换为结构化剧本',
  systemPrompt: `你是一位专业的影视编剧，擅长将创意概念或小说内容转换为结构化的影视剧本。

你的任务：
1. 分析输入内容的主题、情节和角色
2. 将内容分解为多个场景（Scene）
3. 为每个场景提取角色、道具、环境信息
4. 生成适合 AI 图像生成的提示词
5. 确保剧本结构完整，包含起承转合

输出格式要求（JSON）：
{
  "title": "剧本标题",
  "summary": "剧本概要",
  "characters": [
    {
      "name": "角色名",
      "description": "角色描述",
      "prompt": "AI生图提示词（中文，包含人物外貌、服装、姿态等）",
      "age": "年龄段",
      "gender": "性别"
    }
  ],
  "scenes": [
    {
      "name": "场景名",
      "description": "场景描述",
      "prompt": "AI生图提示词（中文，包含环境、光线、氛围等）",
      "location": "地点",
      "timeOfDay": "时间段",
      "mood": "氛围",
      "characters": ["角色名1", "角色名2"],
      "props": ["道具1", "道具2"]
    }
  ]
}

注意事项：
- prompt 字段必须使用中文
- prompt 中不得包含风格词（如"动漫风格"、"写实风格"）
- prompt 中不得包含画质关键词（如"8k"、"high quality"）
- 保留角色名和场景名的原文，不要翻译`,
  model: 'official:claude-sonnet-4-6',
  temperature: 0.8,
  maxTokens: 8192,
};

export interface ScreenwriterInput {
  type: 'idea' | 'novel' | 'script';
  content: string;
  title?: string;
  genre?: string;
  style?: string;
  targetDuration?: number;
}

export interface ScreenwriterOutput {
  script: ViMaxScript;
  rawResponse: string;
}

export async function runScreenwriterAgent(
  input: ScreenwriterInput,
  _context: AgentContext
): Promise<ScreenwriterOutput> {

  const userPrompt = buildScreenwriterPrompt(input);

  const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
    { role: 'system', content: screenwriterAgentConfig.systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const response = await AI.Text.generate(
    {
      messages,
      temperature: screenwriterAgentConfig.temperature ?? 0.8,
      maxTokens: screenwriterAgentConfig.maxTokens ?? 8192,
    },
    screenwriterAgentConfig.model
  );

  const script = parseScriptResponse(response, input.title);

  return {
    script,
    rawResponse: response,
  };
}

function buildScreenwriterPrompt(input: ScreenwriterInput): string {
  const { type, content, title, genre, style, targetDuration } = input;

  let prompt = '';

  if (type === 'idea') {
    prompt = `请将以下创意概念转换为完整的影视剧本：\n\n创意内容：\n${content}\n`;
  } else if (type === 'novel') {
    prompt = `请将以下小说内容转换为影视剧本格式：\n\n小说内容：\n${content}\n`;
  } else {
    prompt = `请优化以下剧本内容，并转换为结构化格式：\n\n剧本内容：\n${content}\n`;
  }

  if (title) prompt += `\n剧本标题：${title}`;
  if (genre) prompt += `\n类型/题材：${genre}`;
  if (style) prompt += `\n风格：${style}`;
  if (targetDuration) prompt += `\n目标时长：约 ${targetDuration} 分钟`;

  prompt += `\n\n请严格按照 JSON 格式输出，不要包含任何其他内容。`;

  return prompt;
}

function parseScriptResponse(response: string, fallbackTitle?: string): ViMaxScript {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('无法从响应中解析 JSON');
    }

    const data = JSON.parse(jsonMatch[0]);

    const characters: ViMaxCharacterInScene[] = (data.characters || []).map(
      (char: Record<string, unknown>) => ({
        name: String(char.name || ''),
        description: String(char.description || ''),
        prompt: String(char.prompt || ''),
        age: char.age ? String(char.age) : undefined,
        gender: char.gender ? String(char.gender) : undefined,
        appearance: char.appearance ? String(char.appearance) : undefined,
        clothing: char.clothing ? String(char.clothing) : undefined,
      })
    );

    const scenes: ViMaxScene[] = (data.scenes || []).map(
      (scene: Record<string, unknown>, index: number) => ({
        id: uuidv4(),
        name: String(scene.name || `场景 ${index + 1}`),
        description: String(scene.description || ''),
        prompt: String(scene.prompt || ''),
        characters: Array.isArray(scene.characters) ? scene.characters.map((c: unknown) => String(c)) : [],
        props: Array.isArray(scene.props) ? scene.props.map((p: unknown) => String(p)) : [],
        location: scene.location ? String(scene.location) : undefined,
        timeOfDay: scene.timeOfDay ? String(scene.timeOfDay) : undefined,
        mood: scene.mood ? String(scene.mood) : undefined,
      })
    );

    return {
      title: data.title || fallbackTitle || '未命名剧本',
      summary: data.summary || '',
      characters,
      scenes,
      shots: [],
    };
  } catch (error) {
    console.error('解析剧本响应失败:', error);
    return {
      title: fallbackTitle || '未命名剧本',
      summary: '',
      characters: [],
      scenes: [],
      shots: [],
    };
  }
}
