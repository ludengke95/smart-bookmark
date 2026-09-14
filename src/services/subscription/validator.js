/**
 * 订阅源数据安全校验与清洗投影 (Defense-in-Depth)
 */
import { serviceError } from '../errors.js';

const MAX_PAYLOAD_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_GROUPS_COUNT = 50;
const MAX_BOOKMARKS_COUNT = 1000;
const MAX_ENDPOINTS_PER_BOOKMARK = 10;

/**
 * 校验 URL 是否属于安全的 HTTP/HTTPS scheme
 */
export function isSafeUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  const trimmed = urlStr.trim();
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 清洗并校验远程 JSON 订阅源
 *
 * @param {string|object} rawInput - 原始文本或已解析 JSON 对象
 * @returns {object} 清洗后的合法数据 { name, description, topology, groups, bookmarks }
 */
export function validateAndCleanSubscription(rawInput) {
  let data = rawInput;

  if (typeof rawInput === 'string') {
    if (rawInput.length > MAX_PAYLOAD_SIZE) {
      throw serviceError('payloadTooLarge', `Subscription content exceeds maximum size of 5MB`);
    }
    try {
      data = JSON.parse(rawInput);
    } catch (err) {
      throw serviceError('invalidJson', `Failed to parse subscription JSON: ${err.message}`);
    }
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw serviceError('invalidFormat', 'Subscription root must be a JSON object');
  }

  // 1. 基础元数据提取
  const name = String(data.name || '').trim();
  const description = String(data.description || '').trim();

  // 拓扑 CIDR 提取
  const topology = { intranetCidrs: [] };
  if (data.topology && Array.isArray(data.topology.intranetCidrs)) {
    topology.intranetCidrs = data.topology.intranetCidrs
      .map(c => String(c || '').trim())
      .filter(c => /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(c));
  }

  // 2. 分组校验与清洗
  const rawGroups = Array.isArray(data.groups) ? data.groups : [];
  if (rawGroups.length > MAX_GROUPS_COUNT) {
    throw serviceError('tooManyGroups', `Subscription cannot contain more than ${MAX_GROUPS_COUNT} groups`);
  }

  const cleanGroups = [];
  const groupIds = new Set();

  for (let i = 0; i < rawGroups.length; i++) {
    const g = rawGroups[i];
    if (!g || typeof g !== 'object' || Array.isArray(g)) continue;

    const gName = String(g.name || '').trim();
    if (!gName) continue;

    const gId = g.id ? String(g.id).trim() : `grp_sub_${i + 1}`;
    if (groupIds.has(gId)) continue; // 避免源内重复 ID
    groupIds.add(gId);

    cleanGroups.push({
      id: gId,
      name: gName,
      order: typeof g.order === 'number' ? g.order : i + 1,
      isDefaultCollapsed: Boolean(g.isDefaultCollapsed)
    });
  }

  // 3. 书签校验与清洗
  const rawBookmarks = Array.isArray(data.bookmarks) ? data.bookmarks : [];
  if (rawBookmarks.length > MAX_BOOKMARKS_COUNT) {
    throw serviceError('tooManyBookmarks', `Subscription cannot contain more than ${MAX_BOOKMARKS_COUNT} bookmarks`);
  }

  const cleanBookmarks = [];
  const bookmarkIds = new Set();

  for (let i = 0; i < rawBookmarks.length; i++) {
    const bm = rawBookmarks[i];
    if (!bm || typeof bm !== 'object' || Array.isArray(bm)) continue;

    const bmName = String(bm.name || '').trim();
    if (!bmName) continue;

    const bmId = bm.id ? String(bm.id).trim() : `bm_sub_${i + 1}`;
    if (bookmarkIds.has(bmId)) continue;
    bookmarkIds.add(bmId);

    // 清洗 endpoints，严格 Scheme 检查
    let endpoints = [];
    if (Array.isArray(bm.endpoints)) {
      for (let epIdx = 0; epIdx < Math.min(bm.endpoints.length, MAX_ENDPOINTS_PER_BOOKMARK); epIdx++) {
        const ep = bm.endpoints[epIdx];
        if (!ep) continue;

        let epUrl = '';
        let epType = 'extranet';
        let epName = '';
        let epOrder = epIdx;

        if (typeof ep === 'string') {
          epUrl = ep.trim();
        } else if (typeof ep === 'object' && ep.url) {
          epUrl = String(ep.url).trim();
          epType = String(ep.type || 'extranet');
          epName = String(ep.name || '').trim();
          if (typeof ep.order === 'number') epOrder = ep.order;
        }

        if (isSafeUrl(epUrl)) {
          endpoints.push({
            url: epUrl,
            type: epType === 'intranet' ? 'intranet' : 'extranet',
            name: epName,
            order: epOrder
          });
        }
      }
    } else if (bm.url && isSafeUrl(String(bm.url))) {
      endpoints.push({
        url: String(bm.url).trim(),
        type: 'extranet',
        name: '',
        order: 0
      });
    }

    if (endpoints.length === 0) continue; // 没有任何合法安全的入口，跳过该书签

    // 标签清洗
    const tags = Array.isArray(bm.tags)
      ? bm.tags.map(t => String(t || '').trim()).filter(Boolean).slice(0, 8)
      : [];

    cleanBookmarks.push({
      id: bmId,
      name: bmName,
      groupId: bm.groupId ? String(bm.groupId).trim() : (cleanGroups[0]?.id || '__ungrouped__'),
      iconKey: String(bm.iconKey || '').trim(),
      tags,
      order: typeof bm.order === 'number' ? bm.order : i + 1,
      endpoints
    });
  }

  return {
    name,
    description,
    topology,
    groups: cleanGroups,
    bookmarks: cleanBookmarks
  };
}
