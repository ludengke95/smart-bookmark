import assert from 'node:assert';
import { normalizeTargetUrl, openInNewTab } from '../src/services/navigation.js';

console.log('--- 1. 验证目标 URL 协议规范化 (normalizeTargetUrl) ---');

// 无协议 IPv4 / 域名 / 端口测试
assert.strictEqual(normalizeTargetUrl('192.168.1.1'), 'http://192.168.1.1');
assert.strictEqual(normalizeTargetUrl('192.168.1.100:8080'), 'http://192.168.1.100:8080');
assert.strictEqual(normalizeTargetUrl('nas.local:5000/web'), 'http://nas.local:5000/web');
assert.strictEqual(normalizeTargetUrl('localhost:3000'), 'http://localhost:3000');
assert.strictEqual(normalizeTargetUrl('github.com'), 'http://github.com');
assert.strictEqual(normalizeTargetUrl('  example.com/path?arg=1  '), 'http://example.com/path?arg=1');

// 已有协议测试
assert.strictEqual(normalizeTargetUrl('http://192.168.1.1'), 'http://192.168.1.1');
assert.strictEqual(normalizeTargetUrl('https://google.com'), 'https://google.com');
assert.strictEqual(normalizeTargetUrl('chrome://newtab'), 'chrome://newtab');
assert.strictEqual(normalizeTargetUrl('edge://settings'), 'edge://settings');
assert.strictEqual(normalizeTargetUrl('//cdn.example.com/lib.js'), '//cdn.example.com/lib.js');

// 空值容错测试
assert.strictEqual(normalizeTargetUrl(''), '');
assert.strictEqual(normalizeTargetUrl(null), '');
assert.strictEqual(normalizeTargetUrl(undefined), '');

console.log('✓ normalizeTargetUrl 测试全部通过！');

console.log('--- 2. 验证 openInNewTab 环境适配 ---');

// 模拟 chrome.tabs.create 环境
let tabCreatedWith = null;
globalThis.chrome = {
  tabs: {
    create: (opts) => {
      tabCreatedWith = opts;
    }
  }
};

openInNewTab('192.168.1.100:8080');
assert.deepStrictEqual(tabCreatedWith, { url: 'http://192.168.1.100:8080', active: true });

openInNewTab('https://github.com', false);
assert.deepStrictEqual(tabCreatedWith, { url: 'https://github.com', active: false });

// 模拟无 chrome 环境，回退到 window.open
delete globalThis.chrome;
let windowOpenedWith = null;
globalThis.window = {
  open: (url, target, features) => {
    windowOpenedWith = { url, target, features };
    return { opener: null };
  }
};

openInNewTab('10.0.0.1:9000');
assert.strictEqual(windowOpenedWith.url, 'http://10.0.0.1:9000');
assert.strictEqual(windowOpenedWith.target, '_blank');
assert.strictEqual(windowOpenedWith.features, 'noopener,noreferrer');

console.log('✓ openInNewTab (Chrome API 与 window.open 双模) 测试全部通过！');

console.log('\n==============================');
console.log('🎉 导航与新页面打开服务测试 100% 通过！');
console.log('==============================');
