/**
 * 书签与当前标签页 URL 匹配与规范化服务
 */

/**
 * 常见营销与无意义跟踪参数黑名单
 */
const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'spm',
  'from',
  '_hsenc',
  '_hsmi',
  'mc_cid',
  'mc_eid',
  'fbclid',
  'gclid'
]);

/**
 * 清洗并规范化 URL 用于比对与存储
 *
 * @param {string} rawUrl 原始网址
 * @param {boolean} [stripTracking=true] 是否过滤追踪参数
 * @returns {{ cleanUrl: string, host: string, origin: string, pathname: string } | null}
 */
export function normalizeEndpointUrl(rawUrl, stripTracking = true) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let u = rawUrl.trim();
  if (!u) return null;

  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(u)) {
    u = 'http://' + u;
  }

  try {
    const parsed = new URL(u);

    // 过滤常见营销追踪参数
    if (stripTracking && parsed.search) {
      const keysToDelete = [];
      parsed.searchParams.forEach((_, key) => {
        if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach(k => parsed.searchParams.delete(k));
    }

    let clean = parsed.toString();

    // 规范化末尾斜杠：针对根路径 (https://example.com/ -> https://example.com)
    // 以及非根路径的末尾纯斜杠，保持比对一致
    if (parsed.pathname === '/' && !parsed.search && !parsed.hash && clean.endsWith('/')) {
      clean = clean.slice(0, -1);
    } else if (parsed.pathname !== '/' && clean.endsWith('/')) {
      clean = clean.slice(0, -1);
    }

    return {
      cleanUrl: clean,
      host: parsed.hostname.toLowerCase(),
      origin: parsed.origin.toLowerCase(),
      pathname: parsed.pathname
    };
  } catch {
    return {
      cleanUrl: rawUrl.trim(),
      host: '',
      origin: '',
      pathname: ''
    };
  }
}

/**
 * 将当前标签页 URL 清洗后作为入库 URL
 *
 * @param {string} rawUrl
 * @returns {string} 清洗后的有效 URL
 */
export function sanitizeUrlForStorage(rawUrl) {
  const norm = normalizeEndpointUrl(rawUrl, true);
  return norm?.cleanUrl || String(rawUrl || '').trim();
}

/**
 * 在已有书签库中精准匹配当前标签页（规范化忽略 tracking 参数与末尾斜杠差异）
 *
 * @param {string} currentUrl 当前标签页地址
 * @param {Array<object>} bookmarks 书签列表
 * @returns {{
 *   exactMatch: object | null,
 *   matchedEndpoint: object | null
 * }}
 */
export function matchCurrentTabWithBookmarks(currentUrl, bookmarks) {
  if (!currentUrl || !Array.isArray(bookmarks) || bookmarks.length === 0) {
    return { exactMatch: null, matchedEndpoint: null };
  }

  const normCurrent = normalizeEndpointUrl(currentUrl, true);
  if (!normCurrent || !normCurrent.cleanUrl) {
    return { exactMatch: null, matchedEndpoint: null };
  }

  for (const bm of bookmarks) {
    const endpoints = bm.endpoints || [];
    for (const ep of endpoints) {
      if (!ep?.url) continue;
      const normEp = normalizeEndpointUrl(ep.url, true);
      if (!normEp) continue;

      // 精准全等匹配（忽略参数中 tracking 差异与末尾斜杠差异）
      if (normEp.cleanUrl === normCurrent.cleanUrl) {
        return {
          exactMatch: bm,
          matchedEndpoint: ep
        };
      }
    }
  }

  return {
    exactMatch: null,
    matchedEndpoint: null
  };
}
