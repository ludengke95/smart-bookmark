/**
 * Chrome 插件 Background Service Worker
 * 处理生命周期、网络探针调度、智能寻径决策与消息分发
 */
import { initStorage, getBookmarks, getProbeCache, saveProbeCache, recordClick } from '../common/storage.js';
import { detectLocalIp } from './ip-detector.js';
import { probeAllUrls, probeSingleUrl } from './ping-probe.js';
import { sortEndpointsByTopology } from './xor-matcher.js';
import { fetchFaviconAsBase64 } from './favicon-fetcher.js';

// 初始化
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[SmartBookmark SW] Extension installed / updated.');
  await initStorage();
  await performFullProbe();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('[SmartBookmark SW] Browser startup.');
  await performFullProbe();
});

/**
 * 执行全局全量可达性与局域网 IP 探测并刷新缓存
 */
async function performFullProbe(providedClientIp = '') {
  try {
    const existingCache = await getProbeCache();
    let localIp = providedClientIp;
    if (!localIp) {
      localIp = await detectLocalIp(1500) || (existingCache ? existingCache.localIp : '');
    }

    const bookmarks = await getBookmarks();
    
    // 收集所有需要探测的 URL
    const allUrls = [];
    for (const bm of bookmarks) {
      if (Array.isArray(bm.endpoints)) {
        for (const ep of bm.endpoints) {
          if (ep.url) allUrls.push(ep.url);
        }
      }
    }

    const results = await probeAllUrls(allUrls, 1800);
    await saveProbeCache({
      localIp,
      results
    });
    console.log(`[SmartBookmark SW] Full probe completed. Detected IP: ${localIp || 'None'}, URLs: ${allUrls.length}`);
    return { localIp, results };
  } catch (err) {
    console.error('[SmartBookmark SW] Probe failed:', err);
    return { localIp: providedClientIp || '', results: {} };
  }
}

// 统一消息监听与 API 接口
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message || {};

  if (type === 'PERFORM_FULL_PROBE') {
    performFullProbe(payload && payload.clientIp).then(data => sendResponse({ success: true, data }));
    return true; // 异步响应
  }

  if (type === 'GET_LOCAL_IP') {
    detectLocalIp(1000).then(ip => sendResponse({ success: true, ip }));
    return true;
  }

  if (type === 'FETCH_FAVICON') {
    fetchFaviconAsBase64(payload.url).then(base64 => sendResponse({ success: true, base64 }));
    return true;
  }

  if (type === 'SMART_RESOLVE_BOOKMARK') {
    // 为特定书签依据当前网络计算最优跳转目标
    (async () => {
      const cache = await getProbeCache();
      const clientIp = cache.localIp || await detectLocalIp(800);
      const decision = sortEndpointsByTopology(payload.endpoints, clientIp, cache.results);
      sendResponse({ success: true, decision });
    })();
    return true;
  }

  if (type === 'SMART_JUMP') {
    // 带有二次复验（保险模式）的极速跳转
    (async () => {
      const { bookmarkId, endpoints } = payload;
      await recordClick(bookmarkId);

      const cache = await getProbeCache();
      let clientIp = cache.localIp;
      
      // 轻量对比本机 IP 变化
      const currentIp = await detectLocalIp(600);
      if (currentIp && currentIp !== clientIp) {
        clientIp = currentIp;
        // 触发异步全量刷新，但当前请求不阻塞
        performFullProbe();
      }

      const decision = sortEndpointsByTopology(endpoints, clientIp, cache.results);
      const sorted = decision.sorted || [];

      let targetUrl = sorted[0] ? sorted[0].url : null;
      let usedEndpoint = sorted[0];

      // 保险模式：对排序第一的 URL 进行快速复验（几百毫秒）
      if (sorted.length > 0 && payload.verify !== false) {
        for (const candidate of sorted) {
          const check = await probeSingleUrl(candidate.url, 800);
          if (check.reachable) {
            targetUrl = candidate.url;
            usedEndpoint = candidate;
            break;
          }
        }
      }

      if (targetUrl) {
        if (payload.openInNewTab) {
          chrome.tabs.create({ url: targetUrl });
        } else {
          chrome.tabs.update({ url: targetUrl });
        }
      }

      sendResponse({ success: !!targetUrl, targetUrl, endpoint: usedEndpoint, reason: decision.reason });
    })();
    return true;
  }
});
