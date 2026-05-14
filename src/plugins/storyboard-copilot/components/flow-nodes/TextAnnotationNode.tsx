import { memo, useCallback, useState, useEffect, useRef } from 'react'
import { Handle, Position, type NodeProps, useEdges, useNodes } from '@xyflow/react'
import { FileText } from 'lucide-react'

import type { TextAnnotationNodeData } from '../../types'
import { getNodeContainerClass, getSourceHandleClass, getTargetHandleClass, NODE_HEADER_FLOATING_CLASS, NODE_HEADER_CLASSES, NODE_CONTENT_CLASSES } from './NodeStyles'
import { NodeResizeHandle } from './NodeResizeHandle'
import { canvasEvents } from '../../utils/canvasEvents'
import { useEnlargedHandles } from '../../hooks/useEnlargedHandles'

interface TextAnnotationNodeProps extends NodeProps {
  data: TextAnnotationNodeData
}

const DEFAULT_WIDTH = 300
const DEFAULT_HEIGHT = 180
const MIN_WIDTH = 180
const MIN_HEIGHT = 100
const MAX_WIDTH = 900
const MAX_HEIGHT = 900

export const TextAnnotationNode = memo(({ id, data, selected, width, height }: TextAnnotationNodeProps) => {
  const [content, setContent] = useState(data.content || '')
  const [displayName, setDisplayName] = useState(data.displayName || '文本标注')
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const nodeWidth = width || DEFAULT_WIDTH
  const nodeHeight = height || DEFAULT_HEIGHT
  const enlargedHandles = useEnlargedHandles(id)

  // 同步 data.content 到本地状态（画布恢复/刷新时）
  useEffect(() => {
    if (data.content && data.content !== content) {
      setContent(data.content)
    }
  }, [data.content])

  // 获取连接的节点和边
  const nodes = useNodes()
  const edges = useEdges()

  // 接收上游节点的文本输入
  useEffect(() => {
    // 查找连接到当前节点的边
    const incomingEdges = edges.filter(edge => edge.target === id)
    
    if (incomingEdges.length > 0) {
      // 获取上游节点的数据
      const firstEdge = incomingEdges[0]
      if (!firstEdge) return
      const sourceNode = nodes.find(node => node.id === firstEdge.source)
      if (sourceNode?.data) {
        // 尝试从不同节点类型获取文本内容
        const sourceData = sourceNode.data as Record<string, unknown>
        let incomingText = ''
        
        // 尝试获取各种可能的文本字段
        if (typeof sourceData.content === 'string') {
          incomingText = sourceData.content
        } else if (typeof sourceData.prompt === 'string') {
          incomingText = sourceData.prompt
        } else if (typeof sourceData.text === 'string') {
          incomingText = sourceData.text
        } else if (typeof sourceData.result === 'string') {
          incomingText = sourceData.result
        } else if (typeof sourceData.output === 'string') {
          incomingText = sourceData.output
        }
        
        // 如果有新文本且与当前内容不同，则更新
        if (incomingText && incomingText !== content) {
          setContent(incomingText)
          data.content = incomingText
        }
      }
    }
  }, [edges, nodes, id, data, content])

  // 向外传播数据（当下游有节点连接时）
  const prevContentRef = useRef(content)
  useEffect(() => {
    const outgoingEdges = edges.filter(edge => edge.source === id)
    if (outgoingEdges.length > 0 && content && content !== prevContentRef.current) {
      prevContentRef.current = content
      canvasEvents.emit({
        type: 'propagateData',
        sourceNodeId: id,
        data: { textContent: content },
      })
    }
  }, [content, edges, id])

  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value
    setContent(newContent)
    data.content = newContent
  }, [data])

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value
    setDisplayName(newTitle)
    data.displayName = newTitle
  }, [data])

  const handleTitleBlur = useCallback(() => {
    setIsEditingTitle(false)
  }, [])

  const handleTitleClick = useCallback(() => {
    if (selected) {
      setIsEditingTitle(true)
    }
  }, [selected])

  const renderMarkdown = useCallback((text: string) => {
    if (!text.trim()) return <span className="text-muted-foreground italic">点击编辑内容...</span>

    const lines = text.split('\n')
    return lines.map((line, index) => {
      if (line.startsWith('# ')) {
        return <h1 key={index} className="text-lg font-bold mb-2">{line.slice(2)}</h1>
      }
      if (line.startsWith('## ')) {
        return <h2 key={index} className="text-base font-semibold mb-2">{line.slice(3)}</h2>
      }
      if (line.startsWith('### ')) {
        return <h3 key={index} className="text-sm font-medium mb-1">{line.slice(4)}</h3>
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return <li key={index} className="ml-4 list-disc">{line.slice(2)}</li>
      }
      if (/^\d+\. /.test(line)) {
        return <li key={index} className="ml-4 list-decimal">{line.replace(/^\d+\. /, '')}</li>
      }
      if (line.startsWith('> ')) {
        return <blockquote key={index} className="border-l-2 border-primary pl-3 italic text-muted-foreground">{line.slice(2)}</blockquote>
      }
      if (line.startsWith('```')) {
        return <pre key={index} className="bg-muted p-2 rounded text-xs font-mono overflow-auto">{line.slice(3)}</pre>
      }
      if (line.startsWith('`') && line.endsWith('`')) {
        return <code key={index} className="bg-muted px-1 rounded text-xs font-mono">{line.slice(1, -1)}</code>
      }
      let formattedLine = line
        .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        .replace(/_(.+?)_/g, '<em>$1</em>')

      if (formattedLine !== line) {
        return <p key={index} className="mb-1" dangerouslySetInnerHTML={{ __html: formattedLine }} />
      }

      return line ? <p key={index} className="mb-1">{line}</p> : <br key={index} />
    })
  }, [])

  return (
    <div
      className={getNodeContainerClass(!!selected, 'flex h-full flex-col')}
      style={{ width: nodeWidth, height: nodeHeight }}
    >
      {/* 输入端口 - 接收上游文本 */}
      <Handle 
        type="target" 
        position={Position.Left} 
        id="text" 
        className={getTargetHandleClass(undefined, enlargedHandles.target)} 
        style={{ top: '50%' }} 
      />

      {/* 输出端口 - 用于传递文本内容 */}
      <Handle 
        type="source" 
        position={Position.Right} 
        id="text" 
        className={getSourceHandleClass(undefined, enlargedHandles.source)} 
        style={{ top: '50%' }} 
      />

      <div className={NODE_HEADER_FLOATING_CLASS}>
        <div className={NODE_HEADER_CLASSES.container}>
          <div className={NODE_HEADER_CLASSES.title}>
            <FileText className={NODE_HEADER_CLASSES.icon + ' text-blue-500'} />
            {isEditingTitle ? (
              <input
                type="text"
                value={displayName}
                onChange={handleTitleChange}
                onBlur={handleTitleBlur}
                autoFocus
                className="flex-1 bg-transparent text-[11px] font-medium outline-none"
              />
            ) : (
              <span
                onClick={handleTitleClick}
                className="flex-1 cursor-pointer text-[11px] font-medium hover:text-primary"
              >
                {displayName}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className={NODE_CONTENT_CLASSES.container + ' nodrag nowheel flex-1 overflow-hidden flex flex-col'}>
        {selected ? (
          <textarea
            value={content}
            onChange={handleContentChange}
            placeholder="输入文本内容或提示词...\n支持Markdown：\n# 标题\n**粗体**\n*斜体*\n- 列表\n> 引用"
            className="flex-1 w-full resize-none border-none bg-transparent text-[11px] leading-5 outline-none placeholder:text-muted-foreground/70"
          />
        ) : (
          <div className="flex-1 w-full overflow-auto text-[11px] leading-5">
            {renderMarkdown(content)}
          </div>
        )}
        {/* 字数统计 */}
        <div className="text-[10px] text-muted-foreground text-right pt-1 border-t border-border/20 mt-1">
          {content.length} 字
        </div>
      </div>

      <NodeResizeHandle
        minWidth={MIN_WIDTH}
        minHeight={MIN_HEIGHT}
        maxWidth={MAX_WIDTH}
        maxHeight={MAX_HEIGHT}
      />
    </div>
  )
})

TextAnnotationNode.displayName = 'TextAnnotationNode'
