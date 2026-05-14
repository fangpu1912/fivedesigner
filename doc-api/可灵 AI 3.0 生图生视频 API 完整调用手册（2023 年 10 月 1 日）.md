# 可灵 AI 3.0 生图生视频 API 完整调用手册（2023 年 10 月 1 日）

# 可灵AI 3.0 生图生视频 API 完整调用手册（纯JSON可复制）

## 通用规范

- **请求头**

```Plain Text

Content-Type: application/json
Authorization: Bearer 你的API密钥
```

- **基础域名**：`https://api.kelingai.com`

- **资源格式**：图片支持URL/Base64，视频仅支持URL

- **任务查询**：创建任务后拿到 `task_id`，GET请求查询结果

---

# 一、生图类 API

## 1.1 文生图（基础版）

**接口**：`POST /v1/images/generations`

```JSON

{
    "model_name": "kling-v3",
    "prompt": "春日樱花林，一只小鹿在溪边喝水，唯美治愈，柔和光影，高清细节",
    "negative_prompt": "模糊，低分辨率，人物，建筑，畸变",
    "resolution": "2k",
    "n": 3,
    "aspect_ratio": "16:9",
    "watermark_info": [
        {
            "enabled": false
        }
    ],
    "callback_url": "https://xxx/callback",
    "external_task_id": "img-text-001"
}
```

## 1.2 图生图（基础版）

**接口**：`POST /v1/images/generations`

```JSON

{
    "model_name": "kling-v3",
    "prompt": "将参考图中的小猫换成橘猫，背景改为秋日枫叶林，保持原图构图",
    "image": "https://xxx/refer-cat.jpg",
    "resolution": "2k",
    "n": 2,
    "aspect_ratio": "1:1",
    "watermark_info": [
        {
            "enabled": false
        }
    ],
    "callback_url": "https://xxx/callback",
    "external_task_id": "img-img-001"
}
```

## 1.3 多参考生图（多图+主体 全能版）

**接口**：`POST /v1/images/omni-image`

```JSON

{
    "model_name": "kling-v3-omni",
    "prompt": "结合<<<image_1>>>场景与<<<element_1>>>主体，生成科幻电影海报，<<<element_2>>>在右侧",
    "image_list": [
        {
            "image_url": "https://xxx/refer-scene.jpg"
        },
        {
            "image_url": "https://xxx/refer-style.jpg"
        }
    ],
    "element_list": [
        {
            "element_id": 1001
        },
        {
            "element_id": 1002
        }
    ],
    "resolution": "4k",
    "result_type": "single",
    "aspect_ratio": "21:9",
    "watermark_info": [
        {
            "enabled": false
        }
    ],
    "callback_url": "https://xxx/callback",
    "external_task_id": "img-multi-001"
}
```

---

# 二、生视频类 API

## 2.1 文生视频（单镜头）

**接口**：`POST /v1/videos/text2video`

```JSON

{
    "model_name": "kling-v3",
    "multi_shot": false,
    "prompt": "宇航员在月球表面行走，背后是地球，星空浩瀚，慢动作，无对话",
    "sound": "on",
    "mode": "pro",
    "aspect_ratio": "16:9",
    "duration": "10",
    "watermark_info": [
        {
            "enabled": false
        }
    ],
    "callback_url": "https://xxx/callback",
    "external_task_id": "vid-text-001"
}
```

## 2.2 图生视频（仅首帧）

**接口**：`POST /v1/videos/image2video`

```JSON

{
    "model_name": "kling-v3",
    "multi_shot": false,
    "image": "https://xxx/refer-astronaut.jpg",
    "prompt": "宇航员从首帧缓慢转身望向火星，太空碎片漂浮，动态自然流畅",
    "sound": "off",
    "mode": "pro",
    "aspect_ratio": "16:9",
    "duration": "8",
    "watermark_info": [
        {
            "enabled": false
        }
    ],
    "callback_url": "https://xxx/callback",
    "external_task_id": "vid-img-001"
}
```

## 2.3 图生视频（首尾帧 · 一镜到底）

**接口**：`POST /v1/videos/image2video`

```JSON

{
    "model_name": "kling-v3",
    "multi_shot": false,
    "image": "https://xxx/first-frame.jpg",
    "image_tail": "https://xxx/end-frame.jpg",
    "prompt": "清晨湖面过渡到黄昏湖面，天鹅游动，光线自然渐变，无多余元素",
    "sound": "on",
    "mode": "pro",
    "duration": "12",
    "watermark_info": [
        {
            "enabled": false
        }
    ],
    "callback_url": "https://xxx/callback",
    "external_task_id": "vid-frames-001"
}
```

## 2.4 多参考生视频（无参考视频 · 图+主体）

**接口**：`POST /v1/videos/omni-video`

```JSON

{
    "model_name": "kling-v3-omni",
    "multi_shot": false,
    "prompt": "<<<element_1>>>在<<<image_1>>>森林奔跑，<<<image_2>>>蝴蝶环绕，光影自然",
    "image_list": [
        {
            "image_url": "https://xxx/refer-forest.jpg"
        },
        {
            "image_url": "https://xxx/refer-butterfly.jpg"
        }
    ],
    "element_list": [
        {
            "element_id": 2001
        },
        {
            "element_id": 2002
        }
    ],
    "video_list": [],
    "sound": "on",
    "mode": "pro",
    "aspect_ratio": "9:16",
    "duration": "10",
    "watermark_info": [
        {
            "enabled": false
        }
    ],
    "callback_url": "https://xxx/callback",
    "external_task_id": "vid-multi-001"
}
```

## 2.5 多参考生视频（含参考视频 · 图+主体+视频）

**接口**：`POST /v1/videos/omni-video`

```JSON

{
    "model_name": "kling-v3-omni",
    "multi_shot": false,
    "prompt": "参考<<<video_1>>>动作，<<<element_1>>>在<<<image_1>>>城市中跑酷，节奏一致",
    "image_list": [
        {
            "image_url": "https://xxx/refer-city.jpg"
        }
    ],
    "element_list": [
        {
            "element_id": 2001
        }
    ],
    "video_list": [
        {
            "video_url": "https://xxx/refer-parkour.mp4",
            "refer_type": "feature",
            "keep_original_sound": "no"
        }
    ],
    "sound": "off",
    "mode": "pro",
    "aspect_ratio": "16:9",
    "duration": "8",
    "watermark_info": [
        {
            "enabled": false
        }
    ],
    "callback_url": "https://xxx/callback",
    "external_task_id": "vid-video-ref-001"
}
```

---

# 三、任务查询 API（通用）

## 3.1 查询图片任务

- **地址**：`GET /v1/images/omni-image/{task_id}`

- **请求体**：无

## 3.2 查询视频任务

- **地址**：`GET /v1/videos/omni-video/{task_id}`

- **请求体**：无

## 3.3 任务状态说明

- `submitted`：已提交

- `processing`：生成中

- `succeed`：生成成功

- `failed`：生成失败

---

### 总结

1. 这份 **纯MD文档** 可直接保存、分享、对接使用，所有JSON均可一键复制

2. 覆盖你要的全部能力：**文生图、图生图、多参考生图、文生视频、图生视频、首尾帧、多参考生视频**

3. 全能接口统一用 `omni-image / omni-video`，兼容性最强、功能最全
> （注：文档部分内容可能由 AI 生成）