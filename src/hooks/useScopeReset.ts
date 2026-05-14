import { type DependencyList, useEffect, useRef } from 'react'

interface UseScopeResetOptions {
  skipInitial?: boolean
}

export function useScopeReset(
  reset: () => void,
  deps: DependencyList,
  options: UseScopeResetOptions = {}
) {
  const { skipInitial = false } = options
  const isFirstRun = useRef(true)

  useEffect(() => {
    if (skipInitial && isFirstRun.current) {
      isFirstRun.current = false
      return
    }

    isFirstRun.current = false
    reset()
  }, deps)
}
