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

  async imageRequest(model) {
    return async (params) => {
      // 判断是否是chat类型的图片模型
      const chatImageModels = ['gpt-image-2', 'gpt-image-2-pro', 'gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview', 'grok-4-2-image'];
      const isChatImageModel = chatImageModels.includes(model.modelName);

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
            model: model.modelName,
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
        
        // 从返回的markdown中提取图片URL
        const urlMatch = content.match(/https?:\/\/[^\s\)]+\.(png|jpg|jpeg|webp|gif)(\?[^\s\)]*)?/i);
        if (urlMatch) {
          return urlMatch[0];
        }
        
        // 如果返回的是base64图片
        const base64Match = content.match(/data:image\/[^;]+;base64,[^"'\s\)]+/);
        if (base64Match) {
          return base64Match[0];
        }
        
        // 如果content本身就是图片URL
        if (content.startsWith('http')) {
          return content;
        }
        
        return content;
      }

      // 普通图片模型走 /images/generations 接口
      const response = await fetch(this.baseUrl + '/images/generations', {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + this.apiKey,
        },
        body: JSON.stringify({
          model: model.modelName,
          prompt: params.prompt,
          n: params.n || 1,
          size: params.size || "1024x1024",
        }),
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

      const formData = new FormData();
      formData.append('model', modelName);
      formData.append('prompt', params.prompt);

      if (isSoraPro && modelName.includes('landscape')) {
        formData.append('aspect_ratio', '16:9');
      } else if (isSoraPro && modelName.includes('portrait')) {
        formData.append('aspect_ratio', '9:16');
      } else if (isSoraPro && modelName.includes('hd')) {
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

        const apiAspectRatio = aspectRatio === '16:9' ? '3:2' :
                              aspectRatio === '9:16' ? '2:3' : '1:1';
        formData.append('aspect_ratio', apiAspectRatio);
      }

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

      const resolution = (params.resolution || '').includes('1080') || (params.height || 0) >= 1080 ? '1080P' : '720P';
      formData.append('size', resolution);

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
        firstFrame: !!params.firstImageBase64,
        referenceCount: params.referenceImages?.length || 0,
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
          const url = queryData.video_url;
          if (!url) {
            return { completed: true, error: '任务完成但未返回视频URL' };
          }
          console.log('[GeekAI] 视频生成成功:', url);
          return { completed: true, data: url };
        }

        if (status === 'failed' || status === 'cancelled') {
          const errorMsg = queryData.error?.message || '未知错误';
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
