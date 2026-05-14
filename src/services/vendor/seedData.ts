/**
 * 供应商配置种子数据
 */

import type { VendorConfig, AgentDeploy } from './types'
import { getVendorCode } from './codeLoader'

// 官方中转平台配置
export const defaultVendors: VendorConfig[] = [
  {
    id: 'toonflow',
    author: 'Toonflow',
    description:
      '## Toonflow官方中转平台\n\nToonflow官方中转平台，提供**文本、图像、视频、音频**等多模态生成能力的中转服务，支持接入多个大模型供应商，方便用户统一管理和调用不同供应商的生成能力。\n\n🔗 [前往中转平台](https://api.toonflow.net/)\n\n如果这个项目对你有帮助，可以考虑支持一下我们的开发工作 ☕',
    name: 'Toonflow官方中转平台',
    icon: '',
    inputs: [{ key: 'apiKey', label: 'API密钥', type: 'password', required: true }],
    inputValues: { apiKey: '', baseUrl: 'https://api.toonflow.net/v1' },
    models: [
      // 文本模型
      { name: 'claude-sonnet-4-6', type: 'text', modelName: 'claude-sonnet-4-6', think: false },
      { name: 'claude-opus-4-6', type: 'text', modelName: 'claude-opus-4-6', think: false },
      { name: 'gpt-5.4', type: 'text', modelName: 'gpt-5.4', think: false },
      { name: 'MiniMax-M2.7', type: 'text', modelName: 'MiniMax-M2.7', think: true },
      // 视频模型
      {
        name: 'Wan2.6 I2V 1080P (支持真人)',
        type: 'video',
        modelName: 'Wan2.6-I2V-1080P',
        mode: ['text', 'startEndRequired'],
        durationResolutionMap: [{ duration: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ['1080p'] }],
        audio: true
      },
      {
        name: 'Wan2.6 I2V 720P (支持真人)',
        type: 'video',
        modelName: 'Wan2.6-I2V-720P',
        mode: ['text', 'startEndRequired'],
        durationResolutionMap: [{ duration: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ['720p'] }],
        audio: true
      },
      {
        name: 'Seedance 1.5 Pro',
        type: 'video',
        modelName: 'doubao-seedance-1-5-pro-251215',
        durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12], resolution: ['480p', '720p', '1080p'] }],
        mode: ['text', 'endFrameOptional'],
        audio: true
      },
      {
        name: 'ViduQ3 pro',
        type: 'video',
        modelName: 'ViduQ3-pro',
        durationResolutionMap: [{ duration: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], resolution: ['540p', '720p', '1080p'] }],
        mode: ['singleImage', 'startEndRequired', 'text'],
        audio: true
      },
      {
        name: 'ViduQ3 turbo',
        type: 'video',
        modelName: 'ViduQ3-turbo',
        durationResolutionMap: [{ duration: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], resolution: ['540p', '720p', '1080p'] }],
        mode: ['singleImage', 'startEndRequired', 'text'],
        audio: true
      },
      {
        name: 'ViduQ2 turbo',
        type: 'video',
        modelName: 'ViduQ2-turbo',
        durationResolutionMap: [{ duration: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], resolution: ['540p', '720p', '1080p'] }],
        mode: ['singleImage', 'startEndRequired'],
        audio: true
      },
      // 图片模型
      { name: 'viduq2 for image', type: 'image', modelName: 'viduq2', mode: ['text'] },
      // TTS模型
    ],
    code: getVendorCode('toonflow') || '',
    enable: false,
    createTime: 1775164020756,
  },
  // GeekAI 聚合平台配置
  {
    id: 'geekai',
    author: 'GeekAI',
    description:
      '## GeekAI 聚合平台\n\nGeekAI是一个开源的AI助手解决方案，聚合了多个大模型API供应商，提供统一的API接口。\n\n**支持的供应商**：\n- OpenAI (GPT-4, GPT-3.5)\n- Azure OpenAI\n- ChatGLM\n- 讯飞星火\n- 文心一言\n- MidJourney\n- Stable Diffusion\n- Suno音乐创作\n- Grok Video\n\n🔗 [官网注册邀请](https://www.geeknow.top/register?aff=cj7k)\n\n⚠️ **注意**：GeekAI是第三方中转服务，请确保API密钥的安全性。',
    name: 'GeekAI 聚合平台',
    icon: '',
    inputs: [
      { key: 'apiKey', label: 'API密钥', type: 'password', required: true },
      { key: 'baseUrl', label: 'API地址', type: 'url', required: false, placeholder: 'https://www.geeknow.top/v1' },
    ],
    inputValues: { apiKey: '', baseUrl: 'https://www.geeknow.top/v1' },
    models: [
      // 图片模型（走 chat/completions 接口）
      { name: 'GPT-Image-2', type: 'image', modelName: 'gpt-image-2', mode: ['text'] },
      { name: 'GPT-Image-2 Pro', type: 'image', modelName: 'gpt-image-2-pro', mode: ['text', 'singleImage'] },
      { name: 'Grok 4.2 Image', type: 'image', modelName: 'grok-4-2-image', mode: ['text'] },
      { name: 'Gemini 3.1 Flash Image', type: 'image', modelName: 'gemini-3.1-flash-image-preview', mode: ['text'] },
      { name: 'Gemini 3 Pro Image', type: 'image', modelName: 'gemini-3-pro-image-preview', mode: ['text'] },
      // 视频模型
      {
        name: 'Sora 2',
        type: 'video',
        modelName: 'sora-2',
        mode: ['text'],
        durationResolutionMap: [{ duration: [5, 10, 15, 20], resolution: ['720p', '1080p'] }],
        audio: false,
      },
      {
        name: 'Sora 2 VIP',
        type: 'video',
        modelName: 'sora-2-vip',
        mode: ['text'],
        durationResolutionMap: [{ duration: [5, 10, 15, 20], resolution: ['720p', '1080p'] }],
        audio: false,
      },
      {
        name: 'Sora 3',
        type: 'video',
        modelName: 'sora3',
        mode: ['text'],
        durationResolutionMap: [{ duration: [5, 10, 15, 20], resolution: ['720p', '1080p'] }],
        audio: false,
      },
      {
        name: 'Sora 2 Pro 横屏 25s',
        type: 'video',
        modelName: 'sora2-pro-landscape-25s',
        mode: ['text'],
        durationResolutionMap: [{ duration: [25], resolution: ['1080p'] }],
        audio: false,
      },
      {
        name: 'Sora 2 Pro 横屏 HD 10s',
        type: 'video',
        modelName: 'sora2-pro-landscape-hd-10s',
        mode: ['text'],
        durationResolutionMap: [{ duration: [10], resolution: ['1080p'] }],
        audio: false,
      },
      {
        name: 'Sora 2 Pro 横屏 HD 15s',
        type: 'video',
        modelName: 'sora2-pro-landscape-hd-15s',
        mode: ['text'],
        durationResolutionMap: [{ duration: [15], resolution: ['1080p'] }],
        audio: false,
      },
      {
        name: 'Sora 2 Pro 竖屏 25s',
        type: 'video',
        modelName: 'sora2-pro-portrait-25s',
        mode: ['text'],
        durationResolutionMap: [{ duration: [25], resolution: ['1080p'] }],
        audio: false,
      },
      {
        name: 'Sora 2 Pro 竖屏 HD 10s',
        type: 'video',
        modelName: 'sora2-pro-portrait-hd-10s',
        mode: ['text'],
        durationResolutionMap: [{ duration: [10], resolution: ['1080p'] }],
        audio: false,
      },
      {
        name: 'Sora 2 Pro 竖屏 HD 15s',
        type: 'video',
        modelName: 'sora2-pro-portrait-hd-15s',
        mode: ['text'],
        durationResolutionMap: [{ duration: [15], resolution: ['1080p'] }],
        audio: false,
      },
      {
        name: 'Grok Video 3',
        type: 'video',
        modelName: 'grok-video-3',
        mode: ['text', 'singleImage', 'startEndRequired', 'multiRefVideo'],
        durationResolutionMap: [{ duration: [5, 10], resolution: ['1080p'] }],
        audio: false,
      },
      {
        name: 'Grok Video 3 Max',
        type: 'video',
        modelName: 'grok-video-3-max',
        mode: ['text', 'singleImage', 'startEndRequired', 'multiRefVideo'],
        durationResolutionMap: [{ duration: [5, 10], resolution: ['1080p'] }],
        audio: false,
      },
      {
        name: 'Grok Video 3 Pro',
        type: 'video',
        modelName: 'grok-video-3-pro',
        mode: ['text', 'singleImage', 'startEndRequired', 'multiRefVideo'],
        durationResolutionMap: [{ duration: [5, 10], resolution: ['1080p'] }],
        audio: false,
      },
    ],
    code: getVendorCode('geekai') || '',
    enable: false,
    createTime: Date.now(),
  },
  // 火山引擎配置
  {
    id: "volcengine",
    author: "leeqi",
    description:
      "火山引擎方舟官方直连模板，接入 Ark 的文本、图片、视频生成 API，支持 Doubao、DeepSeek、GLM 等模型。\n[](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey)",
    name: "火山引擎",
    icon: "",
    inputs: [
      { key: "apiKey", label: "ARK API Key", type: "password", required: true },
      { key: "text", label: "文本生成接口", type: "url", required: false, placeholder: "如非必要请勿更改" },
      { key: "baseUrl", label: "Ark Base URL", type: "url", required: false, placeholder: "如非必要请勿更改" },
      { key: "image", label: "图片生成接口", type: "url", required: false, placeholder: "如非必要请勿更改" },
      { key: "videoCreate", label: "视频任务创建接口", type: "url", required: false, placeholder: "如非必要请勿更改" },
      { key: "videoQuery", label: "视频任务查询接口", type: "url", required: false, placeholder: "如非必要请勿更改" },
    ],
    inputValues: {
      apiKey: "",
      text: "https://ark.cn-beijing.volces.com/api/v3",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      image: "https://ark.cn-beijing.volces.com/api/v3/images/generations",
      videoCreate: "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks",
      videoQuery: "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{id}",
    },
    models: [
      { name: "Doubao-Seed-2.0-pro", type: "text", modelName: "doubao-seed-2-0-pro-260215", think: false },
      { name: "Doubao-Seed-2.0-lite", type: "text", modelName: "doubao-seed-2-0-lite-260215", think: false },
      { name: "Doubao-Seed-2.0-mini", type: "text", modelName: "doubao-seed-2-0-mini-260215", think: false },
      { name: "Doubao-Seed-2.0-Code", type: "text", modelName: "doubao-seed-2-0-code-preview-260215", think: false },
      { name: "Doubao-1.5-pro-32k", type: "text", modelName: "doubao-1-5-pro-32k-250115", think: false },
      { name: "deepseek-v3-250324", type: "text", modelName: "deepseek-v3-250324", think: false },
      { name: "glm-4-7-251222", type: "text", modelName: "glm-4-7-251222", think: false },
      { name: "Doubao-Seedream-5.0-lite", type: "image", modelName: "doubao-seedream-5-0-260128", mode: ["text", "singleImage", "multiReference"] },
      { name: "Doubao-Seedream-4.5", type: "image", modelName: "doubao-seedream-4-5-251128", mode: ["text", "singleImage", "multiReference"] },
      {
        name: "Doubao-Seedance-2.0 (多模态)",
        type: "video",
        modelName: "doubao-seedance-2-0-260128",
        mode: [["textReference", "videoReference", "imageReference", "audioReference"]],
        audio: true,
        durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["480p", "720p", "1080p"] }],
      },
      {
        name: "Doubao-Seedance-1.5-pro",
        type: "video",
        modelName: "doubao-seedance-1-5-pro-251215",
        mode: ["text", "singleImage", "endFrameOptional"],
        audio: true,
        durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12], resolution: ["480p", "720p", "1080p"] }],
      },
    ],
    code: getVendorCode('volcengine') || '',
    enable: false,
    createTime: 1775172727809,
  },
  // MiniMax标准接口 - 支持文本、图片、视频生成和TTS
  {
    id: "minimax",
    author: "MiniMax",
    description: "MiniMax标准格式接口，支持文本生成、图片生成、视频生成和语音合成(TTS)。\n\n官网: https://platform.minimaxi.com/",
    name: "MiniMax",
    icon: "",
    inputs: [
      { key: "apiKey", label: "API密钥", type: "password", required: true },
      { key: "baseUrl", label: "请求地址", type: "url", required: true, placeholder: "https://api.minimaxi.com/v1" },
    ],
    inputValues: { apiKey: "", baseUrl: "https://api.minimaxi.com/v1" },
    models: [
      // 文本模型
      { name: "MiniMax-M2.7", modelName: "MiniMax-M2.7", type: "text", think: true },
      { name: "MiniMax-M2.7-highspeed", modelName: "MiniMax-M2.7-highspeed", type: "text", think: true },
      { name: "MiniMax-M2.5", modelName: "MiniMax-M2.5", type: "text", think: true },
      { name: "MiniMax-M2.5-highspeed", modelName: "MiniMax-M2.5-highspeed", type: "text", think: true },
      // 图片生成模型
      { name: "MiniMax Image 01", modelName: "image-01", type: "image", mode: ["text"] },
      // 视频生成模型
      {
        name: "MiniMax Video 01",
        modelName: "video-01",
        type: "video",
        durationResolutionMap: [{ duration: [5, 10], resolution: ["480p", "720p", "1080p"] }],
        mode: ["text", "singleImage"],
        audio: false,
      },
      // TTS 语音合成模型
      // {
      //   name: "MiniMax TTS Turbo",
      //   modelName: "speech-01-turbo",
      //   type: "tts",
      //   voices: [
      //     { title: "少女音", voice: "female-shaonv" },
      //     { title: "青年音-青涩", voice: "male-qn-qingse" },
      //     { title: "青年音-精英", voice: "male-qn-jingying" },
      //     { title: "成熟女声", voice: "female-chengshu" },
      //     { title: "成熟男声", voice: "male-chengshu" },
      //     { title: "御姐音", voice: "female-yuzhong" },
      //     { title: "大叔音", voice: "male-dashu" },
      //   ],
      // },
      // {
      //   name: "MiniMax TTS",
      //   modelName: "speech-01",
      //   type: "tts",
      //   voices: [
      //     { title: "少女音", voice: "female-shaonv" },
      //     { title: "青年音-青涩", voice: "male-qn-qingse" },
      //     { title: "青年音-精英", voice: "male-qn-jingying" },
      //     { title: "成熟女声", voice: "female-chengshu" },
      //     { title: "成熟男声", voice: "male-chengshu" },
      //     { title: "御姐音", voice: "female-yuzhong" },
      //     { title: "大叔音", voice: "male-dashu" },
      //   ],
      // },
    ],
    code: getVendorCode('minimax') || '',
    enable: false,
    createTime: 1775154441614,
  },
  // OpenAI标准接口
  {
    id: "openai",
    author: "OpenAI",
    description: "OpenAI标准格式接口，如果没有你想要的模型请手动添加。",
    name: "OpenAI标准接口",
    icon: "",
    inputs: [
      { key: "apiKey", label: "API密钥", type: "password", required: true },
      { key: "baseUrl", label: "请求地址", type: "url", required: true, placeholder: "以v1结束，示例：https://api.openai.com/v1" },
    ],
    inputValues: { apiKey: "", baseUrl: "https://api.openai.com/v1" },
    models: [
      { name: "GPT-5.4", modelName: "gpt-5.4", type: "text", think: false },
    ],
    code: getVendorCode('openai') || '',
    enable: false,
    createTime: 1775154125094,
  },
  // DeepSeek 官方接口
  {
    id: "deepseek",
    author: "DeepSeek",
    description: "DeepSeek 官方 API 接口，支持 DeepSeek-V3、DeepSeek-R1 等模型。\n\n官网: https://platform.deepseek.com/",
    name: "DeepSeek",
    icon: "",
    inputs: [
      { key: "apiKey", label: "API密钥", type: "password", required: true },
      { key: "baseUrl", label: "请求地址", type: "url", required: true, placeholder: "https://api.deepseek.com/v1" },
    ],
    inputValues: { apiKey: "", baseUrl: "https://api.deepseek.com/v1" },
    models: [
      { name: "DeepSeek-V3", modelName: "deepseek-chat", type: "text", think: false },
      { name: "DeepSeek-R1", modelName: "deepseek-reasoner", type: "text", think: true },
    ],
    code: getVendorCode('deepseek') || '',
    enable: false,
    createTime: Date.now(),
  },
  // 可灵AI
  {
    id: "klingai",
    author: "klingai",
    description:
      "可灵AI新一代AI创意生产力工具，基于快手大模型团队自研的 图像生成@可图大模型 和 视频生成@可灵大模型 技术，提供丰富的AI图片、AI视频及相关可控编辑能力。https://app.klingai.com/cn/",
    name: "可灵AI",
    icon: "",
    inputs: [
      { key: "apiKey", label: "accessKey", type: "password", required: true, placeholder: "请到可灵官方申请" },
      { key: "sk", label: "SecretKey", type: "password", required: true, placeholder: "请到可灵官方申请" },
    ],
    inputValues: { apiKey: "", sk: "" },
    models: [
      {
        name: "kling-v3-omni pro (4K直出)",
        type: "video",
        modelName: "kling-v3-omni-pro",
        durationResolutionMap: [{ duration: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["540p", "720p", "1080p", "4k"] }],
        mode: ["singleImage", "startEndRequired", "text"],
        audio: true,
      },
      {
        name: "kling-v3-omni std",
        type: "video",
        modelName: "kling-v3-omni-std",
        durationResolutionMap: [{ duration: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["540p", "720p", "1080p"] }],
        mode: ["singleImage", "startEndRequired", "text"],
        audio: false,
      },
      {
        name: "kling-video-o1 pro",
        type: "video",
        modelName: "kling-video-o1-pro",
        durationResolutionMap: [{ duration: [5, 10], resolution: ["540p", "720p", "1080p"] }],
        mode: ["singleImage", "startEndRequired", "text"],
        audio: true,
      },
      {
        name: "kling-video-o1 标准版",
        type: "video",
        modelName: "kling-video-o1-std",
        durationResolutionMap: [{ duration: [5, 10], resolution: ["540p", "720p", "1080p"] }],
        mode: ["text", "startEndRequired"],
        audio: false,
      },
    ],
    code: getVendorCode('klingai') || '',
    enable: false,
    createTime: 1775155145953,
  },
  // Vidu开放平台
  {
    id: "vidu",
    author: "搬砖的Coder",
    description:
      "Vidu 是由生数科技联合清华大学正式发布的中国首个长时长、高一致性、高动态性视频大模型。Vidu 在语义理解、推理速度、动态幅度等方面具备领先优势，并上线了全球首个「多主体参考」功能，突破视频模型一致性生成难题，开启了视觉上下文时代",
    name: "Vidu 开放平台",
    icon: "",
    inputs: [
      { key: "apiKey", label: "API密钥", type: "password", required: true, placeholder: "请到Vidu官方申请" },
      { key: "baseUrl", label: "接口路径", type: "url", required: false, placeholder: "https://api.vidu.cn/ent/v2" },
    ],
    inputValues: { apiKey: "", baseUrl: "https://api.vidu.cn/ent/v2" },
    models: [
      {
        name: "ViduQ3 turbo",
        type: "video",
        modelName: "ViduQ3-turbo",
        durationResolutionMap: [{ duration: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], resolution: ["540p", "720p", "1080p"] }],
        mode: ["singleImage", "startEndRequired", "text", "multiRefVideo"],
        audio: true,
      },
      {
        name: "ViduQ3 pro",
        type: "video",
        modelName: "ViduQ3-pro",
        durationResolutionMap: [{ duration: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], resolution: ["540p", "720p", "1080p"] }],
        mode: ["singleImage", "startEndRequired", "text", "multiRefVideo"],
        audio: true,
      },
      {
        name: "ViduQ2 pro fast",
        type: "video",
        modelName: "ViduQ2-pro-fast",
        durationResolutionMap: [{ duration: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], resolution: ["720p", "1080p"] }],
        mode: ["singleImage", "startEndRequired"],
        audio: true,
      },
      {
        name: "ViduQ2 turbo",
        type: "video",
        modelName: "ViduQ2-turbo",
        durationResolutionMap: [{ duration: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], resolution: ["540p", "720p", "1080p"] }],
        mode: ["singleImage", "startEndRequired"],
        audio: true,
      },
      { name: "viduq2 for image", type: "image", modelName: "viduq2", mode: ["text"] },
    ],
    code: getVendorCode('vidu') || '',
    enable: false,
    createTime: 1775155162784,
  },
  // Google Gemini
  {
    id: "google",
    author: "Google",
    description: "Google Gemini API，支持文本生成和图片生成。\n\n官网: https://ai.google.dev/\n\n获取API密钥: https://aistudio.google.com/app/apikey",
    name: "Google Gemini",
    icon: "",
    inputs: [
      { key: "apiKey", label: "API密钥", type: "password", required: true, placeholder: "从 Google AI Studio 获取" },
      { key: "baseUrl", label: "请求地址", type: "url", required: false, placeholder: "https://generativelanguage.googleapis.com/v1beta" },
    ],
    inputValues: { apiKey: "", baseUrl: "https://generativelanguage.googleapis.com/v1beta" },
    models: [
      // 文本模型 - Gemini 2.5 系列 (最新)
      { name: "Gemini 2.5 Pro", modelName: "gemini-2.5-pro", type: "text", think: false },
      { name: "Gemini 2.5 Flash", modelName: "gemini-2.5-flash", type: "text", think: false },
      { name: "Gemini 2.5 Flash-Lite", modelName: "gemini-2.5-flash-lite", type: "text", think: false },
      // 文本模型 - Gemini 2.0 系列
      { name: "Gemini 2.0 Flash", modelName: "gemini-2.0-flash", type: "text", think: false },
      { name: "Gemini 2.0 Flash-Lite", modelName: "gemini-2.0-flash-lite", type: "text", think: false },
      // 图片生成模型
      { name: "Gemini 2.0 Flash Image", modelName: "gemini-2.0-flash-exp-image-generation", type: "image", mode: ["text", "singleImage", "multiReference"] },
      // 视频生成模型 - Veo 3.1 系列 (最新 2026年1月)
      {
        name: "Veo 3.1 (4K)",
        modelName: "veo-3.1-generate-preview",
        type: "video",
        mode: ["text", "singleImage", "startEndRequired", "multiRefVideo"],
        audio: true,
        durationResolutionMap: [{ duration: [5, 6, 7, 8], resolution: ["720p", "1080p", "4k"] }],
      },
      {
        name: "Veo 3.1 Fast",
        modelName: "veo-3.1-fast-generate-preview",
        type: "video",
        mode: ["text", "singleImage", "multiRefVideo"],
        audio: true,
        durationResolutionMap: [{ duration: [5, 6, 7, 8], resolution: ["720p", "1080p"] }],
      },
      {
        name: "Veo 3.1 Lite",
        modelName: "veo-3.1-lite-generate-preview",
        type: "video",
        mode: ["text", "singleImage", "multiRefVideo"],
        audio: true,
        durationResolutionMap: [{ duration: [5, 6, 7, 8], resolution: ["720p", "1080p"] }],
      },
    ],
    code: getVendorCode('google') || '',
    enable: false,
    createTime: Date.now(),
  },
  // 魔搭 (ModelScope) 供应商
  {
    id: 'modelscope',
    author: '魔搭',
    description:
      '## 魔搭 (ModelScope) 供应商\n\n魔搭是阿里云的模型服务平台，提供多种开源 AI 模型，包括通义万相、Qwen 图像系列、FLUX 等。\n\n🔗 [魔搭官网](https://modelscope.cn/)\n\n📖 [API 文档](https://modelscope.cn/docs)',
    name: '魔搭',
    icon: '',
    inputs: [
      { key: 'apiKey', label: 'API密钥', type: 'password', required: true, placeholder: '从魔搭获取 API Key' },
    ],
    inputValues: { apiKey: '' },
    models: [
      // 文本/视觉语言模型
      {
        name: 'Qwen3.5-35B-A3B',
        type: 'text',
        modelName: 'Qwen/Qwen3.5-35B-A3B',
        think: false,
      },
      // 图片生成模型
      {
        name: 'Z-Image-Turbo',
        type: 'image',
        modelName: 'Tongyi-MAI/Z-Image-Turbo',
        mode: ['text'],
      },
      {
        name: 'Qwen-Image',
        type: 'image',
        modelName: 'Qwen/Qwen-Image',
        mode: ['text'],
      },
      {
        name: 'Qwen-Image-Edit',
        type: 'image',
        modelName: 'Qwen/Qwen-Image-Edit-2509',
        mode: ['text', 'singleImage'],
      },
      {
        name: 'FLUX.1-Krea-dev',
        type: 'image',
        modelName: 'black-forest-labs/FLUX.1-Krea-dev',
        mode: ['text'],
      },
    ],
    code: getVendorCode('modelscope') || '',
    enable: false,
    createTime: Date.now(),
  },
];

// 默认Agent部署配置
export const defaultAgentDeploys: AgentDeploy[] = [
  {
    id: "script-agent",
    key: "scriptAgent",
    name: "剧本Agent",
    desc: "用于读取原文生成故事骨架、改编策略，建议使用具备强大文本理解和生成能力的模型",
    modelName: "",
    vendorId: "",
    disabled: false,
  },
  {
    id: "production-agent",
    key: "productionAgent",
    name: "生产Agent",
    desc: "对工作流进行调度和管理，建议使用具备较强的逻辑推理和任务管理能力的模型",
    modelName: "",
    vendorId: "",
    disabled: false,
  },
  {
    id: "universal-ai",
    key: "universalAi",
    name: "通用AI",
    desc: "用于小说事件提取、资产提示词生成、台词提取等边缘功能，建议使用具备较强文本处理能力的模型",
    modelName: "",
    vendorId: "",
    disabled: false,
  },
  {
    id: "vl-agent",
    key: "vlAgent",
    name: "视觉分析Agent",
    desc: "用于对标视频分析、视觉内容理解，建议使用具备视觉理解能力的模型（如 GPT-4V、Claude 3、Gemini Pro Vision）",
    modelName: "",
    vendorId: "",
    disabled: false,
  },
  {
    id: "tts-dubbing",
    key: "ttsDubbing",
    name: "TTS配音",
    desc: "根据剧本内容生成角色配音，支持多种声音风格和情绪",
    modelName: "",
    vendorId: "",
    disabled: true,
  },
];
