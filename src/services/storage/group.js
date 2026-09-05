/**
 * 分组 (Groups) CRUD 与标签统计
 */
import { getStorageData, setStorageData, STORAGE_KEYS } from './base.js';
import {
  DEFAULT_GROUPS,
  PINNED_GROUP_ID,
  UNGROUPED_GROUP_ID
} from '../../constants/index.js';
import { getBookmarks } from './bookmark.js';
import { getBackupSettings, createSnapshot } from './backup.js';
import { getClickStats } from './stats.js';
import { serviceError } from '../errors.js';

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
      await createSnapshot(null, 'auto_preimport');
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

export async function updateGroup(groupId, newName) {
  if (groupId === PINNED_GROUP_ID || groupId === UNGROUPED_GROUP_ID) {
    throw serviceError('builtinGroupNoDelete', 'System built-in groups cannot be modified');
  }
  const name = String(newName || '').trim();
  if (!name) {
    throw serviceError('invalidParams', 'Group name cannot be empty');
  }
  const groups = await getGroups();
  const target = groups.find(g => g.id === groupId);
  if (!target) {
    throw serviceError('groupNotFound', `Group with ID "${groupId}" not found`);
  }
  return await saveGroup({ id: groupId, name });
}

export async function deleteGroup(groupId) {
  if (groupId === PINNED_GROUP_ID || groupId === UNGROUPED_GROUP_ID) {
    throw serviceError('builtinGroupNoDelete', 'System built-in groups cannot be deleted');
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
