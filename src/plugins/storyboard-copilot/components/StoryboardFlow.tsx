import { useCallback, useRef, useState, useEffect } from 'react'

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
  SelectionMode,
  Panel,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Download,
  Undo,
  Redo,
  Trash2,
  Save,
  FolderOpen,
  Play,
  Square,
  Loader2,
  Copy,
  ClipboardPaste,
  Grid3X3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  ArrowLeftRight,
  ArrowUpDown,
  Maximize,
  Search,
  X,
  Lock,
  Unlock as LockOpen,
  Layers,
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  ChevronsDown,
  Eye,
  EyeOff,
  ImageDown,
} from 'lucide-react'
import { save, open } from '@tauri-apps/plugin-dialog'

import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/useToast'
import { getImageUrl } from '@/utils/asset'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/store/useUIStore'
import { useProjectQuery } from '@/hooks/useProjects'
import { useEpisodeQuery } from '@/hooks/useEpisodes'

import { nodeTypes, edgeTypes } from './flow-nodes'
import { NodeLibraryPanel } from './NodeLibraryPanel'
import { PropertiesPanel } from './PropertiesPanel'
import { QuickPromptPanel } from './QuickPromptPanel'
import { canvasEvents } from '../utils/canvasEvents'
import { canvasOps } from '../bridge/canvasOps'
import { bridgeEvents } from '../bridge/bridgeEvents'
import { ContextMenu } from './ContextMenu'
import { QuickNodeMenu } from './QuickNodeMenu'
import { SelectionDragOut } from './SelectionDragOut'

import type { CanvasNodeType, CanvasNode, CanvasNodeData } from '../types'
import { CANVAS_NODE_TYPES } from '../types'
import {
  getDefaultNodeProperties,
  getDefaultNodeDimensions,
  createDefaultFrames,
  generateNodeId,
  generateEdgeId,
  isValidEdge,
  NODE_HANDLES,
  alignNodes,
  distributeNodes,
  getNodeDefinition as _getNodeDefinition,
  type AlignDirection,
  type DistributeDirection,
} from '../utils'
import {
  useCanvasQuery,
  useSaveCanvasMutation,
  useExportCanvas,
  useImportCanvas,
  useComfyWorkflowEngine,
  useNodeExecutors,
  useRuntimeStateStripper,
} from '../hooks'

interface StoryboardFlowProps {
  className?: string
}

export function StoryboardFlow({ className }: StoryboardFlowProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [nodes, setNodes, _onNodesChange] = useNodesState<CanvasNode>([])

  // 自定义 onNodesChange，阻止自动删除子节点
  const onNodesChange = useCallback((changes: NodeChange<CanvasNode>[]) => {
    // 过滤掉删除子节点的操作
    const filteredChanges = changes.filter((change) => {
      if (change.type === 'remove') {
        // 检查是否是子节点（有 parentId）
        const node = nodes.find((n) => n.id === change.id)
        if (node?.parentId) {
          console.log('[onNodesChange] 阻止删除子节点:', change.id)
          return false
        }
      }
      return true
    })
    _onNodesChange(filteredChanges as NodeChange<CanvasNode>[])
  }, [nodes, _onNodesChange])
  const [edges, setEdges, onEdgesChangeRaw] = useEdgesState<Edge>([])

  const clearDownstreamNodeData = useCallback((_edge: Edge) => {
  }, [])

  const onEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => {
    const removedEdges = changes.filter((c) => c.type === 'remove')
    for (const change of removedEdges) {
      const edge = edgesRef.current.find((e) => e.id === change.id)
      if (edge) clearDownstreamNodeData(edge)
    }
    onEdgesChangeRaw(changes)
  }, [onEdgesChangeRaw, clearDownstreamNodeData])
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<CanvasNode, Edge> | null>(null)

  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const edgesRef = useRef(edges)
  edgesRef.current = edges
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set())
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const selectedNodeId = selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] ?? null : null
  const [isPropertiesPanelOpen, setIsPropertiesPanelOpen] = useState(false)
  const [snapToGrid, setSnapToGrid] = useState(true)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const { toast } = useToast()
  const { fitView } = useReactFlow()
  const exportCanvas = useExportCanvas()
  const importCanvas = useImportCanvas()
  const { executionState, executeWorkflow, cancelExecution } = useComfyWorkflowEngine()

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    items: { label: string; icon?: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean; divider?: boolean }[]
  } | null>(null)
  const [_contextMenuNodeId, setContextMenuNodeId] = useState<string | null>(null)

  const currentProjectId = useUIStore((state) => state.currentProjectId)
  const currentEpisodeId = useUIStore((state) => state.currentEpisodeId)
  const { data: currentProject } = useProjectQuery(currentProjectId || '')
  const { data: currentEpisode } = useEpisodeQuery(currentEpisodeId || '')

  // 历史记录用于撤销/重做
  const historyRef = useRef<{
    past: Array<{ nodes: CanvasNode[]; edges: Edge[] }>
    future: Array<{ nodes: CanvasNode[]; edges: Edge[] }>
  }>({ past: [], future: [] })

  // 加载画布数据
  const { data: loadedCanvas, isLoading: isLoadingCanvas, error: canvasError } = useCanvasQuery(
    currentEpisode?.id || ''
  )
  const saveCanvasMutation = useSaveCanvasMutation()
  const { stripNodesForSave, resetStaleRuntimeState } = useRuntimeStateStripper()

  // 加载保存的画布数据
  useEffect(() => {
    if (loadedCanvas && !isLoadingCanvas && currentEpisode?.id) {
      const resetNodes = resetStaleRuntimeState(loadedCanvas.nodes)
      const nodesWithDragHandle = resetNodes.map(n => ({ ...n, dragHandle: '.node-header' as const }))
      setNodes(nodesWithDragHandle)

      const nodeMap = new Map(loadedCanvas.nodes.map(n => [n.id, n.type]))
      const validEdges = loadedCanvas.edges.filter(e => isValidEdge(e, nodeMap))
      setEdges(validEdges)

      historyRef.current.past = []
      historyRef.current.future = []
    }
  }, [loadedCanvas, isLoadingCanvas, currentEpisode?.id, setNodes, setEdges])

  // 显示加载错误
  useEffect(() => {
    if (canvasError) {
      toast({
        title: '加载画布失败',
        description: '无法加载保存的画布数据',
        variant: 'destructive',
      })
    }
  }, [canvasError, toast])

  // 自动保存 - 使用防抖
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!currentEpisode?.id) return

    // 清除之前的定时器
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
    }

    // 设置新的定时器
    autoSaveTimeoutRef.current = setTimeout(() => {
      saveCanvasMutation.mutate({
        episodeId: currentEpisode.id,
        nodes: stripNodesForSave(nodes),
        edges,
        projectId: currentProject?.id,
        name: currentEpisode.name,
      })
    }, 3000)

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
    }
  }, [nodes, edges, currentEpisode?.id, currentProject?.id, currentEpisode?.name, saveCanvasMutation])

  // 保存历史
  const saveHistory = useCallback(() => {
    historyRef.current.past.push({ nodes: [...nodes], edges: [...edges] })
    historyRef.current.future = []
    if (historyRef.current.past.length > 50) {
      historyRef.current.past.shift()
    }
  }, [nodes, edges])

  // 撤销
  const handleUndo = useCallback(() => {
    const { past } = historyRef.current
    if (past.length === 0) return

    const previous = past[past.length - 1]
    if (!previous) return
    historyRef.current.past = past.slice(0, past.length - 1)
    historyRef.current.future.unshift({ nodes: [...nodes], edges: [...edges] })

    setNodes(previous.nodes)
    setEdges(previous.edges)
  }, [nodes, edges, setNodes, setEdges])

  // 重做
  const handleRedo = useCallback(() => {
    const { future } = historyRef.current
    if (future.length === 0) return

    const next = future[0]
    if (!next) return
    historyRef.current.future = future.slice(1)
    historyRef.current.past.push({ nodes: [...nodes], edges: [...edges] })

    setNodes(next.nodes)
    setEdges(next.edges)
  }, [nodes, edges, setNodes, setEdges])

  // 连接节点
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      justConnectedRef.current = false
      setEdges((eds) => {
        const exists = eds.some(
          (e) => e.source === connection.source && e.target === connection.target
        )
        if (exists) return eds
        return addEdge({ ...connection, animated: true }, eds)
      })
      saveHistory()
      setConnectingNodeId(null)
    },
    [saveHistory, setEdges]
  )

  // 连接开始 - 显示可连接节点
  const [connectingNodeId, setConnectingNodeId] = useState<string | null>(null)
  const [connectingHandleId, setConnectingHandleId] = useState<string | null>(null)
  const [quickMenuState, setQuickMenuState] = useState<{ x: number; y: number; sourceNodeId: string; sourceHandleId: string | null } | null>(null)
  const justConnectedRef = useRef(false)

  const onConnectStart = useCallback((_: MouseEvent | TouchEvent, { nodeId, handleId }: { nodeId: string | null; handleId: string | null }) => {
    setConnectingNodeId(nodeId)
    setConnectingHandleId(handleId)
  }, [])

  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, _connectionState: unknown) => {
    setConnectingNodeId(null)
    setConnectingHandleId(null)

    if (!connectingNodeId) return

    const target = event.target as HTMLElement
    const isHandle = target.closest('.react-flow__handle')
    const isNode = target.closest('.react-flow__node')
    if (isHandle || isNode) return

    const clientX = 'clientX' in event ? event.clientX : event.changedTouches?.[0]?.clientX ?? 0
    const clientY = 'clientY' in event ? event.clientY : event.changedTouches?.[0]?.clientY ?? 0

    justConnectedRef.current = true
    setQuickMenuState({
      x: clientX,
      y: clientY,
      sourceNodeId: connectingNodeId,
      sourceHandleId: connectingHandleId,
    })
  }, [connectingNodeId, connectingHandleId])

  // 添加节点
  const handleAddNode = useCallback(
    (type: CanvasNodeType, position?: { x: number; y: number }, data?: Partial<CanvasNodeData>) => {
      if (!reactFlowInstance) return

      const dimensions = getDefaultNodeDimensions(type)
      if (!dimensions) {
        console.error(`[StoryboardFlow] No dimensions found for node type: ${type}`)
        return
      }
      const defaultData = getDefaultNodeProperties(type)
      const { x, y } = position || reactFlowInstance.screenToFlowPosition({
        x: window.innerWidth / 2 - dimensions.width / 2,
        y: window.innerHeight / 2 - dimensions.height / 2,
      })

      let nodeData: Partial<CanvasNodeData> = { ...defaultData, ...data }

      if (type === CANVAS_NODE_TYPES.storyboardSplit) {
        const rows = (defaultData.gridRows as number) || 2
        const cols = (defaultData.gridCols as number) || 2
        nodeData.frames = createDefaultFrames(rows, cols)
      }

      const newNodeId = generateNodeId()
      const newNode: CanvasNode = {
        id: newNodeId,
        type,
        position: { x, y },
        data: nodeData as CanvasNodeData,
        width: dimensions.width,
        height: dimensions.height,
        dragHandle: '.node-header',
      }

      saveHistory()
      setNodes((nds) => [...nds, newNode])
    },
    [reactFlowInstance, saveHistory, setNodes]
  )

  const handleQuickNodeSelect = useCallback((type: CanvasNodeType) => {
    if (!quickMenuState || !reactFlowInstance) return

    const position = reactFlowInstance.screenToFlowPosition({
      x: quickMenuState.x,
      y: quickMenuState.y,
    })

    const dimensions = getDefaultNodeDimensions(type)
    if (!dimensions) { setQuickMenuState(null); return }

    const defaultData = getDefaultNodeProperties(type)
    let nodeData: Partial<CanvasNodeData> = { ...defaultData }

    if (type === CANVAS_NODE_TYPES.storyboardSplit) {
      const rows = (defaultData.gridRows as number) || 2
      const cols = (defaultData.gridCols as number) || 2
      nodeData.frames = createDefaultFrames(rows, cols)
    }
    const newNodeId = generateNodeId()
    const newNode: CanvasNode = {
      id: newNodeId,
      type,
      position: { x: position.x - (dimensions.width || 200) / 2, y: position.y - 20 },
      data: nodeData as CanvasNodeData,
      width: dimensions.width,
      height: dimensions.height,
      dragHandle: '.node-header',
    }

    saveHistory()
    setNodes((nds) => [...nds, newNode])

    const sourceNodeId = quickMenuState.sourceNodeId
    const sourceHandleId = quickMenuState.sourceHandleId || 'source'
    if (sourceNodeId) {
      const targetHandles = NODE_HANDLES[type]?.target || ['target']
      const targetHandle = targetHandles[0] || 'target'
      requestAnimationFrame(() => {
        const newEdge = {
          id: generateEdgeId(sourceNodeId, newNodeId),
          source: sourceNodeId,
          target: newNodeId,
          sourceHandle: sourceHandleId,
          targetHandle,
          type: 'custom' as const,
          animated: true,
        }
        setEdges((eds) => [...eds, newEdge])
      })
    }

    setQuickMenuState(null)
  }, [quickMenuState, reactFlowInstance, saveHistory, setNodes, setEdges])

  // 单节点执行
  const handleExecuteNode = useCallback(async (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId)
    if (!node) {
      toast({ title: '节点不存在', variant: 'destructive' })
      return
    }

    toast({ title: `正在执行节点: ${node.data.displayName || node.type}...` })

    // 获取上游节点的数据
    const upstreamEdge = edges.find(e => e.target === nodeId)
    let inputData: { imageUrl?: string; frames?: unknown[]; [key: string]: unknown } | undefined = undefined

    if (upstreamEdge) {
      const upstreamNode = nodes.find(n => n.id === upstreamEdge.source)
      if (upstreamNode?.data?.imageUrl) {
        inputData = { imageUrl: upstreamNode.data.imageUrl as string }
      }
    }

    // 根据节点类型执行不同的逻辑
    try {
      switch (node.type) {
        case CANVAS_NODE_TYPES.aiImageEdit:
          // 图片编辑节点 - 检查是否有图片和提示词
          if (!node.data.imageUrl) {
            toast({ title: '请先上传图片', variant: 'destructive' })
            return
          }
          if (!node.data.prompt) {
            toast({ title: '请输入编辑提示词', variant: 'destructive' })
            return
          }
          // 触发节点重新渲染，让节点自己处理生成逻辑
          setNodes(nds => nds.map(n => {
            if (n.id === nodeId) {
              return {
                ...n,
                data: {
                  ...n.data,
                  _executeTrigger: Date.now(), // 触发执行标记
                }
              }
            }
            return n
          }))
          break

        case CANVAS_NODE_TYPES.upload:
          // 上传节点 - 只是传递数据
          if (inputData?.imageUrl) {
            setNodes(nds => nds.map(n => {
              if (n.id === nodeId) {
                return {
                  ...n,
                  data: {
                    ...n.data,
                    imageUrl: inputData.imageUrl,
                  }
                }
              }
              return n
            }))
            toast({ title: '已接收上游图片数据' })
          } else {
            toast({ title: '上传节点无需执行', description: '请直接上传图片' })
          }
          break

        case CANVAS_NODE_TYPES.upscale:
          // 图片放大节点 - 接收上游图片数据并触发放大
          if (inputData?.imageUrl) {
            setNodes(nds => nds.map(n => {
              if (n.id === nodeId) {
                return {
                  ...n,
                  data: {
                    ...n.data,
                    imageUrl: inputData.imageUrl,
                    _executeTrigger: Date.now(), // 触发节点执行放大
                  }
                }
              }
              return n
            }))
            toast({ title: '已接收图片并开始放大' })
          } else {
            toast({ title: '请连接上游图片节点', variant: 'destructive' })
          }
          break

        case CANVAS_NODE_TYPES.imageEdit:
          // 图片生成节点 - 文生图
          if (!node.data.prompt) {
            toast({ title: '请输入生成提示词', variant: 'destructive' })
            return
          }
          setNodes(nds => nds.map(n => {
            if (n.id === nodeId) {
              return {
                ...n,
                data: {
                  ...n.data,
                  _executeTrigger: Date.now(),
                }
              }
            }
            return n
          }))
          break

        case CANVAS_NODE_TYPES.storyboardSplit:
          // 分镜拆分节点 - 接收上游图片数据并触发拆分
          if (inputData?.imageUrl || inputData?.frames) {
            setNodes((nds: CanvasNode[]) => nds.map(n => {
              if (n.id === nodeId) {
                return {
                  ...n,
                  data: {
                    ...n.data,
                    ...(inputData.imageUrl && { inputImageUrl: inputData.imageUrl }),
                    ...(inputData.frames && { inputFrames: inputData.frames }),
                    _executeTrigger: Date.now(),
                  } as CanvasNodeData,
                } as CanvasNode
              }
              return n
            }))
            toast({ title: '开始拆分分镜' })
          } else {
            toast({ title: '请连接上游图片或分镜节点', variant: 'destructive' })
          }
          break

        case CANVAS_NODE_TYPES.sceneDirector:
          // 场景导演节点 - 接收上游图片作为背景
          if (inputData?.imageUrl) {
            setNodes(nds => nds.map(n => {
              if (n.id === nodeId) {
                return {
                  ...n,
                  data: {
                    ...n.data,
                    panoramaUrl: inputData.imageUrl,
                    _executeTrigger: Date.now(),
                  }
                }
              }
              return n
            }))
            toast({ title: '已加载场景背景' })
          } else {
            toast({ title: '场景导演节点无需执行，可直接编辑' })
          }
          break

        case CANVAS_NODE_TYPES.textAnnotation:
          toast({ title: '该节点无需执行' })
          break

        default:
          toast({ title: `节点类型 ${node.type} 暂无执行逻辑` })
      }
    } catch (error) {
      console.error('节点执行失败:', error)
      toast({
        title: '节点执行失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive'
      })
    }
  }, [nodes, edges, setNodes, toast])

  // 订阅画布事件（用于节点间通信）
  useEffect(() => {
    const unsubscribe = canvasEvents.subscribe((payload) => {
      const currentNodes = nodesRef.current
      const currentEdges = edgesRef.current

      if (payload.type === 'addUploadNode') {
        let sourcePosition: { x: number; y: number } | undefined
        if (payload.sourceNodeId) {
          const sourceNode = currentNodes.find((n) => n.id === payload.sourceNodeId)
          sourcePosition = sourceNode?.position
        }

        const position = sourcePosition
          ? { x: sourcePosition.x + 1000, y: sourcePosition.y }
          : reactFlowInstance?.screenToFlowPosition({
              x: window.innerWidth / 2 + 500,
              y: window.innerHeight / 2,
            })

        if (position) {
          handleAddNode(CANVAS_NODE_TYPES.upload, position, { imageUrl: payload.imageUrl } as CanvasNodeData)
          toast({ title: '图片已添加到画布' })
        } else {
          console.error('[StoryboardFlow] No position available')
        }
      } else if (payload.type === 'executeNode' && payload.nodeId) {
        handleExecuteNode(payload.nodeId)
      } else if (payload.type === 'propagateData' && payload.sourceNodeId) {
        const sourceId = payload.sourceNodeId
        const eventData: Record<string, unknown> = payload.data || {}

        const connectedEdges = currentEdges.filter(e => e.source === sourceId)

        const sourceNode = currentNodes.find(n => n.id === sourceId)
        const sourceData = sourceNode?.data as Record<string, unknown> || {}

        setNodes(nds => nds.map(n => {
          const isDownstream = connectedEdges.some(e => e.target === n.id)
          if (!isDownstream) return n

          if (n.type === CANVAS_NODE_TYPES.videoGen) {
            const upstreamEdges = currentEdges.filter(e => e.target === n.id)
            const upstreamNodes = upstreamEdges
              .map(e => currentNodes.find(nd => nd.id === e.source))
              .filter(Boolean) as typeof currentNodes
            
            const allImages: string[] = []
            let firstFrameUrl: string | null = null
            let textContent = ''
            let nodeName = ''

            for (const usNode of upstreamNodes) {
              const usData = usNode.data as Record<string, unknown>
              nodeName = (usData.displayName || usData.name || '输入') as string

              const t = (typeof eventData.textContent === 'string' ? eventData.textContent : '') ||
                (typeof usData.content === 'string' ? usData.content : '') ||
                (typeof usData.prompt === 'string' ? usData.prompt : '') ||
                (typeof usData.text === 'string' ? usData.text : '')
              if (t) textContent = t

              if (typeof usData.imageUrl === 'string' && usData.imageUrl) {
                if (!firstFrameUrl) {
                  firstFrameUrl = usData.imageUrl
                } else {
                  allImages.push(usData.imageUrl)
                }
              }
              if (Array.isArray(usData.referenceImages)) {
                allImages.push(...usData.referenceImages)
              }
            }

            const item = {
              id: `item_${Date.now()}_0`,
              name: nodeName,
              prompt: textContent,
              videoPrompt: textContent,
              firstFrameUrl,
              referenceImages: allImages,
              videoUrl: null as string | null,
              status: 'pending' as const,
            }

            for (const usNode of upstreamNodes) {
              const usData = usNode.data as Record<string, unknown>
              if (typeof usData.videoUrl === 'string' && usData.videoUrl) {
                item.videoUrl = usData.videoUrl
                break
              }
            }

            return {
              ...n,
              data: {
                ...n.data,
                items: [item],
                currentIndex: 0,
                isRunning: false,
              }
            }
          }

          if (n.type === CANVAS_NODE_TYPES.aiImageEdit) {
            const newData: Record<string, unknown> = { ...n.data }

            if (typeof sourceData.imageUrl === 'string' && sourceData.imageUrl) {
              newData.imageUrl = sourceData.imageUrl
            }
            if (Array.isArray(sourceData.referenceImages)) {
              newData.referenceImages = sourceData.referenceImages
            }
            const textContent = (typeof eventData.textContent === 'string' ? eventData.textContent : '') ||
              (typeof sourceData.content === 'string' ? sourceData.content : '') ||
              (typeof sourceData.prompt === 'string' ? sourceData.prompt : '') ||
              (typeof sourceData.text === 'string' ? sourceData.text : '')
            if (textContent) {
              newData.prompt = textContent
            }

            return { ...n, data: newData as typeof n.data }
          }

          if (n.type === CANVAS_NODE_TYPES.upload) {
            const newData: Record<string, unknown> = { ...n.data }

            if (typeof sourceData.imageUrl === 'string' && sourceData.imageUrl) {
              newData.imageUrl = sourceData.imageUrl
              newData.previewImageUrl = sourceData.imageUrl
            }

            return { ...n, data: newData as typeof n.data }
          }

          if (n.type === CANVAS_NODE_TYPES.videoUpload) {
            const newData: Record<string, unknown> = { ...n.data }
            if (typeof sourceData.videoUrl === 'string' && sourceData.videoUrl) {
              newData.videoUrl = sourceData.videoUrl
              newData.sourceFileName = '来自上游节点'
            }
            return { ...n, data: newData as typeof n.data }
          }

          if (n.type === CANVAS_NODE_TYPES.audioUpload) {
            const newData: Record<string, unknown> = { ...n.data }
            if (typeof sourceData.audioUrl === 'string' && sourceData.audioUrl) {
              newData.audioUrl = sourceData.audioUrl
              newData.sourceFileName = '来自上游节点'
            }
            return { ...n, data: newData as typeof n.data }
          }

          return n
        }))

        const downstreamTypes = connectedEdges
          .map(e => currentNodes.find(n => n.id === e.target)?.type)
          .filter(Boolean)
        if (downstreamTypes.length > 0) {
          toast({ title: '数据已传递到下游节点' })
        }
      } else if (payload.type === 'addResultNode' && payload.sourceNodeId) {
        const sourceId = payload.sourceNodeId
        const sourceHandleId = payload.sourceHandleId || 'source'
        const sourceNode = currentNodes.find(n => n.id === sourceId)
        if (!sourceNode) return

        let resultNodeType: CanvasNodeType
        let resultData: Record<string, unknown>
        let targetHandle = 'target'

        if (payload.videoUrl) {
          resultNodeType = CANVAS_NODE_TYPES.videoUpload
          resultData = {
            ...getDefaultNodeProperties(CANVAS_NODE_TYPES.videoUpload),
            videoUrl: payload.videoUrl,
            sourceFileName: '来自上游节点',
          }
        } else if (payload.audioUrl) {
          resultNodeType = CANVAS_NODE_TYPES.audioUpload
          resultData = {
            ...getDefaultNodeProperties(CANVAS_NODE_TYPES.audioUpload),
            audioUrl: payload.audioUrl,
            sourceFileName: '来自上游节点',
          }
        } else if (payload.text) {
          resultNodeType = CANVAS_NODE_TYPES.textAnnotation
          resultData = {
            ...getDefaultNodeProperties(CANVAS_NODE_TYPES.textAnnotation),
            content: payload.text,
          }
          targetHandle = 'text'
        } else if (payload.imageUrl) {
          resultNodeType = CANVAS_NODE_TYPES.upload
          resultData = {
            ...getDefaultNodeProperties(CANVAS_NODE_TYPES.upload),
            imageUrl: payload.imageUrl,
            previewImageUrl: payload.imageUrl,
            sourceFileName: '来自上游节点',
          }
        } else {
          return
        }

        const sourcePos = sourceNode.position || { x: 0, y: 0 }
        const dims = getDefaultNodeDimensions(resultNodeType)
        const resultNodeId = generateNodeId()

        const newResultNode: CanvasNode = {
          id: resultNodeId,
          type: resultNodeType,
          position: { x: sourcePos.x + (sourceNode.width || 400) + 80, y: sourcePos.y },
          data: resultData as CanvasNodeData,
          width: dims?.width,
          height: dims?.height,
          dragHandle: '.node-header' as const,
        }

        setNodes(nds => [...nds, newResultNode])

        requestAnimationFrame(() => {
          const newEdge = {
            id: generateEdgeId(sourceId, resultNodeId),
            source: sourceId,
            target: resultNodeId,
            sourceHandle: sourceHandleId,
            targetHandle,
            type: 'custom' as const,
            animated: true,
          }
          setEdges(eds => [...eds, newEdge])
        })
      }
    })

    return unsubscribe
  }, [reactFlowInstance, handleAddNode, handleExecuteNode, toast, setNodes])

  // 注册 canvasOps 回调 — 让外部页面可以操作画布
  useEffect(() => {
    canvasOps.register({
      onAddNode: (type, position, data) => {
        handleAddNode(type, position, data)
        return null
      },
      onRemoveNode: (nodeId) => {
        setNodes((nds) => nds.filter((n) => n.id !== nodeId))
        setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId))
      },
      onUpdateNodeData: (nodeId, data) => {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
          )
        )
      },
      onConnectNodes: (sourceId, targetId, sourceHandle, targetHandle) => {
        const newEdge = {
          id: generateEdgeId(sourceId, targetId),
          source: sourceId,
          target: targetId,
          sourceHandle: sourceHandle || null,
          targetHandle: targetHandle || null,
          type: 'custom',
        }
        setEdges((eds) => [...eds, newEdge])
      },
      onExecuteNode: (nodeId) => {
        handleExecuteNode(nodeId)
      },
      onFocusNode: (nodeId) => {
        const node = nodesRef.current.find((n) => n.id === nodeId)
        if (node && reactFlowInstance) {
          reactFlowInstance.fitView({ nodes: [{ id: nodeId }], padding: 0.3, duration: 300 })
        }
      },
      onGetNodes: () => nodesRef.current.map((n) => ({ id: n.id, type: n.type, data: n.data as Record<string, unknown>, position: n.position })),
      onGetEdges: () => edgesRef.current.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      onGetSelectedNodes: () => Array.from(selectedNodeIds),
      onFitView: () => fitView({ padding: 0.2, duration: 300 }),
    })

    return () => {
      canvasOps.unregister()
    }
  }, [selectedNodeIds, reactFlowInstance, handleAddNode, handleExecuteNode, setNodes, setEdges, fitView])

  // 监听资产变更事件 — 网页修改数据后更新画布节点
  useEffect(() => {
    const off = bridgeEvents.on<{ type: string; ids: string[]; field?: string; value?: unknown }>('asset:updated', (payload) => {
      if (payload.field === 'image' && payload.value) {
        setNodes((nds) =>
          nds.map((n) => {
            const nodeData = n.data as Record<string, unknown>
            if (
              nodeData?.assetType === payload.type &&
              payload.ids.includes(n.id)
            ) {
              return { ...n, data: { ...n.data, imageUrl: payload.value as string } }
            }
            return n
          })
        )
      }
    })
    return off
  }, [setNodes])

  // 删除选中节点（支持多选）
  const handleDeleteSelected = useCallback(() => {
    if (selectedNodeIds.size === 0) return
    saveHistory()
    const idsToDelete = Array.from(selectedNodeIds)
    setNodes((nds) => nds.filter((n) => !idsToDelete.includes(n.id)))
    setEdges((eds) => eds.filter((e) => !idsToDelete.includes(e.source) && !idsToDelete.includes(e.target)))
    setSelectedNodeIds(new Set())
  }, [selectedNodeIds, saveHistory, setNodes, setEdges])

  // 复制粘贴的剪贴板
  const clipboardRef = useRef<{ nodes: CanvasNode[]; edges: Edge[] } | null>(null)

  // 复制选中节点
  const handleCopy = useCallback(() => {
    if (selectedNodeIds.size === 0) return

    const nodesToCopy = nodes.filter((n) => selectedNodeIds.has(n.id))
    const nodeIds = new Set(nodesToCopy.map((n) => n.id))
    const edgesToCopy = edges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
    )

    clipboardRef.current = {
      nodes: nodesToCopy.map((n) => ({ ...n })),
      edges: edgesToCopy.map((e) => ({ ...e })),
    }

    toast({ title: `已复制 ${nodesToCopy.length} 个节点` })
  }, [selectedNodeIds, nodes, edges, toast])

  // 粘贴节点
  const handlePaste = useCallback(() => {
    if (!clipboardRef.current) return

    saveHistory()

    const { nodes: clipboardNodes, edges: clipboardEdges } = clipboardRef.current
    const idMapping = new Map<string, string>()

    // 生成新节点
    const newNodes = clipboardNodes.map((node) => {
      const newId = generateNodeId()
      idMapping.set(node.id, newId)

      return {
        ...node,
        id: newId,
        position: {
          x: node.position.x + 30,
          y: node.position.y + 30,
        },
        selected: false,
      }
    })

    // 生成新边
    const newEdges = clipboardEdges
      .filter((e) => idMapping.has(e.source) && idMapping.has(e.target))
      .map((edge) => ({
        ...edge,
        id: `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        source: idMapping.get(edge.source)!,
        target: idMapping.get(edge.target)!,
      }))

    setNodes((nds) => [...nds, ...newNodes])
    setEdges((eds) => [...eds, ...newEdges])
    setSelectedNodeIds(new Set(newNodes.map((n) => n.id)))

    toast({ title: `已粘贴 ${newNodes.length} 个节点` })
  }, [clipboardRef, saveHistory, setNodes, setEdges, toast])

  // 导出画布
  const handleExport = useCallback(async () => {
    try {
      const savePath = await save({
        defaultPath: `storyboard-copilot-${Date.now()}.json`,
        filters: [
          { name: 'JSON 文件', extensions: ['json'] },
          { name: '所有文件', extensions: ['*'] },
        ],
        title: '导出画布',
      })

      if (!savePath) return

      await exportCanvas(savePath, nodes, edges, {
        projectId: currentProject?.id,
        episodeId: currentEpisode?.id,
        name: currentEpisode?.name,
      })

      toast({
        title: '导出成功',
        description: `画布已保存到: ${savePath}`,
      })
    } catch (error) {
      console.error('导出失败:', error)
      toast({
        title: '导出失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      })
    }
  }, [nodes, edges, currentProject?.id, currentEpisode?.id, currentEpisode?.name, exportCanvas, toast])

  // 导入画布
  const handleImport = useCallback(async () => {
    try {
      const selectedPath = await open({
        filters: [
          { name: 'JSON 文件', extensions: ['json'] },
          { name: '所有文件', extensions: ['*'] },
        ],
        title: '导入画布',
      })

      if (!selectedPath) return

      const data = await importCanvas(selectedPath as string)

      saveHistory()
      setNodes(data.nodes)
      setEdges(data.edges)
      toast({
        title: '导入成功',
        description: `已从 ${selectedPath} 导入画布`,
      })
    } catch (error) {
      console.error('导入失败:', error)
      toast({
        title: '导入失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      })
    }
  }, [saveHistory, setNodes, setEdges, importCanvas, toast])

  // 手动保存
  const handleManualSave = useCallback(async () => {
    if (!currentEpisode?.id) {
      toast({
        title: '无法保存',
        description: '请先选择剧集',
        variant: 'destructive',
      })
      return
    }

    try {
      await saveCanvasMutation.mutateAsync({
        episodeId: currentEpisode.id,
        nodes: stripNodesForSave(nodes),
        edges,
        projectId: currentProject?.id,
        name: currentEpisode.name,
      })
      toast({ title: '保存成功' })
    } catch (error) {
      toast({
        title: '保存失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      })
    }
  }, [currentEpisode?.id, currentEpisode?.name, currentProject?.id, nodes, edges, saveCanvasMutation, toast])

  // 适应视图
  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2, duration: 300 })
  }, [fitView])

  // 监听缩放变化
  const onMove = useCallback(() => {
    if (reactFlowInstance) {
      const viewport = reactFlowInstance.getViewport()
      setZoomLevel(viewport.zoom)
    }
  }, [reactFlowInstance])

  // 搜索节点
  const handleSearch = useCallback(() => {
    if (!searchQuery.trim()) return
    const query = searchQuery.toLowerCase()
    const foundNode = nodes.find(node => {
      const nodeData = node.data as Record<string, unknown>
      return (
        (typeof nodeData.displayName === 'string' && nodeData.displayName.toLowerCase().includes(query)) ||
        (typeof nodeData.prompt === 'string' && nodeData.prompt.toLowerCase().includes(query)) ||
        (typeof node.type === 'string' && node.type.toLowerCase().includes(query))
      )
    })
    if (foundNode) {
      // 选中节点并居中
      setSelectedNodeIds(new Set([foundNode.id]))
      reactFlowInstance?.setCenter(foundNode.position.x + (foundNode.width || 200) / 2, foundNode.position.y + (foundNode.height || 100) / 2, { zoom: 1.2, duration: 300 })
      setShowSearch(false)
      setSearchQuery('')
    } else {
      toast({ title: '未找到匹配的节点', variant: 'destructive' })
    }
  }, [searchQuery, nodes, reactFlowInstance, setSelectedNodeIds, toast])

  // 使用节点执行器
  const { createExecutors } = useNodeExecutors()

  // 运行工作流
  const handleRunWorkflow = useCallback(async () => {
    if (nodes.length === 0) {
      toast({ title: '画布为空，没有可执行的节点', variant: 'destructive' })
      return
    }

    // 使用 nodeExecutors.ts 中的完整执行器
    const nodeExecutors = createExecutors(nodes)

    await executeWorkflow(nodes, edges, nodeExecutors, {
      onNodeComplete: (nodeId, output) => {
        // 更新节点数据以触发重新渲染
        setNodes((prevNodes: CanvasNode[]) =>
          prevNodes.map((node) => {
            if (node.id === nodeId) {
              const outputData = output as { frames?: unknown[]; gridRows?: number; gridCols?: number; imageUrl?: string }
              return {
                ...node,
                data: {
                  ...node.data,
                  ...(outputData.frames && { frames: outputData.frames }),
                  ...(outputData.gridRows && { gridRows: outputData.gridRows }),
                  ...(outputData.gridCols && { gridCols: outputData.gridCols }),
                  ...(outputData.imageUrl && { imageUrl: outputData.imageUrl, previewImageUrl: outputData.imageUrl }),
                  _executeTrigger: Date.now(), // 触发节点内部更新
                } as CanvasNodeData,
              } as CanvasNode
            }
            return node
          })
        )
      },
    })
  }, [nodes, edges, executeWorkflow, createExecutors, toast, setNodes])

  // 节点选择 - 支持多选（Ctrl/Cmd+点击）
  const onNodeClick = useCallback((e: React.MouseEvent, node: Node) => {
    if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd+点击：切换选择状态
      setSelectedNodeIds((prev) => {
        const newSet = new Set(prev)
        if (newSet.has(node.id)) {
          newSet.delete(node.id)
        } else {
          newSet.add(node.id)
        }
        return newSet
      })
    } else {
      // 普通点击：单选，不自动显示参数面板
      setSelectedNodeIds(new Set([node.id]))
    }
    // 清除边的选择
    setSelectedEdgeId(null)
  }, [])

  // 画布点击清除选择
  const onPaneClick = useCallback(() => {
    if (justConnectedRef.current) {
      justConnectedRef.current = false
      return
    }
    setSelectedNodeIds(new Set())
    setSelectedEdgeId(null)
    setIsPropertiesPanelOpen(false)
    setContextMenu(null)
    setQuickMenuState(null)
  }, [])

  useEffect(() => {
    const container = document.querySelector('.react-flow')
    if (!container) return

    const handleDragOver = (e: globalThis.DragEvent) => {
      if (e.dataTransfer?.types.includes('application/storyboard-frame')) {
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
      }
    }

    const handleDrop = (e: globalThis.DragEvent) => {
      const data = e.dataTransfer?.getData('application/storyboard-frame')
      if (!data || !reactFlowInstance) return
      try {
        const { imageUrl, note, sourceNodeId } = JSON.parse(data)
        if (!imageUrl) return
        const position = reactFlowInstance.screenToFlowPosition({
          x: e.clientX,
          y: e.clientY,
        })
        const newNodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        setNodes(nds => [...nds, {
          id: newNodeId,
          type: 'uploadNode' as const,
          position,
          data: {
            imageUrl,
            previewImageUrl: imageUrl,
            sourceFileName: note || '分镜帧',
            displayName: note || '分镜帧',
          },
        }])
        if (sourceNodeId) {
          const edgeId = `edge_${sourceNodeId}_${newNodeId}_${Date.now()}`
          setEdges(eds => [...eds, {
            id: edgeId,
            source: sourceNodeId,
            target: newNodeId,
            sourceHandle: 'source',
            targetHandle: 'target',
            type: 'custom' as const,
          }])
        }
      } catch {}
    }

    const el = container as EventTarget
    el.addEventListener('dragover', handleDragOver as EventListener)
    el.addEventListener('drop', handleDrop as EventListener)
    return () => {
      el.removeEventListener('dragover', handleDragOver as EventListener)
      el.removeEventListener('drop', handleDrop as EventListener)
    }
  }, [reactFlowInstance, setNodes, setEdges])

  // 边的点击事件
  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId(edge.id)
    setSelectedNodeIds(new Set())
    setContextMenu(null)
  }, [])

  // 框选/多选变化处理
  const onSelectionChange = useCallback(({ nodes: selectedNodes }: { nodes: Node[] }) => {
    setSelectedNodeIds(new Set(selectedNodes.map((n) => n.id)))
    setSelectedEdgeId(null)
    // 点击节点不自动显示参数面板，保持当前状态
  }, [])

  // 对齐节点
  const handleAlignNodes = useCallback((direction: AlignDirection) => {
    if (selectedNodeIds.size < 2) {
      toast({ title: '请至少选择两个节点', variant: 'destructive' })
      return
    }

    saveHistory()
    const selectedNodes = nodes.filter((n) => selectedNodeIds.has(n.id))
    const alignedNodes = alignNodes(selectedNodes, direction)

    setNodes((nds) =>
      nds.map((node) => {
        const aligned = alignedNodes.find((n) => n.id === node.id)
        return aligned || node
      })
    )

    toast({ title: `已${direction === 'left' ? '左' : direction === 'right' ? '右' : direction === 'top' ? '顶部' : direction === 'bottom' ? '底部' : direction === 'center' ? '水平居中' : '垂直居中'}对齐` })
  }, [selectedNodeIds, nodes, saveHistory, setNodes, toast])

  // 分布节点
  const handleDistributeNodes = useCallback((direction: DistributeDirection) => {
    if (selectedNodeIds.size < 3) {
      toast({ title: '请至少选择三个节点', variant: 'destructive' })
      return
    }

    saveHistory()
    const selectedNodes = nodes.filter((n) => selectedNodeIds.has(n.id))
    const distributedNodes = distributeNodes(selectedNodes, direction)

    setNodes((nds) =>
      nds.map((node) => {
        const distributed = distributedNodes.find((n) => n.id === node.id)
        return distributed || node
      })
    )

    toast({ title: `已${direction === 'horizontal' ? '水平' : '垂直'}均分` })
  }, [selectedNodeIds, nodes, saveHistory, setNodes, toast])

  // 断开连接
  const handleDisconnectEdge = useCallback(() => {
    if (!selectedEdgeId) return
    const edge = edgesRef.current.find((e) => e.id === selectedEdgeId)
    if (edge) clearDownstreamNodeData(edge)
    saveHistory()
    setEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId))
    setSelectedEdgeId(null)
    toast({ title: '已断开连接' })
  }, [selectedEdgeId, saveHistory, setEdges, toast, clearDownstreamNodeData])

  // 节点锁定/解锁
  const handleToggleLock = useCallback(() => {
    if (selectedNodeIds.size === 0) return
    saveHistory()
    const targetNode = nodes.find((n) => selectedNodeIds.has(n.id))
    const willLock = targetNode?.draggable !== false
    setNodes((nds) =>
      nds.map((n) =>
        selectedNodeIds.has(n.id)
          ? { ...n, draggable: willLock ? false : true, selectable: willLock ? false : true, data: { ...n.data, locked: willLock } }
          : n
      )
    )
    toast({ title: willLock ? '节点已锁定' : '节点已解锁' })
  }, [selectedNodeIds, nodes, saveHistory, setNodes, toast])

  // 图层管理 - 层级调整
  const handleMoveLayer = useCallback((direction: 'up' | 'down' | 'top' | 'bottom') => {
    if (selectedNodeIds.size === 0) return
    saveHistory()

    const otherNodes = nodes.filter((n) => !selectedNodeIds.has(n.id))
    const selectedNodes = nodes.filter((n) => selectedNodeIds.has(n.id))

    let newNodes: CanvasNode[]

    switch (direction) {
      case 'up':
      case 'top':
        newNodes = [...otherNodes, ...selectedNodes]
        break
      case 'down':
      case 'bottom':
        newNodes = [...selectedNodes, ...otherNodes]
        break
    }

    setNodes(newNodes)
  }, [selectedNodeIds, nodes, saveHistory, setNodes])

  // 显示/隐藏节点
  const handleToggleVisibility = useCallback(() => {
    if (selectedNodeIds.size === 0) return
    saveHistory()
    const targetNode = nodes.find((n) => selectedNodeIds.has(n.id))
    const isHidden = targetNode?.hidden
    setNodes((nds) =>
      nds.map((n) =>
        selectedNodeIds.has(n.id) ? { ...n, hidden: !isHidden } : n
      )
    )
    toast({ title: isHidden ? '节点已显示' : '节点已隐藏' })
  }, [selectedNodeIds, nodes, saveHistory, setNodes, toast])

  // 导出画布为PNG
  const handleExportAsPNG = useCallback(async () => {
    try {
      const savePath = await save({
        defaultPath: `storyboard-copilot-${Date.now()}.png`,
        filters: [
          { name: 'PNG 图片', extensions: ['png'] },
          { name: '所有文件', extensions: ['*'] },
        ],
        title: '导出画布为 PNG',
      })

      if (!savePath) return

      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        toast({ title: '导出失败：无法创建画布上下文', variant: 'destructive' })
        return
      }

      // 计算所有节点的边界
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity

      nodes.forEach((node) => {
        const x = node.position.x
        const y = node.position.y
        const w = node.width || 300
        const h = node.height || 200
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x + w)
        maxY = Math.max(maxY, y + h)
      })

      if (minX === Infinity) {
        toast({ title: '画布为空，没有可导出的节点', variant: 'destructive' })
        return
      }

      const padding = 50
      const width = maxX - minX + padding * 2
      const height = maxY - minY + padding * 2

      canvas.width = width
      canvas.height = height

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.translate(-minX + padding, -minY + padding)

      // 绘制节点
      for (const node of nodes) {
        const x = node.position.x
        const y = node.position.y
        const w = node.width || 300
        const h = node.height || 200

        ctx.fillStyle = '#f8f9fa'
        ctx.strokeStyle = '#dee2e6'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.roundRect(x, y, w, h, 8)
        ctx.fill()
        ctx.stroke()

        // 如果有图片，尝试绘制
        if (node.data?.imageUrl || node.data?.image) {
          const imgUrl = node.data.imageUrl || node.data.image
          if (typeof imgUrl === 'string') {
            try {
              const resolvedImgUrl = getImageUrl(imgUrl) || imgUrl
              const img = new window.Image()
              if (resolvedImgUrl && !resolvedImgUrl.startsWith('asset://') && !resolvedImgUrl.startsWith('data:')) {
                img.crossOrigin = 'anonymous'
              }
              img.src = resolvedImgUrl
              await new Promise<void>((resolve) => {
                img.onload = () => {
                  const imgW = w - 20
                  const imgH = h - 60
                  const imgX = x + 10
                  const imgY = y + 50
                  const ratio = Math.min(imgW / img.naturalWidth, imgH / img.naturalHeight)
                  const drawW = img.naturalWidth * ratio
                  const drawH = img.naturalHeight * ratio
                  const drawX = imgX + (imgW - drawW) / 2
                  const drawY = imgY + (imgH - drawH) / 2
                  ctx.drawImage(img, drawX, drawY, drawW, drawH)
                  resolve()
                }
                img.onerror = () => resolve()
              })
            } catch (e) {
              // 图片加载失败，跳过
            }
          }
        }

        // 绘制节点标题
        ctx.fillStyle = '#212529'
        ctx.font = '14px sans-serif'
        ctx.fillText(node.data?.displayName || node.type || '节点', x + 10, y + 30)
      }

      // 转换为 blob 并保存
      canvas.toBlob(async (blob) => {
        if (!blob) {
          toast({ title: '导出失败：无法生成图片', variant: 'destructive' })
          return
        }
        const arrayBuffer = await blob.arrayBuffer()
        const uint8Array = new Uint8Array(arrayBuffer)
        const { writeFile } = await import('@tauri-apps/plugin-fs')
        await writeFile(savePath, uint8Array)
        toast({ title: '导出成功', description: `画布已保存到: ${savePath}` })
      }, 'image/png')
    } catch (error) {
      console.error('导出 PNG 失败:', error)
      toast({
        title: '导出失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      })
    }
  }, [nodes, toast])

  // 节点右键菜单
  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault()
    setContextMenuNodeId(node.id)

    const isLocked = !node.draggable

    const menuItems = [
      {
        label: '执行节点',
        icon: <Play className="h-4 w-4" />,
        onClick: () => handleExecuteNode(node.id),
        disabled: executionState.isRunning,
      },
      { divider: true, label: '', onClick: () => {} },
      {
        label: isLocked ? '解锁节点' : '锁定节点',
        icon: isLocked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />,
        onClick: () => {
          setSelectedNodeIds(new Set([node.id]))
          handleToggleLock()
        },
      },
      {
        label: '隐藏节点',
        icon: <EyeOff className="h-4 w-4" />,
        onClick: () => {
          setSelectedNodeIds(new Set([node.id]))
          handleToggleVisibility()
        },
      },
      { divider: true, label: '', onClick: () => {} },
      {
        label: '复制',
        icon: <Copy className="h-4 w-4" />,
        onClick: () => {
          setSelectedNodeIds(new Set([node.id]))
          handleCopy()
        },
      },
      {
        label: '粘贴',
        icon: <ClipboardPaste className="h-4 w-4" />,
        onClick: handlePaste,
      },
      { divider: true, label: '', onClick: () => {} },
      {
        label: '图层',
        icon: <Layers className="h-4 w-4" />,
        onClick: () => {},
        disabled: true,
      },
      {
        label: '  上移一层',
        icon: <ArrowUp className="h-4 w-4" />,
        onClick: () => {
          setSelectedNodeIds(new Set([node.id]))
          handleMoveLayer('up')
        },
      },
      {
        label: '  下移一层',
        icon: <ArrowDown className="h-4 w-4" />,
        onClick: () => {
          setSelectedNodeIds(new Set([node.id]))
          handleMoveLayer('down')
        },
      },
      {
        label: '  置顶',
        icon: <ChevronsUp className="h-4 w-4" />,
        onClick: () => {
          setSelectedNodeIds(new Set([node.id]))
          handleMoveLayer('top')
        },
      },
      {
        label: '  置底',
        icon: <ChevronsDown className="h-4 w-4" />,
        onClick: () => {
          setSelectedNodeIds(new Set([node.id]))
          handleMoveLayer('bottom')
        },
      },
      { divider: true, label: '', onClick: () => {} },
      {
        label: '删除',
        icon: <Trash2 className="h-4 w-4" />,
        onClick: () => {
          setSelectedNodeIds(new Set([node.id]))
          handleDeleteSelected()
        },
        danger: true,
      },
    ]

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: menuItems,
    })
  }, [handleCopy, handlePaste, handleDeleteSelected, handleExecuteNode, executionState.isRunning, handleToggleLock, handleToggleVisibility, handleMoveLayer, selectedNodeIds, nodes])

  // 画布右键菜单
  const onPaneContextMenu = useCallback((e: MouseEvent | React.MouseEvent) => {
    e.preventDefault()
    setContextMenuNodeId(null)

    const menuItems = [
      {
        label: '粘贴',
        icon: <ClipboardPaste className="h-4 w-4" />,
        onClick: handlePaste,
        disabled: !clipboardRef.current,
      },
      { divider: true, label: '', onClick: () => {} },
      {
        label: '导出为 PNG',
        icon: <ImageDown className="h-4 w-4" />,
        onClick: handleExportAsPNG,
      },
    ]

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: menuItems,
    })
  }, [handlePaste, handleExportAsPNG])

  // 处理图片粘贴
  useEffect(() => {
    let isProcessingPaste = false

    const handlePasteImage = (e: ClipboardEvent) => {
      // 防止重复处理
      if (isProcessingPaste) return

      const items = e.clipboardData?.items
      if (!items) return

      // 检查是否有图片数据，只处理第一个图片
      let hasImage = false
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item && item.type.indexOf('image') !== -1) {
          hasImage = true
          break
        }
      }

      if (!hasImage) return

      e.preventDefault() // 阻止默认粘贴行为
      isProcessingPaste = true

      // 只处理第一个图片项
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item && item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile()
          if (blob) {
            const reader = new FileReader()
            reader.onload = (event) => {
              const dataUrl = event.target?.result as string
              if (dataUrl && reactFlowInstance) {
                // 在鼠标位置或画布中心添加图片节点
                const position = reactFlowInstance.screenToFlowPosition({
                  x: window.innerWidth / 2,
                  y: window.innerHeight / 2,
                })
                handleAddNode(CANVAS_NODE_TYPES.upload, position, { imageUrl: dataUrl } as CanvasNodeData)
                toast({ title: '图片已粘贴到画布' })
              }
              // 重置处理标志
              setTimeout(() => {
                isProcessingPaste = false
              }, 100)
            }
            reader.readAsDataURL(blob)
          }
          break // 只处理第一个图片
        }
      }
    }

    window.addEventListener('paste', handlePasteImage)
    return () => window.removeEventListener('paste', handlePasteImage)
  }, [reactFlowInstance, handleAddNode, toast])

  useEffect(() => {
    const handleEdgeDelete = (e: Event) => {
      const { id: edgeId } = (e as CustomEvent).detail
      if (!edgeId) return
      const edge = edgesRef.current.find((e) => e.id === edgeId)
      if (edge) clearDownstreamNodeData(edge)
      saveHistory()
      setEdges((eds) => eds.filter((e) => e.id !== edgeId))
    }
    window.addEventListener('edge-delete', handleEdgeDelete)
    return () => window.removeEventListener('edge-delete', handleEdgeDelete)
  }, [saveHistory, setEdges, clearDownstreamNodeData])

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 忽略输入框中的快捷键
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
        return
      }

      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'z':
            e.preventDefault()
            if (e.shiftKey) {
              handleRedo()
            } else {
              handleUndo()
            }
            break
          case 's':
            e.preventDefault()
            handleManualSave()
            break
          case 'o':
            e.preventDefault()
            handleImport()
            break
          case 'c':
            e.preventDefault()
            handleCopy()
            break
          case 'v':
            // 让 paste 事件处理图片粘贴，这里只处理节点粘贴
            // 如果剪贴板中有节点数据，则粘贴节点
            if (clipboardRef.current) {
              e.preventDefault()
              handlePaste()
            }
            // 如果是图片，让 handlePasteImage 处理
            break
          case 'e':
            e.preventDefault()
            handleExportAsPNG()
            break
          case 'l':
            e.preventDefault()
            handleToggleLock()
            break

        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeIds.size > 0) {
          handleDeleteSelected()
        } else if (selectedEdgeId) {
          handleDisconnectEdge()
        }
      } else if (e.key === 'Escape') {
        setSelectedNodeIds(new Set())
        setSelectedEdgeId(null)
        setShowSearch(false)
        setSearchQuery('')
      } else if (e.key === 'Tab') {
        e.preventDefault()
        setIsPropertiesPanelOpen(prev => !prev)
      } else if (e.key === 'h' && !e.ctrlKey && !e.metaKey) {
        handleToggleVisibility()
      } else if (e.key === 'ArrowUp' && e.altKey) {
        e.preventDefault()
        handleMoveLayer('up')
      } else if (e.key === 'ArrowDown' && e.altKey) {
        e.preventDefault()
        handleMoveLayer('down')
      } else if (e.key === '[' && e.ctrlKey) {
        e.preventDefault()
        handleMoveLayer('bottom')
      } else if (e.key === ']' && e.ctrlKey) {
        e.preventDefault()
        handleMoveLayer('top')
      } else if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setShowSearch(prev => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleUndo, handleRedo, handleManualSave, handleImport, handleCopy, handlePaste, handleDeleteSelected, handleDisconnectEdge, selectedNodeIds, selectedEdgeId, handleExportAsPNG, handleToggleLock, handleToggleVisibility, handleMoveLayer])

  const canUndo = historyRef.current.past.length > 0
  const canRedo = historyRef.current.future.length > 0

  return (
    <div className={cn('relative flex h-full w-full', className)} ref={reactFlowWrapper}>
      <ReactFlow<CanvasNode, Edge>
        nodes={nodes.map(node => ({
          ...node,
          data: {
            ...node.data,
            _connectingNodeId: connectingNodeId,
            _isConnecting: !!connectingNodeId,
            // 为分镜拆分节点注入添加节点的回调和当前位置
            ...(node.type === CANVAS_NODE_TYPES.storyboardSplit && {
              onAddNode: handleAddNode,
              nodePosition: node.position,
            }),
          } as CanvasNodeData,
        } as CanvasNode))}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onInit={setReactFlowInstance}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onEdgeClick={onEdgeClick}
        onSelectionChange={onSelectionChange}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onMove={onMove}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{
          type: 'custom',
          animated: false,
        }}
        fitView
        attributionPosition="bottom-left"
        deleteKeyCode={['Delete', 'Backspace']}
        snapToGrid={snapToGrid}
        snapGrid={[15, 15]}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        panOnDrag={[1, 2]}
        onlyRenderVisibleElements
        minZoom={0.1}
        maxZoom={4}
      >
        <Background gap={15} size={1} />
        <Controls className="!bottom-4 !right-4 !left-auto !top-auto" />
        <MiniMap
          nodeStrokeWidth={3}
          zoomable
          pannable
          className="!bg-background/80 !border-border !bottom-4 !right-20"
        />
        <SelectionDragOut selectedNodeIds={selectedNodeIds} nodes={nodes} />

        {/* Toolbar - 居中 */}
        <Panel position="top-center" className="m-4">
          <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-sm backdrop-blur">
            {/* 运行工作流按钮 */}
            {executionState.isRunning ? (
              <Button
                variant="destructive"
                size="icon"
                className="h-8 w-8"
                onClick={cancelExecution}
                title="停止工作流"
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                variant="default"
                size="icon"
                className="h-8 w-8"
                onClick={handleRunWorkflow}
                title="运行工作流"
              >
                <Play className="h-4 w-4" />
              </Button>
            )}
            {executionState.isRunning && (
              <div className="flex items-center gap-2 px-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="text-xs text-muted-foreground">
                  {executionState.globalProgress}%
                </span>
              </div>
            )}
            <div className="mx-1 h-4 w-px bg-border" />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleUndo}
              disabled={!canUndo || executionState.isRunning}
              title="撤销 (Ctrl+Z)"
            >
              <Undo className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleRedo}
              disabled={!canRedo || executionState.isRunning}
              title="重做 (Ctrl+Shift+Z)"
            >
              <Redo className="h-4 w-4" />
            </Button>
            <div className="mx-1 h-4 w-px bg-border" />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleManualSave}
              disabled={executionState.isRunning}
              title="保存 (Ctrl+S)"
            >
              <Save className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleImport}
              disabled={executionState.isRunning}
              title="导入 (Ctrl+O)"
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleExport}
              disabled={executionState.isRunning}
              title="导出"
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant={snapToGrid ? 'default' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={() => setSnapToGrid(!snapToGrid)}
              disabled={executionState.isRunning}
              title={snapToGrid ? '关闭网格对齐' : '开启网格对齐'}
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleFitView}
              disabled={executionState.isRunning}
              title="适应视图"
            >
              <Maximize className="h-4 w-4" />
            </Button>
            <Button
              variant={showSearch ? 'default' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowSearch(!showSearch)}
              disabled={executionState.isRunning}
              title="搜索节点 (Ctrl+F)"
            >
              <Search className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleExportAsPNG}
              disabled={executionState.isRunning}
              title="导出为 PNG (Ctrl+E)"
            >
              <ImageDown className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleToggleLock}
              disabled={selectedNodeIds.size === 0 || executionState.isRunning}
              title={nodes.some(n => selectedNodeIds.has(n.id) && n.draggable === false) ? '解锁节点 (Ctrl+L)' : '锁定节点 (Ctrl+L)'}
            >
              {nodes.some(n => selectedNodeIds.has(n.id) && n.draggable === false) ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleToggleVisibility}
              disabled={selectedNodeIds.size === 0 || executionState.isRunning}
              title="显示/隐藏节点 (H)"
            >
              {nodes.some(n => selectedNodeIds.has(n.id) && n.hidden) ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
            <span className="text-xs text-muted-foreground px-1 min-w-[3rem] text-center">
              {Math.round(zoomLevel * 100)}%
            </span>

            {(selectedNodeIds.size > 0 || selectedEdgeId) && (
              <>
                <div className="mx-1 h-4 w-px bg-border" />
                {selectedNodeIds.size > 0 && (
                  <span className="text-xs text-muted-foreground px-1">
                    已选 {selectedNodeIds.size} 个
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={selectedNodeIds.size > 0 ? handleDeleteSelected : handleDisconnectEdge}
                  title="删除"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>

          {/* 第二行 - 对齐分布按钮组 */}
          <div className="flex flex-wrap items-center gap-1 border-t pt-1 mt-1">
            <span className="text-xs text-muted-foreground px-1">对齐</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleAlignNodes('left')}
              disabled={selectedNodeIds.size < 2 || executionState.isRunning}
              title="左对齐"
            >
              <AlignLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleAlignNodes('center')}
              disabled={selectedNodeIds.size < 2 || executionState.isRunning}
              title="水平居中"
            >
              <AlignCenter className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleAlignNodes('right')}
              disabled={selectedNodeIds.size < 2 || executionState.isRunning}
              title="右对齐"
            >
              <AlignRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleAlignNodes('top')}
              disabled={selectedNodeIds.size < 2 || executionState.isRunning}
              title="顶部对齐"
            >
              <AlignVerticalJustifyStart className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleAlignNodes('middle')}
              disabled={selectedNodeIds.size < 2 || executionState.isRunning}
              title="垂直居中"
            >
              <AlignVerticalJustifyCenter className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleAlignNodes('bottom')}
              disabled={selectedNodeIds.size < 2 || executionState.isRunning}
              title="底部对齐"
            >
              <AlignVerticalJustifyEnd className="h-4 w-4" />
            </Button>
            <div className="mx-1 h-4 w-px bg-border" />
            <span className="text-xs text-muted-foreground px-1">分布</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleDistributeNodes('horizontal')}
              disabled={selectedNodeIds.size < 3 || executionState.isRunning}
              title="水平均分"
            >
              <ArrowLeftRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleDistributeNodes('vertical')}
              disabled={selectedNodeIds.size < 3 || executionState.isRunning}
              title="垂直均分"
            >
              <ArrowUpDown className="h-4 w-4" />
            </Button>
            <div className="mx-1 h-4 w-px bg-border" />
            <span className="text-xs text-muted-foreground px-1">图层</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleMoveLayer('top')}
              disabled={selectedNodeIds.size < 1 || executionState.isRunning}
              title="置顶 (Ctrl+])"
            >
              <ChevronsUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleMoveLayer('up')}
              disabled={selectedNodeIds.size < 1 || executionState.isRunning}
              title="上移一层 (Alt+↑)"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleMoveLayer('down')}
              disabled={selectedNodeIds.size < 1 || executionState.isRunning}
              title="下移一层 (Alt+↓)"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleMoveLayer('bottom')}
              disabled={selectedNodeIds.size < 1 || executionState.isRunning}
              title="置底 (Ctrl+[)"
            >
              <ChevronsDown className="h-4 w-4" />
            </Button>
          </div>
        </Panel>

        {/* 搜索框 */}
        {showSearch && (
          <Panel position="top-center" className="m-4 mt-16">
            <div className="flex items-center gap-2 rounded-lg border bg-background/95 p-2 shadow-sm backdrop-blur">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="搜索节点名称、提示词..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="w-64 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                autoFocus
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setShowSearch(false)}
              >
                <X className="h-4 w-4" />
              </Button>
              <Button
                variant="default"
                size="sm"
                className="h-7"
                onClick={handleSearch}
              >
                查找
              </Button>
            </div>
          </Panel>
        )}

        {/* Node Library */}
        <Panel position="top-right" className="m-4">
          <NodeLibraryPanel onAddNode={handleAddNode} />
        </Panel>

        {/* Properties Panel - 左侧 */}
        <Panel position="top-left" className="m-4 space-y-2">
          <PropertiesPanel
            nodeId={selectedNodeId}
            nodes={nodes}
            isOpen={isPropertiesPanelOpen}
            onToggle={() => setIsPropertiesPanelOpen(!isPropertiesPanelOpen)}
          />
          <QuickPromptPanel
            onInsertPrompt={() => {}}
          />
        </Panel>


      </ReactFlow>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      {quickMenuState && (
        <QuickNodeMenu
          x={quickMenuState.x}
          y={quickMenuState.y}
          sourceNodeId={quickMenuState.sourceNodeId}
          sourceHandleId={quickMenuState.sourceHandleId}
          onSelect={handleQuickNodeSelect}
          onClose={() => setQuickMenuState(null)}
        />
      )}
    </div>
  )
}
