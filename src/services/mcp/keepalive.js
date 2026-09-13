/**
 * Smart Bookmark MCP Keepalive Controller
 * 基于 Chrome MV3 Offscreen Document 机制维持 Background Service Worker 活跃。
 * 当 Native Messaging 或长耗时 MCP 任务运行时，通过引用计数保持离屏心跳文档。
 */

let activeTags = new Set();
let isCreating = false;

/**
 * 检查当前是否存在已创建的 Offscreen Document
 */
async function hasOffscreenDocument() {
  if (typeof chrome === 'undefined' || !chrome.offscreen?.hasDocument) {
    return false;
  }
  try {
    return await chrome.offscreen.hasDocument();
  } catch {
    return false;
  }
}

/**
 * 创建离屏心跳文档
 */
async function ensureOffscreenDocument() {
  if (typeof chrome === 'undefined' || !chrome.offscreen?.createDocument) {
    // 非 Chromium 环境（如 Firefox）或不支持 offscreen 权限，优雅降级
    return;
  }

  if (isCreating) return;
  isCreating = true;

  try {
    const exists = await hasOffscreenDocument();
    if (!exists) {
      await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL('offscreen.html'),
        reasons: ['BLOBS'],
        justification: 'Keep Service Worker active for MCP Native Messaging operations'
      });
    }
  } catch (err) {
    // 忽略文档已存在的并发冲突错误
    if (!String(err?.message || '').includes('Only a single offscreen document may be created')) {
      console.warn('[MCP Keepalive] Failed to create offscreen document:', err);
    }
  } finally {
    isCreating = false;
  }
}

/**
 * 关闭离屏心跳文档
 */
async function closeOffscreenDocument() {
  if (typeof chrome === 'undefined' || !chrome.offscreen?.closeDocument) {
    return;
  }

  try {
    const exists = await hasOffscreenDocument();
    if (exists) {
      await chrome.offscreen.closeDocument();
    }
  } catch (err) {
    console.warn('[MCP Keepalive] Failed to close offscreen document:', err);
  }
}

/**
 * 初始化 Background 端的心跳 Port 监听
 */
export function initKeepaliveListener() {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onConnect) {
    return;
  }

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'mcp-keepalive') return;

    port.onMessage.addListener((msg) => {
      if (msg?.type === 'keepalive.ping') {
        try {
          port.postMessage({ type: 'keepalive.pong', timestamp: Date.now() });
        } catch {
          // 忽略端口关闭时的响应异常
        }
      }
    });
  });
}

/**
 * 获取一次保活引用锁
 * @param {string} tag 申请者标识
 * @returns {() => void} 释放函数
 */
export function acquireKeepalive(tag = 'default') {
  const previousSize = activeTags.size;
  activeTags.add(tag);

  if (previousSize === 0) {
    ensureOffscreenDocument();
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeTags.delete(tag);

    if (activeTags.size === 0) {
      closeOffscreenDocument();
    }
  };
}

/**
 * 获取当前保活状态（用于调试或健康检查）
 */
export function getKeepaliveStatus() {
  return {
    isActive: activeTags.size > 0,
    activeCount: activeTags.size,
    tags: Array.from(activeTags)
  };
}
