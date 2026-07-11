// ========== Debugger API 拦截器 ==========
// 通过 Chrome Debugger 协议拦截 doubao.com / dola.com 的网络请求
// 功能：替换 skill/pack 响应以启用 15s 时长，拦截 chain/single 提取媒体资源

const DEBUGGER_VERSION = "1.3";
const DOUBAO_SKILL_PACK_URL_PART = "doubao.com/samantha/skill/pack";
const DOLA_SKILL_PACK_URL_PART = "dola.com/samantha/skill/pack";
const ACTION_BAR_CONF_URL_PART = ".com/alice/slot/action_bar_v3/get_item_conf";
const DOUBAO_CHAIN_SINGLE_URL_PART = "doubao.com/im/chain/single";
const DOLA_CHAIN_SINGLE_URL_PART = "dola.com/im/chain/single";
const QAAB_SALT_HEX = "4dd4c2e6b83162090e52b3c7a6733ba4"
  + "1cb2462b829ab58a196b39db57177524"
  + "f49baf7f08e8d68d26a72e37c1a95a2f"
  + "1f05a51892aef2949732b62a38aadd58";

const fetchPatterns = [
  { urlPattern: `*${DOUBAO_SKILL_PACK_URL_PART}*`, requestStage: "Request" },
  { urlPattern: `*${DOLA_SKILL_PACK_URL_PART}*`, requestStage: "Request" },
  { urlPattern: `*${ACTION_BAR_CONF_URL_PART}*`, requestStage: "Response" },
  { urlPattern: `*${DOUBAO_CHAIN_SINGLE_URL_PART}*`, requestStage: "Response" },
  { urlPattern: `*${DOLA_CHAIN_SINGLE_URL_PART}*`, requestStage: "Response" }
];

const _attachedTabs = new Set();
const _responseFileBodyPromises = new Map();

// ========== 附加到已有标签页 ==========
async function _attachExistingTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id && _shouldAttachToTab(tab.url)) {
      _ensureAttached(tab.id);
    }
  }
}

async function _safeGetTab(tabId) {
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return null;
  }
}

function _shouldAttachToTab(url) {
  return typeof url === "string"
    && /^https?:\/\//i.test(url)
    && (url.includes("doubao.com") || url.includes("dola.com"));
}

async function _ensureAttached(tabId) {
  if (_attachedTabs.has(tabId)) return;

  try {
    await _attachDebugger(tabId);
  } catch (error) {
    console.warn("[Debugger] attach failed:", error.message || error);
  }

  try {
    await _sendCommand(tabId, "Fetch.enable", { patterns: fetchPatterns });
    _attachedTabs.add(tabId);
    _setBadge(tabId, "ON");
  } catch (error) {
    console.warn("[Debugger] Fetch.enable failed:", error.message || error);
    _setBadge(tabId, "");
  }
}

function _attachDebugger(tabId) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, DEBUGGER_VERSION, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

function _sendCommand(tabId, method, params = {}) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(result);
    });
  });
}

function _corsHeaders() {
  return [
    { name: "access-control-allow-origin", value: "*" },
    { name: "access-control-allow-credentials", value: "true" },
    { name: "access-control-allow-methods", value: "GET, POST, OPTIONS" },
    { name: "access-control-allow-headers", value: "*" }
  ];
}

function _toBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function _fromBase64Utf8(base64Text) {
  const binary = atob(base64Text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function _isHttpUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

function _responseHeadersForTextBody(headers, body) {
  const contentLength = String(new TextEncoder().encode(body).length);
  const nextHeaders = [];
  let hasContentType = false;
  let hasContentLength = false;

  for (const header of headers) {
    const name = header.name || "";
    const lowerName = name.toLowerCase();
    if (lowerName === "content-encoding") continue;
    if (lowerName === "content-type") {
      hasContentType = true;
      nextHeaders.push({ name, value: "application/json; charset=utf-8" });
      continue;
    }
    if (lowerName === "content-length") {
      hasContentLength = true;
      nextHeaders.push({ name, value: contentLength });
      continue;
    }
    nextHeaders.push(header);
  }

  if (!hasContentType) nextHeaders.push({ name: "content-type", value: "application/json; charset=utf-8" });
  if (!hasContentLength) nextHeaders.push({ name: "content-length", value: contentLength });
  return nextHeaders;
}

function _setBadge(tabId, text) {
  chrome.action.setBadgeText({ tabId, text }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#166534" }).catch(() => {});
}

function _getResponseFileBody(fileName) {
  if (!_responseFileBodyPromises.has(fileName)) {
    _responseFileBodyPromises.set(fileName, fetch(chrome.runtime.getURL(fileName)).then((r) => r.text()));
  }
  return _responseFileBodyPromises.get(fileName);
}

// ========== JSON 遍历工具 ==========
function _walkJsonAndStrings(value, visitor, seen = new Set()) {
  if (value == null) return;
  if (typeof value === "string") {
    const parsed = _parseJsonString(value);
    if (parsed !== null) _walkJsonAndStrings(parsed, visitor, seen);
    return;
  }
  if (typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  visitor(value);
  if (Array.isArray(value)) {
    for (const item of value) _walkJsonAndStrings(item, visitor, seen);
    return;
  }
  for (const key of Object.keys(value)) _walkJsonAndStrings(value[key], visitor, seen);
}

function _parseJsonString(text) {
  const trimmed = text.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return null;
  try { return JSON.parse(trimmed); } catch { return null; }
}

function _findValuesByKey(value, targetKey) {
  const values = [];
  _walkJsonAndStrings(value, (node) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    if (Object.prototype.hasOwnProperty.call(node, targetKey)) values.push(node[targetKey]);
  });
  return values;
}

function _findImageOriRawUrls(value) {
  const urls = [];
  _walkJsonAndStrings(value, (node) => {
    if (node && typeof node === "object" && !Array.isArray(node)) {
      const image = node.image_ori_raw;
      if (image && typeof image === "object" && _isHttpUrl(image.url)) urls.push(image.url);
    }
  });
  return urls;
}

// ========== 处理拦截请求 ==========
async function _handlePausedRequest(tabId, event) {
  const requestId = event.requestId;
  const request = event.request || {};
  const url = request.url || "";

  try {
    if (url.includes(DOUBAO_SKILL_PACK_URL_PART)) {
      await _fulfillJsonFile(tabId, requestId, request.method, "doubao-skill-pack-response.json");
      return;
    }
    if (url.includes(DOLA_SKILL_PACK_URL_PART)) {
      await _fulfillJsonFile(tabId, requestId, request.method, "dola-skill-pack-response.json");
      return;
    }
    if (url.includes(ACTION_BAR_CONF_URL_PART)) {
      await _rewriteActionBarConfigResponse(tabId, event);
      return;
    }
    if (url.includes(DOUBAO_CHAIN_SINGLE_URL_PART)) {
      await _inspectChainSingleResponse(tabId, event, "doubao");
      return;
    }
    if (url.includes(DOLA_CHAIN_SINGLE_URL_PART)) {
      await _inspectChainSingleResponse(tabId, event, "dola");
      return;
    }
    await _continueRequest(tabId, requestId);
  } catch (error) {
    console.warn("[Debugger] request handling failed:", error.message || error);
    await _continueRequest(tabId, requestId).catch(() => {});
  }
}

async function _fulfillJsonFile(tabId, requestId, method, fileName) {
  if ((method || "").toUpperCase() === "OPTIONS") {
    await _sendCommand(tabId, "Fetch.fulfillRequest", {
      requestId,
      responseCode: 204,
      responsePhrase: "No Content",
      responseHeaders: _corsHeaders()
    });
    return;
  }
  const body = await _getResponseFileBody(fileName);
  await _sendCommand(tabId, "Fetch.fulfillRequest", {
    requestId,
    responseCode: 200,
    responsePhrase: "OK",
    responseHeaders: _responseHeadersForTextBody(_corsHeaders(), body),
    body: _toBase64Utf8(body)
  });
}

async function _continueRequest(tabId, requestId) {
  return _sendCommand(tabId, "Fetch.continueRequest", { requestId });
}

async function _rewriteActionBarConfigResponse(tabId, event) {
  const response = await _getPausedResponseBody(tabId, event.requestId);
  const patchedBody = _patchActionBarDuration(response.body);
  await _sendCommand(tabId, "Fetch.fulfillRequest", {
    requestId: event.requestId,
    responseCode: event.responseStatusCode || 200,
    responsePhrase: event.responseStatusText || "OK",
    responseHeaders: _responseHeadersForTextBody(event.responseHeaders || [], patchedBody),
    body: _toBase64Utf8(patchedBody)
  });
}

async function _inspectChainSingleResponse(tabId, event, source) {
  const response = await _getPausedResponseBody(tabId, event.requestId);
  let items = [];
  try {
    const json = JSON.parse(response.body);
    if (source === "doubao") {
      items = await _extractDoubaoItems(json, response.body);
    } else {
      items = _extractDolaItems(json);
    }
  } catch (error) {
    console.warn(`[Debugger] ${source} chain parse failed:`, error.message || error);
  }

  if (items.length) {
    _sendToTab(tabId, { type: "MEDIA_FOUND", items });
  }

  await _sendCommand(tabId, "Fetch.fulfillRequest", {
    requestId: event.requestId,
    responseCode: event.responseStatusCode || 200,
    responsePhrase: event.responseStatusText || "OK",
    responseHeaders: _responseHeadersForTextBody(event.responseHeaders || [], response.body),
    body: _toBase64Utf8(response.body)
  });
}

async function _getPausedResponseBody(tabId, requestId) {
  const r = await _sendCommand(tabId, "Fetch.getResponseBody", { requestId });
  return { body: r.base64Encoded ? _fromBase64Utf8(r.body) : r.body };
}

function _sendToTab(tabId, message) {
  try { chrome.tabs.sendMessage(tabId, message).catch(() => {}); } catch (e) {}
}

// ========== 豆包资源提取 ==========
async function _extractDoubaoItems(json, rawBody) {
  const items = [];
  const seenUrls = new Set();

  for (const url of _findImageOriRawUrls(json)) {
    _addItem(items, seenUrls, "image", url);
  }

  for (const fallbackApi of _findDoubaoFallbackApis(json, rawBody)) {
    const videoUrl = await _getDoubaoVideoUrlFromFallbackApi(fallbackApi);
    _addItem(items, seenUrls, "video", videoUrl);
  }

  return items;
}

function _findDoubaoFallbackApis(json, rawBody) {
  const apis = new Set();
  for (const value of _findValuesByKey(json, "fallback_api")) {
    _addFallbackApi(apis, value);
  }
  const patterns = [
    /fallback_api\\":\\"(.*?)\\"/g,
    /"fallback_api"\s*:\s*"([^"]+)"/g
  ];
  for (const pattern of patterns) {
    let match = pattern.exec(rawBody);
    while (match) {
      _addFallbackApi(apis, _decodeJsonEscapedFragment(match[1]));
      match = pattern.exec(rawBody);
    }
  }
  return Array.from(apis);
}

function _addFallbackApi(apis, value) {
  if (typeof value !== "string" || !value) return;
  const url = _decodeJsonEscapedFragment(value);
  if (_isHttpUrl(url)) apis.add(url);
}

function _decodeJsonEscapedFragment(value) {
  let text = value;
  for (let i = 0; i < 3; i++) {
    try {
      const decoded = JSON.parse(`"${text.replace(/"/g, '\\"')}"`);
      if (decoded === text) break;
      text = decoded;
    } catch { break; }
  }
  return text.replace(/\\u0026/g, "&").replace(/\\\//g, "/");
}

async function _getDoubaoVideoUrlFromFallbackApi(fallbackApi) {
  try {
    const url = _replaceQueryParams(fallbackApi, {
      channel: "no",
      codec_type: "8",
      logo_type: "unwatermarked"
    });
    const response = await fetch(url, {
      method: "GET",
      credentials: "omit",
      headers: { "accept": "application/json,text/plain,*/*" }
    });
    const payload = await response.json();
    const data = _getVideoData(payload);
    const token = _pickMainUrlToken(data);
    if (!token) return "";
    return await _decodeMainUrl(token, _findKeySeedDeep(payload));
  } catch (error) {
    console.warn("[Debugger] doubao fallback_api failed:", error.message || error);
    return "";
  }
}

function _replaceQueryParams(url, params) {
  const parsedUrl = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    parsedUrl.searchParams.set(key, value);
  }
  return parsedUrl.toString();
}

function _getVideoData(payload) {
  const videoInfo = payload?.video_info || payload?.data?.video_info || payload;
  const data = videoInfo?.data || videoInfo;
  return data && typeof data === "object" ? data : {};
}

function _pickMainUrlToken(data) {
  const videoList = data?.video_list;
  const entries = videoList && typeof videoList === "object" && Object.keys(videoList).length
    ? Object.values(videoList)
    : [data];
  let best = null;
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const token = entry.main_url || entry.play_url || "";
    if (typeof token !== "string" || !token.trim()) continue;
    const score = Number(entry.bitrate || entry.real_bitrate || 0)
      + Number(entry.vwidth || entry.width || 0) * Number(entry.vheight || entry.height || 0);
    if (!best || score > best.score) best = { token: token.trim(), score };
  }
  return best ? best.token : "";
}

function _findKeySeedDeep(value, depth = 0) {
  if (depth > 10 || value == null) return "";
  if (typeof value === "string") {
    let match = value.match(/(?:^|[?&])key_seed=([^&"'<>\\\s]+)/i);
    if (match) return decodeURIComponent(match[1]);
    match = value.match(/["']key_seed["']\s*:\s*["']([^"']+)/i);
    return match ? decodeURIComponent(match[1]) : "";
  }
  if (typeof value !== "object") return "";
  if (typeof value.key_seed === "string" && value.key_seed.trim()) return value.key_seed.trim();
  for (const item of Object.values(value)) {
    const hit = _findKeySeedDeep(item, depth + 1);
    if (hit) return hit;
  }
  return "";
}

async function _decodeMainUrl(token, keySeed = "") {
  if (_isHttpUrl(token)) return token;
  const plainUrl = _tryDecodeBase64Url(token);
  if (plainUrl) return plainUrl;
  if (token.startsWith("qAAB") && keySeed) return await _decodeQaabToken(token, keySeed);
  return "";
}

function _tryDecodeBase64Url(token) {
  const bytes = _base64DecodeLoose(token);
  if (!bytes) return "";
  const text = _asciiUrlFromBytes(bytes);
  return _isHttpUrl(text) ? text : "";
}

function _base64DecodeLoose(text) {
  const input = String(text || "").trim();
  const variants = [
    input,
    input.replace(/[$@#]/g, (c) => ({ "$": "_", "@": "/", "#": "." }[c])),
    input.replace(/[$@#]/g, (c) => ({ "$": "+", "@": "/", "#": "=" }[c]))
  ];
  const seen = new Set();
  for (const candidate of variants) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      const normalized = _padBase64(candidate).replace(/-/g, "+").replace(/_/g, "/");
      const binary = atob(normalized);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    } catch {}
  }
  return null;
}

function _padBase64(text) {
  const pad = (4 - (text.length % 4)) % 4;
  return text + "=".repeat(pad);
}

function _asciiUrlFromBytes(bytes) {
  if (!bytes || !bytes.length) return "";
  for (const byte of bytes) {
    if (byte !== 9 && byte !== 10 && byte !== 13 && (byte < 32 || byte > 126)) return "";
  }
  return new TextDecoder().decode(bytes);
}

async function _decodeQaabToken(token, keySeed) {
  const data = _base64DecodeLoose(token);
  const seed = _base64DecodeLoose(keySeed);
  if (!data || !seed) return "";
  const digest1 = await crypto.subtle.digest("SHA-512", seed.slice(0, 32));
  const salt = _hexToBytes(QAAB_SALT_HEX);
  const digest2Input = _concatBytes(new Uint8Array(digest1), salt);
  const digest2 = new Uint8Array(await crypto.subtle.digest("SHA-512", digest2Input));
  const key = digest2.slice(0, 16);
  const iv = digest2.slice(16, 32);
  const attempts = [];
  if (data.length >= 4 && data[0] === 0xa8 && data[1] === 0x00 && data[2] === 0x01 && data[3] === 0x00) {
    attempts.push({ payload: data.slice(4), key, iv });
    attempts.push({ payload: data.slice(4), key: iv, iv: key });
    if (data.length > 36) {
      attempts.push({ payload: data.slice(36), key, iv: data.slice(20, 36) });
      attempts.push({ payload: data.slice(36), key, iv });
    }
  } else {
    attempts.push({ payload: data, key, iv });
  }
  for (const attempt of attempts) {
    const url = await _decryptAesCbcUrl(attempt.payload, attempt.key, attempt.iv);
    if (url) return url;
  }
  return "";
}

async function _decryptAesCbcUrl(payload, keyBytes, ivBytes) {
  if (!payload.length || payload.length % 16 !== 0) return "";
  try {
    const key = await crypto.subtle.importKey("raw", keyBytes, "AES-CBC", false, ["decrypt"]);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv: ivBytes }, key, payload));
    const direct = _asciiUrlFromBytes(plain);
    if (_isHttpUrl(direct)) return direct;
    const stripped = _stripPkcs7(plain);
    const url = _asciiUrlFromBytes(stripped);
    return _isHttpUrl(url) ? url : "";
  } catch { return ""; }
}

function _stripPkcs7(bytes) {
  if (!bytes || !bytes.length) return new Uint8Array();
  const pad = bytes[bytes.length - 1];
  if (pad < 1 || pad > 16 || pad > bytes.length) return bytes;
  for (let i = bytes.length - pad; i < bytes.length; i++) {
    if (bytes[i] !== pad) return bytes;
  }
  return bytes.slice(0, bytes.length - pad);
}

function _hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function _concatBytes(first, second) {
  const bytes = new Uint8Array(first.length + second.length);
  bytes.set(first, 0);
  bytes.set(second, first.length);
  return bytes;
}

// ========== Dola 资源提取 ==========
function _extractDolaItems(json) {
  const items = [];
  const seenUrls = new Set();

  for (const url of _findImageOriRawUrls(json)) {
    _addItem(items, seenUrls, "image", url);
  }

  for (const encodedUrl of _findDolaEncodedVideoUrls(json)) {
    const url = _decodeBase64Url(encodedUrl);
    _addItem(items, seenUrls, "video", url);
  }

  return items;
}

function _findDolaEncodedVideoUrls(json) {
  const values = [];
  for (const value of _findValuesByKey(json, "man_url")) values.push(value);
  for (const value of _findValuesByKey(json, "main_url")) values.push(value);
  return values;
}

function _decodeBase64Url(value) {
  if (typeof value !== "string" || !value) return "";
  if (_isHttpUrl(value)) return value;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const decoded = _fromBase64Utf8(padded);
    return _isHttpUrl(decoded) ? decoded : "";
  } catch { return ""; }
}

// ========== 时长补丁 ==========
function _patchActionBarDuration(body) {
  try {
    const json = JSON.parse(body);
    const changed = _patchNestedJsonStrings(json);
    return changed ? JSON.stringify(json) : body;
  } catch (error) {
    console.warn("[Debugger] patch action bar duration failed:", error.message || error);
    return body;
  }
}

function _patchNestedJsonStrings(value, seen = new Set()) {
  if (value == null || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  let changed = false;
  if (Array.isArray(value)) {
    for (const item of value) changed = _patchNestedJsonStrings(item, seen) || changed;
    return changed;
  }
  for (const key of Object.keys(value)) {
    const child = value[key];
    if (typeof child === "string") {
      const patchedString = _patchJsonStringDuration(child);
      if (patchedString !== child) { value[key] = patchedString; changed = true; }
    } else {
      changed = _patchNestedJsonStrings(child, seen) || changed;
    }
  }
  return changed;
}

function _patchJsonStringDuration(text) {
  if (!text || (!text.includes("时长") && !text.includes("鏃堕暱"))) return text;
  try {
    const json = JSON.parse(text);
    const changed = _patchDurationSelector(json);
    return changed ? JSON.stringify(json) : text;
  } catch { return text; }
}

function _patchDurationSelector(value, seen = new Set()) {
  if (value == null || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  let changed = false;
  if (Array.isArray(value)) {
    for (const item of value) changed = _patchDurationSelector(item, seen) || changed;
    return changed;
  }
  if ((value.label === "时长" || value.label === "鏃堕暱") && Array.isArray(value.option_list)) {
    const has15s = value.option_list.some((o) => o && o.option_key === "15");
    if (!has15s) {
      const tenIdx = value.option_list.findIndex((o) => o && o.option_key === "10");
      const insertAt = tenIdx >= 0 ? tenIdx + 1 : value.option_list.length;
      const maxId = value.option_list.reduce((max, o) => { const id = Number(o?.id); return Number.isFinite(id) ? Math.max(max, id) : max; }, 0);
      value.option_list.splice(insertAt, 0, { id: maxId + 1, display_text: "15s", message_text: "", option_key: "15" });
      changed = true;
    }
  }
  for (const key of Object.keys(value)) {
    const child = value[key];
    if (typeof child === "string") {
      const patchedString = _patchJsonStringDuration(child);
      if (patchedString !== child) { value[key] = patchedString; changed = true; }
    } else {
      changed = _patchDurationSelector(child, seen) || changed;
    }
  }
  return changed;
}

function _addItem(items, seenUrls, type, url) {
  if (!_isHttpUrl(url) || seenUrls.has(url)) return;
  seenUrls.add(url);
  items.push({ type, url });
}

// ========== 调试器事件监听 ==========
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await _safeGetTab(tabId);
  if (tab && _shouldAttachToTab(tab.url)) _ensureAttached(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab.url;
  if (_shouldAttachToTab(url)) _ensureAttached(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  _attachedTabs.delete(tabId);
});

chrome.action.onClicked.addListener((tab) => {
  if (tab && tab.id) _ensureAttached(tab.id);
});

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId) {
    _attachedTabs.delete(source.tabId);
    _setBadge(source.tabId, "");
  }
});

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (method === "Fetch.requestPaused" && source.tabId && params) {
    _handlePausedRequest(source.tabId, params);
  }
});
