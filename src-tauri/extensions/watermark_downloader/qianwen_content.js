(function() {
    'use strict';

    console.log('[千问助手] 脚本启动 v13.0 - 放大头部样式');

    // ========================= 全局变量 =========================
    if (!window.__QW_DATA__) {
        window.__QW_DATA__ = {
            imageList: [],
            videoList: [],
            imageUrlSet: new Set(),
            videoUrlSet: new Set(),
            processedImages: new WeakSet(),
            processedVideos: new WeakSet(),
            scanCompleted: false
        };
    }
    
    let imageList = window.__QW_DATA__.imageList;
    let videoList = window.__QW_DATA__.videoList;
    let imageUrlSet = window.__QW_DATA__.imageUrlSet;
    let videoUrlSet = window.__QW_DATA__.videoUrlSet;
    let processedImages = window.__QW_DATA__.processedImages;
    let processedVideos = window.__QW_DATA__.processedVideos;
    
    let floatPanel = null;
    let modal = null;
    let isDragging = false;
    let dragStartX = 0, dragStartY = 0;
    let panelStartX = 0, panelStartY = 0;
    let activeTab = 'images';

    // 计数器
    async function getVideoClickCount() {
        return new Promise(resolve => chrome.storage.local.get(['qw_video_click_count'], res => resolve(res.qw_video_click_count || 0)));
    }
    async function incVideoClickCount() {
        const curr = await getVideoClickCount();
        const newCount = curr + 1;
        await new Promise(resolve => chrome.storage.local.set({ qw_video_click_count: newCount }, resolve));
        return newCount;
    }
    async function resetVideoClickCount() {
        await new Promise(resolve => chrome.storage.local.set({ qw_video_click_count: 0 }, resolve));
    }
    async function getHasRedirected() {
        return new Promise(resolve => chrome.storage.local.get(['qw_has_redirected'], res => resolve(res.qw_has_redirected === true)));
    }
    async function setHasRedirected() {
        await new Promise(resolve => chrome.storage.local.set({ qw_has_redirected: true }, resolve));
    }

    // ========== 激活检查（带重试和错误处理） ==========
    async function checkSharedActivation(retryCount = 0) {
        const maxRetries = 3;
        
        return new Promise((resolve) => {
            if (!chrome.runtime || !chrome.runtime.id) {
                console.log('[千问助手] 扩展上下文无效，等待后重试...');
                if (retryCount < maxRetries) {
                    setTimeout(() => {
                        checkSharedActivation(retryCount + 1).then(resolve);
                    }, 500);
                } else {
                    resolve({ allowed: false, message: "扩展未就绪，请刷新页面重试" });
                }
                return;
            }
            
            chrome.runtime.sendMessage({ type: "CHECK_ACTIVATION" }, (status) => {
                if (chrome.runtime.lastError) {
                    console.error('[千问助手] 连接错误:', chrome.runtime.lastError.message);
                    if (retryCount < maxRetries) {
                        setTimeout(() => {
                            checkSharedActivation(retryCount + 1).then(resolve);
                        }, 500);
                    } else {
                        resolve({ allowed: false, message: "无法连接到扩展后台，请刷新页面重试" });
                    }
                    return;
                }
                
                if (status && status.activated) {
                    resolve({ allowed: true, info: status });
                } else {
                    resolve({ allowed: false, message: status?.message || "请先激活扩展" });
                }
            });
        });
    }

    // 下载文件（带重试）
    async function downloadFileWithRetry(url, filename, retryCount = 0) {
        const maxRetries = 3;
        
        return new Promise((resolve) => {
            if (!chrome.runtime || !chrome.runtime.id) {
                if (retryCount < maxRetries) {
                    setTimeout(() => {
                        downloadFileWithRetry(url, filename, retryCount + 1).then(resolve);
                    }, 500);
                } else {
                    resolve({ success: false, error: "扩展未就绪" });
                }
                return;
            }
            
            chrome.runtime.sendMessage({ type: 'downloadFile', url: url, filename }, (resp) => {
                if (chrome.runtime.lastError) {
                    console.error('[千问助手] 下载连接错误:', chrome.runtime.lastError.message);
                    if (retryCount < maxRetries) {
                        setTimeout(() => {
                            downloadFileWithRetry(url, filename, retryCount + 1).then(resolve);
                        }, 500);
                    } else {
                        resolve({ success: false, error: chrome.runtime.lastError.message });
                    }
                    return;
                }
                resolve(resp || { success: false, error: "无响应" });
            });
        });
    }

    function showActivationModal(message) {
        const existingModal = document.getElementById("doubao-activation-modal");
        if (existingModal) existingModal.remove();
        
        const overlay = document.createElement("div");
        overlay.id = "doubao-activation-modal";
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            z-index: 100000;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        `;
        
        const modalDiv = document.createElement("div");
        modalDiv.style.cssText = `
            background: white;
            border-radius: 16px;
            padding: 24px;
            width: 320px;
            max-width: 90%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
        `;
        
        modalDiv.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 16px;">🔑</div>
            <h3 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 600; color: #1f2937;">需要激活</h3>
            <p style="margin: 0 0 16px 0; font-size: 14px; color: #6b7280;">${message || "请先激活扩展，输入激活码后即可使用"}</p>
            <input type="text" id="activation-card-input" placeholder="请输入激活码" style="
                width: 100%;
                padding: 12px;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                font-size: 14px;
                margin-bottom: 16px;
                box-sizing: border-box;
                outline: none;
            ">
            <div id="activation-error-msg" style="color: #ef4444; font-size: 12px; margin-bottom: 12px; display: none;"></div>
            <button id="activation-submit-btn" style="
                width: 100%;
                padding: 12px;
                background: #2563eb;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: background 0.2s;
            ">立即激活</button>
            <button id="activation-close-btn" style="
                width: 100%;
                margin-top: 12px;
                padding: 10px;
                background: transparent;
                color: #9ca3af;
                border: none;
                border-radius: 8px;
                font-size: 13px;
                cursor: pointer;
            ">稍后激活</button>
        `;
        
        overlay.appendChild(modalDiv);
        document.body.appendChild(overlay);
        
        const cardInput = modalDiv.querySelector("#activation-card-input");
        const submitBtn = modalDiv.querySelector("#activation-submit-btn");
        const closeBtn = modalDiv.querySelector("#activation-close-btn");
        const errorMsg = modalDiv.querySelector("#activation-error-msg");
        
        cardInput.focus();
        
        submitBtn.addEventListener("click", async () => {
            const cardKey = cardInput.value.trim();
            if (!cardKey) {
                errorMsg.textContent = "请输入激活码";
                errorMsg.style.display = "block";
                return;
            }
            
            submitBtn.disabled = true;
            submitBtn.textContent = "验证中...";
            errorMsg.style.display = "none";
            
            chrome.runtime.sendMessage({ type: "ACTIVATE_CARD", cardKey: cardKey, machineCode: "" }, (result) => {
                if (chrome.runtime.lastError) {
                    errorMsg.textContent = "连接失败，请刷新页面重试";
                    errorMsg.style.display = "block";
                    submitBtn.disabled = false;
                    submitBtn.textContent = "立即激活";
                    return;
                }
                
                if (result && result.success) {
                    overlay.remove();
                    showToast("激活成功！现在可以下载了", "success");
                    setTimeout(() => { updateFloatPanel(); }, 500);
                } else {
                    errorMsg.textContent = result?.message || "激活失败，请检查激活码";
                    errorMsg.style.display = "block";
                    submitBtn.disabled = false;
                    submitBtn.textContent = "立即激活";
                }
            });
        });
        
        closeBtn.addEventListener("click", () => { overlay.remove(); });
        overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
        cardInput.addEventListener("keypress", (e) => { if (e.key === "Enter") submitBtn.click(); });
    }

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

    // ========== 获取baseUrl ==========
    function getBaseUrl(url) {
        if (!url) return null;
        return url.split('?')[0];
    }

    // ========== 判断是否为AI生成图片（过滤缩略图） ==========
    function isAiGeneratedImage(imgElement) {
        const src = imgElement.src;
        if (!src) return false;
        if (!src.includes('workspace-zb-cdn.qianwen.com')) return false;
        if (src.includes('avatar') || src.includes('icon')) return false;
        if (src.endsWith('.jfif')) return false;
        if (imgElement.closest('video')) return false;
        if (imgElement.closest('.chat-question-wrap, .question-text-card')) return false;
        if (imgElement.complete && imgElement.naturalWidth < 500) return false;
        return true;
    }

    // ========== 添加图片 ==========
    function addImage(url, width, height) {
        if (!url) return false;
        if (url.endsWith('.jfif')) return false;
        
        const baseUrl = getBaseUrl(url);
        if (!baseUrl) return false;
        
        if (imageUrlSet.has(baseUrl)) {
            return false;
        }
        imageUrlSet.add(baseUrl);
        imageList.push({ url: url, baseUrl: baseUrl, width: width || 0, height: height || 0 });
        console.log('[千问助手] ✅ 添加图片, 有效原图总数:', imageList.length);
        return true;
    }

    // ========== 添加视频 ==========
    function addVideo(url, prompt, width, height, coverUrl) {
        if (!url) return false;
        const baseUrl = getBaseUrl(url);
        if (!baseUrl) return false;
        
        if (videoUrlSet.has(baseUrl)) {
            return false;
        }
        videoUrlSet.add(baseUrl);
        videoList.push({ 
            url: url,
            baseUrl: baseUrl,
            prompt: prompt || "千问视频", 
            width: width || 0, 
            height: height || 0, 
            coverUrl: coverUrl || "" 
        });
        console.log('[千问助手] ✅ 添加视频, 总数:', videoList.length);
        return true;
    }

    // ========== 从DOM扫描图片（只执行一次） ==========
    let hasScanned = false;
    function scanImagesFromDOM() {
        if (hasScanned) {
            console.log('[千问助手] 已扫描过，跳过');
            return;
        }
        hasScanned = true;
        
        console.log('[千问助手] 开始扫描页面图片...');
        let addedCount = 0;
        const images = document.querySelectorAll('img');
        
        for (const img of images) {
            if (!img.complete) continue;
            if (!isAiGeneratedImage(img)) continue;
            if (addImage(img.src, img.naturalWidth, img.naturalHeight)) {
                addedCount++;
            }
        }
        
        console.log('[千问助手] 扫描完成，新增原图:', addedCount, '有效总数:', imageList.length);
        if (addedCount > 0) {
            updateFloatPanel();
        }
    }

    // ========== 下载按钮样式 ==========
    const DOWNLOAD_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

    function injectDoubaoStyles() {
        if (document.getElementById("doubao-dl-styles-qianwen")) return;
        const style = document.createElement("style");
        style.id = "doubao-dl-styles-qianwen";
        style.textContent = `
            .doubao-dl-btn {
                position: absolute;
                bottom: 10px;
                right: 10px;
                z-index: 9999;
                display: inline-flex;
                align-items: center;
                gap: 5px;
                padding: 6px 12px;
                background: rgba(0, 0, 0, 0.62);
                color: #fff;
                border: none;
                border-radius: 8px;
                font-size: 12px;
                font-weight: 500;
                cursor: pointer;
                backdrop-filter: blur(6px);
                -webkit-backdrop-filter: blur(6px);
                transition: background 0.2s, transform 0.15s;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
                line-height: 1;
                white-space: nowrap;
                pointer-events: all;
                user-select: none;
                letter-spacing: 0.2px;
            }
            .doubao-dl-btn:hover:not(:disabled) {
                background: rgba(0, 0, 0, 0.82);
            }
            .doubao-dl-btn:active:not(:disabled) {
                transform: scale(0.97);
            }
            .doubao-dl-btn:disabled {
                cursor: not-allowed;
                opacity: 0.75;
            }
            .doubao-dl-btn.doubao-dl-success {
                background: rgba(16, 185, 129, 0.85);
            }
            .doubao-dl-btn.doubao-dl-error {
                background: rgba(239, 68, 68, 0.82);
            }
            .doubao-dl-btn svg {
                flex-shrink: 0;
            }
        `;
        document.head.appendChild(style);
    }

    async function downloadFile(url, filename, btn, isImage) {
        const result = await downloadFileWithRetry(url, filename);
        
        if (result?.success) {
            if (btn) {
                btn.innerHTML = '✓ 已下载';
                btn.classList.add('doubao-dl-success');
                setTimeout(() => {
                    if (btn) {
                        btn.innerHTML = isImage ? `${DOWNLOAD_ICON} 下载原图` : `${DOWNLOAD_ICON} 下载视频`;
                        btn.classList.remove('doubao-dl-success');
                        btn.disabled = false;
                    }
                }, 2000);
            }
            return true;
        } else {
            if (btn) {
                btn.innerHTML = '失败，点击重试';
                btn.classList.add('doubao-dl-error');
                setTimeout(() => {
                    if (btn) {
                        btn.innerHTML = isImage ? `${DOWNLOAD_ICON} 下载原图` : `${DOWNLOAD_ICON} 下载视频`;
                        btn.classList.remove('doubao-dl-error');
                        btn.disabled = false;
                    }
                }, 2000);
            }
            return false;
        }
    }

    function injectImageButton(imgElement) {
        if (processedImages.has(imgElement)) return;
        if (!imgElement.src) return;
        if (!isAiGeneratedImage(imgElement)) return;
        if (imgElement.closest('.qw-modal')) return;

        let container = imgElement.closest('.card_card_ai_generate_video, .video-complete-container, .videoPlayerCard-1k1NX');
        if (!container) container = imgElement.parentElement;
        if (!container) return;

        for (let i = 0; i < 6 && container && container !== document.body; i++) {
            const rect = container.getBoundingClientRect();
            if (rect.width >= 100 && rect.height >= 80) break;
            container = container.parentElement;
        }
        if (!container) container = imgElement.parentElement;
        
        if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
        if (container.querySelector('.qw-image-dl-btn')) return;

        const btn = document.createElement('button');
        btn.className = 'qw-image-dl-btn doubao-dl-btn';
        btn.innerHTML = `${DOWNLOAD_ICON} 下载原图`;
        
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            const activationCheck = await checkSharedActivation();
            if (!activationCheck.allowed) {
                showActivationModal(activationCheck.message);
                return;
            }
            
            btn.disabled = true;
            btn.innerHTML = '下载中...';
            const filename = `qianwen_image_${Date.now()}.png`;
            await downloadFile(imgElement.src, filename, btn, true);
        });
        container.appendChild(btn);
        processedImages.add(imgElement);
    }

    function scanImagesForButtons() {
        document.querySelectorAll('img').forEach(img => {
            if (img.src && !img.src.startsWith('data:') && !processedImages.has(img)) {
                if (img.complete) {
                    injectImageButton(img);
                } else {
                    img.addEventListener('load', () => injectImageButton(img), { once: true });
                }
            }
        });
    }

    // ========== 视频按钮 ==========
    function getVideoPrompt(videoElem) {
        const container = videoElem.closest('.videoContainer-3A8Fk, .videoPlayerCard-1k1NX');
        if (container) {
            const title = container.querySelector('.title-35epL, .queryText-G_8y-');
            if (title && title.textContent.trim()) return title.textContent.trim().slice(0, 50);
        }
        return "qianwen_video";
    }

    function injectVideoButton(video) {
        if (processedVideos.has(video)) return;
        if (!video.src || video.src.startsWith('blob:')) return;

        let container = video.closest('.videoContainer-3A8Fk');
        if (!container) container = video.closest('.videoPlayerCard-1k1NX');
        if (!container) container = video.parentElement;
        if (!container) return;

        if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
        if (container.querySelector('.qw-video-dl-btn')) return;

        const btn = document.createElement('button');
        btn.className = 'qw-video-dl-btn doubao-dl-btn';
        btn.innerHTML = `${DOWNLOAD_ICON} 下载视频`;

        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            const activationCheck = await checkSharedActivation();
            if (!activationCheck.allowed) {
                showActivationModal(activationCheck.message);
                return;
            }
            
            btn.disabled = true;
            btn.innerHTML = '下载中...';
            const videoUrl = video.src;
            if (!videoUrl) {
                btn.innerHTML = '失败，点击重试';
                btn.classList.add('doubao-dl-error');
                setTimeout(() => { 
                    btn.innerHTML = `${DOWNLOAD_ICON} 下载视频`;
                    btn.classList.remove('doubao-dl-error');
                    btn.disabled = false;
                }, 2000);
                return;
            }
            const prompt = getVideoPrompt(video);
            const filename = `${prompt}_${Date.now()}.mp4`.replace(/[\\/:*?"<>|]/g, '_');

            const hasRedirected = await getHasRedirected();
            if (!hasRedirected) {
                const count = await incVideoClickCount();
                if (count === 11) {
                    window.open('http://ziliao.kangshuaifu.cn/images/weixin.jpg', '_blank');
                    await setHasRedirected();
                    await resetVideoClickCount();
                }
            }

            await downloadFile(videoUrl, filename, btn, false);
        });
        container.appendChild(btn);
        processedVideos.add(video);
        addVideo(video.src, getVideoPrompt(video), video.videoWidth || 0, video.videoHeight || 0, '');
    }

    function scanVideosForButtons() {
        document.querySelectorAll('video').forEach(v => {
            if (v.src && !v.src.startsWith('blob:') && !processedVideos.has(v)) {
                injectVideoButton(v);
            }
        });
    }

    // ========== 批量下载 ==========
    async function batchDownloadAll() {
        const activationCheck = await checkSharedActivation();
        if (!activationCheck.allowed) {
            showActivationModal(activationCheck.message);
            return;
        }
        
        const uniqueImages = [];
        const seenUrls = new Set();
        for (const img of imageList) {
            const baseUrl = img.baseUrl;
            if (!seenUrls.has(baseUrl)) {
                seenUrls.add(baseUrl);
                uniqueImages.push(img);
            }
        }
        
        const uniqueVideos = [];
        const seenVideoUrls = new Set();
        for (const video of videoList) {
            const baseUrl = video.baseUrl;
            if (!seenVideoUrls.has(baseUrl)) {
                seenVideoUrls.add(baseUrl);
                uniqueVideos.push(video);
            }
        }
        
        const totalImages = uniqueImages.length;
        const totalVideos = uniqueVideos.length;
        
        if (totalImages === 0 && totalVideos === 0) {
            showToast("没有可下载的内容", "error");
            return;
        }
        
        showToast(`开始下载 ${totalImages} 张图片和 ${totalVideos} 个视频`, "success");
        
        let imageSuccess = 0;
        for (let i = 0; i < uniqueImages.length; i++) {
            const img = uniqueImages[i];
            const filename = `qianwen_image_${Date.now()}_${i}.png`;
            const result = await downloadFileWithRetry(img.url, filename);
            if (result?.success) imageSuccess++;
            await new Promise(r => setTimeout(r, 300));
        }
        
        let videoSuccess = 0;
        for (let i = 0; i < uniqueVideos.length; i++) {
            const video = uniqueVideos[i];
            const filename = `${video.prompt}_${Date.now()}_${i}.mp4`.replace(/[\\/:*?"<>|]/g, '_');
            const result = await downloadFileWithRetry(video.url, filename);
            if (result?.success) videoSuccess++;
            await new Promise(r => setTimeout(r, 500));
        }
        
        showToast(`下载完成！图片: ${imageSuccess}/${totalImages}，视频: ${videoSuccess}/${totalVideos}`, "success");
        updateFloatPanel();
        if (modal && modal.style.display === 'flex') {
            renderBatchModal();
        }
    }

    // ========== 批量管理弹窗 ==========
    function showBatchModal() {
        if (modal && modal.style.display === 'flex') {
            modal.style.display = 'none';
            return;
        }
        
        if (!modal) {
            createBatchModal();
        }
        
        renderBatchModal();
        modal.style.display = 'flex';
    }

    function createBatchModal() {
        const modalDiv = document.createElement('div');
        modalDiv.id = 'qw-batch-modal';
        modalDiv.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 100001;
            display: none;
            align-items: center;
            justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        `;
        
        modalDiv.innerHTML = `
            <div style="
                background: white;
                border-radius: 16px;
                width: 90%;
                max-width: 700px;
                max-height: 80vh;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            ">
                <div style="
                    padding: 16px 20px;
                    border-bottom: 1px solid #e5e7eb;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    background: #2563eb;
                    color: white;
                ">
                    <h3 style="margin: 0; font-size: 16px; font-weight: 600;">📦 批量下载管理</h3>
                    <button id="qw-modal-close" style="
                        background: none;
                        border: none;
                        color: white;
                        font-size: 24px;
                        cursor: pointer;
                        line-height: 1;
                    ">×</button>
                </div>
                <div style="display: flex; border-bottom: 1px solid #e5e7eb; padding: 0 20px;">
                    <button id="qw-modal-tab-images" style="
                        padding: 12px 16px;
                        background: none;
                        border: none;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 500;
                        color: #2563eb;
                        border-bottom: 2px solid #2563eb;
                    ">📸 图片 (<span id="qw-modal-img-count">0</span>)</button>
                    <button id="qw-modal-tab-videos" style="
                        padding: 12px 16px;
                        background: none;
                        border: none;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 500;
                        color: #6b7280;
                        border-bottom: 2px solid transparent;
                    ">🎬 视频 (<span id="qw-modal-vid-count">0</span>)</button>
                </div>
                <div id="qw-modal-content" style="flex: 1; overflow-y: auto; padding: 16px 20px;"></div>
                <div style="padding: 12px 20px; border-top: 1px solid #e5e7eb; display: flex; gap: 12px;">
                    <button id="qw-modal-download-all" style="
                        flex: 1;
                        padding: 10px;
                        background: #2563eb;
                        color: white;
                        border: none;
                        border-radius: 8px;
                        cursor: pointer;
                        font-weight: 500;
                    ">下载全部</button>
                    <button id="qw-modal-reset" style="
                        flex: 1;
                        padding: 10px;
                        background: #ef4444;
                        color: white;
                        border: none;
                        border-radius: 8px;
                        cursor: pointer;
                        font-weight: 500;
                    ">清空列表</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modalDiv);
        modal = modalDiv;
        
        document.getElementById('qw-modal-close').addEventListener('click', () => {
            modal.style.display = 'none';
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });
        
        let currentTab = 'images';
        document.getElementById('qw-modal-tab-images').addEventListener('click', () => {
            currentTab = 'images';
            document.getElementById('qw-modal-tab-images').style.color = '#2563eb';
            document.getElementById('qw-modal-tab-images').style.borderBottomColor = '#2563eb';
            document.getElementById('qw-modal-tab-videos').style.color = '#6b7280';
            document.getElementById('qw-modal-tab-videos').style.borderBottomColor = 'transparent';
            renderModalContent(currentTab);
        });
        document.getElementById('qw-modal-tab-videos').addEventListener('click', () => {
            currentTab = 'videos';
            document.getElementById('qw-modal-tab-videos').style.color = '#2563eb';
            document.getElementById('qw-modal-tab-videos').style.borderBottomColor = '#2563eb';
            document.getElementById('qw-modal-tab-images').style.color = '#6b7280';
            document.getElementById('qw-modal-tab-images').style.borderBottomColor = 'transparent';
            renderModalContent(currentTab);
        });
        
        document.getElementById('qw-modal-download-all').addEventListener('click', async () => {
            const activationCheck = await checkSharedActivation();
            if (!activationCheck.allowed) {
                showActivationModal(activationCheck.message);
                return;
            }
            
            const currentTab = document.getElementById('qw-modal-tab-images').style.color === '#2563eb' ? 'images' : 'videos';
            
            if (currentTab === 'images') {
                const uniqueImages = [];
                const seen = new Set();
                for (const img of imageList) {
                    const baseUrl = img.baseUrl;
                    if (!seen.has(baseUrl)) {
                        seen.add(baseUrl);
                        uniqueImages.push(img);
                    }
                }
                if (!uniqueImages.length) { showToast('没有图片'); return; }
                for (const img of uniqueImages) {
                    const filename = `qianwen_image_${Date.now()}.png`;
                    await downloadFileWithRetry(img.url, filename);
                    await new Promise(r => setTimeout(r, 300));
                }
                showToast(`已下载 ${uniqueImages.length} 张图片`);
            } else {
                const uniqueVideos = [];
                const seen = new Set();
                for (const video of videoList) {
                    const baseUrl = video.baseUrl;
                    if (!seen.has(baseUrl)) {
                        seen.add(baseUrl);
                        uniqueVideos.push(video);
                    }
                }
                if (!uniqueVideos.length) { showToast('没有视频'); return; }
                for (const video of uniqueVideos) {
                    const filename = `${video.prompt}_${Date.now()}.mp4`.replace(/[\\/:*?"<>|]/g, '_');
                    await downloadFileWithRetry(video.url, filename);
                    await new Promise(r => setTimeout(r, 500));
                }
                showToast(`已下载 ${uniqueVideos.length} 个视频`);
            }
            renderModalContent(currentTab);
            updateFloatPanel();
        });
        
        document.getElementById('qw-modal-reset').addEventListener('click', async () => {
            if (confirm('确定要清空图片/视频列表吗？')) {
                imageList.length = 0;
                videoList.length = 0;
                imageUrlSet.clear();
                videoUrlSet.clear();
                hasScanned = false;
                showToast('列表已清空，正在重新扫描...');
                renderModalContent('images');
                renderModalContent('videos');
                updateFloatPanel();
                setTimeout(() => {
                    scanImagesFromDOM();
                    scanImagesForButtons();
                    scanVideosForButtons();
                }, 500);
            }
        });
    }
    
    function renderBatchModal() {
        if (!modal) return;
        const uniqueImageCount = new Set(imageList.map(img => img.baseUrl)).size;
        const uniqueVideoCount = new Set(videoList.map(v => v.baseUrl)).size;
        document.getElementById('qw-modal-img-count').textContent = uniqueImageCount;
        document.getElementById('qw-modal-vid-count').textContent = uniqueVideoCount;
        
        const currentTab = document.getElementById('qw-modal-tab-images').style.color === '#2563eb' ? 'images' : 'videos';
        renderModalContent(currentTab);
    }
    
    function renderModalContent(tab) {
        const container = document.getElementById('qw-modal-content');
        if (!container) return;
        
        if (tab === 'images') {
            const uniqueImages = [];
            const seenUrls = new Set();
            for (const img of imageList) {
                const baseUrl = img.baseUrl;
                if (!seenUrls.has(baseUrl)) {
                    seenUrls.add(baseUrl);
                    uniqueImages.push(img);
                }
            }
            
            if (uniqueImages.length === 0) {
                container.innerHTML = '<div style="text-align: center; padding: 40px; color: #9ca3af;">暂无图片</div>';
                return;
            }
            container.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px;">
                    ${uniqueImages.map((img, idx) => `
                        <div style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; background: #fafafa;">
                            <img src="${img.url}" style="width: 100%; height: 120px; object-fit: cover;">
                            <div style="padding: 8px;">
                                <div style="font-size: 11px; color: #6b7280;">${img.width}×${img.height}</div>
                                <button class="qw-modal-download-img" data-url="${img.url}" data-index="${idx}" style="
                                    width: 100%;
                                    margin-top: 6px;
                                    padding: 4px 8px;
                                    background: #2563eb;
                                    color: white;
                                    border: none;
                                    border-radius: 4px;
                                    cursor: pointer;
                                    font-size: 11px;
                                ">下载</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
            document.querySelectorAll('.qw-modal-download-img').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const url = btn.dataset.url;
                    
                    const activationCheck = await checkSharedActivation();
                    if (!activationCheck.allowed) {
                        showActivationModal(activationCheck.message);
                        return;
                    }
                    
                    btn.textContent = '下载中...';
                    btn.disabled = true;
                    const filename = `qianwen_image_${Date.now()}.png`;
                    const result = await downloadFileWithRetry(url, filename);
                    if (result?.success) {
                        btn.textContent = '✓ 已下载';
                        btn.style.background = '#10b981';
                    } else {
                        btn.textContent = '失败';
                        btn.style.background = '#ef4444';
                    }
                    setTimeout(() => {
                        btn.textContent = '下载';
                        btn.style.background = '#2563eb';
                        btn.disabled = false;
                    }, 2000);
                });
            });
        } else {
            const uniqueVideos = [];
            const seenUrls = new Set();
            for (const video of videoList) {
                const baseUrl = video.baseUrl;
                if (!seenUrls.has(baseUrl)) {
                    seenUrls.add(baseUrl);
                    uniqueVideos.push(video);
                }
            }
            
            if (uniqueVideos.length === 0) {
                container.innerHTML = '<div style="text-align: center; padding: 40px; color: #9ca3af;">暂无视频</div>';
                return;
            }
            container.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${uniqueVideos.map((video, idx) => `
                        <div style="display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px;">
                            <div style="width: 80px; height: 80px; background: #f0f0f0; border-radius: 8px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                                ${video.coverUrl ? `<img src="${video.coverUrl}" style="width: 100%; height: 100%; object-fit: cover;">` : '<span style="font-size: 32px;">🎬</span>'}
                            </div>
                            <div style="flex: 1;">
                                <div style="font-size: 13px; font-weight: 500; margin-bottom: 4px;">${escapeHtml(video.prompt.substring(0, 50))}</div>
                                <div style="font-size: 11px; color: #6b7280;">${video.width}×${video.height}</div>
                            </div>
                            <button class="qw-modal-download-video" data-url="${video.url}" data-index="${idx}" style="
                                padding: 6px 12px;
                                background: #2563eb;
                                color: white;
                                border: none;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 12px;
                            ">下载</button>
                        </div>
                    `).join('')}
                </div>
            `;
            document.querySelectorAll('.qw-modal-download-video').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const url = btn.dataset.url;
                    const idx = parseInt(btn.dataset.index);
                    
                    const activationCheck = await checkSharedActivation();
                    if (!activationCheck.allowed) {
                        showActivationModal(activationCheck.message);
                        return;
                    }
                    
                    btn.textContent = '下载中...';
                    btn.disabled = true;
                    const prompt = uniqueVideos[idx].prompt;
                    const filename = `${prompt}_${Date.now()}.mp4`.replace(/[\\/:*?"<>|]/g, '_');
                    const result = await downloadFileWithRetry(url, filename);
                    if (result?.success) {
                        btn.textContent = '✓ 已下载';
                        btn.style.background = '#10b981';
                    } else {
                        btn.textContent = '失败';
                        btn.style.background = '#ef4444';
                    }
                    setTimeout(() => {
                        btn.textContent = '下载';
                        btn.style.background = '#2563eb';
                        btn.disabled = false;
                    }, 2000);
                });
            });
        }
    }
    
    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
    }

    // ========== 悬浮浮窗（放大头部样式） ==========
    async function updateFloatPanel() {
        if (!floatPanel) return;
        
        const status = await checkSharedActivation();
        const versionInfo = await new Promise((resolve) => {
            if (!chrome.runtime || !chrome.runtime.id) {
                resolve({ version: "13.0" });
                return;
            }
            chrome.runtime.sendMessage({type: "CHECK_VERSION"}, (resp) => {
                if (chrome.runtime.lastError) {
                    resolve({ version: "13.0" });
                } else {
                    resolve(resp || { version: "13.0" });
                }
            });
        });
        
        const uniqueImageCount = new Set(imageList.map(img => img.baseUrl)).size;
        const uniqueVideoCount = new Set(videoList.map(v => v.baseUrl)).size;
        const version = versionInfo?.version || "13.0";
        
        const isActivated = status?.allowed || false;
        const remainingCount = status?.info?.remainingCount;
        const expireTime = status?.info?.expireTime;
        
        let statusHtml = '';
        if (isActivated) {
            statusHtml = '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;"><span style="background: #10b981; width: 8px; height: 8px; border-radius: 50%; display: inline-block;"></span><span style="font-size: 13px; font-weight: 500; color: #10b981;">已激活</span></div>';
        } else {
            statusHtml = '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;"><span style="background: #ef4444; width: 8px; height: 8px; border-radius: 50%; display: inline-block;"></span><span style="font-size: 13px; font-weight: 500; color: #ef4444;">未激活</span><button id="qw-float-activate-btn" style="margin-left: auto; padding: 4px 10px; background: #2563eb; color: white; border: none; border-radius: 6px; font-size: 11px; cursor: pointer;">立即激活</button></div>';
        }
        
        let infoHtml = '';
        if (isActivated) {
            infoHtml = '<div style="background: #eff6ff; padding: 10px; border-radius: 8px; margin-bottom: 12px; font-size: 12px; color: #1e40af; line-height: 1.6;">';
            infoHtml += '激活状态：有效<br>';
            if (expireTime && expireTime !== "永久有效") {
                infoHtml += '过期时间：' + expireTime + '<br>';
            } else if (expireTime === "永久有效") {
                infoHtml += '过期时间：永久有效<br>';
            }
            if (remainingCount !== undefined && remainingCount !== null) {
                infoHtml += '剩余次数：' + remainingCount + '次';
            }
            infoHtml += '</div>';
        } else {
            infoHtml = '<div style="background: #fef3c7; padding: 10px; border-radius: 8px; margin-bottom: 12px; font-size: 12px; color: #92400e;">请先激活扩展，输入激活码后即可使用</div>';
        }
        
        // 放大后的头部样式
        floatPanel.innerHTML = `
            <div id="qw-float-panel-header" style="
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
                        千问无水印下载
                    </div>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button id="qw-float-minimize-btn" style="background: none; border: none; color: white; cursor: pointer; font-size: 18px; font-weight: bold; padding: 0; margin: 0; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;">−</button>
                    <button id="qw-float-close-btn" style="background: none; border: none; color: white; cursor: pointer; font-size: 20px; padding: 0; margin: 0; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;">✕</button>
                </div>
            </div>
            <div id="qw-float-panel-body" style="padding: 16px;">
                ${statusHtml}
                ${infoHtml}
                <div style="display: flex; gap: 12px; padding: 12px 0; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; margin-bottom: 12px;">
                    <div style="flex: 1; text-align: center;">
                        <div style="font-size: 22px; font-weight: 700; color: #2563eb;">${uniqueImageCount}</div>
                        <div style="font-size: 11px; color: #6b7280;">已捕获图片</div>
                    </div>
                    <div style="width: 1px; background: #e5e7eb;"></div>
                    <div style="flex: 1; text-align: center;">
                        <div style="font-size: 22px; font-weight: 700; color: #2563eb;">${uniqueVideoCount}</div>
                        <div style="font-size: 11px; color: #6b7280;">已捕获视频</div>
                    </div>
                </div>
                <button id="qw-float-batch-btn" style="
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
        
        const minimizeBtn = floatPanel.querySelector("#qw-float-minimize-btn");
        const closeBtn = floatPanel.querySelector("#qw-float-close-btn");
        const activateBtn = floatPanel.querySelector("#qw-float-activate-btn");
        const batchBtn = floatPanel.querySelector("#qw-float-batch-btn");
        
        if (minimizeBtn) {
            minimizeBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                const body = floatPanel.querySelector("#qw-float-panel-body");
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
            closeBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                floatPanel.style.display = "none";
            });
        }
        
        if (activateBtn) {
            activateBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                showActivationModal("请输入激活码激活扩展");
            });
        }
        
        if (batchBtn) {
            batchBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (imageList.length === 0 && videoList.length === 0) {
                    showToast("没有待下载的内容，请先刷新页面让插件捕获内容", "error");
                    return;
                }
                
                const activationCheck = await checkSharedActivation();
                if (!activationCheck.allowed) {
                    showActivationModal(activationCheck.message);
                    return;
                }
                
                await batchDownloadAll();
            });
            batchBtn.addEventListener("mouseenter", () => { batchBtn.style.background = "#6d28d9"; });
            batchBtn.addEventListener("mouseleave", () => { batchBtn.style.background = "#7c3aed"; });
        }
    }

    function createFloatPanel() {
        if (floatPanel) return;
        
        floatPanel = document.createElement("div");
        floatPanel.id = "qw-float-panel";
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
            const header = floatPanel.querySelector("#qw-float-panel-header");
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

    // 调试函数
    window.qwDebug = function() {
        const uniqueCount = new Set(imageList.map(img => img.baseUrl)).size;
        console.log('=== 千问助手调试信息 ===');
        console.log('原始存储数量:', imageList.length, '有效原图数量:', uniqueCount);
        console.log('视频数量:', videoList.length);
        console.log('有效原图列表:');
        const seen = new Set();
        imageList.forEach((img, i) => {
            if (!seen.has(img.baseUrl)) {
                seen.add(img.baseUrl);
                console.log(`  ${seen.size}: ${img.baseUrl}`);
            }
        });
    };

    // 手动刷新
    window.qwRefresh = function() {
        console.log('[千问助手] 手动刷新扫描');
        imageList.length = 0;
        videoList.length = 0;
        imageUrlSet.clear();
        videoUrlSet.clear();
        hasScanned = false;
        setTimeout(() => {
            scanImagesFromDOM();
            scanImagesForButtons();
            scanVideosForButtons();
        }, 100);
    };

    // 定期唤醒 Service Worker
    function keepAlive() {
        setInterval(() => {
            if (chrome.runtime && chrome.runtime.id) {
                chrome.runtime.sendMessage({ type: "PING" }, () => {
                    if (chrome.runtime.lastError) {
                        // 静默失败
                    }
                });
            }
        }, 20000);
    }

    // ========== 初始化 ==========
    async function init() {
        if (window.__QW_DATA__.initialized) {
            console.log('[千问助手] 已初始化，跳过');
            return;
        }
        window.__QW_DATA__.initialized = true;
        
        console.log('[千问助手] 开始初始化...');
        injectDoubaoStyles();
        createFloatPanel();
        
        keepAlive();
        
        const origFetch = window.fetch;
        window.fetch = async function(...args) {
            const url = args[0];
            if (typeof url === 'string' && (url.includes('qianwen.com/api/v1/session/msg/list') || url.includes('qianwen.com/api/v1/share/info'))) {
                const resp = await origFetch.apply(this, args);
                return resp;
            }
            return origFetch.apply(this, args);
        };
        
        setTimeout(() => {
            scanImagesFromDOM();
            scanImagesForButtons();
            scanVideosForButtons();
        }, 2000);
        
        const observer = new MutationObserver(() => {
            scanImagesForButtons();
            scanVideosForButtons();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        
        console.log('[千问助手] 初始化完成');
        console.log('[千问助手] 输入 qwDebug() 查看状态');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();