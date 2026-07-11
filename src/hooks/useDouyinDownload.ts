/**
 * 抖音作品下载相关 hooks
 * - Cookie 加密存储(SecureStore)
 * - 作品列表查询
 * - 批量下载 + 写入素材库
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { secureStorage } from '@/services/secureStorage'
import { mediaAssetDB } from '@/db'
import { mediaAssetKeys, saveMediaCategory } from '@/hooks/useMediaAssets'
import { fetchDouyinWorks, downloadDouyinFile, sanitizeFileName } from '@/services/douyin/douyinService'
import type { DouyinWorkItem, DouyinDownloadLog } from '@/types/douyin'

const DOUYIN_COOKIE_KEY = 'douyin_cookies'

export const douyinKeys = {
  all: ['douyin'] as const,
  cookie: ['douyin', 'cookie'] as const,
  works: (id: string) => ['douyin', 'works', id] as const,
}

/** 读取已保存的抖音 Cookie */
export function useDouyinCookie() {
  return useQuery({
    queryKey: douyinKeys.cookie,
    queryFn: async () => {
      const v = await secureStorage.get(DOUYIN_COOKIE_KEY)
      return v || ''
    },
  })
}

/** 保存/清除抖音 Cookie(传空串则删除) */
export function useSaveDouyinCookie() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (cookie: string) => {
      if (cookie) {
        await secureStorage.set(DOUYIN_COOKIE_KEY, cookie)
      } else {
        await secureStorage.delete(DOUYIN_COOKIE_KEY)
      }
      return cookie
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: douyinKeys.cookie })
    },
  })
}

/** 拉取账号作品列表 */
export function useDouyinWorksQuery(
  secUserId: string,
  cookie: string,
  enabled: boolean,
  onProgress?: (count: number) => void,
) {
  return useQuery({
    queryKey: douyinKeys.works(secUserId),
    queryFn: () => fetchDouyinWorks(secUserId, cookie, onProgress),
    enabled: enabled && !!secUserId,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
  })
}

interface DownloadParams {
  items: DouyinWorkItem[]
  projectId: string
  episodeId?: string | null
  cookie: string
  onLog?: (log: DouyinDownloadLog) => void
  onProgress?: (completed: number, total: number) => void
}

interface DownloadResult {
  success: number
  failed: number
  total: number
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 批量下载作品并写入素材库(分类:抖音主页) */
export function useDownloadDouyinWorksMutation() {
  const qc = useQueryClient()

  return useMutation<DownloadResult, Error, DownloadParams>({
    mutationFn: async ({ items, projectId, episodeId, cookie, onLog, onProgress }) => {
      await saveMediaCategory('抖音主页')

      const total = items.reduce(
        (s, it) => s + (it.type === 'image' ? it.images?.length || 0 : 1),
        0,
      )
      let completed = 0
      let success = 0
      let failed = 0

      for (const item of items) {
        const files =
          item.type === 'image'
            ? (item.images || []).map((img, idx) => ({
                url: img.url,
                fileName: `${sanitizeFileName(item.authorNickname)}_${item.awemeId}_${idx + 1}.jpeg`,
                width: img.width,
                height: img.height,
                mediaType: 'image' as const,
                idx,
              }))
            : [
                {
                  url: item.videoUrl || '',
                  fileName: `${sanitizeFileName(item.authorNickname)}_${item.awemeId}.mp4`,
                  width: item.width,
                  height: item.height,
                  mediaType: 'video' as const,
                  idx: 0,
                },
              ]

        for (const f of files) {
          const logName = `${item.authorNickname}_${item.awemeId}${
            item.type === 'image' ? `_${f.idx + 1}` : ''
          }`
          const taskId = `${item.awemeId}_${f.idx}`
          onLog?.({
            awemeId: item.awemeId,
            name: logName,
            status: 'downloading',
            taskId,
            downloaded: 0,
            total: null,
            percent: null,
          })

          try {
            const absPath = await downloadDouyinFile(f.url, {
              projectId,
              episodeId,
              fileName: f.fileName,
              cookie,
              mediaType: f.mediaType,
              taskId,
            })

            await mediaAssetDB.create({
              name: f.fileName,
              type: item.type,
              file_path: absPath,
              prompt: '',
              description: item.desc,
              tags: [item.authorNickname, item.type === 'image' ? '图集' : '视频', '抖音'],
              category: '抖音主页',
              source: 'imported',
              project_id: projectId,
              episode_id: episodeId || undefined,
              width: f.width,
              height: f.height,
              file_size: undefined,
            })

            success++
            onLog?.({ awemeId: item.awemeId, name: logName, status: 'success' })
          } catch (err) {
            failed++
            onLog?.({
              awemeId: item.awemeId,
              name: logName,
              status: 'failed',
              message: (err as Error).message,
            })
          }

          completed++
          onProgress?.(completed, total)
          await delay(300)
        }
      }

      qc.invalidateQueries({ queryKey: mediaAssetKeys.all })
      return { success, failed, total: completed }
    },
  })
}
