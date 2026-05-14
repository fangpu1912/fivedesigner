import { memo } from 'react'
import { Loader2, CheckCircle2, XCircle, Play } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ExecutionStatus = 'idle' | 'running' | 'success' | 'error'

interface ExecutionStatusBadgeProps {
  status: ExecutionStatus
  progress?: number
  className?: string
}

export const ExecutionStatusBadge = memo(function ExecutionStatusBadge({
  status,
  progress = 0,
  className,
}: ExecutionStatusBadgeProps) {
  const getIcon = () => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-3.5 w-3.5 animate-spin" />
      case 'success':
        return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
      case 'error':
        return <XCircle className="h-3.5 w-3.5 text-destructive" />
      default:
        return <Play className="h-3.5 w-3.5 text-muted-foreground" />
    }
  }

  const getBackgroundColor = () => {
    switch (status) {
      case 'running':
        return 'bg-blue-500/10 border-blue-500/30'
      case 'success':
        return 'bg-green-500/10 border-green-500/30'
      case 'error':
        return 'bg-destructive/10 border-destructive/30'
      default:
        return 'bg-muted/50 border-transparent'
    }
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium transition-all duration-300',
        getBackgroundColor(),
        className
      )}
    >
      {getIcon()}
      {status === 'running' && progress > 0 && (
        <span className="tabular-nums">{progress}%</span>
      )}
    </div>
  )
})

interface NodeExecutionOverlayProps {
  status: ExecutionStatus
  progress?: number
}

export const NodeExecutionOverlay = memo(function NodeExecutionOverlay({
  status,
  progress = 0,
}: NodeExecutionOverlayProps) {
  if (status === 'idle') return null

  const getBorderColor = () => {
    switch (status) {
      case 'running':
        return 'border-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.3)]'
      case 'success':
        return 'border-green-500 shadow-[0_0_0_2px_rgba(34,197,94,0.3)]'
      case 'error':
        return 'border-destructive shadow-[0_0_0_2px_rgba(239,68,68,0.3)]'
      default:
        return ''
    }
  }

  return (
    <>
      {/* 边框高亮效果 */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 rounded-lg border-2 transition-all duration-300',
          getBorderColor()
        )}
      />

      {/* 进度条 */}
      {status === 'running' && progress > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-1 overflow-hidden rounded-b-lg bg-muted">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* 脉冲动画效果 */}
      {status === 'running' && (
        <div className="pointer-events-none absolute inset-0 animate-pulse rounded-lg bg-blue-500/5" />
      )}
    </>
  )
})
