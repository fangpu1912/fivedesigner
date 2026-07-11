/**
 * 激活管理页面(管理员用)
 * - 批量生成激活码
 * - 查看激活码列表
 * - 删除激活码
 * - 导出激活码
 */
import { useState, useEffect } from 'react'
import {
  Key,
  Plus,
  Trash2,
  Download,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
  Lock,
  Unlock,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/useToast'
import { activationDB } from '@/db'
import { batchGenerateCodes, getActivationStatus, getRemainingDays, isActivationValid } from '@/services/activationService'
import { secureStorage } from '@/services/secureStorage'
import type { ActivationCode, ActivationStatus } from '@/types'

// 默认管理员密码(首次使用时写入 SecureStore)
const DEFAULT_ADMIN_PASSWORD = 'fivedesigner2007321227'
const ADMIN_PASSWORD_KEY = 'activation_admin_password'

export default function ActivationManager() {
  const [codes, setCodes] = useState<ActivationCode[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [count, setCount] = useState(10)
  const [validDays, setValidDays] = useState(30)
  const [adminPassword, setAdminPassword] = useState('')
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [authError, setAuthError] = useState('')
  const [storedPassword, setStoredPassword] = useState<string | null>(null)
  const [activationStatus, setActivationStatus] = useState<ActivationStatus | null>(null)
  const { toast } = useToast()

  // 加载管理员密码(从 SecureStore 或使用默认)
  useEffect(() => {
    const loadPassword = async () => {
      const saved = await secureStorage.get(ADMIN_PASSWORD_KEY)
      if (saved) {
        setStoredPassword(saved)
      } else {
        // 首次使用,写入默认密码
        await secureStorage.set(ADMIN_PASSWORD_KEY, DEFAULT_ADMIN_PASSWORD)
        setStoredPassword(DEFAULT_ADMIN_PASSWORD)
      }
    }
    loadPassword()
  }, [])

  // 加载当前激活状态
  useEffect(() => {
    getActivationStatus().then(setActivationStatus)
  }, [])

  const loadCodes = async () => {
    setLoading(true)
    try {
      const allCodes = await activationDB.getAll()
      setCodes(allCodes)
    } catch (error) {
      toast({ title: '加载失败', description: (error as Error).message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCodes()
  }, [])

  const handleGenerate = async () => {
    if (count < 1 || count > 100) {
      toast({ title: '数量范围 1-100', variant: 'destructive' })
      return
    }
    if (validDays < 1 || validDays > 365) {
      toast({ title: '有效天数范围 1-365', variant: 'destructive' })
      return
    }

    setGenerating(true)
    try {
      await batchGenerateCodes(count, validDays)
      toast({ title: `已生成 ${count} 个激活码`, description: `有效期 ${validDays} 天` })
      await loadCodes()
    } catch (error) {
      toast({ title: '生成失败', description: (error as Error).message, variant: 'destructive' })
    } finally {
      setGenerating(false)
    }
  }

  const handleDelete = async (code: string) => {
    try {
      await activationDB.delete(code)
      toast({ title: '已删除' })
      await loadCodes()
    } catch (error) {
      toast({ title: '删除失败', description: (error as Error).message, variant: 'destructive' })
    }
  }

  const handleExport = () => {
    const unusedCodes = codes.filter((c) => c.used === 0)
    if (unusedCodes.length === 0) {
      toast({ title: '没有未使用的激活码', variant: 'destructive' })
      return
    }

    const text = unusedCodes
      .map((c) => `${c.code} (${c.valid_days}天)`)
      .join('\n')

    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `激活码_${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)

    toast({ title: `已导出 ${unusedCodes.length} 个激活码` })
  }

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code)
    toast({ title: '已复制到剪贴板' })
  }

  const handleAuthorize = () => {
    if (!storedPassword) {
      toast({ title: '密码未加载,请稍后', variant: 'destructive' })
      return
    }
    if (adminPassword === storedPassword) {
      setIsAuthorized(true)
      setAuthError('')
      toast({ title: '已验证管理员权限' })
    } else {
      setAuthError('密码错误')
      toast({ title: '密码错误', variant: 'destructive' })
    }
  }

  const handleLogout = () => {
    setIsAuthorized(false)
    setAdminPassword('')
    toast({ title: '已退出管理员模式' })
  }

  const unusedCount = codes.filter((c) => c.used === 0).length
  const usedCount = codes.filter((c) => c.used === 1).length

  return (
    <div className="container mx-auto p-6 space-y-6 h-full flex flex-col">
      {/* 标题 + 激活状态 */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Key className="h-8 w-8" />
            激活管理
          </h1>
          <p className="text-muted-foreground mt-1">
            批量生成激活码,管理激活码状态
          </p>
        </div>
        <div className="shrink-0">
          {isActivationValid(activationStatus) ? (
            <div className="flex items-center gap-2 text-sm bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 px-3 py-2 rounded-lg border border-green-200 dark:border-green-800">
              <CheckCircle2 className="h-4 w-4" />
              <span>已激活</span>
              <span className="text-muted-foreground">·</span>
              <span>到期 {new Date(activationStatus!.expires_at!).toLocaleDateString('zh-CN')}</span>
              <span className="text-muted-foreground">·</span>
              <span>剩余 {getRemainingDays(activationStatus)} 天</span>
            </div>
          ) : activationStatus ? (
            <div className="flex items-center gap-2 text-sm bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-300 px-3 py-2 rounded-lg border border-red-200 dark:border-red-800">
              <XCircle className="h-4 w-4" />
              <span>已过期</span>
              <span className="text-muted-foreground">·</span>
              <span>到期 {new Date(activationStatus.expires_at!).toLocaleDateString('zh-CN')}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm bg-muted px-3 py-2 rounded-lg border">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">未激活</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">QQ联系：1500493432</span>
            </div>
          )}
        </div>
      </div>

      {/* 管理员验证卡片 */}
      <Card className={isAuthorized ? 'border-green-500' : 'border-destructive'}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isAuthorized ? (
              <Unlock className="h-5 w-5 text-green-500" />
            ) : (
              <Lock className="h-5 w-5 text-destructive" />
            )}
            管理员权限验证
          </CardTitle>
          <CardDescription>
            {isAuthorized 
              ? '已验证管理员权限,可执行所有操作' 
              : '请输入管理员密码以解锁生成/导出/删除功能'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isAuthorized ? (
            <div className="flex items-center gap-4">
              <Input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="输入管理员密码"
                className="max-w-xs"
              />
              <Button onClick={handleAuthorize} disabled={!adminPassword.trim()}>
                <Unlock className="h-4 w-4 mr-2" />
                验证
              </Button>
              {authError && <span className="text-destructive text-sm">{authError}</span>}
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <Badge variant="default" className="bg-green-500">已验证</Badge>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <Lock className="h-4 w-4 mr-2" />
                退出管理员模式
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 生成卡片 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            批量生成激活码
          </CardTitle>
          <CardDescription>生成一次性激活码,每个激活码只能在一台电脑上使用</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">生成数量</label>
              <Input
                type="number"
                value={count}
                onChange={(e) => setCount(parseInt(e.target.value) || 0)}
                min={1}
                max={100}
                className="w-20"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">有效天数</label>
              <Input
                type="number"
                value={validDays}
                onChange={(e) => setValidDays(parseInt(e.target.value) || 0)}
                min={1}
                max={365}
                className="w-20"
              />
            </div>
            <Button onClick={handleGenerate} disabled={generating || !isAuthorized} className="mt-6">
              {generating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              {isAuthorized ? '生成' : '需验证'}
            </Button>
            {!isAuthorized && (
              <span className="mt-6 text-sm text-muted-foreground">请先验证管理员密码</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 激活码列表 — 仅管理员可见 */}
      {isAuthorized ? (
        <Card className="flex-1 min-h-0 flex flex-col">
          <CardHeader className="shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>激活码列表</CardTitle>
                <CardDescription>
                  共 {codes.length} 个 · 未使用 {unusedCount} · 已使用 {usedCount}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={loadCodes} disabled={loading}>
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="h-4 w-4 mr-2" />
                  导出未使用
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 min-h-0">
            {codes.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                还没有激活码,点击上方"生成"按钮创建
              </div>
            ) : (
              <div className="h-full w-full rounded border p-2 overflow-y-auto">
                <div className="space-y-2">
                  {codes.map((code) => (
                    <div
                      key={code.code}
                      className="flex items-center justify-between p-3 rounded border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {code.used === 0 ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-muted-foreground" />
                        )}
                        <div>
                          <div className="font-mono text-lg">{code.code}</div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>{code.valid_days} 天有效期</span>
                            {code.used === 1 && code.machine_id && (
                              <span className="text-xs">· 机器: {code.machine_id.slice(0, 8)}...</span>
                            )}
                            {code.used === 1 && code.expires_at && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(code.expires_at).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={code.used === 0 ? 'default' : 'secondary'}>
                          {code.used === 0 ? '未使用' : '已使用'}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(code.code)}
                          title="复制"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(code.code)}
                          title="删除"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>激活码列表</CardTitle>
            <CardDescription>验证管理员权限后查看</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 text-muted-foreground">
              <Lock className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>请先在上方验证管理员密码</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}