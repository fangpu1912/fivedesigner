import { useState } from 'react'
import { GitCompare, ArrowLeft, ArrowRight, Plus, Minus, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { comparePrompts } from '@/utils/promptAnalyzer'

interface PromptDiffViewerProps {
  oldVersion: {
    content: string
    timestamp: number
    label: string
  }
  newVersion: {
    content: string
    timestamp: number
    label: string
  }
  onClose?: () => void
}

interface DiffLine {
  type: 'unchanged' | 'added' | 'removed'
  content: string
  lineNumber: {
    old?: number
    new?: number
  }
}

export function PromptDiffViewer({ oldVersion, newVersion, onClose }: PromptDiffViewerProps) {
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('split')
  const [showUnchanged, setShowUnchanged] = useState(true)

  // 计算差异
  const computeDiff = (): DiffLine[] => {
    const oldLines = oldVersion.content.split('\n')
    const newLines = newVersion.content.split('\n')
    const diff: DiffLine[] = []

    let oldIndex = 0
    let newIndex = 0

    while (oldIndex < oldLines.length || newIndex < newLines.length) {
      const oldLine = oldLines[oldIndex]
      const newLine = newLines[newIndex]

      if (oldIndex >= oldLines.length) {
        // 新增行
        diff.push({
          type: 'added',
          content: newLine || '',
          lineNumber: { new: newIndex + 1 },
        })
        newIndex++
      } else if (newIndex >= newLines.length) {
        // 删除行
        diff.push({
          type: 'removed',
          content: oldLine || '',
          lineNumber: { old: oldIndex + 1 },
        })
        oldIndex++
      } else if (oldLine === newLine) {
        // 未改变
        diff.push({
          type: 'unchanged',
          content: oldLine || '',
          lineNumber: { old: oldIndex + 1, new: newIndex + 1 },
        })
        oldIndex++
        newIndex++
      } else {
        // 修改行 - 简化为删除旧行，添加新行
        diff.push({
          type: 'removed',
          content: oldLine || '',
          lineNumber: { old: oldIndex + 1 },
        })
        diff.push({
          type: 'added',
          content: newLine || '',
          lineNumber: { new: newIndex + 1 },
        })
        oldIndex++
        newIndex++
      }
    }

    return diff
  }

  const diff = computeDiff()
  const filteredDiff = showUnchanged ? diff : diff.filter(line => line.type !== 'unchanged')

  // 计算统计
  const stats = {
    added: diff.filter(line => line.type === 'added').length,
    removed: diff.filter(line => line.type === 'removed').length,
    unchanged: diff.filter(line => line.type === 'unchanged').length,
  }

  // 分析变量变化
  const variableChanges = comparePrompts(oldVersion.content, newVersion.content)

  return (
    <div className="space-y-4">
      {/* 头部信息 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <GitCompare className="h-5 w-5" />
              版本对比
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === 'split' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('split')}
              >
                分栏
              </Button>
              <Button
                variant={viewMode === 'unified' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('unified')}
              >
                合并
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowUnchanged(!showUnchanged)}
              >
                {showUnchanged ? '隐藏未变更' : '显示未变更'}
              </Button>
              {onClose && (
                <Button variant="ghost" size="sm" onClick={onClose}>
                  关闭
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* 版本信息 */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="p-3 bg-red-50 rounded-md">
              <div className="text-sm font-medium text-red-700 flex items-center gap-1">
                <ArrowLeft className="h-4 w-4" />
                {oldVersion.label}
              </div>
              <div className="text-xs text-red-600 mt-1">
                {new Date(oldVersion.timestamp).toLocaleString()}
              </div>
            </div>
            <div className="p-3 bg-green-50 rounded-md">
              <div className="text-sm font-medium text-green-700 flex items-center gap-1">
                <ArrowRight className="h-4 w-4" />
                {newVersion.label}
              </div>
              <div className="text-xs text-green-600 mt-1">
                {new Date(newVersion.timestamp).toLocaleString()}
              </div>
            </div>
          </div>

          {/* 统计信息 */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <Plus className="h-4 w-4 text-green-500" />
              <span>新增 {stats.added} 行</span>
            </div>
            <div className="flex items-center gap-1">
              <Minus className="h-4 w-4 text-red-500" />
              <span>删除 {stats.removed} 行</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">未变更 {stats.unchanged} 行</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 变量变化 */}
      {(variableChanges.added.length > 0 ||
        variableChanges.removed.length > 0 ||
        variableChanges.modified.length > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">变量变化</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {variableChanges.added.length > 0 && (
                <div className="flex items-start gap-2">
                  <Plus className="h-4 w-4 text-green-500 mt-0.5" />
                  <div>
                    <span className="text-sm text-muted-foreground">新增变量:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {variableChanges.added.map(v => (
                        <Badge key={v} variant="default" className="text-xs bg-green-500">
                          {v}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {variableChanges.removed.length > 0 && (
                <div className="flex items-start gap-2">
                  <Minus className="h-4 w-4 text-red-500 mt-0.5" />
                  <div>
                    <span className="text-sm text-muted-foreground">删除变量:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {variableChanges.removed.map(v => (
                        <Badge key={v} variant="destructive" className="text-xs">
                          {v}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {variableChanges.modified.length > 0 && (
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5" />
                  <div>
                    <span className="text-sm text-muted-foreground">使用变化:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {variableChanges.modified.map(v => (
                        <Badge key={v} variant="secondary" className="text-xs">
                          {v}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 差异对比 */}
      <Card className="flex-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">内容对比</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            {viewMode === 'split' ? (
              // 分栏视图
              <div className="grid grid-cols-2 gap-0 text-sm font-mono">
                {/* 旧版本 */}
                <div className="border-r">
                  <div className="bg-red-50 px-3 py-1 text-xs font-medium text-red-700 sticky top-0">
                    {oldVersion.label}
                  </div>
                  <div>
                    {diff.map((line, index) => (
                      <div
                        key={`old-${index}`}
                        className={cn(
                          'px-3 py-0.5 flex',
                          line.type === 'removed' && 'bg-red-100',
                          line.type === 'added' && 'opacity-30'
                        )}
                      >
                        <span className="text-muted-foreground w-8 text-right mr-3 select-none">
                          {line.lineNumber.old || ''}
                        </span>
                        <span className="flex-1">{line.content || ' '}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 新版本 */}
                <div>
                  <div className="bg-green-50 px-3 py-1 text-xs font-medium text-green-700 sticky top-0">
                    {newVersion.label}
                  </div>
                  <div>
                    {diff.map((line, index) => (
                      <div
                        key={`new-${index}`}
                        className={cn(
                          'px-3 py-0.5 flex',
                          line.type === 'added' && 'bg-green-100',
                          line.type === 'removed' && 'opacity-30'
                        )}
                      >
                        <span className="text-muted-foreground w-8 text-right mr-3 select-none">
                          {line.lineNumber.new || ''}
                        </span>
                        <span className="flex-1">{line.content || ' '}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              // 合并视图
              <div className="text-sm font-mono">
                {filteredDiff.map((line, index) => (
                  <div
                    key={index}
                    className={cn(
                      'px-3 py-0.5 flex',
                      line.type === 'added' && 'bg-green-100',
                      line.type === 'removed' && 'bg-red-100'
                    )}
                  >
                    <span className="text-muted-foreground w-16 text-right mr-3 select-none">
                      {line.lineNumber.old || line.lineNumber.new || ''}
                    </span>
                    <span className="w-6 text-center">
                      {line.type === 'added' && '+'}
                      {line.type === 'removed' && '-'}
                      {line.type === 'unchanged' && ' '}
                    </span>
                    <span className="flex-1">{line.content || ' '}</span>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
