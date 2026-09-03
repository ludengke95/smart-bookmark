/**
 * 数据快照、备份与完整 JSON 导入导出
 */
import { getStorageData, setStorageData, STORAGE_KEYS, getSettings } from './base.js';
import {
  DEFAULT_BOOKMARKS,
  DEFAULT_GROUPS,
  DEFAULT_SETTINGS,
  DEFAULT_BACKUP_SETTINGS,
  BACKUP_INTERVAL_MS
} from '../../constants/index.js';
import { getBookmarks } from './bookmark.js';
import { getGroups } from './group.js';
import { resetAllStats } from './stats.js';

// 保持原有公开 API 兼容：重导出默认备份配置
export { DEFAULT_BACKUP_SETTINGS };

export async function getBackupSettings() {
  return await getStorageData(STORAGE_KEYS.BACKUP_SETTINGS, DEFAULT_BACKUP_SETTINGS);
}

export async function saveBackupSettings(partial) {
  const current = await getBackupSettings();
  const updated = { ...current, ...partial };
  await setStorageData(STORAGE_KEYS.BACKUP_SETTINGS, updated);
  return updated;
}

export async function getSnapshots() {
  return await getStorageData(STORAGE_KEYS.BACKUPS, []);
}

function formatSnapshotTime(ts) {
  const d = new Date(ts);
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

export async function createSnapshot(reason = '手动快照', type = 'manual', isLocked = false) {
  const bookmarks = await getBookmarks();
  const groups = await getGroups();
  const settings = await getSettings();
  const backupSettings = await getBackupSettings();
  const maxLimit = backupSettings.maxSnapshots || 15;

  const now = Date.now();
  const newSnapshot = {
    id: 'snap_' + now + '_' + Math.random().toString(36).substr(2, 4),
    timestamp: now,
    timeStr: formatSnapshotTime(now),
    reason,
    type,
    isLocked: !!isLocked,
    counts: {
      bookmarks: bookmarks.length,
      groups: groups.length
    },
    data: {
      bookmarks,
      groups,
      settings
    }
  };

  const snapshots = await getSnapshots();
  let updatedList = [newSnapshot, ...snapshots];

  if (updatedList.length > maxLimit) {
    while (updatedList.length > maxLimit) {
      let removeIndex = -1;
      for (let i = updatedList.length - 1; i >= 0; i--) {
        if (!updatedList[i].isLocked) {
          removeIndex = i;
          break;
        }
      }
      if (removeIndex >= 0) {
        updatedList.splice(removeIndex, 1);
      } else {
        break;
      }
    }
  }

  await setStorageData(STORAGE_KEYS.BACKUPS, updatedList);
  return newSnapshot;
}

export async function deleteSnapshot(snapshotId) {
  const snapshots = await getSnapshots();
  const filtered = snapshots.filter(s => s.id !== snapshotId);
  await setStorageData(STORAGE_KEYS.BACKUPS, filtered);
  return filtered;
}

export async function toggleSnapshotLock(snapshotId) {
  const snapshots = await getSnapshots();
  const target = snapshots.find(s => s.id === snapshotId);
  if (target) {
    target.isLocked = !target.isLocked;
    await setStorageData(STORAGE_KEYS.BACKUPS, snapshots);
  }
  return snapshots;
}

export async function rollbackToSnapshot(snapshotId) {
  const snapshots = await getSnapshots();
  const target = snapshots.find(s => s.id === snapshotId);
  if (!target || !target.data) {
    throw new Error('未找到目标快照数据');
  }

  const curBms = await getBookmarks();
  await createSnapshot(`[回滚前自动保护] 恢复至 ${target.timeStr} 前 (共 ${curBms.length} 项)`, 'auto_prerollback');

  if (target.data.bookmarks) {
    await setStorageData(STORAGE_KEYS.BOOKMARKS, target.data.bookmarks);
  }
  if (target.data.groups) {
    await setStorageData(STORAGE_KEYS.GROUPS, target.data.groups);
  }
  if (target.data.settings) {
    await setStorageData(STORAGE_KEYS.SETTINGS, target.data.settings);
  }

  return target;
}

export async function checkDailyAutoBackup() {
  const settings = await getBackupSettings();
  if (settings.autoBackupInterval === 'off') return;

  const now = Date.now();
  const lastTime = settings.lastAutoBackupTime || 0;
  const intervalMs = BACKUP_INTERVAL_MS[settings.autoBackupInterval] || BACKUP_INTERVAL_MS.daily;

  if (now - lastTime >= intervalMs) {
    const d = new Date(now);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await createSnapshot(`[定时自动备份] ${dateStr} 启动快照`, 'auto_daily');
    await saveBackupSettings({ lastAutoBackupTime: now });
  }
}

export async function exportFullBackupJson() {
  const bookmarks = await getBookmarks();
  const groups = await getGroups();
  const settings = await getSettings();
  const clickStats = await getStorageData(STORAGE_KEYS.TOTAL_CLICKS, {});
  const lastClicked = await getStorageData(STORAGE_KEYS.LAST_CLICKED, {});
  const exportPayload = {
    version: '1.0.0',
    exportTime: new Date().toISOString(),
    bookmarks,
    groups,
    settings,
    clickStats,
    lastClicked
  };
  return JSON.stringify(exportPayload, null, 2);
}

export async function importFullBackupJson(jsonString) {
  try {
    const data = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
    if (!data || typeof data !== 'object') {
      return { success: false, error: 'JSON 数据格式无效' };
    }

    if (Array.isArray(data.bookmarks)) {
      await setStorageData(STORAGE_KEYS.BOOKMARKS, data.bookmarks);
    }
    if (Array.isArray(data.groups)) {
      await setStorageData(STORAGE_KEYS.GROUPS, data.groups);
    }
    if (data.settings && typeof data.settings === 'object') {
      await setStorageData(STORAGE_KEYS.SETTINGS, data.settings);
    }
    if (data.clickStats && typeof data.clickStats === 'object') {
      await setStorageData(STORAGE_KEYS.TOTAL_CLICKS, data.clickStats);
    }
    if (data.lastClicked && typeof data.lastClicked === 'object') {
      await setStorageData(STORAGE_KEYS.LAST_CLICKED, data.lastClicked);
    }

    return {
      success: true,
      count: Array.isArray(data.bookmarks) ? data.bookmarks.length : 0
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export async function resetToDefaultData() {
  const currentBms = await getBookmarks();
  if (currentBms.length > 0) {
    await createSnapshot(`[恢复出厂前备份] 备份当前 ${currentBms.length} 个书签`, 'auto_prereset');
  }
  await setStorageData(STORAGE_KEYS.BOOKMARKS, DEFAULT_BOOKMARKS);
  await setStorageData(STORAGE_KEYS.GROUPS, DEFAULT_GROUPS);
  await setStorageData(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
  await resetAllStats();
}
