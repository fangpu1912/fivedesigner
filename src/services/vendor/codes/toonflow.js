// Toonflow 供应商代码
const TOONFLOW_API_URL = "https://api.toonflow.net/v1";

class Vendor {
  constructor(config) {
    this.config = config;
    this.baseUrl = config.inputValues?.baseUrl || TOONFLOW_API_URL;
    this.apiKey = config.inputValues?.apiKey || "";
  }

  // 文本生成
  async textRequest(model) {
    return async (params) => {
      const response = await fetch(this.baseUrl + '/chat/completions', {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + this.apiKey,
        },
        body: JSON.stringify({
          model: model.modelName,
          messages: params.messages,
          temperature: params.temperature ?? 0.7,
          max_tokens: params.maxTokens ?? 2048,
        }),
      });
      const data = await response.json();
      return data.choices?.[0]?.message?.content || "";
    };
  }

  // 图片生成
  async imageRequest(model) {
    return async (input) => {
      console.log('Toonflow imageRequest input:', {
        prompt: input.prompt?.substring(0, 50),
        imageBase64Count: input.imageBase64?.length || 0,
      });

      const lowerName = model.modelName.toLowerCase();

      // Gemini / nano 系模型：走 chat/completions 接口
      if (lowerName.includes("gemini") || lowerName.includes("nano")) {
        const messages = [];
        if (input.imageBase64 && input.imageBase64.length > 0) {
          messages.push({
            role: "user",
            content: input.imageBase64.map((b) => ({ type: "image_url", image_url: { url: b } })),
          });
        }
        if (input.maskBase64) {
          messages.push({
            role: "user",
            content: [
              { type: "image_url", image_url: { url: input.maskBase64 } },
              { type: "text", text: "这是需要重绘的遮罩区域（白色为重绘区域）" },
            ],
          });
        }
        messages.push({ role: "user", content: input.prompt + "请直接输出图片" });

        const body = {
          model: model.modelName,
          messages,
          extra_body: {
            google: {
              image_config: {
                aspect_ratio: input.aspectRatio || "16:9",
                image_size: input.size || "2K",
              }
            }
          },
        };

        console.log('Toonflow: sending gemini image request to', this.baseUrl + '/chat/completions');
        const response = await fetch(this.baseUrl + '/chat/completions', {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + this.apiKey,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Toonflow gemini API error:', response.status, errorText);
          throw new Error("Gemini API request failed: " + response.status + " " + errorText);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "";

        // 从 markdown 中提取图片
        const regex = /!\[([^\]]*)\]\((data:image\/[^;]+;base64,[A-Za-z0-9+/=]+|https?:\/\/[^\s)]+)/;
        const match = content.match(regex);
        if (!match) throw new Error("未能从响应中提取图片");

        const imageUrl = match[2].trim();
        if (imageUrl.startsWith("data:")) return imageUrl;
        return await urlToBase64(imageUrl);
      }

      // 豆包 / seedream 系模型：走 images/generations 接口
      if (lowerName.includes("doubao") || lowerName.includes("seedream")) {
        const effectiveSize = input.size === "1K" ? "2K" : (input.size || "2K");
        const aspectRatio = input.aspectRatio || "16:9";
        const sizeMap = {
          "16:9": { "2K": "2848x1600", "4K": "4096x2304" },
          "9:16": { "2K": "1600x2848", "4K": "2304x4096" },
        };
        const resolvedSize = sizeMap[aspectRatio]?.[effectiveSize];

        const body = {
          model: model.modelName,
          prompt: input.prompt,
          size: resolvedSize,
          response_format: "url",
          sequential_image_generation: "disabled",
          stream: false,
          watermark: false,
        };

        if (input.imageBase64 && input.imageBase64.length > 0) {
          body.image = input.imageBase64;
        }

        if (input.maskBase64) {
          body.mask = input.maskBase64;
        }

        console.log('Toonflow: sending doubao image request to', this.baseUrl + '/images/generations');
        const response = await fetch(this.baseUrl + '/images/generations', {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + this.apiKey,
          },
          body: JSON.stringify(body),
        });

        console.log('Toonflow: image response status:', response.status, 'ok:', response.ok);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Toonflow image API error:', response.status, errorText);
          throw new Error("Image API request failed: " + response.status + " " + errorText);
        }

        const data = await response.json();
        console.log('Toonflow image API response:', data);
        const resultUrl = data.data?.[0]?.url;
        if (!resultUrl) throw new Error("未能获取图片URL");
        return await urlToBase64(resultUrl);
      }

      // 默认使用 images/generations 接口
      const formData = new FormData();
      formData.append("model", model.modelName);
      formData.append("prompt", input.prompt);

      if (input.imageBase64 && input.imageBase64.length > 0) {
        for (let i = 0; i < input.imageBase64.length; i++) {
          const base64 = input.imageBase64[i];
          if (base64) {
            const compressed = await zipImage(base64, 5 * 1024 * 1024);
            const blob = new Blob([Buffer.from(compressed, "base64")], { type: "image/jpeg" });
            formData.append("image", blob, "image_" + i + ".jpg");
          }
        }
      }

      if (input.maskBase64) {
        const compressed = await zipImage(input.maskBase64, 5 * 1024 * 1024);
        const blob = new Blob([Buffer.from(compressed, "base64")], { type: "image/png" });
        formData.append("mask", blob, "mask.png");
      }

      console.log('Toonflow: sending image request to', this.baseUrl + '/images/generations');
      const response = await fetch(this.baseUrl + '/images/generations', {
        method: "POST",
        headers: {
          Authorization: "Bearer " + this.apiKey,
        },
        body: formData,
      });

      console.log('Toonflow: image response status:', response.status, 'ok:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Toonflow image API error:', response.status, errorText);
        throw new Error("Image API request failed: " + response.status + " " + errorText);
      }

      const data = await response.json();
      console.log('Toonflow image API response:', data);
      return data.url || data.data?.[0]?.url || "";
    };
  }

  // 视频生成
  async videoRequest(model) {
    return async (input) => {
      console.log('Toonflow videoRequest input:', {
        prompt: input.prompt?.substring(0, 50),
        firstImageBase64: input.firstImageBase64 ? 'has data' : 'no data',
        lastImageBase64: input.lastImageBase64 ? 'has data' : 'no data',
        referenceImagesCount: input.referenceImages?.length || 0,
        duration: input.duration,
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
      });

      const lowerName = model.modelName.toLowerCase();
      const baseUrl = this.baseUrl;
      const apiKey = this.apiKey;

      // 收集参考图片
      const imageRefs = [];
      if (input.firstImageBase64) imageRefs.push(input.firstImageBase64);
      if (input.lastImageBase64) imageRefs.push(input.lastImageBase64);
      if (input.referenceImages && input.referenceImages.length > 0) {
        for (const img of input.referenceImages) {
          if (!imageRefs.includes(img)) imageRefs.push(img);
        }
      }

      // 万象系列特殊处理
      if (lowerName.includes("wan")) {
        const metadata = {};

        if (imageRefs.length >= 2) {
          metadata.first_frame_url = imageRefs[0];
          metadata.last_frame_url = imageRefs[1];
        } else if (imageRefs.length === 1) {
          metadata.img_url = imageRefs[0];
        }

        if (typeof input.generateAudio === "boolean") {
          metadata.audio = input.generateAudio;
        }

        // 万象需要额外传 size 字段
        const wanSizeMap = {
          "480p": { "16:9": "832*480", "9:16": "480*832" },
          "720p": { "16:9": "1280*720", "9:16": "720*1280" },
          "1080p": { "16:9": "1920*1080", "9:16": "1080*1920" },
        };
        const resolution = input.resolution || "720p";
        const aspectRatio = input.aspectRatio || "16:9";
        const wanSize = wanSizeMap[resolution]?.[aspectRatio];

        const body = {
          model: model.modelName,
          prompt: input.prompt,
          duration: input.duration || 5,
          size: wanSize,
          metadata,
        };

        console.log('Toonflow: sending wan video request to', baseUrl + '/video/generations');
        const response = await fetch(baseUrl + '/video/generations', {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + apiKey,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Toonflow wan video API error:', response.status, errorText);
          throw new Error("Video API request failed: " + response.status + " " + errorText);
        }

        const data = await response.json();
        const taskId = data.id;
        console.log('Toonflow: wan video task ID:', taskId);

        // 轮询查询结果
        const pollResult = await pollTask(async () => {
          const queryResponse = await fetch(baseUrl + '/video/generations/' + taskId, {
            method: "GET",
            headers: {
              Authorization: "Bearer " + apiKey,
              "Content-Type": "application/json",
            },
          });

          if (!queryResponse.ok) {
            const errorText = await queryResponse.text();
            throw new Error("Poll failed: " + queryResponse.status + " " + errorText);
          }

          const queryData = await queryResponse.json();
          const status = queryData?.status ?? queryData?.data?.status;

          switch (status) {
            case "completed":
            case "SUCCESS":
            case "success":
              return { completed: true, data: queryData.data?.result_url };
            case "FAILURE":
            case "failed":
              return { completed: true, error: queryData?.data?.fail_reason ?? "视频生成失败" };
            default:
              return { completed: false };
          }
        });

        if (pollResult.error) throw new Error(pollResult.error);
        return await urlToBase64(pollResult.data);
      }

      // 豆包/Seedance 系列
      if (lowerName.includes("doubao") || lowerName.includes("seedance")) {
        const metadata = {
          generate_audio: input.generateAudio ?? true,
          ratio: input.aspectRatio || "16:9",
          image_roles: [],
          references: [],
        };

        // 处理图片角色
        if (imageRefs.length > 0) {
          if (imageRefs.length >= 2) {
            metadata.image_roles = ["first_frame", "last_frame"];
          } else {
            metadata.image_roles = ["reference_image"];
          }
          metadata.references = imageRefs;
        }

        const body = {
          model: model.modelName,
          prompt: input.prompt,
          duration: input.duration || 5,
          metadata,
        };

        console.log('Toonflow: sending doubao video request to', baseUrl + '/video/generations');
        const response = await fetch(baseUrl + '/video/generations', {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + apiKey,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Toonflow doubao video API error:', response.status, errorText);
          throw new Error("Video API request failed: " + response.status + " " + errorText);
        }

        const data = await response.json();
        const taskId = data.id;
        console.log('Toonflow: doubao video task ID:', taskId);

        // 轮询查询结果
        const pollResult = await pollTask(async () => {
          const queryResponse = await fetch(baseUrl + '/video/generations/' + taskId, {
            method: "GET",
            headers: {
              Authorization: "Bearer " + apiKey,
              "Content-Type": "application/json",
            },
          });

          if (!queryResponse.ok) {
            const errorText = await queryResponse.text();
            throw new Error("Poll failed: " + queryResponse.status + " " + errorText);
          }

          const queryData = await queryResponse.json();
          const status = queryData?.status ?? queryData?.data?.status;

          switch (status) {
            case "completed":
            case "SUCCESS":
            case "success":
              return { completed: true, data: queryData.data?.result_url };
            case "FAILURE":
            case "failed":
              return { completed: true, error: queryData?.data?.fail_reason ?? "视频生成失败" };
            default:
              return { completed: false };
          }
        });

        if (pollResult.error) throw new Error(pollResult.error);
        return await urlToBase64(pollResult.data);
      }

      // Vidu 系列
      if (lowerName.includes("vidu")) {
        const metadata = {
          aspect_ratio: input.aspectRatio || "16:9",
          audio: input.generateAudio ?? false,
          off_peak: false,
        };

        const body = {
          model: model.modelName,
          prompt: input.prompt,
          duration: input.duration || 5,
          metadata,
        };

        if (imageRefs.length > 0) {
          body.images = imageRefs;
        }

        console.log('Toonflow: sending vidu video request to', baseUrl + '/video/generations');
        const response = await fetch(baseUrl + '/video/generations', {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + apiKey,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Toonflow vidu video API error:', response.status, errorText);
          throw new Error("Video API request failed: " + response.status + " " + errorText);
        }

        const data = await response.json();
        const taskId = data.id;
        console.log('Toonflow: vidu video task ID:', taskId);

        // 轮询查询结果
        const pollResult = await pollTask(async () => {
          const queryResponse = await fetch(baseUrl + '/video/generations/' + taskId, {
            method: "GET",
            headers: {
              Authorization: "Bearer " + apiKey,
              "Content-Type": "application/json",
            },
          });

          if (!queryResponse.ok) {
            const errorText = await queryResponse.text();
            throw new Error("Poll failed: " + queryResponse.status + " " + errorText);
          }

          const queryData = await queryResponse.json();
          const status = queryData?.status ?? queryData?.data?.status;

          switch (status) {
            case "completed":
            case "SUCCESS":
            case "success":
              return { completed: true, data: queryData.data?.result_url };
            case "FAILURE":
            case "failed":
              return { completed: true, error: queryData?.data?.fail_reason ?? "视频生成失败" };
            default:
              return { completed: false };
          }
        });

        if (pollResult.error) throw new Error(pollResult.error);
        return await urlToBase64(pollResult.data);
      }

      // 默认视频生成逻辑
      const body = {
        model: model.modelName,
        prompt: input.prompt,
        duration: input.duration || 5,
        metadata: {
          aspect_ratio: input.aspectRatio || "16:9",
        },
      };

      if (imageRefs.length > 0) {
        body.images = imageRefs;
      }

      console.log('Toonflow: sending default video request to', baseUrl + '/video/generations');
      const response = await fetch(baseUrl + '/video/generations', {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiKey,
        },
        body: JSON.stringify(body),
      });

      console.log('Toonflow: video response status:', response.status, 'ok:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Toonflow video API error:', response.status, errorText);
        throw new Error("API request failed: " + response.status + " " + errorText);
      }

      const data = await response.json();
      console.log('Toonflow video API response:', data);

      // 如果直接返回了 URL
      if (data.url || data.data?.url) {
        return await urlToBase64(data.url || data.data?.url);
      }

      // 否则轮询查询结果
      const taskId = data.id || data.task_id;
      if (!taskId) {
        throw new Error("未能获取任务ID");
      }

      console.log('Toonflow: video task ID:', taskId);

      const pollResult = await pollTask(async () => {
        const queryResponse = await fetch(baseUrl + '/video/generations/' + taskId, {
          method: "GET",
          headers: {
            Authorization: "Bearer " + apiKey,
            "Content-Type": "application/json",
          },
        });

        if (!queryResponse.ok) {
          const errorText = await queryResponse.text();
          throw new Error("Poll failed: " + queryResponse.status + " " + errorText);
        }

        const queryData = await queryResponse.json();
        const status = queryData?.status ?? queryData?.data?.status;

        switch (status) {
          case "completed":
          case "SUCCESS":
          case "success":
            return { completed: true, data: queryData.data?.result_url || queryData.result_url };
          case "FAILURE":
          case "failed":
            return { completed: true, error: queryData?.data?.fail_reason ?? "视频生成失败" };
          default:
            return { completed: false };
        }
      });

      if (pollResult.error) throw new Error(pollResult.error);
      return await urlToBase64(pollResult.data);
    };
  }

  // TTS生成
  async ttsRequest(model) {
    return async (input) => {
      const response = await fetch(this.baseUrl + '/audio/speech', {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + this.apiKey,
        },
        body: JSON.stringify({
          model: model.modelName,
          input: input.text,
          voice: input.voiceId || "default",
          speed: input.speed || 1.0,
          emotion: input.emotion || "neutral",
        }),
      });
      const data = await response.json();
      return data.url || data.audio_url || "";
    };
  }
}

module.exports = { Vendor };
