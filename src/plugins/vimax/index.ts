/**
 * ViMax 插件入口
 *
 * ViMax - Agent + Pipeline 架构的视频生成插件
 * 集成到 FiveDesigner 中，提供从创意到视频的完整工作流
 */

// ==================== 类型导出 ====================
export type {
  // 核心 ViMax 类型
  ViMaxCharacterInScene,
  ViMaxScene,
  ViMaxShotDescription,
  ViMaxScript,
  ViMaxIdea,
  ViMaxNovel,

  // Agent 类型
  AgentType,
  AgentMessage,
  AgentConfig,
  AgentTool,
  AgentContext,

  // Pipeline 类型
  PipelineType,
  PipelineStep,
  PipelineConfig,
  PipelineState,
  PipelineOptions,
  PipelineProgressCallback,

  // 工具类型
  ImageGenerationParams,
  VideoGenerationParams,
  AudioGenerationParams,
  RenderTask,

  // Store 类型
  ViMaxStoreState,

  // 组件 Props
  ViMaxAgentPanelProps,
  PipelineExecutorProps,
  AgentChatMessageProps,
  PipelineStepIndicatorProps,

  // 数据适配类型
  FDCharacterData,
  FDSceneData,
  FDStoryboardData,
} from './types';

// ==================== 组件导出 ====================
export {
  ViMaxAgentPanel,
  PipelineExecutor,
  AgentChatMessage,
  PipelineStepIndicator,
} from './components';

// ==================== Hooks 导出 ====================
export {
  useViMaxPipeline,
  useViMaxAgents,
  type UseViMaxPipelineReturn,
  type UseViMaxAgentsReturn,
} from './hooks';

// ==================== Store 导出 ====================
export { useViMaxStore } from './stores/vimaxStore';

// ==================== Agent 导出 ====================
export {
  // Agent 配置
  screenwriterAgentConfig,
  characterExtractorAgentConfig,
  storyboardArtistAgentConfig,
  cameraPlannerAgentConfig,
  characterPortraitAgentConfig,
  referenceImageSelectorAgentConfig,

  // Agent 执行函数
  runScreenwriterAgent,
  runCharacterExtractorAgent,
  runStoryboardArtistAgent,
  runCameraPlannerAgent,
  runCharacterPortraitAgent,
  runReferenceImageSelectorAgent,
  generateShotReferenceImage,

  // Agent 类型
  type ScreenwriterInput,
  type ScreenwriterOutput,
  type CharacterExtractorInput,
  type CharacterExtractorOutput,
  type StoryboardArtistInput,
  type StoryboardArtistOutput,
  type CameraPlannerInput,
  type CameraPlannerOutput,
  type CharacterPortraitInput,
  type CharacterPortraitOutput,
  type ReferenceImageInput,
  type ReferenceImageOutput,
  type ShotReferenceInput,
  type ShotReferenceOutput,
} from './services/agents';

// ==================== Pipeline 导出 ====================
export {
  // Pipeline 配置
  script2VideoPipelineConfig,
  idea2VideoPipelineConfig,
  novel2VideoPipelineConfig,

  // Pipeline 创建函数
  createScript2VideoPipeline,
  createIdea2VideoPipeline,
  createNovel2VideoPipeline,

  // Pipeline 执行函数
  runScript2VideoPipeline,
  runIdea2VideoPipeline,
  runNovel2VideoPipeline,

  // Pipeline 取消函数
  cancelScript2VideoPipeline,
  cancelIdea2VideoPipeline,
  cancelNovel2VideoPipeline,

  // Pipeline 类型
  type Script2VideoInput,
  type Idea2VideoInput,
  type Novel2VideoInput,
} from './services/pipelines';

// ==================== 工具导出 ====================
export {
  // 图片生成
  generateShotImage,
  generateShotImages,
  generateSceneConceptImage,
  type ShotImageParams,

  // 视频生成
  generateShotVideo,
  generateShotVideos,
  generateVideoWithFirstAndLastFrame,
  type ShotVideoParams,

  // 渲染后端
  renderQueue,
  createRenderTask,
  batchRenderImages,
  batchRenderVideos,
} from './services/tools';

// ==================== 数据适配导出 ====================
export {
  // 保存到数据库
  saveScriptToDatabase,
  saveCharacterToDatabase,
  saveSceneToDatabase,
  saveShotsToDatabase,

  // 从数据库加载
  loadCharactersFromDatabase,
  loadScenesFromDatabase,
  loadShotsFromDatabase,
  loadScriptFromDatabase,

  // 更新操作
  updateShotStatus,
  updateCharacterPortrait,
  updateSceneReferenceImage,

  // 删除操作
  deleteScriptData,
} from './services/dataAdapter';

// ==================== 插件元数据 ====================
export const VimaxPluginMeta = {
  id: 'vimax',
  name: 'ViMax AI 视频生成',
  version: '1.0.0',
  description: 'Agent + Pipeline 架构的智能视频生成插件',
  author: 'FiveDesigner',
} as const;
