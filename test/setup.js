/**
 * Node.js 测试环境统一启动垫片 (Test Environment Setup)
 * 自动注入 fake-indexeddb 模拟浏览器 IndexedDB，并提供标准 BroadcastChannel。
 */
import 'fake-indexeddb/auto';

// Node 18+ 原生支持 BroadcastChannel，若缺失提供轻量 mock 兜底
if (typeof globalThis.BroadcastChannel === 'undefined') {
  globalThis.BroadcastChannel = class BroadcastChannelMock {
    constructor(name) {
      this.name = name;
    }
    postMessage() {}
    addEventListener() {}
    removeEventListener() {}
    close() {}
  };
}
