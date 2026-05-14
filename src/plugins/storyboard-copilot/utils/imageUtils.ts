// 图片工具函数

// 解析宽高比
export function parseAspectRatio(aspectRatio: string): number {
  const [w = '1', h = '1'] = aspectRatio.split(':')
  const width = parseFloat(w) || 1
  const height = parseFloat(h) || 1
  return width / height
}

// 根据宽高比计算合适的尺寸
export function resolveMinEdgeFittedSize(
  aspectRatio: string,
  constraints: { minWidth: number; minHeight: number }
): { width: number; height: number } {
  const ratio = parseAspectRatio(aspectRatio)
  const { minWidth, minHeight } = constraints

  if (ratio >= 1) {
    return {
      width: Math.round(minHeight * ratio),
      height: minHeight,
    }
  } else {
    return {
      width: minWidth,
      height: Math.round(minWidth / ratio),
    }
  }
}

// 解析节点尺寸
export function resolveNodeDimension(value: number | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 1) {
    return Math.round(value)
  }
  return fallback
}

// 检查是否有矩形碰撞
export function hasRectCollision(
  candidateRect: { x: number; y: number; width: number; height: number },
  nodes: Array<{ position: { x: number; y: number }; width?: number; height?: number }>,
  ignoreNodeIds: Set<string>,
  margin = 18
): boolean {
  return nodes.some((node) => {
    if (ignoreNodeIds.has((node as any).id)) {
      return false
    }
    const size = {
      width: node.width || 200,
      height: node.height || 200,
    }
    return (
      candidateRect.x < node.position.x + size.width + margin &&
      candidateRect.x + candidateRect.width + margin > node.position.x &&
      candidateRect.y < node.position.y + size.height + margin &&
      candidateRect.y + candidateRect.height + margin > node.position.y
    )
  })
}

// 深拷贝
export function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value)) as T
}

// 截断文本
export function truncateText(value: string, max = 200): string {
  if (value.length <= max) {
    return value
  }
  return `${value.slice(0, max)}...(${value.length} chars)`
}

// 截断Base64
export function truncateBase64Like(value: string): string {
  if (!value) {
    return value
  }

  const BASE64_PREVIEW_HEAD = 96
  const BASE64_PREVIEW_TAIL = 24

  if (value.startsWith('data:')) {
    const [meta, payload = ''] = value.split(',', 2)
    if (payload.length <= BASE64_PREVIEW_HEAD + BASE64_PREVIEW_TAIL) {
      return value
    }
    return `${meta},${payload.slice(0, BASE64_PREVIEW_HEAD)}...${payload.slice(-BASE64_PREVIEW_TAIL)}(${payload.length} chars)`
  }

  const base64Like = /^[A-Za-z0-9+/=]+$/.test(value) && value.length > 256
  if (!base64Like) {
    return truncateText(value, 280)
  }

  return `${value.slice(0, BASE64_PREVIEW_HEAD)}...${value.slice(-BASE64_PREVIEW_TAIL)}(${value.length} chars)`
}
