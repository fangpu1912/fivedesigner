import { useState, useCallback, useMemo, useEffect } from 'react'
import { Bookmark, ChevronRight, Camera, Grid3X3, Users, Settings2, Eye, Plus, Pencil, Trash2, X, CheckCheck, RotateCcw, Copy, Check } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { confirm } from '@tauri-apps/plugin-dialog'

interface PromptTemplate {
  id: string
  name: string
  prompt: string
}

interface SimpleTag {
  id: string
  name: string
  prompt: string
}

interface TagCategory {
  id: string
  label: string
  tags: SimpleTag[]
}

interface PanelItem {
  id: string
  name: string
  icon: React.ReactNode
  description: string
  defaultValue: Record<string, string>
  render: (props: { value: Record<string, string>; onChange: (v: Record<string, string>) => void }) => React.ReactNode
  buildPrompt: (value: Record<string, string>) => string
}

const TAG_CATEGORIES: TagCategory[] = [
  {
    id: 'shot', label: '景别',
    tags: [
      { id: 'ews', name: '远景', prompt: 'extreme wide shot, establishing shot, full environment visible, vast landscape, tiny subject in distance, atmospheric perspective' },
      { id: 'ws', name: '全景', prompt: 'wide shot, full body in frame, environmental context, character fully visible within surroundings' },
      { id: 'ms', name: '中景', prompt: 'medium shot, waist up, character interaction and gestures, natural framing' },
      { id: 'mcu', name: '近景', prompt: 'medium close-up, chest up, facial expressions and emotions' },
      { id: 'cu', name: '特写', prompt: 'close-up shot, face only, intimate emotional detail, shallow depth of field, blurred background' },
      { id: 'ecu', name: '大特写', prompt: 'extreme close-up, macro detail, specific feature emphasis' },
    ],
  },
  {
    id: 'angle', label: '机位',
    tags: [
      { id: 'eye', name: '平视', prompt: 'eye-level shot, neutral perspective' },
      { id: 'high', name: '俯拍', prompt: 'high angle shot, looking down from above, bird eye perspective, subject appears small and vulnerable' },
      { id: 'low', name: '仰拍', prompt: 'low angle shot, looking up from below, heroic powerful perspective, imposing figure' },
      { id: 'dutch', name: '斜角', prompt: 'dutch angle tilted shot, canted frame, dramatic tension and unease, diagonal composition' },
      { id: 'ots', name: '过肩', prompt: 'over the shoulder shot, OTS framing, conversational two-shot composition, depth and spatial relationship' },
      { id: 'pov', name: '主观', prompt: 'point of view shot, first person perspective, immersive angle, viewer as participant' },
    ],
  },
  {
    id: 'composition', label: '构图',
    tags: [
      { id: 'center', name: '居中', prompt: 'center framed composition, symmetrical balance, subject at focal point, formal and stable arrangement' },
      { id: 'rule3', name: '三分法', prompt: 'rule of thirds composition, off-center subject placement, dynamic balance, natural visual flow' },
      { id: 'lead', name: '引导线', prompt: 'leading lines composition, depth and perspective convergence, directional visual flow' },
      { id: 'frame', name: '框架', prompt: 'framed composition, natural frame within scene, doorway or window, layered depth' },
      { id: 'symmetry', name: '对称', prompt: 'symmetrical composition, mirror balance, formal arrangement, visual harmony' },
      { id: 'negative', name: '留白', prompt: 'negative space composition, minimalist, subject isolated in vast space, clean and simple' },
    ],
  },
  {
    id: 'movement', label: '运镜',
    tags: [
      { id: 'static', name: '固定', prompt: 'static shot, locked camera, stable frame' },
      { id: 'pan', name: '横摇', prompt: 'pan shot, horizontal camera rotation, scanning movement' },
      { id: 'tilt', name: '竖摇', prompt: 'tilt shot, vertical camera rotation, revealing height' },
      { id: 'dolly', name: '推拉', prompt: 'dolly shot, smooth forward or backward camera movement' },
      { id: 'tracking', name: '跟拍', prompt: 'tracking shot, camera follows subject movement alongside, smooth lateral motion' },
      { id: 'crane', name: '升降', prompt: 'crane shot, sweeping vertical camera movement, dramatic rise or descent, grand reveal, cinematic scale' },
    ],
  },
  {
    id: 'lighting', label: '光影',
    tags: [
      { id: 'natural', name: '自然光', prompt: 'natural lighting, soft ambient illumination' },
      { id: 'backlight', name: '逆光', prompt: 'backlighting, silhouette rim light, dramatic glow outline, lens flare, ethereal atmosphere' },
      { id: 'side', name: '侧光', prompt: 'side lighting, dramatic shadows, chiaroscuro effect' },
      { id: 'golden', name: '黄金时刻', prompt: 'golden hour lighting, warm sunset tones, long shadows, soft warm glow, romantic atmosphere' },
      { id: 'neon', name: '霓虹', prompt: 'neon lighting, colorful urban glow, cyberpunk atmosphere, reflective wet surfaces, vibrant color palette' },
      { id: 'lowkey', name: '低调', prompt: 'low-key lighting, dark moody atmosphere, deep shadows, film noir style, high contrast, dramatic' },
    ],
  },
]

const HORIZONTAL_OPTIONS = [
  { value: 'front', label: '正面', prompt: 'front view' },
  { value: 'front-right', label: '右前', prompt: 'front-right quarter view' },
  { value: 'right', label: '右侧', prompt: 'right side view' },
  { value: 'back-right', label: '右后', prompt: 'back-right quarter view' },
  { value: 'back', label: '背面', prompt: 'back view' },
  { value: 'back-left', label: '左后', prompt: 'back-left quarter view' },
  { value: 'left', label: '左侧', prompt: 'left side view' },
  { value: 'front-left', label: '左前', prompt: 'front-left quarter view' },
]

const VERTICAL_OPTIONS = [
  { value: 'low', label: '仰拍', prompt: 'low-angle shot' },
  { value: 'eye', label: '平视', prompt: 'eye-level shot' },
  { value: 'elevated', label: '高角度', prompt: 'elevated shot' },
  { value: 'high', label: '俯拍', prompt: 'high-angle shot' },
]

const DISTANCE_OPTIONS = [
  { value: 'wide', label: '远景', prompt: 'wide shot' },
  { value: 'medium', label: '中景', prompt: 'medium shot' },
  { value: 'close', label: '特写', prompt: 'close-up' },
]

const PANEL_ITEMS: PanelItem[] = [
  {
    id: 'multiangle', name: '多角度视角', icon: <Camera className="h-3.5 w-3.5" />,
    description: '选择方位角、仰角和距离组合',
    defaultValue: { horizontal: 'front', vertical: 'eye', distance: 'medium' },
    render: ({ value, onChange }) => (
      <div className="space-y-2">
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground font-medium">方位角</label>
          <div className="grid grid-cols-4 gap-1.5">
            {HORIZONTAL_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => onChange({ ...value, horizontal: opt.value })}
                className={cn("px-1.5 py-1 rounded text-xs transition-colors", value.horizontal === opt.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground font-medium">仰角</label>
          <div className="flex gap-1.5">
            {VERTICAL_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => onChange({ ...value, vertical: opt.value })}
                className={cn("flex-1 px-1.5 py-1 rounded text-xs transition-colors", value.vertical === opt.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground font-medium">距离</label>
          <div className="flex gap-1.5">
            {DISTANCE_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => onChange({ ...value, distance: opt.value })}
                className={cn("flex-1 px-1.5 py-1 rounded text-xs transition-colors", value.distance === opt.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    ),
    buildPrompt: (value) => {
      const h = HORIZONTAL_OPTIONS.find(o => o.value === value.horizontal)?.prompt ?? 'front view'
      const v = VERTICAL_OPTIONS.find(o => o.value === value.vertical)?.prompt ?? 'eye-level shot'
      const d = DISTANCE_OPTIONS.find(o => o.value === value.distance)?.prompt ?? 'medium shot'
      return `${h}, ${v}, ${d}`
    },
  },
  {
    id: 'turnaround', name: '角色四视图', icon: <Users className="h-3.5 w-3.5" />,
    description: '生成角色正面/侧面/背面/3/4视角参考表',
    defaultValue: { style: 'standard' },
    render: ({ value, onChange }) => (
      <div className="flex gap-1.5">
        {[{ value: 'standard', label: '标准四视图' }, { value: 'extended', label: '扩展五视图' }, { value: 'expression', label: '表情参考表' }].map(opt => (
          <button key={opt.value} onClick={() => onChange({ ...value, style: opt.value })}
            className={cn("flex-1 px-2 py-1.5 rounded text-xs transition-colors", value.style === opt.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>
            {opt.label}
          </button>
        ))}
      </div>
    ),
    buildPrompt: (value) => {
      if (value.style === 'extended') return 'character turnaround reference sheet, front view, 3/4 front view, side profile view, back view, 3/4 back view, same character, consistent design, full body standing pose, white background, studio lighting, clean reference sheet, character design sheet'
      if (value.style === 'expression') return 'character expression reference sheet, multiple facial expressions, happy, sad, angry, surprised, neutral, same character, consistent design, head and shoulders, white background, studio lighting, emotion chart'
      return 'character turnaround reference sheet, front view, side profile view, back view, 3/4 view, same character, consistent design, full body standing pose, white background, studio lighting, clean reference sheet, character design sheet, orthographic views, three-point turnaround'
    },
  },
  {
    id: 'grid9', name: '九宫格多机位', icon: <Grid3X3 className="h-3.5 w-3.5" />,
    description: '9种不同机位角度参考表',
    defaultValue: { type: 'full' },
    render: ({ value, onChange }) => (
      <div className="flex gap-1.5">
        {[{ value: 'full', label: '完整9机位' }, { value: 'basic', label: '基础6机位' }].map(opt => (
          <button key={opt.value} onClick={() => onChange({ ...value, type: opt.value })}
            className={cn("flex-1 px-2 py-1.5 rounded text-xs transition-colors", value.type === opt.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>
            {opt.label}
          </button>
        ))}
      </div>
    ),
    buildPrompt: (value) => {
      if (value.type === 'basic') return 'multi-angle reference sheet, 6 camera angles, same subject, wide shot, medium shot, close-up, high angle, low angle, over-shoulder, consistent design, professional cinematography'
      return 'multi-angle reference sheet, 9 different camera angles, same subject from various perspectives, consistent design, professional cinematography angles including wide, medium, close-up, high angle, low angle, over-shoulder, dutch angle, eye-level, POV'
    },
  },
  {
    id: 'grid25', name: '25宫格分镜', icon: <Grid3X3 className="h-3.5 w-3.5" />,
    description: '5x5连贯分镜镜头表',
    defaultValue: { flow: 'narrative' },
    render: ({ value, onChange }) => (
      <div className="flex gap-1.5">
        {[{ value: 'narrative', label: '叙事推进' }, { value: 'action', label: '动作连贯' }, { value: 'mood', label: '情绪递进' }].map(opt => (
          <button key={opt.value} onClick={() => onChange({ ...value, flow: opt.value })}
            className={cn("flex-1 px-2 py-1.5 rounded text-xs transition-colors", value.flow === opt.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>
            {opt.label}
          </button>
        ))}
      </div>
    ),
    buildPrompt: (value) => {
      if (value.flow === 'action') return 'storyboard layout, 5x5 grid composition, action sequence panels, dynamic movement progression, consistent character design, varied shot types, motion blur emphasis, impact frames, cinematic action choreography'
      if (value.flow === 'mood') return 'storyboard layout, 5x5 grid composition, emotional progression panels, mood transition from calm to intense, consistent character design, atmospheric lighting changes, color temperature shift, cinematic emotional storytelling'
      return 'storyboard layout, 5x5 grid composition, sequential narrative panels, consistent character design across frames, cinematic progression, varied shot types from wide to close-up'
    },
  },
]

const ALL_SIMPLE_TAGS = new Map(TAG_CATEGORIES.flatMap(c => c.tags.map(t => [t.id, t])))
const PANEL_MAP = new Map(PANEL_ITEMS.map(p => [p.id, p]))

function generateId(): string {
  return `tpl-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`
}

interface QuickPromptPanelProps {
  onInsertPrompt: (prompt: string) => void
}

export function QuickPromptPanel({ onInsertPrompt }: QuickPromptPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [activePanelId, setActivePanelId] = useState<string | null>(null)
  const [panelValue, setPanelValue] = useState<Record<string, string>>({})
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [panelValues, setPanelValues] = useState<Record<string, Record<string, string>>>({})
  const STORAGE_KEY = 'quick-prompt-custom-templates'
  const [customTemplates, setCustomTemplates] = useState<PromptTemplate[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customTemplates))
  }, [customTemplates])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPrompt, setEditPrompt] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [copied, setCopied] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPrompt, setNewPrompt] = useState('')

  const customCategory: TagCategory = useMemo(() => ({
    id: 'custom', label: '自定义',
    tags: customTemplates.map(t => ({ id: t.id, name: t.name, prompt: t.prompt })),
  }), [customTemplates])

  const allCategories = [...TAG_CATEGORIES, customCategory]

  const buildPrompt = useCallback((tagIds: string[], pValues: Record<string, Record<string, string>>): string => {
    const parts: string[] = []
    const seenCategories = new Set<string>()
    for (const tagId of tagIds) {
      const panel = PANEL_MAP.get(tagId)
      if (panel) {
        const pv = pValues[tagId] || panel.defaultValue
        parts.push(panel.buildPrompt(pv))
        continue
      }
      const tag = ALL_SIMPLE_TAGS.get(tagId) || customTemplates.find(t => t.id === tagId)
      if (!tag) continue
      const cat = TAG_CATEGORIES.find(c => c.tags.some(t => t.id === tagId))
      if (cat && seenCategories.has(cat.id)) continue
      if (cat) seenCategories.add(cat.id)
      parts.push(tag.prompt)
    }
    return parts.join(', ')
  }, [customTemplates])

  const toggleTag = useCallback((tagId: string) => {
    const tag = ALL_SIMPLE_TAGS.get(tagId) || customTemplates.find(t => t.id === tagId)
    if (!tag) return
    const cat = TAG_CATEGORIES.find(c => c.tags.some(t => t.id === tagId))
    let newTags: string[]
    if (selectedTagIds.includes(tagId)) {
      newTags = selectedTagIds.filter(t => t !== tagId)
    } else {
      const sameCatTagIds = cat ? cat.tags.map(t => t.id) : [tagId]
      newTags = [...selectedTagIds.filter(t => !sameCatTagIds.includes(t)), tagId]
    }
    setSelectedTagIds(newTags)
    const prompt = buildPrompt(newTags, panelValues)
    onInsertPrompt(prompt)
  }, [selectedTagIds, customTemplates, panelValues, buildPrompt, onInsertPrompt])

  const openPanel = useCallback((panelId: string) => {
    const panel = PANEL_MAP.get(panelId)
    if (!panel) return
    setActivePanelId(panelId)
    setPanelValue(panelValues[panelId] || panel.defaultValue)
  }, [panelValues])

  const confirmPanel = useCallback(() => {
    if (!activePanelId) return
    const panel = PANEL_MAP.get(activePanelId)
    if (!panel) return
    const newPanelValues = { ...panelValues, [activePanelId]: panelValue }
    let newTags = selectedTagIds
    if (!newTags.includes(activePanelId)) newTags = [...newTags, activePanelId]
    setSelectedTagIds(newTags)
    setPanelValues(newPanelValues)
    const prompt = buildPrompt(newTags, newPanelValues)
    onInsertPrompt(prompt)
    setActivePanelId(null)
  }, [activePanelId, panelValue, selectedTagIds, panelValues, buildPrompt, onInsertPrompt])

  const removePanel = useCallback((panelId: string) => {
    const newTags = selectedTagIds.filter(t => t !== panelId)
    const newPanelValues = { ...panelValues }
    delete newPanelValues[panelId]
    setSelectedTagIds(newTags)
    setPanelValues(newPanelValues)
    const prompt = buildPrompt(newTags, newPanelValues)
    onInsertPrompt(prompt)
  }, [selectedTagIds, panelValues, buildPrompt, onInsertPrompt])

  const handleReset = useCallback(() => {
    setSelectedTagIds([])
    setPanelValues({})
    onInsertPrompt('')
  }, [onInsertPrompt])

  const deleteTemplate = useCallback(async (templateId: string) => {
    const confirmed = await confirm('确定要删除该模板吗？', {
      title: '删除确认', kind: 'warning', okLabel: '确定', cancelLabel: '取消',
    })
    if (!confirmed) return
    setCustomTemplates(prev => prev.filter(t => t.id !== templateId))
    const newTags = selectedTagIds.filter(t => t !== templateId)
    setSelectedTagIds(newTags)
    const prompt = buildPrompt(newTags, panelValues)
    onInsertPrompt(prompt)
  }, [selectedTagIds, panelValues, buildPrompt, onInsertPrompt])

  const addTemplate = useCallback(() => {
    if (!newName.trim() || !newPrompt.trim()) return
    setCustomTemplates(prev => [...prev, { id: generateId(), name: newName.trim(), prompt: newPrompt.trim() }])
    setNewName(''); setNewPrompt(''); setShowAddForm(false)
  }, [newName, newPrompt])

  const saveEdit = useCallback(() => {
    if (!editingId) return
    setCustomTemplates(prev => prev.map(t => t.id === editingId ? { ...t, name: editName.trim(), prompt: editPrompt.trim() } : t))
    setEditingId(null)
  }, [editingId, editName, editPrompt])

  const currentPrompt = buildPrompt(selectedTagIds, panelValues)

  if (!isExpanded) {
    return (
      <div className="flex flex-col rounded-lg border bg-background/95 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between px-2 py-1.5">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsExpanded(true)}>
            <Bookmark className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col rounded-lg border bg-background/95 shadow-sm backdrop-blur w-96">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Bookmark className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">提示词</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleReset} title="重置">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsExpanded(false)} title="收起">
            <span className="text-sm">◀</span>
          </Button>
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-380px)]">
        <div className="p-3 space-y-2 relative">
          {activePanelId && PANEL_MAP.get(activePanelId) ? (
            <div className="absolute inset-0 z-10 bg-background p-2 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  {PANEL_MAP.get(activePanelId)!.icon}
                  <span>{PANEL_MAP.get(activePanelId)!.name}</span>
                </div>
                <button onClick={() => setActivePanelId(null)} className="p-0.5 hover:bg-muted rounded">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground mb-2">{PANEL_MAP.get(activePanelId)!.description}</p>
              {PANEL_MAP.get(activePanelId)!.render({ value: panelValue, onChange: setPanelValue })}
              <div className="mt-2 p-1.5 bg-muted/30 rounded border">
                <p className="text-xs text-foreground font-mono break-all leading-relaxed">
                  {PANEL_MAP.get(activePanelId)!.buildPrompt(panelValue)}
                </p>
              </div>
              <div className="flex gap-1.5 mt-2">
                <button onClick={() => { setActivePanelId(null); removePanel(activePanelId) }}
                  className="flex-1 px-2 py-1.5 rounded text-xs bg-muted hover:bg-muted/80">取消</button>
                <button onClick={confirmPanel}
                  className="flex-1 px-2 py-1.5 rounded text-xs bg-primary text-primary-foreground hover:bg-primary/90">确认</button>
              </div>
            </div>
          ) : null}

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-medium px-1">专业模板</label>
            <div className="flex flex-wrap gap-1.5">
              {PANEL_ITEMS.map(panel => (
                <button key={panel.id} onClick={() => openPanel(panel.id)}
                  className={cn("flex items-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors",
                    selectedTagIds.includes(panel.id) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>
                  {panel.icon}
                  <span>{panel.name}</span>
                  <Settings2 className="h-3.5 w-3.5 opacity-60" />
                </button>
              ))}
            </div>
          </div>

          <div className="border-t my-0.5" />

          {allCategories.map((category) => {
            const isCatExpanded = expandedCategory === category.id
            const selectedLabel = category.tags.find(t => selectedTagIds.includes(t.id))?.name
            return (
              <div key={category.id}>
                <div className="flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setExpandedCategory(isCatExpanded ? null : category.id)}>
                  <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform", isCatExpanded && "rotate-90")} />
                  <span className="text-xs font-medium text-foreground flex-1">{category.label}</span>
                  {selectedLabel && (
                    <span className="text-xs px-1.5 py-1 rounded bg-primary/10 text-primary font-medium">{selectedLabel}</span>
                  )}
                </div>
                {isCatExpanded && (
                  <div className="pl-6 pr-2 pb-2 space-y-1">
                    {category.id === 'custom' && (
                      <>
                        {editingId && (
                          <div className="p-2 rounded border border-primary/30 bg-primary/5 space-y-1">
                            <input value={editName} onChange={e => setEditName(e.target.value)}
                              className="w-full h-5 text-xs px-1 rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring" placeholder="名称" />
                            <textarea value={editPrompt} onChange={e => setEditPrompt(e.target.value)}
                              className="w-full h-10 text-xs p-1 rounded border border-input bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring font-mono" placeholder="提示词" />
                            <div className="flex gap-1.5 justify-end">
                              <button onClick={() => setEditingId(null)} className="p-0.5 hover:bg-muted rounded"><X className="h-3.5 w-3.5" /></button>
                              <button onClick={saveEdit} className="p-0.5 hover:bg-muted rounded text-primary"><CheckCheck className="h-3.5 w-3.5" /></button>
                            </div>
                          </div>
                        )}
                        {showAddForm ? (
                          <div className="p-2 rounded border border-dashed border-primary/30 bg-primary/5 space-y-1">
                            <input value={newName} onChange={e => setNewName(e.target.value)} autoFocus
                              className="w-full h-5 text-xs px-1 rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring" placeholder="名称" />
                            <textarea value={newPrompt} onChange={e => setNewPrompt(e.target.value)}
                              className="w-full h-10 text-xs p-1 rounded border border-input bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring font-mono" placeholder="提示词" />
                            <div className="flex gap-1.5 justify-end">
                              <button onClick={() => { setShowAddForm(false); setNewName(''); setNewPrompt('') }} className="p-0.5 hover:bg-muted rounded"><X className="h-3.5 w-3.5" /></button>
                              <button onClick={addTemplate} disabled={!newName.trim() || !newPrompt.trim()} className="p-0.5 hover:bg-muted rounded text-primary"><CheckCheck className="h-3.5 w-3.5" /></button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setShowAddForm(true)}
                            className="flex items-center gap-1.5 w-full px-1.5 py-1 rounded text-xs text-muted-foreground hover:bg-muted/60">
                            <Plus className="h-3.5 w-3.5" /> 添加
                          </button>
                        )}
                      </>
                    )}
                    {category.id === 'custom' ? (
                      <div className="space-y-1">
                        {category.tags.map(tag => (
                          <div key={tag.id}
                            className={cn(
                              "flex items-center gap-2 px-2 py-1.5 rounded transition-colors cursor-pointer",
                              selectedTagIds.includes(tag.id) ? 'bg-primary/10 border border-primary/30' : 'bg-muted/50 hover:bg-muted'
                            )}
                            onClick={() => toggleTag(tag.id)}
                          >
                            <div className={cn(
                              "w-1.5 h-1.5 rounded-full shrink-0",
                              selectedTagIds.includes(tag.id) ? 'bg-primary' : 'bg-muted-foreground/40'
                            )} />
                            <span className={cn(
                              "text-xs flex-1 truncate",
                              selectedTagIds.includes(tag.id) ? 'text-primary font-medium' : 'text-foreground'
                            )}>{tag.name}</span>
                            {!editingId && (
                              <div className="flex gap-1 shrink-0">
                                <button onClick={e => { e.stopPropagation(); setEditingId(tag.id); setEditName(tag.name); setEditPrompt(tag.prompt) }}
                                  className="p-1 rounded hover:bg-muted transition-colors" title="编辑">
                                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                </button>
                                <button onClick={e => { e.stopPropagation(); deleteTemplate(tag.id) }}
                                  className="p-1 rounded hover:bg-destructive/10 transition-colors" title="删除">
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {category.tags.map(tag => (
                        <div key={tag.id} className="group relative">
                          <button onClick={() => toggleTag(tag.id)}
                            className={cn("px-1.5 py-0.5 rounded text-xs transition-colors",
                              selectedTagIds.includes(tag.id) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}
                            title={tag.prompt}>
                            {tag.name}
                          </button>
                        </div>
                      ))}
                    </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </ScrollArea>

      {currentPrompt && (
        <div className="border-t px-3 py-2">
          <div className="p-2 bg-muted/30 rounded border">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">输出</span>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(currentPrompt)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                }}
                className="p-1 hover:bg-muted rounded transition-colors"
                title="复制提示词"
              >
                {copied
                  ? <Check className="h-3.5 w-3.5 text-green-500" />
                  : <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                }
              </button>
            </div>
            <p className="text-xs text-foreground font-mono break-all leading-relaxed">
              {currentPrompt}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

