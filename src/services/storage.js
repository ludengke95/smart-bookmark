/**
 * 智能书签本地存储管理层 (chrome.storage.local / LocalStorage)
 */
import {
  DEFAULT_BOOKMARKS,
  DEFAULT_GROUPS,
  DEFAULT_SETTINGS,
  THEMES,
  PINNED_GROUP_ID,
  UNGROUPED_GROUP_ID
} from '../constants/index.js';

export const STORAGE_KEYS = {
  BOOKMARKS: 'smart_bm_list',
  GROUPS: 'smart_bm_groups',
  SETTINGS: 'smart_bm_settings',
  DAILY_CLICKS: 'smart_bm_daily_clicks',
  TOTAL_CLICKS: 'smart_bm_total_clicks',
  LAST_CLICKED: 'smart_bm_last_clicked',
  PROBE_CACHE: 'smart_bm_probe_cache',
  BACKUPS: 'smart_bm_backups',
  BACKUP_SETTINGS: 'smart_bm_backup_settings',
  CUSTOM_THEMES: 'smart_bm_custom_themes',
  UPLOADED_WALLPAPERS: 'smart_bm_uploaded_wallpapers',
  REMOTE_ICON_CACHE: 'smart_bm_remote_icon_cache'
};

// 辅助：判断是否在标准 Chrome 扩展环境中运行
function isExtensionEnv() {
  try {
    return typeof chrome !== 'undefined' && !!chrome.runtime?.id && !!chrome.storage?.local;
  } catch {
    return false;
  }
}

const memoryFallbackStore = {};

// 统一异步读取
export async function getStorageData(key, fallbackValue) {
  if (isExtensionEnv()) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([key], (result) => {
          if (chrome.runtime?.lastError) {
            console.warn(`Storage get error for key ${key}:`, chrome.runtime.lastError);
            resolve(fallbackValue);
          } else {
            resolve(result && result[key] !== undefined ? result[key] : fallbackValue);
          }
        });
      } catch (err) {
        console.warn('Storage context invalid, fallback to memory/local:', err);
        resolve(fallbackValue);
      }
    });
  } else if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallbackValue;
    } catch {
      return fallbackValue;
    }
  } else {
    return memoryFallbackStore[key] !== undefined
      ? JSON.parse(JSON.stringify(memoryFallbackStore[key]))
      : fallbackValue;
  }
}

// 统一异步写入
export async function setStorageData(key, value) {
  if (isExtensionEnv()) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [key]: value }, () => {
          if (chrome.runtime?.lastError) {
            console.warn(`Storage set error for key ${key}:`, chrome.runtime.lastError);
          }
          resolve();
        });
      } catch (err) {
        console.warn('Storage context invalid during set:', err);
        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem(key, JSON.stringify(value));
          } catch {}
        }
        resolve();
      }
    });
  } else if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  } else {
    memoryFallbackStore[key] = JSON.parse(JSON.stringify(value));
  }
}

/**
 * 初始化存储
 */
export async function initStorage() {
  const bookmarks = await getStorageData(STORAGE_KEYS.BOOKMARKS, null);
  if (bookmarks === null || !Array.isArray(bookmarks)) {
    await setStorageData(STORAGE_KEYS.BOOKMARKS, DEFAULT_BOOKMARKS);
  }

  const groups = await getStorageData(STORAGE_KEYS.GROUPS, null);
  if (groups === null || !Array.isArray(groups)) {
    await setStorageData(STORAGE_KEYS.GROUPS, DEFAULT_GROUPS);
  }

  const settings = await getStorageData(STORAGE_KEYS.SETTINGS, null);
  if (!settings) {
    await setStorageData(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
  }
}

// ==========================================
// 1. 书签 (Bookmarks) CRUD
// ==========================================

export async function getBookmarks() {
  const list = await getStorageData(STORAGE_KEYS.BOOKMARKS, DEFAULT_BOOKMARKS);
  const rawList = Array.isArray(list) ? list : DEFAULT_BOOKMARKS;
  // 数据清洗：确保每个书签都有唯一 ID、规范有效的 endpoints 数组和 groupId
  return rawList.map(bm => {
    if (!bm || typeof bm !== 'object') return null;
    let endpoints = [];
    if (Array.isArray(bm.endpoints) && bm.endpoints.length > 0) {
      endpoints = bm.endpoints.map((ep, idx) => {
        if (!ep) return null;
        if (typeof ep === 'string') {
          const u = ep.trim();
          return u ? { url: u, order: idx, type: 'extranet' } : null;
        }
        if (typeof ep === 'object' && ep.url) {
          const u = String(ep.url).trim();
          return u ? { ...ep, url: u } : null;
        }
        return null;
      }).filter(Boolean);
    }
    if (endpoints.length === 0 && bm.url) {
      const u = String(bm.url).trim();
      if (u) {
        endpoints = [{ url: u, order: 0, type: 'extranet' }];
      }
    }
    return {
      ...bm,
      id: bm.id ? String(bm.id) : ('bm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8)),
      groupId: bm.groupId || UNGROUPED_GROUP_ID,
      tags: Array.isArray(bm.tags) ? bm.tags : [],
      order: typeof bm.order === 'number' ? bm.order : 0,
      endpoints
    };
  }).filter(Boolean);
}

export async function saveBookmark(bookmark) {
  const list = await getBookmarks();
  const bookmarkId = bookmark.id ? String(bookmark.id) : ('bm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8));
  const index = bookmark.id ? list.findIndex(b => b.id === bookmark.id) : -1;

  let cleanEndpoints = [];
  if (Array.isArray(bookmark.endpoints) && bookmark.endpoints.length > 0) {
    cleanEndpoints = bookmark.endpoints.map((ep, idx) => {
      if (!ep) return null;
      if (typeof ep === 'string') {
        const u = ep.trim();
        return u ? { url: u, order: idx, type: 'extranet' } : null;
      }
      if (typeof ep === 'object' && ep.url) {
        const u = String(ep.url).trim();
        return u ? { ...ep, url: u } : null;
      }
      return null;
    }).filter(Boolean);
  }
  if (cleanEndpoints.length === 0 && bookmark.url) {
    const u = String(bookmark.url).trim();
    if (u) {
      cleanEndpoints = [{ url: u, order: 0, type: 'extranet' }];
    }
  }

  const cleanBm = {
    groupId: UNGROUPED_GROUP_ID,
    tags: [],
    order: typeof bookmark.order === 'number' ? bookmark.order : list.length,
    ...bookmark,
    id: bookmarkId,
    endpoints: cleanEndpoints,
    updatedAt: Date.now()
  };

  if (index >= 0) {
    list[index] = { ...list[index], ...cleanBm };
  } else {
    cleanBm.createdAt = bookmark.createdAt || Date.now();
    list.push(cleanBm);
  }
  await setStorageData(STORAGE_KEYS.BOOKMARKS, list);
  return list;
}

export async function deleteBookmark(bookmarkId) {
  let list = await getBookmarks();
  list = list.filter(b => b.id !== bookmarkId);
  await setStorageData(STORAGE_KEYS.BOOKMARKS, list);
  return list;
}

export async function saveAllBookmarks(bookmarks) {
  await setStorageData(STORAGE_KEYS.BOOKMARKS, bookmarks);
  return bookmarks;
}

export async function reorderBookmarks(orderedBookmarkIds) {
  const bookmarks = await getBookmarks();
  const bmMap = new Map(bookmarks.map(b => [b.id, b]));
  const reordered = [];
  let orderIndex = 0;

  for (const id of orderedBookmarkIds) {
    if (bmMap.has(id)) {
      const b = bmMap.get(id);
      b.order = orderIndex++;
      reordered.push(b);
      bmMap.delete(id);
    }
  }

  for (const remaining of bmMap.values()) {
    remaining.order = orderIndex++;
    reordered.push(remaining);
  }

  await setStorageData(STORAGE_KEYS.BOOKMARKS, reordered);
  return reordered;
}

export async function clearAllData() {
  const currentBookmarks = await getBookmarks();
  const currentGroups = await getGroups();
  const backupSettings = await getBackupSettings();
  const hasCustomGroups = currentGroups.some(g => g.id !== PINNED_GROUP_ID && g.id !== UNGROUPED_GROUP_ID);
  if (backupSettings.preActionAutoBackup && (currentBookmarks.length > 0 || hasCustomGroups)) {
    try {
      await createSnapshot(`[清空前自动保护] 清空全部数据前 (共 ${currentBookmarks.length} 项)`, 'auto_preimport');
    } catch (e) {
      console.warn('Pre-clear auto snapshot failed:', e);
    }
  }

  await setStorageData(STORAGE_KEYS.BOOKMARKS, DEFAULT_BOOKMARKS);
  await setStorageData(STORAGE_KEYS.GROUPS, DEFAULT_GROUPS);
  await setStorageData(STORAGE_KEYS.DAILY_CLICKS, {});
  await setStorageData(STORAGE_KEYS.TOTAL_CLICKS, {});
  await setStorageData(STORAGE_KEYS.LAST_CLICKED, {});
  await setStorageData(STORAGE_KEYS.PROBE_CACHE, {
    localIp: '',
    timestamp: 0,
    results: {}
  });

  return true;
}

// ==========================================
// 2. 分组 (Groups) CRUD
// ==========================================

export async function getGroups() {
  let groups = await getStorageData(STORAGE_KEYS.GROUPS, DEFAULT_GROUPS);
  if (!Array.isArray(groups)) groups = DEFAULT_GROUPS;

  // 数据清洗：确保每个分组都有合法 ID
  groups = groups.map(g => {
    if (!g || typeof g !== 'object') return null;
    return {
      ...g,
      id: g.id ? String(g.id) : ('group_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8)),
      name: g.name?.trim() || '分组'
    };
  }).filter(Boolean);

  if (!groups.some(g => g.id === PINNED_GROUP_ID)) {
    groups.unshift({ id: PINNED_GROUP_ID, name: '常用', isPinned: true, order: 0 });
  }
  if (!groups.some(g => g.id === UNGROUPED_GROUP_ID)) {
    groups.push({ id: UNGROUPED_GROUP_ID, name: '未分组', isUngrouped: true, isDefaultCollapsed: false, order: 9999 });
  }

  // 严格确保分组排序：常用分组在前，自定义分组居中按 order，未分组始终置于最后
  const customGroups = groups.filter(g => g.id !== PINNED_GROUP_ID && g.id !== UNGROUPED_GROUP_ID);
  customGroups.sort((a, b) => (a.order || 0) - (b.order || 0));

  const pinnedGroup = groups.find(g => g.id === PINNED_GROUP_ID) || { id: PINNED_GROUP_ID, name: '常用', isPinned: true, order: 0 };
  const ungroupedGroup = groups.find(g => g.id === UNGROUPED_GROUP_ID) || { id: UNGROUPED_GROUP_ID, name: '未分组', isUngrouped: true, isDefaultCollapsed: false, order: 9999 };

  return [pinnedGroup, ...customGroups, ungroupedGroup];
}

export async function saveGroup(group) {
  const groups = await getGroups();
  const groupId = group.id ? String(group.id) : ('group_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8));
  const index = group.id ? groups.findIndex(g => g.id === group.id) : -1;

  const cleanGroup = {
    isPinned: false,
    isDefaultCollapsed: false,
    order: groups.length,
    ...group,
    id: groupId,
    name: group.name?.trim() || '新建分组'
  };

  if (index >= 0) {
    groups[index] = { ...groups[index], ...cleanGroup };
    if (groups[index].id === PINNED_GROUP_ID) groups[index].isPinned = true;
    if (groups[index].id === UNGROUPED_GROUP_ID) groups[index].isUngrouped = true;
  } else {
    const ungroupedIdx = groups.findIndex(g => g.id === UNGROUPED_GROUP_ID);
    if (ungroupedIdx >= 0) {
      groups.splice(ungroupedIdx, 0, cleanGroup);
    } else {
      groups.push(cleanGroup);
    }
  }

  // 保证常用最前，未分组始终最后
  const customGroups = groups.filter(g => g.id !== PINNED_GROUP_ID && g.id !== UNGROUPED_GROUP_ID);
  const pinnedGroup = groups.find(g => g.id === PINNED_GROUP_ID) || { id: PINNED_GROUP_ID, name: '常用', isPinned: true, order: 0 };
  const ungroupedGroup = groups.find(g => g.id === UNGROUPED_GROUP_ID) || { id: UNGROUPED_GROUP_ID, name: '未分组', isUngrouped: true, isDefaultCollapsed: false, order: 9999 };
  const sorted = [pinnedGroup, ...customGroups, ungroupedGroup];

  await setStorageData(STORAGE_KEYS.GROUPS, sorted);
  return sorted;
}

/**
 * 原子化批量导入书签与自动创建分组
 */
export async function batchImportData({ newGroups = [], newBookmarks = [] }) {
  const currentGroups = await getGroups();
  const currentBookmarks = await getBookmarks();

  // 1. 自动备份快照
  const backupSettings = await getBackupSettings();
  if (backupSettings.preActionAutoBackup) {
    try {
      await createSnapshot(`[导入前自动备份] 导入 ${newBookmarks.length} 项前快照`, 'auto_preimport');
    } catch (e) {
      console.warn('Pre-import snapshot failed:', e);
    }
  }

  // 2. 合并分组
  const groupMap = new Map();
  for (const g of currentGroups) {
    groupMap.set(g.name.trim().toLowerCase(), g);
  }

  const mergedCustomGroups = currentGroups.filter(g => g.id !== PINNED_GROUP_ID && g.id !== UNGROUPED_GROUP_ID);
  for (const ng of newGroups) {
    const key = (ng.name || '').trim().toLowerCase();
    if (key && !groupMap.has(key)) {
      const gId = ng.id || ('group_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8));
      const groupObj = {
        id: gId,
        name: ng.name.trim(),
        isPinned: false,
        isDefaultCollapsed: false,
        order: mergedCustomGroups.length
      };
      mergedCustomGroups.push(groupObj);
      groupMap.set(key, groupObj);
    }
  }

  const pinnedGroup = currentGroups.find(g => g.id === PINNED_GROUP_ID) || { id: PINNED_GROUP_ID, name: '常用', isPinned: true, order: 0 };
  const ungroupedGroup = currentGroups.find(g => g.id === UNGROUPED_GROUP_ID) || { id: UNGROUPED_GROUP_ID, name: '未分组', isUngrouped: true, isDefaultCollapsed: false, order: 9999 };
  const mergedGroups = [pinnedGroup, ...mergedCustomGroups, ungroupedGroup];

  // 3. 构建规范化书签数据
  const sanitizedNewBookmarks = newBookmarks.map(bm => {
    const bId = bm.id || ('bm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8));
    let endpoints = [];
    if (Array.isArray(bm.endpoints) && bm.endpoints.length > 0) {
      endpoints = bm.endpoints.map((ep, idx) => {
        if (!ep) return null;
        if (typeof ep === 'string') {
          const u = ep.trim();
          return u ? { url: u, order: idx, type: 'extranet' } : null;
        }
        if (typeof ep === 'object' && ep.url) {
          const u = String(ep.url).trim();
          return u ? { ...ep, url: u } : null;
        }
        return null;
      }).filter(Boolean);
    }
    if (endpoints.length === 0 && bm.url) {
      const u = String(bm.url).trim();
      if (u) {
        endpoints = [{ url: u, order: 0, type: 'extranet' }];
      }
    }

    return {
      id: bId,
      name: bm.name?.trim() || '未命名书签',
      groupId: bm.groupId || UNGROUPED_GROUP_ID,
      tags: Array.isArray(bm.tags) ? bm.tags : [],
      iconKey: bm.iconKey || '',
      customIconBase64: bm.customIconBase64 || '',
      endpoints,
      createdAt: bm.createdAt || Date.now()
    };
  });

  const mergedBookmarks = [...currentBookmarks, ...sanitizedNewBookmarks];

  // 4. 单次原子写入存储
  await setStorageData(STORAGE_KEYS.GROUPS, mergedGroups);
  await setStorageData(STORAGE_KEYS.BOOKMARKS, mergedBookmarks);

  return {
    groups: mergedGroups,
    bookmarks: mergedBookmarks,
    importedCount: sanitizedNewBookmarks.length
  };
}

export async function deleteGroup(groupId) {
  if (groupId === PINNED_GROUP_ID || groupId === UNGROUPED_GROUP_ID) {
    throw new Error('系统内置固定分组（常用 / 未分组）不可删除');
  }
  let groups = await getGroups();
  groups = groups.filter(g => g.id !== groupId);

  if (!groups.some(g => g.id === UNGROUPED_GROUP_ID)) {
    groups.push({ id: UNGROUPED_GROUP_ID, name: '未分组', isUngrouped: true, isDefaultCollapsed: false, order: 999 });
  }
  await setStorageData(STORAGE_KEYS.GROUPS, groups);

  let bookmarks = await getBookmarks();
  let modified = false;
  bookmarks = bookmarks.map(b => {
    if (b.groupId === groupId) {
      modified = true;
      return { ...b, groupId: UNGROUPED_GROUP_ID };
    }
    return b;
  });
  if (modified) {
    await setStorageData(STORAGE_KEYS.BOOKMARKS, bookmarks);
  }
  return groups;
}

export async function reorderGroups(orderedGroupIds) {
  const groups = await getGroups();
  const groupMap = new Map(groups.map(g => [g.id, g]));
  const customGroups = [];
  let orderIndex = 0;

  for (const id of orderedGroupIds) {
    if (id !== PINNED_GROUP_ID && id !== UNGROUPED_GROUP_ID && groupMap.has(id)) {
      const g = groupMap.get(id);
      g.order = orderIndex++;
      customGroups.push(g);
      groupMap.delete(id);
    }
  }

  for (const remaining of groupMap.values()) {
    if (remaining.id !== PINNED_GROUP_ID && remaining.id !== UNGROUPED_GROUP_ID) {
      remaining.order = orderIndex++;
      customGroups.push(remaining);
    }
  }

  const pinnedGroup = groups.find(g => g.id === PINNED_GROUP_ID) || { id: PINNED_GROUP_ID, name: '常用', isPinned: true, order: 0 };
  const ungroupedGroup = groups.find(g => g.id === UNGROUPED_GROUP_ID) || { id: UNGROUPED_GROUP_ID, name: '未分组', isUngrouped: true, isDefaultCollapsed: false, order: 9999 };
  const newGroups = [pinnedGroup, ...customGroups, ungroupedGroup];

  await setStorageData(STORAGE_KEYS.GROUPS, newGroups);
  return newGroups;
}

// ==========================================
// 3. 标签 (Tags) 管理与统计
// ==========================================

export async function getAllTagsWithCount() {
  const bookmarks = await getBookmarks();
  const clickStats = await getClickStats('30d');
  const tagCountMap = {};
  const tagClickMap = {};

  for (const bm of bookmarks) {
    const clicks = clickStats[bm.id] || 0;
    for (const tag of (bm.tags || [])) {
      tagCountMap[tag] = (tagCountMap[tag] || 0) + 1;
      tagClickMap[tag] = (tagClickMap[tag] || 0) + clicks;
    }
  }

  return Object.keys(tagCountMap).map(tag => ({
    name: tag,
    count: tagCountMap[tag],
    clickCount: tagClickMap[tag] || 0
  })).sort((a, b) => b.clickCount - a.clickCount || b.count - a.count);
}

// ==========================================
// 4. 点击统计 (Click Stats)
// ==========================================

function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function recordClick(bookmarkId) {
  if (!bookmarkId) return;
  const today = getTodayKey();
  const now = Date.now();

  const dailyClicks = await getStorageData(STORAGE_KEYS.DAILY_CLICKS, {});
  if (!dailyClicks[today]) dailyClicks[today] = {};
  dailyClicks[today][bookmarkId] = (dailyClicks[today][bookmarkId] || 0) + 1;

  const totalClicks = await getStorageData(STORAGE_KEYS.TOTAL_CLICKS, {});
  totalClicks[bookmarkId] = (totalClicks[bookmarkId] || 0) + 1;

  const lastClicked = await getStorageData(STORAGE_KEYS.LAST_CLICKED, {});
  lastClicked[bookmarkId] = now;

  const dateKeys = Object.keys(dailyClicks);
  if (dateKeys.length > 90) {
    dateKeys.sort();
    while (dateKeys.length > 90) {
      delete dailyClicks[dateKeys.shift()];
    }
  }

  await setStorageData(STORAGE_KEYS.DAILY_CLICKS, dailyClicks);
  await setStorageData(STORAGE_KEYS.TOTAL_CLICKS, totalClicks);
  await setStorageData(STORAGE_KEYS.LAST_CLICKED, lastClicked);
}

export async function getClickStats(period = '30d') {
  if (period === 'all') {
    return await getStorageData(STORAGE_KEYS.TOTAL_CLICKS, {});
  }

  const dailyClicks = await getStorageData(STORAGE_KEYS.DAILY_CLICKS, {});
  const daysLimit = period === '7d' ? 7 : 30;

  const result = {};
  const now = new Date();

  for (let i = 0; i < daysLimit; i++) {
    const targetDate = new Date(now.getTime() - i * 86400000);
    const dateKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
    const dayData = dailyClicks[dateKey];
    if (dayData) {
      for (const [bmId, count] of Object.entries(dayData)) {
        result[bmId] = (result[bmId] || 0) + count;
      }
    }
  }

  return result;
}

export async function getDetailedStats() {
  const dailyClicks = await getStorageData(STORAGE_KEYS.DAILY_CLICKS, {});
  const totalClicks = await getStorageData(STORAGE_KEYS.TOTAL_CLICKS, {});
  const lastClicked = await getStorageData(STORAGE_KEYS.LAST_CLICKED, {});

  // 计算近 7 天点击
  const sevenDaysMap = {};
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const targetDate = new Date(now.getTime() - i * 86400000);
    const dateKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
    const dayData = dailyClicks[dateKey];
    if (dayData) {
      for (const [bmId, count] of Object.entries(dayData)) {
        sevenDaysMap[bmId] = (sevenDaysMap[bmId] || 0) + count;
      }
    }
  }

  return {
    totalClicksMap: totalClicks || {},
    sevenDaysMap,
    lastClickedMap: lastClicked || {}
  };
}

export async function resetAllStats() {
  await setStorageData(STORAGE_KEYS.DAILY_CLICKS, {});
  await setStorageData(STORAGE_KEYS.TOTAL_CLICKS, {});
  await setStorageData(STORAGE_KEYS.LAST_CLICKED, {});
}

// ==========================================
// 5. 设置偏好 (Settings)
// ==========================================

export async function getSettings() {
  return await getStorageData(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
}

export async function saveSettings(partial) {
  const current = await getSettings();
  const updated = { ...current, ...partial };
  await setStorageData(STORAGE_KEYS.SETTINGS, updated);
  return updated;
}

// ==========================================
// 6. 网络探测缓存 (Probe Cache)
// ==========================================

export async function getProbeCache() {
  return await getStorageData(STORAGE_KEYS.PROBE_CACHE, {
    localIp: '',
    timestamp: 0,
    results: {}
  });
}

export async function saveProbeCache(cacheData) {
  await setStorageData(STORAGE_KEYS.PROBE_CACHE, {
    ...cacheData,
    timestamp: Date.now()
  });
}

// ==========================================
// 7. 数据快照与备份 (Backups)
// ==========================================

export const DEFAULT_BACKUP_SETTINGS = {
  autoBackupInterval: 'daily',
  preActionAutoBackup: true,
  maxSnapshots: 15,
  lastAutoBackupTime: 0
};

export async function getBackupSettings() {
  return await getStorageData(STORAGE_KEYS.BACKUP_SETTINGS, DEFAULT_BACKUP_SETTINGS);
}

export async function saveBackupSettings(partial) {
  const current = await getBackupSettings();
  const updated = { ...current, ...partial };
  await setStorageData(STORAGE_KEYS.BACKUP_SETTINGS, updated);
  return updated;
}

export async function getSnapshots() {
  return await getStorageData(STORAGE_KEYS.BACKUPS, []);
}

function formatSnapshotTime(ts) {
  const d = new Date(ts);
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

export async function createSnapshot(reason = '手动快照', type = 'manual', isLocked = false) {
  const bookmarks = await getBookmarks();
  const groups = await getGroups();
  const settings = await getSettings();
  const backupSettings = await getBackupSettings();
  const maxLimit = backupSettings.maxSnapshots || 15;

  const now = Date.now();
  const newSnapshot = {
    id: 'snap_' + now + '_' + Math.random().toString(36).substr(2, 4),
    timestamp: now,
    timeStr: formatSnapshotTime(now),
    reason,
    type,
    isLocked: !!isLocked,
    counts: {
      bookmarks: bookmarks.length,
      groups: groups.length
    },
    data: {
      bookmarks,
      groups,
      settings
    }
  };

  const snapshots = await getSnapshots();
  let updatedList = [newSnapshot, ...snapshots];

  if (updatedList.length > maxLimit) {
    while (updatedList.length > maxLimit) {
      let removeIndex = -1;
      for (let i = updatedList.length - 1; i >= 0; i--) {
        if (!updatedList[i].isLocked) {
          removeIndex = i;
          break;
        }
      }
      if (removeIndex >= 0) {
        updatedList.splice(removeIndex, 1);
      } else {
        break;
      }
    }
  }

  await setStorageData(STORAGE_KEYS.BACKUPS, updatedList);
  return newSnapshot;
}

export async function deleteSnapshot(snapshotId) {
  const snapshots = await getSnapshots();
  const filtered = snapshots.filter(s => s.id !== snapshotId);
  await setStorageData(STORAGE_KEYS.BACKUPS, filtered);
  return filtered;
}

export async function toggleSnapshotLock(snapshotId) {
  const snapshots = await getSnapshots();
  const target = snapshots.find(s => s.id === snapshotId);
  if (target) {
    target.isLocked = !target.isLocked;
    await setStorageData(STORAGE_KEYS.BACKUPS, snapshots);
  }
  return snapshots;
}

export async function rollbackToSnapshot(snapshotId) {
  const snapshots = await getSnapshots();
  const target = snapshots.find(s => s.id === snapshotId);
  if (!target || !target.data) {
    throw new Error('未找到目标快照数据');
  }

  const curBms = await getBookmarks();
  await createSnapshot(`[回滚前自动保护] 恢复至 ${target.timeStr} 前 (共 ${curBms.length} 项)`, 'auto_prerollback');

  if (target.data.bookmarks) {
    await setStorageData(STORAGE_KEYS.BOOKMARKS, target.data.bookmarks);
  }
  if (target.data.groups) {
    await setStorageData(STORAGE_KEYS.GROUPS, target.data.groups);
  }
  if (target.data.settings) {
    await setStorageData(STORAGE_KEYS.SETTINGS, target.data.settings);
  }

  return target;
}

export async function checkDailyAutoBackup() {
  const settings = await getBackupSettings();
  if (settings.autoBackupInterval === 'off') return;

  const now = Date.now();
  const lastTime = settings.lastAutoBackupTime || 0;

  let intervalMs = 24 * 3600 * 1000;
  if (settings.autoBackupInterval === '3days') {
    intervalMs = 3 * 24 * 3600 * 1000;
  } else if (settings.autoBackupInterval === 'weekly') {
    intervalMs = 7 * 24 * 3600 * 1000;
  }

  if (now - lastTime >= intervalMs) {
    const d = new Date(now);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await createSnapshot(`[定时自动备份] ${dateStr} 启动快照`, 'auto_daily');
    await saveBackupSettings({ lastAutoBackupTime: now });
  }
}

// ==========================================
// 8. 完整 JSON 导入与导出
// ==========================================

export async function exportFullBackupJson() {
  const bookmarks = await getBookmarks();
  const groups = await getGroups();
  const settings = await getSettings();
  const clickStats = await getStorageData(STORAGE_KEYS.TOTAL_CLICKS, {});
  const lastClicked = await getStorageData(STORAGE_KEYS.LAST_CLICKED, {});
  const exportPayload = {
    version: '1.0.0',
    exportTime: new Date().toISOString(),
    bookmarks,
    groups,
    settings,
    clickStats,
    lastClicked
  };
  return JSON.stringify(exportPayload, null, 2);
}

export async function importFullBackupJson(jsonString) {
  try {
    const data = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
    if (!data || typeof data !== 'object') {
      return { success: false, error: 'JSON 数据格式无效' };
    }

    if (Array.isArray(data.bookmarks)) {
      await setStorageData(STORAGE_KEYS.BOOKMARKS, data.bookmarks);
    }
    if (Array.isArray(data.groups)) {
      await setStorageData(STORAGE_KEYS.GROUPS, data.groups);
    }
    if (data.settings && typeof data.settings === 'object') {
      await setStorageData(STORAGE_KEYS.SETTINGS, data.settings);
    }
    if (data.clickStats && typeof data.clickStats === 'object') {
      await setStorageData(STORAGE_KEYS.TOTAL_CLICKS, data.clickStats);
    }
    if (data.lastClicked && typeof data.lastClicked === 'object') {
      await setStorageData(STORAGE_KEYS.LAST_CLICKED, data.lastClicked);
    }

    return {
      success: true,
      count: Array.isArray(data.bookmarks) ? data.bookmarks.length : 0
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export async function resetToDefaultData() {
  const currentBms = await getBookmarks();
  if (currentBms.length > 0) {
    await createSnapshot(`[恢复出厂前备份] 备份当前 ${currentBms.length} 个书签`, 'auto_prereset');
  }
  await setStorageData(STORAGE_KEYS.BOOKMARKS, DEFAULT_BOOKMARKS);
  await setStorageData(STORAGE_KEYS.GROUPS, DEFAULT_GROUPS);
  await setStorageData(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
  await resetAllStats();
}

// ==========================================
// 9. AI 智能治理与批量更新 (AI Batch Operations)
// ==========================================

/**
 * 批量更新书签属性 (支持更新分组、标签、标题等)
 */
export async function batchUpdateBookmarks(updates = []) {
  if (!Array.isArray(updates) || updates.length === 0) return [];
  const bookmarks = await getBookmarks();
  const updateMap = new Map(updates.map(u => [u.id, u]));

  let modifiedCount = 0;
  const updatedBookmarks = bookmarks.map(bm => {
    if (updateMap.has(bm.id)) {
      const u = updateMap.get(bm.id);
      modifiedCount++;
      return {
        ...bm,
        ...(u.groupId !== undefined ? { groupId: u.groupId } : {}),
        ...(u.tags !== undefined ? { tags: Array.isArray(u.tags) ? u.tags : bm.tags } : {}),
        ...(u.name !== undefined ? { name: u.name.trim() } : {}),
        updatedAt: Date.now()
      };
    }
    return bm;
  });

  if (modifiedCount > 0) {
    await setStorageData(STORAGE_KEYS.BOOKMARKS, updatedBookmarks);
  }
  return updatedBookmarks;
}

/**
 * 应用 AI 智能分组建议 (自动创建必要的新分组并迁移书签)
 * @param {Array<{ bookmarkId: string, targetGroupName: string, isNewGroup?: boolean }>} plan
 */
export async function batchApplyAiGroups(plan = []) {
  if (!Array.isArray(plan) || plan.length === 0) return { modifiedCount: 0 };

  // 1. 执行前安全快照备份
  await createSnapshot(`[AI智能分组前备份] 治理 ${plan.length} 项书签前`, 'auto_ai_group');

  const currentGroups = await getGroups();
  const currentBookmarks = await getBookmarks();

  // 2. 识别并创建新分组
  const groupMap = new Map();
  for (const g of currentGroups) {
    groupMap.set(g.name.trim().toLowerCase(), g);
  }

  const customGroups = currentGroups.filter(g => g.id !== PINNED_GROUP_ID && g.id !== UNGROUPED_GROUP_ID);
  let newGroupsCreated = 0;

  for (const item of plan) {
    const groupName = (item.targetGroupName || '').trim();
    if (!groupName) continue;
    const key = groupName.toLowerCase();
    if (!groupMap.has(key)) {
      const newGId = 'group_ai_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      const newGroupObj = {
        id: newGId,
        name: groupName,
        isPinned: false,
        isDefaultCollapsed: false,
        order: customGroups.length + newGroupsCreated
      };
      customGroups.push(newGroupObj);
      groupMap.set(key, newGroupObj);
      newGroupsCreated++;
    }
  }

  const pinnedGroup = currentGroups.find(g => g.id === PINNED_GROUP_ID) || { id: PINNED_GROUP_ID, name: '常用', isPinned: true, order: 0 };
  const ungroupedGroup = currentGroups.find(g => g.id === UNGROUPED_GROUP_ID) || { id: UNGROUPED_GROUP_ID, name: '未分组', isUngrouped: true, isDefaultCollapsed: false, order: 9999 };
  const mergedGroups = [pinnedGroup, ...customGroups, ungroupedGroup];

  if (newGroupsCreated > 0) {
    await setStorageData(STORAGE_KEYS.GROUPS, mergedGroups);
  }

  // 3. 迁移书签至目标分组
  const bmPlanMap = new Map(plan.map(p => [p.bookmarkId, p]));
  let modifiedCount = 0;

  const updatedBookmarks = currentBookmarks.map(bm => {
    if (bmPlanMap.has(bm.id)) {
      const item = bmPlanMap.get(bm.id);
      const targetName = (item.targetGroupName || '').trim();
      const targetGroup = groupMap.get(targetName.toLowerCase());
      if (targetGroup && bm.groupId !== targetGroup.id) {
        modifiedCount++;
        return {
          ...bm,
          groupId: targetGroup.id,
          updatedAt: Date.now()
        };
      }
    }
    return bm;
  });

  if (modifiedCount > 0) {
    await setStorageData(STORAGE_KEYS.BOOKMARKS, updatedBookmarks);
  }

  return {
    success: true,
    modifiedCount,
    newGroupsCreated,
    groups: mergedGroups,
    bookmarks: updatedBookmarks
  };
}

/**
 * 应用 AI 智能标签建议
 * @param {Array<{ bookmarkId: string, suggestedTags: string[] }>} plan
 * @param {'append'|'replace'} mode
 */
export async function batchApplyAiTags(plan = [], mode = 'append') {
  if (!Array.isArray(plan) || plan.length === 0) return { modifiedCount: 0 };

  // 1. 执行前安全快照备份
  await createSnapshot(`[AI智能标签前备份] 提炼 ${plan.length} 项书签标签前`, 'auto_ai_tag');

  const currentBookmarks = await getBookmarks();
  const planMap = new Map(plan.map(p => [p.bookmarkId, p]));
  let modifiedCount = 0;

  const updatedBookmarks = currentBookmarks.map(bm => {
    if (planMap.has(bm.id)) {
      const item = planMap.get(bm.id);
      const incomingTags = Array.isArray(item.suggestedTags)
        ? item.suggestedTags.map(t => String(t).trim()).filter(Boolean)
        : [];

      if (incomingTags.length > 0) {
        let finalTags = [];
        if (mode === 'replace') {
          finalTags = Array.from(new Set(incomingTags));
        } else {
          // append
          const existing = Array.isArray(bm.tags) ? bm.tags : [];
          finalTags = Array.from(new Set([...existing, ...incomingTags]));
        }

        // 检查是否有实质变化
        const oldTagStr = (bm.tags || []).sort().join(',');
        const newTagStr = finalTags.sort().join(',');
        if (oldTagStr !== newTagStr) {
          modifiedCount++;
          return {
            ...bm,
            tags: finalTags,
            updatedAt: Date.now()
          };
        }
      }
    }
    return bm;
  });

  if (modifiedCount > 0) {
    await setStorageData(STORAGE_KEYS.BOOKMARKS, updatedBookmarks);
  }

  return {
    success: true,
    modifiedCount,
    bookmarks: updatedBookmarks
  };
}


