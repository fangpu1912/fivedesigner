import { memo, useCallback, useState, useRef, useEffect } from 'react'
import { Handle, Position, type NodeProps, useReactFlow, useEdges } from '@xyflow/react'
import { Video, Play, Pause, RotateCcw, Camera } from 'lucide-react'

import { cn } from '@/lib/utils'
import { getVideoUrl, getImageUrl } from '@/utils/asset'
import { saveMediaFile } from '@/utils/mediaStorage'
import { useToast } from '@/hooks/useToast'
import { useUIStore } from '@/store/useUIStore'

import type { VideoUploadNodeData } from '../../types'
import {
  getNodeContainerClass,
  getSourceHandleClass,
  getTargetHandleClass,
  NODE_MIN_WIDTH,
  NODE_MIN_HEIGHT,
} from './NodeStyles'
import { NodeResizeHandle } from './NodeResizeHandle'
import { open } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'
import { canvasEvents } from '../../utils/canvasEvents'
import { useUpstreamData } from '../../hooks/useUpstreamData'
import { useEnlargedHandles } from '../../hooks/useEnlargedHandles'

interface VideoUploadNodeProps extends NodeProps {
  data: VideoUploadNodeData
}

export const VideoUploadNode = memo(({ id, data, selected }: VideoUploadNodeProps) => {
  const { updateNodeData, getNode, addNodes, addEdges: _addEdges } = useReactFlow()
  const { toast } = useToast()
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [isExtracting, setIsExtracting] = useState(false)
  const [showFrames, setShowFrames] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const currentProjectId = useUIStore((state) => state.currentProjectId)
  const currentEpisodeId = useUIStore((state) => state.currentEpisodeId)
  const { upstreamVideo } = useUpstreamData(id)
  const upstreamVideoRef = useRef<string | null>(null)
  const enlargedHandles = useEnlargedHandles(id)

  const MAX_DIMENSION = 320

  const videoWidth = data.width || 0
  const videoHeight = data.height || 0
  const isLandscape = videoWidth >= videoHeight
  const nodeWidth = data.videoUrl && videoWidth && videoHeight
    ? (isLandscape ? MAX_DIMENSION : Math.round(MAX_DIMENSION * videoWidth / videoHeight))
    : MAX_DIMENSION
  const VIDEO_DISPLAY_HEIGHT = data.videoUrl && videoWidth && videoHeight
    ? (isLandscape ? Math.round(MAX_DIMENSION * videoHeight / videoWidth) : MAX_DIMENSION)
    : (data.videoUrl ? Math.round(MAX_DIMENSION * 9 / 16) : 0)

  useEffect(() => {
    if (upstreamVideo && !data.videoUrl) {
      upstreamVideoRef.current = upstreamVideo
      updateNodeData(id, { ...data, videoUrl: upstreamVideo, sourceFileName: '来自上游节点' })
    } else if (!upstreamVideo && upstreamVideoRef.current && data.videoUrl === upstreamVideoRef.current) {
      upstreamVideoRef.current = null
      updateNodeData(id, { ...data, videoUrl: null, sourceFileName: null })
    }
  }, [upstreamVideo, data, id, updateNodeData])

  // 获取视频信息
  useEffect(() => {
    if (data.videoUrl && videoRef.current) {
      const video = videoRef.current
      video.onloadedmetadata = () => {
        updateNodeData(id, {
          ...data,
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight,
        })
      }
    }
  }, [data.videoUrl, id, data, updateNodeData])

  // 向下游节点传播数据
  const edges = useEdges()
  useEffect(() => {
    const hasDownstream = edges.some(e => e.source === id)
    if (hasDownstream && data.videoUrl) {
      canvasEvents.emit({
        type: 'propagateData',
        sourceNodeId: id,
        data: {},
      })
    }
  }, [data.videoUrl, edges, id])

  const handleUpload = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          { name: '视频文件', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'] },
          { name: '所有文件', extensions: ['*'] },
        ],
        title: '选择视频文件',
      })

      if (!selected) return

      const filePath = Array.isArray(selected) ? selected[0] : selected
      const ext = filePath.split('.').pop() || 'mp4'
      const fileName = filePath.split(/[/\\]/).pop() || `video_${Date.now()}.${ext}`

      const fileData = await readFile(filePath)

      const savedPath = await saveMediaFile(fileData, {
        projectId: currentProjectId || 'temp',
        episodeId: currentEpisodeId || 'temp',
        type: 'video',
        fileName: `upload_${Date.now()}.${ext}`,
        extension: ext,
      })

      updateNodeData(id, {
        ...data,
        videoUrl: savedPath,
        sourceFileName: fileName,
        extractedFrames: [], // 清空之前提取的帧
      })

      toast({ title: '视频上传成功' })
    } catch (error) {
      toast({ title: '上传失败', description: String(error), variant: 'destructive' })
    }
  }, [currentProjectId, currentEpisodeId, data, id, toast, updateNodeData])

  // 重新上传
  const handleReupload = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    await handleUpload()
  }, [handleUpload])

  // 添加帧到画布（使用上传图片节点）
  const addFrameToCanvas = useCallback((imageUrl: string, timestamp: number) => {
    const currentNode = getNode(id)
    if (!currentNode) return

    const newNodeId = `frame-${Date.now()}`
    const frameIndex = data.extractedFrames?.length || 0
    const newNodePosition = {
      x: (currentNode.position.x ?? 0) + nodeWidth + 50,
      y: (currentNode.position.y ?? 0) + frameIndex * 120,
    }

    addNodes([{
      id: newNodeId,
      type: 'uploadNode',
      position: newNodePosition,
      data: {
        imageUrl: imageUrl,
        previewImageUrl: imageUrl,
        displayName: `帧 ${timestamp.toFixed(1)}s`,
      },
    }])

    toast({ title: '已添加到画布', description: `帧 ${timestamp.toFixed(1)}s` })
  }, [addNodes, data.extractedFrames?.length, data.width, getNode, id, toast])

  // 截取当前帧（复用 VideoSceneExtraction 的 capture_frame）
  const handleExtractFrame = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!data.videoUrl) return

    setIsExtracting(true)
    try {
      const timestamp = currentTime || 0
      const outputPath = `${data.videoUrl}_frame_${Date.now()}.jpg`

      const result = await invoke<string>('capture_frame', {
        videoPath: data.videoUrl,
        timestamp,
        outputPath,
      })

      const newFrame = {
        id: `frame_${Date.now()}`,
        timestamp,
        imageUrl: result,
      }

      const updatedFrames = [...(data.extractedFrames || []), newFrame]
      updateNodeData(id, { ...data, extractedFrames: updatedFrames })

      // 自动添加到画布
      addFrameToCanvas(result, timestamp)
    } catch (error) {
      // 如果 Rust 命令不存在，使用 canvas 方式
      if (videoRef.current) {
        const video = videoRef.current
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          try {
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
            const savedPath = await saveMediaFile(dataUrl, {
              projectId: currentProjectId || 'temp',
              episodeId: currentEpisodeId || 'temp',
              type: 'image',
              fileName: `frame_${Date.now()}.jpg`,
              extension: 'jpg',
            })

            const newFrame = {
              id: `frame_${Date.now()}`,
              timestamp: currentTime,
              imageUrl: savedPath,
            }

            const updatedFrames = [...(data.extractedFrames || []), newFrame]
            updateNodeData(id, { ...data, extractedFrames: updatedFrames })

            // 自动添加到画布
            addFrameToCanvas(savedPath, currentTime)
          } catch (err) {
            toast({ title: '帧提取失败', description: String(err), variant: 'destructive' })
          }
        }
      }
    } finally {
      setIsExtracting(false)
    }
  }, [addFrameToCanvas, currentProjectId, currentEpisodeId, currentTime, data, id, toast, updateNodeData])

  // 播放/暂停控制
  const togglePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }, [isPlaying])

  // 格式化时间
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const videoSource = data.videoUrl ? getVideoUrl(data.videoUrl) : null

  const resolutionText = data.width && data.height ? `${data.width}×${data.height}` : null

  return (
    <div
      className={getNodeContainerClass(selected)}
      style={{
        width: nodeWidth,
        height: data.videoUrl
          ? VIDEO_DISPLAY_HEIGHT + (showFrames && data.extractedFrames?.length ? 80 : 0) + 70
          : 120,
      }}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-2 py-1 text-xs text-muted-foreground border-b bg-muted/30 node-header">
        <span className="truncate flex-1">{data.sourceFileName || '视频'}</span>
        {data.videoUrl && (
          <div className="flex items-center gap-1">
            <button
              onClick={handleReupload}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-0.5 hover:bg-muted rounded transition-colors"
              title="重新上传"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
            <button
              onClick={handleExtractFrame}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-0.5 hover:bg-muted rounded transition-colors"
              title="截取当前帧"
              disabled={isExtracting}
            >
              <Camera className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* 内容区域 */}
      {data.videoUrl ? (
        <>
          <div className="relative w-full" style={{ height: VIDEO_DISPLAY_HEIGHT }}>
            <video
              ref={videoRef}
              src={videoSource || ''}
              className="w-full h-full object-cover"
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onEnded={() => setIsPlaying(false)}
            />
            {/* 播放按钮 */}
            <div
              className="absolute inset-0 flex items-center justify-center cursor-pointer"
              onClick={togglePlay}
            >
              <div className={cn(
                "w-10 h-10 rounded-full bg-black/50 flex items-center justify-center transition-opacity",
                isPlaying ? 'opacity-0 hover:opacity-100' : 'opacity-100'
              )}>
                {isPlaying ? (
                  <Pause className="h-5 w-5 text-white" />
                ) : (
                  <Play className="h-5 w-5 text-white ml-0.5" />
                )}
              </div>
            </div>
          </div>

          {/* 底部控制栏 */}
          <div className="flex items-center justify-between px-2 py-1.5 text-[10px] text-muted-foreground bg-muted/20">
            <button
              onClick={togglePlay}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-0.5 rounded hover:bg-muted transition-colors"
            >
              {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            </button>
            <span>{formatTime(currentTime)} / {formatTime(data.duration || 0)}</span>
            <div className="flex items-center gap-1.5">
              {resolutionText && <span>{resolutionText}</span>}
              {data.extractedFrames && data.extractedFrames.length > 0 && (
                <button
                  onClick={() => setShowFrames(!showFrames)}
                  onPointerDown={(e) => e.stopPropagation()}
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[9px] transition-colors",
                    showFrames ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  )}
                >
                  {data.extractedFrames.length} 帧
                </button>
              )}
            </div>
          </div>

          {/* 提取的帧预览 */}
          {showFrames && data.extractedFrames && data.extractedFrames.length > 0 && (
            <div className="flex gap-1 p-1 overflow-x-auto border-t">
              {data.extractedFrames.map((frame) => (
                <div key={frame.id} className="relative shrink-0">
                  <img
                    src={getImageUrl(frame.imageUrl) || ''}
                    alt={`Frame at ${frame.timestamp}s`}
                    className="w-16 h-12 object-cover rounded"
                  />
                  <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] text-center">
                    {frame.timestamp.toFixed(1)}s
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div
          className="flex h-full w-full flex-col items-center justify-center gap-1 cursor-pointer hover:bg-muted/20 transition-colors"
          onClick={handleUpload}
        >
          <Video className="h-6 w-6 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">点击上传</span>
        </div>
      )}

      {/* 输入端口 */}
      <Handle
        type="target"
        id="target"
        position={Position.Left}
        className={getTargetHandleClass(undefined, enlargedHandles.target)}
      />

      {/* 输出端口 - 视频 */}
      <Handle
        type="source"
        id="video"
        position={Position.Right}
        className={getSourceHandleClass(undefined, enlargedHandles.source)}
      />

      {/* 缩放手柄 */}
      <NodeResizeHandle
        minWidth={160}
        minHeight={120}
        maxWidth={800}
        maxHeight={800}
      />
    </div>
  )
})

VideoUploadNode.displayName = 'VideoUploadNode'
