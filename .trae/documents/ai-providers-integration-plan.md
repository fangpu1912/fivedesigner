# AI 模型生成功能集成计划

## 核心功能类型

### 图片生成
1. **文生图** - 文本提示词生成图片
2. **图生图** - 参考图片生成新图片
3. **多参考生图** - 多张参考图生成图片

### 视频生成
1. **文生视频** - 文本提示词生成视频
2. **图生视频** - 图片生成视频
3. **首尾帧** - 首帧+尾帧生成中间视频
4. **多参考生视频** - 多张参考图生成视频

## 模型支持矩阵

| 模型 | 文生图 | 图生图 | 多参考生图 | 文生视频 | 图生视频 | 首尾帧 | 多参考生视频 |
|------|:------:|:------:|:----------:|:--------:|:--------:|:------:|:------------:|
| Seedream 4.5 | ✅ | ✅ | ✅ | - | - | - | - |
| Seedance | - | - | - | ✅ | ✅ | - | ✅ |
| Kling Image | ✅ | ✅ | ✅ | - | - | - | - |
| Kling Video | - | - | - | ✅ | ✅ | ✅ | ✅ |
| Hailuo/Minimax | - | - | - | ✅ | ✅ | ✅ | - |
| Vidu | - | - | - | ✅ | ✅ | - | - |
| Pixverse | - | - | - | ✅ | ✅ | - | - |
| Veo 3.1 | - | - | - | ✅ | - | - | - |
| Sora 2 | ✅ | - | - | ✅ | - | - | - |
| Wan 2.5 | - | - | - | ✅ | ✅ | - | - |
| LTX 2 | - | - | - | ✅ | - | - | - |
| Nano Banana | ✅ | - | - | - | - | - | - |
| Z-Image | ✅ | - | - | - | - | - | - |

## 统一接口设计

```typescript
interface GenerationService {
  // ===== 图片生成 =====
  
  // 文生图
  textToImage(params: {
    prompt: string
    negativePrompt?: string
    width?: number
    height?: number
    seed?: number
    model: string
  }): Promise<ImageResult>

  // 图生图
  imageToImage(params: {
    prompt: string
    referenceImage: string
    strength?: number
    width?: number
    height?: number
    seed?: number
    model: string
  }): Promise<ImageResult>

  // 多参考生图
  multiRefToImage(params: {
    prompt: string
    referenceImages: string[]
    weights?: number[]
    width?: number
    height?: number
    seed?: number
    model: string
  }): Promise<ImageResult>

  // ===== 视频生成 =====

  // 文生视频
  textToVideo(params: {
    prompt: string
    negativePrompt?: string
    duration?: number
    aspectRatio?: '16:9' | '9:16' | '1:1'
    seed?: number
    model: string
  }): Promise<VideoResult>

  // 图生视频
  imageToVideo(params: {
    prompt: string
    imageUrl: string
    duration?: number
    seed?: number
    model: string
  }): Promise<VideoResult>

  // 首尾帧
  firstLastFrameToVideo(params: {
    prompt?: string
    firstFrame: string
    lastFrame: string
    duration?: number
    seed?: number
    model: string
  }): Promise<VideoResult>

  // 多参考生视频
  multiRefToVideo(params: {
    prompt: string
    referenceImages: string[]
    duration?: number
    seed?: number
    model: string
  }): Promise<VideoResult>
}
```

## 实施步骤

### 阶段 1: 基础架构
1. 创建类型定义 `src/types/generation.ts`
2. 创建基础生成器 `src/services/generators/BaseGenerator.ts`
3. 创建模型工厂 `src/services/generators/ModelFactory.ts`

### 阶段 2: 模型适配器
按功能类型实现各模型适配器：

**图片生成模型：**
- SeedreamGenerator (文生图、图生图、多参考生图)
- KlingImageGenerator (文生图、图生图、多参考生图)
- NanoBananaGenerator (文生图)
- ZImageGenerator (文生图)
- SoraImageGenerator (文生图)

**视频生成模型：**
- SeedanceGenerator (文生视频、图生视频、多参考生视频)
- KlingVideoGenerator (文生视频、图生视频、首尾帧、多参考生视频)
- HailuoGenerator (文生视频、图生视频、首尾帧)
- ViduGenerator (文生视频、图生视频)
- PixverseGenerator (文生视频、图生视频)
- VeoGenerator (文生视频)
- SoraVideoGenerator (文生视频)
- WanGenerator (文生视频、图生视频)
- LTXGenerator (文生视频)

### 阶段 3: 服务集成
1. 更新 GenerationService
2. 创建 ModelConfigService
3. 添加进度追踪

### 阶段 4: UI 集成
1. 更新分镜绘制页面
2. 更新视频生成页面
3. 更新 Storyboard Copilot

## 文件结构

```
src/
├── types/
│   └── generation.ts
├── services/
│   ├── generators/
│   │   ├── BaseGenerator.ts
│   │   ├── ModelFactory.ts
│   │   ├── index.ts
│   │   └── models/
│   │       ├── image/
│   │       │   ├── SeedreamGenerator.ts
│   │       │   ├── KlingImageGenerator.ts
│   │       │   ├── NanoBananaGenerator.ts
│   │       │   ├── ZImageGenerator.ts
│   │       │   └── SoraImageGenerator.ts
│   │       └── video/
│   │           ├── SeedanceGenerator.ts
│   │           ├── KlingVideoGenerator.ts
│   │           ├── HailuoGenerator.ts
│   │           ├── ViduGenerator.ts
│   │           ├── PixverseGenerator.ts
│   │           ├── VeoGenerator.ts
│   │           ├── SoraVideoGenerator.ts
│   │           ├── WanGenerator.ts
│   │           └── LTXGenerator.ts
│   ├── modelConfigService.ts
│   └── generationService.ts
└── components/
    └── generation/
        ├── ModelSelector.tsx
        ├── ImageGeneratorPanel.tsx
        └── VideoGeneratorPanel.tsx
```

## 依赖

```bash
npm install @fal-ai/client
```

## 注意事项

1. API Key 统一管理
2. 根据模型自动选择底层 API
3. 统一进度回调
4. 统一错误处理
5. 支持取消任务
