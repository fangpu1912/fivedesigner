import { useState, useEffect, useCallback, useMemo, useRef } from 'react'

import { convertFileSrc } from '@tauri-apps/api/core'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Save,
  Film,
  Download,
  Volume2,
  Maximize2,
  Minimize2,
  Clock,
  Music,
  Image as ImageIcon,
  Video,
  Wand2,
} from 'lucide-react'
import { useParams } from 'react-router-dom'

import { RenderDialog } from '@/components/sample/RenderDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { sampleProjectDB, storyboardDB, dubbingDB } from '@/db'
import { useToast } from '@/hooks/useToast'
import { exportToCapCut, downloadCapCutJson } from '@/services/capcutExporter'
import { useUIStore } from '@/store/useUIStore'
import type {
  SampleProject,
  SampleClip as SampleClipType,
  Storyboard,
  Dubbing,
} from '@/types'

// 获取文件URL
function getFileUrl(path?: string | null): string | null {
  if (!path) return null
  if (path.startsWith('http') || path.startsWith('data:')) return path
  return convertFileSrc(path)
}

// 样片片段（由分镜和配音组合）
interface SampleClip {
  id: string
  storyboard: Storyboard
  dubbings: Dubbing[]
  duration: number // 计算后的时长（视频或音频的最大值）
  videoUrl?: string
  imageUrl?: string
  audioUrl?: string
}

// 默认创建一个空的样片项目
const createDefaultProject = (
  episodeId: string
): Omit<SampleProject, 'id' | 'created_at' | 'updated_at'> => ({
  episode_id: episodeId,
  name: '未命名样片',
  duration: 0,
  tracks: [
    {
      id: 'main',
      type: 'video',
      name: '主轨道',
      items: [],
      isVisible: true,
      isLocked: false,
    },
  ],
})

export default function SampleReview() {
  const { episodeId } = useParams<{ episodeId: string }>()
  const { currentEpisodeId } = useUIStore()
  const { toast } = useToast()

  const effectiveEpisodeId = episodeId || currentEpisodeId

  const [project, setProject] = useState<SampleProject | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentClipIndex, setCurrentClipIndex] = useState(0)
  const [clips, setClips] = useState<SampleClip[]>([])

  // 适配模式：'audio' = 视频适配音频, 'video' = 音频适配视频
  const [adaptMode, setAdaptMode] = useState<'audio' | 'video'>('video')

  // 渲染对话框
  const [isRenderDialogOpen, setIsRenderDialogOpen] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const videoContainerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    setCurrentTime(0)
    setIsPlaying(false)
    setCurrentClipIndex(0)
    setClips([])
    setProject(null)
  }, [effectiveEpisodeId])

  // 加载样片项目和分镜数据
  useEffect(() => {
    const loadData = async () => {
      if (!effectiveEpisodeId) {
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)

        // 1. 加载或创建样片项目
        const projects = await sampleProjectDB.getAll(effectiveEpisodeId)
        let existingProject = projects.length > 0 ? projects[0] : null

        if (!existingProject) {
          const defaultProject = createDefaultProject(effectiveEpisodeId)
          existingProject = await sampleProjectDB.create(defaultProject)
        }
        setProject(existingProject)

        // 2. 加载分镜和配音数据
        const storyboards = await storyboardDB.getAll(effectiveEpisodeId)
        const sortedStoryboards = storyboards.sort(
          (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
        )

        // 3. 为每个分镜加载对应的配音
        const clipsData: SampleClip[] = []
        for (const storyboard of sortedStoryboards) {
          const dubbings = await dubbingDB.getByStoryboard(storyboard.id)
          const completedDubbings = dubbings.filter(d => d.status === 'completed' && d.audio_url)

          // 计算时长
          let duration = 0
          let audioUrl: string | undefined
          let audioDuration = 0

          if (completedDubbings.length > 0) {
            // 使用第一个完成的配音
            const mainDubbing = completedDubbings[0]!
            audioUrl = mainDubbing.audio_url || undefined
            audioDuration = mainDubbing.duration || 0
          }

          // 视频时长（如果有视频）- 尝试从视频文件获取实际时长
          let videoDuration = storyboard.video_duration || 0
          if (storyboard.video && !videoDuration) {
            try {
              const videoUrl = getFileUrl(storyboard.video)
              if (videoUrl) {
                const tempVideo = document.createElement('video')
                tempVideo.src = videoUrl
                await new Promise<void>((resolve) => {
                  tempVideo.onloadedmetadata = () => {
                    videoDuration = tempVideo.duration
                    resolve()
                  }
                  tempVideo.onerror = () => resolve()
                  setTimeout(resolve, 1000) // 超时1秒
                })
              }
            } catch (e) {
              // 获取失败时使用默认值
            }
          }

          // 根据适配模式决定时长
          if (adaptMode === 'audio' && audioDuration > 0) {
            duration = audioDuration
          } else if (videoDuration > 0) {
            duration = videoDuration
          } else if (audioDuration > 0) {
            duration = audioDuration
          } else {
            duration = 5 // 默认5秒
          }

          clipsData.push({
            id: storyboard.id,
            storyboard,
            dubbings: completedDubbings,
            duration,
            videoUrl: storyboard.video || undefined,
            imageUrl: storyboard.image || undefined,
            audioUrl,
          })
        }

        setClips(clipsData)

        // 更新项目总时长
        const totalDuration = clipsData.reduce((sum, clip) => sum + clip.duration, 0)
        if (existingProject.duration !== totalDuration) {
          const updated = await sampleProjectDB.update(existingProject.id, {
            duration: totalDuration,
          })
          setProject(updated)
        }
      } catch (error) {
        console.error('Failed to load sample data:', error)
        toast({
          title: '加载失败',
          description: '无法加载样片数据',
          variant: 'destructive',
        })
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [effectiveEpisodeId, adaptMode, toast])

  // 播放控制
  const togglePlay = useCallback(() => {
    setIsPlaying(!isPlaying)
  }, [isPlaying])

  // 播放下一个片段
  const playNext = useCallback(() => {
    if (currentClipIndex < clips.length - 1) {
      setCurrentClipIndex(prev => prev + 1)
      setCurrentTime(0)
    } else {
      // 播放到末尾，停止
      setIsPlaying(false)
      setCurrentClipIndex(0)
      setCurrentTime(0)
    }
  }, [currentClipIndex, clips.length])

  // 播放上一个片段
  const playPrev = useCallback(() => {
    if (currentClipIndex > 0) {
      setCurrentClipIndex(prev => prev - 1)
      setCurrentTime(0)
    }
  }, [currentClipIndex])

  // 播放进度控制 - 使用 requestAnimationFrame 获得更精确的时间
  useEffect(() => {
    if (!isPlaying) return

    const currentClip = clips[currentClipIndex]
    if (!currentClip) return

    let lastTime = performance.now()
    let animationFrameId: number

    const updateProgress = () => {
      const now = performance.now()
      const delta = (now - lastTime) / 1000 // 转换为秒
      lastTime = now

      setCurrentTime(prev => {
        const newTime = prev + delta
        if (newTime >= currentClip.duration) {
          // 当前片段播放完毕，播放下一个
          playNext()
          return 0
        }
        return newTime
      })

      if (isPlaying) {
        animationFrameId = requestAnimationFrame(updateProgress)
      }
    }

    animationFrameId = requestAnimationFrame(updateProgress)

    return () => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [isPlaying, currentClipIndex, clips, playNext])

  // 同步视频和音频的当前时间到状态（用于精确同步）
  useEffect(() => {
    if (!isPlaying) return

    const syncInterval = setInterval(() => {
      const currentClip = clips[currentClipIndex]
      if (!currentClip) return

      // 优先使用音频时间（如果有音频），否则使用视频时间
      const audio = audioRef.current
      const video = videoRef.current

      if (audio && !audio.paused && currentClip.audioUrl) {
        setCurrentTime(audio.currentTime)
      } else if (video && !video.paused) {
        setCurrentTime(video.currentTime)
      }
    }, 50) // 每 50ms 同步一次

    return () => clearInterval(syncInterval)
  }, [isPlaying, currentClipIndex, clips])

  // 同步视频和音频播放
  useEffect(() => {
    const currentClip = clips[currentClipIndex]
    if (!currentClip) return

    const video = videoRef.current
    const audio = audioRef.current

    if (isPlaying) {
      // 播放模式
      if (video) {
        video.currentTime = currentTime
        video.play().catch(() => {})
      }
      if (audio) {
        audio.currentTime = currentTime
        audio.play().catch(() => {})
      }
    } else {
      // 暂停模式
      video?.pause()
      audio?.pause()
    }
  }, [isPlaying, currentClipIndex, clips])

  // 监听视频结束事件（用于循环播放）
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleVideoEnded = () => {
      const currentClip = clips[currentClipIndex]
      if (!currentClip) return

      // 只有在音频适配视频模式下才需要循环
      if (adaptMode === 'audio' && currentClip.audioUrl) {
        // 检查是否还有音频在播放
        const audio = audioRef.current
        if (audio && audio.currentTime < audio.duration - 0.1) {
          // 音频还没结束，视频需要循环
          video.currentTime = 0
          video.play().catch(() => {})
        }
      }
    }

    // 监听视频时间更新，用于循环检测
    const handleTimeUpdate = () => {
      const currentClip = clips[currentClipIndex]
      if (!currentClip || !video) return

      // 在音频适配模式下，如果视频快结束了但音频还没结束，提前循环
      if (adaptMode === 'audio' && currentClip.audioUrl && video.duration) {
        const videoRemaining = video.duration - video.currentTime
        if (videoRemaining < 0.5 && video.currentTime > 0.5) {
          const audio = audioRef.current
          if (audio && audio.currentTime < audio.duration - 1) {
            // 音频还有超过1秒，视频需要循环
            video.currentTime = 0
          }
        }
      }
    }

    video.addEventListener('ended', handleVideoEnded)
    video.addEventListener('timeupdate', handleTimeUpdate)
    return () => {
      video.removeEventListener('ended', handleVideoEnded)
      video.removeEventListener('timeupdate', handleTimeUpdate)
    }
  }, [currentClipIndex, clips, adaptMode])

  // 监听音频结束事件
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleAudioEnded = () => {
      const currentClip = clips[currentClipIndex]
      if (!currentClip) return

      // 音频结束，如果视频也结束或没有视频，则播放下一个
      const video = videoRef.current
      const videoEnded = !video || video.ended || video.currentTime >= video.duration - 0.1

      if (videoEnded) {
        playNext()
      }
    }

    audio.addEventListener('ended', handleAudioEnded)
    return () => audio.removeEventListener('ended', handleAudioEnded)
  }, [currentClipIndex, clips, playNext])

  // 格式化时间显示
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }

  // 全屏切换
  const toggleFullscreen = useCallback(async () => {
    if (!videoContainerRef.current) return

    try {
      if (!document.fullscreenElement) {
        await videoContainerRef.current.requestFullscreen()
        setIsFullscreen(true)
      } else {
        await document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch (error) {
      console.error('全屏切换失败:', error)
    }
  }, [])

  // 监听全屏变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // 获取当前播放的片段
  const currentClip = clips[currentClipIndex]

  useEffect(() => {
    if (clips.length === 0) {
      setCurrentClipIndex(0)
      return
    }
    if (currentClipIndex > clips.length - 1) {
      setCurrentClipIndex(0)
      setCurrentTime(0)
      setIsPlaying(false)
    }
  }, [clips.length, currentClipIndex])

  // 计算总时长
  const totalDuration = useMemo(() => clips.reduce((sum, clip) => sum + clip.duration, 0), [clips])

  // 保存项目
  const saveProject = useCallback(async () => {
    if (!project) return
    try {
      await sampleProjectDB.update(project.id, {
        name: project.name,
        duration: totalDuration,
      })
      toast({ title: '保存成功', description: '样片项目已保存' })
    } catch (error) {
      toast({ title: '保存失败', description: '无法保存样片项目', variant: 'destructive' })
    }
  }, [project, totalDuration, toast])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Film className="w-12 h-12 mx-auto text-muted-foreground mb-4 animate-pulse" />
          <p className="text-muted-foreground">加载样片...</p>
        </div>
      </div>
    )
  }

  if (!effectiveEpisodeId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Film className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">请先选择剧集</h3>
          <p className="text-muted-foreground mt-1">在项目管理中选择一个剧集开始编辑样片</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* 顶部工具栏 */}
      <div className="h-14 border-b flex items-center px-4 gap-4 bg-card">
        <div className="flex items-center gap-2 flex-1">
          <Film className="w-5 h-5 text-primary" />
          <Input
            value={project?.name || ''}
            onChange={e => setProject(prev => (prev ? { ...prev, name: e.target.value } : null))}
            className="w-48 h-8"
            placeholder="样片名称"
          />
        </div>

        {/* 适配模式切换 */}
        <div className="flex items-center gap-3 px-3 py-1.5 bg-muted rounded-lg">
          <div className="flex items-center gap-2">
            <Video className="w-4 h-4 text-muted-foreground" />
            <Switch
              checked={adaptMode === 'audio'}
              onCheckedChange={checked => setAdaptMode(checked ? 'audio' : 'video')}
            />
            <Music className="w-4 h-4 text-muted-foreground" />
          </div>
          <span className="text-xs text-muted-foreground">
            {adaptMode === 'video' ? '音频适配视频' : '视频适配音频'}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={saveProject}>
            <Save className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={async () => {
              if (clips.length === 0) {
                toast({
                  title: '无法导出',
                  description: '没有可分镜数据',
                  variant: 'destructive',
                })
                return
              }

              // 转换 clips 为 SampleClipType
              const exportClips: SampleClipType[] = clips.map(clip => ({
                id: clip.id,
                storyboard: {
                  id: clip.storyboard.id,
                  name: clip.storyboard.name,
                  description: clip.storyboard.description,
                },
                dubbings: clip.dubbings.map(d => ({
                  id: d.id,
                  audio_url: d.audio_url,
                  duration: d.duration,
                })),
                duration: clip.duration,
                videoUrl: clip.videoUrl,
                imageUrl: clip.imageUrl,
                audioUrl: clip.audioUrl,
              }))

              // 一步到位导出到剪映
              const result = await exportToCapCut(project?.name || '未命名样片', exportClips)

              if (result.success) {
                toast({
                  title: '导出成功',
                  description: result.message,
                })
              } else {
                // 如果直接导出失败，提供下载 JSON 的备选方案
                toast({
                  title: '直接导出失败',
                  description: `${result.message}，将下载 JSON 文件手动导入`,
                  variant: 'destructive',
                })
                downloadCapCutJson(project?.name || '未命名样片', exportClips)
              }
            }}
          >
            <Download className="h-3.5 w-3.5" />
            导出剪映
          </Button>
          <Button size="sm" className="gap-1" onClick={() => setIsRenderDialogOpen(true)}>
            <Film className="h-3.5 w-3.5" />
            渲染输出
          </Button>
        </div>
      </div>

      {/* 渲染对话框 */}
      <RenderDialog
        isOpen={isRenderDialogOpen}
        onClose={() => setIsRenderDialogOpen(false)}
        clips={clips}
        projectName={project?.name || ''}
      />

      {/* 主要内容区域 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧分镜列表 */}
        <div className="w-64 border-r bg-card flex flex-col">
          <div className="p-3 border-b flex items-center justify-between">
            <h3 className="font-semibold text-sm">分镜列表</h3>
            <span className="text-xs text-muted-foreground">{clips.length} 个</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {clips.map((clip, index) => (
              <Card
                key={clip.id}
                className={`cursor-pointer transition-all ${
                  currentClipIndex === index
                    ? 'ring-2 ring-primary border-primary'
                    : 'hover:border-primary/50'
                }`}
                onClick={() => {
                  setCurrentClipIndex(index)
                  setCurrentTime(0)
                }}
              >
                <CardContent className="p-2">
                  {/* 缩略图 */}
                  <div className="aspect-video bg-muted rounded overflow-hidden relative">
                    {clip.videoUrl ? (
                      <video
                        src={getFileUrl(clip.videoUrl) || ''}
                        className="w-full h-full object-cover"
                        muted
                      />
                    ) : clip.imageUrl ? (
                      <img
                        src={getFileUrl(clip.imageUrl) || ''}
                        alt={clip.storyboard.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}
                    {/* 序号 */}
                    <div className="absolute top-1 left-1 w-5 h-5 bg-black/70 rounded text-white text-xs flex items-center justify-center">
                      {index + 1}
                    </div>
                    {/* 音频标记 */}
                    {clip.audioUrl && (
                      <div className="absolute bottom-1 right-1 w-5 h-5 bg-primary/90 rounded text-white text-xs flex items-center justify-center">
                        <Volume2 className="w-3 h-3" />
                      </div>
                    )}
                  </div>

                  {/* 信息 */}
                  <div className="mt-2 space-y-1">
                    <p className="text-xs font-medium truncate">{clip.storyboard.name}</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-0.5">
                        <Clock className="w-3 h-3" />
                        {formatTime(clip.duration)}
                      </span>
                      {clip.dubbings.length > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Music className="w-3 h-3" />
                          {clip.dubbings.length} 配音
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* 中间预览区域 */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* 视频预览 */}
          <div
            ref={videoContainerRef}
            className="flex-1 bg-black flex items-center justify-center relative overflow-hidden"
          >
            {currentClip ? (
              <>
                {/* 视频或图片 */}
                {currentClip.videoUrl ? (
                  <video
                    ref={videoRef}
                    src={getFileUrl(currentClip.videoUrl) || ''}
                    className="w-full h-full object-contain"
                    playsInline
                  />
                ) : currentClip.imageUrl ? (
                  <div className="w-full h-full flex items-center justify-center p-8">
                    <img
                      src={getFileUrl(currentClip.imageUrl) || ''}
                      alt={currentClip.storyboard.name}
                      className="w-full h-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="text-center text-white/50">
                    <ImageIcon className="w-16 h-16 mx-auto mb-4" />
                    <p>无视频或图片</p>
                  </div>
                )}

                {/* 音频元素 */}
                {currentClip.audioUrl && (
                  <audio ref={audioRef} src={getFileUrl(currentClip.audioUrl) || ''} />
                )}

                {/* 播放控制栏 */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/80 rounded-lg px-4 py-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-white hover:text-white hover:bg-white/20"
                    onClick={playPrev}
                    disabled={currentClipIndex === 0}
                  >
                    <SkipBack className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 text-white hover:text-white hover:bg-white/20"
                    onClick={togglePlay}
                  >
                    {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-white hover:text-white hover:bg-white/20"
                    onClick={playNext}
                    disabled={currentClipIndex === clips.length - 1}
                  >
                    <SkipForward className="h-4 w-4" />
                  </Button>
                  <Separator orientation="vertical" className="h-6 bg-white/30 mx-2" />
                  <div className="text-white text-sm font-mono">
                    {formatTime(currentTime)} / {formatTime(currentClip.duration)}
                  </div>
                  <Separator orientation="vertical" className="h-6 bg-white/30 mx-2" />
                  <div className="text-white/70 text-xs">
                    {currentClipIndex + 1} / {clips.length}
                  </div>
                  <Separator orientation="vertical" className="h-6 bg-white/30 mx-2" />
                  {/* 全屏按钮 */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-white hover:text-white hover:bg-white/20"
                    onClick={toggleFullscreen}
                    title={isFullscreen ? '退出全屏' : '全屏'}
                  >
                    {isFullscreen ? (
                      <Minimize2 className="h-4 w-4" />
                    ) : (
                      <Maximize2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {/* 分镜名称 */}
                <div className="absolute top-4 left-4 bg-black/60 rounded-lg px-3 py-1.5">
                  <p className="text-white text-sm font-medium">{currentClip.storyboard.name}</p>
                </div>
              </>
            ) : (
              <div className="text-center text-white/50">
                <Film className="w-16 h-16 mx-auto mb-4" />
                <p>暂无分镜</p>
              </div>
            )}
          </div>

          {/* 时间轴 - 简化为进度条 */}
          <div className="h-16 border-t bg-card px-4 flex items-center gap-4">
            <span className="text-xs text-muted-foreground w-16">
              {formatTime(
                clips.slice(0, currentClipIndex).reduce((sum, c) => sum + c.duration, 0) +
                  currentTime
              )}
            </span>

            {/* 进度条 */}
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${
                    totalDuration > 0
                      ? ((clips.slice(0, currentClipIndex).reduce((sum, c) => sum + c.duration, 0) +
                          currentTime) /
                          totalDuration) *
                        100
                      : 0
                  }%`,
                }}
              />
            </div>

            <span className="text-xs text-muted-foreground w-16 text-right">
              {formatTime(totalDuration)}
            </span>
          </div>
        </div>

        {/* 右侧属性面板 */}
        <div className="w-64 border-l bg-card flex flex-col">
          <div className="p-3 border-b">
            <h3 className="font-semibold text-sm">片段属性</h3>
          </div>

          {currentClip ? (
            <div className="flex-1 p-3 space-y-4 overflow-y-auto">
              {/* 分镜信息 */}
              <div>
                <label className="text-xs text-muted-foreground">分镜名称</label>
                <p className="text-sm font-medium mt-1">{currentClip.storyboard.name}</p>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">描述</label>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-3">
                  {currentClip.storyboard.description || '无描述'}
                </p>
              </div>

              <Separator />

              {/* 时长信息 */}
              <div>
                <label className="text-xs text-muted-foreground">片段时长</label>
                <div className="flex items-center gap-2 mt-1">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-mono">{formatTime(currentClip.duration)}</span>
                </div>
              </div>

              {/* 视频信息 */}
              {currentClip.videoUrl && (
                <div>
                  <label className="text-xs text-muted-foreground">视频</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Video className="w-4 h-4 text-green-500" />
                    <span className="text-sm">已生成</span>
                  </div>
                </div>
              )}

              {/* 音频信息 */}
              {currentClip.audioUrl ? (
                <div>
                  <label className="text-xs text-muted-foreground">配音</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Volume2 className="w-4 h-4 text-primary" />
                    <span className="text-sm">{currentClip.dubbings.length} 条配音</span>
                  </div>
                  {currentClip.dubbings[0]?.duration && (
                    <p className="text-xs text-muted-foreground mt-1">
                      音频时长: {formatTime(currentClip.dubbings[0].duration)}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="text-xs text-muted-foreground">配音</label>
                  <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                    <Music className="w-4 h-4" />
                    <span className="text-sm">无配音</span>
                  </div>
                </div>
              )}

              <Separator />

              {/* 适配提示 */}
              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Wand2 className="w-4 h-4 text-primary" />
                  <span className="text-xs font-medium">适配模式</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {adaptMode === 'video'
                    ? '音频将适配视频时长。如果视频较短，音频会被截断。'
                    : '视频将适配音频时长。视频会循环播放直到音频结束。'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <p className="text-sm">选择分镜查看属性</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
