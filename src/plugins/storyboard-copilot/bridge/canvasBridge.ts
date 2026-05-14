export { bridgeEvents } from './bridgeEvents'
export type {
  BridgeEventType,
  AssetType,
  AssetEventPayload,
  CanvasNodeEventPayload,
  CanvasEdgeEventPayload,
  GenerationEventPayload,
  CanvasSelectionPayload,
  CanvasViewportPayload,
  BridgeEventPayload,
} from './bridgeEvents'

export { assetOps } from './assetOps'

export { canvasOps } from './canvasOps'

import { bridgeEvents, type AssetEventPayload } from './bridgeEvents'
import { assetOps } from './assetOps'
import { canvasOps } from './canvasOps'
import { queryClient } from '@/providers/QueryProvider'
import { storyboardKeys } from '@/hooks/useStoryboards'
import { dubbingKeys } from '@/hooks/useDubbing'
import { characterKeys } from '@/hooks/useCharacters'
import { sceneKeys, propKeys } from '@/hooks/useAssetManager'

function invalidateAllAssetQueries() {
  queryClient.invalidateQueries({ queryKey: storyboardKeys.lists() })
  queryClient.invalidateQueries({ queryKey: characterKeys.all })
  queryClient.invalidateQueries({ queryKey: dubbingKeys.all })
  queryClient.invalidateQueries({ queryKey: sceneKeys.all })
  queryClient.invalidateQueries({ queryKey: propKeys.all })
}

bridgeEvents.on<AssetEventPayload>('asset:updated', (payload) => {
  if (payload.episodeId) {
    switch (payload.type) {
      case 'storyboard':
        queryClient.invalidateQueries({ queryKey: storyboardKeys.list(payload.episodeId) })
        break
      case 'dubbing':
        queryClient.invalidateQueries({ queryKey: dubbingKeys.byEpisode(payload.episodeId) })
        break
      case 'character':
        queryClient.invalidateQueries({ queryKey: characterKeys.byEpisode(payload.episodeId) })
        break
      case 'scene':
        queryClient.invalidateQueries({ queryKey: sceneKeys.byEpisode(payload.episodeId) })
        break
      case 'prop':
        queryClient.invalidateQueries({ queryKey: propKeys.byEpisode(payload.episodeId) })
        break
    }
  }
})

bridgeEvents.on<AssetEventPayload>('asset:created', (payload) => {
  if (payload.episodeId) {
    switch (payload.type) {
      case 'storyboard':
        queryClient.invalidateQueries({ queryKey: storyboardKeys.list(payload.episodeId) })
        break
      case 'dubbing':
        queryClient.invalidateQueries({ queryKey: dubbingKeys.byEpisode(payload.episodeId) })
        break
      case 'character':
        queryClient.invalidateQueries({ queryKey: characterKeys.byEpisode(payload.episodeId) })
        break
      case 'scene':
        queryClient.invalidateQueries({ queryKey: sceneKeys.byEpisode(payload.episodeId) })
        break
      case 'prop':
        queryClient.invalidateQueries({ queryKey: propKeys.byEpisode(payload.episodeId) })
        break
    }
  }
})

bridgeEvents.on<AssetEventPayload>('asset:deleted', () => {
  invalidateAllAssetQueries()
})

export const canvasBridge = {
  events: bridgeEvents,
  assetOps,
  canvasOps,
  invalidateAllAssetQueries,
}
