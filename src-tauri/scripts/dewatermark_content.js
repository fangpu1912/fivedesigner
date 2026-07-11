// 豆包去水印脚本 - 适配 Tauri 内嵌 Webview
// 完全照搬 E:\softdownload\78_UY78943093KL\service-worker.js 的 fallback_api 方法
// 视频去水印核心：fallback_api + logo_type=unwatermarked + AES-CBC 解密

(function() {
  'use strict';

  var QAAB_SALT_HEX = "4dd4c2e6b83162090e52b3c7a6733ba4"
    + "1cb2462b829ab58a196b39db57177524"
    + "f49baf7f08e8d68d26a72e37c1a95a2f"
    + "1f05a51892aef2949732b62a38aadd58";

  var processedUrls = new Set();
  var MAX_DEDUP_SIZE = 100;
  var seenVideoUrls = new Set();

  // ========== 工具函数 ==========

  function isHttpUrl(url) {
    return typeof url === "string" && /^https?:\/\//i.test(url);
  }

  function markProcessed(url) {
    if (url) {
      processedUrls.add(url);
      if (processedUrls.size > MAX_DEDUP_SIZE) {
        var first = processedUrls.values().next().value;
        processedUrls.delete(first);
      }
    }
  }

  // ========== JSON 遍历工具（照搬插件）==========

  function walkJsonAndStrings(value, visitor, seen) {
    if (!seen) seen = new Set();
    if (value == null) return;
    if (typeof value === "string") {
      var parsed = parseJsonString(value);
      if (parsed !== null) walkJsonAndStrings(parsed, visitor, seen);
      return;
    }
    if (typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    visitor(value);
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) walkJsonAndStrings(value[i], visitor, seen);
      return;
    }
    var keys = Object.keys(value);
    for (var j = 0; j < keys.length; j++) walkJsonAndStrings(value[keys[j]], visitor, seen);
  }

  function parseJsonString(text) {
    var trimmed = (text || "").trim();
    if (!trimmed || (trimmed.charAt(0) !== "{" && trimmed.charAt(0) !== "[")) return null;
    try { return JSON.parse(trimmed); } catch (e) { return null; }
  }

  function findValuesByKey(value, targetKey) {
    var values = [];
    walkJsonAndStrings(value, function(node) {
      if (!node || typeof node !== "object" || Array.isArray(node)) return;
      if (Object.prototype.hasOwnProperty.call(node, targetKey)) {
        values.push(node[targetKey]);
      }
    });
    return values;
  }

  function findImageOriRawUrls(value) {
    var urls = [];
    walkJsonAndStrings(value, function(node) {
      if (node && typeof node === "object" && !Array.isArray(node)) {
        var image = node.image_ori_raw;
        if (image && typeof image === "object" && isHttpUrl(image.url)) {
          urls.push(image.url);
        }
      }
    });
    return urls;
  }

  // ========== fallback_api 提取（照搬插件）==========

  function findDoubaoFallbackApis(json, rawBody) {
    var apis = new Set();

    var jsonValues = findValuesByKey(json, "fallback_api");
    for (var i = 0; i < jsonValues.length; i++) {
      addFallbackApi(apis, jsonValues[i]);
    }

    var patterns = [
      /fallback_api\\":\\"(.*?)\\"/g,
      /"fallback_api"\s*:\s*"([^"]+)"/g
    ];

    for (var p = 0; p < patterns.length; p++) {
      var pattern = patterns[p];
      var match = pattern.exec(rawBody);
      while (match) {
        addFallbackApi(apis, decodeJsonEscapedFragment(match[1]));
        match = pattern.exec(rawBody);
      }
    }

    return Array.from(apis);
  }

  function addFallbackApi(apis, value) {
    if (typeof value !== "string" || !value) return;
    var url = decodeJsonEscapedFragment(value);
    if (isHttpUrl(url)) apis.add(url);
  }

  function decodeJsonEscapedFragment(value) {
    var text = value;
    for (var index = 0; index < 3; index += 1) {
      try {
        var decoded = JSON.parse('"' + text.replace(/"/g, '\\"') + '"');
        if (decoded === text) break;
        text = decoded;
      } catch (e) { break; }
    }
    return text.replace(/\\u0026/g, "&").replace(/\\\//g, "/");
  }

  // ========== 视频URL获取与解密（照搬插件）==========

  function replaceQueryParams(url, params) {
    var parsedUrl = new URL(url);
    var keys = Object.keys(params);
    for (var i = 0; i < keys.length; i++) {
      parsedUrl.searchParams.set(keys[i], params[keys[i]]);
    }
    return parsedUrl.toString();
  }

  async function getDoubaoVideoUrlFromFallbackApi(fallbackApi) {
    try {
      var url = replaceQueryParams(fallbackApi, {
        channel: "no",
        codec_type: "8",
        logo_type: "unwatermarked"
      });
      // 15 秒超时，避免挂起
      var controller = new AbortController();
      var timeoutId = setTimeout(function() { controller.abort(); }, 15000);
      var response = await fetch(url, {
        method: "GET",
        credentials: "omit",
        headers: { "accept": "application/json,text/plain,*/*" },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      var payload = await response.json();
      var data = getVideoData(payload);
      var token = pickMainUrlToken(data);
      if (!token) return "";
      return await decodeMainUrl(token, findKeySeedDeep(payload));
    } catch (error) {
      if (error.name === "AbortError") {
        console.warn("[dewatermark] fallback_api timeout:", fallbackApi.substring(0, 80));
      } else {
        console.warn("[dewatermark] fallback_api failed:", error.message || error);
      }
      return "";
    }
  }

  function getVideoData(payload) {
    var videoInfo = (payload && payload.video_info) || (payload && payload.data && payload.data.video_info) || payload;
    var data = (videoInfo && videoInfo.data) || videoInfo;
    return data && typeof data === "object" ? data : {};
  }

  function pickMainUrlToken(data) {
    var videoList = data && data.video_list;
    var entries;
    if (videoList && typeof videoList === "object" && Object.keys(videoList).length) {
      entries = Object.values(videoList);
    } else {
      entries = [data];
    }
    var best = null;

    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (!entry || typeof entry !== "object") continue;
      var token = entry.main_url || entry.play_url || "";
      if (typeof token !== "string" || !token.trim()) continue;
      var score = Number(entry.bitrate || entry.real_bitrate || 0)
        + Number(entry.vwidth || entry.width || 0) * Number(entry.vheight || entry.height || 0);
      if (!best || score > best.score) {
        best = { token: token.trim(), score: score };
      }
    }
    return best ? best.token : "";
  }

  function findKeySeedDeep(value, depth) {
    if (depth === undefined) depth = 0;
    if (depth > 10 || value == null) return "";

    if (typeof value === "string") {
      var match = value.match(/(?:^|[?&])key_seed=([^&"'<>\\\s]+)/i);
      if (match) return decodeURIComponent(match[1]);
      match = value.match(/["']key_seed["']\s*:\s*["']([^"']+)/i);
      return match ? decodeURIComponent(match[1]) : "";
    }

    if (typeof value !== "object") return "";
    if (typeof value.key_seed === "string" && value.key_seed.trim()) return value.key_seed.trim();

    var vals = Object.values(value);
    for (var i = 0; i < vals.length; i++) {
      var hit = findKeySeedDeep(vals[i], depth + 1);
      if (hit) return hit;
    }
    return "";
  }

  async function decodeMainUrl(token, keySeed) {
    if (isHttpUrl(token)) return token;

    var plainUrl = tryDecodeBase64Url(token);
    if (plainUrl) return plainUrl;

    if (token.substring(0, 4) === "qAAB" && keySeed) {
      return await decodeQaabToken(token, keySeed);
    }

    return "";
  }

  function tryDecodeBase64Url(token) {
    var bytes = base64DecodeLoose(token);
    if (!bytes) return "";
    var text = asciiUrlFromBytes(bytes);
    return isHttpUrl(text) ? text : "";
  }

  function base64DecodeLoose(text) {
    var input = String(text || "").trim();
    var variants = [
      input,
      input.replace(/[$@#]/g, function(char) { return { "$": "_", "@": "/", "#": "." }[char]; }),
      input.replace(/[$@#]/g, function(char) { return { "$": "+", "@": "/", "#": "=" }[char]; })
    ];
    var seen = new Set();

    for (var i = 0; i < variants.length; i++) {
      var candidate = variants[i];
      if (!candidate || seen.has(candidate)) continue;
      seen.add(candidate);
      try {
        var normalized = padBase64(candidate).replace(/-/g, "+").replace(/_/g, "/");
        var binary = atob(normalized);
        var bytes = new Uint8Array(binary.length);
        for (var j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
        return bytes;
      } catch (e) {}
    }
    return null;
  }

  function padBase64(text) {
    var pad = (4 - (text.length % 4)) % 4;
    return text + "=".repeat(pad);
  }

  function asciiUrlFromBytes(bytes) {
    if (!bytes || !bytes.length) return "";
    for (var i = 0; i < bytes.length; i++) {
      if (bytes[i] !== 9 && bytes[i] !== 10 && bytes[i] !== 13 && (bytes[i] < 32 || bytes[i] > 126)) return "";
    }
    return new TextDecoder().decode(bytes);
  }

  async function decodeQaabToken(token, keySeed) {
    var data = base64DecodeLoose(token);
    var seed = base64DecodeLoose(keySeed);
    if (!data || !seed) return "";

    var digest1 = await crypto.subtle.digest("SHA-512", seed.slice(0, 32));
    var salt = hexToBytes(QAAB_SALT_HEX);
    var digest2Input = concatBytes(new Uint8Array(digest1), salt);
    var digest2 = new Uint8Array(await crypto.subtle.digest("SHA-512", digest2Input));
    var key = digest2.slice(0, 16);
    var iv = digest2.slice(16, 32);
    var attempts = [];

    if (data.length >= 4 && data[0] === 0xa8 && data[1] === 0x00 && data[2] === 0x01 && data[3] === 0x00) {
      attempts.push({ payload: data.slice(4), key: key, iv: iv });
      attempts.push({ payload: data.slice(4), key: iv, iv: key });
      if (data.length > 36) {
        attempts.push({ payload: data.slice(36), key: key, iv: data.slice(20, 36) });
        attempts.push({ payload: data.slice(36), key: key, iv: iv });
      }
    } else {
      attempts.push({ payload: data, key: key, iv: iv });
    }

    for (var i = 0; i < attempts.length; i++) {
      var url = await decryptAesCbcUrl(attempts[i].payload, attempts[i].key, attempts[i].iv);
      if (url) return url;
    }
    return "";
  }

  async function decryptAesCbcUrl(payload, keyBytes, ivBytes) {
    if (!payload.length || payload.length % 16 !== 0) return "";
    try {
      var key = await crypto.subtle.importKey("raw", keyBytes, "AES-CBC", false, ["decrypt"]);
      var plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv: ivBytes }, key, payload));
      var direct = asciiUrlFromBytes(plain);
      if (isHttpUrl(direct)) return direct;
      var stripped = stripPkcs7(plain);
      var url = asciiUrlFromBytes(stripped);
      return isHttpUrl(url) ? url : "";
    } catch (e) { return ""; }
  }

  function stripPkcs7(bytes) {
    if (!bytes || !bytes.length) return new Uint8Array();
    var pad = bytes[bytes.length - 1];
    if (pad < 1 || pad > 16 || pad > bytes.length) return bytes;
    for (var i = bytes.length - pad; i < bytes.length; i++) {
      if (bytes[i] !== pad) return bytes;
    }
    return bytes.slice(0, bytes.length - pad);
  }

  function hexToBytes(hex) {
    var bytes = new Uint8Array(hex.length / 2);
    for (var i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }

  function concatBytes(first, second) {
    var bytes = new Uint8Array(first.length + second.length);
    bytes.set(first, 0);
    bytes.set(second, first.length);
    return bytes;
  }

  // ========== 发送数据到主应用 ==========

  if (!window.__EXTRACTED_MEDIA__) {
    window.__EXTRACTED_MEDIA__ = [];
  }

  function emitToMain(mediaType, data) {
    if (!data || (Array.isArray(data) && data.length === 0)) return;

    var accountId = window.__EMBEDDED_ACCOUNT_ID__ || 'unknown';
    var items = Array.isArray(data) ? data : [data];

    for (var i = 0; i < items.length; i++) {
      window.__EXTRACTED_MEDIA__.push({
        mediaType: mediaType,
        accountId: accountId,
        data: items[i],
        timestamp: Date.now()
      });
    }

    if (window.__EXTRACTED_MEDIA__.length > 500) {
      window.__EXTRACTED_MEDIA__ = window.__EXTRACTED_MEDIA__.slice(-300);
    }

    if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
      try {
        window.__TAURI_INTERNALS__.invoke('report_extracted_media', {
          accountId: accountId,
          mediaType: mediaType,
          data: items.length === 1 ? items[0] : items
        });
      } catch (e) {}
    }
  }

  // ========== 核心提取逻辑 ==========
  // 只按媒体 URL 去重，避免重复添加同一个视频/图片
  // 对话切换检测：比较当前 URL，只在进入新对话时清空旧媒体

  var _lastConversationUrl = location.href;

  function isNewConversation() {
    var currentUrl = location.href;
    if (currentUrl !== _lastConversationUrl) {
      _lastConversationUrl = currentUrl;
      return true;
    }
    return false;
  }

  // 轮询检测 URL 变化（SPA 路由切换）
  setInterval(function() {
    var currentUrl = location.href;
    if (currentUrl !== _lastConversationUrl) {
      console.log("[dewatermark] URL changed, conversation switch detected");
      _lastConversationUrl = currentUrl;
      emitToMain('clear', {});
      seenVideoUrls = new Set();
    }
  }, 1000);

  async function extractAndPublish(json, rawBody, url) {
    // 检测 URL 变化来判断是否切换了对话
    if (isNewConversation()) {
      console.log("[dewatermark] New conversation detected, clearing old media");
      emitToMain('clear', {});
      seenVideoUrls = new Set();
    }

    var images = [];
    var imageUrls = findImageOriRawUrls(json);
    for (var i = 0; i < imageUrls.length; i++) {
      if (!seenVideoUrls.has(imageUrls[i])) {
        seenVideoUrls.add(imageUrls[i]);
        images.push({ no_watermark_url: imageUrls[i] });
      }
    }
    if (images.length) emitToMain('image', images);

    var fallbackApis = findDoubaoFallbackApis(json, rawBody);
    console.log("[dewatermark] extractAndPublish: found", fallbackApis.length, "fallback_api URL(s)");
    for (var j = 0; j < fallbackApis.length; j++) {
      (function(fallbackApi) {
        getDoubaoVideoUrlFromFallbackApi(fallbackApi).then(function(videoUrl) {
          if (videoUrl && isHttpUrl(videoUrl) && !seenVideoUrls.has(videoUrl)) {
            seenVideoUrls.add(videoUrl);
            console.log("[dewatermark] 视频去水印成功, URL前80:", videoUrl.substring(0, 80));
            emitToMain('video', [{ no_watermark_url: videoUrl, is_resolved: true, _source: 'fallback_api' }]);
          }
        });
      })(fallbackApis[j]);
    }
  }

  // ========== 劫持 fetch（照搬插件）==========

  var originalFetch = window.fetch;
  window.fetch = function() {
    var fetchUrl = typeof arguments[0] === "string" ? arguments[0] : (arguments[0] && arguments[0].url);
    if (!fetchUrl || typeof fetchUrl !== "string") return originalFetch.apply(this, arguments);

    if (fetchUrl.indexOf("chain/single") !== -1) {
      // 不跳过已处理的 URL——每次响应都处理（切换对话时同一 endpoint 会返回不同数据）
      return originalFetch.apply(this, arguments).then(function(resp) {
        var contentType = resp.headers.get("content-type") || "";
        if (contentType.indexOf("json") === -1 && contentType.indexOf("text") === -1) return resp;
        return resp.clone().text().then(function(text) {
          try {
            var json = JSON.parse(text);
            extractAndPublish(json, text, fetchUrl);
          } catch (e) {}
        }).then(function() { return resp; });
      });
    }

    return originalFetch.apply(this, arguments);
  };

  // ========== 劫持 XHR（照搬插件）==========

  var originalXHROpen = XMLHttpRequest.prototype.open;
  var originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this._url = url;
    return originalXHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function() {
    var self = this;
    self.addEventListener("load", function() {
      if (typeof self._url === "string" && self._url.indexOf("chain/single") !== -1) {
        try {
          var rawBody = self.responseText;
          var json = JSON.parse(rawBody);
          extractAndPublish(json, rawBody, self._url);
        } catch (e) {}
      }
    });
    return originalXHRSend.apply(this, arguments);
  };

  // ========== 不安全的提取方式（已禁用）：DOM 扫描 + PerformanceObserver ==========
  // 这些方式提取到的视频 URL 可能带水印，且滚动页面时会误触发
  // 只依赖 chain/single + fallback_api 通道获取无水印视频

  window.__scanVideos = function() {
    console.log("[dewatermark] __scanVideos called (disabled — use chain/single fallback_api only)");
    // 仅保留诊断日志，不再提取视频
  };

  // ========== 初始化 ==========

  console.log("[dewatermark] Content script loaded (fallback_api + AES-CBC) for account:", window.__EMBEDDED_ACCOUNT_ID__);

  // 页面加载完成后，尝试从初始 _ROUTER_DATA 提取（如果已存在）
  function onPageReady() {
    console.log("[dewatermark] Page ready, scanning initial data...");
    setTimeout(function() {
      try {
        var routerData = window._ROUTER_DATA;
        if (routerData) {
          var rawBody = JSON.stringify(routerData);
          extractAndPublish(routerData, rawBody, "initial_router_data");
        }
      } catch (e) {}
    }, 2000);
  }

  if (document.readyState === "complete") {
    onPageReady();
  } else {
    window.addEventListener("load", onPageReady, { once: true });
    setTimeout(function() {
      if (document.readyState === "complete") onPageReady();
    }, 5000);
  }

})();
