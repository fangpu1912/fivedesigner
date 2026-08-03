// GeekAI 聚合平台供应商代码
// 官网: https://www.geeknow.top/
// 支持多个AI供应商的统一接口
// 参照 Python 插件 nano_banana_plugin_geeknow 和 video_plugin_geeknow 实现

class Vendor {
  constructor(config) {
    this.config = config;
    this.apiKey = config.inputValues?.apiKey || "";
    this.baseUrl = config.inputValues?.baseUrl || "https://api.geeknow.ai";
  }

  // 去除尾部斜杠
  _normalizeBaseUrl(url) {
    if (!url) return '';
    return String(url).replace(/\/+$/, '');
  }

  // 获取纯域名基础地址（去掉 /v1 或 /v1beta 后缀）
  _getBaseDomain() {
    let url = this._normalizeBaseUrl(this.baseUrl);
    url = url.replace(/\/v1beta$/i, '').replace(/\/v1$/i, '');
    return url;
  }

  // ============ 文本生成 ============

  async textRequest(model) {
    return async (params) => {
      const baseDomain = this._getBaseDomain();
      const response = await fetch(baseDomain + '/v1/chat/completions', {
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
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || "请求失败: " + response.status);
      }

      const data = await response.json();
      var msg = data.choices && data.choices[0] && data.choices[0].message;
      var content = (msg && msg.content) || "";
      var reasoning = (msg && msg.reasoning_content) || "";
      if (content) return content;
      if (reasoning) return reasoning;
      throw new Error("GeekAI 返回空结果（content 和 reasoning_content 均为空），请检查 maxTokens 或模型配置");
    };
  }

  // ============ 图片生成 ============

  // Doubao Seedream 尺寸映射
  _getDoubaoSizeMap() {
    return {
      '1:1': '2048x2048',
      '4:3': '2304x1728',
      '3:4': '1728x2304',
      '16:9': '2560x1440',
      '9:16': '1440x2560',
      '3:2': '2496x1664',
      '2:3': '1664x2496',
      '21:9': '3024x1296',
    };
  }

  // Grok Image 尺寸映射
  _getGrokSizeMap() {
    return {
      '1:1': '2048x2048',
      '4:3': '2304x1728',
      '3:4': '1728x2304',
      '16:9': '2560x1440',
      '9:16': '1440x2560',
      '3:2': '2496x1664',
      '2:3': '1664x2496',
      '21:9': '3024x1296',
    };
  }

  // gpt-image-2 / gpt-image-2-pro 尺寸映射
  _getGptImage2SizeMap() {
    return {
      '1:1': '1024x1024',
      '4:3': '1536x1152',
      '2:3': '1024x1536',
      '3:2': '1536x1024',
      '16:9': '1920x1080',
      '9:16': '1080x1920',
      '1:1(2K)': '2048x2048',
      '4:3(2K)': '2048x1536',
      '3:2(2K)': '2560x1712',
      '2:3(2K)': '1712x2560',
      '16:9(2K)': '2048x1152',
      '9:16(2K)': '1152x2048',
      '1:1(4K)': '2880x2880',
      '4:3(4K)': '3840x2880',
      '3:2(4K)': '3840x2560',
      '2:3(4K)': '2560x3840',
      '16:9(4K)': '3840x2160',
      '9:16(4K)': '2160x3840',
    };
  }

  // gpt-image-2-vip 尺寸映射（分 1K/2K/4K 三档）
  _getGptImage2VipSizeMap() {
    return {
      '1K': {
        '1:1': '1024x1024',
        '4:3': '1024x768',
        '3:4': '768x1024',
        '3:2': '1008x672',
        '2:3': '672x1008',
        '16:9': '1280x720',
        '9:16': '720x1280',
        '21:9': '1344x576',
      },
      '2K': {
        '1:1': '2048x2048',
        '4:3': '2304x1728',
        '3:4': '1728x2304',
        '3:2': '2496x1664',
        '2:3': '1664x2496',
        '16:9': '2560x1440',
        '9:16': '1440x2560',
        '21:9': '3024x1296',
      },
      '4K': {
        '1:1': '2880x2880',
        '4:3': '3264x2448',
        '3:4': '2448x3264',
        '3:2': '3504x2336',
        '2:3': '2336x3504',
        '16:9': '3840x2160',
        '9:16': '2160x3840',
        '21:9': '3808x1632',
      },
    };
  }

  // 解析 gpt-image-2-vip 的比例 key，返回 {ratio, tier}
  _parseGptImage2VipRatioKey(aspectRatio) {
    const match = String(aspectRatio || '').match(/^(.*?)\((1K|2K|4K)\)$/);
    if (match) {
      return { ratio: match[1], tier: match[2] };
    }
    return { ratio: String(aspectRatio || '').trim(), tier: '1K' };
  }

  // 获取 gpt-image-2-vip 尺寸
  _getGptImage2VipSize(aspectRatio) {
    const { ratio, tier } = this._parseGptImage2VipRatioKey(aspectRatio);
    const tierMap = this._getGptImage2VipSizeMap()[tier] || this._getGptImage2VipSizeMap()['1K'];
    return tierMap[ratio] || this._getGptImage2VipSizeMap()['1K']['1:1'];
  }

  // 收集参考图：返回 { base64List, urlList }
  _collectReferenceImages(params) {
    const base64List = [];
    const urlList = [];

    if (params.imageBase64 && params.imageBase64.length > 0) {
      for (const item of params.imageBase64) {
        if (!item) continue;
        if (typeof item !== 'string') continue;
        if (item.startsWith('http://') || item.startsWith('https://')) {
          urlList.push(item);
        } else {
          const pure = item.startsWith('data:') ? item.split(',')[1] : item;
          base64List.push(pure);
        }
      }
    }

    if (params.imageUrls && params.imageUrls.length > 0) {
      for (const url of params.imageUrls) {
        if (url) urlList.push(url);
      }
    }

    return { base64List, urlList };
  }

  // 从响应中提取图片结果
  _extractImageResult(data) {
    const dataList = data && data.data;
    if (!Array.isArray(dataList)) return null;

    for (const item of dataList) {
      if (!item || typeof item !== 'object') continue;
      if (item.b64_json) {
        return item.b64_json.startsWith('data:') ? item.b64_json : 'data:image/png;base64,' + item.b64_json;
      }
      if (item.url) {
        return item.url;
      }
    }
    return null;
  }

  async imageRequest(model) {
    return async (params) => {
      const modelName = model.modelName || '';

      // Grok 图片（OpenAI 兼容格式）
      if (modelName.startsWith('grok-') && !modelName.startsWith('grok-video')) {
        return await this._sendGrokImageRequest(model, params);
      }
      // Doubao Seedream 图片（OpenAI 兼容格式）
      if (modelName.startsWith('doubao-')) {
        return await this._sendDoubaoImageRequest(model, params);
      }
      // GPT Image 系列
      if (modelName.startsWith('gpt-image-')) {
        return await this._sendGptImageRequest(model, params);
      }
      // Gemini 系列（原生格式）
      return await this._sendGeminiImageRequest(model, params);
    };
  }

  // Grok 图片请求：POST /v1/images/generations (JSON)
  async _sendGrokImageRequest(model, params) {
    const modelName = model.modelName;
    const sizeMap = this._getGrokSizeMap();
    const aspectRatio = params.aspectRatio || '16:9';
    const size = sizeMap[aspectRatio] || '2560x1440';
    const { base64List, urlList } = this._collectReferenceImages(params);

    const payload = {
      model: modelName,
      prompt: params.prompt,
      n: 1,
      size: size,
    };

    const imageList = [];
    for (const b64 of base64List) imageList.push(b64);
    for (const url of urlList) imageList.push(url);
    if (imageList.length > 0) payload.image = imageList;

    const baseDomain = this._getBaseDomain();
    const response = await fetch(baseDomain + '/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + this.apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || "请求失败: " + response.status);
    }

    const data = await response.json();
    const result = this._extractImageResult(data);
    if (!result) throw new Error('API 响应中未包含图片数据');
    return result;
  }

  // Doubao Seedream 图片请求：POST /v1/images/generations (JSON)
  async _sendDoubaoImageRequest(model, params) {
    const modelName = model.modelName;
    const sizeMap = this._getDoubaoSizeMap();
    const aspectRatio = params.aspectRatio || '16:9';
    const size = sizeMap[aspectRatio] || '2560x1440';
    const { base64List, urlList } = this._collectReferenceImages(params);

    const payload = {
      model: modelName,
      prompt: params.prompt,
      n: 1,
      size: size,
    };

    const imageList = [];
    for (const b64 of base64List) imageList.push(b64);
    for (const url of urlList) imageList.push(url);
    if (imageList.length > 0) payload.image = imageList;

    const baseDomain = this._getBaseDomain();
    const response = await fetch(baseDomain + '/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + this.apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || "请求失败: " + response.status);
    }

    const data = await response.json();
    const result = this._extractImageResult(data);
    if (!result) throw new Error('API 响应中未包含图片数据');
    return result;
  }

  // GPT Image 请求：POST /v1/images/generations 或 /v1/images/edits
  async _sendGptImageRequest(model, params) {
    const modelName = model.modelName;
    const aspectRatio = params.aspectRatio || '16:9';
    const { base64List, urlList } = this._collectReferenceImages(params);
    const hasReference = base64List.length > 0 || urlList.length > 0;
    const isVipEdit = modelName === 'gpt-image-2-vip' && hasReference;

    // quality 参数：vip 模型使用传入值，其他模型固定 high
    let quality = params.quality || 'low';
    if (['low', 'medium', 'high', 'auto'].indexOf(quality) === -1) {
      quality = 'low';
    }

    // 获取尺寸
    let apiSize;
    if (modelName === 'gpt-image-2-vip') {
      apiSize = this._getGptImage2VipSize(aspectRatio);
    } else {
      const sizeMap = this._getGptImage2SizeMap();
      apiSize = sizeMap[aspectRatio] || '1024x1024';
    }

    const baseDomain = this._getBaseDomain();

    if (isVipEdit) {
      // gpt-image-2-vip 图生图：multipart/form-data 提交
      const formData = new FormData();
      formData.append('model', modelName);
      formData.append('prompt', params.prompt);
      formData.append('n', '1');
      formData.append('size', apiSize);
      formData.append('quality', quality);

      // 添加参考图文件
      let addedCount = 0;
      for (const b64 of base64List) {
        const blob = this._base64ToBlob(b64);
        formData.append('image', blob, 'reference_' + addedCount + '.png');
        addedCount++;
      }
      for (const url of urlList) {
        // 远程 URL 无法直接作为文件上传，跳过
        console.warn('[GeekAI] GPT Image VIP 编辑模式暂不支持远程 URL 参考图，已跳过:', url);
      }
      if (addedCount === 0) {
        throw new Error('GPT Image 编辑请求缺少有效参考图片');
      }

      const response = await fetch(baseDomain + '/v1/images/edits', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + this.apiKey,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error("请求失败 " + response.status + ": " + errorText);
      }

      const data = await response.json();
      const result = this._extractImageResult(data);
      if (!result) throw new Error('API 响应中未包含图片数据');
      return result;
    }

    // 其他情况：JSON 提交 /v1/images/generations
    const payload = {
      model: modelName,
      prompt: params.prompt,
      n: 1,
      size: apiSize,
    };

    // quality: vip 模型使用传入值，其他模型固定 high
    payload.quality = modelName === 'gpt-image-2-vip' ? quality : 'high';
    // vip 模型不传 response_format，其他模型传 url
    if (modelName !== 'gpt-image-2-vip') {
      payload.response_format = 'url';
    }

    // 参考图
    const imageList = [];
    for (const b64 of base64List) imageList.push(b64);
    for (const url of urlList) imageList.push(url);
    if (imageList.length > 0) payload.image = imageList;

    const response = await fetch(baseDomain + '/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + this.apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || "请求失败: " + response.status);
    }

    const data = await response.json();
    const result = this._extractImageResult(data);
    if (!result) throw new Error('API 响应中未包含图片数据');
    return result;
  }

  // Gemini 图片请求：POST /v1beta/models/{model}:generateContent
  async _sendGeminiImageRequest(model, params) {
    const modelName = model.modelName;
    const aspectRatio = params.aspectRatio || '16:9';
    const { base64List } = this._collectReferenceImages(params);

    // 构建 parts
    const parts = [{ text: params.prompt }];

    // 添加参考图
    for (const b64 of base64List) {
      const mimeType = 'image/png';
      parts.push({
        inlineData: {
          mimeType: mimeType,
          data: b64,
        },
      });
    }

    // 只有 gemini-3-pro-image-preview 支持 2K，其他模型固定 1K
    const imageSize = modelName === 'gemini-3-pro-image-preview' ? (params.size || '1K') : '1K';

    const payload = {
      contents: [{ role: 'user', parts: parts }],
      generationConfig: {
        responseModalities: ['IMAGE', 'TEXT'],
        temperature: 1.0,
        topP: 0.95,
        maxOutputTokens: 8192,
        imageConfig: {
          aspectRatio: aspectRatio,
          imageSize: imageSize,
        },
      },
    };

    const baseDomain = this._getBaseDomain();
    const url = baseDomain + '/v1beta/models/' + modelName + ':generateContent';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + this.apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error("请求失败 " + response.status + ": " + errorText);
    }

    const data = await response.json();

    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('API 未返回有效候选结果');
    }

    const candidate = data.candidates[0];
    if (!candidate.content || !candidate.content.parts) {
      throw new Error('响应格式错误');
    }

    // 提取图片数据
    for (const part of candidate.content.parts) {
      if (part.inlineData && part.inlineData.data) {
        const imageData = part.inlineData.data;
        // 判断是 URL 还是 base64
        if (typeof imageData === 'string' && (imageData.startsWith('http://') || imageData.startsWith('https://'))) {
          return imageData;
        }
        return 'data:' + (part.inlineData.mimeType || 'image/png') + ';base64,' + imageData;
      }
      if (part.text) {
        const text = part.text;
        // 尝试提取 data URI
        const dataUriMatch = text.match(/data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/);
        if (dataUriMatch) {
          return dataUriMatch[0];
        }
        // 尝试提取 markdown 图片 URL
        const markdownMatch = text.match(/!\[.*?\]\((https?:\/\/[^\s\)]+)\)/);
        if (markdownMatch) {
          return markdownMatch[1];
        }
        // 尝试提取普通 URL
        const urlMatch = text.match(/https?:\/\/[^\s"'<>)]+/i);
        if (urlMatch) {
          return urlMatch[0];
        }
      }
    }

    throw new Error('API 响应中未包含图片数据');
  }

  // ============ 视频生成 ============

  // 判断是否使用 JSON 格式提交
  _isJsonSubmissionModel(modelName) {
    if (!modelName) return false;
    const m = modelName.toLowerCase();
    return (
      m.startsWith('sora')
      || m.startsWith('veo')
      || m.startsWith('wan2.6')
      || m.startsWith('omni-fast')
      || m.startsWith('vidu')
      || m.startsWith('kling')
      || m.startsWith('hailuo')
      || m.startsWith('hunyuan')
      || m.startsWith('mingmou')
      || m.startsWith('os-')
      || m.startsWith('gv-')
      || m.startsWith('sv-')
      || m.startsWith('jv-')
      || m.indexOf('pixverse') !== -1
      || m.indexOf('seedance-2.0') !== -1
      || m.indexOf('seedance2') !== -1
      || m.indexOf('manxue') !== -1
      || m.indexOf('video-ultra') !== -1
      || m.indexOf('grok-imagine') !== -1
    );
  }

  // 判断是否是 Grok 视频模型
  _isGrokVideoModel(modelName) {
    return modelName && modelName.startsWith('grok-video');
  }

  // 判断是否是 Doubao 视频模型（非 seedance 2.0）
  _isDoubaoVideoModel(modelName) {
    if (!modelName) return false;
    return modelName.startsWith('doubao') && modelName.indexOf('seedance-2.0') === -1;
  }

  // 判断是否是 wan2.6-i2v 模型
  _isWanI2vModel(modelName) {
    if (!modelName) return false;
    return modelName.startsWith('wan2.6-i2v');
  }

  // 标准化分辨率参数（小写转大写）
  _normalizeResolution(resolution) {
    if (!resolution) return '720P';
    const r = String(resolution).toLowerCase();
    if (r.indexOf('1080') !== -1) return '1080P';
    if (r.indexOf('720') !== -1) return '720P';
    if (r.indexOf('480') !== -1) return '480P';
    if (r.indexOf('540') !== -1) return '540P';
    if (r.indexOf('4k') !== -1) return '4K';
    return '720P';
  }

  // Seedance 2.0 分辨率（小写格式）
  _normalizeSeedance2Resolution(value) {
    const text = String(value || '').toLowerCase();
    if (text.indexOf('480') !== -1) return '480p';
    return '720p';
  }

  // Grok Imagine 分辨率（仅 480P/720P）
  _normalizeGrokImagineResolution(sizeValue) {
    const text = String(sizeValue || '').toUpperCase();
    if (text === '480' || text === '480P') return '480P';
    return '720P';
  }

  // video-ultra-720p 根据宽高比计算 size
  _videoUltra720pSizeFromAspectRatio(aspectRatio) {
    var map = {
      '16:9': '1280x720',
      '9:16': '720x1280',
      '1:1': '720x720',
      '4:3': '960x720',
      '3:4': '720x960',
      '21:9': '1680x720'
    };
    return map[aspectRatio] || '1280x720';
  }

  // 根据模型名和宽高比计算视频 size 参数（对齐 Python _prepare_generation_params 逻辑）
  // 返回 { model: 修正后的模型名, size: size 值 }
  _computeVideoSizeAndModel(modelName, aspectRatio, paramsResolution) {
    var model = modelName;
    var size = '';
    var ratio = aspectRatio || '16:9';

    // wan2.6-i2v:1920*1080 → size = "1920*1080"，model 变为 "wan2.6-i2v"
    if (model.indexOf('wan2.6-') === 0 && model.indexOf(':') !== -1) {
      var parts = model.split(':');
      model = parts[0];
      size = parts[1];
    }
    // video-ultra-720p → 根据宽高比计算 size
    else if (model.indexOf('video-ultra') !== -1) {
      model = 'video-ultra-720p';
      size = this._videoUltra720pSizeFromAspectRatio(ratio);
    }
    // grok-imagine 系列 → 480P/720P (大写)
    else if (model.indexOf('grok-imagine') !== -1) {
      size = this._normalizeGrokImagineResolution(paramsResolution);
    }
    // grok-video 系列 → 480P/720P/1080P (大写)
    else if (model.indexOf('grok') === 0) {
      size = this._normalizeResolution(paramsResolution) || '1080P';
    }
    // seedance-2.0 系列 → 480p/720p (小写)
    else if (model.indexOf('seedance-2.0') !== -1) {
      size = this._normalizeSeedance2Resolution(paramsResolution);
    }
    // manxue-2.0 / seedance2 → 固定 720p (小写)
    else if (model.indexOf('manxue') !== -1 || model === 'seedance2' || model === 'seedance-2') {
      size = '720p';
    }
    // pixverse → 1280x720/720x1280
    else if (model.toLowerCase().indexOf('pixverse') !== -1) {
      size = ratio === '9:16' ? '720x1280' : '1280x720';
    }
    // doubao → size = aspect_ratio (如 "16:9")
    else if (model.indexOf('doubao') === 0) {
      size = ratio;
    }
    // 默认 (sora, veo, kling, hailuo, vidu 等) → 1280x720/720x1280
    else {
      size = ratio === '9:16' ? '720x1280' : '1280x720';
    }

    return { model: model, size: size };
  }

  // 判断模型是否在 metadata.output_config 中使用 resolution 字段（而不是顶层 size）
  _usesMetadataResolutionOnly(modelName) {
    var m = modelName.toLowerCase();
    return m.indexOf('hailuo') === 0 || m.indexOf('kling') === 0 || m.indexOf('vidu') === 0;
  }

  // 从分辨率推断 aspect_ratio（用于 sora-pro 等固定参数模型）
  _inferAspectRatioFromModelName(modelName) {
    if (!modelName) return '16:9';
    if (modelName.indexOf('portrait') !== -1) return '9:16';
    if (modelName.indexOf('landscape') !== -1) return '16:9';
    return '16:9';
  }

  // 获取模型固定时长（从模型名推断）
  _getFixedDuration(modelName) {
    if (!modelName) return null;
    if (modelName.indexOf('25s') !== -1) return 25;
    if (modelName.indexOf('15s') !== -1) return 15;
    if (modelName.indexOf('10s') !== -1) return 10;
    // grok-video-*-pro 固定 10s
    if (modelName.indexOf('-pro') !== -1 && modelName.indexOf('grok-video') !== -1) return 10;
    // grok-video-*-max 固定 15s
    if (modelName.indexOf('-max') !== -1 && modelName.indexOf('grok-video') !== -1) return 15;
    // manxue-2.0 / seedance2 固定 15s
    if (modelName === 'manxue-2.0' || modelName === 'seedance2') return 15;
    // seedance-2.0-* 固定 5s
    if (modelName.indexOf('seedance-2.0') !== -1) return 5;
    // dance2-fast-15s 固定 15s
    if (modelName.indexOf('dance2-fast') !== -1) return 15;
    return null;
  }

  // Grok 基础模型根据时长切换为实际请求模型（对齐 Python _resolve_grok_model_for_duration）
  // grok-video-1.5 + 10s → grok-video-1.5-pro
  // grok-video-1.5 + 15s → grok-video-1.5-max
  // grok-video-3 + 10s → grok-video-3-pro
  // grok-video-3 + 15s → grok-video-3-max
  _resolveGrokModelForDuration(modelName, duration) {
    if (!modelName || modelName.indexOf('grok') !== 0) return modelName;
    var map = {
      'grok-video-1.5': { 10: 'grok-video-1.5-pro', 15: 'grok-video-1.5-max' },
      'grok-video-3': { 10: 'grok-video-3-pro', 15: 'grok-video-3-max' }
    };
    var entry = map[modelName];
    if (entry && entry[duration]) {
      var resolved = entry[duration];
      if (resolved !== modelName) {
        console.log('[GeekAI] Grok ' + duration + 's 使用实际模型: ' + resolved);
      }
      return resolved;
    }
    return modelName;
  }

  // 构建 Grok 视频的 aspect_ratio
  _getGrokVideoAspectRatio(modelName, paramsAspectRatio) {
    const ratio = paramsAspectRatio || '16:9';
    // Grok 视频支持 2:3 / 3:2 / 1:1
    const parts = ratio.split(':');
    if (parts.length === 2) {
      const w = parseFloat(parts[0]);
      const h = parseFloat(parts[1]);
      if (w / h > 1.3) return '3:2';
      if (w / h < 0.77) return '2:3';
      return '1:1';
    }
    return '16:9';
  }

  // base64 转 Blob
  _base64ToBlob(base64) {
    const byteCharacters = atob(base64);
    const byteArrays = [];
    const chunkSize = 512;
    for (let offset = 0; offset < byteCharacters.length; offset += chunkSize) {
      const slice = byteCharacters.slice(offset, offset + chunkSize);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      byteArrays.push(new Uint8Array(byteNumbers));
    }
    return new Blob(byteArrays, { type: 'image/jpeg' });
  }

  // 将 base64 转为 data URL
  _base64ToDataUrl(base64) {
    if (base64.startsWith('data:')) return base64;
    return 'data:image/png;base64,' + base64;
  }

  async videoRequest(model) {
    return async (params) => {
      const originalModelName = model.modelName || '';
      const baseDomain = this._getBaseDomain();
      const isJsonModel = this._isJsonSubmissionModel(originalModelName);
      const isGrokVideo = this._isGrokVideoModel(originalModelName);
      const isDoubaoVideo = this._isDoubaoVideoModel(originalModelName);
      const isWanI2v = this._isWanI2vModel(originalModelName);

      // 时长处理（固定参数模型覆盖传入值）
      const fixedDuration = this._getFixedDuration(originalModelName);
      const duration = fixedDuration !== null ? fixedDuration : (params.duration || 5);

      // aspect_ratio
      var aspectRatio = params.aspectRatio || '16:9';
      // sora-pro 系列从模型名推断
      if (originalModelName.indexOf('sora2-pro') !== -1) {
        aspectRatio = this._inferAspectRatioFromModelName(originalModelName);
      }
      // grok 视频使用 3:2/2:3/1:1
      if (isGrokVideo) {
        aspectRatio = this._getGrokVideoAspectRatio(originalModelName, params.aspectRatio);
      }

      // Grok 基础模型根据时长切换为实际请求模型（grok-video-1.5 + 10s → grok-video-1.5-pro）
      var resolvedModelName = isGrokVideo
        ? this._resolveGrokModelForDuration(originalModelName, duration)
        : originalModelName;

      // 根据模型名计算正确的 size 和修正后的 model 名（对齐 Python _prepare_generation_params 逻辑）
      var sizeResult = this._computeVideoSizeAndModel(resolvedModelName, aspectRatio, params.resolution);
      var modelName = sizeResult.model;  // 修正后的模型名（wan2.6-i2v:1920*1080 → wan2.6-i2v）
      var size = sizeResult.size;        // 正确的 size 值
      var resolution = this._normalizeResolution(params.resolution);

      // 音频
      const audioGeneration = params.generateAudio ? 'Enabled' : 'Disabled';

      // 判断模型是否不使用顶层 size 字段（Hailuo/Kling/Vidu 只在 metadata.output_config.resolution 中传值）
      var usesMetadataResolutionOnly = this._usesMetadataResolutionOnly(originalModelName);

      // 构建 payload
      const payload = {
        model: modelName,
        prompt: params.prompt,
      };

      if (isGrokVideo) {
        // Grok 视频：seconds, aspect_ratio, size (大写 720P/1080P)
        payload.seconds = String(duration);
        payload.aspect_ratio = aspectRatio;
        payload.size = size;
      } else if (isDoubaoVideo) {
        // Doubao 视频：size = aspect_ratio, seconds, metadata
        payload.size = size;
        payload.seconds = String(duration);
        payload.metadata = {
          output_config: {
            aspect_ratio: aspectRatio,
            audio_generation: audioGeneration,
            resolution: resolution,
          },
        };
      } else if (usesMetadataResolutionOnly) {
        // Hailuo/Kling/Vidu: 不传顶层 size，只传 metadata.output_config
        payload.seconds = String(duration);
        payload.metadata = {
          output_config: {
            aspect_ratio: aspectRatio,
            audio_generation: audioGeneration,
            resolution: resolution,
          },
        };
      } else {
        // 通用 (sora, veo, wan2.6, seedance, pixverse 等): size, seconds, metadata
        payload.size = size;
        payload.seconds = String(duration);
        payload.metadata = {
          output_config: {
            aspect_ratio: aspectRatio,
            audio_generation: audioGeneration,
            resolution: resolution,
          },
        };
      }

      // 准备参考图
      const formData = new FormData();
      let hasFile = false;

      const addImageFile = (base64, fieldName) => {
        if (!base64) return false;
        try {
          const pure = base64.startsWith('data:') ? base64.split(',')[1] : base64;
          const blob = this._base64ToBlob(pure);
          formData.append(fieldName, blob, fieldName + '.jpg');
          hasFile = true;
          return true;
        } catch (e) {
          console.warn('[GeekAI] 跳过无效的参考图:', e);
          return false;
        }
      };

      if (isDoubaoVideo) {
        // Doubao: first_frame_image / last_frame_image
        if (params.firstImageBase64) addImageFile(params.firstImageBase64, 'first_frame_image');
        if (params.lastImageBase64) addImageFile(params.lastImageBase64, 'last_frame_image');
      } else if (isWanI2v) {
        // wan2.6-i2v: image
        if (params.firstImageBase64) addImageFile(params.firstImageBase64, 'image');
      } else {
        // Grok/Sora/Veo 等: input_reference (多张)
        if (params.firstImageBase64) addImageFile(params.firstImageBase64, 'input_reference');
        if (params.lastImageBase64) addImageFile(params.lastImageBase64, 'input_reference');
        if (params.referenceImages && Array.isArray(params.referenceImages)) {
          for (const refBase64 of params.referenceImages) {
            if (refBase64) addImageFile(refBase64, 'input_reference');
          }
        }
      }

      // 发送请求
      let response;
      if (isJsonModel) {
        // JSON 提交：将文件转为 base64 data URL 注入 payload
        if (hasFile) {
          // 收集 FormData 中的文件并注入 payload
          // 由于 FormData 已构建，这里重新处理
          const dataUrls = [];
          if (params.firstImageBase64) {
            dataUrls.push({ field: 'input_reference', url: this._base64ToDataUrl(params.firstImageBase64) });
          }
          if (params.lastImageBase64) {
            dataUrls.push({ field: 'input_reference', url: this._base64ToDataUrl(params.lastImageBase64) });
          }
          if (params.referenceImages && Array.isArray(params.referenceImages)) {
            for (const refBase64 of params.referenceImages) {
              if (refBase64) {
                dataUrls.push({ field: 'input_reference', url: this._base64ToDataUrl(refBase64) });
              }
            }
          }
          // 注入到 payload
          for (const item of dataUrls) {
            if (payload[item.field] === undefined) {
              payload[item.field] = item.url;
            } else if (Array.isArray(payload[item.field])) {
              payload[item.field].push(item.url);
            } else {
              payload[item.field] = [payload[item.field], item.url];
            }
          }
        }

        console.log('[GeekAI] 视频生成(JSON):', {
          model: modelName,
          duration: duration,
          size: size,
          resolution: resolution,
          aspectRatio: aspectRatio,
          audio: audioGeneration,
          hasReference: hasFile,
        });

        response = await fetch(baseDomain + '/v1/videos', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + this.apiKey,
          },
          body: JSON.stringify(payload),
        });
      } else {
        // multipart/form-data 提交
        // 添加 payload 字段到 FormData
        for (const key in payload) {
          if (typeof payload[key] === 'object') {
            formData.append(key, JSON.stringify(payload[key]));
          } else {
            formData.append(key, String(payload[key]));
          }
        }

        // 如果没有文件，添加占位符
        if (!hasFile) {
          const placeholderBlob = new Blob([''], { type: 'application/octet-stream' });
          formData.append('placeholder', placeholderBlob, 'placeholder');
        }

        console.log('[GeekAI] 视频生成(multipart):', {
          model: modelName,
          duration: duration,
          size: size,
          resolution: resolution,
          aspectRatio: aspectRatio,
          audio: audioGeneration,
          hasReference: hasFile,
        });

        response = await fetch(baseDomain + '/v1/videos', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + this.apiKey,
          },
          body: formData,
        });
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error("请求失败 " + response.status + ": " + errorText);
      }

      const data = await response.json();
      console.log('[GeekAI] 任务创建成功:', data);

      const taskId = data.task_id || data.id;
      if (!taskId) {
        throw new Error('未返回任务ID');
      }

      // 轮询查询结果
      const result = await pollTask(async () => {
        const queryResponse = await fetch(baseDomain + '/v1/videos/' + taskId, {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer ' + this.apiKey,
          },
        });

        if (!queryResponse.ok) {
          const errorText = await queryResponse.text();
          return { completed: true, error: "查询失败: " + queryResponse.status + " " + errorText };
        }

        const queryData = await queryResponse.json();
        const status = queryData.status;
        const progress = queryData.progress || 0;
        console.log('[GeekAI] 任务状态:', status, '进度:', progress + '%');

        if (status === 'completed' || status === 'success') {
          const url = queryData.video_url || queryData.url;
          if (!url) {
            return { completed: true, error: '任务完成但未返回视频URL' };
          }
          return { completed: true, data: url };
        }

        if (status === 'failed' || status === 'cancelled' || status === 'error') {
          const errorMsg = (queryData.error && queryData.error.message) || queryData.error || '未知错误';
          return { completed: true, error: '视频生成失败: ' + errorMsg };
        }

        return { completed: false };
      }, { interval: 5000, maxAttempts: 240 });

      if (result.error) {
        throw new Error(result.error);
      }

      return result.data;
    };
  }
}

module.exports = { Vendor };
