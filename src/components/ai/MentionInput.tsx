import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'

import Mention from '@tiptap/extension-mention'
import Placeholder from '@tiptap/extension-placeholder'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { mergeAttributes } from '@tiptap/core'
import { cn } from '@/lib/utils'
import { type MentionData, type MentionItem } from '@/types/mention'
import { resolvePromptToAIFormat, extractMentionsFromJSON } from '@/utils/promptResolver'
import type { ResolvedPrompt } from '@/types/mention'
import { MentionDropdown } from './MentionDropdown'
import type { SlashPreset } from '@/plugins/storyboard-copilot/utils/slashPresets'
import { searchSlashPresets } from '@/plugins/storyboard-copilot/utils/slashPresets'
import { SlashMenuDropdown } from '@/plugins/storyboard-copilot/components/flow-nodes/SlashMenuDropdown'
import './mention-input.css'

export interface MentionInputRef {
  getJSON: () => Record<string, unknown>
  getText: () => string
  getMentions: () => MentionData[]
  getResolvedPrompt: () => ResolvedPrompt
  focus: () => void
  clear: () => void
}

export interface MentionInputProps {
  value?: string
  onChange?: (value: string) => void
  onMentionsChange?: (mentions: MentionData[]) => void
  placeholder?: string
  className?: string
  minRows?: number
  maxRows?: number
  disabled?: boolean
  autoFocus?: boolean
  customSearch?: (query: string) => MentionItem[]
  projectId?: string
  episodeId?: string
  enableSlashMenu?: boolean
}

interface SuggestionCommand {
  id: string
  label: string
  type: string
  imageUrl?: string
  description?: string
  prompt?: string
}

const CustomMention = Mention.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      type: { default: null, renderHTML: (attrs) => ({ 'data-mention-type': attrs.type }) },
      imageUrl: { default: null, renderHTML: () => ({}) },
      description: { default: null, renderHTML: () => ({}) },
      prompt: { default: null, renderHTML: () => ({}) },
    }
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(
        { class: 'mention-chip' },
        HTMLAttributes,
      ),
      `@${node.attrs.label ?? ''}`,
    ]
  },
})

const SlashCommand = Mention.extend({
  name: 'slashCommand',
  addAttributes() {
    return {
      ...this.parent?.(),
      type: { default: 'slash' },
    }
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes({ class: 'slash-chip' }, HTMLAttributes),
      `/${node.attrs.label ?? ''}`,
    ]
  },
})

export const MentionInput = forwardRef<MentionInputRef, MentionInputProps>(
  (
    {
      value = '',
      onChange,
      onMentionsChange,
      placeholder = '输入提示词，@ 引用角色、场景、道具...',
      className,
      minRows = 3,
      maxRows = 8,
      disabled = false,
      autoFocus = false,
      customSearch,
      enableSlashMenu = false,
    },
    ref,
  ) => {
    const search = customSearch ?? (() => [] as MentionItem[])
    const searchRef = useRef(search)
    searchRef.current = search
    const [dropdownVisible, setDropdownVisible] = useState(false)
    const [dropdownItems, setDropdownItems] = useState<MentionItem[]>([])
    const [dropdownIndex, setDropdownIndex] = useState(0)
    const [dropdownQuery, setDropdownQuery] = useState('')
    const [dropdownVisibleCount, setDropdownVisibleCount] = useState(0)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const commandRef = useRef<((props: SuggestionCommand) => void) | null>(null)
    const isInternalUpdate = useRef(false)
    const lastExternalValue = useRef(value)

    const [slashVisible, setSlashVisible] = useState(false)
    const [slashItems, setSlashItems] = useState<SlashPreset[]>([])
    const [slashIndex, setSlashIndex] = useState(0)
    const [slashQuery, setSlashQuery] = useState('')
    const [slashVisibleCount, setSlashVisibleCount] = useState(0)
    const slashDropdownRef = useRef<HTMLDivElement>(null)
    const slashCommandRef = useRef<((props: SuggestionCommand) => void) | null>(null)

    const anyDropdownVisible = dropdownVisible || slashVisible

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: false,
          blockquote: false,
          codeBlock: false,
          horizontalRule: false,
          listItem: false,
          bulletList: false,
          orderedList: false,
        }),
        Placeholder.configure({ placeholder }),
        CustomMention.configure({
          HTMLAttributes: { class: 'mention-chip' },
          suggestion: {
            char: '@',
            allowedPrefixes: null,
            items: ({ query }: { query: string }) => searchRef.current(query),
            render: () => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const renderer: any = {
                onStart: (props: Record<string, unknown>) => {
                  commandRef.current = props.command as (p: SuggestionCommand) => void
                  setDropdownQuery(props.query as string)
                  setDropdownItems(searchRef.current(props.query as string))
                  setDropdownIndex(0)
                  setDropdownVisible(true)
                  setSlashVisible(false)
                },
                onUpdate: (props: Record<string, unknown>) => {
                  commandRef.current = props.command as (p: SuggestionCommand) => void
                  setDropdownQuery(props.query as string)
                  setDropdownItems(searchRef.current(props.query as string))
                  setDropdownIndex(0)
                },
                onKeyDown: (props: { event: KeyboardEvent }) => {
                  if (props.event.key === 'ArrowDown') {
                    setDropdownIndex(prev => Math.min(prev + 1, dropdownVisibleCount - 1))
                    return true
                  }
                  if (props.event.key === 'ArrowUp') {
                    setDropdownIndex(prev => Math.max(prev - 1, 0))
                    return true
                  }
                  if (props.event.key === 'Enter') {
                    if (dropdownItems[dropdownIndex]) {
                      handleSelect(dropdownItems[dropdownIndex])
                    }
                    return true
                  }
                  if (props.event.key === 'Escape') {
                    setDropdownVisible(false)
                    return true
                  }
                  return false
                },
                onExit: () => {
                  setDropdownVisible(false)
                },
              }
              return renderer
            },
          },
        }),
        ...(enableSlashMenu
          ? [
              SlashCommand.configure({
                HTMLAttributes: { class: 'slash-chip' },
                suggestion: {
                  char: '/',
                  allowedPrefixes: null,
                  items: ({ query }: { query: string }) => {
                    const results = searchSlashPresets(query)
                    return results.map((p) => ({
                      id: p.id,
                      label: p.label,
                      type: 'slash',
                      prompt: p.prompt,
                      description: p.description,
                    })) as SuggestionCommand[]
                  },
                  render: () => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const renderer: any = {
                      onStart: (props: Record<string, unknown>) => {
                        slashCommandRef.current = props.command as (p: SuggestionCommand) => void
                        const q = props.query as string
                        setSlashQuery(q)
                        setSlashItems(searchSlashPresets(q))
                        setSlashIndex(0)
                        setSlashVisible(true)
                        setDropdownVisible(false)
                      },
                      onUpdate: (props: Record<string, unknown>) => {
                        slashCommandRef.current = props.command as (p: SuggestionCommand) => void
                        const q = props.query as string
                        setSlashQuery(q)
                        setSlashItems(searchSlashPresets(q))
                        setSlashIndex(0)
                      },
                      onKeyDown: (props: { event: KeyboardEvent }) => {
                        if (props.event.key === 'ArrowDown') {
                          setSlashIndex(prev => Math.min(prev + 1, slashVisibleCount - 1))
                          return true
                        }
                        if (props.event.key === 'ArrowUp') {
                          setSlashIndex(prev => Math.max(prev - 1, 0))
                          return true
                        }
                        if (props.event.key === 'Enter') {
                          const flatItems = slashItems
                          if (flatItems[slashIndex]) {
                            handleSlashSelect(flatItems[slashIndex])
                          }
                          return true
                        }
                        if (props.event.key === 'Escape') {
                          setSlashVisible(false)
                          return true
                        }
                        return false
                      },
                      onExit: () => {
                        setSlashVisible(false)
                      },
                    }
                    return renderer
                  },
                },
              }),
            ]
          : []),
      ],
      content: value || '',
      editable: !disabled,
      editorProps: {
        attributes: { class: 'mention-input-editor outline-none' },
        handleKeyDown: () => {
          if (anyDropdownVisible) return true
          return false
        },
      },
      onUpdate: ({ editor: ed }) => {
        if (isInternalUpdate.current) return
        const text = ed.getText()
        lastExternalValue.current = text
        onChange?.(text)
        notifyMentions(ed)
      },
    })

    useEffect(() => {
      if (!editor || isInternalUpdate.current) return
      if (value !== lastExternalValue.current) {
        isInternalUpdate.current = true
        editor.commands.setContent(value || '')
        lastExternalValue.current = value
        isInternalUpdate.current = false
      }
    }, [value, editor])

    useEffect(() => {
      if (editor && editor.options.editable !== !disabled) {
        editor.setEditable(!disabled)
      }
    }, [disabled, editor])

    useEffect(() => {
      if (autoFocus && editor) {
        editor.commands.focus()
      }
    }, [autoFocus, editor])

    const notifyMentions = useCallback(
      (ed: typeof editor) => {
        if (!ed || !onMentionsChange) return
        const json = ed.getJSON()
        const mentions = extractMentionsFromJSON(json as Record<string, unknown>)
        onMentionsChange(mentions)
      },
      [onMentionsChange],
    )

    const handleSelect = useCallback((item: MentionItem) => {
      if (!commandRef.current) return
      commandRef.current({
        id: item.id,
        label: item.name,
        type: item.type,
        imageUrl: item.imageUrl,
        description: item.description,
        prompt: item.prompt,
      })
      setDropdownVisible(false)
    }, [])

    const handleSlashSelect = useCallback((item: SlashPreset) => {
      if (!slashCommandRef.current) return
      const promptText = item.prompt.replace('{用户输入}', '').trim()
      slashCommandRef.current({
        id: item.id,
        label: item.label,
        type: 'slash',
        prompt: promptText,
        description: item.description,
      })
      setSlashVisible(false)
    }, [])

    useImperativeHandle(
      ref,
      () => ({
        getJSON: () => (editor?.getJSON() ?? {}) as Record<string, unknown>,
        getText: () => editor?.getText() ?? '',
        getMentions: () => {
          if (!editor) return []
          return extractMentionsFromJSON(editor.getJSON() as Record<string, unknown>)
        },
        getResolvedPrompt: () => {
          if (!editor) return { text: '', content: [], referenceImages: [], mentions: [] }
          const json = editor.getJSON() as Record<string, unknown>
          const mentions = extractMentionsFromJSON(json)
          return resolvePromptToAIFormat(json, mentions)
        },
        focus: () => editor?.commands.focus(),
        clear: () => {
          editor?.commands.clearContent(true)
          lastExternalValue.current = ''
        },
      }),
      [editor],
    )

    useEffect(() => {
      if (!anyDropdownVisible) return
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as Node
        const insideMention = dropdownRef.current?.contains(target)
        const insideSlash = slashDropdownRef.current?.contains(target)
        if (!insideMention && !insideSlash) {
          setDropdownVisible(false)
          setSlashVisible(false)
        }
      }
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [anyDropdownVisible])

    const lineHeight = 22
    const minHeight = minRows * lineHeight + 16
    const maxHeight = maxRows * lineHeight + 16

    return (
      <div className={cn('relative nodrag nowheel', className)}>
        <div
          className={cn(
            'rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
            'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
            disabled && 'cursor-not-allowed opacity-50',
          )}
          style={{ minHeight, maxHeight, overflowY: 'auto' }}
        >
          <EditorContent editor={editor} />
        </div>

        {dropdownVisible && dropdownItems.length > 0 && (
          <MentionDropdown
            ref={dropdownRef}
            items={dropdownItems}
            selectedIndex={dropdownIndex}
            query={dropdownQuery}
            onSelect={handleSelect}
            onHover={setDropdownIndex}
            onVisibleCountChange={setDropdownVisibleCount}
          />
        )}

        {slashVisible && slashItems.length > 0 && (
          <SlashMenuDropdown
            ref={slashDropdownRef}
            items={slashItems}
            selectedIndex={slashIndex}
            query={slashQuery}
            onSelect={handleSlashSelect}
            onHover={setSlashIndex}
            onVisibleCountChange={setSlashVisibleCount}
          />
        )}
      </div>
    )
  },
)

MentionInput.displayName = 'MentionInput'
