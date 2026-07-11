import { useState, useEffect, useCallback, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { useUIStore } from '@/store/useUIStore'
import { useToast } from '@/hooks/useToast'
import { saveMediaFile } from '@/utils/mediaStorage'

export interface ExtractedMedia {
  id: string
  accountId: string
  type: 'image' | 'video'
  thumbnailUrl: string | null
  originalUrl: string
  noWatermarkUrl: string
  width?: number | null
  height?: number | null
  downloaded: boolean
  downloading?: boolean
  localPath?: string | null
  timestamp: number
  vid?: string
  messageId?: string
}

interface MediaExtractedPayload {
  accountId: string
  mediaType: string
  data: unknown
}

export function useMediaExtraction(activeAccountId: string | null) {
  const { toast } = useToast()
  const { currentProjectId, currentEpisodeId } = useUIStore()
  const [mediaItems, setMediaItems] = useState<ExtractedMedia[]>([])
  const [activeTab, setActiveTab] = useState<'images' | 'videos'>('videos')
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const processedIdsRef = useRef<Set<string>>(new Set())

  // 监听 Tauri 事件（由 Rust 端 report_extracted_media 触发）
  useEffect(() => {
    let unlisten: (() => void) | null = null

    const setup = async () => {
      unlisten = await listen<MediaExtractedPayload>('media-extracted', (event) => {
        const { accountId, mediaType, data } = event.payload
        if (!data) return

        // data 可能是单个对象或数组
        const items = Array.isArray(data) ? data : [data]
        if (items.length === 0) return

        // 诊断数据直接打印日志
        if (mediaType === 'scan-diagnostic') {
          console.log('[scan-diagnostic]', JSON.stringify(items[0], null, 2))
          return
        }

        // clear 事件：切换对话时清空旧媒体列表
        if (mediaType === 'clear') {
          setMediaItems([])
          processedIdsRef.current.clear()
          return
        }

        const newMedia: ExtractedMedia[] = []
        const videoUpdates: { vid: string; messageId: string; url: string; width: number | null; height: number | null; dedupKey: string }[] = []

        for (const item of items) {
          const d = item as Record<string, unknown>

          if (mediaType === 'image') {
            const dedupKey = `img_${d.no_watermark_url || d.watermark_url}`
            if (processedIdsRef.current.has(dedupKey)) continue
            processedIdsRef.current.add(dedupKey)
            newMedia.push({
              id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              accountId,
              type: 'image',
              thumbnailUrl: (d.watermark_url as string) || null,
              originalUrl: (d.no_watermark_url as string) || '',
              noWatermarkUrl: (d.no_watermark_url as string) || '',
              width: (d.width as number) || null,
              height: (d.height as number) || null,
              downloaded: false,
              timestamp: Date.now(),
            })
          } else if (mediaType === 'video') {
            const vid = (d.vid as string) || ''
            const messageId = (d.messageId as string) || ''
            const noWatermarkUrl = (d.no_watermark_url as string) || ''
            const width = (d.width as number) || null
            const height = (d.height as number) || null
            // 当 vid/messageId 为空时（fallback_api 提取的视频），用 URL 去重
            const dedupKey = (vid || messageId)
              ? `vid_${vid}_${messageId}`
              : `vid_url_${noWatermarkUrl}`

            if (noWatermarkUrl) {
              // 有URL：更新已有条目或添加新条目
              videoUpdates.push({ vid, messageId, url: noWatermarkUrl, width, height, dedupKey })
            } else {
              // 无URL：添加未解析条目（如果不存在）
              if (processedIdsRef.current.has(dedupKey)) continue
              processedIdsRef.current.add(dedupKey)
              newMedia.push({
                id: `vid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                accountId,
                type: 'video',
                thumbnailUrl: null,
                originalUrl: '',
                noWatermarkUrl: '',
                width: null,
                height: null,
                downloaded: false,
                timestamp: Date.now(),
                vid,
                messageId,
              })
            }
          }
        }

        // 批量更新已有视频条目的URL
        if (videoUpdates.length > 0) {
          setMediaItems(prev => {
            let updated = prev
            for (const vu of videoUpdates) {
              // 仅当 vid/messageId 非空时才按它们匹配已有条目
              const hasVid = !!(vu.vid || vu.messageId)
              const existing = hasVid
                ? updated.find(m => m.vid === vu.vid && m.messageId === vu.messageId)
                : null
              if (existing) {
                // 更新已有条目的URL
                updated = updated.map(m =>
                  m.vid === vu.vid && m.messageId === vu.messageId
                    ? { ...m, noWatermarkUrl: vu.url, originalUrl: vu.url, width: vu.width || m.width, height: vu.height || m.height }
                    : m
                )
              } else {
                // 没有已有条目，添加新条目（带URL）
                if (processedIdsRef.current.has(vu.dedupKey)) continue
                processedIdsRef.current.add(vu.dedupKey)
                updated = [{
                  id: `vid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                  accountId,
                  type: 'video' as const,
                  thumbnailUrl: null,
                  originalUrl: vu.url,
                  noWatermarkUrl: vu.url,
                  width: vu.width,
                  height: vu.height,
                  downloaded: false,
                  timestamp: Date.now(),
                  vid: vu.vid,
                  messageId: vu.messageId,
                }, ...updated]
              }
            }
            return updated
          })
        }

        if (newMedia.length > 0) {
          setMediaItems(prev => [...newMedia, ...prev])
        }
      })
    }

    setup()
    return () => {
      if (unlisten) unlisten()
    }
  }, [])

  // 轮询子 Webview 的 __EXTRACTED_MEDIA__ 缓冲区
  useEffect(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }

    if (!activeAccountId) return

    // 每 2 秒轮询一次
    pollIntervalRef.current = setInterval(async () => {
      try {
        await invoke('poll_extracted_media', { accountId: activeAccountId })
      } catch (error) {
        // 忽略轮询错误（webview 可能已关闭）
      }
    }, 2000)

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [activeAccountId])

  // 下载单个媒体
  const downloadMedia = useCallback(async (item: ExtractedMedia) => {
    if (!currentProjectId || !currentEpisodeId) {
      toast({ title: '请先选择项目和剧集', variant: 'destructive' })
      return
    }

    // 标记下载中
    setMediaItems(prev => prev.map(m =>
      m.id === item.id ? { ...m, downloading: true } : m
    ))

    try {
      const url = item.noWatermarkUrl || item.originalUrl
      if (!url) {
        setMediaItems(prev => prev.map(m =>
          m.id === item.id ? { ...m, downloading: false } : m
        ))
        // URL 尚未解析，触发手动解析
        if (item.vid && item.messageId) {
          toast({ title: '正在解析视频链接，请稍后重试...' })
          await invoke('eval_webview_js', {
            accountId: item.accountId,
            jsCode: `window.postMessage({ type: 'startVideoDownloadByMessageId', messageId: '${item.messageId}' }, '*');`,
          }).catch(() => {})
        } else {
          toast({ title: '无下载链接', variant: 'destructive' })
        }
        return
      }

      const mediaType = item.type === 'video' ? 'video' : 'image'
      const extension = item.type === 'video' ? 'mp4' : 'png'

      const savePath = await saveMediaFile(url, {
        projectId: currentProjectId,
        episodeId: currentEpisodeId,
        type: mediaType,
        extension,
        fileName: `${item.type}_${Date.now()}.${extension}`,
      })

      setMediaItems(prev => prev.map(m =>
        m.id === item.id ? { ...m, downloading: false, downloaded: true, localPath: savePath } : m
      ))

      toast({ title: '下载成功' })
    } catch (error) {
      setMediaItems(prev => prev.map(m =>
        m.id === item.id ? { ...m, downloading: false } : m
      ))
      toast({ title: '下载失败', description: String(error), variant: 'destructive' })
    }
  }, [currentProjectId, currentEpisodeId, toast])

  // 批量下载
  const batchDownload = useCallback(async (items: ExtractedMedia[]) => {
    if (!currentProjectId || !currentEpisodeId) {
      toast({ title: '请先选择项目和剧集', variant: 'destructive' })
      return
    }

    for (const item of items) {
      await downloadMedia(item)
    }
  }, [downloadMedia, currentProjectId, currentEpisodeId])

  // 清空列表
  const clearMedia = useCallback(() => {
    setMediaItems([])
    processedIdsRef.current.clear()
  }, [])

  // 直接添加一条媒体（供扫描按钮使用，绕过事件系统）
  const addMediaItem = useCallback((item: ExtractedMedia) => {
    const dedupKey = item.type === 'video'
      ? ((item.vid || item.messageId) ? `vid_${item.vid}_${item.messageId}` : `vid_url_${item.noWatermarkUrl}`)
      : `img_${item.noWatermarkUrl}`
    if (processedIdsRef.current.has(dedupKey)) return
    processedIdsRef.current.add(dedupKey)
    setMediaItems(prev => [item, ...prev])
  }, [])

  // 触发视频解析（fire-and-forget，结果通过 media-extracted 事件自动到达）
  const resolveVideoUrl = useCallback(async (item: ExtractedMedia): Promise<string | null> => {
    if (!item.vid || !item.messageId) return null

    try {
      await invoke('eval_webview_js', {
        accountId: item.accountId,
        jsCode: `window.postMessage({ type: 'startVideoDownloadByMessageId', messageId: '${item.messageId}' }, '*');`,
      })
      return null
    } catch (error) {
      console.error('触发视频解析失败:', error)
      return null
    }
  }, [])

  const images = mediaItems.filter(m => m.type === 'image')
  const videos = mediaItems.filter(m => m.type === 'video')

  return {
    mediaItems,
    images,
    videos,
    activeTab,
    setActiveTab,
    downloadMedia,
    batchDownload,
    clearMedia,
    addMediaItem,
    resolveVideoUrl,
  }
}
