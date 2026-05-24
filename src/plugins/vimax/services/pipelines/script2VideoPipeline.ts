/**
 * 剧本→视频 Pipeline
 * 将结构化剧本转换为完整视频
 */

import { v4 as uuidv4 } from 'uuid';

import {
  runStoryboardArtistAgent,
  runCameraPlannerAgent,
  runCharacterPortraitAgent,
} from '@/plugins/vimax/services/agents';
import {
  saveScriptToDatabase,
  saveShotsToDatabase,
} from '@/plugins/vimax/services/dataAdapter';
import {
  generateShotImage,
  generateShotVideo,
  generateShotAudio,
} from '@/plugins/vimax/services/tools';
import type {
  PipelineConfig,
  PipelineState,
  PipelineProgressCallback,
  PipelineOptions,
  ViMaxScript,
  ViMaxShotDescription,
} from '@/plugins/vimax/types';

export const script2VideoPipelineConfig: PipelineConfig = {
  type: 'script2video',
  name: '剧本转视频',
  description: '将结构化剧本转换为完整视频',
  steps: [
    {
      id: 'validate-script',
      name: '验证剧本',
      description: '验证剧本结构完整性',
      status: 'pending',
      progress: 0,
    },
    {
      id: 'generate-portraits',
      name: '生成角色肖像',
      description: '为每个角色生成肖像图片',
      status: 'pending',
      progress: 0,
    },
    {
      id: 'design-storyboards',
      name: '设计分镜',
      description: '为每个场景设计分镜',
      status: 'pending',
      progress: 0,
    },
    {
      id: 'plan-camera',
      name: '机位规划',
      description: '优化机位和镜头运动',
      status: 'pending',
      progress: 0,
    },
    {
      id: 'generate-images',
      name: '生成分镜图',
      description: '为每个分镜生成图片',
      status: 'pending',
      progress: 0,
    },
    {
      id: 'generate-videos',
      name: '生成视频',
      description: '将分镜图转换为视频',
      status: 'pending',
      progress: 0,
    },
    {
      id: 'generate-audio',
      name: '生成配音',
      description: '为分镜生成配音',
      status: 'pending',
      progress: 0,
    },
    {
      id: 'save-to-db',
      name: '保存数据',
      description: '将所有数据保存到数据库',
      status: 'pending',
      progress: 0,
    },
  ],
  input: {} as ViMaxScript,
};

export interface Script2VideoInput {
  script: ViMaxScript;
  projectId: string;
  episodeId?: string;
  options?: PipelineOptions;
}

let isCancelled = false;

export function createScript2VideoPipeline(
  input: Script2VideoInput
): PipelineState {
  const { script, options } = input;

  const state: PipelineState = {
    id: uuidv4(),
    config: {
      ...script2VideoPipelineConfig,
      input: script,
      options,
    },
    status: 'idle',
    currentStepIndex: -1,
    steps: script2VideoPipelineConfig.steps.map((step) => ({ ...step })),
  };

  isCancelled = false;

  return state;
}

export async function runScript2VideoPipeline(
  state: PipelineState,
  input: Script2VideoInput,
  callbacks?: PipelineProgressCallback
): Promise<PipelineState> {
  const { script, projectId, episodeId, options } = input;

  state.status = 'running';
  state.startTime = Date.now();

  try {
    // Step 1: 验证剧本
    await executeStep(state, 0, callbacks, async () => {
      if (!script.scenes || script.scenes.length === 0) {
        throw new Error('剧本中没有场景');
      }
      if (!script.characters || script.characters.length === 0) {
        throw new Error('剧本中没有角色');
      }
      return { valid: true };
    });

    if (isCancelled) return handleCancel(state, callbacks);

    // Step 2: 生成角色肖像
    await executeStep(state, 1, callbacks, async () => {
      if (!options?.generateImages) return { skipped: true };

      const portraits: Record<string, string> = {};
      for (let i = 0; i < script.characters.length; i++) {
        if (isCancelled) break;

        const char = script.characters[i];
        if (!char) continue;

        const result = await runCharacterPortraitAgent({
          character: char,
          projectId,
          episodeId,
        });

        portraits[char.name] = result.portraitUrl;

        const progress = ((i + 1) / script.characters.length) * 100;
        updateStepProgress(state, 1, progress);
        const step1 = state.steps[1];
        if (step1) {
          callbacks?.onStepProgress?.(step1, 1, progress);
        }
      }

      return { portraits };
    });

    if (isCancelled) return handleCancel(state, callbacks);

    // Step 3: 设计分镜
    let allShots: ViMaxShotDescription[] = [];
    await executeStep(state, 2, callbacks, async () => {
      for (let i = 0; i < script.scenes.length; i++) {
        if (isCancelled) break;

        const scene = script.scenes[i];
        if (!scene) continue;

        const result = await runStoryboardArtistAgent({
          scene,
          characters: script.characters,
          scriptSummary: script.summary,
          previousShots: allShots.slice(-3),
        });

        allShots = [...allShots, ...result.shots];

        const progress = ((i + 1) / script.scenes.length) * 100;
        updateStepProgress(state, 2, progress);
        const step2 = state.steps[2];
        if (step2) {
          callbacks?.onStepProgress?.(step2, 2, progress);
        }
      }

      return { shotCount: allShots.length };
    });

    if (isCancelled) return handleCancel(state, callbacks);

    // Step 4: 机位规划
    await executeStep(state, 3, callbacks, async () => {
      if (allShots.length === 0) return { skipped: true };

      const optimizedShots = await runCameraPlannerAgent({
        shots: allShots,
        sceneDescription: script.summary,
      });

      allShots = optimizedShots.optimizedShots;

      return { optimizedCount: allShots.length };
    });

    if (isCancelled) return handleCancel(state, callbacks);

    // Step 5: 生成分镜图
    await executeStep(state, 4, callbacks, async () => {
      if (!options?.generateImages) return { skipped: true };

      for (let i = 0; i < allShots.length; i++) {
        if (isCancelled) break;

        const shot = allShots[i];
        if (!shot) continue;

        const imageUrl = await generateShotImage(shot, projectId, episodeId);
        shot.imageUrl = imageUrl;
        shot.status = 'generating_video';

        const progress = ((i + 1) / allShots.length) * 100;
        updateStepProgress(state, 4, progress);
        const step4 = state.steps[4];
        if (step4) {
          callbacks?.onStepProgress?.(step4, 4, progress);
        }
      }

      return { generatedCount: allShots.filter((s) => s.imageUrl).length };
    });

    if (isCancelled) return handleCancel(state, callbacks);

    // Step 6: 生成视频
    await executeStep(state, 5, callbacks, async () => {
      if (!options?.generateVideos) return { skipped: true };

      for (let i = 0; i < allShots.length; i++) {
        if (isCancelled) break;

        const shot = allShots[i];
        if (!shot) continue;
        if (!shot.imageUrl) continue;

        const videoUrl = await generateShotVideo(shot, projectId, episodeId);
        shot.videoUrl = videoUrl;
        shot.status = 'generating_audio';

        const progress = ((i + 1) / allShots.length) * 100;
        updateStepProgress(state, 5, progress);
        const step5 = state.steps[5];
        if (step5) {
          callbacks?.onStepProgress?.(step5, 5, progress);
        }
      }

      return { generatedCount: allShots.filter((s) => s.videoUrl).length };
    });

    if (isCancelled) return handleCancel(state, callbacks);

    // Step 7: 生成配音
    await executeStep(state, 6, callbacks, async () => {
      if (!options?.generateAudio) return { skipped: true };

      const shotsWithDubbing = allShots.filter((s) => s.dubbing);
      for (let i = 0; i < shotsWithDubbing.length; i++) {
        if (isCancelled) break;

        const shot = shotsWithDubbing[i];
        if (!shot) continue;
        if (!shot.dubbing) continue;

        const audioUrl = await generateShotAudio(shot, projectId, episodeId);
        shot.audioUrl = audioUrl;
        shot.status = 'completed';

        const progress = ((i + 1) / shotsWithDubbing.length) * 100;
        updateStepProgress(state, 6, progress);
        const step6 = state.steps[6];
        if (step6) {
          callbacks?.onStepProgress?.(step6, 6, progress);
        }
      }

      return {
        generatedCount: allShots.filter((s) => s.audioUrl).length,
      };
    });

    if (isCancelled) return handleCancel(state, callbacks);

    // Step 8: 保存到数据库
    await executeStep(state, 7, callbacks, async () => {
      await saveScriptToDatabase(script, projectId, episodeId || undefined);
      await saveShotsToDatabase(allShots, projectId, episodeId || undefined);

      return { saved: true };
    });

    state.status = 'completed';
    state.endTime = Date.now();
    callbacks?.onPipelineComplete?.(state);

    return state;
  } catch (error) {
    state.status = 'error';
    state.error = error instanceof Error ? error.message : '未知错误';
    state.endTime = Date.now();
    callbacks?.onPipelineError?.(state, state.error);
    return state;
  }
}

export function cancelScript2VideoPipeline(): void {
  isCancelled = true;
}

async function executeStep(
  state: PipelineState,
  stepIndex: number,
  callbacks: PipelineProgressCallback | undefined,
  executor: () => Promise<unknown>
): Promise<void> {
  state.currentStepIndex = stepIndex;
  const step = state.steps[stepIndex];
  if (!step) {
    throw new Error(`步骤 ${stepIndex} 不存在`);
  }
  step.status = 'running';
  step.startTime = Date.now();

  callbacks?.onStepStart?.(step, stepIndex);

  try {
    const result = await executor();
    step.status = 'completed';
    step.progress = 100;
    step.result = result;
    step.endTime = Date.now();

    callbacks?.onStepComplete?.(step, stepIndex, result);
  } catch (error) {
    step.status = 'error';
    step.error = error instanceof Error ? error.message : '未知错误';
    step.endTime = Date.now();

    callbacks?.onStepError?.(step, stepIndex, step.error);
    throw error;
  }
}

function updateStepProgress(
  state: PipelineState,
  stepIndex: number,
  progress: number
): void {
  const step = state.steps[stepIndex];
  if (step) {
    step.progress = progress;
  }
}

function handleCancel(
  state: PipelineState,
  callbacks: PipelineProgressCallback | undefined
): PipelineState {
  state.status = 'cancelled';
  state.endTime = Date.now();
  callbacks?.onPipelineCancel?.(state);
  return state;
}
