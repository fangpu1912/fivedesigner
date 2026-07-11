importScripts('debugger-interceptor.js');

let imageList = [];
let videoList = [];
const CURRENT_VERSION = "13.0";
let versionStatus = { valid: true, message: "", warning: "", expireDate: "" };
let lastVersionCheck = 0;
const VERSION_CHECK_INTERVAL = 86400000;

// ========== 批量下载相关变量 ==========
let batchDownloadQueue = [];
let isBatchDownloading = false;

// ========== 激活码功能已禁用 ==========
// // ========== 卡密激活相关 ==========
// const API_KEY = "03964e198e5c408fa637a18088b06ea5";
// const API_URL = "http://106.53.206.145/api/custom/use";
//
// // 保存卡密到本地
// function saveCardKey(cardKey) {
//   return new Promise((resolve) => {
//     chrome.storage.local.set({ savedCardKey: cardKey }, resolve);
//   });
// }
//
// // 获取保存的卡密
// function getSavedCardKey() {
//   return new Promise((resolve) => {
//     chrome.storage.local.get(['savedCardKey'], (result) => {
//       resolve(result.savedCardKey || "");
//     });
//   });
// }
//
// // 调用激活API验证卡密
// async function verifyCard(cardKey) {
//   try {
//     const extensionId = chrome.runtime.id;
//     console.log("[Background] 扩展ID (机器码):", extensionId);
//
//     const params = new URLSearchParams();
//     params.append('CCCC', cardKey);
//     params.append('DDDD', API_KEY);
//     params.append('EEEE', extensionId);
//
//     const requestUrl = API_URL + "?" + params.toString();
//     console.log("[Background] 请求URL:", requestUrl);
//
//     const response = await fetch(requestUrl, {
//       method: "GET",
//       mode: "cors"
//     });
//
//     if (!response.ok) {
//       console.error("[Background] HTTP错误:", response.status);
//       return { success: false, message: "HTTP错误: " + response.status };
//     }
//
//     const data = await response.json();
//     console.log("[Background] 验证响应:", JSON.stringify(data));
//
//     const isSuccess = (data.AAAAA === true) || (data.CCCCC === "200");
//
//     if (isSuccess) {
//       let remainingCount = null;
//       if (data.DDDDD) {
//         var match = data.DDDDD.match(/(\d+)/);
//         if (match) remainingCount = parseInt(match[1]);
//       }
//
//       let expireTime = null;
//       if (data.FFFFF && data.FFFFF !== "永久有效") {
//         expireTime = data.FFFFF;
//       } else if (data.FFFFF === "永久有效") {
//         expireTime = "永久有效";
//       }
//
//       var cardType = data.GGGGG || "未知";
//       var message = data.BBBBB || "验证成功";
//
//       console.log("[Background] 验证成功 - 剩余次数:", remainingCount, "卡密类型:", cardType);
//
//       return {
//         success: true,
//         message: message,
//         remainingCount: remainingCount,
//         expireTime: expireTime,
//         cardType: cardType
//       };
//     } else {
//       var errorMsg = data.BBBBB || "验证失败";
//       if (data.CCCCC === "404") errorMsg = "卡密不存在";
//       else if (data.CCCCC === "401") errorMsg = "卡密已过期";
//       else if (data.CCCCC === "402") errorMsg = "卡密已使用/停用";
//       else if (data.CCCCC === "403") errorMsg = "次数已用尽";
//
//       if (data.CCCCC === "403" || data.CCCCC === "401") {
//         await saveCardKey("");
//       }
//
//       return { success: false, message: errorMsg };
//     }
//   } catch (error) {
//     console.error("[Background] 验证请求失败:", error);
//     console.error("[Background] 错误详情:", error.message);
//     return { success: false, message: "网络错误：" + error.message };
//   }
// }
//
// // 首次激活
// async function activateWithCard(cardKey, machineCode) {
//   console.log("[Background] 首次激活，卡密:", cardKey);
//   var result = await verifyCard(cardKey);
//
//   if (result.success) {
//     await saveCardKey(cardKey);
//     await new Promise(function(resolve) {
//       chrome.storage.local.set({
//         activated: true,
//         remainingCount: result.remainingCount,
//         expireTime: result.expireTime,
//         cardType: result.cardType
//       }, resolve);
//     });
//   }
//
//   return result;
// }
//
// // 检查激活状态
// async function checkActivationStatus() {
//   var savedCardKey = await getSavedCardKey();
//
//   if (!savedCardKey) {
//     return { activated: false, message: "未激活" };
//   }
//
//   var result = await verifyCard(savedCardKey);
//
//   if (result.success) {
//     await new Promise(function(resolve) {
//       chrome.storage.local.set({
//         activated: true,
//         remainingCount: result.remainingCount,
//         expireTime: result.expireTime,
//         cardType: result.cardType
//       }, resolve);
//     });
//
//     var message = "已激活";
//     if (result.remainingCount > 0) {
//       message = "已激活，剩余 " + result.remainingCount + " 次";
//     }
//     if (result.expireTime && result.expireTime !== "永久有效") {
//       message = "已激活，有效期至 " + result.expireTime;
//     }
//
//     return { activated: true, message: message, remainingCount: result.remainingCount, expireTime: result.expireTime };
//   } else {
//     await saveCardKey("");
//     await new Promise(function(resolve) {
//       chrome.storage.local.set({ activated: false }, resolve);
//     });
//     return { activated: false, message: result.message };
//   }
// }

// 下载图片
async function downloadImage(url, filename) {
  try {
    var downloadId = await chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: false,
      conflictAction: "uniquify"
    });
    return { success: true, downloadId: downloadId, filename: filename };
  } catch (e) {
    console.error("[Background] 图片下载失败:", e);
    return { success: false, error: e.message };
  }
}

// 下载视频
async function downloadVideo(url, filename, backupUrl) {
  try {
    console.log("[Background] 开始下载视频, URL:", url);
    var downloadId = await chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: false,
      conflictAction: "uniquify"
    });
    console.log("[Background] 视频下载成功, ID:", downloadId);
    return { success: true, downloadId: downloadId, filename: filename };
  } catch (e) {
    console.error("[Background] 视频下载失败:", e);
    if (backupUrl) {
      try {
        console.log("[Background] 尝试备用URL:", backupUrl);
        var downloadId2 = await chrome.downloads.download({
          url: backupUrl,
          filename: filename,
          saveAs: false,
          conflictAction: "uniquify"
        });
        return { success: true, downloadId: downloadId2, filename: filename, usedBackup: true };
      } catch (e2) {
        console.error("[Background] 备用URL也失败:", e2);
        return { success: false, error: e2.message };
      }
    }
    return { success: false, error: e.message };
  }
}

// 通用下载接口（供千问使用）
async function downloadFile(url, filename) {
  try {
    var downloadId = await chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: false,
      conflictAction: "uniquify"
    });
    return { success: true, downloadId: downloadId };
  } catch (e) {
    console.error("[Background] 文件下载失败:", e);
    return { success: false, error: e.message };
  }
}

// 豆包API - 获取视频分享信息
async function callDoubaoShareSave(messageId) {
  var body = { message_id: messageId };
  try {
    var response = await fetch("https://api-normal.doubao.com/alice/media/bigmusic/share_save?version_code=20800&language=zh&device_platform=web&aid=497858&real_aid=497858&pkg_type=release_version&device_id=7550681679050343936&pc_version=3.14.6&region=CN&sys_region=CN&samantha_web=1&use-olympus-account=1", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      credentials: "include",
      body: JSON.stringify(body)
    });
    var data = await response.json();
    if (data.code === 0 && data.data) {
      var shareId = data.data.share_id;
      return {
        success: true,
        share_id: shareId,
        share_url: data.data.share_url || "https://www.doubao.com/video-sharing?share_id=" + shareId
      };
    }
    return { success: false, error: "API错误" };
  } catch (e) {
    console.error("[Background] callDoubaoShareSave 失败:", e);
    return { success: false, error: e.message };
  }
}

// 从 background 调用 get_play_info 接口
async function callGetPlayInfoFromBg(videoKey) {
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
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'agw-js-conv': 'str'
      },
      credentials: 'include',
      body: JSON.stringify({ key: videoKey, type: 'video' })
    });
    
    const json = await response.json();
    if (json.code !== 0) {
      return null;
    }
    
    const data = json.data;
    const originalMedia = data.original_media_info;
    if (originalMedia && originalMedia.main_url) {
      // original_media_info 是原始视频（无水印），直接使用不要修改 lr 参数
      // lr 替换会破坏 CDN 签名导致下载失败
      return { mainUrl: originalMedia.main_url, backupUrl: originalMedia.backup_url, isOriginal: true };
    }
    
    const playInfos = data.play_infos || (data.play_info ? [data.play_info] : []);
    const playInfo = playInfos[0];
    if (playInfo && playInfo.main) {
      // play_infos URL 直接使用，不做 lr 替换
      return { mainUrl: playInfo.main, backupUrl: playInfo.backup, isOriginal: false };
    }
    return null;
  } catch (error) {
    console.error("[Background] callGetPlayInfoFromBg 失败:", error);
    return null;
  }
}

// 批量下载图片
async function batchDownloadImages(images) {
  const results = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const fileName = `doubao_img_${(i+1).toString().padStart(3, '0')}_${Date.now()}_${i}.png`;
    const result = await downloadImage(img.no_watermark_url, fileName);
    results.push({ ...result, originalData: img });
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  return results;
}

// 批量下载视频
async function batchDownloadVideos(videos) {
  const results = [];
  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    const fileName = `doubao_video_${(i+1).toString().padStart(3, '0')}_${Date.now()}.mp4`;
    
    let videoUrl = null;
    if (video.vid) {
      try {
        const playResult = await callGetPlayInfoFromBg(video.vid);
        if (playResult && playResult.mainUrl) {
          videoUrl = playResult.mainUrl;
        }
      } catch (e) {
        console.error("[Background] 获取视频链接失败:", e);
      }
    }
    
    if (videoUrl) {
      const result = await downloadVideo(videoUrl, fileName, null);
      results.push({ ...result, originalData: video });
    } else {
      results.push({ success: false, error: "无法获取视频链接", originalData: video });
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return results;
}

// 获取所有图片和视频数据
async function getAllMediaData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['batchImageList', 'batchVideoList'], (result) => {
      resolve({
        images: result.batchImageList || [],
        videos: result.batchVideoList || []
      });
    });
  });
}

// 版本检查
async function checkVersionUpdate() {
  var now = Date.now();
  if (now - lastVersionCheck < VERSION_CHECK_INTERVAL) {
    return {
      valid: versionStatus.valid,
      message: versionStatus.message,
      warning: versionStatus.warning,
      expireDate: versionStatus.expireDate,
      updateUrl: versionStatus.updateUrl,
      newVersion: versionStatus.newVersion,
      version: "13.0",
      cached: true
    };
  }
  try {
    var url = "http://43.138.57.24:34100/api/version-check";
    console.log("[Background] 正在检查版本更新...");
    var response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: "13.0", timestamp: now })
    });
    var data = await response.json();
    // 无论服务器返回什么，都不阻断功能
    versionStatus = {
      valid: true,
      message: data.message || "",
      warning: data.warning || "",
      expireDate: data.expireDate || "",
      updateUrl: data.updateUrl || "",
      newVersion: data.newVersion || ""
    };
    lastVersionCheck = now;
    return {
      valid: versionStatus.valid,
      message: versionStatus.message,
      warning: versionStatus.warning,
      expireDate: versionStatus.expireDate,
      updateUrl: versionStatus.updateUrl,
      version: "13.0",
      lastCheck: lastVersionCheck,
      cached: false
    };
  } catch (s) {
    console.error("[Background] 版本检查失败:", s);
    // 版本检查服务器不可达时，不阻断功能
    versionStatus = {
      valid: true,
      message: "",
      warning: "",
      expireDate: "",
      updateUrl: "",
      newVersion: ""
    };
    lastVersionCheck = now;
    return {
      valid: true,
      message: "",
      warning: "",
      expireDate: "",
      updateUrl: "",
      newVersion: "",
      version: "13.0",
      lastCheck: lastVersionCheck,
      cached: false
    };
  }
}

// ========== 消息监听 ==========
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  console.log("[Background] 收到消息:", message.type);
  
  // ========== 调试器面板资源下载 ==========
  if (message.type === "DOWNLOAD_MEDIA" && typeof message.url === "string") {
    chrome.downloads.download({ url: message.url, saveAs: false }).catch(function(error) {
      console.warn("[Background] debugger media download failed:", error);
    });
    sendResponse({ success: true });
    return true;
  }
  
  // ========== PING 响应 - 保持 Service Worker 活跃 ==========
  if (message.type === "PING") {
    sendResponse({ success: true });
    return true;
  }
  
  // ========== 激活码功能已禁用 ==========
  // if (message.type === "ACTIVATE_CARD") {
  //   activateWithCard(message.cardKey, message.machineCode).then(function(result) {
  //     sendResponse(result);
  //   });
  //   return true;
  // }
  //
  // if (message.type === "CHECK_ACTIVATION") {
  //   checkActivationStatus().then(function(result) {
  //     sendResponse(result);
  //   });
  //   return true;
  // }
  //
  // if (message.type === "GET_ACTIVATION_INFO") {
  //   chrome.storage.local.get(['activated', 'remainingCount', 'expireTime', 'cardType'], function(result) {
  //     sendResponse(result);
  //   });
  //   return true;
  // }
  
  // 千问通用下载接口
  if (message.type === "downloadFile") {
    downloadFile(message.url, message.filename).then(function(result) {
      sendResponse(result);
    });
    return true;
  }
  
  if (message.type === "downloadImage") {
    console.log("[Background] 图片下载请求");

    // ========== 激活码功能已禁用 ==========
    // getSavedCardKey().then(async function(cardKey) {
    //   if (!cardKey) {
    //     sendResponse({ success: false, error: "请先激活扩展", needActivation: true });
    //     return;
    //   }
    //   var verifyResult = await verifyCard(cardKey);
    //   if (!verifyResult.success) {
    //     sendResponse({ success: false, error: verifyResult.message, needActivation: true });
    //     return;
    //   }
    // });
    downloadImage(message.url, message.filename).then(function(result) {
      sendResponse(result);
    }).catch(function(err) {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
  
  if (message.type === "imageDataExtracted") {
    var newData = message.data || [];
    var existingUrls = new Set(imageList.map(function(i) { return i.no_watermark_url; }));
    var filtered = newData.filter(function(i) { return !existingUrls.has(i.no_watermark_url); });
    if (filtered.length > 0) {
      imageList = imageList.concat(filtered);
    }
    // 转发到内容面板
    if (filtered.length > 0 && sender.tab && sender.tab.id) {
      var panelItems = filtered.map(function(i) { return { type: "image", url: i.no_watermark_url }; });
      chrome.tabs.sendMessage(sender.tab.id, { type: "MEDIA_FOUND", items: panelItems }).catch(function() {});
    }
    sendResponse({ success: true });
    return true;
  }
  
  if (message.type === "GET_IMAGE_LIST") {
    sendResponse({ success: true, data: imageList });
    return true;
  }
  
  if (message.type === "CHECK_VERSION") {
    checkVersionUpdate().then(function(result) {
      sendResponse({
        valid: result.valid,
        message: result.message,
        warning: result.warning,
        expireDate: result.expireDate,
        updateUrl: result.updateUrl || "",
        newVersion: result.newVersion || "",
        imageCount: imageList.length,
        videoCount: videoList.length,
        version: "13.0",
        lastCheck: lastVersionCheck
      });
    });
    return true;
  }
  
  if (message.type === "CLEAR_IMAGES") {
    imageList = [];
    videoList = [];
    sendResponse({ success: true });
    return true;
  }
  
  if (message.type === "videoDataExtracted") {
    var newData = message.data || [];
    var existingVids = new Set(videoList.map(function(v) { return v.vid; }));
    var filtered = newData.filter(function(v) { return !existingVids.has(v.vid); });
    if (filtered.length > 0) {
      videoList = videoList.concat(filtered);
      // 转发到内容面板（视频只传 vid，后续通过 get_play_info 获取真实 URL）
      if (sender.tab && sender.tab.id) {
        var panelItems = filtered.map(function(v) {
          return { type: "video", url: "", vid: v.vid, messageId: v.messageId };
        });
        chrome.tabs.sendMessage(sender.tab.id, { type: "DOUBAO_VIDS_FOUND", sourceKey: "content:" + sender.tab.id, vids: filtered.map(function(v) { return v.vid; }) }).catch(function() {});
        // 同时尝试通过 background 获取视频 URL
        filtered.forEach(function(v) {
          if (v.vid) {
            callGetPlayInfoFromBg(v.vid).then(function(playResult) {
              if (playResult && playResult.mainUrl && sender.tab && sender.tab.id) {
                chrome.tabs.sendMessage(sender.tab.id, { type: "MEDIA_FOUND", items: [{ type: "video", url: playResult.mainUrl }] }).catch(function() {});
              }
            });
          }
        });
      }
    }
    sendResponse({ success: true });
    return true;
  }
  
  if (message.type === "startVideoDownload") {
    console.log("[Background] 视频下载请求");

    // ========== 激活码功能已禁用 ==========
    // getSavedCardKey().then(async function(cardKey) {
    //   if (!cardKey) { sendResponse({ success: false, error: "请先激活扩展", needActivation: true }); return; }
    //   var verifyResult = await verifyCard(cardKey);
    //   if (!verifyResult.success) { sendResponse({ success: false, error: verifyResult.message, needActivation: true }); return; }
    // });
    if (versionStatus.valid) {
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (!tabs || tabs.length === 0) {
          sendResponse({ success: false, error: "未找到活动标签页" });
          return;
        }
        var tab = tabs[0];
        if (tab.url && tab.url.includes("doubao.com")) {
          chrome.tabs.sendMessage(tab.id, { type: "startVideoDownload" }, function(res) {
            if (chrome.runtime.lastError) {
              console.error("[Background] 发送消息失败:", chrome.runtime.lastError);
              sendResponse({ success: false, error: "无法连接到页面，请刷新页面后重试" });
            } else {
              sendResponse({ success: true });
            }
          });
        } else {
          sendResponse({ success: false, error: "请在豆包页面使用此功能" });
        }
      });
    } else {
      sendResponse({ success: false, error: "版本已失效，请更新后使用" });
    }
    return true;
  }
  
  if (message.type === "doubaoShareSave") {
    callDoubaoShareSave(message.messageId).then(function(result) {
      sendResponse(result);
    }).catch(function(err) {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
  
  if (message.type === "videoDownloadResult") {
    console.log("[Background] 收到视频下载结果");
    var videoData = message.data;
    if (videoData && videoData.success && videoData.videoUrl) {
      var fileName = "doubao_video" + (videoData.width && videoData.height ? "_" + videoData.width + "x" + videoData.height : "") + "_" + Date.now() + ".mp4";
      console.log("[Background] 下载视频文件:", fileName);
      downloadVideo(videoData.videoUrl, fileName, videoData.backupUrl).then(function(result) {
        videoData.downloadResult = result;
        chrome.runtime.sendMessage({ type: "videoDownloadResult", data: videoData }).catch(function() {});
      }).catch(function(err) {
        videoData.downloadResult = { success: false, error: err.message };
        chrome.runtime.sendMessage({ type: "videoDownloadResult", data: videoData }).catch(function() {});
      });
    } else {
      console.log("[Background] 视频数据无效:", videoData);
      chrome.runtime.sendMessage({ type: "videoDownloadResult", data: videoData }).catch(function() {});
    }
    sendResponse({ success: true });
    return true;
  }
  
  // ========== 批量下载相关消息处理 ==========
  if (message.type === "START_BATCH_DOWNLOAD") {
    console.log("[Background] 开始批量下载");

    // ========== 激活码功能已禁用 ==========
    // getSavedCardKey().then(async function(cardKey) {
    //   if (!cardKey) {
    //     sendResponse({ success: false, error: "请先激活扩展", needActivation: true });
    //     return;
    //   }
    //
    //   var verifyResult = await verifyCard(cardKey);
    //   if (!verifyResult.success) {
    //     sendResponse({ success: false, error: verifyResult.message, needActivation: true });
    //     return;
    //   }
    // });

    (async function() {
      const { images, videos } = await getAllMediaData();

      if (images.length === 0 && videos.length === 0) {
        sendResponse({ success: false, error: "没有可下载的内容" });
        return;
      }

      sendResponse({ success: true, totalImages: images.length, totalVideos: videos.length });

      let imageResults = [];
      let videoResults = [];

      if (images.length > 0) {
        imageResults = await batchDownloadImages(images);
      }
      if (videos.length > 0) {
        videoResults = await batchDownloadVideos(videos);
      }

      const successCount =
        imageResults.filter(r => r.success).length +
        videoResults.filter(r => r.success).length;
      const failCount =
        imageResults.filter(r => !r.success).length +
        videoResults.filter(r => !r.success).length;

      chrome.runtime.sendMessage({
        type: "BATCH_DOWNLOAD_COMPLETE",
        data: {
          successCount: successCount,
          failCount: failCount,
          totalImages: images.length,
          totalVideos: videos.length
        }
      });
    })();
    return true;
  }
  
  if (message.type === "SET_BATCH_MEDIA_DATA") {
    chrome.storage.local.set({
      batchImageList: message.images || [],
      batchVideoList: message.videos || []
    }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (message.type === "GET_BATCH_MEDIA_DATA") {
    getAllMediaData().then((data) => {
      sendResponse({ success: true, images: data.images, videos: data.videos });
    });
    return true;
  }
  
  if (message.type === "CLEAR_BATCH_MEDIA_DATA") {
    chrome.storage.local.remove(['batchImageList', 'batchVideoList'], () => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (message.type === "OPEN_BATCH_DOWNLOAD_PANEL") {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "OPEN_BATCH_DOWNLOAD" });
      }
    });
    sendResponse({ success: true });
    return true;
  }
  
  // ========== 千问相关消息 ==========
  if (message.type === "QW_GET_IMAGE_LIST") {
    sendResponse({ success: true, data: message.images || [] });
    return true;
  }
  
  if (message.type === "QW_GET_VIDEO_LIST") {
    sendResponse({ success: true, data: message.videos || [] });
    return true;
  }
});

// 扩展安装时
chrome.runtime.onInstalled.addListener(function(event) {
  checkVersionUpdate();
  if (event.reason === 'install') {
    console.log("[Background] 扩展已安装");
    console.log("[Background] 扩展ID (机器码):", chrome.runtime.id);
  }
  // 调试器初始化：附加到已有的 doubao/dola 标签页
  _attachExistingTabs();
});

// 调试器启动初始化
_attachExistingTabs();
chrome.runtime.onStartup.addListener(_attachExistingTabs);

// 初始检查
checkVersionUpdate();