#!/usr/bin/env node
/**
 * Smart Bookmark MCP (Model Context Protocol) bridge proxy server
 *
 * Architecture:
 * [External AI client (Cursor / Claude Desktop / WorkBuddy / Windsurf)]
 *        | Stdio (JSON-RPC, handled by the official MCP SDK Server)
 * [This script (mcp-bridge.js)]
 *        | WebSocket (ws://[HOST]:[PORT], handled by the `ws` library)
 * [Chrome extension (Smart Bookmark) — runs an MCP server over this socket]
 *
 * The bridge is a thin proxy:
 *   - To the AI client it acts as an MCP server (dynamic proxy).
 *   - To the extension it acts as an MCP client (one per extension connection).
 * Tool definitions and execution live in the extension; the bridge only
 * forwards `tools/list` and `tools/call` and relays `tools/list_changed`.
 *
 * Dependencies: `ws` + `@modelcontextprotocol/sdk` (both minimal, widely used).
 */
import http from 'http';
import { createRequire } from 'module';
import { ExtensionClientTransport } from './extension-transport.js';

// The SDK and `ws` are CommonJS packages; load them via createRequire so the
// ESM entry point can consume their named exports reliably.
const require = createRequire(import.meta.url);
const { WebSocketServer } = require('ws');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { ListToolsRequestSchema, CallToolRequestSchema, McpError } =
  require('@modelcontextprotocol/sdk/types.js');

// Interactive installer subcommand: `smart-bookmark-mcp install`
// (`@clack/prompts` UI) — or non-interactive via flags:
//   smart-bookmark-mcp install --target claude,workbuddy --location global --yes
// Must run before the MCP server boots (which happens at the bottom via a
// top-level await). The installer writes the chosen configs and prints a
// universal snippet, then exits.
if (process.argv[2] === 'install') {
  try {
    const { runInstaller, runInstallerWithOptions, parseInstallFlags, printInstallHelp } =
      await import('./install-cli.mjs');
    const opts = parseInstallFlags(process.argv.slice(3));
    if (opts.help) {
      printInstallHelp();
    } else if (opts.nonInteractive) {
      await runInstallerWithOptions(opts);
    } else {
      await runInstaller();
    }
  } catch (err) {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  }
  process.exit(0);
}

// `smart-bookmark-mcp server` is the canonical command to start the MCP
// bridge. Bare invocation (no subcommand) is kept as a backward-compatible
// alias that also starts the server. Flags like `--port`/`--host` (which
// start with `--`) are passed through to the server below, so they must NOT
// be treated as subcommands. Any other non-flag word is an unknown
// subcommand and is rejected with usage info (typos fail loudly).
const arg2 = process.argv[2];
if (arg2 === '--help' || arg2 === '-h') {
  console.error('Usage:');
  console.error('  smart-bookmark-mcp server   Start the MCP bridge server');
  console.error('  smart-bookmark-mcp install  Interactive setup wizard');
  process.exit(0);
}
if (arg2 !== undefined && arg2 !== 'server' && !arg2.startsWith('--')) {
  console.error('Unknown subcommand: ' + arg2);
  console.error('Usage:');
  console.error('  smart-bookmark-mcp server   Start the MCP bridge server');
  console.error('  smart-bookmark-mcp install  Interactive setup wizard');
  process.exit(1);
}

// Parse CLI flags and environment variables (supports --host 127.0.0.1 --port 8333)
const rawArgs = process.argv.slice(2);
let customHost = process.env.HOST || '127.0.0.1';
let customPort = parseInt(process.env.PORT || '8333', 10);

for (let i = 0; i < rawArgs.length; i++) {
  const arg = rawArgs[i];
  if (arg === '--host' && rawArgs[i + 1]) {
    customHost = rawArgs[i + 1].trim();
    i++;
  } else if (arg === '--port' && rawArgs[i + 1]) {
    customPort = parseInt(rawArgs[i + 1], 10) || 8333;
    i++;
  } else if (arg.startsWith('--host=')) {
    customHost = arg.split('=')[1].trim();
  } else if (arg.startsWith('--port=')) {
    customPort = parseInt(arg.split('=')[1], 10) || 8333;
  }
}

const HOST = customHost || '127.0.0.1';
const PORT = customPort || 8333;

// --- AI-facing MCP server (dynamic proxy) ---------------------------------
const aiServer = new Server(
  { name: 'smart-bookmark-mcp-server', version: '1.0.0' },
  { capabilities: { tools: { listChanged: true } } }
);

// Active Chrome extension MCP clients (one per WebSocket connection).
const extensionClients = new Set();

function firstExtension() {
  for (const entry of extensionClients) return entry;
  return null;
}

function notifyToolListChanged() {
  try {
    aiServer.sendToolListChanged();
  } catch {
    // ignore notification errors before the client is initialized
  }
}

aiServer.setRequestHandler(ListToolsRequestSchema, async () => {
  const ext = firstExtension();
  if (!ext) return { tools: [] };
  const result = await ext.client.listTools();
  return { tools: result.tools };
});

aiServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const ext = firstExtension();
  if (!ext) {
    throw new McpError(
      -32000,
      'Smart Bookmark Chrome extension is not connected. Please open the browser and keep the Smart Bookmark new tab page active.'
    );
  }
  return ext.client.callTool({
    name: request.params.name,
    arguments: request.params.arguments || {}
  });
});

// --- HTTP status endpoint + WebSocket upgrade ---------------------------------
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/shutdown') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, message: 'Shutting down MCP bridge' }));
    setImmediate(() => cleanupAndExit(0));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    name: 'smart-bookmark-mcp-bridge',
    status: 'running',
    connectedExtensions: extensionClients.size,
    host: HOST,
    port: PORT
  }));
});

const wss = new WebSocketServer({ server });

// 定期心跳检测与保活 (防止 TCP 连接因静默空闲被系统/防火墙掐断，并辅助 MV3 SW 活跃判定)
const heartbeatInterval = setInterval(() => {
  for (const entry of extensionClients) {
    if (entry.ws.isAlive === false) {
      process.stderr.write(`[MCP Bridge] Extension heartbeat timeout, terminating socket\n`);
      entry.ws.terminate();
      continue;
    }
    entry.ws.isAlive = false;
    entry.ws.ping();
  }
}, 20000);
heartbeatInterval.unref();

wss.on('connection', async (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  const entry = { ws, client: null };
  const transport = new ExtensionClientTransport(ws);
  const client = new Client(
    { name: 'smart-bookmark-bridge', version: '1.0.0' },
    { capabilities: {} }
  );
  entry.client = client;

  try {
    await client.connect(transport);
    const wasEmpty = extensionClients.size === 0;
    extensionClients.add(entry);
    process.stderr.write(`[MCP Bridge] Chrome extension connected via MCP (active: ${extensionClients.size})\n`);
    // First extension just connected: tell the AI client to (re)fetch tools/list.
    if (wasEmpty) notifyToolListChanged();
  } catch (e) {
    process.stderr.write(`[MCP Bridge] Failed to connect extension MCP client: ${e.message}\n`);
    try { ws.close(); } catch { /* ignore */ }
    return;
  }

  ws.on('close', () => {
    extensionClients.delete(entry);
    try { client.close(); } catch { /* ignore */ }
    process.stderr.write(`[MCP Bridge] Chrome extension disconnected (active: ${extensionClients.size})\n`);
    // Last extension left: drop the cached tool list so the model does not
    // call tools with no backing extension.
    if (extensionClients.size === 0) notifyToolListChanged();
  });

  ws.on('error', (err) => {
    process.stderr.write(`[MCP Bridge] Extension WS error: ${err.message}\n`);
  });
});

// --- Wire the AI-facing server to stdio ---------------------------------
const stdioTransport = new StdioServerTransport();
await aiServer.connect(stdioTransport);

// --- Graceful shutdown & resource cleanup ---------------------------------
let isShuttingDown = false;
async function cleanupAndExit(code = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  // Fallback watchdog timer to prevent process hanging during shutdown
  const forceTimer = setTimeout(() => {
    process.exit(code);
  }, 2000);
  forceTimer.unref();

  clearInterval(heartbeatInterval);

  // 1. Close all extension WebSocket connections
  for (const entry of extensionClients) {
    try {
      entry.client?.close?.();
      entry.ws?.terminate?.();
    } catch {
      // ignore
    }
  }
  extensionClients.clear();

  // 2. Close WebSocket server and HTTP listener to release the port
  try {
    wss.close();
  } catch {
    // ignore
  }

  await new Promise((resolve) => {
    server.close(() => resolve());
  });

  // 3. Close AI MCP server
  try {
    await aiServer.close();
  } catch {
    // ignore
  }

  process.exit(code);
}

// Stdio pipe closed or errored by the AI client (e.g. Cursor / Claude Desktop / WorkBuddy)
process.stdin.on('end', () => cleanupAndExit(0));
process.stdin.on('close', () => cleanupAndExit(0));
process.stdin.on('error', () => cleanupAndExit(0));

// Process termination signals
process.on('SIGINT', () => cleanupAndExit(0));
process.on('SIGTERM', () => cleanupAndExit(0));
process.on('SIGHUP', () => cleanupAndExit(0));

// Periodically monitor parent process health (especially on Windows where child
// processes launched via cmd.exe can become orphaned when the AI agent terminates).
if (process.ppid && process.ppid > 1) {
  const parentWatcher = setInterval(() => {
    try {
      // Sending signal 0 checks if the parent process still exists without killing it
      process.kill(process.ppid, 0);
    } catch {
      clearInterval(parentWatcher);
      cleanupAndExit(0);
    }
  }, 3000);
  parentWatcher.unref();
}

// Fail fast on listen error (e.g. EADDRINUSE)
function handleServerError(err) {
  if (err.code === 'EADDRINUSE') {
    process.stderr.write(`[MCP Bridge] Port ${PORT} is already in use. Please terminate any running instances first.\n`);
  } else {
    process.stderr.write(`[MCP Bridge] Server error: ${err.message}\n`);
  }
  process.exit(1);
}

server.on('error', handleServerError);
wss.on('error', handleServerError);

server.listen(PORT, HOST, () => {
  process.stderr.write(`\n🚀 Smart Bookmark MCP bridge server started!\n`);
  process.stderr.write(`• WebSocket listener: ws://${HOST}:${PORT}\n`);
  process.stderr.write(`• MCP Stdio protocol: ready, waiting for AI client commands...\n\n`);
});
