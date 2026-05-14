// Vidu供应商代码
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
      
      const data = await response.json();
      return data.task_id || data.id || "";
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
      
      const data = await response.json();
      return data.url || data.data?.[0]?.url || "";
    };
  }
}

module.exports = { Vendor };
