# FiveDesigner 工作目录结构

工作目录用于存放所有媒体文件，位于 Tauri 应用数据目录下。

## 目录树

```
{appDataDir}/
├── projects/                              # 项目根目录
│   └── {projectId}/                       # 项目目录
│       └── {episodeId}/                   # 剧集/章节目录
│           ├── assets/                    # 资产文件
│           │   ├── characters/            # 角色图片
│           │   │   └── {timestamp}_{name}.png
│           │   ├── scenes/                # 场景图片
│           │   │   └── {timestamp}_{name}.png
│           │   └── props/                 # 道具图片
│           │       └── {timestamp}_{name}.png
│           ├── storyboards/               # 分镜图片 (包括 ComfyUI 生成)
│           │   └── {timestamp}_{name}.png
│           ├── videos/                    # 生成的视频
│           │   └── {timestamp}_{name}.mp4
│           └── audios/                    # 生成的音频/配音
│               └── {timestamp}_{name}.mp3
│
└── temp/                                  # 临时文件
    └── ...
```

## 文件命名规则

```
{timestamp}_{name}.{ext}
```

- **timestamp**: Unix 时间戳（毫秒）
- **name**: 原始文件名（经过安全处理，只保留字母数字、点和下划线）
- **ext**: 文件扩展名

## 完整路径示例

```
projects/my_project/episode_01/assets/characters/1234567890_hero.png
projects/my_project/episode_01/assets/scenes/1234567890_forest.png
projects/my_project/episode_01/assets/props/1234567890_sword.png
projects/my_project/episode_01/storyboards/1234567890_shot_01.png
projects/my_project/episode_01/videos/1234567890_scene_01.mp4
projects/my_project/episode_01/audios/1234567890_line_01.mp3
```

## 元数据文件

每个媒体文件都有一个对应的 `.meta.json` 文件，位于同一目录：

```json
{
  "id": "character_1234567890_abc123",
  "name": "1234567890_hero.png",
  "originalName": "hero.png",
  "path": "/full/path/to/file",
  "relativePath": "projects/my_project/episode_01/assets/characters/1234567890_hero.png",
  "type": "character",
  "mimeType": "image/png",
  "size": 1024000,
  "createdAt": 1234567890000,
  "updatedAt": 1234567890000,
  "projectId": "my_project",
  "episodeId": "episode_01",
  "metadata": {
    "prompt": "a hero character",
    "description": "主角",
    "source": "comfyui"
  }
}
```

## 使用示例

```typescript
import { workspaceService } from '@/services/workspace';

// 初始化工作目录
await workspaceService.initialize();

// 保存文件
const metadata = await workspaceService.saveFile(
  uint8Array,                    // 文件数据
  'character',                   // 类型
  'hero.png',                    // 原始文件名
  {
    projectId: 'my_project',
    episodeId: 'episode_01',
    metadata: { prompt: 'a hero' }
  }
);

// 获取可访问的 URL
const url = await workspaceService.getAssetUrl(metadata.relativePath);

// 删除文件
await workspaceService.deleteFile(metadata.relativePath);

// 获取元数据
const meta = await workspaceService.getMetadata(metadata.relativePath);

// 列出目录内容
const characters = await workspaceService.listDirectory('character', 'my_project', 'episode_01');
```

## 资产类型

- **character**: 角色图片，保存到 `assets/characters/`
- **scene**: 场景图片，保存到 `assets/scenes/`
- **prop**: 道具图片，保存到 `assets/props/`
- **storyboard**: 分镜图片（包括 ComfyUI 生成），保存到 `storyboards/`
- **video**: 生成的视频，保存到 `videos/`
- **audio**: 生成的音频/配音，保存到 `audios/`

## 安全处理

- 所有路径组件都经过安全处理，只保留字母数字、点和下划线
- 使用 `convertFileSrc` 生成安全的 asset URL
- 元数据以 JSON 格式存储，便于检索和管理
