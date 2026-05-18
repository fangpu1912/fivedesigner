class Vendor {
  constructor(config) {
    this.config = config;
    this.apiKey = config.inputValues?.apiKey || "";
    this.baseUrl = config.inputValues?.baseUrl || "https://api.vidu.cn/ent/v2";
  }

  async videoRequest(model) {
    return async (input) => {
      const formData = new FormData();
      formData.append("model", model.modelName);
      formData.append("prompt", input.prompt);

      if (input.duration) {
        formData.append("duration", String(input.duration));
      }
      if (input.resolution) {
        formData.append("resolution", input.resolution);
      }

      if (input.firstImageBase64) {
        const compressed = await zipImage(input.firstImageBase64, 5 * 1024 * 1024);
        const blob = new Blob([Buffer.from(compressed, "base64")], { type: "image/jpeg" });
        formData.append("first_frame", blob, "first_frame.jpg");
      }

      if (input.lastImageBase64) {
        const compressed = await zipImage(input.lastImageBase64, 5 * 1024 * 1024);
        const blob = new Blob([Buffer.from(compressed, "base64")], { type: "image/jpeg" });
        formData.append("last_frame", blob, "last_frame.jpg");
      }

      if (input.referenceImages && input.referenceImages.length > 0) {
        for (let i = 0; i < input.referenceImages.length; i++) {
          const base64 = input.referenceImages[i];
          if (base64) {
            const compressed = await zipImage(base64, 5 * 1024 * 1024);
            const blob = new Blob([Buffer.from(compressed, "base64")], { type: "image/jpeg" });
            formData.append("reference_images", blob, "reference_" + i + ".jpg");
          }
        }
      }

      const response = await fetch(this.baseUrl + '/videos/generations', {
        method: "POST",
        headers: {
          Authorization: "Bearer " + this.apiKey,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error("视频生成任务提交失败: " + error);
      }

      const data = await response.json();
      const taskId = data.task_id || data.id || data.data?.task_id;

      if (!taskId) {
        throw new Error("视频生成任务提交失败: 未返回任务ID");
      }

      const result = await pollTask(async () => {
        const queryRes = await fetch(this.baseUrl + '/tasks/' + taskId + '/creations', {
          headers: { Authorization: "Bearer " + this.apiKey },
        });

        if (!queryRes.ok) return { completed: false };

        const queryData = await queryRes.json();
        const state = queryData.state || queryData.status;

        if (state === "success" || state === "succeed" || state === "completed") {
          const creations = queryData.creations;
          if (creations && creations.length > 0) {
            return { completed: true, data: creations[0].url };
          }
          const videoUrl = queryData.video_url || queryData.url || queryData.data?.url;
          if (videoUrl) {
            return { completed: true, data: videoUrl };
          }
          return { completed: true, error: "视频生成成功但未返回视频URL" };
        } else if (state === "failed" || state === "error") {
          return { completed: true, error: "视频生成失败: " + (queryData.err_code || queryData.error || "未知错误") };
        }
        return { completed: false };
      }, { interval: 5000, maxAttempts: 120 });

      if (result.error) throw new Error(result.error);
      return result.data;
    };
  }

  async imageRequest(model) {
    return async (input) => {
      const formData = new FormData();
      formData.append("model", model.modelName);
      formData.append("prompt", input.prompt);

      if (input.imageBase64 && input.imageBase64.length > 0) {
        for (let i = 0; i < input.imageBase64.length; i++) {
          const base64 = input.imageBase64[i];
          if (base64) {
            const compressed = await zipImage(base64, 5 * 1024 * 1024);
            const blob = new Blob([Buffer.from(compressed, "base64")], { type: "image/jpeg" });
            formData.append("images", blob, "image_" + i + ".jpg");
          }
        }
      }

      const response = await fetch(this.baseUrl + '/images/generations', {
        method: "POST",
        headers: {
          Authorization: "Bearer " + this.apiKey,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error("图片生成任务提交失败: " + error);
      }

      const data = await response.json();
      const taskId = data.task_id || data.id || data.data?.task_id;

      if (!taskId) {
        return data.url || data.data?.[0]?.url || "";
      }

      const result = await pollTask(async () => {
        const queryRes = await fetch(this.baseUrl + '/tasks/' + taskId + '/creations', {
          headers: { Authorization: "Bearer " + this.apiKey },
        });

        if (!queryRes.ok) return { completed: false };

        const queryData = await queryRes.json();
        const state = queryData.state || queryData.status;

        if (state === "success" || state === "succeed" || state === "completed") {
          const creations = queryData.creations;
          if (creations && creations.length > 0) {
            return { completed: true, data: creations[0].url };
          }
          return { completed: true, data: queryData.url || data.data?.url || "" };
        } else if (state === "failed" || state === "error") {
          return { completed: true, error: "图片生成失败: " + (queryData.err_code || queryData.error || "未知错误") };
        }
        return { completed: false };
      }, { interval: 3000, maxAttempts: 120 });

      if (result.error) throw new Error(result.error);
      return result.data;
    };
  }
}

module.exports = { Vendor };
