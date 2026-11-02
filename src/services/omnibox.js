/**
 * Omnibox 地址栏集成服务
 *
 * 用户输入关键字 `bm` + 空格 + 搜索词时：
 *  - 实时从本地书签（名称 / 标签 / 入口 URL）检索匹配项
 *  - 以更易读的「名称 · 最优入口」形式呈现建议
 *  - 回车后按本地缓存的内网 IP 与连通性探测结果智能寻径并直达最优入口
 */
import { getBookmarks, getProbeCache } from '../services/storage.js';
import { sortEndpointsByTopology } from './xor-matcher.js';

/**
 * 计算单个书签在地址栏建议中展示的「最优入口」
 * @param {object} bm
 * @param {string} localIp
 * @param {Record<string, any>} probeResults
 */
export function resolveBookmarkRoute(bm, localIp = '', probeResults = {}) {
  const endpoints = Array.isArray(bm?.endpoints) && bm.endpoints.length > 0
    ? bm.endpoints
    : (bm?.url ? [{ url: bm.url, order: 0, type: 'extranet' }] : []);
  return sortEndpointsByTopology(endpoints, localIp, probeResults || {});
}

/**
 * 在书签库中检索，按匹配度排序返回结果
 * @param {Array<object>} bookmarks
 * @param {string} query
 * @param {number} [limit]
 */
export function searchBookmarks(bookmarks, query, limit = 8) {
  const q = String(query || '').trim().toLowerCase();
  if (!Array.isArray(bookmarks) || bookmarks.length === 0) return [];
  if (!q) return bookmarks.slice(0, limit);

  const scored = [];
  for (const bm of bookmarks) {
    const name = String(bm?.name || '').toLowerCase();
    let score = 0;
    let nameIdx = -1;

    if (name === q) {
      score = 100;
      nameIdx = 0;
    } else if (name.startsWith(q)) {
      score = 80;
      nameIdx = 0;
    } else if ((nameIdx = name.indexOf(q)) !== -1) {
      score = 60;
    }

    const tagHit = (bm?.tags || []).some(tg => String(tg).toLowerCase().includes(q));
    if (tagHit) score = Math.max(score, 45);

    const urlHit = (bm?.endpoints || []).some(ep => String(ep?.url || '').toLowerCase().includes(q));
    if (urlHit) score = Math.max(score, 30);

    if (score > 0) {
      scored.push({ bm, score, nameIdx });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.nameIdx !== b.nameIdx) return a.nameIdx - b.nameIdx;
    return String(a.bm.name || '').localeCompare(String(b.bm.name || ''));
  });

  return scored.slice(0, limit).map(s => s.bm);
}

/**
 * 转义 XML 特殊字符，供 omnibox 建议的 description 富文本使用
 * omnibox 建议支持 <match>…</match> 与 <dim>…</dim> 标记
 */
export function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * 构造地址栏建议对象的 description（带 <match> 高亮 + <dim> 最优入口）
 */
export function buildSuggestionDescription({ name, route, query, dimText }) {
  const safeName = escapeXml(name);
  const q = String(query || '').trim();
  if (q) {
    const idx = safeName.toLowerCase().indexOf(escapeXml(q).toLowerCase());
    if (idx !== -1) {
      const before = safeName.slice(0, idx);
      const match = safeName.slice(idx, idx + escapeXml(q).length);
      const after = safeName.slice(idx + escapeXml(q).length);
      return `${before}<match>${match}</match>${after} <dim>— ${escapeXml(dimText)}</dim>`;
    }
  }
  return `${safeName} <dim>— ${escapeXml(dimText)}</dim>`;
}
