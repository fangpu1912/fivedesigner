import React, { useCallback, useEffect } from 'react'

import { EditorContent } from '@tiptap/react'
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Highlighter,
  Undo,
  Redo,
  RemoveFormatting,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { useRichText } from './hooks/useRichText'

export interface RichTextEditorProps {
  content: string
  onChange: (content: string) => void
  placeholder?: string
  editable?: boolean
  minHeight?: number
  maxHeight?: number
  toolbar?: boolean
  className?: string
  showCharacterCount?: boolean
  maxLength?: number
}

const ToolbarButton: React.FC<{
  onClick: () => void
  isActive?: boolean
  disabled?: boolean
  children: React.ReactNode
  title?: string
}> = ({ onClick, isActive, disabled, children, title }) => (
  <Button
    type="button"
    variant={isActive ? 'secondary' : 'ghost'}
    size="sm"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className="h-8 w-8 p-0"
  >
    {children}
  </Button>
)

const ToolbarDivider: React.FC = () => <div className="w-px h-6 bg-border mx-1" />

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  content,
  onChange,
  placeholder = '开始输入...',
  editable = true,
  minHeight = 150,
  maxHeight = 500,
  toolbar = true,
  className,
  showCharacterCount = true,
  maxLength,
}) => {
  const { editor, actions, isActive, characterCount, wordCount } = useRichText({
    initialContent: content,
    placeholder,
    editable,
    onUpdate: onChange,
    maxLength,
  })

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content)
    }
  }, [content, editor])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!editor || !editor.isEditable) return

      const isMod = event.ctrlKey || event.metaKey

      if (isMod) {
        switch (event.key.toLowerCase()) {
          case 'b':
            event.preventDefault()
            actions.toggleBold()
            break
          case 'i':
            event.preventDefault()
            actions.toggleItalic()
            break
          case 'u':
            event.preventDefault()
            actions.toggleUnderline()
            break
          case 'z':
            event.preventDefault()
            if (event.shiftKey) {
              actions.redo()
            } else {
              actions.undo()
            }
            break
        }
      }
    },
    [editor, actions]
  )

  const isOverLimit = maxLength && characterCount > maxLength

  return (
    <div
      className={cn(
        'rounded-md border border-input bg-background ring-offset-background flex flex-col overflow-hidden',
        'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
        className
      )}
      onKeyDown={handleKeyDown}
    >
      {toolbar && editor && (
        <div className="flex flex-wrap items-center gap-1 border-b p-2">
          <ToolbarButton onClick={actions.undo} title="撤销 (Ctrl+Z)">
            <Undo className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={actions.redo} title="重做 (Ctrl+Y)">
            <Redo className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton
            onClick={actions.toggleBold}
            isActive={isActive.bold}
            title="加粗 (Ctrl+B)"
          >
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={actions.toggleItalic}
            isActive={isActive.italic}
            title="斜体 (Ctrl+I)"
          >
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={actions.toggleUnderline}
            isActive={isActive.underline}
            title="下划线 (Ctrl+U)"
          >
            <Underline className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={actions.toggleStrike} isActive={isActive.strike} title="删除线">
            <Strikethrough className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={actions.toggleCode} isActive={isActive.code} title="行内代码">
            <Code className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={actions.toggleHighlight} title="高亮">
            <Highlighter className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton
            onClick={() => actions.toggleHeading(1)}
            isActive={isActive.heading(1)}
            title="标题 1"
          >
            <Heading1 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => actions.toggleHeading(2)}
            isActive={isActive.heading(2)}
            title="标题 2"
          >
            <Heading2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => actions.toggleHeading(3)}
            isActive={isActive.heading(3)}
            title="标题 3"
          >
            <Heading3 className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton
            onClick={actions.toggleBulletList}
            isActive={isActive.bulletList}
            title="无序列表"
          >
            <List className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={actions.toggleOrderedList}
            isActive={isActive.orderedList}
            title="有序列表"
          >
            <ListOrdered className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={actions.toggleBlockquote}
            isActive={isActive.blockquote}
            title="引用"
          >
            <Quote className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton onClick={() => actions.setTextAlign('left')} title="左对齐">
            <AlignLeft className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => actions.setTextAlign('center')} title="居中对齐">
            <AlignCenter className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => actions.setTextAlign('right')} title="右对齐">
            <AlignRight className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => actions.setTextAlign('justify')} title="两端对齐">
            <AlignJustify className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton onClick={actions.clearFormat} title="清除格式">
            <RemoveFormatting className="h-4 w-4" />
          </ToolbarButton>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        <EditorContent
          editor={editor}
          className="prose prose-sm max-w-none dark:prose-invert"
        />
      </div>

      {showCharacterCount && (
        <div className="flex justify-end border-t px-3 py-1.5 text-xs text-muted-foreground">
          <span className={cn(isOverLimit && 'text-destructive font-medium')}>
            {characterCount} 字符
            {maxLength && ` / ${maxLength}`}
          </span>
          <span className="mx-2">·</span>
          <span>{wordCount} 词</span>
        </div>
      )}
    </div>
  )
}

export default RichTextEditor
