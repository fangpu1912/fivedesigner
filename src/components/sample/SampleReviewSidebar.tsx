import { Clock, Film, Music, Volume2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

import { type SampleReviewClip, getSampleMediaUrl } from './sampleReviewShared'

interface SampleReviewSidebarProps {
  clips: SampleReviewClip[]
  currentClipIndex: number
  onSelectClip: (index: number) => void
  formatTime: (seconds: number) => string
}

export function SampleReviewSidebar({
  clips,
  currentClipIndex,
  onSelectClip,
  formatTime,
}: SampleReviewSidebarProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b p-3">
        <h3 className="text-sm font-semibold">分镜列表</h3>
        <span className="text-xs text-muted-foreground">{clips.length} 条</span>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {clips.map((clip, index) => (
          <Card
            key={clip.id}
            className={cn(
              'cursor-pointer transition-all',
              currentClipIndex === index
                ? 'border-primary ring-2 ring-primary'
                : 'hover:border-primary/50'
            )}
            onClick={() => onSelectClip(index)}
          >
            <CardContent className="p-2">
              <div className="relative aspect-video overflow-hidden rounded bg-muted">
                {clip.videoUrl ? (
                  <video
                    src={getSampleMediaUrl(clip.videoUrl) || ''}
                    className="h-full w-full object-cover"
                    muted
                  />
                ) : clip.imageUrl ? (
                  <img
                    src={getSampleMediaUrl(clip.imageUrl) || ''}
                    alt={clip.storyboard.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Film className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}

                <div className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded bg-black/70 text-xs text-white">
                  {index + 1}
                </div>

                {clip.audioUrl && (
                  <div className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded bg-primary/90 text-xs text-white">
                    <Volume2 className="h-3 w-3" />
                  </div>
                )}
              </div>

              <div className="mt-2 space-y-1">
                <p className="truncate text-xs font-medium">{clip.storyboard.name}</p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-0.5">
                    <Clock className="h-3 w-3" />
                    {formatTime(clip.duration)}
                  </span>
                  {clip.dubbings.length > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Music className="h-3 w-3" />
                      {clip.dubbings.length} 条配音
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
