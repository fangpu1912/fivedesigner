const imageDataMap=new Map, videoButtonMap=new Map;
let domObserverActive=!1,isVersionValid=!0;

// ========== 批量下载相关变量 ==========
let collectedImages = [];
let collectedVideos = [];

// ========== 带重试的消息发送函数 ==========
async function sendMessageWithRetry(message, retryCount = 0) {
    const maxRetries = 3;
    
    return new Promise((resolve) => {
        if (!chrome.runtime || !chrome.runtime.id) {
            console.log('[forwarder] 扩展上下文无效，重试中...', retryCount);
            if (retryCount < maxRetries) {
                setTimeout(() => {
                    sendMessageWithRetry(message, retryCount + 1).then(resolve);
                }, 500);
            } else {
                resolve({ success: false, error: "扩展未就绪，请刷新页面重试" });
            }
            return;
        }
        
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                console.error('[forwarder] 发送消息错误:', chrome.runtime.lastError.message);
                if (retryCount < maxRetries) {
                    setTimeout(() => {
                        sendMessageWithRetry(message, retryCount + 1).then(resolve);
                    }, 500);
                } else {
                    resolve({ success: false, error: chrome.runtime.lastError.message });
                }
                return;
            }
            resolve(response);
        });
    });
}

// ========== 激活码功能已禁用 ==========
// function showActivationModal(message) {
//   const existingModal = document.getElementById("doubao-activation-modal");
//   if (existingModal) existingModal.remove();
//
//   const overlay = document.createElement("div");
//   overlay.id = "doubao-activation-modal";
//   overlay.style.cssText = `
//     position: fixed;
//     top: 0; left: 0; width: 100%; height: 100%;
//     background: rgba(0,0,0,0.7); z-index: 100000;
//     display: flex; align-items: center; justify-content: center;
//     font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
//   `;
//
//   const modal = document.createElement("div");
//   modal.style.cssText = `
//     background: white; border-radius: 16px; padding: 24px;
//     width: 320px; max-width: 90%;
//     box-shadow: 0 20px 60px rgba(0,0,0,0.3); text-align: center;
//   `;
//
//   modal.innerHTML = `
//     <div style="font-size: 48px; margin-bottom: 16px;">🔑</div>
//     <h3 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 600; color: #1f2937;">需要激活</h3>
//     <p style="margin: 0 0 16px 0; font-size: 14px; color: #6b7280;">${message || "请先激活扩展，输入激活码后即可使用"}</p>
//     <input type="text" id="activation-card-input" placeholder="请输入激活码" style="
//       width: 100%; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px;
//       font-size: 14px; margin-bottom: 16px; box-sizing: border-box; outline: none;
//     ">
//     <div id="activation-error-msg" style="color: #ef4444; font-size: 12px; margin-bottom: 12px; display: none;"></div>
//     <button id="activation-submit-btn" style="
//       width: 100%; padding: 12px; background: #2563eb; color: white; border: none;
//       border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.2s;
//     ">立即激活</button>
//     <button id="activation-close-btn" style="
//       width: 100%; margin-top: 12px; padding: 10px; background: transparent;
//       color: #9ca3af; border: none; border-radius: 8px; font-size: 13px; cursor: pointer;
//     ">稍后激活</button>
//   `;
//
//   overlay.appendChild(modal);
//   document.body.appendChild(overlay);
//
//   const cardInput = modal.querySelector("#activation-card-input");
//   const submitBtn = modal.querySelector("#activation-submit-btn");
//   const closeBtn = modal.querySelector("#activation-close-btn");
//   const errorMsg = modal.querySelector("#activation-error-msg");
//
//   cardInput.focus();
//
//   submitBtn.addEventListener("click", async () => {
//     const cardKey = cardInput.value.trim();
//     if (!cardKey) { errorMsg.textContent = "请输入激活码"; errorMsg.style.display = "block"; return; }
//     submitBtn.disabled = true; submitBtn.textContent = "验证中..."; errorMsg.style.display = "none";
//     const result = await sendMessageWithRetry({type: "ACTIVATE_CARD", cardKey: cardKey, machineCode: ""});
//     if (result && result.success) {
//       overlay.remove();
//       showToast("激活成功！现在可以下载了", "success");
//       updateFloatPanel();
//       setTimeout(() => { scanAndInject(); }, 500);
//     } else {
//       errorMsg.textContent = result?.message || "激活失败，请检查激活码";
//       errorMsg.style.display = "block";
//       submitBtn.disabled = false; submitBtn.textContent = "立即激活";
//     }
//   });
//
//   closeBtn.addEventListener("click", () => { overlay.remove(); });
//   overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
//   cardInput.addEventListener("keypress", (e) => { if (e.key === "Enter") submitBtn.click(); });
// }

function showToast(message, type = "error") {
  const toast = document.createElement("div");
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: ${type === "success" ? "#10b981" : "#ef4444"};
    color: white;
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 13px;
    z-index: 100001;
    font-family: system-ui;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    animation: fadeInOut 2.5s ease forwards;
  `;
  toast.textContent = type === "success" ? "✓ " + message : "⚠️ " + message;
  document.body.appendChild(toast);
  
  const style = document.createElement("style");
  style.textContent = `
    @keyframes fadeInOut {
      0% { opacity: 0; transform: translateY(10px); }
      15% { opacity: 1; transform: translateY(0); }
      85% { opacity: 1; transform: translateY(0); }
      100% { opacity: 0; transform: translateY(10px); visibility: hidden; }
    }
  `;
  document.head.appendChild(style);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 2500);
}

// async function checkActivationAndShowModal() {
//   const status = await sendMessageWithRetry({type: "CHECK_ACTIVATION"});
//   if (status && status.activated) {
//     return { allowed: true };
//   } else {
//     showActivationModal(status?.message || "请先激活扩展");
//     return { allowed: false, message: status?.message || "请先激活扩展" };
//   }
// }

function extractFileKey(e){if(!e)return null;const t=e.match(/rc_gen_image\/([^?~]+)/);return t?t[1]:null}
function registerImageData(e){const t=extractFileKey(e.watermark_url||e.no_watermark_url);t&&imageDataMap.set(t,e)}
function injectStyles(){if(document.getElementById("doubao-dl-styles"))return;const e=document.createElement("style");e.id="doubao-dl-styles",e.textContent="\n    .doubao-dl-btn {\n      position: absolute;\n      bottom: 10px;\n      right: 10px;\n      z-index: 9999;\n      display: inline-flex;\n      align-items: center;\n      gap: 5px;\n      padding: 6px 12px;\n      background: rgba(0, 0, 0, 0.62);\n      color: #fff;\n      border: none;\n      border-radius: 8px;\n      font-size: 12px;\n      font-weight: 500;\n      cursor: pointer;\n      backdrop-filter: blur(6px);\n      -webkit-backdrop-filter: blur(6px);\n      transition: background 0.2s, transform 0.15s;\n      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;\n      line-height: 1;\n      white-space: nowrap;\n      pointer-events: all;\n      user-select: none;\n      letter-spacing: 0.2px;\n    }\n    .doubao-dl-btn:hover:not(:disabled) {\n      background: rgba(0, 0, 0, 0.82);\n    }\n    .doubao-dl-btn:active:not(:disabled) {\n      transform: scale(0.97);\n    }\n    .doubao-dl-btn:disabled {\n      cursor: not-allowed;\n      opacity: 0.75;\n    }\n    .doubao-dl-btn.doubao-dl-success {\n      background: rgba(16, 185, 129, 0.85);\n    }\n    .doubao-dl-btn.doubao-dl-error {\n      background: rgba(239, 68, 68, 0.82);\n    }\n    .doubao-dl-btn svg {\n      flex-shrink: 0;\n    }\n  ",document.head.appendChild(e)}
const DOWNLOAD_ICON='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

function injectDownloadButton(e,t){
  if(!isVersionValid) return;
  if(e.dataset.doubaoInjected) return;
  e.dataset.doubaoInjected="1";
  let n=e.parentElement;
  for(let e=0;e<6&&n&&n!==document.body;e++){const e=n.getBoundingClientRect();if(e.width>=100&&e.height>=80)break;n=n.parentElement}
  n||(n=e.parentElement),"static"===getComputedStyle(n).position&&(n.style.position="relative");
  const a=document.createElement("button");
  a.className="doubao-dl-btn";
  a.innerHTML=`${DOWNLOAD_ICON} 下载原图`;
  a.addEventListener("click",async (e)=>{
    e.preventDefault(),e.stopPropagation();
    a.disabled=true;
    a.innerHTML="下载中...";
    
    // const activationCheck = await checkActivationAndShowModal();
    // if (!activationCheck.allowed) {
    //   a.disabled=false;
    //   a.innerHTML=`${DOWNLOAD_ICON} 下载原图`;
    //   return;
    // }
    const n=(extractFileKey(t.no_watermark_url)||String(Date.now())).replace(/\.(jpeg|jpg|png|webp)$/i,"");
    const s=`doubao${t.width&&t.height?`_${t.width}x${t.height}`:""}_${n.slice(-12)}.png`;
    const result = await sendMessageWithRetry({type:"downloadImage",url:t.no_watermark_url,filename:s});
    if(result?.success){
      a.innerHTML="✓ 已下载",a.classList.add("doubao-dl-success");
      setTimeout(()=>{a.disabled=false,a.innerHTML=`${DOWNLOAD_ICON} 下载原图`,a.classList.remove("doubao-dl-success")},3000)
    // } else if(result?.needActivation){
    //   a.innerHTML=`${DOWNLOAD_ICON} 下载原图`,a.disabled=false;
    //   showActivationModal(result.error);
    } else {
      a.innerHTML="失败，点击重试",a.classList.add("doubao-dl-error");
      a.disabled=false;
      setTimeout(()=>{a.innerHTML=`${DOWNLOAD_ICON} 下载原图`,a.classList.remove("doubao-dl-error")},3000)
    }
  });
  n.appendChild(a)
}

function tryInjectForImg(e){if(!e.src||e.dataset.doubaoInjected)return;const t=extractFileKey(e.src);if(!t)return;const n=imageDataMap.get(t);n&&injectDownloadButton(e,n)}
function findMessageId(e){let t=e;for(let e=0;e<20&&t&&t!==document.body;e++){if(t.dataset){if(t.dataset.messageId)return t.dataset.messageId;if(t.dataset.message_id)return t.dataset.message_id}t=t.parentElement}return null}
function injectVideoDownloadButton(e,t){
  if(!isVersionValid) return;
  if(e.dataset.doubaoVideoInjected) return;
  e.dataset.doubaoVideoInjected="1";
  "static"===getComputedStyle(e).position&&(e.style.position="relative");
  const n=document.createElement("button");
  n.className="doubao-dl-btn";
  n.innerHTML=`${DOWNLOAD_ICON} 下载视频`;
  n.addEventListener("click",async (e)=>{
    e.preventDefault(),e.stopPropagation();
    n.disabled=true;
    n.innerHTML="获取链接中...";
    
    // console.log("[forwarder.js] 点击下载视频，开始检查激活");
    // const activationCheck = await checkActivationAndShowModal();
    // console.log("[forwarder.js] 激活检查结果:", activationCheck);
    // if (!activationCheck.allowed) {
    //   n.disabled=false;
    //   n.innerHTML=`${DOWNLOAD_ICON} 下载视频`;
    //   return;
    // }
    
    console.log("[forwarder.js] 开始获取视频链接, messageId:", t);
    videoButtonMap.set(t,n);
    window.postMessage({type:"startVideoDownloadByMessageId",messageId:t},"*")
  });
  e.appendChild(n)
}
function tryInjectForVideo(e){if(!e.className||"string"!=typeof e.className)return;if(!e.className.includes("block-video"))return;if(e.dataset.doubaoVideoInjected)return;if(!(e.querySelector('[class*="cover-"]')||e.querySelector('[class*="video-player"]')||e.querySelector('[class*="play-icon"]')))return;const t=findMessageId(e);t&&injectVideoDownloadButton(e,t)}
function scanAndInjectVideos(){document.querySelectorAll('[class*="block-video"]').forEach(tryInjectForVideo)}
function scanAndInject(){document.querySelectorAll("img").forEach(tryInjectForImg),scanAndInjectVideos()}

function startDOMObserver(){
  if(domObserverActive)return;
  domObserverActive=true;
  injectStyles();
  scanAndInject();
  
  // 等待 DOM 加载完成后再启动 MutationObserver
  const startObserver = function() {
    if(!document.body) {
      setTimeout(startObserver, 100);
      return;
    }
    new MutationObserver(function(e){
      let t=false;
      for(const n of e){
        if("childList"===n.type && n.addedNodes.length>0){
          for(const e of n.addedNodes){
            if(1===e.nodeType){
              if("IMG"===e.tagName){
                tryInjectForImg(e);
              } else if(e.querySelectorAll){
                e.querySelectorAll("img").forEach(tryInjectForImg);
              }
              if(e.classList && "string"==typeof e.className && e.className.includes("block-video")){
                tryInjectForVideo(e);
              }
              if(e.querySelectorAll){
                e.querySelectorAll('[class*="block-video"]').forEach(tryInjectForVideo);
              }
            }
          }
          t=true;
        }
        if("attributes"===n.type && "IMG"===n.target.tagName){
          tryInjectForImg(n.target);
        }
      }
      t&&scanAndInject();
    }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["src"]});
  };
  startObserver();
}

function init(){try{
  isVersionValid=true;
  sendMessageWithRetry({type:"CHECK_VERSION"}).then(()=>{
    sendMessageWithRetry({type:"GET_IMAGE_LIST"}).then(e=>{
      e?.data&&e.data.forEach(registerImageData);
      startDOMObserver();
      window.postMessage({type:"scanInitialVideos"},"*");
      setTimeout(()=>{window.postMessage({type:"scanInitialVideos"},"*")},1500);
    });
  });
}catch(e){}}

// ========== 右下角悬浮浮窗 ==========
let floatPanel = null;
let isDragging = false;
let dragStartX = 0, dragStartY = 0;
let panelStartX = 0, panelStartY = 0;

async function updateFloatPanel() {
  if (!floatPanel) return;
  
  // const status = await sendMessageWithRetry({type: "CHECK_ACTIVATION"});
  const imageListResult = await sendMessageWithRetry({type: "GET_IMAGE_LIST"});
  const imageListData = imageListResult?.data || [];
  const versionInfo = await sendMessageWithRetry({type: "CHECK_VERSION"});
  
  const imageCount = imageListData.length;
  const videoCount = versionInfo?.videoCount || 0;
  const version = versionInfo?.version || "13.0";
  
  // const isActivated = status?.activated || false;
  // const remainingCount = status?.remainingCount;
  // const expireTime = status?.expireTime;
  
  // let statusHtml = '';
  // if (isActivated) {
  //   statusHtml = '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;"><span style="background: #10b981; width: 8px; height: 8px; border-radius: 50%; display: inline-block;"></span><span style="font-size: 13px; font-weight: 500; color: #10b981;">已激活</span></div>';
  // } else {
  //   statusHtml = '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;"><span style="background: #ef4444; width: 8px; height: 8px; border-radius: 50%; display: inline-block;"></span><span style="font-size: 13px; font-weight: 500; color: #ef4444;">未激活</span><button id="float-activate-btn" style="margin-left: auto; padding: 4px 10px; background: #2563eb; color: white; border: none; border-radius: 6px; font-size: 11px; cursor: pointer;">立即激活</button></div>';
  // }
  
  // let infoHtml = '';
  // if (isActivated) {
  //   infoHtml = '<div style="background: #eff6ff; padding: 10px; border-radius: 8px; margin-bottom: 12px; font-size: 12px; color: #1e40af; line-height: 1.6;">';
  //   infoHtml += '激活状态：有效<br>';
  //   if (expireTime && expireTime !== "永久有效") {
  //     infoHtml += '过期时间：' + expireTime + '<br>';
  //   } else if (expireTime === "永久有效") {
  //     infoHtml += '过期时间：永久有效<br>';
  //   }
  //   if (remainingCount !== undefined && remainingCount !== null) {
  //     infoHtml += '剩余次数：' + remainingCount + '次';
  //   }
  //   infoHtml += '</div>';
  // } else {
  //   infoHtml = '<div style="background: #fef3c7; padding: 10px; border-radius: 8px; margin-bottom: 12px; font-size: 12px; color: #92400e;">请先激活扩展，输入激活码后即可使用</div>';
  // }
  
  floatPanel.innerHTML = `
    <div id="float-panel-header" style="
      padding: 12px 16px;
      background: #2563eb;
      color: white;
      border-radius: 12px 12px 0 0;
      cursor: move;
      display: flex;
      align-items: center;
      justify-content: space-between;
      user-select: none;
    ">
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 22px;">🔑</span>
        <div style="font-weight: 700; font-size: 16px; line-height: 1.5;">
          豆包无水印下载
        </div>
      </div>
      <div style="display: flex; gap: 10px;">
        <button id="float-minimize-btn" style="background: none; border: none; color: white; cursor: pointer; font-size: 18px; font-weight: bold; padding: 0; margin: 0; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;">−</button>
        <button id="float-close-btn" style="background: none; border: none; color: white; cursor: pointer; font-size: 20px; padding: 0; margin: 0; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;">✕</button>
      </div>
    </div>
    <div id="float-panel-body" style="padding: 16px;">
      ${/* statusHtml */''}
      ${/* infoHtml */''}
      <div style="display: flex; gap: 12px; padding: 12px 0; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; margin-bottom: 12px;">
        <div style="flex: 1; text-align: center;">
          <div style="font-size: 22px; font-weight: 700; color: #2563eb;">${imageCount}</div>
          <div style="font-size: 11px; color: #6b7280;">已捕获图片</div>
        </div>
        <div style="width: 1px; background: #e5e7eb;"></div>
        <div style="flex: 1; text-align: center;">
          <div style="font-size: 22px; font-weight: 700; color: #2563eb;">${videoCount}</div>
          <div style="font-size: 11px; color: #6b7280;">已捕获视频</div>
        </div>
      </div>
      <button id="float-batch-btn" style="
        width: 100%;
        padding: 10px;
        background: #7c3aed;
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      ">📦 一键批量下载</button>
      <div style="text-align: center; font-size: 11px; color: #9ca3af; margin-top: 12px;">版本 ${version}</div>
    </div>
  `;
  
  const minimizeBtn = floatPanel.querySelector("#float-minimize-btn");
  const closeBtn = floatPanel.querySelector("#float-close-btn");
  const activateBtn = floatPanel.querySelector("#float-activate-btn");
  const batchBtn = floatPanel.querySelector("#float-batch-btn");
  
  if (minimizeBtn) {
    minimizeBtn.addEventListener("click", () => {
      const body = floatPanel.querySelector("#float-panel-body");
      if (body.style.display === "none") {
        body.style.display = "block";
        minimizeBtn.textContent = "−";
      } else {
        body.style.display = "none";
        minimizeBtn.textContent = "+";
      }
    });
  }
  
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      floatPanel.style.display = "none";
    });
  }
  
  // if (activateBtn) {
  //   activateBtn.addEventListener("click", () => {
  //     showActivationModal("请输入激活码激活扩展");
  //   });
  // }
  
  if (batchBtn) {
    batchBtn.addEventListener("click", async () => {
      console.log("[批量下载] 按钮被点击，当前收集的图片:", collectedImages.length, "视频:", collectedVideos.length);
      
      if (collectedImages.length === 0 && collectedVideos.length === 0) {
        showToast("没有待下载的内容，请先刷新页面让插件捕获内容", "error");
        return;
      }
      
      // const activationCheck = await checkActivationAndShowModal();
      // if (!activationCheck.allowed) return;
      
      batchBtn.disabled = true;
      batchBtn.textContent = "下载中...";
      batchBtn.style.opacity = "0.6";
      
      await sendMessageWithRetry({
        type: "SET_BATCH_MEDIA_DATA",
        images: collectedImages,
        videos: collectedVideos
      });
      
      const response = await sendMessageWithRetry({ type: "START_BATCH_DOWNLOAD" });
      console.log("[批量下载] 响应:", response);
      if (response && response.success) {
        showToast(`开始下载 ${response.totalImages} 张图片和 ${response.totalVideos} 个视频`, "success");
      // } else if (response && response.needActivation) {
      //   showActivationModal(response.error);
      } else {
        showToast(response?.error || "下载失败", "error");
      }
      batchBtn.disabled = false;
      batchBtn.textContent = "📦 一键批量下载";
      batchBtn.style.opacity = "1";
    });
    batchBtn.addEventListener("mouseenter", () => { batchBtn.style.background = "#6d28d9"; });
    batchBtn.addEventListener("mouseleave", () => { batchBtn.style.background = "#7c3aed"; });
  }
}

function createFloatPanel() {
  if (floatPanel) return;
  
  floatPanel = document.createElement("div");
  floatPanel.id = "doubao-float-panel";
  floatPanel.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 280px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    z-index: 99998;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
    overflow: hidden;
    transition: box-shadow 0.2s;
  `;
  
  document.body.appendChild(floatPanel);
  
  setTimeout(() => {
    const header = floatPanel.querySelector("#float-panel-header");
    if (header) {
      header.addEventListener("mousedown", startDrag);
    }
  }, 100);
  
  updateFloatPanel();
}

function startDrag(e) {
  if (e.target.tagName === "BUTTON") return;
  isDragging = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  const rect = floatPanel.getBoundingClientRect();
  panelStartX = rect.left;
  panelStartY = rect.top;
  
  document.addEventListener("mousemove", onDrag);
  document.addEventListener("mouseup", stopDrag);
  floatPanel.style.transition = "none";
}

function onDrag(e) {
  if (!isDragging) return;
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  let newLeft = panelStartX + dx;
  let newTop = panelStartY + dy;
  
  const maxX = window.innerWidth - floatPanel.offsetWidth;
  const maxY = window.innerHeight - floatPanel.offsetHeight;
  newLeft = Math.max(0, Math.min(newLeft, maxX));
  newTop = Math.max(0, Math.min(newTop, maxY));
  
  floatPanel.style.left = newLeft + "px";
  floatPanel.style.top = newTop + "px";
  floatPanel.style.right = "auto";
  floatPanel.style.bottom = "auto";
}

function stopDrag() {
  isDragging = false;
  document.removeEventListener("mousemove", onDrag);
  document.removeEventListener("mouseup", stopDrag);
  floatPanel.style.transition = "";
}

function initFloatPanel() {
  if (document.body) {
    createFloatPanel();
    setInterval(() => {
      if (floatPanel && floatPanel.style.display !== "none") {
        updateFloatPanel();
      }
    }, 10000);
  } else {
    setTimeout(initFloatPanel, 100);
  }
}

let pendingUpdate = false;

function debouncedUpdateFloatPanel() {
  if (pendingUpdate) return;
  pendingUpdate = true;
  setTimeout(() => {
    pendingUpdate = false;
    if (floatPanel && floatPanel.style.display !== "none") {
      updateFloatPanel();
    }
  }, 500);
}

function addToBatchCollection(imageData) {
  const exists = collectedImages.some(img => 
    img.no_watermark_url === imageData.no_watermark_url
  );
  if (!exists && collectedImages.length < 500) {
    collectedImages.push(imageData);
    debouncedUpdateFloatPanel();
    console.log("[批量下载] 已添加图片，当前共", collectedImages.length, "张");
  }
}

function addVideoToBatchCollection(videoData) {
  const exists = collectedVideos.some(v => v.vid === videoData.vid);
  if (!exists && collectedVideos.length < 100) {
    collectedVideos.push(videoData);
    debouncedUpdateFloatPanel();
    console.log("[批量下载] 已添加视频，当前共", collectedVideos.length, "个");
  }
}

initFloatPanel();

function keepAlive() {
  setInterval(() => {
    if (chrome.runtime && chrome.runtime.id) {
      chrome.runtime.sendMessage({ type: "PING" }, () => {
        if (chrome.runtime.lastError) {}
      });
    }
  }, 20000);
}
keepAlive();

let lastImageProcessTime = 0;
let lastVideoProcessTime = 0;

window.addEventListener("message",e=>{
  const t=e.data;
  if(t){
    if("imageDataExtracted"===t.type){
      const now = Date.now();
      if (now - lastImageProcessTime < 500) return;
      lastImageProcessTime = now;
      
      const images = t.data || [];
      try{
        sendMessageWithRetry({type:"imageDataExtracted",data:images}).catch(()=>{});
      }catch(e){}
      images.forEach(registerImageData);
      images.forEach(img => addToBatchCollection(img));
      setTimeout(scanAndInject,300);
    }
    if("videoDownloadResult"===t.type){
      const e=t.data,n=e?.messageId,a=n?videoButtonMap.get(n):null;
      a&&(e?.success?(a.innerHTML="✓ 下载已开始",a.classList.add("doubao-dl-success"),setTimeout(()=>{a.disabled=false,a.innerHTML=`${DOWNLOAD_ICON} 下载视频`,a.classList.remove("doubao-dl-success")},3000)):(a.innerHTML="失败，点击重试",a.classList.add("doubao-dl-error"),a.disabled=false,setTimeout(()=>{a.innerHTML=`${DOWNLOAD_ICON} 下载视频`,a.classList.remove("doubao-dl-error")},3000)),videoButtonMap.delete(n));
      try{
        sendMessageWithRetry({type:"videoDownloadResult",data:e}).catch(()=>{});
      }catch(e){}
    }
    if("videoDataExtracted"===t.type){
      const now = Date.now();
      if (now - lastVideoProcessTime < 500) return;
      lastVideoProcessTime = now;
      
      const videos = t.data || [];
      try{
        sendMessageWithRetry({type:"videoDataExtracted",data:videos}).catch(()=>{});
      }catch(e){}
      videos.forEach(video => addVideoToBatchCollection(video));
      setTimeout(scanAndInjectVideos,300);
    }
    if("doubaoShareSave"===t.type){
      try{
        sendMessageWithRetry({type:"doubaoShareSave",messageId:t.messageId}).then(e=>{
          window.postMessage({type:"doubaoShareSaveResult",data:e},"*")
        }).catch(()=>{
          window.postMessage({type:"doubaoShareSaveResult",data:null},"*")
        });
      }catch(e){
        window.postMessage({type:"doubaoShareSaveResult",data:null},"*")
      }
    }
    if("BATCH_DOWNLOAD_COMPLETE"===t.type){
      const data = t.data;
      if(data){
        showToast(`批量下载完成！成功: ${data.successCount}, 失败: ${data.failCount}`, 
          data.failCount === 0 ? "success" : "error");
        updateFloatPanel();
      }
    }
  }
});

chrome.runtime.onMessage.addListener((e,t,n)=>{
  if("newImageData"===e.type){
    (e.data||[]).forEach(registerImageData);
    setTimeout(scanAndInject,300);
    n({success:true});
    return true;
  }
  if("startVideoDownload"===e.type){
    window.postMessage({type:"startVideoDownload"},"*");
    n({success:true});
    return true;
  }
  return false;
});

// 等待 DOM 加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

setTimeout(() => {
  console.log("[批量下载] 扫描现有图片数据...");
  let count = 0;
  imageDataMap.forEach((data) => {
    if (count < 200) {
      addToBatchCollection(data);
      count++;
    }
  });
}, 5000);

// ========== 15秒选项激活状态转发（已禁用） ==========
// window.addEventListener('message', async (event) => {
//   const data = event.data;
//
//   if (data && data.type === 'DOUBAO_15S_CHECK_ACTIVATION') {
//     console.log('[forwarder] 收到15秒激活状态查询');
//     try {
//       const status = await sendMessageWithRetry({ type: "CHECK_ACTIVATION" });
//       const isActivated = status && status.activated === true;
//       console.log('[forwarder] 激活状态:', isActivated);
//       window.postMessage({ type: 'DOUBAO_15S_ACTIVATION_RESULT', activated: isActivated }, '*');
//     } catch (err) {
//       console.error('[forwarder] 查询激活状态失败:', err);
//       window.postMessage({ type: 'DOUBAO_15S_ACTIVATION_RESULT', activated: false }, '*');
//     }
//   }
//
//   if (data && data.type === 'DOUBAO_15S_ACTIVATE') {
//     console.log('[forwarder] 收到15秒激活请求, cardKey:', data.cardKey);
//     try {
//       const result = await sendMessageWithRetry({ type: "ACTIVATE_CARD", cardKey: data.cardKey, machineCode: "" });
//       console.log('[forwarder] 激活结果:', result);
//       if (result && result.success) {
//         await new Promise(resolve => {
//           chrome.storage.local.set({ activated: true }, resolve);
//         });
//         window.postMessage({ type: 'DOUBAO_15S_ACTIVATE_RESULT', success: true, message: result.message }, '*');
//         window.postMessage({ type: 'DOUBAO_15S_ACTIVATE_SUCCESS' }, '*');
//       } else {
//         window.postMessage({ type: 'DOUBAO_15S_ACTIVATE_RESULT', success: false, message: result?.message || '激活失败' }, '*');
//       }
//     } catch (err) {
//       console.error('[forwarder] 激活请求失败:', err);
//       window.postMessage({ type: 'DOUBAO_15S_ACTIVATE_RESULT', success: false, message: err.message }, '*');
//     }
//   }
// });