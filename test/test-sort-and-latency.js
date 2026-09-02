import assert from 'node:assert';
import { formatLatencyChinese, PINNED_GROUP_ID, UNGROUPED_GROUP_ID } from '../src/constants/index.js';
import {
  initStorage,
  getGroups,
  getBookmarks,
  saveGroup,
  saveBookmark,
  reorderGroups,
  reorderBookmarks,
  clearAllData
} from '../src/services/storage.js';

async function runTests() {
  console.log('--- 1. 验证延迟中文语义映射 (formatLatencyChinese) ---');
  assert.strictEqual(formatLatencyChinese(null, false).label, '不可达');
  assert.strictEqual(formatLatencyChinese(50, false, 'timeout').label, '超时');
  assert.strictEqual(formatLatencyChinese(null, true).label, '直达');
  assert.strictEqual(formatLatencyChinese(0, true).label, '直达');
  assert.strictEqual(formatLatencyChinese(35, true).label, '极快');
  assert.strictEqual(formatLatencyChinese(180, true).label, '良好');
  assert.strictEqual(formatLatencyChinese(450, true).label, '较慢');
  assert.strictEqual(formatLatencyChinese(1200, true).label, '迟缓');
  console.log('✓ formatLatencyChinese 全部断言通过');

  console.log('--- 2. 验证分组排序 (reorderGroups) ---');
  await initStorage();
  await clearAllData();

  await saveGroup({ id: 'group_dev', name: '开发工具' });
  await saveGroup({ id: 'group_prod', name: '生产运维' });
  await saveGroup({ id: 'group_doc', name: '技术文档' });

  let groups = await getGroups();
  const customOnly = groups.filter(g => g.id !== PINNED_GROUP_ID && g.id !== UNGROUPED_GROUP_ID);
  assert.strictEqual(customOnly.length, 3);
  assert.strictEqual(groups[0].id, PINNED_GROUP_ID, '常用置顶在首位');
  assert.strictEqual(groups[groups.length - 1].id, UNGROUPED_GROUP_ID, '未分组在末位');

  // 将 'group_doc' 移到自定义首位
  await reorderGroups(['group_doc', 'group_dev', 'group_prod']);
  groups = await getGroups();
  const reorderedCustom = groups.filter(g => g.id !== PINNED_GROUP_ID && g.id !== UNGROUPED_GROUP_ID);
  assert.strictEqual(reorderedCustom[0].id, 'group_doc');
  assert.strictEqual(reorderedCustom[1].id, 'group_dev');
  assert.strictEqual(reorderedCustom[2].id, 'group_prod');
  assert.strictEqual(groups[0].id, PINNED_GROUP_ID);
  assert.strictEqual(groups[groups.length - 1].id, UNGROUPED_GROUP_ID);
  console.log('✓ 分组排序持久化与边界保持通过');

  console.log('--- 3. 验证书签排序 (reorderBookmarks) ---');
  await saveBookmark({ id: 'bm_1', name: 'GitHub', url: 'https://github.com', groupId: 'group_dev' });
  await saveBookmark({ id: 'bm_2', name: 'GitLab', url: 'https://gitlab.com', groupId: 'group_dev' });
  await saveBookmark({ id: 'bm_3', name: 'ChatGPT', url: 'https://chat.openai.com', groupId: 'group_dev' });

  let bms = await getBookmarks();
  assert.strictEqual(bms.length, 3);

  // 调整顺序为 bm_3, bm_1, bm_2
  await reorderBookmarks(['bm_3', 'bm_1', 'bm_2']);
  bms = await getBookmarks();
  assert.strictEqual(bms[0].id, 'bm_3');
  assert.strictEqual(bms[0].order, 0);
  assert.strictEqual(bms[1].id, 'bm_1');
  assert.strictEqual(bms[1].order, 1);
  assert.strictEqual(bms[2].id, 'bm_2');
  assert.strictEqual(bms[2].order, 2);
  console.log('✓ 书签排序持久化与 order 计算通过');

  console.log('\n==============================');
  console.log('🎉 排序与延迟映射自动化测试 100% 通过！');
  console.log('==============================');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
