import { useState, useEffect, useMemo } from 'react'
import { Upload, RefreshCw, Trash2, History, ChevronRight, Sparkles, BarChart3, Save, AlertCircle, Scissors, Film, Play } from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import { vendorConfigService } from '@/services/vendor'
import type { AgentDeploy } from '@/services/vendor/types'
import { InspirationCreator } from '@/components/analysis/InspirationCreator'
import { ContentResultDisplay, ContentResultEmpty } from '@/components/analysis/ContentResultDisplay'
import type { ContentData } from '@/components/analysis/ContentResultDisplay'
import VideoSceneExtraction from '@/pages/VideoSceneExtraction'
import { useUIStore } from '@/store/useUIStore'
import { useProjectQuery } from '@/hooks/useProjects'
import { useEpisodeQuery } from '@/hooks/useEpisodes'
import { useCharacterMutations, useCharactersByEpisode } from '@/hooks/useCharacters'
import { useSceneMutations, useScenesByEpisode } from '@/hooks/useAssetManager'
import { usePropMutations, usePropsByEpisode } from '@/hooks/useAssetManager'
import { useStoryboardMutations, useStoryboards } from '@/hooks/useStoryboards'
import { useDubbingMutations, useDubbingByEpisode } from '@/hooks/useDubbing'
import { storyboardKeys } from '@/hooks/useStoryboards'
import { characterKeys } from '@/hooks/useCharacters'
import {
  useAnalysisTaskQuery,
  useUploadAndAnalyzeMutation,
  useAnalysisTasks,
  useDeleteAnalysisTask,
} from '@/hooks/useAnalysis'
import type { AnalysisTask } from '@/types/analysis'

export default function AnalyzePage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [analysisId, setAnalysisId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [vlAgent, setVlAgent] = useState<AgentDeploy | null>(null)
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)

  const { currentProjectId, currentEpisodeId } = useUIStore()
  const { data: currentProject } = useProjectQuery(currentProjectId || '')
  const { data: currentEpisode } = useEpisodeQuery(currentEpisodeId || '')
  const characterMutations = useCharacterMutations()
  const sceneMutations = useSceneMutations()
  const propMutations = usePropMutations()
  const storyboardMutations = useStoryboardMutations()
  const dubbingMutations = useDubbingMutations(currentEpisodeId || undefined)
  const { data: existingCharacters = [] } = useCharactersByEpisode(currentEpisodeId || undefined)
  const { data: existingScenes = [] } = useScenesByEpisode(currentEpisodeId || undefined)
  const { data: existingProps = [] } = usePropsByEpisode(currentEpisodeId || undefined)
  const { data: existingStoryboards = [] } = useStoryboards(currentEpisodeId || '')
  const { data: existingDubbings = [] } = useDubbingByEpisode(currentEpisodeId || '')

  const hasSelectedProjectAndEpisode = !!currentProjectId && !!currentEpisodeId

  useEffect(() => {
    const loadVlAgent = async () => {
      const agent = await vendorConfigService.getAgent('vlAgent')
      setVlAgent(agent)
    }
    loadVlAgent()
  }, [])

  const { data: task, isLoading: isLoadingTask } = useAnalysisTaskQuery(analysisId || '')
  const { data: historyTasks, isLoading: isLoadingHistory } = useAnalysisTasks()
  const uploadAndAnalyze = useUploadAndAnalyzeMutation()
  const deleteAnalysisTask = useDeleteAnalysisTask()

  const handleSelectFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          { name: '视频文件', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv'] },
        ],
        title: '选择对标视频',
      })

      if (selected && typeof selected === 'string') {
        const filename = selected.split(/[/\\]/).pop() || 'unknown'
        setSelectedFilePath(selected)
        setSelectedFileName(filename)
      }
    } catch (error) {
      toast({
        title: '选择文件失败',
        description: (error as Error).message,
        variant: 'destructive',
      })
    }
  }

  const handleExecute = async () => {
    if (!selectedFilePath || !selectedFileName) return
    try {
      const id = await uploadAndAnalyze.mutateAsync({ filePath: selectedFilePath, filename: selectedFileName, mode: 'video' })
      setAnalysisId(id)
      setSelectedFilePath(null)
      setSelectedFileName(null)
      toast({
        title: '上传成功',
        description: '开始上传视频到 AI 分析...',
      })
    } catch (error) {
      toast({
        title: '上传失败',
        description: (error as Error).message,
        variant: 'destructive',
      })
    }
  }

  const handleSaveToEpisode = async () => {
    if (!analysisId || !task?.result) return
    if (!currentProjectId || !currentEpisodeId) {
      toast({ title: '未选择项目或剧集', description: '请先在项目管理中选择项目和剧集', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      const result = task.result

      for (const dub of existingDubbings) {
        await dubbingMutations.deleteDubbing.mutateAsync(dub.id)
      }
      for (const sb of existingStoryboards) {
        await storyboardMutations.deleteStoryboard.mutateAsync(sb.id)
      }
      for (const prop of existingProps) {
        await propMutations.remove.mutateAsync(prop.id)
      }
      for (const scene of existingScenes) {
        await sceneMutations.remove.mutateAsync(scene.id)
      }
      for (const char of existingCharacters) {
        await characterMutations.remove.mutateAsync(char.id)
      }

      const characterIdMap = new Map<string, string>()
      for (const char of result.characters) {
        const created = await characterMutations.create.mutateAsync({
          project_id: currentProjectId,
          episode_id: currentEpisodeId,
          name: char.name,
          description: char.description,
          prompt: char.prompt,
        })
        characterIdMap.set(char.name, created.id)
      }

      const sceneIdMap = new Map<string, string>()
      for (const scene of result.scenes) {
        const created = await sceneMutations.create.mutateAsync({
          project_id: currentProjectId,
          episode_id: currentEpisodeId,
          name: scene.name,
          description: scene.description,
          prompt: scene.prompt,
        })
        sceneIdMap.set(scene.name, created.id)
      }

      const propIdMap = new Map<string, string>()
      for (const prop of result.props) {
        const created = await propMutations.create.mutateAsync({
          project_id: currentProjectId,
          episode_id: currentEpisodeId,
          name: prop.name,
          description: prop.description,
          prompt: prop.prompt,
        })
        propIdMap.set(prop.name, created.id)
      }

      for (let i = 0; i < result.storyboards.length; i++) {
        const sb = result.storyboards[i]!
        const characterIds = (sb.characters || []).map(name => characterIdMap.get(name)).filter((id): id is string => !!id)
        const propIds = (sb.props || []).map(name => propIdMap.get(name)).filter((id): id is string => !!id)

        await storyboardMutations.createStoryboard.mutateAsync({
          project_id: currentProjectId,
          episode_id: currentEpisodeId,
          name: `分镜 ${i + 1}`,
          description: sb.description,
          prompt: sb.prompt,
          video_prompt: sb.videoPrompt,
          duration: sb.duration,
          sort_order: i,
          status: 'pending',
          character_ids: characterIds,
          prop_ids: propIds,
          reference_images: [],
          video_reference_images: [],
        })
      }

      queryClient.invalidateQueries({ queryKey: storyboardKeys.list(currentEpisodeId) })
      queryClient.invalidateQueries({ queryKey: characterKeys.list(currentProjectId, currentEpisodeId) })

      toast({
        title: '保存成功',
        description: `已保存${result.characters.length}个角色、${result.scenes.length}个场景、${result.props.length}个道具、${result.storyboards.length}个分镜到「${currentEpisode?.name || '当前剧集'}」`,
        action: (
          <Button variant="outline" size="sm" onClick={() => navigate('/storyboard-draw')}>
            <Film className="w-3 h-3 mr-1" />
            查看分镜
          </Button>
        ),
      })
    } catch (error) {
      toast({ title: '保存失败', description: (error as Error).message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteAnalysisTask.mutateAsync(taskId)
      toast({ title: '已删除分析记录' })
      if (analysisId === taskId) setAnalysisId(null)
    } catch (error) {
      toast({ title: '删除失败', description: (error as Error).message, variant: 'destructive' })
    }
  }

  const handleLoadTask = (task: AnalysisTask) => {
    setAnalysisId(task.analysis_id)
    setShowHistory(false)
  }

  const isLoading = uploadAndAnalyze.isPending || isLoadingTask

  const analysisContentData: ContentData | null = useMemo(() => {
    if (!task?.result) return null
    const r = task.result
    return {
      characters: r.characters.map(c => ({
        name: c.name,
        description: c.description,
        prompt: c.prompt,
        wardrobeVariants: c.wardrobeVariants,
      })),
      scenes: r.scenes.map(s => ({
        name: s.name,
        description: s.description,
        prompt: s.prompt,
      })),
      props: r.props.map(p => ({
        name: p.name,
        description: p.description,
        prompt: p.prompt,
      })),
      storyboards: r.storyboards.map(sb => ({
        description: sb.description,
        prompt: sb.prompt,
        videoPrompt: sb.videoPrompt,
        scene_id: sb.scene_id,
        characters: sb.characters,
        props: sb.props,
        shotType: sb.shot_type,
        duration: sb.duration ? String(sb.duration) : undefined,
      })),
    }
  }, [task?.result])

  return (
    <div className="h-full flex flex-col bg-background p-6 overflow-auto">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">创作灵感</h1>
            <p className="text-muted-foreground">
              对标分析参考视频，或通过主题灵感创作，快速生成角色、场景、分镜等内容。
            </p>
          </div>
        </div>

        <Tabs defaultValue="analysis" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="analysis" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              对标分析
            </TabsTrigger>
            <TabsTrigger value="inspiration" className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              灵感创作
            </TabsTrigger>
            <TabsTrigger value="scene-extraction" className="flex items-center gap-2">
              <Scissors className="w-4 h-4" />
              分镜拆解
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analysis" className="space-y-6 mt-6">
            <Alert className={hasSelectedProjectAndEpisode ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}>
              <AlertDescription className="flex items-center gap-2">
                {hasSelectedProjectAndEpisode ? (
                  <>
                    <Sparkles className="w-4 h-4 text-green-600" />
                    <span className="text-green-800">
                      当前项目：{currentProject?.name || '加载中...'} | 当前剧集：{currentEpisode?.name || '加载中...'}
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span className="text-amber-800">请先选择项目和剧集，分析结果将保存到当前剧集</span>
                  </>
                )}
              </AlertDescription>
            </Alert>

            {(!vlAgent || vlAgent.disabled || !vlAgent.modelName) && (
              <Alert className="bg-amber-50 border-amber-200">
                <AlertTitle className="text-amber-800">视觉分析Agent未配置</AlertTitle>
                <AlertDescription className="text-amber-700">
                  对标分析需要配置视觉分析Agent。请前往 <strong>系统设置 → AI服务 → Agent配置</strong>，
                  在「视觉分析Agent」中选择一个支持视觉理解的模型。
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="space-y-6">
                {/* 上传区域 */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-blue-500" />
                      对标分析
                    </CardTitle>
                    <CardDescription>上传参考视频，自动拆解角色、场景、分镜和提示词</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* 选择文件 */}
                    <div className="space-y-2">
                      <Label>选择视频</Label>
                      <Button variant="outline" onClick={handleSelectFile} disabled={isLoading} className="w-full justify-start">
                        <Upload className="w-4 h-4 mr-2" />
                        {selectedFileName || '选择视频文件'}
                      </Button>
                      <p className="text-xs text-muted-foreground">支持 mp4 / mov / avi / mkv / webm / flv</p>
                    </div>

                    {/* 执行按钮 */}
                    <Button
                      onClick={handleExecute}
                      disabled={isLoading || !selectedFilePath}
                      className="w-full"
                    >
                      {uploadAndAnalyze.isPending ? (
                        <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />分析中...</>
                      ) : (
                        <><Play className="w-4 h-4 mr-2" />开始分析</>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                {/* 历史记录 */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <History className="w-4 h-4" />
                      分析历史
                    </CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)}>
                      {showHistory ? '收起' : '展开'}
                    </Button>
                  </CardHeader>
                  {showHistory && (
                    <CardContent>
                      <ScrollArea className="h-[300px]">
                        {isLoadingHistory ? (
                          <div className="text-center py-8 text-muted-foreground">加载中...</div>
                        ) : historyTasks && historyTasks.length > 0 ? (
                          <div className="space-y-2">
                            {historyTasks.map((historyTask) => (
                              <div
                                key={historyTask.analysis_id}
                                className={cn(
                                  "flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors",
                                  analysisId === historyTask.analysis_id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                                )}
                                onClick={() => handleLoadTask(historyTask)}
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm truncate">{historyTask.result?.title || historyTask.filename || '未命名'}</span>
                                    <Badge variant={historyTask.status === 'completed' ? 'default' : historyTask.status === 'failed' ? 'destructive' : 'secondary'} className="text-[10px]">
                                      {historyTask.status === 'completed' ? '完成' : historyTask.status === 'processing' ? '分析中' : historyTask.status === 'failed' ? '失败' : '等待'}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1">{new Date(historyTask.created_at).toLocaleString()}</p>
                                </div>
                                <div className="flex items-center gap-1 ml-2">
                                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteTask(historyTask.analysis_id) }}>
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-muted-foreground">暂无分析记录</div>
                        )}
                      </ScrollArea>
                    </CardContent>
                  )}
                </Card>
              </div>

              {/* 右侧：分析结果 - 复用灵感创作的 UI 布局 */}
              <div className="lg:col-span-2">
                {task?.status === 'completed' && analysisContentData && task.result ? (
                  <ContentResultDisplay
                    content={analysisContentData}
                    title="分析结果"
                    showExport
                    actions={
                      <div className="space-y-4">
                        <div className="p-4 bg-muted/30 rounded-lg space-y-2">
                          <div className="text-lg font-semibold">{task.result.title}</div>
                          <div className="text-sm text-muted-foreground">{task.result.style}</div>
                          <div className="flex gap-2 flex-wrap">
                            <Badge variant="secondary">{task.result.aspect_ratio}</Badge>
                          </div>
                        </div>
                        <Button onClick={handleSaveToEpisode} disabled={saving || !hasSelectedProjectAndEpisode} className="w-full">
                          {saving ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />保存中...</> : <><Save className="w-4 h-4 mr-2" />保存到当前剧集</>}
                        </Button>
                      </div>
                    }
                  />
                ) : task?.status === 'processing' ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
                      <p className="text-muted-foreground">AI 正在分析视频中...</p>
                      <p className="text-sm text-muted-foreground mt-2">这可能需要几分钟时间，请耐心等待</p>
                    </CardContent>
                  </Card>
                ) : (
                  <ContentResultEmpty
                    icon={<BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />}
                    text="上传视频开始分析"
                    subText="或从历史记录中选择"
                  />
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="inspiration" className="mt-6">
            <InspirationCreator />
          </TabsContent>

          <TabsContent value="scene-extraction" className="mt-6 h-[calc(100vh-220px)] overflow-hidden">
            <VideoSceneExtraction />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
