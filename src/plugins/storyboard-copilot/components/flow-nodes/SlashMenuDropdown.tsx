import { forwardRef, useEffect, useRef, useState } from 'react'
import { Image, Video, Type, Sun, Camera, LayoutGrid, PenTool } from 'lucide-react'
import type { SlashPreset } from '../../utils/slashPresets'
import { SLASH_CATEGORIES } from '../../utils/slashPresets'

interface SlashMenuDropdownProps {
  items: SlashPreset[]
  selectedIndex: number
  query: string
  onSelect: (item: SlashPreset) => void
  onHover: (index: number) => void
  onVisibleCountChange: (count: number) => void
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  '图片': <Image className="h-3 w-3" />,
  '分镜': <LayoutGrid className="h-3 w-3" />,
  '景别': <Camera className="h-3 w-3" />,
  '机位': <PenTool className="h-3 w-3" />,
  '光影': <Sun className="h-3 w-3" />,
  '视频': <Video className="h-3 w-3" />,
  '文本': <Type className="h-3 w-3" />,
}

export const SlashMenuDropdown = forwardRef<HTMLDivElement, SlashMenuDropdownProps>(
  ({ items, selectedIndex, query, onSelect, onHover, onVisibleCountChange }, ref) => {
    const listRef = useRef<HTMLDivElement>(null)
    const [visibleCount, setVisibleCount] = useState(0)

    const grouped = SLASH_CATEGORIES.map((cat) => ({
      ...cat,
      items: items.filter((i) => i.category === cat.id),
    })).filter((g) => g.items.length > 0)

    const flatItems = grouped.flatMap((g) => g.items)

    useEffect(() => {
      if (visibleCount !== flatItems.length) {
        setVisibleCount(flatItems.length)
        onVisibleCountChange(flatItems.length)
      }
    }, [flatItems.length, visibleCount, onVisibleCountChange])

    useEffect(() => {
      const selectedEl = listRef.current?.querySelector('[data-selected="true"]')
      selectedEl?.scrollIntoView({ block: 'nearest' })
    }, [selectedIndex])

    let flatIndex = 0

    return (
      <div
        ref={ref}
        className="absolute left-0 z-50 w-72 max-h-64 overflow-y-auto rounded-lg border bg-popover shadow-lg nodrag"
        style={{ top: '100%', marginTop: 4 }}
      >
        {query && (
          <div className="px-3 py-1.5 text-xs text-muted-foreground border-b">
            搜索 "{query}" · {flatItems.length} 个结果
          </div>
        )}
        <div ref={listRef}>
          {grouped.map((group) => (
            <div key={group.id}>
              <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground sticky top-0 bg-popover/95 backdrop-blur-sm">
                {CATEGORY_ICONS[group.id]}
                {group.label}
              </div>
              {group.items.map((item) => {
                const currentFlatIndex = flatIndex++
                const isSelected = currentFlatIndex === selectedIndex
                return (
                  <div
                    key={item.id}
                    data-selected={isSelected}
                    className={`
                      flex items-start gap-2 px-3 py-1.5 cursor-pointer text-sm
                      ${isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'}
                    `}
                    onClick={() => onSelect(item)}
                    onMouseEnter={() => onHover(currentFlatIndex)}
                  >
                    <span className="shrink-0 mt-0.5 text-muted-foreground">
                      {CATEGORY_ICONS[item.category]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{item.label}</div>
                      {item.description && (
                        <div className="text-xs text-muted-foreground truncate">{item.description}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        {flatItems.length === 0 && (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            没有匹配的预设
          </div>
        )}
      </div>
    )
  },
)

SlashMenuDropdown.displayName = 'SlashMenuDropdown'
