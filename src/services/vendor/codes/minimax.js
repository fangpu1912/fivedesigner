// MiniMax 供应商代码 - 支持文本、图片、视频生成和 TTS
class Vendor {
  constructor(config) {
    this.config = config;
    this.apiKey = config.inputValues?.apiKey || "";
    // 确保 baseUrl 不包含尾部斜杠，且包含 /v1
    let baseUrl = config.inputValues?.baseUrl || "https://api.minimaxi.com/v1";
    baseUrl = baseUrl.replace(/\/$/, ''); // 移除尾部斜杠
    this.baseUrl = baseUrl;
    console.log('[MiniMax] baseUrl:', this.baseUrl);
  }

  // ==================== 文本生成 ====================
  async textRequest(model) {
    return async (params) => {
      const response = await fetch(this.baseUrl + '/text/chatcompletion_v2', {
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

  // 将像素尺寸比例转换为 MiniMax 支持的标准比例
  // MiniMax 支持: 1:1, 16:9, 4:3, 3:2, 2:3, 3:4, 9:16, 21:9
  convertToMiniMaxAspectRatio(aspectRatio) {
    if (!aspectRatio || !aspectRatio.includes(':')) return "1:1";
    
    const [w, h] = aspectRatio.split(':').map(Number);
    if (!w || !h) return "1:1";
    
    // 如果已经是标准比例（小数字），直接返回
    if (w <= 100 && h <= 100) return aspectRatio;
    
    // 像素尺寸，需要转换为标准比例
    const ratio = w / h;
    
    const supportedRatios = [
      { name: '1:1', value: 1 },
      { name: '16:9', value: 16 / 9 },
      { name: '4:3', value: 4 / 3 },
      { name: '3:2', value: 3 / 2 },
      { name: '2:3', value: 2 / 3 },
      { name: '3:4', value: 3 / 4 },
      { name: '9:16', value: 9 / 16 },
      { name: '21:9', value: 21 / 9 },
    ];
    
    let closest = supportedRatios[0];
    let minDiff = Math.abs(ratio - closest.value);
    
    for (const r of supportedRatios) {
      const diff = Math.abs(ratio - r.value);
      if (diff < minDiff) {
        minDiff = diff;
        closest = r;
      }
    }
    
    console.log(`[MiniMax] 转换比例 ${aspectRatio} -> ${closest.name}`);
    return closest.name;
  }

  // ==================== 图片生成 ====================
  // API文档: https://platform.minimaxi.com/document/ImageGeneration
  async imageRequest(model) {
    return async (params) => {
      const requestBody = {
        model: model.modelName || "image-01",
        prompt: params.prompt,
        aspect_ratio: this.convertToMiniMaxAspectRatio(params.aspectRatio),
        n: params.n || 1,
        quality: params.quality || "standard",
      };

      // 处理图生图/参考图 - MiniMax 使用 subject_reference
      if (params.imageBase64 && params.imageBase64.length > 0) {
        // 第一张图作为主参考
        const firstImage = params.imageBase64[0];
        requestBody.subject_reference = [{
          type: "character",
          image_file: firstImage.startsWith('data:') 
            ? firstImage 
            : `data:image/png;base64,${firstImage}`
        }];
        
        // 如果有更多参考图，添加到 subject_reference
        if (params.imageBase64.length > 1) {
          for (let i = 1; i < params.imageBase64.length; i++) {
            const img = params.imageBase64[i];
            requestBody.subject_reference.push({
              type: "character",
              image_file: img.startsWith('data:') 
                ? img 
                : `data:image/png;base64,${img}`
            });
          }
        }
      }

      const url = this.baseUrl + '/image_generation';
      console.log('[MiniMax Image] 请求URL:', url);
      console.log('[MiniMax Image] 请求体:', JSON.stringify(requestBody, null, 2));

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + this.apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`图片生成失败: ${error}`);
      }

      const data = await response.json();
      
      console.log('[MiniMax Image] API响应:', JSON.stringify(data, null, 2));
      
      // MiniMax 返回格式: { data: { image_urls: [...] } }
      if (data.data?.image_urls?.length > 0) {
        return data.data.image_urls[0];
      }
      
      // 检查其他可能的返回格式
      if (data.images?.length > 0) {
        return data.images[0];
      }
      if (data.url) {
        return data.url;
      }
      if (data.data?.url) {
        return data.data.url;
      }
      
      console.error('[MiniMax Image] 未找到图片URL，完整响应:', data);
      throw new Error("图片生成失败: 未返回图片URL");
    };
  }

  // ==================== 视频生成 ====================
  // API文档: https://platform.minimaxi.com/document/VideoGeneration
  async videoRequest(model) {
    return async (params) => {
      const requestBody = {
        model: model.modelName || "video-01",
        prompt: params.prompt,
        duration: params.duration || 5,
        resolution: params.resolution || "720p",
      };

      // 如果提供了首帧图片，添加到请求
      if (params.imageUrl) {
        requestBody.first_frame_image = params.imageUrl;
      }

      // 提交视频生成任务
      const submitResponse = await fetch(this.baseUrl + '/video_generation', {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + this.apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      if (!submitResponse.ok) {
        const error = await submitResponse.text();
        throw new Error(`视频生成任务提交失败: ${error}`);
      }

      const submitData = await submitResponse.json();
      const taskId = submitData.task_id;

      if (!taskId) {
        throw new Error("视频生成任务提交失败: 未返回任务ID");
      }

      // 轮询查询任务状态
      const maxAttempts = 60; // 最多轮询60次
      const interval = 5000; // 每5秒查询一次

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, interval));

        const queryResponse = await fetch(`${this.baseUrl}/video/query?task_id=${taskId}`, {
          method: "GET",
          headers: {
            Authorization: "Bearer " + this.apiKey,
          },
        });

        if (!queryResponse.ok) {
          continue;
        }

        const queryData = await queryResponse.json();
        
        // 检查任务状态
        if (queryData.status === "Success") {
          if (queryData.file?.download_url) {
            return queryData.file.download_url;
          }
          throw new Error("视频生成成功但未返回下载链接");
        } else if (queryData.status === "Fail") {
          throw new Error(`视频生成失败: ${queryData.error || "未知错误"}`);
        }
        // 状态为 Queueing 或 Processing，继续轮询
      }

      throw new Error("视频生成超时，请稍后查询任务状态");
    };
  }

  // ==================== TTS 语音合成 ====================
  // API文档: https://platform.minimaxi.com/document/T2A
  // 
  // 支持三种模式:
  // 1. 标准音色: 使用预置音色 (female-shaonv 等)
  // 2. 即时音色克隆: 传入 voiceSampleUrl (本地文件路径)，自动上传并使用 voice_clone API
  // 3. 预克隆音色: 传入 file_id (已上传的参考音频)
  //
  // 标准音色列表:
  // - female-shaonv: 少女音
  // - male-qn-qingse: 青年音-青涩
  // - male-qn-jingying: 青年音-精英
  // - female-chengshu: 成熟女声
  // - male-chengshu: 成熟男声
  // - female-yuzhong: 御姐音
  // - male-dashu: 大叔音
  //
  async ttsRequest(model) {
    return async (params) => {
      console.log('[MiniMax TTS] 请求参数:', { 
        text: params.text?.substring(0, 50) + '...', 
        voiceId: params.voiceId, 
        fileId: params.fileId,
        voiceSampleUrl: params.voiceSampleUrl,
        hasFileId: !!params.fileId,
        hasVoiceSampleUrl: !!params.voiceSampleUrl
      });

      // 如果提供了 voiceSampleUrl (本地文件路径)，先上传获取 file_id，然后使用即时音色克隆
      if (params.voiceSampleUrl) {
        console.log('[MiniMax TTS] 使用即时音色克隆模式，参考音频路径:', params.voiceSampleUrl);
        
        try {
          // 1. 读取本地音频文件（使用 readFile 函数）
          const fileBuffer = await readFile(params.voiceSampleUrl);
          console.log('[MiniMax TTS] 读取参考音频文件，大小:', fileBuffer.length, 'bytes');
          
          // 从路径中提取文件名
          const fileName = params.voiceSampleUrl.split(/[/\\]/).pop() || 'audio.flac';
          
          // 2. 上传到 MiniMax 获取 file_id
          const formData = new FormData();
          const blob = new Blob([fileBuffer], { type: 'audio/flac' });
          formData.append('file', blob, fileName);
          formData.append('purpose', 'voice_clone');
          
          console.log('[MiniMax TTS] 上传参考音频到 MiniMax...');
          const uploadResponse = await fetch(this.baseUrl + '/files/upload', {
            method: "POST",
            headers: {
              Authorization: "Bearer " + this.apiKey,
            },
            body: formData,
          });
          
          if (!uploadResponse.ok) {
            const error = await uploadResponse.text();
            console.error('[MiniMax TTS] 上传参考音频失败:', uploadResponse.status, error);
            throw new Error(`上传参考音频失败: HTTP ${uploadResponse.status} - ${error}`);
          }
          
          const uploadData = await uploadResponse.json();
          console.log('[MiniMax TTS] 上传响应:', JSON.stringify(uploadData, null, 2));
          
          const fileId = uploadData.file?.file_id;
          if (!fileId) {
            throw new Error('上传参考音频失败: 未返回 file_id');
          }
          
          console.log('[MiniMax TTS] 获取到 file_id:', fileId);
          
          // 3. 使用 voice_clone API 进行即时音色克隆
          // 生成一个随机的 voice_id（8-256字符，首字符为字母）
          const voiceId = 'clone_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
          
          // voice_clone 请求体 - 根据 MiniMax 文档
          const requestBody = {
            file_id: fileId,
            voice_id: voiceId,
            text: params.text,
            model: model.modelName || "speech-2.8-hd",
            need_noise_reduction: false,
            need_volume_normalization: false,
            aigc_watermark: false,
          };
          
          console.log('[MiniMax TTS] voice_clone 请求体:', JSON.stringify(requestBody, null, 2));

          const response = await fetch(this.baseUrl + '/voice_clone', {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + this.apiKey,
            },
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) {
            const error = await response.text();
            console.error('[MiniMax TTS] 即时克隆HTTP错误:', response.status, error);
            throw new Error(`即时音色克隆失败: HTTP ${response.status} - ${error}`);
          }

          const data = await response.json();
          console.log('[MiniMax TTS] 即时克隆响应:', JSON.stringify(data, null, 2));
          
          // 检查 MiniMax 错误响应
          if (data.base_resp?.status_code !== 0 && data.base_resp?.status_code !== undefined) {
            throw new Error(`MiniMax错误 (${data.base_resp.status_code}): ${data.base_resp.status_msg || '未知错误'}`);
          }
          
          // voice_clone 接口传了 text 和 model 后会返回试听音频 demo_audio
          const audioUrl = data.demo_audio;
          if (audioUrl) {
            console.log('[MiniMax TTS] 即时克隆返回音频URL:', audioUrl);
            return audioUrl;
          }
          
          console.error('[MiniMax TTS] 即时克隆未返回音频URL，完整响应:', data);
          throw new Error("即时音色克隆失败: 未返回音频URL");
        } catch (error) {
          console.error('[MiniMax TTS] 即时音色克隆失败:', error);
          throw error;
        }
      }

      // 如果提供了 file_id，使用即时音色克隆模式 (voice_clone API)
      // 这种方式不需要预先生成 voice_id，直接上传参考音频即可
      if (params.fileId) {
        console.log('[MiniMax TTS] 使用即时音色克隆模式，file_id:', params.fileId);
        
        const requestBody = {
          model: model.modelName || "speech-2.8-hd",
          text: params.text,
          file_id: params.fileId,
          need_noise_reduction: false,
          need_volume_normalization: false,
          aigc_watermark: false,
        };

        const response = await fetch(this.baseUrl + '/voice_clone', {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + this.apiKey,
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const error = await response.text();
          console.error('[MiniMax TTS] 即时克隆HTTP错误:', response.status, error);
          throw new Error(`即时音色克隆失败: HTTP ${response.status} - ${error}`);
        }

        const data = await response.json();
        console.log('[MiniMax TTS] 即时克隆响应:', JSON.stringify(data, null, 2));
        
        // 检查 MiniMax 错误响应
        if (data.base_resp?.status_code !== 0 && data.base_resp?.status_code !== undefined) {
          throw new Error(`MiniMax错误 (${data.base_resp.status_code}): ${data.base_resp.status_msg || '未知错误'}`);
        }
        
        // voice_clone API 返回格式: { demo_audio: "url" } 或 { file_url: "url" }
        const audioUrl = data.demo_audio || data.file_url || data.data?.audio_url;
        if (audioUrl) {
          console.log('[MiniMax TTS] 即时克隆返回音频URL:', audioUrl);
          return audioUrl;
        }
        
        console.error('[MiniMax TTS] 即时克隆未返回音频URL，完整响应:', data);
        throw new Error("即时音色克隆失败: 未返回音频URL");
      }

      // 标准音色模式 (T2A V2 API)
      // 验证音色ID，使用默认音色
      const validVoiceIds = [
        'female-shaonv', 'male-qn-qingse', 'male-qn-jingying',
        'female-chengshu', 'male-chengshu', 'female-yuzhong', 'male-dashu'
      ];
      let voiceId = params.voiceId || 'female-shaonv';
      
      // 如果传入的音色ID不在列表中，使用默认音色
      if (!validVoiceIds.includes(voiceId)) {
        console.warn(`[MiniMax TTS] 未知音色ID: ${voiceId}，使用默认音色 female-shaonv`);
        voiceId = 'female-shaonv';
      }
      
      const requestBody = {
        model: model.modelName || "speech-01-turbo",
        text: params.text,
        voice_setting: {
          voice_id: voiceId,
          speed: params.speed ?? 1.0,
          pitch: params.pitch ?? 0,
          volume: params.volume ?? 1.0,
        },
        audio_setting: {
          sample_rate: params.sampleRate ?? 32000,
          bitrate: params.bitrate ?? 128000,
          format: params.format || "mp3",
          channel: 1,
        },
      };

      console.log('[MiniMax TTS] 标准音色请求:', JSON.stringify(requestBody, null, 2));

      const response = await fetch(this.baseUrl + '/t2a_v2', {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + this.apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[MiniMax TTS] HTTP错误:', response.status, error);
        throw new Error(`TTS生成失败: HTTP ${response.status} - ${error}`);
      }

      const data = await response.json();
      console.log('[MiniMax TTS] 响应数据:', JSON.stringify(data, null, 2));
      
      // 检查 MiniMax 错误响应
      if (data.base_resp?.status_code !== 0 && data.base_resp?.status_code !== undefined) {
        throw new Error(`MiniMax错误 (${data.base_resp.status_code}): ${data.base_resp.status_msg || '未知错误'}`);
      }
      
      // MiniMax T2A V2 API 返回格式: data.audio 包含 hex 编码的音频
      
      // 1. 首先检查是否有音频URL
      const audioUrl = data.data?.audio_url || data.audio_url;
      if (audioUrl) {
        console.log('[MiniMax TTS] 返回音频URL:', audioUrl);
        return audioUrl;
      }
      
      // 2. 检查是否有hex格式的音频数据 (T2A V2 默认格式)
      const audioHex = data.data?.audio || data.audio;
      if (audioHex && typeof audioHex === 'string') {
        console.log('[MiniMax TTS] 返回hex音频数据，长度:', audioHex.length);
        // 将hex转换为base64
        const hexToBase64 = (hex) => {
          const bytes = new Uint8Array(hex.length / 2);
          for (let i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
          }
          let binary = '';
          bytes.forEach(byte => binary += String.fromCharCode(byte));
          return btoa(binary);
        };
        const base64 = hexToBase64(audioHex);
        return `data:audio/mp3;base64,${base64}`;
      }
      
      // 3. 检查是否已经是base64格式
      if (data.data?.audio_base64 || data.audio_base64) {
        const base64 = data.data?.audio_base64 || data.audio_base64;
        console.log('[MiniMax TTS] 返回base64音频数据');
        return `data:audio/mp3;base64,${base64}`;
      }
      
      console.error('[MiniMax TTS] 未找到音频URL或数据，完整响应:', data);
      throw new Error("TTS生成失败: 未返回音频URL");
    };
  }

  // ==================== 声音克隆上传 ====================
  // API文档: https://platform.minimaxi.com/document/VoiceClone
  async voiceCloneUploadRequest(model) {
    return async (params) => {
      // 使用 files/upload 接口上传音频
      const response = await fetch(this.baseUrl + '/files/upload', {
        method: "POST",
        headers: {
          Authorization: "Bearer " + this.apiKey,
        },
        body: params.formData, // FormData 包含 file 和 purpose
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`音频上传失败: ${error}`);
      }

      const data = await response.json();
      
      // MiniMax 返回格式: { file: { file_id: "..." } }
      if (data.file?.file_id) {
        return { 
          fileId: data.file.file_id,
          voiceId: data.voice_id 
        };
      }
      
      throw new Error("音频上传失败: 未返回 file_id");
    };
  }

  // ==================== 声音克隆生成语音 ====================
  // API文档: https://platform.minimaxi.com/document/VoiceClone
  async voiceCloneRequest(model) {
    return async (params) => {
      // 判断使用哪个 API：
      // - 如果有 voiceId 但没有 fileId，说明是已复刻的音色，使用 T2A V2 API
      // - 如果有 fileId，使用 voice_clone API 进行复刻
      const isClonedVoice = params.voiceId && !params.fileId;
      const url = isClonedVoice 
        ? `${this.baseUrl}/t2a_v2` 
        : `${this.baseUrl}/voice_clone`;

      // 构建 payload
      const payload = {
        model: params.model || "speech-2.8-hd",
        text: params.text,
      };

      if (isClonedVoice) {
        // 使用 T2A V2 API - 已复刻的音色
        payload.voice_id = params.voiceId;
        payload.voice_setting = {
          voice_id: params.voiceId,
          speed: params.speed || 1.0,
        };
        payload.audio_setting = {
          sample_rate: params.sampleRate || 32000,
          bitrate: params.bitrate || 128000,
          format: params.format || "mp3",
          channel: 1,
        };
      } else {
        // 使用 voice_clone API - 首次复刻或使用 file_id
        payload.need_noise_reduction = false;
        payload.need_volume_normalization = false;
        payload.aigc_watermark = false;

        if (params.voiceId) {
          payload.voice_id = params.voiceId;
        }
        if (params.fileId) {
          payload.file_id = params.fileId;
        }

        // 可选的克隆提示
        if (params.promptText) {
          payload.clone_prompt = {
            prompt_text: params.promptText,
          };
        }
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + this.apiKey,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`克隆语音生成失败: ${error}`);
      }

      const data = await response.json();
      
      // 检查 MiniMax 错误响应
      if (data.base_resp?.status_code !== 0 && data.base_resp?.status_code !== undefined) {
        throw new Error(`MiniMax 错误 (${data.base_resp.status_code}): ${data.base_resp.status_msg || '未知错误'}`);
      }
      
      // MiniMax 返回格式可能是：
      // 1. { data: { audio: "base64..." } } - T2A V2 格式
      // 2. { demo_audio: "url" } - voice_clone 格式
      let audioUrl = data.data?.audio_url || data.demo_audio || data.file_url;
      
      if (!audioUrl && data.data?.audio) {
        // 返回 base64 音频数据
        return `data:audio/mp3;base64,${data.data.audio}`;
      }
      
      if (audioUrl) {
        return audioUrl;
      }
      
      throw new Error("克隆语音生成失败: 未返回音频URL");
    };
  }
}

module.exports = { Vendor };
