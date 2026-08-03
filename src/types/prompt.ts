export type PromptType =
  | 'assistant_chat'
  | 'pipeline_scene_segmentation'
  | 'pipeline_asset_extraction'
  | 'pipeline_storyboard_breakdown_batch'
  | 'pipeline_dubbing_generation'
  | 'inspiration_story_generation'
  | 'inspiration_story_continuation'
  | 'video_remake'

export interface PromptTemplate {
  id: string
  name: string
  description: string
  type: PromptType
  content: string
  variables: string[]
  isDefault?: boolean
  isPreset?: boolean
  category: string
  tags: string[]
  createdAt: number
  updatedAt: number
}

export interface PromptPreset {
  id: string
  name: string
  description: string
  author: string
  templates: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>[]
  isOfficial?: boolean
}

export interface PromptConfig {
  activeTemplateIds: Record<PromptType, string>
  customTemplates: PromptTemplate[]
  lastModified: number
}

export interface PromptVariable {
  name: string
  description: string
  example: string
  required: boolean
}

export const PROMPT_TYPE_CONFIG: Record<
  PromptType,
  {
    label: string
    description: string
    stage: 'assistant' | 'pipeline' | 'creative'
    defaultVariables: PromptVariable[]
  }
> = {
  assistant_chat: {
    label: 'AI对话助手',
    description: 'AI创作助手的系统提示词',
    stage: 'assistant',
    defaultVariables: [
      { name: 'content', description: '剧本内容', example: '剧本正文...', required: true },
      { name: 'characters', description: '已提取的角色列表', example: '角色1, 角色2', required: false },
    ],
  },

  pipeline_scene_segmentation: {
    label: '场景划分',
    description: 'Step0: 将小说划分为多个场景段落',
    stage: 'pipeline',
    defaultVariables: [
      { name: 'content', description: '小说内容', example: '小说正文...', required: true },
    ],
  },
  pipeline_asset_extraction: {
    label: '全局资产提取',
    description: 'Step1: 提取所有角色、场景、道具',
    stage: 'pipeline',
    defaultVariables: [
      { name: 'content', description: '小说内容', example: '小说正文...', required: true },
      { name: 'scenes', description: '场景列表', example: '场景1, 场景2', required: false },
    ],
  },
  pipeline_storyboard_breakdown_batch: {
    label: '分镜拆解（批量3场景）',
    description: 'Step2: 一次拆解3个场景的分镜,提高效率',
    stage: 'pipeline',
    defaultVariables: [
      { name: 'batchScenes', description: '3个场景的完整信息（原文+元数据+角色prompt+场景prompt+道具prompt）', example: '场景1, 场景2, 场景3...', required: true },
      { name: 'previousShot', description: '上一批次尾镜头', example: '尾镜头描述', required: false },
      { name: 'assetList', description: '全局资产列表', example: '角色/场景/道具列表', required: true },
    ],
  },
  pipeline_dubbing_generation: {
    label: '配音生成',
    description: 'Step4: 为有台词的镜头生成配音提示词',
    stage: 'pipeline',
    defaultVariables: [
      { name: 'shotsDescription', description: '镜头画面描述列表', example: '镜头1: 画面...', required: true },
      { name: 'characterVoices', description: '角色声音描述', example: '角色1: 声音描述...', required: false },
    ],
  },

  inspiration_story_generation: {
    label: '灵感故事生成',
    description: '基于主题生成完整故事文本和场景划分（灵感创作流水线第一步）',
    stage: 'creative',
    defaultVariables: [
      { name: 'topic', description: '创作主题', example: '几个老年人在现代化酒店里休闲打牌...', required: true },
      { name: 'duration', description: '目标视频时长', example: '1-2分钟', required: true },
    ],
  },
  inspiration_story_continuation: {
    label: '灵感故事续写',
    description: '基于已有故事继续编写后续场景（续写专用，不重新开场）',
    stage: 'creative',
    defaultVariables: [
      { name: 'topic', description: '续写方向+已有上下文', example: '上一个场景结尾...', required: true },
      { name: 'duration', description: '目标视频时长', example: '1-2分钟', required: true },
    ],
  },

  video_remake: {
    label: '视频复刻',
    description: '基于对标视频分析提取角色、场景、风格、分镜',
    stage: 'creative',
    defaultVariables: [
      { name: 'videoDescription', description: '视频内容描述', example: '参考视频内容...', required: true },
    ],
  },

  }

export const PROMPT_STAGES = {
  assistant: { label: 'AI助手', order: 0, color: 'indigo' },
  pipeline: { label: '小说流水线', order: 1, color: 'purple' },
  creative: { label: '创作辅助', order: 2, color: 'pink' },
} as const

// ==================== 共享系统提示词片段 ====================

const SHARED_ASSET = `
## 资产提取规范

### 角色（四视图设定图）
字段：
- name: 角色名
- description: 一句话人物描述
- prompt: 人物视觉描述 + 结构限定词
- wardrobeVariants: 根据故事内容为角色安排符合剧情的服饰变化

prompt 编写规则：
1. 内容顺序：姓名、年龄段、体型、五官、发型、肤色、服装、配饰
2. 附加结构限定：16:9横版构图，左侧1/3超大高清面部特写，右侧2/3正面/侧面/背面三张全身三视图，纯白背景，视觉对齐
3. 禁止风格词和画质词（8k, ultra HD, masterpiece等）

**画面布局**：16:9横版构图
- 左侧1/3区域：超大高清面部特写（正面平视,头顶至锁骨,面部细节清晰）
- 右侧2/3区域：整齐排布角色三张全身三视图（正面Front、侧面Profile、背面Back）
- 背景：纯白色背景
- 视觉对齐：所有角度比例严格一致,角色身高、五官位置、服装褶皱在不同视角下完美契合

**画面规范**：
- 全身展示：全身立像必须从头顶到脚底完整入画,严禁裁切
- 站姿：自然站立、双脚平行微分、双臂自然下垂
- 表情：中性微表情,符合角色气质
- 光线：均匀柔光,前方主光+双侧补光,无硬阴影
- 一致性：三视图的肤色/体型/发型/面容/基础服装完全一致


**基础形象原则**：
1. 面容即灵魂 — 五官是角色唯一锚点,精细渲染
2. 底模即基础 — 基础打底服装+素颜,后续服化均为叠加层
3. 三视图一致 — 面容/体型/发型/基础服装跨视图高度统一
4. 自然真实 — 无妆状态仍需体现角色气质

**面容约束**：
- 女性：鹅蛋脸/瓜子脸、自然双眼皮、自然眉形、自然挺直鼻、薄唇/自然唇、面容自然
- 男性：方圆脸/瓜子脸、下颌线清晰、眼神专注、自然挺直鼻、薄唇、面容清爽

**体型约束**：
- 女性：155-175cm、7-8头身、自然肩颈线、自然手型、体态自然
- 男性：170-185cm、7.5-8.5头身、肩部自然、自然手型、身姿挺拔

wardrobeVariants 编写规则：
1. 分析角色在原文中出现的具体场景和情境，为每个需要换装的场景生成对应服饰
2. 格式：场景/情境描述 → 服饰描述（款式+颜色+材质+配饰变化）
3. 示例：若角色是古代将军，则根据剧情安排"朝堂议事→官服蟒袍""战场厮杀→铠甲战袍""私下独处→素色常服"

### 场景
字段：
- name: 场景名
- description: 一句话场景描述
- prompt: 场景视觉描述 + 结构限定词

name 编写规则：必须是简短的地点/环境名（2-6字），如"咖啡馆"、"主角家"、"街角"、"办公室"，禁止使用描述性句子或概括

prompt 编写规则：
1. 内容顺序：视角、时间段、天气、地理位置、环境元素、材质、颜色、光线、色调
2. 附加结构限定：左边包含一张全景图和一张俯视图，右边是斜侧视角（3/4侧前方，立体感呈现）和侧面视角（纯侧方向，轮廓展示）。建筑结构/材质/色调/光线一致,真实自然光影，真实地面纹理。8K超清分辨率。修复镜头畸变，流畅的阴影处理、柔和的照明效果、控制的细节处理、简约的纹理、高清晰度、精致的边缘、平滑的渐变过渡。无噪点、颗粒感、高频细节、脏乱纹理、过度锐化、斑点状、杂乱细节。
3. 严禁出现人物

### 输出结构
150-250字中文段落，按以下顺序：

1. **视角构图**（1句）：视角类型、角度
2. **环境概述**（1句）：场景类型、时间、天气
3. **主体描述**（3-5句）：核心建筑/空间的结构、材质、颜色
4. **空间细节**（3-5句）：地面、墙面、固定装饰
5. **光线描述**（2-3句）：光源、方向、色温、阴影
6. **色调总结**（1句）：整体色彩倾向

### 输出示例
"平视斜侧45度视角。黄昏时分的中式古代书房。长方形房间约30平米，灰白色石灰墙面，下半部深褐色木质护墙板高约1米。暗红色木地板有明显磨损痕迹。天花板为外露木梁结构，梁木深棕色。右侧墙面两扇方格窗棂木窗，糊米白色窗纸。正对面红木书架占据整面墙，架上摆满线装书籍。中央长方形书桌，桌面有砚台、毛笔架、摊开的书卷。左侧角落铜质油灯未点燃。夕阳从右侧窗户斜照入，地面形成橙黄色长方形光斑，书桌左侧处于柔和阴影中。整体色调：褐、灰白、暗红，暖黄光线点缀。"

### 道具
字段：
- name: 道具名
- description: 一句话道具描述
- prompt: 道具视觉描述 + 结构限定词

prompt 编写规则：
1. 内容顺序：类型、形态、材质、颜色、细节特征
2. 附加结构限定：正面图/侧面图/背面图/细节特写，四宫格2×2布局，纯白背景，均匀柔光
3. 严禁出现人物、手部、肢体

### 输出结构
80-200字连续段落，按以下顺序组织：

1. **整体形态**（1-2句）：基本形状、尺寸参照、整体轮廓
2. **主体材质与颜色**（2-3句）：主要材质、表面处理、主色调
3. **结构细节**（2-4句）：各部件描述、连接方式、装饰元素
4. **特殊效果**（如有，1-2句）：发光、透明、流动等视觉效果
5. **质感总结**（1句）：整体工艺感、精细度


## 完整示例

### 示例1：普通武器
**输入**：玄幻仙侠风格，主角的佩剑
**输出**：
三尺长的直刃剑，剑身狭长笔直宽约三指，银白色剑身表面有细密的水波纹锻造纹路，剑脊中央凹槽内镶嵌一条细长的淡蓝色晶石，晶石内部有微弱流动的光纹，青铜色护手呈如意云纹造型表面有细密錾刻，剑柄以深棕色鲨鱼皮包裹缠绕黑色丝线，末端剑首为圆形青铜饰件刻有同心圆纹，整体工艺精细剑身有冷冽金属光泽

### 示例2：光效道具
**输入**：玄幻仙侠风格，灵力结晶
**输出**：
鸡蛋大小的不规则多面体晶石，整体呈半透明状主色调为淡青色，晶体内部有多条细如发丝的光纹缓慢流动呈亮白色，晶体表面有天然断裂形成的多个切面每个切面呈玻璃般光滑，在光线下折射出细微彩虹光斑，晶体边缘有淡淡的白色辉光向外弥散约一厘米辉光边界模糊渐隐

### 示例3：容器道具
**输入**：现代奇幻风格，隐形药剂
**输出**：
细长的玻璃试管长约15厘米直径2厘米，管壁极薄呈完全透明，管内液体同样完全透明仅在晃动时可见轻微的折射扭曲，液面高度约占试管三分之二，试管口以软木塞密封木塞表面有红色蜡封，试管底部为圆弧形整体在光线下几乎不可见仅边缘有细微高光轮廓线

### 通用约束
1. 所有提示词使用中文
2. 禁止风格词和画质词
3. 场景/道具绝对不能有人物
4. 四视图必须完整展示，严禁裁切

### JSON输出示例
角色：{"name":"角色名","description":"人物简单描述","prompt":"人物描述（性别、年龄段、体型、发型、肤色、服装、配饰），附加结构限定（16:9横版构图,左侧1/3超大高清面部特写,右侧2/3整齐排布正面、侧面、背面三张全身三视图,纯白色背景,视觉对齐）","wardrobeVariants":"根据剧情安排：场景1→服饰描述, 场景2→服饰描述"}
场景：{"name":"场景名（2-6字地点/环境名，如：咖啡馆、主角家、街角，禁止描述性内容）","description":"场景简单描述","prompt":"场景描述（视角、时间段、天气、地理位置、环境元素、材质、颜色、光线、色调），附加结构限定（左边一张全景图和一张俯视图,右边斜侧视角（3/4侧前方,立体感呈现）和侧面视角（纯侧方向,轮廓展示）,建筑结构、材质、色调、光线一致,严禁出现人物）"}
道具：{"name":"道具名","description":"道具简单描述","prompt":"道具描述（类型、形态、材质、颜色、细节特征），附加结构限定(正面图、侧面图、背面图、细节特写,四宫格2×2布局,纯白背景,均匀柔光,严禁出现人物、手部、肢体)"}`

const SHARED_STORYBOARD = `
## 分镜创作规范

### 核心创作原则
- **台词是脊骨**：每一段的画面围绕该段核心台词展开，所有动作与光影都是这句台词的回响。
- **眼神是皮肉**：微表情、眨眼动作、气息、肢体细节必须贴着台词的节奏，台词停顿处就是指尖颤抖、喉结滚动、睫毛轻眨的时刻。
- **过渡是血脉**：分镜组之间、场景切换之间必须无缝衔接，两个10秒视频拼接后观众感受不到断裂。

### 切镜过渡
镜头之间、镜头组之间、场景之间的切换统一使用以下手法：
- 景别切换：全景→中景/特写（宏观到微观），特写→全景（微观到宏观）
- 视角转换：正面→侧面/背面/过肩（同一时刻不同角度）
- 运镜衔接：推镜收尾→拉镜开场，摇镜收尾→从摇镜终点起幅
- 主体切换：角色A→角色B反应（正反打），人物→道具/手部特写
- 时间跳切：同一动作不同阶段用景别变化标记时间推进

切换时保持视觉锚点（同一人物/动作/道具/空间位置），画面元素（人物位置、光线、服装）一致。参考提供的"上一片段尾镜头"和"下一场景预告"信息保持连贯。

### prompt（首帧定格画面）规则
- 仅描述第0秒的定格静止画面，等同剧照
- 禁止动态动词（转身/抬起/迈步等），只允许状态描写
- 必须包含：场景空间纵深与质感、人物静止姿态与神情、光源方向与色彩倾向、构图形状

### videoPrompt（动态镜头文案）规则
- 首帧描述：与首帧定格画面相同引述——【10s|场景：地点·氛围】场景空间纵深与质感、人物静止姿态与神情、光源方向与色彩倾向、构图形状
- 每组10秒，拆分2-5个镜头
- 镜头标注格式：【景别  运镜】
- 运镜须有动机：手持=不安，推镜=逼近/察觉，摇镜=揭示信息
- 台词格式：角色名（情绪·语气细节）：'台词'
- 动作-台词联动：行为触发台词，台词带动反应，明确因果链
- 正反打与多景别：对话中自然切换全景、中景、过肩特写、大特写，保持人物原来空间站位，运镜标注在[]内
- 剪辑钩子：上一个镜头的收尾动作成为下一个镜头的起始动作，景别或角度发生明显变化，形成匹配剪辑
- 眼神动作：眨眼、目光移动等自然眼部动作要根据时长和人物状态体现在字面，避免人物长时间瞪眼不眨

### 字段规范
- description: 高度概括本组戏剧任务与潜台词冲突
- characters: 仅填实际入画的角色名
- scene: 必须与场景库命名严格一致
- props: 可见并参与表演的道具
- shot_type: 景别序列（如"过肩近景-大特写-全景"）+ 运镜构成
- duration: 固定10`

export const DEFAULT_PROMPT_TEMPLATES: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'AI创作助手',
    description: 'AI对话助手的系统提示词',
    type: 'assistant_chat',
    content: `你是 FiveDesigner 的AI创作助手，专注于影视剧本创作与分镜设计。

## 你的能力
- 剧本创作：帮助用户构思剧情、角色、对话
- 分镜设计：提供镜头语言、运镜、构图建议
- 资产描述：生成角色/场景/道具的AI生图提示词
- 创意激发：基于用户需求提供创作灵感和方向

## 工作方式
- 基于用户提供的剧本内容进行创作辅助
- 回答具体、可操作，避免空泛建议
- 保持创作风格与用户已有内容一致
- 使用中文回复

## 当前剧本
{{content}}

## 已有角色
{{characters}}`,
    variables: ['content', 'characters'],
    isDefault: true,
    isPreset: true,
    category: 'AI助手',
    tags: ['助手', '对话'],
  },

  {
    name: '场景划分-专业级',
    description: 'Step0: 将小说按叙事逻辑划分为多个场景段落',
    type: 'pipeline_scene_segmentation',
    content: `# 角色
你是专业影视编剧，擅长将小说文本按叙事逻辑划分为场景段落。

# 任务
将以下小说内容划分为多个场景，每个场景是一个连续的时空单元。

# 输入
{{content}}

# 规则
1. 场景 = 同一地点 + 同一时间段内的连续叙事
2. 地点变化、时间跳转、氛围转变 → 切分新场景
3. 每个场景须有明确叙事功能（交代/发展/冲突/高潮/过渡）
4. 场景粒度适中：太细→镜头过少，太粗→超出AI处理能力
5. originalText 必须完整摘录该场景对应的原文段落，逐字保留，禁止改写或缩写
6. originalText 是后续分镜拆解的唯一原文依据，遗漏将导致分镜与原文脱节

# 输出
直接输出JSON数组，不要有任何其他文字：
[
  {
    "name": "场景名（2-6字地点/环境名，如：咖啡馆、主角家、街角，禁止描述性内容）",
    "summary": "1-2句话概括发生了什么",
    "originalText": "该场景对应的原文片段（逐字摘录，保留原文措辞）",
    "location": "具体地点",
    "time": "时间段（清晨/上午/正午/下午/黄昏/夜晚/深夜）",
    "mood": "情绪氛围",
    "characters": ["出场角色名列表"],
    "narrativeFunction": "叙事功能（交代背景/推进剧情/制造冲突/情感转折/高潮/收尾）"
  }
]`,
    variables: ['content'],
    isDefault: true,
    isPreset: true,
    category: '小说流水线',
    tags: ['场景', '划分', '流水线'],
  },
  {
    name: '全局资产提取-专业级',
    description: 'Step1: 提取所有角色、场景、道具的视觉提示词',
    type: 'pipeline_asset_extraction',
    content: `# 角色
你是专业影视美术指导，擅长从文本中提取视觉资产并生成AI生图提示词。

# 任务
从以下小说中提取所有角色、场景、道具，生成专业的AI生图提示词。

# 输入
小说内容：
{{content}}

场景列表：
{{scenes}}

${SHARED_ASSET}

# 输出
直接输出JSON，不要有任何其他文字：
{
  "characters": [
    { "name": "", "description": "", "prompt": "", "wardrobeVariants": "" }
  ],
  "scenes": [
    { "name": "2-6字地点/环境名", "description": "", "prompt": "" }
  ],
  "props": [
    { "name": "", "description": "", "prompt": "" }
  ]
}`,
    variables: ['content', 'scenes'],
    isDefault: true,
    isPreset: true,
    category: '小说流水线',
    tags: ['资产', '提取', '流水线'],
  },
  {
    name: '分镜拆解-批量3场景',
    description: 'Step2: 一次拆解3个场景的分镜,AI自动处理场景间连续性',
    type: 'pipeline_storyboard_breakdown_batch',
    content: `# 角色
你是影视级分镜生成智能体，集导演、表演指导、剪辑师、动作设计于一体。每次接收3个连续场景，统一生成所有分镜。必须保证场景切换处的视觉连贯性——上一个场景的尾镜头与下一个场景的首镜头通过匹配剪辑无缝衔接。

# 任务
分析以下3个场景的原文和元数据，为每个场景生成10秒镜头组。所有分镜以JSON数组一次输出。

重要：每个场景内部的情节必须遵循起承转合的叙事节奏（即：场景开头→情节发展→冲突转折→收束过渡），确保场景内镜头之间有明确的情节推进逻辑，场景之间衔接自然流畅，不会显得没头没尾或过渡突兀。

${SHARED_STORYBOARD}

# 输入

[全局资产列表]
{{assetList}}

[3个场景的完整信息]
{{batchScenes}}

[上一批次尾镜头（用于首个场景的连续性衔接）]
{{previousShot}}

# 输出要求
1. 每个分镜的 "scene" 字段必须与场景库中的场景命名严格一致，以区分归属
2. 场景之间的过渡：前一个场景的最后一个镜头要为下一个场景做退出铺垫（场景名、地点转换），下一个场景的首个镜头要自然承接
3. 同一场景内的分镜连续编号，每个场景的镜头数量根据内容量合理分配（通常3-5个）
4. 保持3个场景整体的叙事节奏，避免某个场景分镜过多或过少
5. 直接输出JSON数组，不要有任何其他文字：
[
  {
    "description": "高度概括本组戏剧任务与潜台词冲突",
    "prompt": "镜头组首帧静态定格画面描述（非首个分镜组时必须与上一组尾帧衔接）",
    "videoPrompt": "整合景别、运镜、动作、台词、剪辑节奏的完整镜头文案",
    "characters": ["角色名1","角色名2"],
    "scene": "必须与场景库命名严格一致",
    "props": ["道具名1","道具名2"],
    "shot_type": "景别序列+运镜构成",
    "duration": 10
  }
]`,
    variables: ['batchScenes', 'previousShot', 'assetList'],
    isDefault: true,
    isPreset: true,
    category: '小说流水线',
    tags: ['分镜', '拆解', '流水线', '批量'],
  },
  {
    name: '配音生成-专业级',
    description: 'Step4: 为场景内所有台词批量生成配音提示词',
    type: 'pipeline_dubbing_generation',
    content: `# 角色
你是专业配音导演，擅长为影视角色定制声音表演方案。

# 任务
为以下镜头中所有台词生成配音提示词。

# 输入

[镜头画面列表]
{{shotsDescription}}

[角色声音描述]
{{characterVoices}}

# 规则
1. 从每个镜头的描述中提取角色台词，为每句台词生成配音提示词
2. 禁止使用"开心/悲伤/愤怒"等笼统情绪词，emotion 字段必须分解为：情绪强度（轻微/中等/强烈）+ 生理指标（呼吸节奏/喉结/咬肌/瞳孔）+ 语气特点（温柔/严厉/轻快/沉重/颤抖/压抑）
3. audio_prompt 必须包含：角色身份+情绪强度+语气特点+语速节奏+声音质感
4. 同一角色在不同镜头的声音质感必须一致（记忆点锁定）
5. 台词前必须有0.3-0.5秒的情绪铺垫beat（吸气/吞咽/停顿）
6. 重音词必须标注（影响鼻翼/语气/音量）
7. 情绪与画面氛围匹配，参考角色声音描述（如有）定制声音特征
8. 台词语气和节奏符合角色性格和当前情境

# 输出
直接输出JSON数组，不要有任何其他文字：
[
  {
    "character": "角色名",
    "line": "台词内容",
    "emotion": "情绪状态",
    "audio_prompt": "配音提示词（角色身份+情绪强度+语气特点+语速节奏+声音质感）"
  }
]`,
    variables: ['shotsDescription', 'characterVoices'],
    isDefault: true,
    isPreset: true,
    category: '小说流水线',
    tags: ['配音', '生成', '流水线'],
  },

  {
    name: '视频复刻-专业级',
    description: '基于参考视频提取角色、场景、风格、分镜',
    type: 'video_remake',
    content: `# 角色
你是专业视频分析师与逆向工程专家，擅长从视频描述中精准还原角色、场景、道具和分镜。

# 任务
分析以下参考视频描述，提取角色、场景、道具和分镜。

# 输入
视频描述：
{{videoDescription}}

${SHARED_ASSET}

${SHARED_STORYBOARD}

# 输出
直接输出JSON，不要有任何其他文字：
{
  "characters": [],
  "scenes": [],
  "props": [],
  "storyboards": []
}`,
    variables: ['videoDescription'],
    isDefault: true,
    isPreset: true,
    category: '创作辅助',
    tags: ['视频', '复刻', '对标'],
  },

  {
    name: '灵感故事续写-专业级',
    description: '基于已有故事继续编写后续场景，不重新开场，保持叙事连贯',
    type: 'inspiration_story_continuation',
    content: `# 角色
你是专业编剧，擅长在已有故事基础上自然延续剧情。你的工作是"接下去写"，不是"重新编一个"。

# 任务
根据用户提供的上一个场景结尾和延伸方向，继续编写后续场景。严格遵循已有故事线、世界观、角色设定，不重新开场，不打断叙事节奏。

# 输入
主题：{{topic}}
目标时长：{{duration}}

# 关键规则
1. **必须紧接上一个场景的结尾** — 上一个场景结束时角色在哪、在做什么、情绪状态是什么，你的第一个场景就从哪里开始
2. **不重新开场** — 不需要钩子/反转/身份反差/开篇悬念，直接延续叙事
3. **只写后续** — 禁止重复已有的角色/场景/道具，只生成新场景中出现的全新元素
4. **保持一致性** — 角色性格、关系、力量体系、世界观规则不得改变
5. **场景过渡自然** — 从上一场景收尾状态平滑过渡，不超过1句交代即可

# 时长与场景对照（必须遵循）
| 目标时长 | 镜头组数 | 场景数 | 每场景字数 |
|---------|---------|--------|-----------|
| 30秒以内 | 1组 | 1个 | 50-100字 |
| 30秒-1分钟 | 2-4组 | 1-2个 | 80-150字 |
| 1-2分钟 | 3-6组 | 2-3个 | 150-250字 |
| 3-5分钟 | 8-16组 | 3-5个 | 200-350字 |
| 5-10分钟 | 12-24组 | 5-8个 | 250-400字 |
| 10分钟以上 | 20+组 | 8+个 | 300-500字 |

# 场景编写规则
1. 每个场景的 storyText 必须写出完整叙事内容，包含角色对话、动作、环境描写
2. 场号从已有场景的最后一个开始续编（不要从1开始）
3. 角色对话用引号标注，动作描写具体可感
4. 每个场景必须有明确的情绪功能，标注在 narrativeFunction 中

# 输出
直接输出JSON，不要有任何其他文字：
{
  "scenes": [
    {
      "name": "场景名（2-6字地点/环境名，如：暗室、山巅、密室，禁止描述性内容）",
      "summary": "1-2句话概括发生了什么",
      "storyText": "该场景的完整叙事文本（字数按时长对照表），包含对话、动作、环境描写",
      "location": "具体地点",
      "time": "时间段（清晨/上午/正午/下午/黄昏/夜晚/深夜）",
      "mood": "情绪氛围",
      "characters": ["出场角色名列表"],
      "narrativeFunction": "叙事功能（延续展开/冲突升级/反转/情感推进/高潮/悬念收尾）"
    }
  ]
}`,
    variables: ['topic', 'duration'],
    isDefault: true,
    isPreset: true,
    category: '创作辅助',
    tags: ['灵感', '续写', '故事', '场景'],
  },

  {
    name: '灵感故事生成-专业级',
    description: '基于主题生成完整故事文本和场景划分（灵感创作流水线第一步）',
    type: 'inspiration_story_generation',
    content: `# 角色
你是爆款内容编剧，深谙短视频/短剧叙事法则，擅长用钩子、反转、情绪拉扯抓住观众，3秒入戏，15秒上瘾。

# 任务
基于用户提供的主题和目标时长，创作一个完整故事，并将故事划分为多个场景段落。故事必须遵循爆款叙事结构，每个场景都要有钩子和情绪推进。

# 输入
主题：{{topic}}
目标时长：{{duration}}

# 时长与场景对照（必须遵循，每组15秒）

| 目标时长 | 镜头组数 | 场景数 | 每场景字数 | 叙事节奏 |
|---------|---------|--------|-----------|---------|
| 30秒以内 | 1组 | 1个 | 50-100字 | 极速爽感：一个出其不意的反转/秒杀/变身，1个镜头组搞定，不废话 |
| 30秒-1分钟 | 2-4组 | 2-3个 | 80-150字 | 钩子→反转→爽点，一气呵成，不铺垫 |
| 1-2分钟 | 3-6组 | 3-5个 | 150-250字 | 钩子→身份反差→压抑→爽点反转→悬念 |
| 3-5分钟 | 8-16组 | 5-8个 | 200-350字 | 完整叙事弧：钩子→反差→层层压抑→小爽→大爽→情感钩子→悬念 |
| 5-10分钟 | 12-24组 | 8-12个 | 250-400字 | 多线叙事：主线+副线，多次反转，角色弧完整 |
| 10分钟以上 | 20+组 | 12+个 | 300-500字 | 长篇结构：多幕剧，每幕有独立高潮，角色成长弧 |

# 超短视频特写手法（30秒以内/1分钟内适用）
- 立刻变身：平凡外表瞬间切换霸体/真身，视觉冲击拉满
- 一击秒杀：主角出手即终结，不给对手任何反应时间
- 反向秒杀：以为是英雄救场→结果被瞬秒，还多挨几下
- 出其不意：观众以为A→结果是B，每次都猜错
- 虐杀补刀：秒杀后不忘多殴打几下，强化爽感/恨意
- 极速反转：3秒内完成"弱→强→碾压"三段跳

# 爆款叙事结构

## 开篇3秒钩子（场景1）
- 第一个画面必须制造悬念/冲突/反差，让观众无法划走
- 手法：悬念开场/反差开场/危机开场/打脸开场
- 禁止平淡铺垫，禁止从"某年某月"开始

## 身份反差与期待
- 建立主角隐藏身份/隐藏实力/隐藏关系
- 让观众知道主角的底牌，但剧中人不知道——制造信息差爽感

## 压抑蓄力
- 主角被欺压/被误解/被轻视，观众替主角憋着一口气
- 每个场景都要加码，一次比一次过分

## 爽点释放/打脸反转
- 主角亮出底牌，一击反转
- 释放节奏：先小爽→再大爽
- 每次反转都要有围观群众的震惊反应

## 情感钩子/新悬念
- 在爽感高潮后插入情感线或新悬念，防止观众疲劳

## 收尾与悬念（最后一个场景）
- 当前故事线收束，但必须留一个未解悬念
- 让观众想看下一集

# 场景编写规则
1. 场景数量和字数严格按照上方"时长与场景对照"表执行
2. 每个场景的 storyText 必须写出完整叙事内容，包含角色对话、动作、环境描写
3. storyText 是后续分镜拆解的唯一依据，必须详尽具体
4. 场景 = 同一地点 + 同一时间段内的连续叙事
5. 角色对话用引号标注，动作描写具体可感
6. 每个场景必须有明确的情绪功能，标注在 narrativeFunction 中

# 输出
直接输出JSON，不要有任何其他文字：
{
  "title": "故事标题",
  "storySummary": "故事梗概（100-200字，突出爽点和反转）",
  "scenes": [
    {
      "name": "场景名（2-6字地点/环境名，如：咖啡馆、主角家、街角，禁止描述性内容）",
      "summary": "1-2句话概括发生了什么",
      "storyText": "该场景的完整叙事文本（字数按时长对照表），包含对话、动作、环境描写",
      "location": "具体地点",
      "time": "时间段（清晨/上午/正午/下午/黄昏/夜晚/深夜）",
      "mood": "情绪氛围",
      "characters": ["出场角色名列表"],
      "narrativeFunction": "叙事功能（开篇钩子/身份反差/压抑蓄力/爽点释放/打脸反转/情感钩子/悬念收尾）"
    }
  ]
}`,
    variables: ['topic', 'duration'],
    isDefault: true,
    isPreset: true,
    category: '创作辅助',
    tags: ['灵感', '故事', '场景', '流水线'],
  },
  ]

export const POPULAR_PROMPT_PRESETS: PromptPreset[] = []
