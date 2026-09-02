/**
 * 并发可达性探针与短超时延迟测速引擎
 */

// 辅助：判断是否在标准 Chrome 扩展环境中运行
function isExtensionEnv() {
  try {
    return typeof chrome !== 'undefined' && !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

/**
 * 备选探针：利用 Image 加载 favicon 或目标页面探活（即使 404/跨域只要能建立 TCP/TLS 连接即证明可达）
 */
function probeViaImage(url, timeoutMs = 2500) {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(null);
      return;
    }

    const startTime = performance.now();
    const img = new Image();
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        img.src = '';
        resolve({ url, reachable: false, latency: timeoutMs, error: 'timeout' });
      }
    }, timeoutMs);

    img.onload = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        const latency = Math.max(1, Math.round(performance.now() - startTime));
        resolve({ url, reachable: true, latency, status: 200 });
      }
    };

    img.onerror = () => {
      // 在浏览器同源策略下，图片只要与服务器建立了 TCP/TLS 连接并收到了 HTTP 响应（即使非图片格式返回 404/403/500/200），也会触发 onerror
      // 这说明目标主机和端口完全可达且响应了请求
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        const latency = Math.max(1, Math.round(performance.now() - startTime));
        resolve({ url, reachable: true, latency, status: 200 });
      }
    };

    try {
      let cleanUrl = (url || '').trim();
      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        cleanUrl = 'http://' + cleanUrl;
      }
      const u = new URL(cleanUrl);
      img.src = `${u.origin}/favicon.ico?_t=${Date.now()}`;
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/**
 * 原生 Fetch 探测
 */
async function probeViaFetch(url, timeoutMs = 3500) {
  const startTime = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let cleanUrl = (url || '').trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'http://' + cleanUrl;
    }

    const response = await fetch(cleanUrl, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal
    });

    clearTimeout(timer);
    const latency = Math.max(1, Math.round(performance.now() - startTime));

    return {
      url,
      reachable: true,
      latency,
      status: response.status || 200
    };
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err?.name === 'AbortError';
    return {
      url,
      reachable: false,
      latency: isTimeout ? timeoutMs : 0,
      error: isTimeout ? 'timeout' : 'unreachable'
    };
  }
}

/**
 * 单个 URL 可达性测试 (带扩展 Background 委托 + Fetch + Image 双重兜底探针)
 */
export async function probeSingleUrl(url, timeoutMs = 3500) {
  if (!url || typeof url !== 'string') {
    return { url, reachable: false, latency: 0, error: 'invalid_url' };
  }

  // 1. 尝试使用 Background Service Worker 探测 (具有 <all_urls> 跨域特权)
  if (isExtensionEnv() && typeof chrome.runtime?.sendMessage === 'function') {
    try {
      const bgResult = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: 'probeUrl', url, timeoutMs },
          (response) => {
            if (chrome.runtime?.lastError || !response || !response.success) {
              resolve(null);
            } else {
              resolve(response.data);
            }
          }
        );
      });
      if (bgResult && bgResult.reachable) {
        return bgResult;
      }
    } catch {
      // 忽略通信错误，继续执行降级探测
    }
  }

  // 2. 本地直接 Fetch 探测
  const fetchRes = await probeViaFetch(url, timeoutMs);
  if (fetchRes.reachable) {
    return fetchRes;
  }

  // 3. 若 Fetch 失败（可能受 CORS/安全证书/WAF 阻断），通过 Image 探活兜底
  const imgRes = await probeViaImage(url, Math.min(2500, timeoutMs));
  if (imgRes && imgRes.reachable) {
    return imgRes;
  }

  return fetchRes;
}

/**
 * 对批量 URL 并发执行探测 (带并发批次限流)
 */
export async function probeAllUrls(urls, timeoutMs = 3500) {
  if (!urls || urls.length === 0) return {};

  const uniqueUrls = [...new Set(urls.filter(Boolean))];
  const results = {};
  const batchSize = 8;

  for (let i = 0; i < uniqueUrls.length; i += batchSize) {
    const batch = uniqueUrls.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(u => probeSingleUrl(u, timeoutMs)));
    for (const res of batchResults) {
      results[res.url] = {
        reachable: res.reachable,
        latency: res.latency,
        status: res.status,
        error: res.error
      };
    }
  }

  return results;
}
