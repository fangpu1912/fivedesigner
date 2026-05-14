import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeType =
  | 'default'
  | 'dark'
  | 'midnight'
  | 'forest'
  | 'sunset'
  | 'rose'
  | 'cyberpunk'
  | 'glass'
  | 'minimal'

export interface ThemeConfig {
  id: ThemeType
  name: string
  description: string
  preview: string
  category: 'light' | 'dark' | 'special'
}

export const themes: ThemeConfig[] = [
  {
    id: 'default',
    name: '默认',
    description: '经典蓝白配色，简洁专业',
    preview: 'linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)',
    category: 'light',
  },
  {
    id: 'dark',
    name: '深色',
    description: '护眼深色模式，适合夜间使用',
    preview: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    category: 'dark',
  },
  {
    id: 'midnight',
    name: '午夜',
    description: '深邃紫蓝，神秘优雅',
    preview: 'linear-gradient(135deg, #4c1d95 0%, #1e1b4b 100%)',
    category: 'dark',
  },
  {
    id: 'forest',
    name: '森林',
    description: '清新绿色，自然舒适',
    preview: 'linear-gradient(135deg, #22c55e 0%, #15803d 100%)',
    category: 'light',
  },
  {
    id: 'sunset',
    name: '日落',
    description: '温暖橙色，活力满满',
    preview: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
    category: 'light',
  },
  {
    id: 'rose',
    name: '玫瑰',
    description: '浪漫粉色，温柔优雅',
    preview: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
    category: 'light',
  },
  {
    id: 'cyberpunk',
    name: '赛博朋克',
    description: '霓虹光效，未来科技',
    preview: 'linear-gradient(135deg, #ff00ff 0%, #00ffff 100%)',
    category: 'special',
  },
  {
    id: 'glass',
    name: '玻璃',
    description: '毛玻璃效果，现代通透',
    preview: 'linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.4) 100%)',
    category: 'special',
  },
  {
    id: 'minimal',
    name: '极简',
    description: '黑白极简，纯粹设计',
    preview: 'linear-gradient(135deg, #000000 0%, #ffffff 100%)',
    category: 'light',
  },
]

interface ThemeState {
  currentTheme: ThemeType
  radius: 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full'
  fontSize: 'sm' | 'base' | 'lg'
  compactMode: boolean
  animationsEnabled: boolean
  glassEffects: boolean
  setTheme: (theme: ThemeType) => void
  setRadius: (radius: ThemeState['radius']) => void
  setFontSize: (size: ThemeState['fontSize']) => void
  setCompactMode: (enabled: boolean) => void
  setAnimationsEnabled: (enabled: boolean) => void
  setGlassEffects: (enabled: boolean) => void
  toggleTheme: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      currentTheme: 'default',
      radius: 'md',
      fontSize: 'base',
      compactMode: false,
      animationsEnabled: true,
      glassEffects: false,

      setTheme: theme => {
        set({ currentTheme: theme })
        document.documentElement.setAttribute('data-theme', theme)
      },

      setRadius: radius => {
        set({ radius })
        const radiusMap = {
          none: '0rem',
          sm: '0.25rem',   // 4px
          md: '0.5rem',    // 8px
          lg: '0.75rem',   // 12px
          xl: '1rem',      // 16px
          full: '9999px',
        }
        const radiusValue = radiusMap[radius]
        document.documentElement.style.setProperty('--radius', radiusValue)
        // Tailwind v4 uses --radius-lg, --radius-md, --radius-sm
        document.documentElement.style.setProperty('--radius-lg', radiusValue)
        document.documentElement.style.setProperty('--radius-md', `calc(${radiusValue} - 0.125rem)`)
        document.documentElement.style.setProperty('--radius-sm', `calc(${radiusValue} - 0.25rem)`)
      },

      setFontSize: fontSize => {
        set({ fontSize })
        const fontSizeMap = {
          sm: '14px',
          base: '16px',
          lg: '18px',
        }
        const sizeValue = fontSizeMap[fontSize]
        document.documentElement.style.setProperty('--font-size-base', sizeValue)
        // Also set html font-size to affect rem units
        document.documentElement.style.fontSize = sizeValue
      },

      setCompactMode: enabled => {
        set({ compactMode: enabled })
        document.documentElement.setAttribute('data-compact', String(enabled))
      },
      setAnimationsEnabled: enabled => set({ animationsEnabled: enabled }),
      setGlassEffects: enabled => {
        set({ glassEffects: enabled })
        document.documentElement.setAttribute('data-glass-effects', String(enabled))
      },

      toggleTheme: () => {
        const { currentTheme } = get()
        const newTheme = currentTheme === 'default' ? 'dark' : 'default'
        get().setTheme(newTheme)
      },
    }),
    {
      name: 'fivedesigner-theme',
      onRehydrateStorage: () => state => {
        if (state) {
          document.documentElement.setAttribute('data-theme', state.currentTheme)
          // Apply radius and font size directly without calling setters to avoid circular issues
          const radiusMap = {
            none: '0rem',
            sm: '0.25rem',
            md: '0.5rem',
            lg: '0.75rem',
            xl: '1rem',
            full: '9999px',
          }
          const radiusValue = radiusMap[state.radius]
          document.documentElement.style.setProperty('--radius', radiusValue)
          document.documentElement.style.setProperty('--radius-lg', radiusValue)
          document.documentElement.style.setProperty('--radius-md', `calc(${radiusValue} - 0.125rem)`)
          document.documentElement.style.setProperty('--radius-sm', `calc(${radiusValue} - 0.25rem)`)

          const fontSizeMap = {
            sm: '14px',
            base: '16px',
            lg: '18px',
          }
          const sizeValue = fontSizeMap[state.fontSize]
          document.documentElement.style.setProperty('--font-size-base', sizeValue)
          document.documentElement.style.fontSize = sizeValue

          // Apply compact mode and glass effects
          document.documentElement.setAttribute('data-compact', String(state.compactMode))
          document.documentElement.setAttribute('data-glass-effects', String(state.glassEffects))
        }
      },
    }
  )
)
