/**
 * Python 后端 API 客户端
 * 与 Python 后端通信
 */

import type {
  PythonApiResponse,
  ImageGenerationRequest,
  VideoGenerationRequest,
  TTSGenerationRequest,
  BatchGenerationRequest,
  BatchTTSRequest,
  ModelListRequest,
  GenerationResponse,
  ModelListResponse,
  VoiceListResponse,
  TaskRecordsResponse,
  BatchGenerationResult,
} from './types';

export class PythonApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:8000') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * 设置后端地址
   */
  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/$/, '');
  }

  /**
   * 通用请求方法
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<PythonApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return response.json();
  }

  /**
   * 生成图片
   */
  async generateImage(
    request: ImageGenerationRequest
  ): Promise<PythonApiResponse<GenerationResponse>> {
    return this.request<GenerationResponse>('/api/v1/generate/image', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * 生成视频
   */
  async generateVideo(
    request: VideoGenerationRequest
  ): Promise<PythonApiResponse<GenerationResponse>> {
    return this.request<GenerationResponse>('/api/v1/generate/video', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * 生成语音 (TTS)
   */
  async generateTTS(
    request: TTSGenerationRequest
  ): Promise<PythonApiResponse<GenerationResponse>> {
    return this.request<GenerationResponse>('/api/v1/generate/tts', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * 流式生成语音
   */
  async generateTTSStream(request: TTSGenerationRequest): Promise<ReadableStream<Uint8Array>> {
    const url = `${this.baseUrl}/api/v1/generate/tts/stream`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    if (!response.body) {
      throw new Error('响应没有 body');
    }

    return response.body;
  }

  /**
   * 批量生成图片
   */
  async batchGenerateImage(
    request: BatchGenerationRequest
  ): Promise<PythonApiResponse<BatchGenerationResult>> {
    return this.request<BatchGenerationResult>('/api/v1/generate/batch/image', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * 批量生成 TTS
   */
  async batchGenerateTTS(
    request: BatchTTSRequest
  ): Promise<PythonApiResponse<BatchGenerationResult>> {
    return this.request<BatchGenerationResult>('/api/v1/generate/batch/tts', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * 获取模型列表
   */
  async getModelList(
    request: ModelListRequest
  ): Promise<PythonApiResponse<ModelListResponse>> {
    return this.request<ModelListResponse>('/api/v1/generate/modelList', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * 获取音色列表
   */
  async getVoiceList(): Promise<PythonApiResponse<VoiceListResponse>> {
    return this.request<VoiceListResponse>('/api/v1/generate/tts/voices', {
      method: 'GET',
    });
  }

  /**
   * 获取任务记录
   */
  async getTaskRecords(projectId: string): Promise<PythonApiResponse<TaskRecordsResponse>> {
    return this.request<TaskRecordsResponse>(`/api/v1/generate/taskRecords/${projectId}`, {
      method: 'GET',
    });
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// 默认实例
export const pythonApi = new PythonApiClient();

// 导出单例方法
export function setPythonApiBaseUrl(url: string): void {
  pythonApi.setBaseUrl(url);
}
