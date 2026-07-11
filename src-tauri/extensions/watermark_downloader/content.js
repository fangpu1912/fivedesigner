const originalXHROpen = XMLHttpRequest.prototype.open;
const originalXHRSend = XMLHttpRequest.prototype.send;
const originalFetch = window.fetch;
const processedUrls = new Set();
const MAX_DEDUP_SIZE = 100;
const ONE_YEAR_MS = 315576e5;
const videoCache = new Map();

function replaceWatermarkParam(url) {
  if (!url || typeof url !== 'string') return url;
  return url.replace(/lr=[^&]+/g, 'lr=video_gen_no_watermark');
}

const UA_FIREFOX = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0";

// ========== 新增：调用 get_play_info 接口获取视频 ==========
async function callGetPlayInfo(videoKey) {
  const baseUrl = 'https://www.doubao.com/samantha/media/get_play_info';
  const params = new URLSearchParams({
    aid: '497858',
    device_platform: 'web',
    samantha_web: '1',
    'use-olympus-account': '1',
    version_code: '20800',
    pkg_type: 'release_version',
    web_tab_id: crypto.randomUUID()
  });
  const url = `${baseUrl}?${params.toString()}`;

  const reqBody = { key: videoKey, type: 'video' };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'agw-js-conv': 'str',
      'origin': location.origin,
      'referer': location.href
    },
    credentials: 'include',
    body: JSON.stringify(reqBody)
  });

  const json = await response.json();
  console.log('[content.js] 🔍 get_play_info 完整响应:', JSON.stringify(json, null, 2));
  if (json.code !== 0) {
    throw new Error(`get_play_info 接口返回错误: code=${json.code}, msg=${json.msg || '未知'}`);
  }

  const data = json.data;
  if (!data) throw new Error('响应中无 data 字段');

  // Phase 2A: 优先使用 original_media_info（无水印原始视频）
  const originalMedia = data.original_media_info;
  if (originalMedia && originalMedia.main_url) {
    return {
      success: true,
      mainUrl: originalMedia.main_url,
      backupUrl: originalMedia.backup_url || null,
      width: originalMedia.width || null,
      height: originalMedia.height || null,
      definition: originalMedia.definition || data.video_info?.definition || 'unknown',
      isOriginal: true
    };
  }

  // Fallback: media_info (桌面软件配置的字段)
  const mediaInfo = data.media_info;
  if (mediaInfo && mediaInfo.main_url) {
    return {
      success: true,
      mainUrl: mediaInfo.main_url,
      backupUrl: mediaInfo.backup_url || null,
      width: mediaInfo.width || null,
      height: mediaInfo.height || null,
      definition: mediaInfo.definition || 'unknown',
      isOriginal: false
    };
  }

  // 最后回退: play_infos / play_info
  const playInfos = data.play_infos || (data.play_info ? [data.play_info] : []);
  const playInfo = playInfos[0];
  if (playInfo && playInfo.main) {
    return {
      success: true,
      mainUrl: playInfo.main,
      backupUrl: playInfo.backup || null,
      width: playInfo.width,
      height: playInfo.height,
      definition: playInfo.definition || 'unknown',
      isOriginal: false
    };
  }

  throw new Error('未找到视频播放地址');
}
// ========== 新增结束 ==========

function getMessageList() {
  const routerData = window._ROUTER_DATA;
  if (!routerData) return [];
  const chatLayout = routerData?.loaderData?.chat_layout;
  if (!chatLayout) return [];

  // 新版结构: chat_(id)/page.messageList.message_list
  for (const key of Object.keys(chatLayout)) {
    if (key.includes('/page') || key.includes('messageList')) {
      const pageData = chatLayout[key];
      const msgList = pageData?.messageList?.message_list || pageData?.message_list;
      if (Array.isArray(msgList) && msgList.length > 0) return msgList;
    }
  }

  // 旧版结构: trimmedChainRecentConvCells
  const cells = chatLayout?.trimmedChainRecentConvCells || [];
  const messages = [];
  for (const cell of cells) {
    const cellMsgs = cell?.conversation?.messages || [];
    messages.push(...cellMsgs);
  }
  return messages;
}

function findVideoAndMessageId() {
  const messages = getMessageList();
  for (const msg of messages) {
    const msgId = String(msg.message_id || "").trim();
    if (!msgId || msgId === "0") continue;
    const vid = findVidInObject(msg);
    if (vid) return { vid, messageId: msgId };
  }
  return null;
}

function findVidByMessageId(messageId) {
  const cached = videoCache.get(messageId);
  if (cached) return { vid: cached, messageId };
  const messages = getMessageList();
  for (const msg of messages) {
    const msgId = String(msg.message_id || "").trim();
    if (msgId === messageId) {
      const vid = findVidInObject(msg);
      if (vid) {
        videoCache.set(messageId, vid);
        return { vid, messageId };
      }
    }
  }
  return null;
}

function findVidInObject(obj, depth = 0) {
  if (depth > 10 || !obj) return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findVidInObject(item, depth + 1);
      if (found) return found;
    }
  } else if (typeof obj === "object") {
    const vid = obj.vid || obj.video_id;
    if (vid && typeof vid === "string" && vid.startsWith("v0")) return vid;
    for (const val of Object.values(obj)) {
      const found = findVidInObject(val, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

async function callDoubaoShareSave(messageId) {
  const qs = "version_code=20800&language=zh&device_platform=web&aid=497858&real_aid=497858&pkg_type=release_version&device_id=7550681679050343936&pc_version=3.14.6&region=CN&sys_region=CN&samantha_web=1&use-olympus-account=1";
  const url = "https://www.doubao.com/alice/media/bigmusic/share_save?" + qs;
  console.log("[content] share_save 请求, messageId:", messageId);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "User-Agent": UA_FIREFOX },
      credentials: "include",
      body: JSON.stringify({ message_id: messageId })
    });
    console.log("[content] share_save 状态:", resp.status);
    const json = await resp.json();
    if (json.code === 0 && json.data) {
      return json.data;
    }
    console.warn("[content] share_save 失败:", json.code, json.msg);
    return null;
  } catch (e) {
    console.error("[content] share_save 异常:", e.message);
    return null;
  }
}

async function callGetVideoShareInfo(shareId, vid) {
  const qs = "version_code=20800&language=zh&device_platform=web&aid=497858&real_aid=497858&pkg_type=release_version&device_id=7550681679050343936&pc_version=3.14.6&region=CN&sys_region=CN&samantha_web=1&use-olympus-account=1";
  const url = "https://www.doubao.com/creativity/share/get_video_share_info?" + qs + "&web_tab_id=" + crypto.randomUUID();
  const referrer = "https://www.doubao.com/video-sharing?source_type=mobile&share_id=" + shareId + "&video_id=" + vid;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "agw-js-conv": "str",
        "User-Agent": UA_FIREFOX
      },
      referrer: referrer,
      referrerPolicy: "no-referrer-when-downgrade",
      credentials: "include",
      body: JSON.stringify({ share_id: shareId, vid, creation_id: "" })
    });
    const json = await resp.json();
    if (json.code === 0 && json.data) return json.data;
    return null;
  } catch (e) {
    console.error('[content] get_video_share_info 失败:', e);
    return null;
  }
}

function extractNoWatermarkVideoUrl(data) {
  // 打印完整响应结构，看 play_infos 里的 URL
  console.log("[content] share_info play_infos[0]:", JSON.stringify(data?.play_infos?.[0]));
  // 打印原始 main URL，看有没有 lr 参数
  const rawMain = data?.play_infos?.[0]?.main || data?.play_info?.main || data?.main || '';
  console.log("[content] 原始 main URL (前300):", rawMain.substring(0, 300));
  // 优先使用 original_media_info（无水印原始视频）
  if (data?.original_media_info?.main_url) {
    return {
      mainUrl: data.original_media_info.main_url,
      backupUrl: data.original_media_info.backup_url || null,
      width: data.original_media_info.width,
      height: data.original_media_info.height,
      definition: data.original_media_info.definition,
      isOriginal: true
    };
  }
  const playInfo = data?.play_infos?.[0] || data?.play_info || (data?.main ? data : null);
  if (!playInfo?.main) return null;
  // Phase 2B: lr 参数替换去水印（share 流程的 CDN 允许修改 lr 参数）
  const noWm = playInfo.main
    .replace(/lr=video_gen_watermark_dyn/g, 'lr=video_gen_no_watermark')
    .replace(/lr=video_gen_watermark/g, 'lr=video_gen_no_watermark');
  return {
    mainUrl: noWm,
    backupUrl: (playInfo.backup || '').replace(/lr=video_gen_watermark_dyn/g, 'lr=video_gen_no_watermark').replace(/lr=video_gen_watermark/g, 'lr=video_gen_no_watermark') || null,
    width: playInfo.width,
    height: playInfo.height,
    definition: playInfo.definition,
    isOriginal: false
  };
}

// ========== 修复：startVideoDownload 优先使用新接口 ==========
async function startVideoDownload() {
  console.log("[content.js] startVideoDownload 开始执行");
  const info = findVideoAndMessageId();
  if (!info) return { success: false, error: "未找到视频内容" };
  console.log("[content.js] 找到视频:", info);

  // 1. 优先使用旧流程：share_save → get_video_share_info（返回带有效签名的无水印URL）
  try {
    console.log("[content.js] 尝试旧接口 share_save, messageId:", info.messageId);
    const share = await callDoubaoShareSave(info.messageId);
    if (share?.share_id) {
      console.log("[content.js] 获取分享ID成功:", share.share_id);
      const videoData = await callGetVideoShareInfo(share.share_id, info.vid);
      if (videoData) {
        console.log("[content.js] 获取视频信息成功");
        const extracted = extractNoWatermarkVideoUrl(videoData);
        if (extracted) {
          console.log("[content.js] 提取无水印URL成功, URL参数:", extracted.mainUrl.split('?')[1]);
          return {
            success: true,
            messageId: info.messageId,
            shareId: share.share_id,
            vid: info.vid,
            videoUrl: extracted.mainUrl,
            backupUrl: extracted.backupUrl,
            width: extracted.width,
            height: extracted.height,
            definition: extracted.definition,
            source: "legacy"
          };
        }
      }
    }
  } catch (err) {
    console.warn("[content.js] 旧接口失败，尝试新接口:", err);
  }

  // 2. 兜底：get_play_info
  try {
    console.log("[content.js] 尝试新接口 callGetPlayInfo, vid:", info.vid);
    const playResult = await callGetPlayInfo(info.vid);
    if (playResult && playResult.mainUrl) {
      console.log("[content.js] 新接口获取成功:", playResult.mainUrl);
      return {
        success: true,
        messageId: info.messageId,
        vid: info.vid,
        videoUrl: playResult.mainUrl,
        backupUrl: playResult.backupUrl,
        width: playResult.width,
        height: playResult.height,
        definition: playResult.definition,
        source: "get_play_info"
      };
    }
  } catch (err) {
    console.warn("[content.js] 新接口也失败:", err);
  }

  return { success: false, error: "获取视频下载链接失败" };
}

// ========== startVideoDownloadByMessageId ==========
async function startVideoDownloadByMessageId(messageId) {
  console.log("[content.js] startVideoDownloadByMessageId 开始执行, messageId:", messageId);
  const info = findVidByMessageId(messageId);
  if (!info) return { success: false, error: "未找到视频内容", messageId };
  console.log("[content.js] 找到视频:", info);

  // 1. 优先使用旧流程：share_save → get_video_share_info
  try {
    console.log("[content.js] 尝试旧接口 share_save, messageId:", info.messageId);
    const share = await callDoubaoShareSave(info.messageId);
    if (share?.share_id) {
      console.log("[content.js] 获取分享ID成功:", share.share_id);
      const videoData = await callGetVideoShareInfo(share.share_id, info.vid);
      if (videoData) {
        console.log("[content.js] 获取视频信息成功");
        const extracted = extractNoWatermarkVideoUrl(videoData);
        if (extracted) {
          console.log("[content.js] 提取无水印URL成功");
          return {
            success: true,
            messageId: info.messageId,
            shareId: share.share_id,
            vid: info.vid,
            videoUrl: extracted.mainUrl,
            backupUrl: extracted.backupUrl,
            width: extracted.width,
            height: extracted.height,
            definition: extracted.definition,
            source: "legacy"
          };
        }
      }
    }
  } catch (err) {
    console.warn("[content.js] 旧接口失败，尝试新接口:", err);
  }

  // 2. 兜底：get_play_info
  try {
    console.log("[content.js] 尝试新接口 callGetPlayInfo, vid:", info.vid);
    const playResult = await callGetPlayInfo(info.vid);
    if (playResult && playResult.mainUrl) {
      console.log("[content.js] 新接口获取成功:", playResult.mainUrl);
      return {
        success: true,
        messageId: info.messageId,
        vid: info.vid,
        videoUrl: playResult.mainUrl,
        backupUrl: playResult.backupUrl,
        width: playResult.width,
        height: playResult.height,
        definition: playResult.definition,
        source: "get_play_info"
      };
    }
  } catch (err) {
    console.warn("[content.js] 新接口也失败:", err);
  }

  return { success: false, error: "获取视频下载链接失败", messageId };
}
// ========== 修复结束 ==========

function scanInitialVideoData() {
  const messages = getMessageList();
  const videos = [];
  for (const msg of messages) {
    const msgId = String(msg.message_id || "").trim();
    if (!msgId || msgId === "0") continue;
    const vid = findVidInObject(msg);
    if (vid) {
      videoCache.set(msgId, vid);
      videos.push({ vid, messageId: msgId });
    }
  }
  if (videos.length) window.postMessage({ type: "videoDataExtracted", data: videos }, "*");
}

function extractFromCreations(creations) {
  const images = [];
  for (const cr of creations) {
    const img = cr?.image;
    const raw = img?.image_ori_raw;
    if (raw?.url) {
      const match = raw.url.match(/x-expires=(\d+)/);
      const expires = match ? new Date(parseInt(match[1]) * 1000).toISOString() : null;
      images.push({
        watermark_url: img.image_thumb?.url,
        no_watermark_url: raw.url,
        expires_at: expires,
        width: raw.width || null,
        height: raw.height || null
      });
    }
  }
  return images;
}

function extractFromPatchOps(patchOps) {
  let images = [];
  for (const op of patchOps) {
    const blocks = op?.patch_value?.content_block;
    if (blocks) {
      for (const block of blocks) {
        const creations = block?.content?.creation_block?.creations;
        if (creations) images.push(...extractFromCreations(creations));
      }
    }
  }
  return images;
}

function extractFromMessages(messages) {
  let images = [];
  for (const msg of messages) {
    for (const block of msg?.content_block || []) {
      const creations = block?.content?.creation_block?.creations;
      if (creations) images.push(...extractFromCreations(creations));
    }
  }
  return images;
}

function extractVideoFromMessages(messages) {
  const videos = [];
  for (const msg of messages) {
    const msgId = String(msg.message_id || "").trim();
    if (!msgId || msgId === "0") continue;
    const vid = findVidInObject(msg);
    if (vid) {
      videoCache.set(msgId, vid);
      videos.push({ vid, messageId: msgId });
    }
  }
  return videos;
}

function markProcessed(url) {
  if (url) {
    processedUrls.add(url);
    if (processedUrls.size > MAX_DEDUP_SIZE) {
      const first = processedUrls.values().next().value;
      processedUrls.delete(first);
    }
  }
}

function publishImages(images) {
  if (!images.length) return;
  const now = Date.now();
  const valid = images.filter(img => !img.expires_at || new Date(img.expires_at).getTime() > now + ONE_YEAR_MS);
  if (valid.length) window.postMessage({ type: "imageDataExtracted", data: valid }, "*");
}

function publishVideos(videos) {
  if (videos.length) window.postMessage({ type: "videoDataExtracted", data: videos }, "*");
}

async function readSSEStream(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";
      for (const part of parts) {
        const match = part.match(/^data: (.+)$/m);
        if (match) {
          try {
            const data = JSON.parse(match[1]);
            const patchOps = data?.patch_op;
            if (patchOps) {
              const images = extractFromPatchOps(patchOps);
              if (images.length) window.postMessage({ type: "imageDataExtracted", data: images }, "*");
              const msgId = String(data?.message_id || "").trim();
              for (const op of patchOps) {
                const pv = op?.patch_value;
                if (!pv) continue;
                const id = String(pv.message_id || msgId || "").trim();
                if (!id || id === "0") continue;
                const vid = findVidInObject(pv);
                if (vid) {
                  videoCache.set(id, vid);
                  window.postMessage({ type: "videoDataExtracted", data: [{ vid, messageId: id }] }, "*");
                }
              }
            }
          } catch(e) {}
        }
      }
    }
  } catch(e) {}
}

function extractAndPublishFromXHR(response, url) {
  if (url && processedUrls.has(url)) return;
  const messages = response?.downlink_body?.pull_singe_chain_downlink_body?.messages;
  if (!messages) return;
  const images = extractFromMessages(messages);
  markProcessed(url);
  publishImages(images);
  publishVideos(extractVideoFromMessages(messages));
}

// 消息监听
window.addEventListener("message", (ev) => {
  const msg = ev.data;
  if (msg?.type === "startVideoDownload") {
    startVideoDownload().then(result => {
      console.log("[content.js] startVideoDownload 结果:", result);
      window.postMessage({ type: "videoDownloadResult", data: result }, "*");
    });
  } else if (msg?.type === "startVideoDownloadByMessageId") {
    startVideoDownloadByMessageId(msg.messageId).then(result => {
      console.log("[content.js] startVideoDownloadByMessageId 结果:", result);
      window.postMessage({ type: "videoDownloadResult", data: result }, "*");
    });
  } else if (msg?.type === "scanInitialVideos") {
    scanInitialVideoData();
  }
});

// 劫持 fetch 和 XHR
window.fetch = function(...args) {
  const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
  if (typeof url === "string" && url.includes("chat/completion")) {
    if (processedUrls.has(url)) return originalFetch.apply(this, args);
    markProcessed(url);
    return originalFetch.apply(this, args).then(async (resp) => {
      const contentType = resp.headers.get("content-type") || "";
      if (!contentType.includes("text/event-stream")) return resp;
      const [stream1, stream2] = resp.body.tee();
      const newResp = new Response(stream1, { status: resp.status, statusText: resp.statusText, headers: resp.headers });
      readSSEStream(stream2);
      return newResp;
    });
  }
  return originalFetch.apply(this, args);
};

XMLHttpRequest.prototype.open = function(method, url, ...rest) {
  this._url = url;
  return originalXHROpen.call(this, method, url, ...rest);
};

XMLHttpRequest.prototype.send = function(...args) {
  this.addEventListener("load", () => {
    if (typeof this._url === "string" && this._url.includes("chain/single")) {
      try {
        extractAndPublishFromXHR(JSON.parse(this.responseText), this._url);
      } catch(e) {}
    }
  });
  return originalXHRSend.apply(this, args);
};