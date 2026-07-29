/**
 * 角色提取 Agent
 * 从剧本或文本中提取角色信息，并把服装/状态拆分为独立 outfits
 */

import type {
  AgentConfig,
  ViMaxCharacterInScene,
  ViMaxCharacterOutfit,
} from '@/plugins/vimax/types';
import { AI } from '@/services/vendor';

export const characterExtractorAgentConfig: AgentConfig = {
  type: 'characterExtractor',
  name: '角色提取 Agent',
  description: '从剧本文本中提取角色信息，并把服装/状态拆分为独立 outfits',
  systemPrompt: `你是一位专业的角色设计师，擅长从剧本或小说中提取角色信息并生成详细的角色描述。

你的任务：
1. 识别文本中的所有角色
2. 为每个角色提取：
   - 姓名（保留原文）
   - 年龄段（少年/青年/中年/老年）
   - 性别
   - 体型特征
   - 五官特点
   - 发型发色
   - 肤色
   - 性格特征
   - 职业/身份
3. 生成精简的静态外貌 prompt（不含服装/姿态/表情）
4. 为每个角色识别他在剧情中出现的所有服装/状态，作为 outfits 数组

输出格式要求（JSON）：
{
  "characters": [
    {
      "name": "角色名（保留原文）",
      "description": "角色描述（外貌、性格、职业等）",
      "prompt": "AI生图提示词（中文，只包含：人物名+年龄段+体型+五官+发型+肤色。不得包含服装、配饰、姿态、表情）",
      "age": "年龄段",
      "gender": "性别",
      "appearance": "外貌特征（不含服装）",
      "clothing": "默认服装简述（用于描述，不影响生成）",
      "outfits": [
        {
          "name": "服装/状态名（如：战斗装、日常装、雨夜湿衣、受伤状态）",
          "description": "该服装/状态的描述",
          "prompt": "该状态的独立生图提示词（中文，包含：服装款式+颜色+材质+配饰+姿态+表情）",
          "is_default": true
        }
      ]
    }
  ]
}

注意事项：
- prompt 字段必须使用中文，且不得包含服装、配饰、姿态、表情
- 每个 outfit 的 prompt 必须使用中文，不得包含风格词或画质关键词
- 每个角色至少 1 套 outfit，且必须有且只有 1 套 is_default=true
- 如果剧本中角色只有 1 种服装，也输出 1 套 outfit
- 保留角色名的原文`,
  model: 'official:claude-sonnet-4-6',
  temperature: 0.7,
  maxTokens: 4096,
};

export interface CharacterExtractorInput {
  script: string;
  existingCharacters?: ViMaxCharacterInScene[];
}

export interface CharacterExtractorOutput {
  characters: ViMaxCharacterInScene[];
  rawResponse: string;
}

export async function runCharacterExtractorAgent(
  input: CharacterExtractorInput
): Promise<CharacterExtractorOutput> {
  const { script, existingCharacters } = input;

  let prompt = `请从以下剧本/小说内容中提取所有角色信息：\n\n${script}\n\n`;

  if (existingCharacters && existingCharacters.length > 0) {
    prompt += `\n已存在的角色（请补充完善）：\n${existingCharacters
      .map((c) => `- ${c.name}: ${c.description}`)
      .join('\n')}\n`;
  }

  prompt += '\n请严格按照 JSON 格式输出。';

  const response = await AI.Text.generate(
    {
      messages: [
        { role: 'system', content: characterExtractorAgentConfig.systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: characterExtractorAgentConfig.temperature ?? 0.7,
      maxTokens: characterExtractorAgentConfig.maxTokens ?? 4096,
    },
    characterExtractorAgentConfig.model
  );

  const characters = parseCharacterResponse(response);

  return {
    characters,
    rawResponse: response,
  };
}

function parseCharacterResponse(response: string): ViMaxCharacterInScene[] {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('无法从响应中解析 JSON');
    }

    const data = JSON.parse(jsonMatch[0]);

    return (data.characters || []).map(
      (char: Record<string, unknown>): ViMaxCharacterInScene => {
        const name = String(char.name || '');
        const clothing = char.clothing ? String(char.clothing) : undefined;

        // 解析 outfits 数组
        let outfits: ViMaxCharacterOutfit[] = [];
        const rawOutfits = char.outfits;
        if (Array.isArray(rawOutfits) && rawOutfits.length > 0) {
          outfits = rawOutfits.map((o: Record<string, unknown>) => ({
            name: String(o.name || '默认服装'),
            description: o.description ? String(o.description) : undefined,
            prompt: String(o.prompt || ''),
            imageUrl: o.imageUrl ? String(o.imageUrl) : undefined,
            is_default: Boolean(o.is_default),
          }));
        } else if (clothing) {
          // 向后兼容：老格式响应没有 outfits，用 clothing 字段构造 1 套默认 outfit
          outfits = [{
            name: '默认服装',
            description: clothing,
            prompt: clothing,
            is_default: true,
          }];
        }

        // 确保至少有 1 个 is_default=true
        const hasDefault = outfits.some(o => o.is_default);
        if (!hasDefault && outfits.length > 0) {
          outfits[0]!.is_default = true;
        }

        return {
          name,
          description: String(char.description || ''),
          prompt: String(char.prompt || ''),
          age: char.age ? String(char.age) : undefined,
          gender: char.gender ? String(char.gender) : undefined,
          appearance: char.appearance ? String(char.appearance) : undefined,
          clothing,
          outfits,
        };
      }
    );
  } catch (error) {
    console.error('解析角色响应失败:', error);
    return [];
  }
}
