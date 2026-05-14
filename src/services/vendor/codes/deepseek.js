// DeepSeek 供应商代码
// API文档: https://platform.deepseek.com/api-docs/
class Vendor {
  constructor(config) {
    this.config = config;
    this.apiKey = config.inputValues?.apiKey || "";
    this.baseUrl = config.inputValues?.baseUrl || "https://api.deepseek.com/v1";
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
          model: model.modelName || "deepseek-chat",
          messages: params.messages,
          temperature: params.temperature ?? 1.0,
          max_tokens: params.maxTokens ?? 4096,
          top_p: params.topP ?? 1.0,
          stream: false,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`DeepSeek API 错误: ${response.status} - ${error}`);
      }

      const data = await response.json();

      // 检查 DeepSeek 错误响应
      if (data.error) {
        throw new Error(`DeepSeek 错误: ${data.error.message || data.error.type}`);
      }

      return data.choices?.[0]?.message?.content || "";
    };
  }
}

module.exports = { Vendor };
