import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const require = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { ListToolsRequestSchema, CallToolRequestSchema, ToolListChangedNotificationSchema } =
  require('@modelcontextprotocol/sdk/types.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const WebSocket = require('ws');

// Run the bridge on an isolated port so it never clashes with a locally
// running instance (e.g. one started by an AI client's MCP config).
const PORT = 8334;
const WS_URL = `ws://127.0.0.1:${PORT}`;

// Attach to an already-spawned process's stdio (StdioClientTransport can only
// spawn its own process, which would create a second bridge on the port).
class StdioAttachTransport {
  constructor(stdin, stdout) { this.stdin = stdin; this.stdout = stdout; this.onmessage = null; this.onclose = null; }
  async start() {
    let buf = '';
    this.stdout.on('data', (d) => {
      buf += d.toString();
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (line) { try { this.onmessage(JSON.parse(line)); } catch { /* ignore */ } }
      }
    });
    this.stdin.on('close', () => { if (this.onclose) this.onclose(); });
  }
  async send(m) { this.stdin.write(JSON.stringify(m) + '\n'); }
  async close() { try { this.stdin.end(); } catch { /* ignore */ } }
}

// Mock-extension transport over a ws client connection to the bridge.
class WsClientTransport {
  constructor(url) { this.url = url; this.ws = null; this.onmessage = null; this.onclose = null; }
  async start() {
    this.ws = new WebSocket(this.url);
    await new Promise((res, rej) => { this.ws.on('open', res); this.ws.on('error', rej); });
    this.ws.on('message', (d) => { if (this.onmessage) this.onmessage(JSON.parse(d.toString())); });
    this.ws.on('close', () => { if (this.onclose) this.onclose(); });
  }
  async send(m) { this.ws.send(JSON.stringify(m)); }
  async close() { this.ws.close(); }
}

function spawnBridge() {
  return spawn('node', [join(__dirname, '..', 'mcp-bridge.js'), '--port', String(PORT)], {
    cwd: join(__dirname, '..'),
    stdio: ['pipe', 'pipe', 'inherit']
  });
}

async function startMockExtension() {
  const ext = new Server({ name: 'mock-ext', version: '1.0.0' }, { capabilities: { tools: {} } });
  ext.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{ name: 'mock_tool', description: 'a mock tool', inputSchema: { type: 'object', properties: {} } }]
  }));
  ext.setRequestHandler(CallToolRequestSchema, async () => ({
    content: [{ type: 'text', text: 'mock result' }]
  }));
  await ext.connect(new WsClientTransport(WS_URL));
  return ext;
}

test('bridge proxies tools/list and tools/call to the extension, with list_changed notifications', async (t) => {
  const bridge = spawnBridge();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const ai = new Client({ name: 'test-ai', version: '1.0.0' }, { capabilities: {} });
    await ai.connect(new StdioAttachTransport(bridge.stdin, bridge.stdout));
    await sleep(200);

    // 1) No extension connected -> empty catalog (WorkBuddy-compatible).
    const r1 = await ai.listTools();
    assert.equal(r1.tools.length, 0, 'tools/list should be empty before extension connects');

    // 2) Extension connects -> list_changed fired, tool becomes visible + callable.
    const listChanged = new Promise((resolve) => {
      ai.setNotificationHandler(ToolListChangedNotificationSchema, () => resolve(true));
    });
    const ext = await startMockExtension();
    assert.ok(await Promise.race([listChanged, sleep(2000).then(() => false)]),
      'should receive tools/list_changed when extension connects');

    const r2 = await ai.listTools();
    assert.ok(r2.tools.some((tool) => tool.name === 'mock_tool'), 'tools/list should proxy the extension tool');

    const callRes = await ai.callTool({ name: 'mock_tool', arguments: {} });
    assert.equal(callRes.content[0].text, 'mock result', 'tools/call should proxy to the extension');

    // 3) Extension disconnects -> list_changed fired again, catalog empties.
    const listChanged2 = new Promise((resolve) => {
      ai.setNotificationHandler(ToolListChangedNotificationSchema, () => resolve(true));
    });
    await ext.close();
    assert.ok(await Promise.race([listChanged2, sleep(2000).then(() => false)]),
      'should receive tools/list_changed when extension disconnects');
    const r3 = await ai.listTools();
    assert.equal(r3.tools.length, 0, 'tools/list should be empty after extension disconnects');

    await ai.close();
  } finally {
    bridge.kill();
  }
});
