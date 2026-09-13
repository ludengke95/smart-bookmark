/**
 * Smart Bookmark Stdio MCP Proxy
 * 专为 Cursor / Claude Desktop / Windsurf 等仅支持 Stdio 进程通信的客户端提供桥接。
 * 进程作为标准 Stdio MCP Server 运行，内部透明代理到本地 http://127.0.0.1:8333/mcp (Streamable HTTP)。
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

export async function runStdioProxy(options = {}) {
  const host = options.host || '127.0.0.1';
  const port = options.port || 8333;
  const endpoint = `http://${host}:${port}/mcp`;

  let httpClient = null;

  async function getHttpClient() {
    if (httpClient) return httpClient;

    try {
      const transport = new StreamableHTTPClientTransport(new URL(endpoint));
      const client = new Client(
        { name: 'smart-bookmark-stdio-proxy', version: '1.0.3' },
        { capabilities: {} }
      );
      await client.connect(transport);
      httpClient = client;
      return httpClient;
    } catch (err) {
      throw new Error(
        `Unable to connect to Smart Bookmark MCP server at ${endpoint}. ` +
        `Please ensure Chrome or Edge is open with the Smart Bookmark extension enabled, ` +
        `or run "smart-bookmark-mcp register". Details: ${err?.message || String(err)}`
      );
    }
  }

  const server = new Server(
    { name: 'smart-bookmark-stdio', version: '1.0.3' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    try {
      const client = await getHttpClient();
      return await client.listTools();
    } catch (err) {
      return {
        tools: [
          {
            name: 'check_extension_status',
            description: 'Check whether Smart Bookmark Chrome extension is connected and active',
            inputSchema: { type: 'object', properties: {} }
          }
        ]
      };
    }
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const client = await getHttpClient();
      return await client.callTool(request.params);
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: err?.message || String(err)
          }
        ]
      };
    }
  });

  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);
}
