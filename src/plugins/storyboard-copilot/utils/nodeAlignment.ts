import type { Node } from '@xyflow/react'

export type AlignDirection = 'left' | 'right' | 'top' | 'bottom' | 'center' | 'middle'
export type DistributeDirection = 'horizontal' | 'vertical'

/**
 * 对齐节点
 * @param nodes 要对齐的节点
 * @param direction 对齐方向
 * @returns 更新后的节点位置
 */
export function alignNodes<T extends Node>(
  nodes: T[],
  direction: AlignDirection
): T[] {
  if (nodes.length < 2) return nodes

  const positions = nodes.map((node) => ({
    id: node.id,
    x: node.position.x,
    y: node.position.y,
    width: node.width || 220,
    height: node.height || 280,
  }))

  let targetValue: number

  switch (direction) {
    case 'left':
      targetValue = Math.min(...positions.map((p) => p.x))
      return nodes.map((node) => ({
        ...node,
        position: { ...node.position, x: targetValue },
      }))

    case 'right':
      targetValue = Math.max(...positions.map((p) => p.x + p.width))
      return nodes.map((node) => ({
        ...node,
        position: {
          ...node.position,
          x: targetValue - (node.width || 220),
        },
      }))

    case 'top':
      targetValue = Math.min(...positions.map((p) => p.y))
      return nodes.map((node) => ({
        ...node,
        position: { ...node.position, y: targetValue },
      }))

    case 'bottom':
      targetValue = Math.max(...positions.map((p) => p.y + p.height))
      return nodes.map((node) => ({
        ...node,
        position: {
          ...node.position,
          y: targetValue - (node.height || 280),
        },
      }))

    case 'center':
      // 水平居中
      const minX = Math.min(...positions.map((p) => p.x))
      const maxX = Math.max(...positions.map((p) => p.x + p.width))
      targetValue = (minX + maxX) / 2
      return nodes.map((node) => ({
        ...node,
        position: {
          ...node.position,
          x: targetValue - (node.width || 220) / 2,
        },
      }))

    case 'middle':
      // 垂直居中
      const minY = Math.min(...positions.map((p) => p.y))
      const maxY = Math.max(...positions.map((p) => p.y + p.height))
      targetValue = (minY + maxY) / 2
      return nodes.map((node) => ({
        ...node,
        position: {
          ...node.position,
          y: targetValue - (node.height || 280) / 2,
        },
      }))

    default:
      return nodes
  }
}

/**
 * 分布节点
 * @param nodes 要分布的节点
 * @param direction 分布方向
 * @returns 更新后的节点位置
 */
export function distributeNodes<T extends Node>(
  nodes: T[],
  direction: DistributeDirection
): T[] {
  if (nodes.length < 3) return nodes

  const sortedNodes = [...nodes].sort((a, b) => {
    if (direction === 'horizontal') {
      return a.position.x - b.position.x
    } else {
      return a.position.y - b.position.y
    }
  })

  const positions = sortedNodes.map((node) => ({
    id: node.id,
    x: node.position.x,
    y: node.position.y,
    width: node.width || 220,
    height: node.height || 280,
  }))

  if (direction === 'horizontal') {
    const firstPos = positions[0]
    const lastPos = positions[positions.length - 1]
    if (!firstPos || !lastPos) return nodes
    const minX = firstPos.x
    const maxX = lastPos.x + lastPos.width
    const totalWidth = maxX - minX
    const totalNodesWidth = positions.reduce((sum, p) => sum + p.width, 0)
    const gap = (totalWidth - totalNodesWidth) / (nodes.length - 1)

    let currentX = minX
    return sortedNodes.map((node, _index) => {
      const newNode = {
        ...node,
        position: { ...node.position, x: currentX },
      }
      currentX += (node.width || 220) + gap
      return newNode
    })
  } else {
    const firstPos = positions[0]
    const lastPos = positions[positions.length - 1]
    if (!firstPos || !lastPos) return nodes
    const minY = firstPos.y
    const maxY = lastPos.y + lastPos.height
    const totalHeight = maxY - minY
    const totalNodesHeight = positions.reduce((sum, p) => sum + p.height, 0)
    const gap = (totalHeight - totalNodesHeight) / (nodes.length - 1)

    let currentY = minY
    return sortedNodes.map((node, _index) => {
      const newNode = {
        ...node,
        position: { ...node.position, y: currentY },
      }
      currentY += (node.height || 280) + gap
      return newNode
    })
  }
}

/**
 * 获取选中节点的边界框
 */
export function getNodesBoundingBox(nodes: Node[]) {
  if (nodes.length === 0) return null

  const positions = nodes.map((node) => ({
    x: node.position.x,
    y: node.position.y,
    width: node.width || 220,
    height: node.height || 280,
  }))

  const minX = Math.min(...positions.map((p) => p.x))
  const minY = Math.min(...positions.map((p) => p.y))
  const maxX = Math.max(...positions.map((p) => p.x + p.width))
  const maxY = Math.max(...positions.map((p) => p.y + p.height))

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  }
}
