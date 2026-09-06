/**
 * AI 智能治理与批量更新 (AI Batch Operations)
 */
import { setStorageData, withStorageLock, STORAGE_KEYS } from './base.js';
import { PINNED_GROUP_ID, UNGROUPED_GROUP_ID } from '../../constants/index.js';
import { getBookmarks } from './bookmark.js';
import { getGroups } from './group.js';
import { createSnapshot } from './backup.js';

/**
 * 弹性提取书签 ID (兼容数字、字符串、空格以及多样字段名)
 */
function extractBookmarkId(item) {
  if (!item || typeof item !== 'object') return '';
  const rawId = item.bookmarkId !== undefined ? item.bookmarkId : (item.id !== undefined ? item.id : item.bmId);
  return rawId !== undefined && rawId !== null ? String(rawId).trim() : '';
}

/**
 * 弹性提取标签列表 (兼容数组、逗号字符串、中英标点、多字段名)
 */
function extractPlanTags(item) {
  if (!item || typeof item !== 'object') return [];
  const rawTags = item.suggestedTags !== undefined
    ? item.suggestedTags
    : (item.tags !== undefined
      ? item.tags
      : (item.suggested_tags !== undefined ? item.suggested_tags : item.labels));

  if (Array.isArray(rawTags)) {
    const list = [];
    for (const t of rawTags) {
      if (typeof t === 'string') {
        // 兼容标签内部带有中英文逗号的分割: '工具, Markdown' 或 '工具，Markdown'
        const parts = t.split(/[,，]/).map(p => p.trim()).filter(Boolean);
        list.push(...parts);
      } else if (t !== null && t !== undefined) {
        const s = String(t).trim();
        if (s) list.push(s);
      }
    }
    return Array.from(new Set(list));
  }

  if (typeof rawTags === 'string') {
    return Array.from(new Set(rawTags.split(/[,，]/).map(t => t.trim()).filter(Boolean)));
  }

  return [];
}

/**
 * 弹性提取目标分组名称
 */
function extractTargetGroupName(item) {
  if (!item || typeof item !== 'object') return '';
  const raw = item.targetGroupName !== undefined
    ? item.targetGroupName
    : (item.groupName !== undefined
      ? item.groupName
      : (item.group !== undefined ? item.group : item.targetGroup));
  return raw !== undefined && raw !== null ? String(raw).trim() : '';
}

/**
 * 批量更新书签属性 (支持更新分组、标签、标题等)
 */
export async function batchUpdateBookmarks(updates = []) {
  if (!Array.isArray(updates) || updates.length === 0) return [];

  return withStorageLock(async () => {
    const bookmarks = await getBookmarks();
    const updateMap = new Map();
    for (const u of updates) {
      const bId = extractBookmarkId(u);
      if (bId) updateMap.set(bId, u);
    }

    let modifiedCount = 0;
    const updatedBookmarks = bookmarks.map(bm => {
      const bmIdStr = String(bm.id);
      if (updateMap.has(bmIdStr)) {
        const u = updateMap.get(bmIdStr);
        modifiedCount++;
        return {
          ...bm,
          ...(u.groupId !== undefined ? { groupId: u.groupId } : {}),
          ...(u.tags !== undefined ? { tags: Array.isArray(u.tags) ? u.tags : bm.tags } : {}),
          ...(u.name !== undefined ? { name: String(u.name).trim() } : {}),
          updatedAt: Date.now()
        };
      }
      return bm;
    });

    if (modifiedCount > 0) {
      await setStorageData(STORAGE_KEYS.BOOKMARKS, updatedBookmarks);
    }
    return updatedBookmarks;
  });
}

/**
 * 应用 AI 智能分组建议 (自动创建必要的新分组并迁移书签)
 * @param {Array<{ bookmarkId: string, targetGroupName: string, isNewGroup?: boolean }>} plan
 */
export async function batchApplyAiGroups(plan = []) {
  if (!Array.isArray(plan) || plan.length === 0) return { modifiedCount: 0 };

  return withStorageLock(async () => {
    // 1. 执行前安全快照备份 (reason 按 type 由 UI 本地化渲染)
    await createSnapshot(null, 'auto_ai_group');

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
      const groupName = extractTargetGroupName(item);
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
    const bmPlanMap = new Map();
    for (const p of plan) {
      const bId = extractBookmarkId(p);
      if (bId) bmPlanMap.set(bId, p);
    }

    let modifiedCount = 0;
    const updatedBookmarks = currentBookmarks.map(bm => {
      const bmIdStr = String(bm.id);
      if (bmPlanMap.has(bmIdStr)) {
        const item = bmPlanMap.get(bmIdStr);
        const targetName = extractTargetGroupName(item);
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
  });
}

/**
 * 应用 AI 智能标签建议
 * @param {Array<{ bookmarkId: string, suggestedTags: string[] }>} plan
 * @param {'append'|'replace'} mode
 */
export async function batchApplyAiTags(plan = [], mode = 'append') {
  if (!Array.isArray(plan) || plan.length === 0) return { modifiedCount: 0 };

  return withStorageLock(async () => {
    // 1. 执行前安全快照备份 (reason 按 type 由 UI 本地化渲染)
    await createSnapshot(null, 'auto_ai_tag');

    const currentBookmarks = await getBookmarks();
    const planMap = new Map();
    for (const p of plan) {
      const bId = extractBookmarkId(p);
      if (bId) planMap.set(bId, p);
    }

    let modifiedCount = 0;
    const updatedBookmarks = currentBookmarks.map(bm => {
      const bmIdStr = String(bm.id);
      if (planMap.has(bmIdStr)) {
        const item = planMap.get(bmIdStr);
        const incomingTags = extractPlanTags(item);

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
          const oldTagStr = (bm.tags || []).slice().sort().join(',');
          const newTagStr = finalTags.slice().sort().join(',');
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
  });
}

/**
 * 原子化批量整理书签 (统一处理分组迁移与标签打标，单次快照，单次读写，彻底根除中间态并发与脏覆盖)
 *
 * @param {Object} params
 * @param {Array<{ bookmarkId: string|number, targetGroupName?: string }>} [params.groupPlan]
 * @param {Array<{ bookmarkId: string|number, suggestedTags?: string[]|string, tags?: string[]|string }>} [params.tagPlan]
 * @param {'append'|'replace'} [params.tagMode='append']
 * @param {string} [params.snapshotReason]
 * @param {string} [params.snapshotType='auto_mcp']
 */
export async function batchOrganizeBookmarks({
  groupPlan = [],
  tagPlan = [],
  tagMode = 'append',
  snapshotReason = '[AI/MCP] Batch organize bookmarks (groups & tags)',
  snapshotType = 'auto_mcp'
} = {}) {
  const hasGroupPlan = Array.isArray(groupPlan) && groupPlan.length > 0;
  const hasTagPlan = Array.isArray(tagPlan) && tagPlan.length > 0;

  if (!hasGroupPlan && !hasTagPlan) {
    return {
      success: true,
      groupChanges: 0,
      newGroupsCreated: 0,
      tagChanges: 0
    };
  }

  return withStorageLock(async () => {
    // 1. 仅创建 1 次安全快照，极大节省 I/O 并避免快照挤占
    await createSnapshot(snapshotReason, snapshotType);

    // 2. 仅读 1 次当前数据
    const currentGroups = await getGroups();
    const currentBookmarks = await getBookmarks();

    // 3. 处理分组计划（预建新分组）
    const groupMap = new Map();
    for (const g of currentGroups) {
      groupMap.set(g.name.trim().toLowerCase(), g);
    }

    const customGroups = currentGroups.filter(g => g.id !== PINNED_GROUP_ID && g.id !== UNGROUPED_GROUP_ID);
    let newGroupsCreated = 0;

    const groupPlanMap = new Map();
    if (hasGroupPlan) {
      for (const item of groupPlan) {
        const bId = extractBookmarkId(item);
        const groupName = extractTargetGroupName(item);
        if (!groupName) continue;
        if (bId) groupPlanMap.set(bId, groupName);

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
    }

    const pinnedGroup = currentGroups.find(g => g.id === PINNED_GROUP_ID) || { id: PINNED_GROUP_ID, name: '常用', isPinned: true, order: 0 };
    const ungroupedGroup = currentGroups.find(g => g.id === UNGROUPED_GROUP_ID) || { id: UNGROUPED_GROUP_ID, name: '未分组', isUngrouped: true, isDefaultCollapsed: false, order: 9999 };
    const mergedGroups = [pinnedGroup, ...customGroups, ungroupedGroup];

    // 4. 处理标签计划（映射 ID -> 规整后的标签）
    const tagPlanMap = new Map();
    if (hasTagPlan) {
      for (const item of tagPlan) {
        const bId = extractBookmarkId(item);
        const tags = extractPlanTags(item);
        if (bId && tags.length > 0) {
          tagPlanMap.set(bId, tags);
        }
      }
    }

    // 5. 单遍遍历书签，同时更新分组与标签
    let groupModifiedCount = 0;
    let tagModifiedCount = 0;

    const updatedBookmarks = currentBookmarks.map(bm => {
      const bmIdStr = String(bm.id);
      let isBmModified = false;
      let newGroupId = bm.groupId;
      let newTags = Array.isArray(bm.tags) ? [...bm.tags] : [];

      // 应用分组迁移
      if (groupPlanMap.has(bmIdStr)) {
        const targetName = groupPlanMap.get(bmIdStr);
        const targetGroup = groupMap.get(targetName.toLowerCase());
        if (targetGroup && bm.groupId !== targetGroup.id) {
          newGroupId = targetGroup.id;
          groupModifiedCount++;
          isBmModified = true;
        }
      }

      // 应用标签打标
      if (tagPlanMap.has(bmIdStr)) {
        const incomingTags = tagPlanMap.get(bmIdStr);
        let finalTags = [];
        if (tagMode === 'replace') {
          finalTags = Array.from(new Set(incomingTags));
        } else {
          finalTags = Array.from(new Set([...newTags, ...incomingTags]));
        }

        const oldTagStr = (bm.tags || []).slice().sort().join(',');
        const newTagStr = finalTags.slice().sort().join(',');
        if (oldTagStr !== newTagStr) {
          newTags = finalTags;
          tagModifiedCount++;
          isBmModified = true;
        }
      }

      if (isBmModified) {
        return {
          ...bm,
          groupId: newGroupId,
          tags: newTags,
          updatedAt: Date.now()
        };
      }
      return bm;
    });

    // 6. 仅在确实有改动时分别写盘一次
    if (newGroupsCreated > 0) {
      await setStorageData(STORAGE_KEYS.GROUPS, mergedGroups);
    }
    if (groupModifiedCount > 0 || tagModifiedCount > 0) {
      await setStorageData(STORAGE_KEYS.BOOKMARKS, updatedBookmarks);
    }

    return {
      success: true,
      message: 'External LLM governance plan applied atomically',
      groupChanges: groupModifiedCount,
      newGroupsCreated,
      tagChanges: tagModifiedCount,
      groups: mergedGroups,
      bookmarks: updatedBookmarks
    };
  });
}

