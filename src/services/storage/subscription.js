/**
 * 团队公共书签 / 订阅集合 (Subscriptions) CRUD 与级联治理
 *
 * 基于 Dexie.js 实现订阅源元数据管理，并提供一键安全级联清理事务。
 */
import { withStorageLock, deepCloneToRaw } from './base.js';
import { db } from './db.js';
import { broadcastStorageChange } from './sync.js';
import { serviceError } from '../errors.js';
import { UNGROUPED_GROUP_ID } from '../../constants/index.js';

/**
 * 规范化订阅实体
 */
export function normalizeSubscriptionEntity(sub, fallbackOrder = 0) {
  if (!sub || typeof sub !== 'object') return null;
  const now = Date.now();
  const id = sub.id ? String(sub.id) : ('sub_' + now + '_' + Math.random().toString(36).substring(2, 8));

  return {
    id,
    name: String(sub.name || '').trim(),
    url: String(sub.url || '').trim(),
    updateInterval: typeof sub.updateInterval === 'number' ? sub.updateInterval : 60, // 默认 60 分钟，0 为仅手动
    lastSyncedAt: typeof sub.lastSyncedAt === 'number' ? sub.lastSyncedAt : 0,
    etag: sub.etag ? String(sub.etag) : '',
    lastModified: sub.lastModified ? String(sub.lastModified) : '',
    status: sub.status || 'idle', // 'idle' | 'syncing' | 'success' | 'error'
    error: sub.error ? String(sub.error) : '',
    bookmarkCount: typeof sub.bookmarkCount === 'number' ? sub.bookmarkCount : 0,
    groupCount: typeof sub.groupCount === 'number' ? sub.groupCount : 0,
    order: typeof sub.order === 'number' ? sub.order : fallbackOrder,
    createdAt: typeof sub.createdAt === 'number' ? sub.createdAt : now,
    updatedAt: typeof sub.updatedAt === 'number' ? sub.updatedAt : now
  };
}

/**
 * 获取所有订阅源列表 (按 order 升序)
 */
export async function getSubscriptions() {
  const list = await db.subscriptions.orderBy('order').toArray();
  return list.map(sub => normalizeSubscriptionEntity(sub));
}

/**
 * 获取单个订阅源
 */
export async function getSubscription(id) {
  if (!id) return null;
  const sub = await db.subscriptions.get(String(id));
  return sub ? normalizeSubscriptionEntity(sub) : null;
}

/**
 * 保存或更新单个订阅源元数据
 */
export async function saveSubscription(subData) {
  const url = String(subData?.url || '').trim();
  if (!url) {
    throw serviceError('invalidParams', 'Subscription URL cannot be empty');
  }

  // 基础 URL scheme 检查
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw serviceError('invalidParams', 'Only http:// and https:// URLs are supported');
    }
  } catch (e) {
    throw serviceError('invalidParams', 'Invalid subscription URL format');
  }

  return await withStorageLock(async () => {
    const existing = subData.id ? await db.subscriptions.get(subData.id) : null;
    const allSubs = await db.subscriptions.toArray();

    // 检查 URL 重复 (排除自身)
    const duplicate = allSubs.find(s => s.url.toLowerCase() === url.toLowerCase() && s.id !== subData.id);
    if (duplicate) {
      throw serviceError('duplicateSubscriptionUrl', 'A subscription with this URL already exists');
    }

    let order = typeof subData.order === 'number' ? subData.order : existing?.order;
    if (order === undefined) {
      const orders = allSubs.map(s => s.order || 0);
      order = orders.length > 0 ? Math.max(...orders) + 1 : 1;
    }

    const cleanSub = normalizeSubscriptionEntity({
      ...existing,
      ...subData,
      id: subData.id ? String(subData.id) : ('sub_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8)),
      url,
      order,
      updatedAt: Date.now()
    }, order);

    await db.subscriptions.put(cleanSub);
    broadcastStorageChange({ type: 'SUBSCRIPTIONS_CHANGED', id: cleanSub.id });
    return cleanSub;
  });
}

/**
 * 更新订阅源同步状态
 */
export async function updateSubscriptionStatus(id, { status, error = '', etag, lastModified, lastSyncedAt, bookmarkCount, groupCount, name }) {
  if (!id) return;
  return await withStorageLock(async () => {
    const sub = await db.subscriptions.get(String(id));
    if (!sub) return;

    const updates = {
      status: status || sub.status,
      error: error !== undefined ? String(error) : sub.error,
      updatedAt: Date.now()
    };
    if (etag !== undefined) updates.etag = String(etag);
    if (lastModified !== undefined) updates.lastModified = String(lastModified);
    if (lastSyncedAt !== undefined) updates.lastSyncedAt = Number(lastSyncedAt);
    if (bookmarkCount !== undefined) updates.bookmarkCount = Number(bookmarkCount);
    if (groupCount !== undefined) updates.groupCount = Number(groupCount);
    if (name && !sub.name) updates.name = String(name);

    await db.subscriptions.update(id, updates);
    broadcastStorageChange({ type: 'SUBSCRIPTIONS_CHANGED', id });
  });
}

/**
 * 删除订阅源并原子级联清理所属的分组与书签
 * 确保个人私有数据（subscriptionId 为空）绝对不受触碰
 */
export async function deleteSubscription(id) {
  if (!id) return;
  const subId = String(id);

  return await withStorageLock(async () => {
    await db.transaction('rw', [db.subscriptions, db.groups, db.bookmarks, db.bookmarkStats], async () => {
      // 1. 获取该订阅下的所有书签 ID
      const bms = await db.bookmarks.where('subscriptionId').equals(subId).toArray();
      const bmIds = bms.map(b => b.id);

      // 2. 清理对应书签的点击统计
      if (bmIds.length > 0) {
        await db.bookmarkStats.where('bookmarkId').anyOf(bmIds).delete();
      }

      // 3. 级联删除该订阅所属的书签
      await db.bookmarks.where('subscriptionId').equals(subId).delete();

      // 4. 获取该订阅所属的分组 ID
      const subGroups = await db.groups.where('subscriptionId').equals(subId).toArray();
      const subGroupIds = subGroups.map(g => g.id);

      // 5. 容错自愈：若有个人书签意外关联了即将被删除的订阅分组，自动回退到未分组，杜绝幽灵书签
      if (subGroupIds.length > 0) {
        await db.bookmarks
          .where('groupId')
          .anyOf(subGroupIds)
          .modify(bm => {
            bm.groupId = UNGROUPED_GROUP_ID;
            bm.updatedAt = Date.now();
          });
      }

      // 6. 级联删除该订阅所属的分组
      await db.groups.where('subscriptionId').equals(subId).delete();

      // 7. 删除订阅元数据自身
      await db.subscriptions.delete(subId);
    });

    broadcastStorageChange({ type: 'SUBSCRIPTIONS_CHANGED', id: subId });
    broadcastStorageChange({ type: 'GROUPS_CHANGED', action: 'delete_subscription' });
    broadcastStorageChange({ type: 'BOOKMARKS_CHANGED', action: 'delete_subscription' });
  });
}
