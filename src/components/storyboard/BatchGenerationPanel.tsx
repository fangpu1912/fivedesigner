﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { useState, useCallback, useEffect, useRef, useMemo } from 'react';

import { Play, Pause, SkipForward, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

import { VendorModelSelector } from '@/components/ai/VendorModelSelector';
import { ComfyUIParamsPanel, type ComfyUIParams } from '@/components/ai/ComfyUIParamsPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { Storyboard, Character } from '@/types';
import { getWorkflowConfigs } from '@/services/workflowConfigService';
import { getComfyUIServerUrl } from '@/services/configService';
import { ComfyUIClient } from '@/services/comfyui/ComfyUIClient';
import type { WorkflowConfig } from '@/types';
import { useToast } from '@/hooks/useToast';
import { useProjectQuery } from '@/hooks/useProjects';
import type { GenerationResult } from '@/types/generation';
import { useTaskQueueStore } from '@/store/useTaskQueueStore';

type ItemType = 'storyboard' | 'character' | 'scene' | 'prop';

interface BatchItem {
  id: string;
  name: string;
  description?: string;
  prompt?: string;
  image?: string | null;
  avatar?: string | null;
  thumbnail?: string | null;
  metadata?: Record<string, unknown>;
  scene_id?: string;
  character_ids?: string[];
  prop_ids?: string[];
}

interface BatchGenerationPanelProps {
  items: BatchItem[];
  type: ItemType;
  episodeId?: string;
  projectId?: string;
  onComplete?: (results: Map<string, GenerationResult>) => void;
  onCancel?: () => void;
}

interface BatchTask {
  itemId: string;
  itemName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  progress: number;
  result?: GenerationResult;
  error?: string;
}

type GenerationMode = 'ai' | 'comfyui';

export function BatchGenerationPanel({ items, type, episodeId, projectId, onComplete, onCancel }: BatchGenerationPanelProps) {
  const { toast } = useToast();
  const { data: currentProject } = useProjectQuery(projectId || '');
  const [tasks, setTasks] = useState<BatchTask[]>(() =>
    items.map((item) => ({
      itemId: item.id,
      itemName: item.name,
      status: 'pending',
      progress: 0,
    }))
  );
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const stopRef = useRef(false);

  // 模式选择
  const [generationMode, setGenerationMode] = useState<GenerationMode>('ai');

  // AI 模式
  const [selectedModelId, setSelectedModelId] = useState('');

  // ComfyUI 模式
  const [workflowConfigs, setWorkflowConfigs] = useState<WorkflowConfig[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('');
  const [comfyUIParams, setComfyUIParams] = useState<ComfyUIParams>({});
  const getComfyUIParamsRef = useRef<(() => ComfyUIParams) | null>(null);
  const comfyUIClientRef = useRef<ComfyUIClient | null>(null);

  // 获取当前选中的工作流
  const selectedWorkflow = useMemo(() => {
    return workflowConfigs.find(w => w.id === selectedWorkflowId) || null;
  }, [workflowConfigs, selectedWorkflowId]);

  // 加载工作流配置
  useEffect(() => {
    const loadWorkflows = async () => {
      try {
        const configs = await getWorkflowConfigs();
        setWorkflowConfigs(configs);
        if (configs.length > 0 && !selectedWorkflowId) {
          setSelectedWorkflowId(configs[0]!.id);
        }
      } catch (error) {
        console.error('Failed to load workflow configs:', error);
      }
    };
    loadWorkflows();
  }, []);

  // 初始化 ComfyUI 客户端
  useEffect(() => {
    if (generationMode === 'comfyui') {
      try {
        const serverUrl = getComfyUIServerUrl();
        if (serverUrl) {
          comfyUIClientRef.current = new ComfyUIClient({ 
            serverUrl,
            projectId: projectId,
            episodeId: episodeId,
          });
        } else {
          toast({
            title: 'ComfyUI 未配置',
            description: '请在全局设置中配置 ComfyUI 服务器地址',
            variant: 'destructive',
          });
        }
      } catch (error) {
        console.error('Failed to init ComfyUI client:', error);
        toast({
          title: 'ComfyUI 连接失败',
          description: '请检查 ComfyUI 服务器设置',
          variant: 'destructive',
        });
      }
    }
  }, [generationMode, toast]);

  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const failedCount = tasks.filter((t) => t.status === 'failed').length;
  const skippedCount = tasks.filter((t) => t.status === 'skipped').length;
  const totalProgress = tasks.length > 0
    ? Math.round((completedCount + failedCount + skippedCount) / tasks.length * 100)
    : 0;

  // 当前正在运行的任务索引
  const currentIndex = tasks.findIndex((t) => t.status === 'running');

  const getItemPrompt = (item: BatchItem): string => {
    // 简化：仅使用 prompt 字段，没有提示词返回空字符串
    return item.prompt || '';
  };

  // 监听全局任务队列状态，同步更新本地 UI
  useEffect(() => {
    if (!isRunning) return

    const interval = setInterval(() => {
      const allQueueTasks = useTaskQueueStore.getState().tasks

      // 找到属于当前批次的任务
      setTasks(prev => prev.map((localTask, idx) => {
        const item = items[idx]
        if (!item) return localTask // 如果 item 不存在，保持原状态
        
        const queueTask = allQueueTasks.find((qt: any) =>
          qt.metadata?.item?.id === item.id && qt.type === 'batch_operation'
        )

        if (!queueTask) return localTask

        return {
          ...localTask,
          status: queueTask.status === 'completed' ? 'completed' :
                  queueTask.status === 'failed' ? 'failed' :
                  queueTask.status === 'cancelled' ? 'failed' :
                  queueTask.status === 'running' ? 'running' : 'pending',
          progress: queueTask.progress,
          error: queueTask.errorMessage,
          result: queueTask.result,
        }
      }))

      // 检查是否全部完成
      const allDone = tasks.every(t =>
        t.status === 'completed' || t.status === 'failed' || t.status === 'skipped'
      )
      if (allDone && tasks.length > 0) {
        setIsRunning(false)
        const results = new Map<string, GenerationResult>()
        tasks.forEach(t => {
          if (t.result) results.set(t.itemId, t.result)
        })
        onComplete?.(results)
      }
    }, 500)

    return () => clearInterval(interval)
  }, [isRunning, items, tasks, onComplete])

  const handleStart = useCallback(async () => {
    setIsRunning(true)
    setIsPaused(false)
    stopRef.current = false

    // 重置所有任务状态
    setTasks(prev => prev.map(t => ({ ...t, status: 'pending', progress: 0, error: undefined })))

    // 将所有任务添加到全局队列
    const { useTaskQueueStore } = await import('@/store/useTaskQueueStore')

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!
      if (!item) continue

      useTaskQueueStore.getState().addTask({
        type: 'batch_operation',
        name: item.name || `批量生成 #${i + 1}`,
        metadata: {
          item,
          type,
          generationMode,
          modelId: selectedModelId,
          workflowId: selectedWorkflowId,
          params: comfyUIParams,
          projectId,
          episodeId,
        },
      })
    }

    toast({ title: `已添加 ${items.length} 个任务到队列` })
  }, [items, type, generationMode, selectedModelId, selectedWorkflowId, comfyUIParams, projectId, episodeId]);

  const handlePause = useCallback(() => {
    useTaskQueueStore.getState().pauseQueue()
    setIsPaused(true)
  }, [])

  const handleResume = useCallback(() => {
    useTaskQueueStore.getState().resumeQueue()
    setIsPaused(false)
  }, [])

  const handleStop = useCallback(() => {
    // 取消所有属于当前批次的任务
    const allTasks = useTaskQueueStore.getState().tasks
    allTasks.forEach((task: any) => {
      if (task.type === 'batch_operation' && task.status === 'pending') {
        useTaskQueueStore.getState().cancelTask(task.id)
      }
    })
    stopRef.current = true
    setIsRunning(false)
    setIsPaused(false)
  }, [])

  const handleSkip = useCallback((itemId: string) => {
    const allTasks = useTaskQueueStore.getState().tasks
    const task = allTasks.find((t: any) => t.metadata?.item?.id === itemId && t.type === 'batch_operation')
    if (task && task.status === 'pending') {
      useTaskQueueStore.getState().cancelTask(task.id)
    }
  }, [])

  const handleComplete = () => {
    const results = new Map<string, GenerationResult>();
    tasks.forEach((task) => {
      if (task.result) {
        results.set(task.itemId, task.result);
      }
    });
    onComplete?.(results);
  };

  const getStatusIcon = (status: BatchTask['status']) => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'skipped':
        return <SkipForward className="h-4 w-4 text-muted-foreground" />;
      default:
        return null;
    }
  };

  const getStatusText = (status: BatchTask['status']) => {
    switch (status) {
      case 'running':
        return '生成中';
      case 'completed':
        return '已完成';
      case 'failed':
        return '失败';
      case 'skipped':
        return '已跳过';
      default:
        return '待生成';
    }
  };

  const getTypeLabel = () => {
    switch (type) {
      case 'storyboard': return '分镜';
      case 'character': return '角色';
      case 'scene': return '场景';
      case 'prop': return '道具';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>批量生成{getTypeLabel()}</span>
          <span className="text-sm font-normal text-muted-foreground">
            {completedCount}/{tasks.length} 已完成
            {failedCount > 0 && ` · ${failedCount} 失败`}
            {skippedCount > 0 && ` · ${skippedCount} 跳过`}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 模式选择 */}
        <Tabs value={generationMode} onValueChange={(v) => setGenerationMode(v as GenerationMode)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="ai">AI 模型</TabsTrigger>
            <TabsTrigger value="comfyui">ComfyUI</TabsTrigger>
          </TabsList>

          <TabsContent value="ai" className="space-y-4 mt-4">
            <VendorModelSelector
              type="image"
              value={selectedModelId}
              onChange={(_vendorId, _modelName, fullValue) => {
                setSelectedModelId(fullValue);
              }}
            />
          </TabsContent>

          <TabsContent value="comfyui" className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">工作流</label>
              <select
                value={selectedWorkflowId}
                onChange={(e) => setSelectedWorkflowId(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                disabled={workflowConfigs.length === 0}
              >
                {workflowConfigs.length === 0 ? (
                  <option value="">暂无工作流配置</option>
                ) : (
                  workflowConfigs.map((config) => (
                    <option key={config.id} value={config.id}>
                      {config.name}
                    </option>
                  ))
                )}
              </select>
              {workflowConfigs.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  请在全局设置中配置 ComfyUI 工作流
                </p>
              )}
            </div>

            {/* ComfyUI 参数面板 */}
            <ComfyUIParamsPanel
              workflow={selectedWorkflow}
              params={comfyUIParams}
              project={currentProject}
              onParamsReady={(getParams) => {
                getComfyUIParamsRef.current = getParams;
              }}
              onChange={setComfyUIParams}
            />
          </TabsContent>
        </Tabs>

        {/* 进度 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>总体进度</span>
            <span>{totalProgress}%</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${totalProgress}%` }}
            />
          </div>
        </div>

        {/* 控制按钮 */}
        <div className="flex items-center gap-2">
          {!isRunning && (
            <Button
              onClick={handleStart}
              className="flex-1"
              disabled={generationMode === 'comfyui' && (!selectedWorkflowId || !comfyUIClientRef.current)}
            >
              <Play className="h-4 w-4 mr-2" />
              开始生成
            </Button>
          )}
          {isRunning && !isPaused && (
            <>
              <Button onClick={handlePause} variant="secondary" className="flex-1">
                <Pause className="h-4 w-4 mr-2" />
                暂停
              </Button>
              <Button
                onClick={() => {
                  const runningTask = tasks.find(t => t.status === 'running')
                  if (runningTask) handleSkip(runningTask.itemId)
                }}
                variant="outline"
                size="icon"
                title="跳过当前"
              >
                <SkipForward className="h-4 w-4" />
              </Button>
              <Button onClick={handleStop} variant="destructive" size="icon" title="停止">
                <AlertCircle className="h-4 w-4" />
              </Button>
            </>
          )}
          {isRunning && isPaused && (
            <>
              <Button onClick={handleResume} className="flex-1">
                <Play className="h-4 w-4 mr-2" />
                继续
              </Button>
              <Button onClick={handleStop} variant="destructive" size="icon" title="停止">
                <AlertCircle className="h-4 w-4" />
              </Button>
            </>
          )}
          {!isRunning && (
            <Button variant="outline" onClick={onCancel}>
              取消
            </Button>
          )}
        </div>

        {/* 当前任务信息 */}
        {isRunning && currentIndex >= 0 && currentIndex < tasks.length && (
          <div className="p-3 bg-primary/5 rounded-lg">
            <div className="text-sm font-medium">当前生成: {tasks[currentIndex]?.itemName}</div>
            <div className="text-xs text-muted-foreground mt-1">
              第 {currentIndex + 1} / {tasks.length} 个
            </div>
          </div>
        )}

        {/* 任务列表 */}
        <div className="border rounded-lg divide-y max-h-[300px] overflow-y-auto">
          {tasks.map((task, index) => (
            <div
              key={task.itemId}
              className={cn(
                'flex items-center gap-3 p-3',
                index === currentIndex && isRunning && 'bg-primary/5',
                task.status === 'running' && 'bg-primary/5'
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{task.itemName}</div>
                <div className="text-xs text-muted-foreground">
                  {getStatusText(task.status)}
                  {task.error && ` - ${task.error}`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {task.status === 'running' && (
                  <span className="text-sm text-muted-foreground">{task.progress}%</span>
                )}
                {getStatusIcon(task.status)}
              </div>
            </div>
          ))}
        </div>

        {(completedCount + failedCount + skippedCount === tasks.length) && completedCount > 0 && (
          <div className="flex items-center justify-between p-4 bg-secondary rounded-lg">
            <div>
              <div className="font-medium">批量生成完成</div>
              <div className="text-sm text-muted-foreground">
                成功: {completedCount}
                {failedCount > 0 && ` · 失败: ${failedCount}`}
                {skippedCount > 0 && ` · 跳过: ${skippedCount}`}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleComplete}>确认</Button>
              <Button variant="outline" onClick={onCancel}>关闭</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
