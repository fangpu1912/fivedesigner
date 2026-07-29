(function () {
  const SCRIPT_VERSION = '2026-07-04-creation-download-info-v19-wait-video-node-info';
  const CREATION_VIDEO_RESOURCE_LIMIT = 10;
  const DOUBAO_CREATION_SCAN_URL = 'https://www.doubao.com/chat/create-image?tab=myCreation';
  if (window.__AIAM_DOUBAO_CREATION_DOWNLOAD__ === SCRIPT_VERSION) return;
  window.__AIAM_DOUBAO_CREATION_DOWNLOAD__ = SCRIPT_VERSION;

  if (!/(^|\.)doubao\.com$/i.test(location.hostname)) return;

  function isCreationPageLocation() {
    return /\/chat\/create-image/i.test(location.pathname) && /(?:^|[?&])tab=myCreation(?:&|$)/i.test(location.search || '');
  }

  // 豆包管理器会在普通聊天页复用作品节点解析器，为每个视频卡片提供官方原片下载。

  const STYLE_ID = 'aiam-doubao-creation-download-style';
  const PANEL_CLASS = 'aiam-doubao-creation-panel';
  const STATUS_CLASS = 'aiam-doubao-creation-status';
  const HIT_CLASS = 'aiam-doubao-creation-hit';
  const DBM_BUTTON_CLASS = 'dbm-doubao-no-watermark-download';
  let selectionMode = false;
  let hoverNode = null;
  let pendingRevealToken = 0;
  let creationNodeCache = { time: 0, nodes: [] };
  let creationNodePageDebug = [];

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${PANEL_CLASS} {
        position: fixed !important;
        right: 24px !important;
        top: 82px !important;
        z-index: 2147483647 !important;
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        padding: 8px !important;
        border-radius: 12px !important;
        background: rgba(255,255,255,.96) !important;
        color: #111827 !important;
        box-shadow: 0 12px 32px rgba(15,23,42,.18) !important;
        border: 1px solid rgba(15,23,42,.08) !important;
        font-size: 13px !important;
      }
      .${PANEL_CLASS} button {
        height: 32px !important;
        padding: 0 12px !important;
        border: none !important;
        border-radius: 999px !important;
        background: #111827 !important;
        color: #fff !important;
        font-size: 13px !important;
        font-weight: 700 !important;
        cursor: pointer !important;
      }
      .${PANEL_CLASS} span { color: #64748b !important; white-space: nowrap !important; }
      .${STATUS_CLASS} {
        position: fixed !important;
        right: 24px !important;
        top: 132px !important;
        z-index: 2147483647 !important;
        max-width: 420px !important;
        padding: 9px 13px !important;
        border-radius: 999px !important;
        background: rgba(17,24,39,.92) !important;
        color: #fff !important;
        font-size: 13px !important;
        line-height: 1.35 !important;
        pointer-events: none !important;
        box-shadow: 0 10px 26px rgba(0,0,0,.24) !important;
      }
      .${HIT_CLASS} {
        outline: 3px solid #2563eb !important;
        outline-offset: -3px !important;
        box-shadow: inset 0 0 0 9999px rgba(37,99,235,.10) !important;
      }
      html.aiam-doubao-creation-select * { cursor: crosshair !important; }
      .${DBM_BUTTON_CLASS} {
        position: absolute !important;
        right: 12px !important;
        bottom: 12px !important;
        z-index: 2147483646 !important;
        min-width: 104px !important;
        height: 34px !important;
        padding: 0 13px !important;
        border: 1px solid rgba(255,255,255,.34) !important;
        border-radius: 999px !important;
        background: rgba(12,18,28,.88) !important;
        color: #8ff0ce !important;
        box-shadow: 0 6px 18px rgba(0,0,0,.28) !important;
        backdrop-filter: blur(8px) !important;
        font: 600 13px/32px "Microsoft YaHei UI",sans-serif !important;
        cursor: pointer !important;
      }
      .${DBM_BUTTON_CLASS}:hover { background: rgba(24,78,63,.94) !important; }
      .${DBM_BUTTON_CLASS}:disabled { cursor: wait !important; opacity: .78 !important; }
    `;
    document.documentElement.appendChild(style);
  }

  function showStatus(text) {
    installStyle();
    let node = document.querySelector(`.${STATUS_CLASS}`);
    if (!node) {
      node = document.createElement('div');
      node.className = STATUS_CLASS;
      document.documentElement.appendChild(node);
    }
    node.textContent = text;
    clearTimeout(node.__timer);
    node.__timer = setTimeout(() => node.remove(), 3200);
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function setSelectionMode(active) {
    selectionMode = Boolean(active);
    document.documentElement.classList.toggle('aiam-doubao-creation-select', selectionMode);
    if (!selectionMode && hoverNode) {
      hoverNode.classList.remove(HIT_CLASS);
      hoverNode = null;
    }
    updatePanel();
    if (selectionMode) showStatus('请选择一个豆包 AI 创作视频卡片');
  }

  function updatePanel() {
    const panel = document.querySelector(`.${PANEL_CLASS}`);
    if (!panel) return;
    const button = panel.querySelector('button');
    const label = panel.querySelector('span');
    if (button) button.textContent = selectionMode ? '选择中...' : '选择视频下载原视频';
    if (label) label.textContent = selectionMode ? '现在点一个视频作品' : '只下载明确无水印的视频字段';
  }

  function ensurePanel() {
    installStyle();
    let panel = document.querySelector(`.${PANEL_CLASS}`);
    if (panel) {
      updatePanel();
      return panel;
    }
    panel = document.createElement('div');
    panel.className = PANEL_CLASS;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '选择视频下载原视频';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setSelectionMode(!selectionMode);
    }, true);
    const label = document.createElement('span');
    label.textContent = '只下载明确无水印的视频字段';
    panel.append(button, label);
    document.documentElement.appendChild(panel);
    return panel;
  }

  function visible(node) {
    if (!node || !node.isConnected) return false;
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return rect.width >= 48 && rect.height >= 48 &&
      rect.bottom > 0 && rect.right > 0 &&
      rect.top < window.innerHeight && rect.left < window.innerWidth &&
      style.display !== 'none' && style.visibility !== 'hidden';
  }

  function getCard(node) {
    let current = node;
    let best = node;
    let bestArea = Number.POSITIVE_INFINITY;
    for (let level = 0; current && current !== document.body && level < 10; level += 1) {
      if (visible(current)) {
        const rect = current.getBoundingClientRect();
        if (rect.width >= 120 && rect.height >= 120 && rect.width <= 680 && rect.height <= 680) {
          const area = rect.width * rect.height;
          if (area < bestArea) {
            best = current;
            bestArea = area;
          }
        }
      }
      current = current.parentElement;
    }
    return best;
  }

  function getNodeAtPoint(event) {
    const elements = document.elementsFromPoint?.(event.clientX, event.clientY) || [];
    const candidates = elements.filter(node => {
      if (!(node instanceof Element)) return false;
      if (node.closest(`.${PANEL_CLASS},.${STATUS_CLASS}`)) return false;
      if (node.tagName === 'VIDEO' || node.tagName === 'IMG') return visible(node);
      if (node.querySelector?.('video,img') && visible(node)) return true;
      return false;
    });
    const target = candidates.find(node => {
      const src = String(node.currentSrc || node.src || '');
      return (node.tagName === 'VIDEO' || node.tagName === 'IMG') && src && !src.startsWith('data:');
    }) || candidates[0];
    return target ? getCard(target) : null;
  }

  function findFiberRecords(node) {
    const records = [];
    const seen = new WeakSet();
    let current = node;
    while (current && current !== document.documentElement) {
      const fiberKey = Object.keys(current).find(key => key.startsWith('__reactFiber') || key.startsWith('__reactProps'));
      let fiber = fiberKey ? current[fiberKey] : null;
      let guard = 0;
      while (fiber && guard < 80) {
        guard += 1;
        const props = fiber.memoizedProps || fiber.pendingProps || fiber;
        collectRecordLike(props, records, seen, 0);
        fiber = fiber.return;
      }
      current = current.parentElement;
    }
    return records;
  }

  function collectRecordLike(value, out, seen, depth) {
    if (!value || typeof value !== 'object' || depth > 5 || seen.has(value)) return;
    seen.add(value);
    const keys = Object.keys(value);
    const keyText = keys.join(' ').toLowerCase();
    if (/video|media|creation|item|work|asset|download|origin|original|play|url/.test(keyText)) {
      out.push(value);
    }
    for (const key of keys.slice(0, 80)) {
      const child = value[key];
      if (child && typeof child === 'object') collectRecordLike(child, out, seen, depth + 1);
    }
  }

  function normalizeUrl(value) {
    if (typeof value !== 'string') return '';
    const text = value.trim().replace(/\\u0026/g, '&').replace(/&amp;/g, '&');
    if (/^https?:\/\//i.test(text)) return text;
    return '';
  }

  function getCoverKey(url) {
    const text = normalizeUrl(url);
    if (!text) return '';
    try {
      const parsed = new URL(text, location.href);
      return decodeURIComponent(parsed.pathname).replace(/~[^/]*$/, '').toLowerCase();
    } catch (e) {
      return text.split('?')[0].replace(/~[^/]*$/, '').toLowerCase();
    }
  }

  function isVideoUrl(url, path) {
    return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url) ||
      /\/video\//i.test(url) ||
      /video|play_url|main_url|backup_url|download_url|source_url|origin_url|original_url|raw_url|master_url/i.test(path);
  }

  function getVideoRejectReason(url, path) {
    const text = `${path} ${url}`.toLowerCase();
    if (/with_watermark=1|with_watermark=true|wm=1|watermark=true|no_watermark=false|aigc_busi_mark|aigc_resize_mark/.test(text)) {
      return 'watermark-signal';
    }
    if (/thumb|cover|poster|preview/.test(text) && !/download|origin|original|source|raw|master/i.test(text)) {
      return 'preview-only';
    }
    return '';
  }

  function isRejectedVideoUrl(url, path) {
    return Boolean(getVideoRejectReason(url, path));
  }

  function scoreVideoUrl(url, path) {
    const text = `${path} ${url}`.toLowerCase();
    let score = 0;
    if (/no[_-]?watermark|without[_-]?watermark|logo_type=no_watermark|watermark=false/.test(text)) score += 200;
    if (/origin|original|source|raw|master|download/.test(text)) score += 80;
    if (/main_url|play_url|video_url/.test(text)) score += 30;
    if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url)) score += 20;
    if (/backup|thumb|cover|poster|preview/.test(text)) score -= 40;
    return score;
  }

  function getDoubaoApiUrl(apiPath) {
    const path = String(apiPath || '');
    if (/^https?:\/\//i.test(path)) return path;
    try {
      const entries = performance.getEntriesByType?.('resource') || [];
      for (const entry of entries.slice().reverse()) {
        const url = String(entry.name || '');
        if (url.includes(path)) return url;
      }
      const samanthaEntry = entries.slice().reverse().find(entry => /\/samantha\//.test(String(entry.name || '')));
      if (samanthaEntry?.name) {
        const parsed = new URL(samanthaEntry.name);
        parsed.pathname = path;
        return parsed.href;
      }
    } catch (e) {}
    return path;
  }

  function analyzeVideoUrl(url, path) {
    const rejectReason = getVideoRejectReason(url, path);
    return {
      url,
      path,
      score: scoreVideoUrl(url, path),
      rejectReason,
      accepted: !rejectReason
    };
  }

  function collectVideoUrls(value, path, out, seen, depth = 0, includeRejected = false) {
    if (depth > 12 || value == null) return;
    if (typeof value === 'string') {
      const url = normalizeUrl(value);
      if (!url || !isVideoUrl(url, path)) return;
      const item = analyzeVideoUrl(url, path);
      if (!includeRejected && !item.accepted) return;
      out.push(item);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => collectVideoUrls(item, `${path}[${index}]`, out, seen, depth + 1, includeRejected));
      return;
    }
    if (typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      collectVideoUrls(child, path ? `${path}.${key}` : key, out, seen, depth + 1, includeRejected);
    }
  }

  function pickBestVideo(records) {
    const candidates = [];
    for (const record of records) collectVideoUrls(record, '', candidates, new WeakSet());
    const deduped = [];
    const seen = new Set();
    for (const item of candidates) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      deduped.push(item);
    }
    return deduped.filter(item => item.accepted).sort((a, b) => b.score - a.score)[0] || null;
  }

  function collectNodeIds(value, out, seen, depth = 0) {
    if (depth > 8 || value == null || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    const direct = value.node_id || value.nodeId || value.node_id_str || value.nodeIdStr;
    const mediaNodeId = value.id && typeof value.key === 'string' && /^v\d/i.test(value.key)
      ? value.id
      : '';
    if (/^\d{8,}$/.test(String(direct || ''))) out.push(String(direct));
    if (/^\d{8,}$/.test(String(mediaNodeId || ''))) out.push(String(mediaNodeId));
    if (Array.isArray(value)) {
      value.forEach(item => collectNodeIds(item, out, seen, depth + 1));
      return;
    }
    for (const child of Object.values(value).slice(0, 140)) {
      collectNodeIds(child, out, seen, depth + 1);
    }
  }

  function collectMessageIds(value, out, seen, depth = 0) {
    if (depth > 8 || value == null || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    const direct = value.message_id || value.messageId || value.message_id_str || value.messageIdStr;
    if (/^\d{8,}$/.test(String(direct || ''))) out.push(String(direct));
    for (const [key, child] of Object.entries(value)) {
      const text = typeof child === 'string' || typeof child === 'number' ? String(child) : '';
      if (text && text.length <= 180 && /(^|_|\b)(message_id|messageid|msg_id|msgid|creation_task_id|creationtaskid|task_id|taskid)(_|$|\b)/i.test(key)) {
        out.push(text.trim());
      }
      if (child && typeof child === 'object') collectMessageIds(child, out, seen, depth + 1);
    }
  }

  function collectResolvedNodeIds(value, out, seen, depth = 0) {
    if (depth > 8 || value == null || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    const direct = value.node_id || value.nodeId || value.node_id_str || value.nodeIdStr;
    if (/^\d{8,}$/.test(String(direct || ''))) out.push(String(direct));
    for (const [key, child] of Object.entries(value)) {
      const text = typeof child === 'string' || typeof child === 'number' ? String(child) : '';
      if (text && text.length <= 180 && /(^|_|\b)(node_id|nodeid)(_|$|\b)/i.test(key)) {
        out.push(text.trim());
      }
      if (child && typeof child === 'object') collectResolvedNodeIds(child, out, seen, depth + 1);
    }
  }

  async function resolveNodeIdsFromMessageIds(messageIds) {
    const ids = uniqueBy((messageIds || []).map(item => String(item || '').trim()).filter(item => /^\d{8,}$/.test(item)), item => item, 40);
    if (!ids.length) return [];
    const response = await fetch(getDoubaoApiUrl('/samantha/aispace/message_node_info'), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'agw-js-conv': 'str',
        origin: location.origin,
        referer: location.href
      },
      credentials: 'include',
      body: JSON.stringify({ message_ids: ids.map(item => Number(item)), message_ids_str: ids })
    });
    const json = await response.json();
    if (json.code !== 0) return [];
    const resolved = [];
    collectResolvedNodeIds(json?.data || json, resolved, new WeakSet());
    return uniqueBy(resolved, item => item, 40);
  }

  async function postJson(url, body) {
    const response = await fetch(getDoubaoApiUrl(url), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'agw-js-conv': 'str',
        origin: location.origin,
        referer: location.href
      },
      credentials: 'include',
      body: JSON.stringify(body || {})
    });
    const json = await response.json();
    if (json.code !== 0) throw new Error(json.msg || json.message || `接口返回 ${json.code}`);
    return json;
  }

  function collectCreationNodes(value, out, seen, depth = 0) {
    if (depth > 10 || !value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    const id = value.id != null ? String(value.id) : '';
    const key = value.key != null ? String(value.key) : '';
    const name = value.name != null ? String(value.name) : '';
    if (/^\d{8,}$/.test(id) && (key || name || value.node_type)) {
      const coverUrls = [];
      const cover = value.node_cover || value.nodeCover || {};
      const listCover = cover?.list_view?.cover_url || cover?.listView?.coverUrl || '';
      const thumbCover = cover?.thumbnail_view?.cover_url || cover?.thumbnailView?.coverUrl || '';
      if (listCover) coverUrls.push(String(listCover));
      if (thumbCover) coverUrls.push(String(thumbCover));
      out.push({
        id,
        key,
        name,
        nodeType: Number(value.node_type || value.nodeType || 0),
        messageId: String(value?.content?.message_id_str || value?.content?.message_id || ''),
        creationTaskId: String(value?.content?.creation_task_id_str || ''),
        coverUrl: coverUrls[0] || '',
        width: Number(value?.content?.width || value.width || 0),
        height: Number(value?.content?.height || value.height || 0),
        duration: Number(value?.content?.duration || value.duration || 0),
        size: Number(value.size || value?.content?.size || 0),
        coverKeys: uniqueBy(coverUrls.map(getCoverKey), item => item, 8)
      });
    }
    if (Array.isArray(value)) {
      value.forEach(item => collectCreationNodes(item, out, seen, depth + 1));
      return;
    }
    for (const child of Object.values(value).slice(0, 160)) {
      if (child && typeof child === 'object') collectCreationNodes(child, out, seen, depth + 1);
    }
  }

  async function fetchLatestUsedVideoNodes(limit = CREATION_VIDEO_RESOURCE_LIMIT) {
    const nodes = [];
    const payloads = [
      { nodeType: 6, size: Math.max(50, limit) },
      { node_type: 6, size: Math.max(50, limit) }
    ];
    for (const payload of payloads) {
      try {
        const info = await postJson('/samantha/aispace/node_lastest_used', payload);
        collectCreationNodes(info?.data || info, nodes, new WeakSet());
        const videos = uniqueBy(nodes.filter(isCreationVideoNode), item => item.id, limit);
        creationNodePageDebug.push({
          page: `latest_used_${payload.nodeType != null ? 'nodeType' : 'node_type'}`,
          sentCursor: '',
          added: videos.length,
          hasMore: Boolean(info?.data?.has_more || info?.data?.hasMore),
          nextCursor: String(info?.data?.next_cursor || info?.data?.nextCursor || '')
        });
        if (videos.length) return videos;
      } catch (e) {
        creationNodePageDebug.push({
          page: `latest_used_error_${payload.nodeType != null ? 'nodeType' : 'node_type'}`,
          sentCursor: '',
          added: 0,
          hasMore: false,
          nextCursor: '',
          error: e.message || String(e)
        });
      }
    }
    return [];
  }

  async function fetchCreationNodes(options = {}) {
    const force = Boolean(options.force);
    if (!force && Date.now() - creationNodeCache.time < 45000 && creationNodeCache.nodes.length) {
      return creationNodeCache.nodes;
    }
    const home = await postJson('/samantha/aispace/homepage', {});
    const homeNodes = [];
    collectCreationNodes(home?.data || home, homeNodes, new WeakSet());
    const root = homeNodes.find(item => /我的创作|鎴戠殑鍒涗綔/.test(String(item.name || ''))) ||
      homeNodes.find(item => item.nodeType === 1 && item.key === item.id) ||
      homeNodes[0];
    if (!root?.id) return [];
    creationNodePageDebug = [];
    const loadNodeInfoPages = async (attempt = 1) => {
      const nodes = [];
      let cursor = '';
      for (let page = 0; page < 8; page += 1) {
        const payload = {
          node_id: root.id,
          need_full_path: true,
          sort_param: {
            need_sort_config: true,
            sort_order: 1,
            sort_type: 0
          },
          size: 50
        };
        if (cursor) {
          payload.cursor = cursor;
          payload.next_cursor_with_sort = cursor;
        }
        const info = await postJson('/samantha/aispace/node_info', payload);
        const beforeCount = nodes.length;
        collectCreationNodes(info?.data || info, nodes, new WeakSet());
        const data = info?.data || {};
        creationNodePageDebug.push({
          page: attempt === 1 ? page + 1 : `retry_${attempt}_${page + 1}`,
          sentCursor: cursor,
          added: nodes.length - beforeCount,
          hasMore: Boolean(data.has_more),
          nextCursor: String(data.next_cursor || data.nextCursor || '')
        });
        cursor = String(data.next_cursor || data.nextCursor || '');
        if (!data.has_more || !cursor) break;
        if (nodes.some(isCreationVideoNode)) break;
      }
      return uniqueBy(nodes, item => item.id, 200);
    };

    let uniqueNodes = [];
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      uniqueNodes = await loadNodeInfoPages(attempt);
      if (uniqueNodes.some(isCreationVideoNode)) break;
      if (!collectVisibleCreationVideoCoverKeys().length) break;
      creationNodePageDebug.push({
        page: `wait_video_nodes_${attempt}`,
        sentCursor: '',
        added: 0,
        hasMore: false,
        nextCursor: ''
      });
      await delay(1800);
    }
    const finalNodes = uniqueNodes.some(isCreationVideoNode)
      ? uniqueNodes
      : await fetchLatestUsedVideoNodes(CREATION_VIDEO_RESOURCE_LIMIT);
    creationNodeCache = {
      time: Date.now(),
      nodes: finalNodes
    };
    return creationNodeCache.nodes;
  }

  function collectVisibleCreationVideoCoverKeys(limit = CREATION_VIDEO_RESOURCE_LIMIT * 3) {
    const mediaNodes = Array.from(document.querySelectorAll('img,video,source')).filter(visible);
    const keys = [];
    for (const node of mediaNodes) {
      const candidates = [
        node.currentSrc,
        node.src,
        node.poster,
        String(node.srcset || node.srcSet || '').split(',')[0]?.trim()?.split(/\s+/)[0]
      ];
      for (const url of candidates) {
        const key = getCoverKey(url || '');
        if (key && /tos-cn-p-9ecd54|tplv-noop|videoweb/i.test(String(url || ''))) keys.push(key);
      }
      if (keys.length >= limit) break;
    }
    return uniqueBy(keys, item => item, limit);
  }

  function collectVisibleCreationCoverKeys(limit = CREATION_VIDEO_RESOURCE_LIMIT * 3) {
    const videoKeys = collectVisibleCreationVideoCoverKeys(limit);
    if (videoKeys.length) return videoKeys;
    const mediaNodes = Array.from(document.querySelectorAll('img,video,source')).filter(visible);
    const keys = [];
    for (const node of mediaNodes) {
      const candidates = [
        node.currentSrc,
        node.src,
        node.poster,
        String(node.srcset || node.srcSet || '').split(',')[0]?.trim()?.split(/\s+/)[0]
      ];
      for (const url of candidates) {
        const key = getCoverKey(url || '');
        if (key) keys.push(key);
      }
      if (keys.length >= limit) break;
    }
    return uniqueBy(keys, item => item, limit);
  }

  function prioritizeNodesByVisibleOrder(nodes) {
    const coverKeys = collectVisibleCreationCoverKeys();
    if (!coverKeys.length) return nodes;
    return nodes.slice().sort((a, b) => {
      const ai = Math.min(...(a.coverKeys || []).map(key => coverKeys.indexOf(key)).filter(index => index >= 0), Number.POSITIVE_INFINITY);
      const bi = Math.min(...(b.coverKeys || []).map(key => coverKeys.indexOf(key)).filter(index => index >= 0), Number.POSITIVE_INFINITY);
      if (ai !== bi) return ai - bi;
      return 0;
    });
  }

  function collectCardCoverKeys(card) {
    const keys = [];
    const nodes = [];
    let current = card;
    for (let level = 0; current && current !== document.body && level < 7; level += 1) {
      nodes.push(current);
      if (current.querySelectorAll) nodes.push(...current.querySelectorAll('img,video,source'));
      current = current.parentElement;
    }
    for (const node of nodes) {
      const src = node.currentSrc || node.src || node.poster || '';
      const key = getCoverKey(src);
      if (key) keys.push(key);
      const srcset = String(node.srcset || node.srcSet || '');
      for (const part of srcset.split(',')) {
        const itemKey = getCoverKey(part.trim().split(/\s+/)[0]);
        if (itemKey) keys.push(itemKey);
      }
    }
    return uniqueBy(keys, item => item, 20);
  }

  async function resolveNodeIdsFromCreationList(card, messageIds = []) {
    const nodes = await fetchCreationNodes();
    const coverKeys = collectCardCoverKeys(card);
    const idSet = new Set((messageIds || []).map(item => String(item || '')));
    const matched = nodes.filter(item => {
      const coverMatched = coverKeys.some(key => item.coverKeys?.includes(key));
      const messageMatched = item.messageId && idSet.has(item.messageId);
      const taskMatched = item.creationTaskId && idSet.has(item.creationTaskId);
      return coverMatched || messageMatched || taskMatched;
    });
    return uniqueBy(matched
      .filter(item => item.nodeType === 6 || /^v\d/i.test(item.key) || /\.mp4$/i.test(item.name))
      .map(item => item.id), item => item, 20);
  }

  function isConfirmedNoWatermarkVideoUrl(url) {
    const text = String(url || '').toLowerCase();
    if (!text) return false;
    try {
      const parsed = new URL(url, location.href);
      if (/(^|[.-])videoweb-download\.doubao\.com$/i.test(parsed.hostname) && parsed.searchParams.get('download') === 'true') return true;
      if (/(^|[.-])videoweb\.doubao\.com$/i.test(parsed.hostname) && parsed.searchParams.get('download') === 'true') return true;
      if (parsed.hostname.includes('doubao.com') && parsed.pathname.includes('/download') && parsed.searchParams.get('download') === 'true') return true;
    } catch (e) {}
    return /download=true/.test(text) && /video_mp4|mime_type=video_mp4/.test(text);
  }

  async function getDownloadInfo(nodeId) {
    const id = String(nodeId || '').trim();
    if (!/^\d{8,}$/.test(id)) throw new Error('缺少作品节点ID');
    const response = await fetch(getDoubaoApiUrl('/samantha/aispace/get_download_info'), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'agw-js-conv': 'str',
        origin: location.origin,
        referer: location.href
      },
      credentials: 'include',
      body: JSON.stringify({ requests: [{ node_id: id }] })
    });
    const json = await response.json();
    if (json.code !== 0) throw new Error(json.msg || `接口返回 ${json.code}`);
    const info = json?.data?.download_infos?.[0];
    const mainUrl = info?.main_url || info?.mainUrl || '';
    const backupUrl = info?.backup_url || info?.backupUrl || '';
    if (!mainUrl) throw new Error('接口没有返回视频下载地址');
    if (!isConfirmedNoWatermarkVideoUrl(mainUrl)) throw new Error('接口返回的不是确认无水印下载流');
    return { mainUrl, backupUrl, nodeId: id };
  }

  async function getDownloadInfos(nodeIds) {
    const ids = uniqueBy((nodeIds || []).map(item => String(item || '').trim()).filter(item => /^\d{8,}$/.test(item)), item => item, 80);
    if (!ids.length) return [];
    const out = [];
    for (const nodeId of ids) {
      try {
        const info = await getDownloadInfo(nodeId);
        out.push({ nodeId, mainUrl: info.mainUrl, backupUrl: info.backupUrl || '', ok: true });
      } catch (error) {
        out.push({ nodeId, mainUrl: '', backupUrl: '', ok: false, error: error?.message || String(error) });
      }
    }
    return out;
  }

  function isCreationVideoNode(node) {
    if (!node) return false;
    return node.nodeType === 6 || /^v\d/i.test(String(node.key || '')) || /\.mp4$/i.test(String(node.name || ''));
  }

  function isOnCreationPage() {
    return /\/chat\/create-image/i.test(location.pathname) && /(?:^|[?&])tab=myCreation(?:&|$)/i.test(location.search || '');
  }

  function buildCreationVideoTitle(node, index) {
    const name = sanitizeFilename(node?.name || '');
    if (name && !/^video(?:\.mp4)?$/i.test(name)) return `豆包创作_${name}`;
    return `豆包创作原视频_${String(index + 1).padStart(3, '0')}`;
  }

  async function scanCreationVideosToResourcePanel() {
    if (!isOnCreationPage()) {
      showStatus('正在打开豆包“我的创作”页面，请稍后再点一次扫描');
      location.href = DOUBAO_CREATION_SCAN_URL;
      return { ok: false, count: 0, navigated: true };
    }
    showStatus('正在扫描豆包我的创作视频...');
    const allVideoNodes = prioritizeNodesByVisibleOrder((await fetchCreationNodes({ force: true })).filter(isCreationVideoNode));
    const nodes = allVideoNodes.slice(0, CREATION_VIDEO_RESOURCE_LIMIT);
    if (!nodes.length) {
      showStatus('没有扫描到豆包创作视频，请确认当前在“我的创作”页面');
      return { ok: false, count: 0 };
    }

    const downloadInfos = await getDownloadInfos(nodes.map(node => node.id));
    const infoByNodeId = new Map(downloadInfos.filter(info => info.ok).map(info => [info.nodeId, info]));
    const videos = [];
    nodes.forEach((node, index) => {
      const info = infoByNodeId.get(node.id);
      if (!info?.mainUrl) return;
      videos.push({
        vid: node.key || node.id,
        nodeId: node.id,
        title: buildCreationVideoTitle(node, index),
        thumbUrl: node.coverUrl || '',
        videoUrl: info.mainUrl,
        backupUrl: info.backupUrl || '',
        width: node.width || 0,
        height: node.height || 0,
        source: 'doubao-creation-resource-panel',
        replaceDoubaoCreationScan: true,
        definition: '原视频',
        confirmedNoWatermark: true
      });
    });

    if (!videos.length) {
      showStatus(`扫描到 ${allVideoNodes.length} 个视频，但最新 ${nodes.length} 个没有明确无水印下载流`);
      return { ok: false, count: 0 };
    }

    window.postMessage({ type: 'videoDataExtracted', data: videos }, '*');
    showStatus(`已加入右侧资源栏 ${videos.length} 个豆包最新原视频（最多 ${CREATION_VIDEO_RESOURCE_LIMIT} 个）`);
    return { ok: true, count: videos.length, totalVideoNodes: allVideoNodes.length, limit: CREATION_VIDEO_RESOURCE_LIMIT };
  }

  async function debugCreationResourceScan() {
    const nodes = await fetchCreationNodes({ force: true });
    const videoNodes = prioritizeNodesByVisibleOrder(nodes.filter(isCreationVideoNode));
    const latestVideoNodes = videoNodes.slice(0, CREATION_VIDEO_RESOURCE_LIMIT);
    const downloadInfos = await getDownloadInfos(latestVideoNodes.map(node => node.id));
    return {
      url: location.href,
      totalNodes: nodes.length,
      videoNodes: videoNodes.length,
      selectedVideoNodes: latestVideoNodes.length,
      limit: CREATION_VIDEO_RESOURCE_LIMIT,
      pages: creationNodePageDebug,
      sampleAllNodes: nodes.slice(0, 10).map(node => ({
        id: node.id,
        key: node.key,
        name: node.name,
        nodeType: node.nodeType,
        typeOfNodeType: typeof node.nodeType
      })),
      sampleNodes: latestVideoNodes.slice(0, 5).map(node => ({
        id: node.id,
        key: node.key,
        name: node.name,
        nodeType: node.nodeType,
        coverUrl: node.coverUrl,
        coverKeys: node.coverKeys
      })),
      downloadInfos: downloadInfos.map(info => ({
        nodeId: info.nodeId,
        ok: info.ok,
        error: info.error || '',
        mainUrl: String(info.mainUrl || '').slice(0, 220)
      }))
    };
  }

  function collectIds(value, path, out, seen, depth = 0) {
    if (depth > 8 || value == null) return;
    if (typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (child != null && /(^|_|\b)(id|item|item_id|itemid|creation|creation_id|media|media_id|vid|video|video_id|task|task_id|key)(_|$|\b)/i.test(key)) {
        const text = typeof child === 'string' || typeof child === 'number' ? String(child) : '';
        if (text && text.length <= 180) out.push({ path: nextPath, value: text });
      }
      if (child && typeof child === 'object') collectIds(child, nextPath, out, seen, depth + 1);
    }
  }

  function collectMediaRecords(value, out, seen, depth = 0) {
    if (depth > 8 || value == null || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    const record = {
      type: typeof value.type === 'string' ? value.type : '',
      id: value.id != null ? String(value.id) : '',
      nodeId: value.nodeId != null ? String(value.nodeId) : (value.node_id != null ? String(value.node_id) : ''),
      key: value.key != null ? String(value.key) : '',
      uri: value.uri != null ? String(value.uri) : '',
      name: value.name != null ? String(value.name).slice(0, 120) : '',
      title: value.title != null ? String(value.title).slice(0, 120) : ''
    };
    if ((/^(image|video|audio|file)$/i.test(record.type) || record.nodeId || record.uri || record.key) &&
        (record.id || record.nodeId || record.uri || record.key)) {
      out.push(record);
    }
    if (Array.isArray(value)) {
      value.forEach(item => collectMediaRecords(item, out, seen, depth + 1));
      return;
    }
    for (const child of Object.values(value).slice(0, 120)) {
      if (child && typeof child === 'object') collectMediaRecords(child, out, seen, depth + 1);
    }
  }

  function collectDownloadNodeIdsFromRecords(records, limit = 40) {
    const ids = [];
    const mediaRecords = [];
    for (const record of records || []) {
      collectNodeIds(record, ids, new WeakSet());
      collectMediaRecords(record, mediaRecords, new WeakSet());
    }
    for (const item of mediaRecords) {
      if (/^\d{8,}$/.test(String(item.nodeId || ''))) ids.push(String(item.nodeId));
      if (/^\d{8,}$/.test(String(item.id || '')) && /^v\d/i.test(String(item.key || ''))) {
        ids.push(String(item.id));
      }
    }
    return uniqueBy(ids, item => item, limit);
  }

  function collectVisibleDownloadNodeIds() {
    const nodes = Array.from(document.querySelectorAll('video,img')).filter(visible);
    const sorted = nodes.sort((a, b) => {
      const aVideo = a.tagName === 'VIDEO' ? 1 : 0;
      const bVideo = b.tagName === 'VIDEO' ? 1 : 0;
      if (aVideo !== bVideo) return bVideo - aVideo;
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return (br.width * br.height) - (ar.width * ar.height);
    });
    const ids = [];
    const seenCards = new WeakSet();
    for (const node of sorted.slice(0, 24)) {
      const card = getCard(node);
      if (!card || seenCards.has(card)) continue;
      seenCards.add(card);
      ids.push(...collectDownloadNodeIdsFromRecords(findFiberRecords(card), 20));
      ids.push(...collectDownloadNodeIdsFromRecords(findFiberRecords(node), 20));
    }
    return uniqueBy(ids, item => item, 40);
  }

  async function revealCardMedia(card) {
    if (!card || !card.isConnected) return false;
    setSelectionMode(false);
    const target = card.querySelector?.('video,img') || card;
    target.scrollIntoView?.({ block: 'center', inline: 'center' });
    await delay(350);
    const rect = target.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const options = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
    for (const type of ['pointerover', 'mouseover', 'mouseenter', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      target.dispatchEvent(new MouseEvent(type, options));
    }
    await delay(2200);
    return true;
  }

  async function downloadFirstNodeIds(nodeIds) {
    let lastError = null;
    for (const nodeId of uniqueBy(nodeIds || [], item => item, 50)) {
      try {
        const result = await getDownloadInfo(nodeId);
        postDownload(result.mainUrl, result.backupUrl);
        showStatus('已发送豆包创作原视频下载');
        return { ok: true, lastError: null };
      } catch (error) {
        lastError = error;
      }
    }
    return { ok: false, lastError };
  }

  async function waitForRevealedVideoAndDownload() {
    const token = ++pendingRevealToken;
    for (let index = 0; index < 16; index += 1) {
      await delay(500);
      if (token !== pendingRevealToken) return false;
      const result = await downloadFirstNodeIds(collectVisibleDownloadNodeIds());
      if (result.ok) return true;
    }
    showStatus('作品已打开，但未发现可下载原视频，请再点一次下载按钮');
    return false;
  }

  function uniqueBy(list, getKey, limit = 80) {
    const out = [];
    const seen = new Set();
    for (const item of list) {
      const key = getKey(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
      if (out.length >= limit) break;
    }
    return out;
  }

  function dumpVisibleCards() {
    const nodes = Array.from(document.querySelectorAll('video,img'));
    const mediaNodes = uniqueBy(nodes.filter(visible), node => {
      const rect = node.getBoundingClientRect();
      const src = node.currentSrc || node.src || '';
      return `${node.tagName}:${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}:${src.slice(0, 120)}`;
    }, 80);
    return mediaNodes.map((node, index) => {
      const card = getCard(node);
      const rect = node.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const records = findFiberRecords(node);
      const candidates = [];
      const ids = [];
      const mediaRecords = [];
      for (const record of records) {
        collectVideoUrls(record, '', candidates, new WeakSet(), 0, true);
        collectIds(record, '', ids, new WeakSet());
        collectMediaRecords(record, mediaRecords, new WeakSet());
      }
      return {
        index,
        text: String(card.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
        rect: {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        cardRect: {
          left: Math.round(cardRect.left),
          top: Math.round(cardRect.top),
          width: Math.round(cardRect.width),
          height: Math.round(cardRect.height)
        },
        tagName: node.tagName,
        src: String(node.currentSrc || node.src || '').slice(0, 800),
        hasVideoElement: node.tagName === 'VIDEO' || Boolean(card.querySelector('video')),
        hasImageElement: node.tagName === 'IMG' || Boolean(card.querySelector('img')),
        recordCount: records.length,
        ids: uniqueBy(ids, item => `${item.path}:${item.value}`, 80),
        mediaRecords: uniqueBy(mediaRecords, item => `${item.type}:${item.id}:${item.nodeId}:${item.key}:${item.uri}`, 80),
        candidates: uniqueBy(candidates, item => item.url, 80)
          .sort((a, b) => Number(b.accepted) - Number(a.accepted) || b.score - a.score)
          .map(item => ({
            path: item.path,
            score: item.score,
            accepted: item.accepted,
            rejectReason: item.rejectReason,
            url: item.url
          }))
      };
    });
  }

  function sanitizeFilename(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .trim()
      .slice(0, 48);
  }

  function postDownload(url, backupUrl = '') {
    const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    window.postMessage({
      type: 'electronDownload',
      data: {
        url,
        backupUrl,
        filename: `豆包_创作原视频_${stamp}.mp4`,
        type: 'video',
        source: 'doubao-creation-card',
        confirmedNoWatermark: true
      }
    }, '*');
  }

  async function resolveFromCard(card) {
    const records = findFiberRecords(card);
    const directNodeIds = collectDownloadNodeIdsFromRecords(records, 30);
    const messageIds = uniqueBy(records.flatMap(record => {
      const ids = [];
      collectMessageIds(record, ids, new WeakSet());
      return ids;
    }), item => item, 40);
    let lastError = null;
    let listNodeIds = [];
    try {
      listNodeIds = await resolveNodeIdsFromCreationList(card, messageIds);
    } catch (error) {
      lastError = error;
    }
    const candidateNodeIds = uniqueBy([...listNodeIds, ...directNodeIds, ...collectVisibleDownloadNodeIds()], item => item, 50);
    const directResult = await downloadFirstNodeIds(candidateNodeIds);
    if (directResult.ok) return true;
    lastError = directResult.lastError;

    await revealCardMedia(card);
    const revealedNodeIds = collectVisibleDownloadNodeIds()
      .filter(nodeId => !candidateNodeIds.includes(nodeId));
    const revealedResult = await downloadFirstNodeIds(revealedNodeIds);
    if (revealedResult.ok) return true;
    lastError = revealedResult.lastError || lastError;

    if (messageIds.length) {
      try {
        const resolvedNodeIds = await resolveNodeIdsFromMessageIds(messageIds);
        for (const nodeId of resolvedNodeIds) {
          if (candidateNodeIds.includes(nodeId)) continue;
          try {
            const result = await getDownloadInfo(nodeId);
            postDownload(result.mainUrl, result.backupUrl);
            showStatus('已发送豆包创作原视频下载');
            return true;
          } catch (error) {
            lastError = error;
          }
        }
      } catch (error) {
        lastError = error;
      }
    }

    const best = pickBestVideo(records);
    if (!best?.url || !isConfirmedNoWatermarkVideoUrl(best.url)) {
      showStatus(`未发现确认无水印下载流，已停止下载（扫描 ${records.length} 组卡片数据）${lastError ? `：${lastError.message || lastError}` : ''}`);
      return false;
    }
    postDownload(best.url);
    showStatus('已发送豆包创作原视频下载');
    return true;
  }

  function installDbmVideoButtons(root = document) {
    if (!window.__DBM_NO_WATERMARK_DOWNLOAD_HOST__) return;
    const messages = Array.from(root.querySelectorAll?.('[data-message-id]') || []);
    if (root instanceof Element && root.matches('[data-message-id]')) messages.unshift(root);
    for (const message of messages) {
      if (message.querySelector(`.${DBM_BUTTON_CLASS}`)) continue;
      const media = Array.from(message.querySelectorAll('video,img')).find(node => {
        const rect = node.getBoundingClientRect();
        const src = String(node.currentSrc || node.src || node.poster || '');
        return rect.width >= 220 && rect.height >= 120 && /video|tos-cn-p-9ecd54|videoweb/i.test(src);
      });
      if (!media) continue;
      const container = media.closest('[class*="block-video"]') || media.parentElement;
      if (!container) continue;
      container.style.setProperty('position', 'relative', 'important');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = DBM_BUTTON_CLASS;
      button.textContent = '无水印下载';
      button.title = '解析豆包官方无水印原片链接并下载';
      button.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        if (button.disabled) return;
        button.disabled = true;
        button.textContent = '解析中…';
        try {
          const ok = await resolveFromCard(message);
          if (!ok) throw new Error('未解析到官方无水印原片');
          button.textContent = '下载中…';
        } catch (error) {
          button.textContent = '解析失败';
          showStatus(error?.message || String(error));
          setTimeout(() => {
            button.disabled = false;
            button.textContent = '无水印下载';
          }, 2600);
        }
      }, true);
      container.appendChild(button);
    }
  }

  function setupDbmVideoButtons() {
    if (!window.__DBM_NO_WATERMARK_DOWNLOAD_HOST__) return;
    installDbmVideoButtons(document);
    let scanTimer = 0;
    const observer = new MutationObserver(() => {
      clearTimeout(scanTimer);
      scanTimer = setTimeout(() => installDbmVideoButtons(document), 180);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('message', event => {
      if (event.source !== window || event.data?.type !== 'dbm:no-watermark-result') return;
      const result = event.data.result || {};
      for (const button of document.querySelectorAll(`.${DBM_BUTTON_CLASS}:disabled`)) {
        button.textContent = result.ok ? '下载完成' : '下载失败';
        if (!result.ok) showStatus(result.message || '官方无水印原片下载失败');
        setTimeout(() => {
          button.disabled = false;
          button.textContent = '无水印下载';
        }, result.ok ? 1800 : 3000);
      }
    });
  }

  function setupSelectionResolver() {
    if (window.__AIAM_DOUBAO_CREATION_SELECTION__ === SCRIPT_VERSION) return;
    window.__AIAM_DOUBAO_CREATION_SELECTION__ = SCRIPT_VERSION;

    document.addEventListener('mousemove', event => {
      if (!selectionMode) return;
      const node = getNodeAtPoint(event);
      if (node === hoverNode) return;
      if (hoverNode) hoverNode.classList.remove(HIT_CLASS);
      hoverNode = node || null;
      if (hoverNode) hoverNode.classList.add(HIT_CLASS);
    }, true);

    document.addEventListener('click', async event => {
      if (!selectionMode) return;
      if (event.target?.closest?.(`.${PANEL_CLASS},.${STATUS_CLASS}`)) return;
      const node = getNodeAtPoint(event);
      if (!node) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      await resolveFromCard(node);
      setSelectionMode(false);
    }, true);
  }

  window.__AIAM_DOUBAO_CREATION_START_SELECT__ = () => {
    ensurePanel();
    setupSelectionResolver();
    setSelectionMode(true);
    return true;
  };

  window.__AIAM_DOUBAO_CREATION_SCAN_TO_RESOURCE_PANEL__ = scanCreationVideosToResourcePanel;
  window.__AIAM_DOUBAO_CREATION_SCAN_DEBUG__ = debugCreationResourceScan;
  window.__AIAM_DOUBAO_CREATION_DUMP_VISIBLE__ = dumpVisibleCards;
  window.__AIAM_DOUBAO_CREATION_DUMP_VERSION__ = SCRIPT_VERSION;

  function start() {
    if (!document.body) return setTimeout(start, 100);
    installStyle();
    setupSelectionResolver();
    setupDbmVideoButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
