#!/usr/bin/env node
/**
 * 自动计算并同步更新版本号：
 * 1. 支持指定版本（如 1.0.1 或 v1.0.1）
 * 2. 支持留空自动按类型递增（patch / minor / major，默认 patch）
 * 3. 自动同步更新：
 *    - 根目录 package.json
 *    - packages/smart-bookmark-mcp/package.json
 *    - 根目录 package-lock.json
 *    - packages/smart-bookmark-mcp/package-lock.json
 * 4. 支持导出到 GitHub Actions $GITHUB_OUTPUT (new_version, previous_version)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const rootPkgPath = join(root, 'package.json');
const subPkgPath = join(root, 'packages', 'smart-bookmark-mcp', 'package.json');
const rootLockPath = join(root, 'package-lock.json');
const subLockPath = join(root, 'packages', 'smart-bookmark-mcp', 'package-lock.json');

const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf-8'));
const currentVersion = rootPkg.version;

// 解析输入参数（环境变量优先，其次 CLI 参数）
const rawInputVersion = (process.env.INPUT_VERSION || process.argv[2] || '').trim();
const bumpType = (process.env.INPUT_BUMP_TYPE || process.argv[3] || 'patch').trim().toLowerCase();

let targetVersion = '';

if (rawInputVersion) {
  // 去除可能的前缀 'v'
  const normalized = rawInputVersion.replace(/^v/i, '');
  if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(normalized)) {
    console.error(`[bump-version] 错误: 输入的版本号 "${rawInputVersion}" 不符合语义化版本格式 (SemVer，如 1.0.1)`);
    process.exit(1);
  }
  targetVersion = normalized;
} else {
  // 自动递增模式
  const match = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)(.*)$/);
  if (!match) {
    console.error(`[bump-version] 错误: 当前版本 "${currentVersion}" 无法按常规格式解析`);
    process.exit(1);
  }

  let major = parseInt(match[1], 10);
  let minor = parseInt(match[2], 10);
  let patch = parseInt(match[3], 10);

  if (bumpType === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (bumpType === 'minor') {
    minor += 1;
    patch = 0;
  } else if (bumpType === 'patch') {
    patch += 1;
  } else {
    console.error(`[bump-version] 错误: 不支持的 bump 类型 "${bumpType}" (允许: patch | minor | major)`);
    process.exit(1);
  }

  targetVersion = `${major}.${minor}.${patch}`;
}

console.log(`[bump-version] 当前版本: ${currentVersion} -> 目标新版本: ${targetVersion}`);

// 1. 更新根 package.json
rootPkg.version = targetVersion;
writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + '\n');
console.log(`✓ 已更新 ${rootPkgPath}`);

// 2. 更新 MCP 子包 package.json
if (existsSync(subPkgPath)) {
  const subPkg = JSON.parse(readFileSync(subPkgPath, 'utf-8'));
  subPkg.version = targetVersion;
  writeFileSync(subPkgPath, JSON.stringify(subPkg, null, 2) + '\n');
  console.log(`✓ 已更新 ${subPkgPath}`);
}

// 3. 更新锁文件（零网络依赖精准更新）
function updateLockfile(filePath, newVersion) {
  if (existsSync(filePath)) {
    const lock = JSON.parse(readFileSync(filePath, 'utf-8'));
    lock.version = newVersion;
    if (lock.packages && lock.packages['']) {
      lock.packages[''].version = newVersion;
    }
    writeFileSync(filePath, JSON.stringify(lock, null, 2) + '\n');
    console.log(`✓ 已同步锁文件 ${filePath}`);
  }
}

updateLockfile(rootLockPath, targetVersion);
updateLockfile(subLockPath, targetVersion);

// 4. 导出变量供 GitHub Actions 使用
if (process.env.GITHUB_OUTPUT) {
  const outputContent = `new_version=${targetVersion}\nprevious_version=${currentVersion}\n`;
  writeFileSync(process.env.GITHUB_OUTPUT, outputContent, { flag: 'a' });
  console.log(`✓ 已写入 GITHUB_OUTPUT (new_version=${targetVersion})`);
}

console.log(`\n🎉 版本成功升级至 ${targetVersion}！`);
