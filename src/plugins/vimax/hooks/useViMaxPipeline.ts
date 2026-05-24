/**
 * Pipeline 执行 Hook
 * 封装 Pipeline 的创建、执行、取消等操作
 */

import { useState, useCallback, useRef } from 'react';

import {
  createIdea2VideoPipeline,
  runIdea2VideoPipeline,
  cancelIdea2VideoPipeline,
  createNovel2VideoPipeline,
  runNovel2VideoPipeline,
  cancelNovel2VideoPipeline,
  createScript2VideoPipeline,
  runScript2VideoPipeline,
  cancelScript2VideoPipeline,
} from '@/plugins/vimax/services/pipelines';
import { useViMaxStore } from '@/plugins/vimax/stores/vimaxStore';
import type {
  PipelineState,
  PipelineProgressCallback,
  PipelineOptions,
  ViMaxIdea,
  ViMaxNovel,
  ViMaxScript,
} from '@/plugins/vimax/types';

export interface UseViMaxPipelineReturn {
  pipeline: PipelineState | null;
  isRunning: boolean;
  error: string | null;
  progress: number;
  startIdea2Video: (idea: ViMaxIdea, options?: PipelineOptions) => Promise<void>;
  startNovel2Video: (novel: ViMaxNovel, options?: PipelineOptions) => Promise<void>;
  startScript2Video: (script: ViMaxScript, options?: PipelineOptions) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

export function useViMaxPipeline(
  projectId: string,
  episodeId?: string
): UseViMaxPipelineReturn {
  const [pipeline, setPipeline] = useState<PipelineState | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const abortRef = useRef(false);

  const { setActivePipeline, setIsPipelineRunning, addPipelineToHistory } =
    useViMaxStore();

  const createProgressCallbacks = useCallback(
    (resolve: () => void, reject: (error: Error) => void): PipelineProgressCallback => {
      return {
        onStepStart: (_step, stepIndex) => {
          setProgress((stepIndex / (pipeline?.steps.length || 1)) * 100);
        },
        onStepProgress: (_step, stepIndex, stepProgress) => {
          const baseProgress = (stepIndex / (pipeline?.steps.length || 1)) * 100;
          const stepContribution =
            (stepProgress / 100) * (100 / (pipeline?.steps.length || 1));
          setProgress(baseProgress + stepContribution);
        },
        onStepComplete: (_step, stepIndex) => {
          setProgress(((stepIndex + 1) / (pipeline?.steps.length || 1)) * 100);
        },
        onPipelineComplete: (state) => {
          setIsRunning(false);
          setProgress(100);
          setActivePipeline(null);
          addPipelineToHistory(state);
          resolve();
        },
        onPipelineError: (state, err) => {
          setIsRunning(false);
          setError(err);
          setActivePipeline(null);
          addPipelineToHistory(state);
          reject(new Error(err));
        },
        onPipelineCancel: (state) => {
          setIsRunning(false);
          setActivePipeline(null);
          addPipelineToHistory(state);
          resolve();
        },
      };
    },
    [pipeline, setActivePipeline, addPipelineToHistory]
  );

  const startIdea2Video = useCallback(
    async (idea: ViMaxIdea, options?: PipelineOptions) => {
      if (isRunning) {
        throw new Error('已有 Pipeline 正在运行');
      }

      abortRef.current = false;
      setIsRunning(true);
      setError(null);
      setProgress(0);

      const newPipeline = createIdea2VideoPipeline({
        idea,
        projectId,
        episodeId,
        options,
      });

      setPipeline(newPipeline);
      setActivePipeline(newPipeline);
      setIsPipelineRunning(true);

      try {
        await new Promise<void>((resolve, reject) => {
          const callbacks = createProgressCallbacks(resolve, reject);
          runIdea2VideoPipeline(
            newPipeline,
            { idea, projectId, episodeId, options },
            callbacks
          );
        });
      } catch (err) {
        if (!abortRef.current) {
          setError(err instanceof Error ? err.message : '未知错误');
        }
      } finally {
        setIsRunning(false);
        setIsPipelineRunning(false);
      }
    },
    [isRunning, projectId, episodeId, createProgressCallbacks, setActivePipeline, setIsPipelineRunning]
  );

  const startNovel2Video = useCallback(
    async (novel: ViMaxNovel, options?: PipelineOptions) => {
      if (isRunning) {
        throw new Error('已有 Pipeline 正在运行');
      }

      abortRef.current = false;
      setIsRunning(true);
      setError(null);
      setProgress(0);

      const newPipeline = createNovel2VideoPipeline({
        novel,
        projectId,
        episodeId,
        options,
      });

      setPipeline(newPipeline);
      setActivePipeline(newPipeline);
      setIsPipelineRunning(true);

      try {
        await new Promise<void>((resolve, reject) => {
          const callbacks = createProgressCallbacks(resolve, reject);
          runNovel2VideoPipeline(
            newPipeline,
            { novel, projectId, episodeId, options },
            callbacks
          );
        });
      } catch (err) {
        if (!abortRef.current) {
          setError(err instanceof Error ? err.message : '未知错误');
        }
      } finally {
        setIsRunning(false);
        setIsPipelineRunning(false);
      }
    },
    [isRunning, projectId, episodeId, createProgressCallbacks, setActivePipeline, setIsPipelineRunning]
  );

  const startScript2Video = useCallback(
    async (script: ViMaxScript, options?: PipelineOptions) => {
      if (isRunning) {
        throw new Error('已有 Pipeline 正在运行');
      }

      abortRef.current = false;
      setIsRunning(true);
      setError(null);
      setProgress(0);

      const newPipeline = createScript2VideoPipeline({
        script,
        projectId,
        episodeId,
        options,
      });

      setPipeline(newPipeline);
      setActivePipeline(newPipeline);
      setIsPipelineRunning(true);

      try {
        await new Promise<void>((resolve, reject) => {
          const callbacks = createProgressCallbacks(resolve, reject);
          runScript2VideoPipeline(
            newPipeline,
            { script, projectId, episodeId, options },
            callbacks
          );
        });
      } catch (err) {
        if (!abortRef.current) {
          setError(err instanceof Error ? err.message : '未知错误');
        }
      } finally {
        setIsRunning(false);
        setIsPipelineRunning(false);
      }
    },
    [isRunning, projectId, episodeId, createProgressCallbacks, setActivePipeline, setIsPipelineRunning]
  );

  const cancel = useCallback(() => {
    abortRef.current = true;
    cancelIdea2VideoPipeline();
    cancelNovel2VideoPipeline();
    cancelScript2VideoPipeline();

    if (pipeline) {
      pipeline.status = 'cancelled';
      setActivePipeline(null);
      addPipelineToHistory(pipeline);
    }

    setIsRunning(false);
    setIsPipelineRunning(false);
  }, [pipeline, setActivePipeline, addPipelineToHistory, setIsPipelineRunning]);

  const reset = useCallback(() => {
    setPipeline(null);
    setIsRunning(false);
    setError(null);
    setProgress(0);
    setActivePipeline(null);
  }, [setActivePipeline]);

  return {
    pipeline,
    isRunning,
    error,
    progress,
    startIdea2Video,
    startNovel2Video,
    startScript2Video,
    cancel,
    reset,
  };
}
