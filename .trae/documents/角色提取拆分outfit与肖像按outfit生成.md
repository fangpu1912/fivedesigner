# 角色提取拆分 Outfit + 肖像按 Outfit 生成

## Context

当前问题：
1. [characterExtractorAgent.ts:40](file:///d:/trae_projects/fivedesigner/src/plugins/vimax/services/agents/characterExtractorAgent.ts#L40) 的 prompt 模板把"服装+配饰+姿态+表情"全塞进单一 `prompt` 字段，导致下游选衣橱时服装图也用这个混合 prompt，质量差
2. [characterPortraitAgent.ts:69-72](file:///d:/trae_projects/fivedesigner/src/plugins/vimax/services/agents/characterPortraitAgent.ts#L69) 只生成 1 张主肖像，没按 outfit 分别出图
3. 角色提取出来的服装信息没写入 outfitDB，导致衣橱面板空空如也

下游联动（`ReferenceImageInput` 选衣橱 → name 变"人名-服装名"、prompt 用 outfit.prompt）已经齐备，无需改。本次只补齐"上游产出"端。

## 改动策略

**核心原则**：在 agent 输出层和 dataAdapter 层扩展，**不破坏现有 ViMaxCharacterInScene 字段含义**。`character.prompt` 改为只含静态外貌（去掉服装/姿态/表情），动态部分拆到 `outfits` 数组。

下游 ReferenceImageInput 选 outfit 时已经会 `outfit.prompt || char.prompt` 兜底（[ReferenceImageInput.tsx:874](file:///d:/trae_projects/fivedesigner/src/components/ai/ReferenceImageInput.tsx#L874)），所以即使某些边界情况 outfit 没生成出来，也会平滑回退到角色主 prompt，不会出错。

## 改动清单

### 1. 类型扩展

**`src/plugins/vimax/types/index.ts`** - 在 `ViMaxCharacterInScene` 增加可选字段：

```ts
export interface ViMaxCharacterInScene {
  name: string;
  description: string;
  prompt: string;          // 改为只含静态外貌（年龄/体型/五官/发型/肤色），不含服装
  portraitUrl?: string;
  age?: string;
  gender?: string;
  appearance?: string;
  clothing?: string;       // 保留作为描述用途
  outfits?: ViMaxCharacterOutfit[];  // 新增：从剧本提取的服装状态
}

// 新增类型
export interface ViMaxCharacterOutfit {
  name: string;          // 服装名（如"战斗装"、"日常装"、"雨夜湿衣"）
  description?: string;
  prompt: string;        // 该服装/状态的独立提示词（含服装+配饰+姿态+表情）
  imageUrl?: string;     // 生成后回填
  is_default?: boolean;
}
```

### 2. 改造 characterExtractorAgent.ts

**`src/plugins/vimax/services/agents/characterExtractorAgent.ts`**

- 改 `systemPrompt` 模板：
  - `prompt` 字段说明改为"只包含人物名+年龄段+体型+五官+发型+肤色，**不包含服装配饰姿态表情**"
  - 新增 `outfits` 数组字段，要求为每个角色提取 1-N 套服装状态（默认至少 1 套，标记 `is_default`）
  - 每套 outfit 的 `prompt` 包含"服装款式+颜色+材质+配饰+姿态+表情"

- 改 `parseCharacterResponse`：解析 `outfits` 字段，映射到 `ViMaxCharacterOutfit[]`。对没返回 outfits 的旧响应做兜底：用原 `clothing` 字段构造 1 套默认 outfit，prompt 用 `clothing` 内容（保证向后兼容）。

### 3. 改造 characterPortraitAgent.ts

**`src/plugins/vimax/services/agents/characterPortraitAgent.ts`**

- 改 `CharacterPortraitInput`：新增 `outfits?: ViMaxCharacterOutfit[]`、`projectId`、`episodeId`（已有）
- 改 `CharacterPortraitOutput`：返回 `outfits: ViMaxCharacterOutfit[]`（每个 outfit 含 imageUrl）
- 改 `runCharacterPortraitAgent` 逻辑：
  1. 仍生成 1 张主肖像（基于精简后的 character.prompt + appearance），存到 character.portraitUrl —— 保持下游"角色主图"可用
  2. 遍历 `outfits`，对每套服装：
     - 以主肖像为参考图，调用 `generateImageToImage(outfit.prompt, mainPortraitUrl, model, options)` 生成该服装图
     - `saveGeneratedImage` 保存到项目目录
     - 回填 `outfit.imageUrl`
  3. 返回 `{ character, portraitUrl, outfits, rawResponse }`

- 复用 `AI.Image.generate`：characterPortraitAgent 是 vimax service 函数，不在 React 内，直接调用 `AI.Image.generate(config, model, projectId)` 即可。[aiService.ts:195](file:///d:/trae_projects/fivedesigner/src/services/vendor/aiService.ts#L195) 的 `ImageConfig` 已支持 `imageUrls?: string[]` ([types.ts:99](file:///d:/trae_projects/fivedesigner/src/services/vendor/types.ts#L99))，所以 outfit 换装就是 `AI.Image.generate({ prompt: outfit.prompt, imageUrls: [mainPortraitUrl], aspectRatio: '1:1' }, model, projectId)`。无需引入新 hook。

### 4. 改造 dataAdapter.ts

**`src/plugins/vimax/services/dataAdapter.ts`**

- `saveCharacterToDatabase`（line 55-72）：返回新建的 character.id（已有）；新增循环 `for (const outfit of character.outfits || [])`：
  - 调用 `outfitDB.create({ character_id: characterId, name, description, prompt, image: outfit.imageUrl, is_default: outfit.is_default ?? false, tags: [] })`
  - 标记 is_default=true 的 outfit 同时确保只有 1 个默认（调用 `outfitDB.setDefault` 或在 create 时直接处理）
- `loadCharactersFromDatabase`（line 136-147）：可选增强 —— 加载该角色的 outfits 一并返回（用 `outfitDB.getByCharacter`），方便后续 pipeline 重入时数据完整。但本次不强制要求。

- import 添加 `outfitDB` from `@/db`

### 5. 改造 pipelines

**`src/plugins/vimax/services/pipelines/script2VideoPipeline.ts`**（line 152-179 区域）：
- 把 `runCharacterPortraitAgent({ character, projectId, episodeId })` 的入参改为也传 `outfits: character.outfits`
- 接收返回的 `result.character.outfits`（含生成后的 imageUrl），**回填到 `script.characters[i]`**（当前代码 [line 162-168](file:///d:/trae_projects/fivedesigner/src/plugins/vimax/services/pipelines/script2VideoPipeline.ts#L162) 没回写，需新增 `script.characters[i] = result.character`）
- 顺序已验证：portrait（line 162）→ saveScriptToDatabase（line 318），所以 portrait 生成的 outfit.imageUrl 会随 saveCharacterToDatabase 一并写入 outfitDB.image 字段

**`src/plugins/vimax/services/pipelines/novel2VideoPipeline.ts`**：不调 portrait、不调 saveScript，无需改动。它只调 `runCharacterExtractorAgent`（line 126），改造后 extractor 返回的 outfits 字段会随 step0.result 透传，不影响后续逻辑。

### 6. 不动的地方

- `ReferenceImageInput.tsx`、`CharacterWardrobeDialog.tsx`、`OutfitGenerationDialog.tsx`、`promptResolver.ts`、`useOutfits.ts`、`CharacterOutfit` 类型、`outfitDB` 接口 —— 全部不动
- `screenwriterAgent.ts`、`storyboardArtistAgent.ts` —— 不动（它们用 `character.prompt` 注入分镜，精简后的 prompt 仍能描述角色外貌，对分镜质量反而更好）

## 关键复用清单

| 用途 | 函数 | 位置 |
|------|------|------|
| 保存角色主肖像 | `AI.Image.generate + saveGeneratedImage` | [characterPortraitAgent.ts:54-67](file:///d:/trae_projects/fivedesigner/src/plugins/vimax/services/agents/characterPortraitAgent.ts#L54) |
| 图生图换装 | `AI.Image.generate({ prompt, imageUrl })` 或 `generateImageToImage` | vendor AI.Image 接口 |
| 写入 outfit | `outfitDB.create` | `@/db` |
| 保存生成图到项目目录 | `saveGeneratedImage(url, projectId, episodeId)` | `@/utils/mediaStorage` |

## 向后兼容

- `ViMaxCharacterInScene.outfits` 是可选字段
- `parseCharacterResponse` 对老格式响应（无 outfits）做兜底：用 `clothing` 字段构造 1 套默认 outfit
- 下游 `ReferenceImageInput` 已有 `outfit.prompt || char.prompt` 兜底逻辑
- 老存量的 Character 没有 outfit 时，`useOutfitsByCharacter` 返回空数组，ReferenceImageInput 不显示衣橱下拉，回退到角色主图 + 主 prompt

## 验证步骤

1. **类型检查**：`npm run typecheck` 0 错误
2. **单元验证（agent 输出）**：
   - 准备一段剧本文本（含 2 个角色，每个角色至少出现 2 种服装状态）
   - 调用 `runCharacterExtractorAgent`
   - 断言返回的每个 character.outfits 数组长度 >= 1，至少 1 个 is_default=true
   - 断言 character.prompt 不含"穿着"、"服装"等词
3. **端到端验证**：
   - 启动 dev：`npm run tauri:dev`
   - 走"小说 → 视频"或"剧本 → 视频"流程
   - 等待 character 提取完成 → 进入资产管理 → 选角色 → 管理衣橱
   - 应看到自动提取出的 N 套服装（带 prompt、有图片）
   - 在生图面板 @ 该角色 → 选某套 outfit → 看到提示词变为 outfit.prompt，参考图变为 outfit.image
4. **回归验证**：
   - 选没有 outfit 的角色 → @人物 → 仍正常用 char.prompt + char.image，不报错
