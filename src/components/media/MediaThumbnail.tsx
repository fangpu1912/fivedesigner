import { useEffect, useRef, useState } from 'react'
import { Video, Music } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getImageUrl, getVideoUrl } from '@/utils/asset'

export function isVideoMediaType(type: string): boolean {
  return type === 'video' || type === 'upload-video'
}

export function isAudioMediaType(type: string): boolean {
  return type === 'audio' || type === 'upload-audio'
}

interface VideoThumbnailProps {
  src: string
  alt?: string
  className?: string
  iconClassName?: string
}

export function VideoThumbnail({ src, className, iconClassName }: VideoThumbnailProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [captured, setCaptured] = useState(false)
  const [error, setError] = useState(false)

  const videoSrc = getVideoUrl(src) ?? src

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleLoaded = () => {
      try {
        video.currentTime = 0.1
      } catch {
        setError(true)
      }
    }

    const handleSeeked = () => {
      setCaptured(true)
    }

    const handleError = () => {
      setError(true)
    }

    video.addEventListener('loadeddata', handleLoaded)
    video.addEventListener('seeked', handleSeeked)
    video.addEventListener('error', handleError)

    return () => {
      video.removeEventListener('loadeddata', handleLoaded)
      video.removeEventListener('seeked', handleSeeked)
      video.removeEventListener('error', handleError)
    }
  }, [videoSrc])

  if (error) {
    return (
      <div className={cn('w-full h-full bg-muted flex items-center justify-center', className)}>
        <Video className={cn('w-6 h-6 text-muted-foreground', iconClassName)} />
      </div>
    )
  }

  return (
    <div className={cn('relative w-full h-full', className)}>
      <video
        ref={videoRef}
        src={videoSrc}
        className="w-full h-full object-cover"
        muted
        preload="metadata"
        playsInline
      />
      {!captured && (
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          <Video className={cn('w-6 h-6 text-muted-foreground animate-pulse', iconClassName)} />
        </div>
      )}
      <div className="absolute inset-0 bg-black/15 flex items-center justify-center pointer-events-none">
        <Video className={cn('w-5 h-5 text-white drop-shadow-md', iconClassName)} />
      </div>
    </div>
  )
}

interface AudioThumbnailProps {
  className?: string
  iconClassName?: string
}

export function AudioThumbnail({ className, iconClassName }: AudioThumbnailProps) {
  return (
    <div className={cn('w-full h-full bg-muted flex items-center justify-center', className)}>
      <Music className={cn('w-6 h-6 text-muted-foreground', iconClassName)} />
    </div>
  )
}

interface MediaThumbnailProps {
  url: string
  mediaType: 'image' | 'video' | 'audio'
  alt?: string
  className?: string
  iconClassName?: string
}

export function MediaThumbnail({ url, mediaType, alt = '', className, iconClassName }: MediaThumbnailProps) {
  if (mediaType === 'audio') {
    return <AudioThumbnail className={className} iconClassName={iconClassName} />
  }

  if (mediaType === 'video') {
    return <VideoThumbnail src={url} alt={alt} className={className} iconClassName={iconClassName} />
  }

  const imageSrc = getImageUrl(url) ?? url
  return <img src={imageSrc} alt={alt} className={cn('w-full h-full object-cover', className)} />
}
