import { useState, useCallback, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  Plus,
  X,
  ExternalLink,
  Trash2,
  Save,
  User,
  AlertCircle,
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
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'

interface BrowserAccount {
  id: string
  name: string
  platform: 'doubao' | 'jimeng' | 'kling' | 'other'
  url: string
  dataDir: string
  pid?: number
  isRunning: boolean
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

// 从 localStorage 加载账号
const loadAccounts = (): BrowserAccount[] => {
  try {
    const saved = localStorage.getItem('browser_accounts')
    if (saved) {
      return JSON.parse(saved)
    }
  } catch { /* ignore */ }
  return []
}

// 保存账号到 localStorage
const saveAccounts = (accounts: BrowserAccount[]) => {
  try {
    localStorage.setItem('browser_accounts', JSON.stringify(accounts))
  } catch { /* ignore */ }
}

export default function BrowserManager() {
  const { toast } = useToast()
  const [accounts, setAccounts] = useState<BrowserAccount[]>(loadAccounts)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [browserPath, setBrowserPath] = useState<string>('')
  const [newAccount, setNewAccount] = useState<Partial<BrowserAccount>>({
    platform: 'doubao',
  })

  // 检测浏览器
  useEffect(() => {
    detectBrowser()
  }, [])

  // 页面挂载时检查已保存的浏览器进程是否仍在运行
  useEffect(() => {
    const checkRunningStatus = async () => {
      const savedAccounts = loadAccounts()
      const updates: BrowserAccount[] = []

      for (const account of savedAccounts) {
        if (account.pid) {
          try {
            const isRunning = await invoke<boolean>('check_browser_running', { pid: account.pid })
            if (!isRunning) {
              updates.push({ ...account, pid: undefined, isRunning: false })
            }
          } catch {
            updates.push({ ...account, pid: undefined, isRunning: false })
          }
        }
      }

      if (updates.length > 0) {
        setAccounts(prev => prev.map(a => {
          const update = updates.find(u => u.id === a.id)
          return update || a
        }))
      }
    }

    checkRunningStatus()
  }, [])

  // 保存账号变化
  useEffect(() => {
    saveAccounts(accounts)
  }, [accounts])

  const detectBrowser = async () => {
    try {
      const path = await invoke<string>('detect_browser')
      setBrowserPath(path)
    } catch (error) {
      toast({
        title: '未检测到 Chrome/Edge',
        description: '请安装 Chrome 或 Edge 浏览器',
        variant: 'destructive',
      })
    }
  }

  // 打开账号
  const openAccount = useCallback(async (accountId: string) => {
    if (!browserPath) {
      toast({ title: '请先安装 Chrome 或 Edge', variant: 'destructive' })
      return
    }

    const account = accounts.find(a => a.id === accountId)
    if (!account) return

    // 如果已经在运行，提示用户
    if (account.isRunning && account.pid) {
      toast({ title: '该账号已在运行中' })
      return
    }

    try {
      const pid = await invoke<number>('create_browser_window', {
        sessionId: accountId,
        profile: {
          id: accountId,
          name: account.name,
          data_dir: account.dataDir,
          viewport_width: 1366,
          viewport_height: 768,
          locale: 'zh-CN',
          timezone: 'Asia/Shanghai',
          color_scheme: 'light',
          extensions: [],
        },
        url: account.url,
      })

      setAccounts(prev => prev.map(a =>
        a.id === accountId ? { ...a, pid, isRunning: true } : a
      ))

      toast({ title: '已打开', description: account.name })
    } catch (error) {
      toast({ title: '打开失败', description: String(error), variant: 'destructive' })
    }
  }, [browserPath, accounts, toast])

  // 关闭账号
  const closeAccount = useCallback(async (accountId: string) => {
    const account = accounts.find(a => a.id === accountId)
    if (account?.pid) {
      try {
        await invoke('close_browser_window', { pid: account.pid })
      } catch (error) {
        console.error('关闭失败:', error)
      }
    }

    setAccounts(prev => prev.map(a =>
      a.id === accountId ? { ...a, pid: undefined, isRunning: false } : a
    ))
  }, [accounts])

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
      isRunning: false,
    }

    setAccounts(prev => [...prev, account])
    setShowAddDialog(false)
    setNewAccount({ platform: 'doubao' })
    toast({ title: '账号已添加', description: account.name })
  }, [newAccount, toast])

  // 删除账号
  const deleteAccount = useCallback(async (accountId: string) => {
    const account = accounts.find(a => a.id === accountId)
    if (account?.isRunning) {
      await closeAccount(accountId)
    }

    // 清理数据目录
    try {
      await invoke('clear_browser_data', { profileId: accountId })
    } catch (error) {
      console.error('清理数据失败:', error)
    }

    setAccounts(prev => prev.filter(a => a.id !== accountId))
    toast({ title: '账号已删除' })
  }, [accounts, closeAccount, toast])

  // 应用退出时清理所有运行中的浏览器（不在页面切换时关闭）
  useEffect(() => {
    const handleBeforeUnload = () => {
      accounts.forEach(account => {
        if (account.pid) {
          invoke('close_browser_window', { pid: account.pid }).catch(() => {})
        }
      })
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [accounts])

  return (
    <div className="flex h-full flex-col bg-background">
      {/* 顶部 */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold">账号多开管理</h1>
          <p className="text-xs text-muted-foreground">
            {browserPath ? `浏览器: ${browserPath}` : '未检测到浏览器'}
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          添加账号
        </Button>
      </div>

      {/* 账号列表 */}
      <div className="flex-1 overflow-auto p-4">
        {accounts.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
            <User className="w-16 h-16 opacity-20" />
            <p>还没有保存的账号</p>
            <p className="text-sm">点击"添加账号"创建，登录一次后会自动保存</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map(account => (
              <div
                key={account.id}
                className={cn(
                  'p-4 border rounded-lg space-y-3 transition-colors',
                  account.isRunning ? 'border-primary bg-primary/5' : 'hover:border-primary/50'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      'w-2 h-2 rounded-full',
                      account.isRunning ? 'bg-green-500' : 'bg-gray-300'
                    )} />
                    <span className="font-medium">{account.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {PLATFORM_NAMES[account.platform]}
                  </span>
                </div>

                <div className="text-xs text-muted-foreground truncate">
                  {account.url}
                </div>

                <div className="flex gap-2">
                  {account.isRunning ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => closeAccount(account.id)}
                    >
                      <X className="w-4 h-4 mr-1" />
                      关闭
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => openAccount(account.id)}
                    >
                      <ExternalLink className="w-4 h-4 mr-1" />
                      打开
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => deleteAccount(account.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 添加账号对话框 */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
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
                    onClick={() => setNewAccount({ ...newAccount, platform: key as any })}
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

            <div className="flex items-start gap-2 p-3 bg-muted rounded-md text-xs text-muted-foreground">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <p>
                添加后点击"打开"，在浏览器中完成登录，关闭后下次可直接打开使用，无需重新登录。
              </p>
            </div>

            <Button onClick={addAccount} className="w-full">
              <Save className="w-4 h-4 mr-2" />
              添加账号
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
