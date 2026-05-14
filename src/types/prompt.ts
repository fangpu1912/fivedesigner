export type PromptType =
  | 'assistant_chat'
  | 'pipeline_scene_segmentation'
  | 'pipeline_asset_extraction'
  | 'pipeline_storyboard_breakdown'
  | 'pipeline_dubbing_generation'
  | 'script_structure_analysis'
  | 'script_character_arc'
  | 'script_adaptation_strategy'
  | 'script_outline_generation'
  | 'inspiration_creation'

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
    description: 'Step1: 提取所有角色(含声音档案)、场景、道具',
    stage: 'pipeline',
    defaultVariables: [
      { name: 'content', description: '小说内容', example: '小说正文...', required: true },
      { name: 'scenes', description: '场景列表', example: '场景1, 场景2', required: false },
    ],
  },
  pipeline_storyboard_breakdown: {
    label: '分镜拆解',
    description: 'Step2: 按场景拆解分镜,同时生成首帧画面提示词和视频提示词',
    stage: 'pipeline',
    defaultVariables: [
      { name: 'sceneContent', description: '当前场景原文', example: '场景正文...', required: true },
      { name: 'sceneInfo', description: '当前场景信息', example: '场景名、角色列表', required: true },
      { name: 'previousShot', description: '上一场景尾镜头', example: '尾镜头描述', required: false },
      { name: 'assetList', description: '全局资产列表', example: '角色/场景/道具列表', required: true },
    ],
  },
  pipeline_dubbing_generation: {
    label: '配音生成',
    description: 'Step4: 为有台词的镜头生成配音提示词',
    stage: 'pipeline',
    defaultVariables: [
      { name: 'dialogues', description: '台词列表', example: '角色+台词+情绪', required: true },
      { name: 'shotDescription', description: '镜头画面描述', example: '画面描述...', required: true },
    ],
  },

  script_structure_analysis: {
    label: '剧本结构分析',
    description: '分析小说的故事结构,提取主线、支线、伏笔和转折点',
    stage: 'pipeline',
    defaultVariables: [
      { name: 'content', description: '小说内容', example: '小说正文...', required: true },
    ],
  },
  script_character_arc: {
    label: '角色弧线分析',
    description: '分析主要角色的成长弧线和关键转折时刻',
    stage: 'pipeline',
    defaultVariables: [
      { name: 'content', description: '小说内容', example: '小说正文...', required: true },
      { name: 'characters', description: '主要角色列表', example: '角色1, 角色2', required: true },
    ],
  },
  script_adaptation_strategy: {
    label: '改编策略制定',
    description: '根据故事结构制定小说到影视剧本的改编策略',
    stage: 'pipeline',
    defaultVariables: [
      { name: 'mainPlot', description: '主线剧情', example: '主角的目标和障碍', required: true },
      { name: 'subPlots', description: '支线剧情', example: '支线列表', required: true },
      { name: 'targetDuration', description: '目标时长', example: '10-15分钟短片', required: true },
    ],
  },
  script_outline_generation: {
    label: '剧本大纲生成',
    description: '根据分析结果生成完整的影视剧本大纲',
    stage: 'pipeline',
    defaultVariables: [
      { name: 'structure', description: '故事结构', example: '结构JSON', required: true },
      { name: 'characterArcs', description: '角色弧线', example: '弧线JSON', required: true },
      { name: 'adaptationStrategy', description: '改编策略', example: '策略JSON', required: true },
    ],
  },

  inspiration_creation: {
    label: '灵感创作',
    description: '基于主题生成角色、场景、道具、分镜',
    stage: 'creative',
    defaultVariables: [
      { name: 'topic', description: '创作主题', example: '几个老年人在现代化酒店里休闲打牌...', required: true },
    ],
  },
}

export const PROMPT_STAGES = {
  assistant: { label: 'AI助手', order: 0, color: 'indigo' },
  pipeline: { label: '小说流水线', order: 1, color: 'purple' },
  creative: { label: '创作辅助', order: 2, color: 'pink' },
} as const

// ==================== 共享系统提示词片段 ====================

const SHARED_CREATION_PHILOSOPHY = `
## 一、整体创作哲学

**脊骨与皮肉**：台词是贯穿全片的脊骨,所有人物的眼神、面部微表情、肢体动作、气息变化,必须像皮肉紧贴骨骼一样精准附着在台词之上。台词的重音落在哪个字,画面中的眼神就该燃起或熄灭；台词的气口停顿,便是喉头滚动、指尖发颤的时刻。

**一人一世界**：每一场戏围绕一段核心对话构建,对话即冲突,冲突即剧情。所有运镜、光影、构图都为这段对话服务,形成"台词→内心→眼神→动作→镜头"的完整闭环。

**镜头组设计**：从段落中提取若干个镜头组,每个镜头组总时长严格为10s或15s（只能二选一）。每个镜头组包含2-5个镜头,每个镜头2-5s。镜头组内动作完整连贯,镜头组之间衔接自然流畅,合乎剪辑逻辑,镜头切换不跳脱、不突兀。适配对话正反打、多景别多角度运镜灵活切换（全景、中景、特写、大特写等交替运用）,形成流畅的故事流。

**表演细节闭环**：镜头内实现人物情绪动作、眼神表情、语气台词的衔接闭环。视频提示词必须自然融入台词,台词带"（情绪语气）："前缀,且语气词与停顿都要精准刻画,联动角色动作情绪、眼神表情、眨眼频率,表演细节要体现在字面上——神态与动作细致到微颤的手指、滑落的雨珠、躲闪的眼神。

**眨眼频率与情绪心理对应**：
- 紧张/恐惧：眨眼频率加快（每分钟20-30次）,眼神闪躲,瞳孔放大
- 愤怒/激动：眨眼频率降低（每分钟5-10次）,眼神锁定,目光如炬
- 悲伤/沉思：眨眼缓慢而沉重（每分钟8-12次）,眼神涣散,目光下垂
- 平静/专注：正常眨眼（每分钟15-20次）,眼神稳定,目光集中
- 惊喜/震惊：瞬间睁大双眼,眨眼停滞1-2秒,瞳孔急剧收缩
- 狡黠/算计：眨眼带有节奏感（故意慢眨或快速连眨）,眼神游移不定
`

const SHARED_SHOT_RULES = `
1. **镜头时长**：每个分镜2-5秒,紧张场景偏短,抒情或长动作偏长。

2. **镜头组首帧画面**：prompt字段仅描述镜头组中第一个镜头开启瞬间的静态定格画面——即按下暂停键时看到的那一帧。只包含：场景空间状态、人物在该瞬间的固定位置与表情定态、光影构图。首帧是静止的,像一张照片。
   - ✅ 正确示例："暗巷,雨势渐小。林夜背对镜头站立,雨水沿肌肉线条流淌。苏晚晴蜷缩在墙角,泪眼模糊。冷色调,侧逆光,雨丝如银线。"
   - ❌ 错误示例："林夜缓缓转过身,看向苏晚晴,缓缓伸出手"——包含"转过身""看向""伸出"等动作过程
   - ❌ 错误示例："打手挥舞匕首刺来,林夜身体后仰避开"——包含"挥舞""刺来""后仰"等连续动作
   - 核心规则：prompt中只能用状态词（站立、蹲着、坐着、躺着）和定语（紧绷的、颤抖的、模糊的）,严禁任何动词表示动作过程（走向、转身、抬起、伸出、挥舞、躲避等）

3. **台词规则**：videoPrompt中若出现台词,必须严格使用"（情绪语气）：'台词内容'"格式,如（咬牙低吼）：'你休想！'。无台词的镜头不加此格式。

4. **动作与台词联动**：videoPrompt不能只写台词或只写动作,必须让二者在同一个时间流中咬合。例如："她慢慢蹲下,指尖捻起染血的玉佩,（气声哽咽）：'原来你早就……' 嘴唇颤抖没再说下去,泪珠砸碎在泥泞里。"要写出动作触发言语、言语催生新动作的因果链。

5. **镜头连贯性**：前后分镜的videoPrompt要给出明确衔接钩子——上一个镜头的动作结束点触发下一个镜头的开始,例如上一个镜头结尾"她的手猛地握住门环",下一个镜头开始"门环锈屑簌簌而落,她的手背青筋暴起"。

6. **多角度切换**：故事板中自动设计正反打、视轴匹配,对话场景交替使用过肩中景、面部特写、手部细节、全景关系镜头,确保视觉节奏不单调。

7. **人物与道具联动**：storyboards里的characters和props必须列出本镜头实际登场角色与道具名称,与前面定义的characters、props数组中的name一致。

8. **首尾帧呼应**：每个镜头组的第一个镜头的首帧画面,必须同时是上一个镜头组的最后一个镜头的尾帧画面。两帧完全相同,形成无缝平滑过渡。例如：上一组最后一个镜头尾帧是"苏晚晴跪在雨中,双手紧握染血玉佩,仰头望天",则下一组首帧必须以同一画面开头。
`

const SHARED_VIDEO_EXAMPLE = `
[0-10s|场景：陆府大门·雨中]【全景+固定】暴雨如注,雷电交加,陆府门前站着两名守门的卫兵。【侧面跟拍】一双烂草鞋踏着沉重的脚步往前走,泥点飞溅。【大特写】沈昭指尖缓缓推高斗笠,雨水顺着她凌厉的下颌线滴落。卫兵（呵斥）："站住！陆府重地,叫花子滚远点！"【中景+手持晃动】一名卫兵手中的长枪剧烈颤抖,另一名卫兵连滚带爬地后退。卫兵（惊叫）："沈小姐！？……你是人是鬼！"沈昭（眼神坚定）："我是回来清账的冤魂！"

[10-20s]【中景+推轨】沈昭撞开厅门向前走,满身泥水在地上拖出刺眼的黑印。坐在高位的陆砚书端着水杯的手微颤,抬头间满眼阴鸷。陆砚书（讥讽）："北境风沙竞没埋了你。阿昭,你命真硬。"沈昭（眼神坚定）："托陆大人的福,阎王爷嫌我怨气太重,不敢收。"【大特写】沈昭伸手指向前,死死盯住陆砚书的双眼。沈昭（声音如刀）："我要沈家十一口人的命！你陆砚书,赔得起吗？"

[20-35s|场景：陆府花厅·室内]【中景+固定】陆砚书放下水杯,缓缓站起身来。陆砚书（轻蔑）："回来向我讨饭吃？"【过肩拍】沈昭冷笑一声,从怀中掏出一枚染血的玉佩。沈昭（冷笑）："陆大人可还记得这个？"`

const SHARED_ASSET_JSON_CHARACTER = `    {
      "name": "角色名",
      "description": "人物小传,涵盖外貌、性格、身份、内心动机",
      "prompt": "角色四视图合一生图提示词（人物名+年龄段+体型+五官+发型+肤色+服装+配饰）",
      "staticViews": "四视图合一提示词（正面半身肖像+正面全身+侧面全身+背面全身）,纯角色静态展示,无道具,统一柔光,白色/纯色背景,确保角色一致性",
      "wardrobeVariants": "衍生衣橱四合一提示词,根据剧情列出多种服饰状态（如便装、华服、战损、伪装）,每状态包含四视图合一提示词,展示服饰多面性"
    }`

const SHARED_ASSET_JSON_SCENE = `    {
      "name": "场景名",
      "description": "场景氛围与空间布局描述",
      "prompt": "场景全景图提示词（视角+时间段+天气+地理位置+环境元素+材质+颜色+光线+色调）,纯场景,无人物"
    }`

const SHARED_ASSET_JSON_PROP = `    {
      "name": "道具名",
      "description": "道具描述及剧情作用",
      "prompt": "道具四合一提示词（道具名+类型+形态+材质+颜色+细节特征）,纯道具,无人物"
    }`

export const DEFAULT_PROMPT_TEMPLATES: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'AI创作助手',
    description: 'AI对话助手的系统提示词',
    type: 'assistant_chat',
    content: `你是一位专业的影视创作助手,擅长剧本创作、故事分析和角色设计。

当前剧本内容（前500字符）：
{{content}}

已提取的角色：
{{characters}}

请根据用户的问题提供专业的建议和帮助。`,
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
    content: `你是专业影视编剧。请将以下小说内容按叙事逻辑划分为多个场景段落。

小说内容：
{{content}}

划分原则：
1. 每个场景是一个连续的时空（同一地点+同一时间段）
2. 地点变化、时间跳转、氛围转变都应切分新场景
3. 每个场景应有明确的叙事功能（交代、发展、冲突、高潮、过渡等）
4. 场景粒度适中,太细会导致镜头过少,太粗会超出AI处理能力
5. originalText 必须是该场景对应的原文片段,保留原文措辞,不要改写或缩写

[重要]originalText 字段是后续分镜拆解的唯一原文依据,必须完整准确地摘录该场景对应的原文段落,遗漏或错误将导致分镜与原文脱节。

请直接输出JSON,不要有任何其他说明文字：
[
  {
    "name": "场景名称（如：清晨街道、办公室、咖啡厅）",
    "summary": "场景概要（1-2句话概括发生了什么）",
    "originalText": "该场景对应的原文片段（逐字摘录,保留原文措辞）",
    "location": "具体地点",
    "time": "时间段（清晨/上午/正午/下午/黄昏/夜晚/深夜）",
    "mood": "情绪氛围（紧张/温馨/悲伤/欢快等）",
    "characters": ["出场角色名列表"],
    "narrativeFunction": "叙事功能（交代背景/推进剧情/制造冲突/情感转折/高潮/收尾等）"
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
    description: 'Step1: 提取所有角色(含声音档案)、场景、道具的视觉提示词',
    type: 'pipeline_asset_extraction',
    content: `你是专业影视美术指导和声音设计师。请从以下小说中提取所有角色、场景、道具,并生成专业的AI生图提示词和声音档案。

小说内容：
{{content}}

场景列表：
{{scenes}}

## 一、角色提取规范（四视图设定图）

每个角色必须包含：
- name: 角色名（保留原文）
- description: 角色描述（外貌+性格+职业+内心动机）
- prompt: 角色四合一生图提示词（中文,包含：人物名+年龄段+体型+五官+发型+肤色+服装+配饰）
- staticViews: 四视图合一提示词,严格按照以下规范生成：

### 角色四视图设定图规范

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
- 画质：超高清,超写实,8K,CG建模渲染

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

**基础发型**：自然发色（黑色/深棕）、发丝清晰、自然散发/简单束发、无发饰

**基础服装**：基础内衣+四角内裤,基础色,无花纹装饰

**提示词要求**：
- 角色四合一生图提示词包含：人物名+年龄段+体型+五官+发型+肤色+服装+配饰
- 四视图设定图提示词格式：人物描述 + 结构限定。人物描述在前（如：冷艳女刺客,黑色夜行衣,马尾高束,腰佩软剑,身形挺拔）,结构限定在后（16:9横版构图,左侧1/3超大高清面部特写,右侧2/3整齐排布正面/侧面/背面三张全身三视图,纯白色背景,视觉对齐,超高清,超写实8K,CG建模渲染）
- 衍生衣橱四合一提示词：根据剧情列出多种服饰状态,每状态包含四视图合一提示词
- 声音档案：性别+年龄段+音色特征+语速习惯+语气特点+参考描述

## 二、场景提取规范（四视图设定图）

每个场景必须包含：
- name: 场景名（保留原文）
- description: 场景描述（环境+氛围+时间+叙事功能）
- prompt: 场景全景图提示词（中文,纯场景,无人物）

### 场景四视图设定图规范
**视图定义**：
- 左上：前视图（从中心点向前方平视0°,展示场景正面主体结构与纵深层次）
- 右上：右视图（从中心点向右方平视90°,展示场景右侧空间延伸）
- 左下：后视图（从中心点向后方平视180°,展示场景背面结构）
- 右下：左视图（从中心点向左方平视270°,展示场景左侧空间延伸）

**画面规范**：
- 布局：同一画面2×2网格排列
- 人物：严禁出现任何人物、人影、人体轮廓
- 视点：四视图均从同一中心点出发,视线高度一致
- 一致性：四视图的建筑结构/材质/色调/光线/季节/天候完全一致
- 光线：四视图光源方向统一,保持光影逻辑一致

**场景美学原则**：
1. 空间叙事 — 场景承载情绪与叙事功能,不是纯背景板
2. 层次纵深 — 所有场景必须具备前/中/后景,杜绝扁平
3. 质感至上 — 材质纹理必须超清晰
4. 实拍为锚 — 以真实摄影为标准

**场景要素**：
- 室内：现代公寓/写字楼/咖啡厅/酒店/商场,混凝土/玻璃/木材/金属/布艺,自然光源,浅景深虚化
- 室外：街道/广场/公园/天台,天候（晴/阴/薄雾/细雨）,植被,空气透视

**提示词要求**：
- 场景全景图提示词包含：视角+时间段+天气+地理位置+环境元素+材质+颜色+光线+色调
- 四视图设定图提示词需描述：前视图+右视图+后视图+左视图,2×2网格排列,同一中心点平视,建筑结构/材质/色调/光线一致,严禁出现人物

## 三、道具提取规范（四视图设定图）

每个道具必须包含：
- name: 道具名（保留原文）
- description: 道具描述（功能+材质+外观+剧情作用）
- prompt: 道具四合一提示词（中文,纯道具,无人物）

### 道具四视图设定图规范
**视图定义**：
- 左上：正面图（正面0°,道具完整正面形态）
- 右上：侧面图（侧面90°,厚度/轮廓/结构清晰）
- 左下：背面图（背面180°,道具背部结构/装饰）
- 右下：细节特写（局部放大,材质纹理/工艺细节）

**画面规范**：
- 布局：同一画面四宫格（2×2）,上下左右四视角
- 背景：纯净中性灰 #E8E8E8
- 光线：均匀柔光,无硬阴影
- 比例：每格道具占格内主体70%+

**道具设计原则**：
1. 功能可读 — 道具用途一目了然
2. 质感极致 — 材质纹理必须清晰可辨
3. 年代一致 — 符合世界观
4. 纯道具独立展示 — 严禁出现任何人物、手部、肢体

**材质渲染**：
- 金属：反光/高光/冷光泽、划痕微可见
- 玻璃：透光/反光/折射清晰
- 塑料：质感细腻、表面均匀
- 皮革：纹理清晰、光泽自然
- 陶瓷：釉面光泽、色泽均匀
- 布料：纤维质感、边缘自然
- 木材：木纹清晰、表面光滑

**提示词要求**：
- 道具四合一提示词包含：道具名+类型+形态+材质+颜色+细节特征
- 四视图设定图提示词需描述：正面图+侧面图+背面图+细节特写,四宫格2×2布局,纯净中性灰背景,均匀柔光,严禁出现人物/手部/肢体

## 四、重要约束

1. 所有提示词使用中文
2. 角色提示词禁止包含风格词和画质词（8k, ultra HD等）
3. 场景提示词绝对不能有人物
4. 道具提示词绝对不能有人物
5. 声音档案要具体可执行,能直接用于TTS生成
6. 四视图必须严格遵循从头到脚完整展示,严禁裁切

请直接输出JSON,不要有任何其他说明文字：
{
  "characters": [...],
  "scenes": [...],
  "props": [...]
}`,
    variables: ['content', 'scenes'],
    isDefault: true,
    isPreset: true,
    category: '小说流水线',
    tags: ['资产', '提取', '流水线'],
  },
  {
    name: '分镜拆解-专业级',
    description: 'Step2: 按场景拆解分镜,同时生成首帧画面提示词和视频提示词',
    type: 'pipeline_storyboard_breakdown',
    content: `你是专业影视导演与视频提示词生成智能体。请严格遵循以下创作哲学进行分镜拆解。${SHARED_CREATION_PHILOSOPHY}

[场景信息]
{{sceneInfo}}

[原文片段]
{{sceneContent}}

[上一片段尾镜头]
{{previousShot}}

[可用资产列表]
{{assetList}}

[可用角色视觉描述]
{{characterPrompts}}

[可用场景视觉描述]
{{scenePrompts}}

[可用道具视觉描述]
{{propPrompts}}

## 二、分镜生成细则${SHARED_SHOT_RULES}
## 三、视频提示词格式示例${SHARED_VIDEO_EXAMPLE}

请直接输出JSON数组,不要有任何其他说明文字：
[
  {
    "description": "沈昭雨夜叩陆府大门",
    "prompt": "暴雨中的陆府大门前,两名卫兵持枪站立。沈昭背对镜头站立,斗笠低垂,雨水沿下颌线滴落。冷色调,侧逆光,雨丝如银线。",
    "videoPrompt": "[0-10s|场景：陆府大门·雨中]【全景+固定】暴雨如注,雷电交加,陆府门前站着两名守门的卫兵。【侧面跟拍】一双烂草鞋踏着沉重的脚步往前走,泥点飞溅。【大特写】沈昭指尖缓缓推高斗笠,雨水顺着她凌厉的下颌线滴落。卫兵（呵斥）：'站住！陆府重地,叫花子滚远点！'【中景+手持晃动】一名卫兵手中的长枪剧烈颤抖,另一名卫兵连滚带爬地后退。卫兵（惊叫）：'沈小姐！？……你是人是鬼！'沈昭（眼神坚定）：'我是回来清账的冤魂！'",
    "characters": ["沈昭", "卫兵"],
    "scene": "陆府大门",
    "props": ["斗笠", "长枪"],
    "cameraAngle": "全景·固定",
    "duration": 10,
    "dialogues": [
      { "character": "卫兵", "line": "站住！陆府重地,叫花子滚远点！", "emotion": "呵斥" },
      { "character": "卫兵", "line": "沈小姐！？……你是人是鬼！", "emotion": "惊叫" },
      { "character": "沈昭", "line": "我是回来清账的冤魂！", "emotion": "坚定" }
    ]
  }
]`,
    variables: ['sceneContent', 'sceneInfo', 'previousShot', 'assetList', 'characterPrompts', 'scenePrompts', 'propPrompts'],
    isDefault: true,
    isPreset: true,
    category: '小说流水线',
    tags: ['分镜', '拆解', '流水线'],
  },
  {
    name: '配音生成-专业级',
    description: 'Step4: 为场景内所有台词批量生成配音提示词',
    type: 'pipeline_dubbing_generation',
    content: `你是专业配音导演。请为以下场景中所有镜头的台词批量生成配音提示词。

[镜头画面列表]
{{shotsDescription}}

[台词列表]
{{dialogues}}

生成原则：
1. audio_prompt 必须包含：角色身份+情绪强度+语气特点+语速节奏+声音质感变化
2. 情绪要与画面氛围匹配
3. 同一角色在不同镜头的声音质感应保持一致
4. 台词的语气和节奏要符合角色性格和当前情境

请直接输出JSON数组,不要有任何其他说明文字：
[
  {
    "character": "角色名",
    "line": "台词内容",
    "emotion": "情绪状态",
    "audio_prompt": "配音提示词（中文,包含：角色身份+情绪强度+语气特点+语速节奏+声音质感）"
  }
]`,
    variables: ['dialogues', 'shotsDescription'],
    isDefault: true,
    isPreset: true,
    category: '小说流水线',
    tags: ['配音', '生成', '流水线'],
  },

  {
    name: '剧本结构分析',
    description: '分析小说的故事结构,提取主线、支线、伏笔和转折点',
    type: 'script_structure_analysis',
    content: `你是专业编剧和故事分析师。请分析以下小说的故事结构,深度挖掘叙事内核。

小说内容：
{{content}}

分析要求：
1. 主线剧情：用一句话概括核心冲突,明确主角的目标和障碍
2. 支线剧情：识别所有支线,标注相关角色和对主线的影响
3. 伏笔设置：找出所有伏笔,标注在何处回收
4. 转折点：按三幕式结构标注关键转折点

请直接输出JSON,不要有任何其他说明文字：
{
  "mainPlot": "主线剧情描述（一句话概括核心冲突）",
  "subPlots": [
    { "name": "支线名称", "description": "支线描述", "relatedCharacters": ["相关角色"] }
  ],
  "foreshadowing": [
    { "content": "伏笔内容", "resolvedIn": "在何处回收" }
  ],
  "turningPoints": [
    { "position": "位置（如：开篇1/4处）", "event": "事件", "impact": "对剧情的影响" }
  ]
}`,
    variables: ['content'],
    isDefault: true,
    isPreset: true,
    category: '剧本Agent',
    tags: ['剧本', '结构', '分析'],
  },

  {
    name: '角色弧线分析',
    description: '分析主要角色的成长弧线和关键转折时刻',
    type: 'script_character_arc',
    content: `你是专业编剧和角色分析师。请分析以下小说中主要角色的成长弧线。

小说内容：
{{content}}

主要角色：{{characters}}

分析要求：
1. 初始状态：角色的性格、处境、目标
2. 成长过程：角色经历的关键变化
3. 最终状态：角色的转变结果
4. 关键时刻：推动角色转变的具体事件

请直接输出JSON数组,不要有任何其他说明文字：
[
  {
    "name": "角色名",
    "initialState": "初始状态（性格、处境、目标）",
    "development": "成长过程（关键变化）",
    "finalState": "最终状态",
    "keyMoments": ["关键转折时刻1", "关键转折时刻2"]
  }
]`,
    variables: ['content', 'characters'],
    isDefault: true,
    isPreset: true,
    category: '剧本Agent',
    tags: ['剧本', '角色', '弧线'],
  },

  {
    name: '改编策略制定',
    description: '根据故事结构制定小说到影视剧本的改编策略',
    type: 'script_adaptation_strategy',
    content: `你是专业改编编剧。请根据以下故事结构,制定小说到影视剧本的改编策略。

主线剧情：{{mainPlot}}

支线剧情：
{{subPlots}}

目标时长：{{targetDuration}}

改编原则：
1. 保留核心：主线剧情和关键转折点必须保留
2. 压缩冗余：与主线无关的支线可以压缩或合并
3. 扩展视觉：适合视觉呈现的场景可以扩展
4. 删除干扰：影响节奏或主题的部分可以删除

请直接输出JSON,不要有任何其他说明文字：
{
  "preserveElements": ["必须保留的核心元素"],
  "compressElements": ["可以压缩的情节"],
  "expandElements": ["需要扩展的内容"],
  "removeElements": ["建议删除的部分"],
  "notes": "改编注意事项"
}`,
    variables: ['mainPlot', 'subPlots', 'targetDuration'],
    isDefault: true,
    isPreset: true,
    category: '剧本Agent',
    tags: ['剧本', '改编', '策略'],
  },

  {
    name: '剧本大纲生成',
    description: '根据分析结果生成完整的影视剧本大纲',
    type: 'script_outline_generation',
    content: `你是专业编剧。请根据以下分析结果,生成完整的影视剧本大纲。

故事结构：{{structure}}

角色弧线：{{characterArcs}}

改编策略：{{adaptationStrategy}}

大纲要求：
1. 标题：简洁有力,体现主题
2. 一句话梗概：包含主角、目标、障碍、赌注
3. 主题：作品的深层思想
4. 时长预估：根据内容量预估
5. 目标观众：明确受众群体

请直接输出JSON,不要有任何其他说明文字：
{
  "title": "剧本标题",
  "logline": "一句话故事梗概（主角+目标+障碍+赌注）",
  "theme": "主题思想",
  "structure": { ...上面的structure },
  "characterArcs": [ ...上面的characterArcs ],
  "adaptationStrategy": { ...上面的adaptationStrategy },
  "estimatedDuration": "预估时长",
  "targetAudience": "目标观众"
}`,
    variables: ['structure', 'characterArcs', 'adaptationStrategy'],
    isDefault: true,
    isPreset: true,
    category: '剧本Agent',
    tags: ['剧本', '大纲', '生成'],
  },

  {
    name: '灵感创作-专业级',
    description: '基于主题生成角色、场景、道具和分镜',
    type: 'inspiration_creation',
    content: `你是专业影视导演与视频提示词生成智能体。基于用户提供的主题,你需要先构想场景整体设定与全员人物人设,提取角色四合一生图提示词、场景全景图提示词、道具四合一提示词、角色衍生衣橱四合一提示词；再从单个场景中提取若干个镜头组（每个镜头组总时长严格为10s或15s,每个镜头2-5s）,生成首帧提示词和视频提示词,并严格输出为JSON格式。${SHARED_CREATION_PHILOSOPHY}

主题：{{topic}}

## 二、资产提取规范（四视图设定图）

### 角色四视图设定图规范

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
- 画质：超高清,超写实,8K,CG建模渲染

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

**基础发型**：自然发色（黑色/深棕）、发丝清晰、自然散发/简单束发、无发饰

**基础服装**：基础内衣+四角内裤,基础色,无花纹装饰

**角色四合一生图提示词**：包含人物名+年龄段+体型+五官+发型+肤色+服装+配饰+姿态+表情

**角色四视图提示词格式**：人物描述 + 结构限定。人物描述在前（如：冷艳女刺客,黑色夜行衣,马尾高束,腰佩软剑,身形挺拔）,结构限定在后（16:9横版构图,左侧1/3超大高清面部特写,右侧2/3整齐排布正面/侧面/背面三张全身三视图,纯白色背景,视觉对齐,超高清,超写实8K,CG建模渲染）

**角色衍生衣橱四合一提示词**：根据剧情列出多种服饰状态,每状态包含四视图合一提示词

### 场景四视图设定图规范
**视图定义**：前视图+右视图+后视图+左视图,2×2网格排列,同一中心点平视

**画面规范**：
- 严禁出现任何人物、人影、人体轮廓
- 四视图的建筑结构/材质/色调/光线完全一致
- 场景必须具备前/中/后景层次,材质纹理超清晰

**场景全景图提示词**：包含视角+时间段+天气+地理位置+环境元素+材质+颜色+光线+色调

**场景四视图提示词要求**：描述2×2网格四视图,同一中心点平视,建筑/材质/色调/光线一致,无人物

### 道具四视图设定图规范
**视图定义**：正面图+侧面图+背面图+细节特写,四宫格2×2布局

**画面规范**：
- 纯净中性灰背景,均匀柔光,无硬阴影
- 严禁出现人物/手部/肢体,道具独立展示

**材质渲染**：金属/玻璃/塑料/皮革/陶瓷/布料/木材,质感清晰可辨

**道具四合一提示词**：包含道具名+类型+形态+材质+颜色+细节特征

## 三、分镜生成细则${SHARED_SHOT_RULES}
## 四、视频提示词格式示例${SHARED_VIDEO_EXAMPLE}

请直接输出JSON,不要有任何其他说明文字：
{
  "characters": [
${SHARED_ASSET_JSON_CHARACTER}
  ],
  "scenes": [
${SHARED_ASSET_JSON_SCENE}
  ],
  "props": [
${SHARED_ASSET_JSON_PROP}
  ],
  "storyboards": [
    { 
      "description": "沈昭雨夜叩陆府大门", 
      "prompt": "暴雨中的陆府大门前,两名卫兵持枪站立。沈昭背对镜头站立,斗笠低垂,雨水沿下颌线滴落。冷色调,侧逆光,雨丝如银线。", 
      "videoPrompt": "[0-10s|场景：陆府大门·雨中]【全景+固定】暴雨如注,雷电交加,陆府门前站着两名守门的卫兵。【侧面跟拍】一双烂草鞋踏着沉重的脚步往前走,泥点飞溅。【大特写】沈昭指尖缓缓推高斗笠,雨水顺着她凌厉的下颌线滴落。卫兵（呵斥）：'站住！陆府重地,叫花子滚远点！'【中景+手持晃动】一名卫兵手中的长枪剧烈颤抖,另一名卫兵连滚带爬地后退。卫兵（惊叫）：'沈小姐！？……你是人是鬼！'沈昭（眼神坚定）：'我是回来清账的冤魂！'",
      "characters": ["沈昭", "卫兵"],
      "props": ["斗笠", "长枪"],
      "duration": 10
    }
  ]
}`,
    variables: ['topic'],
    isDefault: true,
    isPreset: true,
    category: '创作辅助',
    tags: ['灵感', '创作', '主题', '专业级'],
  },
]

export const POPULAR_PROMPT_PRESETS: PromptPreset[] = []
