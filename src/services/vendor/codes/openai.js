// OpenAI 标准供应商代码
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
      const data = await response.json();
      return data.choices?.[0]?.message?.content || "";
    };
  }
}

module.exports = { Vendor };
