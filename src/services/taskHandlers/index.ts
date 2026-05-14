import { registerExecutor } from '@/services/taskQueue'
import { aiGenerationHandler } from './aiGeneration'
import { voiceCloneHandler } from './voiceClone'

export function registerAllTaskHandlers() {
  registerExecutor('image_generation', aiGenerationHandler)
  registerExecutor('video_generation', aiGenerationHandler)
  registerExecutor('audio_generation', aiGenerationHandler)

  registerExecutor('voice_clone', voiceCloneHandler)

  console.log('[TaskHandlers] All task handlers registered')
}

export { aiGenerationHandler } from './aiGeneration'
export { voiceCloneHandler } from './voiceClone'
