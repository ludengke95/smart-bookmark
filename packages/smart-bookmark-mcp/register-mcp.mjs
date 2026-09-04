#!/usr/bin/env node
// register-mcp.mjs
// postinstall hook for @ludengke95/smart-bookmark-mcp.
// Idempotently registers this server into WorkBuddy's ~/.workbuddy/mcp.json
// so it shows up as mcp__smart_bookmark__* tools without manual editing —
// mirroring how codegraph auto-registers itself on install.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const SERVER_ID = 'smart-bookmark';

// Escape hatch: `SMART_BOOKMARK_SKIP_REGISTER=1 npm install -g .` skips registration.
if (process.env.SMART_BOOKMARK_SKIP_REGISTER === '1') {
  console.log('[smart-bookmark-mcp] SMART_BOOKMARK_SKIP_REGISTER=1 — skipped mcp.json registration.');
  process.exit(0);
}

const home = process.env.USERPROFILE || process.env.HOME || homedir();
const wbDir = join(home, '.workbuddy');
const mcpPath = join(wbDir, 'mcp.json');

// Read existing config, or start from an empty skeleton.
let config = { mcpServers: {} };
if (existsSync(mcpPath)) {
  try {
    config = JSON.parse(readFileSync(mcpPath, 'utf8'));
  } catch {
    console.warn(`[smart-bookmark-mcp] ${mcpPath} is not valid JSON; starting fresh.`);
    config = { mcpServers: {} };
  }
}
if (!config.mcpServers || typeof config.mcpServers !== 'object') config.mcpServers = {};

// Idempotent upsert: only touch this one key, never wipe other servers.
config.mcpServers[SERVER_ID] = {
  type: 'stdio',
  command: 'smart-bookmark-mcp',
  args: [],
  disabled: false,
};

if (!existsSync(wbDir)) mkdirSync(wbDir, { recursive: true });
writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
console.log(`[smart-bookmark-mcp] Registered "${SERVER_ID}" → ${mcpPath}`);

// Self-check: the bare command must resolve on the MCP child's PATH.
// WorkBuddy spawns MCP servers WITHOUT the isolated Node dir on PATH, so a
// bin that only lives in the managed Node prefix can ENOENT. npm install -g
// via the *system* Node (shim under e.g. nvm4w/nodejs, like codegraph) is safe.
const probe = process.platform === 'win32' ? 'where smart-bookmark-mcp' : 'command -v smart-bookmark-mcp';
try {
  execSync(probe, { stdio: 'ignore' });
} catch {
  console.warn(
    '[smart-bookmark-mcp] WARNING: `smart-bookmark-mcp` is not on PATH.\n' +
    '  WorkBuddy spawns MCP servers without the isolated Node dir on PATH, so this\n' +
    '  bare command will fail with ENOENT at runtime unless the bin is on the SYSTEM PATH.\n' +
    '  Fix A: install via the system Node global npm so the shim lands under e.g.\n' +
    '         nvm4w/nodejs (same as codegraph): npm install -g @ludengke95/smart-bookmark-mcp\n' +
    '  Fix B: set the entry manually to command:"node" + args:[<abs path>/mcp-bridge.js].'
  );
}
