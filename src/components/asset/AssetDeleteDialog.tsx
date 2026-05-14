import { Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type AssetDeleteType = 'asset' | 'character' | 'scene' | 'prop' | null | undefined

interface AssetDeleteDialogProps {
  open: boolean
  targetType: AssetDeleteType
  onOpenChange: (open: boolean) => void
  onCancel: () => void
  onConfirm: () => void
}

function getTypeLabel(type: AssetDeleteType) {
  switch (type) {
    case 'character':
      return '角色'
    case 'scene':
      return '场景'
    case 'prop':
      return '道具'
    default:
      return '资产'
  }
}

export function AssetDeleteDialog({
  open,
  targetType,
  onOpenChange,
  onCancel,
  onConfirm,
}: AssetDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>确认删除</DialogTitle>
          <DialogDescription>
            确定要删除这个{getTypeLabel(targetType)}吗？此操作不可恢复。
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            <Trash2 className="mr-2 h-4 w-4" />
            删除
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
