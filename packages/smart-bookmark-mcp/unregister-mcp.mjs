#!/usr/bin/env node
// unregister-mcp.mjs
// preuninstall hook for @ludengke95/smart-bookmark-mcp.
// Removes the server entry from WorkBuddy's ~/.workbuddy/mcp.json so an
// uninstall leaves no dangling/broken reference. Other servers are untouched.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SERVER_ID = 'smart-bookmark';
const home = process.env.USERPROFILE || process.env.HOME || homedir();
const mcpPath = join(home, '.workbuddy', 'mcp.json');

if (!existsSync(mcpPath)) process.exit(0);
let config;
try {
  config = JSON.parse(readFileSync(mcpPath, 'utf8'));
} catch {
  process.exit(0);
}
if (!config.mcpServers || !config.mcpServers[SERVER_ID]) process.exit(0);

delete config.mcpServers[SERVER_ID];
writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
console.log(`[smart-bookmark-mcp] Removed "${SERVER_ID}" from ${mcpPath}`);
