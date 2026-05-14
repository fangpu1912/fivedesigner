import { useCallback, useEffect, useRef } from 'react'
import { Copy, Trash2, Play, ClipboardPaste } from 'lucide-react'

interface ContextMenuItem {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  divider?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // ESC键关闭菜单
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // 确保菜单不超出视口
  const adjustedX = Math.min(x, window.innerWidth - 200)
  const adjustedY = Math.min(y, window.innerHeight - 300)

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[160px] rounded-md border bg-popover shadow-md"
      style={{ left: adjustedX, top: adjustedY }}
    >
      <div className="py-1">
        {items.filter(Boolean).map((item, index) => (
          <div key={index}>
            {item.divider && <div className="my-1 h-px bg-border" />}
            {!item.divider && (
              <button
                onClick={() => {
                  if (!item.disabled) {
                    item.onClick()
                    onClose()
                  }
                }}
                disabled={item.disabled}
                className={`
                  flex w-full items-center gap-2 px-3 py-2 text-sm
                  transition-colors
                  ${item.disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-accent'}
                  ${item.danger ? 'text-destructive hover:bg-destructive/10' : 'text-foreground'}
                `}
              >
                {item.icon && <span className="h-4 w-4 flex-shrink-0">{item.icon}</span>}
                <span>{item.label}</span>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// 节点右键菜单配置
export function useNodeContextMenu(
  _nodeId: string,
  hasSelection: boolean,
  onCopy: () => void,
  onPaste: () => void,
  onDelete: () => void,
  onExecute?: () => void,
  canExecute?: boolean
) {
  return useCallback((): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [
      {
        label: '复制',
        icon: <Copy className="h-4 w-4" />,
        onClick: onCopy,
        disabled: !hasSelection,
      },
      {
        label: '粘贴',
        icon: <ClipboardPaste className="h-4 w-4" />,
        onClick: onPaste,
      },
      { divider: true, label: '', onClick: () => {} },
      ...(onExecute
        ? [
            {
              label: '执行节点',
              icon: <Play className="h-4 w-4" />,
              onClick: onExecute,
              disabled: !canExecute,
            } as ContextMenuItem,
          ]
        : []),
      ...(onExecute ? [{ divider: true, label: '', onClick: () => {} } as ContextMenuItem] : []),
      {
        label: '删除',
        icon: <Trash2 className="h-4 w-4" />,
        onClick: onDelete,
        danger: true,
      },
    ]
    return items
  }, [hasSelection, onCopy, onPaste, onDelete, onExecute, canExecute])
}

// 画布右键菜单配置
export function useCanvasContextMenu(
  onPaste: () => void,
  onAddNode?: (type: string) => void
) {
  return useCallback((): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [
      {
        label: '粘贴',
        icon: <ClipboardPaste className="h-4 w-4" />,
        onClick: onPaste,
      },
    ]

    if (onAddNode) {
      items.push({ divider: true, label: '', onClick: () => {} })
      items.push({
        label: '添加上传节点',
        onClick: () => onAddNode('upload'),
      })
      items.push({
        label: '添加图片生成节点',
        onClick: () => onAddNode('imageEdit'),
      })
      items.push({
        label: '添加AI编辑节点',
        onClick: () => onAddNode('aiImageEdit'),
      })
    }

    return items
  }, [onPaste, onAddNode])
}
