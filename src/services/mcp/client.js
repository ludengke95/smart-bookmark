/**
 * Chrome 插件端 MCP (Model Context Protocol) 客户端
 * 负责通过 WebSocket (ws://127.0.0.1:8333) 与本地 Node.js 桥接器保持通信，
 * 并以 MCP Server 身份把书签工具暴露给外部大模型。
 *
 * 工具定义与执行业务逻辑见 getToolDefinitions() / executeTool()，
 * JSON-RPC 收发由官方 MCP SDK 的 Server + BrowserExtensionTransport 接管。
 */
import { MCP_TOOL_DEFINITIONS, executeMcpTool } from './tools.js';
import { DEFAULT_MCP_SETTINGS, DEFAULT_MCP_WS_HOST, DEFAULT_MCP_WS_PORT } from '../../constants/index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { BrowserExtensionTransport } from './extension-mcp-transport.js';

class McpClient {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.lastError = null;
    this.host = DEFAULT_MCP_SETTINGS.wsHost || DEFAULT_MCP_WS_HOST;
    this.port = DEFAULT_MCP_SETTINGS.wsPort || DEFAULT_MCP_WS_PORT;
    this.autoReconnect = false;
    this.reconnectTimer = null;
    this.listeners = new Set();
    /** @type {import('@modelcontextprotocol/sdk/server/index.js').Server | null} */
    this.mcpServer = null;
  }

  /**
   * 注册状态变化监听器
   */
  subscribe(listener) {
    this.listeners.add(listener);
    listener({ isConnected: this.isConnected, isConnecting: this.isConnecting, lastError: this.lastError });
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener({ isConnected: this.isConnected, isConnecting: this.isConnecting, lastError: this.lastError });
      } catch (e) {
        console.warn('MCP listener error:', e);
      }
    }
  }

  /**
   * 启动连接 (支持指定 host 与 port)
   */
  connect(host = this.host, port = this.port) {
    if (typeof host === 'number') {
      this.port = host;
      this.host = DEFAULT_MCP_WS_HOST;
    } else if (typeof host === 'string') {
      this.host = host.trim() || DEFAULT_MCP_WS_HOST;
      this.port = port || this.port || DEFAULT_MCP_WS_PORT;
    }

    this.autoReconnect = true;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.isConnecting = true;
    this.lastError = null;
    this.notify();

    const wsUrl = `ws://${this.host}:${this.port}`;

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = async () => {
        this.isConnected = true;
        this.isConnecting = false;
        this.lastError = null;
        console.log(`[MCP Client] 已成功连接至 MCP 桥接服务 (${wsUrl})`);
        this.notify();
        try {
          await this.startMcpServer();
        } catch (e) {
          console.error('[MCP Client] MCP Server 启动失败:', e);
        }
      };

      this.socket.onclose = () => {
        this.isConnected = false;
        this.isConnecting = false;
        this.closeMcpServer();
        this.notify();
        this.scheduleReconnect();
      };

      this.socket.onerror = (err) => {
        this.lastError = `未能连接到 MCP 桥接服务 (${wsUrl})。请确保已执行 "npx -y @ludengke95/smart-bookmark-mcp server"。`;
        this.isConnected = false;
        this.isConnecting = false;
        this.closeMcpServer();
        this.notify();
      };
    } catch (e) {
      this.isConnected = false;
      this.isConnecting = false;
      this.lastError = e.message;
      this.notify();
      this.scheduleReconnect();
    }
  }

  /**
   * 基于当前 WebSocket 连接启动 MCP Server，把书签工具暴露给外部大模型。
   */
  async startMcpServer() {
    const server = new Server(
      { name: 'smart-bookmark-extension', version: '1.0.0' },
      { capabilities: { tools: { listChanged: true } } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.getToolDefinitions()
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const data = await this.executeTool(request.params.name, request.params.arguments || {});
        return {
          content: [
            {
              type: 'text',
              text: typeof data === 'string' ? data : JSON.stringify(data, null, 2)
            }
          ]
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `工具执行失败 [${request.params.name}]: ${err.message}`
            }
          ]
        };
      }
    });

    const transport = new BrowserExtensionTransport(this.socket);
    await server.connect(transport);
    this.mcpServer = server;
  }

  closeMcpServer() {
    if (this.mcpServer) {
      try {
        this.mcpServer.close();
      } catch {
        // ignore
      }
      this.mcpServer = null;
    }
  }

  /**
   * 断开连接
   */
  disconnect() {
    this.autoReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.closeMcpServer();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.isConnected = false;
    this.isConnecting = false;
    this.notify();
  }

  scheduleReconnect() {
    if (!this.autoReconnect) return;
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(this.host, this.port);
    }, 4000);
  }

  /**
   * 定义向外部大模型宣告的 MCP 工具规范列表
   */
  getToolDefinitions() {
    return MCP_TOOL_DEFINITIONS;
  }

  /**
   * 执行对应工具的具体业务操作
   */
  async executeTool(name, args) {
    return await executeMcpTool(name, args);
  }
}

export const mcpClient = new McpClient();
