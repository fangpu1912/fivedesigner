import { useEffect } from 'react'

import { useThemeStore } from '@/store/useThemeStore'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { currentTheme, radius, fontSize, compactMode, animationsEnabled, glassEffects } =
    useThemeStore()

  useEffect(() => {
    // 应用主题
    document.documentElement.setAttribute('data-theme', currentTheme)
    document.documentElement.setAttribute('data-compact', compactMode ? 'true' : 'false')
    document.documentElement.setAttribute('data-glass-effects', glassEffects ? 'true' : 'false')

    // 应用圆角
    const radiusMap = {
      none: '0px',
      sm: '4px',
      md: '8px',
      lg: '12px',
      xl: '16px',
      full: '9999px',
    }
    document.documentElement.style.setProperty('--radius', radiusMap[radius])

    // 应用字体大小
    const fontSizeMap = {
      sm: '14px',
      base: '16px',
      lg: '18px',
    }
    document.documentElement.style.setProperty('--font-size-base', fontSizeMap[fontSize])

    // 应用动画设置
    if (!animationsEnabled) {
      document.documentElement.style.setProperty('--transition-fast', '0ms')
      document.documentElement.style.setProperty('--transition-normal', '0ms')
      document.documentElement.style.setProperty('--transition-slow', '0ms')
    } else {
      document.documentElement.style.setProperty(
        '--transition-fast',
        '150ms cubic-bezier(0.4, 0, 0.2, 1)'
      )
      document.documentElement.style.setProperty(
        '--transition-normal',
        '250ms cubic-bezier(0.4, 0, 0.2, 1)'
      )
      document.documentElement.style.setProperty(
        '--transition-slow',
        '350ms cubic-bezier(0.4, 0, 0.2, 1)'
      )
    }
  }, [currentTheme, radius, fontSize, compactMode, animationsEnabled, glassEffects])

  return <>{children}</>
}
