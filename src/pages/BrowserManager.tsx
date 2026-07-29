import { useState, useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { confirm } from '@tauri-apps/plugin-dialog'
import { listen } from '@tauri-apps/api/event'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import {
  Plus,
  X,
  ExternalLink,
  Trash2,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Download,
  Image,
  Video,
  Cookie,
  User,
  Globe,
  PanelRightClose,
  PanelRightOpen,
  Eye,
  Play,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ImagePreviewDialog } from '@/components/media/ImagePreviewDialog'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import { useEmbeddedBrowser } from '@/hooks/useEmbeddedBrowser'
import { useMediaExtraction } from '@/hooks/useMediaExtraction'
import type { ExtractedMedia } from '@/hooks/useMediaExtraction'

interface BrowserAccount {
  id: string
  name: string
  platform: 'doubao' | 'jimeng' | 'kling' | 'other'
  url: string
  dataDir: string
  proxy?: string
  cookies?: string
}

const PLATFORM_URLS = {
  doubao: 'https://www.doubao.com',
  jimeng: 'https://jimeng.jianying.com',
  kling: 'https://klingai.com',
  other: '',
}

const PLATFORM_NAMES = {
  doubao: '豆包',
  jimeng: '即梦',
  kling: '可灵',
  other: '其他',
}

const PLATFORM_COLORS = {
  doubao: 'bg-blue-500',
  jimeng: 'bg-purple-500',
  kling: 'bg-orange-500',
  other: 'bg-gray-500',
}

const loadAccounts = (): BrowserAccount[] => {
  try {
    const saved = localStorage.getItem('browser_accounts')
    if (saved) return JSON.parse(saved)
  } catch { /* ignore */ }
  return []
}

const saveAccounts = (accounts: BrowserAccount[]) => {
  try {
    localStorage.setItem('browser_accounts', JSON.stringify(accounts))
  } catch { /* ignore */ }
}

const BROWSER_RUNNING_KEY = 'browser_running'
const BROWSER_ACTIVE_KEY = 'browser_active'

function loadRunningAccounts(): Set<string> {
  try {
    const raw = localStorage.getItem(BROWSER_RUNNING_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

function saveRunningAccounts(set: Set<string>) {
  try {
    localStorage.setItem(BROWSER_RUNNING_KEY, JSON.stringify(Array.from(set)))
  } catch {}
}

function loadActiveAccount(): string | null {
  try {
    return localStorage.getItem(BROWSER_ACTIVE_KEY)
  } catch {
    return null
  }
}

function saveActiveAccount(id: string | null) {
  try {
    if (id) localStorage.setItem(BROWSER_ACTIVE_KEY, id)
    else localStorage.removeItem(BROWSER_ACTIVE_KEY)
  } catch {}
}

const BROWSER_URLS_KEY = 'browser_urls'

function loadAccountUrls(): Record<string, string> {
  try {
    const raw = localStorage.getItem(BROWSER_URLS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return {}
}

function saveAccountUrl(accountId: string, url: string) {
  try {
    const urls = loadAccountUrls()
    urls[accountId] = url
    localStorage.setItem(BROWSER_URLS_KEY, JSON.stringify(urls))
  } catch {}
}

export default function BrowserManager() {
  const { toast } = useToast()
  const [accounts, setAccounts] = useState<BrowserAccount[]>(loadAccounts)
  const [activeAccountId, setActiveAccountId] = useState<string | null>(loadActiveAccount)
  const [runningAccounts, setRunningAccounts] = useState<Set<string>>(loadRunningAccounts)
  const [urlInput, setUrlInput] = useState<string>(() => {
    const activeId = loadActiveAccount()
    if (activeId) return loadAccountUrls()[activeId] || ''
    return ''
  })
  const [downloadPanelOpen, setDownloadPanelOpen] = useState(true)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newAccount, setNewAccount] = useState<Partial<BrowserAccount>>({
    platform: 'doubao',
  })
  const [previewMedia, setPreviewMedia] = useState<ExtractedMedia | null>(null)
  const [previewIndex, setPreviewIndex] = useState(0)
  // 视频 blob URL 缓存：原始 URL → blob URL（解决 douyinvod.com 跨域/Referer 黑屏）
  const [videoBlobUrls, setVideoBlobUrls] = useState<Record<string, string>>({})
  const videoBlobUrlsRef = useRef<Record<string, string>>({})
  videoBlobUrlsRef.current = videoBlobUrls
  const fetchingRef = useRef<Set<string>>(new Set())

  const browser = useEmbeddedBrowser()
  const media = useMediaExtraction(activeAccountId)
  const runningAccountsRef = useRef<Set<string>>(runningAccounts)
  runningAccountsRef.current = runningAccounts

  // 通过 Tauri HTTP 插件获取视频（绕过 CORS/Referer 限制），返回 blob URL
  const fetchVideoBlobUrl = useCallback(async (originalUrl: string): Promise<string | null> => {
    if (!originalUrl) return null
    // 已缓存
    const cached = videoBlobUrlsRef.current[originalUrl]
    if (cached) return cached
    // 正在获取
    if (fetchingRef.current.has(originalUrl)) return null
    fetchingRef.current.add(originalUrl)

    try {
      const response = await tauriFetch(originalUrl, {
        method: 'GET',
        headers: {
          'Accept': 'video/*,*/*',
          'Referer': 'https://www.doubao.com/',
        },
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      setVideoBlobUrls(prev => {
        const next = { ...prev, [originalUrl]: blobUrl }
        videoBlobUrlsRef.current = next
        return next
      })
      return blobUrl
    } catch (error) {
      console.error('[fetchVideoBlobUrl] failed:', originalUrl, error)
      // 失败时返回原始 URL，让浏览器直接尝试
      return null
    } finally {
      fetchingRef.current.delete(originalUrl)
    }
  }, [])

  // 打开媒体预览时隐藏 WebView，关闭时恢复
  const openPreview = useCallback(async (item: ExtractedMedia, index = 0) => {
    // 先隐藏 WebView，确保 Dialog 出现时不被原生窗口覆盖
    if (activeAccountId) {
      await browser.hideWebview(activeAccountId)
    }
    setPreviewMedia(item)
    setPreviewIndex(index)
    // 视频预览：预先获取 blob URL 解决黑屏
    if (item.type === 'video' && item.noWatermarkUrl) {
      fetchVideoBlobUrl(item.noWatermarkUrl)
    }
  }, [activeAccountId, browser.hideWebview, fetchVideoBlobUrl])

  const closePreview = useCallback(() => {
    setPreviewMedia(null)
    // Dialog 关闭后再显示 WebView
    if (activeAccountId) {
      setTimeout(() => browser.showWebview(activeAccountId), 100)
    }
  }, [activeAccountId, browser.showWebview])

  // 组件卸载时释放所有 blob URL
  useEffect(() => {
    return () => {
      Object.values(videoBlobUrlsRef.current).forEach(url => {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url)
      })
    }
  }, [])

  // 视频列表变化时自动获取 blob URL（让缩略图直接显示首帧）
  useEffect(() => {
    const videos = media.videos
    if (!videos.length) return
    for (const v of videos) {
      if (v.noWatermarkUrl && !videoBlobUrlsRef.current[v.noWatermarkUrl]) {
        fetchVideoBlobUrl(v.noWatermarkUrl)
      }
    }
  }, [media.videos, fetchVideoBlobUrl])

  // 保存账号变化
  useEffect(() => {
    saveAccounts(accounts)
  }, [accounts])

  // 持久化运行中账号
  useEffect(() => {
    saveRunningAccounts(runningAccounts)
  }, [runningAccounts])

  // 持久化活跃账号
  useEffect(() => {
    saveActiveAccount(activeAccountId)
  }, [activeAccountId])

  // 当下载面板或活动账号变化时，重新定位 webview
  useEffect(() => {
    if (activeAccountId) {
      const timer = setTimeout(() => {
        browser.updateWebviewPosition(activeAccountId)
      }, 100)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [downloadPanelOpen, activeAccountId, browser.updateWebviewPosition])

  // 页面离开时隐藏所有 webview（仅在卸载时执行）
  useEffect(() => {
    // 挂载时：如果有持久化的活跃账号，恢复 URL 并自动显示
    if (activeAccountId && runningAccounts.has(activeAccountId)) {
      browser.showWebview(activeAccountId)
      // 恢复上次浏览的 URL 到地址栏
      const savedUrl = loadAccountUrls()[activeAccountId]
      if (savedUrl) setUrlInput(savedUrl)
    }

    return () => {
      runningAccountsRef.current.forEach(accountId => {
        browser.hideWebview(accountId).catch(() => {})
      })
    }
  }, [activeAccountId, runningAccounts, browser.showWebview, browser.hideWebview])

  // 监听子 Webview URL 变化，同步到地址栏
  useEffect(() => {
    let unlisten: (() => void) | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null

    const setup = async () => {
      unlisten = await listen<{ url: string }>('webview-url-changed', (event) => {
        const url = event.payload.url
        if (url) {
          setUrlInput(url)
          // 持久化当前账号的最后浏览 URL
          if (activeAccountId) saveAccountUrl(activeAccountId, url)
        }
      })

      // 每 3 秒轮询子 webview 的 URL（触发 report_url 事件）
      pollTimer = setInterval(async () => {
        if (activeAccountId) {
          try {
            await invoke('get_webview_url', { accountId: activeAccountId })
          } catch {}
        }
      }, 3000)
    }

    setup()

    return () => {
      if (unlisten) unlisten()
      if (pollTimer) clearInterval(pollTimer)
    }
  }, [activeAccountId])

  // 打开账号
  const openAccount = useCallback(async (accountId: string) => {
    const account = accounts.find(a => a.id === accountId)
    if (!account) return

    if (runningAccounts.has(accountId)) {
      // 已运行，切换到该账号
      if (activeAccountId && activeAccountId !== accountId) {
        await browser.hideWebview(activeAccountId)
      }
      await browser.showWebview(accountId)
      setActiveAccountId(accountId)
      // 恢复该账号的最后 URL
      const savedUrl = loadAccountUrls()[accountId]
      setUrlInput(savedUrl || account.url)
      return
    }

    try {
      if (activeAccountId) {
        await browser.hideWebview(activeAccountId)
      }

      await browser.createWebview(accountId, account.url, {
        proxy: account.proxy,
        cookies: account.cookies,
      })

      setRunningAccounts(prev => new Set(prev).add(accountId))
      setActiveAccountId(accountId)
      setUrlInput(account.url)

      toast({ title: '已打开', description: account.name })
    } catch (error) {
      toast({ title: '打开失败', description: String(error), variant: 'destructive' })
    }
  }, [accounts, runningAccounts, activeAccountId, browser, toast])

  // 关闭账号
  const closeAccount = useCallback(async (accountId: string) => {
    try {
      await browser.closeWebview(accountId)
    } catch (error) {
      console.error('关闭失败:', error)
    }

    const newRunning = new Set(runningAccounts)
    newRunning.delete(accountId)
    setRunningAccounts(newRunning)

    if (activeAccountId === accountId) {
      const nextAccount = Array.from(newRunning)[0] || null
      if (nextAccount) {
        await browser.showWebview(nextAccount)
        setActiveAccountId(nextAccount)
        const acc = accounts.find(a => a.id === nextAccount)
        const nextUrl = loadAccountUrls()[nextAccount]
        setUrlInput(nextUrl || acc?.url || '')
      } else {
        setActiveAccountId(null)
        setUrlInput('')
      }
    }
  }, [runningAccounts, activeAccountId, browser, accounts])

  // 删除账号
  const deleteAccount = useCallback(async (accountId: string) => {
    const acc = accounts.find(a => a.id === accountId)
    const confirmed = await confirm(
      `确定要删除账号「${acc?.name || accountId}」吗？浏览数据和 Cookie 将被清除，此操作不可恢复。`,
      { title: '删除确认', kind: 'warning', okLabel: '确定删除', cancelLabel: '取消' }
    )
    if (!confirmed) return

    // 临时隐藏 webview 以防遮住后续操作
    if (activeAccountId === accountId) {
      await browser.hideWebview(accountId)
    }

    if (runningAccounts.has(accountId)) {
      try {
        await browser.closeWebview(accountId)
      } catch (error) {
        console.error('关闭失败:', error)
      }
      const newRunning = new Set(runningAccounts)
      newRunning.delete(accountId)
      setRunningAccounts(newRunning)
    }

    try {
      await invoke('clear_browser_data', { profileId: accountId })
    } catch (error) {
      console.error('清理数据失败:', error)
    }

    setAccounts(prev => prev.filter(a => a.id !== accountId))

    if (activeAccountId === accountId) {
      const remaining = accounts.filter(a => a.id !== accountId)
      const runningRemaining = Array.from(runningAccounts).filter(id => id !== accountId)
      const nextAccount = runningRemaining[0] || null
      if (nextAccount) {
        await browser.showWebview(nextAccount)
        setActiveAccountId(nextAccount)
        const nextAcc = remaining.find(a => a.id === nextAccount)
        const nextUrl = loadAccountUrls()[nextAccount]
        setUrlInput(nextUrl || nextAcc?.url || '')
      } else {
        setActiveAccountId(null)
        setUrlInput('')
      }
    }

    toast({ title: '账号已删除' })
  }, [accounts, runningAccounts, activeAccountId, browser, toast])

  // 添加新账号
  const addAccount = useCallback(() => {
    if (!newAccount.name) {
      toast({ title: '请输入账号名称', variant: 'destructive' })
      return
    }

    const platform = newAccount.platform || 'other'
    const url = platform === 'other'
      ? (newAccount.url || 'https://www.baidu.com')
      : PLATFORM_URLS[platform]

    const account: BrowserAccount = {
      id: `account_${Date.now()}`,
      name: newAccount.name,
      platform,
      url,
      dataDir: `profile_${Date.now()}`,
      proxy: newAccount.proxy || undefined,
      cookies: newAccount.cookies || undefined,
    }

    setAccounts(prev => [...prev, account])
    setShowAddDialog(false)
    setNewAccount({ platform: 'doubao' })
    toast({ title: '账号已添加', description: account.name })

    // 恢复 webview 显示
    if (activeAccountId) {
      browser.showWebview(activeAccountId)
    }
  }, [newAccount, toast, activeAccountId, browser])

  // URL 导航
  const handleNavigate = useCallback(async () => {
    if (!activeAccountId || !urlInput.trim()) return
    try {
      await browser.navigateWebview(activeAccountId, urlInput.trim())
    } catch (error) {
      toast({ title: '导航失败', description: String(error), variant: 'destructive' })
    }
  }, [activeAccountId, urlInput, browser, toast])

  // 后退/前进
  const handleGoBack = useCallback(async () => {
    if (!activeAccountId) return
    await browser.evalWebviewJs(activeAccountId, 'history.back()')
  }, [activeAccountId, browser])

  const handleGoForward = useCallback(async () => {
    if (!activeAccountId) return
    await browser.evalWebviewJs(activeAccountId, 'history.forward()')
  }, [activeAccountId, browser])

  const handleReload = useCallback(async () => {
    if (!activeAccountId) return
    await browser.evalWebviewJs(activeAccountId, 'location.reload()')
  }, [activeAccountId, browser])

  // 下载媒体项
  const handleDownload = useCallback(async (item: ExtractedMedia) => {
    if (item.type === 'video' && !item.noWatermarkUrl) {
      // 触发视频解析，结果会通过 media-extracted 事件自动更新到列表
      try {
        await media.resolveVideoUrl(item)
        toast({ title: '正在解析视频链接', description: '解析完成后可点击下载' })
      } catch (error) {
        toast({ title: '触发解析失败', description: String(error), variant: 'destructive' })
      }
      return
    }

    await media.downloadMedia(item)
  }, [media, toast])

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* 左栏：账号列表 */}
      <div className="w-60 border-r bg-muted/20 flex flex-col">
        <div className="p-3 border-b bg-background">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-sm">账号管理</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={async () => {
                // 原生 webview 会遮住 HTML 对话框，临时隐藏
                if (activeAccountId) {
                  await browser.hideWebview(activeAccountId)
                }
                setShowAddDialog(true)
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-2 space-y-1">
          {accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <User className="w-10 h-10 opacity-20" />
              <p className="text-sm">没有账号</p>
              <p className="text-xs">点击 + 添加</p>
            </div>
          ) : (
            accounts.map(account => (
              <div
                key={account.id}
                className={cn(
                  'p-2.5 rounded-lg cursor-pointer transition-colors border',
                  activeAccountId === account.id
                    ? 'border-primary bg-primary/5'
                    : 'border-transparent hover:bg-accent',
                  runningAccounts.has(account.id) && 'border-l-2 border-l-green-500'
                )}
                onClick={() => openAccount(account.id)}
              >
                <div className="flex items-center gap-2">
                  <div className={cn(
                    'w-2 h-2 rounded-full shrink-0',
                    runningAccounts.has(account.id) ? 'bg-green-500' : 'bg-gray-300'
                  )} />
                  <span className="text-sm font-medium truncate flex-1">{account.name}</span>
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded text-white',
                    PLATFORM_COLORS[account.platform]
                  )}>
                    {PLATFORM_NAMES[account.platform]}
                  </span>
                </div>
                {account.cookies && (
                  <div className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                    <Cookie className="w-3 h-3" />
                    已配置 Cookie
                  </div>
                )}
                <div className="flex gap-1 mt-1.5">
                  {runningAccounts.has(account.id) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[11px] flex-1"
                      onClick={async (e) => {
                        e.stopPropagation()
                        const confirmed = await confirm(
                          `确定关闭「${account.name}」的浏览器？当前页面状态将丢失。`,
                          { title: '关闭浏览器', kind: 'warning', okLabel: '关闭', cancelLabel: '取消' }
                        )
                        if (confirmed) closeAccount(account.id)
                      }}
                    >
                      <X className="w-3 h-3 mr-1" />
                      关闭
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="h-6 text-[11px] flex-1"
                      onClick={(e) => { e.stopPropagation(); openAccount(account.id) }}
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      打开
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive"
                    onClick={(e) => { e.stopPropagation(); deleteAccount(account.id) }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 中间栏：浏览器区域 */}
      <div className="flex flex-col min-w-0 flex-1 border-r">
        {/* Tab 栏 */}
        <div className="flex items-center border-b bg-muted/30 h-9">
          <div className="flex items-center gap-0.5 px-2 flex-1 overflow-x-auto">
            {Array.from(runningAccounts).map(accountId => {
              const acc = accounts.find(a => a.id === accountId)
              if (!acc) return null
              return (
                <button
                  key={accountId}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1 text-xs rounded-t transition-colors whitespace-nowrap',
                    activeAccountId === accountId
                      ? 'bg-background border border-b-background -mb-px'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => openAccount(accountId)}
                >
                  <div className={cn('w-1.5 h-1.5 rounded-full', PLATFORM_COLORS[acc.platform])} />
                  <span>{acc.name}</span>
                  <span
                    className="ml-1 hover:bg-muted rounded p-0.5"
                    onClick={async (e) => {
                      e.stopPropagation()
                      const confirmed = await confirm(
                        `确定关闭「${acc.name}」的浏览器标签？当前页面状态将丢失。`,
                        { title: '关闭标签', kind: 'warning', okLabel: '关闭', cancelLabel: '取消' }
                      )
                      if (confirmed) closeAccount(accountId)
                    }}
                  >
                    <X className="w-3 h-3" />
                  </span>
                </button>
              )
            })}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 mr-1"
            onClick={() => setDownloadPanelOpen(!downloadPanelOpen)}
          >
            {downloadPanelOpen ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* URL 栏 */}
        <div className="flex items-center gap-1 px-2 py-1.5 border-b bg-background">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleGoBack} disabled={!activeAccountId}>
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleGoForward} disabled={!activeAccountId}>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleReload} disabled={!activeAccountId}>
            <RotateCw className="h-3.5 w-3.5" />
          </Button>
          <div className="flex-1 flex items-center">
            <Globe className="w-3.5 h-3.5 mr-2 text-muted-foreground shrink-0" />
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleNavigate()}
              placeholder="输入网址..."
              className="h-7 text-xs"
              disabled={!activeAccountId}
            />
          </div>
        </div>

        {/* 浏览器容器 */}
        <div
          ref={browser.containerRef}
          className="flex-1 bg-white relative"
        >
          {!activeAccountId && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
              <Globe className="w-16 h-16 opacity-15" />
              <p>选择账号或输入网址开始浏览</p>
              <p className="text-xs">左侧添加账号，点击打开内嵌浏览器</p>
            </div>
          )}
        </div>
      </div>

      {/* 右栏：下载面板 */}
      <div
        className={cn(
          'border-l bg-background transition-all duration-300 flex flex-col',
          downloadPanelOpen ? 'w-80' : 'w-0 overflow-hidden'
        )}
      >
        <div className="p-3 border-b bg-muted/30">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-sm">下载面板</span>
            <div className="flex items-center gap-1">
              {media.mediaItems.length > 0 && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px]"
                    onClick={() => media.batchDownload(media.mediaItems.filter(m => !m.downloaded))}
                    disabled={media.mediaItems.every(m => m.downloaded)}
                  >
                    <Download className="w-3 h-3 mr-1" />
                    全部下载
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] text-destructive"
                    onClick={media.clearMedia}
                  >
                    清空
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="flex gap-1">
            <Button
              variant={media.activeTab === 'images' ? 'default' : 'ghost'}
              size="sm"
              className="flex-1 text-xs h-7"
              onClick={() => media.setActiveTab('images')}
            >
              <Image className="w-3 h-3 mr-1" />
              图片 ({media.images.length})
            </Button>
            <Button
              variant={media.activeTab === 'videos' ? 'default' : 'ghost'}
              size="sm"
              className="flex-1 text-xs h-7"
              onClick={() => media.setActiveTab('videos')}
            >
              <Video className="w-3 h-3 mr-1" />
              视频 ({media.videos.length})
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-2">
          {media.activeTab === 'images' ? (
            media.images.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Image className="w-10 h-10 opacity-20 mb-2" />
                <p className="text-sm">暂无图片</p>
                <p className="text-xs">在豆包页面生成图片后自动捕获</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {media.images.map(item => (
                  <div
                    key={item.id}
                    className="group relative border rounded-lg overflow-hidden bg-muted cursor-pointer"
                    onClick={() => openPreview(item, media.images.indexOf(item))}
                  >
                    <img
                      src={item.thumbnailUrl || item.noWatermarkUrl}
                      alt=""
                      className="w-full aspect-video object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-1.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => { e.stopPropagation(); openPreview(item, media.images.indexOf(item)) }}
                        title="预览"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 text-xs px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => { e.stopPropagation(); handleDownload(item) }}
                        disabled={item.downloaded}
                      >
                        {item.downloaded ? '已下载' : (
                          <>
                            <Download className="w-3.5 h-3.5 mr-1" />
                            下载
                          </>
                        )}
                      </Button>
                    </div>
                    {item.width && item.height && (
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1.5 py-0.5">
                        {item.width}x{item.height}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : (
            media.videos.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Video className="w-10 h-10 opacity-20 mb-2" />
                <p className="text-sm">暂无视频</p>
                <p className="text-xs">在豆包页面生成视频后自动捕获</p>
              </div>
            ) : (
              <div className="space-y-2">
                {media.videos.map(item => (
                  <div
                    key={item.id}
                    className="group relative border rounded-lg overflow-hidden bg-muted"
                  >
                    <div
                      className="relative aspect-video bg-black/80 flex items-center justify-center cursor-pointer"
                      onClick={() => {
                        if (item.noWatermarkUrl) {
                          openPreview(item, 0)
                        }
                      }}
                    >
                      {item.noWatermarkUrl ? (
                        <>
                          {videoBlobUrls[item.noWatermarkUrl] ? (
                            <video
                              src={videoBlobUrls[item.noWatermarkUrl]}
                              className="w-full h-full object-contain"
                              muted
                              preload="metadata"
                            />
                          ) : (
                            <div className="flex flex-col items-center text-white/60 gap-1">
                              <RotateCw className="w-6 h-6 animate-spin" />
                              <span className="text-[10px]">加载中</span>
                            </div>
                          )}
                          {videoBlobUrls[item.noWatermarkUrl] ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/20 transition-colors pointer-events-none">
                              <div className="w-12 h-12 rounded-full bg-white/80 flex items-center justify-center opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all">
                                <Play className="w-6 h-6 text-black ml-0.5" fill="currentColor" />
                              </div>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <div className="flex flex-col items-center text-muted-foreground">
                          <Video className="w-8 h-8 mb-1" />
                          <span className="text-xs">解析中...</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 p-1.5 bg-background">
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium truncate">
                          {item.noWatermarkUrl
                            ? (item.width && item.height ? `${item.width}x${item.height}` : '视频')
                            : '等待解析'}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] shrink-0"
                        onClick={(e) => { e.stopPropagation(); handleDownload(item) }}
                        disabled={item.downloaded || !item.noWatermarkUrl || item.downloading}
                      >
                        {item.downloaded ? '已下载' : item.downloading ? (
                          <>
                            <RotateCw className="w-3 h-3 mr-1 animate-spin" />
                            下载中
                          </>
                        ) : (
                          <>
                            <Download className="w-3 h-3 mr-1" />
                            下载
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* 添加账号对话框 */}
      <Dialog open={showAddDialog} onOpenChange={async (open) => {
        if (!open && activeAccountId) {
          // 关闭对话框时恢复 webview 显示
          await browser.showWebview(activeAccountId)
        }
        setShowAddDialog(open)
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>添加账号</DialogTitle>
            <DialogDescription>
              创建一个新的浏览器环境，登录后会自动保存 Cookie。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">账号名称</label>
              <Input
                value={newAccount.name || ''}
                onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                placeholder="例如: 豆包主账号"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">平台</label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(PLATFORM_NAMES).map(([key, name]) => (
                  <button
                    key={key}
                    onClick={() => setNewAccount({ ...newAccount, platform: key as BrowserAccount['platform'] })}
                    className={cn(
                      'px-3 py-2 text-sm border rounded-md transition-colors',
                      newAccount.platform === key
                        ? 'border-primary bg-primary/10'
                        : 'hover:border-primary/50'
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {newAccount.platform === 'other' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">自定义网址</label>
                <Input
                  value={newAccount.url || ''}
                  onChange={(e) => setNewAccount({ ...newAccount, url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Cookie <span className="text-muted-foreground font-normal">（可选，粘贴后打开即可自动登录）</span>
              </label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={newAccount.cookies || ''}
                onChange={(e) => setNewAccount({ ...newAccount, cookies: e.target.value })}
                placeholder="Cookie header string，打开浏览器时自动注入"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                代理 IP <span className="text-muted-foreground font-normal">（可选，防多账号关联）</span>
              </label>
              <Input
                value={newAccount.proxy || ''}
                onChange={(e) => setNewAccount({ ...newAccount, proxy: e.target.value })}
                placeholder="http://127.0.0.1:8080"
              />
            </div>

            <Button onClick={addAccount} className="w-full">
              添加账号
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 媒体预览对话框 */}
      {previewMedia && previewMedia.type === 'image' && (
        <ImagePreviewDialog
          src={previewMedia.noWatermarkUrl || previewMedia.thumbnailUrl || ''}
          alt="预览图片"
          isOpen={!!previewMedia && previewMedia.type === 'image'}
          onClose={closePreview}
          title="图片预览"
          images={media.images.map(img => img.noWatermarkUrl || img.thumbnailUrl || '')}
          currentIndex={previewIndex}
          onIndexChange={setPreviewIndex}
        />
      )}
      {previewMedia && previewMedia.type === 'video' && previewMedia.noWatermarkUrl && (
        <Dialog open={!!previewMedia && previewMedia.type === 'video'} onOpenChange={(open) => {
          if (!open) closePreview()
        }}>
          <DialogContent className="max-w-5xl p-0 overflow-hidden gap-0">
            <DialogHeader className="sr-only">
              <DialogTitle>视频预览</DialogTitle>
            </DialogHeader>
            <div className="bg-black flex items-center justify-center relative" style={{ minHeight: 500, maxHeight: '85vh' }}>
              {videoBlobUrls[previewMedia.noWatermarkUrl] ? (
                <video
                  key={videoBlobUrls[previewMedia.noWatermarkUrl]}
                  src={videoBlobUrls[previewMedia.noWatermarkUrl]}
                  controls
                  autoPlay
                  loop
                  className="max-w-full max-h-[85vh] w-full"
                  style={{ aspectRatio: '16/9' }}
                />
              ) : (
                <div className="flex flex-col items-center text-white/80 gap-3 py-20">
                  <RotateCw className="w-10 h-10 animate-spin" />
                  <span className="text-sm">正在加载视频...</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between px-4 py-2 bg-background border-t gap-2">
              <div className="text-xs text-muted-foreground truncate flex-1">
                {previewMedia.width && previewMedia.height
                  ? `${previewMedia.width}x${previewMedia.height}`
                  : '视频'}
              </div>
              <Button
                size="sm"
                onClick={() => handleDownload(previewMedia)}
                disabled={previewMedia.downloaded}
              >
                {previewMedia.downloaded ? '已下载' : (
                  <>
                    <Download className="w-4 h-4 mr-1" />
                    下载
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
