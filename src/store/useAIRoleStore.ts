/**
 * AI角色切换Store
 * 管理AI角色的选择、系统提示词和多轮对话状态
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { type AIRole, allAIRoles, getRoleById, categoryLabels } from '@/config/aiRoles'

interface AIRoleState {
  // 当前选中的角色ID
  selectedRoleId: string | null
  // 是否启用角色系统提示词
  useRoleSystemPrompt: boolean
  // 是否启用多轮输出
  enableMultiRound: boolean
  // 当前多轮对话状态
  multiRoundState: {
    isActive: boolean
    currentRound: number
    maxRounds: number
    accumulatedContent: string
    lastResponseHadContinue: boolean
  }
  // 自定义系统提示词（覆盖角色默认）
  customSystemPrompt: string | null
  // 最近使用的角色列表
  recentRoles: string[]
}

interface AIRoleActions {
  // 选择角色
  selectRole: (roleId: string | null) => void
  // 切换是否使用角色系统提示词
  setUseRoleSystemPrompt: (use: boolean) => void
  // 切换多轮输出
  setEnableMultiRound: (enable: boolean) => void
  // 设置自定义系统提示词
  setCustomSystemPrompt: (prompt: string | null) => void
  // 重置多轮对话状态
  resetMultiRoundState: () => void
  // 更新多轮对话状态
  updateMultiRoundState: (update: Partial<AIRoleState['multiRoundState']>) => void
  // 添加到最近使用
  addToRecent: (roleId: string) => void
  // 获取当前角色的系统提示词
  getCurrentSystemPrompt: () => string | null
  // 获取多轮输出后缀
  getMultiRoundSuffix: () => string | null
  // 检查是否需要继续（多轮）
  shouldContinue: (response: string) => boolean
  // 获取继续提示词
  getContinuePrompt: () => string
}

const initialMultiRoundState: AIRoleState['multiRoundState'] = {
  isActive: false,
  currentRound: 0,
  maxRounds: 5,
  accumulatedContent: '',
  lastResponseHadContinue: false,
}

export const useAIRoleStore = create<AIRoleState & AIRoleActions>()(
  persist(
    (set, get) => ({
      // 初始状态
      selectedRoleId: null,
      useRoleSystemPrompt: true,
      enableMultiRound: true,
      multiRoundState: { ...initialMultiRoundState },
      customSystemPrompt: null,
      recentRoles: [],

      // 选择角色
      selectRole: roleId => {
        set({ selectedRoleId: roleId })
        if (roleId) {
          get().addToRecent(roleId)
        }
        // 重置多轮状态
        get().resetMultiRoundState()
      },

      // 切换是否使用角色系统提示词
      setUseRoleSystemPrompt: use => {
        set({ useRoleSystemPrompt: use })
      },

      // 切换多轮输出
      setEnableMultiRound: enable => {
        set({ enableMultiRound: enable })
      },

      // 设置自定义系统提示词
      setCustomSystemPrompt: prompt => {
        set({ customSystemPrompt: prompt })
      },

      // 重置多轮对话状态
      resetMultiRoundState: () => {
        set({ multiRoundState: { ...initialMultiRoundState } })
      },

      // 更新多轮对话状态
      updateMultiRoundState: update => {
        set(state => ({
          multiRoundState: { ...state.multiRoundState, ...update },
        }))
      },

      // 添加到最近使用
      addToRecent: roleId => {
        set(state => {
          const filtered = state.recentRoles.filter(id => id !== roleId)
          return {
            recentRoles: [roleId, ...filtered].slice(0, 5), // 保留最近5个
          }
        })
      },

      // 获取当前角色的系统提示词
      getCurrentSystemPrompt: () => {
        const { selectedRoleId, customSystemPrompt, useRoleSystemPrompt } = get()

        if (!useRoleSystemPrompt) {
          return null
        }

        if (customSystemPrompt) {
          return customSystemPrompt
        }

        if (selectedRoleId) {
          const role = getRoleById(selectedRoleId)
          return role?.systemPrompt || null
        }

        return null
      },

      // 获取多轮输出后缀
      getMultiRoundSuffix: () => {
        const { selectedRoleId, enableMultiRound } = get()

        if (!enableMultiRound || !selectedRoleId) {
          return null
        }

        const role = getRoleById(selectedRoleId)
        return role?.multiRoundSuffix || null
      },

      // 检查是否需要继续（多轮）
      shouldContinue: (response: string) => {
        const { enableMultiRound, multiRoundState } = get()

        if (!enableMultiRound) {
          return false
        }

        // 检查是否包含 [CONTINUE] 标记
        const hasContinue = response.includes('[CONTINUE]')

        // 检查是否已经达到最大轮数
        const canContinue = multiRoundState.currentRound < multiRoundState.maxRounds

        return hasContinue && canContinue
      },

      // 获取继续提示词
      getContinuePrompt: () => {
        return '请继续输出剩余内容，完成后添加 [END] 标记'
      },
    }),
    {
      name: 'ai-role-storage',
      partialize: state => ({
        selectedRoleId: state.selectedRoleId,
        useRoleSystemPrompt: state.useRoleSystemPrompt,
        enableMultiRound: state.enableMultiRound,
        customSystemPrompt: state.customSystemPrompt,
        recentRoles: state.recentRoles,
      }),
    }
  )
)

// 导出辅助函数
export { allAIRoles, getRoleById, categoryLabels }
export type { AIRole }
