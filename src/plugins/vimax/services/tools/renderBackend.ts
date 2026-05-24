/**
 * 渲染后端
 * 统一调用 FD 服务进行渲染
 */

import type {
  ImageGenerationParams,
  VideoGenerationParams,
  AudioGenerationParams,
  RenderTask,
} from '@/plugins/vimax/types';
import { AI } from '@/services/vendor';
import {
  saveGeneratedImage,
  saveGeneratedVideo,
  saveGeneratedAudio,
} from '@/utils/mediaStorage';

/**
 * 渲染任务队列
 */
class RenderQueue {
  private tasks: RenderTask[] = [];
  private running = false;
  private parallelLimit = 1;

  setParallelLimit(limit: number): void {
    this.parallelLimit = limit;
  }

  addTask(task: RenderTask): void {
    this.tasks.push(task);
  }

  removeTask(taskId: string): void {
    this.tasks = this.tasks.filter((t) => t.id !== taskId);
  }

  clear(): void {
    this.tasks = [];
  }

  async process(
    onProgress?: (task: RenderTask, completed: number, total: number) => void
  ): Promise<RenderTask[]> {
    if (this.running) {
      throw new Error('渲染队列正在运行中');
    }

    this.running = true;
    const results: RenderTask[] = [];
    const pending = [...this.tasks];

    try {
      while (pending.length > 0) {
        const batch = pending.splice(0, this.parallelLimit);

        await Promise.all(
          batch.map(async (task) => {
            try {
              task.status = 'running';
              const result = await executeRenderTask(task);
              task.status = 'completed';
              task.result = result;
            } catch (error) {
              task.status = 'error';
              task.error = error instanceof Error ? error.message : '渲染失败';
            }

            results.push(task);
            onProgress?.(task, results.length, this.tasks.length);
          })
        );
      }

      return results;
    } finally {
      this.running = false;
    }
  }

  isRunning(): boolean {
    return this.running;
  }
}

export const renderQueue = new RenderQueue();

/**
 * 执行单个渲染任务
 */
async function executeRenderTask(task: RenderTask): Promise<string> {
  switch (task.type) {
    case 'image': {
      const imageParams = task.params as ImageGenerationParams;
      const imageUrl = await AI.Image.generate(
        {
          prompt: imageParams.prompt,
          aspectRatio: `${imageParams.width || 1024}:${imageParams.height || 576}` as `${number}:${number}`,
        },
        imageParams.model || 'official:claude-sonnet-4-6',
        parseInt(imageParams.projectId) || 0
      );
      return saveGeneratedImage(
        imageUrl,
        imageParams.projectId,
        imageParams.episodeId || ''
      );
    }

    case 'video': {
      const videoParams = task.params as VideoGenerationParams;
      const videoUrl = await AI.Video.generate(
        {
          prompt: videoParams.prompt,
          aspectRatio: '16:9',
          duration: videoParams.duration || 5,
        },
        videoParams.model || 'official:Wan2.6-I2V-1080P',
        parseInt(videoParams.projectId) || 0
      );
      return saveGeneratedVideo(
        videoUrl,
        videoParams.projectId,
        videoParams.episodeId || ''
      );
    }

    case 'audio': {
      const audioParams = task.params as AudioGenerationParams;
      const audioUrl = await AI.Audio.generate(
        {
          text: audioParams.text,
          voice: audioParams.voice || 'default',
          speed: audioParams.speed,
        },
        'official:default',
        parseInt(audioParams.projectId) || 0
      );
      return saveGeneratedAudio(
        audioUrl,
        audioParams.projectId,
        audioParams.episodeId || ''
      );
    }

    default:
      throw new Error(`未知的渲染类型: ${task.type}`);
  }
}

/**
 * 创建渲染任务
 */
export function createRenderTask(
  type: 'image' | 'video' | 'audio',
  params: ImageGenerationParams | VideoGenerationParams | AudioGenerationParams
): RenderTask {
  return {
    id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    params,
    status: 'pending',
  };
}

/**
 * 批量渲染图片
 */
export async function batchRenderImages(
  params: ImageGenerationParams[],
  onProgress?: (completed: number, total: number) => void
): Promise<string[]> {
  renderQueue.clear();

  for (const param of params) {
    renderQueue.addTask(createRenderTask('image', param));
  }

  const results = await renderQueue.process((_task, completed, total) => {
    onProgress?.(completed, total);
  });

  return results.map((r) => r.result || '');
}

/**
 * 批量渲染视频
 */
export async function batchRenderVideos(
  params: VideoGenerationParams[],
  onProgress?: (completed: number, total: number) => void
): Promise<string[]> {
  renderQueue.clear();

  for (const param of params) {
    renderQueue.addTask(createRenderTask('video', param));
  }

  const results = await renderQueue.process((_task, completed, total) => {
    onProgress?.(completed, total);
  });

  return results.map((r) => r.result || '');
}
