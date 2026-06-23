import { CANVAS_NODE_TYPES } from '../../types'

import { AIImageEditNode } from './AIImageEditNode'
import { AudioUploadNode } from './AudioUploadNode'
import { BatchUploadNode } from './BatchUploadNode'
import { BlankImageNode } from './BlankImageNode'
import { ComfyUIEditNode } from './ComfyUIEditNode'
import { CustomEdge } from './CustomEdge'
import { ExecutionStatusBadge, NodeExecutionOverlay, type ExecutionStatus } from './ExecutionStatusBadge'
import { ImageCompareNode } from './ImageCompareNode'
import { ImageEditNode } from './ImageEditNode'
import { ImageToPromptNode } from './ImageToPromptNode'
import { RunningHubNode } from './RunningHubNode'
import { SceneDirectorNode } from './SceneDirectorNode'
import { StoryboardNode } from './StoryboardNode'
import { TextAnnotationNode } from './TextAnnotationNode'
import { UploadNode } from './UploadNode'
import { UpscaleNode } from './UpscaleNode'
import { VideoGenNode } from './VideoGenNode'
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
  [CANVAS_NODE_TYPES.runninghub]: RunningHubNode,
  [CANVAS_NODE_TYPES.runninghubWallet]: RunningHubNode,
  [CANVAS_NODE_TYPES.batchUpload]: BatchUploadNode,
  [CANVAS_NODE_TYPES.comfyUIEdit]: ComfyUIEditNode,
} as unknown as NodeTypes

export const edgeTypes = {
  custom: CustomEdge,
} as unknown as EdgeTypes

export {
  UploadNode, ImageEditNode, AIImageEditNode, BlankImageNode, StoryboardNode,
  SceneDirectorNode, TextAnnotationNode, UpscaleNode, CustomEdge, VideoGenNode,
  VideoUploadNode, AudioUploadNode, ImageToPromptNode,
  ImageCompareNode, RunningHubNode, BatchUploadNode, ComfyUIEditNode,
  ExecutionStatusBadge, NodeExecutionOverlay, type ExecutionStatus
}
