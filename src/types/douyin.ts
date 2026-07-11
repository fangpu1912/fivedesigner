/** 抖音图集中单张图片信息 */
export interface DouyinImage {
  url: string
  width: number
  height: number
}

/** 抖音作品(图集或视频) */
export interface DouyinWorkItem {
  awemeId: string
  type: 'image' | 'video'
  desc: string
  createTime: number
  authorUid: string
  authorNickname: string
  images?: DouyinImage[]
  videoUrl?: string
  coverUrl?: string
  width: number
  height: number
}

/** 获取作品列表结果 */
export interface DouyinFetchResult {
  items: DouyinWorkItem[]
  hasMore: boolean
  maxCursor: number
  nickname: string
}

/** 下载文件选项 */
export interface DouyinDownloadOptions {
  projectId: string
  episodeId?: string | null
  fileName: string
  cookie: string
  mediaType: 'image' | 'video'
  taskId?: string
}

/** download_video 命令回传的进度事件 */
export interface DouyinDownloadProgress {
  url: string
  downloaded: number
  total: number | null
  filename: string
  taskId: string
}

/** 单个下载任务的状态 */
export interface DouyinDownloadLog {
  awemeId: string
  name: string
  status: 'pending' | 'downloading' | 'success' | 'skipped' | 'failed'
  message?: string
  fileCount?: number
  /** 用于匹配 download-video-progress 事件 */
  taskId?: string
  /** 已下载字节数 */
  downloaded?: number
  /** 文件总字节数(null 表示未知) */
  total?: number | null
  /** 下载百分比 0-100(null 表示未知) */
  percent?: number | null
}
