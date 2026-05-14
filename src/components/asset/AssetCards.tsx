import { useEffect, useState } from 'react'

import { convertFileSrc } from '@tauri-apps/api/core'
import { Box, Mountain, Trash2, User } from 'lucide-react'

import { ClickableImage } from '@/components/media/ClickableImage'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Character, Prop, Scene } from '@/types'

interface SceneCardProps {
  scene: Scene
  onDelete: (id: string) => void
  onClick?: () => void
}

interface PropCardProps {
  prop: Prop
  onDelete: (id: string) => void
  onClick?: () => void
}

interface CharacterCardProps {
  character: Character
  onDelete: (id: string) => void
  onClick?: () => void
  allCharacters?: Character[]
}

function resolveMediaUrl(path?: string | null) {
  if (!path) return null
  if (path.startsWith('http') || path.startsWith('data:')) return path
  return convertFileSrc(path)
}

export function SceneCard({ scene, onDelete, onClick }: SceneCardProps) {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)

  useEffect(() => {
    setMediaUrl(resolveMediaUrl(scene.image))
  }, [scene])

  return (
    <Card className="overflow-hidden transition-all hover:ring-2 hover:ring-primary/20">
      <div className="aspect-square bg-muted flex items-center justify-center">
        {mediaUrl ? (
          <ClickableImage
            src={mediaUrl}
            alt={scene.name}
            title={scene.name}
            aspectRatio="square"
            showHoverEffect
          />
        ) : (
          <Mountain className="w-8 h-8 text-muted-foreground" />
        )}
      </div>
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-sm font-medium truncate cursor-pointer hover:text-primary"
            onClick={onClick}
          >
            {scene.name}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive"
            onClick={event => {
              event.stopPropagation()
              event.preventDefault()
              onDelete(scene.id)
            }}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function PropCard({ prop, onDelete, onClick }: PropCardProps) {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)

  useEffect(() => {
    setMediaUrl(resolveMediaUrl(prop.image))
  }, [prop])

  return (
    <Card className="overflow-hidden transition-all hover:ring-2 hover:ring-primary/20">
      <div className="aspect-square bg-muted flex items-center justify-center">
        {mediaUrl ? (
          <ClickableImage
            src={mediaUrl}
            alt={prop.name}
            title={prop.name}
            aspectRatio="square"
            showHoverEffect
          />
        ) : (
          <Box className="w-8 h-8 text-muted-foreground" />
        )}
      </div>
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-sm font-medium truncate cursor-pointer hover:text-primary"
            onClick={onClick}
          >
            {prop.name}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive"
            onClick={event => {
              event.stopPropagation()
              event.preventDefault()
              onDelete(prop.id)
            }}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function CharacterCard({ character, onDelete, onClick, allCharacters }: CharacterCardProps) {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  let historyCount = 0

  try {
    if (character.description) {
      const parsed = JSON.parse(character.description) as { imageHistory?: string[] }
      historyCount = parsed.imageHistory?.length || 0
    }
  } catch {
    historyCount = 0
  }

  useEffect(() => {
    setMediaUrl(resolveMediaUrl(character.image))
  }, [character])

  const getAllImages = () => {
    if (!allCharacters || allCharacters.length === 0) return mediaUrl ? [mediaUrl] : []

    return allCharacters.map(item => resolveMediaUrl(item.image)).filter(Boolean) as string[]
  }

  const getCurrentIndex = () => {
    const images = getAllImages()
    return mediaUrl ? images.indexOf(mediaUrl) : 0
  }

  return (
    <Card className="overflow-hidden transition-all hover:ring-2 hover:ring-primary/20">
      <div className="aspect-square bg-muted flex items-center justify-center relative">
        {mediaUrl ? (
          <ClickableImage
            src={mediaUrl}
            alt={character.name}
            title={character.name}
            aspectRatio="square"
            showHoverEffect
            images={getAllImages()}
            currentIndex={getCurrentIndex()}
          />
        ) : (
          <User className="w-8 h-8 text-muted-foreground" />
        )}
        {historyCount > 0 && (
          <div className="absolute top-2 right-2 rounded bg-primary px-2 py-1 text-xs text-primary-foreground">
            {historyCount} 图
          </div>
        )}
      </div>
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-sm font-medium truncate cursor-pointer hover:text-primary"
            onClick={onClick}
          >
            {character.name}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive"
            onClick={event => {
              event.stopPropagation()
              event.preventDefault()
              onDelete(character.id)
            }}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
