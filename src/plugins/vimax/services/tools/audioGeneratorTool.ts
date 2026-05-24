/**
 * 音频生成工具
 * 适配 FD 的 AI.Audio.generate
 */

import type { ViMaxShotDescription } from '@/plugins/vimax/types';
import { AI } from '@/services/vendor';
import { saveGeneratedAudio } from '@/utils/mediaStorage';

export interface ShotAudioParams {
  shot: ViMaxShotDescription;
  projectId: string;
  episodeId?: string;
  model?: string;
}

/**
 * 为分镜生成配音音频
 */
export async function generateShotAudio(
  shot: ViMaxShotDescription,
  projectId: string,
  episodeId?: string
): Promise<string> {
  if (!shot.dubbing) {
    throw new Error('分镜没有配音内容');
  }

  const audioUrl = await AI.Audio.generate(
    {
      text: shot.dubbing.line,
      voice: shot.dubbing.character || 'default',
      emotion: shot.dubbing.emotion,
    },
    'official:default',
    parseInt(projectId) || 0
  );

  return saveGeneratedAudio(audioUrl, projectId, episodeId || '');
}
