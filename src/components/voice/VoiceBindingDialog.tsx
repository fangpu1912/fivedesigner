import { useState, useEffect, useCallback } from 'react'

import { Link2, User, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useAllCharacters, useUpdateCharacter } from '@/hooks/useCharacters'
import type { Voice } from '@/types/voice'

interface VoiceBindingDialogProps {
  voice: Voice
  isOpen: boolean
  onClose: () => void
  onBindingChange?: () => void
}

export function VoiceBindingDialog({
  voice,
  isOpen,
  onClose,
  onBindingChange,
}: VoiceBindingDialogProps) {
  const { data: allCharacters = [] } = useAllCharacters()
  const updateCharacter = useUpdateCharacter()
  const [boundCharacters, setBoundCharacters] = useState<string[]>([])
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      const bound = allCharacters.filter(c => c.default_voice_id === voice.id).map(c => c.id)
      setBoundCharacters(bound)
    }
  }, [isOpen, voice.id, allCharacters])

  // 绑定角色
  const handleBind = useCallback(async () => {
    if (!selectedCharacterId) return

    setIsLoading(true)
    try {
      await updateCharacter.mutateAsync({ id: selectedCharacterId, data: { default_voice_id: voice.id } })

      setBoundCharacters(prev => [...prev, selectedCharacterId])
      setSelectedCharacterId('')
      onBindingChange?.()
    } catch (error) {
      console.error('绑定角色失败:', error)
    } finally {
      setIsLoading(false)
    }
  }, [selectedCharacterId, voice.id, onBindingChange, updateCharacter])

  // 解绑角色
  const handleUnbind = useCallback(
    async (characterId: string) => {
      setIsLoading(true)
      try {
        await updateCharacter.mutateAsync({ id: characterId, data: { default_voice_id: undefined } })

        setBoundCharacters(prev => prev.filter(id => id !== characterId))
        onBindingChange?.()
      } catch (error) {
        console.error('解绑角色失败:', error)
      } finally {
        setIsLoading(false)
      }
    },
    [onBindingChange, updateCharacter]
  )

  // 获取未绑定的角色
  const unboundCharacters = allCharacters.filter(
    c => !boundCharacters.includes(c.id) && c.id !== selectedCharacterId
  )

  const boundCharacterDetails = allCharacters.filter(c => boundCharacters.includes(c.id))

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            绑定角色
          </DialogTitle>
          <DialogDescription>将音色 "{voice.name}" 绑定到角色</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 已绑定的角色 */}
          {boundCharacterDetails.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">已绑定的角色</h4>
              <div className="flex flex-wrap gap-2">
                {boundCharacterDetails.map(character => (
                  <Badge
                    key={character.id}
                    variant="secondary"
                    className="flex items-center gap-1 px-2 py-1"
                  >
                    <User className="h-3 w-3" />
                    {character.name}
                    <button
                      onClick={() => handleUnbind(character.id)}
                      disabled={isLoading}
                      className="ml-1 hover:text-destructive transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* 绑定新角色 */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">绑定新角色</h4>
            <div className="flex gap-2">
              <select
                value={selectedCharacterId}
                onChange={e => setSelectedCharacterId(e.target.value)}
                className="flex-1 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">选择角色...</option>
                {unboundCharacters.length === 0 ? (
                  <option value="" disabled>
                    没有可绑定的角色
                  </option>
                ) : (
                  unboundCharacters.map(character => (
                    <option key={character.id} value={character.id}>
                      {character.name}
                    </option>
                  ))
                )}
              </select>
              <Button onClick={handleBind} disabled={!selectedCharacterId || isLoading} size="sm">
                <Link2 className="h-4 w-4 mr-1" />
                绑定
              </Button>
            </div>
          </div>

          {/* 提示信息 */}
          <div className="text-xs text-muted-foreground bg-muted rounded-lg p-3">
            <p>• 一个音色可以绑定多个角色</p>
            <p>• 绑定后，该角色将使用此音色进行配音</p>
            <p>• 解绑后，角色将恢复使用默认音色</p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
