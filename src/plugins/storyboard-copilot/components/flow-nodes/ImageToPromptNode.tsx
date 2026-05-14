import { memo, useCallback, useState, useEffect, useRef } from 'react'
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react'
import { Sparkles, Copy, Check, ImageIcon, RotateCcw } from 'lucide-react'

import { cn } from '@/lib/utils'
import { getImageUrl } from '@/utils/asset'
import { useToast } from '@/hooks/useToast'
import { useUpstreamData } from '../../hooks/useUpstreamData'
import { AI } from '@/services/vendor'

import type { ImageToPromptNodeData } from '../../types'
import {
  getNodeContainerClass,
  getSourceHandleClass,
  getTargetHandleClass,
  NODE_MIN_WIDTH,
  NODE_MIN_HEIGHT,
} from './NodeStyles'
import { NodeResizeHandle } from './NodeResizeHandle'
import { useEnlargedHandles } from '../../hooks/useEnlargedHandles'

interface ImageToPromptNodeProps extends NodeProps {
  data: ImageToPromptNodeData
}

// 参考 iv2prompt 项目的图片反推提示词
const IMAGE_ANALYSIS_PROMPT = `你是专业的图像内容分析师，请分析这个内容，反推出用于 AI 生成类似内容的提示词。

请严格按以下 JSON 格式输出，不要输出其他内容：
{
  "zh": "中文提示词，详细描述画面内容、风格、构图、色调、氛围等",
  "en": "English prompt, detailed description of content, style, composition, color tone, atmosphere etc.",
  "json": {
    "subject": "主体描述",
    "style": "风格",
    "composition": "构图",
    "lighting": "光线",
    "color_tone": "色调",
    "atmosphere": "氛围",
    "details": "细节"
  },
  "tags": ["标签1", "标签2", "标签3"]
}`

export const ImageToPromptNode = memo(({ id, data, selected }: ImageToPromptNodeProps) => {
  const { updateNodeData } = useReactFlow()
  const { toast } = useToast()
  const [activeLang, setActiveLang] = useState<'zh' | 'en' | 'json'>('zh')
  const [copied, setCopied] = useState(false)
  const { getUpstreamImageData, upstreamImage } = useUpstreamData(id)
  const upstreamImageRef = useRef<string | null>(null)
  const enlargedHandles = useEnlargedHandles(id)

  useEffect(() => {
    if (upstreamImage && !data.imageUrl) {
      upstreamImageRef.current = upstreamImage
      updateNodeData(id, { ...data, imageUrl: upstreamImage })
    } else if (!upstreamImage && upstreamImageRef.current && data.imageUrl === upstreamImageRef.current) {
      upstreamImageRef.current = null
      updateNodeData(id, { ...data, imageUrl: null })
    }
  }, [upstreamImage, data, id, updateNodeData])

  // 将图片转为 base64（data URL 直接返回，其他 URL 用 fetch）
  const imageToBase64 = useCallback(async (url: string): Promise<string> => {
    if (url.startsWith('data:')) return url
    const response = await fetch(url)
    const blob = await response.blob()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('图片转换失败'))
      reader.readAsDataURL(blob)
    })
  }, [])

  // 分析图片 - 复用 AI.VL.analyze，将图片转为 base64 嵌入消息
  const handleAnalyze = useCallback(async () => {
    if (!data.imageUrl) {
      toast({ title: '请先上传或连接图片', variant: 'destructive' })
      return
    }

    updateNodeData(id, { ...data, isAnalyzing: true })

    try {
      // 获取图片的 asset URL 并转为 base64
      const imageUrl = getImageUrl(data.imageUrl)
      if (!imageUrl) throw new Error('图片路径无效')

      const base64Image = await imageToBase64(imageUrl)

      // 复用 AI.VL.analyze 进行视觉分析
      // 将 base64 图片嵌入到消息 content 中，供应商代码会自动识别并转为多模态格式
      const result = await AI.VL.analyze({
        messages: [
          { role: 'user', content: IMAGE_ANALYSIS_PROMPT },
          { role: 'user', content: base64Image }
        ],
        temperature: 0.7,
        maxTokens: 2048,
      })

      // 解析结果 - result 是字符串
      const content = typeof result === 'string' ? result : ''
      const parsed = parseAnalysisResult(content)

      // 将结果保存到 prompt 字段，方便下游节点通过 useUpstreamData 获取
      const promptText = parsed.zh || parsed.en || ''
      
      updateNodeData(id, {
        ...data,
        promptZh: parsed.zh,
        promptEn: parsed.en,
        prompt: promptText, // 下游节点通过 getUpstreamTextData() 获取
        tags: parsed.tags,
        jsonResult: parsed.json,
        isAnalyzing: false,
      })

      toast({ title: '分析完成' })
    } catch (error) {
      console.error('分析失败:', error)
      updateNodeData(id, { ...data, isAnalyzing: false })
      toast({ title: '分析失败', description: String(error), variant: 'destructive' })
    }
  }, [data, id, imageToBase64, toast, updateNodeData])

  // 复制结果
  const handleCopy = useCallback(() => {
    const text = activeLang === 'json'
      ? JSON.stringify(data.jsonResult, null, 2)
      : (activeLang === 'zh' ? data.promptZh : data.promptEn)

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
      toast({ title: '已复制到剪贴板' })
    })
  }, [activeLang, data.jsonResult, data.promptEn, data.promptZh, toast])

  // 清空重新分析
  const handleReset = useCallback(() => {
    updateNodeData(id, {
      ...data,
      promptZh: '',
      promptEn: '',
      tags: [],
      jsonResult: {},
    })
  }, [data, id, updateNodeData])

  const hasResult = data.promptZh || data.promptEn

  return (
    <div
      className={getNodeContainerClass(selected)}
      style={{ width: 360, height: hasResult ? 420 : 200 }}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-3 py-2 text-xs font-medium border-b bg-muted/30 node-header">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>图片反推提示词</span>
        </div>
        <div className="flex items-center gap-1">
          {hasResult && (
            <button
              onClick={handleReset}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1 hover:bg-muted rounded transition-colors"
              title="重新分析"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
          {data.imageUrl && !data.isAnalyzing && (
            <button
              onClick={handleAnalyze}
              onPointerDown={(e) => e.stopPropagation()}
              className="px-2 py-0.5 bg-primary text-primary-foreground rounded text-[10px] hover:bg-primary/90 transition-colors"
            >
              分析
            </button>
          )}
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex flex-col h-full">
        {/* 图片预览 */}
        {data.imageUrl ? (
          <div className="relative h-32 bg-black/5">
            <img
              src={getImageUrl(data.imageUrl) || ''}
              alt="待分析图片"
              className="w-full h-full object-contain"
            />
            {data.isAnalyzing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span className="text-white text-xs mt-2">分析中...</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImageIcon className="h-8 w-8 opacity-40" />
            <span className="text-xs">连接上游图片或上传</span>
          </div>
        )}

        {/* 分析结果 */}
        {hasResult && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* 语言切换 */}
            <div className="flex items-center gap-1 p-2 border-b">
              {(['zh', 'en', 'json'] as const).map((lang) => (
                <button
                key={lang}
                onClick={() => setActiveLang(lang)}
                onPointerDown={(e) => e.stopPropagation()}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                  activeLang === lang
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                {lang === 'zh' ? '中文' : lang === 'en' ? 'English' : 'JSON'}
              </button>
              ))}
              <button
                onClick={handleCopy}
                onPointerDown={(e) => e.stopPropagation()}
                className="ml-auto p-1 hover:bg-muted rounded transition-colors"
                title="复制"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            {/* 提示词内容 */}
            <div className="flex-1 p-3 overflow-y-auto">
              {activeLang === 'json' ? (
                <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-all">
                  {JSON.stringify(data.jsonResult, null, 2)}
                </pre>
              ) : (
                <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                  {activeLang === 'zh' ? data.promptZh : data.promptEn}
                </p>
              )}
            </div>

            {/* 标签 */}
            {data.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 p-2 border-t">
                {data.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="px-1.5 py-0.5 bg-muted rounded text-[9px] text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 输入端口 */}
      <Handle
        type="target"
        id="target"
        position={Position.Left}
        className={getTargetHandleClass(undefined, enlargedHandles.target)}
      />

      {/* 输出端口 */}
      <Handle
        type="source"
        id="prompt"
        position={Position.Right}
        className={getSourceHandleClass(undefined, enlargedHandles.source)}
      />

      {/* 缩放手柄 */}
      <NodeResizeHandle
        minWidth={NODE_MIN_WIDTH}
        minHeight={NODE_MIN_HEIGHT}
        maxWidth={600}
        maxHeight={600}
      />
    </div>
  )
})

ImageToPromptNode.displayName = 'ImageToPromptNode'

// 解析分析结果 - 复用 analysisService 中的解析逻辑
function parseAnalysisResult(content: string) {
  const result = {
    zh: '',
    en: '',
    json: {} as Record<string, unknown>,
    tags: [] as string[],
  }

  try {
    // 尝试提取 JSON
    let jsonStr: string | undefined = content
    const mdMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    if (mdMatch) {
      jsonStr = mdMatch[1]
    } else {
      const startIndex = content.indexOf('{')
      const endIndex = content.lastIndexOf('}')
      if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
        jsonStr = content.substring(startIndex, endIndex + 1)
      }
    }

    if (jsonStr) {
      const parsed = JSON.parse(jsonStr)
      result.zh = parsed.zh || ''
      result.en = parsed.en || ''
      result.json = parsed.json || {}
      result.tags = parsed.tags || []
    }
  } catch (e) {
    // 如果解析失败，使用原始内容作为中文提示词
    result.zh = content
  }

  return result
}
