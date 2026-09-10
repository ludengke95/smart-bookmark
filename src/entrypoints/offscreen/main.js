/**
 * Smart Bookmark MCP Offscreen Document Keepalive Worker
 * 维持与 Background Service Worker 的双向长连接，防止 MV3 Service Worker 在 30 秒空闲后被浏览器休眠。
 */

const PING_INTERVAL_MS = 20_000;
let port = null;
let pingTimer = null;

function connectToBackground() {
  try {
    port = chrome.runtime.connect({ name: 'mcp-keepalive' });

    port.onMessage.addListener((msg) => {
      if (msg?.type === 'keepalive.pong') {
        // 心跳正常回应
      }
    });

    port.onDisconnect.addListener(() => {
      port = null;
      clearInterval(pingTimer);
      pingTimer = null;
      // 如果离屏文档未被关闭，3 秒后尝试重新连接 Background
      setTimeout(connectToBackground, 3000);
    });

    clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if (port) {
        try {
          port.postMessage({ type: 'keepalive.ping', timestamp: Date.now() });
        } catch {
          // 发送失败则触发重连
          port = null;
          clearInterval(pingTimer);
          pingTimer = null;
          setTimeout(connectToBackground, 1000);
        }
      }
    }, PING_INTERVAL_MS);

    // 立即发送第一次 ping
    port.postMessage({ type: 'keepalive.ping', timestamp: Date.now() });
  } catch {
    setTimeout(connectToBackground, 3000);
  }
}

connectToBackground();
