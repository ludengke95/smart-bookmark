/**
 * 存储层基础原语 (Storage Primitives)
 *
 * 提供统一异步读写、存储键常量、环境探测与初始化逻辑，
 * 以及设置偏好的基础读写（薄封装）。
 */
import {
  DEFAULT_BOOKMARKS,
  DEFAULT_GROUPS,
  DEFAULT_SETTINGS
} from '../../constants/index.js';

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

// 辅助：判断是否在标准 Chrome 扩展环境中运行
function isExtensionEnv() {
  try {
    return typeof chrome !== 'undefined' && !!chrome.runtime?.id && !!chrome.storage?.local;
  } catch {
    return false;
  }
}

const memoryFallbackStore = {};

// 全局存储互斥锁队列 (保证 Read-Modify-Write 事务原子串行化，从根源彻底杜绝并发踩踏与死锁)
let storageQueueTail = Promise.resolve();
let activeLockDepth = 0;

/**
 * 存储层异步互斥事务锁 (支持可重入，防止嵌套死锁)
 *
 * 客户端扩展场景下，所有 Read-Modify-Write 复合操作按 FIFO 队列严格串行化：
 * 保证前一个写事务全部持久化后，下一个事务才开始读取，100% 杜绝并发踩踏丢数据 (Lost-Update)。
 * 同时支持递归重入：当前异步上下文若已持有锁，直接执行无需重复排队。
 *
 * @template T
 * @param {(() => Promise<T>) | any} fnOrKeys - 待执行的异步函数，兼容多参数调用
 * @param {() => Promise<T>} [optionalFn]
 * @returns {Promise<T>}
 */
export async function withStorageLock(fnOrKeys, optionalFn) {
  const asyncFn = typeof fnOrKeys === 'function' ? fnOrKeys : optionalFn;
  if (typeof asyncFn !== 'function') {
    throw new Error('withStorageLock expects an async function');
  }

  // 可重入支持：若当前调用栈已在锁保护上下文内，直接执行，防止自身嵌套死锁
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
    // 等待队列前置任务完成 (即使前序任务异常也不阻塞后续队列)
    await previousTail.catch(() => {});
    activeLockDepth++;
    return await asyncFn();
  } finally {
    activeLockDepth--;
    releaseCurrent();
  }
}

/**
 * 安全原子读取-修改-写回原语 (Atomic Read-Modify-Write)
 *
 * @template T
 * @param {string} key - 存储键名
 * @param {(current: any) => Promise<T> | T} updater - 接收当前值并返回更新后值的函数
 * @param {any} [fallbackValue] - 缺省初始值
 * @returns {Promise<T>} 更新后的值
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

// 统一异步读取
export async function getStorageData(key, fallbackValue) {
  if (isExtensionEnv()) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([key], (result) => {
          if (chrome.runtime?.lastError) {
            console.warn(`Storage get error for key ${key}:`, chrome.runtime.lastError);
            resolve(fallbackValue);
          } else {
            resolve(result && result[key] !== undefined ? result[key] : fallbackValue);
          }
        });
      } catch (err) {
        console.warn('Storage context invalid, fallback to memory/local:', err);
        resolve(fallbackValue);
      }
    });
  } else if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallbackValue;
    } catch {
      return fallbackValue;
    }
  } else {
    return memoryFallbackStore[key] !== undefined
      ? JSON.parse(JSON.stringify(memoryFallbackStore[key]))
      : fallbackValue;
  }
}

// 统一异步写入
export async function setStorageData(key, value) {
  if (isExtensionEnv()) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [key]: value }, () => {
          if (chrome.runtime?.lastError) {
            console.warn(`Storage set error for key ${key}:`, chrome.runtime.lastError);
          }
          resolve();
        });
      } catch (err) {
        console.warn('Storage context invalid during set:', err);
        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem(key, JSON.stringify(value));
          } catch {}
        }
        resolve();
      }
    });
  } else if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  } else {
    memoryFallbackStore[key] = JSON.parse(JSON.stringify(value));
  }
}

/**
 * 初始化存储
 */
export async function initStorage() {
  const bookmarks = await getStorageData(STORAGE_KEYS.BOOKMARKS, null);
  if (bookmarks === null || !Array.isArray(bookmarks)) {
    await setStorageData(STORAGE_KEYS.BOOKMARKS, DEFAULT_BOOKMARKS);
  }

  const groups = await getStorageData(STORAGE_KEYS.GROUPS, null);
  if (groups === null || !Array.isArray(groups)) {
    await setStorageData(STORAGE_KEYS.GROUPS, DEFAULT_GROUPS);
  }

  const settings = await getStorageData(STORAGE_KEYS.SETTINGS, null);
  if (!settings) {
    await setStorageData(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
  }
}

/**
 * 设置偏好读写
 */
export async function getSettings() {
  return await getStorageData(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
}

export async function saveSettings(partial) {
  const current = await getSettings();
  const updated = { ...current, ...partial };
  await setStorageData(STORAGE_KEYS.SETTINGS, updated);
  return updated;
}
