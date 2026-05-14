import { Paintbrush, Eraser, Wand2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import type { AIBrushType } from '../types'

interface AIEditToolbarProps {
  aiBrushType: AIBrushType
  aiBrushSize: number
  aiPrompt: string
  isAiProcessing: boolean
  onBrushTypeChange: (type: AIBrushType) => void
  onBrushSizeChange: (size: number) => void
  onPromptChange: (prompt: string) => void
  onClearMask: () => void
  onApply: () => void
}

export function AIEditToolbar({
  aiBrushType,
  aiBrushSize,
  aiPrompt,
  isAiProcessing,
  onBrushTypeChange,
  onBrushSizeChange,
  onPromptChange,
  onClearMask,
  onApply,
}: AIEditToolbarProps) {
  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-4 bg-background/95 backdrop-blur-sm rounded-xl px-4 py-4 shadow-xl border min-w-[380px] max-w-[480px]">
      {/* 画笔工具 */}
      <div className="flex items-center gap-2">
        <Button
          variant={aiBrushType === 'brush' ? 'default' : 'outline'}
          size="sm"
          className="flex-1 gap-2"
          onClick={() => onBrushTypeChange('brush')}
        >
          <Paintbrush className="h-4 w-4" />
          画笔
        </Button>
        <Button
          variant={aiBrushType === 'eraser' ? 'default' : 'outline'}
          size="sm"
          className="flex-1 gap-2"
          onClick={() => onBrushTypeChange('eraser')}
        >
          <Eraser className="h-4 w-4" />
          橡皮擦
        </Button>
        <Button variant="ghost" size="sm" onClick={onClearMask}>
          清除蒙版
        </Button>
      </div>

      {/* 画笔大小 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">画笔大小</span>
          <span className="text-xs text-muted-foreground">{aiBrushSize}px</span>
        </div>
        <Slider
          value={[aiBrushSize]}
          onValueChange={(v) => onBrushSizeChange(v[0] ?? 30)}
          min={5}
          max={100}
          step={1}
          className="w-full"
        />
      </div>

      {/* 提示词输入 */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">修改提示词</span>
        <Textarea
          placeholder="描述你想要修改的内容，例如：将背景改成森林、添加一只猫、改变衣服颜色为红色..."
          value={aiPrompt}
          onChange={(e) => onPromptChange(e.target.value)}
          className="min-h-[80px] resize-none"
        />
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            onPromptChange('')
            onClearMask()
          }}
        >
          重置
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={onApply}
          disabled={isAiProcessing || !aiPrompt.trim()}
        >
          {isAiProcessing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
              处理中...
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4 mr-1" />
              应用编辑
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
