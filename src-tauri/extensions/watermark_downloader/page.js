(function () {
  'use strict';

  const TARGET_DURATION = 15;
  const TARGET_MODEL = 'seedance_v2.0';
  const STORAGE_KEY = 'codex_doubao_video_duration_choice';
  const MARK = 'data-codex-doubao-cn-15s';
  const STYLE_ID = 'codex-doubao-cn-15s-style';
  let timer = 0;

  // ========== 激活码功能已禁用 ==========
  // let isActivated = false;
  // let pendingActivationCallback = null;
  //
  // window.addEventListener('message', (event) => {
  //   const data = event.data;
  //   if (data && data.type === 'DOUBAO_15S_ACTIVATION_RESULT') {
  //     console.log('[15s] 收到激活状态:', data.activated);
  //     isActivated = data.activated === true;
  //     if (pendingActivationCallback) {
  //       pendingActivationCallback(isActivated);
  //       pendingActivationCallback = null;
  //     }
  //   }
  //   if (data && data.type === 'DOUBAO_15S_ACTIVATE_SUCCESS') {
  //     console.log('[15s] 激活成功，刷新页面');
  //     showToast15s('激活成功！正在刷新页面...', 'success');
  //     setTimeout(() => location.reload(), 1000);
  //   }
  // });
  //
  // function requestActivationStatus() {
  //   return new Promise((resolve) => {
  //     pendingActivationCallback = resolve;
  //     window.postMessage({ type: 'DOUBAO_15S_CHECK_ACTIVATION' }, '*');
  //     setTimeout(() => {
  //       if (pendingActivationCallback) {
  //         pendingActivationCallback = null;
  //         console.log('[15s] 请求激活状态超时');
  //         resolve(false);
  //       }
  //     }, 3000);
  //   });
  // }
  //
  // function requestActivation(cardKey) {
  //   return new Promise((resolve) => {
  //     window.postMessage({ type: 'DOUBAO_15S_ACTIVATE', cardKey: cardKey }, '*');
  //     const handler = (event) => {
  //       const data = event.data;
  //       if (data && data.type === 'DOUBAO_15S_ACTIVATE_RESULT') {
  //         window.removeEventListener('message', handler);
  //         resolve(data);
  //       }
  //     };
  //     window.addEventListener('message', handler);
  //     setTimeout(() => {
  //       window.removeEventListener('message', handler);
  //       resolve({ success: false, message: '请求超时' });
  //     }, 10000);
  //   });
  // }
  //
  // function showActivationModalFor15s() {
  //   const existingModal = document.getElementById("doubao-activation-modal-15s");
  //   if (existingModal) existingModal.remove();
  //   const overlay = document.createElement("div");
  //   overlay.id = "doubao-activation-modal-15s";
  //   overlay.style.cssText = `
  //     position: fixed;
  //     top: 0; left: 0; width: 100%; height: 100%;
  //     background: rgba(0,0,0,0.7); z-index: 100000;
  //     display: flex; align-items: center; justify-content: center;
  //     font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  //   `;
  //   const modalDiv = document.createElement("div");
  //   modalDiv.style.cssText = `
  //     background: white; border-radius: 16px; padding: 24px;
  //     width: 320px; max-width: 90%;
  //     box-shadow: 0 20px 60px rgba(0,0,0,0.3); text-align: center;
  //   `;
  //   modalDiv.innerHTML = `
  //     <div style="font-size: 48px; margin-bottom: 16px;">🔑</div>
  //     <h3 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 600; color: #1f2937;">需要激活</h3>
  //     <p style="margin: 0 0 16px 0; font-size: 14px; color: #6b7280;">请先激活扩展，激活后即可使用15秒视频生成功能</p>
  //     <input type="text" id="activation-card-input-15s" placeholder="请输入激活码" style="
  //       width: 100%; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px;
  //       font-size: 14px; margin-bottom: 16px; box-sizing: border-box; outline: none;
  //     ">
  //     <div id="activation-error-msg-15s" style="color: #ef4444; font-size: 12px; margin-bottom: 12px; display: none;"></div>
  //     <button id="activation-submit-btn-15s" style="
  //       width: 100%; padding: 12px; background: #2563eb; color: white; border: none;
  //       border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.2s;
  //     ">立即激活</button>
  //     <button id="activation-close-btn-15s" style="
  //       width: 100%; margin-top: 12px; padding: 10px; background: transparent;
  //       color: #9ca3af; border: none; border-radius: 8px; font-size: 13px; cursor: pointer;
  //     ">稍后激活</button>
  //   `;
  //   overlay.appendChild(modalDiv);
  //   document.body.appendChild(overlay);
  //   const cardInput = modalDiv.querySelector("#activation-card-input-15s");
  //   const submitBtn = modalDiv.querySelector("#activation-submit-btn-15s");
  //   const closeBtn = modalDiv.querySelector("#activation-close-btn-15s");
  //   const errorMsg = modalDiv.querySelector("#activation-error-msg-15s");
  //   cardInput.focus();
  //   submitBtn.addEventListener("click", async () => {
  //     const cardKey = cardInput.value.trim();
  //     if (!cardKey) { errorMsg.textContent = "请输入激活码"; errorMsg.style.display = "block"; return; }
  //     submitBtn.disabled = true; submitBtn.textContent = "验证中..."; errorMsg.style.display = "none";
  //     const result = await requestActivation(cardKey);
  //     if (result && result.success) {
  //       overlay.remove();
  //       showToast15s("激活成功！正在刷新页面...", "success");
  //       setTimeout(() => { location.reload(); }, 1000);
  //     } else {
  //       errorMsg.textContent = result?.message || "激活失败，请检查激活码";
  //       errorMsg.style.display = "block";
  //       submitBtn.disabled = false; submitBtn.textContent = "立即激活";
  //     }
  //   });
  //   closeBtn.addEventListener("click", () => { overlay.remove(); });
  //   overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  //   cardInput.addEventListener("keypress", (e) => { if (e.key === "Enter") submitBtn.click(); });
  // }
  //
  // function showToast15s(message, type = "error") {
  //   const toast = document.createElement("div");
  //   toast.style.cssText = `
  //     position: fixed; bottom: 20px; right: 20px;
  //     background: ${type === "success" ? "#10b981" : "#ef4444"};
  //     color: white; padding: 10px 16px; border-radius: 8px; font-size: 13px;
  //     z-index: 100001; font-family: system-ui;
  //     box-shadow: 0 4px 12px rgba(0,0,0,0.15); animation: fadeInOut 2.5s ease forwards;
  //   `;
  //   toast.textContent = type === "success" ? "✓ " + message : "⚠️ " + message;
  //   document.body.appendChild(toast);
  //   const style = document.createElement("style");
  //   style.textContent = `
  //     @keyframes fadeInOut {
  //       0% { opacity: 0; transform: translateY(10px); }
  //       15% { opacity: 1; transform: translateY(0); }
  //       85% { opacity: 1; transform: translateY(0); }
  //       100% { opacity: 0; transform: translateY(10px); visibility: hidden; }
  //     }
  //   `;
  //   document.head.appendChild(style);
  //   setTimeout(() => { if (toast.parentNode) toast.remove(); }, 2500);
  // }

  function selectedDuration() {
    try {
      return Number(localStorage.getItem(STORAGE_KEY)) || 0;
    } catch (_) {
      return 0;
    }
  }

  function saveDuration(seconds) {
    try {
      if (seconds) localStorage.setItem(STORAGE_KEY, String(seconds));
      else localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }

  function isCompletionUrl(input) {
    const raw = typeof input === 'string'
      ? input
      : (input && (input.url || input.href)) || String(input || '');
    try {
      const url = new URL(raw, location.href);
      return /(^|\.)doubao\.com$/.test(url.hostname) && url.pathname === '/chat/completion';
    } catch (_) {
      return /\/chat\/completion(?:\?|$)/.test(raw);
    }
  }

  function parseAbilityParam(value) {
    if (value && typeof value === 'object') return { ...value };
    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (_) {}
    }
    return {};
  }

  function patchBody(rawBody) {
    if (typeof rawBody !== 'string' || !rawBody.trim()) return { changed: false, body: rawBody };
    if (selectedDuration() !== TARGET_DURATION) return { changed: false, body: rawBody };

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (_) {
      return { changed: false, body: rawBody };
    }

    const ability = payload && payload.chat_ability;
    if (!ability || Number(ability.ability_type) !== 17) return { changed: false, body: rawBody };

    const param = parseAbilityParam(ability.ability_param);
    param.model = TARGET_MODEL;
    param.duration = TARGET_DURATION;
    ability.ability_param = JSON.stringify(param);
    return { changed: true, body: JSON.stringify(payload) };
  }

  function patchFetch() {
    if (typeof window.fetch !== 'function' || window.fetch.__codexDoubaoCn15s) return;
    const originalFetch = window.fetch;

    async function patchedFetch(input, init) {
      try {
        if (!isCompletionUrl(input)) return originalFetch.apply(this, arguments);

        if (init && Object.prototype.hasOwnProperty.call(init, 'body')) {
          const patched = patchBody(init.body);
          if (patched.changed) return originalFetch.call(this, input, { ...init, body: patched.body });
          return originalFetch.apply(this, arguments);
        }

        if (window.Request && input instanceof window.Request && String(input.method || '').toUpperCase() === 'POST') {
          const raw = await input.clone().text();
          const patched = patchBody(raw);
          if (patched.changed) return originalFetch.call(this, new window.Request(input, { body: patched.body }), init);
        }
      } catch (error) {
        console.warn('[Doubao CN 15s] fetch patch failed:', error);
      }
      return originalFetch.apply(this, arguments);
    }

    patchedFetch.__codexDoubaoCn15s = true;
    window.fetch = patchedFetch;
  }

  function patchXhr() {
    const proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
    if (!proto || proto.__codexDoubaoCn15s) return;

    const originalOpen = proto.open;
    const originalSend = proto.send;

    proto.open = function (method, url) {
      this.__codexDoubaoCn15sMethod = method;
      this.__codexDoubaoCn15sUrl = url;
      return originalOpen.apply(this, arguments);
    };

    proto.send = function (body) {
      try {
        if (
          String(this.__codexDoubaoCn15sMethod || '').toUpperCase() === 'POST' &&
          isCompletionUrl(this.__codexDoubaoCn15sUrl)
        ) {
          const patched = patchBody(body);
          if (patched.changed) return originalSend.call(this, patched.body);
        }
      } catch (error) {
        console.warn('[Doubao CN 15s] xhr patch failed:', error);
      }
      return originalSend.apply(this, arguments);
    };

    proto.__codexDoubaoCn15s = true;
  }

  function visible(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function text(el) {
    return String((el && el.textContent) || '').replace(/\s+/g, '').replace(/[✓✔√]/g, '').trim();
  }

  function exactDuration(el) {
    const match = text(el).match(/^(5|10|15)(s|秒)$/);
    return match ? Number(match[1]) : 0;
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      [${MARK}="option"] {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 26px !important;
        cursor: pointer !important;
      }
      [${MARK}="option"] [${MARK}-check] {
        margin-left: auto;
        flex: 0 0 auto;
        color: currentColor;
        font-size: 18px;
        line-height: 1;
      }
      [${MARK}-native-check="hidden"] {
        visibility: hidden !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function closestClickable(el) {
    let current = el && el.nodeType === Node.TEXT_NODE ? el.parentElement : el;
    for (let i = 0; current && i < 7; i += 1, current = current.parentElement) {
      const role = current.getAttribute && current.getAttribute('role');
      if (
        current.tagName === 'BUTTON' ||
        role === 'button' ||
        role === 'menuitem' ||
        role === 'option' ||
        current.tabIndex >= 0 ||
        /pointer/.test(String(getComputedStyle(current).cursor || ''))
      ) {
        return current;
      }
    }
    return el && el.parentElement;
  }

  function findDurationMenuRoot() {
    if (!document.body) return null;
    const candidates = Array.from(document.querySelectorAll('[role="menu"], [data-slot*="dropdown-menu"], div'))
      .filter(visible)
      .filter(el => {
        const t = text(el);
        if (t.length > 220) return false;
        if (!/时长/.test(t) || !/5s/.test(t) || !/10s/.test(t)) return false;
        return !/Seedance/.test(t) && !/比例/.test(t);
      })
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return (ar.width * ar.height) - (br.width * br.height);
      });
    return candidates[0] || null;
  }

  function optionTextNodes(root) {
    const nodes = [];
    if (!root || root.nodeType === undefined) return nodes;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return /^\s*(5|10|15)(s|秒)\s*$/.test(node.nodeValue || '')
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function findMenuOptions(root) {
    const out = [];
    for (const node of optionTextNodes(root)) {
      const parent = node.parentElement;
      if (!visible(parent)) continue;
      const item = closestClickable(parent);
      if (!item || !root.contains(item)) continue;
      if (!exactDuration(item)) continue;
      if (out.some(existing => existing === item || existing.contains(item))) continue;
      for (let i = out.length - 1; i >= 0; i -= 1) {
        if (item.contains(out[i])) out.splice(i, 1);
      }
      out.push(item);
    }
    return out;
  }

  function durationTextNode(el) {
    if (!el || el.nodeType === undefined) return null;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (/^\s*(5|10|15)(s|秒)\s*$/.test(walker.currentNode.nodeValue || '')) return walker.currentNode;
    }
    return null;
  }

  function removeOwnChecks(el) {
    el.querySelectorAll(`[${MARK}-check]`).forEach(node => node.remove());
  }

  function setNativeChecksHidden(item, hidden) {
    if (!item || item.nodeType === undefined) return;
    item.querySelectorAll(`[${MARK}-native-check]`).forEach(node => node.removeAttribute(`${MARK}-native-check`));
    if (!hidden) return;

    item.querySelectorAll('svg,img,canvas').forEach(node => node.setAttribute(`${MARK}-native-check`, 'hidden'));

    const nodes = [];
    const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return /[✓✔√]/.test(node.nodeValue || '')
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (const node of nodes) {
      const parent = node.parentElement;
      if (parent && /^[\s✓✔√]+$/.test(parent.textContent || '')) {
        parent.setAttribute(`${MARK}-native-check`, 'hidden');
      }
    }
  }

  function scrubClone(clone) {
    clone.removeAttribute('aria-selected');
    clone.removeAttribute('aria-checked');
    clone.removeAttribute('checked');
    clone.removeAttribute('selected');
    removeOwnChecks(clone);
    clone.removeAttribute(`${MARK}-active`);
    const node = durationTextNode(clone);
    if (node) node.nodeValue = '15s';
    else clone.textContent = '15s';
  }

  function setToolbarText(seconds) {
    const next = seconds === TARGET_DURATION ? '15s' : `${seconds}s`;
    if (!document.body) return;
    const nodes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return /^\s*(5|10|15)(s|秒)\s*$/.test(node.nodeValue || '')
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (const node of nodes) {
      const parent = node.parentElement;
      if (!visible(parent)) continue;
      const click = closestClickable(parent);
      if (!click || !visible(click)) continue;
      let current = click.parentElement;
      for (let i = 0; current && i < 7; i += 1, current = current.parentElement) {
        const t = text(current);
        if (/Seedance/.test(t) && /比例/.test(t) && t.length < 260) {
          node.nodeValue = next;
          if (!click.hasAttribute(`${MARK}-trigger`)) {
            click.setAttribute(`${MARK}-trigger`, '1');
            click.addEventListener('click', () => {
              setTimeout(inject15Option, 80);
              setTimeout(inject15Option, 240);
            }, true);
          }
          break;
        }
      }
    }
  }

  function renderChecks(options) {
    const selected15 = selectedDuration() === TARGET_DURATION;
    for (const item of options) {
      const value = exactDuration(item);
      if (value === 5 || value === 10) setNativeChecksHidden(item, selected15);
      if (value === TARGET_DURATION) {
        removeOwnChecks(item);
        setNativeChecksHidden(item, !selected15);
      }
      item.removeAttribute(`${MARK}-active`);
    }
  }

  function bindNative(item, seconds) {
    if (item.hasAttribute(`${MARK}-native`)) return;
    item.setAttribute(`${MARK}-native`, String(seconds));
    item.addEventListener('click', () => {
      saveDuration(0);
      setToolbarText(seconds);
      setTimeout(inject15Option, 80);
    }, true);
  }

  function bind15Async(item) {
    if (item.hasAttribute(MARK)) return;
    item.setAttribute(MARK, 'option');
    
    const checkSpan = document.createElement('span');
    checkSpan.setAttribute(`${MARK}-check`, 'true');
    checkSpan.textContent = '✓';
    checkSpan.style.cssText = 'margin-left: auto; flex: 0 0 auto; color: currentColor; font-size: 18px; line-height: 1;';
    if (selectedDuration() === TARGET_DURATION) {
      checkSpan.style.display = 'inline';
    } else {
      checkSpan.style.display = 'none';
    }
    item.appendChild(checkSpan);
    item.__15sCheckSpan = checkSpan;
    
    item.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      
      saveDuration(TARGET_DURATION);
      setToolbarText(TARGET_DURATION);
      
      if (item.__15sCheckSpan) {
        item.__15sCheckSpan.style.display = 'inline';
      }
      
      const allOptions = document.querySelectorAll(`[${MARK}="option"]`);
      allOptions.forEach(opt => {
        if (opt !== item && opt.__15sCheckSpan) {
          opt.__15sCheckSpan.style.display = 'none';
        }
      });
      
      setTimeout(() => document.body && document.body.click(), 30);
    }, true);
  }

  function bind15(item) {
    bind15Async(item);
  }

  async function inject15Option() {
    const root = findDurationMenuRoot();
    if (!root) return;
    const options = findMenuOptions(root);
    if (!options.length) return;

    for (const item of options) {
      const value = exactDuration(item);
      if (value === 5 || value === 10) bindNative(item, value);
      if (value === TARGET_DURATION) bind15(item);
    }

    if (!options.some(item => exactDuration(item) === TARGET_DURATION)) {
      const after = options.find(item => exactDuration(item) === 10) || options[options.length - 1];
      const template = options.find(item => exactDuration(item) === 5) || after;
      if (!after || !template || !after.parentElement) return;
      const clone = template.cloneNode(true);
      scrubClone(clone);
      bind15(clone);
      after.parentElement.insertBefore(clone, after.nextSibling);
      options.push(clone);
    }

    renderChecks(options);
  }

  function tick() {
    try {
      if (selectedDuration() === TARGET_DURATION) setToolbarText(TARGET_DURATION);
      inject15Option();
    } catch (e) {
      console.warn('[Doubao CN 15s] tick error:', e.message);
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(tick, 100);
  }

  function start() {
    installStyle();
    tick();
    const observer = new MutationObserver(schedule);
    const waitBody = () => {
      if (!document.body) return setTimeout(waitBody, 200);
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      schedule();
    };
    waitBody();
  }

  patchFetch();
  patchXhr();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();