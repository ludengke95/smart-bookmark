#!/usr/bin/env node

/**
 * Smart Bookmark Stdio MCP Server Entrypoint
 * 直接快捷方式，供 Cursor / Claude Desktop / Windsurf 等客户端直接配置启动。
 */

import { runStdioProxy } from '../src/stdio-proxy/proxy.js';

const port = process.env.SMART_BOOKMARK_MCP_PORT ? parseInt(process.env.SMART_BOOKMARK_MCP_PORT, 10) : 8333;
const host = process.env.SMART_BOOKMARK_MCP_HOST || '127.0.0.1';

runStdioProxy({ host, port }).catch((err) => {
  console.error('[Stdio Error]', err);
  process.exit(1);
});
