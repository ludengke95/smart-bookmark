import './setup.js';
import assert from 'node:assert/strict';
import { db } from '../src/services/storage/db.js';
import { saveBookmark, getBookmarks, saveAllBookmarks } from '../src/services/storage/bookmark.js';
import { saveGroup, getGroups, batchImportData } from '../src/services/storage/group.js';
import { saveTag, getAllTags } from '../src/services/storage/tag.js';
import { saveSettings, getSettings, clearAllData } from '../src/services/storage/base.js';
import { recordClick, getClickStats } from '../src/services/storage/stats.js';
import { createSnapshot, rollbackToSnapshot } from '../src/services/storage/backup.js';
import { broadcastStorageChange } from '../src/services/storage/sync.js';

function createDeepProxy(target) {
  if (target === null || typeof target !== 'object') return target;
  return new Proxy(target, {
    get(t, prop) {
      if (prop === '__svelte_proxy__') return true;
      const val = t[prop];
      if (typeof val === 'object' && val !== null) {
        return createDeepProxy(val);
      }
      return val;
    }
  });
}

async function run() {
  console.log('=== 开始执行全局 Proxy 穿透与防 DataCloneError 深度测试 ===\n');

  await clearAllData();

  // 1. 书签表写入 Proxy 对象与嵌套属性
  console.log('--- 1. 验证书签表写入 Proxy ---');
  const bmRaw = {
    name: 'Proxy 测试书签',
    url: 'https://proxy-test.com',
    tags: ['代理标签1', '代理标签2'],
    endpoints: [
      { url: 'https://proxy-test.com', order: 0, type: 'extranet', extraProxyObj: { a: 1 } }
    ]
  };
  const bmProxy = createDeepProxy(bmRaw);
  const savedBms = await saveBookmark(bmProxy);
  const matchedBm = savedBms.find(b => b.name === 'Proxy 测试书签');
  assert.ok(matchedBm, '书签写入成功');
  assert.equal(matchedBm.tags.length, 2);
  assert.equal(matchedBm.tagIds.length, 2);
  console.log('✓ 书签 Proxy 写入及 tagIds 关联成功');

  // 2. 分组表写入 Proxy 对象
  console.log('--- 2. 验证分组表写入 Proxy ---');
  const grpRaw = { name: 'Proxy 分组', order: 5 };
  const grpProxy = createDeepProxy(grpRaw);
  const groups = await saveGroup(grpProxy);
  const matchedGrp = groups.find(g => g.name === 'Proxy 分组');
  assert.ok(matchedGrp, '分组写入成功');
  console.log('✓ 分组 Proxy 写入成功');

  // 3. 标签表写入 Proxy 对象
  console.log('--- 3. 验证标签表写入 Proxy ---');
  const tagRaw = { name: '独立Proxy标签', color: '#ff0000' };
  const tagProxy = createDeepProxy(tagRaw);
  const savedTag = await saveTag(tagProxy);
  assert.equal(savedTag.name, '独立Proxy标签');
  console.log('✓ 标签 Proxy 写入成功');

  // 4. 设置偏好写入 Proxy 对象
  console.log('--- 4. 验证全局设置写入 Proxy ---');
  const settingsPatch = createDeepProxy({
    searchEngine: 'bing',
    nestedSetting: { foo: 'bar', list: [1, 2, 3] }
  });
  const updatedSettings = await saveSettings(settingsPatch);
  assert.equal(updatedSettings.searchEngine, 'bing');
  console.log('✓ 全局设置 Proxy 写入成功');

  // 5. 批量导入接口接收 Proxy 列表
  console.log('--- 5. 验证批量导入接口接收 Proxy 列表 ---');
  const importGroups = createDeepProxy([
    { name: '导入Proxy组1' },
    { name: '导入Proxy组2' }
  ]);
  const importBookmarks = createDeepProxy([
    {
      name: '批量导入书签1',
      folder: '导入Proxy组1',
      tags: ['导入Tag1'],
      endpoints: [{ url: 'http://192.168.1.10', order: 0, type: 'intranet' }]
    },
    {
      name: '批量导入书签2',
      url: 'https://import2.com',
      tags: ['导入Tag2']
    }
  ]);
  const importRes = await batchImportData({ newGroups: importGroups, newBookmarks: importBookmarks });
  assert.ok(importRes.bookmarks.some(b => b.name === '批量导入书签1'));
  assert.ok(importRes.groups.some(g => g.name === '导入Proxy组1'));
  console.log('✓ 批量导入 Proxy 数据成功');

  // 6. 快照创建与回滚支持 Proxy
  console.log('--- 6. 验证快照创建与回滚 ---');
  const snap = await createSnapshot('测试Proxy快照');
  assert.ok(snap.id, '快照创建成功');
  await rollbackToSnapshot(snap.id);
  console.log('✓ 快照回滚成功');

  // 7. 广播总线广播包含 Proxy 的 Payload
  console.log('--- 7. 验证广播总线脱敏 ---');
  broadcastStorageChange(createDeepProxy({
    type: 'TEST_PROXY_BROADCAST',
    data: { deep: { proxyValue: true } }
  }));
  console.log('✓ 广播总线脱敏未抛出异常');

  console.log('\n=== 全部 Proxy 脱敏与防 DataCloneError 测试 100% 通过！===');
  process.exit(0);
}

run().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
