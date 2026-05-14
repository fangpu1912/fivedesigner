/**
 * Python 后端任务管理组件
 * 显示和管理 AI 生成任务记录
 */

import { useState } from 'react';
import { RefreshCw, CheckCircle, XCircle, Loader2, Clock } from 'lucide-react';
import { usePythonTaskRecords, pythonQueryKeys } from '@/hooks/usePythonGeneration';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { TaskRecord } from '@/services/pythonApi';

interface TaskManagerProps {
  projectId: string;
}

/**
 * 任务状态徽章
 */
function TaskStatusBadge({ status }: { status: number }) {
  switch (status) {
    case 0:
      return (
        <Badge variant="outline" className="flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          进行中
        </Badge>
      );
    case 1:
      return (
        <Badge variant="default" className="flex items-center gap-1 bg-green-500">
          <CheckCircle className="h-3 w-3" />
          成功
        </Badge>
      );
    case -1:
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <XCircle className="h-3 w-3" />
          失败
        </Badge>
      );
    default:
      return <Badge variant="outline">未知</Badge>;
  }
}

/**
 * 任务类型徽章
 */
function TaskClassBadge({ taskClass }: { taskClass: string }) {
  const classMap: Record<string, string> = {
    '图片生成': 'bg-blue-500',
    '视频生成': 'bg-purple-500',
    '语音合成': 'bg-orange-500',
    '批量图片生成': 'bg-cyan-500',
    '批量语音合成': 'bg-pink-500',
  };

  const colorClass = classMap[taskClass] || 'bg-gray-500';

  return (
    <Badge className={`${colorClass} text-white`}>
      {taskClass}
    </Badge>
  );
}

/**
 * 格式化时间
 */
function formatTime(timeStr: string): string {
  if (!timeStr) return '-';
  const date = new Date(timeStr);
  return date.toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 计算耗时
 */
function calculateDuration(start: string, end?: string): string {
  if (!end) {
    // 计算从 start 到现在的时间
    const duration = Date.now() - new Date(start).getTime();
    return formatDuration(duration);
  }
  const duration = new Date(end).getTime() - new Date(start).getTime();
  return formatDuration(duration);
}

/**
 * 格式化时长
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * 任务管理组件
 */
export function TaskManager({ projectId }: TaskManagerProps) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = usePythonTaskRecords(projectId);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const tasks = data?.data?.tasks || [];

  // 手动刷新
  const handleRefresh = () => {
    queryClient.invalidateQueries({
      queryKey: pythonQueryKeys.taskRecords(projectId),
    });
  };

  // 切换自动刷新
  const toggleAutoRefresh = () => {
    setAutoRefresh(!autoRefresh);
    queryClient.setQueryDefaults(pythonQueryKeys.taskRecords(projectId), {
      refetchInterval: !autoRefresh ? 5000 : false,
    });
  };

  // 统计
  const stats = {
    total: tasks.length,
    pending: tasks.filter(t => t.status === 0).length,
    success: tasks.filter(t => t.status === 1).length,
    failed: tasks.filter(t => t.status === -1).length,
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>生成任务</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-red-500">
            <XCircle className="h-12 w-12 mx-auto mb-2" />
            <p>加载任务失败</p>
            <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
            <Button variant="outline" className="mt-4" onClick={handleRefresh}>
              重试
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>生成任务</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            共 {stats.total} 个任务
            {stats.pending > 0 && `，${stats.pending} 个进行中`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleAutoRefresh}
            className={autoRefresh ? 'text-green-600' : ''}
          >
            <Clock className="h-4 w-4 mr-1" />
            {autoRefresh ? '自动刷新中' : '已暂停'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-1" />
            刷新
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* 统计卡片 */}
        <div className="grid grid-cols-4 gap-4 mb-4">
          <div className="bg-muted rounded-lg p-3 text-center">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">总任务</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.pending}</div>
            <div className="text-xs text-blue-600/70">进行中</div>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{stats.success}</div>
            <div className="text-xs text-green-600/70">成功</div>
          </div>
          <div className="bg-red-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
            <div className="text-xs text-red-600/70">失败</div>
          </div>
        </div>

        {/* 任务列表 */}
        {tasks.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>暂无生成任务</p>
            <p className="text-sm">开始生成图片、视频或语音后，任务将显示在这里</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>类型</TableHead>
                  <TableHead>模型</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>描述</TableHead>
                  <TableHead>开始时间</TableHead>
                  <TableHead>耗时</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task: TaskRecord) => (
                  <TableRow key={task.id}>
                    <TableCell>
                      <TaskClassBadge taskClass={task.task_class} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {task.model}
                    </TableCell>
                    <TableCell>
                      <TaskStatusBadge status={task.status} />
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {task.describe}
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatTime(task.start_time)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {calculateDuration(task.start_time, task.end_time)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

export default TaskManager;
