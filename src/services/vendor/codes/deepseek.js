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

      // 优先返回 content；思考模式下若 content 为空则回退到 reasoning_content
      var choice = data.choices && data.choices[0];
      var msg = choice && choice.message;
      var content = (msg && msg.content) || "";
      var reasoning = (msg && msg.reasoning_content) || "";
      var finishReason = choice && choice.finish_reason;

      // finish_reason=length 表示输出被截断（maxTokens 不够，思考过程耗尽额度）
      if (finishReason === "length") {
        console.warn("[DeepSeek] 输出被截断 finish_reason=length, content长度=" + content.length + ", reasoning长度=" + reasoning.length + ", 请增大 maxTokens");
      }

      if (content) return content;
      if (reasoning) {
        console.warn("[DeepSeek] content 为空，回退到 reasoning_content");
        return reasoning;
      }
      throw new Error("DeepSeek 返回空结果（content 和 reasoning_content 均为空）, finish_reason=" + (finishReason || "unknown") + ", 请检查 maxTokens 是否过小或模型是否支持");
    };
  }
}

module.exports = { Vendor };
