import './setup.js';
import assert from 'node:assert/strict';
import {
  getBookmarks,
  saveBookmark,
  deleteBookmark,
  getGroups,
  updateGroup,
  deleteGroup,
  getSubscriptions,
  saveSubscription,
  deleteSubscription,
  recordClick,
  getClickStats,
  clearAllData
} from '../src/services/storage/index.js';
import { db } from '../src/services/storage/db.js';
import { UNGROUPED_GROUP_ID } from '../src/constants/index.js';
import { validateAndCleanSubscription, isSafeUrl } from '../src/services/subscription/validator.js';
import { computeSubscriptionDiff } from '../src/services/subscription/diff.js';

async function testValidator() {
  console.log('--- 1. 验证订阅数据安全校验与熔断 (Validator) ---');

  // 1.1 恶意 URL 过滤
  const dirtyData = {
    name: '团队工具集',
    groups: [{ id: 'grp-1', name: '开发组' }],
    bookmarks: [
      {
        name: '正常工具',
        groupId: 'grp-1',
        endpoints: [
          { url: 'https://gitlab.example.com' },
          { url: 'javascript:alert(1)' },
          { url: 'data:text/html,<script>alert(2)</script>' }
        ]
      },
      {
        name: '恶意书签',
        endpoints: [
          { url: 'javascript:void(0)' }
        ]
      }
    ]
  };

  const clean = validateAndCleanSubscription(dirtyData);
  assert.equal(clean.bookmarks.length, 1, '仅包含恶意 URL 的书签应被整条过滤');
  assert.equal(clean.bookmarks[0].endpoints.length, 1, '非 http/https 入口应被清洗剔除');
  assert.equal(clean.bookmarks[0].endpoints[0].url, 'https://gitlab.example.com');

  // 1.2 数量上限熔断
  const excessiveGroups = {
    groups: Array.from({ length: 55 }, (_, i) => ({ name: `组 ${i}` }))
  };
  assert.throws(
    () => validateAndCleanSubscription(excessiveGroups),
    /50/,
    '分组超过 50 个应触发熔断报错'
  );

  const excessiveBookmarks = {
    bookmarks: Array.from({ length: 1005 }, (_, i) => ({
      name: `书签 ${i}`,
      endpoints: [{ url: `https://example.com/${i}` }]
    }))
  };
  assert.throws(
    () => validateAndCleanSubscription(excessiveBookmarks),
    /1000/,
    '书签超过 1000 条应触发熔断报错'
  );

  console.log('✓ 安全校验与熔断机制测试通过');
}

async function testDiffAlgorithm() {
  console.log('--- 2. 验证 3-Way Diff 增量比对与 ID 锚定算法 ---');

  const subId = 'sub-test-1';
  const localGroups = [
    { id: 'loc-grp-1', name: '后端服务', subscriptionId: subId, originGroupId: 'grp-be' }
  ];
  const localBookmarks = [
    {
      id: 'loc-bm-1',
      name: 'GitLab',
      groupId: 'loc-grp-1',
      subscriptionId: subId,
      originBookmarkId: 'remote-bm-1',
      endpoints: [{ url: 'https://git.old.com' }]
    },
    {
      id: 'loc-bm-2',
      name: 'Jira',
      groupId: 'loc-grp-1',
      subscriptionId: subId,
      originBookmarkId: 'remote-bm-2',
      endpoints: [{ url: 'https://jira.old.com' }]
    }
  ];

  // 远程源数据：更新 GitLab URL，删除 Jira，新增 Jenkins
  const remoteData = {
    groups: [
      { id: 'grp-be', name: '核心后端服务' }
    ],
    bookmarks: [
      {
        id: 'remote-bm-1',
        name: 'GitLab Enterprise',
        groupId: 'grp-be',
        endpoints: [{ url: 'https://git.new.com' }]
      },
      {
        id: 'remote-bm-3',
        name: 'Jenkins CI',
        groupId: 'grp-be',
        endpoints: [{ url: 'https://ci.new.com' }]
      }
    ]
  };

  const diffResult = computeSubscriptionDiff(subId, localGroups, localBookmarks, remoteData.groups, remoteData.bookmarks);

  // 验证书签 Diff
  assert.equal(diffResult.stats.updated, 1, '应有 1 个书签更新');
  assert.equal(diffResult.stats.added, 1, '应有 1 个新书签待添加');
  assert.equal(diffResult.stats.deleted, 1, '应有 1 个废弃书签待删除');

  const updatedBm = diffResult.toPutBookmarks.find(b => b.name === 'GitLab Enterprise');
  assert.ok(updatedBm, '应包含更新的书签');
  assert.equal(updatedBm.id, 'loc-bm-1', '更新书签必须复用本地既有 ID');
  assert.equal(updatedBm.endpoints[0].url, 'https://git.new.com');

  const addedBm = diffResult.toPutBookmarks.find(b => b.name === 'Jenkins CI');
  assert.ok(addedBm, '应包含新增的书签');
  assert.equal(addedBm.subscriptionId, subId);
  assert.equal(addedBm.isReadOnly, true);

  assert.equal(diffResult.toDeleteBookmarkIds.length, 1);
  assert.equal(diffResult.toDeleteBookmarkIds[0], 'loc-bm-2');

  // 验证分组 Diff
  const updatedGroup = diffResult.toPutGroups.find(g => g.name === '核心后端服务');
  assert.ok(updatedGroup, '后端服务分组名称应被更新');
  assert.equal(updatedGroup.id, 'loc-grp-1', '更新分组必须复用本地既有 ID');

  console.log('✓ 3-Way Diff 算法状态保全验证通过');
}

async function testStorageAndIntegrity() {
  console.log('--- 3. 验证订阅存储、只读拦截与级联清理 ---');
  await clearAllData();

  // 3.1 创建个人书签与个人分组
  await saveBookmark({
    name: '个人常用',
    groupId: UNGROUPED_GROUP_ID,
    endpoints: [{ url: 'https://my-blog.com' }]
  });

  // 3.2 模拟订阅同步落库
  const sub = await saveSubscription({
    name: '技术团队公共集合',
    url: 'https://raw.githubusercontent.com/team/bookmarks/main/bookmarks.json',
    updateInterval: 60
  });

  const subGroupId = 'sub-grp-prod';
  const subBmId = 'sub-bm-grafana';

  await db.transaction('rw', [db.groups, db.bookmarks], async () => {
    await db.groups.add({
      id: subGroupId,
      name: '监控平台',
      subscriptionId: sub.id,
      sourceType: 'subscribed',
      isReadOnly: true,
      order: 10
    });

    await db.bookmarks.add({
      id: subBmId,
      name: 'Grafana 监控大屏',
      groupId: subGroupId,
      subscriptionId: sub.id,
      sourceType: 'subscribed',
      isReadOnly: true,
      endpoints: [{ url: 'https://grafana.internal:3000' }],
      order: 1,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  });

  // 3.3 验证只读属性拦截
  await assert.rejects(
    async () => saveBookmark({ id: subBmId, name: '尝试篡改Grafana' }),
    (err) => err.code === 'readOnlyBookmark' || /read-only/i.test(err.message),
    '只读书签禁止被直接修改'
  );

  await assert.rejects(
    async () => deleteBookmark(subBmId),
    (err) => err.code === 'readOnlyBookmark' || /read-only/i.test(err.message),
    '只读书签禁止被直接删除'
  );

  await assert.rejects(
    async () => updateGroup(subGroupId, '篡改监控分组'),
    (err) => err.code === 'readOnlyGroup' || /read-only/i.test(err.message),
    '只读分组禁止被重命名'
  );

  await assert.rejects(
    async () => deleteGroup(subGroupId),
    (err) => err.code === 'readOnlyGroup' || /read-only/i.test(err.message),
    '只读分组禁止被删除'
  );

  // 3.4 模拟记录只读书签点击，产生统计数据
  await recordClick(subBmId);
  await recordClick(subBmId);
  const statsBefore = await getClickStats('all');
  assert.equal(statsBefore[subBmId], 2, '只读书签点击频次应正常记录');

  // 3.5 级联清理测试：取消订阅
  await deleteSubscription(sub.id);

  const bmsAfter = await getBookmarks();
  const grpsAfter = await getGroups();
  const statsAfter = await getClickStats('all');
  const subsAfter = await getSubscriptions();

  assert.equal(subsAfter.length, 0, '订阅源应已被删除');
  assert.equal(bmsAfter.some(b => b.id === subBmId), false, '订阅书签应被级联清理');
  assert.equal(grpsAfter.some(g => g.id === subGroupId), false, '订阅分组应被级联清理');
  assert.equal(Boolean(statsAfter[subBmId]), false, '孤立的书签点击统计应被级联释放');

  // 验证个人书签完好无损
  assert.equal(bmsAfter.length, 1, '个人私有书签应完好保留');
  assert.equal(bmsAfter[0].name, '个人常用');

  console.log('✓ 订阅生命周期、只读保护与原子级联清理验证通过');
}

async function main() {
  try {
    await testValidator();
    await testDiffAlgorithm();
    await testStorageAndIntegrity();

    console.log('\n========================================');
    console.log('🎉 团队公共书签所有核心单元测试 100% 通过！');
    console.log('========================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ 测试失败:', err);
    process.exit(1);
  }
}

main();
