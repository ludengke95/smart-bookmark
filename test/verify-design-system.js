import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEFAULT_SETTINGS } from '../src/constants/index.js';
import zhNewtab from '../src/i18n/locales/zh-CN/newtab.js';
import enNewtab from '../src/i18n/locales/en-US/newtab.js';

console.log('--- 1. 验证默认配置与多语言字典 ---');
assert.equal(DEFAULT_SETTINGS.layoutMode, 'grid', 'DEFAULT_SETTINGS.layoutMode 应为 grid');
assert.ok(zhNewtab.view?.grid && zhNewtab.view?.list, 'zh-CN 需包含 view.grid 与 view.list');
assert.ok(enNewtab.view?.grid && enNewtab.view?.list, 'en-US 需包含 view.grid 与 view.list');
console.log('✓ 默认配置与 i18n 字典验证通过');

console.log('--- 2. 验证 Tailwind 与 CSS Token 体系 ---');
const tailwindCfg = fs.readFileSync('tailwind.config.js', 'utf8');
assert.ok(tailwindCfg.includes('[data-theme$="-dark"]'), 'Tailwind 暗色选择器需解耦为后缀通配');

const appCss = fs.readFileSync('src/app.css', 'utf8');
assert.ok(appCss.includes('--border-subtle: #2d313c;'), 'Obsidian 主题需提升 border 对比度为柔和低眩光值 #2d313c');
console.log('✓ 主题 Token 与暗色选择器解耦验证通过');

console.log('--- 3. 验证无障碍与原生 title 清理 ---');
const topNav = fs.readFileSync('src/components/newtab/TopNav.svelte', 'utf8');
assert.ok(!topNav.includes('title='), 'TopNav.svelte 应清理所有原生 title 属性');
assert.ok(!topNav.includes('text-[9px]'), 'TopNav.svelte 不得出现 text-[9px]');

const card = fs.readFileSync('src/components/newtab/BookmarkCard.svelte', 'utf8');
assert.ok(!card.includes('title='), 'BookmarkCard.svelte 应清理所有原生 title 属性');
assert.ok(!card.includes('text-[9px]'), 'BookmarkCard.svelte 不得出现 text-[9px]');

const search = fs.readFileSync('src/components/newtab/HeroSearch.svelte', 'utf8');
assert.ok(!search.includes('title='), 'HeroSearch.svelte 应清理所有原生 title 属性');

const modalShell = fs.readFileSync('src/components/common/ModalShell.svelte', 'utf8');
assert.ok(!modalShell.includes('title={t('), 'ModalShell.svelte 关闭按钮应清理原生 title 属性');

console.log('✓ 原生 title 清理与字阶底线验证通过');

console.log('\n==============================');
console.log('🎉 设计系统改造冒烟测试 100% 通过！');
console.log('==============================');
