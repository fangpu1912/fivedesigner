import { useState } from 'react'

import {
  Image,
  Video,
  MoreVertical,
  Edit,
  Trash2,
  RefreshCw,
  Check,
  Clock,
  AlertCircle,
  User,
  MapPin,
  Box,
} from 'lucide-react'

import { ClickableThumbnail } from '@/components/media/ImagePreviewDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { Storyboard, Character, Scene, Prop } from '@/types'
import { getImageUrl } from '@/utils/asset'

interface StoryboardCardProps {
  storyboard: Storyboard
  selected?: boolean
  onSelect?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onGenerate?: (type: 'image' | 'video') => void
  relatedCharacters?: Character[]
  relatedScene?: Scene | null
  relatedProps?: Prop[]
}

const STATUS_CONFIG = {
  pending: { icon: Clock, label: '待生成', color: 'text-muted-foreground' },
  generating: { icon: RefreshCw, label: '生成中', color: 'text-primary' },
  completed: { icon: Check, label: '已完成', color: 'text-green-500' },
  failed: { icon: AlertCircle, label: '生成失败', color: 'text-destructive' },
}

export function StoryboardCard({
  storyboard,
  selected,
  onSelect,
  onEdit,
  onDelete,
  onGenerate,
  relatedCharacters = [],
  relatedScene = null,
  relatedProps = [],
}: StoryboardCardProps) {
  const [showMenu, setShowMenu] = useState(false)

  const status = storyboard.status || 'pending'
  const statusConfig = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending
  const StatusIcon = statusConfig.icon

  const hasImage = !!storyboard.image
  const hasVideo = !!storyboard.video

  return (
    <Card
      className={cn(
        'group relative overflow-hidden cursor-pointer transition-all',
        selected && 'ring-2 ring-primary',
        'hover:shadow-md'
      )}
      onClick={onSelect}
    >
      <div className="aspect-video relative bg-secondary overflow-hidden">
        {hasImage || hasVideo ? (
          <>
            {hasVideo ? (
              <video
                src={storyboard.video}
                className="w-full h-full object-cover"
                muted
                loop
                onMouseEnter={e => {
                  e.currentTarget.play().catch(() => {})
                }}
                onMouseLeave={e => {
                  e.currentTarget.pause()
                  e.currentTarget.currentTime = 0
                }}
              />
            ) : (
              <ClickableThumbnail
                src={getImageUrl(storyboard.image)}
                alt={storyboard.name}
                title={storyboard.name}
                aspectRatio="video"
              />
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Image className="h-12 w-12 text-muted-foreground/50" />
          </div>
        )}

        {selected && (
          <div className="absolute top-2 left-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
            <Check className="h-4 w-4 text-primary-foreground" />
          </div>
        )}

        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="secondary"
            size="icon"
            className="h-8 w-8"
            onClick={e => {
              e.stopPropagation()
              onGenerate?.('image')
            }}
            title="生成图片"
          >
            <Image className="h-4 w-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="h-8 w-8"
            onClick={e => {
              e.stopPropagation()
              onGenerate?.('video')
            }}
            title="生成视频"
          >
            <Video className="h-4 w-4" />
          </Button>
        </div>

        {hasVideo && (
          <div className="absolute bottom-2 right-2 bg-black/60 rounded px-1.5 py-0.5">
            <Video className="h-3 w-3 text-white" />
          </div>
        )}
      </div>

      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-medium truncate">{storyboard.name}</h4>
            {storyboard.description && (
              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                {storyboard.description}
              </p>
            )}
          </div>

          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={e => {
                e.stopPropagation()
                setShowMenu(!showMenu)
              }}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>

            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={e => {
                    e.stopPropagation()
                    setShowMenu(false)
                  }}
                />
                <div className="absolute right-0 top-full mt-1 w-36 bg-popover border rounded-md shadow-lg z-20 py-1">
                  <button
                    className="w-full px-3 py-2 text-sm text-left hover:bg-accent flex items-center gap-2"
                    onClick={e => {
                      e.stopPropagation()
                      setShowMenu(false)
                      onEdit?.()
                    }}
                  >
                    <Edit className="h-4 w-4" />
                    编辑
                  </button>
                  <button
                    className="w-full px-3 py-2 text-sm text-left hover:bg-accent flex items-center gap-2 text-destructive"
                    onClick={e => {
                      e.stopPropagation()
                      setShowMenu(false)
                      onDelete?.()
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    删除
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <StatusIcon
            className={cn('h-4 w-4', statusConfig.color, status === 'generating' && 'animate-spin')}
          />
          <span className={cn('text-sm', statusConfig.color)}>{statusConfig.label}</span>
        </div>

        {storyboard.shot_type && (
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="text-xs bg-secondary px-2 py-0.5 rounded">{storyboard.shot_type}</span>
          </div>
        )}

        {(relatedCharacters.length > 0 || relatedScene || relatedProps.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-1">
            {relatedScene && (
              <Badge variant="outline" className="text-xs gap-1">
                <MapPin className="h-3 w-3" />
                {relatedScene.name}
              </Badge>
            )}
            {relatedCharacters.map(char => (
              <Badge key={char.id} variant="outline" className="text-xs gap-1">
                <User className="h-3 w-3" />
                {char.name}
              </Badge>
            ))}
            {relatedProps.map(prop => (
              <Badge key={prop.id} variant="outline" className="text-xs gap-1">
                <Box className="h-3 w-3" />
                {prop.name}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
