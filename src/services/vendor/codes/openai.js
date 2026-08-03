class Vendor {
  constructor(config) {
    this.config = config;
    this.apiKey = config.inputValues?.apiKey || "";
    this.baseUrl = config.inputValues?.baseUrl || "https://api.openai.com/v1";
  }

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

      if (!response.ok) {
        const error = await response.text();
        throw new Error("请求失败 (" + response.status + "): " + error);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error("API错误: " + (data.error.message || JSON.stringify(data.error)));
      }

      // 优先返回 content；o1/o3 等推理模型可能将结果放在 reasoning_content
      var msg = data.choices && data.choices[0] && data.choices[0].message;
      var content = (msg && msg.content) || "";
      var reasoning = (msg && msg.reasoning_content) || "";
      if (content) return content;
      if (reasoning) return reasoning;
      throw new Error("API 返回空结果（content 和 reasoning_content 均为空），请检查 maxTokens 或模型配置");
    };
  }
}

module.exports = { Vendor };
