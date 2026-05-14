// 可灵AI供应商代码
const KLINGAI_API_URL = "https://api-beijing.klingai.com";

class Vendor {
  constructor(config) {
    this.config = config;
    this.accessKey = config.inputValues?.apiKey || "";
    this.secretKey = config.inputValues?.sk || "";
  }

  generateSignature() {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const strToSign = this.accessKey + timestamp;
    const signature = strToSign;
    return { timestamp, signature };
  }

  async videoRequest(model) {
    return async (input) => {
      const { timestamp, signature } = this.generateSignature();
      
      const formData = new FormData();
      formData.append("model", model.modelName);
      formData.append("prompt", input.prompt);
      
      if (input.duration) {
        formData.append("duration", String(input.duration));
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

      const response = await fetch(KLINGAI_API_URL + '/v1/videos/generations', {
        method: "POST",
        headers: {
          "X-Access-Key": this.accessKey,
          "X-Timestamp": timestamp,
          "X-Signature": signature,
        },
        body: formData,
      });
      
      const data = await response.json();
      return data.data?.task_id || data.task_id || "";
    };
  }
}

module.exports = { Vendor };
