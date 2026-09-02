import assert from 'node:assert';
import {
  ipToUint32,
  isPrivateIp,
  classifyUrl,
  getCommonPrefixBits,
  sortEndpointsByTopology
} from '../src/services/xor-matcher.js';

console.log('--- 1. 验证 IPv4 与 Uint32 转换 ---');
assert.strictEqual(ipToUint32('192.168.1.1'), ((192 << 24) | (168 << 16) | (1 << 8) | 1) >>> 0);
console.log('✓ IPv4 转换测试通过');

console.log('--- 2. 验证最长前缀异或匹配 (XOR Longest Common Prefix) ---');
const localIp = '192.168.10.50';
// 192.168.10.100 与 localIp 共享前 24+ 位前缀
// 192.168.20.100 仅共享前 16+ 位前缀
// 10.0.0.1 共享 0 位前缀
const prefixSameSubnet = getCommonPrefixBits(localIp, '192.168.10.100');
const prefixDiffSubnet = getCommonPrefixBits(localIp, '192.168.20.100');
const prefixDiffClass = getCommonPrefixBits(localIp, '10.0.0.1');

assert(prefixSameSubnet > prefixDiffSubnet, '同子网应比跨子网共享更多前缀位数');
assert(prefixDiffSubnet > prefixDiffClass, '跨子网应比不同A类地址共享更多前缀位数');
console.log(`✓ 前缀匹配验证通过 (同子网: ${prefixSameSubnet} bits, 跨子网: ${prefixDiffSubnet} bits, A类: ${prefixDiffClass} bits)`);

console.log('--- 3. 验证内网 CIDR 私有地址判定 ---');
assert.strictEqual(isPrivateIp('10.1.2.3'), true, '10.0.0.0/8 应为私有');
assert.strictEqual(isPrivateIp('172.16.5.6'), true, '172.16.0.0/12 应为私有');
assert.strictEqual(isPrivateIp('172.31.255.255'), true, '172.31.255.255 应为私有');
assert.strictEqual(isPrivateIp('172.32.0.1'), false, '172.32.0.1 应为公网');
assert.strictEqual(isPrivateIp('192.168.1.1'), true, '192.168.0.0/16 应为私有');
assert.strictEqual(isPrivateIp('127.0.0.1'), true, '127.0.0.0/8 应为回环');
assert.strictEqual(isPrivateIp('8.8.8.8'), false, '8.8.8.8 应为公网');
console.log('✓ 内网 CIDR 私网判定测试通过');

console.log('--- 4. 验证 URL 分类 ---');
const classLocal = classifyUrl('http://192.168.1.100:8080/dashboard');
assert.strictEqual(classLocal.isIntranet, true);
assert.strictEqual(classLocal.ip, '192.168.1.100');

const classDomain = classifyUrl('https://github.com/explore');
assert.strictEqual(classDomain.isIntranet, false);
assert.strictEqual(classDomain.host, 'github.com');
console.log('✓ URL 结构与类型分类测试通过');

console.log('--- 5. 验证网络拓扑智能寻径排序 (Topology Sorting) ---');
const endpoints = [
  { url: 'https://gitlab.example-corp.com', order: 0 },
  { url: 'http://10.200.1.5:8080', order: 1 },
  { url: 'http://192.168.10.88:8080', order: 2 }
];

// 当本机处于 192.168.10.x 内网时：192.168.10.88 应排在首位
const res1 = sortEndpointsByTopology(endpoints, '192.168.10.2', {});
assert.strictEqual(res1.optimal.url, 'http://192.168.10.88:8080');

// 当内网 192.168.10.88 探测不可达时，降级到 10.200.1.5:8080 或外网域名
const res2 = sortEndpointsByTopology(endpoints, '192.168.10.2', {
  'http://192.168.10.88:8080': { reachable: false }
});
assert.strictEqual(res2.optimal.url, 'http://10.200.1.5:8080');

console.log('✓ 网络拓扑寻径与容灾降级算法验证通过');
console.log('\n==============================');
console.log('🎉 所有底层算法单元测试 100% 通过！');
console.log('==============================');
