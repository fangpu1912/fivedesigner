import type { ComponentType } from 'react'

import {
  Compass,
  Film,
  FolderKanban,
  Image,
  Mic,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Sparkles,
  Wand2,
  BarChart3,
  Scissors,
  Download,
} from 'lucide-react'

import AnalyzePage from '@/pages/AnalyzePage'
import { AssetManage } from '@/pages/AssetManage'
import { Dubbing } from '@/pages/Dubbing'
import MediaAssetManage from '@/pages/MediaAssetManage'
import { ProjectManage } from '@/pages/ProjectManage'
import { PromptSettings } from '@/pages/PromptSettings'
import SampleReview from '@/pages/SampleReview'
import ScriptCreation from '@/pages/ScriptCreation'
import { Settings as SettingsPage } from '@/pages/Settings'
import StoryboardCopilot from '@/pages/StoryboardCopilot'
import { StoryboardDraw } from '@/pages/StoryboardDraw'
import Support from '@/pages/Support'
import VideoBatchDownload from '@/pages/VideoBatchDownload'
import VideoSceneExtraction from '@/pages/VideoSceneExtraction'

import type { LucideIcon } from 'lucide-react'

export type AppPageSectionId = 'workspace' | 'creation' | 'delivery' | 'system'

export interface AppPageSection {
  id: AppPageSectionId
  label: string
}

export interface AppPageDefinition {
  navPath: string
  routePaths: string[]
  label: string
  description: string
  icon: LucideIcon
  section: AppPageSectionId
  component: ComponentType
  hidden?: boolean // 为 true 时不显示在侧边栏导航中
}

export const appPageSections: AppPageSection[] = [
  { id: 'workspace', label: '项目工作台' },
  { id: 'creation', label: '创作与生产' },
  { id: 'delivery', label: '输出与审阅' },
  { id: 'system', label: '系统配置' },
]

export const appPages: AppPageDefinition[] = [
  {
    navPath: '/',
    routePaths: ['/'],
    label: '项目管理',
    description: '管理项目、剧集与基础资料，是所有流程的起点。',
    icon: FolderKanban,
    section: 'workspace',
    component: ProjectManage,
  },
  {
    navPath: '/assets',
    routePaths: ['/assets'],
    label: '资产管理',
    description: '统一查看和维护项目中的角色、场景、道具与媒体资产。',
    icon: Sparkles,
    section: 'workspace',
    component: AssetManage,
  },
  {
    navPath: '/analyze',
    routePaths: ['/analyze'],
    label: '对标分析',
    description: '上传参考视频，自动拆解人物、分镜和提示词。',
    icon: BarChart3,
    section: 'creation',
    component: AnalyzePage,
  },
  // 分镜拆解已合并到对标分析页面作为 Tab 页，保留路由但不显示在导航中
  {
    navPath: '/scene-extraction',
    routePaths: ['/scene-extraction'],
    label: '分镜拆解',
    description: '上传视频，自动检测场景切换，提取分镜截图和片段。',
    icon: Scissors,
    section: 'creation',
    component: VideoSceneExtraction,
    hidden: true,
  },
  {
    navPath: '/script',
    routePaths: ['/script', '/script/:episodeId'],
    label: '剧本创作',
    description: '编写剧本、提取角色场景信息，并通过 AI 协同创作。',
    icon: Wand2,
    section: 'creation',
    component: ScriptCreation,
  },
  {
    navPath: '/storyboard',
    routePaths: ['/storyboard', '/storyboard-draw'],
    label: '分镜绘制',
    description: '围绕分镜、角色、场景与道具进行图像生成和素材整理。',
    icon: Image,
    section: 'creation',
    component: StoryboardDraw,
  },
  {
    navPath: '/storyboard-copilot',
    routePaths: ['/storyboard-copilot'],
    label: '分镜助手',
    description: '使用节点化工作区辅助搭建分镜创作流程。',
    icon: Compass,
    section: 'creation',
    component: StoryboardCopilot,
  },
  {
    navPath: '/dubbing',
    routePaths: ['/dubbing'],
    label: '台词配音',
    description: '为角色台词绑定声音、编辑音频并完成配音流程。',
    icon: Mic,
    section: 'delivery',
    component: Dubbing,
  },
  {
    navPath: '/sample',
    routePaths: ['/sample', '/sample/:episodeId'],
    label: '样片审阅',
    description: '检查镜头、音视频样片和输出结果。',
    icon: Film,
    section: 'delivery',
    component: SampleReview,
  },
  {
    navPath: '/prompt-settings',
    routePaths: ['/prompt-settings'],
    label: '提示词库',
    description: '集中管理不同场景下的提示词模板与策略。',
    icon: SlidersHorizontal,
    section: 'system',
    component: PromptSettings,
  },
  {
    navPath: '/settings',
    routePaths: ['/settings'],
    label: '系统设置',
    description: '配置主题、模型、工作流和应用级偏好设置。',
    icon: SettingsIcon,
    section: 'system',
    component: SettingsPage,
  },
  {
    navPath: '/support',
    routePaths: ['/support'],
    label: '支持作者',
    description: '如果这个项目对您有帮助，欢迎赞赏支持。',
    icon: Sparkles,
    section: 'system',
    component: Support,
  },
  {
    navPath: '/media-library',
    routePaths: ['/media-library'],
    label: '素材收集',
    description: '收集图片、视频及其提示词，用于复用和管理。',
    icon: Image,
    section: 'system',
    component: MediaAssetManage,
  },
  {
    navPath: '/video-batch-download',
    routePaths: ['/video-batch-download'],
    label: '视频下载',
    description: '批量下载豆包/即梦等平台的视频，支持无水印下载。',
    icon: Download,
    section: 'system',
    component: VideoBatchDownload,
  },
]

// 用于侧边栏导航的页面列表（排除隐藏的页面）
export const navPages = appPages.filter(page => !page.hidden)

const normalizePath = (pathname: string) => {
  if (!pathname || pathname === '/') {
    return '/'
  }

  return pathname.replace(/\/+$/, '')
}

export function getAppPageByPathname(pathname: string) {
  const normalizedPath = normalizePath(pathname)

  return appPages.find(page => {
    if (page.navPath === normalizedPath) {
      return true
    }

    return page.routePaths.some(routePath => {
      if (routePath === '/' || routePath.includes(':')) {
        const staticPrefix = routePath.split('/:')[0]
        return normalizedPath === staticPrefix || normalizedPath.startsWith(`${staticPrefix}/`)
      }

      return routePath === normalizedPath
    })
  })
}
