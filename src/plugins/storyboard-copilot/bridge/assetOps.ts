import { queryClient } from '@/providers/QueryProvider'
import {
  characterDB,
  sceneDB,
  propDB,
  storyboardDB,
  dubbingDB,
} from '@/db'
import {
  storyboardKeys,
} from '@/hooks/useStoryboards'
import {
  dubbingKeys,
} from '@/hooks/useDubbing'
import {
  characterKeys,
} from '@/hooks/useCharacters'
import {
  sceneKeys,
  propKeys,
} from '@/hooks/useAssetManager'

import { bridgeEvents, type AssetType } from './bridgeEvents'

function invalidateAssetQueries(
  assetType: AssetType,
  projectId?: string,
  episodeId?: string
) {
  switch (assetType) {
    case 'storyboard':
      queryClient.invalidateQueries({ queryKey: storyboardKeys.lists() })
      if (episodeId) {
        queryClient.invalidateQueries({ queryKey: storyboardKeys.list(episodeId) })
      }
      break
    case 'character':
      queryClient.invalidateQueries({ queryKey: characterKeys.all })
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: characterKeys.list(projectId) })
      }
      if (episodeId) {
        queryClient.invalidateQueries({ queryKey: characterKeys.byEpisode(episodeId) })
      }
      break
    case 'scene':
      queryClient.invalidateQueries({ queryKey: sceneKeys.all })
      if (episodeId) {
        queryClient.invalidateQueries({ queryKey: sceneKeys.byEpisode(episodeId) })
      }
      break
    case 'prop':
      queryClient.invalidateQueries({ queryKey: propKeys.all })
      if (episodeId) {
        queryClient.invalidateQueries({ queryKey: propKeys.byEpisode(episodeId) })
      }
      break
    case 'dubbing':
      queryClient.invalidateQueries({ queryKey: dubbingKeys.all })
      if (episodeId) {
        queryClient.invalidateQueries({ queryKey: dubbingKeys.byEpisode(episodeId) })
      }
      break
  }
}

export const assetOps = {
  async updateStoryboardImage(
    id: string,
    imagePath: string,
    episodeId: string
  ) {
    await storyboardDB.update(id, { image: imagePath })
    invalidateAssetQueries('storyboard', undefined, episodeId)
    bridgeEvents.emit('asset:updated', {
      type: 'storyboard',
      ids: [id],
      episodeId,
      field: 'image',
      value: imagePath,
    })
  },

  async updateStoryboardVideo(
    id: string,
    videoPath: string,
    episodeId: string
  ) {
    await storyboardDB.update(id, { video: videoPath })
    invalidateAssetQueries('storyboard', undefined, episodeId)
    bridgeEvents.emit('asset:updated', {
      type: 'storyboard',
      ids: [id],
      episodeId,
      field: 'video',
      value: videoPath,
    })
  },

  async updateCharacterImage(
    id: string,
    imagePath: string,
    projectId: string,
    episodeId?: string
  ) {
    await characterDB.update(id, { image: imagePath })
    invalidateAssetQueries('character', projectId, episodeId)
    bridgeEvents.emit('asset:updated', {
      type: 'character',
      ids: [id],
      projectId,
      episodeId,
      field: 'image',
      value: imagePath,
    })
  },

  async updateSceneImage(
    id: string,
    imagePath: string,
    episodeId?: string
  ) {
    await sceneDB.update(id, { image: imagePath })
    invalidateAssetQueries('scene', undefined, episodeId)
    bridgeEvents.emit('asset:updated', {
      type: 'scene',
      ids: [id],
      episodeId,
      field: 'image',
      value: imagePath,
    })
  },

  async updatePropImage(
    id: string,
    imagePath: string,
    episodeId?: string
  ) {
    await propDB.update(id, { image: imagePath })
    invalidateAssetQueries('prop', undefined, episodeId)
    bridgeEvents.emit('asset:updated', {
      type: 'prop',
      ids: [id],
      episodeId,
      field: 'image',
      value: imagePath,
    })
  },

  async updateAssetImage(
    assetType: AssetType,
    id: string,
    imagePath: string,
    opts: { projectId?: string; episodeId?: string }
  ) {
    switch (assetType) {
      case 'storyboard':
        await assetOps.updateStoryboardImage(id, imagePath, opts.episodeId || '')
        break
      case 'character':
        await assetOps.updateCharacterImage(id, imagePath, opts.projectId || '', opts.episodeId)
        break
      case 'scene':
        await assetOps.updateSceneImage(id, imagePath, opts.episodeId)
        break
      case 'prop':
        await assetOps.updatePropImage(id, imagePath, opts.episodeId)
        break
      default:
        break
    }
  },

  async createCharacters(
    items: Array<Omit<import('@/types').Character, 'id' | 'created_at' | 'updated_at'>>,
    projectId: string,
    episodeId?: string
  ) {
    const created = []
    for (const item of items) {
      const character = await characterDB.create(item)
      created.push(character)
    }
    invalidateAssetQueries('character', projectId, episodeId)
    bridgeEvents.emit('asset:created', {
      type: 'character',
      ids: created.map(c => c.id),
      projectId,
      episodeId,
    })
    return created
  },

  async createScenes(
    items: Array<Omit<import('@/types').Scene, 'id' | 'created_at' | 'updated_at'>>,
    episodeId?: string
  ) {
    const created = []
    for (const item of items) {
      const scene = await sceneDB.create(item)
      created.push(scene)
    }
    invalidateAssetQueries('scene', undefined, episodeId)
    bridgeEvents.emit('asset:created', {
      type: 'scene',
      ids: created.map(s => s.id),
      episodeId,
    })
    return created
  },

  async createProps(
    items: Array<Omit<import('@/types').Prop, 'id' | 'created_at' | 'updated_at'>>,
    episodeId?: string
  ) {
    const created = []
    for (const item of items) {
      const prop = await propDB.create(item)
      created.push(prop)
    }
    invalidateAssetQueries('prop', undefined, episodeId)
    bridgeEvents.emit('asset:created', {
      type: 'prop',
      ids: created.map(p => p.id),
      episodeId,
    })
    return created
  },

  async createStoryboards(
    items: Array<Parameters<typeof storyboardDB.create>[0]>,
    episodeId: string
  ) {
    const created = []
    for (const item of items) {
      const storyboard = await storyboardDB.create(item)
      created.push(storyboard)
    }
    invalidateAssetQueries('storyboard', undefined, episodeId)
    bridgeEvents.emit('asset:created', {
      type: 'storyboard',
      ids: created.map(s => s.id),
      episodeId,
    })
    return created
  },

  async createDubbings(
    items: Array<Parameters<typeof dubbingDB.create>[0]>,
    episodeId?: string
  ) {
    const created = []
    for (const item of items) {
      const dubbing = await dubbingDB.create(item)
      created.push(dubbing)
    }
    invalidateAssetQueries('dubbing', undefined, episodeId)
    bridgeEvents.emit('asset:created', {
      type: 'dubbing',
      ids: created.map(d => d.id),
      episodeId,
    })
    return created
  },

  async updateDubbingAudio(
    id: string,
    audioPath: string,
    episodeId?: string
  ) {
    await dubbingDB.update(id, { audio_url: audioPath, status: 'completed' })
    invalidateAssetQueries('dubbing', undefined, episodeId)
    bridgeEvents.emit('asset:updated', {
      type: 'dubbing',
      ids: [id],
      episodeId,
      field: 'audio_url',
      value: audioPath,
    })
  },

  async deleteAsset(
    assetType: AssetType,
    id: string,
    opts: { projectId?: string; episodeId?: string }
  ) {
    switch (assetType) {
      case 'storyboard':
        await storyboardDB.delete(id)
        break
      case 'character':
        await characterDB.delete(id)
        break
      case 'scene':
        await sceneDB.delete(id)
        break
      case 'prop':
        await propDB.delete(id)
        break
      case 'dubbing':
        await dubbingDB.delete(id)
        break
    }
    invalidateAssetQueries(assetType, opts.projectId, opts.episodeId)
    bridgeEvents.emit('asset:deleted', {
      type: assetType,
      ids: [id],
      ...opts,
    })
  },
}
