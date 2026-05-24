/**
 * 图片生成工具
 * 适配 FD 的 AI.Image.generate
 */

import type { ViMaxShotDescription } from '@/plugins/vimax/types';
import { AI } from '@/services/vendor';
import { saveGeneratedImage } from '@/utils/mediaStorage';

export interface ShotImageParams {
  shot: ViMaxShotDescription;
  projectId: string;
  episodeId?: string;
  width?: number;
  height?: number;
  model?: string;
}

/**
 * 为分镜生成图片
 */
export async function generateShotImage(
  shot: ViMaxShotDescription,
  projectId: string,
  episodeId?: string,
  width: number = 1024,
  height: number = 576
): Promise<string> {
  const prompt = buildShotImagePrompt(shot);

  const imageUrl = await AI.Image.generate(
    {
      prompt,
      aspectRatio: `${width}:${height}` as `${number}:${number}`,
    },
    'official:claude-sonnet-4-6',
    parseInt(projectId) || 0
  );

  const savedPath = await saveGeneratedImage(imageUrl, projectId, episodeId || '');

  return savedPath;
}

/**
 * 批量为分镜生成图片
 */
export async function generateShotImages(
  shots: ViMaxShotDescription[],
  projectId: string,
  episodeId?: string,
  onProgress?: (completed: number, total: number) => void
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    if (!shot) continue;
    try {
      const imageUrl = await generateShotImage(shot, projectId, episodeId);
      results[shot.id] = imageUrl;
      onProgress?.(i + 1, shots.length);
    } catch (error) {
      console.error(`为分镜 ${shot.id} 生成图片失败:`, error);
      results[shot.id] = '';
    }
  }

  return results;
}

function buildShotImagePrompt(shot: ViMaxShotDescription): string {
  let prompt = shot.prompt || '';

  if (shot.cameraAngle) {
    prompt = `${shot.cameraAngle}，` + prompt;
  }

  if (shot.cameraMovement) {
    prompt += `，${shot.cameraMovement}`;
  }

  return prompt;
}

/**
 * 生成场景概念图
 */
export async function generateSceneConceptImage(
  sceneName: string,
  sceneDescription: string,
  projectId: string,
  episodeId?: string
): Promise<string> {
  const prompt = `场景概念图，${sceneName}，${sceneDescription}，广角镜头，全景展示，电影级构图`;

  const imageUrl = await AI.Image.generate(
    {
      prompt,
      aspectRatio: '16:9',
    },
    'official:claude-sonnet-4-6',
    parseInt(projectId) || 0
  );

  return saveGeneratedImage(imageUrl, projectId, episodeId || '');
}
