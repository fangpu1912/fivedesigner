/**
 * 豆包网页 DOM 选择器常量
 *
 * 集中维护便于豆包改版时统一调整。每个选择器提供容错链（数组），
 * 按顺序尝试匹配，第一个命中的为准。
 */

/** 提示词输入框选择器（容错链） */
export const PROMPT_INPUT_SELECTORS: string[] = [
  '[contenteditable="true"][role="textbox"]',
  'textarea[placeholder*="发消息"]',
  'textarea[placeholder*="输入"]',
  'textarea[placeholder*="消息"]',
  'div[contenteditable="true"][class*="input"]',
  'div[contenteditable="true"]',
]

/** 文件上传 input 选择器 */
export const FILE_INPUT_SELECTORS: string[] = [
  'input[type="file"][accept*="image"]',
  'input[type="file"]',
]

/** 发送按钮选择器（容错链） */
export const SEND_BUTTON_SELECTORS: string[] = [
  '[data-testid*="send"]',
  '[data-testid*="Send"]',
  'button[aria-label*="发送"]',
  'button[aria-label*="Send"]',
  'button[type="submit"]',
  // 豆包发送按钮是 SVG 图标，class 含 send-msg-btn-text（点击时需向上找父级 button）
  'svg[class*="send-msg-btn"]',
  '[class*="send-msg-btn"]',
]

/**
 * 比例/时长选择按钮选择器
 * 豆包视频模式下，比例和时长合并在一个按钮里（如"自动 · 10s"、"9:16 · 5s"）
 */
export const RATIO_BUTTON_SELECTORS: string[] = [
  // Radix 下拉按钮
  'button[role="combobox"]',
  // 按文本匹配的按钮（在脚本中按文本内容进一步筛选）
]

/**
 * 视频生成模式切换按钮选择器（容错链）
 * 豆包网页默认可能是文本对话，需先切换到「视频生成」模式
 */
export const VIDEO_MODE_SELECTORS: string[] = [
  '[data-testid*="video"]',
  '[data-testid*="Video"]',
  'button[aria-label*="视频"]',
  'button[aria-label*="Video"]',
]

/**
 * 视频模式按钮的文本匹配关键词（用于在 button/[role=button] 中按文本查找）
 * 顺序：精确匹配优先
 */
export const VIDEO_MODE_TEXT_KEYWORDS: string[] = [
  '视频生成',
  '生成视频',
  '图生视频',
  '文生视频',
  '视频',
]

/** 比例/尺寸选择器文本关键词 */
export const RATIO_TEXT_KEYWORDS: string[] = [
  '9:16', '16:9', '1:1', '4:3', '3:4',
  '竖屏', '横屏', '方屏',
  '比例', '尺寸', '分辨率',
]

/** 模型选择器文本关键词 */
export const MODEL_TEXT_KEYWORDS: string[] = [
  '模型', '版本', 'Model',
]

/**
 * 探测页面时扫描的关键词集合（用于发现可交互元素）
 * 探测结果帮助确定上述选择器是否正确
 */
export const PROBE_KEYWORDS: string[] = [
  '视频', '图生', '文生', '生成', '发送', 'send',
  '比例', '尺寸', '分辨率', '9:16', '16:9', '1:1',
  '竖屏', '横屏', '模型', '版本', '时长', '清空',
  '上传', '图片', '参考', '首帧', '尾帧',
]

/** 创作页 URL 正则（表示已进入对话页） */
export const CHAT_URL_PATTERN = /doubao\.com\/chat/i

/** 登录页 URL 正则（表示未登录或登录已过期） */
export const LOGIN_URL_PATTERN = /doubao\.com\/(login|signin)|passport|sso/i

/**
 * 在页面上按容错链查找第一个匹配的元素
 * 注入到 WebView 内执行的辅助函数字符串
 */
export const QUERY_HELPER_JS = `
  function __doubaoQuerySelector(selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el) return el;
    }
    return null;
  }
  function __doubaoQuerySelectorAll(selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var els = document.querySelectorAll(selectors[i]);
      if (els && els.length > 0) return els;
    }
    return [];
  }
`
