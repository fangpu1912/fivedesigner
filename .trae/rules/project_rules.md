# FiveDesigner 项目架构规范

## 项目架构分层

```
┌─────────────────────────────────────────────────────────────────────┐
│                           UI Layer                                   │
│  React Components (pages/, components/)                              │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────┐
│                        Server State Layer                            │
│                   TanStack Query
│   - 自动缓存 · 加载状态 · 错误处理 · 乐观更新 · 分页                  │
│   - 唯一数据源，不重复存储                                            │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │ mutationFn / queryFn
┌─────────────────────────────────▼───────────────────────────────────┐
│                      Persistence Layer                                │
│                         db/ (Tauri SQLite)                           │
│   ├── SQLite 数据库 (db/index.ts) — @tauri-apps/plugin-sql         │
│   │   ├── projectsDB - 项目                                       │
│   │   ├── episodesDB - 剧集                                      │
│   │   ├── charactersDB - 角色                                     │
│   │   ├── scenesDB - 场景                                        │
│   │   ├── propsDB - 道具                                         │
│   │   ├── storyboardsDB - 分镜                                    │
│   │   ├── dubbingDB - 配音                                        │
│   │   ├── scriptDB - 剧本                                        │
│   │   ├── workflowDB - 工作流                                     │
│   │   ├── canvasDB - 画布数据                                     │
│   │   ├── sampleProjectDB - 样片项目                               │
│   │   └── settingsDB - 设置 (key-value)                           │
│   └── Secure Store - 加密存储 (API Keys, Tokens)                   │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────┐
│                        Backend Layer                                  │
│                     Tauri / Rust                                      │
│               (SQLite 数据库存储)                                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         UI State Layer                               │
│                    Zustand (useUIStore, persist)                     │
│   - currentProjectId / currentEpisodeId (持久化到 localStorage)     │
│   - sidebarOpen / theme / activeRoute (持久化到 localStorage)       │
│   - 选中状态 / 视口状态 (Canvas, 仅内存)                             │
│   ⚠️ 仅存 UI 状态，不存项目数据！                                    │
│   ⚠️ 项目数据统一用 React Query + db/       │
└─────────────────────────────────────────────────────────────────────┘
```

## 状态管理规范

### 核心原则

1. **服务端状态 ≠ 本地状态**
   - React Query 管服务端/持久化数据
   - useState/Zustand 管 UI 临时状态

2. **单数据源原则**
   - 同一数据不要同时在 React Query cache 和 useState/localStorage 里存两份
   - React Query cache 是唯一数据源

3. **乐观更新**
   - 先改 UI，再发请求，失败自动回滚
   - 使用 onMutate + onError + setQueryData 实现

4. **自动同步**
   - 修改成功后 invalidateQueries，让 React Query 自动刷新
   - 所有 mutation 必须在 onSuccess/onSettled 中 invalidate 相关查询

### 1. Server State (数据层) - TanStack Query
- **位置**: `src/hooks/use*.ts`
- **用途**: 管理需要持久化的数据（nodes, edges, projects, episodes 等）
- **示例**:
  ```typescript
  // useCanvas.ts
  export function useCanvasQuery() {
    return useQuery({
      queryKey: canvasKeys.all,
      queryFn: () => loadCanvasFromStorage(),
    });
  }
  ```

### 2. UI State (界面层) - Zustand
- **位置**: `src/store/useUIStore.ts`
- **用途**: 管理持久化的 UI 状态（当前项目/剧集 ID、主题、侧边栏等）
- **持久化**: 使用 Zustand persist 持久化到 localStorage
- **示例**:
  ```typescript
  // useUIStore.ts - UI 状态 + 持久化的导航状态
  const currentProjectId = useUIStore(state => state.currentProjectId)
  const currentEpisodeId = useUIStore(state => state.currentEpisodeId)
  const sidebarOpen = useUIStore(state => state.sidebarOpen)
  ```
- **获取完整项目/剧集数据**: 通过 React Query hooks
  ```typescript
  const currentProjectId = useUIStore(state => state.currentProjectId)
  const { data: currentProject } = useProjectQuery(currentProjectId || '')
  const { data: currentEpisode } = useEpisodeQuery(currentEpisodeId || '')
  ```


### 3. 乐观更新实现
```typescript
export function useUpdateDubbing() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }) => dubbingDB.update(id, data),
    onMutate: async ({ id, data }) => {
      // 1. 取消正在进行的查询，防止覆盖
      await queryClient.cancelQueries({ queryKey: dubbingKeys.detail(id) });
      
      // 2. 保存旧值用于回滚
      const previousDubbing = queryClient.getQueryData(dubbingKeys.detail(id));
      
      // 3. 乐观更新
      if (previousDubbing) {
        queryClient.setQueryData(dubbingKeys.detail(id), {
          ...previousDubbing,
          ...data,
        });
      }
      
      return { previousDubbing };
    },
    onError: (_err, { id }, context) => {
      // 4. 失败时回滚
      if (context?.previousDubbing) {
        queryClient.setQueryData(dubbingKeys.detail(id), context.previousDubbing);
      }
    },
    onSettled: () => {
      // 5. 最终刷新确保数据一致
      queryClient.invalidateQueries({ queryKey: dubbingKeys.all });
    },
  });
}
```

### 4. 组合使用 - useCanvasManager
- **位置**: `src/hooks/useCanvasManager.ts`
- **用途**: 组合 Query 数据 + Zustand UI 状态，提供统一操作接口

## 目录结构规范

```
src/
├── components/          # 通用 UI 组件
├── pages/              # 页面组件
├── hooks/              # TanStack Query hooks + 业务逻辑 hooks
├── store/              # Zustand UI 状态管理 (仅 UI 状态)
├── db/                 # 数据库操作 (SQLite)
│   ├── index.ts       # 数据库入口 (SQLiteDatabase + DB 门面对象)
│   ├── schema.ts      # SQLite 建表语句、索引定义
│   ├── migrate.ts     # JSON → SQLite 迁移工具
│   └── migrations/    # 数据库版本迁移
├── services/           # 服务层 (AI, 配置等)
├── types/              # TypeScript 类型定义
└── plugins/            # 插件目录
    └── storyboard-copilot/   # 分镜助手插件
        ├── components/       # 插件组件
        ├── tools/           # 图像编辑工具
        └── types/           # 插件类型
```

### db/ 目录职责

| 文件/目录 | 职责 |
|-----------|------|
| `db/index.ts` | 数据库入口，SQLiteDatabase 类 + 所有 DB 门面对象 |
| `db/schema.ts` | SQLite 建表语句、索引定义 |
| `db/migrate.ts` | JSON → SQLite 迁移工具 |
| `db/migrations/` | 数据库版本迁移（预留） |
| 各 DB 对象 | `projectDB`, `episodeDB`, `characterDB`, `sceneDB`, `propDB`, `storyboardDB`, `dubbingDB`, `scriptDB`, `workflowDB`, `canvasDB`, `sampleProjectDB`, `settingsDB` |

```typescript
// db/index.ts 结构示例
import { projectDB, episodeDB, characterDB, sceneDB, propDB, storyboardDB, dubbingDB, scriptDB, workflowDB, canvasDB, sampleProjectDB, settingsDB } from '@/db';

// 使用示例 — 门面模式，简化外部调用
await projectDB.create(project);
await projectDB.update(id, data);
await projectDB.delete(id);
const projects = await projectDB.getAll();

// 批量操作（分镜专用）
await storyboardDB.batchCreate(items);
await storyboardDB.batchUpdate(items);
await storyboardDB.reorder(episodeId, orderedIds);

// 设置存储（key-value 模式，自动 upsert）
await settingsDB.save('currentProjectId', projectId);
const value = await settingsDB.get('currentProjectId');

// 画布数据（按 episodeId 存储）
const canvas = await canvasDB.getByEpisode(episodeId);
await canvasDB.save(episodeId, nodes, edges, version);
```

### SQLite 特性

- **数据库文件**: `sqlite:fivedesigner.db`，通过 `@tauri-apps/plugin-sql` 加载
- **PRAGMA**: `journal_mode=WAL`（并发读写）、`foreign_keys=ON`（外键约束）
- **JSON 字段**: 复杂结构（tags, character_ids, metadata 等）以 JSON 字符串存于 TEXT 列，读写自动序列化/反序列化
- **级联删除**: 外键 `ON DELETE CASCADE`，删除项目自动删除关联的剧集、角色等
- **媒体文件同步删除**: 删除记录时自动查找并删除关联的本地媒体文件（image, video, audio_url）
- **UUID 主键**: 新建记录使用 `uuidv4()` 生成
- **自动时间戳**: `created_at`/`updated_at` 自动维护

### Zustand store 职责

```
src/store/
├── useUIStore.ts       # UI 状态 (theme, sidebar, currentProjectId, currentEpisodeId)
│   └── 使用 Zustand persist 持久化到 localStorage
└── useCanvasStore.ts   # Canvas UI 状态 (选中、视口，仅内存)
```

**禁止**: 不要创建新的 Zustand store 存储项目数据，统一使用 React Query hooks + db/

## 开发规范

1. **数据操作通过 db/**，使用 `db/*` 中的方法进行持久化
2. **UI 状态使用 useUIStore**，获取当前项目/剧集 ID
3. **项目数据用 React Query**，通过 `useProjectQuery`/`useEpisodeQuery` 等获取完整数据
4. **项目数据存 db/**，不要存 localStorage 或 Zustand persist
5. **敏感数据存 SecureStore**，不要存 localStorage
6. **不要混用 localStorageService 和 db/**，统一使用 db/
7. **禁止使用 useProjectStore**，已删除，用 `useUIStore` + React Query 替代

## 常用 Hooks

### 数据查询 (React Query)
- `useProjectsQuery()` - 获取项目列表
- `useProjectQuery(id)` - 获取单个项目
- `useEpisodesQuery(projectId)` - 获取剧集列表
- `useEpisodeQuery(id)` - 获取单个剧集
- `useCanvasQuery()` - 获取画布数据
- `useSaveCanvasMutation()` - 保存画布数据

### AI 生成
- `useImageGeneration()` - 图片生成（自动拼接项目风格词）
- `useVideoGeneration()` - 视频生成
- `useTTSGeneration()` - 语音生成
- `useTextGeneration()` - 文本生成

### UI 状态 (Zustand)
- `useUIStore()` - 获取 currentProjectId/currentEpisodeId/theme/sidebarOpen

## 媒体文件处理规范

### 核心原则

1. **统一使用 `@/utils/mediaStorage`** - 所有媒体文件保存必须使用此模块
2. **路径转换统一** - 使用 `@/utils/asset` 中的 `getImageUrl/getVideoUrl/getAudioUrl` 将本地路径转为 `asset://` 协议 URL
3. **数据库存绝对路径** - 使用完整绝对路径，确保图片能正确加载
4. **文件命名规范** - `{timestamp}_{sanitized_name}.{ext}` 格式
5. **文件生命周期管理** - 删除记录时同步删除文件

### 统一 API

```typescript
// 保存媒体文件（统一使用此函数）
import { saveMediaFile } from '@/utils/mediaStorage';

// 方式1: 对象参数（推荐）
const path = await saveMediaFile(data, {
  projectId,
  episodeId,
  type: 'image', // 'image' | 'video' | 'audio'
  fileName: 'custom_name.png', // 可选
  extension: 'png', // 可选
});

// 方式2: 独立参数（兼容旧代码）
const path = await saveMediaFile(data, fileName, projectId, episodeId, 'image');

// 快捷函数
import { saveGeneratedImage, saveGeneratedVideo, saveGeneratedAudio } from '@/utils/mediaStorage';
const imagePath = await saveGeneratedImage(imageUrl, projectId, episodeId);
const videoPath = await saveGeneratedVideo(videoUrl, projectId, episodeId);
const audioPath = await saveGeneratedAudio(audioUrl, projectId, episodeId);

// 显示资源（统一使用此函数）
import { getImageUrl, getVideoUrl, getAudioUrl } from '@/utils/asset';
const displayUrl = getImageUrl(absolutePath); // 返回 asset:// URL
```

### 文件存储结构

```
{workspace_dir}/                  # 工作目录（用户可配置）
├── projects/
│   └── {projectId}/
│       └── {episodeId}/
│           ├── characters/       # 角色图片
│           ├── scenes/           # 场景图片
│           ├── props/            # 道具图片
│           ├── storyboards/      # 分镜图片
│           ├── videos/           # 生成视频
│           └── audios/           # 配音音频
├── temp/                         # 临时文件
├── tools/                        # 外部工具（如 FFmpeg）
└── workspace-config.json         # 工作目录配置
```


### 统一资源处理工具

```typescript
// src/utils/asset.ts
import { convertFileSrc } from '@tauri-apps/api/core';

export function getAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  
  // 远程 URL 直接返回
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  
  // asset:// 协议已转换过
  if (path.startsWith('asset://')) {
    return path;
  }
  
  // 本地路径转换
  return convertFileSrc(path);
}
```

### WorkspaceService 使用

```typescript
// 保存文件
const metadata = await workspaceService.saveFile(
  imageData,
  'character',
  'character_001.png',
  { projectId, episodeId }
);

// 获取显示 URL（使用绝对路径）
const displayUrl = await workspaceService.getAssetUrl(metadata.path);

// 删除文件（使用绝对路径）
await workspaceService.deleteFile(metadata.path);
```

### Tauri 配置

```json
// tauri.conf.json
{
  "security": {
    "assetProtocol": {
      "enable": true,
      "scope": { "allow": ["**"] }
    }
  }
}
```

### 注意事项

- 数据库存储绝对路径，确保图片能正确加载
- 删除记录时需同步删除对应文件，避免磁盘空间浪费
- 使用 `WorkspaceService` 统一管理文件，不要直接操作文件系统

## Tauri Dialog 插件规范

### 核心原则

1. **使用原生对话框** - 使用 `@tauri-apps/plugin-dialog` 而非浏览器 `window.confirm/alert`
2. **异步确认** - 删除操作必须先弹出确认对话框，用户确认后再执行
3. **保存选择** - 下载文件时弹出保存对话框，让用户选择保存位置

### API 概览

| 函数 | 用途 | 返回值 |
|------|------|--------|
| `open()` | 打开文件/文件夹选择对话框 | `string \| string[] \| null` |
| `save()` | 打开保存对话框 | `string \| null` |
| `confirm()` | 确认对话框（确定/取消） | `Promise<boolean>` |
| `message()` | 消息对话框 | `Promise<void>` |

### 删除确认

```typescript
import { confirm } from '@tauri-apps/plugin-dialog';

// 删除前确认
const handleDelete = async (id: string) => {
  const confirmed = await confirm('确定要删除吗？此操作不可恢复。', {
    title: '删除确认',
    kind: 'warning',
    okLabel: '确定',
    cancelLabel: '取消',
  });
  
  if (!confirmed) return;  // 用户取消
  
  // 执行删除
  await deleteItem(id);
};
```

### 文件下载/保存

```typescript
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

const handleDownload = async (url: string, defaultName: string) => {
  // 1. 弹出保存对话框
  const savePath = await save({
    defaultPath: defaultName,
    filters: [
      { name: '图片文件', extensions: ['png', 'jpg', 'webp'] },
      { name: '所有文件', extensions: ['*'] },
    ],
    title: '保存文件',
  });
  
  if (!savePath) return;  // 用户取消
  
  // 2. 下载文件
  const response = await fetch(url);
  const blob = await response.blob();
  const arrayBuffer = await blob.arrayBuffer();
  
  // 3. 保存到用户选择的位置
  await writeFile(savePath, new Uint8Array(arrayBuffer));
};
```

### 批量导出

```typescript
import { open } from '@tauri-apps/plugin-dialog';

const handleBatchExport = async () => {
  // 选择保存目录
  const dir = await open({
    directory: true,
    title: '选择保存目录',
  });
  
  if (!dir) return;  // 用户取消
  
  // 批量保存文件到选择的目录
  for (const item of items) {
    const savePath = `${dir}/${item.name}.wav`;
    await writeFile(savePath, item.data);
  }
};
```

### 文件选择（最佳实践）

**原则：使用 Tauri Dialog 替代浏览器 `<input type="file">`**

浏览器原生的文件选择器无法获取文件的绝对路径（安全限制），只能得到 `data:` URL 或 `blob:` URL。在 Tauri 应用中，应该使用 `open()` API 直接获取文件的绝对路径。

```typescript
import { open } from '@tauri-apps/plugin-dialog';

// ❌ 错误 - 浏览器方式，只能获取 data: URL
const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result; // data:image/png;base64,...
    // 需要额外处理才能使用
  };
  reader.readAsDataURL(file);
};

// ✅ 正确 - Tauri 方式，直接获取绝对路径
const handleFileSelect = async () => {
  const selected = await open({
    multiple: true,  // 允许多选
    filters: [
      { name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
      { name: '所有文件', extensions: ['*'] },
    ],
    title: '选择文件',
  });
  
  if (!selected) return;  // 用户取消
  
  // 返回的是绝对路径
  const paths = Array.isArray(selected) ? selected : [selected];
  // paths: ['C:\Users\...\image.png', ...]
  
  // 可以直接用于 Tauri 文件操作或上传到 ComfyUI
  for (const filePath of paths) {
    await uploadToComfyUI(filePath);
  }
};
```

**组件示例：**

```typescript
import { open } from '@tauri-apps/plugin-dialog';
import { Upload } from 'lucide-react';

const FileSelector = ({ onSelect }: { onSelect: (paths: string[]) => void }) => {
  const handleClick = async () => {
    const selected = await open({
      multiple: true,
      filters: [{ name: '图片', extensions: ['png', 'jpg'] }],
    });
    
    if (selected) {
      const paths = Array.isArray(selected) ? selected : [selected];
      onSelect(paths);
    }
  };
  
  return (
    <button onClick={handleClick}>
      <Upload /> 选择文件
    </button>
  );
};
```

### 权限配置

```json
// src-tauri/capabilities/main-capability.json
{
  "permissions": [
    "dialog:default",
    "fs:default",
    "fs:allow-appdata-write-recursive"
  ]
}
```

### 注意事项

- 不要使用 `window.confirm`、`window.alert`，它们会阻塞 UI 且样式不统一
- 确认对话框使用 `kind: 'warning'` 表示危险操作
- 保存对话框提供合理的 `defaultPath` 和 `filters`
- 用户取消时返回 `null`，需要检查处理

## 测试规范

### 测试框架

- **单元测试**: Vitest
- **E2E 测试**: Playwright
- **测试库**: @testing-library/react

### 测试文件位置

```
src/
├── components/
│   └── ui/
│       └── __tests__/
│           └── button.test.tsx
├── hooks/
│   └── __tests__/
│       └── useProjects.test.tsx
├── services/
│   └── __tests__/
│       └── aiService.test.ts
└── db/
    └── __tests__/
        └── index.test.ts
```

### 测试命名规范

```typescript
describe('useProjects', () => {
  it('should fetch projects successfully', async () => {
    // ...
  });

  it('should handle error when fetch fails', async () => {
    // ...
  });
});
```

### 测试覆盖率要求

| 类型 | 最低覆盖率 |
|------|-----------|
| 核心业务逻辑 | 80% |
| Hooks | 70% |
| 工具函数 | 90% |
| UI 组件 | 50% |

### 运行测试

```bash
npm run test          # 运行单元测试
npm run test:coverage # 运行覆盖率报告
npm run test:e2e      # 运行 E2E 测试
```

## 错误处理规范

### 1. 全局错误边界

```typescript
// App.tsx
import { AppErrorBoundary } from '@/components/app/AppErrorBoundary';

function App() {
  return (
    <AppErrorBoundary>
      <Router>...</Router>
    </AppErrorBoundary>
  );
}
```

### 2. 异步函数错误处理

```typescript
// ✅ 正确
const handleSave = async () => {
  try {
    await saveData(data);
    toast({ title: '保存成功' });
  } catch (error) {
    toast({ 
      title: '保存失败', 
      description: error instanceof Error ? error.message : '请重试',
      variant: 'destructive' 
    });
  }
};

// ❌ 错误
const handleSave = async () => {
  await saveData(data);  // 没有 try-catch
  toast({ title: '保存成功' });
};
```

### 3. React Query 错误处理

```typescript
export function useProjects() {
  return useQuery({
    queryKey: projectKeys.all,
    queryFn: () => projectDB.getAll(),
    throwOnError: false,  // 不抛出错误，由组件处理
  });
}

// 组件中处理
const { data, error, isLoading } = useProjects();

if (error) {
  return <ErrorState message={error.message} />;
}
```

### 4. 用户友好错误提示

```typescript
// 使用 toast 显示错误
import { useToast } from '@/hooks/useToast';

const { toast } = useToast();

toast({
  title: '操作失败',
  description: '具体错误信息',
  variant: 'destructive',
});
```

## 安全规范

### 1. API Key 存储

```typescript
// ❌ 不安全 - 明文存储
localStorage.setItem('apiKey', apiKey);

// ✅ 安全 - 使用 Tauri Store 加密存储
import { Store } from '@tauri-apps/plugin-store';

const store = new Store('config.json');
await store.set('apiKey', { value: apiKey, encrypted: true });
```

### 2. 敏感信息处理

- 不要在代码中硬编码 API Key
- 不要在日志中输出敏感信息
- 不要在错误消息中暴露系统路径

### 3. Tauri 权限配置

```json
// src-tauri/capabilities/main-capability.json
{
  "permissions": [
    "fs:default",
    "fs:allow-appdata-read-recursive",
    "fs:allow-appdata-write-recursive",
    "dialog:default",
    "http:default"
  ]
}
```

### 4. 文件访问控制

- 只允许访问应用数据目录
- 用户选择的文件通过对话框 API 授权
- 不直接暴露系统路径给前端

## 性能优化规范

### 1. 图片优化

```typescript
// 使用懒加载
import { LazyImage } from '@/components/media/LazyImage';

<LazyImage 
  src={imageUrl} 
  alt="描述"
  placeholder={<Skeleton />}
/>

// 使用缩略图
const thumbnailUrl = getThumbnailUrl(imageUrl, 200);
```

### 2. 列表优化

```typescript
// 大列表使用虚拟滚动
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={600}
  itemCount={items.length}
  itemSize={100}
>
  {({ index, style }) => (
    <div style={style}>
      <ItemComponent item={items[index]} />
    </div>
  )}
</FixedSizeList>
```

### 3. React Query 优化

```typescript
// 设置合理的缓存时间
useQuery({
  queryKey: ['data'],
  queryFn: fetchData,
  staleTime: 5 * 60 * 1000,  // 5 分钟内不重新获取
  gcTime: 10 * 60 * 1000,    // 10 分钟后清除缓存
});

// 使用 prefetch 预加载
queryClient.prefetchQuery({
  queryKey: ['data', id],
  queryFn: () => fetchData(id),
});
```

### 4. 组件懒加载

```typescript
// 路由级别懒加载
const VideoGenerate = lazy(() => import('@/pages/VideoGenerate'));

// 大组件懒加载
const HeavyComponent = lazy(() => import('./HeavyComponent'));
```

## 代码质量规范

### 1. TypeScript 规范

```typescript
// ✅ 使用类型定义
interface User {
  id: string;
  name: string;
}

// ❌ 使用 any
const user: any = {};

// ✅ 使用可选链
const name = user?.profile?.name;

// ✅ 使用空值合并
const displayName = name ?? '未知';
```

### 2. 组件规范

```typescript
// 组件命名：PascalCase
export function UserProfile() {}

// Props 接口命名：组件名 + Props
interface UserProfileProps {
  userId: string;
  onUpdate?: (user: User) => void;
}

// 使用解构赋值
export function UserProfile({ userId, onUpdate }: UserProfileProps) {}
```

### 3. 函数命名规范

| 前缀 | 用途 | 示例 |
|------|------|------|
| `handle` | 事件处理 | `handleClick`, `handleSubmit` |
| `on` | 回调 Props | `onClick`, `onChange` |
| `fetch` | 获取数据 | `fetchUsers`, `fetchProject` |
| `use` | React Hook | `useProjects`, `useCanvas` |
| `is/has` | 布尔值 | `isLoading`, `hasError` |
| `get` | 计算属性 | `getDisplayName`, `getTotalPrice` |

### 4. 注释规范

```typescript
/**
 * 获取用户信息
 * @param userId - 用户 ID
 * @returns 用户信息，如果不存在返回 null
 */
async function getUser(userId: string): Promise<User | null> {
  // 实现...
}

// TODO: 后续优化性能
// FIXME: 修复边界情况
// HACK: 临时解决方案
```

### 5. 代码检查

```bash
npm run lint        # 运行 ESLint
npm run lint:fix    # 自动修复
npm run typecheck   # 类型检查
npm run format      # 格式化代码
```

## 节点功能开发规范

### 1. 复用项目原有功能

在开发 Storyboard Copilot 插件的节点功能时，**必须优先复用项目中已有的功能和函数**，避免重复实现：

#### AI 服务调用
- **文本生成**：使用 `AI.Text.generate`（通过 `useTextGeneration` hook）
- **视觉分析**：使用 `AI.VL.analyze`（用于图片/视频分析）
- **图片生成**：使用 `AI.Image.generate`（通过 `useImageGeneration` hook）
- **供应商代码**：复用 `src/services/vendor/codes/` 中的供应商实现

#### 文件处理
- **读取本地文件**：使用 `@tauri-apps/plugin-fs` 的 `readFile`
- **保存媒体文件**：使用 `saveMediaFile` from `@/utils/mediaStorage`
- **路径转换**：使用 `getImageUrl`/`getVideoUrl`/`getAudioUrl` from `@/utils/asset`

#### 数据流
- **获取上游数据**：使用 `useUpstreamData` hook
- **节点间通信**：通过 React Flow 的 `useReactFlow`（`updateNodeData`, `addNodes`, `addEdges`）

#### 示例：图片反推节点
```typescript
// ✅ 正确 - 复用 AI.VL.analyze
import { AI } from '@/services/vendor'

const result = await AI.VL.analyze({
  messages: [
    { role: 'user', content: analysisPrompt },
    { role: 'user', content: `图片文件: ${imageUrl}` }
  ],
  temperature: 0.7,
  maxTokens: 2048,
})

// ❌ 错误 - 自己实现 fetch 调用
const response = await fetch('https://api.example.com/analyze', {...})
```

### 2. 节点数据流规范

#### 数据传递标准
节点生成结果后，必须将数据保存到标准字段，方便下游节点通过 `useUpstreamData` 获取：

| 数据类型 | 节点字段 | 下游获取方式 |
|---------|---------|------------|
| 图片 | `imageUrl` / `previewImageUrl` | `getUpstreamImageData()` |
| 视频 | `videoUrl` | `getUpstreamVideoData()` |
| 音频 | `audioUrl` | `getUpstreamAudioData()` |
| 文本/提示词 | `prompt` / `text` / `content` | `getUpstreamTextData()` |

#### 生成节点示例
```typescript
// ✅ 正确 - 将结果保存到标准字段
updateNodeData(id, {
  ...data,
  prompt: generatedPrompt,      // 下游通过 getUpstreamTextData() 获取
  imageUrl: generatedImageUrl,  // 下游通过 getUpstreamImageData() 获取
})

// ❌ 错误 - 保存到非标准字段
updateNodeData(id, {
  ...data,
  result: generatedPrompt,      // 下游无法获取
  output: generatedImageUrl,    // 下游无法获取
})
```

#### 复杂数据结构（items 数组）
对于批量生成节点（如 VideoGenNode），数据存储在 `items` 数组中：
```typescript
// useUpstreamData 会自动从 items 数组中提取数据
const items = [
  { prompt: '提示词1', videoUrl: '视频1.mp4', status: 'completed' },
  { prompt: '提示词2', videoUrl: '视频2.mp4', status: 'completed' },
]
```

#### 输入数据
- **获取上游数据**：通过 `useUpstreamData` hook
- **自动接收**：节点挂载时自动检查上游数据并更新

### 3. 节点类型定义

新增节点类型时，需要在以下文件中添加定义：
1. `src/plugins/storyboard-copilot/types/index.ts` - 数据接口
2. `src/plugins/storyboard-copilot/utils/nodeDefinitions.ts` - 节点定义
3. `src/plugins/storyboard-copilot/components/flow-nodes/index.ts` - 组件注册
4. `src/plugins/storyboard-copilot/components/NodeLibraryPanel.tsx` - 图标注册

## 生产发布检查清单

### 必须完成

- [ ] 所有 `TODO`/`FIXME` 注释已处理
- [ ] 所有 `async` 函数有 `try-catch`
- [ ] API Key 加密存储
- [ ] 核心功能测试通过
- [ ] 无 TypeScript 错误
- [ ] 无 ESLint 警告

### 建议完成

- [ ] 测试覆盖率 60%+
- [ ] 性能优化（懒加载、虚拟列表）
- [ ] 错误监控配置
- [ ] 用户文档

### 发布前验证

```bash
# 1. 代码检查
npm run lint
npm run typecheck

# 2. 运行测试
npm run test:coverage

# 3. 构建验证
npm run build
npm run tauri:build

# 4. E2E 测试
npm run test:e2e
```

## Tauri 特有规范

### 1. Tauri 命令规范

```rust
// src-tauri/src/lib.rs
use tauri::command;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ApiResponse<T> {
    success: bool,
    data: Option<T>,
    error: Option<String>,
}

#[command]
async fn get_user(id: String) -> Result<ApiResponse<User>, String> {
    match fetch_user(&id).await {
        Ok(user) => Ok(ApiResponse {
            success: true,
            data: Some(user),
            error: None,
        }),
        Err(e) => Ok(ApiResponse {
            success: false,
            data: None,
            error: Some(e.to_string()),
        }),
    }
}
```

**命名规范**：
- 命令函数使用 `snake_case`
- 返回值使用 `Result<T, String>`
- 错误信息使用中文，用户友好

### 2. 前端调用 Tauri 命令

```typescript
import { invoke } from '@tauri-apps/api/core';

// ✅ 正确 - 带类型定义
interface User {
  id: string;
  name: string;
}

const user = await invoke<User>('get_user', { id: '123' });

// ✅ 正确 - 带错误处理
try {
  const result = await invoke<ApiResponse<User>>('get_user', { id: '123' });
  if (!result.success) {
    throw new Error(result.error);
  }
  return result.data;
} catch (error) {
  toast({ title: '获取用户失败', description: String(error), variant: 'destructive' });
}
```

### 3. Tauri 插件使用

| 插件 | 用途 | 导入方式 |
|------|------|---------|
| `@tauri-apps/plugin-dialog` | 文件对话框 | `import { open, save, confirm }` |
| `@tauri-apps/plugin-fs` | 文件系统 | `import { readFile, writeFile }` |
| `@tauri-apps/plugin-http` | HTTP 请求 | `import { fetch }` |
| `@tauri-apps/plugin-store` | 持久化存储 | `import { Store }` |
| `@tauri-apps/plugin-sql` | 数据库 | `import { Database }` |
| `@tauri-apps/plugin-log` | 日志 | `import { info, error }` |
| `@tauri-apps/plugin-opener` | 打开链接 | `import { openUrl }` |

### 4. 窗口管理

```typescript
import { getCurrentWindow } from '@tauri-apps/api/window';

// 获取当前窗口
const window = getCurrentWindow();

// 窗口操作
await window.minimize();
await window.maximize();
await window.close();

// 监听窗口事件
import { onWindowEvent } from '@tauri-apps/api/window';

onWindowEvent('close', async (event) => {
  const confirmed = await confirm('确定要关闭吗？未保存的数据将丢失。', {
    title: '关闭确认',
    kind: 'warning',
  });
  if (!confirmed) {
    event.preventDefault();
  }
});
```

### 5. 应用生命周期

```typescript
import { onAppEvent } from '@tauri-apps/api/app';

// 应用启动完成
onAppEvent('ready', () => {
  console.log('应用已启动');
});

// 应用即将退出
onAppEvent('before-exit', async () => {
  // 保存未保存的数据
  await saveUnsavedData();
});
```

### 6. 自动更新

```rust
// src-tauri/tauri.conf.json
{
  "plugins": {
    "updater": {
      "active": true,
      "endpoints": ["https://your-domain.com/api/update/{{target}}/{{arch}}/{{current_version}}"],
      "pubkey": "YOUR_PUBLIC_KEY"
    }
  }
}
```

```typescript
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

const update = await check();

if (update?.available) {
  const confirmed = await confirm(`发现新版本 ${update.version}，是否更新？`, {
    title: '更新可用',
    kind: 'info',
  });
  
  if (confirmed) {
    await update.downloadAndInstall();
    await relaunch();
  }
}
```

### 7. 跨平台兼容性

```typescript
import { platform } from '@tauri-apps/plugin-os';

const currentPlatform = await platform();

// 平台特定处理
if (currentPlatform === 'windows') {
  // Windows 特定逻辑
} else if (currentPlatform === 'macos') {
  // macOS 特定逻辑
} else if (currentPlatform === 'linux') {
  // Linux 特定逻辑
}

// 文件路径分隔符
import { join } from '@tauri-apps/api/path';
const filePath = await join(baseDir, 'subdir', 'file.txt');
```

### 8. 日志规范

```typescript
import { info, warn, error, debug } from '@tauri-apps/plugin-log';

// 日志级别
await debug('调试信息');      // 开发环境
await info('常规信息');       // 生产环境
await warn('警告信息');       // 需要注意
await error('错误信息');      // 错误记录

// 带结构的日志
await info(`用户操作: ${action}`, {
  userId,
  action,
  timestamp: Date.now(),
});
```

### 9. 安全配置

```json
// src-tauri/tauri.conf.json
{
  "security": {
    "csp": "default-src 'self'; img-src 'self' asset: https:; connect-src 'self' https://api.example.com",
    "assetProtocol": {
      "enable": true,
      "scope": {
        "allow": ["$APPDATA/**", "$RESOURCE/**"],
        "deny": ["**/.env", "**/secrets/**"]
      }
    }
  },
  "allowlist": {
    "all": false,
    "fs": {
      "scope": ["$APPDATA/**"]
    },
    "shell": {
      "open": true
    }
  }
}
```

### 10. 打包配置

```json
// src-tauri/tauri.conf.json
{
  "bundle": {
    "active": true,
    "targets": ["msi", "nsis"],  // Windows
    "identifier": "com.fivedesigner.app",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "windows": {
      "certificateThumbprint": null,
      "digestAlgorithm": "sha256",
      "timestampUrl": ""
    }
  }
}
```

### 11. 开发调试

```bash
# 开发模式
npm run tauri:dev

# 构建生产版本
npm run tauri:build

# 查看日志
# Windows: %APPDATA%\com.fivedesigner.app\logs
# macOS: ~/Library/Logs/com.fivedesigner.app
# Linux: ~/.local/share/com.fivedesigner.app/logs
```

### 12. 常见问题处理

```typescript
// 处理 Tauri API 不可用（Web 环境兼容）
async function readFile(path: string): Promise<Uint8Array> {
  if (window.__TAURI__) {
    // Tauri 环境
    const { readFile: tauriReadFile } = await import('@tauri-apps/plugin-fs');
    return tauriReadFile(path);
  } else {
    // Web 环境（开发预览）
    throw new Error('文件系统仅在桌面应用中可用');
  }
}

// 检测运行环境
const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;
```

## 日志规范

### 统一日志工具

项目已创建 `src/utils/logger.ts` 统一日志工具，**必须使用此工具替代 console.log**：

```typescript
import logger from '@/utils/logger';

// 调试日志 - 仅开发环境输出
logger.debug('调试信息:', data);

// 常规日志 - 生产环境写入 Tauri log
logger.info('操作成功');

// 警告日志
logger.warn('资源占用较高');

// 错误日志
logger.error('操作失败:', error);

// 普通日志 - 仅开发环境输出
logger.log('临时调试信息');
```

### 日志级别使用场景

| 级别 | 使用场景 | 开发环境 | 生产环境 |
|------|---------|---------|---------|
| `debug` | 详细调试信息 | ✓ 输出 | ✗ 不输出 |
| `log` | 临时调试信息 | ✓ 输出 | ✗ 不输出 |
| `info` | 常规操作日志 | ✓ 输出 | ✓ 写入文件 |
| `warn` | 警告信息 | ✓ 输出 | ✓ 写入文件 |
| `error` | 错误信息 | ✓ 输出 | ✓ 写入文件 |

### 禁止事项

```typescript
// 开发环境可使用 console.log
console.log('调试信息');

// ❌ 禁止在生产代码中保留调试日志
console.log('临时调试');

// ✅ 正确 - 使用 logger 工具
logger.debug('调试信息');

// ✅ 正确 - 开发环境条件判断
if (import.meta.env.DEV) {
  logger.debug('详细调试信息');
}
```

### 错误处理规范

```typescript
// ✅ 正确 - 有日志和用户提示
try {
  await saveData(data);
  toast({ title: '保存成功' });
} catch (error) {
  logger.error(`保存失败: ${(error as Error).message}`);
  toast({ 
    title: '保存失败', 
    description: (error as Error).message,
    variant: 'destructive' 
  });
}

// ❌ 错误 - 只有 console.error，无用户提示
try {
  await saveData(data);
} catch (error) {
  console.error('Failed to save:', error);
}
```

## 配置管理规范

### 配置文件位置

```
src/
├── config/
│   ├── appPages.tsx      # 页面路由配置
│   ├── constants.ts      # 常量配置
│   └── categories.ts     # 分类配置（如需要）
```

### 硬编码配置抽取

```typescript
// ❌ 错误 - 硬编码在组件中
const categories = ['character', 'scene', 'prop'];

// ✅ 正确 - 抽取到配置文件
// src/config/categories.ts
export const ASSET_CATEGORIES = [
  { id: 'character', name: '角色', icon: User },
  { id: 'scene', name: '场景', icon: Mountain },
  { id: 'prop', name: '道具', icon: Box },
] as const;
```

### 环境变量

```typescript
// .env.example
VITE_API_URL=https://api.example.com
VITE_APP_VERSION=1.0.0

// 使用
const apiUrl = import.meta.env.VITE_API_URL;
```

## 功能开发规范

### 功能状态标识

如果功能正在开发中，应该：

1. **UI 提示**：显示友好的提示信息
2. **禁用状态**：相关按钮设为禁用
3. **代码注释**：标记开发状态

```typescript
// 功能开发中示例
{isFeatureEnabled ? (
  <FeatureComponent />
) : (
  <div className="flex items-center justify-center p-8 text-muted-foreground">
    <div className="text-center">
      <FeatureIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
      <p>该功能正在开发中，敬请期待</p>
    </div>
  </div>
)}
```

### 功能开关

```typescript
// src/config/features.ts
export const FEATURES = {
  DOCUMENT_PREVIEW: false,  // 文档预览
  STATISTICS: false,        // 统计功能
  BATCH_EXPORT: true,       // 批量导出
} as const;

// 使用
if (FEATURES.DOCUMENT_PREVIEW) {
  // 显示预览功能
} else {
  // 显示开发中提示
}
```

## AI 服务集成规范

### 供应商特定代码修改原则

**重要原则：供应商特定的参数转换和处理逻辑，必须在具体供应商代码中实现，而不是修改通用层。**

```typescript
// ❌ 错误 - 在通用层处理供应商特定逻辑
// useVendorGeneration.ts
const config = {
  aspectRatio: isMiniMax 
    ? convertToMiniMaxRatio(width, height)  // 不要这样做
    : `${width}:${height}`
}

// ✅ 正确 - 在供应商代码中处理特定逻辑
// minimax.js
async imageRequest(model) {
  return async (params) => {
    const requestBody = {
      aspect_ratio: this.convertToMiniMaxAspectRatio(params.aspectRatio),
      // ...
    };
  };
}
```

**原因：**
1. **可维护性**：每个供应商的代码独立，修改不影响其他供应商
2. **可扩展性**：新增供应商只需添加新文件，无需修改通用代码
3. **清晰性**：供应商特定逻辑集中在对应文件中，便于理解和调试

### 图片生成服务

| 功能 | 说明 | 支持模型 |
|------|------|---------|
| 文生图 | 文本提示词生成图片 | Seedream、Nano Banana、Kling Image |
| 图生图 | 参考图片生成新图片 | Seedream、Kling Image、Nano Banana |
| 多参考生图 | 多张参考图生成图片 | Seedream、Kling Image、Nano Banana |

### 视频生成服务

| 功能 | 说明 | 支持模型 |
|------|------|---------|
| 文生视频 | 文本提示词生成视频 | Seedance、Kling Video、Hailuo、Vidu、Veo 3.1系列 |
| 图生视频 | 图片生成视频 | Seedance、Kling Video、Hailuo、Vidu、Veo 3.1系列 |
| 首尾帧 | 首帧+尾帧生成中间视频 | Seedance、Kling Video、Hailuo、Vidu、Veo 3.1系列 |
| 多参考生视频 | 多张参考图生成视频 | Seedance、Kling Video、Hailuo、Vidu、Veo 3.1系列 |

### AI 生成 Hooks 使用规范

项目使用 `useVendorGeneration` hooks 进行 AI 生成，而非直接调用 AIService。

```typescript
import {
  useImageGeneration,
  useVideoGeneration,
  useTTSGeneration,
  useTextGeneration,
  buildFullPrompt,
} from '@/hooks/useVendorGeneration';

// 图片生成
const imageGeneration = useImageGeneration();

const handleGenerateImage = async () => {
  const imageUrl = await imageGeneration.mutateAsync({
    prompt: 'a beautiful sunset over the ocean',
    width: 1024,
    height: 576,
    projectId: currentProjectId,
    episodeId: currentEpisodeId,
    imageUrl: referenceImage,           // 图生图参考图
    referenceImages: [ref1, ref2],      // 多参考生图
  });
};

// 视频生成
const videoGeneration = useVideoGeneration();

const handleGenerateVideo = async () => {
  const videoUrl = await videoGeneration.mutateAsync({
    prompt: 'a cat walking on the beach',
    width: 1280,
    height: 720,
    firstFrame: imageUrl,               // 首帧
    lastFrame: lastFrameUrl,            // 尾帧（可选）
    referenceImages: [ref1, ref2],      // 参考图
    duration: 5,
    generateAudio: true,
    projectId: currentProjectId,
  });
};

// TTS 生成
const ttsGeneration = useTTSGeneration();

const handleTTS = async () => {
  const audioUrl = await ttsGeneration.mutateAsync({
    text: '你好，世界',
    voice: 'default',
    speed: 1.0,
  });
};

// 文本生成
const textGeneration = useTextGeneration();

const handleChat = async () => {
  const response = await textGeneration.mutateAsync({
    messages: [{ role: 'user', content: 'Hello' }],
    temperature: 0.7,
    maxTokens: 2048,
  });
};
```

### 模型选择

模型通过 `model` 参数指定，格式为 `provider:model-name`：

```typescript
// 图片模型
const imageModels = [
  'official:claude-sonnet-4-6',  // 默认
  'kling:Kling-Image',
  'nano:banana',
];

// 视频模型
const videoModels = [
  'official:Wan2.6-I2V-1080P',  // 默认
  'kling:Kling-Video',
  'hailuo:Hailuo-Video',
];
```

## ComfyUI 集成规范

### 核心架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                      ComfyUI Service Layer                          │
│                   src/services/comfyuiService.ts                     │
│   - WebSocket 连接管理                                               │
│   - 工作流队列管理                                                    │
│   - 进度监听与回调                                                    │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────┐
│                    Workflow Config Layer                            │
│              src/services/workflowConfigService.ts                   │
│   - 工作流模板管理                                                    │
│   - 节点映射配置                                                      │
│   - 参数解析与应用                                                    │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────┐
│                      UI Component Layer                             │
│            src/components/ai/ComfyUIParamsPanel.tsx                  │
│   - 参数面板组件                                                      │
│   - 工作流参数解析                                                    │
│   - 用户交互界面                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### ComfyUI 服务使用

```typescript
import { 
  ComfyUIService, 
  initComfyUIService, 
  getComfyUIService,
  setComfyUIContext 
} from '@/services/comfyuiService';

// 初始化服务
const comfyUI = initComfyUIService('http://127.0.0.1:8188', projectId, episodeId);

// 连接 WebSocket
await comfyUI.connect();

// 监听进度
const cleanup = comfyUI.onProgress((progress) => {
  console.log(`进度: ${progress.value}/${progress.max}`);
});

// 提交工作流
const response = await comfyUI.queuePrompt(workflow);

// 等待完成
const history = await comfyUI.waitForCompletion(response.prompt_id);

// 获取生成的图片
for (const nodeId of Object.keys(history.outputs)) {
  const output = history.outputs[nodeId];
  if (output?.images) {
    for (const image of output.images) {
      const imageUrl = await comfyUI.getImage(
        image.filename, 
        image.subfolder, 
        image.type
      );
    }
  }
}

// 断开连接
comfyUI.disconnect();
```

### 工作流参数面板使用

```typescript
import { 
  ComfyUIParamsPanel, 
  parseWorkflowParams, 
  applyParamsToWorkflow,
  type ComfyUIParams 
} from '@/components/ai/ComfyUIParamsPanel';

// 在组件中使用
const [params, setParams] = useState<ComfyUIParams>({});

<ComfyUIParamsPanel
  workflow={selectedWorkflow}
  params={params}
  onChange={setParams}
  onParamsReady={(getParams) => {
    // 获取当前参数的方法
    const currentParams = getParams();
  }}
  onPromptChange={(prompt, negativePrompt) => {
    // 提示词变化时同步到 AI 面板
  }}
  project={currentProject}
  storyboard={currentStoryboard}
  referenceImages={referenceImages}
/>

// 应用参数到工作流
const workflowWithParams = applyParamsToWorkflow(workflow, params);
```

### 工作流节点映射规范

```typescript
// 工作流配置示例
interface WorkflowConfig {
  id: string;
  name: string;
  type: 'txt2img' | 'img2img' | 'img2vid' | 'tts';
  workflow: Record<string, unknown>;
  nodes: {
    // 提示词节点
    prompt?: string;        // 正向提示词节点 ID
    negativePrompt?: string; // 负向提示词节点 ID
    // 图像节点
    image?: string;         // 输入图像节点 ID
    width?: string;         // 宽度节点 ID
    height?: string;        // 高度节点 ID
    // 采样器节点
    seed?: string;          // 种子节点 ID
    steps?: string;         // 步数节点 ID
    cfg?: string;           // CFG 节点 ID
    sampler?: string;       // 采样器节点 ID
    scheduler?: string;     // 调度器节点 ID
    // 视频节点
    frameCount?: string;    // 帧数节点 ID
    fps?: string;           // 帧率节点 ID
    videoLength?: string;   // 视频长度节点 ID
    // 音频节点
    audioText?: string;     // 配音文本节点 ID
    voiceId?: string;       // 音色节点 ID
    emotion?: string;       // 情绪节点 ID
    // 输出节点
    output?: string;        // 输出节点 ID
  };
}
```

### 进度监听与错误处理

```typescript
// 监听多种事件
const cleanups: (() => void)[] = [];

// 进度更新
cleanups.push(comfyUI.on('progress', (event) => {
  const { value, max } = event.data;
  setProgress(value / max * 100);
}));

// 执行完成
cleanups.push(comfyUI.on('executed', (event) => {
  console.log('执行完成:', event.data);
}));

// 执行错误
cleanups.push(comfyUI.on('execution_error', (event) => {
  console.error('执行错误:', event.data);
  toast({ title: '生成失败', variant: 'destructive' });
}));

// 清理监听器
return () => cleanups.forEach(cleanup => cleanup());
```

### 项目上下文管理

```typescript
// 切换项目/剧集时更新上下文
import { setComfyUIContext } from '@/services/comfyuiService';

// 在项目切换时调用
useEffect(() => {
  setComfyUIContext(projectId, episodeId);
}, [projectId, episodeId]);
```

## 统一资源工具使用规范

项目已创建 `src/utils/asset.ts` 统一资源处理工具，使用方式：

```typescript
import { getAssetUrl, getImageUrl, getVideoUrl, getAudioUrl } from '@/utils/asset';

// 获取图片 URL
const imageUrl = getImageUrl(storyboard.image);

// 获取视频 URL
const videoUrl = getVideoUrl(dubbing.audio_url);

// 获取音频 URL
const audioUrl = getAudioUrl(asset.path);

// 检测文件类型
import { isImageFile, isVideoFile, isAudioFile, getMediaType } from '@/utils/asset';

if (isImageFile(path)) {
  // 处理图片
}
```
- 使用严格 TypeScript 配置 ( tsconfig.json 中 strict: true )
- 使用 ESLint + Prettier 统一代码风格
- 使用 Husky + lint-staged 提交前自动检查
- 使用 Tauri 官方插件 而不是自定义实现

**注意**：新代码应使用此工具，不要重复定义 `getImageUrl` 等函数。


### 提示词构建

图片生成会自动拼接项目风格词：

```typescript
import { buildFullPrompt } from '@/hooks/useVendorGeneration';

// 自动拼接：视觉风格 + 基础提示词 + 质量词
const fullPrompt = await buildFullPrompt(projectId, 'a beautiful sunset');
// 结果："anime style, a beautiful sunset, high quality, detailed"
```

## 提示词模板规范

### 基础模板字段规范

所有预设包、AI生成模板必须基于以下基础模板，**保持原有字段数量，只丰富提示词内容**。

#### 1. 角色提取模板（3个字段）

```typescript
{
  "characters": [
    {
      "name": "角色名（保留原文）",
      "description": "角色描述（外貌、性格、职业等）",
      "prompt": "AI生图提示词（中文，包含：人物名+年龄段+体型+五官+发型+肤色+服装+配饰+姿态+表情）"
    }
  ]
}
```

**prompt字段包含**：
- 人物姓名
- 年龄段（少年/青年/中年/老年）
- 体型特征
- 五官特点
- 发型发色
- 肤色
- 服装（款式+颜色+材质）
- 配饰道具
- 姿态动作
- 表情神态

#### 2. 场景提取模板（3个字段）

```typescript
{
  "scenes": [
    {
      "name": "场景名（保留原文）",
      "description": "场景描述（环境、氛围、时间等）",
      "prompt": "AI生图提示词（中文，包含：视角+时间段+天气+地理位置+环境元素+材质+颜色+光线+色调）"
    }
  ]
}
```

**prompt字段包含**：
- 视角类型（平视/俯视/仰视等）
- 时间段（清晨/正午/黄昏/深夜等）
- 天气状况
- 地理位置
- 环境元素（建筑、家具、自然元素等）
- 材质描述
- 颜色描述
- 光线方向
- 整体色调

#### 3. 道具提取模板（3个字段）

```typescript
{
  "props": [
    {
      "name": "道具名（保留原文）",
      "description": "道具描述（功能、材质、外观等）",
      "prompt": "AI生图提示词（中文，包含：道具名+类型+形态+材质+颜色+细节特征）"
    }
  ]
}
```

**prompt字段包含**：
- 道具名称
- 道具类型（武器/容器/饰品/器械等）
- 形态描述（形状、尺寸）
- 材质（金属/木材/石材/织物等）
- 颜色
- 细节特征（纹路、雕刻、镶嵌等）

#### 4. 配音提取模板（4个字段）

```typescript
{
  "dubbing": [
    {
      "character": "角色名（保留原文）",
      "line": "台词内容（保留原文，包括标点）",
      "emotion": "情绪状态（如：开心、悲伤、愤怒、惊讶、平静、兴奋、温柔、紧张、害怕等）",
      "audio_prompt": "配音提示词（中文，包含：角色身份+情绪强度+语气特点+语速节奏+声音质感）"
    }
  ]
}
```

**audio_prompt字段包含**：
- 角色身份（年龄、性别、职业）
- 情绪强度（轻微/中等/强烈）
- 语气特点（温柔/严厉/轻快/沉重等）
- 语速节奏（缓慢/正常/快速）
- 声音质感（清澈/沙哑/浑厚等）

#### 5. 分镜提取模板（8个字段）

```typescript
{
  "shots": [
    {
      "scene": "所属场景（保留原文）",
      "description": "分镜描述（画面内容+角色动作+环境氛围）",
      "cameraAngle": "镜头角度（特写/近景/中景/全景/远景等）",
      "characters": ["角色名列表（保留原文）"],
      "props": ["道具名列表（保留原文）"],
      "prompt": "AI生图提示词（中文，包含：视角+场景+角色+服装+动作+道具+光影）",
      "videoPrompt": "AI生视频提示词（中文，包含：镜头运动+角色动态+环境变化+时长）",
      "dubbing": {
        "character": "说话角色（保留原文）",
        "line": "台词（保留原文）",
        "emotion": "情绪状态",
        "audio_prompt": "配音提示词（中文，包含：角色身份+情绪强度+语气+语速+声音质感）"
      }
    }
  ]
}
```

**prompt字段包含**：视角、场景、角色、服装、动作、道具、光影

**videoPrompt字段包含**：镜头运动、角色动态、环境变化、时长

**dubbing.audio_prompt字段要求**：同配音提取模板的audio_prompt要求

### 通用规范

1. **字段数量固定**：所有预设包必须保持基础模板的字段数量，不得增减字段
2. **保留原文**：name、character、line等字段必须使用剧本原文，禁止翻译或修改
3. **禁止风格词**：prompt和videoPrompt中**不得包含任何风格、画风、艺术表现相关的描述**（如"日系动漫风格"、"写实风格"、"油画风格"等），这些将由项目统一设置
4. **禁止画质关键词**：所有prompt**不得包含画质关键词**（8k, ultra HD, highly detailed等），这些将由项目统一设置
5. **内容精炼**：在保持字段数量不变的前提下，提取最关键的信息，避免面面俱到