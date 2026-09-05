#!/usr/bin/env node
// 版本联动（lockstep）：把根包 package.json 的 version 同步写入
// npm 子包 packages/smart-bookmark-mcp/package.json，确保两者同号发布。
// 本地可 `npm run version:sync`；release.yml 在打 tag 后自动执行并校验。

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const subPkgPath = join(root, 'packages', 'smart-bookmark-mcp', 'package.json');
const subPkg = JSON.parse(readFileSync(subPkgPath, 'utf-8'));

if (subPkg.version !== rootPkg.version) {
  subPkg.version = rootPkg.version;
  writeFileSync(subPkgPath, JSON.stringify(subPkg, null, 2) + '\n');
  console.log(`[sync-versions] sub-package ${subPkg.name} -> ${rootPkg.version}`);
} else {
  console.log(`[sync-versions] already in sync (${rootPkg.version})`);
}
