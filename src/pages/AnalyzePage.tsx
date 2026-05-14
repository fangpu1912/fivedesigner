import { useState, useEffect } from 'react'
import { Upload, Inbox, RefreshCw, ArrowLeftRight, Upload as UploadIcon, Trash2, History, ChevronRight, X, Sparkles, BarChart3, Save, AlertCircle, Scissors, Film } from 'lucide-react'
import { open } from '@tauri-apps/plugin-dialog'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/useToast'
import { cn } from '@/lib/utils'
import { vendorConfigService } from '@/services/vendor'
import type { AgentDeploy } from '@/services/vendor/types'
import { InspirationCreator } from '@/components/analysis/InspirationCreator'
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
  useReplaceCharacterImageMutation,
  useRemoveCharacterImageMutation,
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
  const [dragActive, setDragActive] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [vlAgent, setVlAgent] = useState<AgentDeploy | null>(null)

  // 获取当前项目和剧集（从全局状态）
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

  // 检查是否已选择项目和剧集
  const hasSelectedProjectAndEpisode = !!currentProjectId && !!currentEpisodeId

  // 获取 VL Agent 配置
  useEffect(() => {
    const loadVlAgent = async () => {
      const agent = await vendorConfigService.getAgent('vlAgent')
      setVlAgent(agent)
    }
    loadVlAgent()
  }, [])

  // React Query hooks
  const { data: task, isLoading: isLoadingTask } = useAnalysisTaskQuery(analysisId || '')
  const { data: historyTasks, isLoading: isLoadingHistory } = useAnalysisTasks()
  const uploadAndAnalyze = useUploadAndAnalyzeMutation()
  const replaceCharacterImage = useReplaceCharacterImageMutation()
  const removeCharacterImage = useRemoveCharacterImageMutation()
  const deleteAnalysisTask = useDeleteAnalysisTask()

  // 处理文件上传
  const handleFile = async (filePath: string, filename: string) => {
    try {
      const id = await uploadAndAnalyze.mutateAsync({ filePath, filename })
      setAnalysisId(id)
      toast({ title: '上传成功', description: '开始分析视频...' })
    } catch (error) {
      toast({
        title: '上传失败',
        description: (error as Error).message,
        variant: 'destructive',
      })
    }
  }

  // 使用 Tauri Dialog 选择文件
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
        await handleFile(selected, filename)
      }
    } catch (error) {
      toast({
        title: '选择文件失败',
        description: (error as Error).message,
        variant: 'destructive',
      })
    }
  }

  // 拖拽处理
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      if (!file.type.startsWith('video/')) {
        toast({
          title: '文件类型错误',
          description: '请上传视频文件',
          variant: 'destructive',
        })
        return
      }

      // 注意：浏览器拖拽无法直接获取文件路径，需要用户通过对话框选择
      toast({
        title: '请使用选择文件按钮',
        description: '由于安全限制，请使用下方的"选择视频文件"按钮',
      })
    }
  }

  // 替换人物图片
  const handleReplace = async (characterId: number) => {
    if (!analysisId) return

    try {
      const selected = await open({
        multiple: false,
        filters: [
          { name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
        ],
        title: '选择替换图片',
      })

      if (selected && typeof selected === 'string') {
        await replaceCharacterImage.mutateAsync({
          analysisId,
          characterId,
          filePath: selected,
        })
        toast({ title: '人物替换图已更新' })
      }
    } catch (error) {
      toast({
        title: '替换失败',
        description: (error as Error).message,
        variant: 'destructive',
      })
    }
  }

  // 移除替换图
  const handleRemove = async (characterId: number) => {
    if (!analysisId) return

    try {
      await removeCharacterImage.mutateAsync({ analysisId, characterId })
      toast({ title: '已移除替换图' })
    } catch (error) {
      toast({
        title: '移除失败',
        description: (error as Error).message,
        variant: 'destructive',
      })
    }
  }

  // 保存到当前剧集
  const handleSaveToEpisode = async () => {
    if (!analysisId || !task?.result) return
    if (!currentProjectId || !currentEpisodeId) {
      toast({
        title: '未选择项目或剧集',
        description: '请先在项目管理中选择项目和剧集',
        variant: 'destructive',
      })
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
          image: char.replacement_image || undefined,
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

        const characterIds = (sb.characters || [])
          .map(name => characterIdMap.get(name))
          .filter((id): id is string => !!id)

        const propIds = (sb.props || [])
          .map(name => propIdMap.get(name))
          .filter((id): id is string => !!id)

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
      queryClient.invalidateQueries({
        queryKey: characterKeys.list(currentProjectId, currentEpisodeId),
      })

      toast({
        title: '保存成功',
        description: `已清空原有数据，保存${result.characters.length}个角色、${result.scenes.length}个场景、${result.props.length}个道具、${result.storyboards.length}个分镜到「${currentEpisode?.name || '当前剧集'}」`,
        action: (
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/storyboard-draw')}
          >
            <Film className="w-3 h-3 mr-1" />
            查看分镜
          </Button>
        ),
      })
    } catch (error) {
      toast({
        title: '保存失败',
        description: (error as Error).message,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  // 删除分析任务
  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteAnalysisTask.mutateAsync(taskId)
      toast({ title: '已删除分析记录' })
      if (analysisId === taskId) {
        setAnalysisId(null)
      }
    } catch (error) {
      toast({
        title: '删除失败',
        description: (error as Error).message,
        variant: 'destructive',
      })
    }
  }

  // 加载历史任务
  const handleLoadTask = (task: AnalysisTask) => {
    setAnalysisId(task.analysis_id)
    setShowHistory(false)
  }

  const isLoading = uploadAndAnalyze.isPending || isLoadingTask

  return (
    <div className="h-full flex flex-col bg-background p-6 overflow-auto">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        {/* Header */}
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
            {/* 当前项目/剧集信息 */}
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
                    <span className="text-amber-800">
                      请先选择项目和剧集，分析结果将保存到当前剧集
                    </span>
                  </>
                )}
              </AlertDescription>
            </Alert>

            {/* VL Agent 配置提示 */}
            {(!vlAgent || vlAgent.disabled || !vlAgent.modelName) && (
              <Alert className="bg-amber-50 border-amber-200">
                <AlertTitle className="text-amber-800">视觉分析Agent未配置</AlertTitle>
                <AlertDescription className="text-amber-700">
                  对标分析需要配置视觉分析Agent。请前往 <strong>系统设置 → AI服务 → Agent配置</strong>，
                  在「视觉分析Agent」中选择一个支持视觉理解的模型（如 GPT-4V、Claude 3、Gemini Pro Vision）。
                </AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-between">
              <p className="text-muted-foreground">
                上传参考视频，自动拆解人物、分镜、提示词和整体风格。
              </p>
              <Button
                variant="outline"
                onClick={() => setShowHistory(!showHistory)}
              >
                <History className="w-4 h-4 mr-2" />
                分析历史
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左侧：上传和历史 */}
          <div className="space-y-6">
            {/* 上传区域 */}
            <Card>
              <CardContent className="p-6">
                <div
                  className={cn(
                    "border-2 border-dashed rounded-lg p-12 text-center transition-colors",
                    dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25",
                    isLoading && "opacity-50 pointer-events-none"
                  )}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <Inbox className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-medium mb-2">点击上传对标视频</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    支持 mp4 / mov / avi / mkv / webm / flv
                  </p>
                  <Button onClick={handleSelectFile} disabled={isLoading}>
                    <Upload className="w-4 h-4 mr-2" />
                    {uploadAndAnalyze.isPending ? '上传中...' : '选择视频文件'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 分析历史列表 */}
            {showHistory && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>分析历史</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    {isLoadingHistory ? (
                      <div className="text-center py-8 text-muted-foreground">
                        加载中...
                      </div>
                    ) : historyTasks && historyTasks.length > 0 ? (
                      <div className="space-y-2">
                        {historyTasks.map((historyTask) => (
                          <div
                            key={historyTask.analysis_id}
                            className={cn(
                              "flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors",
                              analysisId === historyTask.analysis_id
                                ? "border-primary bg-primary/5"
                                : "border-border hover:bg-muted/50"
                            )}
                            onClick={() => handleLoadTask(historyTask)}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium truncate">
                                  {historyTask.result?.title || historyTask.filename || '未命名'}
                                </span>
                                <Badge variant={
                                  historyTask.status === 'completed' ? 'default' :
                                  historyTask.status === 'processing' ? 'secondary' :
                                  historyTask.status === 'failed' ? 'destructive' : 'outline'
                                } className="text-[10px]">
                                  {historyTask.status === 'completed' ? '完成' :
                                   historyTask.status === 'processing' ? '分析中' :
                                   historyTask.status === 'failed' ? '失败' : '等待'}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {new Date(historyTask.created_at).toLocaleString()}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 ml-2">
                              <ChevronRight className="w-4 h-4 text-muted-foreground" />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteTask(historyTask.analysis_id)
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        暂无分析记录
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {/* 当前任务状态 */}
            {task && (
              <Card>
                <CardHeader>
                  <CardTitle>分析状态</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">任务 ID</span>
                    <span className="font-mono text-xs">{task.analysis_id}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">状态</span>
                    <Badge variant={
                      task.status === 'completed' ? 'default' :
                      task.status === 'processing' ? 'secondary' :
                      task.status === 'failed' ? 'destructive' : 'outline'
                    }>
                      {task.status === 'completed' ? '已完成' :
                       task.status === 'processing' ? '分析中' :
                       task.status === 'failed' ? '失败' : '等待中'}
                    </Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">文件名</span>
                    <span>{task.filename || '-'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">创建时间</span>
                    <span>{new Date(task.created_at).toLocaleString()}</span>
                  </div>

                  {task.status === 'processing' && (
                    <Alert>
                      <AlertTitle>AI 分析中</AlertTitle>
                      <AlertDescription>页面会自动轮询结果。</AlertDescription>
                    </Alert>
                  )}
                  {task.status === 'failed' && (
                    <Alert variant="destructive">
                      <AlertTitle>分析失败</AlertTitle>
                      <AlertDescription>{task.error || '未知错误'}</AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            )}

            {/* 保存到当前剧集 */}
            {task?.status === 'completed' && task.result && (
              <Card>
                <CardHeader>
                  <CardTitle>保存到当前剧集</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button
                    onClick={handleSaveToEpisode}
                    disabled={saving || !hasSelectedProjectAndEpisode}
                    className="w-full"
                  >
                    {saving ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        保存中...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        保存到当前剧集
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* 右侧：分析结果 */}
          <div className="lg:col-span-2 space-y-6">
            {task?.status === 'completed' && task.result ? (
              <>
                {/* 整体分析 */}
                <Card>
                  <CardHeader>
                    <CardTitle>整体分析</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <h3 className="text-xl font-semibold">{task.result.title}</h3>
                    <p className="text-muted-foreground">{task.result.style}</p>
                    <div className="flex gap-2 flex-wrap">
                      <Badge variant="secondary">{task.result.aspect_ratio}</Badge>
                      <Badge variant="secondary">{task.result.total_duration}s</Badge>
                      <Badge variant="secondary">{task.result.color_grade}</Badge>
                      <Badge variant="secondary">{task.result.characters.length}角色</Badge>
                      <Badge variant="secondary">{task.result.scenes.length}场景</Badge>
                      <Badge variant="secondary">{task.result.props.length}道具</Badge>
                      <Badge variant="secondary">{task.result.storyboards.length}分镜</Badge>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">全局风格提示词：</span>
                      <span className="font-mono text-xs">{task.result.overall_prompt}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* 角色设定 */}
                {task.result.characters.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>角色设定</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {task.result.characters.map((character) => (
                        <div
                          key={character.character_id}
                          className="p-4 bg-muted rounded-lg space-y-2"
                        >
                          <div className="flex gap-2 flex-wrap">
                            <Badge>{character.name}</Badge>
                            {character.replacement_image ? (
                              <Badge variant="default">已替换</Badge>
                            ) : (
                              <Badge variant="outline">使用原人物</Badge>
                            )}
                          </div>
                          <p className="text-sm">{character.description}</p>
                          <div className="text-sm text-muted-foreground font-mono text-xs bg-muted/50 p-2 rounded">
                            {character.prompt}
                          </div>
                          {character.staticViews && (
                            <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded border border-blue-100">
                              四视图：{character.staticViews}
                            </div>
                          )}
                          {character.wardrobeVariants && (
                            <div className="text-xs text-purple-600 bg-purple-50 p-2 rounded border border-purple-100">
                              衍生衣橱：{character.wardrobeVariants}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleReplace(character.character_id)}
                              disabled={replaceCharacterImage.isPending}
                            >
                              <UploadIcon className="w-4 h-4 mr-2" />
                              上传替换图
                            </Button>
                            {character.replacement_image && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRemove(character.character_id)}
                                disabled={removeCharacterImage.isPending}
                              >
                                <ArrowLeftRight className="w-4 h-4 mr-2" />
                                移除替换图
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* 场景设定 */}
                {task.result.scenes.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>场景设定</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {task.result.scenes.map((scene) => (
                        <div key={scene.scene_id} className="p-4 bg-muted rounded-lg space-y-2">
                          <div className="font-medium">{scene.name}</div>
                          <p className="text-sm text-muted-foreground">{scene.description}</p>
                          <div className="text-xs text-muted-foreground/70 bg-muted/50 p-2 rounded">
                            {scene.prompt}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* 道具设定 */}
                {task.result.props.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>道具设定</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {task.result.props.map((prop) => (
                        <div key={prop.prop_id} className="p-4 bg-muted rounded-lg space-y-2">
                          <div className="font-medium">{prop.name}</div>
                          <p className="text-sm text-muted-foreground">{prop.description}</p>
                          <div className="text-xs text-muted-foreground/70 bg-muted/50 p-2 rounded">
                            {prop.prompt}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* 分镜拆解 */}
                <Card>
                  <CardHeader>
                    <CardTitle>分镜拆解</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {task.result.storyboards.map((sb) => (
                      <Collapsible key={sb.storyboard_id}>
                        <CollapsibleTrigger className="w-full">
                          <div className="flex items-center justify-between p-3 bg-muted rounded-lg hover:bg-muted/80 transition-colors">
                            <div className="flex items-center gap-2">
                              <span>分镜 {sb.storyboard_id}</span>
                              {sb.timestamp && <Badge variant="outline" className="text-[10px]">{sb.timestamp}</Badge>}
                              <Badge variant="secondary" className="text-[10px]">{sb.duration}s</Badge>
                              {sb.shot_type && <Badge variant="outline" className="text-[10px]">{sb.shot_type}</Badge>}
                            </div>
                            <span className="text-muted-foreground">▼</span>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="p-3 space-y-2">
                          <p className="text-sm">{sb.description}</p>
                          {sb.characters && sb.characters.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {sb.characters.map((c, i) => (
                                <Badge key={i} variant="outline" className="text-xs">{c}</Badge>
                              ))}
                            </div>
                          )}
                          {sb.props && sb.props.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {sb.props.map((p, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">{p}</Badge>
                              ))}
                            </div>
                          )}
                          <p className="text-sm text-muted-foreground font-mono text-xs">
                            首帧提示词：{sb.prompt}
                          </p>
                          <p className="text-sm text-muted-foreground font-mono text-xs">
                            视频提示词：{sb.videoPrompt}
                          </p>
                          {sb.camera_motion && (
                            <p className="text-xs text-muted-foreground">
                              运镜：{sb.camera_motion}
                            </p>
                          )}
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                  </CardContent>
                </Card>
              </>
            ) : task?.status === 'processing' ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
                  <p className="text-muted-foreground">AI 正在分析视频中...</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    这可能需要几分钟时间，请耐心等待
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Upload className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>上传视频开始分析</p>
                  <p className="text-sm mt-2">或从左侧历史记录中选择</p>
                </CardContent>
              </Card>
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
