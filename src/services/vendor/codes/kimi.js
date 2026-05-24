function Vendor(config) {
  this.config = config;
  this.apiKey = (config.inputValues && config.inputValues.apiKey) || "";
  this.baseUrl = (config.inputValues && config.inputValues.baseUrl) || "https://api.moonshot.cn/v1";
}

Vendor.prototype.textRequest = function(model) {
  return function(params) {
    var self = this;
    var messages = [];
    if (params.messages && params.messages.length > 0) {
      for (var i = 0; i < params.messages.length; i++) {
        var msg = params.messages[i];
        var content = msg.content;
        var dataUrlMatch = content.match(/data:(image|video)\/[^;\s]+;base64,[A-Za-z0-9+/=]+/);
        if (dataUrlMatch) {
          var dataUrl = dataUrlMatch[0];
          var mediaType = dataUrlMatch[1];
          var textPart = content.substring(0, dataUrlMatch.index || 0).trim();
          var contentArray = [];
          if (textPart) { contentArray.push({ type: "text", text: textPart }); }
          if (mediaType === "video") {
            contentArray.push({ type: "video_url", video_url: { url: dataUrl } });
          } else {
            contentArray.push({ type: "image_url", image_url: { url: dataUrl } });
          }
          messages.push({ role: msg.role, content: contentArray });
        } else {
          messages.push({ role: msg.role, content: content });
        }
      }
    } else if (params.prompt) {
      messages.push({ role: "user", content: params.prompt });
    }
    var requestData = {
      model: model.modelName,
      messages: messages,
      max_tokens: params.maxTokens || 4096,
      temperature: 0.6,
      thinking: { type: "disabled" }
    };
    console.log("[Kimi] Sending request, model:", model.modelName, "messages:", messages.length);
    return tauriFetch(self.baseUrl + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + self.apiKey
      },
      body: JSON.stringify(requestData)
    }).then(function(response) {
      console.log("[Kimi] Response ok:", response.ok, "status:", response.status);
      return response.json();
    }).then(function(data) {
      console.log("[Kimi] Parsed data type:", typeof data, "keys:", Object.keys(data || {}));
      if (data && data.error) {
        throw new Error("Kimi API error: " + (data.error.message || JSON.stringify(data.error)));
      }
      if (data && data.choices && data.choices.length > 0) {
        var msg = data.choices[0].message;
        var reasoning = msg.reasoning_content || "";
        var content = msg.content || "";
        console.log("[Kimi] reasoning length:", reasoning.length, "content length:", content.length);
        return content || reasoning;
      }
      throw new Error("Kimi API unexpected response: " + JSON.stringify(data));
    }).catch(function(err) {
      console.log("[Kimi] Error:", err.message);
      throw err;
    });
  }.bind(this);
};

Vendor.prototype.imageRequest = function(model) {
  return function(params) {
    throw new Error("Kimi does not support image generation");
  };
};

Vendor.prototype.videoRequest = function(model) {
  return function(params) {
    throw new Error("Kimi does not support video generation");
  };
};

module.exports = { Vendor: Vendor };
