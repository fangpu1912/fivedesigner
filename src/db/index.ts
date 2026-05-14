import Database from '@tauri-apps/plugin-sql'
import { v4 as uuidv4 } from 'uuid'

import type {
  Project,
  Episode,
  Script,
  Storyboard,
  Character,
  CharacterOutfit,
  Scene,
  Prop,
  Dubbing,
  WorkflowConfig,
  SampleProject,
  MediaAsset,
  GenerationTask,
  TaskLogEntry,
} from '@/types'
import { deleteMediaFile } from '@/utils/mediaStorage'
import { CREATE_TABLES_SQL } from '@/db/schema'

let dbInstance: Database | null = null

async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance
  dbInstance = await Database.load('sqlite:fivedesigner.db')
  return dbInstance
}

function parseJsonField<T>(value: unknown): T | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return undefined
    }
  }
  return value as T
}

function toJsonField(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return JSON.stringify(value)
}

function rowToProject(row: Record<string, unknown>): Project {
  return {
    ...row,
    custom_style: parseJsonField<Project['custom_style']>(row.custom_style),
  } as unknown as Project
}

function rowToStoryboard(row: Record<string, unknown>): Storyboard {
  return {
    ...row,
    character_ids: parseJsonField<string[]>(row.character_ids) || [],
    prop_ids: parseJsonField<string[]>(row.prop_ids) || [],
    reference_images: parseJsonField<string[]>(row.reference_images) || [],
    video_reference_images: parseJsonField<string[]>(row.video_reference_images) || [],
    metadata: parseJsonField<Record<string, unknown>>(row.metadata),
    duration: row.duration as number | undefined,
  } as unknown as Storyboard
}

function rowToCharacter(row: Record<string, unknown>): Character {
  return {
    ...row,
    tags: parseJsonField<string[]>(row.tags) || [],
    minimax_file_id: row.minimax_file_id as number | undefined,
  } as unknown as Character
}

function rowToScene(row: Record<string, unknown>): Scene {
  return {
    ...row,
    tags: parseJsonField<string[]>(row.tags) || [],
    metadata: parseJsonField<Record<string, unknown>>(row.metadata),
  } as unknown as Scene
}

function rowToProp(row: Record<string, unknown>): Prop {
  return {
    ...row,
    tags: parseJsonField<string[]>(row.tags) || [],
    metadata: parseJsonField<Record<string, unknown>>(row.metadata),
  } as unknown as Prop
}

function rowToScript(row: Record<string, unknown>): Script {
  return {
    ...row,
    extracted_assets: parseJsonField<Script['extracted_assets']>(row.extracted_assets),
    extracted_dubbing: parseJsonField<Script['extracted_dubbing']>(row.extracted_dubbing),
    extracted_shots: parseJsonField<Script['extracted_shots']>(row.extracted_shots),
  } as unknown as Script
}

function rowToDubbing(row: Record<string, unknown>): Dubbing {
  return {
    ...row,
    duration: row.duration as number | undefined,
    sequence: (row.sequence as number) ?? 0,
  } as unknown as Dubbing
}

function rowToWorkflow(row: Record<string, unknown>): WorkflowConfig {
  return {
    ...row,
    workflow: parseJsonField<Record<string, any>>(row.workflow) || {},
    nodes: parseJsonField<WorkflowConfig['nodes']>(row.nodes) || {},
    tags: parseJsonField<string[]>(row.tags) || [],
  } as unknown as WorkflowConfig
}

function rowToSampleProject(row: Record<string, unknown>): SampleProject {
  return {
    ...row,
    tracks: parseJsonField<SampleProject['tracks']>(row.tracks) || [],
  } as unknown as SampleProject
}

function rowToMediaAsset(row: Record<string, unknown>): MediaAsset {
  return {
    ...row,
    tags: parseJsonField<string[]>(row.tags) || [],
    width: row.width as number | undefined,
    height: row.height as number | undefined,
    file_size: row.file_size as number | undefined,
  } as unknown as MediaAsset
}

function rowToGenerationTask(row: Record<string, unknown>): GenerationTask {
  return {
    ...row,
    input_params: parseJsonField<Record<string, unknown>>(row.input_params),
    metadata: parseJsonField<Record<string, unknown>>(row.metadata),
    progress: (row.progress as number) ?? 0,
    retry_count: (row.retry_count as number) ?? 0,
    max_retries: (row.max_retries as number) ?? 1,
  } as unknown as GenerationTask
}

function rowToTaskLogEntry(row: Record<string, unknown>): TaskLogEntry {
  return {
    ...row,
    id: row.id as number,
    data: parseJsonField<Record<string, unknown>>(row.data),
  } as unknown as TaskLogEntry
}

class SQLiteDatabase {
  private initialized = false

  async initialize(): Promise<void> {
    if (this.initialized) return
    const db = await getDb()
    await db.execute(CREATE_TABLES_SQL)
    await db.execute('PRAGMA journal_mode=WAL')
    await db.execute('PRAGMA foreign_keys=ON')

    // Run migrations
    await this.runMigrations()

    this.initialized = true
  }

  // 通用 SQL 执行方法
  async execute(sql: string, params?: unknown[]): Promise<void> {
    await this.initialize()
    const db = await getDb()
    await db.execute(sql, params)
  }

  // 通用 SQL 查询方法
  async select<T>(sql: string, params?: unknown[]): Promise<T[]> {
    await this.initialize()
    const db = await getDb()
    return db.select<T[]>(sql, params)
  }

  private async runMigrations(): Promise<void> {
    const db = await getDb()
    
    try {
      const storyboardsTableInfo = await db.select<{ name: string; type: string }[]>("PRAGMA table_info(storyboards)")
      const hasVideoReferenceImages = storyboardsTableInfo.some(col => col.name === 'video_reference_images')
      
      if (!hasVideoReferenceImages) {
        try {
          await db.execute('ALTER TABLE storyboards ADD COLUMN video_reference_images TEXT')
        } catch (_alterError) {}
      }

      const charactersTableInfo = await db.select<{ name: string; type: string }[]>("PRAGMA table_info(characters)")
      const hasVoiceDescription = charactersTableInfo.some(col => col.name === 'voice_description')
      
      if (!hasVoiceDescription) {
        try {
          await db.execute('ALTER TABLE characters ADD COLUMN voice_description TEXT')
        } catch (_alterError) {}
      }

      try {
        await db.execute('CREATE INDEX IF NOT EXISTS idx_dubbings_character_id ON dubbings(character_id)')
        await db.execute('CREATE INDEX IF NOT EXISTS idx_analysis_tasks_file_path ON analysis_tasks(file_path)')
        await db.execute('CREATE INDEX IF NOT EXISTS idx_canvas_data_episode_id ON canvas_data(episode_id)')
      } catch (_indexError) {}
    } catch (_error) {}
  }

  // ==================== Projects ====================

  async getAllProjects(): Promise<Project[]> {
    await this.initialize()
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>('SELECT * FROM projects ORDER BY created_at DESC')
    return rows.map(rowToProject)
  }

  async getProjectById(id: string): Promise<Project | null> {
    await this.initialize()
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>('SELECT * FROM projects WHERE id = $1', [id])
    return rows.length > 0 ? rowToProject(rows[0]!) : null
  }

  async createProject(project: Omit<Project, 'id' | 'created_at' | 'updated_at'>): Promise<Project> {
    await this.initialize()
    const db = await getDb()
    const now = new Date().toISOString()
    const id = uuidv4()
    await db.execute(
      `INSERT INTO projects (id, name, description, aspect_ratio, visual_style, custom_style, cover_image, quality_prompt, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, project.name, project.description ?? null, project.aspect_ratio ?? null, project.visual_style ?? null,
       toJsonField(project.custom_style), project.cover_image ?? null, project.quality_prompt ?? null, now, now]
    )
    return { ...project, id, created_at: now, updated_at: now }
  }

  async updateProject(id: string, data: Partial<Project>): Promise<Project> {
    await this.initialize()
    const db = await getDb()
    const existing = await this.getProjectById(id)
    if (!existing) throw new Error('Project not found')

    const updated = { ...existing, ...data, updated_at: new Date().toISOString() }
    await db.execute(
      `UPDATE projects SET name = $1, description = $2, aspect_ratio = $3, visual_style = $4, custom_style = $5, cover_image = $6, quality_prompt = $7, updated_at = $8 WHERE id = $9`,
      [updated.name, updated.description ?? null, updated.aspect_ratio ?? null, updated.visual_style ?? null,
       toJsonField(updated.custom_style), updated.cover_image ?? null, updated.quality_prompt ?? null, updated.updated_at, id]
    )
    return updated
  }

  async deleteProject(id: string): Promise<void> {
    await this.initialize()
    const db = await getDb()

    const storyboards = await db.select<Record<string, unknown>[]>('SELECT image, video FROM storyboards WHERE project_id = $1', [id])
    for (const sb of storyboards) {
      if (sb.image && !String(sb.image).startsWith('http')) await deleteMediaFile(String(sb.image)).catch(() => {})
      if (sb.video && !String(sb.video).startsWith('http')) await deleteMediaFile(String(sb.video)).catch(() => {})
    }

    const characters = await db.select<Record<string, unknown>[]>('SELECT image FROM characters WHERE project_id = $1', [id])
    for (const c of characters) {
      if (c.image && !String(c.image).startsWith('http')) await deleteMediaFile(String(c.image)).catch(() => {})
    }

    const scenes = await db.select<Record<string, unknown>[]>('SELECT image FROM scenes WHERE project_id = $1', [id])
    for (const s of scenes) {
      if (s.image && !String(s.image).startsWith('http')) await deleteMediaFile(String(s.image)).catch(() => {})
    }

    const props = await db.select<Record<string, unknown>[]>('SELECT image FROM props WHERE project_id = $1', [id])
    for (const p of props) {
      if (p.image && !String(p.image).startsWith('http')) await deleteMediaFile(String(p.image)).catch(() => {})
    }

    const dubbings = await db.select<Record<string, unknown>[]>('SELECT audio_url FROM dubbings WHERE project_id = $1', [id])
    for (const d of dubbings) {
      if (d.audio_url && !String(d.audio_url).startsWith('http')) await deleteMediaFile(String(d.audio_url)).catch(() => {})
    }

    await db.execute('DELETE FROM projects WHERE id = $1', [id])
  }

  // ==================== Episodes ====================

  async getEpisodes(projectId: string): Promise<Episode[]> {
    await this.initialize()
    const db = await getDb()
    return db.select<Episode[]>('SELECT * FROM episodes WHERE project_id = $1 ORDER BY episode_number ASC, created_at ASC', [projectId])
  }

  async getEpisodeById(id: string): Promise<Episode | null> {
    await this.initialize()
    const db = await getDb()
    const rows = await db.select<Episode[]>('SELECT * FROM episodes WHERE id = $1', [id])
    return rows.length > 0 ? rows[0]! : null
  }

  async createEpisode(episode: Omit<Episode, 'id' | 'created_at' | 'updated_at'>): Promise<Episode> {
    await this.initialize()
    const db = await getDb()
    const now = new Date().toISOString()
    const id = uuidv4()
    await db.execute(
      `INSERT INTO episodes (id, project_id, name, description, episode_number, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, episode.project_id, episode.name, episode.description ?? null, episode.episode_number ?? null, now, now]
    )
    return { ...episode, id, created_at: now, updated_at: now }
  }

  async updateEpisode(id: string, data: Partial<Episode>): Promise<Episode> {
    await this.initialize()
    const db = await getDb()
    const existing = await this.getEpisodeById(id)
    if (!existing) throw new Error('Episode not found')

    const updated = { ...existing, ...data, updated_at: new Date().toISOString() }
    await db.execute(
      `UPDATE episodes SET name = $1, description = $2, episode_number = $3, updated_at = $4 WHERE id = $5`,
      [updated.name, updated.description ?? null, updated.episode_number ?? null, updated.updated_at, id]
    )
    return updated
  }

  async deleteEpisode(id: string): Promise<void> {
    await this.initialize()
    const db = await getDb()

    const storyboards = await db.select<Record<string, unknown>[]>('SELECT id, image, video FROM storyboards WHERE episode_id = $1', [id])
    for (const sb of storyboards) {
      if (sb.image && !String(sb.image).startsWith('http')) await deleteMediaFile(String(sb.image)).catch(() => {})
      if (sb.video && !String(sb.video).startsWith('http')) await deleteMediaFile(String(sb.video)).catch(() => {})
    }

    const storyboardIds = storyboards.map(s => String(s.id))
    if (storyboardIds.length > 0) {
      const dubbings = await db.select<Record<string, unknown>[]>(
        `SELECT audio_url FROM dubbings WHERE storyboard_id IN (${storyboardIds.map((_, i) => `$${i + 1}`).join(',')})`,
        storyboardIds
      )
      for (const d of dubbings) {
        if (d.audio_url && !String(d.audio_url).startsWith('http')) await deleteMediaFile(String(d.audio_url)).catch(() => {})
      }
    }

    const characters = await db.select<Record<string, unknown>[]>('SELECT id, image FROM characters WHERE episode_id = $1', [id])
    for (const c of characters) {
      if (c.image && !String(c.image).startsWith('http')) await deleteMediaFile(String(c.image)).catch(() => {})
    }
    await db.execute('DELETE FROM characters WHERE episode_id = $1', [id])

    const scenes = await db.select<Record<string, unknown>[]>('SELECT id, image FROM scenes WHERE episode_id = $1', [id])
    for (const s of scenes) {
      if (s.image && !String(s.image).startsWith('http')) await deleteMediaFile(String(s.image)).catch(() => {})
    }
    await db.execute('DELETE FROM scenes WHERE episode_id = $1', [id])

    const props = await db.select<Record<string, unknown>[]>('SELECT id, image FROM props WHERE episode_id = $1', [id])
    for (const p of props) {
      if (p.image && !String(p.image).startsWith('http')) await deleteMediaFile(String(p.image)).catch(() => {})
    }
    await db.execute('DELETE FROM props WHERE episode_id = $1', [id])

    await db.execute('DELETE FROM episodes WHERE id = $1', [id])
  }

  // ==================== Scripts ====================

  async getScripts(episodeId: string): Promise<Script[]> {
    await this.initialize()
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>('SELECT * FROM scripts WHERE episode_id = $1', [episodeId])
    return rows.map(rowToScript)
  }

  async getScriptById(id: string): Promise<Script | null> {
    await this.initialize()
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>('SELECT * FROM scripts WHERE id = $1', [id])
    return rows.length > 0 ? rowToScript(rows[0]!) : null
  }

  async getScriptByEpisode(episodeId: string): Promise<Script | null> {
    await this.initialize()
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>('SELECT * FROM scripts WHERE episode_id = $1 LIMIT 1', [episodeId])
    return rows.length > 0 ? rowToScript(rows[0]!) : null
  }

  async createScript(script: Omit<Script, 'id' | 'created_at' | 'updated_at'>): Promise<Script> {
    await this.initialize()
    const db = await getDb()
    const now = new Date().toISOString()
    const id = uuidv4()
    await db.execute(
      `INSERT INTO scripts (id, episode_id, title, content, extracted_assets, extracted_dubbing, extracted_shots, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, script.episode_id, script.title, script.content, toJsonField(script.extracted_assets), toJsonField(script.extracted_dubbing), toJsonField(script.extracted_shots), now, now]
    )
    return { ...script, id, created_at: now, updated_at: now }
  }

  async updateScript(id: string, data: Partial<Script>): Promise<Script> {
    await this.initialize()
    const db = await getDb()
    const existing = await this.getScriptById(id)
    if (!existing) throw new Error('Script not found')

    const updated = { ...existing, ...data, updated_at: new Date().toISOString() }
    await db.execute(
      `UPDATE scripts SET title = $1, content = $2, extracted_assets = $3, extracted_dubbing = $4, extracted_shots = $5, updated_at = $6 WHERE id = $7`,
      [updated.title, updated.content, toJsonField(updated.extracted_assets), toJsonField(updated.extracted_dubbing), toJsonField(updated.extracted_shots), updated.updated_at, id]
    )
    return updated
  }

  async deleteScript(id: string): Promise<void> {
    await this.initialize()
    const db = await getDb()
    await db.execute('DELETE FROM scripts WHERE id = $1', [id])
  }

  // ==================== Storyboards ====================

  async getStoryboards(episodeId: string): Promise<Storyboard[]> {
    await this.initialize()
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>('SELECT * FROM storyboards WHERE episode_id = $1 ORDER BY sort_order ASC, created_at ASC', [episodeId])
    return rows.map(rowToStoryboard)
  }

  async getStoryboardById(id: string): Promise<Storyboard | null> {
    await this.initialize()
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>('SELECT * FROM storyboards WHERE id = $1', [id])
    return rows.length > 0 ? rowToStoryboard(rows[0]!) : null
  }

  async createStoryboard(storyboard: Omit<Storyboard, 'id' | 'created_at' | 'updated_at'>): Promise<Storyboard> {
    await this.initialize()
    const db = await getDb()
    const now = new Date().toISOString()
    const id = uuidv4()
    await db.execute(
      `INSERT INTO storyboards (id, episode_id, project_id, name, shot_type, scene, scene_id, location, time, description, prompt, negative_prompt, video_prompt, image, video, audio, duration, status, sort_order, character_ids, prop_ids, reference_images, video_reference_images, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)`,
      [id, storyboard.episode_id, storyboard.project_id, storyboard.name,
       storyboard.shot_type ?? null, storyboard.scene ?? null, storyboard.scene_id ?? null,
       storyboard.location ?? null, storyboard.time ?? null, storyboard.description ?? null,
       storyboard.prompt ?? null, storyboard.negative_prompt ?? null, storyboard.video_prompt ?? null,
       storyboard.image ?? null, storyboard.video ?? null, storyboard.audio ?? null,
       storyboard.duration ?? null, storyboard.status ?? null, storyboard.sort_order ?? null,
       toJsonField(storyboard.character_ids), toJsonField(storyboard.prop_ids),
       toJsonField(storyboard.reference_images), toJsonField(storyboard.video_reference_images),
       toJsonField(storyboard.metadata), now, now]
    )
    return { ...storyboard, id, created_at: now, updated_at: now }
  }

  async updateStoryboard(id: string, data: Partial<Storyboard>): Promise<Storyboard> {
    await this.initialize()
    const db = await getDb()
    const existing = await this.getStoryboardById(id)
    if (!existing) throw new Error('Storyboard not found')

    const updated = { ...existing, ...data, updated_at: new Date().toISOString() }
    await db.execute(
      `UPDATE storyboards SET name = $1, shot_type = $2, scene = $3, scene_id = $4, location = $5, time = $6, description = $7, prompt = $8, negative_prompt = $9, video_prompt = $10, image = $11, video = $12, audio = $13, duration = $14, status = $15, sort_order = $16, character_ids = $17, prop_ids = $18, reference_images = $19, video_reference_images = $20, metadata = $21, updated_at = $22 WHERE id = $23`,
      [updated.name, updated.shot_type ?? null, updated.scene ?? null, updated.scene_id ?? null,
       updated.location ?? null, updated.time ?? null, updated.description ?? null,
       updated.prompt ?? null, updated.negative_prompt ?? null, updated.video_prompt ?? null,
       updated.image ?? null, updated.video ?? null, updated.audio ?? null,
       updated.duration ?? null, updated.status ?? null, updated.sort_order ?? null,
       toJsonField(updated.character_ids), toJsonField(updated.prop_ids),
       toJsonField(updated.reference_images), toJsonField(updated.video_reference_images),
       toJsonField(updated.metadata), updated.updated_at, id]
    )
    return updated
  }

  async deleteStoryboard(id: string): Promise<void> {
    await this.initialize()
    const db = await getDb()
    const storyboard = await this.getStoryboardById(id)
    if (storyboard) {
      if (storyboard.image && !storyboard.image.startsWith('http')) await deleteMediaFile(storyboard.image).catch(() => {})
      if (storyboard.video && !storyboard.video.startsWith('http')) await deleteMediaFile(storyboard.video).catch(() => {})
      if (storyboard.audio && !storyboard.audio.startsWith('http')) await deleteMediaFile(storyboard.audio).catch(() => {})
    }
    await db.execute('DELETE FROM storyboards WHERE id = $1', [id])
  }

  async batchCreateStoryboards(items: Array<Omit<Storyboard, 'id' | 'created_at' | 'updated_at'>>): Promise<Storyboard[]> {
    const created: Storyboard[] = []
    for (const item of items) {
      created.push(await this.createStoryboard(item))
    }
    return created
  }

  async batchUpdateStoryboards(updates: Array<{ id: string; data: Partial<Storyboard> }>): Promise<Storyboard[]> {
    const updated: Storyboard[] = []
    for (const { id, data } of updates) {
      updated.push(await this.updateStoryboard(id, data))
    }
    return updated
  }

  async reorderStoryboards(episodeId: string, orderedIds: string[]): Promise<void> {
    await this.initialize()
    const db = await getDb()
    for (let i = 0; i < orderedIds.length; i++) {
      await db.execute('UPDATE storyboards SET sort_order = $1 WHERE id = $2 AND episode_id = $3', [i, orderedIds[i], episodeId])
    }
  }

  // ==================== Characters ====================

  async getCharacters(projectId: string, filters?: { episodeId?: string }): Promise<Character[]> {
    await this.initialize()
    const db = await getDb()
    let sql = 'SELECT * FROM characters WHERE project_id = $1'
    const params: unknown[] = [projectId]
    if (filters?.episodeId) {
      sql += ' AND (episode_id = $2 OR episode_id IS NULL)'
      params.push(filters.episodeId)
    }
    sql += ' ORDER BY created_at DESC'
    const rows = await db.select<Record<string, unknown>[]>(sql, params)
    return rows.map(rowToCharacter)
  }

  async getAllCharacters(): Promise<Character[]> {
    await this.initialize()
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>('SELECT * FROM characters ORDER BY created_at DESC')
    return rows.map(rowToCharacter)
  }

  async getCharactersByEpisode(episodeId: string): Promise<Character[]> {
    await this.initialize()
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>('SELECT * FROM characters WHERE episode_id = $1 OR episode_id IS NULL ORDER BY created_at DESC', [episodeId])
    return rows.map(rowToCharacter)
  }

  async getCharacterById(id: string): Promise<Character | null> {
    await this.initialize()
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>('SELECT * FROM characters WHERE id = $1', [id])
    return rows.length > 0 ? rowToCharacter(rows[0]!) : null
  }

  async createCharacter(character: Omit<Character, 'id' | 'created_at' | 'updated_at'>): Promise<Character> {
    await this.initialize()
    const db = await getDb()
    const now = new Date().toISOString()
    const id = uuidv4()
    await db.execute(
      `INSERT INTO characters (id, project_id, episode_id, name, image, default_voice_id, minimax_voice_id, minimax_file_id, description, prompt, voice_description, tag, tags, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [id, character.project_id, character.episode_id ?? null, character.name, character.image ?? null,
       character.default_voice_id ?? null, character.minimax_voice_id ?? null, character.minimax_file_id ?? null,
       character.description ?? null, character.prompt ?? null, character.voice_description ?? null, character.tag ?? null, toJsonField(character.tags), now, now]
    )
    return { ...character, id, created_at: now, updated_at: now }
  }

  async updateCharacter(id: string, data: Partial<Character>): Promise<Character> {
    await this.initialize()
    const db = await getDb()
    const existing = await this.getCharacterById(id)
    if (!existing) throw new Error('Character not found')

    const updated = { ...existing, ...data, updated_at: new Date().toISOString() }
    await db.execute(
      `UPDATE characters SET name = $1, image = $2, default_voice_id = $3, minimax_voice_id = $4, minimax_file_id = $5, description = $6, prompt = $7, voice_description = $8, tag = $9, tags = $10, updated_at = $11 WHERE id = $12`,
      [updated.name, updated.image ?? null, updated.default_voice_id ?? null, updated.minimax_voice_id ?? null,
       updated.minimax_file_id ?? null, updated.description ?? null, updated.prompt ?? null, updated.voice_description ?? null,
       updated.tag ?? null, toJsonField(updated.tags), updated.updated_at, id]
    )
    return updated
  }

  async deleteCharacter(id: string): Promise<void> {
    await this.initialize()
    const db = await getDb()
    const character = await this.getCharacterById(id)
    if (character?.image && !character.image.startsWith('http')) await deleteMediaFile(character.image).catch(() => {})
    await db.execute('DELETE FROM characters WHERE id = $1', [id])
  }

  // ==================== Character Outfits ====================

  async getOutfitsByCharacter(characterId: string): Promise<CharacterOutfit[]> {
    await this.initialize()
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>(
      'SELECT * FROM character_outfits WHERE character_id = $1 ORDER BY is_default DESC, created_at ASC',
      [characterId]
    )
    return rows.map(row => this.mapOutfitRow(row))
  }

  async getOutfitById(id: string): Promise<CharacterOutfit | null> {
    await this.initialize()
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>(
      'SELECT * FROM character_outfits WHERE id = $1',
      [id]
    )
    return rows.length > 0 ? this.mapOutfitRow(rows[0]!) : null
  }

  async createOutfit(outfit: Omit<CharacterOutfit, 'id' | 'created_at' | 'updated_at'>): Promise<CharacterOutfit> {
    await this.initialize()
    const db = await getDb()
    const id = uuidv4()
    const now = new Date().toISOString()
    const tags = outfit.tags ? JSON.stringify(outfit.tags) : null
    await db.execute(
      'INSERT INTO character_outfits (id, character_id, name, description, prompt, image, tags, is_default, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [id, outfit.character_id, outfit.name, outfit.description || null, outfit.prompt || null, outfit.image || null, tags, outfit.is_default ? 1 : 0, now, now]
    )
    return this.getOutfitById(id) as Promise<CharacterOutfit>
  }

  async updateOutfit(id: string, data: Partial<CharacterOutfit>): Promise<void> {
    await this.initialize()
    const db = await getDb()
    const fields: string[] = []
    const params: unknown[] = []

    if (data.name !== undefined) { fields.push(`name = $${params.length + 1}`); params.push(data.name) }
    if (data.description !== undefined) { fields.push(`description = $${params.length + 1}`); params.push(data.description) }
    if (data.prompt !== undefined) { fields.push(`prompt = $${params.length + 1}`); params.push(data.prompt) }
    if (data.image !== undefined) { fields.push(`image = $${params.length + 1}`); params.push(data.image) }
    if (data.tags !== undefined) { fields.push(`tags = $${params.length + 1}`); params.push(JSON.stringify(data.tags)) }
    if (data.is_default !== undefined) { fields.push(`is_default = $${params.length + 1}`); params.push(data.is_default ? 1 : 0) }

    fields.push(`updated_at = $${params.length + 1}`)
    params.push(new Date().toISOString())

    params.push(id)
    await db.execute(
      `UPDATE character_outfits SET ${fields.join(', ')} WHERE id = $${params.length}`,
      params
    )
  }

  async deleteOutfit(id: string): Promise<void> {
    await this.initialize()
    const db = await getDb()
    const outfit = await this.getOutfitById(id)
    if (outfit?.image && !outfit.image.startsWith('http')) await deleteMediaFile(outfit.image).catch(() => {})
    await db.execute('DELETE FROM character_outfits WHERE id = $1', [id])
  }

  async setDefaultOutfit(characterId: string, outfitId: string): Promise<void> {
    await this.initialize()
    const db = await getDb()
    const now = new Date().toISOString()
    await db.execute('UPDATE character_outfits SET is_default = 0, updated_at = $1 WHERE character_id = $2', [now, characterId])
    await db.execute('UPDATE character_outfits SET is_default = 1, updated_at = $1 WHERE id = $2', [now, outfitId])
  }

  private mapOutfitRow(row: Record<string, unknown>): CharacterOutfit {
    return {
      id: row.id as string,
      character_id: row.character_id as string,
      name: row.name as string,
      description: (row.description as string) || undefined,
      prompt: (row.prompt as string) || undefined,
      image: (row.image as string) || undefined,
      tags: row.tags ? JSON.parse(row.tags as string) : undefined,
      is_default: Boolean(row.is_default),
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    }
  }

  // ==================== Scenes ====================

  async getScenes(projectId: string, filters?: { episodeId?: string }): Promise<Scene[]> {
    await this.initialize()
    const db = await getDb()
    let sql = 'SELECT * FROM scenes'
    const params: unknown[] = []
    const conditions: string[] = []

    if (projectId) {
      conditions.push(`project_id = $${params.length + 1}`)
      params.push(projectId)
    }
    if (filters?.episodeId) {
      conditions.push(`(episode_id = $${params.length + 1} OR episode_id IS NULL)`)
      params.push(filters.episodeId)
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ')
    }
    sql += ' ORDER BY created_at DESC'
    const rows = await db.select<Record<string, unknown>[]>(sql, params)
    return rows.map(rowToScene)
  }

  async getSceneById(id: string): Promise<Scene | null> {
    await this.initialize()
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>('SELECT * FROM scenes WHERE id = $1', [id])
    return rows.length > 0 ? rowToScene(rows[0]!) : null
  }

  async createScene(scene: Omit<Scene, 'id' | 'created_at' | 'updated_at'>): Promise<Scene> {
    await this.initialize()
    const db = await getDb()
    const now = new Date().toISOString()
    const id = uuidv4()
    await db.execute(
      `INSERT INTO scenes (id, project_id, episode_id, name, description, prompt, tags, image, metadata, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, scene.project_id, scene.episode_id ?? null, scene.name, scene.description ?? null,
       scene.prompt ?? null, toJsonField(scene.tags), scene.image ?? null, toJsonField(scene.metadata), now, now]
    )
    return { ...scene, id, created_at: now, updated_at: now }
  }

  async updateScene(id: string, data: Partial<Scene>): Promise<Scene> {
    await this.initialize()
    const db = await getDb()
    const existing = await this.getSceneById(id)
    if (!existing) throw new Error('Scene not found')

    const updated = { ...existing, ...data, updated_at: new Date().toISOString() }
    await db.execute(
      `UPDATE scenes SET name = $1, description = $2, prompt = $3, tags = $4, image = $5, metadata = $6, updated_at = $7 WHERE id = $8`,
      [updated.name, updated.description ?? null, updated.prompt ?? null, toJsonField(updated.tags),
       updated.image ?? null, toJsonField(updated.metadata), updated.updated_at, id]
    )
    return updated
  }

  async deleteScene(id: string): Promise<void> {
    await this.initialize()
    const db = await getDb()
    const scene = await this.getSceneById(id)
    if (scene?.image && !scene.image.startsWith('http')) await deleteMediaFile(scene.image).catch(() => {})
    await db.execute('DELETE FROM scenes WHERE id = $1', [id])
  }

  // ==================== Props ====================

  async getProps(projectId: string, filters?: { episodeId?: string }): Promise<Prop[]> {
    await this.initialize()
    const db = await getDb()
    let sql = 'SELECT * FROM props'
    const params: unknown[] = []
    const conditions: string[] = []

    if (projectId) {
      conditions.push(`project_id = $${params.length + 1}`)
      params.push(projectId)
    }
    if (filters?.episodeId) {
      conditions.push(`(episode_id = $${params.length + 1} OR episode_id IS NULL)`)
      params.push(filters.episodeId)
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ')
    }
    sql += ' ORDER BY created_at DESC'
    const rows = await db.select<Record<string, unknown>[]>(sql, params)
    return rows.map(rowToProp)
  }

  async getPropById(id: string): Promise<Prop | null> {
    await this.initialize()
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>('SELECT * FROM props WHERE id = $1', [id])
    return rows.length > 0 ? rowToProp(rows[0]!) : null
  }

  async createProp(prop: Omit<Prop, 'id' | 'created_at' | 'updated_at'>): Promise<Prop> {
    await this.initialize()
    const db = await getDb()
    const now = new Date().toISOString()
    const id = uuidv4()
    await db.execute(
      `INSERT INTO props (id, project_id, episode_id, name, description, prompt, tags, image, metadata, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, prop.project_id, prop.episode_id ?? null, prop.name, prop.description ?? null,
       prop.prompt ?? null, toJsonField(prop.tags), prop.image ?? null, toJsonField(prop.metadata), now, now]
    )
    return { ...prop, id, created_at: now, updated_at: now }
  }

  async updateProp(id: string, data: Partial<Prop>): Promise<Prop> {
    await this.initialize()
    const db = await getDb()
    const existing = await this.getPropById(id)
    if (!existing) throw new Error('Prop not found')

    const updated = { ...existing, ...data, updated_at: new Date().toISOString() }
    await db.execute(
      `UPDATE props SET name = $1, description = $2, prompt = $3, tags = $4, image = $5, metadata = $6, updated_at = $7 WHERE id = $8`,
      [updated.name, updated.description ?? null, updated.prompt ?? null, toJsonField(updated.tags),
       updated.image ?? null, toJsonField(updated.metadata), updated.updated_at, id]
    )
    return updated
  }

  async deleteProp(id: string): Promise<void> {
    await this.initialize()
    const db = await getDb()
    const prop = await this.getPropById(id)
    if (prop?.image && !prop.image.startsWith('http')) await deleteMediaFile(prop.image).catch(() => {})
    await db.execute('DELETE FROM props WHERE id = $1', [id])
  }

  // ==================== Dubbings ====================

  async getDubbingByStoryboard(storyboardId: string): Promise<Dubbing[]> {
    await this.initialize()
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>('SELECT * FROM dubbings WHERE storyboard_id = $1 ORDER BY sequence ASC', [storyboardId])
    return rows.map(rowToDubbing)
  }

  async getDubbingByEpisode(episodeId: string): Promise<Dubbing[]> {
    await this.initialize()
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>(
      `SELECT d.* FROM dubbings d
       INNER JOIN storyboards s ON d.storyboard_id = s.id
       WHERE s.episode_id = $1
       ORDER BY d.sequence ASC`,
      [episodeId]
    )
    return rows.map(rowToDubbing)
  }

  async getOrphanedDubbings(projectId: string): Promise<Dubbing[]> {
    await this.initialize()
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>(
      `SELECT d.* FROM dubbings d
       WHERE d.project_id = $1
       AND (d.storyboard_id IS NULL OR d.storyboard_id NOT IN (SELECT id FROM storyboards))
       ORDER BY d.sequence ASC`,
      [projectId]
    )
    return rows.map(rowToDubbing)
  }

  async getDubbingByProject(projectId: string): Promise<Dubbing[]> {
    await this.initialize()
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>(
      'SELECT * FROM dubbings WHERE project_id = $1 ORDER BY sequence ASC',
      [projectId]
    )
    return rows.map(rowToDubbing)
  }

  async getDubbingById(id: string): Promise<Dubbing | null> {
    await this.initialize()
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>('SELECT * FROM dubbings WHERE id = $1', [id])
    return rows.length > 0 ? rowToDubbing(rows[0]!) : null
  }

  async createDubbing(dubbing: Omit<Dubbing, 'id' | 'created_at' | 'updated_at'>): Promise<Dubbing> {
    await this.initialize()
    const db = await getDb()
    const now = new Date().toISOString()
    const id = uuidv4()
    await db.execute(
      `INSERT INTO dubbings (id, project_id, storyboard_id, character_id, text, audio_url, duration, voice_id, provider, status, type, emotion, audio_prompt, sequence, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [id, dubbing.project_id, dubbing.storyboard_id, dubbing.character_id ?? null, dubbing.text,
       dubbing.audio_url ?? null, dubbing.duration ?? null, dubbing.voice_id ?? null, dubbing.provider ?? null,
       dubbing.status, dubbing.type ?? null, dubbing.emotion ?? null, dubbing.audio_prompt ?? null,
       dubbing.sequence ?? 0, now, now]
    )
    return { ...dubbing, id, created_at: now, updated_at: now }
  }

  async updateDubbing(id: string, data: Partial<Dubbing>): Promise<Dubbing> {
    await this.initialize()
    const db = await getDb()
    const existing = await this.getDubbingById(id)
    if (!existing) throw new Error('Dubbing not found')

    const updated = { ...existing, ...data, updated_at: new Date().toISOString() }
    await db.execute(
      `UPDATE dubbings SET text = $1, audio_url = $2, duration = $3, voice_id = $4, provider = $5, status = $6, type = $7, emotion = $8, audio_prompt = $9, sequence = $10, updated_at = $11 WHERE id = $12`,
      [updated.text, updated.audio_url ?? null, updated.duration ?? null, updated.voice_id ?? null,
       updated.provider ?? null, updated.status, updated.type ?? null, updated.emotion ?? null,
       updated.audio_prompt ?? null, updated.sequence ?? 0, updated.updated_at, id]
    )
    return updated
  }

  async deleteDubbing(id: string): Promise<void> {
    await this.initialize()
    const db = await getDb()
    const dubbing = await this.getDubbingById(id)
    if (dubbing?.audio_url && !dubbing.audio_url.startsWith('http')) await deleteMediaFile(dubbing.audio_url).catch(() => {})
    await db.execute('DELETE FROM dubbings WHERE id = $1', [id])
  }

  // ==================== Workflows ====================

  async getWorkflows(): Promise<WorkflowConfig[]> {
    await this.initialize()
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>('SELECT * FROM workflows ORDER BY created_at DESC')
    return rows.map(rowToWorkflow)
  }

  async getWorkflowById(id: string): Promise<WorkflowConfig | null> {
    await this.initialize()
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>('SELECT * FROM workflows WHERE id = $1', [id])
    return rows.length > 0 ? rowToWorkflow(rows[0]!) : null
  }

  async saveWorkflow(workflow: WorkflowConfig): Promise<WorkflowConfig> {
    await this.initialize()
    const db = await getDb()
    const now = new Date().toISOString()

    const existing = await this.getWorkflowById(workflow.id)
    if (existing) {
      await db.execute(
        `UPDATE workflows SET name = $1, type = $2, workflow = $3, nodes = $4, description = $5, tags = $6, updated_at = $7 WHERE id = $8`,
        [workflow.name, workflow.type, JSON.stringify(workflow.workflow), JSON.stringify(workflow.nodes),
         workflow.description ?? null, toJsonField(workflow.tags), now, workflow.id]
      )
      return { ...workflow, updated_at: now }
    } else {
      await db.execute(
        `INSERT INTO workflows (id, name, type, workflow, nodes, description, tags, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [workflow.id, workflow.name, workflow.type, JSON.stringify(workflow.workflow), JSON.stringify(workflow.nodes),
         workflow.description ?? null, toJsonField(workflow.tags), now, now]
      )
      return { ...workflow, created_at: now, updated_at: now }
    }
  }

  async deleteWorkflow(id: string): Promise<void> {
    await this.initialize()
    const db = await getDb()
    await db.execute('DELETE FROM workflows WHERE id = $1', [id])
  }

  // ==================== Settings ====================

  async getSettings(): Promise<Record<string, unknown>> {
    await this.initialize()
    const db = await getDb()
    const rows = await db.select<{ key: string; value: string }[]>('SELECT key, value FROM settings')
    const settings: Record<string, unknown> = {}
    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value)
      } catch {
        settings[row.key] = row.value
      }
    }
    return settings
  }

  async saveSettings(settings: Record<string, unknown>): Promise<void> {
    await this.initialize()
    const db = await getDb()
    for (const [key, value] of Object.entries(settings)) {
      const valueStr = typeof value === 'string' ? value : JSON.stringify(value)
      await db.execute(
        `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2`,
        [key, valueStr]
      )
    }
  }

  // ==================== Sample Projects ====================

  async getSampleProjects(episodeId: string): Promise<SampleProject[]> {
    await this.initialize()
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>('SELECT * FROM sample_projects WHERE episode_id = $1 ORDER BY created_at DESC', [episodeId])
    return rows.map(rowToSampleProject)
  }

  async getSampleProjectById(id: string): Promise<SampleProject | null> {
    await this.initialize()
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>('SELECT * FROM sample_projects WHERE id = $1', [id])
    return rows.length > 0 ? rowToSampleProject(rows[0]!) : null
  }

  async createSampleProject(project: Omit<SampleProject, 'id' | 'created_at' | 'updated_at'>): Promise<SampleProject> {
    await this.initialize()
    const db = await getDb()
    const now = new Date().toISOString()
    const id = uuidv4()
    await db.execute(
      `INSERT INTO sample_projects (id, episode_id, name, duration, tracks, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, project.episode_id, project.name, project.duration ?? 0, toJsonField(project.tracks), now, now]
    )
    return { ...project, id, created_at: now, updated_at: now }
  }

  async updateSampleProject(id: string, data: Partial<SampleProject>): Promise<SampleProject> {
    await this.initialize()
    const db = await getDb()
    const existing = await this.getSampleProjectById(id)
    if (!existing) throw new Error('Sample project not found')

    const updated = { ...existing, ...data, updated_at: new Date().toISOString() }
    await db.execute(
      `UPDATE sample_projects SET name = $1, duration = $2, tracks = $3, updated_at = $4 WHERE id = $5`,
      [updated.name, updated.duration ?? 0, toJsonField(updated.tracks), updated.updated_at, id]
    )
    return updated
  }

  async deleteSampleProject(id: string): Promise<void> {
    await this.initialize()
    const db = await getDb()
    await db.execute('DELETE FROM sample_projects WHERE id = $1', [id])
  }

  // ==================== Canvas Data ====================

  async getCanvasData(episodeId: string): Promise<{ nodes: unknown[]; edges: unknown[]; version?: string } | null> {
    await this.initialize()
    const db = await getDb()
    const rows = await db.select<{ nodes: string; edges: string; version: string | null }[]>('SELECT nodes, edges, version FROM canvas_data WHERE episode_id = $1', [episodeId])
    if (rows.length === 0) return null
    return {
      nodes: JSON.parse(rows[0]!.nodes),
      edges: JSON.parse(rows[0]!.edges),
      version: rows[0]!.version ?? undefined,
    }
  }

  async saveCanvasData(episodeId: string, nodes: unknown[], edges: unknown[], version?: string): Promise<void> {
    await this.initialize()
    const db = await getDb()
    const now = new Date().toISOString()
    await db.execute(
      `INSERT INTO canvas_data (id, episode_id, nodes, edges, version, updated_at) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(episode_id) DO UPDATE SET nodes = $3, edges = $4, version = $5, updated_at = $6`,
      [uuidv4(), episodeId, JSON.stringify(nodes), JSON.stringify(edges), version ?? null, now]
    )
  }

  async deleteCanvasData(episodeId: string): Promise<void> {
    await this.initialize()
    const db = await getDb()
    await db.execute('DELETE FROM canvas_data WHERE episode_id = $1', [episodeId])
  }

  // ==================== Media Assets ====================

  async getMediaAssets(filters?: { type?: string; tag?: string; search?: string }): Promise<MediaAsset[]> {
    await this.initialize()
    const db = await getDb()
    let sql = 'SELECT * FROM media_assets'
    const params: unknown[] = []
    const conditions: string[] = []

    if (filters?.type) {
      conditions.push(`type = $${params.length + 1}`)
      params.push(filters.type)
    }
    if (filters?.tag) {
      conditions.push(`tags LIKE $${params.length + 1}`)
      params.push(`%"${filters.tag}"%`)
    }
    if (filters?.search) {
      conditions.push(`(name LIKE $${params.length + 1} OR prompt LIKE $${params.length + 1})`)
      params.push(`%${filters.search}%`)
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ')
    }
    sql += ' ORDER BY created_at DESC'
    const rows = await db.select<Record<string, unknown>[]>(sql, params)
    return rows.map(rowToMediaAsset)
  }

  async getMediaAssetById(id: string): Promise<MediaAsset | null> {
    await this.initialize()
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>(
      'SELECT * FROM media_assets WHERE id = $1', [id]
    )
    return rows.length > 0 ? rowToMediaAsset(rows[0]!) : null
  }

  async createMediaAsset(asset: Omit<MediaAsset, 'id' | 'created_at' | 'updated_at'>): Promise<MediaAsset> {
    await this.initialize()
    const db = await getDb()
    const now = new Date().toISOString()
    const id = uuidv4()
    await db.execute(
      `INSERT INTO media_assets (id, name, type, file_path, prompt, tags, description, width, height, file_size, source, project_id, episode_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [id, asset.name, asset.type, asset.file_path, asset.prompt ?? null, toJsonField(asset.tags),
       asset.description ?? null, asset.width ?? null, asset.height ?? null, asset.file_size ?? null,
       asset.source ?? null, asset.project_id ?? null, asset.episode_id ?? null, now, now]
    )
    return { ...asset, id, created_at: now, updated_at: now }
  }

  async updateMediaAsset(id: string, data: Partial<MediaAsset>): Promise<MediaAsset> {
    await this.initialize()
    const db = await getDb()
    const existing = await this.getMediaAssetById(id)
    if (!existing) throw new Error('MediaAsset not found')
    const updated = { ...existing, ...data, updated_at: new Date().toISOString() }
    await db.execute(
      `UPDATE media_assets SET name = $1, type = $2, file_path = $3, prompt = $4, tags = $5, description = $6, width = $7, height = $8, file_size = $9, source = $10, project_id = $11, episode_id = $12, updated_at = $13 WHERE id = $14`,
      [updated.name, updated.type, updated.file_path, updated.prompt ?? null, toJsonField(updated.tags),
       updated.description ?? null, updated.width ?? null, updated.height ?? null, updated.file_size ?? null,
       updated.source ?? null, updated.project_id ?? null, updated.episode_id ?? null, updated.updated_at, id]
    )
    return updated
  }

  async deleteMediaAsset(id: string): Promise<void> {
    await this.initialize()
    const db = await getDb()
    const asset = await this.getMediaAssetById(id)
    if (asset?.file_path && !asset.file_path.startsWith('http')) await deleteMediaFile(asset.file_path).catch(() => {})
    await db.execute('DELETE FROM media_assets WHERE id = $1', [id])
  }

  // ==================== Generation Tasks ====================

  async getGenerationTasks(filters?: {
    status?: string
    type?: string
    projectId?: string
    episodeId?: string
    limit?: number
  }): Promise<GenerationTask[]> {
    await this.initialize()
    const db = await getDb()
    let sql = 'SELECT * FROM generation_tasks'
    const params: unknown[] = []
    const conditions: string[] = []

    if (filters?.status) {
      conditions.push(`status = $${params.length + 1}`)
      params.push(filters.status)
    }
    if (filters?.type) {
      conditions.push(`type = $${params.length + 1}`)
      params.push(filters.type)
    }
    if (filters?.projectId) {
      conditions.push(`project_id = $${params.length + 1}`)
      params.push(filters.projectId)
    }
    if (filters?.episodeId) {
      conditions.push(`episode_id = $${params.length + 1}`)
      params.push(filters.episodeId)
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ')
    }
    sql += ' ORDER BY created_at DESC'
    if (filters?.limit) {
      sql += ` LIMIT $${params.length + 1}`
      params.push(filters.limit)
    }
    const rows = await db.select<Record<string, unknown>[]>(sql, params)
    return rows.map(rowToGenerationTask)
  }

  async getGenerationTaskById(id: string): Promise<GenerationTask | null> {
    await this.initialize()
    const db = await getDb()
    const rows = await db.select<Record<string, unknown>[]>(
      'SELECT * FROM generation_tasks WHERE id = $1', [id]
    )
    return rows.length > 0 ? rowToGenerationTask(rows[0]!) : null
  }

  async createGenerationTask(task: Omit<GenerationTask, 'id' | 'created_at' | 'updated_at'>): Promise<GenerationTask> {
    await this.initialize()
    const db = await getDb()
    const now = new Date().toISOString()
    const id = uuidv4()
    await db.execute(
      `INSERT INTO generation_tasks (id, type, name, status, model, provider, project_id, episode_id, prompt, input_params, output_url, output_path, error, progress, step_name, retry_count, max_retries, api_task_id, metadata, started_at, completed_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
      [id, task.type, task.name ?? null, task.status, task.model ?? null, task.provider ?? null,
       task.project_id ?? null, task.episode_id ?? null, task.prompt ?? null,
       toJsonField(task.input_params), task.output_url ?? null, task.output_path ?? null,
       task.error ?? null, task.progress, task.step_name ?? null,
       task.retry_count, task.max_retries, task.api_task_id ?? null,
       toJsonField(task.metadata), task.started_at ?? null, task.completed_at ?? null, now, now]
    )
    return { ...task, id, created_at: now, updated_at: now }
  }

  async updateGenerationTask(id: string, data: Partial<GenerationTask>): Promise<GenerationTask> {
    await this.initialize()
    const db = await getDb()
    const existing = await this.getGenerationTaskById(id)
    if (!existing) throw new Error('GenerationTask not found')

    const updated = { ...existing, ...data, updated_at: new Date().toISOString() }
    await db.execute(
      `UPDATE generation_tasks SET name = $1, status = $2, model = $3, provider = $4, project_id = $5, episode_id = $6, prompt = $7, input_params = $8, output_url = $9, output_path = $10, error = $11, progress = $12, step_name = $13, retry_count = $14, max_retries = $15, api_task_id = $16, metadata = $17, started_at = $18, completed_at = $19, updated_at = $20 WHERE id = $21`,
      [updated.name ?? null, updated.status, updated.model ?? null, updated.provider ?? null,
       updated.project_id ?? null, updated.episode_id ?? null, updated.prompt ?? null,
       toJsonField(updated.input_params), updated.output_url ?? null, updated.output_path ?? null,
       updated.error ?? null, updated.progress, updated.step_name ?? null,
       updated.retry_count, updated.max_retries, updated.api_task_id ?? null,
       toJsonField(updated.metadata), updated.started_at ?? null, updated.completed_at ?? null,
       updated.updated_at, id]
    )
    return updated
  }

  async deleteGenerationTask(id: string): Promise<void> {
    await this.initialize()
    const db = await getDb()
    await db.execute('DELETE FROM generation_tasks WHERE id = $1', [id])
  }

  async getGenerationTasksByStatus(status: string): Promise<GenerationTask[]> {
    return this.getGenerationTasks({ status })
  }

  async getGenerationTasksByProject(projectId: string): Promise<GenerationTask[]> {
    return this.getGenerationTasks({ projectId })
  }

  async getGenerationTasksByEpisode(episodeId: string): Promise<GenerationTask[]> {
    return this.getGenerationTasks({ episodeId })
  }

  // ==================== Task Log Entries ====================

  async getTaskLogs(taskId: string, filters?: {
    level?: string
    limit?: number
    sinceId?: number
  }): Promise<TaskLogEntry[]> {
    await this.initialize()
    const db = await getDb()
    let sql = 'SELECT * FROM task_log_entries WHERE task_id = $1'
    const params: unknown[] = [taskId]

    if (filters?.level) {
      sql += ` AND level = $${params.length + 1}`
      params.push(filters.level)
    }
    if (filters?.sinceId) {
      sql += ` AND id > $${params.length + 1}`
      params.push(filters.sinceId)
    }
    sql += ' ORDER BY id ASC'
    if (filters?.limit) {
      sql += ` LIMIT $${params.length + 1}`
      params.push(filters.limit)
    }
    const rows = await db.select<Record<string, unknown>[]>(sql, params)
    return rows.map(rowToTaskLogEntry)
  }

  async addTaskLog(taskId: string, level: string, message: string, data?: Record<string, unknown>): Promise<TaskLogEntry> {
    await this.initialize()
    const db = await getDb()
    const now = new Date().toISOString()
    await db.execute(
      `INSERT INTO task_log_entries (task_id, timestamp, level, message, data) VALUES ($1, $2, $3, $4, $5)`,
      [taskId, now, level, message, toJsonField(data)]
    )
    const rows = await db.select<Record<string, unknown>[]>(
      'SELECT * FROM task_log_entries WHERE task_id = $1 ORDER BY id DESC LIMIT 1', [taskId]
    )
    return rowToTaskLogEntry(rows[0]!)
  }

  async addTaskLogsBatch(entries: Array<{ taskId: string; level: string; message: string; data?: Record<string, unknown> }>): Promise<void> {
    await this.initialize()
    const db = await getDb()
    for (const entry of entries) {
      const now = new Date().toISOString()
      await db.execute(
        `INSERT INTO task_log_entries (task_id, timestamp, level, message, data) VALUES ($1, $2, $3, $4, $5)`,
        [entry.taskId, now, entry.level, entry.message, toJsonField(entry.data)]
      )
    }
  }

  async deleteTaskLogs(taskId: string): Promise<void> {
    await this.initialize()
    const db = await getDb()
    await db.execute('DELETE FROM task_log_entries WHERE task_id = $1', [taskId])
  }

  async getRecentTaskLogs(limit: number = 200, filters?: {
    taskId?: string
    level?: string
  }): Promise<TaskLogEntry[]> {
    await this.initialize()
    const db = await getDb()
    let sql = 'SELECT * FROM task_log_entries'
    const params: unknown[] = []
    const conditions: string[] = []

    if (filters?.taskId) {
      conditions.push(`task_id = $${params.length + 1}`)
      params.push(filters.taskId)
    }
    if (filters?.level) {
      conditions.push(`level = $${params.length + 1}`)
      params.push(filters.level)
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ')
    }
    sql += ' ORDER BY id DESC'
    sql += ` LIMIT $${params.length + 1}`
    params.push(limit)
    const rows = await db.select<Record<string, unknown>[]>(sql, params)
    return rows.map(rowToTaskLogEntry)
  }
}

export const localDB = new SQLiteDatabase()
export const db = localDB

export const projectDB = {
  getAll: () => db.getAllProjects(),
  getById: (id: string) => db.getProjectById(id),
  create: (project: Omit<Project, 'id' | 'created_at' | 'updated_at'>) => db.createProject(project),
  update: (id: string, data: Partial<Project>) => db.updateProject(id, data),
  delete: (id: string) => db.deleteProject(id),
}

export const episodeDB = {
  getAll: (projectId: string) => db.getEpisodes(projectId),
  getById: (id: string) => db.getEpisodeById(id),
  getByProject: (projectId: string) => db.getEpisodes(projectId),
  create: (episode: Omit<Episode, 'id' | 'created_at' | 'updated_at'>) => db.createEpisode(episode),
  update: (id: string, data: Partial<Episode>) => db.updateEpisode(id, data),
  delete: (id: string) => db.deleteEpisode(id),
}

export const scriptDB = {
  getByEpisode: (episodeId: string) => db.getScriptByEpisode(episodeId),
  getById: (id: string) => db.getScriptById(id),
  create: (script: Omit<Script, 'id' | 'created_at' | 'updated_at'>) => db.createScript(script),
  update: (id: string, data: Partial<Script>) => db.updateScript(id, data),
  delete: (id: string) => db.deleteScript(id),
}

export const storyboardDB = {
  getAll: (episodeId: string) => db.getStoryboards(episodeId),
  getById: (id: string) => db.getStoryboardById(id),
  create: (storyboard: Omit<Storyboard, 'id' | 'created_at' | 'updated_at'>) =>
    db.createStoryboard(storyboard),
  update: (id: string, data: Partial<Storyboard>) => db.updateStoryboard(id, data),
  delete: (id: string) => db.deleteStoryboard(id),
  batchCreate: (items: Array<Omit<Storyboard, 'id' | 'created_at' | 'updated_at'>>) =>
    db.batchCreateStoryboards(items),
  batchUpdate: (updates: Array<{ id: string; data: Partial<Storyboard> }>) =>
    db.batchUpdateStoryboards(updates),
  batchDelete: (ids: string[]) => Promise.all(ids.map(id => db.deleteStoryboard(id))),
  reorder: (episodeId: string, orderedIds: string[]) =>
    db.reorderStoryboards(episodeId, orderedIds),
}

export const characterDB = {
  getAll: (projectId: string, filters?: { episodeId?: string }) =>
    db.getCharacters(projectId, filters),
  getAllCharacters: () => db.getAllCharacters(),
  getByEpisode: (episodeId: string) => db.getCharactersByEpisode(episodeId),
  getByProject: (projectId: string) => db.getCharacters(projectId),
  getById: (id: string) => db.getCharacterById(id),
  create: (character: Omit<Character, 'id' | 'created_at' | 'updated_at'>) =>
    db.createCharacter(character),
  update: (id: string, data: Partial<Character>) => db.updateCharacter(id, data),
  delete: (id: string) => db.deleteCharacter(id),
  batchDelete: (ids: string[]) => Promise.all(ids.map(id => db.deleteCharacter(id))),
}

export const outfitDB = {
  getByCharacter: (characterId: string) => db.getOutfitsByCharacter(characterId),
  getById: (id: string) => db.getOutfitById(id),
  create: (outfit: Omit<CharacterOutfit, 'id' | 'created_at' | 'updated_at'>) =>
    db.createOutfit(outfit),
  update: (id: string, data: Partial<CharacterOutfit>) => db.updateOutfit(id, data),
  delete: (id: string) => db.deleteOutfit(id),
  setDefault: (characterId: string, outfitId: string) =>
    db.setDefaultOutfit(characterId, outfitId),
}

export const sceneDB = {
  getAll: (projectId: string, filters?: { episodeId?: string }) => db.getScenes(projectId, filters),
  getById: (id: string) => db.getSceneById(id),
  getByEpisode: (episodeId: string) => db.getScenes('', { episodeId }),
  getByProject: (projectId: string) => db.getScenes(projectId),
  create: (scene: Omit<Scene, 'id' | 'created_at' | 'updated_at'>) => db.createScene(scene),
  update: (id: string, data: Partial<Scene>) => db.updateScene(id, data),
  delete: (id: string) => db.deleteScene(id),
  batchDelete: (ids: string[]) => Promise.all(ids.map(id => db.deleteScene(id))),
}

export const propDB = {
  getAll: (projectId: string, filters?: { episodeId?: string }) => db.getProps(projectId, filters),
  getById: (id: string) => db.getPropById(id),
  getByEpisode: (episodeId: string) => db.getProps('', { episodeId }),
  getByProject: (projectId: string) => db.getProps(projectId),
  create: (prop: Omit<Prop, 'id' | 'created_at' | 'updated_at'>) => db.createProp(prop),
  update: (id: string, data: Partial<Prop>) => db.updateProp(id, data),
  delete: (id: string) => db.deleteProp(id),
  batchDelete: (ids: string[]) => Promise.all(ids.map(id => db.deleteProp(id))),
}

export const dubbingDB = {
  getByStoryboard: (storyboardId: string) => db.getDubbingByStoryboard(storyboardId),
  getByEpisode: (episodeId: string) => db.getDubbingByEpisode(episodeId),
  getOrphaned: (projectId: string) => db.getOrphanedDubbings(projectId),
  getByProject: (projectId: string) => db.getDubbingByProject(projectId),
  getById: (id: string) => db.getDubbingById(id),
  create: (dubbing: Omit<Dubbing, 'id' | 'created_at' | 'updated_at'>) => db.createDubbing(dubbing),
  update: (id: string, data: Partial<Dubbing>) => db.updateDubbing(id, data),
  delete: (id: string) => db.deleteDubbing(id),
  batchDelete: (ids: string[]) => Promise.all(ids.map(id => db.deleteDubbing(id))),
}

export const workflowDB = {
  getAll: () => db.getWorkflows(),
  getById: (id: string) => db.getWorkflowById(id),
  save: (workflow: WorkflowConfig) => db.saveWorkflow(workflow),
  delete: (id: string) => db.deleteWorkflow(id),
  getWorkflows: () => db.getWorkflows(),
}

export const settingsDB = {
  get: () => db.getSettings(),
  save: (settings: Record<string, unknown>) => db.saveSettings(settings),
}

export const sampleProjectDB = {
  getAll: (episodeId: string) => db.getSampleProjects(episodeId),
  getById: (id: string) => db.getSampleProjectById(id),
  create: (project: Omit<SampleProject, 'id' | 'created_at' | 'updated_at'>) =>
    db.createSampleProject(project),
  update: (id: string, data: Partial<SampleProject>) => db.updateSampleProject(id, data),
  delete: (id: string) => db.deleteSampleProject(id),
}

export const canvasDB = {
  getByEpisode: (episodeId: string) => db.getCanvasData(episodeId),
  save: (episodeId: string, nodes: unknown[], edges: unknown[], version?: string) =>
    db.saveCanvasData(episodeId, nodes, edges, version),
  delete: (episodeId: string) => db.deleteCanvasData(episodeId),
}

export const mediaAssetDB = {
  getAll: (filters?: { type?: string; tag?: string; search?: string }) =>
    db.getMediaAssets(filters),
  getById: (id: string) => db.getMediaAssetById(id),
  create: (asset: Omit<MediaAsset, 'id' | 'created_at' | 'updated_at'>) =>
    db.createMediaAsset(asset),
  update: (id: string, data: Partial<MediaAsset>) =>
    db.updateMediaAsset(id, data),
  delete: (id: string) => db.deleteMediaAsset(id),
}

export const taskDB = {
  getAll: (filters?: {
    status?: string
    type?: string
    projectId?: string
    episodeId?: string
    limit?: number
  }) => db.getGenerationTasks(filters),
  getById: (id: string) => db.getGenerationTaskById(id),
  create: (task: Omit<GenerationTask, 'id' | 'created_at' | 'updated_at'>) =>
    db.createGenerationTask(task),
  update: (id: string, data: Partial<GenerationTask>) =>
    db.updateGenerationTask(id, data),
  delete: (id: string) => db.deleteGenerationTask(id),
  getByStatus: (status: string) => db.getGenerationTasksByStatus(status),
  getByProject: (projectId: string) => db.getGenerationTasksByProject(projectId),
  getByEpisode: (episodeId: string) => db.getGenerationTasksByEpisode(episodeId),
  getLogs: (taskId: string, filters?: { level?: string; limit?: number; sinceId?: number }) =>
    db.getTaskLogs(taskId, filters),
  addLog: (taskId: string, level: string, message: string, data?: Record<string, unknown>) =>
    db.addTaskLog(taskId, level, message, data),
  addLogsBatch: (entries: Array<{ taskId: string; level: string; message: string; data?: Record<string, unknown> }>) =>
    db.addTaskLogsBatch(entries),
  deleteLogs: (taskId: string) => db.deleteTaskLogs(taskId),
  getRecentLogs: (limit?: number, filters?: { taskId?: string; level?: string }) =>
    db.getRecentTaskLogs(limit, filters),
}
