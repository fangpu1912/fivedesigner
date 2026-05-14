/**
 * 功能开关配置
 * 用于控制未完成或实验性功能的显示
 */

export const FEATURES = {
  DOCUMENT_PREVIEW: false,
  STATISTICS: false,
  BATCH_EXPORT: true,
  MULTI_REFERENCE: true,
  AUDIO_GENERATION: true,
  VIDEO_GENERATION: true,
  COMFYUI_INTEGRATION: true,
  AI_CHAT: true,
  ASSET_EXTRACTION: true,
  STORYBOARD_GENERATION: true,
} as const

export type FeatureName = keyof typeof FEATURES

export function isFeatureEnabled(feature: FeatureName): boolean {
  return FEATURES[feature] === true
}

export function getDisabledFeatureMessage(feature: FeatureName): string {
  const messages: Record<FeatureName, string> = {
    DOCUMENT_PREVIEW: '文档预览功能正在开发中，敬请期待',
    STATISTICS: '统计功能正在开发中，敬请期待',
    BATCH_EXPORT: '批量导出功能暂未启用',
    MULTI_REFERENCE: '多参考图功能暂未启用',
    AUDIO_GENERATION: '音频生成功能暂未启用',
    VIDEO_GENERATION: '视频生成功能暂未启用',
    COMFYUI_INTEGRATION: 'ComfyUI 集成功能暂未启用',
    AI_CHAT: 'AI 对话功能暂未启用',
    ASSET_EXTRACTION: '资产提取功能暂未启用',
    STORYBOARD_GENERATION: '分镜生成功能暂未启用',
  }
  return messages[feature] || '该功能暂未启用'
}
