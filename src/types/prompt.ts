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
      { name: 'shotsDescription', description: '镜头画面描述列表', example: '镜头1: 画面...', required: true },
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

const SHARED_CREATION_PHILOSOPHY = `
一、核心创作哲学
脊骨与皮肉：台词是全篇叙事脊骨，人物眼神、面部微表情、肢体动作、气息起伏全部贴合台词。台词重音对应眼神明暗变化，语句气口停顿匹配喉头滚动、指尖震颤等细微肢体反应，神态动作紧密依附台词节奏。
一人一世界：单场戏份围绕核心对话构建，对话承载剧情冲突。运镜、光影、构图全部服务对话内容，形成台词→内心情绪→眼神神态→肢体动作→镜头呈现完整叙事闭环。
镜头组规范：单镜头组固定时长 10 秒，每组包含 2-5 个单镜头，单个镜头时长控制在 2-5 秒。紧张戏份镜头时长偏短，抒情、细节刻画镜头时长偏长。灵活切换全景、中景、近景、特写、大特写等景别，正反打、多角度运镜搭配使用，镜头衔接自然无跳跃，叙事节奏流畅。
表演细节闭环：画面内实现情绪、神态、动作、台词高度契合。台词统一附带情绪语气标注，精准还原语气起伏与语句停顿；细化微表情、指尖颤动、眼眸躲闪、泪珠滑落等极致细节，动作与台词形成因果联动关系。`

const SHARED_SHOT_RULES = `
1. 画面首帧 prompt 编写规则
prompt 仅描述镜头组首个镜头的定格静态画面，等同于画面暂停瞬间视觉效果。
仅使用状态类词汇、景物定语修饰，禁止出现转身、抬手、迈步、挥舞等动态动作动词
内容包含：场景空间样貌、人物定格站位与神态、光影色调、构图氛围
作用：确定镜头组初始画面基底，无动态变化描述
2. videoPrompt 动态镜头文案规则
时长标注：按单镜头拆分标注秒数，严格遵循 2-5 秒单镜时长限制，10 秒镜头组时长总和精准匹配
镜头运镜：标注景别 + 运镜方式，多景别交替切换，合理运用过肩拍、推拉摇移、固定、手持晃动等拍摄手法
台词格式：统一规范为（情绪语气）：'台词内容'，语气、嘶吼、哽咽、冷淡等情绪精准标注
动作台词联动：动作触发台词表达，台词带动肢体神态变化，二者时间线咬合，形成清晰因果逻辑
镜头衔接：上一镜头收尾动作，作为下一镜头起始画面，预留衔接钩子，保证剪辑顺滑
细节刻画：融入呼吸、眼神、指尖、面部肌理、环境细碎动态等微细节，强化画面真实感
3. 基础字段填写规范
description：简洁概括本组镜头核心剧情内容
characters：数组格式，仅填写本镜头实际出镜角色名称，与给定角色名统一
scene_id：填写对应场景名称，严格匹配提供的场景库命名
props：数组格式，罗列镜头内出现的道具名称，沿用给定道具命名
shot_type：单镜头组多景别填写多景别连贯切换，单一视角填写单景别固定镜头
duration：固定填写数值 10
4. 画面衔接硬性要求
本组镜头首帧定格画面，与上一组镜头末尾收尾画面完全一致，实现无缝过渡
多镜头组之间动作逻辑连贯，剧情推进无断层，视角切换符合现实观影视觉习惯`

const SHARED_VIDEO_EXAMPLE = `[
  {
    "description": "沈昭雨夜叩陆府大门对峙守卫",
    "prompt": "暴雨笼罩陆府大门，两名卫兵持枪直立驻守。沈昭背对镜头静立，斗笠低垂，雨水凝附在下颌轮廓。冷调雨夜氛围，侧逆光，雨丝静态悬浮。",
    "videoPrompt": "[0-10s|场景：陆府大门·雨中]【全景2s+固定】滂沱暴雨冲刷陆府朱门，夜色阴沉，两名卫兵身姿紧绷持枪伫立。【中景3s+缓推】沈昭身披雨幕缓步前行，脚步沉稳，周身浸满雨水，气场冷冽肃杀。【大特写3s+定格】沈昭指节轻贴斗笠边缘，眼神藏于阴影，下颌线条紧绷。卫兵（厉声呵斥）：'站住！陆府重地，叫花子滚远点！'【近景2s+微晃】卫兵瞳孔骤缩，身体僵硬后退，满脸难以置信。卫兵（惊慌失态）：'沈小姐！？……你是人是鬼！'沈昭（低沉冷冽、眼底含煞）：'我是回来清账的冤魂！'",
    "characters": ["沈昭", "卫兵"],
    "scene_id": "陆府大门",
    "props": ["斗笠", "长枪"],
    "shot_type": "全景、中景、大特写、近景多景别连贯切换",
    "duration": 10
  }
]`

const SHARED_ASSET_JSON_CHARACTER = `    {
      "name": "角色名",
      "description": "人物简单描述",
      "prompt": "人物描述（人物名、年龄段、体型、五官、发型、肤色、服装、配饰），然后附加结构限定（16:9横版构图,左侧1/3超大高清面部特写,右侧2/3整齐排布正面、侧面、背面三张全身三视图,纯白色背景,视觉对齐,超高清,超写实8K）",
      "wardrobeVariants": "衍生衣橱提示词,根据剧情列出多种服饰状态提示词（如便装、华服、战损、伪装）,展示服饰多面性"
    }`

const SHARED_ASSET_JSON_SCENE = `    {
      "name": "场景名",
      "description": "场景简单描述",
      "prompt": "场景描述（视角、时间段、天气、地理位置、环境元素、材质、颜色、光线、色调），然后附加结构限定（前视图、右视图、后视图、左视图,2×2网格排列,同一中心点平视,建筑结构、材质、色调、光线一致,严禁出现人物）"
    }`

const SHARED_ASSET_JSON_PROP = `    {
      "name": "道具名",
      "description": "道具简单描述",
      "prompt": "道具描述（道具名、类型、形态、材质、颜色、细节特征），然后附加结构限定(正面图、侧面图、背面图、细节特写,四宫格2×2布局,纯净中性灰背景,均匀柔光,严禁出现人物、手部、肢体)"
    }`

// ==================== 共享结构化输出规范 ====================

// 角色四视图设定图规范
const SHARED_ASSET_CHARACTER_SPECS = `
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
- 画质：烟雾朦胧·光朦暗朦，虚焦随机模糊，高对比度，胶片颗粒/高噪点LOMO质感，层次丰富光影美学朦胧写意，仙气圣洁高冷，幻境仙境场景，高级感杰作


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
- 男性：170-185cm、7.5-8.5头身、肩部自然、自然手型、身姿挺拔`

// 场景四视图设定图规范
const SHARED_ASSET_SCENE_SPECS = `
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
- 室外：街道/广场/公园/天台,天候（晴/阴/薄雾/细雨）,植被,空气透视`

// 道具四视图设定图规范
const SHARED_ASSET_PROP_SPECS = `
### 道具四视图设定图规范
**视图定义**：
- 左上：正面图（正面0°,道具完整正面形态）
- 右上：侧面图（侧面90°,厚度/轮廓/结构清晰）
- 左下：背面图（背面180°,道具背部结构/装饰）
- 右下：细节特写（局部放大,材质纹理/工艺细节）

**画面规范**：
- 布局：同一画面四宫格（2×2）,上下左右四视角
- 背景：纯白色背景
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
- 木材：木纹清晰、表面光滑`

// 通用约束
const SHARED_ASSET_CONSTRAINTS = `
## 重要约束

1. **所有提示词使用中文**
2. 角色提示词禁止包含风格词和画质词（8k, ultra HD等）
3. 场景提示词绝对不能有人物
4. 道具提示词绝对不能有人物
5. 四视图必须严格遵循从头到脚完整展示,严禁裁切`

// 资产提取完整共享规范（用于独立资产提取等场景）
const SHARED_ASSET_EXTRACTION = `
## 一、角色提取规范（四视图设定图）

每个角色必须包含：
- name: 角色名（保留原文）
- description: 人物简单描述
- prompt: 人物描述（人物名、年龄段、体型、五官、发型、肤色、服装、配饰），然后附加结构限定（16:9横版构图,左侧1/3超大高清面部特写,右侧2/3整齐排布正面、侧面、背面三张全身三视图,纯白色背景,视觉对齐,超高清,超写实8K）
- wardrobeVariants: 衍生衣橱提示词,根据剧情列出多种服饰状态提示词（如便装、华服、战损、伪装）,展示服饰多面性

${SHARED_ASSET_CHARACTER_SPECS}

## 二、场景提取规范（四视图设定图）

每个场景必须包含：
- name: 场景名（保留原文）
- description: 场景简单描述
- prompt: 场景描述（视角、时间段、天气、地理位置、环境元素、材质、颜色、光线、色调），然后附加结构限定（前视图、右视图、后视图、左视图,2×2网格排列,同一中心点平视,建筑结构、材质、色调、光线一致,严禁出现人物）

${SHARED_ASSET_SCENE_SPECS}

## 三、道具提取规范（四视图设定图）

每个道具必须包含：
- name: 道具名（保留原文）
- description: 道具简单描述
- prompt: 道具描述（道具名、类型、形态、材质、颜色、细节特征），然后附加结构限定(正面图、侧面图、背面图、细节特写,四宫格2×2布局,纯净中性灰背景,均匀柔光,严禁出现人物、手部、肢体)

${SHARED_ASSET_PROP_SPECS}

${SHARED_ASSET_CONSTRAINTS}`

export const DEFAULT_PROMPT_TEMPLATES: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'AI创作助手',
    description: 'AI对话助手的系统提示词',
    type: 'assistant_chat',
    content: ``,
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
    description: 'Step1: 提取所有角色、场景、道具的视觉提示词',
    type: 'pipeline_asset_extraction',
    content: `你是专业影视美术指导。请从以下小说中提取所有角色、场景、道具,并生成专业的AI生图提示词。

小说内容：
{{content}}

场景列表：
{{scenes}}

${SHARED_ASSET_EXTRACTION}

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
    content: `你定位为专业影视导演与视频提示词生成智能体，严格依照创作规则完成分镜拆解、镜头设计、台词表演联动、标准化 JSON输出，产出符合剪辑逻辑、画面叙事流畅、细节质感拉满的影视级分镜内容。${SHARED_CREATION_PHILOSOPHY}

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
仅输出标准JSON数组，无额外文字解释、无批注、无多余话术，格式模板如下
[
  {
    "description": "镜头组核心剧情概括",
    "prompt": "镜头组首帧静态定格画面描述，无动态动作",
    "videoPrompt": "分段带时长、景别、运镜、动作、规范台词的完整镜头文案",
    "characters": ["角色名1","角色名2"],
    "scene_id": "对应场景名称",
    "props": ["道具名1","道具名2"],
    "shot_type": "镜头类型标注",
    "duration": 10
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

生成原则：
1. 从每个镜头的描述中提取角色台词,为每句台词生成配音提示词
2. audio_prompt 必须包含：角色身份+情绪强度+语气特点+语速节奏+声音质感变化
3. 情绪要与画面氛围匹配
4. 同一角色在不同镜头的声音质感应保持一致
5. 台词的语气和节奏要符合角色性格和当前情境

请直接输出JSON数组,不要有任何其他说明文字：
[
  {
    "character": "角色名",
    "line": "台词内容",
    "emotion": "情绪状态",
    "audio_prompt": "配音提示词（中文,包含：角色身份+情绪强度+语气特点+语速节奏+声音质感）"
  }
]`,
    variables: ['shotsDescription'],
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
    name: '视频复刻-专业级',
    description: '基于参考视频提取角色、场景、风格、分镜',
    type: 'video_remake',
    content: `你是专业视频分析师与逆向工程专家。请分析以下参考视频,精准还原视频原片,提取角色、场景、道具和分镜,并严格输出为JSON格式。


视频描述：
{{videoDescription}}

${SHARED_ASSET_EXTRACTION}

${SHARED_CREATION_PHILOSOPHY}
## 四、分镜生成细则${SHARED_SHOT_RULES}
## 五、视频提示词格式示例${SHARED_VIDEO_EXAMPLE}

## 六、输出格式要求

请直接输出JSON,不要有任何其他说明文字。
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
    "description": "镜头组核心剧情概括",
    "prompt": "镜头组首帧静态定格画面描述，无动态动作",
    "videoPrompt": "分段带时长、景别、运镜、动作、规范台词的完整镜头文案",
    "characters": ["角色名1","角色名2"],
    "scene_id": "对应场景名称",
    "props": ["道具名1","道具名2"],
    "shot_type": "镜头类型标注",
    "duration": 10
  }
  ]
}`,
    variables: ['videoDescription'],
    isDefault: true,
    isPreset: true,
    category: '创作辅助',
    tags: ['视频', '复刻', '对标'],
  },

  {
    name: '灵感创作-专业级',
    description: '基于主题生成角色、场景、道具和分镜',
    type: 'inspiration_creation',
    content: `你是专业影视导演与视频提示词生成智能体。基于用户提供的主题,创作一个完整故事,并严格输出为JSON格式。

主题：{{topic}}

${SHARED_CREATION_PHILOSOPHY}

${SHARED_ASSET_EXTRACTION}

## 四、分镜生成细则${SHARED_SHOT_RULES}
## 五、视频提示词格式示例${SHARED_VIDEO_EXAMPLE}

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
    "description": "镜头组核心剧情概括",
    "prompt": "镜头组首帧静态定格画面描述，无动态动作",
    "videoPrompt": "分段带时长、景别、运镜、动作、规范台词的完整镜头文案",
    "characters": ["角色名1","角色名2"],
    "scene_id": "对应场景名称",
    "props": ["道具名1","道具名2"],
    "shot_type": "镜头类型标注",
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
