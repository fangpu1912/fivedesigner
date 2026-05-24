/**
 * 视频生成工具
 * 适配 FD 的 AI.Video.generate
 */

import type { ViMaxShotDescription } from '@/plugins/vimax/types';
import { AI } from '@/services/vendor';
import { saveGeneratedVideo } from '@/utils/mediaStorage';

export interface ShotVideoParams {
  shot: ViMaxShotDescription;
  projectId: string;
  episodeId?: string;
  duration?: number;
  model?: string;
}

/**
 * 为分镜生成视频
 */
export async function generateShotVideo(
  shot: ViMaxShotDescription,
  projectId: string,
  episodeId?: string,
  duration: number = 5
): Promise<string> {
  const prompt = shot.videoPrompt || shot.prompt || '';
  const firstFrame = shot.imageUrl;

  if (!firstFrame) {
    throw new Error('生成分镜视频需要先提供首帧图片');
  }

  const videoUrl = await AI.Video.generate(
    {
      prompt,
      duration,
    },
    'official:Wan2.6-I2V-1080P',
    parseInt(projectId) || 0
  );

  const savedPath = await saveGeneratedVideo(videoUrl, projectId, episodeId || '');

  return savedPath;
}

/**
 * 批量为分镜生成视频
 */
export async function generateShotVideos(
  shots: ViMaxShotDescription[],
  projectId: string,
  episodeId?: string,
  onProgress?: (completed: number, total: number) => void
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    if (!shot) continue;
    if (!shot.imageUrl) {
      console.warn(`分镜 ${shot.id} 没有图片，跳过视频生成`);
      results[shot.id] = '';
      continue;
    }

    try {
      const videoUrl = await generateShotVideo(shot, projectId, episodeId);
      results[shot.id] = videoUrl;
      onProgress?.(i + 1, shots.length);
    } catch (error) {
      console.error(`为分镜 ${shot.id} 生成视频失败:`, error);
      results[shot.id] = '';
    }
  }

  return results;
}

/**
 * 使用首尾帧生成视频
 */
export async function generateVideoWithFirstAndLastFrame(
  prompt: string,
  _firstFrame: string,
  _lastFrame: string,
  projectId: string,
  episodeId?: string,
  duration: number = 5
): Promise<string> {
  const videoUrl = await AI.Video.generate(
    {
      prompt,
      duration,
    },
    'official:Wan2.6-I2V-1080P',
    parseInt(projectId) || 0
  );

  return saveGeneratedVideo(videoUrl, projectId, episodeId || '');
}
