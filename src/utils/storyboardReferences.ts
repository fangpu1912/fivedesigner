import { characterDB, sceneDB, propDB, storyboardDB } from '@/db'
import { getImageUrl } from '@/utils/asset'
import type { Storyboard, Character, Scene, Prop } from '@/types'

export interface CollectedReference {
  url: string
  type: 'character' | 'scene' | 'prop'
  id: string
  name: string
  hasImage: boolean
}

export async function collectStoryboardReferences(
  storyboard: Storyboard,
): Promise<CollectedReference[]> {
  const refs: CollectedReference[] = []
  const seenUrls = new Set<string>()

  const addRef = (ref: CollectedReference) => {
    if (ref.url && seenUrls.has(ref.url)) return
    if (ref.url) seenUrls.add(ref.url)
    refs.push(ref)
  }

  if (storyboard.scene_id) {
    try {
      const scene = await sceneDB.getById(storyboard.scene_id)
      if (scene) {
        const url = scene.image ? (getImageUrl(scene.image) || scene.image) : ''
        addRef({
          url,
          type: 'scene',
          id: scene.id,
          name: scene.name,
          hasImage: !!scene.image,
        })
      }
    } catch {}
  }

  if (storyboard.character_ids && storyboard.character_ids.length > 0) {
    for (const charId of storyboard.character_ids) {
      try {
        const character = await characterDB.getById(charId)
        if (character) {
          const url = character.image ? (getImageUrl(character.image) || character.image) : ''
          addRef({
            url,
            type: 'character',
            id: character.id,
            name: character.name,
            hasImage: !!character.image,
          })
        }
      } catch {}
    }
  }

  if (storyboard.prop_ids && storyboard.prop_ids.length > 0) {
    for (const propId of storyboard.prop_ids) {
      try {
        const prop = await propDB.getById(propId)
        if (prop) {
          const url = prop.image ? (getImageUrl(prop.image) || prop.image) : ''
          addRef({
            url,
            type: 'prop',
            id: prop.id,
            name: prop.name,
            hasImage: !!prop.image,
          })
        }
      } catch {}
    }
  }

  return refs
}

export function getReferenceImageUrls(refs: CollectedReference[]): string[] {
  return refs.filter(r => r.hasImage && r.url).map(r => r.url)
}

export function getPlaceholderRefs(refs: CollectedReference[]): CollectedReference[] {
  return refs.filter(r => !r.hasImage)
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s\-_·•]/g, '')
}

function isNameMatch(a: string, b: string): boolean {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) return true
  return false
}

export interface AssetMatchResult {
  characterMap: Map<string, string>
  sceneMap: Map<string, string>
  propMap: Map<string, string>
  unmatchedCharacters: string[]
  unmatchedScenes: string[]
  unmatchedProps: string[]
}

export async function matchAssetsByName(
  episodeId: string,
  characterNames: string[],
  sceneNames: string[],
  propNames: string[],
): Promise<AssetMatchResult> {
  const characterMap = new Map<string, string>()
  const sceneMap = new Map<string, string>()
  const propMap = new Map<string, string>()
  const unmatchedCharacters: string[] = []
  const unmatchedScenes: string[] = []
  const unmatchedProps: string[] = []

  let existingCharacters: Character[] = []
  let existingScenes: Scene[] = []
  let existingProps: Prop[] = []

  try {
    existingCharacters = await characterDB.getByEpisode(episodeId)
  } catch {}
  try {
    existingScenes = await sceneDB.getByEpisode(episodeId)
  } catch {}
  try {
    existingProps = await propDB.getByEpisode(episodeId)
  } catch {}

  const matchedCharIds = new Set<string>()
  for (const name of characterNames) {
    let matched = false
    for (const char of existingCharacters) {
      if (matchedCharIds.has(char.id)) continue
      if (isNameMatch(name, char.name)) {
        characterMap.set(name, char.id)
        matchedCharIds.add(char.id)
        matched = true
        break
      }
    }
    if (!matched) {
      unmatchedCharacters.push(name)
    }
  }

  const matchedSceneIds = new Set<string>()
  for (const name of sceneNames) {
    let matched = false
    for (const scene of existingScenes) {
      if (matchedSceneIds.has(scene.id)) continue
      if (isNameMatch(name, scene.name)) {
        sceneMap.set(name, scene.id)
        matchedSceneIds.add(scene.id)
        matched = true
        break
      }
    }
    if (!matched) {
      unmatchedScenes.push(name)
    }
  }

  const matchedPropIds = new Set<string>()
  for (const name of propNames) {
    let matched = false
    for (const prop of existingProps) {
      if (matchedPropIds.has(prop.id)) continue
      if (isNameMatch(name, prop.name)) {
        propMap.set(name, prop.id)
        matchedPropIds.add(prop.id)
        matched = true
        break
      }
    }
    if (!matched) {
      unmatchedProps.push(name)
    }
  }

  return {
    characterMap,
    sceneMap,
    propMap,
    unmatchedCharacters,
    unmatchedScenes,
    unmatchedProps,
  }
}

export async function updateStoryboardRefImages(
  assetType: 'character' | 'scene' | 'prop',
  assetId: string,
  _imageUrl: string,
  episodeId: string,
): Promise<number> {
  let storyboards: Storyboard[] = []
  try {
    storyboards = await storyboardDB.getAll(episodeId)
  } catch {
    return 0
  }

  let updatedCount = 0

  for (const sb of storyboards) {
    let needsUpdate = false

    if (assetType === 'character' && sb.character_ids?.includes(assetId)) {
      needsUpdate = true
    } else if (assetType === 'scene' && sb.scene_id === assetId) {
      needsUpdate = true
    } else if (assetType === 'prop' && sb.prop_ids?.includes(assetId)) {
      needsUpdate = true
    }

    if (needsUpdate) {
      try {
        const refs = await collectStoryboardReferences(sb)
        const refImageUrls = getReferenceImageUrls(refs)
        const existingImageRefs = sb.reference_images || []
        const merged = [...new Set([...refImageUrls, ...existingImageRefs])]
        const filtered = merged.filter(url => url !== sb.image)

        await storyboardDB.update(sb.id, {
          reference_images: filtered,
        })
        updatedCount++
      } catch {}
    }
  }

  return updatedCount
}
