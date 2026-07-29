/**
 * 激活对话框组件
 * 用于输入激活码激活应用
 */
import { useState } from 'react'
import { Key, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/useToast'
import { activate, getActivationStatus, getRemainingDays, getMachineId } from '@/services/activationService'
import type { ActivationStatus } from '@/types'

interface ActivationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onActivated: (status: ActivationStatus) => void
}

export function ActivationDialog({ open, onOpenChange, onActivated }: ActivationDialogProps) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string; expiresAt?: string; remainingDays?: number } | null>(null)
  const { toast } = useToast()

  const handleActivate = async () => {
    if (!code.trim()) {
      toast({ title: '请输入激活码', variant: 'destructive' })
      return
    }

    setLoading(true)
    setResult(null)

    try {
      const res = await activate(code.trim().toUpperCase())
      setResult(res)

      if (res.success) {
        toast({
          title: '激活成功',
          description: `有效期至 ${new Date(res.expiresAt!).toLocaleDateString()} (${res.remainingDays!} 天)`,
        })
        // 获取完整激活状态并回调
        const status = await getActivationStatus()
        if (status) {
          onActivated(status)
          onOpenChange(false)
        }
      }
    } catch (error) {
      setResult({ success: false, message: (error as Error).message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            激活 FiveDesigner
          </DialogTitle>
          <DialogDescription>
            请输入激活码以使用 FiveDesigner。激活码为一次性使用,绑定当前电脑。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="输入激活码(如: ABCD1234EFGH5678)"
              className="text-center text-lg font-mono tracking-wider"
              maxLength={20}
            />
          </div>

          {result && (
            <div className={`flex items-center gap-2 p-3 rounded ${result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {result.success ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <XCircle className="h-5 w-5" />
              )}
              <span className="text-sm">{result.message}</span>
              {result.success && result.remainingDays && (
                <Clock className="h-4 w-4 ml-auto" />
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" size="sm" onClick={async () => {
            const machineId = await getMachineId()
            onActivated({ 
              activated: true, 
              machine_id: machineId,
              expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
            })
          }} className="text-muted-foreground">
            试用 365 天
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={handleActivate} disabled={loading || !code.trim()}>
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Key className="h-4 w-4 mr-2" />
              )}
              激活
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * 激活状态显示组件
 * 显示当前激活状态和剩余天数
 */
export function ActivationStatusBadge({ status }: { status: ActivationStatus | null }) {
  if (!status || !status.activated) {
    return (
      <div className="flex items-center gap-1 text-sm text-red-500">
        <XCircle className="h-4 w-4" />
        未激活
      </div>
    )
  }

  const remainingDays = getRemainingDays(status)

  if (remainingDays <= 0) {
    return (
      <div className="flex items-center gap-1 text-sm text-red-500">
        <XCircle className="h-4 w-4" />
        已过期
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 text-sm text-green-600">
      <CheckCircle2 className="h-4 w-4" />
      已激活 ({remainingDays} 天)
    </div>
  )
}