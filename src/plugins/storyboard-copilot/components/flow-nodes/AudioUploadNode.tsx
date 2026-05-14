import { memo, useCallback, useState, useRef, useEffect } from 'react'
import { Handle, Position, type NodeProps, useReactFlow, useEdges } from '@xyflow/react'
import { Music, Play, Pause, RotateCcw } from 'lucide-react'

import { cn } from '@/lib/utils'
import { getAudioUrl } from '@/utils/asset'
import { saveMediaFile } from '@/utils/mediaStorage'
import { useToast } from '@/hooks/useToast'
import { useUIStore } from '@/store/useUIStore'

import type { AudioUploadNodeData } from '../../types'
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
import { canvasEvents } from '../../utils/canvasEvents'
import { useUpstreamData } from '../../hooks/useUpstreamData'
import { useEnlargedHandles } from '../../hooks/useEnlargedHandles'

interface AudioUploadNodeProps extends NodeProps {
  data: AudioUploadNodeData
}

export const AudioUploadNode = memo(({ id, data, selected }: AudioUploadNodeProps) => {
  const { updateNodeData } = useReactFlow()
  const { toast } = useToast()
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  const currentProjectId = useUIStore((state) => state.currentProjectId)
  const currentEpisodeId = useUIStore((state) => state.currentEpisodeId)
  const { upstreamAudio } = useUpstreamData(id)
  const upstreamAudioRef = useRef<string | null>(null)
  const enlargedHandles = useEnlargedHandles(id)

  useEffect(() => {
    if (upstreamAudio && !data.audioUrl) {
      upstreamAudioRef.current = upstreamAudio
      updateNodeData(id, { ...data, audioUrl: upstreamAudio, sourceFileName: '来自上游节点' })
    } else if (!upstreamAudio && upstreamAudioRef.current && data.audioUrl === upstreamAudioRef.current) {
      upstreamAudioRef.current = null
      updateNodeData(id, { ...data, audioUrl: null, sourceFileName: null })
    }
  }, [upstreamAudio, data, id, updateNodeData])

  // 获取音频信息
  useEffect(() => {
    if (data.audioUrl && audioRef.current) {
      const audio = audioRef.current
      audio.onloadedmetadata = () => {
        updateNodeData(id, {
          ...data,
          duration: audio.duration,
        })
      }
    }
  }, [data.audioUrl, id, data, updateNodeData])

  // 向下游节点传播数据
  const edges = useEdges()
  useEffect(() => {
    const hasDownstream = edges.some(e => e.source === id)
    if (hasDownstream && data.audioUrl) {
      canvasEvents.emit({
        type: 'propagateData',
        sourceNodeId: id,
        data: {},
      })
    }
  }, [data.audioUrl, edges, id])

  // 上传音频文件
  const handleUpload = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          { name: '音频文件', extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'] },
          { name: '所有文件', extensions: ['*'] },
        ],
        title: '选择音频文件',
      })

      if (!selected) return

      const filePath = Array.isArray(selected) ? selected[0] : selected
      const ext = filePath.split('.').pop() || 'mp3'
      const fileName = filePath.split(/[/\\]/).pop() || `audio_${Date.now()}.${ext}`

      const fileData = await readFile(filePath)

      const savedPath = await saveMediaFile(fileData, {
        projectId: currentProjectId || 'temp',
        episodeId: currentEpisodeId || 'temp',
        type: 'audio',
        fileName: `upload_${Date.now()}.${ext}`,
        extension: ext,
      })

      updateNodeData(id, {
        ...data,
        audioUrl: savedPath,
        sourceFileName: fileName,
      })

      toast({ title: '音频上传成功' })
    } catch (error) {
      toast({ title: '上传失败', description: String(error), variant: 'destructive' })
    }
  }, [currentProjectId, currentEpisodeId, data, id, toast, updateNodeData])

  // 重新上传
  const handleReupload = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    await handleUpload()
  }, [handleUpload])

  // 播放/暂停控制
  const togglePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play()
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

  const audioSource = data.audioUrl ? getAudioUrl(data.audioUrl) : null

  // 生成波形数据（简化版）
  const generateWaveform = () => {
    const bars = 50
    return Array.from({ length: bars }, () => Math.random() * 0.7 + 0.3)
  }

  const [waveformData] = useState(() => generateWaveform())

  // 计算动态高度
  const headerHeight = 28
  const waveformHeight = 56
  const controlsHeight = 36
  const totalHeight = data.audioUrl ? headerHeight + waveformHeight + controlsHeight + 16 : 100

  return (
    <div
      className={getNodeContainerClass(selected)}
      style={{ width: 280, height: totalHeight }}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-2 py-1 text-xs text-muted-foreground border-b bg-muted/30 node-header">
        <span className="truncate flex-1">{data.sourceFileName || '音频'}</span>
        {data.audioUrl && (
          <button
            onClick={handleReupload}
            className="p-0.5 hover:bg-muted rounded transition-colors"
            title="重新上传"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* 内容区域 */}
      {data.audioUrl ? (
        <div className="flex flex-col p-2 gap-2" style={{ height: waveformHeight + controlsHeight + 8 }}>
          {/* 波形可视化 */}
          <div className="flex items-center justify-center" style={{ height: waveformHeight }}>
            <div className="flex items-end gap-0.5 h-full w-full">
              {waveformData.map((height, i) => {
                const progress = data.duration ? currentTime / data.duration : 0
                const isActive = i / waveformData.length < progress
                return (
                  <div
                    key={i}
                    className={cn(
                      "flex-1 rounded-full transition-all",
                      isActive ? 'bg-primary' : 'bg-muted-foreground/30'
                    )}
                    style={{ height: `${height * 100}%` }}
                  />
                )
              })}
            </div>
          </div>

          {/* 控制栏 */}
          <div className="flex items-center gap-2">
            <button
              onClick={togglePlay}
              className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors"
            >
              {isPlaying ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5 ml-0.5" />
              )}
            </button>

            {/* 进度条 */}
            <input
              type="range"
              min="0"
              max={data.duration || 0}
              step="0.1"
              value={currentTime}
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => {
                const newTime = parseFloat(e.target.value)
                setCurrentTime(newTime)
                if (audioRef.current) {
                  audioRef.current.currentTime = newTime
                }
              }}
              className="flex-1 h-1 accent-primary"
            />

            {/* 时间 */}
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              {formatTime(currentTime)} / {formatTime(data.duration || 0)}
            </span>
          </div>

          {/* 隐藏音频元素 */}
          <audio
            ref={audioRef}
            src={audioSource || ''}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onEnded={() => setIsPlaying(false)}
            className="hidden"
          />
        </div>
      ) : (
        <div
          className="flex h-full w-full flex-col items-center justify-center gap-1 cursor-pointer hover:bg-muted/20 transition-colors"
          onClick={handleUpload}
        >
          <Music className="h-6 w-6 text-muted-foreground" />
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

      {/* 输出端口 */}
      <Handle
        type="source"
        id="audio"
        position={Position.Right}
        className={getSourceHandleClass(undefined, enlargedHandles.source)}
      />

      {/* 缩放手柄 */}
      <NodeResizeHandle
        minWidth={NODE_MIN_WIDTH}
        minHeight={NODE_MIN_HEIGHT}
        maxWidth={400}
        maxHeight={300}
      />
    </div>
  )
})

AudioUploadNode.displayName = 'AudioUploadNode'
