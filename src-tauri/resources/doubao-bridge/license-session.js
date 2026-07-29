"use strict";

const { randomUUID } = require("crypto");

const DEFAULT_LICENSE_SESSION_TTL_MS = 10 * 60 * 1000;

function createPluginLicenseSessionStore({
  now = () => Date.now(),
  createToken = () => randomUUID(),
  ttlMs = DEFAULT_LICENSE_SESSION_TTL_MS
} = {}) {
  const sessions = new Map();
  const lifetime = Math.max(30 * 1000, Number(ttlMs) || DEFAULT_LICENSE_SESSION_TTL_MS);

  function prune() {
    const current = now();
    for (const [token, expiresAt] of sessions) {
      if (!expiresAt || expiresAt <= current) sessions.delete(token);
    }
  }

  function issue() {
    prune();
    const token = String(createToken() || "").trim();
    if (!token) throw new Error("无法创建插件授权会话");
    const expiresAt = now() + lifetime;
    sessions.set(token, expiresAt);
    return { token, expiresAt };
  }

  function verify(token) {
    prune();
    const value = String(token || "").trim();
    if (!value) return false;
    const expiresAt = sessions.get(value);
    return Boolean(expiresAt && expiresAt > now());
  }

  return {
    issue,
    prune,
    verify,
    get size() {
      prune();
      return sessions.size;
    }
  };
}

module.exports = {
  DEFAULT_LICENSE_SESSION_TTL_MS,
  createPluginLicenseSessionStore
};
