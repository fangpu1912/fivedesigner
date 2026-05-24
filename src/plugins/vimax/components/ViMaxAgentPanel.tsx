/**
 * ViMax Agent 浮窗交互面板（主组件）
 * 复用 FD 的 AIChatFloatingButton 模式，扩展为支持 Pipeline 执行的可视化界面
 */

import { useState, useCallback, useRef, useEffect } from 'react';

import { X, Bot, Play, MessageSquare, Film, Users, Settings } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useViMaxStore } from '@/plugins/vimax/stores/vimaxStore';
import type {
  ViMaxAgentPanelProps,
  AgentType,
  PipelineType,
} from '@/plugins/vimax/types';

import { AgentChatMessage } from './AgentChatMessage';
import { PipelineExecutor } from './PipelineExecutor';

const agentIcons: Record<AgentType, React.ReactNode> = {
  screenwriter: <Film className="w-4 h-4" />,
  characterExtractor: <Users className="w-4 h-4" />,
  storyboardArtist: <Film className="w-4 h-4" />,
  cameraPlanner: <Settings className="w-4 h-4" />,
  characterPortrait: <Users className="w-4 h-4" />,
  referenceImageSelector: <Film className="w-4 h-4" />,
};

const agentNames: Record<AgentType, string> = {
  screenwriter: '编剧',
  characterExtractor: '角色提取',
  storyboardArtist: '分镜设计',
  cameraPlanner: '机位规划',
  characterPortrait: '角色肖像',
  referenceImageSelector: '参考图',
};

export function ViMaxAgentPanel({ projectId, episodeId, onClose }: ViMaxAgentPanelProps) {
  const {
    isPanelOpen,
    activeTab,
    selectedAgent,
    activePipeline,
    agentMessages,
    setActiveTab,
    setSelectedAgent,
  } = useViMaxStore();

  const [inputValue, setInputValue] = useState('');
  const [selectedPipeline, setSelectedPipeline] = useState<PipelineType>('idea2video');
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = selectedAgent ? agentMessages[selectedAgent] || [] : [];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = useCallback(() => {
    if (!inputValue.trim() || !selectedAgent) return;
    setInputValue('');
  }, [inputValue, selectedAgent]);

  const handleStartPipeline = useCallback(() => {
    // TODO: 实现 Pipeline 启动逻辑
  }, [selectedPipeline, projectId, episodeId]);

  if (!isPanelOpen) {
    return (
      <Button
        variant="default"
        size="icon"
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg z-50"
        onClick={() => useViMaxStore.getState().setPanelOpen(true)}
      >
        <Bot className="w-6 h-6" />
      </Button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-[480px] h-[640px] bg-background border rounded-xl shadow-2xl flex flex-col z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/50">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          <span className="font-semibold">ViMax AI 助手</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-3 mx-4 mt-2">
          <TabsTrigger value="chat">
            <MessageSquare className="w-4 h-4 mr-1" />
            对话
          </TabsTrigger>
          <TabsTrigger value="pipelines">
            <Play className="w-4 h-4 mr-1" />
            Pipeline
          </TabsTrigger>
          <TabsTrigger value="agents">
            <Bot className="w-4 h-4 mr-1" />
            Agents
          </TabsTrigger>
        </TabsList>

        {/* Chat Tab */}
        <TabsContent value="chat" className="flex-1 flex flex-col m-0 mt-2">
          {selectedAgent ? (
            <>
              <div className="px-4 py-2 border-b bg-muted/30">
                <div className="flex items-center gap-2">
                  {agentIcons[selectedAgent]}
                  <span className="text-sm font-medium">{agentNames[selectedAgent]}</span>
                </div>
              </div>
              <ScrollArea className="flex-1 px-4 py-2" ref={scrollRef}>
                <div className="space-y-4">
                  {messages.map((msg) => (
                    <AgentChatMessage key={msg.id} message={msg} />
                  ))}
                </div>
              </ScrollArea>
              <div className="p-3 border-t">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder={`与 ${agentNames[selectedAgent]} 对话...`}
                    className="flex-1 px-3 py-2 text-sm border rounded-md bg-background"
                  />
                  <Button size="sm" onClick={handleSendMessage}>
                    发送
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>选择一个 Agent 开始对话</p>
                <div className="flex flex-wrap gap-2 mt-4 justify-center">
                  {(Object.keys(agentNames) as AgentType[]).map((agent) => (
                    <Button
                      key={agent}
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedAgent(agent)}
                    >
                      {agentIcons[agent]}
                      <span className="ml-1">{agentNames[agent]}</span>
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Pipeline Tab */}
        <TabsContent value="pipelines" className="flex-1 flex flex-col m-0 mt-2">
          {activePipeline ? (
            <PipelineExecutor
              pipeline={activePipeline}
              onCancel={() => {
                // TODO: 取消 Pipeline
              }}
              onRetry={() => {
                // TODO: 重试 Pipeline
              }}
            />
          ) : (
            <div className="flex-1 p-4 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">选择 Pipeline</label>
                <div className="grid grid-cols-1 gap-2">
                  <Button
                    variant={selectedPipeline === 'idea2video' ? 'default' : 'outline'}
                    className="justify-start"
                    onClick={() => setSelectedPipeline('idea2video')}
                  >
                    <Play className="w-4 h-4 mr-2" />
                    创意 → 视频
                  </Button>
                  <Button
                    variant={selectedPipeline === 'novel2video' ? 'default' : 'outline'}
                    className="justify-start"
                    onClick={() => setSelectedPipeline('novel2video')}
                  >
                    <Play className="w-4 h-4 mr-2" />
                    小说 → 视频
                  </Button>
                  <Button
                    variant={selectedPipeline === 'script2video' ? 'default' : 'outline'}
                    className="justify-start"
                    onClick={() => setSelectedPipeline('script2video')}
                  >
                    <Play className="w-4 h-4 mr-2" />
                    剧本 → 视频
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">输入内容</label>
                <textarea
                  className="w-full h-32 px-3 py-2 text-sm border rounded-md bg-background resize-none"
                  placeholder="输入创意描述、小说内容或剧本..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                />
              </div>

              <Button className="w-full" onClick={handleStartPipeline} disabled={!inputValue.trim()}>
                <Play className="w-4 h-4 mr-2" />
                开始生成
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Agents Tab */}
        <TabsContent value="agents" className="flex-1 flex flex-col m-0 mt-2">
          <ScrollArea className="flex-1 px-4 py-2">
            <div className="space-y-2">
              {(Object.keys(agentNames) as AgentType[]).map((agent) => (
                <Button
                  key={agent}
                  variant={selectedAgent === agent ? 'default' : 'outline'}
                  className="w-full justify-start h-auto py-3"
                  onClick={() => {
                    setSelectedAgent(agent);
                    setActiveTab('chat');
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{agentIcons[agent]}</div>
                    <div className="text-left">
                      <div className="font-medium">{agentNames[agent]}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {getAgentDescription(agent)}
                      </div>
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function getAgentDescription(agent: AgentType): string {
  const descriptions: Record<AgentType, string> = {
    screenwriter: '将创意或小说转换为结构化剧本',
    characterExtractor: '从剧本中提取角色信息',
    storyboardArtist: '将场景转换为详细的分镜描述',
    cameraPlanner: '优化分镜的机位和镜头运动',
    characterPortrait: '为角色生成一致的肖像图片',
    referenceImageSelector: '为场景选择或生成参考图',
  };
  return descriptions[agent];
}
