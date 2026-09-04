import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  zip: {
    // Release 附件的插件包命名：smart-bookmark-v<根包版本>-<浏览器>.zip
    artifactTemplate: '{{name}}-v{{packageVersion}}-{{browser}}.zip',
  },
  manifest: {
    default_locale: 'zh_CN',
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    action: {
      default_title: '__MSG_actionTitle__'
    },
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
