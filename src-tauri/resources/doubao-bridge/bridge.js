"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn, execFileSync } = require("child_process");
const { createHash, randomUUID } = require("crypto");
const {
  browserAuthScore,
  getDurationAdjustment,
  getFailurePolicy,
  isDolaFreshConversationState,
  parseFfmpegDuration,
  shouldClearAuthCooldown,
  shouldResubmitAfterVerification,
  shouldRetryTransientDolaFailure,
  shouldRetryUpload
} = require("./policy");
const { createPluginLicenseSessionStore } = require("./license-session");

const VERSION = "1.6.6";
const HOST = "127.0.0.1";
const PORT = clampInt(process.env.ZZ_DOUBAO_BRIDGE_PORT, 17777, 1024, 65535);
const CDP_PORT = clampInt(process.env.ZZ_DOUBAO_CDP_PORT, 9223, 1024, 65535);
const BRIDGE_TOKEN = String(process.env.ZZ_DOUBAO_BRIDGE_TOKEN || "zzdoubao-local-v1");
const DOLA_EXE = path.resolve(process.env.ZZ_DOUBAO_DOLA_EXE || "C:\\Users\\Bob\\Documents\\豆包管理器\\dist\\win-unpacked\\豆包管理器.exe");
const BRIDGE_DATA_DIR = path.resolve(process.env.ZZ_DOUBAO_BRIDGE_DATA_DIR || __dirname);
try {
  fs.mkdirSync(BRIDGE_DATA_DIR, { recursive: true });
} catch (_) {}
const STATE_FILE = path.join(BRIDGE_DATA_DIR, "bridge_state.json");
const LOG_FILE = path.join(BRIDGE_DATA_DIR, "bridge.log");
const CREATION_RESOLVER_FILE = path.join(__dirname, "doubao-creation-download.js");
const DOLA_EDGE_BASE_PORT = clampInt(
  process.env.ZZ_DOLA_EDGE_BASE_PORT,
  19400,
  1024,
  64000
);
const DOLA_EDGE_PROFILE_DIR = path.join(BRIDGE_DATA_DIR, "dola-edge-profiles");
const MAX_TASKS = 200;
const ACCEPTANCE_TIMEOUT_MS = 90 * 1000;
const DEFAULT_MAX_CONCURRENCY = clampInt(
  process.env.ZZ_DOUBAO_MAX_CONCURRENCY,
  3,
  1,
  6
);

const tasks = new Map();
const taskQueue = [];
const accountLeases = new Map();
const pluginLicenseSessions = createPluginLicenseSessionStore();
let activeWorkers = 0;
let schedulerConcurrency = DEFAULT_MAX_CONCURRENCY;
let dolaLaunchPromise = null;
let lastDolaLaunchAt = 0;
let lastDolaLaunchError = null;
let nextAccountIndex = 0;
const accountCooldowns = new Map();
const dolaEdgePorts = new Map();

loadRuntimeState();

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeModel(value) {
  const normalized = String(value || "").toLowerCase().replace(/[\s_-]+/g, "");
  return normalized.includes("mini") ? "seedance2.0mini" : "seedance2.0fast";
}

function normalizeDuration(value) {
  if (String(value || "").trim().toLowerCase() === "auto") return "auto";
  const seconds = clampInt(value, 10, 5, 15);
  return seconds >= 15 ? 15 : seconds >= 10 ? 10 : 5;
}

function normalizeTargetPlatform(value) {
  return String(value || "").trim().toLowerCase() === "dola" ? "dola" : "doubao";
}

function platformName(value) {
  return normalizeTargetPlatform(value) === "dola" ? "Dola" : "豆包";
}

function promptWithSettings(prompt, taskRequest) {
  const text = String(prompt || "").trim();
  const duration = normalizeDuration(taskRequest?.duration);
  const model = normalizeModel(taskRequest?.model);
  const settings = [
    `视频模型：${model}。`,
    duration === "auto" ? "视频时长：自动时长。" : `视频时长要求：${duration}秒。`
  ];
  if (taskRequest?.remove_watermark) settings.push("成片完成后需要无水印结果。");
  return `${text}\n\n${settings.join("\n")}`;
}

function safeMessage(error) {
  return String(error?.message || error || "未知错误").slice(0, 1200);
}

function log(...parts) {
  const line = `[${nowIso()}] ${parts.map((part) => {
    if (typeof part === "string") return part;
    try {
      return JSON.stringify(part);
    } catch (_) {
      return String(part);
    }
  }).join(" ")}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line, "utf8");
  } catch (_) {}
}

function safeNetworkUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return `${url.origin}${url.pathname}`;
  } catch (_) {
    return "";
  }
}

function summarizeNetworkBody(value) {
  const text = String(value || "");
  if (!text) return null;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    return /(?:logout|login|auth|unauthori[sz]ed|session|登录|退出)/i.test(text)
      ? { authSignal: true, length: text.length }
      : null;
  }
  const summary = {};
  const visit = (node, path = "", depth = 0) => {
    if (depth > 4 || node === null || node === undefined) return;
    if (Array.isArray(node)) {
      node.slice(0, 5).forEach((item, index) => visit(item, `${path}[${index}]`, depth + 1));
      return;
    }
    if (typeof node !== "object") return;
    for (const [key, item] of Object.entries(node)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (
        /(?:^|_)(?:code|status|status_code|message|msg|error|error_code|error_message|detail|reason|redirect_url|login|logged_in|is_login|is_logged_in)(?:$|_)/i.test(key)
        && (typeof item === "string" || typeof item === "number" || typeof item === "boolean")
      ) {
        summary[nextPath] = String(item).slice(0, 300);
      } else {
        visit(item, nextPath, depth + 1);
      }
    }
  };
  visit(parsed);
  return Object.keys(summary).length ? summary : null;
}

function summarizeNetworkShape(value) {
  const text = String(value || "");
  if (!text) return null;
  const base = {
    length: text.length,
    authSignal: /(?:logout|login|auth|unauthori[sz]ed|session|登录|退出)/i.test(text)
  };
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    return { ...base, format: "non-json" };
  }
  const topLevelType = Array.isArray(parsed) ? "array" : typeof parsed;
  const topLevelKeys = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? Object.keys(parsed).slice(0, 30)
    : [];
  const nestedKeys = new Set();
  const collect = (node, depth = 0) => {
    if (depth > 2 || node === null || node === undefined) return;
    if (Array.isArray(node)) {
      node.slice(0, 3).forEach(item => collect(item, depth + 1));
      return;
    }
    if (typeof node !== "object") return;
    for (const [key, item] of Object.entries(node)) {
      if (nestedKeys.size < 60) nestedKeys.add(String(key).slice(0, 100));
      collect(item, depth + 1);
    }
  };
  collect(parsed);
  return {
    ...base,
    format: "json",
    topLevelType,
    topLevelKeys,
    nestedKeys: Array.from(nestedKeys)
  };
}

function summarizeWebSocketFrame(response) {
  const payload = String(response?.payloadData || "");
  return {
    opcode: Number(response?.opcode ?? -1),
    mask: Boolean(response?.mask),
    payloadLength: payload.length,
    body: summarizeNetworkBody(payload),
    shape: summarizeNetworkShape(payload)
  };
}

function summarizeEventStream(value) {
  const text = String(value || "");
  if (!text) return null;
  const eventNames = [];
  const dataItems = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      const eventName = line.slice(6).trim().slice(0, 100);
      if (eventName && !eventNames.includes(eventName)) eventNames.push(eventName);
      continue;
    }
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || dataItems.length >= 20) continue;
    dataItems.push({
      length: data.length,
      body: summarizeNetworkBody(data),
      shape: summarizeNetworkShape(data)
    });
  }
  return {
    length: text.length,
    eventNames: eventNames.slice(0, 30),
    dataCount: dataItems.length,
    dataItems
  };
}

function parseDolaCompletionFailure(value) {
  const text = String(value || "");
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data) continue;
    try {
      const parsed = JSON.parse(data);
      const code = String(parsed?.error_code || parsed?.errorCode || "");
      if (!code) continue;
      return {
        code,
        message: code === "710022002"
          ? "当前服务访问频繁，请稍后重试"
          : String(parsed?.error_msg || parsed?.errorMessage || "Dola 服务返回流错误").slice(0, 300)
      };
    } catch (_) {}
  }
  return null;
}

function isDolaServiceBusyFailure(failure) {
  return String(failure?.code || "") === "710022002";
}

async function getDolaAuthSnapshot(client) {
  const snapshot = await client.evaluate(`(() => {
    const visible = node => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const normalize = value => String(value || "").replace(/\\s+/g, " ").trim();
    const bodyText = String(document.body?.innerText || "");
    const loginButton = Array.from(document.querySelectorAll("button,[role=button],a"))
      .filter(visible)
      .find(node => normalize(node.innerText || node.textContent) === "登录");
    const editor = Array.from(document.querySelectorAll('[contenteditable="true"][role="textbox"],textarea'))
      .find(visible);
    const authMarkers = bodyText.match(
      /登录以解锁更多功能|请先登录|登录后[^\\n]{0,20}(?:生成|使用)|登录已过期|账号登录状态异常/g
    ) || [];
    const fromLogout = new URL(location.href).searchParams.get("from_logout") === "1";
    return {
      href: location.origin + location.pathname + (fromLogout ? "?from_logout=1" : ""),
      pathname: location.pathname,
      fromLogout,
      hasLoginButton: Boolean(loginButton),
      authMarkers: Array.from(new Set(authMarkers)).slice(0, 4),
      hasEditor: Boolean(editor),
      editorTextLength: normalize(
        editor?.editor?.getText?.() || editor?.value || editor?.textContent || editor?.innerText || ""
      ).length,
      hasFileInput: Boolean(document.querySelector('input[type="file"]')),
      visibleMessageCount: Array.from(document.querySelectorAll("[data-message-id]")).filter(visible).length,
      visibleAttachmentCount: Array.from(
        document.querySelectorAll('[class*="content-wrapper"] img[alt="image"]')
      ).filter(visible).length
    };
  })()`, 7000);
  const authScore = browserAuthScore({
    href: snapshot?.href || "",
    bodyText: Array.isArray(snapshot?.authMarkers) ? snapshot.authMarkers.join("\n") : "",
    hasLoginButton: Boolean(snapshot?.hasLoginButton)
  });
  return { ...snapshot, authScore };
}

async function installDolaLogoutGuard(client, task, account) {
  const result = await client.evaluate(`(() => {
    const isLogoutUrl = value => {
      try {
        const raw = typeof value === "string"
          ? value
          : String(value?.url || value?.href || value || "");
        return /\\/passport\\/web\\/logout\\/?(?:[?#].*)?$/i.test(new URL(raw, location.href).href);
      } catch (_) {
        return false;
      }
    };
    if (!window.__ZZ_DOLA_LOGOUT_GUARD__) {
      const guard = {
        installedAt: Date.now(),
        blockedFetch: 0,
        blockedXhr: 0
      };
      const originalFetch = typeof window.fetch === "function" ? window.fetch : null;
      if (originalFetch) {
        const guardedFetch = function(input, init) {
          if (isLogoutUrl(input)) {
            guard.blockedFetch += 1;
            return new Promise(() => {});
          }
          return originalFetch.call(this, input, init);
        };
        try {
          Object.defineProperty(guardedFetch, "name", { value: originalFetch.name || "fetch" });
          guardedFetch.toString = originalFetch.toString.bind(originalFetch);
        } catch (_) {}
        window.fetch = guardedFetch;
      }
      const xhrPrototype = window.XMLHttpRequest?.prototype;
      if (xhrPrototype?.open && xhrPrototype?.send) {
        const originalOpen = xhrPrototype.open;
        const originalSend = xhrPrototype.send;
        xhrPrototype.open = function(method, url, ...rest) {
          this.__zzDolaLogoutRequest = isLogoutUrl(url);
          return originalOpen.call(this, method, url, ...rest);
        };
        xhrPrototype.send = function(...args) {
          if (this.__zzDolaLogoutRequest) {
            guard.blockedXhr += 1;
            return undefined;
          }
          return originalSend.apply(this, args);
        };
        try {
          xhrPrototype.open.toString = originalOpen.toString.bind(originalOpen);
          xhrPrototype.send.toString = originalSend.toString.bind(originalSend);
        } catch (_) {}
      }
      window.__ZZ_DOLA_LOGOUT_GUARD__ = guard;
    }
    return {
      installedAt: Number(window.__ZZ_DOLA_LOGOUT_GUARD__?.installedAt || 0),
      blockedFetch: Number(window.__ZZ_DOLA_LOGOUT_GUARD__?.blockedFetch || 0),
      blockedXhr: Number(window.__ZZ_DOLA_LOGOUT_GUARD__?.blockedXhr || 0)
    };
  })()`, 7000);
  log("Dola 页面注销保护已安装", {
    taskId: task.id,
    accountId: account.id,
    ...result
  });
  return result;
}

async function traceDolaStage(client, task, account, stage, { throwOnAuth = true } = {}) {
  if (normalizeTargetPlatform(task?.request?.target_platform) !== "dola") return null;
  const snapshot = await getDolaAuthSnapshot(client);
  log("Dola 生成步骤认证状态", {
    taskId: task.id,
    accountId: account.id,
    accountName: account.name,
    stage,
    ...snapshot
  });
  if (throwOnAuth && Number(snapshot?.authScore || 0) > 0) {
    throw new AttemptError(
      "AUTH_REQUIRED",
      `账号“${account.name}”在 Dola 步骤“${stage}”后退出登录`,
      true
    );
  }
  return snapshot;
}

function loadRuntimeState() {
  try {
    const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    nextAccountIndex = clampInt(data.nextAccountIndex, 0, 0, 1000000);
    for (const item of Array.isArray(data.cooldowns) ? data.cooldowns : []) {
      if (item?.accountId && Number(item.until) > Date.now()) {
        accountCooldowns.set(String(item.accountId), {
          until: Number(item.until),
          reason: String(item.reason || "")
        });
      }
    }
  } catch (_) {}
}

function saveRuntimeState() {
  try {
    const payload = {
      nextAccountIndex,
      cooldowns: Array.from(accountCooldowns, ([accountId, value]) => ({
        accountId,
        until: value.until,
        reason: value.reason
      }))
    };
    const temp = `${STATE_FILE}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(payload, null, 2), "utf8");
    fs.renameSync(temp, STATE_FILE);
  } catch (error) {
    log("保存轮换状态失败", safeMessage(error));
  }
}

function pruneCooldowns() {
  const now = Date.now();
  for (const [accountId, value] of accountCooldowns) {
    if (!value?.until || value.until <= now) accountCooldowns.delete(accountId);
  }
}

function pruneAccountLeases() {
  for (const [accountId, taskId] of accountLeases) {
    const task = tasks.get(taskId);
    if (!task || ["succeeded", "failed", "cancelled"].includes(task.status)) {
      accountLeases.delete(accountId);
      log("已清理失效账号任务锁", { accountId, taskId });
    }
  }
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.eventHandlers = new Map();
  }

  async connect(timeoutMs = 8000) {
    if (this.socket?.readyState === WebSocket.OPEN) return;
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch (_) {
        return;
      }
      if (!message.id) {
        const handlers = this.eventHandlers.get(String(message.method || ""));
        if (handlers) {
          for (const handler of handlers) {
            try {
              handler(message.params || {});
            } catch (_) {}
          }
        }
        return;
      }
      if (!this.pending.has(message.id)) return;
      const waiter = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(waiter.timer);
      if (message.error) waiter.reject(new Error(message.error.message || JSON.stringify(message.error)));
      else waiter.resolve(message.result);
    });
    this.socket.addEventListener("close", () => {
      for (const waiter of this.pending.values()) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error("CDP 连接已关闭"));
      }
      this.pending.clear();
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("CDP 连接超时")), timeoutMs);
      this.socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("CDP 连接失败"));
      }, { once: true });
    });
  }

  call(method, params = {}, timeoutMs = 30000) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("CDP 尚未连接"));
    }
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} 调用超时`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  on(method, handler) {
    const key = String(method || "");
    if (!this.eventHandlers.has(key)) this.eventHandlers.set(key, new Set());
    const handlers = this.eventHandlers.get(key);
    handlers.add(handler);
    return () => handlers.delete(handler);
  }

  async evaluate(expression, timeoutMs = 30000) {
    const response = await this.call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    }, timeoutMs);
    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.exception?.description ||
        response.exceptionDetails.text ||
        "页面脚本执行失败"
      );
    }
    return response.result?.value;
  }

  close() {
    this.eventHandlers.clear();
    try {
      this.socket?.close();
    } catch (_) {}
  }
}

async function fetchJson(url, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getTargets() {
  const targets = await fetchJson(`http://127.0.0.1:${CDP_PORT}/json/list`, 3500);
  return Array.isArray(targets) ? targets : [];
}

async function cdpAvailable() {
  try {
    const data = await fetchJson(`http://127.0.0.1:${CDP_PORT}/json/version`, 1200);
    return Boolean(data?.webSocketDebuggerUrl);
  } catch (_) {
    return false;
  }
}

function dolaProcessAlreadyRunning() {
  if (process.platform !== "win32") return false;
  try {
    const result = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "if (Get-Process -Name '豆包管理器' -ErrorAction SilentlyContinue) { '1' }"
      ],
      { encoding: "utf8", timeout: 2500, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }
    );
    return String(result || "").trim() === "1";
  } catch (_) {
    return false;
  }
}

async function ensureDolaRunning(timeoutMs = 45000) {
  if (await cdpAvailable()) return { launched: false };
  if (dolaLaunchPromise) return dolaLaunchPromise;
  if (lastDolaLaunchError && Date.now() - lastDolaLaunchAt < 20000) {
    throw lastDolaLaunchError;
  }
  if (dolaProcessAlreadyRunning()) {
    const error = new Error(
      "检测到豆包管理器已在普通模式运行，但未开放调试端口；请完全退出所有豆包管理器窗口后，再由字字动画重新发起任务"
    );
    lastDolaLaunchAt = Date.now();
    lastDolaLaunchError = error;
    throw error;
  }
  dolaLaunchPromise = (async () => {
    if (!fs.existsSync(DOLA_EXE)) {
      throw new Error(`未找到豆包管理器：${DOLA_EXE}`);
    }

    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    lastDolaLaunchAt = Date.now();
    try {
      const child = spawn(DOLA_EXE, [
        `--remote-debugging-port=${CDP_PORT}`,
        "--remote-allow-origins=*"
      ], {
        detached: true,
        stdio: "ignore",
        windowsHide: false,
        env
      });
      child.unref();
      log("已请求启动 Dola", { exe: DOLA_EXE, cdpPort: CDP_PORT });

      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (await cdpAvailable()) {
          lastDolaLaunchError = null;
          return { launched: true };
        }
        await sleep(500);
      }
      throw new Error(
        "豆包管理器未开放本地调试端口。若 Dola 已经在运行，请先完全退出它，再由字字插件重新发起任务。"
      );
    } catch (error) {
      lastDolaLaunchError = error;
      throw error;
    }
  })();
  try {
    return await dolaLaunchPromise;
  } finally {
    dolaLaunchPromise = null;
  }
}

async function getManagerTarget() {
  const targets = await getTargets();
  return targets.find((target) =>
    target.type === "page" &&
    /AI 多账号管理器|豆包管理器/i.test(String(target.title || ""))
  ) || targets.find((target) =>
    target.type === "page" &&
    /app\.asar\/renderer\/index\.html/i.test(String(target.url || ""))
  );
}

async function withManager(callback, timeoutMs = 30000) {
  await ensureDolaRunning();
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    const target = await getManagerTarget();
    if (!target?.webSocketDebuggerUrl) {
      lastError = new Error("未找到 Dola 管理器主页面");
      await sleep(350);
      continue;
    }
    const client = new CdpClient(target.webSocketDebuggerUrl);
    let ready = false;
    try {
      await client.connect(5000);
      await client.call("Runtime.enable", {}, 5000);
      while (Date.now() < deadline) {
        try {
          ready = Boolean(await client.evaluate(
            `typeof state !== "undefined" && Array.isArray(state.accounts) &&
              (Array.isArray(state.openTabs) || Array.isArray(state.tabs))`,
            4000
          ));
        } catch (error) {
          lastError = error;
          break;
        }
        if (ready) break;
        await sleep(250);
      }
    } catch (error) {
      lastError = error;
    }
    if (!ready) {
      client.close();
      await sleep(300);
      continue;
    }
    try {
      return await callback(client, timeoutMs);
    } catch (error) {
      const message = safeMessage(error);
      if (!/state is not defined|Execution context|CDP (?:尚未连接|连接已关闭)/i.test(message)) {
        throw error;
      }
      lastError = error;
    } finally {
      client.close();
    }
    await sleep(350);
  }
  throw lastError || new Error("Dola 管理器页面尚未初始化完成");
}

async function managerEval(expression, timeoutMs = 30000) {
  return withManager((client) => client.evaluate(expression, timeoutMs), timeoutMs);
}

async function withLicenseManager(callback, timeoutMs = 30000) {
  await ensureDolaRunning();
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    const targets = (await getTargets()).filter(
      (target) => target.type === "page" && target.webSocketDebuggerUrl
    );
    for (const target of targets) {
      const client = new CdpClient(target.webSocketDebuggerUrl);
      try {
        await client.connect(5000);
        await client.call("Runtime.enable", {}, 5000);
        const ready = Boolean(await client.evaluate(
          `Boolean(window.managerAPI?.license?.status && window.managerAPI?.license?.activate)`,
          4000
        ));
        if (!ready) {
          client.close();
          continue;
        }
        try {
          return await callback(client, timeoutMs);
        } finally {
          client.close();
        }
      } catch (error) {
        lastError = error;
        client.close();
      }
    }
    await sleep(350);
  }
  throw lastError || new Error("豆包管理器授权页面尚未就绪");
}

async function licenseManagerEval(expression, timeoutMs = 30000) {
  return withLicenseManager((client) => client.evaluate(expression, timeoutMs), timeoutMs);
}

function publicLicenseStatus(status) {
  const license = status?.license || null;
  return {
    active: Boolean(status?.active),
    device_id: String(status?.deviceId || ""),
    message: String(status?.message || ""),
    license: license ? {
      id: String(license.id || ""),
      customer: String(license.customer || ""),
      plan: String(license.plan || ""),
      issued_at: String(license.issuedAt || ""),
      expires_at: license.expiresAt ? String(license.expiresAt) : null,
      permanent: Boolean(license.permanent),
      features: Array.isArray(license.features) ? license.features.map(String) : []
    } : null
  };
}

async function getManagerLicenseStatus(timeoutMs = 30000) {
  const status = await licenseManagerEval(`window.managerAPI.license.status()`, timeoutMs);
  return publicLicenseStatus(status);
}

async function activateManagerLicense(code, timeoutMs = 30000) {
  const value = String(code || "").trim();
  if (!value) {
    return {
      active: false,
      device_id: "",
      message: "请输入字字插件激活码",
      license: null
    };
  }
  let directStatus = null;
  let directError = null;
  try {
    directStatus = await licenseManagerEval(
      `(async () => window.managerAPI.license.activate(${JSON.stringify(value)}))()`,
      timeoutMs
    );
  } catch (error) {
    directError = error;
  }
  await sleep(700);
  try {
    return await getManagerLicenseStatus(Math.max(8000, timeoutMs));
  } catch (statusError) {
    if (directStatus) return publicLicenseStatus(directStatus);
    throw directError || statusError;
  }
}

async function listPlatformAccounts(platform = "doubao", group = "") {
  const platformValue = normalizeTargetPlatform(platform);
  const groupValue = String(group || "").trim();
  const expression = `(() => {
    const wantedPlatform = ${JSON.stringify(platformValue)};
    const wantedGroup = ${JSON.stringify(groupValue)};
    return state.accounts
      .filter(account => account.platform === wantedPlatform)
      .filter(account => !wantedGroup || String(account.group || account.accountGroup || "").trim() === wantedGroup)
      .map(account => ({
        id: String(account.id),
        name: String(account.name || account.id),
        platform: String(account.platform || ""),
        group: String(account.group || account.accountGroup || ""),
        remark: String(account.remark || "")
      }));
  })()`;
  const accounts = await managerEval(expression);
  return Array.isArray(accounts) ? accounts : [];
}

async function openAccount(accountId, platform = "doubao", timeoutMs = 30000) {
  const id = String(accountId);
  const platformValue = normalizeTargetPlatform(platform);
  const markerScript = `window.__ZZ_VIDEO_ACCOUNT_ID = ${JSON.stringify(id)}; window.__ZZ_VIDEO_ACCOUNT_PLATFORM = ${JSON.stringify(platformValue)}; window.__ZZ_DOUBAO_ACCOUNT_ID = ${JSON.stringify(id)}; true;`;
  const expression = `(async () => {
    const accountId = ${JSON.stringify(id)};
    const wantedPlatform = ${JSON.stringify(platformValue)};
    const account = state.accounts.find(item => String(item.id) === accountId && item.platform === wantedPlatform);
    if (!account) throw new Error("豆包管理器中未找到指定" + (wantedPlatform === "dola" ? "Dola" : "豆包") + "账号");
    const getTabs = () => Array.isArray(state.openTabs) ? state.openTabs : (Array.isArray(state.tabs) ? state.tabs : []);
    if (!getTabs().some(tab => String(tab.accountId) === accountId)) {
      if (typeof openAccountTab === "function") openAccountTab(accountId);
      else if (typeof openAccount === "function") openAccount(accountId);
      else throw new Error("豆包管理器没有可用的账号打开函数");
    }
    const deadline = Date.now() + ${Math.max(10000, timeoutMs - 2000)};
    let tab = null;
    while (Date.now() < deadline) {
      tab = getTabs().find(item => String(item.accountId) === accountId);
      if (tab?.webview) {
        let loading = false;
        try { loading = tab.webview.isLoading(); } catch (_) {}
        if (!loading) break;
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    if (!tab?.webview) throw new Error((wantedPlatform === "dola" ? "Dola" : "豆包") + "账号页面创建失败");
    await new Promise(resolve => setTimeout(resolve, 700));
    await tab.webview.executeJavaScript(${JSON.stringify(markerScript)});
    return {
      accountId,
      name: String(account.name || account.id),
      platform: wantedPlatform,
      url: String(tab.webview.getURL?.() || ""),
      webContentsId: Number(tab.webview.getWebContentsId?.() || 0)
    };
  })()`;
  return managerEval(expression, timeoutMs);
}

async function getMarkedWebview(accountId, platform = "doubao") {
  const wanted = String(accountId);
  const wantedPlatform = normalizeTargetPlatform(platform);
  const targets = (await getTargets()).filter((target) => target.type === "webview");
  for (const target of targets) {
    if (!target.webSocketDebuggerUrl) continue;
    const client = new CdpClient(target.webSocketDebuggerUrl);
    try {
      await client.connect(5000);
      await client.call("Runtime.enable", {}, 5000);
      const marker = await client.evaluate(
        `JSON.stringify({
          id: String(window.__ZZ_VIDEO_ACCOUNT_ID || window.__DBM_ACCOUNT_ID__ || window.__ZZ_DOUBAO_ACCOUNT_ID || ""),
          platform: String(window.__ZZ_VIDEO_ACCOUNT_PLATFORM || window.__DBM_ACCOUNT_PLATFORM__ || "")
        })`,
        5000
      );
      let parsed = {};
      try { parsed = JSON.parse(marker || "{}"); } catch (_) {}
      if (
        parsed.id === wanted
        && (!parsed.platform || parsed.platform === wantedPlatform)
      ) return { client, target };
    } catch (_) {}
    client.close();
  }
  throw new Error(`未找到账号对应的 ${platformName(wantedPlatform)} WebView 调试目标`);
}

function findMicrosoftEdgeExecutable() {
  const candidates = [
    process.env.ZZ_DOLA_EDGE_EXE,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Microsoft", "Edge", "Application", "msedge.exe")
      : ""
  ].filter(Boolean);
  const executable = candidates.find(candidate => fs.existsSync(candidate));
  if (!executable) {
    throw new Error("未找到 Microsoft Edge；Dola 真实生成必须使用 Edge 浏览器内核");
  }
  return executable;
}

function dolaEdgeAccountKey(accountId) {
  return createHash("sha256").update(String(accountId || "")).digest("hex").slice(0, 20);
}

function dolaEdgePortForAccount(accountId) {
  const id = String(accountId || "");
  if (dolaEdgePorts.has(id)) return dolaEdgePorts.get(id);
  const seed = Number.parseInt(createHash("sha256").update(id).digest("hex").slice(0, 6), 16);
  let port = DOLA_EDGE_BASE_PORT + (seed % 700);
  const used = new Set(dolaEdgePorts.values());
  while (used.has(port)) {
    port += 1;
    if (port > DOLA_EDGE_BASE_PORT + 999) port = DOLA_EDGE_BASE_PORT;
  }
  dolaEdgePorts.set(id, port);
  return port;
}

async function getTargetsForPort(port, timeoutMs = 3500) {
  const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`, timeoutMs);
  return Array.isArray(targets) ? targets : [];
}

async function getEdgeVersionForPort(port, timeoutMs = 1800) {
  return fetchJson(`http://127.0.0.1:${port}/json/version`, timeoutMs);
}

async function findDolaEdgeTarget(port) {
  const targets = await getTargetsForPort(port, 3500);
  return targets.find(target =>
    target.type === "page"
    && /https?:\/\/(?:www\.)?dola\.com\//i.test(String(target.url || ""))
    && target.webSocketDebuggerUrl
  );
}

async function ensureDolaEdgeTarget(accountId, timeoutMs = 30000) {
  const port = dolaEdgePortForAccount(accountId);
  try {
    const version = await getEdgeVersionForPort(port);
    const target = await findDolaEdgeTarget(port);
    if (/^Edg\//i.test(String(version?.Browser || "")) && target?.webSocketDebuggerUrl) {
      return { port, target, launched: false };
    }
  } catch (_) {}

  const executable = findMicrosoftEdgeExecutable();
  const profileDir = path.join(DOLA_EDGE_PROFILE_DIR, dolaEdgeAccountKey(accountId));
  fs.mkdirSync(profileDir, { recursive: true });
  const child = spawn(executable, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--remote-allow-origins=*",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=msEdgeFirstRunExperience",
    "--window-size=1500,980",
    "--app=https://www.dola.com/chat/"
  ], {
    detached: true,
    stdio: "ignore",
    windowsHide: false
  });
  child.unref();
  log("已为 Dola 账号启动真实 Microsoft Edge", {
    accountId: String(accountId),
    port,
    executable
  });

  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const version = await getEdgeVersionForPort(port);
      const target = await findDolaEdgeTarget(port);
      if (/^Edg\//i.test(String(version?.Browser || "")) && target?.webSocketDebuggerUrl) {
        return { port, target, launched: true };
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(350);
  }
  throw new Error(`Microsoft Edge Dola 窗口启动超时：${safeMessage(lastError)}`);
}

function transferableDolaCookie(cookie) {
  const result = {
    name: String(cookie?.name || ""),
    value: String(cookie?.value || ""),
    domain: String(cookie?.domain || ""),
    path: String(cookie?.path || "/"),
    secure: Boolean(cookie?.secure),
    httpOnly: Boolean(cookie?.httpOnly)
  };
  if (["Strict", "Lax", "None"].includes(cookie?.sameSite)) result.sameSite = cookie.sameSite;
  if (Number(cookie?.expires) > 0) result.expires = Number(cookie.expires);
  return result;
}

async function synchronizeDolaSessionToEdge(accountId, sourceClient) {
  const sourceAuth = await getDolaAuthSnapshot(sourceClient);
  if (Number(sourceAuth?.authScore || 0) > 0) {
    throw new AttemptError(
      "AUTH_REQUIRED",
      "Dola 管理器中的账号尚未登录或登录已失效",
      true
    );
  }

  await sourceClient.call("Network.enable", {}, 7000);
  const [cookieResult, storage] = await Promise.all([
    sourceClient.call("Network.getAllCookies", {}, 10000),
    sourceClient.evaluate(`(() => ({
      local: Object.fromEntries(Array.from({ length: localStorage.length }, (_, index) => {
        const key = localStorage.key(index);
        return [key, localStorage.getItem(key)];
      })),
      session: Object.fromEntries(Array.from({ length: sessionStorage.length }, (_, index) => {
        const key = sessionStorage.key(index);
        return [key, sessionStorage.getItem(key)];
      }))
    }))()`, 10000)
  ]);
  const cookies = (Array.isArray(cookieResult?.cookies) ? cookieResult.cookies : [])
    .filter(cookie => /(?:^|\.)dola\.com$/i.test(String(cookie?.domain || "").replace(/^\./, "")))
    .map(transferableDolaCookie)
    .filter(cookie => cookie.name && cookie.domain);
  if (!cookies.length) {
    throw new AttemptError(
      "AUTH_REQUIRED",
      "Dola 管理器账号没有可迁移的登录会话，请重新登录后再试",
      true
    );
  }

  const edge = await ensureDolaEdgeTarget(accountId);
  const client = new CdpClient(edge.target.webSocketDebuggerUrl);
  try {
    await client.connect(7000);
    await client.call("Runtime.enable", {}, 7000);
    await client.call("Page.enable", {}, 7000);
    await client.call("Network.enable", {}, 7000);
    await client.call("Network.clearBrowserCookies", {}, 7000);
    const setResult = await client.call("Network.setCookies", { cookies }, 12000);
    if (setResult?.success === false) throw new Error("Microsoft Edge 拒绝写入 Dola 登录会话");
    await client.call("Page.navigate", { url: "https://www.dola.com/chat/" }, 10000);
    await sleep(1200);
    await client.evaluate(`(() => {
      const storage = ${JSON.stringify(storage)};
      localStorage.clear();
      sessionStorage.clear();
      for (const [key, value] of Object.entries(storage.local || {})) localStorage.setItem(key, value);
      for (const [key, value] of Object.entries(storage.session || {})) sessionStorage.setItem(key, value);
      return true;
    })()`, 10000);
    await client.call("Page.navigate", { url: "https://www.dola.com/chat/" }, 10000);
    await sleep(1200);
    const deadline = Date.now() + 20000;
    let auth = null;
    while (Date.now() < deadline) {
      try {
        auth = await getDolaAuthSnapshot(client);
        if (Number(auth?.authScore || 0) === 0 && auth?.hasEditor) break;
      } catch (_) {}
      await sleep(400);
    }
    if (Number(auth?.authScore || 0) > 0 || !auth?.hasEditor) {
      throw new Error("Dola 登录会话迁移到 Microsoft Edge 后未生效");
    }
    log("Dola 账号已切换到真实 Microsoft Edge 执行", {
      accountId: String(accountId),
      port: edge.port,
      launched: edge.launched,
      cookieCount: cookies.length,
      localStorageCount: Object.keys(storage?.local || {}).length,
      href: auth.href
    });
    return { client, target: edge.target, port: edge.port, auth };
  } catch (error) {
    client.close();
    throw error;
  }
}

async function waitForPage(client, expression, predicate, timeoutMs, intervalMs = 350, timeoutMessage = "") {
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  while (Date.now() < deadline) {
    lastValue = await client.evaluate(expression, 7000);
    if (predicate(lastValue)) return lastValue;
    await sleep(intervalMs);
  }
  const error = new Error(timeoutMessage || "等待豆包页面状态超时");
  error.lastValue = lastValue;
  throw error;
}

const composerStateExpression = `(() => {
  const visible = (node) => {
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  };
  const editor = Array.from(document.querySelectorAll('[contenteditable="true"][role="textbox"],textarea[placeholder*="消息"],textarea')).find(visible);
  const fileInput = document.querySelector('input[type="file"][accept*=".jpg"],input[type="file"][accept*="image"]');
  const bodyText = String(document.body?.innerText || "");
  const controlTexts = Array.from(document.querySelectorAll("button,[role=button]"))
    .filter(visible)
    .map(node => String(node.innerText || node.textContent || "").replace(/\\s+/g, " ").trim());
  const hasVideoControls = controlTexts.some(text => /Seedance|2\.0\s+(?:Mini|Fast|Pro)/i.test(text))
    && controlTexts.some(text => /(?:5|10|15)s/i.test(text));
  const loginButton = Array.from(document.querySelectorAll("button,[role=button]"))
    .filter(visible)
    .find(node => String(node.innerText || node.textContent || "").replace(/\\s+/g, "") === "登录");
  return {
    ready: Boolean(editor),
    videoMode: Boolean(editor && (/描述你想要的视频/.test(editor.innerHTML || "") || hasVideoControls)),
    authRequired: Boolean(loginButton || /登录以解锁更多功能|请先登录|登录后[^\\n]{0,20}(?:生成|使用)|扫码登录|手机号登录|验证码登录/.test(bodyText)),
    editorText: String(editor?.editor?.getText?.() || editor?.value || editor?.textContent || editor?.innerText || "").trim(),
    hasFileInput: Boolean(fileInput),
    fileMultiple: Boolean(fileInput?.multiple),
    fileCount: Number(fileInput?.files?.length || 0),
    href: location.href
  };
})()`;

const attachmentStateExpression = `(() => {
  const visible = (node) => {
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  };
  const previews = Array.from(document.querySelectorAll('[class*="content-wrapper"] img[alt="image"]'))
    .filter(visible);
  const statusTexts = Array.from(document.querySelectorAll("body *"))
    .filter(visible)
    .map(node => String(node.innerText || node.textContent || "").trim())
    .filter(text => /^(?:\\d{1,3}%|上传中|正在上传|上传失败|重新上传|重试)$/.test(text));
  return {
    attachmentCount: previews.length,
    attachmentSources: previews.map(node => String(node.currentSrc || node.src || "")),
    uploading: statusTexts.some(text => /%$|上传中|正在上传/.test(text)),
    failed: statusTexts.some(text => /上传失败|重新上传|重试/.test(text)),
    statusTexts
  };
})()`;

async function startFreshConversation(client, platform = "doubao") {
  if (normalizeTargetPlatform(platform) === "dola") {
    const pageState = await client.evaluate(`(() => {
      const visible = node => {
        if (!node) return false;
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      };
      const editor = Array.from(document.querySelectorAll('[contenteditable="true"][role="textbox"],textarea'))
        .find(visible);
      const editorText = String(
        editor?.editor?.getText?.() || editor?.value || editor?.textContent || editor?.innerText || ""
      ).trim();
      const attachmentCount = Array.from(
        document.querySelectorAll('[class*="content-wrapper"] img[alt="image"]')
      ).filter(visible).length;
      const messageCount = Array.from(document.querySelectorAll('[data-message-id]')).filter(visible).length;
      return {
        pathname: location.pathname,
        hasEditor: Boolean(editor),
        editorText,
        attachmentCount,
        messageCount
      };
    })()`);
    if (isDolaFreshConversationState(pageState)) {
      log("Dola 已在空白新对话，跳过重复点击新对话");
      return;
    }
  }
  await client.evaluate(`(() => {
    const visible = (node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const normalize = value => String(value || "").replace(/\\s+/g, "");
    const candidates = Array.from(document.querySelectorAll("button,[role=button],a,div"))
      .filter(visible)
      .filter(node => normalize(node.innerText || node.textContent).startsWith("新对话CtrlShiftK"))
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return ar.width * ar.height - br.width * br.height;
      });
    const item = candidates[0];
    if (!item) return false;
    item.click();
    return true;
  })()`);
  await waitForPage(
    client,
    attachmentStateExpression,
    value => Number(value?.attachmentCount || 0) === 0,
    12000,
    300,
    "新对话状态重置超时"
  );
  await sleep(600);
}

async function ensureVideoComposer(client, platform = "doubao") {
  const targetPlatform = normalizeTargetPlatform(platform);
  let stateValue = await client.evaluate(composerStateExpression);
  if (stateValue?.authRequired) {
    throw new AttemptError(
      "AUTH_REQUIRED",
      `${platformName(targetPlatform)}账号尚未登录或登录已失效`,
      true
    );
  }
  if (!stateValue?.videoMode) {
    await client.evaluate(`(() => {
      const visible = (node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      };
      const button = Array.from(document.querySelectorAll("button,[role=button]"))
        .filter(visible)
        .find(node => String(node.innerText || node.textContent || "").replace(/\\s+/g, "").includes("视频生成"));
      if (!button) return false;
      button.click();
      return true;
    })()`);
  }
  const deadline = Date.now() + 25000;
  let readySince = 0;
  while (Date.now() < deadline) {
    stateValue = await client.evaluate(composerStateExpression, 7000);
    if (stateValue?.authRequired) {
      throw new AttemptError(
        "AUTH_REQUIRED",
        `${platformName(targetPlatform)}账号尚未登录或登录已失效`,
        true
      );
    }
    const ready = stateValue?.ready && stateValue?.hasFileInput
      && (targetPlatform === "dola" || stateValue?.videoMode);
    if (ready) {
      if (!readySince) readySince = Date.now();
      if (Date.now() - readySince >= (targetPlatform === "dola" ? 1200 : 0)) return stateValue;
    } else {
      readySince = 0;
    }
    await sleep(400);
  }
  throw new AttemptError("PAGE_NOT_READY", `${platformName(targetPlatform)}视频生成编辑器未在规定时间内就绪`, true);
}

async function configureModel(client, modelText, platform) {
  try {
    await chooseModel(client, modelText);
    return true;
  } catch (error) {
    if (normalizeTargetPlatform(platform) !== "dola") throw error;
    log("Dola 页面未提供可操作的模型控件，已通过提示词传递模型", safeMessage(error));
    return false;
  }
}

async function configureDuration(client, duration, platform) {
  if (normalizeTargetPlatform(platform) === "dola") {
    const hasControl = await client.evaluate(`(() => {
      const normalize = value => String(value || "").replace(/\\s+/g, " ").trim();
      return Boolean(
        document.querySelector('[data-input-engine-actionbar-control-key="video-duration"]')
        || Array.from(document.querySelectorAll("button,[role=button]"))
          .find(node => /^(?:自动|自动时长|智能时长)$/i.test(normalize(node.textContent || node.innerText))
            || /^(?:自动[·\\s]*)?(?:5|10|15)s$/i.test(normalize(node.textContent || node.innerText)))
      );
    })()`);
    if (!hasControl) {
      log("Dola 页面未提供时长控件，已通过提示词传递时长");
      return false;
    }
  }
  try {
    await chooseDuration(client, duration);
    return true;
  } catch (error) {
    if (normalizeTargetPlatform(platform) !== "dola") throw error;
    log("Dola 页面未提供可操作的时长控件，已通过提示词传递时长", safeMessage(error));
    return false;
  }
}

async function chooseModel(client, modelText) {
  const wanted = normalizeModel(modelText);
  const wantedAliases = wanted === "seedance2.0mini"
    ? ["Seedance 2.0 Mini", "Seedance2.0Mini", "2.0 Mini", "2.0Mini"]
    : ["Seedance 2.0 Fast", "Seedance2.0Fast", "2.0 Fast", "2.0Fast"];
  const current = await client.evaluate(`(() => {
    const normalize = value => String(value || "").replace(/\\s+/g, " ").trim();
    const trigger = document.querySelector('[data-input-engine-actionbar-control-key="video-model"]')
      || Array.from(document.querySelectorAll("button,[role=button]"))
      .find(node => /Seedance|模型/i.test(normalize(node.textContent || node.innerText)));
    return trigger ? normalize(trigger.textContent || trigger.innerText) : "";
  })()`);
  if (wantedAliases.some(alias => String(current || "").toLowerCase().includes(alias.toLowerCase()))) return;

  const clicked = await client.evaluate(`(() => {
    const normalize = value => String(value || "").replace(/\\s+/g, " ").trim();
    const trigger = document.querySelector('[data-input-engine-actionbar-control-key="video-model"]')
      || Array.from(document.querySelectorAll("button,[role=button]"))
      .find(node => /Seedance|模型/i.test(normalize(node.textContent || node.innerText)));
    if (!trigger) return false;
    if (trigger.getAttribute("data-state") === "open") return true;
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      const event = type.startsWith("pointer")
        ? new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: "mouse", button: 0 })
        : new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 });
      trigger.dispatchEvent(event);
    }
    return true;
  })()`);
  if (!clicked) throw new Error("未找到豆包模型选择按钮");
  await waitForPage(
    client,
    `Boolean(document.querySelector('[data-input-engine-actionbar-control-key="video-model"][data-state="open"], [role="menuitem"]'))`,
    value => Boolean(value),
    3000,
    100,
    "豆包模型菜单展开超时"
  );

  let selected = await client.evaluate(`(() => {
    const wantedAliases = ${JSON.stringify(wantedAliases)};
    const visible = (node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const normalize = value => String(value || "").replace(/\\s+/g, " ").trim().toLowerCase();
    const candidates = Array.from(document.querySelectorAll('[role="menuitem"],[role="option"]'))
      .filter(visible)
      .filter(node => wantedAliases.some(alias => normalize(node.textContent || node.innerText).includes(alias.toLowerCase())))
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return ar.width * ar.height - br.width * br.height;
      });
    let item = candidates[0];
    if (!item && ${JSON.stringify(wanted)} === "seedance2.0fast") {
      item = Array.from(document.querySelectorAll('[role="menuitem"],[role="option"]'))
        .filter(visible)
        .find(node => /^seedance\\s*2\\.0(?:\\s|$)/i.test(String(node.textContent || node.innerText || "").trim())
          && !/mini/i.test(String(node.textContent || node.innerText || "")));
    }
    if (!item) return false;
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      const event = type.startsWith("pointer")
        ? new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: "mouse", button: 0 })
        : new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 });
      item.dispatchEvent(event);
    }
    return true;
  })()`);
  if (!selected) throw new Error(`豆包模型列表中未找到“${wanted === "seedance2.0mini" ? "Seedance 2.0 Mini" : "Seedance 2.0 Fast"}”`);
  await sleep(300);
  await client.evaluate(`(() => {
    const trigger = document.querySelector('[data-input-engine-actionbar-control-key="video-model"]');
    if (trigger?.getAttribute("data-state") !== "open") return false;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", code: "Escape", bubbles: true }));
    return true;
  })()`);
  await sleep(200);
  const confirmed = await client.evaluate(`(() => {
    const trigger = document.querySelector('[data-input-engine-actionbar-control-key="video-model"]');
    return String(trigger?.textContent || trigger?.innerText || "").replace(/\\s+/g, " ").trim();
  })()`);
  if (!wantedAliases.some(alias => String(confirmed || "").toLowerCase().includes(alias.toLowerCase()))) {
    throw new Error(`豆包模型切换后未生效（当前：${String(confirmed || "未知")}）`);
  }
}

async function chooseDuration(client, duration) {
  const wanted = normalizeDuration(duration);
  const isAuto = wanted === "auto";
  const seconds = isAuto ? 0 : wanted;
  await client.evaluate(`(() => {
    try {
      if (${JSON.stringify(wanted)} === "auto") localStorage.setItem("codex_doubao_video_duration_choice", "auto");
      else if (${seconds} === 15) localStorage.setItem("codex_doubao_video_duration_choice", "15");
      else localStorage.removeItem("codex_doubao_video_duration_choice");
    } catch (_) {}
    return true;
  })()`);

  const current = await client.evaluate(`(() => {
    const normalize = value => String(value || "").replace(/\\s+/g, " ").trim();
    const trigger = document.querySelector('[data-input-engine-actionbar-control-key="video-duration"]')
      || Array.from(document.querySelectorAll("button,[role=button]"))
      .find(node => /^(?:自动|自动时长|智能时长)$/i.test(normalize(node.textContent || node.innerText))
        || /^(?:自动[·\\s]*)?(?:5|10|15)s$/i.test(normalize(node.textContent || node.innerText))
        || /(?:自动|比例|画幅).*?(?:5|10|15)s/i.test(normalize(node.textContent || node.innerText)));
    return trigger ? normalize(trigger.textContent || trigger.innerText) : "";
  })()`);
  if (isAuto ? /自动/.test(String(current || "")) : String(current || "").toLowerCase().includes(`${seconds}s`)) return;

  const opened = await client.evaluate(`(() => {
    const normalize = value => String(value || "").replace(/\\s+/g, " ").trim();
    const trigger = document.querySelector('[data-input-engine-actionbar-control-key="video-duration"]')
      || Array.from(document.querySelectorAll("button,[role=button]"))
      .find(node => /^(?:自动|自动时长|智能时长)$/i.test(normalize(node.innerText || node.textContent))
        || /^(?:自动[·\\s]*)?(?:5|10|15)s$/i.test(normalize(node.innerText || node.textContent))
        || /(?:自动|比例|画幅).*?(?:5|10|15)s/i.test(normalize(node.innerText || node.textContent)));
    if (!trigger) return false;
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      const event = type.startsWith("pointer")
        ? new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: "mouse", button: 0 })
        : new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 });
      trigger.dispatchEvent(event);
    }
    return true;
  })()`);
  if (!opened) {
    if (isAuto || seconds === 10 || seconds === 15) return;
    throw new Error("未找到豆包时长选择按钮");
  }
  try {
    await waitForPage(
      client,
      `Boolean(document.querySelector('[role="menu"][data-state="open"], [role="listbox"]'))`,
      value => Boolean(value),
      2500,
      100
    );
  } catch (_) {
    if (isAuto || seconds === 15) return;
    throw new Error("豆包时长菜单未能展开");
  }

  let selected = await client.evaluate(`(() => {
    const normalize = value => String(value || "").replace(/\\s+/g, "").replace(/[✓✔√]/g, "");
    const visible = (node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const candidates = Array.from(document.querySelectorAll('[role="menuitem"],[role="option"]'))
      .filter(visible)
      .filter(node => {
        const text = normalize(node.innerText || node.textContent);
        return ${isAuto} ? /^(?:自动|自动时长|智能时长)$/.test(text) : [${JSON.stringify(`${seconds}s`)}, ${JSON.stringify(`${seconds}秒`)}].includes(text);
      })
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return ar.width * ar.height - br.width * br.height;
    });
    const item = candidates[0];
    if (!item) return false;
    item.click();
    return true;
  })()`);
  if (!selected && !isAuto) {
    const sliderTarget = Number(seconds) - 4;
    const sliderRange = await client.evaluate(`(() => {
      const visible = (node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      };
      const thumb = Array.from(document.querySelectorAll('[role="slider"]')).find(visible);
      if (!thumb) return { ok: false, reason: "slider_not_found" };
      const min = Number(thumb.getAttribute("aria-valuemin"));
      const max = Number(thumb.getAttribute("aria-valuemax"));
      const target = ${sliderTarget};
      if (!Number.isFinite(min) || !Number.isFinite(max) || target < min || target > max) {
        return { ok: false, reason: "slider_range", min, max, target };
      }
      return {
        ok: true,
        min,
        max,
        now: Number(thumb.getAttribute("aria-valuenow")),
        target
      };
    })()`);
    const invokeSliderKey = async (key, code) => client.evaluate(`(() => {
      const thumb = document.querySelector('[role="slider"]');
      const root = thumb?.closest('[data-slot="slider"]');
      const reactKey = root && Object.keys(root).find(value => value.startsWith("__reactProps"));
      const handler = reactKey ? root[reactKey]?.onKeyDown : null;
      if (typeof handler !== "function") return false;
      handler({
        key: ${JSON.stringify(key)},
        code: ${JSON.stringify(code)},
        target: thumb,
        currentTarget: root,
        preventDefault() {},
        stopPropagation() {},
        isDefaultPrevented() { return false; },
        isPropagationStopped() { return false; }
      });
      return true;
    })()`, 5000);
    if (sliderRange?.ok) {
      if (sliderRange.target === sliderRange.max) {
        await invokeSliderKey("End", "End");
      } else {
        await invokeSliderKey("Home", "Home");
        await sleep(120);
        for (let step = sliderRange.min; step < sliderRange.target; step += 1) {
          await invokeSliderKey("ArrowRight", "ArrowRight");
          await sleep(90);
        }
      }
      await sleep(250);
      const current = Number(await client.evaluate(
        `Number(document.querySelector('[role="slider"]')?.getAttribute("aria-valuenow"))`
      ));
      selected = current === sliderRange.target;
    };
  }
  if (!selected) {
    await client.evaluate(`(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
      document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", code: "Escape", bubbles: true }));
      return true;
    })()`);
    if (!isAuto && seconds !== 15) throw new Error(`豆包时长菜单中未找到 ${seconds}s`);
  }
  await client.evaluate(`(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", code: "Escape", bubbles: true }));
    return true;
  })()`);
  await sleep(350);
  if (!isAuto) {
    const confirmed = await client.evaluate(`(() => {
      const normalize = value => String(value || "").replace(/\\s+/g, " ").trim();
      const trigger = Array.from(document.querySelectorAll("button,[role=button]"))
        .find(node => /(?:自动|比例|画幅).*?(?:4|5|10|15)s/i.test(normalize(node.textContent || node.innerText))
          || /^(?:4|5|10|15)s$/i.test(normalize(node.textContent || node.innerText)));
      const slider = document.querySelector('[role="slider"]');
      return {
        triggerText: normalize(trigger?.textContent || trigger?.innerText || ""),
        sliderNow: Number(slider?.getAttribute("aria-valuenow"))
      };
    })()`);
    if (
      !String(confirmed?.triggerText || "").toLowerCase().includes(`${seconds}s`)
      && Number(confirmed?.sliderNow) !== Number(seconds) - 4
    ) {
      throw new Error(`豆包时长切换后未生效（目标 ${seconds}s，当前：${String(confirmed?.triggerText || "未知")}）`);
    }
  }
}

async function uploadReferenceImages(client, imagePaths) {
  const resolvedPaths = Array.from(new Set(
    (Array.isArray(imagePaths) ? imagePaths : [imagePaths])
      .filter(Boolean)
      .map(value => path.resolve(String(value)))
  ));
  if (!resolvedPaths.length) return { count: 0, multiple: false };
  for (const resolved of resolvedPaths) {
    if (!fs.existsSync(resolved)) throw new Error(`参考图不存在：${resolved}`);
  }
  await client.call("DOM.enable", {}, 5000);
  const setFile = async (file) => {
    const documentResult = await client.call("DOM.getDocument", { depth: -1, pierce: true }, 10000);
    const queryResult = await client.call("DOM.querySelector", {
      nodeId: documentResult.root.nodeId,
      selector: 'input[type="file"][accept*=".jpg"],input[type="file"][accept*="image"]'
    }, 5000);
    if (!queryResult.nodeId) throw new Error("未找到豆包参考图上传控件");
    await client.call("DOM.setFileInputFiles", {
      nodeId: queryResult.nodeId,
      files: [file]
    }, 15000);
  };

  for (let index = 0; index < resolvedPaths.length; index += 1) {
    await setFile(resolvedPaths[index]);
    const expectedCount = index + 1;
    const deadline = Date.now() + 120000;
    let readySince = 0;
    let lastState = null;
    while (Date.now() < deadline) {
      lastState = await client.evaluate(attachmentStateExpression, 7000);
      if (lastState?.failed) {
        throw new Error(`第 ${expectedCount} 张参考图上传失败：${lastState.statusTexts?.join("、") || "豆包页面报告失败"}`);
      }
      if (Number(lastState?.attachmentCount || 0) === expectedCount && !lastState?.uploading) {
        if (!readySince) readySince = Date.now();
        if (Date.now() - readySince >= 2500) break;
      } else {
        readySince = 0;
      }
      await sleep(400);
    }
    if (
      Number(lastState?.attachmentCount || 0) !== expectedCount
      || lastState?.uploading
      || !readySince
    ) {
      throw new Error(`第 ${expectedCount} 张参考图未在规定时间内完成上传`);
    }
  }
  const finalState = await client.evaluate(attachmentStateExpression, 7000);
  return {
    count: Number(finalState?.attachmentCount || 0),
    sources: Array.isArray(finalState?.attachmentSources) ? finalState.attachmentSources : []
  };
}

async function dispatchTrustedClick(client, point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("页面控件坐标无效");
  try {
    await client.call("Page.bringToFront", {}, 5000);
  } catch (_) {}
  await client.call("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x,
    y,
    button: "none"
  }, 15000);
  await client.call("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    buttons: 1,
    clickCount: 1
  }, 15000);
  await client.call("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    buttons: 0,
    clickCount: 1
  }, 15000);
}

async function fillDolaPromptWithTrustedInput(client, text) {
  const target = await client.evaluate(`(() => {
    const visible = node => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
        style.visibility !== "hidden" && style.opacity !== "0";
    };
    const editor = Array.from(
      document.querySelectorAll('[contenteditable="true"][role="textbox"],textarea[placeholder*="消息"],textarea')
    ).find(visible);
    if (!editor) return { ok: false };
    const rect = editor.getBoundingClientRect();
    return {
      ok: true,
      x: rect.left + Math.max(8, Math.min(rect.width / 2, rect.width - 8)),
      y: rect.top + Math.max(8, Math.min(rect.height / 2, rect.height - 8))
    };
  })()`);
  if (!target?.ok) throw new Error("未找到 Dola 视频提示词输入框");
  await dispatchTrustedClick(client, target);
  await client.call("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    modifiers: 2,
    key: "a",
    code: "KeyA",
    windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 65
  }, 5000);
  await client.call("Input.dispatchKeyEvent", {
    type: "keyUp",
    modifiers: 2,
    key: "a",
    code: "KeyA",
    windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 65
  }, 5000);
  await client.call("Input.insertText", { text }, 10000);
}

async function fillPrompt(client, prompt, platform = "doubao") {
  const text = String(prompt || "").trim();
  if (!text) throw new Error("提示词不能为空");
  const verificationPrefix = text.replace(/\s+/g, " ").trim().slice(0, Math.min(20, text.length));
  if (normalizeTargetPlatform(platform) === "dola") {
    await fillDolaPromptWithTrustedInput(client, text);
    try {
      await waitForPage(
        client,
        composerStateExpression,
        (value) => String(value?.editorText || "").replace(/\s+/g, " ").trim().includes(verificationPrefix),
        5000,
        350,
        "Dola 提示词写入后页面未确认内容"
      );
      return;
    } catch (error) {
      const observed = error?.lastValue?.editorText;
      throw new Error(
        `Dola 提示词写入后页面未确认内容（页面读取：${JSON.stringify(String(observed ?? ""))}）`
      );
    }
  }
  const focused = await client.evaluate(`(() => {
    const visible = (node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const editor = Array.from(document.querySelectorAll('[contenteditable="true"][role="textbox"],textarea[placeholder*="消息"],textarea')).find(visible);
    if (!editor) return false;
    if (editor.editor?.commands) {
      const instance = editor.editor;
      instance.commands.setContent(${JSON.stringify(text)}, { emitUpdate: true });
      try {
        instance.emit("update", { editor: instance, transaction: instance.state?.tr || instance.editorView?.state?.tr });
      } catch (_) {}
      instance.commands.focus("end");
      return true;
    }
    const prototype = editor.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(editor, ${JSON.stringify(text)});
    else editor.value = ${JSON.stringify(text)};
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: ${JSON.stringify(text)} }));
    editor.dispatchEvent(new Event("change", { bubbles: true }));
    editor.focus();
    editor.setSelectionRange?.(editor.value.length, editor.value.length);
    return true;
  })()`);
  if (!focused) throw new Error("未找到视频提示词输入框");
  try {
    await waitForPage(
      client,
      composerStateExpression,
      (value) => String(value?.editorText || "").replace(/\s+/g, " ").trim().includes(verificationPrefix),
      5000,
      350,
      "提示词写入后页面未确认内容"
    );
  } catch (error) {
    const observed = error?.lastValue?.editorText;
    throw new Error(
      `提示词写入后页面未确认内容（页面读取：${JSON.stringify(String(observed ?? ""))}）`
    );
  }
}

async function clearPrompt(client) {
  try {
    await client.evaluate(`(() => {
      const editor = document.querySelector('[contenteditable="true"][role="textbox"],textarea[placeholder*="消息"],textarea');
      if (!editor) return false;
      if (editor.editor?.commands) {
        editor.editor.commands.clearContent(true);
        return true;
      }
      if ("value" in editor) {
        const prototype = editor.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
        if (setter) setter.call(editor, "");
        else editor.value = "";
        editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
        editor.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
      editor.focus();
      document.execCommand("selectAll", false, null);
      document.execCommand("delete", false, null);
      return true;
    })()`);
  } catch (_) {}
}

async function clickSubmit(client, platform = "doubao") {
  if (normalizeTargetPlatform(platform) === "dola") {
    const target = await client.evaluate(`(() => {
      const visible = node => {
        if (!node) return false;
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
          style.visibility !== "hidden" && style.opacity !== "0";
      };
      const editor = Array.from(
        document.querySelectorAll('[contenteditable="true"][role="textbox"],textarea[placeholder*="消息"],textarea')
      ).find(visible);
      if (!editor) return { ok: false, reason: "NO_EDITOR" };
      const er = editor.getBoundingClientRect();
      const direct = document.getElementById("flow-end-msg-send");
      let button = direct && visible(direct) && !direct.disabled &&
        direct.getAttribute("data-disabled") !== "true" ? direct : null;
      if (!button) {
        const buttons = Array.from(document.querySelectorAll("button,[role=button]"))
          .filter(visible)
          .filter(node => !node.disabled && node.getAttribute("data-disabled") !== "true")
          .map(node => ({ node, rect: node.getBoundingClientRect() }))
          .filter(item =>
            item.rect.left >= er.right - 12 &&
            item.rect.top >= er.top - 10 &&
            item.rect.top <= er.bottom + 90
          )
          .sort((a, b) => a.rect.left - b.rect.left);
        button = buttons[buttons.length - 1]?.node || null;
      }
      if (!button) return { ok: false, reason: "NO_BUTTON" };
      const rect = button.getBoundingClientRect();
      return {
        ok: true,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        tagName: String(button.tagName || ""),
        type: String(button.getAttribute("type") || ""),
        selector: button.id ? "#" + button.id : "",
        ariaLabel: String(button.getAttribute("aria-label") || ""),
        title: String(button.getAttribute("title") || ""),
        text: String(button.innerText || button.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 80),
        className: String(button.className || "").replace(/\\s+/g, " ").trim().slice(0, 160),
        hasForm: Boolean(button.closest("form")),
        formAction: button.closest("form") ? String(button.closest("form").getAttribute("action") || "") : ""
      };
    })()`);
    if (!target?.ok) throw new Error(`未找到可用的 Dola 发送按钮（${target?.reason || "未知"}）`);
    log("Dola 使用受信任鼠标事件提交", {
      tagName: target.tagName || "",
      type: target.type || "",
      selector: target.selector || "",
      ariaLabel: target.ariaLabel || "",
      title: target.title || "",
      text: target.text || "",
      className: target.className || "",
      hasForm: Boolean(target.hasForm),
      formAction: target.formAction || ""
    });
    await dispatchTrustedClick(client, target);
    return;
  }
  const clicked = await client.evaluate(`(() => {
    const direct = document.getElementById("flow-end-msg-send");
    if (direct && !direct.disabled && direct.getAttribute("data-disabled") !== "true") {
      direct.click();
      return { ok: true, selector: "#flow-end-msg-send" };
    }
    const visible = (node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" &&
        style.visibility !== "hidden" && style.opacity !== "0";
    };
    const editor = Array.from(document.querySelectorAll('[contenteditable="true"][role="textbox"],textarea[placeholder*="消息"],textarea')).find(visible);
    if (!editor) return { ok: false, reason: "NO_EDITOR" };
    const er = editor.getBoundingClientRect();
    const buttons = Array.from(document.querySelectorAll("button,[role=button]"))
      .filter(visible)
      .filter(node => !node.disabled && node.getAttribute("data-disabled") !== "true")
      .map(node => ({ node, rect: node.getBoundingClientRect() }))
      .filter(item => item.rect.left >= er.right - 12 && item.rect.top >= er.top - 10 && item.rect.top <= er.bottom + 90)
      .sort((a, b) => a.rect.left - b.rect.left);
    const button = buttons[buttons.length - 1]?.node;
    if (!button) return { ok: false, reason: "NO_BUTTON" };
    button.click();
    return { ok: true };
  })()`);
  if (!clicked?.ok) throw new Error(`未找到可用的豆包发送按钮（${clicked?.reason || "未知"}）`);
}

function resourceKey(resource) {
  return [
    resource?.messageId,
    resource?.nodeId,
    resource?.vid,
    resource?.url,
    resource?.title
  ].filter(Boolean).join("::");
}

async function getAccountResources(accountId) {
  const id = String(accountId);
  const expression = `(() => state.resources
    .filter(resource => String(resource.accountId) === ${JSON.stringify(id)} && resource.type === "video")
    .map(resource => ({
      messageId: String(resource.messageId || ""),
      nodeId: String(resource.nodeId || ""),
      vid: String(resource.vid || ""),
      url: String(resource.url || ""),
      backupUrl: String(resource.backupUrl || ""),
      posterUrl: String(resource.posterUrl || resource.thumbUrl || resource.preview || ""),
      title: String(resource.title || resource.name || ""),
      source: String(resource.source || ""),
      confirmedNoWatermark: Boolean(resource.confirmedNoWatermark)
    })))()`;
  const resources = await managerEval(expression);
  return Array.isArray(resources) ? resources : [];
}

const pageSignalsExpression = `(() => {
  const text = String(document.body?.innerText || "");
  const count = (pattern) => (text.match(pattern) || []).length;
  const editor = document.querySelector('[contenteditable="true"][role="textbox"],textarea[placeholder*="消息"],textarea');
  const visible = (node) => {
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  };
  const collectMediaNodeIds = root => {
    const ids = [];
    const seen = new WeakSet();
    const collect = (value, depth = 0) => {
      if (!value || typeof value !== "object" || depth > 7 || seen.has(value)) return;
      seen.add(value);
      const direct = value.node_id || value.nodeId || value.node_id_str || value.nodeIdStr;
      const mediaId = value.id && typeof value.key === "string" && /^v\\d/i.test(value.key)
        ? value.id
        : "";
      if (/^\\d{8,}$/.test(String(direct || ""))) ids.push(String(direct));
      if (/^\\d{8,}$/.test(String(mediaId || ""))) ids.push(String(mediaId));
      if (Array.isArray(value)) {
        value.forEach(item => collect(item, depth + 1));
        return;
      }
      for (const child of Object.values(value).slice(0, 120)) {
        if (child && typeof child === "object") collect(child, depth + 1);
      }
    };
    let current = root;
    while (current && current !== document.documentElement) {
      for (const key of Object.keys(current)) {
        if (!key.startsWith("__reactFiber") && !key.startsWith("__reactProps")) continue;
        let fiber = current[key];
        let guard = 0;
        while (fiber && guard < 60) {
          guard += 1;
          collect(fiber.memoizedProps || fiber.pendingProps || fiber, 0);
          const stateNode = fiber.stateNode;
          if (stateNode && typeof stateNode === "object") {
            for (const stateKey of Object.keys(stateNode)) {
              if (stateKey.startsWith("__reactProps")) collect(stateNode[stateKey], 0);
            }
          }
          fiber = fiber.return;
        }
      }
      current = current.parentElement;
    }
    return Array.from(new Set(ids)).slice(0, 20);
  };
  const collectDolaVideo = root => {
    const seen = new WeakSet();
    const urls = [];
    let vid = "";
    let duration = 0;
    const decodeUrl = value => {
      const source = String(value || "").trim();
      if (!source) return "";
      if (/^https?:\\/\\//i.test(source)) return source;
      if (!/^[a-z0-9+/]+=*$/i.test(source) || source.length < 40) return "";
      try {
        const decoded = atob(source);
        return /^https?:\\/\\//i.test(decoded) ? decoded : "";
      } catch (_) {
        return "";
      }
    };
    const addUrl = (value, key = "") => {
      const decoded = decodeUrl(value);
      const url = decoded || (/^https?:\\/\\//i.test(String(value || "").trim()) ? String(value).trim() : "");
      if (!url) return;
      const normalized = (() => {
        try {
          const parsed = new URL(url);
          if (parsed.protocol === "http:") parsed.protocol = "https:";
          return parsed.href;
        } catch (_) {
          return url;
        }
      })();
      if (urls.some(item => item.url === normalized)) return;
      const noWatermark = /(?:[?&](?:lr|logo_type)=unwatermarked(?:&|$))|unwatermarked/i.test(normalized);
      const directMedia = /\\.(?:mp4|mov)(?:\\?|$)|\\/video\\/tos\\/|mime_type=video_mp4/i.test(normalized);
      let priority = 0;
      if (/main_url/i.test(key)) priority += 60;
      else if (/download_url/i.test(key)) priority += 45;
      else if (/backup_url/i.test(key)) priority += 30;
      if (noWatermark) priority += 100;
      if (directMedia) priority += 20;
      if (/fallback_api/i.test(key)) priority -= 80;
      urls.push({ url: normalized, key: String(key || ""), noWatermark, directMedia, priority });
    };
    const collect = (value, depth = 0) => {
      if (value == null || depth > 14) return;
      if (typeof value === "string") {
        const source = value.trim();
        if (
          source.length >= 2
          && source.length <= 1200000
          && /^[{[]/.test(source)
          && /"(?:video|download_url|video_model|main_url)"/.test(source)
        ) {
          try {
            collect(JSON.parse(source), 0);
          } catch (_) {}
        }
        return;
      }
      if (typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      if (Array.isArray(value)) {
        value.slice(0, 180).forEach(item => collect(item, depth + 1));
        return;
      }
      const directVid = value.vid || value.video_id;
      if (!vid && /^v[a-z0-9]{20,}$/i.test(String(directVid || ""))) vid = String(directVid);
      const directDuration = Number(value.duration || value.video_duration || 0);
      if (!duration && Number.isFinite(directDuration) && directDuration > 0) duration = directDuration;
      for (const [key, child] of Object.entries(value).slice(0, 180)) {
        if (typeof child === "string") {
          if (/(?:^|_)(?:url|uri)(?:_|$)/i.test(key)) addUrl(child, key);
          if (
            child.length >= 2
            && child.length <= 1200000
            && /^[{[]/.test(child.trim())
            && /"(?:video|download_url|video_model|main_url)"/.test(child)
          ) {
            try {
              collect(JSON.parse(child), 0);
            } catch (_) {}
          }
        } else if (child && typeof child === "object") {
          collect(child, depth + 1);
        }
      }
    };
    let current = root;
    while (current && current !== document.documentElement) {
      for (const key of Object.keys(current)) {
        if (!key.startsWith("__reactFiber") && !key.startsWith("__reactProps")) continue;
        let fiber = current[key];
        let guard = 0;
        while (fiber && guard < 60) {
          guard += 1;
          collect(fiber.memoizedProps || fiber.pendingProps || fiber, 0);
          fiber = fiber.return;
        }
      }
      current = current.parentElement;
    }
    urls.sort((left, right) => right.priority - left.priority);
    const chosen = urls.find(item => item.directMedia) || null;
    const backup = urls.find(item => item !== chosen && item.directMedia) || null;
    return {
      vid,
      duration,
      videoUrl: String(chosen?.url || ""),
      backupUrl: String(backup?.url || ""),
      confirmedNoWatermark: Boolean(chosen?.noWatermark),
      urlSource: String(chosen?.key || "")
    };
  };
  const verificationPattern = /请(?:先)?完成[^\\n]{0,20}(?:安全)?验证|安全验证|机器人验证|请证明[^\\n]{0,20}(?:不是|并非)机器人|拖动[^\\n]{0,20}滑块|滑块验证|点击[^\\n]{0,20}(?:完成|进行)验证|验证后继续|verify\\s*(?:you are|that you are)?\\s*human|are you (?:a )?robot|captcha|人机验证/ig;
  const verificationMatches = text.match(verificationPattern) || [];
  const verificationFrames = Array.from(document.querySelectorAll("iframe"))
    .filter(visible)
    .map(frame => [frame.src, frame.name, frame.id, frame.title, frame.className].join(" "))
    .filter(value => /captcha|verify|challenge|human|robot|secsdk|geetest|turnstile|recaptcha/i.test(value));
  const verificationNodes = Array.from(document.querySelectorAll('[id*="captcha" i],[class*="captcha" i],[id*="verify" i],[class*="verify" i],[id*="challenge" i],[class*="challenge" i]'))
    .filter(visible);
  const completedById = new Map();
  for (const node of Array.from(document.querySelectorAll("[data-message-id]"))) {
    const messageId = String(node.getAttribute("data-message-id") || "").trim();
    const nodeText = String(node.innerText || node.textContent || "").replace(/\\s+/g, " ").trim();
    if (!messageId || !/你的视频生成好了|视频(?:已经|已)生成(?:完成|好了)|视频生成完成/.test(nodeText)) continue;
    const video = node.querySelector("video");
    const dolaVideo = collectDolaVideo(node);
    const videoUrl = String(dolaVideo.videoUrl || video?.currentSrc || video?.src || "");
    const posterUrl = String(video?.poster || node.querySelector("img")?.currentSrc || node.querySelector("img")?.src || "");
    const vid = String(dolaVideo.vid || ([videoUrl]
      .join(" ")
      .match(/v[a-z0-9]{20,}/i) || [""])[0]);
    const mediaNodeIds = collectMediaNodeIds(node);
    completedById.set(messageId, {
      messageId,
      nodeId: String(
        node.getAttribute("data-node-id")
        || node.querySelector("[data-node-id]")?.getAttribute("data-node-id")
        || mediaNodeIds[0]
        || ""
      ),
      mediaNodeIds,
      vid: String(vid || ""),
      videoUrl,
      backupUrl: String(dolaVideo.backupUrl || ""),
      duration: Number(dolaVideo.duration || 0),
      confirmedNoWatermark: Boolean(dolaVideo.confirmedNoWatermark),
      urlSource: String(dolaVideo.urlSource || ""),
      posterUrl,
      title: nodeText.slice(0, 120)
    });
  }
  const outboundMessageIds = Array.from(document.querySelectorAll("[data-message-id]"))
    .filter(node => /(?:^|\\s)justify-end(?:\\s|$)/.test(String(node.className || "")))
    .map(node => String(node.getAttribute("data-message-id") || "").trim())
    .filter(Boolean);
  const loginButton = Array.from(document.querySelectorAll("button,[role=button],a"))
    .filter(visible)
    .find(node => String(node.innerText || node.textContent || "").replace(/\\s+/g, "") === "登录");
  const confirmationRequests = [];
  const confirmationPattern = /(?:确认后|确认一下|请确认|是否确认|确定后|回复[^\\n]{0,6}确认)[^\\n]{0,100}(?:生成|制作)|(?:生成|制作)[^\\n]{0,60}(?:是否确认|确认吗|请确认)/;
  for (const node of Array.from(document.querySelectorAll("[data-message-id]"))) {
    if (/(?:^|\\s)justify-end(?:\\s|$)/.test(String(node.className || ""))) continue;
    const messageId = String(node.getAttribute("data-message-id") || "").trim();
    const messageText = String(node.innerText || node.textContent || "").replace(/\\s+/g, " ").trim();
    if (!messageText || !confirmationPattern.test(messageText) || !/(?:视频|时长|秒|生成)/.test(messageText)) continue;
    const fingerprint = messageText.slice(0, 240);
    confirmationRequests.push({
      key: messageId || fingerprint,
      messageId,
      text: fingerprint
    });
  }
  return {
    quota: count(/额度不足|额度已用完|视频生成额度[^\\n]{0,30}(?:不足|用完)|本次视频生成需要消耗[^\\n]{0,80}今日剩余[^\\n]{0,60}无法生成(?:该)?视频|今日剩余\\s*\\d+\\s*个视频生成额度[^\\n]{0,60}无法生成(?:该)?视频|今日[^\\n]{0,30}(?:次数|额度)[^\\n]{0,30}(?:用完|上限)|已达[^\\n]{0,20}(?:上限|限制)|当前账号[^\\n]{0,20}无[^\\n]{0,10}额度/g),
    auth: (${browserAuthScore.toString()})({
      href: location.href,
      bodyText: text,
      hasLoginButton: Boolean(loginButton)
    }),
    generating: count(/正在[^\\n]{0,30}生成视频|正在为您生成视频|这就为您安排生成视频|本次使用[^\\n]{0,50}生成[^\\n]{0,30}(?:分钟|视频)|视频生成好后[^\\n]{0,20}主动发送|预计等待|视频生成中|消耗\\s*\\d+\\s*个视频生成额度|生成任务已提交/g),
    failed: count(/视频生成失败|生成视频失败|无法生成视频|请求失败|系统异常|系统错误|服务繁忙|系统繁忙|网络异常|请稍后重试|稍后再试/g),
    transientFailure: count(/系统异常|系统错误|服务繁忙|系统繁忙|网络异常|请稍后重试|稍后再试/g),
    verification: verificationMatches.length + verificationFrames.length + verificationNodes.length,
    verificationHint: String(verificationMatches[0] || verificationFrames[0] || "").slice(0, 160),
    completedMessages: Array.from(completedById.values()),
    outboundMessageIds: Array.from(new Set(outboundMessageIds)),
    confirmationRequests,
    hasEditor: Boolean(editor),
    href: location.href
  };
})()`;

async function waitForHumanVerification(client, task, account, submitted = false) {
  let signals = await client.evaluate(pageSignalsExpression, 7000);
  if (Number(signals?.verification || 0) <= 0) {
    return { detected: false, waitedMs: 0 };
  }

  const startedAt = Date.now();
  const timeoutMs = clampInt(task.request.verification_timeout, 600, 60, 1800) * 1000;
  const deadline = startedAt + timeoutMs;
  let clearSince = 0;
  log("检测到机器人验证，等待人工完成", {
    taskId: task.id,
    accountId: account.id,
    submitted,
    hint: signals?.verificationHint || ""
  });

  while (Date.now() < deadline) {
    updateTask(task, {
      stage: "等待人工验证",
      progress: submitted ? 27 : 12,
      message: `账号“${account.name}”出现机器人验证，请在 Dola 中手动完成；完成后任务会自动继续`
    });
    await sleep(1000);
    try {
      signals = await client.evaluate(pageSignalsExpression, 7000);
    } catch (error) {
      if (!/Execution context|Cannot find context|Inspected target navigated/i.test(safeMessage(error))) {
        throw error;
      }
      clearSince = 0;
      continue;
    }
    if (Number(signals?.verification || 0) > 0) {
      clearSince = 0;
      continue;
    }
    if (!clearSince) clearSince = Date.now();
    if (Date.now() - clearSince >= 2500) {
      log("人工验证已完成", { taskId: task.id, accountId: account.id, submitted });
      return { detected: true, waitedMs: Date.now() - startedAt };
    }
  }

  throw new AttemptError(
    "VERIFICATION_TIMEOUT",
    `账号“${account.name}”机器人验证等待超时，请在 Dola 中完成后重试`,
    !submitted
  );
}

async function resolveAndDownload(task, account, resource) {
  const id = String(account.id);
  const taskId = String(task.id);
  const phaseKey = `download_${taskId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const filename = `ZZDoubao_${String(taskId).replace(/[^a-zA-Z0-9_-]/g, "_")}.mp4`;
  if (!fs.existsSync(CREATION_RESOLVER_FILE)) {
    throw new Error(`缺少豆包创作原片解析脚本：${CREATION_RESOLVER_FILE}`);
  }
  const bundledCreationResolver = fs.readFileSync(CREATION_RESOLVER_FILE, "utf8");
  const resourcePayload = {
    messageId: String(resource.messageId || ""),
    nodeId: String(resource.nodeId || ""),
    nodeIds: Array.isArray(resource.nodeIds)
      ? resource.nodeIds.map(value => String(value || "")).filter(Boolean).slice(0, 20)
      : [],
    vid: String(resource.vid || ""),
    url: String(resource.url || ""),
    backupUrl: String(resource.backupUrl || ""),
    posterUrl: String(resource.posterUrl || resource.thumbUrl || ""),
    title: String(resource.title || ""),
    source: String(resource.source || "")
  };
  const strictPageResolver = `(async () => {
    const target = ${JSON.stringify(resourcePayload)};
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const isNumericId = value => /^\\d{8,}$/.test(String(value || ""));
    const unique = values => Array.from(new Set((values || []).map(value => String(value || "").trim()).filter(Boolean)));
    const getCoverKey = value => {
      try {
        const parsed = new URL(String(value || ""), location.href);
        return decodeURIComponent(String(parsed.pathname || ""))
          .replace(/~[^/]*$/, "")
          .toLowerCase();
      } catch (_) {
        return String(value || "").split("?")[0].replace(/~[^/]*$/, "").toLowerCase();
      }
    };
    const targetVids = new Set();
    for (const value of [target.vid, target.url, target.posterUrl]) {
      for (const match of String(value || "").match(/v[a-z0-9]{20,}/ig) || []) {
        targetVids.add(String(match).toLowerCase());
      }
    }
    const targetCoverKeys = new Set([getCoverKey(target.posterUrl)].filter(Boolean));

    const getApiUrl = apiPath => {
      const path = String(apiPath || "");
      try {
        const entries = performance.getEntriesByType?.("resource") || [];
        for (const entry of entries.slice().reverse()) {
          const url = String(entry.name || "");
          if (url.includes(path)) return url;
        }
        const samanthaEntry = entries.slice().reverse().find(entry => String(entry.name || "").includes("/samantha/"));
        if (samanthaEntry?.name) {
          const parsed = new URL(samanthaEntry.name);
          parsed.pathname = path;
          return parsed.href;
        }
      } catch (_) {}
      return path;
    };

    const postJson = async (apiPath, body) => {
      const response = await fetch(getApiUrl(apiPath), {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "agw-js-conv": "str",
          origin: location.origin,
          referer: location.href
        },
        credentials: "include",
        body: JSON.stringify(body || {})
      });
      const text = await response.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch (_) {
        throw new Error(apiPath + " 返回的不是 JSON（HTTP " + response.status + "）");
      }
      if (!response.ok || Number(json?.code || 0) !== 0) {
        throw new Error(String(json?.msg || json?.message || (apiPath + " 返回 " + (json?.code ?? response.status))));
      }
      return json;
    };

    const isAuthoritativeDownloadUrl = value => {
      const text = String(value || "");
      if (!text || /video_gen_watermark|watermark_dyn|with_watermark|aigc_busi_mark|aigc_resize_mark/i.test(text)) return false;
      try {
        const parsed = new URL(text);
        const host = parsed.hostname.toLowerCase();
        const trustedHost = host === "videoweb-download.doubao.com"
          || host.endsWith("-videoweb-download.doubao.com")
          || host.endsWith(".videoweb-download.doubao.com");
        const videoMime = String(parsed.searchParams.get("mime_type") || "").toLowerCase() === "video_mp4";
        return trustedHost && parsed.searchParams.get("download") === "true" && videoMime;
      } catch (_) {
        return false;
      }
    };

    const getDownloadInfo = async nodeId => {
      const id = String(nodeId || "");
      if (!isNumericId(id)) throw new Error("作品节点 ID 无效");
      const json = await postJson("/samantha/aispace/get_download_info", {
        requests: [{ node_id: id }]
      });
      const info = json?.data?.download_infos?.[0] || {};
      const mainUrl = String(info.main_url || info.mainUrl || "");
      const backupUrl = String(info.backup_url || info.backupUrl || "");
      if (!isAuthoritativeDownloadUrl(mainUrl)) {
        throw new Error("官方作品下载接口未返回可确认的 MP4 原片");
      }
      return {
        ok: true,
        url: mainUrl,
        backupUrl: isAuthoritativeDownloadUrl(backupUrl) ? backupUrl : "",
        nodeId: id,
        vid: String(info.vid || ""),
        messageId: target.messageId,
        source: "doubao_get_download_info",
        confirmedNoWatermark: true
      };
    };

    const collectNodeIds = value => {
      const out = [];
      const seen = new WeakSet();
      const walk = (item, depth = 0) => {
        if (typeof item === "string" && /^[\\s]*[\\[{]/.test(item)) {
          try { walk(JSON.parse(item), depth + 1); } catch (_) {}
          return;
        }
        if (!item || typeof item !== "object" || depth > 10 || seen.has(item)) return;
        seen.add(item);
        for (const [key, child] of Object.entries(item)) {
          const text = typeof child === "string" || typeof child === "number" ? String(child) : "";
          if (/node_?id/i.test(key) && isNumericId(text)) out.push(text);
          if (child && (typeof child === "object" || typeof child === "string")) walk(child, depth + 1);
        }
      };
      walk(value);
      return unique(out);
    };

    const collectCreationNodes = value => {
      const out = [];
      const seen = new WeakSet();
      const walk = (item, depth = 0) => {
        if (!item || typeof item !== "object" || depth > 10 || seen.has(item)) return;
        seen.add(item);
        const id = item.id != null ? String(item.id) : "";
        const key = item.key != null ? String(item.key) : "";
        const name = item.name != null ? String(item.name) : "";
        if (isNumericId(id) && (key || name || item.node_type != null || item.nodeType != null)) {
          const content = item.content || {};
          const cover = item.node_cover || item.nodeCover || {};
          const coverUrls = [
            cover?.list_view?.cover_url,
            cover?.listView?.coverUrl,
            cover?.thumbnail_view?.cover_url,
            cover?.thumbnailView?.coverUrl
          ].map(value => String(value || "")).filter(Boolean);
          out.push({
            id,
            key,
            name,
            nodeType: Number(item.node_type || item.nodeType || 0),
            messageId: String(content.message_id_str || content.message_id || ""),
            creationTaskId: String(content.creation_task_id_str || content.creation_task_id || ""),
            coverKeys: unique(coverUrls.map(getCoverKey).filter(Boolean))
          });
        }
        if (Array.isArray(item)) {
          item.forEach(child => walk(child, depth + 1));
          return;
        }
        for (const child of Object.values(item).slice(0, 180)) {
          if (child && typeof child === "object") walk(child, depth + 1);
        }
      };
      walk(value);
      const byId = new Map();
      for (const node of out) if (!byId.has(node.id)) byId.set(node.id, node);
      return Array.from(byId.values());
    };

    const findTargetNode = nodes => {
      const videos = (nodes || []).filter(node => node.nodeType === 6 || /^v[a-z0-9]+$/i.test(node.key) || /\\.mp4$/i.test(node.name));
      if (isNumericId(target.nodeId)) {
        const direct = videos.find(node => node.id === String(target.nodeId));
        if (direct) return direct;
      }
      if (targetVids.size) {
        const byVid = videos.find(node => targetVids.has(String(node.key || "").toLowerCase()));
        if (byVid) return byVid;
      }
      if (target.messageId) {
        const byMessage = videos.find(node => node.messageId === target.messageId || node.creationTaskId === target.messageId);
        if (byMessage) return byMessage;
      }
      if (targetCoverKeys.size) {
        const byCover = videos.find(node => (node.coverKeys || []).some(key => targetCoverKeys.has(key)));
        if (byCover) return byCover;
      }
      return null;
    };

    const fetchLatestNodes = async () => {
      const collected = [];
      for (const payload of [{ nodeType: 6, size: 50 }, { node_type: 6, size: 50 }]) {
        try {
          const json = await postJson("/samantha/aispace/node_lastest_used", payload);
          collected.push(...collectCreationNodes(json?.data || json));
          if (findTargetNode(collected)) break;
        } catch (_) {}
      }
      return collected;
    };

    const fetchCreationNodes = async () => {
      const home = await postJson("/samantha/aispace/homepage", {});
      const homeNodes = collectCreationNodes(home?.data || home);
      const root = homeNodes.find(node => String(node.name || "").includes("我的创作"))
        || homeNodes.find(node => node.nodeType === 1 && node.key === node.id)
        || homeNodes[0];
      if (!root?.id) return [];
      const nodes = [];
      let cursor = "";
      for (let page = 0; page < 8; page += 1) {
        const payload = {
          node_id: root.id,
          need_full_path: true,
          sort_param: { need_sort_config: true, sort_order: 1, sort_type: 0 },
          size: 50
        };
        if (cursor) {
          payload.cursor = cursor;
          payload.next_cursor_with_sort = cursor;
        }
        const json = await postJson("/samantha/aispace/node_info", payload);
        nodes.push(...collectCreationNodes(json?.data || json));
        if (findTargetNode(nodes)) break;
        const data = json?.data || {};
        cursor = String(data.next_cursor || data.nextCursor || "");
        if (!data.has_more || !cursor) break;
      }
      return nodes;
    };

    const resolverErrors = [];
    const directNodeIds = unique([
      ...(Array.isArray(target.nodeIds) ? target.nodeIds : []),
      target.nodeId
    ].filter(isNumericId));
    if (target.messageId && isNumericId(target.messageId)) {
      try {
        const json = await postJson("/samantha/aispace/message_node_info", {
          message_ids: [Number(target.messageId)],
          message_ids_str: [target.messageId]
        });
        directNodeIds.push(...collectNodeIds(json?.data || json));
      } catch (error) {
        resolverErrors.push("消息节点查询：" + String(error?.message || error));
      }
    }
    for (const nodeId of unique(directNodeIds)) {
      try {
        return await getDownloadInfo(nodeId);
      } catch (error) {
        resolverErrors.push("节点 " + nodeId + "：" + String(error?.message || error));
      }
    }

    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      try {
        if (typeof window.__AIAM_DOUBAO_CREATION_SCAN_DEBUG__ === "function") {
          const debug = await window.__AIAM_DOUBAO_CREATION_SCAN_DEBUG__();
          const debugNodes = Array.isArray(debug?.sampleNodes) ? debug.sampleNodes : [];
          const debugMatch = findTargetNode(debugNodes);
          if (debugMatch?.id) {
            const result = await getDownloadInfo(debugMatch.id);
            result.vid = String(debugMatch.key || result.vid || Array.from(targetVids)[0] || "");
            return result;
          }
          resolverErrors.push("Dola 创作扫描未匹配当前 vid（扫描 " + Number(debug?.videoNodes || 0) + " 个视频节点）");
        }
        const latestNodes = await fetchLatestNodes();
        let matched = findTargetNode(latestNodes);
        if (!matched) matched = findTargetNode(await fetchCreationNodes());
        if (matched?.id) {
          const result = await getDownloadInfo(matched.id);
          result.vid = String(matched.key || result.vid || Array.from(targetVids)[0] || "");
          return result;
        }
        resolverErrors.push("创作库暂未索引到当前视频");
      } catch (error) {
        resolverErrors.push(String(error?.message || error));
      }
      await delay(3000);
    }
    return {
      ok: false,
      error: "豆包创作库未找到与当前 vid/消息/封面匹配的作品节点；" + unique(resolverErrors).slice(-4).join("；")
    };
  })()`;

  const creationReadyExpression = `(() => {
    const text = String(document.body?.innerText || "");
    const videoCoverCount = Array.from(document.querySelectorAll("img,video,source")).filter(node => {
      const rect = node.getBoundingClientRect();
      const src = String(node.currentSrc || node.src || node.poster || node.srcset || "");
      return rect.width >= 80 && rect.height >= 80 && /tos-cn-p-9ecd54|tplv-noop|videoweb/i.test(src);
    }).length;
    return {
      correctPage: location.pathname.includes("/chat/create-image") && location.search.includes("tab=myCreation"),
      readyText: text.includes("我的创作") || text.includes("全部创作"),
      videoCoverCount
    };
  })()`;

  const expression = `(async () => {
    const accountId = ${JSON.stringify(id)};
    const tabs = Array.isArray(state.openTabs) ? state.openTabs : (Array.isArray(state.tabs) ? state.tabs : []);
    const tab = tabs.find(item => String(item.accountId) === accountId);
    if (!tab?.webview) throw new Error("下载时未找到账号页面");
    const originalUrl = String(tab.webview.getURL ? tab.webview.getURL() : "");
    const creationUrl = "https://www.doubao.com/chat/create-image?tab=myCreation";
    let navigatedToCreation = false;
    const waitForLoad = url => new Promise(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        tab.webview.removeEventListener?.("did-finish-load", finish);
        tab.webview.removeEventListener?.("dom-ready", finish);
        tab.webview.removeEventListener?.("did-fail-load", finish);
        setTimeout(resolve, 900);
      };
      const timer = setTimeout(finish, 20000);
      tab.webview.addEventListener?.("did-finish-load", finish, { once: true });
      tab.webview.addEventListener?.("dom-ready", finish, { once: true });
      tab.webview.addEventListener?.("did-fail-load", finish, { once: true });
      tab.webview.loadURL(url);
    });
    const waitForCreationReady = async () => {
      const deadline = Date.now() + 22000;
      while (Date.now() < deadline) {
        try {
          const pageState = await tab.webview.executeJavaScript(${JSON.stringify(creationReadyExpression)});
          if (pageState?.correctPage && pageState?.readyText) {
            return pageState;
          }
        } catch (_) {}
        await new Promise(resolve => setTimeout(resolve, 700));
      }
      throw new Error("豆包“我的创作”页面未就绪，无法安全匹配原片");
    };
    const isAuthoritativeDownloadUrl = value => {
      const text = String(value || "");
      if (!text || /video_gen_watermark|watermark_dyn|with_watermark|aigc_busi_mark|aigc_resize_mark/i.test(text)) return false;
      try {
        const parsed = new URL(text);
        const host = parsed.hostname.toLowerCase();
        const trustedHost = host === "videoweb-download.doubao.com"
          || host.endsWith("-videoweb-download.doubao.com")
          || host.endsWith(".videoweb-download.doubao.com");
        return trustedHost
          && parsed.searchParams.get("download") === "true"
          && String(parsed.searchParams.get("mime_type") || "").toLowerCase() === "video_mp4";
      } catch (_) {}
      return false;
    };
    try {
      navigatedToCreation = originalUrl !== creationUrl;
      await waitForLoad(creationUrl);
      await waitForCreationReady();
      const hasCreationResolver = await tab.webview.executeJavaScript("typeof window.__AIAM_DOUBAO_CREATION_SCAN_DEBUG__ === 'function'");
      if (!hasCreationResolver) {
        let creationCode = "";
        if (window.electronAPI?.getExtensionScripts) {
          const scripts = await window.electronAPI.getExtensionScripts();
          creationCode = String(scripts?.["doubao-creation-download"] || "");
        }
        if (!creationCode) creationCode = ${JSON.stringify(bundledCreationResolver)};
        if (!creationCode) throw new Error("Dola 缺少豆包创作下载解析脚本");
        creationCode = creationCode.replace(
          "sampleNodes: latestVideoNodes.slice(0, 5)",
          "sampleNodes: latestVideoNodes.slice(0, 10)"
        );
        await tab.webview.executeJavaScript(creationCode + ";void 0;");
      }
      const resolverReady = await tab.webview.executeJavaScript("typeof window.__AIAM_DOUBAO_CREATION_SCAN_DEBUG__ === 'function'");
      if (!resolverReady) throw new Error("Dola 豆包创作解析器未生效");
      const resolved = await tab.webview.executeJavaScript(${JSON.stringify(strictPageResolver)});
      if (!resolved?.ok) {
        throw new Error(String(resolved?.error || "豆包官方原片解析失败"));
      }
      if (
        resolved.source !== "doubao_get_download_info"
        || !resolved.confirmedNoWatermark
        || !isAuthoritativeDownloadUrl(resolved.url)
      ) {
        throw new Error("未拿到豆包 get_download_info 官方原片，已停止返回带水印视频");
      }
      if (navigatedToCreation && originalUrl) {
        await waitForLoad(originalUrl);
        navigatedToCreation = false;
      }
      window.__ZZ_DOUBAO_DOWNLOAD_PHASES__ = window.__ZZ_DOUBAO_DOWNLOAD_PHASES__ || {};
      window.__ZZ_DOUBAO_DOWNLOAD_PHASES__[${JSON.stringify(phaseKey)}] = {
        phase: "downloading",
        accountId,
        startedAt: Date.now()
      };
      const safeBackupUrl = isAuthoritativeDownloadUrl(resolved.backupUrl) ? resolved.backupUrl : "";
      let result;
      let usedManagerApi = false;
      if (window.electronAPI?.downloadResource) {
        result = await window.electronAPI.downloadResource({
          url: resolved.url,
          backupUrl: safeBackupUrl,
          accountId,
          filename: ${JSON.stringify(filename)},
          type: "video",
          source: "doubao_get_download_info",
          confirmedNoWatermark: true
        });
      } else if (window.managerAPI?.downloads?.resource) {
        usedManagerApi = true;
        result = await window.managerAPI.downloads.resource({
          url: resolved.url,
          backupUrl: safeBackupUrl,
          accountId,
          name: ${JSON.stringify(filename)},
          type: "video",
          source: "doubao_get_download_info",
          confirmedNoWatermark: true
        });
        if (!result?.ok && safeBackupUrl) {
          result = await window.managerAPI.downloads.resource({
            url: safeBackupUrl,
            accountId,
            name: ${JSON.stringify(filename)},
            type: "video",
            source: "doubao_get_download_info_backup",
            confirmedNoWatermark: true
          });
        }
      } else {
        throw new Error("豆包管理器没有可用的下载接口");
      }
      if (!result?.ok) throw new Error(result?.message || result?.reason || "Dola 下载视频失败");
      if (usedManagerApi && !result.confirmedNoWatermark) {
        throw new Error("豆包管理器未确认下载结果为官方无水印原片，已拒绝返回");
      }
      window.__ZZ_DOUBAO_DOWNLOAD_PHASES__[${JSON.stringify(phaseKey)}] = {
        phase: "completed",
        accountId,
        completedAt: Date.now()
      };
      return {
        ok: true,
        filePath: String(result.filePath || ""),
        videoUrl: String(resolved.url || ""),
        messageId: String(resolved.messageId || ${JSON.stringify(resourcePayload.messageId)}),
        nodeId: String(resolved.nodeId || ${JSON.stringify(resourcePayload.nodeId)}),
        vid: String(resolved.vid || ${JSON.stringify(resourcePayload.vid)}),
        resolverSource: "doubao_get_download_info",
        durationSeconds: Number(result.durationSeconds || 0),
        confirmedNoWatermark: true
      };
    } finally {
      if (navigatedToCreation && originalUrl) {
        tab.webview.loadURL(originalUrl);
      }
    }
  })()`;
  let downloadSettled = false;
  const downloadPromise = managerEval(expression, 22 * 60 * 1000)
    .finally(() => { downloadSettled = true; });
  downloadPromise.catch(() => {});
  const phaseDeadline = Date.now() + 3 * 60 * 1000;
  while (!downloadSettled && Date.now() < phaseDeadline) {
    let phase = "";
    try {
      phase = String(await managerEval(
        `String(window.__ZZ_DOUBAO_DOWNLOAD_PHASES__?.[${JSON.stringify(phaseKey)}]?.phase || "")`,
        6000
      ));
    } catch (_) {}
    if (phase === "downloading" || phase === "completed") {
      releaseAccountLease(task, account);
      updateTask(task, {
        stage: "下载视频",
        progress: 95,
        message: `账号“${account.name}”已释放给后续分镜，正在下载官方无水印原片`
      });
      log("原片地址已解析，下载期间提前释放账号", {
        taskId: task.id,
        accountId: account.id
      });
      break;
    }
    await sleep(1000);
  }
  const downloaded = await downloadPromise;
  const filePath = path.resolve(String(downloaded?.filePath || ""));
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("Dola 报告下载完成，但没有找到视频文件");
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size < 1024) {
    throw new Error("Dola 下载的视频文件为空或不完整");
  }
  const handle = fs.openSync(filePath, "r");
  const header = Buffer.alloc(16);
  try {
    fs.readSync(handle, header, 0, header.length, 0);
  } finally {
    fs.closeSync(handle);
  }
  if (header.subarray(4, 8).toString("ascii") !== "ftyp") {
    throw new Error("下载结果不是有效的 MP4 文件，已停止返回字字");
  }
  return {
    ...downloaded,
    filePath,
    fileSize: stat.size,
    durationSeconds: Number(downloaded?.durationSeconds || 0),
    confirmedNoWatermark: true
  };
}

async function resolveAndDownloadDola(task, account, resource) {
  const id = String(account.id);
  const taskId = String(task.id);
  const filename = `ZZDola_${taskId.replace(/[^a-zA-Z0-9_-]/g, "_")}.mp4`;
  const resourcePayload = {
    url: String(resource?.url || ""),
    name: String(resource?.title || filename),
    confirmedNoWatermark: Boolean(
      resource?.confirmedNoWatermark
      || /(?:[?&](?:lr|logo_type)=unwatermarked(?:&|$))|unwatermarked/i.test(String(resource?.url || ""))
    )
  };
  if (!/^https?:\/\//i.test(resourcePayload.url)) {
    throw new Error("Dola 成片已出现，但页面没有提供可下载的视频地址");
  }
  const expression = `(async () => {
    const accountId = ${JSON.stringify(id)};
    const url = ${JSON.stringify(resourcePayload.url)};
    const requestedName = ${JSON.stringify(filename)};
    const sourceConfirmedNoWatermark = ${Boolean(resourcePayload.confirmedNoWatermark)};
    if (!window.managerAPI?.downloads?.resource) {
      throw new Error("豆包管理器没有可用的 Dola 视频下载接口");
    }
    const downloaded = await window.managerAPI.downloads.resource({
      accountId,
      url,
      name: requestedName,
      type: "video",
      confirmedNoWatermark: sourceConfirmedNoWatermark,
      source: sourceConfirmedNoWatermark ? "dola-unwatermarked-source" : "dola-page-video"
    });
    if (!downloaded?.ok) throw new Error(downloaded?.message || "Dola 视频下载失败");
    let finalResult = downloaded;
    let watermarkMethod = sourceConfirmedNoWatermark ? "dola-unwatermarked-source" : "source-file";
    if (${Boolean(task.request.remove_watermark)} && !sourceConfirmedNoWatermark) {
      if (!window.managerAPI?.video?.removeWatermark) {
        throw new Error("豆包管理器没有本地去水印接口");
      }
      const processed = await window.managerAPI.video.removeWatermark({
        inputPath: downloaded.filePath,
        position: "bottom-right",
        widthPercent: 17,
        heightPercent: 10,
        autoSave: true
      });
      if (!processed?.ok) throw new Error(processed?.message || "Dola 视频本地去水印失败");
      finalResult = processed;
      watermarkMethod = "local-delogo";
    }
    return {
      ok: true,
      filePath: String(finalResult.filePath || finalResult.outputPath || ""),
      videoUrl: url,
      durationSeconds: Number(finalResult.durationSeconds || downloaded.durationSeconds || 0),
      confirmedNoWatermark: sourceConfirmedNoWatermark || ${Boolean(task.request.remove_watermark)},
      watermarkMethod
    };
  })()`;
  const downloaded = await managerEval(expression, 22 * 60 * 1000);
  const filePath = path.resolve(String(downloaded?.filePath || ""));
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("Dola 报告下载完成，但没有找到视频文件");
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size < 1024) {
    throw new Error("Dola 下载的视频文件为空或不完整");
  }
  const handle = fs.openSync(filePath, "r");
  const header = Buffer.alloc(16);
  try {
    fs.readSync(handle, header, 0, header.length, 0);
  } finally {
    fs.closeSync(handle);
  }
  if (header.subarray(4, 8).toString("ascii") !== "ftyp") {
    throw new Error("Dola 下载结果不是有效的 MP4 文件");
  }
  return {
    ...downloaded,
    filePath,
    fileSize: stat.size,
    durationSeconds: Number(downloaded?.durationSeconds || 0)
  };
}

class AttemptError extends Error {
  constructor(code, message, safeToRotate = false) {
    super(message);
    this.code = code;
    this.safeToRotate = safeToRotate;
  }
}

function updateTask(task, patch) {
  Object.assign(task, patch, { updatedAt: nowIso() });
}

function publicTask(task) {
  return {
    id: task.id,
    status: task.status,
    stage: task.stage,
    progress: task.progress,
    message: task.message,
    account: task.account,
    attempts: task.attempts,
    result: task.result,
    error: task.error,
    created_at: task.createdAt,
    updated_at: task.updatedAt
  };
}

async function prepareTaskDraft(client, task, account) {
  const targetName = platformName(task.request.target_platform);
  for (let restart = 0; restart < 3; restart += 1) {
    try {
      await waitForHumanVerification(client, task, account, false);
      await traceDolaStage(client, task, account, "准备会话前");
      await startFreshConversation(client, task.request.target_platform);
      await traceDolaStage(client, task, account, "新对话检查后");
      await ensureVideoComposer(client, task.request.target_platform);
      await traceDolaStage(client, task, account, "进入视频生成后");
      const modelApplied = await configureModel(client, task.request.model, task.request.target_platform);
      const durationApplied = await configureDuration(client, task.request.duration, task.request.target_platform);
      task.pageControls = { modelApplied, durationApplied };
      await traceDolaStage(client, task, account, "模型时长设置后");

      if (task.request.image_paths.length) {
        updateTask(task, {
          stage: "上传参考图",
          progress: 15,
          message: `正在向${targetName}按顺序上传 ${task.request.image_paths.length} 张参考图`
        });
        await uploadReferenceImages(client, task.request.image_paths);
        const verification = await waitForHumanVerification(client, task, account, false);
        if (verification.detected) continue;
      }

      updateTask(task, { stage: "填写提示词", progress: 20, message: `正在填写${targetName}视频提示词与模型/时长参数` });
      await fillPrompt(
        client,
        promptWithSettings(task.request.prompt, task.request),
        task.request.target_platform
      );
      await traceDolaStage(client, task, account, "填写提示词后");
      const verification = await waitForHumanVerification(client, task, account, false);
      if (verification.detected) continue;
      return;
    } catch (error) {
      if (error?.code === "VERIFICATION_TIMEOUT") throw error;
      if (task.request.target_platform === "dola" && error?.code !== "AUTH_REQUIRED") {
        try {
          await traceDolaStage(client, task, account, `失败现场：${task.stage || "准备任务"}`);
        } catch (authError) {
          if (authError?.code === "AUTH_REQUIRED") throw authError;
        }
      }
      const uploadFailed = /参考图|上传控件|上传失败|未在规定时间内完成上传|ATTACHMENTS_NOT_READY/i.test(
        safeMessage(error)
      );
      let verification;
      try {
        verification = await waitForHumanVerification(client, task, account, false);
      } catch (verificationError) {
        throw verificationError;
      }
      if (shouldRetryUpload({
        restart,
        uploadFailed,
        verificationDetected: Boolean(verification.detected)
      })) {
        updateTask(task, {
          stage: "上传重试",
          progress: 14,
          message: `账号“${account.name}”参考图上传失败，正在重建会话并重试（${restart + 1}/2）`
        });
        log("参考图上传失败，重建会话重试", {
          taskId: task.id,
          accountId: account.id,
          retry: restart + 1,
          error: safeMessage(error)
        });
        await sleep(1000);
        continue;
      }
      if (!verification.detected) throw error;
    }
  }
  throw new AttemptError(
    "VERIFICATION_REPEATED",
    `账号“${account.name}”反复出现机器人验证，请在 Dola 中完成后重新提交`,
    true
  );
}

async function runAttempt(task, account) {
  let submitted = false;
  updateTask(task, {
    stage: "打开账号",
    progress: 8,
    message: `正在打开账号：${account.name}`,
    account: { id: account.id, name: account.name, platform: task.request.target_platform }
  });
  await openAccount(account.id, task.request.target_platform);
  const managerWebview = await getMarkedWebview(account.id, task.request.target_platform);
  let client = managerWebview.client;
  if (task.request.target_platform === "dola") {
    updateTask(task, {
      stage: "启动 Edge",
      progress: 10,
      message: `正在将 Dola 账号“${account.name}”切换到 Microsoft Edge 生成环境`
    });
    try {
      const edge = await synchronizeDolaSessionToEdge(account.id, managerWebview.client);
      managerWebview.client.close();
      client = edge.client;
    } catch (error) {
      managerWebview.client.close();
      if (error instanceof AttemptError) throw error;
      throw new AttemptError(
        "DOLA_EDGE_UNAVAILABLE",
        `Dola Microsoft Edge 生成环境启动失败：${safeMessage(error)}`,
        false
      );
    }
  }
  const stopNetworkTraces = [];
  let dolaSubmitTraceStartedAt = 0;
  let lastCompletionFailure = null;
  let lastCompletionFailureAt = 0;
  let blockedTransientLogout = false;
  if (task.request.target_platform === "dola") {
    const requestTrace = new Map();
    const webSocketTrace = new Map();
    const webSocketFrameCounts = { sent: 0, received: 0 };
    let lastCompletionRequestId = "";
    const rememberCompletionFailure = (raw) => {
      const failure = parseDolaCompletionFailure(raw);
      if (!failure) return null;
      lastCompletionFailure = failure;
      lastCompletionFailureAt = Date.now();
      return failure;
    };
    const captureCompletionResponse = (requestId, label) => {
      const trace = requestTrace.get(requestId) || {};
      void client.call("Network.getResponseBody", { requestId }, 5000)
        .then((result) => {
          const raw = result?.base64Encoded
            ? Buffer.from(String(result.body || ""), "base64").toString("utf8")
            : String(result?.body || "");
          const failure = rememberCompletionFailure(raw);
          log(label, {
            taskId: task.id,
            accountId: account.id,
            stage: task.stage,
            requestId,
            method: trace.method || "",
            status: Number(trace.status || 0),
            url: trace.url || "",
            summary: summarizeNetworkBody(raw),
            structure: summarizeNetworkShape(raw),
            eventStream: summarizeEventStream(raw),
            failure
          });
        })
        .catch((error) => {
          log(`${label}读取失败`, {
            taskId: task.id,
            accountId: account.id,
            stage: task.stage,
            requestId,
            url: trace.url || "",
            error: safeMessage(error)
          });
        });
    };
    stopNetworkTraces.push(client.on("Network.requestWillBeSent", (event) => {
      const requestId = String(event?.requestId || "");
      if (!requestId) return;
      const requestUrl = String(event?.request?.url || "");
      const safeUrl = safeNetworkUrl(requestUrl);
      const postData = String(event?.request?.postData || "");
      const isMcsList = /mcs-sg\.ciciai\.com\/list$/i.test(safeUrl);
      const isCompletion = /\/chat\/completion$/i.test(safeUrl);
      const isLogout = /\/passport\/web\/logout\/$/i.test(safeUrl);
      requestTrace.set(requestId, {
        method: String(event?.request?.method || ""),
        type: String(event?.type || ""),
        url: safeUrl,
        stage: String(task.stage || ""),
        postDataLength: postData.length,
        postDataShape: (isMcsList || isCompletion) && postData
          ? summarizeNetworkShape(postData)
          : null
      });
      if (isCompletion) {
        lastCompletionRequestId = requestId;
        log("Dola completion 提交请求结构", {
          taskId: task.id,
          accountId: account.id,
          stage: task.stage,
          requestId,
          method: String(event?.request?.method || ""),
          url: safeUrl,
          postDataLength: postData.length,
          postDataShape: postData ? summarizeNetworkShape(postData) : null
        });
      }
      if (isLogout) {
        log("Dola 页面主动请求注销", {
          taskId: task.id,
          accountId: account.id,
          stage: task.stage,
          requestId,
          url: safeUrl,
          completionRequestId: lastCompletionRequestId
        });
        if (lastCompletionRequestId) {
          captureCompletionResponse(lastCompletionRequestId, "Dola 注销前 completion 响应摘要");
        }
      }
      if (
        isMcsList
        && dolaSubmitTraceStartedAt
        && Date.now() - dolaSubmitTraceStartedAt <= 60000
      ) {
        log("Dola MCS 提交请求结构", {
          taskId: task.id,
          accountId: account.id,
          stage: task.stage,
          method: String(event?.request?.method || ""),
          url: safeUrl,
          postDataLength: postData.length,
          postDataShape: postData ? summarizeNetworkShape(postData) : null
        });
      }
      if (requestTrace.size > 200) {
        requestTrace.delete(requestTrace.keys().next().value);
      }
    }));
    stopNetworkTraces.push(client.on("Network.responseReceived", (event) => {
      const status = Number(event?.response?.status || 0);
      const responseUrl = String(event?.response?.url || "");
      const requestId = String(event?.requestId || "");
      const previous = requestTrace.get(requestId) || {};
      const type = String(event?.type || previous.type || "");
      const shouldTrace = ["Fetch", "XHR"].includes(type)
        || /[?&]from_logout=1(?:[&#]|$)/.test(responseUrl)
        || [401, 403, 429].includes(status);
      if (!shouldTrace) return;
      requestTrace.set(requestId, {
        ...previous,
        method: previous.method || "",
        type,
        url: safeNetworkUrl(responseUrl),
        status,
        mimeType: String(event?.response?.mimeType || "")
      });
      log("Dola 提交网络响应", {
        taskId: task.id,
        accountId: account.id,
        stage: task.stage,
        method: previous.method || "",
        status,
        type,
        url: safeNetworkUrl(responseUrl),
        mimeType: String(event?.response?.mimeType || ""),
        fromLogout: /[?&]from_logout=1(?:[&#]|$)/.test(responseUrl)
      });
    }));
    stopNetworkTraces.push(client.on("Network.loadingFinished", (event) => {
      const requestId = String(event?.requestId || "");
      const trace = requestTrace.get(requestId);
      if (!trace || !["Fetch", "XHR"].includes(String(trace.type || ""))) return;
      void client.call("Network.getResponseBody", { requestId }, 5000)
        .then((result) => {
          const raw = result?.base64Encoded
            ? Buffer.from(String(result.body || ""), "base64").toString("utf8")
            : String(result?.body || "");
          const summary = summarizeNetworkBody(raw);
          const isMcsList = /mcs-sg\.ciciai\.com\/list$/i.test(String(trace.url || ""));
          const isCompletion = /\/chat\/completion$/i.test(String(trace.url || ""));
          const structure = (isMcsList || isCompletion)
            ? summarizeNetworkShape(raw)
            : null;
          const eventStream = isCompletion ? summarizeEventStream(raw) : null;
          const failure = isCompletion ? rememberCompletionFailure(raw) : null;
          if (!summary && !structure && !eventStream) return;
          log("Dola 提交响应摘要", {
            taskId: task.id,
            accountId: account.id,
            stage: trace.stage || task.stage,
            method: trace.method || "",
            status: Number(trace.status || 0),
            type: trace.type || "",
            url: trace.url || "",
            summary,
            structure,
            eventStream,
            failure
          });
        })
        .catch(() => {});
    }));
    stopNetworkTraces.push(client.on("Network.loadingFailed", (event) => {
      const requestId = String(event?.requestId || "");
      const trace = requestTrace.get(requestId) || {};
      if (
        !dolaSubmitTraceStartedAt
        || Date.now() - dolaSubmitTraceStartedAt > 60000
      ) return;
      log("Dola 提交网络加载失败", {
        taskId: task.id,
        accountId: account.id,
        stage: task.stage,
        method: trace.method || "",
        type: String(event?.type || trace.type || ""),
        url: trace.url || "",
        errorText: String(event?.errorText || "").slice(0, 300),
        canceled: Boolean(event?.canceled),
        blockedReason: String(event?.blockedReason || "").slice(0, 100)
      });
    }));
    stopNetworkTraces.push(client.on("Network.webSocketCreated", (event) => {
      const requestId = String(event?.requestId || "");
      if (!requestId) return;
      webSocketTrace.set(requestId, { url: safeNetworkUrl(event?.url || "") });
      log("Dola WebSocket 已创建", {
        taskId: task.id,
        accountId: account.id,
        requestId,
        url: safeNetworkUrl(event?.url || "")
      });
    }));
    stopNetworkTraces.push(client.on("Network.webSocketWillSendHandshakeRequest", (event) => {
      const requestId = String(event?.requestId || "");
      const trace = webSocketTrace.get(requestId) || {};
      log("Dola WebSocket 握手请求", {
        taskId: task.id,
        accountId: account.id,
        requestId,
        url: trace.url || "",
        headerNames: Object.keys(event?.request?.headers || {}).slice(0, 30)
      });
    }));
    stopNetworkTraces.push(client.on("Network.webSocketHandshakeResponseReceived", (event) => {
      const requestId = String(event?.requestId || "");
      const trace = webSocketTrace.get(requestId) || {};
      log("Dola WebSocket 握手响应", {
        taskId: task.id,
        accountId: account.id,
        requestId,
        url: trace.url || "",
        status: Number(event?.response?.status || 0),
        statusText: String(event?.response?.statusText || "").slice(0, 120)
      });
    }));
    const traceWebSocketFrame = (direction, event) => {
      if (
        !dolaSubmitTraceStartedAt
        || Date.now() - dolaSubmitTraceStartedAt > 60000
      ) return;
      webSocketFrameCounts[direction] += 1;
      const summary = summarizeWebSocketFrame(event?.response || {});
      const isImportant = Boolean(summary.body || summary.shape?.authSignal);
      if (webSocketFrameCounts[direction] > 40 && !isImportant) return;
      const requestId = String(event?.requestId || "");
      const trace = webSocketTrace.get(requestId) || {};
      log(`Dola WebSocket 帧${direction === "sent" ? "发送" : "接收"}摘要`, {
        taskId: task.id,
        accountId: account.id,
        stage: task.stage,
        requestId,
        url: trace.url || "",
        index: webSocketFrameCounts[direction],
        summary
      });
    };
    stopNetworkTraces.push(client.on("Network.webSocketFrameSent", (event) => {
      traceWebSocketFrame("sent", event);
    }));
    stopNetworkTraces.push(client.on("Network.webSocketFrameReceived", (event) => {
      traceWebSocketFrame("received", event);
    }));
    stopNetworkTraces.push(client.on("Network.webSocketFrameError", (event) => {
      log("Dola WebSocket 帧错误", {
        taskId: task.id,
        accountId: account.id,
        stage: task.stage,
        requestId: String(event?.requestId || ""),
        errorMessage: String(event?.errorMessage || "").slice(0, 300)
      });
    }));
    stopNetworkTraces.push(client.on("Network.webSocketClosed", (event) => {
      const requestId = String(event?.requestId || "");
      const trace = webSocketTrace.get(requestId) || {};
      log("Dola WebSocket 已关闭", {
        taskId: task.id,
        accountId: account.id,
        stage: task.stage,
        requestId,
        url: trace.url || "",
        timestamp: Number(event?.timestamp || 0)
      });
    }));
    stopNetworkTraces.push(client.on("Fetch.requestPaused", (event) => {
      const requestId = String(event?.requestId || "");
      const requestUrl = safeNetworkUrl(event?.request?.url || "");
      const blockLogout = /\/passport\/web\/logout\/$/i.test(requestUrl)
        && isDolaServiceBusyFailure(lastCompletionFailure)
        && Date.now() - lastCompletionFailureAt <= 15000;
      if (blockLogout) {
        blockedTransientLogout = true;
        log("Dola 服务繁忙误触发注销，已保护登录会话", {
          taskId: task.id,
          accountId: account.id,
          stage: task.stage,
          requestId,
          url: requestUrl,
          completionFailure: lastCompletionFailure
        });
        void client.call("Fetch.failRequest", {
          requestId,
          errorReason: "BlockedByClient"
        }, 5000).catch(() => {});
        return;
      }
      void client.call("Fetch.continueRequest", { requestId }, 5000).catch(() => {});
    }));
    try {
      await client.call("Network.enable", {}, 5000);
    } catch (_) {}
    try {
      await client.call("Fetch.enable", {
        patterns: [{
          urlPattern: "*://www.dola.com/passport/web/logout/*",
          requestStage: "Request"
        }]
      }, 5000);
    } catch (_) {}
  }
  try {
    if (task.request.target_platform === "dola") {
      await installDolaLogoutGuard(client, task, account);
    }
    await traceDolaStage(client, task, account, "打开账号后");
    await prepareTaskDraft(client, task, account);

    let beforeResources = await getAccountResources(account.id);
    let beforeKeys = new Set(beforeResources.map(resourceKey));
    let beforeSignals = await client.evaluate(pageSignalsExpression);
    let beforeCompletionIds = new Set(
      (Array.isArray(beforeSignals?.completedMessages) ? beforeSignals.completedMessages : [])
        .map(item => String(item?.messageId || ""))
        .filter(Boolean)
    );
    let beforeOutboundIds = new Set(
      (Array.isArray(beforeSignals?.outboundMessageIds) ? beforeSignals.outboundMessageIds : [])
        .map(value => String(value || ""))
        .filter(Boolean)
    );
    let beforeConfirmationKeys = new Set(
      (Array.isArray(beforeSignals?.confirmationRequests) ? beforeSignals.confirmationRequests : [])
        .map(item => String(item?.key || ""))
        .filter(Boolean)
    );
    if (Number(beforeSignals?.quota || 0) > 0) {
      throw new AttemptError("QUOTA_EXHAUSTED", `账号“${account.name}”视频额度不足`, true);
    }
    if (Number(beforeSignals?.auth || 0) > 0) {
      throw new AttemptError(
        "AUTH_REQUIRED",
        `账号“${account.name}”登录已失效`,
        true
      );
    }

    if (task.request.dry_run) {
      const diagnostics = await client.evaluate(`(async () => {
        const editor = document.querySelector('[contenteditable="true"][role="textbox"],textarea[placeholder*="消息"],textarea');
        const file = document.querySelector('input[type="file"]');
        const previews = Array.from(document.querySelectorAll('[class*="content-wrapper"] img[alt="image"]'));
        const attachmentDetails = await Promise.all(previews.map(async (node, index) => {
          try {
            const blob = await fetch(String(node.currentSrc || node.src || "")).then(response => response.blob());
            return { index, size: blob.size, type: blob.type };
          } catch (_) {
            return { index, size: 0, type: "" };
          }
        }));
        return {
          editorText: String(editor?.editor?.getText?.() || editor?.value || editor?.innerText || "").trim(),
          requestedModel: ${JSON.stringify(task.request.model)},
          requestedDuration: ${JSON.stringify(task.request.duration)},
          targetPlatform: ${JSON.stringify(task.request.target_platform)},
          removeWatermark: ${Boolean(task.request.remove_watermark)},
          pageControls: ${JSON.stringify(task.pageControls || {})},
          actionBarControls: Array.from(document.querySelectorAll('[data-input-engine-actionbar-control-key]'))
            .map(node => ({
              key: String(node.getAttribute('data-input-engine-actionbar-control-key') || ''),
              text: String(node.innerText || node.textContent || '').replace(/\\s+/g, ' ').trim()
            })),
          fileCount: Number(file?.files?.length || 0),
          fileMultiple: Boolean(file?.multiple),
          attachmentCount: previews.length,
          attachmentSources: previews.map(node => String(node.currentSrc || node.src || "")),
          attachmentDetails,
          href: location.href
        };
      })()`);
      await clearPrompt(client);
      if (task.request.image_paths.length) {
        await startFreshConversation(client, task.request.target_platform);
      }
      return { dryRun: true, diagnostics };
    }

    const preSubmitVerification = await waitForHumanVerification(client, task, account, false);
    if (preSubmitVerification.detected) {
      await prepareTaskDraft(client, task, account);
      beforeResources = await getAccountResources(account.id);
      beforeKeys = new Set(beforeResources.map(resourceKey));
      beforeSignals = await client.evaluate(pageSignalsExpression);
      beforeCompletionIds = new Set(
        (Array.isArray(beforeSignals?.completedMessages) ? beforeSignals.completedMessages : [])
          .map(item => String(item?.messageId || ""))
          .filter(Boolean)
      );
      beforeOutboundIds = new Set(
        (Array.isArray(beforeSignals?.outboundMessageIds) ? beforeSignals.outboundMessageIds : [])
          .map(value => String(value || ""))
          .filter(Boolean)
      );
      beforeConfirmationKeys = new Set(
        (Array.isArray(beforeSignals?.confirmationRequests) ? beforeSignals.confirmationRequests : [])
          .map(item => String(item?.key || ""))
          .filter(Boolean)
      );
    }

    updateTask(task, { stage: "提交生成", progress: 25, message: `正在用账号“${account.name}”提交视频` });
    if (task.request.image_paths.length) {
      const attachmentState = await client.evaluate(attachmentStateExpression, 7000);
      if (
        Number(attachmentState?.attachmentCount || 0) !== task.request.image_paths.length
        || attachmentState?.uploading
        || attachmentState?.failed
      ) {
        throw new AttemptError(
          "ATTACHMENTS_NOT_READY",
          `参考图未全部就绪（需要 ${task.request.image_paths.length} 张，页面已有 ${Number(attachmentState?.attachmentCount || 0)} 张）`,
          true
        );
      }
    }
    await traceDolaStage(client, task, account, "提交请求前");
    if (task.request.target_platform === "dola") {
      await installDolaLogoutGuard(client, task, account);
    }
    dolaSubmitTraceStartedAt = Date.now();
    await clickSubmit(client, task.request.target_platform);
    submitted = true;
    await traceDolaStage(client, task, account, "点击提交后");
    let submittedAt = Date.now();

    const timeoutMs = clampInt(task.request.timeout, 1200, 60, 3600) * 1000;
    let deadline = Date.now() + timeoutMs;
    let accepted = false;
    let verificationResubmits = 0;
    let transientFailureRetries = 0;
    const autoConfirmedKeys = new Set();

    while (Date.now() < deadline) {
      await sleep(2500);
      const [resources, signals] = await Promise.all([
        getAccountResources(account.id),
        client.evaluate(pageSignalsExpression)
      ]);
      if (lastCompletionFailure) {
        const failure = lastCompletionFailure;
        if (isDolaServiceBusyFailure(failure)) {
          try {
            await sleep(350);
            let restored = await getDolaAuthSnapshot(client);
            if (Number(restored?.authScore || 0) > 0 && blockedTransientLogout) {
              await client.call("Page.navigate", { url: "https://www.dola.com/chat/" }, 7000);
              await sleep(1200);
              restored = await getDolaAuthSnapshot(client);
            }
            const guardState = await client.evaluate(`(() => ({
              blockedFetch: Number(window.__ZZ_DOLA_LOGOUT_GUARD__?.blockedFetch || 0),
              blockedXhr: Number(window.__ZZ_DOLA_LOGOUT_GUARD__?.blockedXhr || 0)
            }))()`, 5000).catch(() => null);
            log("Dola 服务繁忙后登录会话保护结果", {
              taskId: task.id,
              accountId: account.id,
              authScore: restored.authScore,
              href: restored.href,
              hasEditor: restored.hasEditor,
              hasLoginButton: restored.hasLoginButton,
              blockedTransientLogout,
              guardState
            });
          } catch (error) {
            log("Dola 服务繁忙后恢复页面失败", {
              taskId: task.id,
              accountId: account.id,
              error: safeMessage(error)
            });
          }
        }
        throw new AttemptError(
          isDolaServiceBusyFailure(failure) ? "DOLA_SERVICE_BUSY" : "DOLA_COMPLETION_ERROR",
          `账号“${account.name}”${failure.message || "Dola 生成接口返回错误"}`,
          true
        );
      }
      if (Number(signals?.verification || 0) > 0) {
        const verification = await waitForHumanVerification(client, task, account, true);
        deadline += verification.waitedMs;
        await sleep(3000);
        const afterVerification = await client.evaluate(pageSignalsExpression, 7000);
        const hasNewOutboundMessage = (Array.isArray(afterVerification?.outboundMessageIds) ? afterVerification.outboundMessageIds : [])
          .some(value => value && !beforeOutboundIds.has(String(value)));
        const hasAcceptedSignal = Number(afterVerification?.generating || 0) > Number(beforeSignals?.generating || 0);
        const hasCompletedSignal = (Array.isArray(afterVerification?.completedMessages) ? afterVerification.completedMessages : [])
          .some(item => item?.messageId && !beforeCompletionIds.has(String(item.messageId)));
        const stillLocalConversation = /\/chat(?:\/local_[^/?#]+)?\/?(?:[?#].*)?$/.test(String(afterVerification?.href || ""));
        if (shouldResubmitAfterVerification({
          hasNewOutboundMessage,
          hasAcceptedSignal,
          hasCompletedSignal,
          stillLocalConversation,
          resubmitCount: verificationResubmits
        })) {
          verificationResubmits += 1;
          submitted = false;
          updateTask(task, {
            stage: "验证后重新提交",
            progress: 22,
            message: `账号“${account.name}”验证已完成，首次请求未进入会话，正在安全重提一次`
          });
          await prepareTaskDraft(client, task, account);
          beforeResources = await getAccountResources(account.id);
          beforeKeys = new Set(beforeResources.map(resourceKey));
          beforeSignals = await client.evaluate(pageSignalsExpression);
          beforeCompletionIds = new Set(
            (Array.isArray(beforeSignals?.completedMessages) ? beforeSignals.completedMessages : [])
              .map(item => String(item?.messageId || ""))
              .filter(Boolean)
          );
          beforeOutboundIds = new Set(
            (Array.isArray(beforeSignals?.outboundMessageIds) ? beforeSignals.outboundMessageIds : [])
              .map(value => String(value || ""))
              .filter(Boolean)
          );
          beforeConfirmationKeys = new Set(
            (Array.isArray(beforeSignals?.confirmationRequests) ? beforeSignals.confirmationRequests : [])
              .map(item => String(item?.key || ""))
              .filter(Boolean)
          );
          await clickSubmit(client, task.request.target_platform);
          submitted = true;
          submittedAt = Date.now();
          accepted = false;
          deadline = Date.now() + timeoutMs;
          continue;
        }
        accepted = hasNewOutboundMessage || hasAcceptedSignal || hasCompletedSignal || accepted;
        continue;
      }
      const freshCompletion = (Array.isArray(signals?.completedMessages) ? signals.completedMessages : [])
        .find(item => item?.messageId && !beforeCompletionIds.has(String(item.messageId)));
      const freshResource = resources.find((resource) => {
        const key = resourceKey(resource);
        return key && !beforeKeys.has(key);
      });
      const fresh = freshCompletion ? {
        messageId: String(freshCompletion.messageId || ""),
        nodeId: String(freshCompletion.nodeId || ""),
        nodeIds: Array.isArray(freshCompletion.mediaNodeIds)
          ? freshCompletion.mediaNodeIds.map(value => String(value || "")).filter(Boolean)
          : [],
        vid: String(freshCompletion.vid || ""),
        url: String(freshCompletion.videoUrl || ""),
        backupUrl: String(freshCompletion.backupUrl || ""),
        posterUrl: String(freshCompletion.posterUrl || ""),
        title: String(freshCompletion.title || ""),
        source: "zz-dom-completion",
        confirmedNoWatermark: Boolean(freshCompletion.confirmedNoWatermark)
      } : freshResource;
      if (fresh) {
        const isDolaTask = task.request.target_platform === "dola";
        updateTask(task, {
          stage: "下载视频",
          progress: 92,
          message: isDolaTask
            ? `Dola 账号“${account.name}”已生成，正在下载${task.request.remove_watermark ? "并本地去水印" : "成片"}`
            : `豆包账号“${account.name}”已生成，正在解析官方无水印视频`
        });
        let downloaded = null;
        let downloadError = null;
        for (let downloadAttempt = 1; downloadAttempt <= 2; downloadAttempt += 1) {
          try {
            downloaded = isDolaTask
              ? await resolveAndDownloadDola(task, account, fresh)
              : await resolveAndDownload(task, account, fresh);
            break;
          } catch (error) {
            downloadError = error;
            if (downloadAttempt >= 2) break;
            updateTask(task, {
              stage: "下载重试",
              progress: 94,
              message: isDolaTask
                ? `Dola 账号“${account.name}”首次下载/去水印失败，正在重试`
                : `豆包账号“${account.name}”首次下载失败，正在重试官方无水印原片`
            });
            await sleep(1800);
          }
        }
        if (!downloaded) {
          throw downloadError || new Error(isDolaTask ? "Dola 成片下载/去水印失败" : "官方无水印原片下载失败");
        }
        return { account, resource: fresh, downloaded };
      }

      if (Number(signals?.quota || 0) > Number(beforeSignals?.quota || 0)) {
        throw new AttemptError("QUOTA_EXHAUSTED", `账号“${account.name}”视频额度不足`, true);
      }
      if (Number(signals?.auth || 0) > Number(beforeSignals?.auth || 0)) {
        await traceDolaStage(client, task, account, accepted ? "生成等待中" : "等待接单中", {
          throwOnAuth: false
        });
        throw new AttemptError(
          "AUTH_REQUIRED",
          `账号“${account.name}”登录已失效`,
          true
        );
      }
      const pendingConfirmation = (Array.isArray(signals?.confirmationRequests) ? signals.confirmationRequests : [])
        .find(item => {
          const key = String(item?.key || "");
          return key && !beforeConfirmationKeys.has(key) && !autoConfirmedKeys.has(key);
        });
      if (pendingConfirmation) {
        const confirmationKey = String(pendingConfirmation.key);
        if (autoConfirmedKeys.size >= 2) {
          throw new AttemptError(
            "CONFIRMATION_REPEATED",
            `账号“${account.name}”连续要求重复确认，已停止并换号`,
            true
          );
        }
        autoConfirmedKeys.add(confirmationKey);
        accepted = true;
        updateTask(task, {
          stage: "自动确认",
          progress: 30,
          message: `账号“${account.name}”要求确认生成，正在自动回复“确认”`
        });
        log("自动回复豆包生成确认", {
          taskId: task.id,
          accountId: account.id,
          confirmationKey,
          text: String(pendingConfirmation.text || "").slice(0, 160)
        });
        try {
          await fillPrompt(client, "确认", task.request.target_platform);
          await clickSubmit(client, task.request.target_platform);
        } catch (error) {
          throw new AttemptError(
            "CONFIRM_SEND_FAILED",
            `账号“${account.name}”自动发送确认失败：${safeMessage(error)}`,
            true
          );
        }
        await sleep(1200);
        continue;
      }
      if (Number(signals?.generating || 0) > Number(beforeSignals?.generating || 0)) {
        accepted = true;
      }
      const transientFailureIncreased =
        Number(signals?.transientFailure || 0) > Number(beforeSignals?.transientFailure || 0);
      if (shouldRetryTransientDolaFailure({
        targetPlatform: task.request.target_platform,
        transientFailureIncreased,
        retryCount: transientFailureRetries
      })) {
        transientFailureRetries += 1;
        updateTask(task, {
          stage: "系统异常重试",
          progress: 24,
          message: `账号“${account.name}”返回系统异常，正在新对话安全重试一次`
        });
        log("Dola 系统异常，同账号新对话安全重试", {
          taskId: task.id,
          accountId: account.id,
          retry: transientFailureRetries
        });
        await prepareTaskDraft(client, task, account);
        beforeResources = await getAccountResources(account.id);
        beforeKeys = new Set(beforeResources.map(resourceKey));
        beforeSignals = await client.evaluate(pageSignalsExpression);
        beforeCompletionIds = new Set(
          (Array.isArray(beforeSignals?.completedMessages) ? beforeSignals.completedMessages : [])
            .map(item => String(item?.messageId || ""))
            .filter(Boolean)
        );
        beforeOutboundIds = new Set(
          (Array.isArray(beforeSignals?.outboundMessageIds) ? beforeSignals.outboundMessageIds : [])
            .map(value => String(value || ""))
            .filter(Boolean)
        );
        beforeConfirmationKeys = new Set(
          (Array.isArray(beforeSignals?.confirmationRequests) ? beforeSignals.confirmationRequests : [])
            .map(item => String(item?.key || ""))
            .filter(Boolean)
        );
        lastCompletionFailure = null;
        lastCompletionFailureAt = 0;
        blockedTransientLogout = false;
        await installDolaLogoutGuard(client, task, account);
        dolaSubmitTraceStartedAt = Date.now();
        await clickSubmit(client, task.request.target_platform);
        submitted = true;
        submittedAt = Date.now();
        accepted = false;
        deadline = Date.now() + timeoutMs;
        continue;
      }
      if (Number(signals?.failed || 0) > Number(beforeSignals?.failed || 0)) {
        throw new AttemptError("GENERATION_FAILED", `账号“${account.name}”报告视频生成失败`, true);
      }
      if (!accepted && Date.now() - submittedAt >= ACCEPTANCE_TIMEOUT_MS) {
        throw new AttemptError(
          "SUBMISSION_NOT_ACCEPTED",
          `账号“${account.name}”提交后90秒仍未进入生成队列`,
          true
        );
      }

      const elapsed = timeoutMs - Math.max(0, deadline - Date.now());
      const percent = Math.min(90, 28 + Math.floor((elapsed / timeoutMs) * 60));
      updateTask(task, {
        stage: accepted ? "生成中" : "等待接单",
        progress: percent,
        message: accepted
          ? `账号“${account.name}”正在生成视频`
          : `等待账号“${account.name}”确认生成任务`
      });
    }
    throw new AttemptError(
      "GENERATION_TIMEOUT",
      accepted
        ? `账号“${account.name}”生成超时；为避免重复扣费，未自动换号重提`
        : `账号“${account.name}”页面响应超时`,
      !accepted
    );
  } catch (error) {
    if (task.request.dry_run) {
      try {
        await clearPrompt(client);
      } catch (_) {}
    }
    if (!submitted && task.request.image_paths.length) {
      try {
        await startFreshConversation(client, task.request.target_platform);
      } catch (_) {}
    }
    if (error instanceof AttemptError) throw error;
    throw new AttemptError(
      "PAGE_ERROR",
      safeMessage(error),
      !submitted
    );
  } finally {
    for (const stopNetworkTrace of stopNetworkTraces) stopNetworkTrace();
    if (task.request.target_platform === "dola") {
      try {
        await client.call("Fetch.disable", {}, 3000);
      } catch (_) {}
      try {
        await client.call("Network.disable", {}, 3000);
      } catch (_) {}
    }
    client.close();
  }
}

function rotateAccounts(accounts) {
  if (!accounts.length) return [];
  const start = nextAccountIndex % accounts.length;
  return accounts.slice(start).concat(accounts.slice(0, start));
}

async function clearRecoveredDolaAuthCooldowns(task, candidates) {
  if (normalizeTargetPlatform(task?.request?.target_platform) !== "dola") return;
  let changed = false;
  for (const account of candidates) {
    const cooldown = accountCooldowns.get(account.id);
    if (!cooldown || cooldown.until <= Date.now() || cooldown.reason !== "AUTH_REQUIRED") continue;
    let client = null;
    try {
      await openAccount(account.id, "dola", 20000);
      const marked = await getMarkedWebview(account.id, "dola");
      client = marked.client;
      const snapshot = await getDolaAuthSnapshot(client);
      if (!shouldClearAuthCooldown({ reason: cooldown.reason, snapshot })) continue;
      accountCooldowns.delete(account.id);
      changed = true;
      log("Dola 账号已重新登录，提前解除认证冷却", {
        taskId: task.id,
        accountId: account.id,
        accountName: account.name,
        href: snapshot.href
      });
    } catch (error) {
      log("Dola 账号认证冷却复查失败", {
        taskId: task.id,
        accountId: account.id,
        accountName: account.name,
        error: safeMessage(error)
      });
    } finally {
      if (client) client.close();
    }
  }
  if (changed) saveRuntimeState();
}

async function acquireAccountLease(task, candidates, attemptedIds) {
  while (true) {
    pruneCooldowns();
    pruneAccountLeases();
    let hasEligibleAccount = false;
    for (const account of candidates) {
      if (attemptedIds.has(account.id)) continue;
      const cooldown = accountCooldowns.get(account.id);
      if (cooldown?.until > Date.now()) continue;
      hasEligibleAccount = true;
      if (accountLeases.has(account.id)) continue;
      accountLeases.set(account.id, task.id);
      log("账号已分配给任务", { taskId: task.id, accountId: account.id });
      return account;
    }
    if (!hasEligibleAccount) return null;
    updateTask(task, {
      stage: "等待可用账号",
      progress: 4,
      message: "可用账号正在执行其他视频任务，释放后会自动继续"
    });
    await sleep(500);
  }
}

function releaseAccountLease(task, account) {
  if (accountLeases.get(account.id) === task.id) {
    accountLeases.delete(account.id);
    log("账号任务锁已释放", { taskId: task.id, accountId: account.id });
  }
}

function bundledFfmpegPath() {
  const executable = path.join(
    path.dirname(DOLA_EXE),
    "resources",
    "app.asar.unpacked",
    "node_modules",
    "ffmpeg-static",
    process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
  );
  return fs.existsSync(executable) ? executable : "";
}

function runFfmpeg(args, timeoutMs = 5 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const executable = bundledFfmpegPath();
    if (!executable) {
      reject(new Error("豆包管理器没有找到内置 FFmpeg，无法适配 Dola 成片时长"));
      return;
    }
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"]
    });
    let stderr = "";
    child.stderr?.on("data", chunk => {
      stderr = `${stderr}${String(chunk || "")}`.slice(-12000);
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Dola 成片时长适配超时"));
    }, timeoutMs);
    child.once("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Dola 成片时长适配失败（FFmpeg ${code}）：${stderr.slice(-600)}`));
    });
  });
}

function probeLocalVideoDuration(filePath, timeoutMs = 30 * 1000) {
  return new Promise((resolve, reject) => {
    const executable = bundledFfmpegPath();
    if (!executable) {
      reject(new Error("豆包管理器没有找到内置 FFmpeg，无法核验视频时长"));
      return;
    }
    const absolutePath = path.resolve(String(filePath || ""));
    if (!absolutePath || !fs.existsSync(absolutePath)) {
      reject(new Error("核验视频时长时找不到落盘文件"));
      return;
    }
    const child = spawn(executable, ["-hide_banner", "-i", absolutePath], {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"]
    });
    let stderr = "";
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    child.stderr?.on("data", chunk => {
      stderr = `${stderr}${String(chunk || "")}`.slice(-20000);
    });
    const timer = setTimeout(() => {
      try { child.kill(); } catch (_) {}
      finish(() => reject(new Error("本地视频时长核验超时")));
    }, timeoutMs);
    child.once("error", error => finish(() => reject(error)));
    child.once("close", () => finish(() => {
      const durationSeconds = parseFfmpegDuration(stderr);
      if (durationSeconds > 0) resolve(durationSeconds);
      else reject(new Error("FFmpeg 未返回有效的视频时长"));
    }));
  });
}

async function trimDolaVideo(downloaded, requestedSeconds) {
  const inputPath = path.resolve(String(downloaded?.filePath || ""));
  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error("Dola 成片时长适配前找不到原视频");
  }
  const parsed = path.parse(inputPath);
  const outputPath = path.join(parsed.dir, `${parsed.name}_${requestedSeconds}s${parsed.ext || ".mp4"}`);
  await runFfmpeg([
    "-hide_banner",
    "-loglevel", "error",
    "-y",
    "-i", inputPath,
    "-t", String(requestedSeconds),
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "18",
    "-c:a", "aac",
    "-movflags", "+faststart",
    outputPath
  ]);
  const stat = fs.statSync(outputPath);
  if (!stat.isFile() || stat.size < 1024) {
    throw new Error("Dola 成片时长适配后的 MP4 文件为空");
  }
  const handle = fs.openSync(outputPath, "r");
  const header = Buffer.alloc(16);
  try {
    fs.readSync(handle, header, 0, header.length, 0);
  } finally {
    fs.closeSync(handle);
  }
  if (header.subarray(4, 8).toString("ascii") !== "ftyp") {
    throw new Error("Dola 成片时长适配结果不是有效 MP4");
  }
  const durationSeconds = await probeLocalVideoDuration(outputPath);
  const tolerance = Number(requestedSeconds) === 15 ? 1.5 : 1.25;
  if (Math.abs(durationSeconds - Number(requestedSeconds)) > tolerance) {
    throw new Error(
      `Dola 成片裁剪后实测 ${durationSeconds.toFixed(2)} 秒，与要求 ${requestedSeconds} 秒不符`
    );
  }
  return {
    ...downloaded,
    filePath: outputPath,
    fileSize: stat.size,
    durationSeconds,
    originalDurationSeconds: Number(downloaded?.durationSeconds || 0),
    durationAdjustmentMethod: "ffmpeg-trim+ffmpeg-probe"
  };
}

async function prepareOutputDuration(task, downloaded) {
  const requested = normalizeDuration(task.request.duration);
  const reportedDuration = Number(downloaded?.durationSeconds || 0);
  let probedDuration = 0;
  let probeError = "";
  try {
    probedDuration = await probeLocalVideoDuration(downloaded?.filePath);
  } catch (error) {
    probeError = String(error?.message || error || "未知错误");
  }
  const actual = probedDuration > 0 ? probedDuration : reportedDuration;
  const verifiedDownloaded = {
    ...downloaded,
    durationSeconds: actual,
    reportedDurationSeconds: reportedDuration,
    durationProbeMethod: probedDuration > 0 ? "bridge-ffmpeg-probe" : "manager-report"
  };
  log("落盘视频时长核验", {
    taskId: task.id,
    requested,
    reportedDuration,
    probedDuration,
    selectedDuration: actual,
    probeError
  });
  const adjustment = getDurationAdjustment({
    targetPlatform: task.request.target_platform,
    requested,
    actual
  });
  if (adjustment.action === "accept") return verifiedDownloaded;
  if (adjustment.action === "trim") {
    updateTask(task, {
      stage: "适配视频时长",
      progress: 97,
      message: `Dola 返回 ${actual.toFixed(2)} 秒成片，正在保持无水印状态裁剪到 ${requested} 秒`
    });
    const adjusted = await trimDolaVideo(verifiedDownloaded, requested);
    log("Dola 成片已按设置时长裁剪", {
      taskId: task.id,
      requested,
      originalDuration: actual,
      filePath: adjusted.filePath
    });
    return adjusted;
  }
  if (adjustment.action === "unverified") {
    throw new AttemptError(
      "DURATION_UNVERIFIED",
      `成片已下载，但豆包管理器未能校验 ${requested} 秒视频的实际时长`,
      false
    );
  }
  throw new AttemptError(
    "DURATION_MISMATCH",
    `请求 ${requested} 秒，实际成片 ${actual.toFixed(2)} 秒，且成片短于要求，已停止返回`,
    false
  );
}

async function processTask(task) {
  updateTask(task, {
    status: "running",
    stage: "连接管理器",
    progress: 2,
    message: "正在连接豆包管理器"
  });
  await ensureDolaRunning();
  pruneCooldowns();

  let accounts = await listPlatformAccounts(task.request.target_platform, task.request.account_group);
  if (task.request.account_id) {
    const preferred = accounts.find((account) => account.id === task.request.account_id);
    accounts = preferred
      ? [preferred, ...accounts.filter((account) => account.id !== task.request.account_id)]
      : [];
  }
  if (!accounts.length) {
    const targetName = platformName(task.request.target_platform);
    throw new Error(
      task.request.account_group
        ? `豆包管理器中没有分组“${task.request.account_group}”的${targetName}账号`
        : `豆包管理器中没有可用的${targetName}账号`
    );
  }

  const ordered = task.request.account_id ? accounts : rotateAccounts(accounts);
  const candidates = ordered;
  await clearRecoveredDolaAuthCooldowns(task, candidates);
  const attemptedIds = new Set();
  let finalError = null;
  let attemptIndex = 0;

  while (attemptedIds.size < candidates.length) {
    const account = await acquireAccountLease(task, candidates, attemptedIds);
    if (!account) break;
    attemptedIds.add(account.id);
    try {
      const result = await runAttempt(task, account);
      if (result.dryRun) {
        updateTask(task, {
          status: "succeeded",
          stage: "测试完成",
          progress: 100,
          message: `账号“${account.name}”桥接测试通过，未发送生成请求`,
          result: {
            dry_run: true,
            account_id: account.id,
            account_name: account.name,
            diagnostics: result.diagnostics
          }
        });
        return;
      }

      result.downloaded = await prepareOutputDuration(task, result.downloaded);
      const originalIndex = accounts.findIndex((item) => item.id === account.id);
      nextAccountIndex = originalIndex >= 0 ? (originalIndex + 1) % accounts.length : nextAccountIndex + 1;
      accountCooldowns.delete(account.id);
      saveRuntimeState();

      updateTask(task, {
        status: "succeeded",
        stage: "完成",
        progress: 100,
        message: `账号“${account.name}”生成完成`,
        result: {
          account_id: account.id,
          account_name: account.name,
          target_platform: task.request.target_platform,
          file_path: result.downloaded?.filePath || "",
          video_url: result.downloaded?.videoUrl || "",
          message_id: result.downloaded?.messageId || result.resource?.messageId || "",
          node_id: result.downloaded?.nodeId || result.resource?.nodeId || "",
          file_size: Number(result.downloaded?.fileSize || 0),
          duration_seconds: Number(result.downloaded?.durationSeconds || 0),
          original_duration_seconds: Number(result.downloaded?.originalDurationSeconds || 0),
          duration_adjustment_method: String(result.downloaded?.durationAdjustmentMethod || ""),
          confirmed_no_watermark: Boolean(result.downloaded?.confirmedNoWatermark),
          watermark_method: String(result.downloaded?.watermarkMethod || (
            task.request.target_platform === "doubao" ? "official-download-url" : "none"
          ))
        }
      });
      return;
    } catch (error) {
      finalError = error;
      const code = error.code || "PAGE_ERROR";
      const attempt = {
        account_id: account.id,
        account_name: account.name,
        code,
        message: safeMessage(error),
        time: nowIso()
      };
      task.attempts.push(attempt);
      log("账号尝试失败", { taskId: task.id, ...attempt });

      const failurePolicy = getFailurePolicy({
        code,
        safeToRotate: Boolean(error.safeToRotate),
        now: Date.now()
      });
      if (failurePolicy.cooldownUntil) {
        accountCooldowns.set(account.id, {
          until: failurePolicy.cooldownUntil,
          reason: failurePolicy.cooldownReason
        });
        if (code === "QUOTA_EXHAUSTED") {
          log("账号额度不足，今日不再调用", {
            accountId: account.id,
            until: new Date(failurePolicy.cooldownUntil).toISOString()
          });
        }
      }
      saveRuntimeState();

      if (!failurePolicy.rotate) break;
      attemptIndex += 1;
      updateTask(task, {
        stage: "自动换号",
        progress: Math.min(24, 10 + attemptIndex * 2),
        message: `${safeMessage(error)}，正在自动切换下一个账号`
      });
      await sleep(800);
    } finally {
      releaseAccountLease(task, account);
    }
  }

  throw finalError || new Error(`所有${platformName(task.request.target_platform)}账号均在冷却、登录失效或暂不可用`);
}

function pumpQueue() {
  while (activeWorkers < schedulerConcurrency && taskQueue.length) {
    const taskId = taskQueue.shift();
    const task = tasks.get(taskId);
    if (!task || task.status !== "queued") continue;
    activeWorkers += 1;
    void processTask(task).catch((error) => {
      updateTask(task, {
        status: "failed",
        stage: "失败",
        error: {
          code: error.code || "BRIDGE_ERROR",
          message: safeMessage(error)
        },
        message: safeMessage(error)
      });
      log("任务失败", { taskId, error: safeMessage(error), code: error.code || "" });
    }).finally(() => {
      activeWorkers = Math.max(0, activeWorkers - 1);
      pumpQueue();
    });
  }
}

function createTask(request) {
  const id = randomUUID();
  const requestedImagePaths = [];
  if (Array.isArray(request.image_paths)) requestedImagePaths.push(...request.image_paths);
  if (request.image_path) requestedImagePaths.push(request.image_path);
  const imagePaths = [];
  const seenImagePaths = new Set();
  for (const value of requestedImagePaths) {
    if (!value || imagePaths.length >= 9) continue;
    const resolved = path.resolve(String(value));
    const key = process.platform === "win32" ? resolved.toLowerCase() : resolved;
    if (seenImagePaths.has(key)) continue;
    seenImagePaths.add(key);
    imagePaths.push(resolved);
  }
  const task = {
    id,
    status: "queued",
    stage: "排队中",
    progress: 0,
    message: "任务已进入本地队列",
    account: null,
    attempts: [],
    result: null,
    error: null,
    request: {
      prompt: String(request.prompt || "").trim(),
      image_paths: imagePaths,
      image_path: imagePaths[0] || "",
      duration: normalizeDuration(request.duration),
      model: normalizeModel(request.model),
      target_platform: normalizeTargetPlatform(request.target_platform),
      remove_watermark: request.remove_watermark !== false,
      timeout: clampInt(request.timeout, 1200, 60, 3600),
      verification_timeout: clampInt(request.verification_timeout, 600, 60, 1800),
      max_concurrency: clampInt(request.max_concurrency, DEFAULT_MAX_CONCURRENCY, 1, 6),
      account_group: String(request.account_group || "").trim(),
      account_id: String(request.account_id || "").trim(),
      dry_run: Boolean(request.dry_run)
    },
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  if (!task.request.prompt) throw new Error("缺少 prompt");
  for (const imagePath of task.request.image_paths) {
    if (!fs.existsSync(imagePath)) {
      throw new Error(`参考图不存在：${imagePath}`);
    }
  }
  schedulerConcurrency = task.request.max_concurrency;
  tasks.set(id, task);
  taskQueue.push(id);
  while (tasks.size > MAX_TASKS) {
    const oldest = tasks.keys().next().value;
    if (oldest === id) break;
    tasks.delete(oldest);
  }
  void pumpQueue();
  return task;
}

function sendJson(response, status, body) {
  const payload = Buffer.from(JSON.stringify(body), "utf8");
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": payload.length,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(payload);
}

function readJson(request, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("请求体过大"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (_) {
        reject(new Error("JSON 格式错误"));
      }
    });
    request.on("error", reject);
  });
}

function authorized(request) {
  const token = String(request.headers["x-bridge-token"] || "");
  return token === BRIDGE_TOKEN;
}

function pluginLicenseAuthorized(request) {
  return pluginLicenseSessions.verify(request.headers["x-plugin-license-token"]);
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, X-Bridge-Token, X-Plugin-License-Token",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
      });
      response.end();
      return;
    }
    if (!authorized(request)) {
      sendJson(response, 401, { error: "UNAUTHORIZED", message: "桥接令牌不正确" });
      return;
    }

    const url = new URL(request.url, `http://${HOST}:${PORT}`);
    if (request.method === "GET" && url.pathname === "/health") {
      pruneAccountLeases();
      const cdp = await cdpAvailable();
      let doubaoAccounts = [];
      let dolaAccounts = [];
      let capabilities = null;
      if (cdp) {
        try {
          [doubaoAccounts, dolaAccounts, capabilities] = await Promise.all([
            listPlatformAccounts("doubao"),
            listPlatformAccounts("dola"),
            managerEval(`window.managerAPI?.runtime?.capabilities
              ? window.managerAPI.runtime.capabilities()
              : null`, 8000)
          ]);
        } catch (_) {}
      }
      sendJson(response, 200, {
        ok: true,
        version: VERSION,
        dola_exe: DOLA_EXE,
        bridge_pid: process.pid,
        dola_connected: cdp,
        account_count: doubaoAccounts.length,
        account_counts: {
          doubao: doubaoAccounts.length,
          dola: dolaAccounts.length
        },
        capabilities: capabilities || {
          schemaVersion: 1,
          targets: {
            doubao: { models: ["seedance2.0fast", "seedance2.0mini"], durations: ["auto", 5, 10, 15], watermark: "official-no-watermark" },
            dola: {
              models: ["seedance2.0fast", "seedance2.0mini"],
              durations: ["auto", 5, 10, 15],
              watermark: "local-delogo",
              executionEngine: "microsoft-edge"
            }
          }
        },
        queued_tasks: taskQueue.length,
        worker_active: activeWorkers > 0,
        active_workers: activeWorkers,
        max_concurrency: schedulerConcurrency,
        leased_accounts: accountLeases.size
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/license/status") {
      const status = await getManagerLicenseStatus();
      sendJson(response, 200, status);
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/license/activate") {
      const body = await readJson(request, 64 * 1024);
      const status = await activateManagerLicense(body.license_code);
      if (!status.active) {
        sendJson(response, 403, {
          error: "LICENSE_REQUIRED",
          ...status
        });
        return;
      }
      const session = pluginLicenseSessions.issue();
      log("字字插件授权验证通过", {
        licenseId: status.license?.id || "",
        plan: status.license?.plan || "",
        expiresAt: status.license?.expires_at || null,
        permanent: Boolean(status.license?.permanent)
      });
      sendJson(response, 200, {
        ...status,
        authorization_token: session.token,
        authorization_expires_at: new Date(session.expiresAt).toISOString()
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/shutdown") {
      sendJson(response, 200, { ok: true, message: "桥接服务即将退出" });
      setTimeout(() => {
        server.close(() => process.exit(0));
      }, 50);
      return;
    }

    if (request.method === "GET" && url.pathname === "/accounts") {
      await ensureDolaRunning();
      const targetPlatform = normalizeTargetPlatform(url.searchParams.get("platform"));
      const accounts = await listPlatformAccounts(targetPlatform, url.searchParams.get("group") || "");
      pruneCooldowns();
      pruneAccountLeases();
      sendJson(response, 200, {
        accounts: accounts.map((account) => {
          const cooldown = accountCooldowns.get(account.id);
          return {
            id: account.id,
            name: account.name,
            platform: account.platform,
            group: account.group,
            available: !cooldown && !accountLeases.has(account.id),
            busy: accountLeases.has(account.id),
            cooldown_until: cooldown ? new Date(cooldown.until).toISOString() : null,
            cooldown_reason: cooldown?.reason || null
          };
        })
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/video/generations") {
      if (!pluginLicenseAuthorized(request)) {
        sendJson(response, 403, {
          error: "PLUGIN_LICENSE_REQUIRED",
          message: "字字插件尚未激活或本次授权会话已过期，请重新验证激活码"
        });
        return;
      }
      const body = await readJson(request);
      const task = createTask(body);
      sendJson(response, 202, {
        id: task.id,
        status: task.status,
        status_url: `/v1/video/generations/${task.id}`
      });
      return;
    }

    const taskMatch = url.pathname.match(/^\/v1\/video\/generations\/([0-9a-f-]+)$/i);
    if (request.method === "GET" && taskMatch) {
      const task = tasks.get(taskMatch[1]);
      if (!task) {
        sendJson(response, 404, { error: "NOT_FOUND", message: "任务不存在或已清理" });
        return;
      }
      sendJson(response, 200, publicTask(task));
      return;
    }

    sendJson(response, 404, { error: "NOT_FOUND", message: "接口不存在" });
  } catch (error) {
    log("HTTP 请求失败", safeMessage(error));
    sendJson(response, 500, {
      error: error.code || "BRIDGE_ERROR",
      message: safeMessage(error)
    });
  }
});

server.on("error", (error) => {
  log("桥接服务启动失败", safeMessage(error));
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  log("桥接服务已启动", { version: VERSION, host: HOST, port: PORT, cdpPort: CDP_PORT });
});

function shutdown(signal) {
  log("桥接服务正在退出", signal);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
