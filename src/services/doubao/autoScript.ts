/**
 * 豆包网页自动化脚本构造器
 *
 * 纯函数 TS 文件，构造 JS 字符串后通过 `evalWebviewJs` 注入到豆包 WebView。
 * 挂载到 `window.__DOUBAO_AUTO_STATUS__` 命名空间，与去水印脚本的 `__EXTRACTED_MEDIA__` 完全隔离。
 * 不 patch fetch/XHR，不重复捕获视频（视频捕获由 dewatermark_content.js 负责）。
 *
 * 关键限制：`eval_webview_js` 用 `webview.eval`，不能返回 JS 执行结果。
 * 获取结果走 IPC 回传：JS 内 `__TAURI_INTERNALS__.invoke('report_doubao_auto_status')` → 后端 emit → 前端 listen。
 */

import {
  PROMPT_INPUT_SELECTORS,
  FILE_INPUT_SELECTORS,
  SEND_BUTTON_SELECTORS,
  VIDEO_MODE_SELECTORS,
  VIDEO_MODE_TEXT_KEYWORDS,
  PROBE_KEYWORDS,
  QUERY_HELPER_JS,
} from './selectors'

/** 自动化脚本参数 */
export interface AutoScriptParams {
  /** 视频提示词 */
  prompt: string
  /** 首帧/参考图的 base64 data URL 列表（data:image/xxx;base64,...） */
  imageBase64List: string[]
  /** 提交令牌（用于结果匹配去重） */
  submitToken: string
  /** 目标比例（如 '9:16'），用于在选择比例时匹配 */
  aspectRatio?: string
  /** 目标时长（秒，5 或 10），用于在选择时长时匹配 */
  duration?: number
  /** 目标模型关键词（如 'fast' / 'mini'），用于在选择模型时匹配 */
  model?: string
}

/** 自动化状态（由脚本写入 window.__DOUBAO_AUTO_STATUS__） */
export interface DoubaoAutoStatus {
  phase: 'init' | 'filling' | 'uploading' | 'submitting' | 'submitted' | 'error' | 'idle'
  ok: boolean
  msg: string
  submittedAt: number | null
  token: string
}

/**
 * 构造自动化主脚本：切视频模式 → 选比例 → 填词 → 上传图片 → 点发送
 *
 * 执行流程：
 * 1. 检测登录状态与页面位置
 * 2. （可选）切换到「视频生成」模式：按 VIDEO_MODE_SELECTORS + 文本关键词查找并点击
 * 3. （可选）选择比例：按文本关键词查找比例按钮并点击
 * 4. 找到提示词输入框并填入 prompt
 * 5. 如有图片：base64 → File → DataTransfer 设置 input.files（失败则尝试 paste 事件）
 * 6. 等待 1.5s 让图片上传完成后点击发送按钮
 * 7. 记录 submittedAt，标记 submitted
 *
 * 每一步更新 window.__DOUBAO_AUTO_STATUS__，失败时 phase='error' 并写入 msg。
 * 步骤 2/3 失败不中断（仅警告），因为部分账号可能已在视频模式。
 */
export function buildAutoScript(params: AutoScriptParams): string {
  const { prompt, imageBase64List, submitToken, aspectRatio, duration, model } = params
  // 用 JSON.stringify 安全注入参数（自动转义引号、反斜杠、换行）
  const promptJson = JSON.stringify(prompt)
  const imagesJson = JSON.stringify(imageBase64List)
  const tokenJson = JSON.stringify(submitToken)
  const ratioJson = JSON.stringify(aspectRatio || '')
  const durationJson = JSON.stringify(duration ? String(duration) : '')
  const modelJson = JSON.stringify(model || '')
  const promptSelectorsJson = JSON.stringify(PROMPT_INPUT_SELECTORS)
  const fileInputSelectorsJson = JSON.stringify(FILE_INPUT_SELECTORS)
  const sendButtonSelectorsJson = JSON.stringify(SEND_BUTTON_SELECTORS)
  const videoModeSelectorsJson = JSON.stringify(VIDEO_MODE_SELECTORS)
  const videoModeTextJson = JSON.stringify(VIDEO_MODE_TEXT_KEYWORDS)

  return `
${QUERY_HELPER_JS}
(function() {
  'use strict';
  var PROMPT = ${promptJson};
  var IMAGES = ${imagesJson};
  var TOKEN = ${tokenJson};
  var RATIO = ${ratioJson};
  var DURATION = ${durationJson};
  var MODEL = ${modelJson};
  var PROMPT_SELECTORS = ${promptSelectorsJson};
  var FILE_SELECTORS = ${fileInputSelectorsJson};
  var SEND_SELECTORS = ${sendButtonSelectorsJson};
  var VIDEO_MODE_SELECTORS = ${videoModeSelectorsJson};
  var VIDEO_MODE_TEXT = ${videoModeTextJson};

  // ===== 状态管理 =====
  function setStatus(phase, ok, msg) {
    window.__DOUBAO_AUTO_STATUS__ = {
      phase: phase,
      ok: !!ok,
      msg: msg || '',
      submittedAt: (window.__DOUBAO_AUTO_STATUS__ && window.__DOUBAO_AUTO_STATUS__.submittedAt) || null,
      token: TOKEN
    };
  }
  function report(phase, ok, msg) {
    setStatus(phase, ok, msg);
    if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
      try {
        window.__TAURI_INTERNALS__.invoke('report_doubao_auto_status', {
          accountId: window.__EMBEDDED_ACCOUNT_ID__ || 'unknown',
          status: window.__DOUBAO_AUTO_STATUS__
        });
      } catch (e) {}
    }
  }
  setStatus('init', false);

  // ===== 登录与页面检测 =====
  var href = location.href;
  if (/login|signin|passport|sso/i.test(href) && !/chat/i.test(href)) {
    setStatus('error', false, '账号未登录或登录已过期，请到浏览器管理页重新登录');
    return;
  }
  if (!/doubao\\.com\\/chat/i.test(href)) {
    setStatus('error', false, '不在豆包创作页（需 doubao.com/chat），请先导航');
    return;
  }

  // ===== 按文本关键词在 button/[role=button] 中查找 =====
  function findByText(keywords, exact) {
    var btns = document.querySelectorAll('button, [role="button"], [class*="tab"], [class*="mode"], [class*="item"]');
    var hits = [];
    for (var i = 0; i < btns.length; i++) {
      var el = btns[i];
      // 跳过不可见元素
      var rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      var txt = (el.textContent || '').trim().replace(/\\s+/g, ' ');
      if (!txt || txt.length > 30) continue;
      var aria = el.getAttribute('aria-label') || '';
      var label = txt || aria;
      if (!label) continue;
      for (var j = 0; j < keywords.length; j++) {
        var kw = keywords[j];
        if (exact ? (label === kw) : (label.indexOf(kw) !== -1)) {
          hits.push({ el: el, text: txt, kw: kw });
          break;
        }
      }
    }
    return hits;
  }

  // ===== base64 data URL 转 File（用 atob，不用 fetch(data:) 避免 CSP 问题）=====
  function base64ToFile(dataUrl, filename) {
    try {
      var arr = String(dataUrl).split(',');
      if (arr.length < 2) return null;
      var mimeMatch = arr[0].match(/:(.*?);/);
      var mime = mimeMatch ? mimeMatch[1] : 'image/png';
      var bstr = atob(arr[1]);
      var n = bstr.length;
      var u8arr = new Uint8Array(n);
      for (var i = 0; i < n; i++) u8arr[i] = bstr.charCodeAt(i);
      return new File([u8arr], filename, { type: mime });
    } catch (e) {
      return null;
    }
  }

  // ===== 图片上传方式1：DataTransfer 设置 input.files =====
  function uploadViaDataTransfer(files) {
    try {
      var input = __doubaoQuerySelector(FILE_SELECTORS);
      if (!input) return false;
      var dt = new DataTransfer();
      for (var i = 0; i < files.length; i++) dt.items.add(files[i]);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } catch (e) {
      return false;
    }
  }

  // ===== 图片上传方式2：paste 事件兜底 =====
  function uploadViaPaste(files, targetEl) {
    try {
      var dt = new DataTransfer();
      for (var i = 0; i < files.length; i++) dt.items.add(files[i]);
      var event = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dt
      });
      (targetEl || document.body).dispatchEvent(event);
      return true;
    } catch (e) {
      return false;
    }
  }

  // ===== 1. 切换到视频生成模式 =====
  // 先检测是否已在视频模式（有"· Ns"时长按钮），避免重复点击导致切换回去
  // 注意：不能仅凭"模型"按钮判断，因为文本模式下也有"模型 Doubao-Pro"等语言模型选择按钮
  function switchToVideoMode() {
    // 检测是否已在视频模式：只看"· Ns"格式的时长按钮（视频模式独有）
    var existingBtns = document.querySelectorAll('button, [role="button"], [role="combobox"]');
    var hasDurationBtn = false;
    for (var i = 0; i < existingBtns.length; i++) {
      var rect0 = existingBtns[i].getBoundingClientRect();
      if (rect0.width === 0 || rect0.height === 0) continue;
      var t0 = (existingBtns[i].textContent || '').trim().replace(/\\s+/g, ' ');
      // "xxx · Ns" 格式的按钮是视频模式独有的时长+比例按钮
      if (/·\\s*\\d+s/.test(t0) && t0.length < 30) {
        hasDurationBtn = true;
        console.log('[doubao-auto] 已在视频模式（检测到时长按钮:', t0.substring(0, 20), '），跳过切换');
        break;
      }
    }
    if (hasDurationBtn) return true;

    // 不在视频模式，查找并点击"视频生成"按钮
    var modeBtn = __doubaoQuerySelector(VIDEO_MODE_SELECTORS);
    if (!modeBtn) {
      // 按文本查找：优先精确匹配"视频生成"，再模糊匹配"视频"
      var hits = findByText(VIDEO_MODE_TEXT, false);
      if (hits.length > 0) {
        // 优先选文本最短的（最精确），且是 button 标签的
        hits.sort(function(a, b) {
          // 优先 button 标签
          var aBtn = a.el.tagName === 'BUTTON' ? 0 : 1;
          var bBtn = b.el.tagName === 'BUTTON' ? 0 : 1;
          if (aBtn !== bBtn) return aBtn - bBtn;
          return a.text.length - b.text.length;
        });
        modeBtn = hits[0].el;
      }
    }
    if (!modeBtn) {
      console.warn('[doubao-auto] 未找到视频模式按钮，且当前不在视频模式');
      return false;
    }
    try {
      // 使用 pointer 事件序列（Radix UI 不响应 .click()）
      var rect = modeBtn.getBoundingClientRect();
      var mx = rect.left + rect.width / 2;
      var my = rect.top + rect.height / 2;
      var mopts = { bubbles: true, cancelable: true, clientX: mx, clientY: my, view: window };
      modeBtn.dispatchEvent(new PointerEvent('pointerdown', Object.assign({}, mopts, { pointerId: 1, pointerType: 'mouse', isPrimary: true })));
      modeBtn.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, mopts, { pointerId: 1, pointerType: 'mouse', isPrimary: true })));
      modeBtn.dispatchEvent(new MouseEvent('mousedown', mopts));
      modeBtn.dispatchEvent(new MouseEvent('mouseup', mopts));
      modeBtn.dispatchEvent(new MouseEvent('click', mopts));
      console.log('[doubao-auto] 已点击视频模式按钮:', (modeBtn.textContent || '').trim().substring(0, 20));
    } catch (e) {
      console.warn('[doubao-auto] 点击视频模式按钮失败，回退 click():', e);
      try { modeBtn.click(); } catch (e2) {}
    }
    return true;
  }

  // ===== 1.4 选择模型（豆包下拉菜单式）=====
  // 豆包视频模式下有模型选择按钮（文本以"模型"开头或包含模型名）
  // 切模型可能重置时长/比例，所以放在选时长/选比例之前
  function selectModel(callback) {
    if (!MODEL) { callback(); return; }

    function realisticClickModel(el) {
      var rect = el.getBoundingClientRect();
      var x = rect.left + rect.width / 2;
      var y = rect.top + rect.height / 2;
      var opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
      try {
        el.dispatchEvent(new PointerEvent('pointerdown', Object.assign({}, opts, { pointerId: 1, pointerType: 'mouse', isPrimary: true })));
        el.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, opts, { pointerId: 1, pointerType: 'mouse', isPrimary: true })));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
      } catch (e) {
        console.warn('[doubao-auto] pointer event 失败，回退 click():', e);
        el.click();
      }
    }

    // 目标模型关键词映射（小写匹配）
    var targetLower = String(MODEL).toLowerCase();
    // 中文别名映射
    var aliases = {
      'seedance_2.5': ['2.5', '旗舰', 'seedance 2.5'],
      'seedance_2.0_pro': ['2.0升级', '进阶'],
      'fast': ['fast', '快速', 'seedance fast', 'doubao-fast'],
      'mini': ['mini', '迷你', 'seedance mini', 'doubao-mini', 'seedance-1.0-mini'],
      'pro': ['pro', '专业', 'seedance pro'],
      'lite': ['lite', '轻量', 'seedance lite']
    };
    var kwList = aliases[targetLower] || [targetLower];

    // 查找模型按钮：文本以"模型"开头，或包含已知模型名（seedance/doubao 等）
    var btns = document.querySelectorAll('button, [role="button"], [role="combobox"]');
    var modelBtn = null;
    for (var i = 0; i < btns.length; i++) {
      var el = btns[i];
      var rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      var txt = (el.textContent || '').trim().replace(/\\s+/g, ' ');
      if (txt.length === 0 || txt.length > 40) continue;
      // 匹配"模型 xxx"按钮 或 纯模型名按钮
      if (txt.indexOf('模型') === 0 || /seedance|doubao/i.test(txt)) {
        modelBtn = el;
        // 当前模型已匹配目标，跳过
        var txtLower = txt.toLowerCase();
        for (var ai = 0; ai < kwList.length; ai++) {
          if (txtLower.indexOf(kwList[ai]) !== -1) {
            console.log('[doubao-auto] 模型已是', txt, '，跳过');
            callback();
            return;
          }
        }
        break;
      }
    }
    if (!modelBtn) {
      console.warn('[doubao-auto] 未找到模型选择按钮');
      callback();
      return;
    }

    realisticClickModel(modelBtn);
    console.log('[doubao-auto] 已点击模型按钮，等待下拉菜单...');

    setTimeout(function() {
      var isExpanded = modelBtn.getAttribute('aria-expanded') === 'true' ||
                       modelBtn.getAttribute('data-state') === 'open';
      if (!isExpanded) {
        console.warn('[doubao-auto] 模型下拉未打开，重试...');
        realisticClickModel(modelBtn);
      }

      var clicked = false;

      // 策略1：在下拉菜单 [role="menu"] 内找选项，关键词匹配
      var menuBtns = document.querySelectorAll('[role="menu"] button, [role="listbox"] button, [role="dialog"] button, [role="menu"] [role="menuitem"]');
      for (var j = 0; j < menuBtns.length; j++) {
        var optRect = menuBtns[j].getBoundingClientRect();
        if (optRect.width === 0 || optRect.height === 0) continue;
        var optText = (menuBtns[j].textContent || '').trim().replace(/\\s+/g, ' ');
        var optLower = optText.toLowerCase();
        for (var k1 = 0; k1 < kwList.length; k1++) {
          if (optLower.indexOf(kwList[k1]) !== -1) {
            realisticClickModel(menuBtns[j]);
            clicked = true;
            console.log('[doubao-auto] 已选择模型(菜单内):', optText);
            break;
          }
        }
        if (clicked) break;
      }

      // 策略2：全局所有可见 button，关键词匹配
      if (!clicked) {
        var allBtns = document.querySelectorAll('button');
        for (var m = 0; m < allBtns.length; m++) {
          var r1 = allBtns[m].getBoundingClientRect();
          if (r1.width === 0 || r1.height === 0) continue;
          var t1 = (allBtns[m].textContent || '').trim().replace(/\\s+/g, ' ');
          if (t1.length === 0 || t1.length > 40) continue;
          var t1Lower = t1.toLowerCase();
          for (var k2 = 0; k2 < kwList.length; k2++) {
            if (t1Lower.indexOf(kwList[k2]) !== -1) {
              realisticClickModel(allBtns[m]);
              clicked = true;
              console.log('[doubao-auto] 已选择模型(全局):', t1);
              break;
            }
          }
          if (clicked) break;
        }
      }

      if (!clicked) {
        console.warn('[doubao-auto] 下拉菜单中未找到模型选项:', MODEL);
        try { document.body.click(); } catch (e) {}
      }
      callback();
    }, 1000);
  }

  // ===== 1.5 选择时长（豆包下拉菜单式）=====
  // 豆包时长与比例合并在同一个"自动 · Ns"按钮的下拉菜单里
  // 先选时长，再选比例（两次独立点开下拉）
  function selectDuration(callback) {
    if (!DURATION) { callback(); return; }

    function realisticClickDur(el) {
      var rect = el.getBoundingClientRect();
      var x = rect.left + rect.width / 2;
      var y = rect.top + rect.height / 2;
      var opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
      try {
        el.dispatchEvent(new PointerEvent('pointerdown', Object.assign({}, opts, { pointerId: 1, pointerType: 'mouse', isPrimary: true })));
        el.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, opts, { pointerId: 1, pointerType: 'mouse', isPrimary: true })));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
      } catch (e) {
        console.warn('[doubao-auto] pointer event 失败，回退 click():', e);
        el.click();
      }
    }

    // 查找时长按钮：文本匹配 "自动 · Ns" / "9:16 · 5s" 等
    var btns = document.querySelectorAll('button, [role="button"], [role="combobox"]');
    var durBtn = null;
    for (var i = 0; i < btns.length; i++) {
      var el = btns[i];
      var rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      var txt = (el.textContent || '').trim().replace(/\\s+/g, ' ');
      if (/·\\s*\\d+s/.test(txt) && txt.length < 30) {
        durBtn = el;
        // 当前时长已匹配目标，跳过
        if (txt.indexOf(DURATION + 's') !== -1) {
          console.log('[doubao-auto] 时长已是', DURATION + 's', '，跳过');
          callback();
          return;
        }
        break;
      }
    }
    if (!durBtn) {
      console.warn('[doubao-auto] 未找到时长选择按钮（文本模式 "· Ns" 未命中）');
      callback();
      return;
    }
    realisticClickDur(durBtn);
    console.log('[doubao-auto] 已点击时长按钮，等待下拉菜单...');

    setTimeout(function() {
      var isExpanded = durBtn.getAttribute('aria-expanded') === 'true' ||
                       durBtn.getAttribute('data-state') === 'open';
      if (!isExpanded) {
        console.warn('[doubao-auto] 时长下拉未打开，重试...');
        realisticClickDur(durBtn);
      }

      var clicked = false;
      var targetText = DURATION + 's';

      // 策略1：menu 内找时长选项
      var menuBtns = document.querySelectorAll('[role="menu"] button, [role="listbox"] button, [role="dialog"] button');
      for (var j = 0; j < menuBtns.length; j++) {
        var optRect = menuBtns[j].getBoundingClientRect();
        if (optRect.width === 0 || optRect.height === 0) continue;
        var optText = (menuBtns[j].textContent || '').trim().replace(/\\s+/g, ' ');
        if (optText === targetText || optText === DURATION + '秒' || optText.indexOf(targetText) !== -1) {
          realisticClickDur(menuBtns[j]);
          clicked = true;
          console.log('[doubao-auto] 已选择时长(菜单内):', targetText);
          break;
        }
      }

      // 策略2：全局 button 精确匹配
      if (!clicked) {
        var allBtns = document.querySelectorAll('button');
        for (var k = 0; k < allBtns.length; k++) {
          var r1 = allBtns[k].getBoundingClientRect();
          if (r1.width === 0 || r1.height === 0) continue;
          var t1 = (allBtns[k].textContent || '').trim();
          if (t1 === targetText || t1 === DURATION + '秒') {
            realisticClickDur(allBtns[k]);
            clicked = true;
            console.log('[doubao-auto] 已选择时长(全局):', targetText);
            break;
          }
        }
      }

      if (!clicked) {
        console.warn('[doubao-auto] 下拉菜单中未找到时长选项:', targetText);
        try { document.body.click(); } catch (e) {}
      }
      callback();
    }, 1000);
  }

  // ===== 2. 选择比例（豆包下拉菜单式）=====
  // 豆包比例+时长合并在一个按钮里（如"自动 · 10s"），点击后弹出下拉选项
  // Radix UI 组件不响应 .click()，需要 pointerdown + pointerup 事件序列
  function selectRatio(callback) {
    if (!RATIO) { callback(); return; }
    // 'auto' → '自动'（豆包网页显示中文）
    if (RATIO === 'auto') RATIO = '自动';

    // 真实点击（pointer 事件序列，适配 Radix UI）
    function realisticClick(el) {
      var rect = el.getBoundingClientRect();
      var x = rect.left + rect.width / 2;
      var y = rect.top + rect.height / 2;
      var opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
      try {
        el.dispatchEvent(new PointerEvent('pointerdown', Object.assign({}, opts, { pointerId: 1, pointerType: 'mouse', isPrimary: true })));
        el.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, opts, { pointerId: 1, pointerType: 'mouse', isPrimary: true })));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
      } catch (e) {
        console.warn('[doubao-auto] pointer event 失败，回退 click():', e);
        el.click();
      }
    }

    // 查找比例按钮
    // 策略1：匹配 "自动 · 10s" / "9:16 · 5s" 等格式（旧 UI，比例+时长合并按钮）
    // 策略2：匹配包含已知比例值的独立按钮（新 UI，如按钮文本就是"自动"或"9:16"）
    var knownRatios = ['自动', '16:9', '9:16', '4:3', '3:4', '1:1', '21:9'];
    var btns = document.querySelectorAll('button, [role="button"], [role="combobox"]');
    var ratioBtn = null;
    for (var i = 0; i < btns.length; i++) {
      var el = btns[i];
      var rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      var txt = (el.textContent || '').trim().replace(/\\s+/g, ' ');
      if (txt.length > 30) continue;

      // 策略1：匹配 "xxx · Ns" 格式
      var isOldFormat = /·\\s*\\d+s/.test(txt);
      // 策略2：文本恰好是已知比例值，或包含已知比例值且长度 < 15
      var isNewFormat = false;
      for (var ri = 0; ri < knownRatios.length; ri++) {
        if (txt === knownRatios[ri] || (txt.indexOf(knownRatios[ri]) !== -1 && txt.length < 15)) {
          isNewFormat = true;
          break;
        }
      }

      if (isOldFormat || isNewFormat) {
        ratioBtn = el;
        // 如果当前比例已匹配目标，跳过
        if (txt.indexOf(RATIO) !== -1) {
          console.log('[doubao-auto] 比例已是', RATIO, '，跳过（按钮文本:', txt, '）');
          callback();
          return;
        }
        break;
      }
    }
    if (!ratioBtn) {
      console.warn('[doubao-auto] 未找到比例选择按钮（旧/新 UI 均未命中）');
      callback();
      return;
    }
    // 点击打开下拉菜单（使用 pointer 事件序列）
    realisticClick(ratioBtn);
    var wasExpanded = ratioBtn.getAttribute('aria-expanded');
    console.log('[doubao-auto] 已点击比例按钮，aria-expanded=' + wasExpanded + '，等待下拉菜单...');

    // 等 1s 让下拉菜单渲染
    setTimeout(function() {
      // 检查下拉是否打开
      var isExpanded = ratioBtn.getAttribute('aria-expanded') === 'true' ||
                       ratioBtn.getAttribute('data-state') === 'open';
      if (!isExpanded) {
        console.warn('[doubao-auto] 下拉未打开(aria-expanded!=' + ratioBtn.getAttribute('aria-expanded') + ')，重试...');
        realisticClick(ratioBtn);
      }

      var clicked = false;

      // 策略1：在下拉菜单 [role="menu"] 内找 button，精确匹配比例文本
      var menuBtns = document.querySelectorAll('[role="menu"] button, [role="listbox"] button, [role="dialog"] button');
      for (var j = 0; j < menuBtns.length; j++) {
        var optRect = menuBtns[j].getBoundingClientRect();
        if (optRect.width === 0 || optRect.height === 0) continue;
        var optText = (menuBtns[j].textContent || '').trim().replace(/\\s+/g, ' ');
        if (optText === RATIO) {
          realisticClick(menuBtns[j]);
          clicked = true;
          console.log('[doubao-auto] 已选择比例(菜单内精确匹配):', RATIO);
          break;
        }
      }

      // 策略2：全局所有可见 button，精确匹配
      if (!clicked) {
        var allBtns = document.querySelectorAll('button');
        for (var k = 0; k < allBtns.length; k++) {
          var r1 = allBtns[k].getBoundingClientRect();
          if (r1.width === 0 || r1.height === 0) continue;
          var t1 = (allBtns[k].textContent || '').trim();
          if (t1 === RATIO) {
            realisticClick(allBtns[k]);
            clicked = true;
            console.log('[doubao-auto] 已选择比例(全局精确匹配):', RATIO);
            break;
          }
        }
      }

      // 策略3：模糊匹配（文本包含比例且长度 < 10）
      if (!clicked) {
        var allBtns2 = document.querySelectorAll('button');
        for (var m = 0; m < allBtns2.length; m++) {
          var r2 = allBtns2[m].getBoundingClientRect();
          if (r2.width === 0 || r2.height === 0) continue;
          var t2 = (allBtns2[m].textContent || '').trim();
          if (t2.indexOf(RATIO) !== -1 && t2.length < 10) {
            realisticClick(allBtns2[m]);
            clicked = true;
            console.log('[doubao-auto] 已选择比例(模糊匹配):', RATIO, '| text:', t2);
            break;
          }
        }
      }

      if (!clicked) {
        console.warn('[doubao-auto] 下拉菜单中未找到比例选项:', RATIO);
        // 关闭下拉菜单（点击别处）
        try { document.body.click(); } catch (e) {}
      }
      callback();
    }, 1000);
  }

  // ===== 主流程：先切模式 + 选模型 + 选时长 + 选比例，再填词上传发送 =====
  report('filling', false, '切换视频模式...');
  var inVideoMode = switchToVideoMode();
  if (!inVideoMode) {
    report('error', false, '未找到视频生成模式按钮，请手动切换到视频模式后重试');
    return;
  }
  // 切模式后等 UI 刷新（视频模式 UI 加载需要较长时间，2500ms 确保 DOM 渲染完成）
  setTimeout(function() {
    // 先选模型（切模型可能重置时长/比例），再选时长，再选比例
    selectModel(function() {
      setTimeout(function() {
        selectDuration(function() {
          setTimeout(function() {
            selectRatio(function() {
              // 选完比例后等 UI 刷新，再填词
              setTimeout(fillPrompt, 500);
            });
          }, 600);
        });
      }, 600);
    });
  }, 2500);

  // ===== 3. 填写提示词 =====
  function fillPrompt() {
    report('filling', false, '填写提示词...');
    var promptEl = __doubaoQuerySelector(PROMPT_SELECTORS);
    if (!promptEl) {
      report('error', false, '未找到提示词输入框（选择器均未命中）');
      return;
    }

    try {
      promptEl.focus();
      var tagName = (promptEl.tagName || '').toUpperCase();
      if (tagName === 'TEXTAREA' || tagName === 'INPUT') {
        // React 受控组件：需用原生 setter触发 input 事件
        var proto = tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        var setter = Object.getOwnPropertyDescriptor(proto, 'value');
        if (setter && setter.set) setter.set.call(promptEl, PROMPT);
        else promptEl.value = PROMPT;
        promptEl.dispatchEvent(new Event('input', { bubbles: true }));
        promptEl.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        // contenteditable div：先清空再写入
        promptEl.innerText = '';
        try {
          document.execCommand('insertText', false, PROMPT);
        } catch (e) {
          promptEl.innerText = PROMPT;
        }
        promptEl.dispatchEvent(new InputEvent('input', { bubbles: true, data: PROMPT, inputType: 'insertText' }));
      }
    } catch (e) {
      report('error', false, '填写提示词失败: ' + (e && e.message ? e.message : String(e)));
      return;
    }

    // 校验填入是否成功
    var filledText = (promptEl.tagName && (promptEl.tagName.toUpperCase() === 'TEXTAREA' || promptEl.tagName.toUpperCase() === 'INPUT'))
      ? promptEl.value : promptEl.innerText;
    if (!filledText || filledText.indexOf(PROMPT.substring(0, 20)) === -1) {
      console.warn('[doubao-auto] 提示词填入校验未通过，继续尝试');
    }

    // ===== 4. 上传图片 =====
    if (IMAGES && IMAGES.length > 0) {
      report('uploading', false, '上传图片...');
      var files = [];
      for (var j = 0; j < IMAGES.length; j++) {
        var f = base64ToFile(IMAGES[j], 'ref_' + j + '.png');
        if (f) files.push(f);
      }
      if (files.length === 0) {
        report('error', false, '图片 base64 转 File 失败');
        return;
      }
      var uploaded = uploadViaDataTransfer(files);
      if (!uploaded) {
        uploaded = uploadViaPaste(files, promptEl);
      }
      if (!uploaded) {
        report('error', false, '图片上传失败（DataTransfer 与 paste 均无效），该账号可能不支持自动上传');
        return;
      }
      setTimeout(function() {
        report('waiting_manual_send', true, '提示词已填写，图片已上传，请在浏览器中手动点击发送按钮');
      }, 1500);
    } else {
      setTimeout(function() {
        report('waiting_manual_send', true, '提示词已填写，请在浏览器中手动点击发送按钮');
      }, 500);
    }
  }

  // ===== 5. 点击发送 =====
  // 豆包发送按钮是 SVG 图标（class 含 send-msg-btn-text），只在有提示词时才显示
  // 策略：先等发送按钮出现（轮询 500ms 一次，最多 5s），找到后点击
  function submit() {
    try {
      report('submitting', false, '查找发送按钮...');
      var attempts = 0;
      var maxAttempts = 10; // 10 × 500ms = 5s

      function tryFindAndClick() {
        attempts++;
        var sendBtn = null;

        // 策略1：CSS 选择器（含 SVG 图标）
        sendBtn = __doubaoQuerySelector(SEND_SELECTORS);

        // 策略2：按 class 查找 SVG 发送图标，向上找父级 button
        if (!sendBtn) {
          var sendIcon = document.querySelector('svg[class*="send-msg-btn"], [class*="send-msg-btn"]');
          if (sendIcon) {
            // SVG 本身不是按钮，向上找可点击的父级
            sendBtn = sendIcon.closest('button, [role="button"]');
            if (!sendBtn) sendBtn = sendIcon; // 实在没有父级就点 SVG 本身
            console.log('[doubao-auto] 通过 send-msg-btn class 找到发送按钮');
          }
        }

        // 策略3：按文本"发送"查找
        if (!sendBtn) {
          var btns = document.querySelectorAll('button, [role="button"]');
          for (var k = 0; k < btns.length; k++) {
            var rect = btns[k].getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            var txt = (btns[k].textContent || '').trim().replace(/\\s+/g, ' ');
            if (txt === '发送' || /send/i.test(txt)) {
              sendBtn = btns[k];
              break;
            }
          }
        }

        if (sendBtn) {
          // 检查是否禁用（disabled 或 aria-disabled）
          var isDisabled = sendBtn.disabled ||
            sendBtn.getAttribute('aria-disabled') === 'true' ||
            sendBtn.getAttribute('disabled') !== null;
          if (isDisabled && attempts < maxAttempts) {
            console.log('[doubao-auto] 发送按钮存在但被禁用，等待 ' + (attempts * 500) + 'ms...');
            setTimeout(tryFindAndClick, 500);
            return;
          }
          // 点击发送（使用 pointer 事件序列，适配 React/Radix 组件）
          var sRect = sendBtn.getBoundingClientRect();
          var sx = sRect.left + sRect.width / 2;
          var sy = sRect.top + sRect.height / 2;
          var sOpts = { bubbles: true, cancelable: true, clientX: sx, clientY: sy, view: window };
          try {
            sendBtn.dispatchEvent(new PointerEvent('pointerdown', Object.assign({}, sOpts, { pointerId: 1, pointerType: 'mouse', isPrimary: true })));
            sendBtn.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, sOpts, { pointerId: 1, pointerType: 'mouse', isPrimary: true })));
            sendBtn.dispatchEvent(new MouseEvent('mousedown', sOpts));
            sendBtn.dispatchEvent(new MouseEvent('mouseup', sOpts));
            sendBtn.dispatchEvent(new MouseEvent('click', sOpts));
          } catch (e) {
            sendBtn.click();
          }
          var now = Date.now();
          window.__DOUBAO_AUTO_STATUS__ = {
            phase: 'submitted',
            ok: true,
            msg: '已提交生成请求，等待豆包生成视频',
            submittedAt: now,
        token: TOKEN
          };
          report('submitted', true, '已提交生成请求，等待豆包生成视频');
          return;
        }

        // 未找到发送按钮，继续轮询
        if (attempts < maxAttempts) {
          console.log('[doubao-auto] 发送按钮未出现，重试 ' + attempts + '/' + maxAttempts);
          setTimeout(tryFindAndClick, 500);
        } else {
          report('error', false, '未找到发送按钮（已等待 5s，可能提示词未填入或豆包页面结构变化）');
        }
      }

      // 首次尝试
      tryFindAndClick();
    } catch (e) {
      report('error', false, '点击发送失败: ' + (e && e.message ? e.message : String(e)));
    }
  }
})();
`
}

/**
 * 探测比例下拉菜单脚本
 *
 * 流程：
 * 1. 确保在视频模式（检测模型/比例按钮，没有就点"视频生成"）
 * 2. 找到并点击比例按钮（文本匹配 "· Ns" 模式，如"自动 · 10s"）
 * 3. 等 1s 让下拉菜单渲染
 * 4. 扫描页面上所有可见元素，重点报告：
 *    - Radix popper/portal 容器内的元素
 *    - 所有可见且文本 < 30 字的元素（可能是下拉选项）
 *    - 带有 role 属性的元素
 * 5. 通过 IPC 回传结果
 *
 * 用于：自动化脚本找不到比例选项时，查看下拉菜单实际 DOM 结构
 */
export function buildDropdownProbeScript(): string {
  return `
(function() {
  'use strict';

  function trim(s, n) {
    s = String(s || '').trim().replace(/\\s+/g, ' ');
    return s.length > n ? s.substring(0, n) + '...' : s;
  }

  function report(msg) {
    window.__DOUBAO_AUTO_STATUS__ = {
      phase: 'probe',
      ok: true,
      msg: msg,
      submittedAt: null,
      token: 'dropdown-probe'
    };
    if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
      try {
        window.__TAURI_INTERNALS__.invoke('report_doubao_auto_status', {
          accountId: window.__EMBEDDED_ACCOUNT_ID__ || 'unknown',
          status: window.__DOUBAO_AUTO_STATUS__
        });
      } catch (e) { console.error('[dropdown-probe] IPC 失败:', e); }
    }
  }

  // ===== 1. 确保在视频模式 =====
  function ensureVideoMode() {
    var btns = document.querySelectorAll('button, [role="button"]');
    for (var i = 0; i < btns.length; i++) {
      var rect = btns[i].getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      var t = (btns[i].textContent || '').trim().replace(/\\s+/g, ' ');
      if ((t.indexOf('模型') === 0 && t.length < 40) || /·\\s*\\d+s/.test(t)) {
        return true; // 已在视频模式
      }
    }
    // 不在视频模式，点"视频生成"
    for (var j = 0; j < btns.length; j++) {
      var txt = (btns[j].textContent || '').trim();
      if (txt === '视频生成') {
        btns[j].click();
        console.log('[dropdown-probe] 已点击视频生成');
        return false;
      }
    }
    return false;
  }

  // ===== 2. 找到并点击比例按钮 =====
  // Radix UI 组件不响应 .click()，需要 pointerdown + pointerup 事件序列
  function realisticClick(el) {
    var rect = el.getBoundingClientRect();
    var x = rect.left + rect.width / 2;
    var y = rect.top + rect.height / 2;
    var commonOpts = {
      bubbles: true, cancelable: true,
      clientX: x, clientY: y,
      view: window
    };
    try {
      // Pointer 事件（Radix UI 监听 pointerdown）
      el.dispatchEvent(new PointerEvent('pointerdown', Object.assign({}, commonOpts, {
        pointerId: 1, pointerType: 'mouse', isPrimary: true
      })));
      el.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, commonOpts, {
        pointerId: 1, pointerType: 'mouse', isPrimary: true
      })));
      // Mouse 事件
      el.dispatchEvent(new MouseEvent('mousedown', commonOpts));
      el.dispatchEvent(new MouseEvent('mouseup', commonOpts));
      el.dispatchEvent(new MouseEvent('click', commonOpts));
    } catch (e) {
      console.warn('[dropdown-probe] pointer event 失败，回退 click():', e);
      el.click();
    }
  }

  function findAndClickRatioButton() {
    var btns = document.querySelectorAll('button, [role="button"]');
    for (var i = 0; i < btns.length; i++) {
      var rect = btns[i].getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      var txt = (btns[i].textContent || '').trim().replace(/\\s+/g, ' ');
      if (/·\\s*\\d+s/.test(txt) && txt.length < 30) {
        var wasExpanded = btns[i].getAttribute('aria-expanded');
        realisticClick(btns[i]);
        console.log('[dropdown-probe] 已点击比例按钮:', txt, '| aria-expanded:', wasExpanded, '->', btns[i].getAttribute('aria-expanded'));
        return txt;
      }
    }
    return null;
  }

  // ===== 3. 扫描下拉菜单 =====
  function scanDropdown() {
    var lines = [];
    lines.push('=== 比例下拉菜单探测结果 ===');
    lines.push('URL: ' + location.href);
    lines.push('');

    // 先检查比例按钮的 aria-expanded 状态（确认下拉是否打开）
    var ratioBtn = null;
    var allBtns = document.querySelectorAll('button, [role="button"]');
    for (var bi = 0; bi < allBtns.length; bi++) {
      var bt = (allBtns[bi].textContent || '').trim().replace(/\\s+/g, ' ');
      if (/·\\s*\\d+s/.test(bt) && bt.length < 30) {
        ratioBtn = allBtns[bi];
        break;
      }
    }
    if (ratioBtn) {
      var expanded = ratioBtn.getAttribute('aria-expanded');
      var dataState = ratioBtn.getAttribute('data-state');
      lines.push('比例按钮状态: aria-expanded=' + expanded + ' data-state=' + dataState);
      if (expanded !== 'true' && dataState !== 'open') {
        lines.push('⚠️ 下拉菜单可能未打开！尝试再次点击...');
        // 再次尝试点击
        realisticClick(ratioBtn);
      }
      lines.push('');
    }

    // 策略A：找 Radix popper / portal / overlay / select-content 容器
    var containers = document.querySelectorAll(
      '[data-radix-popper-content-wrapper], [data-radix-popper-content], [data-radix-select-content], [data-radix-collection-item], [role="listbox"], [role="menu"], [role="dialog"], [data-state="open"], [class*="popover"], [class*="dropdown"], [class*="portal"], [class*="overlay"], [class*="popup"], [class*="content-wrapper"], [class*="select-content"]'
    );
    lines.push('--- 策略A: popper/portal/select 容器 (' + containers.length + ' 个) ---');
    for (var i = 0; i < containers.length; i++) {
      var rect = containers[i].getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      var tagName = containers[i].tagName.toLowerCase();
      var cls = trim(containers[i].className && containers[i].className.toString ? containers[i].className.toString() : '', 80);
      var role = containers[i].getAttribute('role') || '';
      var dataState2 = containers[i].getAttribute('data-state') || '';
      lines.push('<' + tagName + '> role="' + role + '" data-state="' + dataState2 + '" class="' + cls + '" pos: ' + Math.round(rect.left) + ',' + Math.round(rect.top) + ' ' + Math.round(rect.width) + 'x' + Math.round(rect.height));
      // 列出容器内的子元素
      var children = containers[i].querySelectorAll('*');
      var childCount = 0;
      for (var j = 0; j < children.length && childCount < 30; j++) {
        var cRect = children[j].getBoundingClientRect();
        if (cRect.width === 0 || cRect.height === 0) continue;
        var cTxt = trim(children[j].textContent, 40);
        if (!cTxt) continue;
        var cTag = children[j].tagName.toLowerCase();
        var cCls = trim(children[j].className && children[j].className.toString ? children[j].className.toString() : '', 60);
        var cRole = children[j].getAttribute('role') || '';
        var cTestId = children[j].getAttribute('data-testid') || '';
        var cDataVal = children[j].getAttribute('data-value') || children[j].getAttribute('data-radix-value') || '';
        lines.push('  <' + cTag + '> "' + cTxt + '" role="' + cRole + '" testid="' + cTestId + '" data-val="' + cDataVal + '" class="' + cCls + '"');
        childCount++;
      }
      lines.push('');
    }

    // 策略B：找所有可见且文本短的元素（可能是下拉选项）
    var shortTextEls = [];
    var allEls = document.querySelectorAll('button, [role="button"], [role="option"], [role="menuitem"], [role="menuitemradio"], [role="radio"], a, li, div, span');
    var seen = new Set();
    for (var k = 0; k < allEls.length; k++) {
      var el = allEls[k];
      var eRect = el.getBoundingClientRect();
      if (eRect.width === 0 || eRect.height === 0) continue;
      var eTxt = trim(el.textContent, 30);
      if (!eTxt || eTxt.length > 25) continue;
      // 过滤：只保留可能和比例/时长相关的
      if (!/[:\\d]|自动|竖屏|横屏|方屏|比例|尺寸|秒|s$/.test(eTxt)) continue;
      var key = el.tagName + '|' + eTxt;
      if (seen.has(key)) continue;
      seen.add(key);
      shortTextEls.push({
        tag: el.tagName.toLowerCase(),
        text: eTxt,
        cls: trim(el.className && el.className.toString ? el.className.toString() : '', 60),
        role: el.getAttribute('role') || '',
        pos: Math.round(eRect.left) + ',' + Math.round(eRect.top) + ' ' + Math.round(eRect.width) + 'x' + Math.round(eRect.height)
      });
    }
    lines.push('--- 策略B: 可见的比例/时长相关文本元素 (' + shortTextEls.length + ' 个) ---');
    for (var m = 0; m < shortTextEls.length; m++) {
      var e = shortTextEls[m];
      lines.push('<' + e.tag + '> "' + e.text + '" role="' + e.role + '" class="' + e.cls + '" pos: ' + e.pos);
    }

    // 策略C：找所有新出现的固定/绝对定位元素（下拉菜单通常是 fixed/absolute）
    lines.push('');
    lines.push('--- 策略C: fixed/absolute 定位元素（可能是下拉菜单）---');
    var fixedEls = document.querySelectorAll('*');
    var fixedCount = 0;
    for (var n = 0; n < fixedEls.length && fixedCount < 20; n++) {
      var fEl = fixedEls[n];
      var style = window.getComputedStyle(fEl);
      if (style.position !== 'fixed' && style.position !== 'absolute') continue;
      var fRect = fEl.getBoundingClientRect();
      if (fRect.width < 50 || fRect.height < 30) continue;
      var fTxt = trim(fEl.textContent, 50);
      if (!fTxt) continue;
      var fTag = fEl.tagName.toLowerCase();
      var fCls = trim(fEl.className && fEl.className.toString ? fEl.className.toString() : '', 80);
      var fZ = style.zIndex;
      lines.push('<' + fTag + '> z=' + fZ + ' pos=' + style.position + ' "' + fTxt + '" class="' + fCls + '" at ' + Math.round(fRect.left) + ',' + Math.round(fRect.top) + ' ' + Math.round(fRect.width) + 'x' + Math.round(fRect.height));
      // 列出子元素
      var fChildren = fEl.querySelectorAll('button, [role="option"], [role="menuitem"], [role="menuitemradio"], div, span, li');
      for (var p = 0; p < fChildren.length && p < 15; p++) {
        var fcTxt = trim(fChildren[p].textContent, 30);
        if (!fcTxt) continue;
        var fcTag = fChildren[p].tagName.toLowerCase();
        var fcRole = fChildren[p].getAttribute('role') || '';
        var fcDataVal = fChildren[p].getAttribute('data-value') || fChildren[p].getAttribute('data-radix-value') || '';
        lines.push('  <' + fcTag + '> "' + fcTxt + '" role="' + fcRole + '" data-val="' + fcDataVal + '"');
      }
      fixedCount++;
    }

    var summary = lines.join('\\n');
    if (summary.length > 8000) summary = summary.substring(0, 8000) + '\\n... (已截断)';
    report(summary);
    console.log('[dropdown-probe] 探测完成');
  }

  // ===== 主流程 =====
  var inVideoMode = ensureVideoMode();
  var delay = inVideoMode ? 500 : 2500; // 不在视频模式就等久一点

  setTimeout(function() {
    var ratioBtnText = findAndClickRatioButton();
    if (!ratioBtnText) {
      report('未找到比例按钮（文本模式 "· Ns" 未命中）。可能不在视频模式，或页面结构已变化。');
      return;
    }
    // 等 1.5s 让下拉菜单渲染
    setTimeout(function() {
      scanDropdown();
      // 如果检测到未打开并重新点击了，再等 1.5s 扫描一次
      setTimeout(scanDropdown, 1500);
    }, 1500);
  }, delay);
})();
`
}
export function buildPollStatusScript(): string {
  return `
(function() {
  'use strict';
  var status = window.__DOUBAO_AUTO_STATUS__ || { phase: 'idle', ok: false, msg: '尚未注入自动化脚本' };
  if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
    try {
      window.__TAURI_INTERNALS__.invoke('report_doubao_auto_status', {
        accountId: window.__EMBEDDED_ACCOUNT_ID__ || 'unknown',
        status: status
      });
    } catch (e) {}
  }
})();
`
}

/**
 * 错误检测脚本
 *
 * 扫描豆包聊天区最近的回复文本，检测是否包含错误信息。
 * 用于：提交后豆包返回错误（如"肖像保护"、"内容违规"），不等超时直接报错。
 *
 * 检测到错误时通过 IPC 回传 { phase: 'error', msg: '错误上下文' }
 */
export function buildErrorCheckScript(): string {
  return `
(function() {
  'use strict';

  var ERROR_KEYWORDS = [
    '不支持上传真实人脸',
    '肖像保护',
    '暂不支持上传',
    '生成失败',
    '请稍后再试',
    '内容违规',
    '无法生成',
    '换张参考图',
    '文生视频',
    '审核未通过',
    '请重新',
    '违规内容',
    '不能生成',
    '图片不符合',
    '请修改',
    '不能处理'
  ];

  // 获取最近的聊天回复文本
  var main = document.querySelector('main');
  if (!main) return;

  // 只看最后 2000 个字符（最近的内容）
  var fullText = (main.textContent || '').replace(/\\s+/g, ' ');
  var recentText = fullText.substring(Math.max(0, fullText.length - 2000));

  // 检查错误关键词
  for (var i = 0; i < ERROR_KEYWORDS.length; i++) {
    var kw = ERROR_KEYWORDS[i];
    var idx = recentText.indexOf(kw);
    if (idx !== -1) {
      // 提取错误上下文（关键词前后 80 个字符）
      var start = Math.max(0, idx - 80);
      var end = Math.min(recentText.length, idx + kw.length + 80);
      var context = recentText.substring(start, end).trim();

      window.__DOUBAO_AUTO_STATUS__ = {
        phase: 'error',
        ok: false,
        msg: '豆包返回错误：' + context,
        submittedAt: null,
        token: 'error-check'
      };
      if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
        try {
          window.__TAURI_INTERNALS__.invoke('report_doubao_auto_status', {
            accountId: window.__EMBEDDED_ACCOUNT_ID__ || 'unknown',
            status: window.__DOUBAO_AUTO_STATUS__
          });
        } catch (e) {}
      }
      console.warn('[doubao-error-check] 检测到错误:', kw);
      return;
    }
  }
})();
`
}

/**
 * 构造清理脚本：清空 __EXTRACTED_MEDIA__ 缓冲并触发 clear 事件
 *
 * 在每次提交前调用，防止上条视频残留导致误匹配。
 */
export function buildClearScript(): string {
  return `
(function() {
  'use strict';
  // 调用 dewatermark 脚本暴露的清理接口（同时清空 seenVideoUrls 去重表 + __EXTRACTED_MEDIA__ 缓冲）
  // 防止旧视频 URL（带时效 token 变化后）被重复 emit，干扰新视频捕获
  if (typeof window.__clearDewatermarkState__ === 'function') {
    window.__clearDewatermarkState__();
  } else {
    window.__EXTRACTED_MEDIA__ = [];
  }
  if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
    try {
      window.__TAURI_INTERNALS__.invoke('report_extracted_media', {
        accountId: window.__EMBEDDED_ACCOUNT_ID__ || 'unknown',
        mediaType: 'clear',
        data: {}
      });
    } catch (e) {}
  }
  window.__DOUBAO_AUTO_STATUS__ = { phase: 'idle', ok: false, msg: '', submittedAt: null, token: '' };
})();
`
}

/**
 * 构造导航检测脚本：检查当前是否在豆包创作页
 * （通过 pollStatus 回传的状态中 msg 判断，无需单独命令）
 */
export function buildCheckPageScript(): string {
  return `
(function() {
  'use strict';
  var href = location.href;
  var onChat = /doubao\\.com\\/chat/i.test(href);
  var needsLogin = (/login|signin|passport|sso/i.test(href) && !onChat);
  window.__DOUBAO_AUTO_STATUS__ = {
    phase: onChat ? 'ready' : 'error',
    ok: onChat,
    msg: needsLogin ? '账号未登录' : (onChat ? '在创作页' : '不在创作页: ' + href),
    submittedAt: null,
    token: ''
  };
  if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
    try {
      window.__TAURI_INTERNALS__.invoke('report_doubao_auto_status', {
        accountId: window.__EMBEDDED_ACCOUNT_ID__ || 'unknown',
        status: window.__DOUBAO_AUTO_STATUS__
      });
    } catch (e) {}
  }
})();
`
}

/**
 * 探测页面结构脚本
 *
 * 扫描豆包页面所有可交互元素（button, [role=button], a, input, [contenteditable]），
 * 收集它们的文本/属性/类名，并标记是否匹配关键词（视频/比例/模型/发送等）。
 * 结果通过 IPC 回传（phase='probe'），前端展示供调试用。
 *
 * 用于：自动化脚本找不到按钮时，先用此工具查看页面实际 DOM 结构，
 *       再据此调整 selectors.ts 中的选择器。
 */
export function buildProbeScript(switchToVideoFirst?: boolean): string {
  const keywordsJson = JSON.stringify(PROBE_KEYWORDS)
  const videoModeTextJson = JSON.stringify(VIDEO_MODE_TEXT_KEYWORDS)
  const doSwitch = switchToVideoFirst ? 'true' : 'false'
  return `
(function() {
  'use strict';
  var KEYWORDS = ${keywordsJson};
  var VIDEO_MODE_TEXT = ${videoModeTextJson};
  var SWITCH_VIDEO = ${doSwitch};
  var results = [];
  var matchCount = 0;

  function trim(s, n) {
    s = String(s || '').trim().replace(/\\s+/g, ' ');
    return s.length > n ? s.substring(0, n) + '...' : s;
  }

  function describe(el, tag) {
    var rect = el.getBoundingClientRect();
    var txt = trim(el.textContent, 40);
    var aria = el.getAttribute('aria-label') || '';
    var testid = el.getAttribute('data-testid') || '';
    var title = el.getAttribute('title') || '';
    var id = el.id || '';
    var cls = trim(el.className && typeof el.className === 'string' ? el.className : '', 60);
    var label = txt || aria || title || testid;
    var matched = [];
    if (label) {
      var lower = label.toLowerCase();
      for (var i = 0; i < KEYWORDS.length; i++) {
        if (lower.indexOf(KEYWORDS[i].toLowerCase()) !== -1) {
          matched.push(KEYWORDS[i]);
        }
      }
    }
    return {
      tag: tag,
      text: txt,
      aria: aria,
      testid: testid,
      title: title,
      id: id,
      cls: cls,
      visible: rect.width > 0 && rect.height > 0,
      pos: Math.round(rect.left) + ',' + Math.round(rect.top) + ' ' + Math.round(rect.width) + 'x' + Math.round(rect.height),
      matched: matched
    };
  }

  // ===== 探测主逻辑（包装为函数，支持延迟调用）=====
  function runProbe(modeLabel) {
    // 扫描所有可交互元素
    var els = document.querySelectorAll('button, [role="button"], a[href], input, textarea, [contenteditable="true"], [class*="tab"], [class*="mode"], [class*="item"], [class*="option"], [class*="ratio"], [class*="size"], [class*="send"], [class*="submit"]');
    var seen = new Set();
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var key = el.tagName + '|' + (el.id || '') + '|' + trim(el.textContent, 20);
      if (seen.has(key)) continue;
      seen.add(key);
      var tag = el.tagName.toLowerCase();
      if (el.getAttribute('role') === 'button') tag = 'role=button';
      var info = describe(el, tag);
      if ((info.text || info.aria || info.testid) && (info.visible || info.matched.length > 0)) {
        results.push(info);
        if (info.matched.length > 0) matchCount++;
      }
    }

    // 按 matched 优先排序
    results.sort(function(a, b) {
      if (a.matched.length > 0 && b.matched.length === 0) return -1;
      if (a.matched.length === 0 && b.matched.length > 0) return 1;
      return 0;
    });

    // 构造可读摘要
    var lines = [];
    lines.push('=== 豆包页面探测结果' + (modeLabel ? '（' + modeLabel + '）' : '') + ' ===');
    lines.push('URL: ' + location.href);
    lines.push('共发现 ' + results.length + ' 个可交互元素，其中 ' + matchCount + ' 个匹配关键词');
    lines.push('');
    lines.push('--- 匹配关键词的元素 ---');
    for (var j = 0; j < results.length; j++) {
      var r = results[j];
      if (r.matched.length === 0) break;
      lines.push('[' + r.matched.join('/') + '] <' + r.tag + '> ' + (r.text || r.aria || r.testid));
      if (r.testid) lines.push('  data-testid: ' + r.testid);
      if (r.aria) lines.push('  aria-label: ' + r.aria);
      if (r.cls) lines.push('  class: ' + r.cls);
      if (r.id) lines.push('  id: ' + r.id);
      lines.push('  pos: ' + r.pos + (r.visible ? ' (可见)' : ' (隐藏)'));
      lines.push('');
    }

    // 输出 input/textarea 详情
    var inputs = results.filter(function(r) { return r.tag === 'input' || r.tag === 'textarea'; });
    if (inputs.length > 0) {
      lines.push('--- 输入框 ---');
      for (var k = 0; k < inputs.length; k++) {
        lines.push('<' + inputs[k].tag + '> ' + (inputs[k].aria || inputs[k].cls || inputs[k].id));
        lines.push('  class: ' + inputs[k].cls);
        lines.push('');
      }
    }

    // 输出所有可见的 button/role=button（不限关键词，帮找发送按钮等图标按钮）
    var allBtns = results.filter(function(r) {
      return (r.tag === 'button' || r.tag === 'role=button') && r.visible && r.matched.length === 0;
    });
    if (allBtns.length > 0) {
      lines.push('--- 其他可见按钮（可能含发送/上传等图标按钮）---');
      for (var m = 0; m < allBtns.length; m++) {
        lines.push('<' + allBtns[m].tag + '> ' + (allBtns[m].text || allBtns[m].aria || '(无文本)') +
          ' | class: ' + allBtns[m].cls +
          ' | testid: ' + (allBtns[m].testid || '-') +
          ' | pos: ' + allBtns[m].pos);
      }
      lines.push('');
    }

    var summary = lines.join('\\n');
    if (summary.length > 8000) summary = summary.substring(0, 8000) + '\\n... (已截断)';

    window.__DOUBAO_PROBE_RESULT__ = results;
    window.__DOUBAO_AUTO_STATUS__ = {
      phase: 'probe',
      ok: true,
      msg: summary,
      submittedAt: null,
      token: 'probe'
    };
    if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
      try {
        window.__TAURI_INTERNALS__.invoke('report_doubao_auto_status', {
          accountId: window.__EMBEDDED_ACCOUNT_ID__ || 'unknown',
          status: window.__DOUBAO_AUTO_STATUS__
        });
      } catch (e) {
        console.error('[doubao-probe] IPC 回传失败:', e);
      }
    }
    console.log('[doubao-probe] 探测完成（' + (modeLabel || '默认') + '），共 ' + results.length + ' 个元素，' + matchCount + ' 个匹配关键词');
  }

  // ===== 按文本查找并点击「视频生成」按钮 =====
  function clickVideoModeButton() {
    var btns = document.querySelectorAll('button, [role="button"]');
    for (var i = 0; i < btns.length; i++) {
      var el = btns[i];
      var rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      var txt = (el.textContent || '').trim().replace(/\\s+/g, ' ');
      // 精确匹配 "视频生成"
      if (txt === '视频生成') {
        el.click();
        console.log('[doubao-probe] 已点击视频生成按钮');
        return true;
      }
    }
    // 模糊匹配
    for (var j = 0; j < btns.length; j++) {
      var el2 = btns[j];
      var rect2 = el2.getBoundingClientRect();
      if (rect2.width === 0 || rect2.height === 0) continue;
      var txt2 = (el2.textContent || '').trim();
      for (var k = 0; k < VIDEO_MODE_TEXT.length; k++) {
        if (txt2.indexOf(VIDEO_MODE_TEXT[k]) !== -1 && txt2.length < 20) {
          el2.click();
          console.log('[doubao-probe] 已点击视频模式按钮(模糊):', txt2);
          return true;
        }
      }
    }
    return false;
  }

  // ===== 执行探测 =====
  if (SWITCH_VIDEO) {
    var clicked = clickVideoModeButton();
    if (clicked) {
      // 等 2.5s 让视频模式 UI 加载
      setTimeout(function() { runProbe('视频生成模式'); }, 2500);
    } else {
      runProbe('未找到视频生成按钮');
    }
  } else {
    runProbe('');
  }
})();
`
}
