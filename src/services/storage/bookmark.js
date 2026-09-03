/**
 * 书签 (Bookmarks) CRUD
 */
import { getStorageData, setStorageData, STORAGE_KEYS } from './base.js';
import {
  DEFAULT_BOOKMARKS,
  DEFAULT_GROUPS,
  PINNED_GROUP_ID,
  UNGROUPED_GROUP_ID
} from '../../constants/index.js';
import { getGroups } from './group.js';
import { getBackupSettings, createSnapshot } from './backup.js';

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
      await createSnapshot(null, 'auto_preclear');
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
