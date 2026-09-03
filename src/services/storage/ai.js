/**
 * AI 智能治理与批量更新 (AI Batch Operations)
 */
import { setStorageData, STORAGE_KEYS } from './base.js';
import { PINNED_GROUP_ID, UNGROUPED_GROUP_ID } from '../../constants/index.js';
import { getBookmarks } from './bookmark.js';
import { getGroups } from './group.js';
import { createSnapshot } from './backup.js';

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
