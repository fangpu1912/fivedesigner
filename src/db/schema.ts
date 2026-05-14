export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  aspect_ratio TEXT,
  visual_style TEXT,
  custom_style TEXT,
  cover_image TEXT,
  quality_prompt TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  episode_number INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scripts (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  extracted_assets TEXT,
  extracted_dubbing TEXT,
  extracted_shots TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS storyboards (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  shot_type TEXT,
  scene TEXT,
  scene_id TEXT,
  location TEXT,
  time TEXT,
  description TEXT,
  prompt TEXT,
  negative_prompt TEXT,
  video_prompt TEXT,
  image TEXT,
  video TEXT,
  audio TEXT,
  duration REAL,
  status TEXT,
  sort_order INTEGER,
  character_ids TEXT,
  prop_ids TEXT,
  reference_images TEXT,
  video_reference_images TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  episode_id TEXT,
  name TEXT NOT NULL,
  image TEXT,
  default_voice_id TEXT,
  minimax_voice_id TEXT,
  minimax_file_id INTEGER,
  description TEXT,
  prompt TEXT,
  tag TEXT,
  tags TEXT,
  voice_description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS character_outfits (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  prompt TEXT,
  image TEXT,
  tags TEXT,
  is_default INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scenes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  episode_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  prompt TEXT,
  tags TEXT,
  image TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS props (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  episode_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  prompt TEXT,
  tags TEXT,
  image TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dubbings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  storyboard_id TEXT NOT NULL,
  character_id TEXT,
  text TEXT NOT NULL,
  audio_url TEXT,
  duration REAL,
  voice_id TEXT,
  provider TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  type TEXT,
  emotion TEXT,
  audio_prompt TEXT,
  sequence INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  workflow TEXT NOT NULL,
  nodes TEXT NOT NULL,
  description TEXT,
  tags TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sample_projects (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL,
  name TEXT NOT NULL,
  duration REAL NOT NULL DEFAULT 0,
  tracks TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS canvas_data (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL UNIQUE,
  nodes TEXT NOT NULL,
  edges TEXT NOT NULL,
  version TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);

-- 对标分析任务表（仅用于存储分析任务，结果转为标准项目）
CREATE TABLE IF NOT EXISTS analysis_tasks (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  filename TEXT,
  file_path TEXT,
  result TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('image', 'video')),
  file_path TEXT NOT NULL,
  prompt TEXT,
  tags TEXT,
  description TEXT,
  width INTEGER,
  height INTEGER,
  file_size INTEGER,
  source TEXT CHECK(source IN ('generated', 'imported')),
  project_id TEXT,
  episode_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_assets_type ON media_assets(type);
CREATE INDEX IF NOT EXISTS idx_media_assets_tags ON media_assets(tags);

CREATE INDEX IF NOT EXISTS idx_episodes_project_id ON episodes(project_id);
CREATE INDEX IF NOT EXISTS idx_scripts_episode_id ON scripts(episode_id);
CREATE INDEX IF NOT EXISTS idx_storyboards_episode_id ON storyboards(episode_id);
CREATE INDEX IF NOT EXISTS idx_storyboards_project_id ON storyboards(project_id);
CREATE INDEX IF NOT EXISTS idx_characters_project_id ON characters(project_id);
CREATE INDEX IF NOT EXISTS idx_characters_episode_id ON characters(episode_id);
CREATE INDEX IF NOT EXISTS idx_character_outfits_character_id ON character_outfits(character_id);
CREATE INDEX IF NOT EXISTS idx_scenes_project_id ON scenes(project_id);
CREATE INDEX IF NOT EXISTS idx_scenes_episode_id ON scenes(episode_id);
CREATE INDEX IF NOT EXISTS idx_props_project_id ON props(project_id);
CREATE INDEX IF NOT EXISTS idx_props_episode_id ON props(episode_id);
CREATE INDEX IF NOT EXISTS idx_dubbings_storyboard_id ON dubbings(storyboard_id);
CREATE INDEX IF NOT EXISTS idx_dubbings_project_id ON dubbings(project_id);
CREATE INDEX IF NOT EXISTS idx_dubbings_character_id ON dubbings(character_id);
CREATE INDEX IF NOT EXISTS idx_sample_projects_episode_id ON sample_projects(episode_id);
CREATE INDEX IF NOT EXISTS idx_analysis_tasks_status ON analysis_tasks(status);
CREATE INDEX IF NOT EXISTS idx_analysis_tasks_file_path ON analysis_tasks(file_path);
CREATE INDEX IF NOT EXISTS idx_canvas_data_episode_id ON canvas_data(episode_id);

CREATE TABLE IF NOT EXISTS generation_tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  model TEXT,
  provider TEXT,
  project_id TEXT,
  episode_id TEXT,
  prompt TEXT,
  input_params TEXT,
  output_url TEXT,
  output_path TEXT,
  error TEXT,
  progress INTEGER DEFAULT 0,
  step_name TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 1,
  api_task_id TEXT,
  metadata TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS task_log_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  data TEXT,
  FOREIGN KEY (task_id) REFERENCES generation_tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_generation_tasks_status ON generation_tasks(status);
CREATE INDEX IF NOT EXISTS idx_generation_tasks_type ON generation_tasks(type);
CREATE INDEX IF NOT EXISTS idx_generation_tasks_project_id ON generation_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_generation_tasks_created_at ON generation_tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_task_log_entries_task_id ON task_log_entries(task_id);
`
