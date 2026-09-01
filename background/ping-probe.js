/**
 * 并发可达性探针与短超时延迟测速引擎
 */

/**
 * 单个 URL 可达性测试 (带短超时 AbortController)
 */
export async function probeSingleUrl(url, timeoutMs = 1800) {
  const startTime = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // 优先使用 HEAD，不可行则降级 GET (no-cors 确保即使目标无 CORS 响应也能感知网络连通)
    const response = await fetch(url, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal
    });

    clearTimeout(timer);
    const latency = Math.round(performance.now() - startTime);

    return {
      url,
      reachable: true,
      latency: Math.max(1, latency),
      status: response.status || 200
    };
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err.name === 'AbortError';
    return {
      url,
      reachable: false,
      latency: isTimeout ? timeoutMs : 0,
      error: isTimeout ? 'timeout' : 'unreachable'
    };
  }
}

/**
 * 对批量 URL 并发执行探测
 */
export async function probeAllUrls(urls, timeoutMs = 1800) {
  if (!urls || urls.length === 0) return {};
  
  const uniqueUrls = [...new Set(urls.filter(Boolean))];
  const promises = uniqueUrls.map(u => probeSingleUrl(u, timeoutMs));
  const resultsList = await Promise.all(promises);

  const resultMap = {};
  for (const res of resultsList) {
    resultMap[res.url] = {
      reachable: res.reachable,
      latency: res.latency,
      status: res.status,
      error: res.error
    };
  }

  return resultMap;
}
