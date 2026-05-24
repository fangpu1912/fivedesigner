/**
 * Pipeline 执行器 UI
 */

import { X, CheckCircle, AlertCircle, Loader2, RotateCcw, Square } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { PipelineExecutorProps, PipelineStep } from '@/plugins/vimax/types';

import { PipelineStepIndicator } from './PipelineStepIndicator';

const statusIcons: Record<PipelineStep['status'], React.ReactNode> = {
  pending: <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />,
  running: <Loader2 className="w-4 h-4 animate-spin text-primary" />,
  completed: <CheckCircle className="w-4 h-4 text-green-500" />,
  error: <AlertCircle className="w-4 h-4 text-red-500" />,
  skipped: <div className="w-4 h-4 rounded-full border-2 border-dashed border-muted-foreground/30" />,
};

const statusLabels: Record<PipelineStep['status'], string> = {
  pending: '等待中',
  running: '执行中',
  completed: '已完成',
  error: '错误',
  skipped: '已跳过',
};

export function PipelineExecutor({ pipeline, onCancel, onRetry }: PipelineExecutorProps) {
  const overallProgress =
    pipeline.steps.length > 0
      ? pipeline.steps.reduce((sum, step) => sum + step.progress, 0) / pipeline.steps.length
      : 0;

  const currentStep = pipeline.steps[pipeline.currentStepIndex];

  return (
    <div className="flex-1 flex flex-col">
      {/* Pipeline Header */}
      <div className="px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">{pipeline.config.name}</h3>
            <p className="text-xs text-muted-foreground">{pipeline.config.description}</p>
          </div>
          <div className="flex items-center gap-1">
            {pipeline.status === 'running' && (
              <Button variant="ghost" size="icon" className="w-8 h-8" onClick={onCancel}>
                <Square className="w-4 h-4" />
              </Button>
            )}
            {(pipeline.status === 'completed' || pipeline.status === 'error') && (
              <Button variant="ghost" size="icon" className="w-8 h-8" onClick={onRetry}>
                <RotateCcw className="w-4 h-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={onCancel}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Overall Progress */}
        <div className="mt-3">
          <div className="flex justify-between text-xs mb-1">
            <span>总进度</span>
            <span>{Math.round(overallProgress)}%</span>
          </div>
          <Progress value={overallProgress} className="h-2" />
        </div>
      </div>

      {/* Step Indicator */}
      <div className="px-4 py-2 border-b">
        <PipelineStepIndicator
          steps={pipeline.steps}
          currentStepIndex={pipeline.currentStepIndex}
        />
      </div>

      {/* Step Details */}
      <ScrollArea className="flex-1 px-4 py-2">
        <div className="space-y-2">
          {pipeline.steps.map((step, index) => (
            <StepItem
              key={step.id}
              step={step}
              index={index}
              isActive={index === pipeline.currentStepIndex}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Current Step Info */}
      {currentStep && pipeline.status === 'running' && (
        <div className="px-4 py-3 border-t bg-muted/30">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="text-sm font-medium">{currentStep.name}</span>
            <span className="text-xs text-muted-foreground">
              {Math.round(currentStep.progress)}%
            </span>
          </div>
          <Progress value={currentStep.progress} className="h-1 mt-2" />
        </div>
      )}

      {/* Error Info */}
      {pipeline.status === 'error' && pipeline.error && (
        <div className="px-4 py-3 border-t bg-red-50 dark:bg-red-950/20">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5" />
            <div>
              <div className="text-sm font-medium text-red-600 dark:text-red-400">执行出错</div>
              <div className="text-xs text-red-500/80 mt-0.5">{pipeline.error}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepItem({
  step,
  index,
  isActive,
}: {
  step: PipelineStep;
  index: number;
  isActive: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
        isActive
          ? 'bg-primary/5 border-primary/20'
          : step.status === 'completed'
          ? 'bg-green-50/50 dark:bg-green-950/10 border-green-200/50'
          : step.status === 'error'
          ? 'bg-red-50/50 dark:bg-red-950/10 border-red-200/50'
          : 'bg-muted/20 border-transparent'
      }`}
    >
      <div className="flex-shrink-0">{statusIcons[step.status]}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">
            {index + 1}. {step.name}
          </span>
          <span className="text-xs text-muted-foreground">{statusLabels[step.status]}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
        {step.status === 'running' && (
          <Progress value={step.progress} className="h-1 mt-2" />
        )}
        {step.error && (
          <p className="text-xs text-red-500 mt-1">{step.error}</p>
        )}
      </div>
    </div>
  );
}
