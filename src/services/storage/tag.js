/**
 * 标签 (Tags) 独立实体 CRUD 与关联管理
 *
 * 标签作为一等公民实体独立建表存储，具备唯一 id，
 * 书签通过内嵌 tagIds 关联对应标签实体。
 */
import { db } from './db.js';
import { broadcastStorageChange } from './sync.js';
import { withStorageLock } from './base.js';
import { serviceError } from '../errors.js';

export function generateTagId() {
  return 'tag_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
}

/**
 * 规范化标签实体
 */
export function normalizeTagEntity(tag, fallbackOrder = 0) {
  if (!tag || typeof tag !== 'object') return null;
  const now = Date.now();
  const id = tag.id ? String(tag.id) : generateTagId();
  return {
    id,
    name: String(tag.name || '').trim(),
    color: String(tag.color || ''),
    order: typeof tag.order === 'number' ? tag.order : fallbackOrder,
    createdAt: typeof tag.createdAt === 'number' ? tag.createdAt : now,
    updatedAt: typeof tag.updatedAt === 'number' ? tag.updatedAt : now
  };
}

/**
 * 获取所有标签列表 (按 order 升序)
 * @returns {Promise<Array<{ id: string, name: string, color?: string, order: number, createdAt: number, updatedAt: number }>>}
 */
export async function getAllTags() {
  return await db.tags.orderBy('order').toArray();
}

/**
 * 按 ID 或 Name 查找单个标签
 * @param {string} idOrName
 */
export async function getTag(idOrName) {
  if (!idOrName) return null;
  const byId = await db.tags.get(idOrName);
  if (byId) return byId;
  return await db.tags.where('name').equals(idOrName).first();
}

/**
 * 确保一组标签名在数据库中已存在实体，并返回映射后的 Tag 实体列表
 * @param {string[]} tagNames - 标签名数组
 * @returns {Promise<Array<{ id: string, name: string }>>}
 */
export async function ensureTagsExist(tagNames = []) {
  if (!Array.isArray(tagNames) || tagNames.length === 0) return [];

  const cleanNames = Array.from(new Set(tagNames.map(t => String(t || '').trim()).filter(Boolean)));
  if (cleanNames.length === 0) return [];

  return await withStorageLock(async () => {
    const existing = await db.tags.where('name').anyOf(cleanNames).toArray();
    const nameToTagMap = new Map();
    for (const t of existing) {
      nameToTagMap.set(t.name, t);
    }

    const newTags = [];
    const now = Date.now();
    let maxOrder = 0;
    const all = await db.tags.toArray();
    for (const t of all) {
      if (typeof t.order === 'number' && t.order > maxOrder) {
        maxOrder = t.order;
      }
    }

    for (const name of cleanNames) {
      if (!nameToTagMap.has(name)) {
        maxOrder += 1;
        const newEntity = {
          id: generateTagId(),
          name,
          order: maxOrder,
          createdAt: now,
          updatedAt: now
        };
        newTags.push(newEntity);
        nameToTagMap.set(name, newEntity);
      }
    }

    if (newTags.length > 0) {
      await db.tags.bulkPut(newTags);
      broadcastStorageChange({ type: 'TAGS_CHANGED', action: 'create_batch', count: newTags.length });
    }

    return cleanNames.map(name => nameToTagMap.get(name)).filter(Boolean);
  });
}

/**
 * 保存单个标签实体
 * @param {{ id?: string, name: string, color?: string, order?: number }} tag
 */
export async function saveTag(tag) {
  if (!tag || !tag.name) {
    throw serviceError('invalidParams', 'Tag name is required');
  }
  const name = String(tag.name).trim();
  if (!name) {
    throw serviceError('invalidParams', 'Tag name cannot be empty');
  }

  return await withStorageLock(async () => {
    const now = Date.now();
    const id = tag.id || generateTagId();

    // 检查是否存在同名且不同 ID 的标签
    const existingName = await db.tags.where('name').equals(name).first();
    if (existingName && existingName.id !== id) {
      throw serviceError('duplicateTag', `Tag with name "${name}" already exists`);
    }

    const existingTag = await db.tags.get(id);
    const cleanTag = normalizeTagEntity({
      id,
      name,
      color: tag.color || existingTag?.color || '',
      order: typeof tag.order === 'number' ? tag.order : (existingTag?.order || 0),
      createdAt: existingTag?.createdAt || now,
      updatedAt: now
    });

    await db.tags.put(cleanTag);
    broadcastStorageChange({ type: 'TAGS_CHANGED', action: 'save', id: cleanTag.id, data: cleanTag });
    return cleanTag;
  });
}

/**
 * 重命名标签，并原子联动更新关联书签中的 tags 与 tagIds
 * @param {string} oldName
 * @param {string} newName
 */
export async function renameTag(oldName, newName) {
  const oldN = String(oldName || '').trim();
  const newN = String(newName || '').trim();

  if (!oldN || !newN) {
    return { success: false, modifiedCount: 0, message: 'Invalid tag names' };
  }
  if (oldN === newN) {
    return { success: true, modifiedCount: 0 };
  }

  return await withStorageLock(async () => {
    return await db.transaction('rw', [db.tags, db.bookmarks], async () => {
      const targetTag = await db.tags.where('name').equals(oldN).first();
      const duplicateTag = await db.tags.where('name').equals(newN).first();

      let targetTagId = targetTag ? targetTag.id : null;
      let finalTagId = duplicateTag ? duplicateTag.id : targetTagId;

      if (!targetTagId) {
        // 如果旧 tag 实体不存在，直接先建新 tag
        finalTagId = generateTagId();
        await db.tags.put({
          id: finalTagId,
          name: newN,
          order: 0,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      } else if (duplicateTag && duplicateTag.id !== targetTagId) {
        // 合并场景：新名称已有实体，删除旧实体，书签映射到新实体
        await db.tags.delete(targetTagId);
      } else {
        // 正常改名
        await db.tags.update(targetTagId, { name: newN, updatedAt: Date.now() });
      }

      // 同步遍历书签中包含 oldN 的项
      const allBookmarks = await db.bookmarks.toArray();
      const affectedBookmarks = [];

      for (const bm of allBookmarks) {
        let changed = false;
        let tags = Array.isArray(bm.tags) ? [...bm.tags] : [];
        let tagIds = Array.isArray(bm.tagIds) ? [...bm.tagIds] : [];

        if (tags.includes(oldN)) {
          tags = Array.from(new Set(tags.map(t => (t === oldN ? newN : t))));
          changed = true;
        }

        if (targetTagId && tagIds.includes(targetTagId)) {
          tagIds = Array.from(new Set(tagIds.map(id => (id === targetTagId ? finalTagId : id))));
          changed = true;
        } else if (changed && finalTagId && !tagIds.includes(finalTagId)) {
          tagIds.push(finalTagId);
        }

        if (changed) {
          bm.tags = tags;
          bm.tagIds = tagIds;
          bm.updatedAt = Date.now();
          affectedBookmarks.push(bm);
        }
      }

      if (affectedBookmarks.length > 0) {
        await db.bookmarks.bulkPut(affectedBookmarks);
      }

      broadcastStorageChange({ type: 'TAGS_CHANGED', action: 'rename', data: { oldName: oldN, newName: newN } });
      broadcastStorageChange({ type: 'BOOKMARKS_CHANGED', action: 'batch' });

      return {
        success: true,
        modifiedCount: affectedBookmarks.length,
        bookmarks: await db.bookmarks.orderBy('order').toArray()
      };
    });
  });
}

/**
 * 删除标签，并从所有书签中彻底移除关联
 * @param {string} tagToDelete
 */
export async function deleteTag(tagToDelete) {
  const targetName = String(tagToDelete || '').trim();
  if (!targetName) {
    return { success: false, modifiedCount: 0, message: 'Invalid tag name' };
  }

  return await withStorageLock(async () => {
    return await db.transaction('rw', [db.tags, db.bookmarks], async () => {
      const targetTag = await db.tags.where('name').equals(targetName).first();
      const targetId = targetTag ? targetTag.id : null;

      if (targetId) {
        await db.tags.delete(targetId);
      }

      const allBookmarks = await db.bookmarks.toArray();
      const affectedBookmarks = [];

      for (const bm of allBookmarks) {
        let changed = false;
        let tags = Array.isArray(bm.tags) ? [...bm.tags] : [];
        let tagIds = Array.isArray(bm.tagIds) ? [...bm.tagIds] : [];

        if (tags.includes(targetName)) {
          tags = tags.filter(t => t !== targetName);
          changed = true;
        }
        if (targetId && tagIds.includes(targetId)) {
          tagIds = tagIds.filter(id => id !== targetId);
          changed = true;
        }

        if (changed) {
          bm.tags = tags;
          bm.tagIds = tagIds;
          bm.updatedAt = Date.now();
          affectedBookmarks.push(bm);
        }
      }

      if (affectedBookmarks.length > 0) {
        await db.bookmarks.bulkPut(affectedBookmarks);
      }

      broadcastStorageChange({ type: 'TAGS_CHANGED', action: 'delete', name: targetName });
      broadcastStorageChange({ type: 'BOOKMARKS_CHANGED', action: 'batch' });

      return {
        success: true,
        modifiedCount: affectedBookmarks.length,
        bookmarks: await db.bookmarks.orderBy('order').toArray()
      };
    });
  });
}
