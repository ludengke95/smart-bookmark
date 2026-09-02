import assert from 'node:assert';
import { classifyUrl, sortEndpointsByTopology } from '../src/services/xor-matcher.js';
import { UNGROUPED_GROUP_ID, PINNED_GROUP_ID, DEFAULT_GROUPS, DEFAULT_BOOKMARKS } from '../src/constants/index.js';
import { getBookmarks, saveBookmark, batchImportData, setStorageData, getStorageData } from '../src/services/storage.js';

console.log('--- 测试 1: 验证 sortEndpointsByTopology 各种输入格式 ---');
// 1. 标准对象数组
const r1 = sortEndpointsByTopology([{ url: 'https://github.com', order: 0 }]);
assert.strictEqual(r1.optimal?.url, 'https://github.com');
assert.strictEqual(r1.optimal?.host, 'github.com');

// 2. 字符串数组
const r2 = sortEndpointsByTopology(['https://bing.com', 'http://192.168.1.1']);
assert.strictEqual(r2.optimal?.url, 'http://192.168.1.1'); // 内网优先

// 3. 包含空对象或无 url 对象的防御
const r3 = sortEndpointsByTopology([null, {}, { url: 'https://google.com' }]);
assert.strictEqual(r3.optimal?.url, 'https://google.com');

// 4. 空数组返回无配置
const r4 = sortEndpointsByTopology([]);
assert.strictEqual(r4.optimal, null);
assert.strictEqual(r4.reason, '无配置入口');

console.log('✅ 寻径函数防御测试通过');

console.log('\n--- 测试 2: 模拟书签导入与存储持久化刷新 ---');
// 模拟向存储直接写入包含 legacy url 字段或多种格式的书签
const mockRawStorageList = [
  { id: 'bm_1', name: 'Legacy URL 书签', url: 'https://v2ex.com', groupId: UNGROUPED_GROUP_ID },
  { id: 'bm_2', name: 'Endpoints 书签', endpoints: [{ url: 'https://github.com' }], groupId: UNGROUPED_GROUP_ID },
  { id: 'bm_3', name: '空 endpoints 但有 url', endpoints: [], url: 'https://developer.mozilla.org', groupId: UNGROUPED_GROUP_ID }
];

await setStorageData('smart_bm_list', mockRawStorageList);

// 模拟页面初次加载 / 刷新 (调用 getBookmarks)
const loadedBookmarks = await getBookmarks();
console.log('读取到的书签数量:', loadedBookmarks.length);

for (const bm of loadedBookmarks) {
  const route = sortEndpointsByTopology(bm.endpoints);
  console.log(`书签 [${bm.name}] 寻径结果:`, route.optimal?.url, '拓扑目标:', route.optimal?.targetIp || route.optimal?.host);
  assert.ok(route.optimal, `书签 [${bm.name}] 在刷新后必须能正确寻径`);
  assert.ok(route.optimal.url, `书签 [${bm.name}] 必须有有效的访问 URL`);
}

console.log('✅ 书签刷新后持久化与寻径测试通过');

console.log('\n--- 测试 3: 模拟 batchImportData 批量导入 ---');
const newImports = [
  { name: 'Vue.js', url: 'https://vuejs.org', folder: '前端' },
  { name: 'Svelte', url: 'https://svelte.dev', folder: '前端' }
];

const prepared = newImports.map(item => ({
  name: item.name,
  url: item.url,
  endpoints: [{ url: item.url, order: 0, type: classifyUrl(item.url).type }]
}));

const batchRes = await batchImportData({
  newGroups: [{ name: '前端' }],
  newBookmarks: prepared
});

console.log('导入成功，总书签数:', batchRes.bookmarks.length);

// 再次模拟刷新
const refreshedBms = await getBookmarks();
for (const bm of refreshedBms) {
  const route = sortEndpointsByTopology(bm.endpoints);
  assert.ok(route.optimal, `书签 [${bm.name}] 刷新后必须有 optimal`);
  assert.ok(route.optimal.url, `书签 [${bm.name}] 刷新后必须有 URL`);
}

console.log('✅ 全部测试用例执行完毕，全部通过！');
