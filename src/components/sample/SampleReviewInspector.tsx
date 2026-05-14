import { Film, Volume2 } from 'lucide-react'

import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

import type { SampleReviewClip } from './sampleReviewShared'

interface SampleReviewInspectorProps {
  clips: SampleReviewClip[]
  currentClipIndex: number
  currentClip?: SampleReviewClip
  totalDuration: number
  formatTime: (seconds: number) => string
  onSelectClip: (index: number) => void
}

export function SampleReviewInspector({
  clips,
  currentClipIndex,
  currentClip,
  totalDuration,
  formatTime,
  onSelectClip,
}: SampleReviewInspectorProps) {
  if (!currentClip) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
        暂无可预览的分镜。
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center border-b px-3">
        <span className="text-sm font-medium">分镜信息</span>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div>
          <h4 className="mb-2 text-xs text-muted-foreground">当前分镜</h4>
          <p className="text-sm font-medium">{currentClip.storyboard.name}</p>
          {currentClip.storyboard.description && (
            <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
              {currentClip.storyboard.description}
            </p>
          )}
        </div>

        <Separator />

        <div>
          <h4 className="mb-2 text-xs text-muted-foreground">时长</h4>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">当前分镜</span>
              <span className="font-mono">{formatTime(currentClip.duration)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">总时长</span>
              <span className="font-mono">{formatTime(totalDuration)}</span>
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <h4 className="mb-2 text-xs text-muted-foreground">媒体</h4>
          <div className="space-y-2">
            {currentClip.videoUrl && (
              <div className="flex items-center gap-2 text-sm">
                <Film className="h-4 w-4 text-green-500" />
                <span>视频</span>
              </div>
            )}
            {currentClip.audioUrl && (
              <div className="flex items-center gap-2 text-sm">
                <Volume2 className="h-4 w-4 text-blue-500" />
                <span>配音</span>
              </div>
            )}
            {!currentClip.videoUrl && currentClip.imageUrl && (
              <div className="flex items-center gap-2 text-sm">
                <Film className="h-4 w-4 text-yellow-500" />
                <span>图片</span>
              </div>
            )}
          </div>
        </div>

        {currentClip.dubbings.length > 0 && (
          <>
            <Separator />

            <div>
              <h4 className="mb-2 text-xs text-muted-foreground">
                配音 ({currentClip.dubbings.length})
              </h4>
              <div className="space-y-2">
                {currentClip.dubbings.map(dubbing => (
                  <div key={dubbing.id} className="text-sm">
                    <p className="line-clamp-2">{dubbing.text || '无文本'}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatTime(dubbing.duration || 0)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <Separator />

        <div>
          <h4 className="mb-2 text-xs text-muted-foreground">分镜列表 ({clips.length})</h4>
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {clips.map((clip, index) => (
              <button
                key={clip.id}
                onClick={() => onSelectClip(index)}
                className={cn(
                  'w-full rounded px-2 py-1.5 text-left text-xs transition-colors',
                  currentClipIndex === index
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] opacity-60">{index + 1}</span>
                  <span className="flex-1 truncate">{clip.storyboard.name}</span>
                  <span className="font-mono text-[10px] opacity-60">
                    {formatTime(clip.duration)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
