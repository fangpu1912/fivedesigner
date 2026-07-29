/**
 * 角色肖像生成 Agent
 * 为角色生成主肖像 + 按 outfit 分别图生图换装
 */

import type {
  AgentConfig,
  ViMaxCharacterInScene,
  ViMaxCharacterOutfit,
} from '@/plugins/vimax/types';
import { AI } from '@/services/vendor';
import { saveGeneratedImage } from '@/utils/mediaStorage';

export const characterPortraitAgentConfig: AgentConfig = {
  type: 'characterPortrait',
  name: '角色肖像 Agent',
  description: '为角色生成主肖像，并按 outfit 分别生成对应状态图',
  systemPrompt: `你是一位专业的角色肖像设计师，擅长为影视角色设计一致的视觉形象。

你的任务：
1. 根据角色描述生成肖像提示词
2. 确保角色形象的一致性
3. 生成适合 AI 图像生成的优化提示词

输出要求：
- 生成正面肖像的提示词
- 生成侧面/四分之三侧面的提示词（可选）
- 确保同一角色在不同角度下外观一致
- 提示词必须包含角色的关键外貌特征`,
  model: 'official:claude-sonnet-4-6',
  temperature: 0.7,
  maxTokens: 2048,
};

export interface CharacterPortraitInput {
  character: ViMaxCharacterInScene;
  projectId: string;
  episodeId?: string;
  style?: string;
  /** 需要按 outfit 分别生成图片的服装状态列表 */
  outfits?: ViMaxCharacterOutfit[];
}

export interface CharacterPortraitOutput {
  character: ViMaxCharacterInScene;
  portraitUrl: string;
  outfits: ViMaxCharacterOutfit[];
  rawResponse: string;
}

export async function runCharacterPortraitAgent(
  input: CharacterPortraitInput
): Promise<CharacterPortraitOutput> {
  const { character, projectId, episodeId, style, outfits } = input;

  const portraitPrompt = buildPortraitPrompt(character, style);

  // 1. 生成主肖像（基于精简后的 character.prompt + appearance）
  const imageUrl = await AI.Image.generate(
    {
      prompt: portraitPrompt,
      aspectRatio: '1:1',
    },
    characterPortraitAgentConfig.model || 'official:claude-sonnet-4-6',
    0
  );

  if (!imageUrl) {
    throw new Error('角色肖像生成失败');
  }

  const savedPath = await saveGeneratedImage(imageUrl, projectId, episodeId || '');

  // 2. 按 outfit 分别图生图（以主肖像为参考图）
  const generatedOutfits: ViMaxCharacterOutfit[] = [];
  if (outfits && outfits.length > 0) {
    for (const outfit of outfits) {
      try {
        const outfitImageUrl = await AI.Image.generate(
          {
            prompt: outfit.prompt,
            imageUrls: [savedPath],
            aspectRatio: '1:1',
          },
          characterPortraitAgentConfig.model || 'official:claude-sonnet-4-6',
          0
        );

        if (outfitImageUrl) {
          const savedOutfitPath = await saveGeneratedImage(
            outfitImageUrl,
            projectId,
            episodeId || ''
          );
          generatedOutfits.push({
            ...outfit,
            imageUrl: savedOutfitPath,
          });
        } else {
          // 生成失败时保留原 outfit（不含 imageUrl），不阻断流程
          console.warn(`[characterPortraitAgent] outfit "${outfit.name}" 生成失败，跳过`);
          generatedOutfits.push(outfit);
        }
      } catch (err) {
        console.warn(`[characterPortraitAgent] outfit "${outfit.name}" 生成异常:`, err);
        generatedOutfits.push(outfit);
      }
    }
  }

  const updatedCharacter: ViMaxCharacterInScene = {
    ...character,
    portraitUrl: savedPath,
    outfits: generatedOutfits,
  };

  return {
    character: updatedCharacter,
    portraitUrl: savedPath,
    outfits: generatedOutfits,
    rawResponse: portraitPrompt,
  };
}

function buildPortraitPrompt(
  character: ViMaxCharacterInScene,
  style?: string
): string {
  let prompt = `角色肖像，正面照，${character.name}，`;

  if (character.age) prompt += `${character.age}，`;
  if (character.gender) prompt += `${character.gender}，`;
  if (character.appearance) prompt += `${character.appearance}，`;
  // 注意：精简后的 character.prompt 不再含服装，但若 agent 旧格式仍含服装也不影响
  if (character.prompt) prompt += `${character.prompt}，`;

  prompt += `清晰的面部特征，中性表情，纯色背景，专业肖像照`;

  if (style) {
    prompt += `，${style}`;
  }

  return prompt;
}
