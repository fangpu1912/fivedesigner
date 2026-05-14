/**
 * Python 后端 API 类型定义
 */

// 通用响应结构
export interface PythonApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

// 图片生成请求
export interface ImageGenerationRequest {
  model: string;
  prompt: string;
  image_base64?: string[];
  size?: string;
  aspect_ratio?: string;
  project_id: string;
  task_class?: string;
  describe?: string;
}

// 视频生成请求
export interface VideoGenerationRequest {
  model: string;
  prompt: string;
  image_base64?: string[];
  aspect_ratio?: string;
  mode?: string;
  duration?: number;
  resolution?: string;
  audio?: boolean;
  project_id: string;
  task_class?: string;
  describe?: string;
}

// TTS 生成请求
export interface TTSGenerationRequest {
  model: string;
  text: string;
  voice_id: string;
  emotion?: string;
  speed?: number;
  pitch?: number;
  volume?: number;
  sample_rate?: number;
  format?: string;
  project_id: string;
  task_class?: string;
  describe?: string;
}

// 批量生成单项
export interface BatchGenerationItem {
  model: string;
  prompt: string;
  image_base64?: string[];
  size?: string;
  aspect_ratio?: string;
  project_id: string;
  task_class?: string;
  describe?: string;
}

// 批量 TTS 单项
export interface BatchTTSItem {
  text: string;
  voice_id: string;
  emotion?: string;
  speed?: number;
  pitch?: number;
  volume?: number;
  sample_rate?: number;
  format?: string;
  project_id: string;
  task_class?: string;
  describe?: string;
}

// 批量生成请求
export interface BatchGenerationRequest {
  items: BatchGenerationItem[];
  concurrent_count?: number;
}

// 批量 TTS 请求
export interface BatchTTSRequest {
  model: string;
  items: BatchTTSItem[];
  concurrent_count?: number;
}

// 生成响应
export interface GenerationResponse {
  success: boolean;
  task_id?: string;
  file_path?: string;
  error?: string;
}

// 模型列表请求
export interface ModelListRequest {
  type: 'image' | 'video' | 'text' | 'tts' | 'all';
}

// 模型信息
export interface ModelInfo {
  id: string;
  name: string;
  model_name: string;
  type: string;
  vendor_id: string;
  vendor_name: string;
}

// 模型列表响应
export interface ModelListResponse {
  models: ModelInfo[];
}

// 音色信息
export interface VoiceInfo {
  voice_id: string;
  name: string;
  gender: string;
  language: string;
  preview_url?: string;
  vendor_id: string;
  vendor_name: string;
  model: string;
}

// 音色列表响应
export interface VoiceListResponse {
  voices: VoiceInfo[];
}

// 任务记录
export interface TaskRecord {
  id: string;
  project_id: string;
  task_class: string;
  model: string;
  status: number; // 0=进行中, 1=成功, -1=失败
  describe: string;
  content?: string;
  error_message?: string;
  start_time: string;
  end_time?: string;
}

// 任务记录响应
export interface TaskRecordsResponse {
  tasks: TaskRecord[];
}

// 批量生成结果
export interface BatchGenerationResult {
  total: number;
  success: number;
  failed: number;
  results: Array<{
    success: boolean;
    result?: string;
  }>;
}
