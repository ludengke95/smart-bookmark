#!/usr/bin/env node
/**
 * Interactive setup wizard: `smart-bookmark-mcp install`
 *
 * Design mirrors CodeGraph's installer (dist/installer):
 *   - Interactive entry  `runInstaller()`         → uses `@clack/prompts`
 *     (robust TTY handling; no hand-rolled readline that can hang on a
 *     "Detected unsettled top-level await").
 *   - Non-interactive entry `runInstallerWithOptions(opts)` → driven by
 *     CLI flags (`--target`, `--location`, `--lan`, `--yes`), for CI/scripting.
 *
 * Flow (interactive):
 *   Step 1: choose language (中文 / English)
 *   Step 2: multi-select the AI clients to configure
 *   Step 3: choose install scope (global / project) — OS-aware path resolution
 *   Step 4: ask whether to enable LAN access (binds 0.0.0.0 when enabled)
 *   Step 5: WRITE the matching config into each selected client's file (atomic,
 *           idempotent merge) and print the resulting snippet + a universal JSON.
 *
 * Config read/merge/write (`readJsonFile` / `atomicWriteFileSync` /
 * `jsonDeepEqual` / `writeClientConfig`) is modelled on CodeGraph's
 * installer targets (shared.js): backup on corrupt, tmp+rename atomic write,
 * idempotent by deep-equality, never clobbers sibling entries.
 *
 * Dependencies: `@clack/prompts` (interactive UI) — Node built-ins otherwise.
 */
import * as p from '@clack/prompts';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PKG = '@ludengke95/smart-bookmark-mcp';

// --- i18n -----------------------------------------------------------------
const T = {
  zh: {
    title: '📦 Smart Bookmark MCP — 交互式安装向导',
    step2Title: '请选择要配置 MCP 的 AI 客户端（可多选）：',
    step2Hint: '空格勾选 / 回车确认；可多选。',
    step3Title: '已生成配置片段，请将以下内容复制到对应客户端的配置文件中：',
    client: '客户端',
    pathLabel: '配置文件路径',
    mergeHint: '将以下 JSON 合并进该文件（若文件不存在则新建）：',
    traeHint: 'Trae 无配置文件：请在 MCP 设置中添加 stdio 服务，命令与参数同上。',
    workbuddyNote: '提示：写入后到「连接器管理 → 自定义连接器」点「信任」启用。',
    stepLanTitle: '是否启用局域网访问？',
    stepLanHint: '启用后桥接服务将监听 0.0.0.0，允许同一局域网内的 Chrome 扩展连接（默认仅本机 127.0.0.1）。',
    lanNote: '⚠️ 已启用 0.0.0.0：局域网内任意主机均可连上 WebSocket 端口（当前无鉴权）。请仅在受信任网络使用，勿映射公网/DMZ；Chrome 扩展侧需把 wsHost 改为本机局域网 IP。',
    stepScopeTitle: '安装范围？',
    stepScopeHint: '全局 = 用户级配置（所有项目生效）；项目级 = 写入当前工作目录（仅当前项目生效）。',
    scopeGlobal: '全局（用户级）',
    scopeProject: '项目级（当前目录）',
    langZh: '中文',
    langEn: 'English',
    installTitle: '正在按选择安装 MCP：',
    written: '✅ 已写入',
    updated: '🔄 已更新',
    unchanged: '➖ 已存在（未变动）',
    printOnly: '⚠️ 无可靠配置文件路径，请手动配置：',
    globalCoerced: '（该客户端仅支持全局配置，已写入全局路径）',
    universalTitle: '通用 mcpServer JSON（标准 mcpServers 形式，可粘贴到任意支持该格式的客户端）：',
    done: '✅ 完成。若未生效，请完全重启对应 AI 客户端。',
    cancelled: '已取消。',
    noTty: '⚠️ 此命令需要交互式终端 / This command requires an interactive terminal.\n   非交互用法 / Non-interactive: smart-bookmark-mcp install --target <ids> --location global --yes',
    invalidTarget: '无效的目标 / Invalid target: '
  },
  en: {
    title: '📦 Smart Bookmark MCP — Interactive Setup Wizard',
    step2Title: 'Select the AI clients to configure (multi-select):',
    step2Hint: 'Space to toggle / Enter to confirm; pick any number.',
    step3Title: 'Config snippets generated. Copy the following into each client\'s config file:',
    client: 'Client',
    pathLabel: 'Config file path',
    mergeHint: 'Merge the JSON below into that file (create it if missing):',
    traeHint: 'Trae has no config file: add a stdio server in its MCP settings using the same command/args above.',
    workbuddyNote: 'Note: after writing, go to Connector management → Custom connector and click Trust to enable.',
    stepLanTitle: 'Enable LAN access?',
    stepLanHint: 'If enabled, the bridge listens on 0.0.0.0 so Chrome extensions on the same LAN can connect (default is localhost 127.0.0.1 only).',
    lanNote: "⚠️ LAN (0.0.0.0) enabled: any host on the LAN can reach the WebSocket port (no auth yet). Use only on a trusted network; do not expose to the public internet/DMZ. Set the Chrome extension wsHost to this machine's LAN IP.",
    stepScopeTitle: 'Install scope?',
    stepScopeHint: 'Global = user-level config (applies to all projects); Project = written to the current working directory (current project only).',
    scopeGlobal: 'Global (user-level)',
    scopeProject: 'Project (current directory)',
    langZh: '中文',
    langEn: 'English',
    installTitle: 'Installing MCP per your selection:',
    written: '✅ Written',
    updated: '🔄 Updated',
    unchanged: '➖ Already present (unchanged)',
    printOnly: '⚠️ No reliable config-file path; please configure manually:',
    globalCoerced: '(this client only supports a global config; written to the global path)',
    universalTitle: 'Universal mcpServer JSON (standard mcpServers form, paste into any client that uses it):',
    done: '✅ Done. If it does not show up, fully restart the AI client.',
    cancelled: 'Cancelled.',
    noTty: '⚠️ This command requires an interactive terminal.\n   Non-interactive: smart-bookmark-mcp install --target <ids> --location global --yes',
    invalidTarget: 'Invalid target: '
  }
};

// --- client registry ------------------------------------------------------
// `schema` decides the JSON shape:
//   'mcpServers' -> { "mcpServers": { "smart-bookmark": { command, args } } }
//   'servers'    -> { "servers":    { "smart-bookmark": { type:"stdio", command, args } } }
// `uiOnly` clients have no config file (instructions only).
export const CLIENTS = [
  {
    id: 'claude', name: 'Claude Desktop', schema: 'mcpServers',
    path: {
      zh: 'macOS: ~/Library/Application Support/Claude/claude_desktop_config.json\nWindows: %APPDATA%\\Claude\\claude_desktop_config.json',
      en: 'macOS: ~/Library/Application Support/Claude/claude_desktop_config.json\nWindows: %APPDATA%\\Claude\\claude_desktop_config.json'
    }
  },
  {
    id: 'claude-code', name: 'Claude Code', schema: 'mcpServers',
    path: {
      zh: '全局: ~/.claude.json\n项目级: <项目根>/.mcp.json',
      en: 'Global: ~/.claude.json\nProject: <project>/.mcp.json'
    }
  },
  {
    id: 'cursor', name: 'Cursor', schema: 'mcpServers',
    path: {
      zh: '项目级: <项目根>/.cursor/mcp.json\n全局: ~/.cursor/mcp.json',
      en: 'Project: <project>/.cursor/mcp.json\nGlobal: ~/.cursor/mcp.json'
    }
  },
  {
    id: 'vscode', name: 'VS Code (Copilot / MCP)', schema: 'servers',
    path: {
      zh: '项目级: <项目根>/.vscode/mcp.json',
      en: 'Project: <project>/.vscode/mcp.json'
    }
  },
  {
    id: 'windsurf', name: 'Windsurf', schema: 'mcpServers',
    path: {
      zh: '~/.codeium/windsurf/mcp_config.json',
      en: '~/.codeium/windsurf/mcp_config.json'
    }
  },
  {
    id: 'workbuddy', name: 'WorkBuddy', schema: 'mcpServers', note: 'workbuddy',
    path: {
      zh: '~/.workbuddy/mcp.json',
      en: '~/.workbuddy/mcp.json'
    }
  },
  {
    id: 'cline', name: 'Cline', schema: 'mcpServers',
    path: {
      zh: 'cline_mcp_settings.json（或设置 UI）',
      en: 'cline_mcp_settings.json (or settings UI)'
    }
  },
  {
    id: 'trae', name: 'Trae', schema: 'mcpServers', uiOnly: true,
    path: {
      zh: '(无配置文件，使用 MCP 设置 UI)',
      en: '(no config file; use MCP settings UI)'
    }
  }
];

// --- snippet builder ------------------------------------------------------
// Canonical command args for launching the server via `npx`.
// `server` is the subcommand (see mcp-bridge.js dispatch); `--host 0.0.0.0`
// is appended when LAN access is enabled.
export function mcpArgs(lan = false) {
  const args = ['-y', PKG, 'server'];
  if (lan) args.push('--host', '0.0.0.0');
  return args;
}

// `lan` (default false): when true, append `--host 0.0.0.0` so the bridge
// binds all interfaces instead of the default localhost 127.0.0.1.
export function buildSnippet(client, lan = false) {
  const entry = { command: 'npx', args: mcpArgs(lan) };
  if (client.schema === 'servers') {
    return JSON.stringify(
      { servers: { 'smart-bookmark': { type: 'stdio', ...entry } } },
      null, 2
    );
  }
  return JSON.stringify(
    { mcpServers: { 'smart-bookmark': entry } },
    null, 2
  );
}

// --- selection parser (exported for tests) --------------------------------
export function parseSelection(input, count) {
  const s = String(input || '').trim().toLowerCase();
  if (s === 'all') return Array.from({ length: count }, (_, i) => i);
  const nums = s.split(/[\s,]+/).filter(Boolean).map(Number);
  if (!nums.length || nums.some((n) => !Number.isInteger(n) || n < 1 || n > count)) {
    return null;
  }
  return [...new Set(nums)].map((n) => n - 1).sort((a, b) => a - b);
}

// Resolve a `--target` string (non-interactive entry) into client indices.
// Accepts: 'all' | 'auto' | 'none' | comma list of ids (e.g. 'claude,workbuddy')
// or 1-based indices (e.g. '1,6'). Unknown tokens are skipped.
export function resolveTargetIds(target) {
  const n = CLIENTS.length;
  const s = String(target || '').trim().toLowerCase();
  if (s === 'all' || s === 'auto') return Array.from({ length: n }, (_, i) => i);
  if (s === 'none' || s === '') return [];
  const out = new Set();
  for (const tok of s.split(/[\s,]+/).filter(Boolean)) {
    const byId = CLIENTS.findIndex((c) => c.id === tok);
    if (byId >= 0) { out.add(byId); continue; }
    const num = Number(tok);
    if (Number.isInteger(num) && num >= 1 && num <= n) out.add(num - 1);
  }
  return [...out].sort((a, b) => a - b);
}

// --- help -----------------------------------------------------------------
export function printInstallHelp() {
  console.log(`Smart Bookmark MCP — 安装向导 / Setup wizard

用法 / Usage:
  smart-bookmark-mcp install                  交互式选择语言与 AI 客户端，生成并写入配置
  smart-bookmark-mcp install --target <ids>   非交互：指定客户端（id 或编号，逗号分隔；all/auto/none）
  smart-bookmark-mcp install --location global  安装范围 global|project
  smart-bookmark-mcp install --lan            监听 0.0.0.0（局域网）
  smart-bookmark-mcp install --yes            使用默认值，无提示（CI/脚本）
  smart-bookmark-mcp install --help           显示本帮助

示例 / Example:
  smart-bookmark-mcp install --target claude,workbuddy --location global --yes

需交互式终端 / Requires an interactive terminal.`);
}

// --- step-3 rendering (pure, exported for testing) ------------------------
export function renderClients(lang, idxs, out = console, lan = false) {
  const t = T[lang];
  out.log('');
  out.log(t.step3Title);
  out.log('');
  for (const i of idxs) {
    const c = CLIENTS[i];
    out.log('─'.repeat(60));
    out.log(`${t.client}: ${c.name}`);
    out.log(`${t.pathLabel}:`);
    out.log(c.path[lang]);
    if (c.uiOnly) {
      out.log('');
      out.log(t.traeHint);
    } else {
      out.log('');
      out.log(t.mergeHint);
      out.log('```json');
      out.log(buildSnippet(c, lan));
      out.log('```');
    }
    if (c.note === 'workbuddy') {
      out.log('');
      out.log(t.workbuddyNote);
    }
    if (lan) {
      out.log('');
      out.log(t.lanNote);
    }
    out.log('');
  }
  out.log('─'.repeat(60));
  out.log(t.done);
}

// --- config path resolution (OS-aware, scope-aware) ----------------------
const GLOBAL_ONLY = new Set(['claude', 'windsurf', 'workbuddy']);

function vscodeUserDir() {
  const h = os.homedir();
  if (process.platform === 'win32') {
    const app = process.env.APPDATA && process.env.APPDATA.trim()
      ? process.env.APPDATA
      : path.join(h, 'AppData', 'Roaming');
    return path.join(app, 'Code', 'User');
  }
  if (process.platform === 'darwin') {
    return path.join(h, 'Library', 'Application Support', 'Code', 'User');
  }
  const xdg = process.env.XDG_CONFIG_HOME && process.env.XDG_CONFIG_HOME.trim()
    ? process.env.XDG_CONFIG_HOME
    : path.join(h, '.config');
  return path.join(xdg, 'Code', 'User');
}

function claudeDesktopPath() {
  const h = os.homedir();
  if (process.platform === 'win32') {
    const app = process.env.APPDATA && process.env.APPDATA.trim()
      ? process.env.APPDATA
      : path.join(h, 'AppData', 'Roaming');
    return path.join(app, 'Claude', 'claude_desktop_config.json');
  }
  if (process.platform === 'darwin') {
    return path.join(h, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  }
  return path.join(h, '.config', 'Claude', 'claude_desktop_config.json');
}

export function resolveConfigPath(client, scope) {
  const h = os.homedir();
  const cwd = process.cwd();
  switch (client.id) {
    case 'claude': return claudeDesktopPath(); // always global
    case 'claude-code':
      return scope === 'project'
        ? path.join(cwd, '.mcp.json')
        : path.join(h, '.claude.json');
    case 'cursor':
      return scope === 'project'
        ? path.join(cwd, '.cursor', 'mcp.json')
        : path.join(h, '.cursor', 'mcp.json');
    case 'vscode':
      return scope === 'project'
        ? path.join(cwd, '.vscode', 'mcp.json')
        : path.join(vscodeUserDir(), 'mcp.json');
    case 'windsurf': return path.join(h, '.codeium', 'windsurf', 'mcp_config.json'); // global only
    case 'workbuddy': return path.join(h, '.workbuddy', 'mcp.json'); // global only
    case 'cline': return null; // path is version/fragile → print-only
    case 'trae': return null; // ui-only
    default: return null;
  }
}

// --- atomic merge-write (mirrors CodeGraph shared.js) ---------------------
function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    console.warn(`  ⚠️  Could not parse ${path.basename(filePath)}; a backup will be made before overwriting.`);
    try { fs.copyFileSync(filePath, filePath + '.backup'); } catch { /* ignore */ }
    return {};
  }
}

function atomicWriteFileSync(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + '.tmp.' + process.pid;
  try {
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
}

function jsonDeepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => jsonDeepEqual(v, b[i]));
  }
  const ak = Object.keys(a).sort();
  const bk = Object.keys(b).sort();
  if (ak.length !== bk.length) return false;
  if (!ak.every((k, i) => k === bk[i])) return false;
  return ak.every((k) => jsonDeepEqual(a[k], b[k]));
}

// Write (merge) the smart-bookmark entry into a client's config file.
// Returns { ok, filePath?, action?, reason? }.
export function writeClientConfig(client, scope, lan = false) {
  const filePath = resolveConfigPath(client, scope);
  if (!filePath) return { ok: false, reason: 'print-only' };

  const entry = { command: 'npx', args: mcpArgs(lan) };
  const wrapperKey = client.schema === 'servers' ? 'servers' : 'mcpServers';
  const want = client.schema === 'servers'
    ? { type: 'stdio', ...entry }
    : entry;

  const existing = readJsonFile(filePath);
  const prev = existing[wrapperKey] && existing[wrapperKey]['smart-bookmark'];
  if (prev && jsonDeepEqual(prev, want)) {
    return { ok: true, filePath, action: 'unchanged' };
  }
  const next = { ...existing };
  next[wrapperKey] = { ...(next[wrapperKey] || {}), 'smart-bookmark': want };
  atomicWriteFileSync(filePath, JSON.stringify(next, null, 2) + '\n');
  return { ok: true, filePath, action: prev ? 'updated' : 'created' };
}

// Canonical mcpServers form, printed once at the end as a universal reference.
export function universalSnippet(lan = false) {
  const entry = { command: 'npx', args: mcpArgs(lan) };
  return JSON.stringify({ mcpServers: { 'smart-bookmark': entry } }, null, 2);
}

// --- step-5 install (write + report) --------------------------------------
export function installClients(lang, idxs, scope, lan, out = console) {
  const t = T[lang];
  out.log('');
  out.log(t.installTitle);
  out.log('');
  for (const i of idxs) {
    const c = CLIENTS[i];
    out.log('─'.repeat(60));
    out.log(`${t.client}: ${c.name}`);
    const res = writeClientConfig(c, scope, lan);
    if (res.ok) {
      // File was actually written/merged for the user — no need to echo the
      // JSON back (the universal snippet at the bottom already covers copying).
      const badge = res.action === 'created' ? t.written
        : res.action === 'updated' ? t.updated
        : t.unchanged;
      out.log(`${badge}: ${res.filePath}`);
      if (scope === 'project' && GLOBAL_ONLY.has(c.id)) {
        out.log(t.globalCoerced);
      }
    } else {
      // No reliable config-file path (e.g. Cline/Trae): we cannot write for
      // the user, so always print the snippet for manual copy.
      out.log(t.printOnly);
      out.log(c.path[lang]);
      out.log('');
      out.log('```json');
      out.log(buildSnippet(c, lan));
      out.log('```');
    }
    if (c.note === 'workbuddy') {
      out.log('');
      out.log(t.workbuddyNote);
    }
    if (lan) {
      out.log('');
      out.log(t.lanNote);
    }
    out.log('');
  }
  out.log('─'.repeat(60));
  out.log(t.universalTitle);
  out.log('```json');
  out.log(universalSnippet(lan));
  out.log('```');
  out.log('─'.repeat(60));
  // NOTE: the "done" line is emitted by the caller so it shows exactly once:
  //   - interactive      -> p.outro(t.done) in runInstaller()
  //   - non-interactive  -> printed by runInstallerWithOptions() after this fn.
}

// --- flag parsing for the `install` subcommand (exported) -----------------
// Non-interactive when any of --target / --location / --lan / --yes / --help
// is present.
export function parseInstallFlags(argv) {
  const opts = { target: undefined, location: undefined, lan: undefined, yes: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--yes' || a === '-y') opts.yes = true;
    else if (a === '--target' || a.startsWith('--target=')) {
      opts.target = a.startsWith('--target=') ? a.slice('--target='.length) : argv[++i];
    } else if (a === '--location' || a.startsWith('--location=')) {
      opts.location = a.startsWith('--location=') ? a.slice('--location='.length) : argv[++i];
    } else if (a === '--lan') {
      opts.lan = true;
    } else if (a.startsWith('--lan=')) {
      opts.lan = a.slice('--lan='.length) !== 'false';
    } else if (a === '--no-lan') {
      opts.lan = false;
    }
  }
  opts.nonInteractive = opts.help || opts.yes || opts.target != null || opts.location != null || opts.lan != null;
  return opts;
}

// --- non-interactive entry (mirrors CodeGraph runInstallerWithOptions) ----
export async function runInstallerWithOptions(opts = {}) {
  const target = opts.target || (opts.yes ? 'auto' : 'auto');
  const location = opts.location || (opts.yes ? 'global' : 'global');
  const lan = opts.lan != null ? opts.lan : false;
  const lang = opts.lang || 'en';
  const idxs = resolveTargetIds(target);
  const scope = location === 'project' ? 'project' : 'global';
  if (!idxs.length) {
    console.log('No targets selected; nothing to install.');
    return;
  }
  installClients(lang, idxs, scope, lan, console);
  console.log('');
  console.log(T[lang].done);
}

// --- interactive entry (mirrors CodeGraph runInstaller) -------------------
export async function runInstaller() {
  if (!process.stdin.isTTY) {
    console.error(T.zh.noTty + '\n' + T.en.noTty);
    process.exit(1);
  }

  p.intro('Smart Bookmark MCP');

  const langRes = await p.select({
    message: '交互语言 / Language',
    options: [
      { value: 'zh', label: T.zh.langZh },
      { value: 'en', label: T.en.langEn }
    ]
  });
  if (p.isCancel(langRes)) { p.cancel(T.zh.cancelled); return; }
  const lang = langRes;
  const t = T[lang];

  const clientsRes = await p.multiselect({
    message: t.step2Title,
    hint: t.step2Hint,
    required: false,
    options: CLIENTS.map((c, i) => ({ value: i, label: c.name }))
  });
  if (p.isCancel(clientsRes)) { p.cancel(t.cancelled); return; }
  const idxs = clientsRes.length ? clientsRes : [];

  const scopeRes = await p.select({
    message: t.stepScopeTitle,
    hint: t.stepScopeHint,
    options: [
      { value: 'global', label: t.scopeGlobal },
      { value: 'project', label: t.scopeProject }
    ]
  });
  if (p.isCancel(scopeRes)) { p.cancel(t.cancelled); return; }
  const scope = scopeRes;

  const lanRes = await p.confirm({
    message: t.stepLanTitle,
    hint: t.stepLanHint,
    active: lang === 'zh' ? '是 / Yes' : 'Yes',
    inactive: lang === 'zh' ? '否 / No' : 'No'
  });
  if (p.isCancel(lanRes)) { p.cancel(t.cancelled); return; }
  const lan = !!lanRes;

  installClients(lang, idxs, scope, lan, console);
  p.outro(t.done);
}

// Allow running this file directly (`node ./install-cli.mjs` / `npm run install-cli`)
// as the wizard entry point. When imported by mcp-bridge.js for the `install`
// subcommand, this guard does NOT fire — the dispatcher calls runInstaller() itself.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const opts = parseInstallFlags(process.argv.slice(2));
  if (opts.help) { printInstallHelp(); process.exit(0); }
  const run = opts.nonInteractive ? runInstallerWithOptions(opts) : runInstaller();
  Promise.resolve(run).catch((err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  });
}
