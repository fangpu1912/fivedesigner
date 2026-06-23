import { type ReactNode } from 'react'

import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'
import { Sparkles, FileText, Video } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/useToast'

export interface ContentCharacter {
  name: string
  description: string
  prompt: string
  aliases?: string[]
  wardrobeVariants?: string
}

export interface ContentScene {
  name: string
  description: string
  prompt: string
  aliases?: string[]
}

export interface ContentProp {
  name: string
  description: string
  prompt: string
  aliases?: string[]
}

export interface ContentStoryboard {
  description: string
  prompt: string
  videoPrompt: string
  scene_id?: string
  characters?: string[]
  props?: string[]
  shotType?: string
  duration?: string
}

export interface ContentDubbing {
  character: string
  line: string
  emotion: string
  audio_prompt: string
}

export interface ContentData {
  characters: ContentCharacter[]
  scenes: ContentScene[]
  props: ContentProp[]
  storyboards: ContentStoryboard[]
  dubbing?: ContentDubbing[]
}

interface ContentResultDisplayProps {
  content: ContentData
  title?: string
  actions?: ReactNode
  extraSections?: ReactNode
  showExport?: boolean
}

export function ContentResultDisplay({
  content,
  title = '创作结果',
  actions,
  extraSections,
  showExport = false,
}: ContentResultDisplayProps) {
  const { toast } = useToast()

  const handleExportImagePrompts = async () => {
    const lines: string[] = []
    lines.push('========== 角色提示词 ==========')
    content.characters.forEach((char, index) => {
      lines.push(`【角色 ${index + 1}】${char.name}`)
      lines.push(`${char.prompt}`)
      if (char.wardrobeVariants) {
        lines.push(`${char.wardrobeVariants}`)
      }
    })

    lines.push('========== 场景提示词 ==========')
    content.scenes.forEach((scene, index) => {
      lines.push(`【场景 ${index + 1}】${scene.name}`)
      lines.push(`${scene.prompt}`)
    })

    lines.push('========== 道具提示词 ==========')
    content.props.forEach((prop, index) => {
      lines.push(`【道具 ${index + 1}】${prop.name}`)
      lines.push(`${prop.prompt}`)
    })

    lines.push('========== 分镜图片提示词 ==========')
    content.storyboards.forEach((sb, index) => {
      lines.push(`【分镜 ${index + 1}】`)
      lines.push(`${sb.prompt}`)
    })

    const fileContent = lines.join('\n')
    const defaultName = `生图提示词_${new Date().toISOString().slice(0, 10)}.txt`

    const savePath = await save({
      defaultPath: defaultName,
      filters: [{ name: '文本文件', extensions: ['txt'] }],
      title: '保存生图提示词',
    })

    if (!savePath) return

    const encoder = new TextEncoder()
    await writeFile(savePath, encoder.encode(fileContent))
    toast({ title: '导出成功', description: `已保存到 ${savePath}` })
  }

  const handleExportVideoPrompts = async () => {
    const lines: string[] = []
    content.storyboards.forEach((sb, index) => {
      lines.push(`【分镜 ${index + 1}】${sb.videoPrompt}`)
    })

    if (lines.length === 0) {
      toast({ title: '没有视频提示词可导出' })
      return
    }

    const fileContent = lines.join('\n')
    const defaultName = `视频提示词_${new Date().toISOString().slice(0, 10)}.txt`

    const savePath = await save({
      defaultPath: defaultName,
      filters: [{ name: '文本文件', extensions: ['txt'] }],
      title: '保存视频提示词',
    })

    if (!savePath) return

    const encoder = new TextEncoder()
    await writeFile(savePath, encoder.encode(fileContent))
    toast({ title: '导出成功', description: `已保存到 ${savePath}` })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{title}</span>
          <Badge variant="secondary">
            {content.characters.length}角色 · {content.scenes.length}场景 · {content.props.length}道具 · {content.storyboards.length}分镜
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {actions}

        {showExport && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleExportImagePrompts}>
              <FileText className="w-4 h-4 mr-2" />
              导出生图提示词
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportVideoPrompts}>
              <Video className="w-4 h-4 mr-2" />
              导出视频提示词
            </Button>
          </div>
        )}

        {extraSections}

        {content.characters.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-500" />
              角色设定
            </h3>
            {content.characters.map((char, index) => (
              <div key={index} className="p-4 bg-muted/30 rounded-lg space-y-3">
                <div className="font-medium text-base">{char.name}</div>
                <div className="text-sm text-muted-foreground">{char.description}</div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">当前状态剧照</div>
                  <div className="text-xs text-muted-foreground/70 bg-muted p-2 rounded">{char.prompt}</div>
                </div>
                {char.wardrobeVariants && (
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-purple-600">衍生衣橱（场景服装转变）</div>
                    <div className="text-xs text-muted-foreground/70 bg-purple-50 p-2 rounded border border-purple-100">{char.wardrobeVariants}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {content.scenes.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-green-500" />
              场景设定
            </h3>
            {content.scenes.map((scene, index) => (
              <div key={index} className="p-4 bg-muted/30 rounded-lg space-y-2">
                <div className="font-medium text-base">{scene.name}</div>
                <div className="text-sm text-muted-foreground">{scene.description}</div>
                <div className="text-xs text-muted-foreground/70 bg-muted p-2 rounded">
                  <span className="font-medium">生图提示词：</span>{scene.prompt}
                </div>
              </div>
            ))}
          </div>
        )}

        {content.props.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-orange-500" />
              道具设定
            </h3>
            {content.props.map((prop) => (
              <div key={prop.name} className="p-4 bg-muted/30 rounded-lg space-y-2">
                <div className="font-medium text-base">{prop.name}</div>
                <div className="text-sm text-muted-foreground">{prop.description}</div>
                <div className="text-xs text-muted-foreground/70 bg-muted p-2 rounded">
                  <span className="font-medium">生图提示词：</span>{prop.prompt}
                </div>
              </div>
            ))}
          </div>
        )}

        {content.storyboards.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              分镜脚本
            </h3>
            {content.storyboards.map((sb, index) => {
              const hasRefs = (sb.scene_id) || (sb.characters && sb.characters.length > 0) || (sb.props && sb.props.length > 0)
              return (
                <div key={`sb-${index}-${sb.scene_id || 'no-scene'}`} className="p-4 bg-muted/30 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-base">分镜 {index + 1}</div>
                    <div className="flex gap-1">
                      {sb.duration && (
                        <Badge variant="secondary" className="text-[10px]">{sb.duration}</Badge>
                      )}
                      {sb.shotType && (
                        <Badge variant="outline" className="text-[10px]">{sb.shotType}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">{sb.description}</div>
                  {hasRefs && (
                    <div className="flex flex-wrap gap-1">
                      {sb.scene_id && (
                        <Badge className="text-xs bg-green-100 text-green-700 hover:bg-green-100 border-green-200 shadow-none">
                          {sb.scene_id}
                        </Badge>
                      )}
                      {sb.characters && sb.characters.map((c, i) => (
                        <Badge key={`c-${i}`} className="text-xs bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200 shadow-none">
                          {c}
                        </Badge>
                      ))}
                      {sb.props && sb.props.map((p, i) => (
                        <Badge key={`p-${i}`} className="text-xs bg-orange-100 text-orange-700 hover:bg-orange-100 border-orange-200 shadow-none">
                          {p}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">首帧画面提示词</div>
                    <div className="text-xs text-muted-foreground/70 bg-muted p-2 rounded">{sb.prompt}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">视频动态提示词</div>
                    <div className="text-xs text-muted-foreground/70 bg-muted p-2 rounded">{sb.videoPrompt}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function ContentResultEmpty({
  icon,
  text = '暂无内容',
  subText,
}: {
  icon?: ReactNode
  text?: string
  subText?: string
}) {
  return (
    <Card>
      <CardContent className="py-12 text-center text-muted-foreground">
        {icon || <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />}
        <p>{text}</p>
        {subText && <p className="text-sm mt-2">{subText}</p>}
      </CardContent>
    </Card>
  )
}
