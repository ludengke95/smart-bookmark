/**
 * 点击统计 (Click Stats) 与网络探测缓存 (Probe Cache)
 */
import { getStorageData, setStorageData, STORAGE_KEYS } from './base.js';

function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function recordClick(bookmarkId) {
  if (!bookmarkId) return;
  const today = getTodayKey();
  const now = Date.now();

  const dailyClicks = await getStorageData(STORAGE_KEYS.DAILY_CLICKS, {});
  if (!dailyClicks[today]) dailyClicks[today] = {};
  dailyClicks[today][bookmarkId] = (dailyClicks[today][bookmarkId] || 0) + 1;

  const totalClicks = await getStorageData(STORAGE_KEYS.TOTAL_CLICKS, {});
  totalClicks[bookmarkId] = (totalClicks[bookmarkId] || 0) + 1;

  const lastClicked = await getStorageData(STORAGE_KEYS.LAST_CLICKED, {});
  lastClicked[bookmarkId] = now;

  const dateKeys = Object.keys(dailyClicks);
  if (dateKeys.length > 90) {
    dateKeys.sort();
    while (dateKeys.length > 90) {
      delete dailyClicks[dateKeys.shift()];
    }
  }

  await setStorageData(STORAGE_KEYS.DAILY_CLICKS, dailyClicks);
  await setStorageData(STORAGE_KEYS.TOTAL_CLICKS, totalClicks);
  await setStorageData(STORAGE_KEYS.LAST_CLICKED, lastClicked);
}

export async function getClickStats(period = '30d') {
  if (period === 'all') {
    return await getStorageData(STORAGE_KEYS.TOTAL_CLICKS, {});
  }

  const dailyClicks = await getStorageData(STORAGE_KEYS.DAILY_CLICKS, {});
  const daysLimit = period === '7d' ? 7 : 30;

  const result = {};
  const now = new Date();

  for (let i = 0; i < daysLimit; i++) {
    const targetDate = new Date(now.getTime() - i * 86400000);
    const dateKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
    const dayData = dailyClicks[dateKey];
    if (dayData) {
      for (const [bmId, count] of Object.entries(dayData)) {
        result[bmId] = (result[bmId] || 0) + count;
      }
    }
  }

  return result;
}

export async function getDetailedStats() {
  const dailyClicks = await getStorageData(STORAGE_KEYS.DAILY_CLICKS, {});
  const totalClicks = await getStorageData(STORAGE_KEYS.TOTAL_CLICKS, {});
  const lastClicked = await getStorageData(STORAGE_KEYS.LAST_CLICKED, {});

  // 计算近 7 天点击
  const sevenDaysMap = {};
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const targetDate = new Date(now.getTime() - i * 86400000);
    const dateKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
    const dayData = dailyClicks[dateKey];
    if (dayData) {
      for (const [bmId, count] of Object.entries(dayData)) {
        sevenDaysMap[bmId] = (sevenDaysMap[bmId] || 0) + count;
      }
    }
  }

  return {
    totalClicksMap: totalClicks || {},
    sevenDaysMap,
    lastClickedMap: lastClicked || {}
  };
}

export async function resetAllStats() {
  await setStorageData(STORAGE_KEYS.DAILY_CLICKS, {});
  await setStorageData(STORAGE_KEYS.TOTAL_CLICKS, {});
  await setStorageData(STORAGE_KEYS.LAST_CLICKED, {});
}

export async function getProbeCache() {
  return await getStorageData(STORAGE_KEYS.PROBE_CACHE, {
    localIp: '',
    timestamp: 0,
    results: {}
  });
}

export async function saveProbeCache(cacheData) {
  await setStorageData(STORAGE_KEYS.PROBE_CACHE, {
    ...cacheData,
    timestamp: Date.now()
  });
}
