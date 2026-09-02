import assert from 'node:assert';
import { recordClick, getClickStats, getDetailedStats, resetAllStats, setStorageData, getBookmarks } from '../src/services/storage.js';

console.log('--- 测试 1: 验证点击记录与统计计算 ---');

// 初始重置统计
await resetAllStats();

const bm1 = 'bm_test_github';
const bm2 = 'bm_test_gitlab';

// 模拟点击 bm1 3 次，bm2 1 次
await recordClick(bm1);
await recordClick(bm1);
await recordClick(bm1);
await recordClick(bm2);

const click30d = await getClickStats('30d');
console.log('30天点击统计:', click30d);
assert.strictEqual(click30d[bm1], 3, 'bm1 30天点击数应为 3');
assert.strictEqual(click30d[bm2], 1, 'bm2 30天点击数应为 1');

const detailed = await getDetailedStats();
console.log('详细统计:', detailed);
assert.strictEqual(detailed.totalClicksMap[bm1], 3, 'bm1 总点击数应为 3');
assert.strictEqual(detailed.totalClicksMap[bm2], 1, 'bm2 总点击数应为 1');
assert.strictEqual(detailed.sevenDaysMap[bm1], 3, 'bm1 近7天点击数应为 3');
assert.strictEqual(detailed.sevenDaysMap[bm2], 1, 'bm2 近7天点击数应为 1');
assert.ok(detailed.lastClickedMap[bm1] > 0, 'bm1 最后访问时间戳应大于 0');
assert.ok(detailed.lastClickedMap[bm2] > 0, 'bm2 最后访问时间戳应大于 0');

// 计算累计总点击
const totalSum = Object.values(detailed.totalClicksMap).reduce((acc, cur) => acc + (Number(cur) || 0), 0);
console.log('累计点击总和:', totalSum);
assert.strictEqual(totalSum, 4, '全部书签累计总点击应为 4');

// 测试模拟排行榜排序
const mockBookmarks = [
  { id: bm2, name: 'GitLab' },
  { id: bm1, name: 'GitHub' },
  { id: 'bm_zero', name: '从未点击' }
];

const ranked = mockBookmarks.map(bm => ({
  ...bm,
  totalClicks: detailed.totalClicksMap[bm.id] || 0,
  recentClicks: detailed.sevenDaysMap[bm.id] || 0,
  lastClicked: detailed.lastClickedMap[bm.id] || 0
})).sort((a, b) => {
  if (b.totalClicks !== a.totalClicks) return b.totalClicks - a.totalClicks;
  if (b.recentClicks !== a.recentClicks) return b.recentClicks - a.recentClicks;
  return (b.lastClicked || 0) - (a.lastClicked || 0);
});

console.log('排行榜排序结果:');
ranked.forEach((r, idx) => {
  console.log(`第 ${idx + 1} 名: [${r.name}] 总点击: ${r.totalClicks}次, 近7天: ${r.recentClicks}次, 最后访问: ${r.lastClicked}`);
});

assert.strictEqual(ranked[0].id, bm1, '第一名应为 GitHub (3次)');
assert.strictEqual(ranked[1].id, bm2, '第二名应为 GitLab (1次)');
assert.strictEqual(ranked[2].id, 'bm_zero', '第三名应为 从未点击 (0次)');

console.log('\n--- 测试 2: 清空统计 ---');
await resetAllStats();
const resetDetailed = await getDetailedStats();
const resetSum = Object.values(resetDetailed.totalClicksMap).reduce((acc, cur) => acc + (Number(cur) || 0), 0);
assert.strictEqual(resetSum, 0, '清空后累计总点击应为 0');

console.log('✅ 点击统计、累计直达与访问排行榜测试全部通过！');
