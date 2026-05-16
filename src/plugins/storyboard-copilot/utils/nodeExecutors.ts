// 节点执行器 - 定义每个节点类型的执行逻辑
import { useToast } from '@/hooks/useToast'
import { useGeneration } from '../hooks/useGeneration'
import { getImageUrl } from '@/utils/asset'
import type { CanvasNode } from '../types'
import { CANVAS_NODE_TYPES } from '../types'
import type { NodeExecutor, ExecutionContext } from '../hooks/useComfyWorkflowEngine'

// 创建节点执行器的 Hook
export function useNodeExecutors() {
  const { toast: _toast } = useToast()
  const { generateImage, generateImageEdit } = useGeneration()

  // 创建执行器映射
  const createExecutors = (nodes: CanvasNode[]): Map<string, NodeExecutor> => {
    const executors = new Map<string, NodeExecutor>()

    nodes.forEach((node) => {
      const executor = createExecutorForNode(node)
      if (executor) {
        executors.set(node.id, executor)
      }
    })

    return executors
  }

  // 根据节点类型创建对应的执行器
  const createExecutorForNode = (node: CanvasNode): NodeExecutor | null => {
    switch (node.type) {
      case CANVAS_NODE_TYPES.upload:
        return createUploadExecutor(node)
      case CANVAS_NODE_TYPES.imageEdit:
        return createAIGenExecutor(node, generateImage)
      case CANVAS_NODE_TYPES.aiImageEdit:
        return createAIEditExecutor(node, generateImageEdit)
      case CANVAS_NODE_TYPES.storyboardSplit:
        return createStoryboardSplitExecutor(node)
      case CANVAS_NODE_TYPES.sceneDirector:
        return createSceneDirectorExecutor(node)
      case CANVAS_NODE_TYPES.textAnnotation:
        return createTextAnnotationExecutor(node)
      case CANVAS_NODE_TYPES.upscale:
        return createUpscaleExecutor(node)
      default:
        return null
    }
  }

  return { createExecutors }
}

// 上传节点执行器 - 只是传递数据
function createUploadExecutor(node: CanvasNode): NodeExecutor {
  return async (_nodeId: string, _inputData: unknown, _context: ExecutionContext) => {
    const data = node.data as { imageUrl?: string }
    if (!data.imageUrl) {
      throw new Error('没有上传图片')
    }
    return { imageUrl: data.imageUrl }
  }
}

// 图片生成节点执行器
function createAIGenExecutor(
  node: CanvasNode,
  generateImage: ReturnType<typeof useGeneration>['generateImage']
): NodeExecutor {
  return async (nodeId: string, _inputData: unknown, context: ExecutionContext) => {
    const data = node.data as {
      prompt?: string
      model?: string
      aspectRatio?: string
    }

    if (!data.prompt) {
      throw new Error('请输入提示词')
    }

    // 更新进度
    context.updateNodeState(nodeId, { progress: 10 })

    const result = await generateImage(
      data.prompt,
      data.model || 'default',
      {}
    )

    context.updateNodeState(nodeId, { progress: 90 })

    if (!result.success || !result.imageUrl) {
      throw new Error(result.error || '生成失败')
    }

    // 更新节点数据
    node.data.imageUrl = result.imageUrl
    node.data.previewImageUrl = result.imageUrl

    context.updateNodeState(nodeId, { progress: 100 })

    return { imageUrl: result.imageUrl }
  }
}

// AI编辑节点执行器
function createAIEditExecutor(
  node: CanvasNode,
  generateImageEdit: ReturnType<typeof useGeneration>['generateImageEdit']
): NodeExecutor {
  return async (nodeId: string, inputData: unknown, context: ExecutionContext) => {
    const data = node.data as {
      prompt?: string
      imageUrl?: string
      maskImage?: string
      referenceImages?: string[]
    }

    // 获取输入图片（来自上游节点）
    const inputImage = inputData && typeof inputData === 'object' 
      ? (inputData as { imageUrl?: string }).imageUrl 
      : undefined

    const targetImage = data.imageUrl || inputImage

    if (!targetImage) {
      throw new Error('请先连接原图')
    }

    if (!data.prompt) {
      throw new Error('请输入编辑提示词')
    }

    context.updateNodeState(nodeId, { progress: 10 })

    const result = await generateImageEdit({
      prompt: data.prompt,
      imageUrl: targetImage,
      maskImage: data.maskImage,
      referenceImages: data.referenceImages,
    })

    context.updateNodeState(nodeId, { progress: 90 })

    if (!result.success || !result.imageUrl) {
      throw new Error(result.error || '编辑失败')
    }

    // 更新节点数据
    node.data.imageUrl = result.imageUrl
    node.data.previewImageUrl = result.imageUrl

    context.updateNodeState(nodeId, { progress: 100 })

    return { imageUrl: result.imageUrl }
  }
}

// 分镜拆分节点执行器
function createStoryboardSplitExecutor(node: CanvasNode): NodeExecutor {
  return async (nodeId: string, inputData: unknown, context: ExecutionContext) => {
    const data = node.data as {
      frames?: Array<{ id: string; imageUrl: string | null; note: string }>
      gridRows?: number
      gridCols?: number
    }

    const inputImage = inputData && typeof inputData === 'object'
      ? (inputData as { imageUrl?: string; frames?: Array<{ id: string; imageUrl: string | null; note: string }> }).imageUrl
      : undefined

    const inputFrames = inputData && typeof inputData === 'object'
      ? (inputData as { frames?: Array<{ id: string; imageUrl: string | null; note: string }> }).frames
      : undefined

    context.updateNodeState(nodeId, { progress: 10, status: '准备中' })

    // 多图连接 → 直接替换子图（不拆分）
    const allOutputs = context.getAllUpstreamOutputs()
    const imageOutputs = allOutputs.filter((o): o is { imageUrl: string } =>
      o != null && typeof o === 'object' && 'imageUrl' in (o as Record<string, unknown>)
    )
    if (imageOutputs.length > 1) {
      const frames = imageOutputs.map((output, i) => ({
        id: `frame-multi-${i}-${Date.now()}`,
        imageUrl: output.imageUrl,
        note: `分镜 ${i + 1}`,
      }))
      node.data.frames = frames
      node.data.gridRows = 1
      node.data.gridCols = frames.length
      context.updateNodeState(nodeId, { progress: 100, status: `已替换 ${frames.length} 个子图` })
      return { frames, inputFrames: frames, gridRows: 1, gridCols: frames.length }
    }

    // 如果有输入帧，合并为一张图片
    if (inputFrames && inputFrames.length > 0) {
      const mergedImageUrl = await mergeFramesToImage(inputFrames, data.gridRows || 1, data.gridCols || inputFrames.length)
      node.data.frames = inputFrames
      node.data.imageUrl = mergedImageUrl
      context.updateNodeState(nodeId, { progress: 100, status: '拆分完成' })
      return {
        frames: inputFrames,
        gridRows: data.gridRows || 1,
        gridCols: data.gridCols || inputFrames.length,
        imageUrl: mergedImageUrl,
      }
    }

    // 单图输入 → 拆分
    if (inputImage) {
      const rows = data.gridRows || 2
      const cols = data.gridCols || 2

      context.updateNodeState(nodeId, { progress: 30, status: '加载图片...' })

      try {
        const displayUrl = getImageUrl(inputImage)
        if (!displayUrl) {
          throw new Error('无法获取图片 URL')
        }

        const img = new Image()
        if (!displayUrl.startsWith('asset://')) {
          img.crossOrigin = 'anonymous'
        }
        await new Promise((resolve, reject) => {
          img.onload = resolve
          img.onerror = reject
          img.src = displayUrl
        })

        context.updateNodeState(nodeId, { progress: 50, status: '切割图片...' })

        const { naturalWidth: width, naturalHeight: height } = img
        const cellWidth = width / cols
        const cellHeight = height / rows

        const frames: Array<{ id: string; imageUrl: string; note: string }> = []

        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const canvas = document.createElement('canvas')
            canvas.width = Math.floor(cellWidth)
            canvas.height = Math.floor(cellHeight)
            const ctx = canvas.getContext('2d')!

            ctx.drawImage(
              img,
              col * cellWidth,
              row * cellHeight,
              cellWidth,
              cellHeight,
              0,
              0,
              cellWidth,
              cellHeight
            )

            const dataUrl = canvas.toDataURL('image/png')

            frames.push({
              id: `frame-${row}-${col}-${Date.now()}`,
              imageUrl: dataUrl,
              note: `分镜 ${row + 1}-${col + 1}`,
            })

            context.updateNodeState(nodeId, {
              progress: 50 + Math.round(((row * cols + col + 1) / (rows * cols)) * 40),
              status: `切割中... ${row * cols + col + 1}/${rows * cols}`,
            })
          }
        }

        node.data.frames = frames
        node.data.gridRows = rows
        node.data.gridCols = cols

        const mergedImageUrl = await mergeFramesToImage(frames, rows, cols)
        node.data.imageUrl = mergedImageUrl

        context.updateNodeState(nodeId, { progress: 100, status: '拆分完成' })

        return {
          frames,
          gridRows: rows,
          gridCols: cols,
          imageUrl: mergedImageUrl, // 同时返回合并后的图片，供下游节点使用
        }
      } catch (error) {
        console.error('图片切割失败:', error)
        context.updateNodeState(nodeId, { progress: 0, status: '切割失败' })
        throw new Error('图片切割失败: ' + (error instanceof Error ? error.message : '未知错误'))
      }
    }

    // 使用现有数据
    const existingFrames = data.frames || []
    let mergedImageUrl: string | undefined
    
    if (existingFrames.length > 0) {
      mergedImageUrl = await mergeFramesToImage(existingFrames, data.gridRows || 1, data.gridCols || 1)
      // 更新节点数据，使下游节点可以读取
      node.data.imageUrl = mergedImageUrl
    }
    
    context.updateNodeState(nodeId, { progress: 100, status: '拆分完成' })
    return {
      frames: existingFrames,
      gridRows: data.gridRows || 1,
      gridCols: data.gridCols || 1,
      imageUrl: mergedImageUrl, // 同时返回合并后的图片，供下游节点使用
    }
  }
}

// 辅助函数：将帧合并为一张图片
async function mergeFramesToImage(
  frames: Array<{ id: string; imageUrl: string | null; note: string }>,
  rows: number,
  cols: number
): Promise<string | undefined> {
  if (frames.length === 0 || !frames.some(f => f.imageUrl)) {
    return undefined
  }

  try {
    // 计算画布尺寸
    const frameWidth = 400
    const frameHeight = 300
    const gap = 10
    const padding = 20

    const canvas = document.createElement('canvas')
    canvas.width = cols * frameWidth + (cols - 1) * gap + padding * 2
    canvas.height = rows * frameHeight + (rows - 1) * gap + padding * 2 + rows * 30
    const ctx = canvas.getContext('2d')!

    if (!ctx) {
      throw new Error('无法获取 canvas 上下文')
    }

    // 填充背景
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // 加载并绘制每个帧
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i]
      if (!frame || !frame.imageUrl) continue

      const row = Math.floor(i / cols)
      const col = i % cols
      const x = padding + col * (frameWidth + gap)
      const y = padding + row * (frameHeight + gap + 30)

      try {
        // 绘制图片
        const img = new Image()
        const resolvedUrl = getImageUrl(frame.imageUrl) || frame.imageUrl
        if (resolvedUrl && !resolvedUrl.startsWith('asset://') && !resolvedUrl.startsWith('data:')) {
          img.crossOrigin = 'anonymous'
        }

        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error(`图片 ${i} 加载失败`))
          img.src = resolvedUrl
        })

        // 绘制图片（保持比例填充）
        const scale = Math.min(frameWidth / img.width, frameHeight / img.height)
        const drawWidth = img.width * scale
        const drawHeight = img.height * scale
        const drawX = x + (frameWidth - drawWidth) / 2
        const drawY = y + (frameHeight - drawHeight) / 2

        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight)
      } catch (imgError) {
        console.error(`绘制图片 ${i} 失败:`, imgError)
        ctx.fillStyle = '#fee2e2'
        ctx.fillRect(x, y, frameWidth, frameHeight)
      }

      // 绘制边框
      ctx.strokeStyle = '#e5e7eb'
      ctx.lineWidth = 1
      ctx.strokeRect(x, y, frameWidth, frameHeight)

      // 绘制序号
      ctx.fillStyle = '#3b82f6'
      ctx.beginPath()
      ctx.arc(x + 15, y + 15, 12, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(i + 1), x + 15, y + 15)

      // 绘制备注
      if (frame.note) {
        ctx.fillStyle = '#374151'
        ctx.font = '12px sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText(frame.note, x, y + frameHeight + 18)
      }
    }

    // 返回 base64
    return canvas.toDataURL('image/png')
  } catch (error) {
    console.error('合并图片失败:', error)
    return undefined
  }
}

// 场景导演节点执行器
function createSceneDirectorExecutor(node: CanvasNode): NodeExecutor {
  return async (nodeId: string, inputData: unknown, context: ExecutionContext) => {
    const data = node.data as {
      prompt?: string
      style?: string
      panoramaUrl?: string
      imageUrl?: string
      characters?: Array<{
        id: string
        name: string
        imageUrl: string
        position?: { x: number; y: number; z: number }
      }>
      screenshots?: Array<{
        id: string
        dataUrl: string
        timestamp: number
      }>
    }

    context.updateNodeState(nodeId, { progress: 20, status: '准备场景' })

    const inputImage = inputData && typeof inputData === 'object'
      ? (inputData as { imageUrl?: string }).imageUrl
      : undefined

    if (inputImage && !data.panoramaUrl) {
      node.data.panoramaUrl = inputImage
      context.updateNodeState(nodeId, { progress: 50, status: '已加载场景背景' })
    }

    context.updateNodeState(nodeId, { progress: 100, status: '场景准备完成' })

    const latestScreenshot = data.screenshots?.[data.screenshots.length - 1]

    return {
      imageUrl: data.imageUrl || latestScreenshot?.dataUrl || null,
      prompt: data.prompt,
      style: data.style,
      panoramaUrl: data.panoramaUrl || inputImage,
      characters: data.characters || [],
      screenshots: data.screenshots || [],
    }
  }
}

// 文本注释节点执行器
function createTextAnnotationExecutor(node: CanvasNode): NodeExecutor {
  return async (nodeId: string, _inputData: unknown, context: ExecutionContext) => {
    const data = node.data as {
      text?: string
      color?: string
    }

    context.updateNodeState(nodeId, { progress: 100 })

    return { text: data.text, color: data.color }
  }
}

// 分组节点执行器
// 图片放大节点执行器
function createUpscaleExecutor(node: CanvasNode): NodeExecutor {
  return async (nodeId: string, inputData: unknown, context: ExecutionContext) => {
    const data = node.data as {
      imageUrl?: string
      scale?: number
    }

    // 获取输入图片
    const inputImage = inputData && typeof inputData === 'object'
      ? (inputData as { imageUrl?: string }).imageUrl
      : undefined

    const targetImage = data.imageUrl || inputImage

    if (!targetImage) {
      throw new Error('请连接图片')
    }

    // 触发节点执行
    node.data._executeTrigger = Date.now()

    context.updateNodeState(nodeId, { progress: 10, status: '准备放大' })

    // 节点内部会处理实际的放大逻辑
    // 这里只是触发执行

    context.updateNodeState(nodeId, { progress: 100, status: '放大完成' })

    return { imageUrl: targetImage, scale: data.scale || 2 }
  }
}
