// GeekAI 聚合平台供应商代码
// 官网: https://www.geeknow.top/
// 支持多个AI供应商的统一接口

class Vendor {
  constructor(config) {
    this.config = config;
    this.apiKey = config.inputValues?.apiKey || "";
    this.baseUrl = config.inputValues?.baseUrl || "https://www.geeknow.top/v1";
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
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `请求失败: ${response.status}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || "";
    };
  }

  // 图片尺寸映射表
  _getImageSizeMap(modelName) {
    // Doubao Seedream 尺寸映射
    const doubaoMap = {
      '1:1': '2048x2048',
      '4:3': '2304x1728',
      '3:4': '1728x2304',
      '16:9': '2560x1440',
      '9:16': '1440x2560',
      '3:2': '2496x1664',
      '2:3': '1664x2496',
      '21:9': '3024x1296',
    };

    // Grok Image 尺寸映射
    const grokMap = {
      '1:1': '2048x2048',
      '4:3': '2304x1728',
      '3:4': '1728x2304',
      '16:9': '2560x1440',
      '9:16': '1440x2560',
      '3:2': '2496x1664',
      '2:3': '1664x2496',
      '21:9': '3024x1296',
    };

    // GPT-Image-2 尺寸映射
    const gptImage2Map = {
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

    if (modelName.startsWith('doubao-seedream') || modelName.startsWith('doubao')) {
      return doubaoMap;
    }
    if (modelName.startsWith('grok-')) {
      return grokMap;
    }
    if (modelName.startsWith('gpt-image-')) {
      return gptImage2Map;
    }

    // Gemini 默认映射
    return {
      '1:1': '1024x1024',
      '16:9': '1280x720',
      '9:16': '720x1280',
      '4:3': '1024x768',
      '3:4': '768x1024',
    };
  }

  async imageRequest(model) {
    return async (params) => {
      const modelName = model.modelName || '';

      // 判断是否是chat类型的图片模型
      const chatImageModels = ['gpt-image-2', 'gpt-image-2-pro', 'gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview', 'grok-4-2-image'];
      const isChatImageModel = chatImageModels.includes(modelName);

      if (isChatImageModel) {
        // 走 chat/completions 接口
        const contentParts = [];

        // 添加提示词
        contentParts.push({ type: 'text', text: params.prompt });

        // 上传所有参考图
        if (params.imageUrls && params.imageUrls.length > 0) {
          for (const url of params.imageUrls) {
            contentParts.push({ type: 'image_url', image_url: { url } });
          }
        } else if (params.imageBase64 && params.imageBase64.length > 0) {
          for (const base64 of params.imageBase64) {
            const imageUrl = base64.startsWith('data:') ? base64 : 'data:image/jpeg;base64,' + base64;
            contentParts.push({ type: 'image_url', image_url: { url: imageUrl } });
          }
        }

        const response = await fetch(this.baseUrl + '/chat/completions', {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + this.apiKey,
          },
          body: JSON.stringify({
            model: modelName,
            messages: [
              { role: 'user', content: contentParts }
            ],
            max_tokens: 4096,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || `请求失败: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "";

        console.log('[GeekAI] 图片生成返回内容:', content.substring(0, 500));

        // 从返回的markdown中提取图片URL (![...](url))
        const markdownMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s\)]+)\)/);
        if (markdownMatch) {
          console.log('[GeekAI] 从markdown提取到URL:', markdownMatch[1]);
          return markdownMatch[1];
        }

        // 从返回的markdown中提取图片URL（更宽松的匹配）
        const urlMatch = content.match(/https?:\/\/[^\s\)"'<>]+/i);
        if (urlMatch) {
          console.log('[GeekAI] 提取到URL:', urlMatch[0]);
          return urlMatch[0];
        }

        // 如果返回的是base64图片
        const base64Match = content.match(/data:image\/[^;]+;base64,[^"'\s\)]+/);
        if (base64Match) {
          console.log('[GeekAI] 提取到base64图片');
          return base64Match[0];
        }

        // 如果content本身就是图片URL
        if (content.startsWith('http')) {
          console.log('[GeekAI] content是URL:', content.trim());
          return content.trim();
        }

        console.log('[GeekAI] 未能提取图片URL，返回原始内容');
        return content;
      }

      // 普通图片模型走 /images/generations 接口
      // 获取尺寸映射
      const sizeMap = this._getImageSizeMap(modelName);
      const aspectRatio = params.aspectRatio || '16:9';
      const size = sizeMap[aspectRatio] || sizeMap['16:9'] || '1024x1024';

      const requestBody = {
        model: modelName,
        prompt: params.prompt,
        n: params.n || 1,
        size: size,
      };

      // 参考图片处理（OpenAI 兼容格式）
      const imageList = [];
      if (params.imageBase64 && params.imageBase64.length > 0) {
        for (const base64 of params.imageBase64) {
          const imageData = base64.startsWith('data:') ? base64.split(',')[1] : base64;
          imageList.push(imageData);
        }
      }
      if (params.imageUrls && params.imageUrls.length > 0) {
        for (const url of params.imageUrls) {
          // 如果是本地路径，需要读取为 base64
          imageList.push(url);
        }
      }
      if (imageList.length > 0) {
        requestBody.image = imageList;
      }

      const response = await fetch(this.baseUrl + '/images/generations', {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + this.apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `请求失败: ${response.status}`);
      }

      const data = await response.json();
      return data.data?.[0]?.url || data.data?.[0]?.b64_json || "";
    };
  }

  async videoRequest(model) {
    return async (params) => {
      const modelName = model.modelName || '';
      const isSoraPro = modelName.includes('sora') && modelName.includes('pro');
      const isSora = modelName.includes('sora');
      const isGrokVideo = modelName.includes('grok-video');
      const isVeo = modelName.includes('veo');
      const isDoubao = modelName.includes('doubao');
      const isWan = modelName.includes('wan');
      const isVidu = modelName.includes('Vidu');
      const isKling = modelName.includes('Kling');
      const isHailuo = modelName.includes('Hailuo');

      const formData = new FormData();
      formData.append('model', modelName);
      formData.append('prompt', params.prompt);

      // 处理宽高比
      if (isSoraPro && modelName.includes('landscape')) {
        formData.append('aspect_ratio', '16:9');
      } else if (isSoraPro && modelName.includes('portrait')) {
        formData.append('aspect_ratio', '9:16');
      } else if (isSoraPro && modelName.includes('hd')) {
        formData.append('aspect_ratio', '16:9');
      } else if (isVeo && params.generationMode === '首尾帧') {
        formData.append('aspect_ratio', '16:9');
      } else {
        const width = params.width || 1920;
        const height = params.height || 1080;
        const ratio = width / height;

        let aspectRatio = '16:9';
        if (ratio > 1.3) {
          aspectRatio = '16:9';
        } else if (ratio < 0.77) {
          aspectRatio = '9:16';
        } else {
          aspectRatio = '1:1';
        }

        // Grok 视频支持 2:3 / 3:2 / 1:1
        if (isGrokVideo) {
          if (ratio > 1.3) aspectRatio = '3:2';
          else if (ratio < 0.77) aspectRatio = '2:3';
          else aspectRatio = '1:1';
        }

        formData.append('aspect_ratio', aspectRatio);
      }

      // 处理时长
      if (isSoraPro && modelName.includes('25s')) {
        formData.append('duration', '25');
      } else if (isSoraPro && (modelName.includes('10s') || modelName.includes('15s'))) {
        const dur = modelName.includes('10s') ? '10' : '15';
        formData.append('duration', dur);
      } else if (isGrokVideo && modelName.includes('max')) {
        formData.append('duration', '15');
      } else if (isGrokVideo && modelName.includes('pro')) {
        formData.append('duration', '10');
      } else if (params.duration) {
        formData.append('duration', String(params.duration));
      }

      // 处理分辨率/清晰度
      let resolution = '720P';
      if (params.resolution) {
        if (params.resolution.includes('1080') || params.resolution.includes('1080p')) {
          resolution = '1080P';
        } else if (params.resolution.includes('720') || params.resolution.includes('720p')) {
          resolution = '720P';
        } else if (params.resolution.includes('480') || params.resolution.includes('480p')) {
          resolution = '480P';
        } else if (params.resolution.includes('540') || params.resolution.includes('540p')) {
          resolution = '540P';
        } else if (params.resolution.includes('4k') || params.resolution.includes('4K')) {
          resolution = '4K';
        }
      } else if (params.height >= 1080) {
        resolution = '1080P';
      }
      formData.append('size', resolution);

      // 音频生成控制
      if (params.generateAudio !== undefined) {
        formData.append('audio_generation', params.generateAudio ? 'Enabled' : 'Disabled');
      }

      // 处理参考图片
      if (params.firstImageBase64) {
        const blob = new Blob([Buffer.from(params.firstImageBase64, 'base64')], { type: 'image/jpeg' });
        formData.append('input_reference', blob, 'first_frame.jpg');
      }
      if (params.lastImageBase64) {
        const blob = new Blob([Buffer.from(params.lastImageBase64, 'base64')], { type: 'image/jpeg' });
        formData.append('input_reference', blob, 'last_frame.jpg');
      }
      if (params.referenceImages && Array.isArray(params.referenceImages)) {
        for (let i = 0; i < params.referenceImages.length; i++) {
          const refBase64 = params.referenceImages[i];
          if (refBase64) {
            try {
              const blob = new Blob([Buffer.from(refBase64, 'base64')], { type: 'image/jpeg' });
              formData.append('input_reference', blob, `reference_${i}.jpg`);
            } catch (e) {
              console.warn('[GeekAI] 跳过无效的参考图:', i);
            }
          }
        }
      }

      console.log('[GeekAI] 准备发送请求:', {
        model: modelName,
        prompt: params.prompt?.substring(0, 50),
        isSora,
        isSoraPro,
        isGrokVideo,
        isVeo,
        isDoubao,
        firstFrame: !!params.firstImageBase64,
        referenceCount: params.referenceImages?.length || 0,
        resolution,
        duration: params.duration,
        audio: params.generateAudio,
      });

      const response = await fetch(this.baseUrl + '/videos', {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${this.apiKey}`,
        },
        body: formData,
      });

      console.log('[GeekAI] 响应状态:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[GeekAI] 错误响应:', errorText);
        throw new Error(`请求失败 ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log('[GeekAI] 任务创建成功:', data);

      const taskId = data.task_id || data.id;
      if (!taskId) {
        throw new Error('未返回任务ID');
      }

      // 轮询查询结果
      const result = await pollTask(async () => {
        const queryResponse = await fetch(this.baseUrl + '/videos/' + taskId, {
          method: 'GET',
          headers: {
            'authorization': `Bearer ${this.apiKey}`,
          },
        });

        if (!queryResponse.ok) {
          const errorText = await queryResponse.text();
          console.error('[GeekAI] 查询失败:', queryResponse.status, errorText);
          return { completed: true, error: `查询失败: ${queryResponse.status} ${errorText}` };
        }

        const queryData = await queryResponse.json();
        console.log('[GeekAI] 查询响应:', queryData);

        if (!queryData) {
          console.warn('[GeekAI] 查询返回null，继续等待...');
          return { completed: false };
        }

        const status = queryData.status;
        const progress = queryData.progress || 0;
        console.log('[GeekAI] 任务状态:', status, '进度:', progress + '%');

        if (status === 'completed') {
          const url = queryData.video_url || queryData.url;
          if (!url) {
            return { completed: true, error: '任务完成但未返回视频URL' };
          }
          console.log('[GeekAI] 视频生成成功:', url);
          return { completed: true, data: url };
        }

        if (status === 'failed' || status === 'cancelled') {
          const errorMsg = queryData.error?.message || queryData.error || '未知错误';
          console.error('[GeekAI] 任务失败:', errorMsg);
          return { completed: true, error: '视频生成失败: ' + errorMsg };
        }

        return { completed: false };
      }, { interval: 5000, maxAttempts: 120 });

      if (result.error) {
        throw new Error(result.error);
      }

      return result.data;
    };
  }
}

module.exports = { Vendor };
