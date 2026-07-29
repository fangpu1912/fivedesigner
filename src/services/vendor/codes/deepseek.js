// DeepSeek 供应商代码
// API文档: https://api-docs.deepseek.com/
class Vendor {
  constructor(config) {
    this.config = config;
    this.apiKey = config.inputValues?.apiKey || "";
    this.baseUrl = (config.inputValues?.baseUrl || "https://api.deepseek.com").replace(/\/+$/,'');
  }

  async textRequest(model) {
    return async (params) => {
      const body = {
        model: model.modelName || "deepseek-v4-flash",
        messages: params.messages,
        temperature: params.temperature ?? 1.0,
        max_tokens: params.maxTokens ?? 4096,
        top_p: params.topP ?? 1.0,
        stream: false,
      };
      // V4 思考模式：设置 thinking 参数
      if (model.think) {
        body.thinking = { type: "enabled" };
      }
      const response = await fetch(this.baseUrl + '/chat/completions', {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + this.apiKey,
        },
        body: JSON.stringify(body),
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
