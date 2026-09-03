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
