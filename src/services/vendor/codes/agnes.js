// Agnes AI 供应商代码
// 支持文本、图像、视频生成
// 文档参考: E:\pystudy\agens-ai.md
//
// 注意：Web Worker 沙箱环境，避免使用模板字符串、可选链 ?.、空值合并 ??、class 字段初始化器等新语法
var AGNES_API_URL = "https://apihub.agnes-ai.com";

// 视频分辨率标准像素映射（16:9 / 9:16 / 1:1 / 4:3 / 3:4 / 21:9）
// 文档说会自动标准化，但尽量传接近标准档位的像素值
var VIDEO_RESOLUTION_MAP = {
  "480p": { width: 854, height: 480 },
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 }
};

// 视频时长到 num_frames 的映射（遵循 8n+1 规则，≤441）
var DURATION_TO_FRAMES = {
  3: 81,    // 约 3.4 秒
  5: 121,   // 约 5 秒
  10: 241,  // 约 10 秒
  15: 361,  // 约 15 秒
  18: 441   // 约 18.4 秒
};

// 根据 aspectRatio 调整宽高方向（横屏 vs 竖屏）
function resolveVideoSize(resolution, aspectRatio) {
  var base = VIDEO_RESOLUTION_MAP[resolution] || VIDEO_RESOLUTION_MAP["720p"];
  var ratio = aspectRatio || "16:9";

  // 竖屏比例：宽高互换
  if (ratio === "9:16" || ratio === "3:4" || ratio === "2:3") {
    return { width: base.height, height: base.width };
  }
  return { width: base.width, height: base.height };
}

// 根据 duration 计算 num_frames（遵循 8n+1 规则，≤441）
function resolveNumFrames(duration) {
  var d = parseInt(duration || "5", 10);
  if (DURATION_TO_FRAMES[d]) {
    return DURATION_TO_FRAMES[d];
  }
  // 通用映射：duration * 24 帧，对齐到 8n+1
  var raw = Math.round(d * 24 / 8) * 8 + 1;
  return Math.min(441, Math.max(9, raw));
}

// 提取首个有效图片输入（URL 或 Data URI Base64）
function extractFirstImage(imageUrls, imageBase64) {
  if (imageUrls && imageUrls.length > 0 && imageUrls[0]) {
    var url = imageUrls[0];
    // 跳过本地 asset 协议（无法被 Agnes 服务端访问）
    if (url.indexOf("asset.localhost") === -1 && url.indexOf("asset://") === -1) {
      return url;
    }
  }
  if (imageBase64 && imageBase64.length > 0 && imageBase64[0]) {
    return imageBase64[0];
  }
  return "";
}

function Vendor(config) {
  this.config = config;
  this.apiKey = (config.inputValues && config.inputValues.apiKey) ? config.inputValues.apiKey : "";
}

// 文本生成
// POST /v1/chat/completions
// 返回 data.choices[0].message.content
Vendor.prototype.textRequest = function(model) {
  var self = this;
  return function(params) {
    var messages = [];

    if (params.messages && params.messages.length > 0) {
      messages = params.messages;
    } else if (params.prompt) {
      messages.push({ role: "user", content: params.prompt });
    }

    var requestData = {
      model: model.modelName,
      messages: messages,
      temperature: params.temperature !== undefined ? params.temperature : 0.7,
      max_tokens: params.maxTokens !== undefined ? params.maxTokens : 2048
    };

    return tauriFetch(AGNES_API_URL + "/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + self.apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestData)
    }).then(function(response) {
      if (!response.ok) {
        return response.text().then(function(text) {
          throw new Error("Agnes 文本生成请求失败: " + text);
        });
      }
      return response.json();
    }).then(function(data) {
      if (data.error) {
        throw new Error("Agnes 文本生成错误: " + (data.error.message ? data.error.message : JSON.stringify(data.error)));
      }
      if (data.choices && data.choices.length > 0 && data.choices[0].message) {
        var msg = data.choices[0].message;
        var content = msg.content || "";
        var reasoning = msg.reasoning_content || "";
        if (content) return content;
        if (reasoning) return reasoning;
        throw new Error("Agnes 返回空结果（content 和 reasoning_content 均为空），请检查 maxTokens 或模型配置");
      }
      throw new Error("Agnes 文本生成返回异常: " + JSON.stringify(data));
    });
  };
};

// 图像生成
// POST /v1/images/generations
// 文生图：仅需 model/prompt/size
// 图生图：extra_body.image 数组，支持公共 URL 或 Data URI Base64
// 重要：response_format 必须放在 extra_body 内，不能放顶层
// 返回 data[0].url
Vendor.prototype.imageRequest = function(model) {
  var self = this;
  return function(params) {
    var extraBody = {};
    var modelModes = model.mode || [];
    var supportsImageEdit = false;

    for (var i = 0; i < modelModes.length; i++) {
      if (modelModes[i] === "singleImage" || modelModes[i] === "multiReference") {
        supportsImageEdit = true;
        break;
      }
    }

    if (supportsImageEdit) {
      var imageUrl = extractFirstImage(params.imageUrls, params.imageBase64);
      if (imageUrl) {
        extraBody.image = [imageUrl];
      }
    }

    // response_format 必须放在 extra_body 内（文档警告）
    extraBody.response_format = "url";

    var requestData = {
      model: model.modelName,
      prompt: params.prompt || "",
      size: params.size || "1K",
      ratio: params.aspectRatio || "1:1",
      extra_body: extraBody
    };

    return tauriFetch(AGNES_API_URL + "/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + self.apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestData)
    }).then(function(response) {
      if (!response.ok) {
        return response.text().then(function(text) {
          throw new Error("Agnes 图片生成请求失败: " + text);
        });
      }
      return response.json();
    }).then(function(data) {
      if (data.error) {
        throw new Error("Agnes 图片生成错误: " + (data.error.message ? data.error.message : JSON.stringify(data.error)));
      }
      if (data.data && data.data.length > 0) {
        // 优先返回 url，回退 b64_json
        if (data.data[0].url) {
          return data.data[0].url;
        }
        if (data.data[0].b64_json) {
          return "data:image/png;base64," + data.data[0].b64_json;
        }
      }
      throw new Error("Agnes 图片生成返回异常: " + JSON.stringify(data));
    });
  };
};

// 视频生成（异步任务）
// 1. POST /v1/videos 创建任务，拿到 video_id
// 2. GET /agnesapi?video_id=<VIDEO_ID> 轮询，status=completed 时返回 url
// 文生视频：无需 image
// 图生视频：image 字段（单个 URL 或 Data URI）
// 关键帧动画：extra_body.image 数组 + extra_body.mode="keyframes"
Vendor.prototype.videoRequest = function(model) {
  var self = this;
  return function(params) {
    var resolution = params.resolution || "720p";
    var aspectRatio = params.aspectRatio || "16:9";
    var size = resolveVideoSize(resolution, aspectRatio);
    var numFrames = resolveNumFrames(params.duration);

    var requestData = {
      model: model.modelName,
      prompt: params.prompt || "",
      width: size.width,
      height: size.height,
      num_frames: numFrames,
      frame_rate: 24
    };

    // 图生视频：首帧图片
    if (params.firstImageBase64) {
      requestData.image = params.firstImageBase64;
    }

    // 创建任务
    return tauriFetch(AGNES_API_URL + "/v1/videos", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + self.apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestData)
    }).then(function(response) {
      if (!response.ok) {
        return response.text().then(function(text) {
          throw new Error("Agnes 视频生成任务提交失败: " + text);
        });
      }
      return response.json();
    }).then(function(data) {
      if (data.error) {
        throw new Error("Agnes 视频生成错误: " + (data.error.message ? data.error.message : JSON.stringify(data.error)));
      }

      // 优先使用 video_id，回退 task_id
      var videoId = data.video_id || data.task_id || data.id;
      if (!videoId) {
        throw new Error("Agnes 视频生成任务提交失败: 未返回 video_id");
      }

      // 轮询获取结果
      return pollTask(function() {
        return tauriFetch(AGNES_API_URL + "/agnesapi?video_id=" + videoId, {
          method: "GET",
          headers: {
            "Authorization": "Bearer " + self.apiKey
          }
        }).then(function(queryResponse) {
          if (!queryResponse.ok) {
            // 404 等错误不立即失败，继续轮询
            return { completed: false };
          }
          return queryResponse.json();
        }).then(function(queryData) {
          if (!queryData) {
            return { completed: false };
          }
          if (queryData.error) {
            return {
              completed: true,
              error: "Agnes 视频生成错误: " + (queryData.error.message ? queryData.error.message : JSON.stringify(queryData.error))
            };
          }

          var status = queryData.status;
          if (status === "completed") {
            if (queryData.url) {
              return { completed: true, data: queryData.url };
            }
            return { completed: true, error: "Agnes 视频生成成功但未返回视频URL" };
          }
          if (status === "failed") {
            var errMsg = (queryData.error && queryData.error.message) ? queryData.error.message : "未知错误";
            return { completed: true, error: "Agnes 视频生成失败: " + errMsg };
          }
          // queued / in_progress 继续轮询
          return { completed: false };
        });
      }, { interval: 5000, maxAttempts: 120 });
    }).then(function(pollResult) {
      if (pollResult.error) {
        throw new Error(pollResult.error);
      }
      return pollResult.data;
    });
  };
};

module.exports = { Vendor: Vendor };
