/**
 * 创意→视频 Pipeline
 * 将创意概念直接转换为完整视频
 */

import { v4 as uuidv4 } from 'uuid';

import {
  runScreenwriterAgent,
  type ScreenwriterInput,
} from '@/plugins/vimax/services/agents';
import type {
  PipelineConfig,
  PipelineState,
  PipelineProgressCallback,
  PipelineOptions,
  ViMaxIdea,
  ViMaxScript,
  AgentContext,
} from '@/plugins/vimax/types';

import {
  createScript2VideoPipeline,
  runScript2VideoPipeline,
  type Script2VideoInput,
} from './script2VideoPipeline';

export const idea2VideoPipelineConfig: PipelineConfig = {
  type: 'idea2video',
  name: '创意转视频',
  description: '将创意概念直接转换为完整视频',
  steps: [
    {
      id: 'generate-script',
      name: '生成剧本',
      description: '将创意转换为结构化剧本',
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
  input: {} as ViMaxIdea,
};

export interface Idea2VideoInput {
  idea: ViMaxIdea;
  projectId: string;
  episodeId?: string;
  options?: PipelineOptions;
}

let isCancelled = false;

export function createIdea2VideoPipeline(
  input: Idea2VideoInput
): PipelineState {
  const { idea, options } = input;

  const state: PipelineState = {
    id: uuidv4(),
    config: {
      ...idea2VideoPipelineConfig,
      input: idea,
      options,
    },
    status: 'idle',
    currentStepIndex: -1,
    steps: idea2VideoPipelineConfig.steps.map((step) => ({ ...step })),
  };

  isCancelled = false;

  return state;
}

export async function runIdea2VideoPipeline(
  state: PipelineState,
  input: Idea2VideoInput,
  callbacks?: PipelineProgressCallback
): Promise<PipelineState> {
  const { idea, projectId, episodeId, options } = input;
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
    // Step 1: 生成剧本
    const step0 = state.steps[0];
    if (!step0) throw new Error('步骤 0 不存在');
    state.currentStepIndex = 0;
    step0.status = 'running';
    step0.startTime = Date.now();
    callbacks?.onStepStart?.(step0, 0);

    if (isCancelled) {
      return handleCancel(state, callbacks);
    }

    const screenwriterInput: ScreenwriterInput = {
      type: 'idea',
      content: idea.content,
      title: idea.title,
      genre: idea.genre,
      style: idea.style,
      targetDuration: idea.targetDuration,
    };

    const screenwriterResult = await runScreenwriterAgent(
      screenwriterInput,
      agentContext
    );
    script = screenwriterResult.script;

    step0.status = 'completed';
    step0.progress = 100;
    step0.result = { script };
    step0.endTime = Date.now();
    callbacks?.onStepComplete?.(step0, 0, { script });

    if (isCancelled) {
      return handleCancel(state, callbacks);
    }

    // Step 2: 剧本转视频
    const step1 = state.steps[1];
    if (!step1) throw new Error('步骤 1 不存在');
    state.currentStepIndex = 1;
    step1.status = 'running';
    step1.startTime = Date.now();
    callbacks?.onStepStart?.(step1, 1);

    const script2VideoInput: Script2VideoInput = {
      script,
      projectId,
      episodeId,
      options,
    };

    const subPipeline = createScript2VideoPipeline(script2VideoInput);

    const subCallbacks: PipelineProgressCallback = {
      onStepStart: (_step, stepIndex) => {
        step1.progress = (stepIndex / subPipeline.steps.length) * 100;
        callbacks?.onStepProgress?.(step1, 1, step1.progress);
      },
      onStepProgress: (_step, stepIndex, progress) => {
        const baseProgress = (stepIndex / subPipeline.steps.length) * 100;
        const stepContribution = progress / subPipeline.steps.length;
        step1.progress = baseProgress + stepContribution;
        callbacks?.onStepProgress?.(
          step1,
          1,
          step1.progress
        );
      },
      onStepComplete: (_step, stepIndex) => {
        const progress = ((stepIndex + 1) / subPipeline.steps.length) * 100;
        step1.progress = progress;
        callbacks?.onStepProgress?.(step1, 1, progress);
      },
      onStepError: (_step, _stepIndex, error) => {
        step1.status = 'error';
        step1.error = error;
        callbacks?.onStepError?.(step1, 1, error);
      },
    };

    await runScript2VideoPipeline(subPipeline, script2VideoInput, subCallbacks);

    if (isCancelled) {
      return handleCancel(state, callbacks);
    }

    step1.status = 'completed';
    step1.progress = 100;
    step1.result = { pipelineId: subPipeline.id };
    step1.endTime = Date.now();
    callbacks?.onStepComplete?.(step1, 1, { pipelineId: subPipeline.id });

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

export function cancelIdea2VideoPipeline(): void {
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
