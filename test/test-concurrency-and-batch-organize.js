import assert from 'node:assert/strict';
import {
  getBookmarks,
  saveBookmark,
  getGroups,
  saveGroup,
  updateGroup,
  clearAllData,
  batchOrganizeBookmarks,
  getSnapshots,
  withStorageLock
} from '../src/services/storage.js';
import { mcpClient } from '../src/services/mcp/client.js';

async function run() {
  console.log('=== 开始执行存储并发保护与原子批量治理测试 ===\n');

  // 1. 初始化干净环境
  await clearAllData();

  // 2. 验证高并发写操作（互斥锁串行化保障，杜绝 Lost-Update）
  console.log('--- 测试 1: 高并发写入测试 (验证 20 个并行 saveBookmark 无数据丢失) ---');
  const parallelCount = 20;
  const promises = [];
  for (let i = 0; i < parallelCount; i++) {
    promises.push(saveBookmark({
      id: `bm_concurrent_${i}`,
      name: `并发书签 ${i}`,
      url: `https://example.com/${i}`,
      tags: [`tag_${i}`]
    }));
  }
  await Promise.all(promises);

  const bmsAfterConcurrent = await getBookmarks();
  console.log(`并发写入完成，实际落盘书签数: ${bmsAfterConcurrent.length}`);
  assert.equal(bmsAfterConcurrent.length, parallelCount, `20 个并发写入的书签必须全部落盘，不能发生覆写丢失`);
  console.log('✔ 测试 1 通过：高并发写入互斥锁防护生效，零丢失更新！\n');

  // 3. 验证递归可重入锁（避免嵌套死锁）
  console.log('--- 测试 2: 可重入锁测试 (避免嵌套调用死锁) ---');
  let reentrantExecuted = false;
  await withStorageLock(async () => {
    // 内部再次调用 withStorageLock
    await withStorageLock(async () => {
      const bms = await getBookmarks();
      assert.ok(bms.length > 0);
      reentrantExecuted = true;
    });
  });
  assert.ok(reentrantExecuted, '可重入锁嵌套执行应成功完成');
  console.log('✔ 测试 2 通过：锁支持递归安全重入！\n');

  // 4. 验证大模型入参容错清洗 (数字 ID、tags 字段、中文逗号分割)
  console.log('--- 测试 3: 大模型 Schema 弹性容错与原子整理测试 ---');
  // 选取第 1、2 个书签准备批量打标和迁移分组
  // 构造模拟外部大模型的容错入参：
  // 书签 0: 使用字符串 ID，groupPlan targetGroupName 为新建树形分组
  // 书签 1: 使用数字或别名字段，tagPlan 提供 tags、中文逗号分割标签
  const initialSnapshots = await getSnapshots();
  const initialSnapCount = initialSnapshots.length;

  const result = await batchOrganizeBookmarks({
    groupPlan: [
      { bookmarkId: 'bm_concurrent_0', targetGroupName: '工作/开发/前端' },
      { id: 'bm_concurrent_1', group: '个人/生活' }
    ],
    tagPlan: [
      { bookmarkId: 'bm_concurrent_0', suggestedTags: ['Node', 'Svelte'] },
      // 容错：使用 tags 字段 + 中文逗号字符串 + 混入前后空格
      { bmId: 'bm_concurrent_1', tags: '音乐， 生活 , 休闲' }
    ],
    tagMode: 'append'
  });

  assert.equal(result.success, true);
  assert.equal(result.groupChanges, 2, '两本书签的分组迁移均应成功');
  assert.equal(result.tagChanges, 2, '两本书签的打标均应成功');
  assert.equal(result.newGroupsCreated, 2, '应成功创建两个新的树形分组');

  // 验证快照仅增加 1 份 (原子事务避免快照放大)
  const afterSnapshots = await getSnapshots();
  assert.equal(afterSnapshots.length - initialSnapCount, 1, '批量整理整个过程应且只应产生 1 份安全快照');

  // 校验落盘数据详情
  const bmsFinal = await getBookmarks();
  const bm0 = bmsFinal.find(b => b.id === 'bm_concurrent_0');
  const bm1 = bmsFinal.find(b => b.id === 'bm_concurrent_1');
  const groupsFinal = await getGroups();

  const devGroup = groupsFinal.find(g => g.name === '工作/开发/前端');
  const lifeGroup = groupsFinal.find(g => g.name === '个人/生活');

  assert.ok(devGroup, '树形分组 "工作/开发/前端" 应存在');
  assert.ok(lifeGroup, '分组 "个人/生活" 应存在');

  assert.equal(bm0.groupId, devGroup.id, '书签 0 的分组应指向新组');
  assert.ok(bm0.tags.includes('Node') && bm0.tags.includes('Svelte') && bm0.tags.includes('tag_0'), '书签 0 应合并新旧标签');

  assert.equal(bm1.groupId, lifeGroup.id, '书签 1 的分组应指向新组');
  assert.ok(bm1.tags.includes('音乐') && bm1.tags.includes('生活') && bm1.tags.includes('休闲'), '中文逗号分割的 tags 应被完全解析并落盘');
  console.log('✔ 测试 3 通过：大模型容错清洗与原子整理落盘完全正确！\n');

  // 5. 验证 MCP executeTool('batch_organize_bookmarks') 链路
  console.log('--- 测试 4: 验证 MCP Client 协议端 batch_organize_bookmarks 调用 ---');
  const mcpRes = await mcpClient.executeTool('batch_organize_bookmarks', {
    groupPlan: [{ bookmarkId: 'bm_concurrent_2', targetGroupName: '工作/开发/前端' }],
    tagPlan: [{ bookmarkId: 'bm_concurrent_2', suggestedTags: ['自动化测试'] }],
    tagMode: 'append'
  });

  assert.equal(mcpRes.success, true);
  assert.equal(mcpRes.groupChanges, 1);
  assert.equal(mcpRes.tagChanges, 1);

  const bm2 = (await getBookmarks()).find(b => b.id === 'bm_concurrent_2');
  assert.equal(bm2.groupId, devGroup.id);
  assert.ok(bm2.tags.includes('自动化测试'));
  console.log('✔ 测试 4 通过：MCP 工具端调用原子治理成功！\n');

  console.log('🎉 全部测试顺利通过！所有并发保护、原子事务与容错能力验证完毕。');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ 测试执行失败:', err);
  process.exit(1);
});
