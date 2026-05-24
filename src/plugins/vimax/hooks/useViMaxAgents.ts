/**
 * Agent 调用 Hook
 * 封装 Agent 的调用和消息管理
 */

import { useState, useCallback } from 'react';

import { v4 as uuidv4 } from 'uuid';

import {
  runScreenwriterAgent,
  runCharacterExtractorAgent,
  runStoryboardArtistAgent,
  runCameraPlannerAgent,
  runCharacterPortraitAgent,
  runReferenceImageSelectorAgent,
  type ScreenwriterInput,
  type CharacterExtractorInput,
  type StoryboardArtistInput,
  type CameraPlannerInput,
  type CharacterPortraitInput,
  type ReferenceImageInput,
} from '@/plugins/vimax/services/agents';
import { useViMaxStore } from '@/plugins/vimax/stores/vimaxStore';
import type {
  AgentType,
  AgentMessage,
  AgentContext,
  ViMaxScript,
  ViMaxCharacterInScene,
  ViMaxShotDescription,
} from '@/plugins/vimax/types';

export interface UseViMaxAgentsReturn {
  isRunning: boolean;
  error: string | null;
  messages: Record<AgentType, AgentMessage[]>;
  runScreenwriter: (input: ScreenwriterInput) => Promise<ViMaxScript>;
  runCharacterExtractor: (input: CharacterExtractorInput) => Promise<ViMaxCharacterInScene[]>;
  runStoryboardArtist: (input: StoryboardArtistInput) => Promise<ViMaxShotDescription[]>;
  runCameraPlanner: (input: CameraPlannerInput) => Promise<ViMaxShotDescription[]>;
  runCharacterPortrait: (input: CharacterPortraitInput) => Promise<string>;
  runReferenceImageSelector: (input: ReferenceImageInput) => Promise<string>;
  sendMessage: (agentType: AgentType, content: string) => void;
  clearMessages: (agentType: AgentType) => void;
}

export function useViMaxAgents(
  projectId: string,
  episodeId?: string
): UseViMaxAgentsReturn {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { agentMessages, addAgentMessage, clearAgentMessages, setIsAgentRunning } =
    useViMaxStore();

  const createAgentContext = useCallback((): AgentContext => {
    return {
      projectId,
      episodeId,
      messages: [],
      tools: [],
    };
  }, [projectId, episodeId]);

  const addMessage = useCallback(
    (agentType: AgentType, role: AgentMessage['role'], content: string, metadata?: Record<string, unknown>) => {
      const message: AgentMessage = {
        id: uuidv4(),
        agentType,
        role,
        content,
        timestamp: Date.now(),
        metadata,
      };
      addAgentMessage(agentType, message);
      return message;
    },
    [addAgentMessage]
  );

  const runScreenwriter = useCallback(
    async (input: ScreenwriterInput): Promise<ViMaxScript> => {
      setIsRunning(true);
      setError(null);
      setIsAgentRunning(true);

      try {
        addMessage('screenwriter', 'user', input.content);

        const context = createAgentContext();
        const result = await runScreenwriterAgent(input, context);

        addMessage(
          'screenwriter',
          'agent',
          `剧本生成完成：${result.script.title}\n\n共 ${result.script.scenes.length} 个场景，${result.script.characters.length} 个角色。`,
          { script: result.script }
        );

        return result.script;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '未知错误';
        setError(errorMessage);
        addMessage('screenwriter', 'system', `错误：${errorMessage}`);
        throw err;
      } finally {
        setIsRunning(false);
        setIsAgentRunning(false);
      }
    },
    [createAgentContext, addMessage, setIsAgentRunning]
  );

  const runCharacterExtractor = useCallback(
    async (input: CharacterExtractorInput): Promise<ViMaxCharacterInScene[]> => {
      setIsRunning(true);
      setError(null);
      setIsAgentRunning(true);

      try {
        addMessage('characterExtractor', 'user', '提取角色信息...');

        const result = await runCharacterExtractorAgent(input);

        addMessage(
          'characterExtractor',
          'agent',
          `角色提取完成，共 ${result.characters.length} 个角色。`,
          { characters: result.characters }
        );

        return result.characters;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '未知错误';
        setError(errorMessage);
        addMessage('characterExtractor', 'system', `错误：${errorMessage}`);
        throw err;
      } finally {
        setIsRunning(false);
        setIsAgentRunning(false);
      }
    },
    [addMessage, setIsAgentRunning]
  );

  const runStoryboardArtist = useCallback(
    async (input: StoryboardArtistInput): Promise<ViMaxShotDescription[]> => {
      setIsRunning(true);
      setError(null);
      setIsAgentRunning(true);

      try {
        addMessage('storyboardArtist', 'user', `为场景 "${input.scene.name}" 设计分镜...`);

        const context = createAgentContext();
        const result = await runStoryboardArtistAgent(input, context);

        addMessage(
          'storyboardArtist',
          'agent',
          `分镜设计完成，共 ${result.shots.length} 个镜头。`,
          { shots: result.shots }
        );

        return result.shots;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '未知错误';
        setError(errorMessage);
        addMessage('storyboardArtist', 'system', `错误：${errorMessage}`);
        throw err;
      } finally {
        setIsRunning(false);
        setIsAgentRunning(false);
      }
    },
    [createAgentContext, addMessage, setIsAgentRunning]
  );

  const runCameraPlanner = useCallback(
    async (input: CameraPlannerInput): Promise<ViMaxShotDescription[]> => {
      setIsRunning(true);
      setError(null);
      setIsAgentRunning(true);

      try {
        addMessage('cameraPlanner', 'user', '优化机位规划...');

        const result = await runCameraPlannerAgent(input);

        addMessage(
          'cameraPlanner',
          'agent',
          `机位规划完成，优化了 ${result.optimizedShots.length} 个镜头。`,
          { shots: result.optimizedShots }
        );

        return result.optimizedShots;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '未知错误';
        setError(errorMessage);
        addMessage('cameraPlanner', 'system', `错误：${errorMessage}`);
        throw err;
      } finally {
        setIsRunning(false);
        setIsAgentRunning(false);
      }
    },
    [addMessage, setIsAgentRunning]
  );

  const runCharacterPortrait = useCallback(
    async (input: CharacterPortraitInput): Promise<string> => {
      setIsRunning(true);
      setError(null);
      setIsAgentRunning(true);

      try {
        addMessage('characterPortrait', 'user', `为角色 "${input.character.name}" 生成肖像...`);

        const result = await runCharacterPortraitAgent(input);

        addMessage(
          'characterPortrait',
          'agent',
          `角色肖像生成完成。`,
          { portraitUrl: result.portraitUrl }
        );

        return result.portraitUrl;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '未知错误';
        setError(errorMessage);
        addMessage('characterPortrait', 'system', `错误：${errorMessage}`);
        throw err;
      } finally {
        setIsRunning(false);
        setIsAgentRunning(false);
      }
    },
    [createAgentContext, addMessage, setIsAgentRunning]
  );

  const runReferenceImageSelector = useCallback(
    async (input: ReferenceImageInput): Promise<string> => {
      setIsRunning(true);
      setError(null);
      setIsAgentRunning(true);

      try {
        addMessage('referenceImageSelector', 'user', `为场景 "${input.scene.name}" 生成参考图...`);

        const result = await runReferenceImageSelectorAgent(input);

        addMessage(
          'referenceImageSelector',
          'agent',
          `参考图生成完成。`,
          { referenceUrl: result.referenceUrl }
        );

        return result.referenceUrl;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '未知错误';
        setError(errorMessage);
        addMessage('referenceImageSelector', 'system', `错误：${errorMessage}`);
        throw err;
      } finally {
        setIsRunning(false);
        setIsAgentRunning(false);
      }
    },
    [addMessage, setIsAgentRunning]
  );

  const sendMessage = useCallback(
    (agentType: AgentType, content: string) => {
      addMessage(agentType, 'user', content);
      // TODO: 实现 Agent 对话逻辑
    },
    [addMessage]
  );

  return {
    isRunning,
    error,
    messages: agentMessages,
    runScreenwriter,
    runCharacterExtractor,
    runStoryboardArtist,
    runCameraPlanner,
    runCharacterPortrait,
    runReferenceImageSelector,
    sendMessage,
    clearMessages: clearAgentMessages,
  };
}
