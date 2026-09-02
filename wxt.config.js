import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: 'Smart Bookmark 智能书签',
    description: '基于网络拓扑智能寻径的多入口书签 Chrome 插件，自动识别内网/外网并在最优地址间极速跳转。',
    version: '1.0.0',
    permissions: [
      'storage',
      'unlimitedStorage',
      'bookmarks',
      'tabs',
      'alarms'
    ],
    host_permissions: [
      '<all_urls>'
    ],
    icons: {
      16: '/icons/icon16.png',
      32: '/icons/icon32.png',
      48: '/icons/icon48.png',
      128: '/icons/icon128.png'
    }
  }
});
