/**
 * Agent 消息气泡组件
 */

import { Bot, User, Clock } from 'lucide-react';

import type { AgentChatMessageProps } from '@/plugins/vimax/types';

export function AgentChatMessage({ message, onAction }: AgentChatMessageProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isSystem) {
    return (
      <div className="flex justify-center my-3">
        <div className="px-3 py-1.5 bg-muted rounded-full text-xs text-muted-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      {/* Content */}
      <div className={`flex-1 ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm ${
            isUser
              ? 'bg-primary text-primary-foreground rounded-br-md'
              : 'bg-muted rounded-bl-md'
          }`}
        >
          <div className="whitespace-pre-wrap">{message.content}</div>

          {/* Action Buttons */}
          {message.metadata?.actions && Array.isArray(message.metadata.actions) && (
            <div className="flex flex-wrap gap-2 mt-2">
              {(message.metadata.actions as Array<{ label: string; action: string; payload?: unknown }>).map(
                (action, idx) => (
                  <button
                    key={`action-${idx}`}
                    onClick={() => onAction?.(action.action, action.payload)}
                    className="px-3 py-1 text-xs bg-background/20 hover:bg-background/30 rounded-full transition-colors"
                  >
                    {action.label}
                  </button>
                )
              )}
            </div>
          ) ? true : false}
        </div>

        {/* Timestamp */}
        <div className="flex items-center gap-1 mt-1 px-1">
          <Clock className="w-3 h-3 text-muted-foreground/60" />
          <span className="text-[10px] text-muted-foreground/60">
            {formatTime(message.timestamp)}
          </span>
        </div>
      </div>
    </div>
  );
}
