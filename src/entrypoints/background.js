import { defineBackground } from 'wxt/utils/define-background';
import { getBookmarks, getSettings } from '../services/storage.js';
import { onStorageChange } from '../services/storage/sync.js';
import { mcpClient } from '../services/mcp/client.js';
import { nativeHostClient } from '../services/mcp/native-host.js';
import { initKeepaliveListener } from '../services/mcp/keepalive.js';
import { DEFAULT_MCP_WS_PORT } from '../constants/index.js';
export default defineBackground(() => {
  console.log('[Background] Smart Bookmark service worker active');

  // 初始化 Offscreen 心跳监听
  initKeepaliveListener();

  const MCP_KEEPALIVE_ALARM = 'mcp_keepalive_alarm';

  // 同步 MCP 状态与保活机制：优先使用 Native Messaging 宿主，未开启或关闭时彻底释放资源
  function syncMcpKeepalive(enabled, port, allowLan) {
    const targetPort = port || DEFAULT_MCP_WS_PORT;
    if (enabled) {
      if (!nativeHostClient.status.isConnected && !nativeHostClient.status.isConnecting) {
        nativeHostClient.connect(targetPort, { allowLan });
      }
      try {
        chrome.alarms?.get(MCP_KEEPALIVE_ALARM, (alarm) => {
          if (!alarm) {
            chrome.alarms.create(MCP_KEEPALIVE_ALARM, { periodInMinutes: 0.4 });
          }
        });
      } catch (e) {
        console.warn('[Background] Alarms init warning:', e);
      }
    } else {
      try {
        chrome.alarms?.clear(MCP_KEEPALIVE_ALARM);
      } catch {
        // ignore
      }
      nativeHostClient.disconnect();
      if (mcpClient.isConnected || mcpClient.isConnecting) {
        mcpClient.disconnect();
      }
    }
  }

  // 初始化检查
  getSettings().then(settings => {
    const isMcpEnabled = settings?.mcp?.enabled === true;
    syncMcpKeepalive(isMcpEnabled, settings?.mcp?.wsPort, settings?.mcp?.allowLan);
  }).catch(() => {});

  // 监听设置动态变更 (通过 BroadcastChannel 跨上下文总线即时响应)
  onStorageChange((event) => {
    if (event.type === 'SETTINGS_CHANGED') {
      const newSettings = event.data;
      const isMcpEnabled = newSettings?.mcp?.enabled === true;
      syncMcpKeepalive(isMcpEnabled, newSettings?.mcp?.wsPort, newSettings?.mcp?.allowLan);
    }
  });

  // MV3 周期性保活触发 (仅在用户开启 MCP 状态下生效)
  chrome.alarms?.onAlarm?.addListener((alarm) => {
    if (alarm.name === MCP_KEEPALIVE_ALARM) {
      getSettings().then(settings => {
        if (settings?.mcp?.enabled === true) {
          const targetPort = settings?.mcp?.wsPort || DEFAULT_MCP_WS_PORT;
          if (!nativeHostClient.status.isConnected && !nativeHostClient.status.isConnecting) {
            nativeHostClient.connect(targetPort, { allowLan: settings?.mcp?.allowLan });
          }
        } else {
          syncMcpKeepalive(false);
        }
      }).catch(() => {});
    }
  });

  // 安装或更新时的初始化
  chrome.runtime.onInstalled?.addListener((details) => {
    if (details.reason === 'install') {
      console.log('[Background] 智能书签插件首次安装完成');
    }
  });

  // 监听来自前台或页面的指令消息
  chrome.runtime.onMessage?.addListener((message, sender, sendResponse) => {
    if (message?.action === 'ping') {
      sendResponse({ status: 'pong', time: Date.now() });
      return true;
    }
    if (message?.action === 'getMcpStatus') {
      sendResponse(nativeHostClient.getStatus());
      return true;
    }
    if (message?.action === 'reconnectMcp') {
      nativeHostClient.connect(message.port, { allowLan: message.allowLan });
      sendResponse({ success: true });
      return true;
    }
    if (message?.action === 'disconnectMcp') {
      nativeHostClient.disconnect();
      sendResponse({ success: true });
      return true;
    }
    if (message?.action === 'getBookmarks') {
      getBookmarks().then(bms => sendResponse({ success: true, data: bms }));
      return true;
    }
    if (message?.action === 'probeUrl' && message.url) {
      const timeoutMs = message.timeoutMs || 3500;
      const startTime = performance.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let cleanUrl = message.url.trim();
      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        cleanUrl = 'http://' + cleanUrl;
      }

      // Background Service Worker 拥有 host_permissions: ['<all_urls>']，可直接跨域探测
      fetch(cleanUrl, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal
      })
        .then(res => {
          clearTimeout(timer);
          const latency = Math.max(1, Math.round(performance.now() - startTime));
          sendResponse({
            success: true,
            data: { url: message.url, reachable: true, latency, status: res.status || 200 }
          });
        })
        .catch(err => {
          clearTimeout(timer);
          const isTimeout = err?.name === 'AbortError';
          sendResponse({
            success: true,
            data: {
              url: message.url,
              reachable: false,
              latency: isTimeout ? timeoutMs : 0,
              error: isTimeout ? 'timeout' : 'unreachable'
            }
          });
        });
      return true;
    }
  });
});
