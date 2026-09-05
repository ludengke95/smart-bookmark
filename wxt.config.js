import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { defineConfig } from 'wxt';

// 版本单一真相源：扩展 manifest.version 派生自根包 package.json，
// 避免扩展内部版本号与 zip 命名（{{packageVersion}}）漂移。
const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(
  readFileSync(join(__dirname, 'package.json'), 'utf-8')
);

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
    version,
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
