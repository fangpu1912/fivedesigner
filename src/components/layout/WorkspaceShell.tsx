import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface WorkspaceShellProps {
  header?: ReactNode
  left?: ReactNode
  main: ReactNode
  right?: ReactNode
  footer?: ReactNode
  className?: string
  contentClassName?: string
  leftClassName?: string
  mainClassName?: string
  rightClassName?: string
}

export function WorkspaceShell({
  header,
  left,
  main,
  right,
  footer,
  className,
  contentClassName,
  leftClassName,
  mainClassName,
  rightClassName,
}: WorkspaceShellProps) {
  return (
    <div className={cn('h-full flex flex-col', className)}>
      {header}
      <div className={cn('flex-1 flex overflow-hidden', contentClassName)}>
        {left && (
          <aside className={cn('border-r flex-shrink-0 overflow-hidden bg-card', leftClassName)}>
            {left}
          </aside>
        )}
        <main className={cn('min-w-0 flex-1 overflow-hidden', mainClassName)}>{main}</main>
        {right && (
          <aside className={cn('border-l flex-shrink-0 overflow-hidden bg-card', rightClassName)}>
            {right}
          </aside>
        )}
      </div>
      {footer}
    </div>
  )
}
