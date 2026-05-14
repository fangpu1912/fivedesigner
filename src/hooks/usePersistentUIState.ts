import { useState, useCallback } from 'react'

/**
 * 持久化 UI 状态的 Hook
 * @param key - localStorage 的 key
 * @param defaultValue - 默认值
 * @returns [value, setValue] - 状态和设置函数
 */
export function usePersistentUIState<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      if (stored) {
        return JSON.parse(stored) as T
      }
    } catch (error) {
      console.error(`加载 UI 状态失败 [${key}]:`, error)
    }
    return defaultValue
  })

  const setPersistentState = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState(prev => {
        const newValue = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value
        try {
          localStorage.setItem(key, JSON.stringify(newValue))
        } catch (error) {
          console.error(`保存 UI 状态失败 [${key}]:`, error)
        }
        return newValue
      })
    },
    [key]
  )

  return [state, setPersistentState]
}

/**
 * 持久化多个 UI 状态的 Hook
 * @param key - localStorage 的 key
 * @param defaultValues - 默认状态对象
 * @returns { values, setValue, setValues } - 状态和设置函数
 */
export function usePersistentUIStates<T extends Record<string, unknown>>(
  key: string,
  defaultValues: T
): {
  values: T
  setValue: <K extends keyof T>(name: K, value: T[K]) => void
  setValues: (updates: Partial<T>) => void
} {
  const [values, setValuesState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      if (stored) {
        return { ...defaultValues, ...JSON.parse(stored) }
      }
    } catch (error) {
      console.error(`加载 UI 状态失败 [${key}]:`, error)
    }
    return defaultValues
  })

  const setValue = useCallback(
    <K extends keyof T>(name: K, value: T[K]) => {
      setValuesState(prev => {
        const newValues = { ...prev, [name]: value }
        try {
          localStorage.setItem(key, JSON.stringify(newValues))
        } catch (error) {
          console.error(`保存 UI 状态失败 [${key}]:`, error)
        }
        return newValues
      })
    },
    [key]
  )

  const setValues = useCallback(
    (updates: Partial<T>) => {
      setValuesState(prev => {
        const newValues = { ...prev, ...updates }
        try {
          localStorage.setItem(key, JSON.stringify(newValues))
        } catch (error) {
          console.error(`保存 UI 状态失败 [${key}]:`, error)
        }
        return newValues
      })
    },
    [key]
  )

  return { values, setValue, setValues }
}
