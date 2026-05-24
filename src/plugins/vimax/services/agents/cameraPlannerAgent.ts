/**
 * 机位规划 Agent
 * 优化分镜的机位和镜头运动
 */

import type {
  AgentConfig,
  ViMaxShotDescription,
} from '@/plugins/vimax/types';
import { AI } from '@/services/vendor';

export const cameraPlannerAgentConfig: AgentConfig = {
  type: 'cameraPlanner',
  name: '机位规划 Agent',
  description: '优化分镜的机位和镜头运动设计',
  systemPrompt: `你是一位专业的摄影指导（DP），擅长设计电影级的机位和镜头运动。

你的任务：
1. 分析场景的情绪和叙事需求
2. 为每个镜头设计最优的：
   - 机位高度（平视/俯视/仰视）
   - 镜头焦距（广角/标准/长焦）
   - 镜头运动方式
   - 景深设计
3. 确保镜头之间有合理的逻辑关系
4. 考虑视觉节奏和剪辑点

输出格式要求（JSON）：
{
  "shots": [
    {
      "sequence": 1,
      "cameraAngle": "优化后的镜头角度",
      "cameraMovement": "优化后的镜头运动",
      "cameraHeight": "机位高度",
      "focalLength": "焦距范围",
      "depthOfField": "景深设计",
      "reasoning": "设计理由"
    }
  ]
}

设计原则：
- 对话场景：使用中景和近景交替
- 动作场景：使用广角和运动镜头
- 情感场景：使用特写和浅景深
- 环境展示：使用全景和固定镜头`,
  model: 'official:claude-sonnet-4-6',
  temperature: 0.7,
  maxTokens: 4096,
};

export interface CameraPlannerInput {
  shots: ViMaxShotDescription[];
  sceneDescription?: string;
  mood?: string;
}

export interface CameraPlannerOutput {
  optimizedShots: ViMaxShotDescription[];
  rawResponse: string;
}

export async function runCameraPlannerAgent(
  input: CameraPlannerInput,
): Promise<CameraPlannerOutput> {
  const { shots, sceneDescription, mood } = input;

  const prompt = buildCameraPlannerPrompt(shots, sceneDescription, mood);

  const response = await AI.Text.generate(
    {
      messages: [
        { role: 'system', content: cameraPlannerAgentConfig.systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: cameraPlannerAgentConfig.temperature ?? 0.7,
      maxTokens: cameraPlannerAgentConfig.maxTokens ?? 4096,
    },
    cameraPlannerAgentConfig.model
  );

  const optimizedShots = parseCameraResponse(response, shots);

  return {
    optimizedShots,
    rawResponse: response,
  };
}

function buildCameraPlannerPrompt(
  shots: ViMaxShotDescription[],
  sceneDescription?: string,
  mood?: string
): string {
  let prompt = `请为以下分镜设计专业的机位和镜头运动方案：\n\n`;

  if (sceneDescription) {
    prompt += `场景描述：${sceneDescription}\n`;
  }
  if (mood) {
    prompt += `场景氛围：${mood}\n`;
  }

  prompt += `\n当前分镜列表：\n`;
  for (const shot of shots) {
    prompt += `\n镜头 ${shot.sequence}：\n`;
    prompt += `- 描述：${shot.description}\n`;
    prompt += `- 当前角度：${shot.cameraAngle}\n`;
    prompt += `- 当前运动：${shot.cameraMovement || '无'}\n`;
    prompt += `- 角色：${shot.characters.join('、')}\n`;
  }

  prompt += `\n请优化每个镜头的机位设计，严格按照 JSON 格式输出。`;

  return prompt;
}

function parseCameraResponse(
  response: string,
  originalShots: ViMaxShotDescription[]
): ViMaxShotDescription[] {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('无法从响应中解析 JSON');
    }

    const data = JSON.parse(jsonMatch[0]);
    const cameraShots = data.shots || [];

    return originalShots.map((shot) => {
      const cameraShot = cameraShots.find(
        (cs: Record<string, unknown>) => cs.sequence === shot.sequence
      );

      if (!cameraShot) return shot;

      return {
        ...shot,
        cameraAngle: String(cameraShot.cameraAngle || shot.cameraAngle),
        cameraMovement: cameraShot.cameraMovement
          ? String(cameraShot.cameraMovement)
          : shot.cameraMovement,
      };
    });
  } catch (error) {
    console.error('解析机位响应失败:', error);
    return originalShots;
  }
}
