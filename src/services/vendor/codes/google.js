// Google Gemini 供应商代码
class Vendor {
  constructor(config) {
    this.config = config;
    this.apiKey = config.inputValues?.apiKey || "";
    this.baseUrl = config.inputValues?.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
  }

  async textRequest(model) {
    return async (params) => {
      const response = await fetch(`${this.baseUrl}/models/${model.modelName}:generateContent?key=${this.apiKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: params.messages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
          })),
          generationConfig: {
            temperature: params.temperature ?? 0.7,
            maxOutputTokens: params.maxTokens ?? 2048,
          },
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    };
  }

  async imageRequest(model) {
    return async (params) => {
      const contents = [{
        role: 'user',
        parts: [{ text: params.prompt }]
      }];

      // 如果有参考图片，添加到请求中
      if (params.imageBase64 && params.imageBase64.length > 0) {
        for (const base64 of params.imageBase64) {
          contents[0].parts.push({
            inlineData: {
              mimeType: "image/png",
              data: base64.replace(/^data:image\/\w+;base64,/, "")
            }
          });
        }
      }

      const response = await fetch(`${this.baseUrl}/models/${model.modelName}:generateContent?key=${this.apiKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents,
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"]
          },
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      // 从响应中提取图片数据
      const parts = data.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
      
      throw new Error("未生成图片");
    };
  }

  async videoRequest(model) {
    return async (params) => {
      const contents = [{
        role: 'user',
        parts: [{ text: params.prompt }]
      }];

      if (params.firstImageBase64) {
        contents[0].parts.push({
          inlineData: {
            mimeType: "image/png",
            data: params.firstImageBase64.replace(/^data:image\/\w+;base64,/, "")
          }
        });
      }

      if (params.lastImageBase64) {
        contents[0].parts.push({
          inlineData: {
            mimeType: "image/png",
            data: params.lastImageBase64.replace(/^data:image\/\w+;base64,/, "")
          }
        });
      }

      if (params.referenceImages && params.referenceImages.length > 0) {
        for (const refBase64 of params.referenceImages) {
          if (refBase64) {
            contents[0].parts.push({
              inlineData: {
                mimeType: "image/png",
                data: refBase64.replace(/^data:image\/\w+;base64,/, "")
              }
            });
          }
        }
      }

      const generationConfig = {
        responseModalities: ["TEXT", "VIDEO"]
      };

      if (params.duration) {
        generationConfig.videoGenerationConfig = {
          durationSeconds: params.duration
        };
      }
      if (params.aspectRatio) {
        if (!generationConfig.videoGenerationConfig) {
          generationConfig.videoGenerationConfig = {};
        }
        generationConfig.videoGenerationConfig.aspectRatio = params.aspectRatio;
      }
      if (params.generateAudio !== undefined) {
        if (!generationConfig.videoGenerationConfig) {
          generationConfig.videoGenerationConfig = {};
        }
        generationConfig.videoGenerationConfig.generateAudio = params.generateAudio;
      }

      const response = await fetch(`${this.baseUrl}/models/${model.modelName}:generateContent?key=${this.apiKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents,
          generationConfig,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();

      const parts = data.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData && part.inlineData.mimeType?.startsWith('video/')) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }

      throw new Error("未生成视频");
    };
  }
}

module.exports = { Vendor };
