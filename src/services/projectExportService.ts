import JSZip from 'jszip'
import { save } from '@tauri-apps/plugin-dialog'
import { readFile, writeFile, mkdir } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import {
  projectDB, episodeDB, characterDB, sceneDB, propDB,
  storyboardDB, dubbingDB, scriptDB, workflowDB, canvasDB,
} from '@/db'
import type { Project, Episode, Character, Scene, Prop, Storyboard, Dubbing, Script, WorkflowConfig } from '@/types'
import logger from '@/utils/logger'

export interface ProjectExportData {
  version: string
  exportedAt: string
  project: Project
  episodes: Episode[]
  characters: Character[]
  scenes: Scene[]
  props: Prop[]
  storyboards: Storyboard[]
  dubbings: Dubbing[]
  scripts: Script[]
  workflows: WorkflowConfig[]
  canvases: Array<{ episode_id: string; nodes: unknown[]; edges: unknown[]; version?: string }>
}

export interface ExportManifest {
  version: string
  exportedAt: string
  projectId: string
  projectName: string
  assetFiles: string[]
}

async function collectProjectData(projectId: string) {
  const episodes = await episodeDB.getByProject(projectId)
  const episodeIds = episodes.map(e => e.id)

  const characters = await characterDB.getByProject(projectId)
  const scenes = await sceneDB.getByProject(projectId)
  const props = await propDB.getByProject(projectId)

  const storyboards: Storyboard[] = []
  const dubbings: Dubbing[] = []
  const scripts: Script[] = []
  const canvases: ProjectExportData['canvases'] = []

  for (const episodeId of episodeIds) {
    const sb = await storyboardDB.getAll(episodeId)
    storyboards.push(...sb)

    const db = await dubbingDB.getByEpisode(episodeId)
    dubbings.push(...db)

    const sc = await scriptDB.getByEpisode(episodeId)
    if (sc) scripts.push(sc)

    const cv = await canvasDB.getByEpisode(episodeId)
    if (cv) canvases.push({ episode_id: episodeId, ...cv })
  }

  const workflows = await workflowDB.getAll()

  return { episodes, characters, scenes, props, storyboards, dubbings, scripts, workflows, canvases }
}

export async function exportProjectToZip(projectId: string): Promise<boolean> {
  const project = await projectDB.getById(projectId)
  if (!project) throw new Error('项目不存在')

  const data = await collectProjectData(projectId)

  const exportData: ProjectExportData = {
    version: '1.0.3',
    exportedAt: new Date().toISOString(),
    project,
    ...data,
  }

  const zip = new JSZip()
  zip.file('data.json', JSON.stringify(exportData, null, 2))

  const assetPaths = new Set<string>()
  const addAssetPath = (path: string | null | undefined) => {
    if (path && !path.startsWith('http') && !path.startsWith('data:')) {
      assetPaths.add(path)
    }
  }

  data.characters.forEach(c => addAssetPath(c.image))
  data.scenes.forEach(s => addAssetPath(s.image))
  data.props.forEach(p => addAssetPath(p.image))
  data.storyboards.forEach(s => {
    addAssetPath(s.image)
    addAssetPath(s.video)
  })
  data.dubbings.forEach(d => addAssetPath(d.audio_url))

  const manifest: ExportManifest = {
    version: '1.0.3',
    exportedAt: new Date().toISOString(),
    projectId,
    projectName: project.name,
    assetFiles: [],
  }

  for (const assetPath of assetPaths) {
    try {
      const fileData = await readFile(assetPath)
      const fileName = assetPath.split(/[/\\]/).pop() || 'file'
      zip.file(`assets/${fileName}`, fileData)
      manifest.assetFiles.push(fileName)
    } catch (error) {
      logger.warn(`无法读取资产文件: ${assetPath}`, error)
    }
  }

  zip.file('manifest.json', JSON.stringify(manifest, null, 2))

  const zipUint8Array = await zip.generateAsync({ type: 'uint8array' })

  const savePath = await save({
    defaultPath: `${project.name}_${new Date().toISOString().split('T')[0]}.zip`,
    filters: [{ name: 'ZIP 文件', extensions: ['zip'] }],
    title: '导出项目',
  })

  if (savePath) {
    await writeFile(savePath, zipUint8Array)
    logger.info(`项目导出成功: ${savePath}`)
    return true
  }
  return false
}

export async function importProjectFromZip(zipData: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(zipData)

  const dataFile = zip.file('data.json')
  if (!dataFile) throw new Error('无效的导出文件：缺少 data.json')

  const dataContent = await dataFile.async('string')
  const exportData: ProjectExportData = JSON.parse(dataContent)

  if (!exportData.version) {
    logger.warn('导入的文件没有版本号，尝试兼容导入')
  }

  const { id: _projectId, created_at: _pc, updated_at: _pu, ...projectData } = exportData.project
  const newProject = await projectDB.create({
    ...projectData,
    name: `${exportData.project.name} (导入)`,
  })

  const newProjectId = newProject.id
  const idMapping: Record<string, string> = {}

  for (const episode of exportData.episodes) {
    const oldId = episode.id
    const { id: _eid, created_at: _ec, updated_at: _eu, ...episodeData } = episode
    const newEpisode = await episodeDB.create({
      ...episodeData,
      project_id: newProjectId,
    })
    idMapping[oldId] = newEpisode.id
  }

  for (const character of exportData.characters) {
    const oldId = character.id
    const { id: _cid, created_at: _cc, updated_at: _cu, ...characterData } = character
    const newCharacter = await characterDB.create({
      ...characterData,
      project_id: newProjectId,
    })
    idMapping[oldId] = newCharacter.id
  }

  for (const scene of exportData.scenes) {
    const oldId = scene.id
    const { id: _sid, created_at: _sc, updated_at: _su, ...sceneData } = scene
    const newScene = await sceneDB.create({
      ...sceneData,
      project_id: newProjectId,
    })
    idMapping[oldId] = newScene.id
  }

  for (const prop of exportData.props) {
    const oldId = prop.id
    const { id: _pid, created_at: _prc, updated_at: _pru, ...propData } = prop
    const newProp = await propDB.create({
      ...propData,
      project_id: newProjectId,
    })
    idMapping[oldId] = newProp.id
  }

  for (const storyboard of exportData.storyboards) {
    const { id: _sbid, created_at: _sbc, updated_at: _sbu, ...storyboardData } = storyboard
    await storyboardDB.create({
      ...storyboardData,
      episode_id: idMapping[storyboard.episode_id] || storyboard.episode_id,
      character_ids: storyboard.character_ids?.map(id => idMapping[id] || id),
      prop_ids: storyboard.prop_ids?.map(id => idMapping[id] || id),
    })
  }

  for (const dubbing of exportData.dubbings) {
    const { id: _did, created_at: _dc, updated_at: _du, ...dubbingData } = dubbing
    await dubbingDB.create({
      ...dubbingData,
      ...(dubbing.episode_id ? { episode_id: idMapping[dubbing.episode_id] || dubbing.episode_id } : {}),
    })
  }

  for (const script of exportData.scripts) {
    const { id: _scrid, created_at: _scrc, updated_at: _scru, ...scriptData } = script
    await scriptDB.create({
      ...scriptData,
      episode_id: idMapping[script.episode_id] || script.episode_id,
    })
  }

  for (const workflow of exportData.workflows) {
    await workflowDB.save({
      ...workflow,
    })
  }

  for (const canvas of exportData.canvases) {
    await canvasDB.save(
      idMapping[canvas.episode_id] || canvas.episode_id,
      canvas.nodes,
      canvas.edges,
      canvas.version
    )
  }

  const manifestFile = zip.file('manifest.json')
  if (manifestFile) {
    const manifestContent = await manifestFile.async('string')
    const manifest: ExportManifest = JSON.parse(manifestContent)

    for (const assetFileName of manifest.assetFiles) {
      const assetFile = zip.file(`assets/${assetFileName}`)
      if (assetFile) {
        const fileData = await assetFile.async('uint8array')
        try {
          const workspaceService = (await import('@/services/workspace/WorkspaceService')).WorkspaceService.getInstance()
          const workspaceDir = await workspaceService.getWorkspacePath()
          const assetDir = await join(workspaceDir, 'imported_assets', newProjectId)
          await mkdir(assetDir, { recursive: true })
          const assetPath = await join(assetDir, assetFileName)
          await writeFile(assetPath, fileData)
        } catch (error) {
          logger.warn(`无法保存资产文件: ${assetFileName}`, error)
        }
      }
    }
  }

  logger.info(`项目导入成功: ${newProjectId}`)
  return newProjectId
}

export async function exportProjectAsJSON(project: Project): Promise<boolean> {
  const data = await collectProjectData(project.id)

  const exportData: ProjectExportData = {
    version: '1.0.3',
    exportedAt: new Date().toISOString(),
    project,
    ...data,
  }

  const savePath = await save({
    defaultPath: `${project.name}_${new Date().toISOString().split('T')[0]}.json`,
    filters: [{ name: 'JSON 文件', extensions: ['json'] }],
    title: '导出项目为 JSON',
  })

  if (savePath) {
    const encoder = new TextEncoder()
    await writeFile(savePath, encoder.encode(JSON.stringify(exportData, null, 2)))
    logger.info(`项目 JSON 导出成功: ${savePath}`)
    return true
  }
  return false
}

export async function exportProjectAsArchive(project: Project): Promise<boolean> {
  return await exportProjectToZip(project.id)
}
