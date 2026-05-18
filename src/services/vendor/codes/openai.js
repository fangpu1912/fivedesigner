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

      return data.choices?.[0]?.message?.content || "";
    };
  }
}

module.exports = { Vendor };
