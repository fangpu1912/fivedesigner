import { useMemo } from 'react'

import CharacterCount from '@tiptap/extension-character-count'
import Highlight from '@tiptap/extension-highlight'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import { useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

export interface UseRichTextOptions {
  initialContent: string
  placeholder?: string
  editable?: boolean
  onUpdate?: (content: string) => void
  maxLength?: number
}

export interface RichTextActions {
  toggleBold: () => void
  toggleItalic: () => void
  toggleUnderline: () => void
  toggleStrike: () => void
  toggleCode: () => void
  toggleHeading: (level: 1 | 2 | 3 | 4 | 5 | 6) => void
  toggleBulletList: () => void
  toggleOrderedList: () => void
  toggleBlockquote: () => void
  toggleCodeBlock: () => void
  setTextAlign: (align: 'left' | 'center' | 'right' | 'justify') => void
  toggleHighlight: () => void
  undo: () => void
  redo: () => void
  clearFormat: () => void
  insertLink: (url: string) => void
  focus: () => void
}

export interface UseRichTextReturn {
  editor: Editor | null
  content: string
  characterCount: number
  wordCount: number
  actions: RichTextActions
  isActive: {
    bold: boolean
    italic: boolean
    underline: boolean
    strike: boolean
    code: boolean
    heading: (level: number) => boolean
    bulletList: boolean
    orderedList: boolean
    blockquote: boolean
    codeBlock: boolean
  }
}

export function useRichText({
  initialContent,
  placeholder = '开始输入...',
  editable = true,
  onUpdate,
}: UseRichTextOptions): UseRichTextReturn {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Highlight.configure({
        multicolor: true,
      }),
      Placeholder.configure({
        placeholder,
      }),
      CharacterCount,
    ],
    content: initialContent,
    editable,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      onUpdate?.(html)
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[100px] p-4',
      },
    },
  })

  const actions: RichTextActions = useMemo(
    () => ({
      toggleBold: () => editor?.chain().focus().toggleBold().run(),
      toggleItalic: () => editor?.chain().focus().toggleItalic().run(),
      toggleUnderline: () => editor?.chain().focus().toggleUnderline().run(),
      toggleStrike: () => editor?.chain().focus().toggleStrike().run(),
      toggleCode: () => editor?.chain().focus().toggleCode().run(),
      toggleHeading: level => editor?.chain().focus().toggleHeading({ level }).run(),
      toggleBulletList: () => editor?.chain().focus().toggleBulletList().run(),
      toggleOrderedList: () => editor?.chain().focus().toggleOrderedList().run(),
      toggleBlockquote: () => editor?.chain().focus().toggleBlockquote().run(),
      toggleCodeBlock: () => editor?.chain().focus().toggleCodeBlock().run(),
      setTextAlign: align => editor?.chain().focus().setTextAlign(align).run(),
      toggleHighlight: () => editor?.chain().focus().toggleHighlight().run(),
      undo: () => editor?.chain().focus().undo().run(),
      redo: () => editor?.chain().focus().redo().run(),
      clearFormat: () => editor?.chain().focus().clearNodes().unsetAllMarks().run(),
      insertLink: url => editor?.chain().focus().setLink({ href: url }).run(),
      focus: () => editor?.chain().focus().run(),
    }),
    [editor]
  )

  const isActive = useMemo(
    () => ({
      bold: editor?.isActive('bold') ?? false,
      italic: editor?.isActive('italic') ?? false,
      underline: editor?.isActive('underline') ?? false,
      strike: editor?.isActive('strike') ?? false,
      code: editor?.isActive('code') ?? false,
      heading: (level: number) => editor?.isActive('heading', { level }) ?? false,
      bulletList: editor?.isActive('bulletList') ?? false,
      orderedList: editor?.isActive('orderedList') ?? false,
      blockquote: editor?.isActive('blockquote') ?? false,
      codeBlock: editor?.isActive('codeBlock') ?? false,
    }),
    [editor]
  )

  const content = editor?.getHTML() ?? ''
  const characterCount = editor?.storage.characterCount.characters() ?? 0
  const wordCount = editor?.storage.characterCount.words() ?? 0

  return {
    editor,
    content,
    characterCount,
    wordCount,
    actions,
    isActive,
  }
}

export function useRichTextShortcuts(editor: Editor | null, actions: RichTextActions): void {
  void editor
  void actions
}
