/**
 * Smart Bookmark MCP HTTP / SSE Server
 * 对外暴露 Streamable HTTP (/mcp) 与 Server-Sent Events (/sse) 端点，
 * 符合 MCP 协议规范，同时支持 CherryStudio、Dify、Cursor、Claude Desktop 等现代 AI 客户端。
 */

import http from 'node:http';
import crypto from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

export function createMcpHttpServer({
  getTools,
  callTool,
  port = 8333,
  host = '127.0.0.1'
}) {
  const httpSessions = new Map();
  const sseSessions = new Map();

  function createSdkServer() {
    const server = new Server(
      {
        name: 'smart-bookmark',
        version: '1.0.3'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = await getTools();
      return { tools: tools || [] };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      try {
        const result = await callTool(name, args || {});
        return {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `[Smart Bookmark MCP Error] ${err?.message || String(err)}`
            }
          ]
        };
      }
    });

    return server;
  }

  const httpServer = http.createServer(async (req, res) => {
    // 跨域 CORS 支持
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id');
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    // 健康检查端点
    if (url.pathname === '/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        uptime: process.uptime(),
        version: '1.0.3',
        service: 'smart-bookmark-mcp'
      }));
      return;
    }

    // Streamable HTTP 端点 (/mcp)
    if (url.pathname === '/mcp') {
      const sessionId = req.headers['mcp-session-id'];
      if (sessionId && httpSessions.has(sessionId)) {
        const { transport } = httpSessions.get(sessionId);
        await transport.handleRequest(req, res);
        return;
      }

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (sid) => {
          httpSessions.set(sid, { server: sdkServer, transport });
        },
        onsessionclosed: (sid) => {
          httpSessions.delete(sid);
        }
      });

      const sdkServer = createSdkServer();
      await sdkServer.connect(transport);
      await transport.handleRequest(req, res);
      return;
    }

    // SSE 端点 (/sse)
    if (url.pathname === '/sse' && req.method === 'GET') {
      const sseTransport = new SSEServerTransport('/messages', res);
      const sdkServer = createSdkServer();
      await sdkServer.connect(sseTransport);
      await sseTransport.start();
      sseSessions.set(sseTransport.sessionId, { server: sdkServer, transport: sseTransport });
      return;
    }

    // SSE 消息回调 (/messages)
    if (url.pathname === '/messages' && req.method === 'POST') {
      const sid = url.searchParams.get('sessionId');
      if (sid && sseSessions.has(sid)) {
        const { transport } = sseSessions.get(sid);
        await transport.handlePostMessage(req, res);
        return;
      }
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid or missing sessionId for SSE message' }));
      return;
    }

    // 默认 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Not Found',
      availableEndpoints: ['/ping', '/mcp', '/sse', '/messages']
    }));
  });

  return {
    start: () => new Promise((resolve, reject) => {
      httpServer.listen(port, host, () => {
        const addr = httpServer.address();
        const actualPort = typeof addr === 'object' && addr?.port ? addr.port : port;
        resolve({ host, port: actualPort });
      });
      httpServer.on('error', reject);
    }),
    stop: () => new Promise((resolve) => {
      httpServer.close(resolve);
    }),
    server: httpServer
  };
}
