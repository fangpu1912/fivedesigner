// ModelScope 魔搭 供应商代码
// 使用 Tauri 后端命令调用魔搭API（同步+异步双模式）
class Vendor {
  constructor(config) {
    this.config = config;
    this.apiKey = config.inputValues && config.inputValues.apiKey || "";
  }

  async textRequest(model) {
    return async function(params) {
      var self = this;

      var messages = [];
      if (params.messages && params.messages.length > 0) {
        for (var i = 0; i < params.messages.length; i++) {
          var msg = params.messages[i];
          var content = msg.content;

          // 检测消息中的 data URL（图片/视频），转为 VL 多模态格式
          var dataUrlMatch = content.match(/data:(image|video)\/[^;\s]+;base64,[A-Za-z0-9+/=]+/);
          if (dataUrlMatch) {
            var dataUrl = dataUrlMatch[0];
            var mediaType = dataUrlMatch[1];
            var textPart = content.substring(0, dataUrlMatch.index || 0).trim();
            var mediaBlock = {};
            if (mediaType === "video") {
              mediaBlock = { type: "video_url", video_url: { url: dataUrl } };
            } else {
              mediaBlock = { type: "image_url", image_url: { url: dataUrl } };
            }
            messages.push({
              role: msg.role,
              content: [
                { type: "text", text: textPart || "请分析以下内容" },
                mediaBlock
              ]
            });
          } else {
            messages.push({ role: msg.role, content: content });
          }
        }
      } else if (params.prompt) {
        messages.push({ role: "user", content: params.prompt });
      }

      var requestData = {
        model: model.modelName,
        messages: messages,
        max_tokens: params.maxTokens || 2048,
        temperature: params.temperature !== undefined ? params.temperature : 0.7
      };

      console.log("[ModelScope] 提交对话请求，消息数:", messages.length);
      var response = await tauriInvoke("modelscope_chat", {
        apiKey: self.apiKey,
        request: requestData
      });

      if (response && response.choices && response.choices.length > 0) {
        return response.choices[0].message.content;
      }

      throw new Error("魔搭对话API返回异常: " + JSON.stringify(response));
    }.bind(this);
  }

  async imageRequest(model) {
    return async function(params) {
      var self = this;

      var requestData = {
        model: model.modelName,
        prompt: params.prompt || ""
      };

      // size: 分辨率 widthxheight（SD: 64x64~2048x2048, FLUX: 64x64~1024x1024, Qwen: 64x64~1664x1664, Z-Image: 512x512~2048x2048）
      if (params.width && params.height) {
        requestData.size = params.width + "x" + params.height;
      }

      // negative_prompt: 负向提示词（长度 < 2000）
      if (params.negativePrompt) {
        requestData.negative_prompt = params.negativePrompt;
      }

      // seed: 随机种子 [0, 2^31-1]
      if (params.seed !== undefined && params.seed !== null) {
        requestData.seed = parseInt(params.seed);
      }

      // steps: 采样步数 [1, 100]
      if (params.steps !== undefined && params.steps !== null) {
        requestData.steps = parseInt(params.steps);
      }

      // guidance: 提示词引导系数 [1.5, 20]
      if (params.guidance !== undefined && params.guidance !== null) {
        requestData.guidance = parseFloat(params.guidance);
      }

      // image_url: 图片编辑模型的参考图（公网URL或base64），仅编辑模型支持
      var modelModes = model.mode || [];
      var supportsImageEdit = modelModes.indexOf("singleImage") !== -1 || modelModes.indexOf("multiReference") !== -1;
      if (supportsImageEdit) {
        // 优先使用公网URL（排除 Tauri asset.localhost 虚拟域名）
        if (params.imageUrls && params.imageUrls.length > 0) {
          var url = params.imageUrls[0];
          if (url.indexOf("asset.localhost") === -1) {
            requestData.image_url = url;
          }
        }
        // 没有有效公网URL时，回退到base64数据（排除 asset.localhost URL）
        if (!requestData.image_url && params.imageBase64 && params.imageBase64.length > 0) {
          var base64Val = params.imageBase64[0];
          if (base64Val && base64Val.indexOf("asset.localhost") === -1) {
            requestData.image_url = base64Val;
          }
        }
      }

      // 使用异步模式
      requestData.async_mode = true;

      console.log("[ModelScope] 提交异步任务，请求数据:", JSON.stringify(requestData));
      var response = await tauriInvoke("modelscope_submit_task", {
        apiKey: self.apiKey,
        request: requestData
      });
      console.log("[ModelScope] 任务响应:", JSON.stringify(response));

      // 同步模式兜底：直接返回图片URL
      if (response.image_url) {
        return response.image_url;
      }

      var taskId = response.task_id;
      if (!taskId) {
        throw new Error("魔搭返回异常: " + JSON.stringify(response));
      }

      // 轮询异步任务状态
      var maxAttempts = 120;
      var interval = 3000;

      for (var attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise(function(resolve) {
          setTimeout(resolve, interval);
        });

        var status = await tauriInvoke("modelscope_check_status", {
          apiKey: self.apiKey,
          taskId: taskId
        });

        if (status.task_status === "SUCCEED") {
          if (status.output_images && status.output_images.length > 0) {
            return status.output_images[0];
          }
          throw new Error("任务完成但未返回图片");
        }

        if (status.task_status === "FAILED") {
          throw new Error("魔搭图片生成任务失败: " + JSON.stringify(status));
        }
      }

      throw new Error("魔搭图片生成任务超时");
    }.bind(this);
  }

  async videoRequest(model) {
    return async function(params) {
      throw new Error("魔搭暂不支持视频生成");
    }.bind(this);
  }

  async ttsRequest(model) {
    return async function(params) {
      throw new Error("魔搭暂不支持 TTS 语音合成");
    }.bind(this);
  }
}

module.exports = { Vendor };
