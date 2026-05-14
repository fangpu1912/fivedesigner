import { useCallback, useEffect, useState, memo } from 'react'
import { useReactFlow, useStore } from '@xyflow/react'
import { Plus } from 'lucide-react'

import type { CanvasNodeType, CanvasNode, CanvasNodeData } from '../types'
import { CANVAS_NODE_TYPES } from '../types'
import {
  getDefaultNodeProperties,
  getDefaultNodeDimensions,
  createDefaultFrames,
  generateNodeId,
  generateEdgeId,
  getNodeDefinition,
} from '../utils/nodeDefinitions'
import { QuickNodeMenu } from './QuickNodeMenu'
import type { Edge, Node } from '@xyflow/react'

interface SelectionDragOutProps {
  selectedNodeIds: Set<string>
  nodes: Node[]
}

export const SelectionDragOut = memo(function SelectionDragOut({
  selectedNodeIds,
  nodes,
}: SelectionDragOutProps) {
  const { screenToFlowPosition, addNodes, addEdges } = useReactFlow()
  const transform = useStore((s) => s.transform)
  const [isDragging, setIsDragging] = useState(false)
  const [dragFlowPos, setDragFlowPos] = useState<{ x: number; y: number } | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const [menuScreenPos, setMenuScreenPos] = useState<{ x: number; y: number } | null>(null)

  const selectedNodes = nodes.filter((n) => selectedNodeIds.has(n.id))

  const getBbox = useCallback(() => {
    if (selectedNodes.length < 2) return null
    const minX = Math.min(...selectedNodes.map((n) => n.position.x))
    const minY = Math.min(...selectedNodes.map((n) => n.position.y))
    const maxX = Math.max(...selectedNodes.map((n) => n.position.x + (n.width || 300)))
    const maxY = Math.max(...selectedNodes.map((n) => n.position.y + (n.height || 200)))
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY, right: maxX, bottom: maxY }
  }, [selectedNodes])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      setIsDragging(true)
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      setDragFlowPos(flowPos)
    },
    [screenToFlowPosition]
  )

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      setDragFlowPos(flowPos)
    }

    const handleMouseUp = (e: MouseEvent) => {
      setIsDragging(false)
      setShowMenu(true)
      setMenuScreenPos({ x: e.clientX, y: e.clientY })
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, screenToFlowPosition])

  const handleSelectNodeType = useCallback(
    (targetNodeType: CanvasNodeType) => {
      setShowMenu(false)
      if (selectedNodes.length === 0) return

      const targetDef = getNodeDefinition(targetNodeType)
      if (!targetDef) return

      const b = getBbox()
      if (!b) return

      const dropFlowPos = menuScreenPos
        ? screenToFlowPosition({ x: menuScreenPos.x, y: menuScreenPos.y })
        : { x: b.right + 80, y: b.y + b.height / 2 }

      const newNodeId = generateNodeId()
      const dims = getDefaultNodeDimensions(targetNodeType)
      const newNode: CanvasNode = {
        id: newNodeId,
        type: targetNodeType,
        position: {
          x: dropFlowPos.x - (dims?.width || 300) / 2,
          y: dropFlowPos.y - (dims?.height || 200) / 2,
        },
        data: {
          ...getDefaultNodeProperties(targetNodeType),
          ...(targetNodeType === CANVAS_NODE_TYPES.storyboardSplit
            ? { frames: createDefaultFrames(2, 2) }
            : {}),
        } as CanvasNodeData,
        width: dims?.width,
        height: dims?.height,
        dragHandle: '.node-header' as const,
      }

      addNodes([newNode])

      const newEdges: Edge[] = []
      for (const srcNode of selectedNodes) {
        const srcDef = getNodeDefinition(srcNode.type as CanvasNodeType)
        const srcOutputs = srcDef?.outputs || []
        const tgtInputs = targetDef.inputs || []

        let sourceHandle: string | undefined
        let targetHandle: string | undefined

        const srcOutput = srcOutputs[0]
        if (srcOutput) {
          sourceHandle = srcOutput.id
        }

        const matchingInput = tgtInputs.find((inp) => {
          if (!srcOutput) return false
          return inp.type === srcOutput.type || inp.type === 'data'
        })
        if (matchingInput) {
          targetHandle = matchingInput.id
        } else if (tgtInputs.length > 0 && tgtInputs[0]) {
          targetHandle = tgtInputs[0].id
        }

        if (sourceHandle && targetHandle) {
          newEdges.push({
            id: generateEdgeId(srcNode.id, newNodeId),
            source: srcNode.id,
            target: newNodeId,
            sourceHandle,
            targetHandle,
            type: 'custom' as const,
          })
        }
      }

      if (newEdges.length > 0) {
        requestAnimationFrame(() => {
          addEdges(newEdges)
        })
      }
    },
    [selectedNodes, getBbox, menuScreenPos, screenToFlowPosition, addNodes, addEdges]
  )

  if (selectedNodes.length === 0) return null

  const b = getBbox()
  if (!b) return null

  const handleFlowX = b.right + 12
  const handleFlowY = b.y + b.height / 2

  const [tx, ty, scale] = transform
  const handleScreenX = handleFlowX * scale + tx
  const handleScreenY = handleFlowY * scale + ty

  return (
    <>
      <div
        className="absolute cursor-crosshair nodrag nopan"
        style={{
          left: handleScreenX,
          top: handleScreenY,
          transform: 'translate(-50%, -50%)',
          zIndex: 50,
        }}
        onMouseDown={handleMouseDown}
        onPointerDown={(e) => e.stopPropagation()}
        title="拖出连接到新节点"
      >
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground shadow-md hover:scale-125 transition-transform">
          <Plus className="w-3.5 h-3.5" />
        </div>
      </div>

      {isDragging && dragFlowPos && (
        <svg
          className="absolute inset-0 pointer-events-none nodrag nopan"
          style={{ overflow: 'visible', zIndex: 40 }}
        >
          <line
            x1={handleScreenX}
            y1={handleScreenY}
            x2={dragFlowPos.x * scale + tx}
            y2={dragFlowPos.y * scale + ty}
            stroke="hsl(var(--primary))"
            strokeWidth="2"
            strokeDasharray="6 3"
          />
          <circle
            cx={dragFlowPos.x * scale + tx}
            cy={dragFlowPos.y * scale + ty}
            r="5"
            fill="hsl(var(--primary))"
          />
        </svg>
      )}

      {showMenu && menuScreenPos && (
        <QuickNodeMenu
          x={menuScreenPos.x}
          y={menuScreenPos.y}
          sourceNodeId=""
          sourceHandleId={null}
          onSelect={handleSelectNodeType}
          onClose={() => setShowMenu(false)}
        />
      )}
    </>
  )
})
