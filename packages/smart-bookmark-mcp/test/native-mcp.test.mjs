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
  const token = 'test_token_secret_123';

  const server = createMcpHttpServer({
    port: 0,
    token,
    getTools: async () => mockTools,
    callTool: async (name, args) => {
      calledToolName = name;
      calledToolArgs = args;
      return { count: 3, items: ['bm_1', 'bm_2', 'bm_3'] };
    }
  });

  const { port } = await server.start();

  try {
    const clientTransport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${port}/mcp`),
      {
        requestInit: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      }
    );
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

test('createMcpHttpServer: rejects unauthenticated requests with 401', async () => {
  const server = createMcpHttpServer({
    port: 0,
    token: 'super_secret_token_123',
    getTools: async () => [],
    callTool: async () => ({})
  });
  const { port } = await server.start();

  try {
    // 1. /ping 正常可达
    const pingRes = await fetch(`http://127.0.0.1:${port}/ping`);
    assert.equal(pingRes.status, 200);

    // 2. /mcp 无 Token 访问返回 401
    const resNoToken = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    });
    assert.equal(resNoToken.status, 401);
    const errData = await resNoToken.json();
    assert.ok(errData.error.includes('Unauthorized'));

    // 3. 错误 Token 访问返回 401
    const resWrongToken = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wrong_token'
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    });
    assert.equal(resWrongToken.status, 401);
  } finally {
    await server.stop();
  }
});

test('createMcpHttpServer: accepts requests with valid Bearer token', async () => {
  const mockTools = [{ name: 'test_tool', inputSchema: { type: 'object' } }];
  const server = createMcpHttpServer({
    port: 0,
    token: 'super_secret_token_123',
    getTools: async () => mockTools,
    callTool: async () => ({})
  });
  const { port } = await server.start();

  try {
    const clientTransport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
      requestInit: {
        headers: {
          Authorization: 'Bearer super_secret_token_123'
        }
      }
    });
    const client = new Client(
      { name: 'authenticated-client', version: '1.0.0' },
      { capabilities: {} }
    );
    await client.connect(clientTransport);

    const toolList = await client.listTools();
    assert.equal(toolList.tools.length, 1);
    assert.equal(toolList.tools[0].name, 'test_tool');

    await client.close();
  } finally {
    await server.stop();
  }
});

test('createMcpHttpServer: CORS blocks untrusted origins and allows extension origins', async () => {
  const server = createMcpHttpServer({
    port: 0,
    getTools: async () => [],
    callTool: async () => ({})
  });
  const { port } = await server.start();

  try {
    // 1. 恶意网页来源的 OPTIONS 预检请求返回 403
    const badOptions = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://malicious-website.com'
      }
    });
    assert.equal(badOptions.status, 403);
    assert.equal(badOptions.headers.get('access-control-allow-origin'), null);

    // 2. 扩展来源的 OPTIONS 预检请求返回 204 并允许 CORS
    const extOptions = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'chrome-extension://gobioihpdadhghfbefcnobinbfadmpli'
      }
    });
    assert.equal(extOptions.status, 204);
    assert.equal(
      extOptions.headers.get('access-control-allow-origin'),
      'chrome-extension://gobioihpdadhghfbefcnobinbfadmpli'
    );
  } finally {
    await server.stop();
  }
});
test('createMcpHttpServer: rejects when server token is empty string', async () => {
  const server = createMcpHttpServer({
    port: 0,
    token: '',
    getTools: async () => [],
    callTool: async () => ({})
  });
  const { port } = await server.start();

  try {
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    });
    assert.equal(res.status, 401);
  } finally {
    await server.stop();
  }
});
