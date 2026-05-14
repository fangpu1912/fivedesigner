import type { NodeTypes, EdgeTypes } from '@xyflow/react'
import { CANVAS_NODE_TYPES } from '../../types'

import { UploadNode } from './UploadNode'
import { ImageEditNode } from './ImageEditNode'
import { AIImageEditNode } from './AIImageEditNode'
import { BlankImageNode } from './BlankImageNode'
import { StoryboardNode } from './StoryboardNode'
import { SceneDirectorNode } from './SceneDirectorNode'
import { TextAnnotationNode } from './TextAnnotationNode'
import { UpscaleNode } from './UpscaleNode'
import { VideoGenNode } from './VideoGenNode'
import { VideoUploadNode } from './VideoUploadNode'
import { AudioUploadNode } from './AudioUploadNode'
import { ImageToPromptNode } from './ImageToPromptNode'
import { ImageCompareNode } from './ImageCompareNode'
import { CustomEdge } from './CustomEdge'
import { ExecutionStatusBadge, NodeExecutionOverlay, type ExecutionStatus } from './ExecutionStatusBadge'

export const nodeTypes = {
  [CANVAS_NODE_TYPES.upload]: UploadNode,
  [CANVAS_NODE_TYPES.imageEdit]: ImageEditNode,
  [CANVAS_NODE_TYPES.blankImage]: BlankImageNode,
  [CANVAS_NODE_TYPES.aiImageEdit]: AIImageEditNode,
  [CANVAS_NODE_TYPES.textAnnotation]: TextAnnotationNode,
  [CANVAS_NODE_TYPES.storyboardSplit]: StoryboardNode,
  [CANVAS_NODE_TYPES.sceneDirector]: SceneDirectorNode,
  [CANVAS_NODE_TYPES.upscale]: UpscaleNode,
  [CANVAS_NODE_TYPES.videoGen]: VideoGenNode,
  [CANVAS_NODE_TYPES.videoUpload]: VideoUploadNode,
  [CANVAS_NODE_TYPES.audioUpload]: AudioUploadNode,
  [CANVAS_NODE_TYPES.imageToPrompt]: ImageToPromptNode,
  [CANVAS_NODE_TYPES.imageCompare]: ImageCompareNode,
} as unknown as NodeTypes

export const edgeTypes = {
  custom: CustomEdge,
} as unknown as EdgeTypes

export {
  UploadNode, ImageEditNode, AIImageEditNode, BlankImageNode, StoryboardNode,
  SceneDirectorNode, TextAnnotationNode, UpscaleNode, CustomEdge, VideoGenNode,
  VideoUploadNode, AudioUploadNode, ImageToPromptNode,
  ImageCompareNode,
  ExecutionStatusBadge, NodeExecutionOverlay, type ExecutionStatus
}
