import { memo } from 'react'
import { Play, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { NodeExecutionState } from '../hooks/useNodeExecution'

interface NodeExecuteButtonProps {
  isExecuting: boolean
  executionState?: NodeExecutionState
  onExecute: () => void
  disabled?: boolean
}

export const NodeExecuteButton = memo(function NodeExecuteButton({
  isExecuting,
  executionState,
  onExecute,
  disabled = false,
}: NodeExecuteButtonProps) {
  // 根据执行状态显示不同的图标
  const getIcon = () => {
    if (isExecuting) {
      return <Loader2 className="h-3.5 w-3.5 animate-spin" />
    }
    if (executionState?.error) {
      return <XCircle className="h-3.5 w-3.5 text-destructive" />
    }
    if (executionState?.result) {
      return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
    }
    return <Play className="h-3.5 w-3.5" />
  }

  // 根据执行状态显示不同的提示
  const getTitle = () => {
    if (isExecuting) {
      return '执行中...'
    }
    if (executionState?.error) {
      return `执行失败: ${executionState.error}`
    }
    if (executionState?.result) {
      return '执行成功，点击重新执行'
    }
    return '执行节点'
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className={`
        h-6 w-6 rounded-full
        ${executionState?.error ? 'bg-destructive/10 hover:bg-destructive/20' : ''}
        ${executionState?.result ? 'bg-green-500/10 hover:bg-green-500/20' : ''}
      `}
      onClick={(e) => {
        e.stopPropagation()
        onExecute()
      }}
      disabled={disabled || isExecuting}
      title={getTitle()}
    >
      {getIcon()}
    </Button>
  )
})
