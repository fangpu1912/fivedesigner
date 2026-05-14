# AI 模型生成功能集成计划

## 功能概览

### 图片生成

| 功能    | 说明        | 支持模型                                 |
| ----- | --------- | ------------------------------------ |
| 文生图   | 文本提示词生成图片 | Seedream、Nano Banana最新系列、Kling Image |
| 图生图   | 参考图片生成新图片 | Seedream、Kling Image、Nano Banana最新系列 |
| 多参考生图 | 多张参考图生成图片 | Seedream、Kling Image、Nano Banana最新系列 |

### 视频生成

| 功能     | 说明          | 支持模型                                       |
| ------ | ----------- | ------------------------------------------ |
| 文生视频   | 文本提示词生成视频   | Seedance、Kling Video、Hailuo、Vidu、Veo 3.1系列 |
| 图生视频   | 图片生成视频      | Seedance、Kling Video、Hailuo、Vidu、Veo 3.1系列 |
| 首尾帧    | 首帧+尾帧生成中间视频 | Seedance、Kling Video、Hailuo、Vidu、Veo 3.1系列 |
| 多参考生视频 | 多张参考图生成视频   | Seedance、Kling Video、Hailuo、Vidu、Veo 3.1系列 |

***

## 实施步骤

### 阶段 1: 类型定义

**文件**: `src/types/generation.ts`

```typescript
// 生成类型
export type GenerationType = 
  | 'text-to-image'      // 文生图
  | 'image-to-image'     // 图生图
  | 'multi-ref-image'    // 多参考生图
  | 'text-to-video'      // 文生视频
  | 'image-to-video'     // 图生视频
  | 'first-last-frame'   // 首尾帧
  | 'multi-ref-video';   // 多参考生视频

// 图片生成模型
export type ImageModel = 'seedream' | 'nano-banana' | 'kling-image';

// 视频生成模型
export type VideoModel = 'seedance' | 'kling-video' | 'hailuo' | 'vidu' | 'veo-3.1';

// 基础参数
export interface BaseParams {
  prompt: string;
  negativePrompt?: string;
  seed?: number;
}

// 文生图参数
export interface TextToImageParams extends BaseParams {
  type: 'text-to-image';
  model: ImageModel;
  width?: number;
  height?: number;
}

// 图生图参数
export interface ImageToImageParams extends BaseParams {
  type: 'image-to-image';
  model: ImageModel;
  referenceImage: string;
  strength?: number;
  width?: number;
  height?: number;
}

// 多参考生图参数
export interface MultiRefImageParams extends BaseParams {
  type: 'multi-ref-image';
  model: ImageModel;
  referenceImages: string[];
  weights?: number[];
  width?: number;
  height?: number;
}

// 文生视频参数
export interface TextToVideoParams extends BaseParams {
  type: 'text-to-video';
  model: VideoModel;
  duration?: number;
  aspectRatio?: '16:9' | '9:16' | '1:1';
}

// 图生视频参数
export interface ImageToVideoParams extends BaseParams {
  type: 'image-to-video';
  model: VideoModel;
  imageUrl: string;
  duration?: number;
}

// 首尾帧参数
export interface FirstLastFrameParams extends BaseParams {
  type: 'first-last-frame';
  model: VideoModel;
  firstFrame: string;
  lastFrame: string;
  duration?: number;
}

// 多参考生视频参数
export interface MultiRefVideoParams extends BaseParams {
  type: 'multi-ref-video';
  model: VideoModel;
  referenceImages: string[];
  duration?: number;
}

// 生成结果
export interface GenerationResult {
  success: boolean;
  url?: string;
  localPath?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

// 进度回调
export type ProgressCallback = (progress: number, message?: string) => void;
```

***

### 阶段 2: 基础生成器

**文件**: `src/services/generators/BaseGenerator.ts`

```typescript
import type { GenerationResult, ProgressCallback } from '@/types/generation';

export abstract class BaseGenerator {
  abstract readonly name: string;
  abstract readonly supportedTypes: string[];
  
  abstract generate(
    params: Record<string, unknown>,
    onProgress?: ProgressCallback
  ): Promise<GenerationResult>;
  
  protected log(message: string, data?: unknown): void {
    console.log(`[${this.name}] ${message}`, data);
  }
  
  protected handleError(error: unknown): GenerationResult {
    const message = error instanceof Error ? error.message : String(error);
    this.log('Error:', message);
    return { success: false, error: message };
  }
}
```

***

### 阶段 3: 图片生成模型实现

#### 3.1 Seedream 生成器

**文件**: `src/services/generators/models/SeedreamGenerator.ts`

支持功能：文生图、图生图、多参考生图

参考: `E:\softdownload\Henji-AI-0.1.1\src\adapters\fal\models\fal-ai-bytedance-seedream-v4.5.ts`

#### 3.2 Nano Banana 生成器

**文件**: `src/services/generators/models/NanoBananaGenerator.ts`

支持功能：文生图、图生图、多参考生图

参考: `E:\softdownload\Henji-AI-0.1.1\src\adapters\fal\models\fal-ai-nano-banana.ts`

#### 3.3 Kling Image 生成器

**文件**: `src/services/generators/models/KlingImageGenerator.ts`

支持功能：文生图、图生图、多参考生图

参考: `E:\softdownload\Henji-AI-0.1.1\src\adapters\fal\models\fal-ai-kling-image-o1.ts`

***

### 阶段 4: 视频生成模型实现

#### 4.1 Seedance 生成器

**文件**: `src/services/generators/models/SeedanceGenerator.ts`

支持功能：文生视频、图生视频、首尾帧、多参考生视频

参考: `E:\softdownload\Henji-AI-0.1.1\src\adapters\fal\models\fal-ai-bytedance-seedance.ts`

#### 4.2 Kling Video 生成器

**文件**: `src/services/generators/models/KlingVideoGenerator.ts`

支持功能：文生视频、图生视频、首尾帧、多参考生视频

参考: `E:\softdownload\Henji-AI-0.1.1\src\adapters\fal\models\fal-ai-kling-video-v2.6-pro.ts`

#### 4.3 Hailuo 生成器

**文件**: `src/services/generators/models/HailuoGenerator.ts`

支持功能：文生视频、图生视频、首尾帧、多参考生视频

参考: `E:\softdownload\Henji-AI-0.1.1\src\adapters\fal\models\fal-ai-minimax-hailuo-2.3.ts`

#### 4.4 Vidu 生成器

**文件**: `src/services/generators/models/ViduGenerator.ts`

支持功能：文生视频、图生视频、首尾帧、多参考生视频

参考: `E:\softdownload\Henji-AI-0.1.1\src\adapters\fal\models\fal-ai-vidu-q2.ts`

#### 4.5 Veo 3.1 生成器

**文件**: `src/services/generators/models/VeoGenerator.ts`

支持功能：文生视频、图生视频、首尾帧、多参考生视频

参考: `E:\softdownload\Henji-AI-0.1.1\src\adapters\fal\models\fal-ai-veo-3.1.ts`

***

### 阶段 5: 模型工厂

**文件**: `src/services/generators/ModelFactory.ts`

```typescript
import { BaseGenerator } from './BaseGenerator';
import { SeedreamGenerator } from './models/SeedreamGenerator';
import { NanoBananaGenerator } from './models/NanoBananaGenerator';
import { KlingImageGenerator } from './models/KlingImageGenerator';
import { SeedanceGenerator } from './models/SeedanceGenerator';
import { KlingVideoGenerator } from './models/KlingVideoGenerator';
import { HailuoGenerator } from './models/HailuoGenerator';
import { ViduGenerator } from './models/ViduGenerator';
import { VeoGenerator } from './models/VeoGenerator';
import type { ImageModel, VideoModel } from '@/types/generation';

const generators = new Map<string, BaseGenerator>();

// 注册图片生成模型
generators.set('seedream', new SeedreamGenerator());
generators.set('nano-banana', new NanoBananaGenerator());
generators.set('kling-image', new KlingImageGenerator());

// 注册视频生成模型
generators.set('seedance', new SeedanceGenerator());
generators.set('kling-video', new KlingVideoGenerator());
generators.set('hailuo', new HailuoGenerator());
generators.set('vidu', new ViduGenerator());
generators.set('veo-3.1', new VeoGenerator());

export function getGenerator(model: ImageModel | VideoModel): BaseGenerator {
  const generator = generators.get(model);
  if (!generator) {
    throw new Error(`Unknown model: ${model}`);
  }
  return generator;
}

export function getSupportedModels(type: GenerationType): string[] {
  return Array.from(generators.values())
    .filter(g => g.supportedTypes.includes(type))
    .map(g => g.name);
}
```

***

### 阶段 6: 更新 GenerationService

**文件**: `src/services/generationService.ts`

添加统一接口方法：

```typescript
// 文生图
async textToImage(params: TextToImageParams, onProgress?: ProgressCallback): Promise<GenerationResult>

// 图生图
async imageToImage(params: ImageToImageParams, onProgress?: ProgressCallback): Promise<GenerationResult>

// 多参考生图
async multiRefToImage(params: MultiRefImageParams, onProgress?: ProgressCallback): Promise<GenerationResult>

// 文生视频
async textToVideo(params: TextToVideoParams, onProgress?: ProgressCallback): Promise<GenerationResult>

// 图生视频
async imageToVideo(params: ImageToVideoParams, onProgress?: ProgressCallback): Promise<GenerationResult>

// 首尾帧
async firstLastFrameToVideo(params: FirstLastFrameParams, onProgress?: ProgressCallback): Promise<GenerationResult>

// 多参考生视频
async multiRefToVideo(params: MultiRefVideoParams, onProgress?: ProgressCallback): Promise<GenerationResult>
```

***

### 阶段 7: UI 集成

#### 7.1 模型选择器组件

**文件**: `src/components/generation/ModelSelector.tsx`

* 根据功能类型显示可用模型

* 模型参数配置面板

#### 7.2 图片生成面板

**文件**: `src/components/generation/ImageGeneratorPanel.tsx`

* 功能类型切换（文生图/图生图/多参考生图）

* 参数输入

* 进度显示

#### 7.3 视频生成面板

**文件**: `src/components/generation/VideoGeneratorPanel.tsx`

* 功能类型切换（文生视频/图生视频/首尾帧/多参考生视频）

* 参数输入

* 进度显示

***

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
│   │       ├── SeedreamGenerator.ts
│   │       ├── NanoBananaGenerator.ts
│   │       ├── KlingImageGenerator.ts
│   │       ├── SeedanceGenerator.ts
│   │       ├── KlingVideoGenerator.ts
│   │       ├── HailuoGenerator.ts
│   │       ├── ViduGenerator.ts
│   │       └── VeoGenerator.ts
│   └── generationService.ts
└── components/
    └── generation/
        ├── ModelSelector.tsx
        ├── ImageGeneratorPanel.tsx
        └── VideoGeneratorPanel.tsx
```

***

## 依赖

```bash
npm install @fal-ai/client
```

***

## 注意事项

1. 忽略供应商，只关注模型功能
2. API Key 统一管理
3. 统一进度回调接口
4. 统一错误处理
5. 支持取消生成任务

