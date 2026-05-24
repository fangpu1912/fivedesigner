/**
 * 工具导出
 */

export {
  generateShotImage,
  generateShotImages,
  generateSceneConceptImage,
  type ShotImageParams,
} from './imageGeneratorTool';

export {
  generateShotVideo,
  generateShotVideos,
  generateVideoWithFirstAndLastFrame,
  type ShotVideoParams,
} from './videoGeneratorTool';

export {
  renderQueue,
  createRenderTask,
  batchRenderImages,
  batchRenderVideos,
} from './renderBackend';

export {
  generateShotAudio,
  type ShotAudioParams,
} from './audioGeneratorTool';

export type {
  ImageGenerationParams,
  VideoGenerationParams,
  AudioGenerationParams,
  RenderTask,
} from '@/plugins/vimax/types';
