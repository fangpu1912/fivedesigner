/**
 * 剪映草稿导出服务
 * 参考: pyJianYingDraft 项目 (https://github.com/GuanYixuan/pyJianYingDraft)
 *
 * 剪映草稿文件结构:
 * - draft_content.json: 主要的项目数据（轨道、片段、素材）
 * - draft_meta_info.json: 元信息
 * - materials/: 素材文件夹
 */

import { join, homeDir } from '@tauri-apps/api/path'
import { writeTextFile, mkdir, exists } from '@tauri-apps/plugin-fs'

import type { SampleClip } from '@/types'

// 将 asset URL 转换为本地绝对路径
function convertAssetUrlToPath(url: string): string {
  if (!url) return ''

  try {
    // 1. 处理 http://asset.localhost/ 格式
    if (url.startsWith('http://asset.localhost/')) {
      const pathPart = url.replace('http://asset.localhost/', '')
      let decodedPath = decodeURIComponent(pathPart)
      decodedPath = decodedPath.replace(/\.$/, '')
      return decodedPath
    }

    // 2. 处理 asset://localhost/ 格式
    if (url.startsWith('asset://localhost/')) {
      const pathPart = url.replace('asset://localhost/', '')
      let decodedPath = decodeURIComponent(pathPart)
      decodedPath = decodedPath.replace(/^\//, '')
      return decodedPath
    }

    // 3. 处理 asset:/// 格式（三斜杠）
    if (url.startsWith('asset:///')) {
      const pathPart = url.replace('asset:///', '')
      let decodedPath = decodeURIComponent(pathPart)
      decodedPath = decodedPath.replace(/^\//, '')
      return decodedPath
    }

    // 4. 处理 asset:// 格式（双斜杠）
    if (url.startsWith('asset://')) {
      const pathPart = url.replace('asset://', '')
      let decodedPath = decodeURIComponent(pathPart)
      decodedPath = decodedPath.replace(/^\//, '')
      return decodedPath
    }
  } catch {
    // 解码失败，返回原始值
  }

  // 已经是本地路径或其他格式
  return url
}

// 剪映草稿路径配置
const CAPCUT_DRAFT_DIR = {
  windows: 'AppData/Local/JianyingPro/User Data/Projects/com.lveditor.draft',
  macos: 'Movies/JianyingPro/User Data/Projects/com.lveditor.draft',
  linux: '.config/JianyingPro/User Data/Projects/com.lveditor.draft',
}

// 生成唯一ID
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// 秒转微秒
function secondsToMicroseconds(seconds: number): number {
  return Math.round(seconds * 1000000)
}

// 获取剪映草稿目录
async function getCapCutDraftDir(): Promise<string | null> {
  try {
    const home = await homeDir()

    // 检测平台 - 使用 userAgent
    const userAgent = navigator.userAgent.toLowerCase()
    let draftDir: string

    if (userAgent.includes('win')) {
      draftDir = await join(home, CAPCUT_DRAFT_DIR.windows)
    } else if (userAgent.includes('mac')) {
      draftDir = await join(home, CAPCUT_DRAFT_DIR.macos)
    } else {
      draftDir = await join(home, CAPCUT_DRAFT_DIR.linux)
    }

    return draftDir
  } catch (error) {
    console.error('Failed to get CapCut draft directory:', error)
    return null
  }
}

// 生成 draft_content.json（符合剪映 4.x 格式）
function createDraftContent(clips: SampleClip[]): Record<string, unknown> {
  const videoMaterials: Record<string, unknown>[] = []
  const audioMaterials: Record<string, unknown>[] = []
  const videoSegments: Record<string, unknown>[] = []
  const audioSegments: Record<string, unknown>[] = []

  let currentTime = 0
  let totalDuration = 0
  const now = Math.floor(Date.now() / 1000)

  clips.forEach(clip => {
    const clipDuration = secondsToMicroseconds(clip.duration)

    // 视频素材和片段
    if (clip.videoUrl) {
      const localPath = convertAssetUrlToPath(clip.videoUrl)
      const videoMaterialId = generateId('video')
      videoMaterials.push({
        video_material_id: videoMaterialId,
        path: localPath,
        duration: clipDuration,
        width: 1920,
        height: 1080,
        fps: 30,
        type: 'video',
        create_time: now,
        import_time: now,
        md5: '',
      })

      videoSegments.push({
        id: generateId('segment'),
        material_id: videoMaterialId,
        target_timerange: {
          start: secondsToMicroseconds(currentTime),
          duration: clipDuration,
        },
        source_timerange: {
          start: 0,
          duration: clipDuration,
        },
        speed: 1.0,
        volume: 1.0,
      })
    }

    // 音频素材和片段
    if (clip.audioUrl) {
      const localPath = convertAssetUrlToPath(clip.audioUrl)
      const audioMaterialId = generateId('audio')
      audioMaterials.push({
        audio_material_id: audioMaterialId,
        path: localPath,
        duration: clipDuration,
        sample_rate: 44100,
        channels: 2,
        bit_rate: 192000,
        type: 'audio',
        create_time: now,
        import_time: now,
        md5: '',
      })

      audioSegments.push({
        id: generateId('segment'),
        material_id: audioMaterialId,
        target_timerange: {
          start: secondsToMicroseconds(currentTime),
          duration: clipDuration,
        },
        source_timerange: {
          start: 0,
          duration: clipDuration,
        },
        speed: 1.0,
        volume: 1.0,
      })
    }

    currentTime += clip.duration
    totalDuration += clipDuration
  })

  const tracks: Record<string, unknown>[] = []

  if (videoSegments.length > 0) {
    tracks.push({
      id: generateId('track'),
      type: 'video',
      name: '视频轨道 1',
      render_index: 0,
      mute: false,
      segments: videoSegments,
    })
  }

  if (audioSegments.length > 0) {
    tracks.push({
      id: generateId('track'),
      type: 'audio',
      name: '音频轨道 1',
      render_index: 10000,
      mute: false,
      segments: audioSegments,
    })
  }

  return {
    canvas_config: {
      width: 1920,
      height: 1080,
      ratio: 'original',
      fps: 30,
    },
    color_space: 0,
    config: {
      adjust_max_index: 1,
      attachment_info: [],
      combination_max_index: 1,
      export_range: null,
      extract_audio_last_index: 1,
      lyrics_recognition_id: '',
      lyrics_sync: true,
      lyrics_taskinfo: [],
      maintrack_adsorb: true,
      material_save_mode: 0,
      original_sound_last_index: 1,
      record_audio_last_index: 1,
      sticker_max_index: 1,
      subtitle_recognition_id: '',
      subtitle_sync: true,
      subtitle_taskinfo: [],
      system_font_list: [],
      video_mute: false,
      zoom_info_params: null,
    },
    cover: null,
    create_time: now,
    duration: totalDuration,
    extra_info: null,
    fps: 30.0,
    free_render_index_mode_on: false,
    group_container: null,
    id: generateId('draft'),
    keyframe_graph_list: [],
    keyframes: {
      adjusts: [],
      audios: [],
      effects: [],
      filters: [],
      handwrites: [],
      stickers: [],
      texts: [],
      videos: [],
    },
    last_modified_platform: {
      app_id: 3704,
      app_source: 'lv',
      app_version: '4.7.2',
      device_id: 'fc871fd0f7df9197856c41e5c14692e3',
      hard_disk_id: '41242e7a5bd929da250d4f775eb50880',
      mac_address: 'bd3b6e089f498a7037dc279f6ee07f73',
      os: 'windows',
      os_version: '10.0.22621',
    },
    materials: {
      audio_balances: [],
      audio_effects: [],
      audio_fades: [],
      audios: audioMaterials,
      beats: [],
      canvases: [],
      chromas: [],
      color_curves: [],
      digital_humans: [],
      drafts: [],
      effects: [],
      flowers: [],
      green_screens: [],
      handwrites: [],
      hsl: [],
      images: [],
      log_color_wheels: [],
      loudnesses: [],
      manual_deformations: [],
      masks: [],
      material_animations: [],
      material_colors: [],
      placeholders: [],
      plugin_effects: [],
      primary_color_wheels: [],
      realtime_denoises: [],
      shapes: [],
      smart_crops: [],
      sound_channel_mappings: [],
      speeds: [],
      stickers: [],
      tail_leaders: [],
      text_templates: [],
      texts: [],
      transitions: [],
      video_effects: [],
      video_trackings: [],
      videos: videoMaterials,
      vocal_beautifys: [],
      vocal_separations: [],
    },
    mutable_config: null,
    name: '',
    new_version: '87.0.0',
    platform: {
      app_id: 3704,
      app_source: 'lv',
      app_version: '4.7.2',
      device_id: 'fc871fd0f7df9197856c41e5c14692e3',
      hard_disk_id: '41242e7a5bd929da250d4f775eb50880',
      mac_address: 'bd3b6e089f498a7037dc279f6ee07f73',
      os: 'windows',
      os_version: '10.0.22621',
    },
    relationships: [],
    render_index_track_mode_on: false,
    retouch_cover: null,
    source: 'default',
    static_cover_image_path: '',
    tracks,
    update_time: now,
    version: 360000,
  }
}

// 生成 draft_meta_info.json（符合剪映 4.x 格式）
function createDraftMetaInfo(draftName: string, clips: SampleClip[]): Record<string, unknown> {
  const totalDuration = clips.reduce((sum, clip) => sum + clip.duration, 0)
  const now = Math.floor(Date.now() / 1000)

  return {
    cloud_package_completed_time: '',
    draft_cloud_capcut_purchase_info: '',
    draft_cloud_last_action_download: false,
    draft_cloud_materials: [],
    draft_cloud_purchase_info: '',
    draft_cloud_template_id: '',
    draft_cloud_tutorial_info: '',
    draft_cloud_videocut_purchase_info: '',
    draft_cover: 'draft_cover.jpg',
    draft_deeplink_url: '',
    draft_enterprise_info: {
      draft_enterprise_extra: '',
      draft_enterprise_id: '',
      draft_enterprise_name: '',
      enterprise_material: [],
    },
    draft_fold_path: '',
    draft_id: generateId('draft'),
    draft_is_article_video_draft: false,
    draft_is_from_deeplink: 'false',
    draft_materials: [
      { type: 0, value: [] },
      { type: 1, value: [] },
      { type: 2, value: [] },
      { type: 3, value: [] },
      { type: 6, value: [] },
      { type: 7, value: [] },
      { type: 8, value: [] },
    ],
    draft_materials_copied_info: [],
    draft_name: draftName,
    draft_new_version: '',
    draft_removable_storage_device: '',
    draft_root_path: '',
    draft_segment_extra_info: [],
    draft_timeline_materials_size_: 0,
    tm_draft_cloud_completed: '',
    tm_draft_cloud_modified: 0,
    tm_draft_create: now,
    tm_draft_modified: now,
    tm_draft_removed: 0,
    tm_duration: secondsToMicroseconds(totalDuration),
  }
}

// 导出到剪映（使用 Python 脚本生成，支持剪映 6.0+）
export async function exportToCapCut(
  draftName: string,
  clips: SampleClip[]
): Promise<{ success: boolean; message: string; draftPath?: string; opened?: boolean }> {
  try {
    // 1. 获取剪映草稿目录
    const draftDir = await getCapCutDraftDir()
    if (!draftDir) {
      return {
        success: false,
        message: '无法获取剪映草稿目录，请确保已安装剪映专业版',
      }
    }

    // 2. 检查剪映是否安装
    const capcutExists = await exists(draftDir)
    if (!capcutExists) {
      return {
        success: false,
        message: '未找到剪映草稿目录，请确保已安装剪映专业版',
      }
    }

    // 3. 准备输入数据
    const inputData = {
      draft_name: draftName,
      width: 1080,
      height: 1920,
      fps: 30,
      clips: clips.map(clip => ({
        video_path: clip.videoUrl ? convertAssetUrlToPath(clip.videoUrl) : '',
        audio_path: clip.audioUrl ? convertAssetUrlToPath(clip.audioUrl) : '',
        duration: clip.duration,
        subtitle: (clip as any).subtitle || '',
      })),
    }

    // 4. 写入临时 JSON 文件（使用应用数据目录下的 temp 文件夹）
    const { appDataDir } = await import('@tauri-apps/api/path')
    const appDir = await appDataDir()
    const tmpDir = await join(appDir, 'temp')
    try {
      await mkdir(tmpDir, { recursive: true })
    } catch {
      // 目录可能已存在
    }
    const inputJsonPath = await join(tmpDir, `jianying_input_${Date.now()}.json`)
    await writeTextFile(inputJsonPath, JSON.stringify(inputData, null, 2))

    // 5. 调用 Rust 命令执行 Python 脚本
    const { invoke } = await import('@tauri-apps/api/core')
    const result = await invoke<{
      success: boolean
      draft_path?: string
      method?: string
      error?: string
    }>('generate_jianying_draft', {
      request: {
        input_json_path: inputJsonPath,
        output_dir: draftDir,
      },
    })

    // 6. 清理临时文件
    try {
      const { remove } = await import('@tauri-apps/plugin-fs')
      await remove(inputJsonPath)
    } catch {
      // 忽略清理错误
    }

    if (!result.success) {
      return {
        success: false,
        message: `导出失败: ${result.error || '未知错误'}`,
      }
    }

    // 7. 尝试重启剪映（关闭后再打开，使草稿列表刷新）
    let restarted = false
    let restartError = ''
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const { settingsDB } = await import('@/db')
      const settings = await settingsDB.get()
      const capcutPath = settings.capcutPath as string | undefined
      restarted = await invoke<boolean>('restart_capcut', { exePath: capcutPath })
    } catch (error) {
      console.log('Could not restart CapCut:', error)
      restartError = '无法自动重启剪映，请手动重启以看到新草稿'
    }

    return {
      success: true,
      message: restarted
        ? `草稿 "${draftName}" 已导出（使用 ${result.method}），剪映已自动重启`
        : `草稿 "${draftName}" 已导出到剪映草稿目录（使用 ${result.method}）${restartError ? '（' + restartError + '）' : ''}`,
      draftPath: result.draft_path,
      opened: restarted,
    }
  } catch (error) {
    console.error('Export to CapCut failed:', error)
    return {
      success: false,
      message: `导出失败: ${error instanceof Error ? error.message : '未知错误'}`,
    }
  }
}

// 生成可下载的 JSON 文件内容（备用方案）
export function generateCapCutJson(
  draftName: string,
  clips: SampleClip[]
): { content: string; metaInfo: string } {
  const draftContent = createDraftContent(clips)
  const draftMetaInfo = createDraftMetaInfo(draftName, clips)

  return {
    content: JSON.stringify(draftContent, null, 2),
    metaInfo: JSON.stringify(draftMetaInfo, null, 2),
  }
}

// 下载 JSON 文件（备用方案）
export function downloadCapCutJson(draftName: string, clips: SampleClip[]): void {
  const { content, metaInfo } = generateCapCutJson(draftName, clips)

  const contentBlob = new Blob([content], { type: 'application/json' })
  const contentUrl = URL.createObjectURL(contentBlob)
  const contentLink = document.createElement('a')
  contentLink.href = contentUrl
  contentLink.download = 'draft_content.json'
  contentLink.click()
  URL.revokeObjectURL(contentUrl)

  const metaBlob = new Blob([metaInfo], { type: 'application/json' })
  const metaUrl = URL.createObjectURL(metaBlob)
  const metaLink = document.createElement('a')
  metaLink.href = metaUrl
  metaLink.download = 'draft_meta_info.json'
  metaLink.click()
  URL.revokeObjectURL(metaUrl)
}
