import { cn } from '@/lib/utils'

export const NODE_BASE_CLASSES = {
  container:
    'group relative overflow-visible rounded-lg border shadow-sm transition-colors duration-150',
  selected:
    'border-primary shadow-[0_0_0_2px_rgba(59,130,246,0.4),0_4px_12px_rgba(0,0,0,0.15)]',
  unselected:
    'border-border/80 hover:border-border bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:bg-slate-900/95 dark:border-white/20 dark:hover:border-white/35',
  error:
    'border-red-500/80 bg-red-50 hover:border-red-400 dark:bg-red-950/20',
  errorSelected:
    'border-red-400 shadow-[0_0_0_2px_rgba(248,113,113,0.5),0_4px_12px_rgba(0,0,0,0.15)]',
}

export const NODE_HEADER_FLOATING_CLASS =
  'absolute -top-7 left-1 right-1 z-10 node-header'

export const NODE_HEADER_TONE_CLASS =
  'text-slate-700/68 dark:text-white/55'

export const NODE_HEADER_TITLE_CLASS = 'text-sm font-normal'

export const NODE_HEADER_CLASSES = {
  container: 'flex items-center justify-between px-1',
  title: `flex items-center gap-1.5 ${NODE_HEADER_TITLE_CLASS} ${NODE_HEADER_TONE_CLASS}`,
  icon: 'h-4 w-4 shrink-0',
}

export const NODE_CONTENT_CLASSES = {
  container: 'p-2 space-y-2',
}

export const NODE_FOOTER_CLASSES = {
  container: 'px-2 py-1.5 border-t border-border/40 bg-muted/20',
}

export const NODE_HANDLE_CLASSES = {
  // 基础样式 - 小圆形
  target: '!h-2.5 !w-2.5 !rounded-full !border-2 !border-white !bg-primary !shadow-md hover:!h-4 hover:!w-4 hover:!shadow-[0_0_8px_rgba(59,130,246,0.6)] !transition-all !duration-200',
  source: '!h-2.5 !w-2.5 !rounded-full !border-2 !border-white !bg-primary !shadow-md hover:!h-4 hover:!w-4 hover:!shadow-[0_0_8px_rgba(59,130,246,0.6)] !transition-all !duration-200',
  // 连接时放大样式（通过JS动态添加）
  targetEnlarged: '!h-4 !w-4 !rounded-full !border-2 !border-white !bg-primary !shadow-[0_0_8px_rgba(59,130,246,0.6)]',
  sourceEnlarged: '!h-4 !w-4 !rounded-full !border-2 !border-white !bg-primary !shadow-[0_0_8px_rgba(59,130,246,0.6)]',
}

export const NODE_HANDLE_WRAPPER_CLASSES = {
  left: 'absolute -left-1 top-1/2 -translate-y-1/2',
  right: 'absolute -right-1 top-1/2 -translate-y-1/2',
}

export const NODE_HANDLE_LABEL_CLASSES =
  'text-[9px] text-muted-foreground bg-background px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap'

export const NODE_IMAGE_CONTAINER_CLASS =
  'rounded-md overflow-hidden bg-muted/50'

export const NODE_CONTROL_CHIP_CLASS =
  '!h-6 !rounded-md !px-2 !text-[11px] !gap-1'

export const NODE_CONTROL_PRIMARY_BUTTON_CLASS =
  '!h-6 !rounded-md !px-2 !text-[11px] !gap-1 border border-transparent'

export const NODE_CONTROL_ICON_CLASS = 'h-3 w-3'

export function getNodeContainerClass(
  selected: boolean,
  className?: string,
  _isConnectable?: boolean,
  hasError?: boolean,
) {
  return cn(
    NODE_BASE_CLASSES.container,
    hasError
      ? selected
        ? NODE_BASE_CLASSES.errorSelected
        : NODE_BASE_CLASSES.error
      : selected
        ? NODE_BASE_CLASSES.selected
        : NODE_BASE_CLASSES.unselected,
    className,
  )
}

export function getTargetHandleClass(className?: string, isEnlarged?: boolean) {
  return cn(
    isEnlarged ? NODE_HANDLE_CLASSES.targetEnlarged : NODE_HANDLE_CLASSES.target,
    className
  )
}

export function getSourceHandleClass(className?: string, isEnlarged?: boolean) {
  return cn(
    isEnlarged ? NODE_HANDLE_CLASSES.sourceEnlarged : NODE_HANDLE_CLASSES.source,
    className
  )
}

/**
 * 获取动态连接点样式（支持连接时自动放大）
 */
export function getDynamicHandleClass(
  handleType: 'source' | 'target',
  isEnlarged: boolean,
  className?: string
) {
  if (handleType === 'target') {
    return getTargetHandleClass(className, isEnlarged)
  }
  return getSourceHandleClass(className, isEnlarged)
}

export const NODE_WIDTH = {
  SMALL: 200,
  MEDIUM: 260,
  LARGE: 320,
} as const

export const NODE_MIN_WIDTH = 160
export const NODE_MIN_HEIGHT = 100
