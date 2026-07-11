/**
 * 激活服务
 * - 获取机器码
 * - 检查激活状态
 * - 激活验证
 * - 检查过期
 */
import { invoke } from '@tauri-apps/api/core'
import { secureStorage } from '@/services/secureStorage'
import { activationDB } from '@/db'
import type { ActivationStatus } from '@/types'

const ACTIVATION_KEY = 'activation_status'

/**
 * 获取机器码
 * 通过 Tauri 命令调用 Rust 的 machine-id 库
 */
export async function getMachineId(): Promise<string> {
  try {
    const machineId = await invoke<string>('get_machine_id')
    return machineId
  } catch (error) {
    console.error('Failed to get machine ID:', error)
    // Fallback: 使用时间戳 + 随机数作为临时 ID(不推荐,但避免完全无法使用)
    return `fallback_${Date.now()}_${Math.random().toString(36).slice(2)}`
  }
}

/**
 * 获取当前激活状态
 * 从 SecureStore 读取
 */
export async function getActivationStatus(): Promise<ActivationStatus | null> {
  try {
    const statusStr = await secureStorage.get(ACTIVATION_KEY)
    if (!statusStr) return null
    return JSON.parse(statusStr) as ActivationStatus
  } catch (error) {
    console.error('Failed to get activation status:', error)
    return null
  }
}

/**
 * 保存激活状态到 SecureStore
 */
export async function saveActivationStatus(status: ActivationStatus): Promise<void> {
  try {
    await secureStorage.set(ACTIVATION_KEY, JSON.stringify(status))
  } catch (error) {
    console.error('Failed to save activation status:', error)
    throw error
  }
}

/**
 * 清除激活状态
 */
export async function clearActivationStatus(): Promise<void> {
  try {
    await secureStorage.delete(ACTIVATION_KEY)
  } catch (error) {
    console.error('Failed to clear activation status:', error)
    throw error
  }
}

/**
 * 检查激活状态是否有效(未过期)
 */
export function isActivationValid(status: ActivationStatus | null): boolean {
  if (!status || !status.activated) return false
  if (!status.expires_at) return false

  const expiresAt = new Date(status.expires_at)
  const now = new Date()
  return expiresAt > now
}

/**
 * 获取剩余有效天数
 */
export function getRemainingDays(status: ActivationStatus | null): number {
  if (!status || !status.activated || !status.expires_at) return 0

  const expiresAt = new Date(status.expires_at)
  const now = new Date()
  const diffMs = expiresAt.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  return Math.max(0, diffDays)
}

/**
 * 激活验证流程
 * 1. 获取机器码
 * 2. 查找激活码
 * 3. 检查是否已使用
 * 4. 检查机器码匹配(如果已使用)
 * 5. 标记为已使用,绑定机器码
 * 6. 计算过期时间
 * 7. 保存激活状态
 */
export async function activate(code: string): Promise<{
  success: boolean
  message: string
  expiresAt?: string
  remainingDays?: number
}> {
  try {
    // 1. 获取机器码
    const machineId = await getMachineId()

    // 2. 查找激活码
    const activationCode = await activationDB.get(code)
    if (!activationCode) {
      return { success: false, message: '激活码不存在' }
    }

    // 3. 检查是否已使用
    if (activationCode.used === 1) {
      // 4. 检查机器码匹配
      if (activationCode.machine_id !== machineId) {
        return { success: false, message: '激活码已被其他电脑使用' }
      }
      // 同一机器,检查是否过期
      if (activationCode.expires_at) {
        const expiresAt = new Date(activationCode.expires_at)
        const now = new Date()
        if (expiresAt > now) {
          // 仍在有效期内,重新保存激活状态
          const status: ActivationStatus = {
            activated: true,
            code,
            machine_id: machineId,
            activated_at: activationCode.activated_at,
            expires_at: activationCode.expires_at,
          }
          await saveActivationStatus(status)
          return {
            success: true,
            message: '激活成功',
            expiresAt: activationCode.expires_at,
            remainingDays: getRemainingDays(status),
          }
        } else {
          return { success: false, message: '激活码已过期' }
        }
      }
    }

    // 5. 标记为已使用,绑定机器码
    const now = new Date()
    const expiresAt = new Date(now.getTime() + activationCode.valid_days * 24 * 60 * 60 * 1000)

    await activationDB.update(code, {
      used: 1,
      machine_id: machineId,
      activated_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    })

    // 6. 保存激活状态
    const status: ActivationStatus = {
      activated: true,
      code,
      machine_id: machineId,
      activated_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    }
    await saveActivationStatus(status)

    return {
      success: true,
      message: '激活成功',
      expiresAt: expiresAt.toISOString(),
      remainingDays: activationCode.valid_days,
    }
  } catch (error) {
    console.error('Activation failed:', error)
    return { success: false, message: `激活失败: ${(error as Error).message}` }
  }
}

/**
 * 检查并自动恢复激活状态
 * 用于应用启动时检查
 */
export async function checkAndRestoreActivation(): Promise<ActivationStatus | null> {
  const status = await getActivationStatus()

  // 未激活
  if (!status || !status.activated) {
    return null
  }

  // 已过期
  if (!isActivationValid(status)) {
    return null
  }

  // 检查机器码是否匹配(防止复制激活状态到其他电脑)
  const currentMachineId = await getMachineId()
  if (status.machine_id !== currentMachineId) {
    // 机器码不匹配,清除激活状态
    await clearActivationStatus()
    return null
  }

  return status
}

/**
 * 生成随机激活码
 * 用于管理员批量生成
 */
export function generateRandomCode(length: number = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

/**
 * 批量生成激活码
 */
export async function batchGenerateCodes(
  count: number,
  validDays: number,
  codeLength: number = 16
): Promise<Array<{ code: string; valid_days: number }>> {
  const codes: Array<{ code: string; valid_days: number }> = []
  for (let i = 0; i < count; i++) {
    codes.push({
      code: generateRandomCode(codeLength),
      valid_days: validDays,
    })
  }
  await activationDB.batchCreate(codes)
  return codes
}