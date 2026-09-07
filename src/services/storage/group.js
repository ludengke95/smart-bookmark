/**
 * 分组 (Groups) CRUD 与标签统计
 *
 * 基于 Dexie.js 实现分组实体管理与关联级联维护。
 */
import { withStorageLock } from './base.js';
import {
  DEFAULT_GROUPS,
  PINNED_GROUP_ID,
  UNGROUPED_GROUP_ID
} from '../../constants/index.js';
import { db } from './db.js';
import { broadcastStorageChange } from './sync.js';
import { getBookmarks } from './bookmark.js';
import { getClickStats } from './stats.js';
import { getAllTags } from './tag.js';
import { createSnapshot, getBackupSettings } from './backup.js';
import { serviceError } from '../errors.js';

/**
 * 获取所有分组列表 (内置常用组首位，内置未分组末位)
 */
export async function getGroups() {
  const groups = await db.groups.orderBy('order').toArray();
  const list = groups.length > 0 ? groups : DEFAULT_GROUPS;

  let pinnedGroup = list.find(g => g.id === PINNED_GROUP_ID || g.isPinned);
  let ungroupedGroup = list.find(g => g.id === UNGROUPED_GROUP_ID || g.isUngrouped);

  if (!pinnedGroup) {
    pinnedGroup = { id: PINNED_GROUP_ID, name: '常用', isPinned: true, order: 0 };
  }
  if (!ungroupedGroup) {
    ungroupedGroup = { id: UNGROUPED_GROUP_ID, name: '未分组', isUngrouped: true, isDefaultCollapsed: false, order: 9999 };
  }

  const customGroups = list.filter(g => g.id !== PINNED_GROUP_ID && g.id !== UNGROUPED_GROUP_ID);
  customGroups.sort((a, b) => (a.order || 0) - (b.order || 0));

  return [pinnedGroup, ...customGroups, ungroupedGroup];
}

/**
 * 保存单个分组
 */
export async function saveGroup(group) {
  if (group.id === PINNED_GROUP_ID || group.id === UNGROUPED_GROUP_ID) {
    throw serviceError('builtinGroupNoModify', 'System built-in groups cannot be modified');
  }
  const name = String(group.name || '').trim();
  if (!name) {
    throw serviceError('invalidParams', 'Group name cannot be empty');
  }

  return await withStorageLock(async () => {
    const existing = group.id ? await db.groups.get(group.id) : null;
    const allGroups = await db.groups.toArray();

    // 检查重名 (忽略大小写)
    const duplicate = allGroups.find(g => g.name.toLowerCase() === name.toLowerCase() && g.id !== group.id);
    if (duplicate) {
      throw serviceError('duplicateGroupName', `Group with name "${name}" already exists`);
    }

    let order = typeof group.order === 'number' ? group.order : existing?.order;
    if (order === undefined) {
      const customOrders = allGroups
        .filter(g => g.id !== PINNED_GROUP_ID && g.id !== UNGROUPED_GROUP_ID)
        .map(g => g.order || 0);
      order = customOrders.length > 0 ? Math.max(...customOrders) + 1 : 1;
    }

    const cleanGroup = {
      ...existing,
      ...group,
      id: group.id ? String(group.id) : ('grp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8)),
      name,
      order,
      isPinned: false,
      isUngrouped: false
    };

    await db.groups.put(cleanGroup);
    broadcastStorageChange({ type: 'GROUPS_CHANGED', action: 'save', id: cleanGroup.id, data: cleanGroup });

    return await getGroups();
  });
}

/**
 * 批量导入数据 (包含书签与分组)
 */
export async function batchImportData({ newGroups = [], newBookmarks = [] }) {
  return await withStorageLock(async () => {
    const backupSettings = await getBackupSettings();
    if (backupSettings.preActionAutoBackup) {
      try {
        await createSnapshot(null, 'auto_import');
      } catch (e) {
        console.warn('Pre-import backup snapshot failed:', e);
      }
    }

    await db.transaction('rw', [db.groups, db.bookmarks, db.tags], async () => {
      const existingGroups = await db.groups.toArray();
      const groupNameMap = new Map(existingGroups.map(g => [g.name.toLowerCase(), g]));
      let maxGroupOrder = 0;
      for (const g of existingGroups) {
        if (typeof g.order === 'number' && g.order > maxGroupOrder) maxGroupOrder = g.order;
      }

      const normalizedGroups = [];
      const now = Date.now();

      for (const g of newGroups) {
        if (!g || !g.name) continue;
        const gName = String(g.name).trim();
        if (!gName) continue;

        let matched = groupNameMap.get(gName.toLowerCase());
        if (!matched) {
          maxGroupOrder += 1;
          const newG = {
            id: g.id ? String(g.id) : ('grp_' + now + '_' + Math.random().toString(36).substring(2, 8)),
            name: gName,
            order: typeof g.order === 'number' ? g.order : maxGroupOrder,
            isPinned: Boolean(g.isPinned),
            isUngrouped: Boolean(g.isUngrouped),
            isDefaultCollapsed: Boolean(g.isDefaultCollapsed)
          };
          normalizedGroups.push(newG);
          groupNameMap.set(gName.toLowerCase(), newG);
        }
      }

      if (normalizedGroups.length > 0) {
        await db.groups.bulkPut(normalizedGroups);
      }

      if (newBookmarks.length > 0) {
        // 提取全部导入标签，同步确保 Tag 表记录存在
        const allTagNames = [];
        for (const bm of newBookmarks) {
          if (Array.isArray(bm.tags)) {
            allTagNames.push(...bm.tags);
          }
        }
        const cleanTagNames = Array.from(new Set(allTagNames.map(t => String(t || '').trim()).filter(Boolean)));

        const existingTags = await db.tags.where('name').anyOf(cleanTagNames).toArray();
        const tagMap = new Map(existingTags.map(t => [t.name, t]));
        const newTags = [];
        let tagOrder = await db.tags.count();
        const now = Date.now();

        for (const name of cleanTagNames) {
          if (!tagMap.has(name)) {
            tagOrder += 1;
            const newT = {
              id: 'tag_' + now + '_' + Math.random().toString(36).substring(2, 8),
              name,
              order: tagOrder,
              createdAt: now,
              updatedAt: now
            };
            newTags.push(newT);
            tagMap.set(name, newT);
          }
        }

        if (newTags.length > 0) {
          await db.tags.bulkPut(newTags);
        }

        // 规范化补齐每个导入书签的 id、groupId、tagIds
        let currentBmOrder = await db.bookmarks.count();
        const normalizedBookmarks = newBookmarks.map((bm, index) => {
          const rawTags = Array.isArray(bm.tags) ? bm.tags : [];
          const tagIds = rawTags.map(t => tagMap.get(String(t).trim())?.id).filter(Boolean);
          const bId = bm.id ? String(bm.id) : ('bm_' + now + '_' + Math.random().toString(36).substring(2, 8));

          let groupId = bm.groupId;
          if (!groupId && bm.folder) {
            const matchedGrp = groupNameMap.get(String(bm.folder).trim().toLowerCase());
            if (matchedGrp) groupId = matchedGrp.id;
          }
          if (!groupId) groupId = UNGROUPED_GROUP_ID;

          return {
            ...bm,
            id: bId,
            groupId,
            tagIds,
            tags: rawTags,
            order: typeof bm.order === 'number' ? bm.order : (currentBmOrder + index),
            createdAt: bm.createdAt || now,
            updatedAt: bm.updatedAt || now
          };
        });

        await db.bookmarks.bulkPut(normalizedBookmarks);
      }
    });

    broadcastStorageChange({ type: 'GROUPS_CHANGED', action: 'batch_import' });
    broadcastStorageChange({ type: 'BOOKMARKS_CHANGED', action: 'batch_import' });
    broadcastStorageChange({ type: 'TAGS_CHANGED', action: 'batch_import' });

    return {
      groups: await getGroups(),
      bookmarks: await getBookmarks()
    };
  });
}

/**
 * 重命名分组
 */
export async function updateGroup(groupId, newName) {
  if (groupId === PINNED_GROUP_ID || groupId === UNGROUPED_GROUP_ID) {
    throw serviceError('builtinGroupNoDelete', 'System built-in groups cannot be modified');
  }
  const name = String(newName || '').trim();
  if (!name) {
    throw serviceError('invalidParams', 'Group name cannot be empty');
  }

  return await withStorageLock(async () => {
    const target = await db.groups.get(groupId);
    if (!target) {
      throw serviceError('groupNotFound', `Group with ID "${groupId}" not found`);
    }

    target.name = name;
    await db.groups.put(target);
    broadcastStorageChange({ type: 'GROUPS_CHANGED', action: 'update', id: groupId, data: target });

    return await getGroups();
  });
}

/**
 * 删除分组 (级联将其下所有书签回退到未分组 UNGROUPED_GROUP_ID)
 */
export async function deleteGroup(groupId) {
  if (groupId === PINNED_GROUP_ID || groupId === UNGROUPED_GROUP_ID) {
    throw serviceError('builtinGroupNoDelete', 'System built-in groups cannot be deleted');
  }

  return await withStorageLock(async () => {
    await db.transaction('rw', [db.groups, db.bookmarks], async () => {
      // 1. 删除分组实体
      await db.groups.delete(groupId);

      // 2. 级联重定向该分组下的书签
      const affected = await db.bookmarks.where('groupId').equals(groupId).toArray();
      if (affected.length > 0) {
        affected.forEach(bm => {
          bm.groupId = UNGROUPED_GROUP_ID;
          bm.updatedAt = Date.now();
        });
        await db.bookmarks.bulkPut(affected);
      }
    });

    broadcastStorageChange({ type: 'GROUPS_CHANGED', action: 'delete', id: groupId });
    broadcastStorageChange({ type: 'BOOKMARKS_CHANGED', action: 'cascade_ungroup' });

    return await getGroups();
  });
}

/**
 * 拖拽重排序分组
 */
export async function reorderGroups(orderedGroupIds) {
  return await withStorageLock(async () => {
    if (!Array.isArray(orderedGroupIds) || orderedGroupIds.length === 0) {
      return await getGroups();
    }

    await db.transaction('rw', db.groups, async () => {
      const groups = await db.groups.toArray();
      const groupMap = new Map(groups.map(g => [g.id, g]));
      const updated = [];

      let orderIdx = 1;
      for (const gId of orderedGroupIds) {
        if (gId === PINNED_GROUP_ID || gId === UNGROUPED_GROUP_ID) continue;
        const target = groupMap.get(gId);
        if (target) {
          target.order = orderIdx++;
          updated.push(target);
        }
      }

      if (updated.length > 0) {
        await db.groups.bulkPut(updated);
      }
    });

    broadcastStorageChange({ type: 'GROUPS_CHANGED', action: 'reorder' });
    return await getGroups();
  });
}

/**
 * 汇总全部标签列表及 30 天点击热度
 */
export async function getAllTagsWithCount() {
  const [tags, bookmarks, clickStats] = await Promise.all([
    getAllTags(),
    getBookmarks(),
    getClickStats('30d')
  ]);

  const tagCountMap = {};
  const tagClickMap = {};

  for (const bm of bookmarks) {
    const clicks = clickStats[bm.id] || 0;
    for (const tag of (bm.tags || [])) {
      tagCountMap[tag] = (tagCountMap[tag] || 0) + 1;
      tagClickMap[tag] = (tagClickMap[tag] || 0) + clicks;
    }
  }

  // 保证已在 Tag 表中的实体也展示（即使书签数量为 0）
  const knownTags = new Set(tags.map(t => t.name));
  for (const t of Object.keys(tagCountMap)) {
    knownTags.add(t);
  }

  return Array.from(knownTags).map(tagName => {
    const entity = tags.find(t => t.name === tagName);
    return {
      id: entity?.id || ('tag_' + tagName),
      name: tagName,
      count: tagCountMap[tagName] || 0,
      clickCount: tagClickMap[tagName] || 0
    };
  }).sort((a, b) => b.clickCount - a.clickCount || b.count - a.count);
}
