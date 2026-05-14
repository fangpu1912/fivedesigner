import { memo, useState } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
  type Edge,
} from '@xyflow/react'
import { X } from 'lucide-react'

export interface CustomEdgeData extends Record<string, unknown> {
  label?: string
  animated?: boolean
}

export type CustomEdgeType = Edge<CustomEdgeData>

export const CustomEdge = memo(function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false)

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const edgeData = data as CustomEdgeData | undefined
  const isHighlighted = selected || hovered

  return (
    <>
      <g
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <path
          d={edgePath}
          fill="none"
          stroke="transparent"
          strokeWidth={16}
          className="cursor-pointer"
        />
        <BaseEdge
          path={edgePath}
          markerEnd={markerEnd}
          style={{
            stroke: isHighlighted ? '#3b82f6' : '#94a3b8',
            strokeWidth: isHighlighted ? 3 : 2,
            strokeDasharray: edgeData?.animated ? '5,5' : undefined,
            animation: edgeData?.animated ? 'dash 1s linear infinite' : undefined,
            transition: 'stroke 0.15s, stroke-width 0.15s',
          }}
          className={edgeData?.animated ? 'animate-dash' : ''}
        />
      </g>

      {isHighlighted && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
          >
            <button
              className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow-md hover:bg-red-600 transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                const event = new CustomEvent('edge-delete', { detail: { id } })
                window.dispatchEvent(event)
              }}
              title="删除连线"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}

      {edgeData?.label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto rounded-md border bg-background px-2 py-1 text-xs shadow-sm"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
          >
            {edgeData.label}
          </div>
        </EdgeLabelRenderer>
      )}

      <style>{`
        @keyframes dash {
          from { stroke-dashoffset: 10; }
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </>
  )
})
