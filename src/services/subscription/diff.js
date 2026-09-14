/**
 * 订阅源 3-Way Diff 增量状态保全算法
 *
 * 在远程源发生变更时执行增量比对，原地更新实体，
 * 彻底保全本地基于 bookmarkId 的点击频次、访问热度统计以及网络探针延迟缓存。
 */

/**
 * 执行增量比对
 *
 * @param {string} subId - 订阅源 ID
 * @param {Array} localGroups - 本地现有属于该订阅的分组
 * @param {Array} localBookmarks - 本地现有属于该订阅的书签
 * @param {Array} remoteGroups - 远程源经过清洗的分组列表
 * @param {Array} remoteBookmarks - 远程源经过清洗的书签列表
 * @returns {object} Diff 结果
 */
export function computeSubscriptionDiff(subId, localGroups, localBookmarks, remoteGroups, remoteBookmarks) {
  const now = Date.now();

  // 1. 分组映射与比对
  // 建立 localGroups 查找索引 (按 originGroupId 或 id)
  const localGroupMap = new Map();
  for (const g of localGroups) {
    const key = g.originGroupId || g.id;
    localGroupMap.set(key, g);
  }

  const toPutGroups = [];
  const matchedLocalGroupIds = new Set();
  const remoteToLocalGroupIdMap = new Map();

  for (let i = 0; i < remoteGroups.length; i++) {
    const rG = remoteGroups[i];
    const existing = localGroupMap.get(rG.id) || localGroups.find(g => g.name.toLowerCase() === rG.name.toLowerCase());

    const groupId = existing ? existing.id : `grp_sub_${subId}_${rG.id}`;
    remoteToLocalGroupIdMap.set(rG.id, groupId);

    if (existing) {
      matchedLocalGroupIds.add(existing.id);
    }

    toPutGroups.push({
      id: groupId,
      name: rG.name,
      order: typeof rG.order === 'number' ? rG.order : i + 1,
      isPinned: false,
      isUngrouped: false,
      isDefaultCollapsed: Boolean(rG.isDefaultCollapsed),
      subscriptionId: subId,
      sourceType: 'subscription',
      originGroupId: rG.id,
      isReadOnly: true,
      updatedAt: now
    });
  }

  // 计算需要删除的旧分组
  const toDeleteGroupIds = localGroups
    .filter(g => !matchedLocalGroupIds.has(g.id))
    .map(g => g.id);

  // 2. 书签映射与比对
  // 建立 localBookmarks 查找索引
  // 优先按 originBookmarkId，次优按 首个 URL + 名称
  const localBmOriginMap = new Map();
  const localBmUrlNameMap = new Map();

  for (const bm of localBookmarks) {
    if (bm.originBookmarkId) {
      localBmOriginMap.set(bm.originBookmarkId, bm);
    }
    const firstUrl = bm.endpoints?.[0]?.url;
    if (firstUrl && bm.name) {
      localBmUrlNameMap.set(`${bm.name.trim().toLowerCase()}|${firstUrl.trim().toLowerCase()}`, bm);
    }
  }

  const toPutBookmarks = [];
  const matchedLocalBmIds = new Set();
  let addedCount = 0;
  let updatedCount = 0;

  for (let i = 0; i < remoteBookmarks.length; i++) {
    const rBm = remoteBookmarks[i];
    const matched = localBmOriginMap.get(rBm.id)
      || (rBm.endpoints?.[0]?.url && localBmUrlNameMap.get(`${rBm.name.trim().toLowerCase()}|${rBm.endpoints[0].url.trim().toLowerCase()}`));

    // 映射其 targetGroupId
    const targetGroupId = remoteToLocalGroupIdMap.get(rBm.groupId) || toPutGroups[0]?.id || '__ungrouped__';

    if (matched) {
      // Update: 沿用本地已有的 bookmarkId！保全所有点击统计和探针数据
      matchedLocalBmIds.add(matched.id);
      updatedCount++;

      toPutBookmarks.push({
        ...matched,
        name: rBm.name,
        groupId: targetGroupId,
        endpoints: rBm.endpoints,
        tags: rBm.tags || [],
        iconKey: rBm.iconKey || '',
        order: typeof rBm.order === 'number' ? rBm.order : i + 1,
        subscriptionId: subId,
        sourceType: 'subscription',
        originBookmarkId: rBm.id,
        isReadOnly: true,
        updatedAt: now
      });
    } else {
      // Add: 分配新 ID
      addedCount++;
      const newId = `bm_sub_${subId}_${rBm.id}`;

      toPutBookmarks.push({
        id: newId,
        name: rBm.name,
        groupId: targetGroupId,
        endpoints: rBm.endpoints,
        tags: rBm.tags || [],
        tagIds: [],
        iconKey: rBm.iconKey || '',
        customIconBase64: '',
        order: typeof rBm.order === 'number' ? rBm.order : i + 1,
        subscriptionId: subId,
        sourceType: 'subscription',
        originBookmarkId: rBm.id,
        isReadOnly: true,
        createdAt: now,
        updatedAt: now
      });
    }
  }

  // Delete: 本地存在但在远程已被删除的书签
  const toDeleteBookmarkIds = localBookmarks
    .filter(bm => !matchedLocalBmIds.has(bm.id))
    .map(bm => bm.id);

  return {
    toPutGroups,
    toDeleteGroupIds,
    toPutBookmarks,
    toDeleteBookmarkIds,
    stats: {
      added: addedCount,
      updated: updatedCount,
      deleted: toDeleteBookmarkIds.length
    }
  };
}
