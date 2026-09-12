import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createMcpHttpServer } from '../src/native-host/server.js';
import { prepareHostFiles, DEFAULT_EXTENSION_ID } from '../src/register/register.js';

test('createMcpHttpServer: /ping responds with ok status', async () => {
  const server = createMcpHttpServer({
    port: 0,
    getTools: async () => [],
    callTool: async () => ({})
  });
  const { port } = await server.start();

  try {
    const res = await fetch(`http://127.0.0.1:${port}/ping`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ok');
    assert.equal(data.service, 'smart-bookmark-mcp');
  } finally {
    await server.stop();
  }
});
test('createMcpHttpServer: supports binding to 0.0.0.0 for LAN access', async () => {
  const server = createMcpHttpServer({
    port: 0,
    host: '0.0.0.0',
    getTools: async () => [],
    callTool: async () => ({})
  });
  const { host, port } = await server.start();
  assert.equal(host, '0.0.0.0');

  try {
    const res = await fetch(`http://127.0.0.1:${port}/ping`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ok');
  } finally {
    await server.stop();
  }
});


test('createMcpHttpServer: Streamable HTTP client lists and calls tools', async () => {
  const mockTools = [
    {
      name: 'list_bookmarks',
      description: 'List bookmarks',
      inputSchema: { type: 'object', properties: {} }
    }
  ];

  let calledToolName = null;
  let calledToolArgs = null;

  const server = createMcpHttpServer({
    port: 0,
    getTools: async () => mockTools,
    callTool: async (name, args) => {
      calledToolName = name;
      calledToolArgs = args;
      return { count: 3, items: ['bm_1', 'bm_2', 'bm_3'] };
    }
  });

  const { port } = await server.start();

  try {
    const clientTransport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
    const client = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} }
    );
    await client.connect(clientTransport);

    // 1. listTools
    const toolList = await client.listTools();
    assert.equal(toolList.tools.length, 1);
    assert.equal(toolList.tools[0].name, 'list_bookmarks');

    // 2. callTool
    const result = await client.callTool({
      name: 'list_bookmarks',
      arguments: { keyword: 'github' }
    });

    assert.equal(calledToolName, 'list_bookmarks');
    assert.deepEqual(calledToolArgs, { keyword: 'github' });
    assert.ok(result.content[0].text.includes('bm_1'));

    await client.close();
  } finally {
    await server.stop();
  }
});

test('createMcpHttpServer: start() rejects with EADDRINUSE when port is occupied', async () => {
  const server1 = createMcpHttpServer({
    port: 0,
    getTools: async () => [],
    callTool: async () => ({})
  });
  const { port } = await server1.start();

  const server2 = createMcpHttpServer({
    port,
    getTools: async () => [],
    callTool: async () => ({})
  });

  await assert.rejects(
    async () => {
      await server2.start();
    },
    (err) => {
      return err.code === 'EADDRINUSE' || String(err.message).includes('EADDRINUSE');
    }
  );

  await server1.stop();
});

test('prepareHostFiles generates valid manifest with deterministic extension ID and Edge store ID', () => {
  const { manifestPath, manifest } = prepareHostFiles();
  assert.equal(manifest.name, 'com.smartbookmark.mcp');
  assert.equal(manifest.type, 'stdio');
  assert.ok(manifest.allowed_origins.includes(`chrome-extension://${DEFAULT_EXTENSION_ID}/`));
  assert.ok(manifest.allowed_origins.includes('chrome-extension://dpjfdgipdhdoilkgklolanpdpnkbabia/'));
  assert.ok(manifest.path.includes('smart-bookmark-host'));
});

test('Native Messaging 4-byte LE framing verification', () => {
  const payload = { type: 'TEST', data: [1, 2, 3] };
  const jsonBuf = Buffer.from(JSON.stringify(payload), 'utf8');
  const headerBuf = Buffer.alloc(4);
  headerBuf.writeUInt32LE(jsonBuf.length, 0);
  const frame = Buffer.concat([headerBuf, jsonBuf]);

  assert.equal(frame.readUInt32LE(0), jsonBuf.length);
  const decoded = JSON.parse(frame.subarray(4).toString('utf8'));
  assert.deepEqual(decoded, payload);
});
