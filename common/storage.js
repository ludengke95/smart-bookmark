/**
 * 智能书签本地存储管理层 (chrome.storage.local)
 */
import { DEFAULT_BOOKMARKS, DEFAULT_GROUPS, DEFAULT_SETTINGS, THEMES, PINNED_GROUP_ID, UNGROUPED_GROUP_ID } from './constants.js';

const STORAGE_KEYS = {
  BOOKMARKS: 'smart_bm_list',
  GROUPS: 'smart_bm_groups',
  SETTINGS: 'smart_bm_settings',
  DAILY_CLICKS: 'smart_bm_daily_clicks',
  TOTAL_CLICKS: 'smart_bm_total_clicks',
  PROBE_CACHE: 'smart_bm_probe_cache',
  BACKUPS: 'smart_bm_backups',
  BACKUP_SETTINGS: 'smart_bm_backup_settings',
  CUSTOM_THEMES: 'smart_bm_custom_themes',
  UPLOADED_WALLPAPERS: 'smart_bm_uploaded_wallpapers',
  REMOTE_ICON_CACHE: 'smart_bm_remote_icon_cache'
};

// 辅助：判断是否在标准 Chrome 扩展环境中运行
function isExtensionEnv() {
  return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
}

// 统一异步读取
async function getStorageData(key, fallbackValue) {
  if (isExtensionEnv()) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => {
        if (chrome.runtime.lastError) {
          console.warn(`Storage get error for key ${key}:`, chrome.runtime.lastError);
          resolve(fallbackValue);
        } else {
          resolve(result[key] !== undefined ? result[key] : fallbackValue);
        }
      });
    });
  } else {
    // 浏览器直接运行降级
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallbackValue;
    } catch {
      return fallbackValue;
    }
  }
}

// 统一异步写入
async function setStorageData(key, value) {
  if (isExtensionEnv()) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          console.error(`Storage set error for key ${key}:`, chrome.runtime.lastError);
        }
        resolve();
      });
    });
  } else {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  }
}

/**
 * 初始化存储（首次安装或本地为空时预置默认数据）
 */
export async function initStorage() {
  const bookmarks = await getStorageData(STORAGE_KEYS.BOOKMARKS, null);
  if (!bookmarks || !Array.isArray(bookmarks) || bookmarks.length === 0) {
    await setStorageData(STORAGE_KEYS.BOOKMARKS, DEFAULT_BOOKMARKS);
  }

  const groups = await getStorageData(STORAGE_KEYS.GROUPS, null);
  if (!groups || !Array.isArray(groups) || groups.length === 0) {
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
  return Array.isArray(list) ? list : DEFAULT_BOOKMARKS;
}

export async function saveBookmark(bookmark) {
  const list = await getBookmarks();
  const index = list.findIndex(b => b.id === bookmark.id);
  if (index >= 0) {
    list[index] = { ...list[index], ...bookmark, updatedAt: Date.now() };
  } else {
    const newBm = {
      id: bookmark.id || 'bm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      groupId: bookmark.groupId || PINNED_GROUP_ID,
      tags: bookmark.tags || [],
      endpoints: bookmark.endpoints || [],
      createdAt: Date.now(),
      ...bookmark
    };
    list.push(newBm);
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

export async function clearAllData() {
  const currentBookmarks = await getBookmarks();
  const backupSettings = await getBackupSettings();
  if (backupSettings.preActionAutoBackup) {
    try {
      await createSnapshot(`[清空前自动保护] 清空全部数据前 (共 ${currentBookmarks.length} 项)`, 'auto_preimport');
    } catch (e) {
      console.warn('Pre-clear auto snapshot failed:', e);
    }
  }

  // 清空书签列表
  await setStorageData(STORAGE_KEYS.BOOKMARKS, []);
  
  // 仅保留默认常用分组与未分组
  const defaultPinnedGroup = DEFAULT_GROUPS.find(g => g.id === PINNED_GROUP_ID) || { id: PINNED_GROUP_ID, name: '常用', isPinned: true, order: 0 };
  const defaultUngrouped = DEFAULT_GROUPS.find(g => g.id === UNGROUPED_GROUP_ID) || { id: UNGROUPED_GROUP_ID, name: '未分组', isUngrouped: true, isDefaultCollapsed: false, order: 999 };
  await setStorageData(STORAGE_KEYS.GROUPS, [defaultPinnedGroup, defaultUngrouped]);

  // 重置点击统计
  await setStorageData(STORAGE_KEYS.DAILY_CLICKS, {});
  await setStorageData(STORAGE_KEYS.TOTAL_CLICKS, {});

  return true;
}

export async function saveAllBookmarks(bookmarks) {
  await setStorageData(STORAGE_KEYS.BOOKMARKS, bookmarks);
  return bookmarks;
}

export async function reorderBookmarks(orderedIds) {
  const list = await getBookmarks();
  const idMap = new Map(list.map(b => [b.id, b]));
  const newList = [];
  for (const id of orderedIds) {
    if (idMap.has(id)) {
      newList.push(idMap.get(id));
      idMap.delete(id);
    }
  }
  // 追加剩余项
  for (const remaining of idMap.values()) {
    newList.push(remaining);
  }
  await setStorageData(STORAGE_KEYS.BOOKMARKS, newList);
  return newList;
}

// ==========================================
// 2. 分组 (Groups) CRUD
// ==========================================

export async function getGroups() {
  let groups = await getStorageData(STORAGE_KEYS.GROUPS, DEFAULT_GROUPS);
  if (!Array.isArray(groups)) groups = DEFAULT_GROUPS;

  // 确保固定内置的 "常用" 与 "未分组" 分组始终存在
  if (!groups.some(g => g.id === PINNED_GROUP_ID)) {
    groups.unshift({ id: PINNED_GROUP_ID, name: '常用', isPinned: true, order: 0 });
  }
  if (!groups.some(g => g.id === UNGROUPED_GROUP_ID)) {
    groups.push({ id: UNGROUPED_GROUP_ID, name: '未分组', isUngrouped: true, isDefaultCollapsed: false, order: 999 });
  }

  // 排序规则："常用" 排第一，"未分组" 排在所有自定义分组最后，其余按 order 排序
  const sorted = groups.sort((a, b) => {
    if (a.id === PINNED_GROUP_ID) return -1;
    if (b.id === PINNED_GROUP_ID) return 1;
    if (a.id === UNGROUPED_GROUP_ID) return 1;
    if (b.id === UNGROUPED_GROUP_ID) return -1;
    return (a.order || 0) - (b.order || 0);
  });
  return sorted;
}

export async function saveGroup(group) {
  const groups = await getGroups();
  const index = groups.findIndex(g => g.id === group.id);
  if (index >= 0) {
    // 保护 pinned 和 ungrouped 分组核心属性
    groups[index] = { ...groups[index], ...group };
    if (groups[index].id === PINNED_GROUP_ID) {
      groups[index].isPinned = true;
    }
    if (groups[index].id === UNGROUPED_GROUP_ID) {
      groups[index].isUngrouped = true;
    }
  } else {
    const newGroup = {
      id: group.id || 'group_' + Date.now(),
      name: group.name || '新建分组',
      isPinned: false,
      isDefaultCollapsed: false,
      order: groups.length,
      ...group
    };
    groups.push(newGroup);
  }
  await setStorageData(STORAGE_KEYS.GROUPS, groups);
  return groups;
}

export async function deleteGroup(groupId) {
  if (groupId === PINNED_GROUP_ID || groupId === UNGROUPED_GROUP_ID) {
    throw new Error('系统内置固定分组（常用 / 未分组）不可删除');
  }
  let groups = await getGroups();
  groups = groups.filter(g => g.id !== groupId);

  // 确保 groups 中存在未分组
  if (!groups.some(g => g.id === UNGROUPED_GROUP_ID)) {
    groups.push({ id: UNGROUPED_GROUP_ID, name: '未分组', isUngrouped: true, isDefaultCollapsed: false, order: 999 });
  }
  await setStorageData(STORAGE_KEYS.GROUPS, groups);

  // 将被删除分组下的书签转移至"未分组"
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
  const newGroups = [];
  let orderIndex = 0;

  // 确保 PINNED 永远排在第一
  if (groupMap.has(PINNED_GROUP_ID)) {
    const pinned = groupMap.get(PINNED_GROUP_ID);
    pinned.order = orderIndex++;
    newGroups.push(pinned);
    groupMap.delete(PINNED_GROUP_ID);
  }

  for (const id of orderedGroupIds) {
    if (id !== PINNED_GROUP_ID && groupMap.has(id)) {
      const g = groupMap.get(id);
      g.order = orderIndex++;
      newGroups.push(g);
      groupMap.delete(id);
    }
  }

  for (const remaining of groupMap.values()) {
    remaining.order = orderIndex++;
    newGroups.push(remaining);
  }

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

export async function renameTag(oldName, newName) {
  if (!oldName || !newName || oldName === newName) return;
  const bookmarks = await getBookmarks();
  let modified = false;
  bookmarks.forEach(bm => {
    if (bm.tags && bm.tags.includes(oldName)) {
      bm.tags = bm.tags.map(t => t === oldName ? newName : t);
      // 去重
      bm.tags = [...new Set(bm.tags)];
      modified = true;
    }
  });
  if (modified) {
    await setStorageData(STORAGE_KEYS.BOOKMARKS, bookmarks);
  }
}

export async function deleteTag(tagName) {
  const bookmarks = await getBookmarks();
  let modified = false;
  bookmarks.forEach(bm => {
    if (bm.tags && bm.tags.includes(tagName)) {
      bm.tags = bm.tags.filter(t => t !== tagName);
      modified = true;
    }
  });
  if (modified) {
    await setStorageData(STORAGE_KEYS.BOOKMARKS, bookmarks);
  }
}

// ==========================================
// 4. 点击统计与访问频次 (Click Analytics)
// ==========================================

function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function recordClick(bookmarkId) {
  if (!bookmarkId) return;
  const today = getTodayKey();
  
  // 1. 更新今日明细
  const dailyClicks = await getStorageData(STORAGE_KEYS.DAILY_CLICKS, {});
  if (!dailyClicks[today]) dailyClicks[today] = {};
  dailyClicks[today][bookmarkId] = (dailyClicks[today][bookmarkId] || 0) + 1;
  
  // 2. 更新累计不归零总数
  const totalClicks = await getStorageData(STORAGE_KEYS.TOTAL_CLICKS, {});
  totalClicks[bookmarkId] = (totalClicks[bookmarkId] || 0) + 1;

  // 3. 超过 90 天的历史明细清理
  const dateKeys = Object.keys(dailyClicks);
  if (dateKeys.length > 90) {
    dateKeys.sort();
    while (dateKeys.length > 90) {
      delete dailyClicks[dateKeys.shift()];
    }
  }

  await setStorageData(STORAGE_KEYS.DAILY_CLICKS, dailyClicks);
  await setStorageData(STORAGE_KEYS.TOTAL_CLICKS, totalClicks);
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

export async function resetAllStats() {
  await setStorageData(STORAGE_KEYS.DAILY_CLICKS, {});
  await setStorageData(STORAGE_KEYS.TOTAL_CLICKS, {});
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
// 7. 数据快照与版本回滚 (Backup & Rollback)
// ==========================================

export const DEFAULT_BACKUP_SETTINGS = {
  autoBackupInterval: 'daily', // 'daily', '3days', 'weekly', 'off'
  preActionAutoBackup: true,   // 在批量导入、清空、回滚等关键操作前自动打快照
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
    reason: reason,
    type: type, // 'manual' | 'auto_daily' | 'auto_preimport' | 'auto_prerollback'
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

  // 超过最大上限，进行 FIFO 滚动淘汰（优先淘汰未锁定的最早快照）
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

  // 1. 双保险：在回滚写入前，自动给当前实时状态打一个“回滚前安全快照”
  const curBms = await getBookmarks();
  await createSnapshot(`[回滚前自动保护] 恢复至 ${target.timeStr} 前 (共 ${curBms.length} 项)`, 'auto_prerollback');

  // 2. 覆盖恢复目标快照的数据
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
  
  let intervalMs = 24 * 3600 * 1000; // daily
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
// 6. DIY 自定义主题包管理
// ==========================================

export async function getCustomThemes() {
  const list = await getStorageData(STORAGE_KEYS.CUSTOM_THEMES, []);
  return Array.isArray(list) ? list : [];
}

export async function saveCustomTheme(theme) {
  const list = await getCustomThemes();
  const id = theme.id || 'theme_diy_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
  const newTheme = {
    ...theme,
    id,
    isCustom: true,
    updatedAt: Date.now()
  };

  const idx = list.findIndex(t => t.id === id);
  if (idx >= 0) {
    list[idx] = newTheme;
  } else {
    list.push(newTheme);
  }

  await setStorageData(STORAGE_KEYS.CUSTOM_THEMES, list);
  return newTheme;
}

/**
 * 卸载/删除自定义主题包（同步彻底删除主题包色彩及绑定的壁纸数据）
 */
export async function deleteCustomTheme(themeId) {
  let list = await getCustomThemes();
  const target = list.find(t => t.id === themeId);
  
  // 从自定义主题包列表中移除（彻底释放其包含的 Base64 自定义壁纸数据）
  list = list.filter(t => t.id !== themeId);
  await setStorageData(STORAGE_KEYS.CUSTOM_THEMES, list);

  // 如果当前选中的正为被卸载的自定义主题，自动重置为默认暗黑岩板主题与默认壁纸
  const settings = await getSettings();
  if (settings.theme === themeId) {
    const defaultTheme = THEMES[0];
    const updatePayload = {
      theme: defaultTheme.id
    };
    if (target && target.wallpaper && target.wallpaper.enabled) {
      updatePayload.wallpaper = defaultTheme.wallpaper || DEFAULT_SETTINGS.wallpaper;
    }
    await saveSettings(updatePayload);
  }
  return list;
}

export async function getAllThemes() {
  const custom = await getCustomThemes();
  return [...THEMES, ...custom];
}

// ==========================================
// 7. 独立全局壁纸 (Wallpaper) 存取
// ==========================================

export async function getWallpaperSettings() {
  const settings = await getSettings();
  return {
    ...DEFAULT_SETTINGS.wallpaper,
    ...(settings.wallpaper || {})
  };
}

export async function saveWallpaperSettings(wallpaperUpdate) {
  const settings = await getSettings();
  const currentWp = {
    ...DEFAULT_SETTINGS.wallpaper,
    ...(settings.wallpaper || {})
  };
  const merged = { ...currentWp, ...wallpaperUpdate };
  await saveSettings({ wallpaper: merged });
  return merged;
}

// ==========================================
// 8. 本地已上传壁纸图库 (Uploaded Gallery)
// ==========================================

export async function getUploadedWallpapers() {
  return await getStorageData(STORAGE_KEYS.UPLOADED_WALLPAPERS, []);
}

export async function saveUploadedWallpaper(wpItem) {
  let list = await getUploadedWallpapers();
  const item = {
    id: wpItem.id || ('upl_wp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)),
    name: wpItem.name || '本地壁纸',
    dataUrl: wpItem.dataUrl,
    uploadedAt: wpItem.uploadedAt || Date.now()
  };

  // 移出同 id 或相同 dataUrl 项以更新到首位
  list = list.filter(w => w.id !== item.id && w.dataUrl !== item.dataUrl);
  list.unshift(item);

  // 容量保护：最多保留 12 张本地上传壁纸
  if (list.length > 12) {
    list = list.slice(0, 12);
  }

  await setStorageData(STORAGE_KEYS.UPLOADED_WALLPAPERS, list);
  return item;
}

export async function deleteUploadedWallpaper(id) {
  let list = await getUploadedWallpapers();
  list = list.filter(w => w.id !== id);
  await setStorageData(STORAGE_KEYS.UPLOADED_WALLPAPERS, list);
  return list;
}

export async function deleteUploadedWallpapersBatch(idArray) {
  if (!idArray || !idArray.length) return await getUploadedWallpapers();
  const idSet = new Set(idArray);
  let list = await getUploadedWallpapers();
  list = list.filter(w => !idSet.has(w.id));
  await setStorageData(STORAGE_KEYS.UPLOADED_WALLPAPERS, list);
  return list;
}

export async function saveUploadedWallpapersBatch(newItems) {
  if (!newItems || !newItems.length) return await getUploadedWallpapers();
  let list = await getUploadedWallpapers();

  for (const wpItem of newItems) {
    const item = {
      id: wpItem.id || ('upl_wp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)),
      name: wpItem.name || '本地壁纸',
      dataUrl: wpItem.dataUrl,
      uploadedAt: wpItem.uploadedAt || Date.now()
    };
    list = list.filter(w => w.id !== item.id && w.dataUrl !== item.dataUrl);
    list.unshift(item);
  }

  // 容量保护：最多保留 12 张
  if (list.length > 12) {
    list = list.slice(0, 12);
  }

  await setStorageData(STORAGE_KEYS.UPLOADED_WALLPAPERS, list);
  return list;
}

// ==========================================
// 9. 远程图标本地缓存池 (Remote Icon Cache)
// ==========================================

export async function getAllRemoteIconCaches() {
  return await getStorageData(STORAGE_KEYS.REMOTE_ICON_CACHE, {});
}

export async function getRemoteIconCache(key) {
  if (!key) return null;
  const cacheMap = await getAllRemoteIconCaches();
  const entry = cacheMap[key];
  if (entry && entry.data) {
    return entry.data;
  }
  return null;
}

export async function setRemoteIconCache(key, dataUrl, remoteUrl = '') {
  if (!key || !dataUrl) return;
  const cacheMap = await getAllRemoteIconCaches();
  cacheMap[key] = {
    data: dataUrl,
    remoteUrl: remoteUrl || '',
    size: dataUrl.length,
    cachedAt: Date.now()
  };
  await setStorageData(STORAGE_KEYS.REMOTE_ICON_CACHE, cacheMap);
}

export async function clearRemoteIconCache() {
  const cacheMap = await getAllRemoteIconCaches();
  const count = Object.keys(cacheMap).length;
  let totalBytes = 0;
  for (const item of Object.values(cacheMap)) {
    totalBytes += (item.size || (item.data ? item.data.length : 0));
  }
  await setStorageData(STORAGE_KEYS.REMOTE_ICON_CACHE, {});
  return { count, totalBytes };
}

export async function clearAllTemporaryCaches() {
  const iconResult = await clearRemoteIconCache();
  await setStorageData(STORAGE_KEYS.PROBE_CACHE, { localIp: '', timestamp: 0, results: {} });
  return {
    iconCount: iconResult.count,
    freedBytes: iconResult.totalBytes
  };
}

// ==========================================
// 10. 全局存储空间使用分析 (Storage Usage Analysis)
// ==========================================

function calculateObjectBytes(obj) {
  try {
    const str = JSON.stringify(obj || '');
    return new Blob([str]).size;
  } catch {
    return 0;
  }
}

export async function calculateStorageUsageAnalysis() {
  const bookmarks = await getStorageData(STORAGE_KEYS.BOOKMARKS, []);
  const groups = await getStorageData(STORAGE_KEYS.GROUPS, []);
  const settings = await getStorageData(STORAGE_KEYS.SETTINGS, {});
  const backups = await getStorageData(STORAGE_KEYS.BACKUPS, []);
  const customThemes = await getStorageData(STORAGE_KEYS.CUSTOM_THEMES, []);
  const uploadedWallpapers = await getStorageData(STORAGE_KEYS.UPLOADED_WALLPAPERS, []);
  const remoteIcons = await getStorageData(STORAGE_KEYS.REMOTE_ICON_CACHE, {});
  const dailyClicks = await getStorageData(STORAGE_KEYS.DAILY_CLICKS, {});
  const totalClicks = await getStorageData(STORAGE_KEYS.TOTAL_CLICKS, {});
  const probeCache = await getStorageData(STORAGE_KEYS.PROBE_CACHE, {});

  const bookmarksBytes = calculateObjectBytes(bookmarks) + calculateObjectBytes(groups);
  const backupsBytes = calculateObjectBytes(backups);
  const wallpapersBytes = calculateObjectBytes(uploadedWallpapers);
  const themesBytes = calculateObjectBytes(customThemes);
  const remoteIconsBytes = calculateObjectBytes(remoteIcons);
  const statsAndProbesBytes = calculateObjectBytes(dailyClicks) + calculateObjectBytes(totalClicks) + calculateObjectBytes(probeCache) + calculateObjectBytes(settings);

  const totalUsedBytes = bookmarksBytes + backupsBytes + wallpapersBytes + themesBytes + remoteIconsBytes + statsAndProbesBytes;
  const quotaBytes = 104857600; // 100MB 软上限容量基准 (已通过 unlimitedStorage 放开限制)
  const percentage = Math.min(100, Math.round((totalUsedBytes / quotaBytes) * 1000) / 10); // 保留一位小数，如 0.8%

  return {
    totalUsedBytes,
    quotaBytes,
    percentage: percentage < 0.1 && totalUsedBytes > 0 ? 0.1 : percentage,
    categories: {
      bookmarks: {
        name: '书签与分组核心数据',
        bytes: bookmarksBytes,
        count: (Array.isArray(bookmarks) ? bookmarks.length : 0),
        isClearable: false
      },
      remoteIcons: {
        name: '远程图标缓存 (可按需清理)',
        bytes: remoteIconsBytes,
        count: Object.keys(remoteIcons || {}).length,
        isClearable: true
      },
      wallpapers: {
        name: '自定义壁纸图库',
        bytes: wallpapersBytes,
        count: (Array.isArray(uploadedWallpapers) ? uploadedWallpapers.length : 0),
        isClearable: true
      },
      backups: {
        name: '本地快照与自动备份',
        bytes: backupsBytes,
        count: (Array.isArray(backups) ? backups.length : 0),
        isClearable: true
      },
      themes: {
        name: 'DIY 自定义主题',
        bytes: themesBytes,
        count: (Array.isArray(customThemes) ? customThemes.length : 0),
        isClearable: true
      },
      statsAndProbes: {
        name: '点击统计与网络探测缓存',
        bytes: statsAndProbesBytes,
        count: 0,
        isClearable: true
      }
    }
  };
}



