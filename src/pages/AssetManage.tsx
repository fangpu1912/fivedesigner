import { AssetManagerPanel } from '@/components/asset/AssetManagerPanel'
import { useUIStore } from '@/store/useUIStore'

export function AssetManage() {
  const { currentProjectId, currentEpisodeId } = useUIStore()

  return (
    <AssetManagerPanel
      projectId={currentProjectId || undefined}
      episodeId={currentEpisodeId || undefined}
    />
  )
}
