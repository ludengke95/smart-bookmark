/**
 * AI 智能治理与批量更新 (AI Batch Operations)
 *
 * 基于 Dexie 事务执行大模型结果的原子清洗与持久化。
 */
import { withStorageLock } from './base.js';
import { PINNED_GROUP_ID, UNGROUPED_GROUP_ID } from '../../constants/index.js';
import { db } from './db.js';
import { broadcastStorageChange } from './sync.js';
import { getBookmarks } from './bookmark.js';
import { getGroups } from './group.js';
import { createSnapshot } from './backup.js';
import { ensureTagsExist } from './tag.js';

function extractBookmarkId(item) {
  if (!item || typeof item !== 'object') return '';
  const rawId = item.bookmarkId !== undefined ? item.bookmarkId : (item.id !== undefined ? item.id : item.bmId);
  return rawId !== undefined && rawId !== null ? String(rawId).trim() : '';
}

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
 * 批量更新书签属性
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
    const allTagNamesToEnsure = [];
    for (const u of updates) {
      if (u.tags && Array.isArray(u.tags)) {
        allTagNamesToEnsure.push(...u.tags);
      }
    }
    const matchedTagEntities = await ensureTagsExist(allTagNamesToEnsure);
    const tagEntityMap = new Map(matchedTagEntities.map(t => [t.name, t]));

    const updatedBookmarks = [];
    for (const bm of bookmarks) {
      const patch = updateMap.get(bm.id);
      if (patch) {
        modifiedCount++;
        const nextBm = { ...bm, ...patch, id: bm.id, updatedAt: Date.now() };
        if (Array.isArray(nextBm.tags)) {
          nextBm.tagIds = nextBm.tags.map(t => tagEntityMap.get(t)?.id).filter(Boolean);
        }
        updatedBookmarks.push(nextBm);
      } else {
        updatedBookmarks.push(bm);
      }
    }

    if (modifiedCount > 0) {
      await db.bookmarks.bulkPut(updatedBookmarks);
      broadcastStorageChange({ type: 'BOOKMARKS_CHANGED', action: 'batch_update', count: modifiedCount });
    }

    return updatedBookmarks;
  });
}

/**
 * 批量应用智能分组方案
 */
export async function batchApplyAiGroups(groupPlan = []) {
  if (!Array.isArray(groupPlan) || groupPlan.length === 0) {
    return { success: false, appliedCount: 0, message: 'Empty group plan' };
  }

  return withStorageLock(async () => {
    await createSnapshot(null, 'auto_ai_grouping');

    return await db.transaction('rw', [db.groups, db.bookmarks], async () => {
      const existingGroups = await getGroups();
      const groupMap = new Map();
      for (const g of existingGroups) {
        groupMap.set(g.name.toLowerCase(), g);
      }

      let maxOrder = 0;
      for (const g of existingGroups) {
        if (g.id !== PINNED_GROUP_ID && g.id !== UNGROUPED_GROUP_ID) {
          if (typeof g.order === 'number' && g.order > maxOrder) maxOrder = g.order;
        }
      }

      const targetGroupNames = new Set();
      for (const item of groupPlan) {
        const name = extractTargetGroupName(item);
        if (name && name !== '未分组' && name !== '常用') {
          targetGroupNames.add(name);
        }
      }

      const newGroupsToCreate = [];
      const now = Date.now();
      for (const name of targetGroupNames) {
        if (!groupMap.has(name.toLowerCase())) {
          maxOrder += 1;
          const newG = {
            id: 'grp_' + now + '_' + Math.random().toString(36).substring(2, 8),
            name,
            order: maxOrder,
            isPinned: false,
            isUngrouped: false
          };
          newGroupsToCreate.push(newG);
          groupMap.set(name.toLowerCase(), newG);
        }
      }

      if (newGroupsToCreate.length > 0) {
        await db.groups.bulkPut(newGroupsToCreate);
      }

      const planMap = new Map();
      for (const item of groupPlan) {
        const bId = extractBookmarkId(item);
        const gName = extractTargetGroupName(item);
        if (bId && gName) {
          planMap.set(bId, gName);
        }
      }

      const bookmarks = await db.bookmarks.toArray();
      let appliedCount = 0;
      const modifiedBms = [];

      for (const bm of bookmarks) {
        const targetName = planMap.get(bm.id);
        if (targetName) {
          let targetGroupId = UNGROUPED_GROUP_ID;
          if (targetName === '未分组') {
            targetGroupId = UNGROUPED_GROUP_ID;
          } else {
            const matched = groupMap.get(targetName.toLowerCase());
            if (matched) targetGroupId = matched.id;
          }

          if (bm.groupId !== targetGroupId) {
            bm.groupId = targetGroupId;
            bm.updatedAt = Date.now();
            appliedCount++;
            modifiedBms.push(bm);
          }
        }
      }

      if (modifiedBms.length > 0) {
        await db.bookmarks.bulkPut(modifiedBms);
      }

      broadcastStorageChange({ type: 'GROUPS_CHANGED', action: 'ai_apply' });
      broadcastStorageChange({ type: 'BOOKMARKS_CHANGED', action: 'ai_apply' });

      return {
        success: true,
        appliedCount,
        newGroupsCreated: newGroupsToCreate.length,
        groups: await getGroups(),
        bookmarks: await getBookmarks()
      };
    });
  });
}

/**
 * 批量应用智能标签方案
 */
export async function batchApplyAiTags(tagPlan = [], mode = 'append') {
  if (!Array.isArray(tagPlan) || tagPlan.length === 0) {
    return { success: false, appliedCount: 0, message: 'Empty tag plan' };
  }

  return withStorageLock(async () => {
    await createSnapshot(null, 'auto_ai_tagging');

    const planMap = new Map();
    const allTags = [];
    for (const item of tagPlan) {
      const bId = extractBookmarkId(item);
      const suggested = extractPlanTags(item);
      if (bId && suggested.length > 0) {
        planMap.set(bId, suggested);
        allTags.push(...suggested);
      }
    }

    const matchedEntities = await ensureTagsExist(allTags);
    const tagEntityMap = new Map(matchedEntities.map(t => [t.name, t]));

    const bookmarks = await db.bookmarks.toArray();
    let appliedCount = 0;
    const modifiedBms = [];

    for (const bm of bookmarks) {
      const newTags = planMap.get(bm.id);
      if (newTags && newTags.length > 0) {
        let finalTags = [];
        if (mode === 'replace') {
          finalTags = newTags;
        } else {
          finalTags = Array.from(new Set([...(bm.tags || []), ...newTags]));
        }

        const finalTagIds = finalTags.map(t => tagEntityMap.get(t)?.id).filter(Boolean);

        bm.tags = finalTags;
        bm.tagIds = finalTagIds;
        bm.updatedAt = Date.now();
        appliedCount++;
        modifiedBms.push(bm);
      }
    }

    if (modifiedBms.length > 0) {
      await db.bookmarks.bulkPut(modifiedBms);
    }

    broadcastStorageChange({ type: 'BOOKMARKS_CHANGED', action: 'ai_tag_apply' });

    return {
      success: true,
      appliedCount,
      bookmarks: await getBookmarks()
    };
  });
}

/**
 * 原子化批量整理 (合并执行分组迁移与标签打标，仅产出 1 份快照)
 */
export async function batchOrganizeBookmarks({ groupPlan = [], tagPlan = [], tagMode = 'append' }) {
  const hasGroups = Array.isArray(groupPlan) && groupPlan.length > 0;
  const hasTags = Array.isArray(tagPlan) && tagPlan.length > 0;

  if (!hasGroups && !hasTags) {
    return { success: false, groupChanges: 0, tagChanges: 0, newGroupsCreated: 0, message: 'Empty plans' };
  }

  return withStorageLock(async () => {
    await createSnapshot(null, 'auto_ai_organize');

    // 预解析所有标签
    const allTags = [];
    if (hasTags) {
      for (const item of tagPlan) {
        allTags.push(...extractPlanTags(item));
      }
    }
    const matchedTagEntities = await ensureTagsExist(allTags);
    const tagEntityMap = new Map(matchedTagEntities.map(t => [t.name, t]));

    return await db.transaction('rw', [db.groups, db.bookmarks], async () => {
      let newGroupsCreated = 0;
      const groupMap = new Map();

      if (hasGroups) {
        const existingGroups = await getGroups();
        for (const g of existingGroups) groupMap.set(g.name.toLowerCase(), g);

        let maxOrder = 0;
        for (const g of existingGroups) {
          if (g.id !== PINNED_GROUP_ID && g.id !== UNGROUPED_GROUP_ID && typeof g.order === 'number' && g.order > maxOrder) {
            maxOrder = g.order;
          }
        }

        const targetGroupNames = new Set();
        for (const item of groupPlan) {
          const name = extractTargetGroupName(item);
          if (name && name !== '未分组' && name !== '常用') targetGroupNames.add(name);
        }

        const newGroupsToCreate = [];
        const now = Date.now();
        for (const name of targetGroupNames) {
          if (!groupMap.has(name.toLowerCase())) {
            maxOrder += 1;
            const newG = {
              id: 'grp_' + now + '_' + Math.random().toString(36).substring(2, 8),
              name,
              order: maxOrder,
              isPinned: false,
              isUngrouped: false
            };
            newGroupsToCreate.push(newG);
            groupMap.set(name.toLowerCase(), newG);
          }
        }

        if (newGroupsToCreate.length > 0) {
          await db.groups.bulkPut(newGroupsToCreate);
          newGroupsCreated = newGroupsToCreate.length;
        }
      }

      const groupPlanMap = new Map();
      if (hasGroups) {
        for (const item of groupPlan) {
          const bId = extractBookmarkId(item);
          const gName = extractTargetGroupName(item);
          if (bId && gName) groupPlanMap.set(bId, gName);
        }
      }

      const tagPlanMap = new Map();
      if (hasTags) {
        for (const item of tagPlan) {
          const bId = extractBookmarkId(item);
          const suggested = extractPlanTags(item);
          if (bId && suggested.length > 0) tagPlanMap.set(bId, suggested);
        }
      }

      const bookmarks = await db.bookmarks.toArray();
      let groupChanges = 0;
      let tagChanges = 0;
      const modifiedBms = [];

      for (const bm of bookmarks) {
        let changed = false;

        // 分组处理
        if (groupPlanMap.has(bm.id)) {
          const targetName = groupPlanMap.get(bm.id);
          let targetGroupId = UNGROUPED_GROUP_ID;
          if (targetName !== '未分组') {
            const matched = groupMap.get(targetName.toLowerCase());
            if (matched) targetGroupId = matched.id;
          }
          if (bm.groupId !== targetGroupId) {
            bm.groupId = targetGroupId;
            groupChanges++;
            changed = true;
          }
        }

        // 标签处理
        if (tagPlanMap.has(bm.id)) {
          const newTags = tagPlanMap.get(bm.id);
          let finalTags = [];
          if (tagMode === 'replace') {
            finalTags = newTags;
          } else {
            finalTags = Array.from(new Set([...(bm.tags || []), ...newTags]));
          }
          const finalTagIds = finalTags.map(t => tagEntityMap.get(t)?.id).filter(Boolean);

          bm.tags = finalTags;
          bm.tagIds = finalTagIds;
          tagChanges++;
          changed = true;
        }

        if (changed) {
          bm.updatedAt = Date.now();
          modifiedBms.push(bm);
        }
      }

      if (modifiedBms.length > 0) {
        await db.bookmarks.bulkPut(modifiedBms);
      }

      broadcastStorageChange({ type: 'ALL_CHANGED', action: 'batch_organize' });

      return {
        success: true,
        groupChanges,
        tagChanges,
        newGroupsCreated,
        groups: await getGroups(),
        bookmarks: await getBookmarks()
      };
    });
  });
}
