/**
 * 数据快照、备份与完整 JSON 导入导出
 *
 * 基于 Dexie.js 实现快照持久化、自动淘汰与全量 JSON 备份回滚。
 */
import { withStorageLock, getSettings } from './base.js';
import {
  DEFAULT_BOOKMARKS,
  DEFAULT_GROUPS,
  DEFAULT_SETTINGS,
  DEFAULT_BACKUP_SETTINGS,
  BACKUP_INTERVAL_MS
} from '../../constants/index.js';
import { db } from './db.js';
import { broadcastStorageChange } from './sync.js';
import { getBookmarks } from './bookmark.js';
import { getGroups } from './group.js';
import { getAllTags } from './tag.js';
import { resetAllStats } from './stats.js';
import { serviceError } from '../errors.js';

export { DEFAULT_BACKUP_SETTINGS };

export async function getBackupSettings() {
  const record = await db.appSettings.get('backup_settings');
  return record?.value ? { ...DEFAULT_BACKUP_SETTINGS, ...record.value } : DEFAULT_BACKUP_SETTINGS;
}

export async function saveBackupSettings(partial) {
  return await withStorageLock(async () => {
    const current = await getBackupSettings();
    const updated = { ...current, ...partial };
    await db.appSettings.put({ key: 'backup_settings', value: updated });
    return updated;
  });
}

/**
 * 获取所有快照列表 (按时间逆序)
 */
export async function getSnapshots() {
  return await db.snapshots.orderBy('timestamp').reverse().toArray();
}

function formatSnapshotTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * 创建原子快照
 */
export async function createSnapshot(reason = null, type = 'manual', isLocked = false) {
  return await withStorageLock(async () => {
    const backupSettings = await getBackupSettings();
    const now = Date.now();
    const [bookmarks, groups, tags, settings] = await Promise.all([
      db.bookmarks.toArray(),
      db.groups.toArray(),
      db.tags.toArray(),
      getSettings()
    ]);

    const snapshotId = `snap_${now}_${Math.random().toString(36).substring(2, 8)}`;
    const snapshot = {
      id: snapshotId,
      timestamp: now,
      timeStr: formatSnapshotTime(now),
      reason: reason || (type === 'manual' ? '用户手动创建' : '系统自动备份'),
      type,
      isLocked: Boolean(isLocked),
      counts: {
        bookmarks: bookmarks.length,
        groups: groups.length,
        tags: tags.length
      },
      data: {
        bookmarks,
        groups,
        tags,
        settings
      }
    };

    await db.transaction('rw', db.snapshots, async () => {
      await db.snapshots.put(snapshot);

      // 配额限制淘汰：仅删除未锁定的最旧快照
      const maxSnapshots = Math.max(3, backupSettings.maxSnapshots || 15);
      const all = await db.snapshots.orderBy('timestamp').toArray();

      if (all.length > maxSnapshots) {
        const unlocked = all.filter(s => !s.isLocked);
        const overflowCount = all.length - maxSnapshots;
        const toDeleteIds = unlocked.slice(0, overflowCount).map(s => s.id);
        if (toDeleteIds.length > 0) {
          await db.snapshots.bulkDelete(toDeleteIds);
        }
      }
    });

    broadcastStorageChange({ type: 'SNAPSHOTS_CHANGED', action: 'create', id: snapshotId });
    return snapshot;
  });
}

/**
 * 删除单个快照
 */
export async function deleteSnapshot(snapshotId) {
  return await withStorageLock(async () => {
    await db.snapshots.delete(snapshotId);
    broadcastStorageChange({ type: 'SNAPSHOTS_CHANGED', action: 'delete', id: snapshotId });
    return await getSnapshots();
  });
}

/**
 * 切换快照锁定状态
 */
export async function toggleSnapshotLock(snapshotId) {
  return await withStorageLock(async () => {
    const snap = await db.snapshots.get(snapshotId);
    if (snap) {
      snap.isLocked = !snap.isLocked;
      await db.snapshots.put(snap);
      broadcastStorageChange({ type: 'SNAPSHOTS_CHANGED', action: 'toggle_lock', id: snapshotId });
    }
    return await getSnapshots();
  });
}

/**
 * 快照一键回滚
 */
export async function rollbackToSnapshot(snapshotId) {
  return await withStorageLock(async () => {
    const target = await db.snapshots.get(snapshotId);
    if (!target || !target.data) {
      throw serviceError('snapshotNotFound', `Snapshot "${snapshotId}" not found`);
    }

    // 回滚前自动创建安全快照
    try {
      await createSnapshot(null, 'auto_prerollback');
    } catch (e) {
      console.warn('Pre-rollback auto snapshot failed:', e);
    }

    await db.transaction('rw', [db.bookmarks, db.groups, db.tags, db.appSettings], async () => {
      if (Array.isArray(target.data.bookmarks)) {
        await db.bookmarks.clear();
        await db.bookmarks.bulkPut(target.data.bookmarks);
      }
      if (Array.isArray(target.data.groups)) {
        await db.groups.clear();
        await db.groups.bulkPut(target.data.groups);
      }
      if (Array.isArray(target.data.tags)) {
        await db.tags.clear();
        await db.tags.bulkPut(target.data.tags);
      }
      if (target.data.settings) {
        await db.appSettings.put({ key: 'settings', value: target.data.settings });
      }
    });

    broadcastStorageChange({ type: 'ALL_CHANGED', action: 'rollback' });
    return target;
  });
}

/**
 * 定期自动备份检查
 */
export async function checkDailyAutoBackup() {
  try {
    const settings = await getBackupSettings();
    if (!settings.autoBackupInterval || settings.autoBackupInterval === 'never') {
      return;
    }

    const intervalMs = BACKUP_INTERVAL_MS[settings.autoBackupInterval] || (24 * 60 * 60 * 1000);
    const now = Date.now();
    const lastBackupTime = settings.lastAutoBackupTime || 0;

    if (now - lastBackupTime >= intervalMs) {
      await createSnapshot(null, 'auto_daily');
      await saveBackupSettings({ lastAutoBackupTime: now });
    }
  } catch (err) {
    console.warn('Auto backup check failed:', err);
  }
}

/**
 * 导出全部数据为 JSON 字符串
 */
export async function exportFullBackupJson() {
  const [bookmarks, groups, tags, settings, bookmarkStats] = await Promise.all([
    getBookmarks(),
    getGroups(),
    getAllTags(),
    getSettings(),
    db.bookmarkStats.toArray()
  ]);

  const clickStats = {};
  const lastClicked = {};
  for (const s of bookmarkStats) {
    clickStats[s.bookmarkId] = s.totalClicks || 0;
    lastClicked[s.bookmarkId] = s.lastClicked || 0;
  }

  const exportPayload = {
    version: '2.0.0',
    exportTime: new Date().toISOString(),
    bookmarks,
    groups,
    tags,
    settings,
    clickStats,
    lastClicked
  };
  return JSON.stringify(exportPayload, null, 2);
}

/**
 * 从 JSON 字符串恢复全部数据
 */
export async function importFullBackupJson(jsonString) {
  try {
    const payload = JSON.parse(jsonString);
    if (!payload || typeof payload !== 'object') {
      return { success: false, message: 'Invalid JSON format' };
    }

    const hasBookmarks = Array.isArray(payload.bookmarks);
    const hasGroups = Array.isArray(payload.groups);

    if (!hasBookmarks && !hasGroups) {
      return { success: false, message: 'JSON contains no bookmarks or groups' };
    }

    // 导入前自动创建安全快照
    await createSnapshot(null, 'auto_preimport');

    await withStorageLock(async () => {
      await db.transaction('rw', [db.bookmarks, db.groups, db.tags, db.appSettings, db.bookmarkStats], async () => {
        if (hasGroups) {
          await db.groups.clear();
          await db.groups.bulkPut(payload.groups);
        }
        if (Array.isArray(payload.tags)) {
          await db.tags.clear();
          await db.tags.bulkPut(payload.tags);
        }
        if (hasBookmarks) {
          await db.bookmarks.clear();
          await db.bookmarks.bulkPut(payload.bookmarks);
        }
        if (payload.settings) {
          await db.appSettings.put({ key: 'settings', value: payload.settings });
        }
        if (payload.clickStats) {
          await db.bookmarkStats.clear();
          const statsItems = Object.entries(payload.clickStats).map(([bmId, total]) => ({
            bookmarkId: bmId,
            totalClicks: total,
            lastClicked: payload.lastClicked?.[bmId] || 0
          }));
          if (statsItems.length > 0) {
            await db.bookmarkStats.bulkPut(statsItems);
          }
        }
      });

      broadcastStorageChange({ type: 'ALL_CHANGED', action: 'import_json' });
    });

    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * 恢复出厂默认数据
 */
export async function resetToDefaultData() {
  const currentBms = await getBookmarks();
  if (currentBms.length > 0) {
    await createSnapshot(null, 'auto_prereset');
  }

  await withStorageLock(async () => {
    await Promise.all([
      db.bookmarks.clear(),
      db.tags.clear(),
      db.groups.clear(),
      resetAllStats()
    ]);
    await db.groups.bulkPut(DEFAULT_GROUPS);
    await db.bookmarks.bulkPut(DEFAULT_BOOKMARKS);
    await db.appSettings.put({ key: 'settings', value: DEFAULT_SETTINGS });
    broadcastStorageChange({ type: 'ALL_CHANGED', action: 'reset_default' });
  });
}
