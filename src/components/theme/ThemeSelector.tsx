import { useState } from 'react'

import { Check, Palette, Monitor, Moon, Sun, Sparkles, GlassWater, Minimize2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { themes, useThemeStore } from '@/store/useThemeStore'

const categoryIcons = {
  light: Sun,
  dark: Moon,
  special: Sparkles,
}

const categoryNames = {
  light: '浅色主题',
  dark: '深色主题',
  special: '特色主题',
}

export function ThemeSelector() {
  const {
    currentTheme,
    radius,
    fontSize,
    compactMode,
    animationsEnabled,
    glassEffects,
    setTheme,
    setRadius,
    setFontSize,
    setCompactMode,
    setAnimationsEnabled,
    setGlassEffects,
  } = useThemeStore()

  const [open, setOpen] = useState(false)

  const groupedThemes = themes.reduce(
    (acc, theme) => {
      if (!acc[theme.category]) {
        acc[theme.category] = []
      }
      acc[theme.category]!.push(theme)
      return acc
    },
    {} as Record<string, typeof themes>
  )

  const radiusLabels = {
    none: '无',
    sm: '小',
    md: '中',
    lg: '大',
    xl: '超大',
    full: '全圆',
  }

  const fontSizeLabels = {
    sm: '小',
    base: '中',
    lg: '大',
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Palette className="h-5 w-5" />
          <span className="sr-only">切换主题</span>
        </Button>
      </DialogTrigger>
      <DialogContent
        describedBy="theme-dialog-description"
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            主题设置
          </DialogTitle>
          <p id="theme-dialog-description" className="text-sm text-muted-foreground">
            选择你喜欢的主题和外观设置
          </p>
        </DialogHeader>

        <Tabs defaultValue="themes" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="themes">主题选择</TabsTrigger>
            <TabsTrigger value="appearance">外观设置</TabsTrigger>
          </TabsList>

          <TabsContent value="themes" className="space-y-4 mt-4">
            {Object.entries(groupedThemes).map(([category, categoryThemes]) => {
              const Icon = categoryIcons[category as keyof typeof categoryIcons]
              return (
                <div key={category} className="space-y-2">
                  <h3 className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                    <Icon className="h-4 w-4" />
                    {categoryNames[category as keyof typeof categoryNames]}
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    {categoryThemes.map(theme => (
                      <button
                        key={theme.id}
                        onClick={() => setTheme(theme.id)}
                        className={cn(
                          'relative group flex flex-col items-center p-3 rounded-lg border-2 transition-all duration-200',
                          'hover:scale-[1.02] hover:shadow-md',
                          currentTheme === theme.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        )}
                      >
                        <div
                          className="w-full h-12 rounded-md mb-2 shadow-inner"
                          style={{ background: theme.preview }}
                        />
                        <span className="text-sm font-medium">{theme.name}</span>
                        <span className="text-xs text-muted-foreground text-center line-clamp-1">
                          {theme.description}
                        </span>
                        {currentTheme === theme.id && (
                          <div className="absolute top-2 right-2">
                            <div className="bg-primary text-primary-foreground rounded-full p-0.5">
                              <Check className="h-3 w-3" />
                            </div>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </TabsContent>

          <TabsContent value="appearance" className="space-y-6 mt-4">
            {/* 圆角设置 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Monitor className="h-4 w-4" />
                  圆角大小
                </Label>
                <span className="text-sm text-muted-foreground">{radiusLabels[radius]}</span>
              </div>
              <div className="flex gap-2">
                {(['none', 'sm', 'md', 'lg', 'xl', 'full'] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setRadius(r)}
                    className={cn(
                      'flex-1 py-2 px-1 rounded-md text-xs font-medium transition-all',
                      radius === r
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted hover:bg-muted/80'
                    )}
                  >
                    {radiusLabels[r]}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                {(['none', 'sm', 'md', 'lg', 'xl', 'full'] as const).map(r => (
                  <div
                    key={r}
                    className={cn(
                      'flex-1 h-8 bg-primary/20',
                      r === 'none' && 'rounded-none',
                      r === 'sm' && 'rounded-sm',
                      r === 'md' && 'rounded-md',
                      r === 'lg' && 'rounded-lg',
                      r === 'xl' && 'rounded-xl',
                      r === 'full' && 'rounded-full'
                    )}
                  />
                ))}
              </div>
            </div>

            {/* 字体大小 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <span className="text-sm font-bold">A</span>
                  字体大小
                </Label>
                <span className="text-sm text-muted-foreground">{fontSizeLabels[fontSize]}</span>
              </div>
              <div className="flex gap-2">
                {(['sm', 'base', 'lg'] as const).map(size => (
                  <button
                    key={size}
                    onClick={() => setFontSize(size)}
                    className={cn(
                      'flex-1 py-2 px-4 rounded-md font-medium transition-all',
                      fontSize === size
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted hover:bg-muted/80',
                      size === 'sm' && 'text-xs',
                      size === 'base' && 'text-sm',
                      size === 'lg' && 'text-base'
                    )}
                  >
                    {fontSizeLabels[size]}
                  </button>
                ))}
              </div>
            </div>

            {/* 功能开关 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="flex items-center gap-2">
                    <Minimize2 className="h-4 w-4" />
                    紧凑模式
                  </Label>
                  <p className="text-xs text-muted-foreground">减小元素间距，显示更多内容</p>
                </div>
                <Switch checked={compactMode} onCheckedChange={setCompactMode} />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    动画效果
                  </Label>
                  <p className="text-xs text-muted-foreground">启用界面过渡动画</p>
                </div>
                <Switch checked={animationsEnabled} onCheckedChange={setAnimationsEnabled} />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="flex items-center gap-2">
                    <GlassWater className="h-4 w-4" />
                    玻璃效果
                  </Label>
                  <p className="text-xs text-muted-foreground">启用毛玻璃背景效果</p>
                </div>
                <Switch checked={glassEffects} onCheckedChange={setGlassEffects} />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* 预览区域 */}
        <div className="mt-4 p-4 rounded-lg bg-muted/50 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">预览</p>
          <div className="flex items-center gap-2">
            <Button size="sm">主要按钮</Button>
            <Button size="sm" variant="secondary">
              次要按钮
            </Button>
            <Button size="sm" variant="outline">
              边框按钮
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary" />
            <div className="h-8 w-8 rounded-md bg-secondary" />
            <div className="h-8 w-8 rounded-md bg-accent" />
            <div className="h-8 w-8 rounded-md bg-muted" />
            <div className="h-8 w-8 rounded-md bg-destructive" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
