/**
 * Agent 导出
 */

export {
  screenwriterAgentConfig,
  runScreenwriterAgent,
  type ScreenwriterInput,
  type ScreenwriterOutput,
} from './screenwriterAgent';

export {
  characterExtractorAgentConfig,
  runCharacterExtractorAgent,
  type CharacterExtractorInput,
  type CharacterExtractorOutput,
} from './characterExtractorAgent';

export {
  storyboardArtistAgentConfig,
  runStoryboardArtistAgent,
  type StoryboardArtistInput,
  type StoryboardArtistOutput,
} from './storyboardArtistAgent';

export {
  cameraPlannerAgentConfig,
  runCameraPlannerAgent,
  type CameraPlannerInput,
  type CameraPlannerOutput,
} from './cameraPlannerAgent';

export {
  characterPortraitAgentConfig,
  runCharacterPortraitAgent,
  type CharacterPortraitInput,
  type CharacterPortraitOutput,
} from './characterPortraitAgent';

export {
  referenceImageSelectorAgentConfig,
  runReferenceImageSelectorAgent,
  generateShotReferenceImage,
  type ReferenceImageInput,
  type ReferenceImageOutput,
  type ShotReferenceInput,
  type ShotReferenceOutput,
} from './referenceImageSelectorAgent';

export type { AgentConfig, AgentContext, AgentMessage, AgentTool } from '@/plugins/vimax/types';
