/**
 * 订阅源拉取、ETag 协商缓存与原子入库执行引擎
 */
import { db } from '../storage/db.js';
import { withStorageLock } from '../storage/base.js';
import { broadcastStorageChange } from '../storage/sync.js';
import { ensureTagsExist } from '../storage/tag.js';
import { getSubscription, updateSubscriptionStatus } from '../storage/subscription.js';
import { validateAndCleanSubscription } from './validator.js';
import { computeSubscriptionDiff } from './diff.js';
import { serviceError } from '../errors.js';

const FETCH_TIMEOUT_MS = 8000;

/**
 * 执行单个订阅源的同步拉取
 *
 * @param {string} subId - 订阅源 ID
 * @param {object} [options] - 配置项
 * @param {boolean} [options.force] - 是否强制全量拉取 (忽略 ETag)
 * @returns {Promise<object>} 同步结果
 */
export async function syncSubscription(subId, options = {}) {
  const sub = await getSubscription(subId);
  if (!sub) {
    throw serviceError('subscriptionNotFound', `Subscription "${subId}" not found`);
  }

  // 1. 设置为同步中状态
  await updateSubscriptionStatus(subId, { status: 'syncing', error: '' });

  const controller = new AbortController();
  const timeoutTimer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const headers = {
      Accept: 'application/json, text/plain, */*'
    };

    if (!options.force) {
      if (sub.etag) headers['If-None-Match'] = sub.etag;
      if (sub.lastModified) headers['If-Modified-Since'] = sub.lastModified;
    }

    const response = await fetch(sub.url, {
      method: 'GET',
      headers,
      signal: controller.signal,
      cache: 'no-cache'
    });

    clearTimeout(timeoutTimer);

    // 2. HTTP 304: 服务端未修改，协商缓存生效，零开销退出
    if (response.status === 304) {
      const now = Date.now();
      await updateSubscriptionStatus(subId, {
        status: 'success',
        error: '',
        lastSyncedAt: now
      });
      return { notModified: true, subId };
    }

    if (!response.ok) {
      throw serviceError('httpError', `HTTP ${response.status} ${response.statusText}`);
    }

    // 3. 提取响应内容与缓存头
    const newEtag = response.headers.get('ETag') || response.headers.get('etag') || '';
    const newLastModified = response.headers.get('Last-Modified') || response.headers.get('last-modified') || '';
    const rawText = await response.text();

    // 4. 数据校验清洗与投影
    const cleaned = validateAndCleanSubscription(rawText);

    // 5. 3-Way Diff 计算增量变更与状态保全
    const localGroups = await db.groups.where('subscriptionId').equals(subId).toArray();
    const localBookmarks = await db.bookmarks.where('subscriptionId').equals(subId).toArray();

    const diff = computeSubscriptionDiff(
      subId,
      localGroups,
      localBookmarks,
      cleaned.groups,
      cleaned.bookmarks
    );

    // 6. 原子入库提交
    await withStorageLock(async () => {
      // 收集并确保所有引入的标签在 Tag 表中注册
      const allTagNames = [];
      for (const bm of diff.toPutBookmarks) {
        if (Array.isArray(bm.tags)) allTagNames.push(...bm.tags);
      }
      if (allTagNames.length > 0) {
        await ensureTagsExist(allTagNames);
      }

      await db.transaction('rw', [db.subscriptions, db.groups, db.bookmarks, db.bookmarkStats], async () => {
        // 更新与新增分组
        if (diff.toPutGroups.length > 0) {
          await db.groups.bulkPut(diff.toPutGroups);
        }
        // 删除废弃分组
        if (diff.toDeleteGroupIds.length > 0) {
          await db.groups.bulkDelete(diff.toDeleteGroupIds);
        }

        // 更新与新增书签 (包含本地 id 的状态保全)
        if (diff.toPutBookmarks.length > 0) {
          await db.bookmarks.bulkPut(diff.toPutBookmarks);
        }
        // 删除废弃书签及清理其统计
        if (diff.toDeleteBookmarkIds.length > 0) {
          await db.bookmarks.bulkDelete(diff.toDeleteBookmarkIds);
          await db.bookmarkStats.where('bookmarkId').anyOf(diff.toDeleteBookmarkIds).delete();
        }

        // 更新订阅状态
        const now = Date.now();
        const subUpdates = {
          status: 'success',
          error: '',
          etag: newEtag,
          lastModified: newLastModified,
          lastSyncedAt: now,
          bookmarkCount: diff.toPutBookmarks.length,
          groupCount: diff.toPutGroups.length,
          updatedAt: now
        };
        if (!sub.name && cleaned.name) {
          subUpdates.name = cleaned.name;
        }
        await db.subscriptions.update(subId, subUpdates);
      });
    });

    // 7. 广播跨页面同步事件
    broadcastStorageChange({ type: 'SUBSCRIPTIONS_CHANGED', id: subId, action: 'sync_success' });
    broadcastStorageChange({ type: 'GROUPS_CHANGED', action: 'sync_success' });
    broadcastStorageChange({ type: 'BOOKMARKS_CHANGED', action: 'sync_success' });

    return {
      success: true,
      subId,
      stats: diff.stats,
      bookmarkCount: diff.toPutBookmarks.length,
      groupCount: diff.toPutGroups.length
    };
  } catch (err) {
    clearTimeout(timeoutTimer);
    const errorMsg = err.name === 'AbortError' ? 'Sync timed out (8s limit)' : err.message;
    await updateSubscriptionStatus(subId, {
      status: 'error',
      error: errorMsg
    });
    throw serviceError('subscriptionSyncFailed', `Failed to sync subscription: ${errorMsg}`);
  }
}

/**
 * 轮询检查并同步所有到达周期的订阅源
 */
export async function syncDueSubscriptions() {
  const allSubs = await db.subscriptions.toArray();
  const now = Date.now();
  const results = [];

  for (const sub of allSubs) {
    // updateInterval 为 0 表示仅手动，跳过自动定时轮询
    if (sub.updateInterval <= 0) continue;

    const intervalMs = sub.updateInterval * 60 * 1000;
    const isDue = (now - (sub.lastSyncedAt || 0)) >= intervalMs;

    if (isDue) {
      try {
        const res = await syncSubscription(sub.id);
        results.push({ id: sub.id, ...res });
      } catch (e) {
        results.push({ id: sub.id, error: e.message });
      }
    }
  }

  return results;
}
