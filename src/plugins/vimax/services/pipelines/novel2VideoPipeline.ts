/**
 * 小说→视频 Pipeline
 * 将小说内容转换为完整视频
 */

import { v4 as uuidv4 } from 'uuid';

import {
  runScreenwriterAgent,
  runCharacterExtractorAgent,
  type ScreenwriterInput,
  type CharacterExtractorInput,
} from '@/plugins/vimax/services/agents';
import type {
  PipelineConfig,
  PipelineState,
  PipelineProgressCallback,
  PipelineOptions,
  ViMaxNovel,
  ViMaxScript,
  AgentContext,
} from '@/plugins/vimax/types';

import {
  createScript2VideoPipeline,
  runScript2VideoPipeline,
  type Script2VideoInput,
} from './script2VideoPipeline';

export const novel2VideoPipelineConfig: PipelineConfig = {
  type: 'novel2video',
  name: '小说转视频',
  description: '将小说内容转换为完整视频',
  steps: [
    {
      id: 'extract-characters',
      name: '提取角色',
      description: '从小说中提取角色信息',
      status: 'pending',
      progress: 0,
    },
    {
      id: 'generate-script',
      name: '生成剧本',
      description: '将小说转换为结构化剧本',
      status: 'pending',
      progress: 0,
    },
    {
      id: 'script-to-video',
      name: '剧本转视频',
      description: '执行剧本转视频流程',
      status: 'pending',
      progress: 0,
    },
  ],
  input: {} as ViMaxNovel,
};

export interface Novel2VideoInput {
  novel: ViMaxNovel;
  projectId: string;
  episodeId?: string;
  options?: PipelineOptions;
}

let isCancelled = false;

export function createNovel2VideoPipeline(
  input: Novel2VideoInput
): PipelineState {
  const { novel, options } = input;

  const state: PipelineState = {
    id: uuidv4(),
    config: {
      ...novel2VideoPipelineConfig,
      input: novel,
      options,
    },
    status: 'idle',
    currentStepIndex: -1,
    steps: novel2VideoPipelineConfig.steps.map((step) => ({ ...step })),
  };

  isCancelled = false;

  return state;
}

export async function runNovel2VideoPipeline(
  state: PipelineState,
  input: Novel2VideoInput,
  callbacks?: PipelineProgressCallback
): Promise<PipelineState> {
  const { novel, projectId, episodeId, options } = input;
  const agentContext: AgentContext = {
    projectId,
    episodeId,
    messages: [],
    tools: [],
  };

  state.status = 'running';
  state.startTime = Date.now();

  let script: ViMaxScript | null = null;

  try {
    // Step 1: 提取角色
    const step0 = state.steps[0];
    if (!step0) throw new Error('步骤 0 不存在');
    state.currentStepIndex = 0;
    step0.status = 'running';
    step0.startTime = Date.now();
    callbacks?.onStepStart?.(step0, 0);

    if (isCancelled) {
      return handleCancel(state, callbacks);
    }

    const characterInput: CharacterExtractorInput = {
      script: novel.content,
    };

    const characterResult = await runCharacterExtractorAgent(
      characterInput
    );

    step0.status = 'completed';
    step0.progress = 100;
    step0.result = { characters: characterResult.characters };
    step0.endTime = Date.now();
    callbacks?.onStepComplete?.(step0, 0, {
      characters: characterResult.characters,
    });

    if (isCancelled) {
      return handleCancel(state, callbacks);
    }

    // Step 2: 生成剧本
    const step1 = state.steps[1];
    if (!step1) throw new Error('步骤 1 不存在');
    state.currentStepIndex = 1;
    step1.status = 'running';
    step1.startTime = Date.now();
    callbacks?.onStepStart?.(step1, 1);

    const screenwriterInput: ScreenwriterInput = {
      type: 'novel',
      content: novel.content,
      title: novel.title,
    };

    const screenwriterResult = await runScreenwriterAgent(
      screenwriterInput,
      agentContext
    );
    script = screenwriterResult.script;

    // 合并提取的角色信息
    if (characterResult.characters.length > 0 && script) {
      script.characters = characterResult.characters.map((char) => {
        const existing = script!.characters.find((c) => c.name === char.name);
        return existing ? { ...existing, ...char } : char;
      });
    }

    step1.status = 'completed';
    step1.progress = 100;
    step1.result = { script };
    step1.endTime = Date.now();
    callbacks?.onStepComplete?.(step1, 1, { script });

    if (isCancelled) {
      return handleCancel(state, callbacks);
    }

    // Step 3: 剧本转视频
    const step2 = state.steps[2];
    if (!step2) throw new Error('步骤 2 不存在');
    state.currentStepIndex = 2;
    step2.status = 'running';
    step2.startTime = Date.now();
    callbacks?.onStepStart?.(step2, 2);

    const script2VideoInput: Script2VideoInput = {
      script,
      projectId,
      episodeId,
      options,
    };

    const subPipeline = createScript2VideoPipeline(script2VideoInput);

    const subCallbacks: PipelineProgressCallback = {
      onStepStart: (_step, stepIndex) => {
        step2.progress = (stepIndex / subPipeline.steps.length) * 100;
        callbacks?.onStepProgress?.(step2, 2, step2.progress);
      },
      onStepProgress: (_step, stepIndex, progress) => {
        const baseProgress = (stepIndex / subPipeline.steps.length) * 100;
        const stepContribution = progress / subPipeline.steps.length;
        step2.progress = baseProgress + stepContribution;
        callbacks?.onStepProgress?.(
          step2,
          2,
          step2.progress
        );
      },
      onStepComplete: (_step, stepIndex) => {
        const progress = ((stepIndex + 1) / subPipeline.steps.length) * 100;
        step2.progress = progress;
        callbacks?.onStepProgress?.(step2, 2, progress);
      },
      onStepError: (_step, _stepIndex, error) => {
        step2.status = 'error';
        step2.error = error;
        callbacks?.onStepError?.(step2, 2, error);
      },
    };

    await runScript2VideoPipeline(subPipeline, script2VideoInput, subCallbacks);

    if (isCancelled) {
      return handleCancel(state, callbacks);
    }

    step2.status = 'completed';
    step2.progress = 100;
    step2.result = { pipelineId: subPipeline.id };
    step2.endTime = Date.now();
    callbacks?.onStepComplete?.(step2, 2, { pipelineId: subPipeline.id });

    state.status = 'completed';
    state.endTime = Date.now();
    callbacks?.onPipelineComplete?.(state);

    return state;
  } catch (error) {
    state.status = 'error';
    state.error = error instanceof Error ? error.message : '未知错误';
    state.endTime = Date.now();

    if (state.currentStepIndex >= 0) {
      const currentStep = state.steps[state.currentStepIndex];
      if (currentStep) {
        currentStep.status = 'error';
        currentStep.error = state.error;
      }
    }

    callbacks?.onPipelineError?.(state, state.error);
    return state;
  }
}

export function cancelNovel2VideoPipeline(): void {
  isCancelled = true;
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
