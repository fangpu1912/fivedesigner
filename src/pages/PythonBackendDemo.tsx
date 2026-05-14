/**
 * Python 后端集成演示页面
 * 展示 FiveDesigner 前端与 Python 后端的集成效果
 */

import { useState } from 'react';
import { Server, Image, Video, Mic, Activity, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { TaskManager } from '@/components/tasks';
import {
  usePythonHealthCheck,
  usePythonModelList,
  usePythonImageGeneration,
  usePythonVideoGeneration,
  usePythonTTSGeneration,
  usePythonVoiceList,
} from '@/hooks/usePythonGeneration';
import { setPythonApiBaseUrl } from '@/services/pythonApi';

export default function PythonBackendDemo() {
  const [backendUrl, setBackendUrl] = useState('http://localhost:8000');
  const [projectId, setProjectId] = useState('demo-project');

  // 健康检查
  const { data: isHealthy, isLoading: healthLoading } = usePythonHealthCheck();

  // 模型列表
  const { data: imageModels } = usePythonModelList('image');
  const { data: videoModels } = usePythonModelList('video');
  const { data: _ttsModels } = usePythonModelList('tts');

  // 音色列表
  const { data: voicesData } = usePythonVoiceList();

  // 生成 Hooks
  const imageMutation = usePythonImageGeneration();
  const videoMutation = usePythonVideoGeneration();
  const ttsMutation = usePythonTTSGeneration();

  // 表单状态
  const [imagePrompt, setImagePrompt] = useState('一只可爱的卡通猫');
  const [videoPrompt, setVideoPrompt] = useState('一只猫在草地上奔跑');
  const [ttsText, setTtsText] = useState('你好，这是 Python 后端的语音合成测试。');
  const [selectedVoice, setSelectedVoice] = useState('female-shaonv');
  const [selectedImageModel, setSelectedImageModel] = useState('');
  const [selectedVideoModel, setSelectedVideoModel] = useState('');

  // 更新后端地址
  const handleUpdateBackend = () => {
    setPythonApiBaseUrl(backendUrl);
  };

  // 生成图片
  const handleGenerateImage = () => {
    if (!selectedImageModel) return;
    imageMutation.mutate({
      model: selectedImageModel,
      prompt: imagePrompt,
      project_id: projectId,
      task_class: '图片生成',
      describe: imagePrompt.slice(0, 50),
    });
  };

  // 生成视频
  const handleGenerateVideo = () => {
    if (!selectedVideoModel) return;
    videoMutation.mutate({
      model: selectedVideoModel,
      prompt: videoPrompt,
      project_id: projectId,
      task_class: '视频生成',
      describe: videoPrompt.slice(0, 50),
    });
  };

  // 生成语音
  const handleGenerateTTS = () => {
    ttsMutation.mutate({
      model: '4:minimax-tts',
      text: ttsText,
      voice_id: selectedVoice,
      project_id: projectId,
      task_class: '语音合成',
      describe: ttsText.slice(0, 50),
    });
  };

  const voices = voicesData?.data?.voices || [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Server className="h-8 w-8" />
            Python 后端集成演示
          </h1>
          <p className="text-muted-foreground mt-1">
            FiveDesigner 前端与 Python 后端的集成演示
          </p>
        </div>
        <Badge variant={isHealthy ? 'default' : 'destructive'} className="text-sm">
          <Activity className="h-4 w-4 mr-1" />
          {healthLoading ? '检查中...' : isHealthy ? '后端在线' : '后端离线'}
        </Badge>
      </div>

      {/* 配置卡片 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            后端配置
          </CardTitle>
          <CardDescription>配置 Python 后端连接信息</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>后端地址</Label>
              <Input
                value={backendUrl}
                onChange={(e) => setBackendUrl(e.target.value)}
                placeholder="http://localhost:8000"
              />
            </div>
            <div className="space-y-2">
              <Label>项目 ID</Label>
              <Input
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="demo-project"
              />
            </div>
          </div>
          <Button onClick={handleUpdateBackend}>更新配置</Button>
        </CardContent>
      </Card>

      {/* 生成测试标签页 */}
      <Tabs defaultValue="image" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="image" className="flex items-center gap-2">
            <Image className="h-4 w-4" />
            图片生成
          </TabsTrigger>
          <TabsTrigger value="video" className="flex items-center gap-2">
            <Video className="h-4 w-4" />
            视频生成
          </TabsTrigger>
          <TabsTrigger value="tts" className="flex items-center gap-2">
            <Mic className="h-4 w-4" />
            语音合成
          </TabsTrigger>
        </TabsList>

        {/* 图片生成 */}
        <TabsContent value="image">
          <Card>
            <CardHeader>
              <CardTitle>图片生成测试</CardTitle>
              <CardDescription>使用 Python 后端生成图片</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>选择模型</Label>
                <Select value={selectedImageModel} onValueChange={setSelectedImageModel}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择图片生成模型" />
                  </SelectTrigger>
                  <SelectContent>
                    {imageModels?.data?.models.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name} ({model.vendor_name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>提示词</Label>
                <Textarea
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  rows={3}
                />
              </div>
              <Button
                onClick={handleGenerateImage}
                disabled={imageMutation.isPending || !selectedImageModel}
              >
                {imageMutation.isPending ? '生成中...' : '生成图片'}
              </Button>
              {imageMutation.data?.data?.success && (
                <div className="mt-4">
                  <p className="text-sm text-green-600 mb-2">生成成功！</p>
                  <img
                    src={`data:image/png;base64,${imageMutation.data.data.file_path}`}
                    alt="Generated"
                    className="max-w-md rounded-lg border"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 视频生成 */}
        <TabsContent value="video">
          <Card>
            <CardHeader>
              <CardTitle>视频生成测试</CardTitle>
              <CardDescription>使用 Python 后端生成视频</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>选择模型</Label>
                <Select value={selectedVideoModel} onValueChange={setSelectedVideoModel}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择视频生成模型" />
                  </SelectTrigger>
                  <SelectContent>
                    {videoModels?.data?.models.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name} ({model.vendor_name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>提示词</Label>
                <Textarea
                  value={videoPrompt}
                  onChange={(e) => setVideoPrompt(e.target.value)}
                  rows={3}
                />
              </div>
              <Button
                onClick={handleGenerateVideo}
                disabled={videoMutation.isPending || !selectedVideoModel}
              >
                {videoMutation.isPending ? '生成中...' : '生成视频'}
              </Button>
              {videoMutation.data?.data?.success && (
                <div className="mt-4">
                  <p className="text-sm text-green-600 mb-2">生成成功！</p>
                  <video
                    src={`data:video/mp4;base64,${videoMutation.data.data.file_path}`}
                    controls
                    className="max-w-md rounded-lg border"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 语音合成 */}
        <TabsContent value="tts">
          <Card>
            <CardHeader>
              <CardTitle>语音合成测试</CardTitle>
              <CardDescription>使用 Python 后端生成语音</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>选择音色</Label>
                <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择音色" />
                  </SelectTrigger>
                  <SelectContent>
                    {voices.map((voice) => (
                      <SelectItem key={voice.voice_id} value={voice.voice_id}>
                        {voice.name} ({voice.gender === 'male' ? '男' : voice.gender === 'female' ? '女' : '中性'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>文本内容</Label>
                <Textarea
                  value={ttsText}
                  onChange={(e) => setTtsText(e.target.value)}
                  rows={3}
                />
              </div>
              <Button
                onClick={handleGenerateTTS}
                disabled={ttsMutation.isPending}
              >
                {ttsMutation.isPending ? '生成中...' : '生成语音'}
              </Button>
              {ttsMutation.data?.data?.success && (
                <div className="mt-4">
                  <p className="text-sm text-green-600 mb-2">生成成功！</p>
                  <audio
                    src={`data:audio/mp3;base64,${ttsMutation.data.data.file_path}`}
                    controls
                    className="w-full max-w-md"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 任务管理 */}
      <TaskManager projectId={projectId} />
    </div>
  );
}
