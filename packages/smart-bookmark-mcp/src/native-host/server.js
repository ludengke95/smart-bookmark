/**
 * Smart Bookmark MCP HTTP / SSE Server
 * 对外暴露 Streamable HTTP (/mcp) 与 Server-Sent Events (/sse) 端点，
 * 符合 MCP 协议规范，同时支持 CherryStudio、Dify、Cursor、Claude Desktop 等现代 AI 客户端。
 */

import http from 'node:http';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

function extractProvidedToken(req, url) {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1].trim();
    return authHeader.trim();
  }
  const xToken = req.headers['x-mcp-token'];
  if (xToken) return String(xToken).trim();
  const queryToken = url.searchParams.get('token');
  if (queryToken) return queryToken.trim();
  return null;
}

function verifyToken(expectedToken, providedToken) {
  if (!expectedToken || !providedToken) return false;
  const expectedBuf = Buffer.from(expectedToken);
  const providedBuf = Buffer.from(providedToken);
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

export function createMcpHttpServer({
  getTools,
  callTool,
  port = 8333,
  host = '127.0.0.1',
  token = ''
}) {
  const httpSessions = new Map();
  const sseSessions = new Map();

  function createSdkServer() {
    const server = new Server(
      {
        name: 'smart-bookmark',
        version: '1.1.1'
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
    const origin = req.headers.origin;
    const isExtensionOrigin = origin && (
      origin.startsWith('chrome-extension://') ||
      origin.startsWith('moz-extension://') ||
      origin.startsWith('edge-extension://')
    );

    // 仅针对合法浏览器扩展来源设置 CORS 响应头，拒绝普通网页跨域请求
    if (isExtensionOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-mcp-token, mcp-session-id');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
    }

    if (req.method === 'OPTIONS') {
      if (!origin || isExtensionOrigin) {
        res.writeHead(204);
        res.end();
      } else {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'CORS forbidden: untrusted origin' }));
      }
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    // 健康检查端点（不返回书签等敏感数据，用于存活状态探活）
    if (url.pathname === '/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        uptime: process.uptime(),
        version: '1.1.1',
        service: 'smart-bookmark-mcp'
      }));
      return;
    }

    // 核心业务端点 Token 鉴权校验（强制鉴权：未配置 Token 或客户端未提供有效 Token 均拒绝访问）
    const providedToken = extractProvidedToken(req, url);
    if (!verifyToken(token, providedToken)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Unauthorized: Invalid or missing authentication token'
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
