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
import { buildTeamCollectionPayload, getSampleSubscriptionTemplate } from '../src/services/subscription/exporter.js';
import { executeMcpTool, MCP_TOOL_DEFINITIONS } from '../src/services/mcp/tools.js';

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

  // 验证孤立书签回退至系统 UNGROUPED_GROUP_ID
  const orphanDiff = computeSubscriptionDiff('sub-orphan', [], [], [], [
    { id: 'orphan-1', name: '无组书签', groupId: 'non-exist-grp', endpoints: [{ url: 'https://example.com' }] }
  ]);
  assert.equal(orphanDiff.toPutBookmarks[0].groupId, UNGROUPED_GROUP_ID, '无对应分组的书签必须安全回退至系统未分组');

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

  // 3.4.1 模拟个人书签被异常分配到订阅分组下 (挂载在 subGroupId)
  const orphanPersonalBmId = 'personal-bm-in-sub-group';
  await db.bookmarks.add({
    id: orphanPersonalBmId,
    name: '意外加入团队分组的个人书签',
    groupId: subGroupId,
    subscriptionId: null,
    sourceType: 'custom',
    isReadOnly: false,
    endpoints: [{ url: 'https://personal-tool.example.com' }],
    order: 2,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });

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

  // 验证个人书签完好无损且孤儿书签自愈回退到未分组
  const savedOrphan = bmsAfter.find(b => b.id === orphanPersonalBmId);
  assert.ok(savedOrphan, '挂在订阅分组下的个人书签不得丢失');
  assert.equal(savedOrphan.groupId, UNGROUPED_GROUP_ID, '被删除订阅分组下的个人书签应自愈回退到系统未分组');

  assert.equal(bmsAfter.length, 2, '个人私有书签应全数保留');
  assert.ok(bmsAfter.some(b => b.name === '个人常用'));

  console.log('✓ 订阅生命周期、只读保护与原子级联清理验证通过');
}

async function testExporter() {
  console.log('--- 4. 验证团队源导出生成与数据脱敏 (Exporter) ---');

  const groups = [
    { id: 'custom-grp-1', name: '研发中间件', order: 1 },
    { id: 'custom-grp-2', name: '监控运维', order: 2 },
    { id: UNGROUPED_GROUP_ID, name: '未分组', order: 99 }
  ];

  const bookmarks = [
    {
      id: 'local-bm-101',
      name: 'Kafka 控制台',
      groupId: 'custom-grp-1',
      subscriptionId: 'sub-legacy',
      isReadOnly: true,
      originBookmarkId: 'old-bm-1',
      endpoints: [
        { url: 'https://kafka.internal:9092', name: '内网集群', isDefault: true, privateProbeTag: 'dirty' },
        { url: 'https://kafka.external.com', name: '公网代理' }
      ],
      tags: ['中间件', '消息队列']
    },
    {
      id: 'local-bm-102',
      name: 'Prometheus 监控',
      groupId: 'custom-grp-2',
      endpoints: [{ url: 'http://prometheus.internal:9090' }]
    },
    {
      id: 'local-bm-103',
      name: '杂项草稿',
      groupId: UNGROUPED_GROUP_ID,
      endpoints: [{ url: 'https://draft.example.com' }]
    }
  ];

  // 4.1 导出指定分组，并验证未选分组和系统内置分组被排除
  const payload = buildTeamCollectionPayload({
    name: '基础架构团队源',
    description: '核心中间件与集群监控',
    intranetCidrs: ['10.10.0.0/16'],
    groupIds: ['custom-grp-1'],
    groups,
    bookmarks
  });

  assert.equal(payload.name, '基础架构团队源');
  assert.equal(payload.version, '1.0.0');
  assert.equal(payload.topology.intranetCidrs[0], '10.10.0.0/16');
  assert.equal(payload.groups.length, 1, '应仅导出指定的 custom-grp-1');
  assert.equal(payload.groups[0].name, '研发中间件');
  assert.equal(payload.groups[0].id, 'grp_1', '分组 ID 应被重新映射为稳态自增 ID');

  assert.equal(payload.bookmarks.length, 1, '应仅导出 custom-grp-1 下的书签');
  const exportedBm = payload.bookmarks[0];
  assert.equal(exportedBm.name, 'Kafka 控制台');
  assert.equal(exportedBm.id, 'bm_1', '书签 ID 应被脱敏并重置为稳态自增 ID');
  assert.equal(exportedBm.groupId, 'grp_1', '书签引用的 groupId 应同步指向脱敏后的新 ID');
  assert.equal(exportedBm.subscriptionId, undefined, '内部 subscriptionId 必须被脱敏剔除');
  assert.equal(exportedBm.isReadOnly, undefined, '内部 isReadOnly 标记必须被剔除');
  assert.equal(exportedBm.originBookmarkId, undefined, '内部 originBookmarkId 必须被剔除');
  assert.equal(exportedBm.endpoints[0].privateProbeTag, undefined, '私有探测瞬态字段必须被剔除');
  assert.equal(exportedBm.endpoints[0].url, 'https://kafka.internal:9092');

  // 4.2 验证导出的数据完全符合校验器验证
  const validationResult = validateAndCleanSubscription(payload);
  assert.equal(validationResult.name, '基础架构团队源');
  assert.equal(validationResult.bookmarks.length, 1);

  // 4.3 验证模板生成
  const sample = getSampleSubscriptionTemplate();
  assert.ok(sample.$schema);
  assert.equal(sample.version, '1.0.0');
  assert.ok(sample.groups.length > 0);
  assert.ok(sample.bookmarks.length > 0);

  console.log('✓ 团队源导出脱敏与标准模板验证通过');
}

async function testMcpTools() {
  console.log('--- 5. 验证 MCP 团队协同工具接入 (executeMcpTool) ---');

  // 5.1 验证工具清单包含团队书签工具
  const expectedTools = [
    'export_team_collection',
    'list_subscriptions',
    'sync_subscription',
    'get_sample_team_collection_template'
  ];
  for (const toolName of expectedTools) {
    const found = MCP_TOOL_DEFINITIONS.some(t => t.name === toolName);
    assert.ok(found, `MCP 工具清单中应包含 ${toolName}`);
  }

  // 5.2 测试 get_sample_team_collection_template
  const sampleRes = await executeMcpTool('get_sample_team_collection_template', {});
  assert.equal(sampleRes.version, '1.0.0');
  assert.ok(Array.isArray(sampleRes.groups));

  // 5.3 测试 export_team_collection
  const exportRes = await executeMcpTool('export_team_collection', {
    name: 'MCP测试团队源',
    description: '通过 MCP 导出的测试团队源',
    intranetCidrs: ['172.16.0.0/12']
  });
  assert.equal(exportRes.success, true);
  assert.equal(exportRes.summary.name, 'MCP测试团队源');
  assert.ok(exportRes.payload);
  assert.equal(exportRes.payload.topology.intranetCidrs[0], '172.16.0.0/12');

  // 5.4 测试 list_subscriptions
  const listRes = await executeMcpTool('list_subscriptions', {});
  assert.ok(typeof listRes.total === 'number');
  assert.ok(Array.isArray(listRes.subscriptions));

  // 5.5 测试 sync_subscription (无到期项)
  const syncRes = await executeMcpTool('sync_subscription', {});
  assert.equal(syncRes.success, true);
  assert.ok(Array.isArray(syncRes.results));

  console.log('✓ MCP 团队协同工具协议与无头执行验证通过');
}

async function main() {
  try {
    await testValidator();
    await testDiffAlgorithm();
    await testStorageAndIntegrity();
    await testExporter();
    await testMcpTools();

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
