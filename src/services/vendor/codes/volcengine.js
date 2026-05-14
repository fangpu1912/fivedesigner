// 火山引擎供应商代码
class Vendor {
  constructor(config) {
    this.config = config;
    this.apiKey = config.inputValues?.apiKey || "";
    this.textUrl = config.inputValues?.text || "https://ark.cn-beijing.volces.com/api/v3";
    this.imageUrl = config.inputValues?.image || "https://ark.cn-beijing.volces.com/api/v3/images/generations";
    this.videoCreateUrl = config.inputValues?.videoCreate || "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks";
    this.videoQueryUrl = config.inputValues?.videoQuery || "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{id}";
  }

  async textRequest(model) {
    return async (params) => {
      const response = await fetch(this.textUrl + '/chat/completions', {
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

      if (input.maskBase64) {
        const compressed = await zipImage(input.maskBase64, 5 * 1024 * 1024);
        const blob = new Blob([Buffer.from(compressed, "base64")], { type: "image/png" });
        formData.append("mask", blob, "mask.png");
      }

      const response = await fetch(this.imageUrl, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + this.apiKey,
        },
        body: formData,
      });
      const data = await response.json();
      return data.url || data.data?.[0]?.url || "";
    };
  }

  async videoRequest(model) {
    return async (input) => {
      console.log('[Volcengine] videoRequest called with model:', model.modelName);
      console.log('[Volcengine] input prompt:', input.prompt?.slice(0, 50));
      console.log('[Volcengine] has first image:', !!input.firstImageBase64);
      console.log('[Volcengine] has last image:', !!input.lastImageBase64);
      console.log('[Volcengine] reference images count:', input.referenceImages?.length || 0);

      const hasImages = !!(input.firstImageBase64 || input.lastImageBase64 || (input.referenceImages && input.referenceImages.length > 0));
      const modelName = model.modelName || '';
      const isDoubaoVideo = modelName.includes('seedance') || modelName.includes('doubao');

      if (!this.apiKey) {
        throw new Error('Volcano API key not configured');
      }

      let createRes;

      if (hasImages && isDoubaoVideo) {
        console.log('[Volcengine] Using multipart/form-data for Doubao video with images');
        const formData = new FormData();
        formData.append('model', modelName);
        formData.append('prompt', input.prompt);

        if (input.duration) {
          formData.append('duration', String(input.duration));
        }
        if (input.resolution) {
          formData.append('resolution', input.resolution);
        }
        if (input.aspectRatio) {
          formData.append('aspect_ratio', input.aspectRatio);
        }
        if (input.generateAudio !== undefined) {
          formData.append('generate_audio', String(input.generateAudio));
        }

        if (input.firstImageBase64) {
          let base64 = input.firstImageBase64;
          if (base64.includes(',')) {
            base64 = base64.split(',')[1];
          }
          const blob = new Blob([Buffer.from(base64, 'base64')], { type: 'image/jpeg' });
          formData.append('first_frame', blob, 'first_frame.jpg');
        }

        if (input.lastImageBase64) {
          let base64 = input.lastImageBase64;
          if (base64.includes(',')) {
            base64 = base64.split(',')[1];
          }
          const blob = new Blob([Buffer.from(base64, 'base64')], { type: 'image/jpeg' });
          formData.append('last_frame', blob, 'last_frame.jpg');
        }

        if (input.referenceImages && input.referenceImages.length > 0) {
          for (let i = 0; i < input.referenceImages.length; i++) {
            let base64 = input.referenceImages[i];
            if (base64.includes(',')) {
              base64 = base64.split(',')[1];
            }
            const blob = new Blob([Buffer.from(base64, 'base64')], { type: 'image/jpeg' });
            formData.append('reference_images', blob, 'reference_' + i + '.jpg');
          }
        }

        createRes = await fetch(this.videoCreateUrl, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + this.apiKey,
          },
          body: formData,
        });
      } else {
        console.log('[Volcengine] Using JSON for video request');
        const requestBody = {
          model: modelName,
          content: [
            {
              type: "text",
              text: input.prompt
            }
          ]
        };

        if (input.duration) {
          requestBody.duration = input.duration;
        }
        if (input.resolution) {
          requestBody.resolution = input.resolution;
        }
        if (input.aspectRatio) {
          requestBody.aspect_ratio = input.aspectRatio;
        }
        if (input.generateAudio !== undefined) {
          requestBody.generate_audio = input.generateAudio;
        }

        if (input.firstImageBase64) {
          let base64 = input.firstImageBase64;
          if (base64.includes(',')) {
            base64 = base64.split(',')[1];
          }
          requestBody.first_frame = base64;
        }

        if (input.lastImageBase64) {
          let base64 = input.lastImageBase64;
          if (base64.includes(',')) {
            base64 = base64.split(',')[1];
          }
          requestBody.last_frame = base64;
        }

        if (input.referenceImages && input.referenceImages.length > 0) {
          requestBody.reference_images = [];
          for (let i = 0; i < input.referenceImages.length; i++) {
            let base64 = input.referenceImages[i];
            if (base64.includes(',')) {
              base64 = base64.split(',')[1];
            }
            requestBody.reference_images.push(base64);
          }
        }

        createRes = await fetch(this.videoCreateUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + this.apiKey,
          },
          body: JSON.stringify(requestBody),
        });
      }

      console.log('[Volcengine] Response status:', createRes.status);

      if (!createRes.ok) {
        const errorText = await createRes.text();
        console.error('[Volcengine] Error response:', errorText);
        throw new Error("Create task failed (" + createRes.status + "): " + errorText);
      }

      const createData = await createRes.json();
      console.log('[Volcengine] Create response:', createData);

      let taskId = createData.id || createData.task_id || createData.data?.id;
      if (!taskId) {
        throw new Error("Create task success but no taskId returned: " + JSON.stringify(createData));
      }

      if (taskId.includes("/")) {
        const parts = taskId.split("/");
        taskId = parts[parts.length - 1];
      }

      console.log('[Volcengine] Got taskId:', taskId);

      let attempts = 0;
      const maxAttempts = 60;
      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const queryUrl = this.videoQueryUrl.replace("{id}", taskId);
        console.log('[Volcengine] Querying task:', queryUrl);

        const queryRes = await fetch(queryUrl, {
          headers: { Authorization: "Bearer " + this.apiKey },
        });
        const queryData = await queryRes.json();
        console.log('[Volcengine] Query response:', queryData);

        if (queryData.status === "succeeded" || queryData.status === "Success") {
          const videoUrl = queryData.content?.video_url || queryData.url || queryData.video_url || queryData.data?.url;
          console.log('[Volcengine] Video URL found:', videoUrl);
          if (!videoUrl) {
            console.error('[Volcengine] No video URL in response:', queryData);
            throw new Error("No video URL in response");
          }
          return videoUrl;
        } else if (queryData.status === "failed" || queryData.status === "Failed") {
          throw new Error(queryData.error?.message || queryData.message || "Video generation failed");
        }
        attempts++;
      }
      throw new Error("Video generation timeout");
    };
  }
}

module.exports = { Vendor };
