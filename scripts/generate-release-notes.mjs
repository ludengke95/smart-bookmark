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
 * 校验指定 git 引用（Tag、Commit 或分支）是否存在
 */
function isValidGitRef(ref) {
  if (!ref) return false;
  try {
    execSync(`git rev-parse --verify "${ref}^{commit}"`, { stdio: 'ignore', cwd: root });
    return true;
  } catch {
    return false;
  }
}

/**
 * 解析 Git 比较范围：若终点 tag 尚未打上，自动使用 HEAD 比对
 */
function resolveGitRange(fromTag, toTag) {
  const isFromValid = isValidGitRef(fromTag);
  const isToValid = isValidGitRef(toTag);

  const startRef = isFromValid ? fromTag : '';
  const endRef = isToValid ? toTag : 'HEAD';

  if (startRef) {
    return { range: `${startRef}..${endRef}`, startRef, endRef };
  }
  return { range: endRef, startRef: '', endRef };
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
      const categorized = categorizeWhatsChanged(raw);
      // 若 GitHub API 生成的条目过少（例如存在直接 push 的提交如 closes #15 未走 PR），与本地提交对比补充
      return mergeWithGitLog(categorized);
    }
  } catch {
    // gh cli 不可用或网络异常时自动降级
  }
  return '';
}

/**
 * 将 GitHub API 产出与本地 Git 提交分析融合，确保不遗漏非 PR 提交 (如直接合入的修复与关闭的 issue)
 */
function mergeWithGitLog(apiNotes) {
  const localNotes = generateViaGitLog();
  if (!apiNotes) return localNotes;
  if (!localNotes) return apiNotes;

  // 提取本地提交中未在 API PR 标题中出现的条目
  const { range } = resolveGitRange(previousTag, currentTag);
  let localLines = [];
  try {
    const raw = execSync(`git log ${range} --format="%H|%s|%an"`, { encoding: 'utf-8', cwd: root }).trim();
    if (raw) localLines = raw.split('\n').filter(Boolean);
  } catch {
    return apiNotes;
  }

  // 找出没有附带 (#PR_ID) 的纯 Git 提交（例如直接 commit 到 master 的 bugfix）
  const directCommits = [];
  for (const line of localLines) {
    const parts = line.split('|');
    if (parts.length < 3) continue;
    const [hash, subject, author] = parts;
    if (!/\(#\d+\)/.test(subject)) {
      directCommits.push({ hash, subject, author });
    }
  }

  if (directCommits.length === 0) {
    return apiNotes;
  }

  // 将 directCommits 归类并追加到 apiNotes
  const extraBugfixes = [];
  const extraFeatures = [];
  const extraMaintenance = [];

  for (const { hash, subject, author } of directCommits) {
    const shortHash = hash.slice(0, 7);
    const linkedSubject = subject.replace(/#(\d+)/g, `[#$1](https://github.com/${owner}/${repo}/issues/$1)`);
    const item = `* ${linkedSubject} ([${shortHash}](https://github.com/${owner}/${repo}/commit/${shortHash})) by @${author}`;

    if (/^(?:feat|feature)(?:\(.*?\)|[\s:])?/i.test(subject)) {
      extraFeatures.push(item);
    } else if (/^(?:fix|bugfix)(?:\(.*?\)|[\s:])?/i.test(subject)) {
      extraBugfixes.push(item);
    } else {
      extraMaintenance.push(item);
    }
  }

  let merged = apiNotes;
  if (extraBugfixes.length > 0) {
    if (merged.includes('## 🐛 Bug Fixes / 错误修复')) {
      merged = merged.replace('## 🐛 Bug Fixes / 错误修复', `## 🐛 Bug Fixes / 错误修复\n${extraBugfixes.join('\n')}`);
    } else {
      // 插入到 Features 之后或开头
      if (merged.includes('## 🚀 Features / 新增功能')) {
        const parts = merged.split('## 🚀 Features / 新增功能');
        const afterFeat = parts[1];
        // 找到下一个二级标题或结尾
        const nextHeaderIdx = afterFeat.search(/\n## /);
        if (nextHeaderIdx !== -1) {
          const featSection = afterFeat.slice(0, nextHeaderIdx);
          const rest = afterFeat.slice(nextHeaderIdx);
          merged = parts[0] + '## 🚀 Features / 新增功能' + featSection + `\n\n## 🐛 Bug Fixes / 错误修复\n${extraBugfixes.join('\n')}` + rest;
        } else {
          merged += `\n\n## 🐛 Bug Fixes / 错误修复\n${extraBugfixes.join('\n')}`;
        }
      } else {
        merged = `## 🐛 Bug Fixes / 错误修复\n${extraBugfixes.join('\n')}\n\n` + merged;
      }
    }
  }

  if (extraFeatures.length > 0) {
    if (merged.includes('## 🚀 Features / 新增功能')) {
      merged = merged.replace('## 🚀 Features / 新增功能', `## 🚀 Features / 新增功能\n${extraFeatures.join('\n')}`);
    } else {
      merged = `## 🚀 Features / 新增功能\n${extraFeatures.join('\n')}\n\n` + merged;
    }
  }

  if (extraMaintenance.length > 0) {
    if (merged.includes('## 🛠️ Maintenance & Improvements / 工程与维护')) {
      merged = merged.replace('## 🛠️ Maintenance & Improvements / 工程与维护', `## 🛠️ Maintenance & Improvements / 工程与维护\n${extraMaintenance.join('\n')}`);
    } else {
      merged += `\n\n## 🛠️ Maintenance & Improvements / 工程与维护\n${extraMaintenance.join('\n')}`;
    }
  }

  return merged;
}

/**
 * 方案 B：本地 Git 提交解析兜底
 */
function generateViaGitLog() {
  const { range, startRef, endRef } = resolveGitRange(previousTag, currentTag);
  let commitLines = [];

  try {
    const raw = execSync(`git log ${range} --format="%H|%s|%an"`, { encoding: 'utf-8', cwd: root }).trim();
    if (raw) {
      commitLines = raw.split('\n').filter(Boolean);
    }
  } catch (err) {
    console.warn(`[generate-release-notes] 读取 git log ${range} 异常:`, err.message);
    // 二次容灾：若指定区间失败，尝试最近 10 条提交兜底
    try {
      const fallbackRaw = execSync('git log -n 10 --format="%H|%s|%an"', { encoding: 'utf-8', cwd: root }).trim();
      if (fallbackRaw) {
        commitLines = fallbackRaw.split('\n').filter(Boolean);
      }
    } catch {}
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
    // 将 (closes #15) 或 (#24) 转为 GitHub 链接
    const linkedSubject = subject
      .replace(/#(\d+)/g, `[#$1](https://github.com/${owner}/${repo}/issues/$1)`);
    const item = `* ${linkedSubject} ([${shortHash}](https://github.com/${owner}/${repo}/commit/${shortHash})) by @${author}`;

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
