import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { defineConfig } from 'wxt';

// 版本单一真相源：扩展 manifest.version 派生自根包 package.json，
// 避免扩展内部版本号与 zip 命名（{{packageVersion}}）漂移。
const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(
  readFileSync(join(__dirname, 'package.json'), 'utf-8')
);

// 针对不同浏览器的扩展描述文本动态替换（如 Edge 商店严禁出现 Chrome 关键词）
const BROWSER_LOCALE_REPLACEMENTS = {
  edge: {
    zh_CN: [
      [/Chrome 插件/g, 'Edge 扩展'],
      [/Chrome 扩展/g, 'Edge 扩展'],
      [/Chrome/g, 'Edge'],
    ],
    en: [
      [/Chrome extension/g, 'Edge extension'],
      [/Chrome Extension/g, 'Edge Extension'],
      [/Chrome/g, 'Edge'],
    ]
  },
  firefox: {
    zh_CN: [
      [/Chrome 插件/g, 'Firefox 扩展'],
      [/Chrome 扩展/g, 'Firefox 扩展'],
      [/Chrome/g, 'Firefox'],
    ],
    en: [
      [/Chrome extension/g, 'Firefox extension'],
      [/Chrome Extension/g, 'Firefox Extension'],
      [/Chrome/g, 'Firefox'],
    ]
  }
};

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  zip: {
    // Release 附件的插件包命名：smart-bookmark-v<根包版本>-<浏览器>.zip
    artifactTemplate: '{{name}}-v{{packageVersion}}-{{browser}}.zip',
  },
  manifest: ({ browser }) => {
    const isChromium = browser !== 'firefox';
    const permissions = [
      'unlimitedStorage',
      'activeTab',
      'alarms',
      'nativeMessaging',
      ...(isChromium ? ['offscreen'] : [])
    ];

    const baseManifest = {
      default_locale: 'zh_CN',
      name: '__MSG_extName__',
      description: '__MSG_extDescription__',
      action: {
        default_title: '__MSG_actionTitle__'
      },
      version,
      permissions,
      optional_permissions: [
        'bookmarks'
      ],
      chrome_url_overrides: {
        newtab: 'home.html'
      },
      host_permissions: [
        '<all_urls>'
      ],
      icons: {
        16: '/icons/icon16.png',
        32: '/icons/icon32.png',
        48: '/icons/icon48.png',
        128: '/icons/icon128.png'
      }
    };

    if (isChromium) {
      // 固定 Chrome/Edge 未打包扩展的 Extension ID (gobioihpdadhghfbefcnobinbfadmpli)，便于本地 Native Messaging 注册
      baseManifest.key = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzBbOV16TQ7wXCOxHyDPZUFzNp7hdTQ7zZ0reIp3JsoBypufMvkl3qm7YM/TMAAjkF2CMyrKBH2xLxts6BAC7TOEidVWnMfwcAWJ9s7psJ5QVtYfYuQMv11lmQyPLaFDGSegQK6hLjjFj2I22/qoAPUw/RVnfCHHSeLtNcCYxXq9M3nKqTyvYGyIL43muvDecaFrnW+OhZxFo75ik59zmTcUeOcDxshQW2gkXbheueiXwRYOVxgXVsUr2e/dWPPz3kDLRjni9QHoKW3FhRrA1CKPQjjrLni72wcByFzZ7nB6ZEtwz7IHJHnOCdAnP6W+IJzSZXpJtzwJq4jIpSoIsVwIDAQAB';
    }

    return baseManifest;
  },
  hooks: {
    'build:done': (wxt) => {
      const browser = wxt.config.browser;
      const replacements = BROWSER_LOCALE_REPLACEMENTS[browser];
      if (!replacements) return;

      const localesDir = join(wxt.config.outDir, '_locales');
      if (!existsSync(localesDir)) return;

      for (const [locale, rules] of Object.entries(replacements)) {
        const messagesPath = join(localesDir, locale, 'messages.json');
        if (!existsSync(messagesPath)) continue;

        let content = readFileSync(messagesPath, 'utf-8');
        for (const [pattern, replacement] of rules) {
          content = content.replace(pattern, replacement);
        }
        writeFileSync(messagesPath, content, 'utf-8');
      }
    }
  }
});
