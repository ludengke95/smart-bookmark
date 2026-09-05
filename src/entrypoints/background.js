import { defineBackground } from 'wxt/utils/define-background';
import { getBookmarks, getSettings } from '../services/storage.js';
import { mcpClient } from '../services/mcp/client.js';
import { DEFAULT_MCP_WS_PORT } from '../constants/index.js';

export default defineBackground(() => {
  console.log('[Background] Smart Bookmark service worker active');

  // 初始化 MCP 外部服务连接 (若用户开启了 MCP)
  function checkAndConnectMcp() {
    getSettings().then(settings => {
      if (settings?.mcp?.enabled !== false) {
        mcpClient.connect(settings?.mcp?.wsPort || DEFAULT_MCP_WS_PORT);
      }
    }).catch(() => {});
  }

  checkAndConnectMcp();

  // MV3 Background Service Worker 保活与连接自愈守护
  // Chrome 会在无事件 30s 左右挂起 SW，利用 chrome.alarms 周期唤醒并保活
  const MCP_KEEPALIVE_ALARM = 'mcp_keepalive_alarm';
  try {
    chrome.alarms?.get(MCP_KEEPALIVE_ALARM, (alarm) => {
      if (!alarm) {
        chrome.alarms.create(MCP_KEEPALIVE_ALARM, { periodInMinutes: 0.4 }); // 约 24 秒
      }
    });
  } catch (e) {
    console.warn('[Background] Alarms init warning:', e);
  }

  chrome.alarms?.onAlarm?.addListener((alarm) => {
    if (alarm.name === MCP_KEEPALIVE_ALARM) {
      // 检查并在需要时恢复 MCP 连接
      if (!mcpClient.isConnected && !mcpClient.isConnecting) {
        checkAndConnectMcp();
      }
    }
  });

  const HOME_PAGE_PATH = '/home.html';

  function isNewTabPage(url) {
    if (!url) return false;
    return (
      url === 'chrome://newtab/' ||
      url === 'chrome://newtab' ||
      url.startsWith('chrome-search://local-ntp') ||
      url === 'edge://newtab/' ||
      url === 'edge://newtab' ||
      url === 'about:home'
    );
  }

  function redirectToHome(tabId) {
    try {
      const targetUrl = chrome.runtime.getURL(HOME_PAGE_PATH);
      chrome.tabs.update(tabId, { url: targetUrl }).catch(() => {});
    } catch (e) {
      console.warn('[Background] 重定向到主页失败:', e);
    }
  }

  // 1. 监听新标签页创建事件（用户点击 + 或按快捷键 Ctrl+T）
  chrome.tabs.onCreated?.addListener((tab) => {
    if (tab && tab.id) {
      if (isNewTabPage(tab.pendingUrl) || isNewTabPage(tab.url)) {
        redirectToHome(tab.id);
      }
    }
  });

  // 2. 监听标签页更新（应对某些情况下 pendingUrl 延迟或手动导航到 chrome://newtab 的场景）
  chrome.tabs.onUpdated?.addListener((tabId, changeInfo, tab) => {
    const homeUrl = chrome.runtime.getURL(HOME_PAGE_PATH);
    if (tab?.url?.startsWith(homeUrl) || changeInfo?.url?.startsWith(homeUrl)) {
      return;
    }
    if (isNewTabPage(changeInfo.url) || isNewTabPage(changeInfo.pendingUrl)) {
      redirectToHome(tabId);
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
