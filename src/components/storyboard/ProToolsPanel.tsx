import { useState, useCallback, useRef } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/useToast'
import {
  Loader2,
  RefreshCw,
  Download,
  ZoomIn,
  ImagePlus,
  Grid3X3,
  LayoutGrid,
} from 'lucide-react'
import { useImageGeneration, buildFullPrompt } from '@/hooks/useVendorGeneration'
import { saveMediaFile } from '@/utils/mediaStorage'
import { getImageUrl } from '@/utils/asset'
import { ReferenceImageInput } from '@/components/ai/ReferenceImageInput'
import { cn } from '@/lib/utils'

type ProToolMode = 'turnaround' | 'multiangle' | 'continuous'

interface ProToolsPanelProps {
  projectId: string
  episodeId?: string
  selectedModelId?: string
  modelParams?: Record<string, unknown>
  referenceImages?: string[]
  activeItemImage?: string
  characters?: { id: string; name: string; image?: string }[]
  scenes?: { id: string; name: string; image?: string }[]
}

interface GeneratedItem {
  url: string
  label: string
  prompt: string
}

interface SavedItem {
  path: string
  label: string
  category: 'character' | 'scene' | 'prop'
}

const MULTI_ANGLE_PRESETS: { label: string; camera: string; prompt: string }[] = [
  { label: '远景', camera: 'extreme wide shot, establishing shot, full environment visible', prompt: 'extreme wide establishing shot' },
  { label: '全景', camera: 'wide shot, full body in frame, environmental context', prompt: 'wide full body shot' },
  { label: '中景', camera: 'medium shot, waist up, character interaction and gestures', prompt: 'medium waist-up shot' },
  { label: '近景', camera: 'medium close-up, chest up, facial expressions and emotions', prompt: 'medium close-up chest shot' },
  { label: '特写', camera: 'close-up shot, face only, intimate emotional detail, shallow depth of field', prompt: 'close-up face shot' },
  { label: '俯拍', camera: 'high angle shot, looking down from above, bird eye perspective', prompt: 'high angle overhead shot' },
  { label: '仰拍', camera: 'low angle shot, looking up from below, heroic powerful perspective', prompt: 'low angle heroic shot' },
  { label: '过肩', camera: 'over the shoulder shot, OTS framing, conversational two-shot composition', prompt: 'over the shoulder OTS shot' },
  { label: '斜角', camera: 'dutch angle tilted shot, canted frame, dramatic tension and unease', prompt: 'dutch angle tilted shot' },
]

export function ProToolsPanel({
  projectId,
  episodeId,
  selectedModelId,
  modelParams,
  referenceImages = [],
  activeItemImage,
}: ProToolsPanelProps) {
  const { toast } = useToast()
  const imageGeneration = useImageGeneration()
  const [mode, setMode] = useState<ProToolMode>('turnaround')
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<GeneratedItem[]>([])
  const [savedItems, setSavedItems] = useState<SavedItem[]>([])
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const abortRef = useRef(false)

  const [turnaroundRef, setTurnaroundRef] = useState<string>('')
  const [turnaroundDesc, setTurnaroundDesc] = useState('')
  const [sceneRef, setSceneRef] = useState('')
  const [sceneDesc, setSceneDesc] = useState('')
  const [continuousRef, setContinuousRef] = useState('')
  const [continuousScript, setContinuousScript] = useState('')

  const resetGeneration = useCallback(() => {
    abortRef.current = true
    setIsGenerating(false)
    setProgress(0)
  }, [])

  const saveResult = useCallback(async (item: GeneratedItem, category: 'character' | 'scene' | 'prop' = 'character') => {
    try {
      const savedPath = await saveMediaFile(item.url, {
        projectId: projectId || 'temp',
        episodeId: episodeId || 'temp',
        type: 'image',
        fileName: `${category}_${Date.now()}.png`,
        extension: 'png',
      })
      setSavedItems(prev => [...prev, { path: savedPath, label: item.label, category }])
      toast({ title: `已保存为${category === 'character' ? '角色' : category === 'scene' ? '场景' : '道具'}资产` })
      return savedPath
    } catch (error) {
      toast({ title: '保存失败', description: String(error), variant: 'destructive' })
      return undefined
    }
  }, [projectId, episodeId, toast])

  const saveAllResults = useCallback(async () => {
    if (results.length === 0) return
    const category = mode === 'turnaround' ? 'character' : 'scene'
    for (const item of results) {
      await saveResult(item, category)
    }
    toast({ title: `已保存全部 ${results.length} 张图片为${category === 'character' ? '角色' : '场景'}资产` })
  }, [results, mode, saveResult, toast])

  // --- 角色三视图 ---
  const handleTurnaroundGenerate = useCallback(async () => {
    if (!projectId) return
    abortRef.current = false
    setIsGenerating(true)
    setProgress(0)
    setResults([])

    const refImage = turnaroundRef || activeItemImage || referenceImages[0] || ''
    const desc = turnaroundDesc.trim()
    const basePrompt = desc
      ? `character turnaround reference sheet: ${desc}, front view, side profile view, back view, 3/4 view, same character, consistent design, full body standing pose, white background, studio lighting, clean reference sheet, character design sheet, orthographic views, three-point turnaround`
      : `character turnaround reference sheet, front view, side profile view, back view, 3/4 view, same character, consistent design, full body standing pose, white background, studio lighting, clean reference sheet, character design sheet, orthographic views, three-point turnaround`

    try {
      const fullPrompt = await buildFullPrompt(projectId, basePrompt)
      const url = await imageGeneration.mutateAsync({
        projectId,
        episodeId,
        name: `turnaround_${Date.now()}`,
        prompt: fullPrompt,
        model: selectedModelId,
        width: (modelParams?.width as number) || 1216,
        height: (modelParams?.height as number) || 832,
        imageUrl: refImage || undefined,
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
      })

      if (!abortRef.current) {
        setResults([{ url, label: '角色三视图', prompt: basePrompt }])
        setProgress(100)
        toast({ title: '角色三视图生成成功' })
      }
    } catch (error) {
      if (!abortRef.current) {
        toast({ title: '生成失败', description: String(error), variant: 'destructive' })
      }
    } finally {
      setIsGenerating(false)
    }
  }, [projectId, episodeId, turnaroundRef, turnaroundDesc, activeItemImage, referenceImages, selectedModelId, modelParams, imageGeneration, toast])

  // --- 多机位九宫格 ---
  const handleMultiAngleGenerate = useCallback(async () => {
    if (!projectId) return
    abortRef.current = false
    setIsGenerating(true)
    setProgress(0)
    setResults([])

    const refImage = sceneRef || activeItemImage || referenceImages[0] || ''
    const desc = sceneDesc.trim()

    const generated: GeneratedItem[] = []
    const total = MULTI_ANGLE_PRESETS.length

    for (let i = 0; i < total; i++) {
      if (abortRef.current) break

      const preset = MULTI_ANGLE_PRESETS[i]!
      const basePrompt = desc
        ? `${desc}, ${preset.camera}`
        : `${preset.camera}, cinematic composition, professional cinematography`

      try {
        const fullPrompt = await buildFullPrompt(projectId, basePrompt)
        const url = await imageGeneration.mutateAsync({
          projectId,
          episodeId,
          name: `angle_${preset.label}_${Date.now()}`,
          prompt: fullPrompt,
          model: selectedModelId,
          width: (modelParams?.width as number) || 1216,
          height: (modelParams?.height as number) || 832,
          imageUrl: refImage || undefined,
          referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        })

        generated.push({ url, label: preset.label, prompt: basePrompt })
      } catch (error) {
        console.error(`生成 ${preset.label} 失败:`, error)
        generated.push({ url: '', label: `${preset.label}(失败)`, prompt: basePrompt })
      }

      setProgress(Math.round(((i + 1) / total) * 100))
      setResults([...generated])
    }

    setIsGenerating(false)
    const successCount = generated.filter(g => g.url).length
    toast({ title: `九宫格生成完成: ${successCount}/${total} 成功` })
  }, [projectId, episodeId, sceneRef, sceneDesc, activeItemImage, referenceImages, selectedModelId, modelParams, imageGeneration, toast])

  // --- 25宫格连贯分镜 ---
  const handleContinuousGenerate = useCallback(async () => {
    if (!projectId) return
    abortRef.current = false
    setIsGenerating(true)
    setProgress(0)
    setResults([])

    const refImage = continuousRef || activeItemImage || referenceImages[0] || ''
    const script = continuousScript.trim()

    const generated: GeneratedItem[] = []
    const total = 25

    if (!script) {
      toast({ title: '请输入场景/剧情描述', variant: 'destructive' })
      setIsGenerating(false)
      return
    }

    const shots: string[] = Array.from({ length: 25 }, (_, i) => {
      const row = Math.floor(i / 5)
      const col = i % 5
      const shotTypes = ['establishing wide', 'wide', 'medium', 'close-up', 'extreme close-up']
      const shotType = shotTypes[col]
      return `shot ${i + 1}/25 (${shotType}, scene beat ${row + 1}): from the sequence: ${script}`
    })

    for (let i = 0; i < total; i++) {
      if (abortRef.current) break

      const basePrompt = shots[i]!

      try {
        const fullPrompt = await buildFullPrompt(projectId, basePrompt)
        const url = await imageGeneration.mutateAsync({
          projectId,
          episodeId,
          name: `continuous_${i + 1}_${Date.now()}`,
          prompt: fullPrompt,
          model: selectedModelId,
          width: (modelParams?.width as number) || 1216,
          height: (modelParams?.height as number) || 832,
          imageUrl: refImage || undefined,
          referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        })

        generated.push({ url, label: `镜头${i + 1}`, prompt: basePrompt })
      } catch (error) {
        console.error(`生成镜头${i + 1} 失败:`, error)
        generated.push({ url: '', label: `镜头${i + 1}(失败)`, prompt: basePrompt })
      }

      setProgress(Math.round(((i + 1) / total) * 100))
      setResults([...generated])
    }

    setIsGenerating(false)
    const successCount = generated.filter(g => g.url).length
    toast({ title: `25宫格生成完成: ${successCount}/${total} 成功` })
  }, [projectId, episodeId, continuousRef, continuousScript, activeItemImage, referenceImages, selectedModelId, modelParams, imageGeneration, toast])

  const renderResultGrid = (cols: number) => (
    results.length > 0 && (
      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {results.filter(r => r.url).length}/{results.length} 生成成功
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={saveAllResults} disabled={results.every(r => !r.url)}>
              <Download className="w-3.5 h-3.5 mr-1" />
              全部保存
            </Button>
          </div>
        </div>
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        >
          {results.map((item, idx) => (
            <div
              key={idx}
              className={cn(
                'relative group border rounded-lg overflow-hidden bg-muted/30',
                !item.url && 'border-destructive/30'
              )}
            >
              {item.url ? (
                <>
                  <img
                    src={getImageUrl(item.url) || item.url}
                    alt={item.label}
                    className="w-full aspect-video object-cover cursor-pointer"
                    onClick={() => setPreviewIndex(idx)}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <div className="flex gap-1">
                      <Button variant="secondary" size="icon" className="h-7 w-7" onClick={() => setPreviewIndex(idx)}>
                        <ZoomIn className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="secondary" size="icon" className="h-7 w-7" onClick={() => saveResult(item, mode === 'turnaround' ? 'character' : 'scene')}>
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="w-full aspect-video flex items-center justify-center text-muted-foreground text-xs">
                  生成失败
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5">
                <span className="text-[10px] text-white font-medium">{item.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  )

  const renderProgressBar = () => (
    isGenerating && (
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            正在生成...
          </span>
          <span>{progress}%</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div
            className="bg-primary h-full rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <Button variant="ghost" size="sm" onClick={resetGeneration} className="text-xs">
          取消生成
        </Button>
      </div>
    )
  )

  const renderPreviewModal = () => {
    if (previewIndex === null) return null
    const item = results[previewIndex]
    if (!item?.url) return null

    return (
      <div
        className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-pointer"
        onClick={() => setPreviewIndex(null)}
      >
        <img
          src={getImageUrl(item.url) || item.url}
          alt={item.label}
          className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
        />
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          <span className="bg-black/50 text-white px-3 py-1 rounded-full text-sm">
            {item.label}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              saveResult(item, mode === 'turnaround' ? 'character' : 'scene')
            }}
          >
            <Download className="w-3.5 h-3.5 mr-1" />
            保存资产
          </Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-primary" />
            专业工具
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <Tabs value={mode} onValueChange={(v) => { setMode(v as ProToolMode); setResults([]); setProgress(0) }}>
            <TabsList className="w-full">
              <TabsTrigger value="turnaround" className="flex-1 text-xs gap-1">
                <RefreshCw className="w-3 h-3" />
                角色三视图
              </TabsTrigger>
              <TabsTrigger value="multiangle" className="flex-1 text-xs gap-1">
                <Grid3X3 className="w-3 h-3" />
                多机位九宫格
              </TabsTrigger>
              <TabsTrigger value="continuous" className="flex-1 text-xs gap-1">
                <LayoutGrid className="w-3 h-3" />
                25宫格连贯分镜
              </TabsTrigger>
            </TabsList>

            {/* 角色三视图 */}
            <TabsContent value="turnaround" className="space-y-3 mt-3">
              <div className="text-xs text-muted-foreground">
                基于角色图片和描述，生成前后侧三视图角色参考表
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium">角色参考图</label>
                <ReferenceImageInput
                  value={turnaroundRef ? [turnaroundRef] : []}
                  onChange={(imgs) => setTurnaroundRef(imgs[0] || '')}
                  maxReferences={1}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">角色描述（可选）</label>
                <Textarea
                  placeholder="例如：年轻女性，长发，穿中式汉服，手持长剑..."
                  value={turnaroundDesc}
                  onChange={(e) => setTurnaroundDesc(e.target.value)}
                  className="h-16 text-xs resize-none"
                />
              </div>
              <Button
                onClick={handleTurnaroundGenerate}
                disabled={isGenerating || !projectId}
                className="w-full"
                size="sm"
              >
                {isGenerating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5 mr-1" />}
                生成三视图
              </Button>
              {renderProgressBar()}
              {renderResultGrid(1)}
            </TabsContent>

            {/* 多机位九宫格 */}
            <TabsContent value="multiangle" className="space-y-3 mt-3">
              <div className="text-xs text-muted-foreground">
                一键生成 9 种不同机位角度：远景·全景·中景·近景·特写·俯拍·仰拍·过肩·斜角
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium">场景参考图</label>
                <ReferenceImageInput
                  value={sceneRef ? [sceneRef] : []}
                  onChange={(imgs) => setSceneRef(imgs[0] || '')}
                  maxReferences={1}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">场景描述（可选）</label>
                <Textarea
                  placeholder="例如：古风庭院，桃花盛开，阳光透过树叶..."
                  value={sceneDesc}
                  onChange={(e) => setSceneDesc(e.target.value)}
                  className="h-16 text-xs resize-none"
                />
              </div>
              <div className="grid grid-cols-3 gap-1">
                {MULTI_ANGLE_PRESETS.map((preset) => (
                  <div key={preset.label} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-center">
                    {preset.label}
                  </div>
                ))}
              </div>
              <Button
                onClick={handleMultiAngleGenerate}
                disabled={isGenerating || !projectId}
                className="w-full"
                size="sm"
              >
                {isGenerating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Grid3X3 className="w-3.5 h-3.5 mr-1" />}
                批量生成九宫格
              </Button>
              {renderProgressBar()}
              {renderResultGrid(3)}
            </TabsContent>

            {/* 25宫格连贯分镜 */}
            <TabsContent value="continuous" className="space-y-3 mt-3">
              <div className="text-xs text-muted-foreground">
                输入剧情描述，自动生成 25 个连贯分镜镜头（5x5 分镜表）
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium">参考图（可选）</label>
                <ReferenceImageInput
                  value={continuousRef ? [continuousRef] : []}
                  onChange={(imgs) => setContinuousRef(imgs[0] || '')}
                  maxReferences={1}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">剧情/场景描述</label>
                <Textarea
                  placeholder={`例如：场景设定 - 一间古朴的木屋内...\n分镜拆解：\n镜头1-5: 主角推门进入，环顾四周，发现桌上的密信\n镜头6-10: 拿起密信阅读，表情从疑惑转为震惊\n镜头11-15: 窗外闪过人影，主角警觉拔剑\n镜头16-20: 黑衣人破窗而入，两人对峙\n镜头21-25: 激烈打斗，主角一剑制敌，揭下面具`}
                  value={continuousScript}
                  onChange={(e) => setContinuousScript(e.target.value)}
                  className="h-32 text-xs resize-none"
                />
              </div>
              <Button
                onClick={handleContinuousGenerate}
                disabled={isGenerating || !projectId || !continuousScript.trim()}
                className="w-full"
                size="sm"
              >
                {isGenerating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <LayoutGrid className="w-3.5 h-3.5 mr-1" />}
                生成 25 宫格连贯分镜
              </Button>
              {renderProgressBar()}
              {renderResultGrid(5)}
            </TabsContent>
          </Tabs>

          {savedItems.length > 0 && (
            <div className="border-t pt-2 mt-2">
              <span className="text-xs text-muted-foreground">
                已保存 {savedItems.length} 个资产
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {renderPreviewModal()}
    </>
  )
}
