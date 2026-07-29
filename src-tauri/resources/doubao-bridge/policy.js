"use strict";

const AUTH_COOLDOWN_MS = 15 * 60 * 1000;

function nextLocalMidnight(now = Date.now()) {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.getTime();
}

function browserAuthScore({ href = "", bodyText = "", hasLoginButton = false } = {}) {
  const text = String(bodyText || "");
  return Number(Boolean(hasLoginButton))
    + Number(/[?&]from_logout=1(?:[&#]|$)/.test(String(href || "")))
    + (text.match(/登录以解锁更多功能|请先登录|登录后[^\n]{0,20}(?:生成|使用)|登录已过期|账号登录状态异常/g) || []).length;
}

function getFailurePolicy({ code = "", safeToRotate = false, now = Date.now() } = {}) {
  const normalized = String(code || "");
  if (normalized === "QUOTA_EXHAUSTED") {
    return {
      rotate: Boolean(safeToRotate),
      cooldownUntil: nextLocalMidnight(now),
      cooldownReason: normalized
    };
  }
  if (normalized === "AUTH_REQUIRED") {
    return {
      rotate: Boolean(safeToRotate),
      cooldownUntil: now + AUTH_COOLDOWN_MS,
      cooldownReason: normalized
    };
  }
  return {
    rotate: Boolean(safeToRotate),
    cooldownUntil: null,
    cooldownReason: ""
  };
}

function getDurationAdjustment({
  targetPlatform = "",
  requested = "auto",
  actual = 0
} = {}) {
  if (String(requested || "").toLowerCase() === "auto") {
    return { action: "accept", tolerance: 0 };
  }
  const requestedSeconds = Number(requested);
  const actualSeconds = Number(actual);
  const tolerance = requestedSeconds === 15 ? 1.5 : 1.25;
  if (!Number.isFinite(actualSeconds) || actualSeconds <= 0) {
    return { action: "unverified", tolerance };
  }
  if (Math.abs(actualSeconds - requestedSeconds) <= tolerance) {
    return { action: "accept", tolerance };
  }
  if (
    String(targetPlatform || "").toLowerCase() === "dola"
    && actualSeconds > requestedSeconds + tolerance
  ) {
    return { action: "trim", tolerance };
  }
  return { action: "reject", tolerance };
}

function parseFfmpegDuration(value = "") {
  const match = String(value || "").match(
    /Duration:\s*(\d{1,3}):(\d{2}):(\d{2}(?:\.\d+)?)/i
  );
  if (!match) return 0;
  const seconds = Number(match[1]) * 3600
    + Number(match[2]) * 60
    + Number(match[3]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

function shouldClearAuthCooldown({ reason = "", snapshot = {} } = {}) {
  return String(reason || "") === "AUTH_REQUIRED"
    && browserAuthScore(snapshot) === 0
    && Boolean(snapshot?.hasEditor);
}

function shouldRetryUpload({ restart = 0, uploadFailed = false, verificationDetected = false } = {}) {
  return Boolean(uploadFailed) && !verificationDetected && Number(restart) < 2;
}

function shouldRetryTransientDolaFailure({
  targetPlatform = "",
  transientFailureIncreased = false,
  retryCount = 0
} = {}) {
  return String(targetPlatform || "").toLowerCase() === "dola"
    && Boolean(transientFailureIncreased)
    && Number(retryCount) < 1;
}

function shouldResubmitAfterVerification({
  hasNewOutboundMessage = false,
  hasAcceptedSignal = false,
  hasCompletedSignal = false,
  stillLocalConversation = false,
  resubmitCount = 0
} = {}) {
  return !hasNewOutboundMessage
    && !hasAcceptedSignal
    && !hasCompletedSignal
    && Boolean(stillLocalConversation)
    && Number(resubmitCount) < 1;
}

function isDolaFreshConversationState({
  pathname = "",
  hasEditor = false,
  editorText = "",
  attachmentCount = 0,
  messageCount = 0
} = {}) {
  return Boolean(hasEditor)
    && !String(editorText || "").trim()
    && Number(attachmentCount) === 0
    && Number(messageCount) === 0
    && /^\/chat\/?$/.test(String(pathname || ""));
}

module.exports = {
  AUTH_COOLDOWN_MS,
  browserAuthScore,
  getDurationAdjustment,
  getFailurePolicy,
  isDolaFreshConversationState,
  nextLocalMidnight,
  parseFfmpegDuration,
  shouldClearAuthCooldown,
  shouldResubmitAfterVerification,
  shouldRetryTransientDolaFailure,
  shouldRetryUpload
};
