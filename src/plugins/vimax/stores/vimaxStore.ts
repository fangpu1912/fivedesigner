/**
 * ViMax 插件状态管理（Zustand）
 * 仅管理插件 UI 状态，不存储项目数据
 */

import { create } from 'zustand';

import type {
  ViMaxStoreState,
  AgentType,
  AgentMessage,
  PipelineState,
  PipelineStep,
} from '@/plugins/vimax/types';

export const useViMaxStore = create<ViMaxStoreState>((set) => ({
  // ==================== Agent 状态 ====================
  activeAgents: [],
  agentMessages: {
    screenwriter: [],
    characterExtractor: [],
    storyboardArtist: [],
    cameraPlanner: [],
    characterPortrait: [],
    referenceImageSelector: [],
  },
  isAgentRunning: false,

  // ==================== Pipeline 状态 ====================
  activePipeline: null,
  pipelineHistory: [],
  isPipelineRunning: false,

  // ==================== UI 状态 ====================
  isPanelOpen: false,
  activeTab: 'chat',
  selectedAgent: null,

  // ==================== 操作 ====================

  setPanelOpen: (open: boolean) => set({ isPanelOpen: open }),

  setActiveTab: (tab: 'agents' | 'pipelines' | 'chat') => set({ activeTab: tab }),

  setSelectedAgent: (agent: AgentType | null) => set({ selectedAgent: agent }),

  addAgentMessage: (agentType: AgentType, message: AgentMessage) =>
    set((state) => ({
      agentMessages: {
        ...state.agentMessages,
        [agentType]: [...(state.agentMessages[agentType] || []), message],
      },
    })),

  clearAgentMessages: (agentType: AgentType) =>
    set((state) => ({
      agentMessages: {
        ...state.agentMessages,
        [agentType]: [],
      },
    })),

  setActivePipeline: (pipeline: PipelineState | null) => set({ activePipeline: pipeline }),

  updatePipelineStep: (stepId: string, updates: Partial<PipelineStep>) =>
    set((state) => {
      if (!state.activePipeline) return state;

      const updatedSteps = state.activePipeline.steps.map((step) =>
        step.id === stepId ? { ...step, ...updates } : step
      );

      return {
        activePipeline: {
          ...state.activePipeline,
          steps: updatedSteps,
        },
      };
    }),

  addPipelineToHistory: (pipeline: PipelineState) =>
    set((state) => ({
      pipelineHistory: [pipeline, ...state.pipelineHistory].slice(0, 50), // 最多保留 50 条历史
    })),

  setIsAgentRunning: (running: boolean) => set({ isAgentRunning: running }),

  setIsPipelineRunning: (running: boolean) => set({ isPipelineRunning: running }),
}));
