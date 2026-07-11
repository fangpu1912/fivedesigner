// 豆包 15 秒视频选项注入 - 适配 Tauri 内嵌 Webview
// 基于 page.js，移除激活码逻辑

(function() {
  'use strict';

  var TARGET_DURATION = 15;
  var TARGET_MODEL = 'seedance_v2.0';
  var STORAGE_KEY = 'codex_doubao_video_duration_choice';
  var MARK = 'data-codex-doubao-cn-15s';
  var STYLE_ID = 'codex-doubao-cn-15s-style';
  var timer = 0;

  function selectedDuration() {
    try { return Number(localStorage.getItem(STORAGE_KEY)) || 0; }
    catch (_) { return 0; }
  }

  function saveDuration(seconds) {
    try {
      if (seconds) localStorage.setItem(STORAGE_KEY, String(seconds));
      else localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }

  function isCompletionUrl(input) {
    var raw = typeof input === 'string' ? input : ((input && (input.url || input.href)) || String(input || ''));
    try {
      var url = new URL(raw, location.href);
      return /(^|\.)doubao\.com$/.test(url.hostname) && url.pathname === '/chat/completion';
    } catch (_) {
      return /\/chat\/completion(?:\?|$)/.test(raw);
    }
  }

  function parseAbilityParam(value) {
    if (value && typeof value === 'object') return Object.assign({}, value);
    if (typeof value === 'string' && value.trim()) {
      try {
        var parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (_) {}
    }
    return {};
  }

  function patchBody(rawBody) {
    if (typeof rawBody !== 'string' || !rawBody.trim()) return { changed: false, body: rawBody };
    if (selectedDuration() !== TARGET_DURATION) return { changed: false, body: rawBody };

    var payload;
    try { payload = JSON.parse(rawBody); }
    catch (_) { return { changed: false, body: rawBody }; }

    var ability = payload && payload.chat_ability;
    if (!ability || Number(ability.ability_type) !== 17) return { changed: false, body: rawBody };

    var param = parseAbilityParam(ability.ability_param);
    param.model = TARGET_MODEL;
    param.duration = TARGET_DURATION;
    ability.ability_param = JSON.stringify(param);
    return { changed: true, body: JSON.stringify(payload) };
  }

  function patchFetch() {
    if (typeof window.fetch !== 'function' || window.fetch.__codexDoubaoCn15s) return;
    var originalFetch = window.fetch;

    function patchedFetch(input, init) {
      try {
        if (!isCompletionUrl(input)) return originalFetch.apply(this, arguments);

        if (init && Object.prototype.hasOwnProperty.call(init, 'body')) {
          var patched = patchBody(init.body);
          if (patched.changed) return originalFetch.call(this, input, Object.assign({}, init, { body: patched.body }));
          return originalFetch.apply(this, arguments);
        }

        if (window.Request && input instanceof window.Request && String(input.method || '').toUpperCase() === 'POST') {
          var raw = input.clone().text();
          // sync path for simplicity
        }
      } catch (error) {
        // silent
      }
      return originalFetch.apply(this, arguments);
    }

    patchedFetch.__codexDoubaoCn15s = true;
    window.fetch = patchedFetch;
  }

  function patchXhr() {
    var proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
    if (!proto || proto.__codexDoubaoCn15s) return;

    var originalOpen = proto.open;
    var originalSend = proto.send;

    proto.open = function(method, url) {
      this.__codexDoubaoCn15sMethod = method;
      this.__codexDoubaoCn15sUrl = url;
      return originalOpen.apply(this, arguments);
    };

    proto.send = function(body) {
      try {
        if (
          String(this.__codexDoubaoCn15sMethod || '').toUpperCase() === 'POST' &&
          isCompletionUrl(this.__codexDoubaoCn15sUrl)
        ) {
          var patched = patchBody(body);
          if (patched.changed) return originalSend.call(this, patched.body);
        }
      } catch (error) {
        // silent
      }
      return originalSend.apply(this, arguments);
    };

    proto.__codexDoubaoCn15s = true;
  }

  function visible(el) {
    if (!el || !el.isConnected) return false;
    var rect = el.getBoundingClientRect();
    var style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function text(el) {
    return String((el && el.textContent) || '').replace(/\s+/g, '').replace(/[\u2713\u2714\u221A]/g, '').trim();
  }

  function exactDuration(el) {
    var match = text(el).match(/^(5|10|15)(s|秒)$/);
    return match ? Number(match[1]) : 0;
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = '[' + MARK + '="option"] { display: flex !important; align-items: center !important; justify-content: space-between !important; gap: 26px !important; cursor: pointer !important; } [' + MARK + '="option"] [' + MARK + '-check] { margin-left: auto; flex: 0 0 auto; color: currentColor; font-size: 18px; line-height: 1; } [' + MARK + '-native-check="hidden"] { visibility: hidden !important; }';
    (document.head || document.documentElement).appendChild(style);
  }

  function closestClickable(el) {
    var current = el && el.nodeType === Node.TEXT_NODE ? el.parentElement : el;
    for (var i = 0; current && i < 7; i += 1, current = current.parentElement) {
      var role = current.getAttribute && current.getAttribute('role');
      if (
        current.tagName === 'BUTTON' ||
        role === 'button' || role === 'menuitem' || role === 'option' ||
        current.tabIndex >= 0 ||
        /pointer/.test(String(getComputedStyle(current).cursor || ''))
      ) { return current; }
    }
    return el && el.parentElement;
  }

  function findDurationMenuRoot() {
    if (!document.body) return null;
    var candidates = Array.from(document.querySelectorAll('[role="menu"], [data-slot*="dropdown-menu"], div'))
      .filter(visible)
      .filter(function(el) {
        var t = text(el);
        if (t.length > 220) return false;
        if (!/时长/.test(t) || !/5s/.test(t) || !/10s/.test(t)) return false;
        return !/Seedance/.test(t) && !/比例/.test(t);
      })
      .sort(function(a, b) {
        var ar = a.getBoundingClientRect();
        var br = b.getBoundingClientRect();
        return (ar.width * ar.height) - (br.width * br.height);
      });
    return candidates[0] || null;
  }

  function optionTextNodes(root) {
    var nodes = [];
    if (!root || root.nodeType === undefined) return nodes;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function(node) {
        return /^\s*(5|10|15)(s|秒)\s*$/.test(node.nodeValue || '')
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function findMenuOptions(root) {
    var out = [];
    var textNodes = optionTextNodes(root);
    for (var i = 0; i < textNodes.length; i++) {
      var node = textNodes[i];
      var parent = node.parentElement;
      if (!visible(parent)) continue;
      var item = closestClickable(parent);
      if (!item || !root.contains(item)) continue;
      if (!exactDuration(item)) continue;
      if (out.some(function(existing) { return existing === item || existing.contains(item); })) continue;
      for (var j = out.length - 1; j >= 0; j -= 1) {
        if (item.contains(out[j])) out.splice(j, 1);
      }
      out.push(item);
    }
    return out;
  }

  function durationTextNode(el) {
    if (!el || el.nodeType === undefined) return null;
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (/^\s*(5|10|15)(s|秒)\s*$/.test(walker.currentNode.nodeValue || '')) return walker.currentNode;
    }
    return null;
  }

  function removeOwnChecks(el) {
    el.querySelectorAll('[' + MARK + '-check]').forEach(function(node) { node.remove(); });
  }

  function setNativeChecksHidden(item, hidden) {
    if (!item || item.nodeType === undefined) return;
    item.querySelectorAll('[' + MARK + '-native-check]').forEach(function(node) { node.removeAttribute(MARK + '-native-check'); });
    if (!hidden) return;
    item.querySelectorAll('svg,img,canvas').forEach(function(node) { node.setAttribute(MARK + '-native-check', 'hidden'); });
  }

  function scrubClone(clone) {
    clone.removeAttribute('aria-selected');
    clone.removeAttribute('aria-checked');
    clone.removeAttribute('checked');
    clone.removeAttribute('selected');
    removeOwnChecks(clone);
    clone.removeAttribute(MARK + '-active');
    var node = durationTextNode(clone);
    if (node) node.nodeValue = '15s';
    else clone.textContent = '15s';
  }

  function setToolbarText(seconds) {
    var next = seconds === TARGET_DURATION ? '15s' : seconds + 's';
    if (!document.body) return;
    var nodes = [];
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function(node) {
        return /^\s*(5|10|15)(s|秒)\s*$/.test(node.nodeValue || '')
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var parent = node.parentElement;
      if (!visible(parent)) continue;
      var click = closestClickable(parent);
      if (!click || !visible(click)) continue;
      var current = click.parentElement;
      for (var j = 0; current && j < 7; j += 1, current = current.parentElement) {
        var t = text(current);
        if (/Seedance/.test(t) && /比例/.test(t) && t.length < 260) {
          node.nodeValue = next;
          if (!click.hasAttribute(MARK + '-trigger')) {
            click.setAttribute(MARK + '-trigger', '1');
            click.addEventListener('click', function() {
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
    var selected15 = selectedDuration() === TARGET_DURATION;
    for (var i = 0; i < options.length; i++) {
      var item = options[i];
      var value = exactDuration(item);
      if (value === 5 || value === 10) setNativeChecksHidden(item, selected15);
      if (value === TARGET_DURATION) {
        removeOwnChecks(item);
        setNativeChecksHidden(item, !selected15);
      }
      item.removeAttribute(MARK + '-active');
    }
  }

  function bindNative(item, seconds) {
    if (item.hasAttribute(MARK + '-native')) return;
    item.setAttribute(MARK + '-native', String(seconds));
    item.addEventListener('click', function() {
      saveDuration(0);
      setToolbarText(seconds);
      setTimeout(inject15Option, 80);
    }, true);
  }

  function bind15(item) {
    if (item.hasAttribute(MARK)) return;
    item.setAttribute(MARK, 'option');

    var checkSpan = document.createElement('span');
    checkSpan.setAttribute(MARK + '-check', 'true');
    checkSpan.textContent = '\u2713';
    checkSpan.style.cssText = 'margin-left: auto; flex: 0 0 auto; color: currentColor; font-size: 18px; line-height: 1;';
    checkSpan.style.display = selectedDuration() === TARGET_DURATION ? 'inline' : 'none';
    item.appendChild(checkSpan);
    item.__15sCheckSpan = checkSpan;

    item.addEventListener('click', function(event) {
      event.preventDefault();
      event.stopPropagation();
      saveDuration(TARGET_DURATION);
      setToolbarText(TARGET_DURATION);
      if (item.__15sCheckSpan) item.__15sCheckSpan.style.display = 'inline';
      var allOptions = document.querySelectorAll('[' + MARK + '="option"]');
      allOptions.forEach(function(opt) {
        if (opt !== item && opt.__15sCheckSpan) opt.__15sCheckSpan.style.display = 'none';
      });
      setTimeout(function() { document.body && document.body.click(); }, 30);
    }, true);
  }

  function inject15Option() {
    var root = findDurationMenuRoot();
    if (!root) return;
    var options = findMenuOptions(root);
    if (!options.length) return;

    for (var i = 0; i < options.length; i++) {
      var item = options[i];
      var value = exactDuration(item);
      if (value === 5 || value === 10) bindNative(item, value);
      if (value === TARGET_DURATION) bind15(item);
    }

    if (!options.some(function(item) { return exactDuration(item) === TARGET_DURATION; })) {
      var after = options.find(function(item) { return exactDuration(item) === 10; }) || options[options.length - 1];
      var template = options.find(function(item) { return exactDuration(item) === 5; }) || after;
      if (!after || !template || !after.parentElement) return;
      var clone = template.cloneNode(true);
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
    } catch (e) {}
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(tick, 100);
  }

  function start() {
    installStyle();
    tick();
    var observer = new MutationObserver(schedule);
    var waitBody = function() {
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
