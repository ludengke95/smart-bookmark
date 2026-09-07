/**
 * 存储层基础原语与设置管理 (Storage Primitives & Settings)
 *
 * 基于 Dexie.js 实现底层持久化，保留 withStorageLock 可重入异步互斥锁，
 * 提供系统设置、初始化与清空数据等核心接口。
 */
import {
  DEFAULT_BOOKMARKS,
  DEFAULT_GROUPS,
  DEFAULT_SETTINGS
} from '../../constants/index.js';
import { db } from './db.js';
import { broadcastStorageChange } from './sync.js';

// 保留 STORAGE_KEYS 作为常量兼容导出
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

// 全局存储互斥锁队列 (保证复杂批量写入与事务原子排队)
let storageQueueTail = Promise.resolve();
let activeLockDepth = 0;

/**
 * 存储层异步互斥事务锁 (支持可重入，防止嵌套死锁)
 *
 * @template T
 * @param {(() => Promise<T>) | any} fnOrKeys
 * @param {() => Promise<T>} [optionalFn]
 * @returns {Promise<T>}
 */
export async function withStorageLock(fnOrKeys, optionalFn) {
  const asyncFn = typeof fnOrKeys === 'function' ? fnOrKeys : optionalFn;
  if (typeof asyncFn !== 'function') {
    throw new Error('withStorageLock expects an async function');
  }

  if (activeLockDepth > 0) {
    return await asyncFn();
  }

  let releaseCurrent;
  const currentTaskPromise = new Promise(resolve => {
    releaseCurrent = resolve;
  });

  const previousTail = storageQueueTail;
  storageQueueTail = currentTaskPromise;

  try {
    await previousTail.catch(() => {});
    activeLockDepth++;
    return await asyncFn();
  } finally {
    activeLockDepth--;
    releaseCurrent();
  }
}

/**
 * 兼容层：通用键值数据读取 (主要针对 appSettings 中的零散配置)
 */
export async function getStorageData(key, fallbackValue) {
  try {
    const record = await db.appSettings.get(key);
    if (record && record.value !== undefined) {
      return record.value;
    }
    return fallbackValue;
  } catch (err) {
    console.warn(`[Storage] getStorageData failed for ${key}:`, err);
    return fallbackValue;
  }
}

/**
 * 兼容层：通用键值数据写入
 */
export async function setStorageData(key, value) {
  try {
    await db.appSettings.put({ key, value });
  } catch (err) {
    console.warn(`[Storage] setStorageData failed for ${key}:`, err);
  }
}

/**
 * 安全原子读取-修改-写回原语
 */
export async function updateStorageData(key, updater, fallbackValue) {
  return withStorageLock(async () => {
    const current = await getStorageData(key, fallbackValue);
    const updated = await updater(current);
    if (updated !== undefined) {
      await setStorageData(key, updated);
    }
    return updated !== undefined ? updated : current;
  });
}

/**
 * 初始化存储
 * 检查数据库各实体表，若为空则注入系统默认数据（包括分组、书签、独立 Tag 实体和偏好设置）
 */
export async function initStorage() {
  return await withStorageLock(async () => {
    await db.transaction('rw', [db.groups, db.bookmarks, db.tags, db.appSettings], async () => {
      // 1. 初始化分组
      const groupCount = await db.groups.count();
      if (groupCount === 0) {
        await db.groups.bulkPut(DEFAULT_GROUPS);
      }

      // 2. 初始化书签与标签
      const bmCount = await db.bookmarks.count();
      if (bmCount === 0) {
        const tagMap = new Map();
        let tagOrder = 0;
        const now = Date.now();

        // 规范化默认书签并提取 tags 建立 Tag 实体
        const formattedBookmarks = DEFAULT_BOOKMARKS.map((bm, index) => {
          const rawTags = Array.isArray(bm.tags) ? bm.tags : [];
          const tagIds = [];

          for (const tName of rawTags) {
            const name = String(tName || '').trim();
            if (!name) continue;
            if (!tagMap.has(name)) {
              tagOrder += 1;
              const tagEntity = {
                id: 'tag_' + now + '_' + Math.random().toString(36).substring(2, 8),
                name,
                order: tagOrder,
                createdAt: now,
                updatedAt: now
              };
              tagMap.set(name, tagEntity);
            }
            tagIds.push(tagMap.get(name).id);
          }

          return {
            ...bm,
            id: bm.id ? String(bm.id) : ('bm_' + now + '_' + Math.random().toString(36).substring(2, 8)),
            order: typeof bm.order === 'number' ? bm.order : index,
            tags: rawTags,
            tagIds,
            createdAt: bm.createdAt || now,
            updatedAt: bm.updatedAt || now
          };
        });

        if (tagMap.size > 0) {
          await db.tags.bulkPut(Array.from(tagMap.values()));
        }
        await db.bookmarks.bulkPut(formattedBookmarks);
      }

      // 3. 初始化全局设置
      const settingsRecord = await db.appSettings.get('settings');
      if (!settingsRecord) {
        await db.appSettings.put({ key: 'settings', value: DEFAULT_SETTINGS });
      }
    });
  });
}

/**
 * 设置偏好读写
 */
export async function getSettings() {
  const record = await db.appSettings.get('settings');
  return record?.value ? { ...DEFAULT_SETTINGS, ...record.value } : DEFAULT_SETTINGS;
}

export async function saveSettings(partial) {
  return await withStorageLock(async () => {
    const current = await getSettings();
    const updated = { ...current, ...partial };
    await db.appSettings.put({ key: 'settings', value: updated });
    broadcastStorageChange({ type: 'SETTINGS_CHANGED', data: updated });
    return updated;
  });
}

/**
 * 清空所有数据并重新初始化出厂配置
 */
export async function clearAllData() {
  return await withStorageLock(async () => {
    await Promise.all([
      db.bookmarks.clear(),
      db.tags.clear(),
      db.groups.clear(),
      db.dailyClicks.clear(),
      db.bookmarkStats.clear(),
      db.snapshots.clear(),
      db.appSettings.clear()
    ]);
    await initStorage();
    broadcastStorageChange({ type: 'ALL_CHANGED' });
  });
}
