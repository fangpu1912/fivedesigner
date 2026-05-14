import * as React from 'react'

import { cn } from '@/lib/utils'

export interface AutoResizeTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  minRows?: number
  maxRows?: number
}

const AutoResizeTextarea = React.forwardRef<HTMLTextAreaElement, AutoResizeTextareaProps>(
  ({ className, minRows = 2, maxRows = 10, onChange, ...props }, ref) => {
    const textareaRef = React.useRef<HTMLTextAreaElement>(null)
    const [rows, setRows] = React.useState(minRows)

    // 合并 ref
    React.useImperativeHandle(ref, () => textareaRef.current!)

    const calculateRows = React.useCallback(() => {
      const textarea = textareaRef.current
      if (!textarea) return

      // 重置高度以获取正确的 scrollHeight
      const previousHeight = textarea.style.height
      textarea.style.height = 'auto'

      // 计算行数
      const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20
      const paddingTop = parseInt(getComputedStyle(textarea).paddingTop) || 0
      const paddingBottom = parseInt(getComputedStyle(textarea).paddingBottom) || 0
      const borderHeight = 2 // 上下边框

      const contentHeight = textarea.scrollHeight - paddingTop - paddingBottom - borderHeight
      const calculatedRows = Math.ceil(contentHeight / lineHeight)

      // 限制在 minRows 和 maxRows 之间
      const newRows = Math.max(minRows, Math.min(calculatedRows, maxRows))
      setRows(newRows)

      // 恢复高度（如果需要）
      textarea.style.height = previousHeight
    }, [minRows, maxRows])

    const handleChange = React.useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        calculateRows()
        onChange?.(e)
      },
      [calculateRows, onChange]
    )

    // 初始计算和窗口大小变化时重新计算
    React.useEffect(() => {
      calculateRows()

      const handleResize = () => calculateRows()
      window.addEventListener('resize', handleResize)

      return () => window.removeEventListener('resize', handleResize)
    }, [calculateRows])

    // 当 value 变化时重新计算（用于外部更新）
    React.useEffect(() => {
      calculateRows()
    }, [props.value, calculateRows])

    return (
      <textarea
        className={cn(
          'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none overflow-hidden',
          className
        )}
        ref={textareaRef}
        rows={rows}
        onChange={handleChange}
        {...props}
      />
    )
  }
)
AutoResizeTextarea.displayName = 'AutoResizeTextarea'

export { AutoResizeTextarea }
