import { Play, Pause, Volume2, VolumeX } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'

interface SamplePlayerSidebarProps {
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  isMuted: boolean
  onPlayPause: () => void
  onSeek: (time: number) => void
  onVolumeChange: (volume: number) => void
  onToggleMute: () => void
}

export function SamplePlayerSidebar({
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  onPlayPause,
  onSeek,
  onVolumeChange,
  onToggleMute,
}: SamplePlayerSidebarProps) {
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  return (
    <div className="w-80 border-l bg-background p-4 flex flex-col gap-4">
      <div className="font-medium">播放控制</div>

      <Separator />

      {/* 播放按钮 */}
      <div className="flex items-center justify-center gap-2">
        <Button variant="outline" size="icon" onClick={onPlayPause} className="h-12 w-12">
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </Button>
      </div>

      <Separator />

      {/* 进度控制 */}
      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">进度</div>
        <Slider
          value={[currentTime]}
          max={duration || 100}
          step={0.1}
          onValueChange={([value]) => onSeek(value ?? 0)}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <Separator />

      {/* 音量控制 */}
      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">音量</div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleMute}>
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
          <Slider
            value={[isMuted ? 0 : volume]}
            max={100}
            step={1}
            onValueChange={([value]) => onVolumeChange(value ?? 0)}
            className="flex-1"
          />
        </div>
      </div>
    </div>
  )
}
