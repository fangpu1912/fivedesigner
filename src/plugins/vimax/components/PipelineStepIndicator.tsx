/**
 * Pipeline 步骤指示器
 */

import React from 'react';

import { CheckCircle, Loader2, AlertCircle, Circle } from 'lucide-react';

import type { PipelineStepIndicatorProps, PipelineStep } from '@/plugins/vimax/types';

const stepStatusConfig: Record<
  PipelineStep['status'],
  { icon: React.ReactNode; color: string }
> = {
  pending: {
    icon: <Circle className="w-4 h-4" />,
    color: 'text-muted-foreground/40',
  },
  running: {
    icon: <Loader2 className="w-4 h-4 animate-spin" />,
    color: 'text-primary',
  },
  completed: {
    icon: <CheckCircle className="w-4 h-4" />,
    color: 'text-green-500',
  },
  error: {
    icon: <AlertCircle className="w-4 h-4" />,
    color: 'text-red-500',
  },
  skipped: {
    icon: <Circle className="w-4 h-4" />,
    color: 'text-muted-foreground/40',
  },
};

export function PipelineStepIndicator({
  steps,
  currentStepIndex,
  onStepClick,
}: PipelineStepIndicatorProps) {
  return (
    <div className="flex items-center">
      {steps.map((step, index) => {
        const config = stepStatusConfig[step.status];
        const isActive = index === currentStepIndex;
        const isLast = index === steps.length - 1;

        return (
          <React.Fragment key={step.id}>
            {/* Step Node */}
            <div
              className={`flex flex-col items-center cursor-pointer transition-opacity hover:opacity-80 ${
                isActive ? 'opacity-100' : 'opacity-70'
              }`}
              onClick={() => onStepClick?.(index)}
              title={step.name}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors ${
                  isActive
                    ? 'border-primary bg-primary/10'
                    : step.status === 'completed'
                    ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
                    : step.status === 'error'
                    ? 'border-red-500 bg-red-50 dark:bg-red-950/20'
                    : 'border-muted-foreground/30 bg-background'
                }`}
              >
                <span className={config.color}>{config.icon}</span>
              </div>
              <span
                className={`text-[10px] mt-1 max-w-[60px] text-center truncate ${
                  isActive ? 'text-primary font-medium' : 'text-muted-foreground'
                }`}
              >
                {step.name}
              </span>
            </div>

            {/* Connector */}
            {!isLast && (
              <div className="flex-1 h-0.5 mx-1 bg-muted-foreground/20 relative">
                <div
                  className="absolute top-0 left-0 h-full bg-primary transition-all duration-500"
                  style={{
                    width:
                      index < currentStepIndex
                        ? '100%'
                        : index === currentStepIndex
                        ? `${steps[index]?.progress || 0}%`
                        : '0%',
                  }}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
