/**
 * 点击统计 (Click Stats) 与网络探测缓存 (Probe Cache)
 *
 * 基于 Dexie 细表管理，避免 Map 序列化爆炸。
 */
import { db } from './db.js';
import { broadcastStorageChange } from './sync.js';
import { withStorageLock } from './base.js';

function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 记录单次书签点击
 */
export async function recordClick(bookmarkId) {
  if (!bookmarkId) return;
  const bId = String(bookmarkId);
  const today = getTodayKey();
  const now = Date.now();

  await withStorageLock(async () => {
    await db.transaction('rw', [db.dailyClicks, db.bookmarkStats], async () => {
      // 1. 更新当日统计 (复合主键 [date+bookmarkId])
      const existingDaily = await db.dailyClicks.get([today, bId]);
      const dailyCount = (existingDaily?.count || 0) + 1;
      await db.dailyClicks.put({
        date: today,
        bookmarkId: bId,
        count: dailyCount
      });

      // 2. 更新汇总统计
      const existingSummary = await db.bookmarkStats.get(bId);
      const totalClicks = (existingSummary?.totalClicks || 0) + 1;
      await db.bookmarkStats.put({
        bookmarkId: bId,
        totalClicks,
        lastClicked: now
      });

      // 3. 淘汰超过 90 天的历史数据
      const ninetyDaysAgo = new Date(now - 90 * 86400000);
      const cutoffDate = formatDate(ninetyDaysAgo);
      await db.dailyClicks.where('date').below(cutoffDate).delete();
    });

    broadcastStorageChange({ type: 'STATS_CHANGED', id: bId });
  });
}

/**
 * 查询点击统计
 * @param {'7d' | '30d' | 'all'} [period='30d']
 */
export async function getClickStats(period = '30d') {
  if (period === 'all') {
    const summaryList = await db.bookmarkStats.toArray();
    const result = {};
    for (const item of summaryList) {
      result[item.bookmarkId] = item.totalClicks || 0;
    }
    return result;
  }

  const daysLimit = period === '7d' ? 7 : 30;
  const now = new Date();
  const startDate = formatDate(new Date(now.getTime() - (daysLimit - 1) * 86400000));
  const endDate = formatDate(now);

  const dailyRecords = await db.dailyClicks
    .where('date')
    .between(startDate, endDate, true, true)
    .toArray();

  const result = {};
  for (const r of dailyRecords) {
    result[r.bookmarkId] = (result[r.bookmarkId] || 0) + (r.count || 0);
  }
  return result;
}

/**
 * 获取详细点击统计分析
 */
export async function getDetailedStats() {
  const [summaries, sevenDaysStats] = await Promise.all([
    db.bookmarkStats.toArray(),
    getClickStats('7d')
  ]);

  const totalClicksMap = {};
  const lastClickedMap = {};

  for (const s of summaries) {
    totalClicksMap[s.bookmarkId] = s.totalClicks || 0;
    lastClickedMap[s.bookmarkId] = s.lastClicked || 0;
  }

  return {
    totalClicksMap,
    sevenDaysMap: sevenDaysStats,
    lastClickedMap
  };
}

/**
 * 重置所有点击统计
 */
export async function resetAllStats() {
  await withStorageLock(async () => {
    await Promise.all([
      db.dailyClicks.clear(),
      db.bookmarkStats.clear()
    ]);
    broadcastStorageChange({ type: 'STATS_CHANGED', action: 'reset' });
  });
}

/**
 * 获取网络探测缓存
 */
export async function getProbeCache() {
  const record = await db.appSettings.get('probe_cache');
  return record?.value || {
    localIp: '',
    timestamp: 0,
    results: {}
  };
}

/**
 * 保存网络探测缓存
 */
export async function saveProbeCache(cacheData) {
  await db.appSettings.put({
    key: 'probe_cache',
    value: {
      ...cacheData,
      timestamp: Date.now()
    }
  });
}
