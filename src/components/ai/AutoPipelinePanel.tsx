import { CheckCircle, Loader2, XCircle, Pause, Play, AlertTriangle, Image, Video, Music, FileText, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import type { AutoPipelineState } from '@/services/autoPipelineService'

interface AutoPipelinePanelProps {
  state: AutoPipelineState
  isRunning: boolean
  isWaitingForReview: boolean
  onApprove: (reviewId: string, approved: boolean) => void
  onCancel: () => void
}

const PHASE_STEPS = [
  { key: 'text_pipeline', label: '剧本分析', icon: FileText, percentRange: [0, 40] },
  { key: 'review_storyboard', label: '分镜审核', icon: Pause, percentRange: [40, 45] },
  { key: 'generating_images', label: '图片生成', icon: Image, percentRange: [45, 60] },
  { key: 'review_first_frame', label: '首帧审核', icon: Pause, percentRange: [60, 65] },
  { key: 'generating_videos', label: '视频生成', icon: Video, percentRange: [65, 80] },
  { key: 'generating_dubbing', label: '配音生成', icon: Music, percentRange: [85, 95] },
  { key: 'composing', label: '样片合成', icon: Play, percentRange: [95, 100] },
]

function getStepStatus(phase: AutoPipelineState['phase'], stepKey: string): 'completed' | 'active' | 'pending' | 'review' {
  const phaseOrder = PHASE_STEPS.map(s => s.key)
  const currentIdx = phaseOrder.indexOf(phase)
  const stepIdx = phaseOrder.indexOf(stepKey)

  if (stepKey === 'review_storyboard' && phase === 'review_storyboard') return 'review'
  if (stepKey === 'review_first_frame' && phase === 'review_first_frame') return 'review'
  if (phase === 'completed') return 'completed'
  if (stepIdx < currentIdx) return 'completed'
  if (stepIdx === currentIdx) return 'active'
  return 'pending'
}

export function AutoPipelinePanel({ state, isRunning, isWaitingForReview, onApprove, onCancel }: AutoPipelinePanelProps) {
  if (state.phase === 'idle') return null

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            {state.phase === 'completed' ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : state.phase === 'failed' ? (
              <XCircle className="h-5 w-5 text-destructive" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            )}
            全自动流水线
          </CardTitle>
          {isRunning && !isWaitingForReview && (
            <Button variant="destructive" size="sm" onClick={onCancel}>
              取消
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{state.message}</span>
            <span className="font-medium">{state.percent}%</span>
          </div>
          <Progress value={state.percent} className="h-2" />
        </div>

        <div className="space-y-1">
          {PHASE_STEPS.map((step) => {
            const status = getStepStatus(state.phase, step.key)
            const Icon = step.icon

            return (
              <div
                key={step.key}
                className={cn(
                  'flex items-center gap-2 text-sm py-1.5 px-2 rounded-md',
                  status === 'active' && 'bg-primary/10 text-primary font-medium',
                  status === 'completed' && 'text-muted-foreground',
                  status === 'review' && 'bg-yellow-500/10 text-yellow-700',
                  status === 'pending' && 'text-muted-foreground/50',
                )}
              >
                {status === 'completed' && <CheckCircle className="h-4 w-4 text-green-500" />}
                {status === 'active' && <Loader2 className="h-4 w-4 animate-spin" />}
                {status === 'review' && <AlertTriangle className="h-4 w-4" />}
                {status === 'pending' && <div className="h-4 w-4 rounded-full border border-muted-foreground/30" />}
                <Icon className="h-3.5 w-3.5" />
                <span className="flex-1">{step.label}</span>
                {status === 'active' && step.key === 'generating_images' && state.storyboardCount > 0 && (
                  <span className="text-xs">{state.imageCompleted}/{state.storyboardCount}</span>
                )}
                {status === 'active' && step.key === 'generating_videos' && state.storyboardCount > 0 && (
                  <span className="text-xs">{state.videoCompleted}/{state.storyboardCount}</span>
                )}
                {status === 'active' && step.key === 'generating_dubbing' && (
                  <span className="text-xs">{state.dubbingCompleted}</span>
                )}
              </div>
            )
          })}
        </div>

        {isWaitingForReview && (
          <ReviewSection
            state={state}
            onApprove={onApprove}
          />
        )}

        {state.failedItems.length > 0 && (
          <div className="text-xs text-destructive space-y-1">
            <div className="font-medium">失败项 ({state.failedItems.length})</div>
            {state.failedItems.slice(0, 5).map((item, i) => (
              <div key={i} className="truncate">{item.step}: {item.error}</div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ReviewSection({ state, onApprove }: { state: AutoPipelineState; onApprove: (id: string, approved: boolean) => void }) {
  const reviewId = state.phase
  const isStoryboardReview = state.phase === 'review_storyboard'
  const isFirstFrameReview = state.phase === 'review_first_frame'

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-yellow-500/5">
      <div className="flex items-center gap-2 text-sm font-medium text-yellow-700">
        <AlertTriangle className="h-4 w-4" />
        {isStoryboardReview ? '分镜审核' : '首帧审核'}
      </div>

      <p className="text-sm text-muted-foreground">
        {isStoryboardReview
          ? `已生成 ${state.storyboardCount} 个分镜，请检查分镜内容和资产是否正确。确认后将继续生成图片。`
          : '请检查已生成的图片，确认画风和角色一致性。确认后将继续生成视频。'}
      </p>

      {isFirstFrameReview && state.firstFrameUrls.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {state.firstFrameUrls.map((url, i) => (
            <div key={i} className="aspect-video rounded-md overflow-hidden bg-muted">
              <img src={url} alt={`首帧预览 ${i + 1}`} className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="destructive"
          size="sm"
          className="flex-1"
          onClick={() => onApprove(reviewId, false)}
        >
          <XCircle className="h-4 w-4 mr-1" />
          驳回（取消流水线）
        </Button>
        <Button
          size="sm"
          className="flex-1"
          onClick={() => onApprove(reviewId, true)}
        >
          <CheckCircle className="h-4 w-4 mr-1" />
          确认通过
        </Button>
      </div>
    </div>
  )
}
