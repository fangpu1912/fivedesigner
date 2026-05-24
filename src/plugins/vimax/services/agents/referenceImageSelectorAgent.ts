/**
 * 参考图选择 Agent
 * 为场景和分镜选择/生成参考图
 */

import type {
  AgentConfig,
  AgentContext,
  ViMaxScene,
  ViMaxShotDescription,
} from '@/plugins/vimax/types';
import { AI } from '@/services/vendor';
import { saveGeneratedImage } from '@/utils/mediaStorage';

export const referenceImageSelectorAgentConfig: AgentConfig = {
  type: 'referenceImageSelector',
  name: '参考图选择 Agent',
  description: '为场景和分镜选择或生成参考图',
  systemPrompt: `你是一位专业的美术指导，擅长为影视场景选择或生成合适的参考图。

你的任务：
1. 分析场景的氛围、时代、风格需求
2. 生成场景概念图的提示词
3. 确保参考图与剧本描述一致
4. 考虑光影和色彩氛围

输出要求：
- 生成场景概念图的提示词
- 提示词应包含环境、光线、氛围等关键元素
- 不得包含风格词或画质关键词`,
  model: 'official:claude-sonnet-4-6',
  temperature: 0.7,
  maxTokens: 2048,
};

export interface ReferenceImageInput {
  scene: ViMaxScene;
  projectId: string;
  episodeId?: string;
  existingReferences?: string[];
}

export interface ReferenceImageOutput {
  referenceUrl: string;
  rawResponse: string;
}

export async function runReferenceImageSelectorAgent(
  input: ReferenceImageInput,
  _context?: AgentContext
): Promise<ReferenceImageOutput> {
  const { scene, projectId, episodeId } = input;

  const referencePrompt = buildReferencePrompt(scene);

  const imageUrl = await AI.Image.generate(
    {
      prompt: referencePrompt,
      aspectRatio: '16:9',
    },
    referenceImageSelectorAgentConfig.model || 'official:claude-sonnet-4-6',
    0
  );

  const savedPath = await saveGeneratedImage(imageUrl, projectId, episodeId || '');

  return {
    referenceUrl: savedPath,
    rawResponse: referencePrompt,
  };
}

function buildReferencePrompt(scene: ViMaxScene): string {
  let prompt = `场景概念图，`;

  prompt += `${scene.name}，`;
  prompt += `${scene.description}，`;

  if (scene.location) prompt += `地点：${scene.location}，`;
  if (scene.timeOfDay) prompt += `时间：${scene.timeOfDay}，`;
  if (scene.mood) prompt += `氛围：${scene.mood}，`;

  prompt += `广角镜头，全景展示，电影级构图`;

  return prompt;
}

export interface ShotReferenceInput {
  shot: ViMaxShotDescription;
  scene: ViMaxScene;
  projectId: string;
  episodeId?: string;
}

export interface ShotReferenceOutput {
  imageUrl: string;
  rawResponse: string;
}

export async function generateShotReferenceImage(
  input: ShotReferenceInput,
  _context?: AgentContext
): Promise<ShotReferenceOutput> {
  const { shot, scene, projectId, episodeId } = input;

  const prompt = buildShotReferencePrompt(shot, scene);

  const imageUrl = await AI.Image.generate(
    {
      prompt,
      aspectRatio: '16:9',
    },
    referenceImageSelectorAgentConfig.model || 'official:claude-sonnet-4-6',
    0
  );

  const savedPath = await saveGeneratedImage(imageUrl, projectId, episodeId || '');

  return {
    imageUrl: savedPath,
    rawResponse: prompt,
  };
}

function buildShotReferencePrompt(
  shot: ViMaxShotDescription,
  scene: ViMaxScene
): string {
  let prompt = `分镜画面，`;

  prompt += `${shot.cameraAngle}，`;
  if (shot.cameraMovement) {
    prompt += `${shot.cameraMovement}，`;
  }

  prompt += `${shot.description}，`;

  if (scene.location) prompt += `地点：${scene.location}，`;
  if (scene.timeOfDay) prompt += `时间：${scene.timeOfDay}，`;

  prompt += `电影级画面构图`;

  return prompt;
}
