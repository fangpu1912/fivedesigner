document.addEventListener("DOMContentLoaded", function() {
  var activationPanel = document.getElementById("activationPanel");
  var activatingPanel = document.getElementById("activatingPanel");
  var activatedPanel = document.getElementById("activatedPanel");
  var cardKeyInput = document.getElementById("cardKey");
  var activateBtn = document.getElementById("activateBtn");
  var activationHint = document.getElementById("activationHint");
  var refreshBtn = document.getElementById("refreshBtn");
  var imageCountEl = document.getElementById("imageCount");
  var videoCountEl = document.getElementById("videoCount");
  var versionTextEl = document.getElementById("versionText");
  var versionWarning = document.getElementById("versionWarning");
  var warningText = document.getElementById("warningText");
  var updateActionBtn = document.getElementById("updateActionBtn");
  var activationInfo = document.getElementById("activationInfo");
  
  var serverUpdateUrl = "";
  
  // ========== 激活码功能已禁用 ==========
  // function checkActivationAndShowUI() {
  //   console.log("[Popup] 检查激活状态");
  //   chrome.runtime.sendMessage({type: "CHECK_ACTIVATION"}, function(status) {
  //     console.log("[Popup] 激活状态响应:", status);
  //     if (status && status.activated) {
  //       showActivatedPanel(status);
  //     } else {
  //       showActivationPanel();
  //     }
  //   });
  // }
  
  // ========== 激活码功能已禁用 ==========
  // function showActivationPanel() {
  //   activationPanel.classList.remove("hidden");
  //   activatingPanel.classList.add("hidden");
  //   activatedPanel.classList.add("hidden");
  //   if (cardKeyInput) cardKeyInput.value = "";
  //   if (activationHint) {
  //     activationHint.textContent = "";
  //     activationHint.className = "hint";
  //   }
  // }
  
  // ========== 激活码功能已禁用 ==========
  // function showActivatingPanel() {
  //   activationPanel.classList.add("hidden");
  //   activatingPanel.classList.remove("hidden");
  //   activatedPanel.classList.add("hidden");
  // }
  
  // ========== 激活码功能已禁用 ==========
  // function showActivatedPanel(activationInfoData) {
  //   activationPanel.classList.add("hidden");
  //   activatingPanel.classList.add("hidden");
  //   activatedPanel.classList.remove("hidden");
  //   
  //   var infoText = "激活状态：有效";
  //   if (activationInfoData.expireTime && activationInfoData.expireTime !== "永久有效") {
  //     infoText = infoText + "\n过期时间：" + activationInfoData.expireTime;
  //   } else if (activationInfoData.expireTime === "永久有效") {
  //     infoText = infoText + "\n过期时间：永久有效";
  //   }
  //   if (activationInfoData.remainingCount !== undefined && activationInfoData.remainingCount !== null) {
  //     infoText = infoText + "\n剩余次数：" + activationInfoData.remainingCount + "次";
  //   }
  //   if (activationInfo) activationInfo.textContent = infoText;
  //   
  //   loadStats();
  //   checkVersion();
  // }
  
  function loadStats() {
    // ========== 激活码功能已禁用 ==========
    // chrome.runtime.sendMessage({type: "CHECK_ACTIVATION"}, function(status) {
    //   if (status && status.activated) {
    //     var infoText = "激活状态：有效";
    //     if (status.expireTime && status.expireTime !== "永久有效") {
    //       infoText = infoText + "\n过期时间：" + status.expireTime;
    //     } else if (status.expireTime === "永久有效") {
    //       infoText = infoText + "\n过期时间：永久有效";
    //     }
    //     if (status.remainingCount !== undefined && status.remainingCount !== null) {
    //       infoText = infoText + "\n剩余次数：" + status.remainingCount + "次";
    //     }
    //     if (activationInfo) activationInfo.textContent = infoText;
    //   }
    // });
    
    chrome.runtime.sendMessage({type: "GET_IMAGE_LIST"}, function(response) {
      if (response && response.success && imageCountEl) {
        imageCountEl.textContent = (response.data && response.data.length) || 0;
      }
    });
    
    chrome.runtime.sendMessage({type: "CHECK_VERSION"}, function(response) {
      if (response && response.videoCount !== undefined && videoCountEl) {
        videoCountEl.textContent = response.videoCount || 0;
      }
    });
  }
  
  function checkVersion() {
    chrome.runtime.sendMessage({type: "CHECK_VERSION"}, function(response) {
      if (!chrome.runtime.lastError && response && versionTextEl) {
        versionTextEl.textContent = response.version || "1.0";
        serverUpdateUrl = response.updateUrl || "";
        
        if (response.warning && versionWarning && warningText) {
          warningText.textContent = response.warning;
          versionWarning.classList.remove("hidden");
        } else if (versionWarning) {
          versionWarning.classList.add("hidden");
        }
        
        if (response.newVersion && response.newVersion !== response.version && versionWarning && warningText) {
          if (!response.warning) {
            warningText.textContent = "发现新版本 " + response.newVersion + "，建议更新";
            versionWarning.classList.remove("hidden");
          }
        }
      }
    });
  }
  
  // ========== 激活码功能已禁用 ==========
  // if (activateBtn) {
  //   activateBtn.addEventListener("click", function() {
  //     var cardKey = cardKeyInput ? cardKeyInput.value.trim() : "";
  //     if (!cardKey) {
  //       if (activationHint) {
  //         activationHint.textContent = "请输入激活码";
  //         activationHint.className = "hint error";
  //       }
  //       return;
  //     }
  //     
  //     showActivatingPanel();
  //     
  //     chrome.runtime.sendMessage({type: "ACTIVATE_CARD", cardKey: cardKey, machineCode: ""}, function(result) {
  //       if (result && result.success) {
  //         if (activationHint) {
  //           activationHint.textContent = "激活成功！";
  //           activationHint.className = "hint success";
  //         }
  //         setTimeout(function() {
  //           checkActivationAndShowUI();
  //         }, 1000);
  //       } else {
  //         if (activationHint) {
  //           activationHint.textContent = (result && result.message) || "激活失败，请检查激活码";
  //           activationHint.className = "hint error";
  //         }
  //         showActivationPanel();
  //       }
  //     });
  //   });
  // }
  
  if (refreshBtn) {
    refreshBtn.addEventListener("click", function() {
      loadStats();
    });
  }
  
  if (updateActionBtn) {
    updateActionBtn.addEventListener("click", function() {
      if (serverUpdateUrl) {
        window.open(serverUpdateUrl, "_blank");
      }
    });
  }
  
  // ========== 激活码功能已禁用 ==========
  // checkActivationAndShowUI();
  
  // ========== 激活码功能已禁用，直接显示已激活面板 ==========
  if (activatedPanel) activatedPanel.classList.remove("hidden");
  if (activationPanel) activationPanel.classList.add("hidden");
  if (activatingPanel) activatingPanel.classList.add("hidden");
  
  // 加载统计信息
  chrome.runtime.sendMessage({type: "GET_IMAGE_LIST"}, function(response) {
    if (response && response.success && imageCountEl) {
      imageCountEl.textContent = (response.data && response.data.length) || 0;
    }
  });
  chrome.runtime.sendMessage({type: "CHECK_VERSION"}, function(response) {
    if (response && response.videoCount !== undefined && videoCountEl) {
      videoCountEl.textContent = response.videoCount || 0;
    }
    if (!chrome.runtime.lastError && response && versionTextEl) {
      versionTextEl.textContent = response.version || "1.0";
    }
  });
  checkVersion();
});
