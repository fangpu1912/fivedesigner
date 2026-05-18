import { CANVAS_NODE_TYPES } from '../../types'

import { AIImageEditNode } from './AIImageEditNode'
import { AudioUploadNode } from './AudioUploadNode'
import { BlankImageNode } from './BlankImageNode'
import { CustomEdge } from './CustomEdge'
import { ExecutionStatusBadge, NodeExecutionOverlay, type ExecutionStatus } from './ExecutionStatusBadge'
import { ImageCompareNode } from './ImageCompareNode'
import { ImageEditNode } from './ImageEditNode'
import { ImageToPromptNode } from './ImageToPromptNode'
import { SceneDirectorNode } from './SceneDirectorNode'
import { StoryboardNode } from './StoryboardNode'
import { TextAnnotationNode } from './TextAnnotationNode'
import { UploadNode } from './UploadNode'
import { UpscaleNode } from './UpscaleNode'
import { VideoGenNode } from './VideoGenNode'
import { VideoReverseNode } from './VideoReverseNode'
import { VideoUploadNode } from './VideoUploadNode'

import type { NodeTypes, EdgeTypes } from '@xyflow/react'

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
  [CANVAS_NODE_TYPES.videoReverse]: VideoReverseNode,
} as unknown as NodeTypes

export const edgeTypes = {
  custom: CustomEdge,
} as unknown as EdgeTypes

export {
  UploadNode, ImageEditNode, AIImageEditNode, BlankImageNode, StoryboardNode,
  SceneDirectorNode, TextAnnotationNode, UpscaleNode, CustomEdge, VideoGenNode,
  VideoUploadNode, AudioUploadNode, ImageToPromptNode,
  ImageCompareNode, VideoReverseNode,
  ExecutionStatusBadge, NodeExecutionOverlay, type ExecutionStatus
}
