# 接入 Agnes AI 供应商

## Context

用户希望把 Agnes AI 作为新的内置供应商接入 FiveDesigner。Agnes 提供：
- 文本模型 `agnes-2.0-flash`（OpenAI 兼容 Chat Completions）
- 图像模型 `agnes-image-2.1-flash`（OpenAI 兼容 Images Generations，支持文生图/图生图）
- 视频模型 `agnes-video-v2.0`（异步任务：创建任务 + 轮询结果）

接入形式：作为内置供应商打包进应用，新增 `src/services/vendor/codes/agnes.js`，并在默认配置中注册。

## 现有架构约束

- 供应商代码在 Web Worker 中通过 `new Function(...)` 执行（[sandboxWorker.js:151](file:///d:/trae_projects/fivedesigner/src/services/vendor/sandboxWorker.js#L151)）
- Worker 暴露的 API：
  - `tauriFetch(url, options)` — 封装 `http_request` Tauri 命令，绕过 CORS（[vendorSandbox.ts:149](file:///d:/trae_projects/fivedesigner/src/services/vendor/vendorSandbox.ts#L149)）
  - `tauriInvoke(cmd, args)` — 仅允许 5 个命令（[vendorSandbox.ts:3](file:///d:/trae_projects/fivedesigner/src/services/vendor/vendorSandbox.ts#L3)）
  - `pollTask(pollFn, options)` — 异步轮询工具（[sandboxWorker.js:60](file:///d:/trae_projects/fivedesigner/src/services/vendor/sandboxWorker.js#L60)）
- 供应商代码需导出 `class Vendor`（或等价构造函数），并实现 `textRequest` / `imageRequest` / `videoRequest`（[sandboxWorker.js:1](file:///d:/trae_projects/fivedesigner/src/services/vendor/sandboxWorker.js#L1)）
- 为兼容 Web Worker 环境， Agnes 代码避免使用模板字符串、可选链、`??`、class 字段初始化器等新语法，采用与 `modelscope.js` 一致的 ES5/ES6 兼容风格

## 改动清单

### 1. 新增 `src/services/vendor/codes/agnes.js`

实现 `Vendor` 类，提供 `textRequest`、`imageRequest`、`videoRequest`。

#### textRequest

- Endpoint: `POST https://apihub.agnes-ai.com/v1/chat/completions`
- Headers: `Authorization: Bearer {apiKey}`, `Content-Type: application/json`
- Body:
  ```json
  {
    "model": "agnes-2.0-flash",
    "messages": params.messages,
    "temperature": params.temperature ?? 0.7,
    "max_tokens": params.maxTokens ?? 2048
  }
  ```
- 返回 `data.choices[0].message.content`

#### imageRequest

- Endpoint: `POST https://apihub.agnes-ai.com/v1/images/generations`
- Headers 同上
- Body 构建：
  - `model`: `agnes-image-2.1-flash`
  - `prompt`: `params.prompt`
  - `size`: 取 `params.size`，若未提供默认 `"1K"`。Agnes 支持 `"1K"` / `"2K"` / `"3K"` / `"4K"`，但项目 `ImageConfig.size` 类型只有 `"1K"` / `"2K"` / `"4K"`，所以只暴露这三档， `"3K"` 暂不提供
  - `ratio`: 将 `params.aspectRatio` 映射为 Agnes 支持的 ratio。 Agnes 支持 `"1:1"` / `"3:4"` / `"4:3"` / `"16:9"` / `"9:16"` / `"2:3"` / `"3:2"` / `"21:9"`。若未提供默认 `"1:1"`
  - `extra_body.response_format`: `"url"`（优先返回可下载 URL，便于 `saveGeneratedImage` 保存）
  - 图生图：当 `params.imageUrls` 非空且第一个 URL 有效时，把它放到 `extra_body.image[0]`；`params.imageBase64` 也可作为兜底传入 `extra_body.image[0]`
- 返回 `data[0].url`
- 错误处理：顶层 `data.error` 或 status 非 2xx 时抛出中文错误

#### videoRequest

- Endpoint: `POST https://apihub.agnes-ai.com/v1/videos`
- Body 构建：
  - `model`: `agnes-video-v2.0`
  - `prompt`: `params.prompt`
  - `width` / `height`: 从 `params.resolution` 映射。 Agnes 只支持三档：`480p` / `720p` / `1080p`。先根据 resolution 选定档位，再用该档位下 16:9 的默认像素：
    - `480p` → `width: 848`, `height: 480`
    - `720p` → `width: 1280`, `height: 720`
    - `1080p` → `width: 1920`, `height: 1080`
    - 若未提供 resolution 默认 `720p`
  - `num_frames` / `frame_rate`: 从 `params.duration` 映射。Agnes 要求 `num_frames = 8n + 1` 且 `≤ 441`，frame_rate 固定 24。推荐映射：
    - `duration: 3` → `num_frames: 73`, `frame_rate: 24`（73 = 8*9 + 1）
    - `duration: 5` → `num_frames: 121`, `frame_rate: 24`
    - `duration: 10` → `num_frames: 241`, `frame_rate: 24`
    - `duration: 15` → `num_frames: 361`, `frame_rate: 24`
    - `duration: 18` → `num_frames: 441`, `frame_rate: 24`
    - 其他 duration 取最接近的 `8n+1` 帧数：`Math.min(441, Math.round(duration * 24 / 8) * 8 + 1)`
  - 图生视频：当 `params.firstImageBase64` 非空时，把 base64 字符串作为 `image` 字段（Agnes 文档说支持公共 URL 或 Data URI Base64）
  - 关键帧：当 `params.referenceImages` 非空时，放到 `extra_body.image` 数组并设置 `extra_body.mode: "keyframes"`
- 创建任务响应：拿到 `video_id`
- 轮询：使用 `pollTask`，每 5 秒 GET `https://apihub.agnes-ai.com/agnesapi?video_id={video_id}`，直到 `status === "completed"` 返回 `url`，或 `status === "failed"` 抛出错误
- 返回视频 URL

### 2. 修改 `src/services/vendor/codeLoader.ts`

- 新增 `import agnesCode from './codes/agnes.js?raw'`
- 在 `vendorCodes` 对象中新增 `agnes: agnesCode`

### 3. 修改 `src/services/vendor/seedData.ts`

在 `defaultVendors` 数组末尾新增一个 `VendorConfig`：

```ts
{
  id: 'agnes',
  name: 'Agnes AI',
  description: '## Agnes AI\n\nSapiens AI 推出的多模态生成平台，支持文本、图像、视频生成。\n\n- 文本模型：agnes-2.0-flash\n- 图像模型：agnes-image-2.1-flash\n- 视频模型：agnes-video-v2.0\n\n🔗 [官网](https://agnes-ai.com)',
  icon: '',
  inputs: [{ key: 'apiKey', label: 'API密钥', type: 'password', required: true }],
  inputValues: { apiKey: '' },
  models: [
    { name: 'Agnes 2.0 Flash', type: 'text', modelName: 'agnes-2.0-flash', think: false },
    { name: 'Agnes Image 2.1 Flash', type: 'image', modelName: 'agnes-image-2.1-flash', mode: ['text', 'singleImage'] },
    {
      name: 'Agnes Video V2.0',
      type: 'video',
      modelName: 'agnes-video-v2.0',
      mode: ['text', 'singleImage'],
      durationResolutionMap: [
        { duration: [3, 5, 10, 15, 18], resolution: ['480p', '720p', '1080p'] }
      ],
      audio: false,
    },
  ],
  code: getVendorCode('agnes') || '',
  enable: false,
  createTime: Date.now(),
}
```

### 4. 不改的地方

- 不新增 Tauri Rust 命令。Agnes 是纯 HTTP API，复用已有的 `http_request` 命令。
- 不改 `vendorSandbox.ts`、`aiService.ts`、`configService.ts`。
- 不改 UI 设置页。configService 会自动把新供应商同步进 vendors.json，用户在设置 → AI 供应商里启用并填写 API Key 即可。

## 关键复用清单

| 用途 | 函数/命令 | 位置 |
|------|----------|------|
| 绕过 CORS 的 HTTP 请求 | `tauriFetch` / `http_request` | [vendorSandbox.ts:149](file:///d:/trae_projects/fivedesigner/src/services/vendor/vendorSandbox.ts#L149) |
| 异步轮询 | `pollTask` | [sandboxWorker.js:60](file:///d:/trae_projects/fivedesigner/src/services/vendor/sandboxWorker.js#L60) |
| 供应商代码注册 | `vendorCodes` + `getVendorCode` | [codeLoader.ts:14](file:///d:/trae_projects/fivedesigner/src/services/vendor/codeLoader.ts#L14) |
| 默认供应商配置 | `defaultVendors` | [seedData.ts:9](file:///d:/trae_projects/fivedesigner/src/services/vendor/seedData.ts#L9) |

## 验证步骤

1. **类型检查**：`npm run typecheck` 0 错误
2. **启动应用**：`npm run tauri:dev`
3. **检查供应商列表**：设置 → AI 供应商，应出现 "Agnes AI"，默认未启用
4. **启用并配置**：填写 Agnes API Key，启用供应商
5. **文本生成验证**：
   - 在任意 AI 文本生成入口（如 AI 聊天、剧本创作）选择模型 `agnes:agnes-2.0-flash`
   - 发送消息，应收到 Agnes 返回的文本
6. **图像生成验证**：
   - 在生图面板选择模型 `agnes:agnes-image-2.1-flash`
   - 文生图：输入 prompt，选择 size 和 ratio，应生成图片
   - 图生图：上传参考图，应生成变体图
7. **视频生成验证**：
   - 在生视频面板选择模型 `agnes:agnes-video-v2.0`
   - 文生视频：输入 prompt，选择 duration/resolution，应提交异步任务并轮询到视频 URL
   - 图生视频：提供首帧图，应生成视频
8. **回归验证**：其他供应商（OpenAI、Kling 等）的文本/图像/视频生成不受影响

## 注意事项

- Agnes Image 文档警告：不要将 `response_format` 放在顶层，要通过 `extra_body.response_format`。本次实现遵守该规则。
- Agnes Video 文档要求 `num_frames` 遵循 `8n + 1` 且 `≤ 441`，本次实现会自动把 duration 映射为合规帧数。
- 视频首帧/关键帧若使用本地路径，需要先通过 `urlToBase64` 或前端已转换的 base64/data URL 传入。`videoRequest` 直接接收 `firstImageBase64` 字符串作为 `image` 字段，符合 Agnes 对 Data URI 的支持。
- Agnes 是 vendor