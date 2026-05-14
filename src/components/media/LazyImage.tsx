import { useState, useEffect, useRef } from 'react'

import { Image as ImageIcon, AlertCircle } from 'lucide-react'

import { cn } from '@/lib/utils'

interface LazyImageProps {
  src: string
  alt?: string
  placeholder?: string
  className?: string
  onClick?: () => void
}

export function LazyImage({ src, alt, placeholder, className, onClick }: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [isInView, setIsInView] = useState(false)
  const [hasError, setHasError] = useState(false)
  const imgRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsInView(true)
          observer.disconnect()
        }
      },
      {
        rootMargin: '100px',
        threshold: 0.01,
      }
    )

    if (imgRef.current) {
      observer.observe(imgRef.current)
    }

    return () => {
      observer.disconnect()
    }
  }, [])

  const handleLoad = () => {
    setIsLoaded(true)
    setHasError(false)
  }

  const handleError = () => {
    setHasError(true)
    setIsLoaded(false)
  }

  return (
    <div
      ref={imgRef}
      onClick={onClick}
      className={cn(
        'relative overflow-hidden bg-secondary',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {placeholder && !isLoaded && !hasError && (
        <img
          src={placeholder}
          alt={alt}
          className="absolute inset-0 w-full h-full object-cover blur-sm scale-110"
        />
      )}

      {!isLoaded && !hasError && !placeholder && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-pulse">
            <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
          </div>
        </div>
      )}

      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <AlertCircle className="h-8 w-8" />
            <span className="text-sm">加载失败</span>
          </div>
        </div>
      )}

      {isInView && !hasError && (
        <img
          src={src}
          alt={alt}
          onLoad={handleLoad}
          onError={handleError}
          className={cn(
            'w-full h-full object-cover transition-opacity duration-300',
            isLoaded ? 'opacity-100' : 'opacity-0'
          )}
        />
      )}

      {isLoaded && <div className="absolute inset-0 bg-transparent" />}
    </div>
  )
}
