// ==================== 豆包对话目录导航插件 ====================
// 功能：为豆包对话提供实时目录导航，实现长对话内容高效定位
// 快捷键：Ctrl+Shift+D 显示/隐藏目录
// 与原无水印下载功能完全独立，互不影响

// 全局变量
let directoryItems = [];
let directoryPanel = null;
let observer = null;
let currentTooltip = null;
let isDirectoryActive = true;
let isLoadingHistory = false;
let loadRetryCount = 0;

// 添加快捷键显示/隐藏目录
document.addEventListener('keydown', function(e) {
  // Ctrl+Shift+D 显示/隐藏目录
  if (e.ctrlKey && e.shiftKey && e.key === 'D') {
    e.preventDefault();
    if (directoryPanel && directoryPanel.style.display !== 'none') {
      hideDirectory();
    } else if (directoryPanel === null || directoryPanel.style.display === 'none') {
      if (directoryPanel === null) {
        initDirectoryPlugin();
      } else {
        showDirectory();
      }
    }
  }
});

// 初始化目录插件
function initDirectoryPlugin() {
  if (document.getElementById('doubao-directory')) {
    console.log('[目录] 目录面板已存在');
    directoryPanel = document.getElementById('doubao-directory');
    isDirectoryActive = true;
    startObserving();
    
    // 先加载当前可见消息，然后尝试加载历史
    generateInitialDirectory();
    loadAllHistoryMessages();
    return;
  }
  
  console.log('[目录] 豆包对话目录插件初始化');
  isDirectoryActive = true;
  createDirectoryPanel();
  startObserving();
  
  // 延迟生成初始目录，确保页面完全加载
  setTimeout(() => {
    generateInitialDirectory();
    loadAllHistoryMessages();
  }, 1500);
}

// 加载所有历史消息（通过滚动触发懒加载）
async function loadAllHistoryMessages() {
  if (isLoadingHistory) return;
  isLoadingHistory = true;
  
  console.log('[目录] 开始加载历史消息...');
  
  // 找到可滚动的对话容器
  const scrollContainer = findScrollableContainer();
  if (!scrollContainer) {
    console.log('[目录] 未找到可滚动容器');
    isLoadingHistory = false;
    return;
  }
  
  let previousMessageCount = 0;
  let stableCount = 0;
  let maxScrollAttempts = 30;
  let attempt = 0;
  
  function getCurrentMessageCount() {
    const messages = getChatMessages();
    return messages.filter(m => m.isUser).length;
  }
  
  scrollContainer.scrollTop = 0;
  await sleep(800);
  
  while (attempt < maxScrollAttempts) {
    const currentCount = getCurrentMessageCount();
    console.log(`[目录] 滚动尝试 ${attempt + 1}, 当前消息数: ${currentCount}`);
    
    if (currentCount === previousMessageCount) {
      stableCount++;
      if (stableCount >= 3) {
        console.log('[目录] 历史消息加载完成，共加载', currentCount, '条消息');
        break;
      }
    } else {
      stableCount = 0;
      previousMessageCount = currentCount;
      updateDirectory();
    }
    
    const currentScrollTop = scrollContainer.scrollTop;
    scrollContainer.scrollTop = currentScrollTop + 200;
    await sleep(500);
    
    if (scrollContainer.scrollTop === 0 && currentCount === previousMessageCount) {
      console.log('[目录] 已滚动到顶部，停止加载');
      break;
    }
    
    attempt++;
  }
  
  updateDirectory();
  isLoadingHistory = false;
  scrollContainer.scrollTop = scrollContainer.scrollHeight;
  console.log('[目录] 历史消息加载完成，已滚动到底部');
}

function findScrollableContainer() {
  const selectors = [
    '.chat-container',
    '.message-list',
    '.conversation-container',
    '.chat-content',
    '.messages',
    '.scroll-container',
    '[class*="chat"]',
    '[class*="message-list"]',
    '.react-scroll',
    '.virtuoso-scroller',
    '.infinite-scroll'
  ];
  
  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      if (el.scrollHeight > el.clientHeight) {
        console.log('[目录] 找到可滚动容器:', selector);
        return el;
      }
    }
  }
  
  const allDivs = document.querySelectorAll('div');
  for (const div of allDivs) {
    if (div.scrollHeight > div.clientHeight + 50 && div.offsetHeight > 100) {
      console.log('[目录] 找到可滚动div:', div.className);
      return div;
    }
  }
  
  return document.body;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createDirectoryPanel() {
  if (document.getElementById('doubao-directory')) {
    directoryPanel = document.getElementById('doubao-directory');
    console.log('[目录] 目录面板已存在');
    return;
  }
  
  directoryPanel = document.createElement('div');
  directoryPanel.id = 'doubao-directory';
  directoryPanel.className = 'directory-panel';
  
  const panelHeader = document.createElement('div');
  panelHeader.className = 'directory-header';
  
  const titleElement = document.createElement('h3');
  titleElement.textContent = '对话目录';
  panelHeader.appendChild(titleElement);
  
  const controlsContainer = document.createElement('div');
  controlsContainer.className = 'directory-controls';
  
  const minimizeBtn = document.createElement('button');
  minimizeBtn.className = 'directory-btn minimize-btn';
  minimizeBtn.innerHTML = '−';
  minimizeBtn.title = '最小化';
  minimizeBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    minimizeDirectory();
  });
  controlsContainer.appendChild(minimizeBtn);
  
  const maximizeBtn = document.createElement('button');
  maximizeBtn.className = 'directory-btn maximize-btn';
  maximizeBtn.innerHTML = '□';
  maximizeBtn.title = '最大化';
  maximizeBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    maximizeDirectory();
  });
  controlsContainer.appendChild(maximizeBtn);
  
  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'directory-btn refresh-btn';
  refreshBtn.innerHTML = '↻';
  refreshBtn.title = '刷新目录（重新加载历史）';
  refreshBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    refreshDirectory();
  });
  controlsContainer.appendChild(refreshBtn);
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'directory-btn close-btn';
  closeBtn.innerHTML = '×';
  closeBtn.title = '关闭';
  closeBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    hideDirectory();
  });
  controlsContainer.appendChild(closeBtn);
  
  panelHeader.appendChild(controlsContainer);
  
  const directoryContent = document.createElement('div');
  directoryContent.className = 'directory-content';
  directoryContent.id = 'directory-items-container';
  
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'resize-handle';
  
  directoryPanel.appendChild(panelHeader);
  directoryPanel.appendChild(directoryContent);
  directoryPanel.appendChild(resizeHandle);
  
  document.body.appendChild(directoryPanel);
  console.log('[目录] 目录面板创建完成');
  
  initDragFunctionality();
  initResizeFunctionality();
  forceShowDirectory();
}

function refreshDirectory() {
  console.log('[目录] 手动刷新目录');
  const container = document.getElementById('directory-items-container');
  if (container) {
    container.innerHTML = '<div class="directory-empty"><span>正在加载历史消息...</span></div>';
  }
  loadAllHistoryMessages();
}

function startObserving() {
  const doubaoContainers = [
    '.chat-container',
    '.message-list',
    '.conversation-container',
    '.dialog-container',
    '.chat-content',
    '.message-content',
    '.conversation-content',
    '.dialog-content',
    '.chat-history',
    '.message-history',
    '.messages',
    '#chat-content',
    '#message-list',
    '[class*="chat"]',
    '[class*="message"]',
    '[class*="dialog"]'
  ];
  
  let chatContainer = null;
  for (const selector of doubaoContainers) {
    chatContainer = document.querySelector(selector);
    if (chatContainer) {
      console.log('[目录] 找到对话容器:', selector);
      break;
    }
  }
  
  if (!chatContainer) {
    chatContainer = document.body;
    console.log('[目录] 使用body作为对话容器');
  }
  
  if (observer) {
    observer.disconnect();
  }
  
  observer = new MutationObserver((mutations) => {
    let hasNewContent = false;
    mutations.forEach((mutation) => {
      if (mutation.addedNodes.length > 0) {
        hasNewContent = true;
      }
    });
    
    if (hasNewContent) {
      console.log('[目录] 检测到新内容，准备更新目录');
      setTimeout(() => {
        updateDirectory();
      }, 300);
    }
  });
  
  observer.observe(chatContainer, {
    childList: true,
    subtree: true
  });
  console.log('[目录] 开始观察对话内容变化');
}

function generateInitialDirectory() {
  console.log('[目录] 开始生成初始目录...');
  
  const chatMessages = getChatMessages();
  console.log('[目录] 找到对话消息:', chatMessages.length);
  
  const userMessages = chatMessages.filter(msg => msg.isUser);
  const uniqueUserMessages = removeDuplicateMessages(userMessages);
  console.log('[目录] 找到用户消息:', userMessages.length, '去重后:', uniqueUserMessages.length);
  
  const container = document.getElementById('directory-items-container');
  if (container) {
    container.innerHTML = '';
    directoryItems = [];
  }
  
  uniqueUserMessages.forEach((message, index) => {
    addDirectoryItem(message, index);
  });
  
  if (uniqueUserMessages.length === 0) {
    const container = document.getElementById('directory-items-container');
    if (container) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'directory-empty';
      emptyMessage.innerHTML = '<span>暂无用户消息，请开始对话...</span>';
      container.appendChild(emptyMessage);
    }
    console.log('[目录] 未找到用户消息');
  }
  
  console.log('[目录] 初始目录生成完成，共', uniqueUserMessages.length, '条');
}

function getChatMessages() {
  const messages = [];
  const capturedElements = new Set();
  
  const possibleContainers = [
    document.body,
    document.querySelector('.chat-container'),
    document.querySelector('.message-list'),
    document.querySelector('.conversation-container'),
    document.querySelector('.chat-content'),
    document.querySelector('.messages')
  ].filter(el => el !== null);
  
  function findAllDivs(element, depth = 0) {
    if (depth > 20) return;
    
    const divs = element.querySelectorAll ? element.querySelectorAll('div') : [];
    
    divs.forEach((element) => {
      if (capturedElements.has(element)) return;
      
      const text = getUserMessageText(element);
      
      let isChildOfCaptured = false;
      for (const captured of capturedElements) {
        if (captured !== element && captured.contains(element)) {
          isChildOfCaptured = true;
          break;
        }
      }
      
      if (isChildOfCaptured) return;
      if (isFileUploadRecord(text, element)) return;
      if (isUIElement(text, element)) return;
      
      if (text && text.length > 2) {
        const isUserMessage = checkIsUserMessage(element);
        
        if (isUserMessage) {
          messages.push({
            element: element,
            text: text,
            timestamp: new Date(),
            isUser: true
          });
          capturedElements.add(element);
          console.log('[目录] 识别到用户消息:', text.substring(0, 50));
        }
      }
    });
  }
  
  possibleContainers.forEach(container => {
    findAllDivs(container);
  });
  
  messages.sort((a, b) => {
    const rectA = a.element.getBoundingClientRect();
    const rectB = b.element.getBoundingClientRect();
    return rectA.top - rectB.top;
  });
  
  console.log('[目录] 总共识别到', messages.length, '条用户消息');
  return messages;
}

function checkIsUserMessage(element) {
  return element.classList.contains('user') ||
    element.classList.contains('human') ||
    element.classList.contains('sender-user') ||
    element.classList.contains('user-message') ||
    element.classList.contains('user-msg') ||
    element.classList.contains('message-user') ||
    element.classList.contains('msg-user') ||
    element.classList.contains('user-content') ||
    element.classList.contains('human-content') ||
    element.querySelector('.user') !== null ||
    element.querySelector('.human') !== null ||
    element.querySelector('.sender-user') !== null ||
    element.querySelector('.user-avatar') !== null ||
    element.querySelector('.user-icon') !== null ||
    element.querySelector('.user-content') !== null ||
    element.textContent.includes('我:') ||
    element.textContent.includes('用户:') ||
    element.textContent.includes('你:') ||
    element.getAttribute('data-role') === 'user' ||
    element.getAttribute('data-sender') === 'user' ||
    element.getAttribute('data-user') === 'true' ||
    element.getAttribute('role') === 'user' ||
    element.style.alignSelf === 'flex-end' ||
    element.style.justifyContent === 'flex-end' ||
    getComputedStyle(element).alignSelf === 'flex-end' ||
    getComputedStyle(element).justifyContent === 'flex-end' ||
    (element.parentElement && (
      element.parentElement.classList.contains('user') ||
      element.parentElement.classList.contains('human') ||
      element.parentElement.getAttribute('data-role') === 'user'
    ));
}

function isUIElement(text, element) {
  const uiKeywords = [
    '分享', '复制', '点赞', '收藏', '举报', '删除', '编辑', '回复',
    '发送', '提交', '取消', '确定', '保存', '下载', '上传',
    'share', 'copy', 'like', 'favorite', 'report', 'delete', 'edit', 'reply',
    'send', 'submit', 'cancel', 'confirm', 'save', 'download', 'upload',
    '更多', '更多选项', 'more', 'options',
    '展开', '收起', 'expand', 'collapse',
    '查看', 'view', '查看详情',
    '点击', 'click', 'tap'
  ];
  
  const hasUIKeyword = uiKeywords.some(keyword => text.toLowerCase().includes(keyword.toLowerCase()));
  
  const isButton = element.tagName === 'BUTTON' || 
                   element.classList.contains('button') ||
                   element.classList.contains('btn') ||
                   element.getAttribute('role') === 'button';
  
  const isLink = element.tagName === 'A' || 
                 element.classList.contains('link');
  
  const isBadge = element.classList.contains('badge') ||
                  element.classList.contains('tag') ||
                  element.classList.contains('label');
  
  const isIcon = element.classList.contains('icon') ||
                 element.classList.contains('svg') ||
                 element.querySelector('svg') !== null;
  
  const isToolbar = element.classList.contains('toolbar') ||
                    element.classList.contains('actions') ||
                    element.classList.contains('controls');
  
  return hasUIKeyword || isButton || isLink || isBadge || isIcon || isToolbar;
}

function getUserMessageText(element) {
  const clone = element.cloneNode(true);
  
  const uiSelectors = [
    'button', '.button', '.btn',
    'a', '.link',
    '.badge', '.tag', '.label',
    '.icon', '.svg', 'svg',
    '.toolbar', '.actions', '.controls',
    '.share', '.copy', '.like', '.favorite',
    '.report', '.delete', '.edit', '.reply',
    '.more', '.options'
  ];
  
  uiSelectors.forEach(selector => {
    const elements = clone.querySelectorAll(selector);
    elements.forEach(el => el.remove());
  });
  
  let text = clone.textContent.trim();
  
  const uiKeywords = ['分享', '复制', '点赞', '收藏', '举报', '删除', '编辑', '回复', '更多'];
  uiKeywords.forEach(keyword => {
    text = text.replace(new RegExp(keyword, 'g'), '');
  });
  
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

function isFileUploadRecord(text, element) {
  const fileExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.mp3', '.mp4', '.avi', '.zip', '.rar', '.7z', '.csv', '.json', '.xml', '.html', '.css', '.js', '.py', '.java', '.cpp', '.c', '.h', '.md'];
  
  const hasFileExtension = fileExtensions.some(ext => text.toLowerCase().includes(ext));
  
  const uploadKeywords = ['上传', '文件', '附件', 'attachment', 'upload', 'file'];
  const hasUploadKeyword = uploadKeywords.some(keyword => text.toLowerCase().includes(keyword));
  
  const hasFileSize = /\d+(\.\d+)?\s*(KB|MB|GB|TB)/i.test(text);
  
  const hasFileClass = element.classList.contains('file') || 
                       element.classList.contains('upload') || 
                       element.classList.contains('attachment') ||
                       element.classList.contains('file-upload') ||
                       element.querySelector('.file') !== null ||
                       element.querySelector('.upload') !== null ||
                       element.querySelector('.attachment') !== null;
  
  const isShortFileName = text.length < 50 && hasFileExtension;
  const isPureFileName = hasFileExtension && text.split(/\s+/).length <= 3;
  
  return isPureFileName || 
         isShortFileName || 
         (hasFileExtension && hasFileSize) ||
         (hasFileExtension && hasUploadKeyword) ||
         hasFileClass;
}

function addDirectoryItem(message, index) {
  if (message.isUser) {
    const summary = generateSummary(message.text);
    
    const item = {
      id: `directory-item-${index}`,
      summary: summary,
      fullText: message.text,
      timestamp: message.timestamp,
      element: message.element
    };
    
    directoryItems.push(item);
    renderDirectoryItem(item, index);
  }
}

function generateSummary(text) {
  const words = text.split(/\s+/);
  let summary = '';
  
  for (let i = 0; i < Math.min(words.length, 5); i++) {
    summary += words[i] + ' ';
  }
  
  return summary.trim().substring(0, 15);
}

function renderDirectoryItem(item, index) {
  const container = document.getElementById('directory-items-container');
  if (!container) return;
  
  const itemElement = document.createElement('div');
  itemElement.id = item.id;
  itemElement.className = 'directory-item';
  itemElement.innerHTML = `
    <span class="item-index">${index + 1}.</span>
    <span class="item-summary">${escapeHtml(item.summary)}</span>
  `;
  
  itemElement.addEventListener('click', function() {
    scrollToMessage(item.element, this);
  });
  
  itemElement.addEventListener('mouseenter', function(e) {
    showTooltip(this, item.fullText);
  });
  
  itemElement.addEventListener('mouseleave', function() {
    hideTooltip();
  });
  
  container.appendChild(itemElement);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

function showTooltip(element, text) {
  hideTooltip();
  
  const tooltip = document.createElement('div');
  tooltip.className = 'directory-tooltip';
  
  let processedText = text;
  processedText = processedText.replace(/([^\n]{50,})/g, function(match) {
    return match.replace(/(.{50})/g, '$1​');
  });
  
  tooltip.textContent = processedText;
  
  document.body.appendChild(tooltip);
  currentTooltip = tooltip;
  
  const rect = element.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  
  const isOnRightSide = rect.right > windowWidth / 2;
  
  let left, top;
  
  if (isOnRightSide) {
    left = rect.left - tooltipRect.width - 12;
    if (left < 5) {
      left = rect.right + 12;
    }
  } else {
    left = rect.right + 12;
    if (left + tooltipRect.width > windowWidth - 5) {
      left = rect.left - tooltipRect.width - 12;
    }
  }
  
  top = rect.top + (rect.height - tooltipRect.height) / 2;
  
  if (top < 5) {
    top = 5;
  }
  if (top + tooltipRect.height > windowHeight - 5) {
    top = windowHeight - tooltipRect.height - 5;
  }
  
  if (left < 5) {
    left = 5;
  }
  if (left + tooltipRect.width > windowWidth - 5) {
    left = windowWidth - tooltipRect.width - 5;
  }
  
  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
}

function hideTooltip() {
  if (currentTooltip) {
    currentTooltip.remove();
    currentTooltip = null;
  }
}

function updateDirectory() {
  if (!isDirectoryActive) return;
  
  const chatMessages = getChatMessages();
  const userMessages = chatMessages.filter(msg => msg.isUser);
  const uniqueUserMessages = removeDuplicateMessages(userMessages);
  
  console.log('[目录] 更新目录 - 找到用户消息:', userMessages.length, '去重后:', uniqueUserMessages.length);
  
  const container = document.getElementById('directory-items-container');
  if (container) {
    container.innerHTML = '';
    directoryItems = [];
    
    uniqueUserMessages.forEach((message, index) => {
      addDirectoryItem(message, index);
    });
    
    if (uniqueUserMessages.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'directory-empty';
      emptyMessage.innerHTML = '<span>暂无用户消息，请开始对话...</span>';
      container.appendChild(emptyMessage);
    }
    
    console.log('[目录] 目录已更新，当前用户消息数:', directoryItems.length);
  }
}

function scrollToMessage(element, clickedItem) {
  element.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
    inline: 'nearest'
  });
  
  element.classList.add('message-highlight');
  
  setTimeout(() => {
    element.classList.remove('message-highlight');
  }, 3000);
  
  const directoryItemsList = document.querySelectorAll('.directory-item');
  directoryItemsList.forEach(item => {
    item.style.backgroundColor = '';
  });
  
  if (clickedItem) {
    clickedItem.style.backgroundColor = '#f1f5f9';
  }
}

function removeDuplicateMessages(messages) {
  const uniqueMessages = [];
  const messageTexts = new Set();
  
  messages.forEach(message => {
    const text = message.text.trim();
    if (!messageTexts.has(text)) {
      messageTexts.add(text);
      uniqueMessages.push(message);
    }
  });
  
  return uniqueMessages;
}

function forceShowDirectory() {
  if (directoryPanel) {
    directoryPanel.style.display = 'block';
    directoryPanel.style.visibility = 'visible';
    directoryPanel.style.opacity = '1';
    directoryPanel.style.zIndex = '999999';
    directoryPanel.style.position = 'fixed';
    
    if (!directoryPanel.dataset.initialized) {
      directoryPanel.style.right = '20px';
      directoryPanel.style.top = '100px';
      directoryPanel.style.left = 'auto';
      directoryPanel.style.width = '240px';
      directoryPanel.style.maxHeight = '600px';
      directoryPanel.dataset.initialized = 'true';
    }
    
    directoryPanel.style.pointerEvents = 'auto';
    console.log('[目录] 强制显示目录面板');
  }
}

function minimizeDirectory() {
  if (directoryPanel) {
    const content = document.getElementById('directory-items-container');
    const resizeHandle = directoryPanel.querySelector('.resize-handle');
    if (content) {
      content.style.display = 'none';
    }
    if (resizeHandle) {
      resizeHandle.style.display = 'none';
    }
    directoryPanel.dataset.minimized = 'true';
  }
}

function maximizeDirectory() {
  if (directoryPanel) {
    const content = document.getElementById('directory-items-container');
    const resizeHandle = directoryPanel.querySelector('.resize-handle');
    if (content) {
      content.style.display = 'block';
    }
    if (resizeHandle) {
      resizeHandle.style.display = 'block';
    }
    directoryPanel.dataset.minimized = 'false';
  }
}

function hideDirectory() {
  if (directoryPanel) {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    
    directoryPanel.remove();
    directoryPanel = null;
    directoryItems = [];
    
    if (currentTooltip) {
      currentTooltip.remove();
      currentTooltip = null;
    }
    
    isDirectoryActive = false;
    console.log('[目录] 插件已关闭');
  }
}

function showDirectory() {
  if (directoryPanel === null) {
    initDirectoryPlugin();
  } else if (directoryPanel.style.display === 'none') {
    directoryPanel.style.display = 'block';
    isDirectoryActive = true;
    startObserving();
    updateDirectory();
  }
}

function initDragFunctionality() {
  if (!directoryPanel) return;
  
  const header = directoryPanel.querySelector('.directory-header');
  if (!header) return;
  
  let isDragging = false;
  let startX, startY, initialLeft, initialTop;
  
  header.addEventListener('mousedown', function(e) {
    if (e.target.closest('.directory-btn')) {
      return;
    }
    
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    
    const rect = directoryPanel.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;
    
    directoryPanel.style.right = 'auto';
    
    header.style.cursor = 'grabbing';
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', function(e) {
    if (!isDragging) return;
    
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    const newLeft = initialLeft + dx;
    const newTop = initialTop + dy;
    
    directoryPanel.style.left = newLeft + 'px';
    directoryPanel.style.top = newTop + 'px';
  });
  
  document.addEventListener('mouseup', function() {
    if (isDragging) {
      isDragging = false;
      header.style.cursor = 'grab';
    }
  });
}

function initResizeFunctionality() {
  if (!directoryPanel) return;
  
  const resizeHandle = directoryPanel.querySelector('.resize-handle');
  if (!resizeHandle) return;
  
  let isResizing = false;
  let startX, startY, initialWidth, initialHeight;
  
  resizeHandle.addEventListener('mousedown', function(e) {
    isResizing = true;
    startX = e.clientX;
    startY = e.clientY;
    
    const rect = directoryPanel.getBoundingClientRect();
    initialWidth = rect.width;
    initialHeight = rect.height;
    
    resizeHandle.style.cursor = 'nwse-resize';
    e.preventDefault();
    e.stopPropagation();
  });
  
  document.addEventListener('mousemove', function(e) {
    if (!isResizing) return;
    
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    const newWidth = Math.max(200, initialWidth + dx);
    const newHeight = Math.max(100, initialHeight + dy);
    
    directoryPanel.style.width = newWidth + 'px';
    directoryPanel.style.maxHeight = newHeight + 'px';
  });
  
  document.addEventListener('mouseup', function() {
    if (isResizing) {
      isResizing = false;
      resizeHandle.style.cursor = 'nwse-resize';
    }
  });
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(initDirectoryPlugin, 1500);
  });
} else {
  setTimeout(initDirectoryPlugin, 1500);
}

// 定期更新目录
setInterval(() => {
  if (isDirectoryActive && directoryPanel) {
    updateDirectory();
  }
}, 5000);

// 添加高亮样式（等待 DOM 加载完成）
function addHighlightStyle() {
  const directoryHighlightStyle = document.createElement('style');
  directoryHighlightStyle.textContent = `
    .message-highlight {
      animation: directoryHighlight 2s ease-in-out;
    }
    @keyframes directoryHighlight {
      0% { background-color: rgba(59, 130, 246, 0); }
      30% { background-color: rgba(59, 130, 246, 0.3); }
      100% { background-color: rgba(59, 130, 246, 0); }
    }
  `;
  if (document.head) {
    document.head.appendChild(directoryHighlightStyle);
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      document.head.appendChild(directoryHighlightStyle);
    });
  }
}
addHighlightStyle();