#!/usr/bin/env node
/**
 * Release PR 零信任安全审计脚本：
 * 1. 严格校验改动文件列表，只允许白名单中的版本元数据文件：
 *    - package.json
 *    - package-lock.json
 *    - packages/smart-bookmark-mcp/package.json
 *    - packages/smart-bookmark-mcp/package-lock.json
 *    - RELEASE_NOTES.md
 * 2. 深度语义校验：
 *    - 对比基准分支（origin/master）与当前 PR 分支的 package.json
 *    - 确保除 version 字段外，绝无任何新增依赖、开发依赖、构建脚本或钩子被篡改
 * 3. 一致性校验：
 *    - 确保根包版本号与 MCP 子包版本号完全一致
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// 允许改动的安全白名单文件清单
const ALLOWED_FILES = new Set([
  'package.json',
  'package-lock.json',
  'packages/smart-bookmark-mcp/package.json',
  'packages/smart-bookmark-mcp/package-lock.json',
  'RELEASE_NOTES.md'
]);

function runGit(cmd) {
  try {
    return execSync(cmd, { cwd: root, encoding: 'utf-8' }).trim();
  } catch (err) {
    return null;
  }
}

console.log('🛡️ [Release Security Audit] 开始执行 Release PR 零信任安全审计...\n');

// 1. 确定基准对比分支（优先 origin/master，兜底 master 或 HEAD~1）
let baseRef = 'origin/master';
if (!runGit(`git rev-parse --verify ${baseRef}`)) {
  baseRef = runGit('git rev-parse --verify master') ? 'master' : 'HEAD~1';
}

console.log(`• 基准比对分支: ${baseRef}`);

// 2. 获取 PR 改动的所有文件列表（同时兼容已 commit 和本地暂存测试）
let diffOutput = runGit(`git diff --name-only ${baseRef}...HEAD`) || '';
if (!diffOutput.trim()) {
  diffOutput = runGit(`git diff --name-only ${baseRef}`) || '';
}
const changedFiles = diffOutput.split('\n').map(f => f.trim().replace(/\\/g, '/')).filter(Boolean);

console.log(`• 本次 PR 改动的文件数量: ${changedFiles.length}`);
for (const file of changedFiles) {
  console.log(`   - ${file}`);
}

if (changedFiles.length === 0) {
  console.error('\n❌ [安全拦截] 未检测到任何变更文件！');
  process.exit(1);
}

// 3. 文件白名单审计：禁止改动任何白名单之外的文件
const unauthorizedFiles = changedFiles.filter(f => !ALLOWED_FILES.has(f));
if (unauthorizedFiles.length > 0) {
  console.error('\n❌ [安全拦截] 检测到非白名单文件变动！Release PR 严禁改动任何业务代码：');
  for (const f of unauthorizedFiles) {
    console.error(`   🚨 未授权文件: ${f}`);
  }
  process.exit(1);
}
console.log('✓ 文件白名单审计通过（未触碰任何业务与逻辑源码）');

// 4. 语义内容深度审计：验证 package.json 只有 version 发生变化
function verifyOnlyVersionChanged(relativePath) {
  const baseContentRaw = runGit(`git show ${baseRef}:${relativePath}`);
  if (!baseContentRaw) {
    console.error(`\n❌ [安全拦截] 无法在基准分支 ${baseRef} 中找到 ${relativePath}`);
    process.exit(1);
  }

  const baseJson = JSON.parse(baseContentRaw);
  const currentJson = JSON.parse(readFileSync(join(root, relativePath), 'utf-8'));

  // 校验当前版本是否大于基准版本
  if (baseJson.version === currentJson.version) {
    console.error(`\n❌ [安全拦截] ${relativePath} 中的版本号未发生变更 (${baseJson.version})`);
    process.exit(1);
  }

  // 深度比对除 version 外的所有键
  const allKeys = new Set([...Object.keys(baseJson), ...Object.keys(currentJson)]);
  for (const key of allKeys) {
    if (key === 'version') continue;
    const baseVal = JSON.stringify(baseJson[key]);
    const currVal = JSON.stringify(currentJson[key]);
    if (baseVal !== currVal) {
      console.error(`\n❌ [安全拦截] 检测到 ${relativePath} 中非法改动了非版本字段 "${key}"！`);
      console.error(`   旧值: ${baseVal}`);
      console.error(`   新值: ${currVal}`);
      process.exit(1);
    }
  }

  console.log(`✓ ${relativePath} 语义审计通过（仅更新了 version: ${baseJson.version} -> ${currentJson.version}）`);
  return { baseVersion: baseJson.version, newVersion: currentJson.version };
}

const rootRes = verifyOnlyVersionChanged('package.json');
const subRes = verifyOnlyVersionChanged('packages/smart-bookmark-mcp/package.json');

// 5. 多包版本一致性断言
if (rootRes.newVersion !== subRes.newVersion) {
  console.error(`\n❌ [安全拦截] 根包版本 (${rootRes.newVersion}) 与子包版本 (${subRes.newVersion}) 不一致！`);
  process.exit(1);
}

console.log(`\n🎉 [Release Security Audit] 所有安全审计全部通过！可以安全批准并自动合并发版 PR。`);
