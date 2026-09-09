#!/usr/bin/env node
/**
 * scripts/generate-release-notes.mjs
 * 
 * 自动生成标准化 Release Notes：
 * 1. 自动计算前序 tag 与当前 tag 比对区间，彻底解决 tag 已打时 conventional-changelog 误判 Unreleased 或空文件的缺陷 (Closes #15)
 * 2. 变更内容智能分类：
 *    - 🚀 Features / 新增功能
 *    - 🐛 Bug Fixes / 错误修复
 *    - ⚡ Performance / 性能优化
 *    - 🛠️ Maintenance & Improvements / 工程与维护
 * 3. 完美对齐 GitHub 官方 Release 规范：
 *    - 智能保留 ## New Contributors（有新增贡献者时展示，无则自动省略）
 *    - 自动追加 **Full Changelog** 版本对比链接
 * 4. 优先调用 GitHub API (支持在线 PR 链接与贡献者统计)，失败时无缝降级至本地 Git 提交分析与 Conventional 规则
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const rootPkgPath = join(root, 'package.json');
const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf-8'));

// 目标版本与输出路径解析
const rawInputVersion = (process.env.RELEASE_TAG || process.env.TARGET_VERSION || process.argv[2] || rootPkg.version).trim();
const normalizedVersion = rawInputVersion.replace(/^v/i, '');
const currentTag = `v${normalizedVersion}`;
const outputFile = (process.env.OUTPUT_FILE || process.argv[3] || 'RELEASE_NOTES.md').trim();
const outputPath = join(root, outputFile);

// 获取仓库所有语义化 tag（按 semver 倒序）
function getSemverTags() {
  try {
    const raw = execSync('git tag -l "v*" --sort=-v:refname', { encoding: 'utf-8', cwd: root });
    return raw.split('\n').map(t => t.trim()).filter(Boolean);
  } catch (err) {
    console.warn('[generate-release-notes] 读取 git tag 失败:', err.message);
    return [];
  }
}

const tags = getSemverTags();
let previousTag = '';

const currentTagIndex = tags.indexOf(currentTag);
if (currentTagIndex !== -1) {
  // 当前 tag 已存在（如 CI 在打 tag 后执行此脚本）
  if (currentTagIndex + 1 < tags.length) {
    previousTag = tags[currentTagIndex + 1];
  }
} else {
  // 当前 tag 尚未创建，前序 tag 即为已有最新 tag
  if (tags.length > 0) {
    previousTag = tags[0];
  }
}

console.log(`[generate-release-notes] 目标版本: ${normalizedVersion} (当前 Tag: ${currentTag}, 前序 Tag: ${previousTag || 'None (Initial Release)'})`);

// 获取 GitHub 仓库信息
function getRepoInfo() {
  const defaultOwner = 'ludengke95';
  const defaultRepo = 'smart-bookmark';
  try {
    const remoteUrl = execSync('git config --get remote.origin.url', { encoding: 'utf-8', cwd: root }).trim();
    const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/i);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }
  } catch {
    // 降级使用默认
  }
  return { owner: defaultOwner, repo: defaultRepo };
}

const { owner, repo } = getRepoInfo();

/**
 * 将 What's Changed 内容智能归纳为 功能 / 修复 / 维护 分组
 */
function categorizeWhatsChanged(markdown) {
  const lines = markdown.split('\n');
  const categories = {
    features: { title: '## 🚀 Features / 新增功能', items: [] },
    bugfixes: { title: '## 🐛 Bug Fixes / 错误修复', items: [] },
    perf: { title: '## ⚡ Performance / 性能优化', items: [] },
    maintenance: { title: '## 🛠️ Maintenance & Improvements / 工程与维护', items: [] }
  };

  const otherSections = [];
  let inWhatsChanged = false;
  let fullChangelog = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^##\s+What's\s+Changed/i.test(line)) {
      inWhatsChanged = true;
      continue;
    }

    if (line.startsWith('**Full Changelog**:')) {
      fullChangelog = line;
      inWhatsChanged = false;
      continue;
    }

    if (line.startsWith('## ') && !/^##\s+What's\s+Changed/i.test(line)) {
      inWhatsChanged = false;
    }

    if (inWhatsChanged && line.trim().startsWith('*')) {
      const trimmed = line.trim();
      if (/^\*\s*(?:feat|feature)(?:\(.*?\)|\b)?:/i.test(trimmed)) {
        categories.features.items.push(trimmed);
      } else if (/^\*\s*(?:fix)(?:\(.*?\)|\b)?:/i.test(trimmed)) {
        categories.bugfixes.items.push(trimmed);
      } else if (/^\*\s*(?:perf)(?:\(.*?\)|\b)?:/i.test(trimmed)) {
        categories.perf.items.push(trimmed);
      } else {
        categories.maintenance.items.push(trimmed);
      }
    } else if (!inWhatsChanged) {
      if (line.trim() && !line.startsWith('**Full Changelog**:')) {
        otherSections.push(line);
      }
    }
  }

  const result = [];
  for (const cat of Object.values(categories)) {
    if (cat.items.length > 0) {
      result.push(cat.title);
      result.push(...cat.items);
      result.push('');
    }
  }

  if (otherSections.length > 0) {
    result.push(...otherSections);
    result.push('');
  }

  if (fullChangelog) {
    result.push(fullChangelog);
  }

  return result.join('\n').trim();
}

/**
 * 方案 A：尝试使用 GitHub API 生成准确的 Release Notes（含 PR 作者、链接与贡献者）
 */
function tryGenerateViaGitHubApi() {
  try {
    const prevParam = previousTag ? `-f previous_tag_name=${previousTag}` : '';
    const cmd = `gh api repos/${owner}/${repo}/releases/generate-notes -f tag_name=${currentTag} ${prevParam} --jq .body`;
    const raw = execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], cwd: root }).trim();
    if (raw && !raw.startsWith('## Unreleased')) {
      return categorizeWhatsChanged(raw);
    }
  } catch {
    // gh cli 不可用或网络异常时自动降级
  }
  return '';
}

/**
 * 方案 B：本地 Git 提交解析兜底
 */
function generateViaGitLog() {
  const range = previousTag ? `${previousTag}..${currentTag}` : currentTag;
  let commitLines = [];

  try {
    const raw = execSync(`git log ${range} --format="%H|%s|%an"`, { encoding: 'utf-8', cwd: root }).trim();
    if (raw) {
      commitLines = raw.split('\n').filter(Boolean);
    }
  } catch (err) {
    console.warn(`[generate-release-notes] 读取 git log ${range} 异常:`, err.message);
  }

  const categories = {
    features: { title: '## 🚀 Features / 新增功能', items: [] },
    bugfixes: { title: '## 🐛 Bug Fixes / 错误修复', items: [] },
    perf: { title: '## ⚡ Performance / 性能优化', items: [] },
    maintenance: { title: '## 🛠️ Maintenance & Improvements / 工程与维护', items: [] }
  };

  for (const line of commitLines) {
    const parts = line.split('|');
    if (parts.length < 3) continue;
    const [hash, subject, author] = parts;
    const shortHash = hash.slice(0, 7);
    const item = `* ${subject} ([${shortHash}](https://github.com/${owner}/${repo}/commit/${shortHash})) by @${author}`;

    if (/^(?:feat|feature)(?:\(.*?\)|\b)?:/i.test(subject)) {
      categories.features.items.push(item);
    } else if (/^(?:fix)(?:\(.*?\)|\b)?:/i.test(subject)) {
      categories.bugfixes.items.push(item);
    } else if (/^(?:perf)(?:\(.*?\)|\b)?:/i.test(subject)) {
      categories.perf.items.push(item);
    } else {
      categories.maintenance.items.push(item);
    }
  }

  const result = [];
  for (const cat of Object.values(categories)) {
    if (cat.items.length > 0) {
      result.push(cat.title);
      result.push(...cat.items);
      result.push('');
    }
  }

  const compareLink = previousTag
    ? `**Full Changelog**: https://github.com/${owner}/${repo}/compare/${previousTag}...${currentTag}`
    : `**Full Changelog**: https://github.com/${owner}/${repo}/commits/${currentTag}`;
  result.push(compareLink);

  return result.join('\n').trim();
}

let notes = tryGenerateViaGitHubApi();

if (!notes) {
  console.log('[generate-release-notes] 使用本地 Git 提交解析生成 Release Notes...');
  notes = generateViaGitLog();
}

// 终极防空校验：若依然为空，写入常规维护占位
if (!notes || notes.length < 10) {
  notes = [
    '## 🛠️ Maintenance & Improvements / 工程与维护',
    `* 常规依赖更新与稳定性维护 (${normalizedVersion})`,
    '',
    previousTag
      ? `**Full Changelog**: https://github.com/${owner}/${repo}/compare/${previousTag}...${currentTag}`
      : `**Full Changelog**: https://github.com/${owner}/${repo}/commits/${currentTag}`
  ].join('\n');
}

writeFileSync(outputPath, notes + '\n', 'utf-8');
console.log(`[generate-release-notes] Release Notes 生成成功 -> ${outputFile} (${notes.length} 字节)`);
