import assert from 'node:assert/strict';
import {
  getBookmarks,
  saveBookmark,
  getGroups,
  saveGroup,
  updateGroup,
  deleteGroup,
  renameTag,
  deleteTag,
  clearAllData
} from '../src/services/storage.js';
import { mcpClient } from '../src/services/mcp/client.js';
import { PINNED_GROUP_ID, UNGROUPED_GROUP_ID } from '../src/constants/index.js';

async function run() {
  console.log('--- 1. 重置初始数据 ---');
  await clearAllData();

  console.log('--- 2. 验证分组 Update 与 Delete (存储层) ---');
  // 创建一个测试分组
  const groupsAfterAdd = await saveGroup({ name: '测试待改分组' });
  const created = groupsAfterAdd.find(g => g.name === '测试待改分组');
  assert.ok(created, '新建分组应存在');

  // 修改分组名称
  const updatedGroups = await updateGroup(created.id, '已重命名分组');
  const renamed = updatedGroups.find(g => g.id === created.id);
  assert.equal(renamed.name, '已重命名分组', '分组名称应已更新');

  // 内置分组不可修改/删除
  await assert.rejects(
    async () => updateGroup(PINNED_GROUP_ID, '新常用'),
    (err) => err.code === 'builtinGroupNoDelete' || /built-in/i.test(err.message),
    '常用分组禁止修改'
  );
  await assert.rejects(
    async () => deleteGroup(UNGROUPED_GROUP_ID),
    (err) => err.code === 'builtinGroupNoDelete' || /built-in/i.test(err.message),
    '未分组禁止删除'
  );

  // 添加属于该组的书签并删除分组，验证书签安全迁移至未分组
  const bmId = 'bm_test_' + Date.now();
  await saveBookmark({
    id: bmId,
    name: '测试书签',
    groupId: created.id,
    tags: ['前端', 'Vue', '工具'],
    endpoints: [{ url: 'https://vuejs.org', type: 'extranet' }]
  });

  await deleteGroup(created.id);
  const bmsAfterDeleteGroup = await getBookmarks();
  const targetBm = bmsAfterDeleteGroup.find(b => b.id === bmId);
  assert.equal(targetBm.groupId, UNGROUPED_GROUP_ID, '删除分组后其书签应自动归入未分组');
  console.log('✓ 分组更新、内置组安全限制、删除与书签归属降级验证通过');

  console.log('--- 3. 验证标签 Rename (合并) 与 Delete (存储层) ---');
  // 再加一个书签，已有 'Vue3' 和 '工具'
  const bmId2 = 'bm_test2_' + Date.now();
  await saveBookmark({
    id: bmId2,
    name: '测试书签2',
    groupId: UNGROUPED_GROUP_ID,
    tags: ['Vue3', '工具'],
    endpoints: [{ url: 'https://v3.vuejs.org', type: 'extranet' }]
  });

  // 全局将 'Vue' 重命名为 'Vue3'（测试书签1 原有 ['前端', 'Vue', '工具'] 应变为 ['前端', 'Vue3', '工具']）
  const renameRes = await renameTag('Vue', 'Vue3');
  assert.equal(renameRes.success, true);
  assert.equal(renameRes.modifiedCount, 1);

  const bmsAfterRename = await getBookmarks();
  const b1 = bmsAfterRename.find(b => b.id === bmId);
  assert.ok(b1.tags.includes('Vue3'), '标签应被重命名为 Vue3');
  assert.ok(!b1.tags.includes('Vue'), '原标签 Vue 应不存在');

  // 合并验证：将 'Vue3' 重命名为 '工具'（测试书签1 与测试书签2 均已拥有 '工具'，应自动去重）
  const mergeRes = await renameTag('Vue3', '工具');
  assert.equal(mergeRes.success, true);
  const bmsAfterMerge = await getBookmarks();
  const b1Merged = bmsAfterMerge.find(b => b.id === bmId);
  const b2Merged = bmsAfterMerge.find(b => b.id === bmId2);
  assert.equal(b1Merged.tags.filter(t => t === '工具').length, 1, '去重后应只有 1 个工具标签');
  assert.equal(b2Merged.tags.filter(t => t === '工具').length, 1, '去重后应只有 1 个工具标签');
  console.log('✓ 标签全局重命名、多书签合并与去重机制验证通过');

  // 全局删除 '工具' 标签
  const deleteTagRes = await deleteTag('工具');
  assert.equal(deleteTagRes.success, true);
  assert.ok(deleteTagRes.modifiedCount >= 2);
  const bmsAfterDeleteTag = await getBookmarks();
  for (const b of bmsAfterDeleteTag) {
    assert.ok(!(b.tags || []).includes('工具'), '所有书签中不应再有工具标签');
  }
  console.log('✓ 标签全局彻底删除验证通过');

  console.log('--- 4. 验证 MCP executeTool 工具调用 ---');
  // MCP create_group
  const mcpCreateGrp = await mcpClient.executeTool('create_group', { name: 'MCP新建组' });
  assert.equal(mcpCreateGrp.success, true);
  const newGid = mcpCreateGrp.group.id;

  // MCP update_group
  const mcpUpdateGrp = await mcpClient.executeTool('update_group', { id: newGid, name: 'MCP更新组名' });
  assert.equal(mcpUpdateGrp.success, true);
  assert.equal(mcpUpdateGrp.group.name, 'MCP更新组名');

  // MCP delete_group
  const mcpDelGrp = await mcpClient.executeTool('delete_group', { id: newGid });
  assert.equal(mcpDelGrp.success, true);

  // MCP rename_tag & delete_tag
  await saveBookmark({
    id: 'bm_mcp_tag',
    name: 'MCP标签测试',
    groupId: UNGROUPED_GROUP_ID,
    tags: ['OldTag', 'CommonTag'],
    endpoints: [{ url: 'https://example.com' }]
  });

  const mcpRenameTag = await mcpClient.executeTool('rename_tag', { oldTag: 'OldTag', newTag: 'NewTag' });
  assert.equal(mcpRenameTag.success, true);
  assert.equal(mcpRenameTag.modifiedCount, 1);

  const mcpDeleteTag = await mcpClient.executeTool('delete_tag', { tag: 'NewTag' });
  assert.equal(mcpDeleteTag.success, true);
  assert.equal(mcpDeleteTag.modifiedCount, 1);

  console.log('✓ MCP 工具 executeTool 全部测试通过！');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
