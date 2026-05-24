/**
 * Pipeline 导出
 */

export {
  script2VideoPipelineConfig,
  createScript2VideoPipeline,
  runScript2VideoPipeline,
  cancelScript2VideoPipeline,
  type Script2VideoInput,
} from './script2VideoPipeline';

export {
  idea2VideoPipelineConfig,
  createIdea2VideoPipeline,
  runIdea2VideoPipeline,
  cancelIdea2VideoPipeline,
  type Idea2VideoInput,
} from './idea2VideoPipeline';

export {
  novel2VideoPipelineConfig,
  createNovel2VideoPipeline,
  runNovel2VideoPipeline,
  cancelNovel2VideoPipeline,
  type Novel2VideoInput,
} from './novel2VideoPipeline';

export type {
  PipelineConfig,
  PipelineState,
  PipelineStep,
  PipelineProgressCallback,
  PipelineOptions,
} from '@/plugins/vimax/types';
