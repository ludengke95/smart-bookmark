/**
 * 书签 (Bookmarks) CRUD
 *
 * 基于 Dexie.js 实现行级高效持久化，
 * 消除整表反序列化与 I/O 放大，并与 Tag 表联动维护 tagIds。
 */
import { withStorageLock, deepCloneToRaw } from './base.js';
import {
  DEFAULT_BOOKMARKS,
  UNGROUPED_GROUP_ID
} from '../../constants/index.js';
import { db } from './db.js';
import { broadcastStorageChange } from './sync.js';
import { ensureTagsExist, renameTag as storageRenameTag, deleteTag as storageDeleteTag } from './tag.js';

/**
 * 规范化书签数据实体（阻断非标字段与原型链污染）
 */
export function normalizeBookmarkEntity(bm, fallbackOrder = 0) {
  if (!bm || typeof bm !== 'object') return null;
  const now = Date.now();
  const id = bm.id ? String(bm.id) : ('bm_' + now + '_' + Math.random().toString(36).substring(2, 8));

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
        return u ? {
          url: u,
          order: typeof ep.order === 'number' ? ep.order : idx,
          type: String(ep.type || 'extranet')
        } : null;
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

  const tags = Array.isArray(bm.tags) ? bm.tags.map(t => String(t || '').trim()).filter(Boolean) : [];
  const tagIds = Array.isArray(bm.tagIds) ? bm.tagIds.map(t => String(t || '').trim()).filter(Boolean) : [];

  return {
    id,
    name: String(bm.name || '').trim(),
    groupId: bm.groupId ? String(bm.groupId) : UNGROUPED_GROUP_ID,
    tagIds,
    tags,
    iconKey: String(bm.iconKey || ''),
    customIconBase64: String(bm.customIconBase64 || ''),
    endpoints,
    order: typeof bm.order === 'number' ? bm.order : fallbackOrder,
    createdAt: typeof bm.createdAt === 'number' ? bm.createdAt : now,
    updatedAt: typeof bm.updatedAt === 'number' ? bm.updatedAt : now
  };
}

/**
 * 获取所有书签列表 (按 order 升序，并做防御性字段清洗)
 */
export async function getBookmarks() {
  const rawList = await db.bookmarks.orderBy('order').toArray();
  const list = rawList.length > 0 ? rawList : DEFAULT_BOOKMARKS;

  return list.map(bm => {
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
      tagIds: Array.isArray(bm.tagIds) ? bm.tagIds : [],
      order: typeof bm.order === 'number' ? bm.order : 0,
      endpoints
    };
  }).filter(Boolean);
}

/**
 * 保存单个书签 (新增或修改，行级写入)
 */
export async function saveBookmark(bookmark) {
  return await withStorageLock(async () => {
    const bookmarkId = bookmark.id ? String(bookmark.id) : ('bm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8));

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

    // 标签处理：确保对应标签在 Tag 表中存在实体，并取得 tagIds
    const rawTags = Array.isArray(bookmark.tags) ? bookmark.tags : [];
    const matchedTags = await ensureTagsExist(rawTags);
    const tagIds = matchedTags.map(t => t.id);
    const tagNames = matchedTags.map(t => t.name);

    const existing = await db.bookmarks.get(bookmarkId);
    let order = typeof bookmark.order === 'number' ? bookmark.order : existing?.order;
    if (order === undefined) {
      order = await db.bookmarks.count();
    }

    const merged = {
      groupId: UNGROUPED_GROUP_ID,
      ...existing,
      ...bookmark,
      id: bookmarkId,
      endpoints: cleanEndpoints,
      tags: tagNames,
      tagIds,
      order,
      createdAt: bookmark.createdAt || existing?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    const cleanBm = normalizeBookmarkEntity(merged, order);

    await db.bookmarks.put(cleanBm);
    broadcastStorageChange({ type: 'BOOKMARKS_CHANGED', action: 'save', id: bookmarkId, data: cleanBm });

    // 保持原有方法签名返回值（返回全量列表）
    return await getBookmarks();
  });
}

/**
 * 删除单个书签
 */
export async function deleteBookmark(bookmarkId) {
  return await withStorageLock(async () => {
    await db.bookmarks.delete(bookmarkId);
    broadcastStorageChange({ type: 'BOOKMARKS_CHANGED', action: 'delete', id: bookmarkId });
    return await getBookmarks();
  });
}

/**
 * 批量删除书签
 */
export async function batchDeleteBookmarks(bookmarkIds) {
  return await withStorageLock(async () => {
    if (!Array.isArray(bookmarkIds) || bookmarkIds.length === 0) {
      return { deletedCount: 0, deletedIds: [] };
    }
    const idSet = Array.from(new Set(bookmarkIds.map(String)));
    await db.bookmarks.bulkDelete(idSet);
    broadcastStorageChange({ type: 'BOOKMARKS_CHANGED', action: 'batch_delete', count: idSet.length });
    return { deletedCount: idSet.length, deletedIds: idSet };
  });
}

/**
 * 批量/全量保存书签
 */
export async function saveAllBookmarks(bookmarks) {
  return await withStorageLock(async () => {
    const safeList = (Array.isArray(bookmarks) ? bookmarks : [])
      .map((bm, index) => normalizeBookmarkEntity(bm, index))
      .filter(Boolean);

    await db.transaction('rw', db.bookmarks, async () => {
      await db.bookmarks.clear();
      await db.bookmarks.bulkPut(safeList);
    });
    broadcastStorageChange({ type: 'BOOKMARKS_CHANGED', action: 'save_all' });
    return safeList;
  });
}

/**
 * 拖拽重排序
 */
export async function reorderBookmarks(orderedBookmarkIds) {
  return await withStorageLock(async () => {
    if (!Array.isArray(orderedBookmarkIds) || orderedBookmarkIds.length === 0) {
      return await getBookmarks();
    }

    await db.transaction('rw', db.bookmarks, async () => {
      const bms = await db.bookmarks.toArray();
      const bmMap = new Map(bms.map(b => [b.id, b]));
      const updated = [];

      orderedBookmarkIds.forEach((id, index) => {
        const target = bmMap.get(id);
        if (target) {
          target.order = index;
          target.updatedAt = Date.now();
          updated.push(target);
        }
      });

      if (updated.length > 0) {
        await db.bookmarks.bulkPut(updated);
      }
    });

    broadcastStorageChange({ type: 'BOOKMARKS_CHANGED', action: 'reorder' });
    return await getBookmarks();
  });
}

// 重导出标签治理方法，保持向前兼容
export { storageRenameTag as renameTag, storageDeleteTag as deleteTag };
