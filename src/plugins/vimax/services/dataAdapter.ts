/**
 * 数据适配层
 * ViMax 数据 ↔ FD 数据库 CRUD
 */

import {
  characterDB,
  sceneDB,
  storyboardDB,
  episodeDB,
} from '@/db';
import type {
  ViMaxScript,
  ViMaxScene,
  ViMaxShotDescription,
  ViMaxCharacterInScene,
} from '@/plugins/vimax/types';
import type { Character, Scene, Storyboard } from '@/types';

// ==================== Script → FD 数据库 ====================

/**
 * 保存剧本数据到 FD 数据库
 */
export async function saveScriptToDatabase(
  script: ViMaxScript,
  projectId: string,
  episodeId?: string
): Promise<void> {
  // 如果没有 episodeId，创建一个新剧集
  let targetEpisodeId = episodeId;
  if (!targetEpisodeId) {
    const episode = await episodeDB.create({
      project_id: projectId,
      name: script.title || '未命名剧集',
      description: script.summary,
    });
    targetEpisodeId = episode.id;
  }

  // 保存角色
  for (const character of script.characters) {
    await saveCharacterToDatabase(character, projectId);
  }

  // 保存场景
  for (const scene of script.scenes) {
    await saveSceneToDatabase(scene, projectId, targetEpisodeId);
  }
}

/**
 * 保存角色到 FD 数据库
 */
export async function saveCharacterToDatabase(
  character: ViMaxCharacterInScene,
  projectId: string
): Promise<string> {
  const characterData: Omit<Character, 'id' | 'created_at' | 'updated_at'> = {
    project_id: projectId,
    name: character.name,
    description: character.description,
    prompt: character.prompt,
    image: character.portraitUrl,
    tags: [],
    aliases: [],
    metadata: {},
  };

  const result = await characterDB.create(characterData);
  return result.id;
}

/**
 * 保存场景到 FD 数据库
 */
export async function saveSceneToDatabase(
  scene: ViMaxScene,
  projectId: string,
  episodeId: string
): Promise<string> {
  const sceneData: Omit<Scene, 'id' | 'created_at' | 'updated_at'> = {
    project_id: projectId,
    episode_id: episodeId,
    name: scene.name,
    description: scene.description,
    prompt: scene.prompt,
    tags: [],
    aliases: [],
    metadata: {},
  };

  const result = await sceneDB.create(sceneData);
  return result.id;
}

/**
 * 保存分镜到 FD 数据库
 */
export async function saveShotsToDatabase(
  shots: ViMaxShotDescription[],
  _projectId: string,
  episodeId?: string
): Promise<void> {
  if (!episodeId) {
    throw new Error('保存分镜需要提供 episodeId');
  }

  for (const shot of shots) {
    const shotData: Omit<Storyboard, 'id' | 'created_at' | 'updated_at'> = {
      episode_id: episodeId,
      project_id: _projectId,
      name: shot.description || '未命名分镜',
      scene_id: shot.sceneId,
      description: shot.description,
      prompt: shot.prompt,
      video_prompt: shot.videoPrompt,
      image: shot.imageUrl,
      video: shot.videoUrl,
      audio: shot.audioUrl,
      duration: shot.duration,
      status: shot.status,
      tags: [],
      metadata: {},
    };

    await storyboardDB.create(shotData);
  }
}

// ==================== FD 数据库 → ViMax 数据 ====================

/**
 * 从 FD 数据库加载角色
 */
export async function loadCharactersFromDatabase(
  projectId: string
): Promise<ViMaxCharacterInScene[]> {
  const characters = await characterDB.getByProject(projectId);

  return characters.map((char) => ({
    name: char.name,
    description: char.description || '',
    prompt: char.prompt || '',
    portraitUrl: char.image,
  }));
}

/**
 * 从 FD 数据库加载场景
 */
export async function loadScenesFromDatabase(
  episodeId: string
): Promise<ViMaxScene[]> {
  const scenes = await sceneDB.getByEpisode(episodeId);

  return scenes.map((scene) => ({
    id: scene.id,
    name: scene.name,
    description: scene.description || '',
    prompt: scene.prompt || '',
    characters: [],
    props: [],
    referenceImageUrl: scene.image,
  }));
}

/**
 * 从 FD 数据库加载分镜
 */
export async function loadShotsFromDatabase(
  episodeId: string
): Promise<ViMaxShotDescription[]> {
  const shots = await storyboardDB.getAll(episodeId);

  return shots.map((shot) => ({
    id: shot.id,
    sceneId: shot.scene_id || '',
    sequence: 0,
    description: shot.description || '',
    cameraAngle: '中景',
    characters: [],
    props: [],
    prompt: shot.prompt || '',
    videoPrompt: shot.video_prompt,
    duration: shot.duration,
    imageUrl: shot.image,
    videoUrl: shot.video,
    audioUrl: shot.audio,
    status: (shot.status as ViMaxShotDescription['status']) || 'pending',
  }));
}

/**
 * 从 FD 数据库加载完整剧本
 */
export async function loadScriptFromDatabase(
  projectId: string,
  episodeId: string
): Promise<ViMaxScript> {
  const episode = await episodeDB.getById(episodeId);
  const characters = await loadCharactersFromDatabase(projectId);
  const scenes = await loadScenesFromDatabase(episodeId);
  const shots = await loadShotsFromDatabase(episodeId);

  return {
    title: episode?.name || '未命名剧本',
    summary: episode?.description || '',
    characters,
    scenes,
    shots,
  };
}

// ==================== 更新操作 ====================

/**
 * 更新分镜状态
 */
export async function updateShotStatus(
  shotId: string,
  status: ViMaxShotDescription['status'],
  mediaUrl?: string,
  mediaType?: 'image' | 'video' | 'audio'
): Promise<void> {
  const updates: Partial<Storyboard> = { status };

  if (mediaUrl && mediaType) {
    switch (mediaType) {
      case 'image':
        updates.image = mediaUrl;
        break;
      case 'video':
        updates.video = mediaUrl;
        break;
      case 'audio':
        updates.audio = mediaUrl;
        break;
    }
  }

  await storyboardDB.update(shotId, updates);
}

/**
 * 更新角色肖像
 */
export async function updateCharacterPortrait(
  characterId: string,
  portraitUrl: string
): Promise<void> {
  await characterDB.update(characterId, { image: portraitUrl });
}

/**
 * 更新场景参考图
 */
export async function updateSceneReferenceImage(
  sceneId: string,
  imageUrl: string
): Promise<void> {
  await sceneDB.update(sceneId, { image: imageUrl });
}

// ==================== 删除操作 ====================

/**
 * 删除剧本相关数据
 */
export async function deleteScriptData(
  episodeId: string
): Promise<void> {
  const shots = await storyboardDB.getAll(episodeId);
  for (const shot of shots) {
    await storyboardDB.delete(shot.id);
  }

  const scenes = await sceneDB.getByEpisode(episodeId);
  for (const scene of scenes) {
    await sceneDB.delete(scene.id);
  }
}
