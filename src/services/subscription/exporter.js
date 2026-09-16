/**
 * 团队公共书签 / 订阅集合 (Subscribed Collections) 导出器
 *
 * 将本地选中的书签与分组投影脱敏，生成符合 SUBSCRIPTION_SCHEMA_VERSION 标准的只读分发 JSON。
 * 彻底剔除用户本地主键、点击统计、个人标签等私有字段。
 */
import { SUBSCRIPTION_SCHEMA_VERSION, SAMPLE_SUBSCRIPTION_TEMPLATE } from './schema.js';
import { PINNED_GROUP_ID, UNGROUPED_GROUP_ID } from '../../constants/index.js';

/**
 * 导出标准团队书签集合对象
 *
 * @param {object} params
 * @param {string} params.name - 团队集合名称
 * @param {string} [params.description] - 描述说明
 * @param {Array<string>} [params.groupIds] - 指定导出的分组 ID (默认导出所有非内置自定义分组)
 * @param {Array<object>} params.groups - 全部分组数据
 * @param {Array<object>} params.bookmarks - 全部书签数据
 * @returns {object} 标准格式订阅源数据
 */
export function buildTeamCollectionPayload({
  name,
  description = '',
  groupIds = null,
  groups = [],
  bookmarks = []
}) {
  const collectionName = String(name || '').trim() || 'Team Bookmarks';
  const now = Date.now();

  // 1. 确定要导出的分组列表 (排除 PINNED 和 UNGROUPED 内置组)
  const validGroups = groups.filter(g => g.id !== PINNED_GROUP_ID && g.id !== UNGROUPED_GROUP_ID);

  let targetGroups = validGroups;
  if (Array.isArray(groupIds) && groupIds.length > 0) {
    const idSet = new Set(groupIds.map(String));
    targetGroups = validGroups.filter(g => idSet.has(String(g.id)));
  }

  // 建立分组 ID 映射与稳态 ID
  const groupIdMap = new Map();
  const exportedGroups = [];

  for (let i = 0; i < targetGroups.length; i++) {
    const g = targetGroups[i];
    // 使用有意义的语义化稳定 ID
    const stableGroupId = `grp_${i + 1}`;
    groupIdMap.set(g.id, stableGroupId);

    exportedGroups.push({
      id: stableGroupId,
      name: g.name,
      order: typeof g.order === 'number' ? g.order : i + 1,
      isDefaultCollapsed: Boolean(g.isDefaultCollapsed)
    });
  }

  // 2. 筛选并投影书签
  const targetGroupIds = new Set(targetGroups.map(g => g.id));
  const candidateBookmarks = bookmarks.filter(b => targetGroupIds.has(b.groupId));

  const exportedBookmarks = [];
  for (let i = 0; i < candidateBookmarks.length; i++) {
    const bm = candidateBookmarks[i];
    const targetGid = groupIdMap.get(bm.groupId) || exportedGroups[0]?.id;
    if (!targetGid) continue;

    // 清洗多入口 endpoints，确保每个入口属性纯净
    const cleanEndpoints = (bm.endpoints || []).map((ep, idx) => ({
      url: String(ep.url || '').trim(),
      type: ep.type === 'intranet' ? 'intranet' : 'extranet',
      name: ep.name ? String(ep.name).trim() : (ep.type === 'intranet' ? '内网直连' : '外网访问'),
      order: typeof ep.order === 'number' ? ep.order : idx
    })).filter(ep => ep.url.startsWith('http://') || ep.url.startsWith('https://'));

    if (cleanEndpoints.length === 0) continue;

    const stableBmId = `bm_${i + 1}`;
    exportedBookmarks.push({
      id: stableBmId,
      name: String(bm.name || '').trim(),
      groupId: targetGid,
      iconKey: bm.iconKey ? String(bm.iconKey).trim() : '',
      tags: Array.isArray(bm.tags) ? bm.tags.map(t => String(t).trim()).filter(Boolean) : [],
      order: typeof bm.order === 'number' ? bm.order : i + 1,
      endpoints: cleanEndpoints
    });
  }

  // 3. 组装标准契约数据
  return {
    $schema: 'https://smart-bookmark.extension/schema/v1.json',
    version: SUBSCRIPTION_SCHEMA_VERSION,
    name: collectionName,
    description: String(description || '').trim(),
    updatedAt: now,
    groups: exportedGroups,
    bookmarks: exportedBookmarks
  };
}

/**
 * 获取标准示例模板
 */
export function getSampleSubscriptionTemplate() {
  return JSON.parse(JSON.stringify(SAMPLE_SUBSCRIPTION_TEMPLATE));
}
