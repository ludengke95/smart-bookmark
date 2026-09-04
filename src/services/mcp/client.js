/**
 * Chrome 插件端 MCP (Model Context Protocol) 客户端
 * 负责通过 WebSocket (ws://127.0.0.1:8333) 与本地 Node.js 桥接器保持通信，
 * 并以 MCP Server 身份把书签工具暴露给外部大模型。
 *
 * 工具定义与执行业务逻辑见 getToolDefinitions() / executeTool()，
 * JSON-RPC 收发由官方 MCP SDK 的 Server + BrowserExtensionTransport 接管。
 */
import {
  getBookmarks,
  saveBookmark,
  deleteBookmark,
  getGroups,
  saveGroup,
  getAllTagsWithCount,
  batchUpdateBookmarks,
  batchApplyAiGroups,
  getProbeCache,
  exportFullBackupJson,
  importFullBackupJson,
  createSnapshot
} from '../storage.js';
import { DEFAULT_MCP_SETTINGS, DEFAULT_MCP_WS_HOST, DEFAULT_MCP_WS_PORT, UNGROUPED_GROUP_ID } from '../../constants/index.js';
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
        this.lastError = `未能连接到 MCP 桥接服务 (${wsUrl})。请确保已执行 "npm run mcp"。`;
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
    return [
      {
        name: 'list_bookmarks',
        description: 'List all bookmarks stored in this extension, optionally filtered by keyword, group ID, or tag',
        inputSchema: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: 'Search keyword' },
            groupId: { type: 'string', description: 'Filter by group ID' },
            tag: { type: 'string', description: 'Filter by tag' }
          }
        }
      },
      {
        name: 'get_groups',
        description: 'List all custom and built-in bookmark groups',
        inputSchema: { type: 'object', properties: {} }
      },
      {
        name: 'get_tags',
        description: 'List all tags in use with their usage counts and popularity',
        inputSchema: { type: 'object', properties: {} }
      },
      {
        name: 'create_bookmark',
        description: 'Create a new bookmark in the extension',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Bookmark name' },
            url: { type: 'string', description: 'Primary access URL of the bookmark' },
            groupId: { type: 'string', description: 'Target group ID (optional)' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Tag list' },
            endpoints: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  url: { type: 'string' },
                  type: { type: 'string', enum: ['intranet', 'extranet', 'direct'] }
                },
                required: ['url']
              },
              description: 'Multi-endpoint routing configuration'
            }
          },
          required: ['name', 'url']
        }
      },
      {
        name: 'update_bookmark',
        description: 'Update the name, group, tags, or endpoint URLs of an existing bookmark',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique ID of the bookmark to update' },
            name: { type: 'string', description: 'New name' },
            groupId: { type: 'string', description: 'New group ID' },
            tags: { type: 'array', items: { type: 'string' }, description: 'New tag list' }
          },
          required: ['id']
        }
      },
      {
        name: 'delete_bookmark',
        description: 'Delete an existing bookmark',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'ID of the bookmark to delete' }
          },
          required: ['id']
        }
      },
      {
        name: 'create_group',
        description: 'Create a new bookmark group',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Group name' }
          },
          required: ['name']
        }
      },
      {
        name: 'batch_organize_bookmarks',
        description: 'Batch-refactor bookmarks: update bookmark groups and tags in bulk (a safety snapshot is created automatically before execution)',
        inputSchema: {
          type: 'object',
          properties: {
            groupPlan: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  bookmarkId: { type: 'string' },
                  targetGroupName: { type: 'string' }
                },
                required: ['bookmarkId', 'targetGroupName']
              },
              description: 'Group migration plan'
            },
            tagPlan: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  bookmarkId: { type: 'string' },
                  suggestedTags: { type: 'array', items: { type: 'string' } }
                },
                required: ['bookmarkId', 'suggestedTags']
              },
              description: 'Tag update plan'
            }
          }
        }
      },
      {
        name: 'get_network_topology',
        description: 'Get the network topology detected by this extension (LAN IPs and cached latency history)',
        inputSchema: { type: 'object', properties: {} }
      },
      {
        name: 'export_full_data',
        description: 'Export a complete JSON backup of all bookmarks, groups, and settings',
        inputSchema: { type: 'object', properties: {} }
      }
    ];
  }

  /**
   * 执行对应工具的具体业务操作
   */
  async executeTool(name, args) {
    switch (name) {
      case 'list_bookmarks': {
        const bookmarks = await getBookmarks();
        let filtered = bookmarks;
        if (args.keyword) {
          const q = args.keyword.toLowerCase();
          filtered = filtered.filter(b => b.name?.toLowerCase().includes(q) || (b.tags || []).some(t => t.toLowerCase().includes(q)));
        }
        if (args.groupId) {
          filtered = filtered.filter(b => b.groupId === args.groupId);
        }
        if (args.tag) {
          filtered = filtered.filter(b => (b.tags || []).includes(args.tag));
        }
        return { total: filtered.length, bookmarks: filtered };
      }

      case 'get_groups': {
        const groups = await getGroups();
        return { groups };
      }

      case 'get_tags': {
        const tags = await getAllTagsWithCount();
        return { tags };
      }

      case 'create_bookmark': {
        const newBm = {
          name: args.name,
          groupId: args.groupId || UNGROUPED_GROUP_ID,
          tags: args.tags || [],
          endpoints: args.endpoints || [{ url: args.url, type: 'extranet', order: 0 }]
        };
        const all = await saveBookmark(newBm);
        return { success: true, message: `Bookmark "${args.name}" created successfully`, bookmark: newBm };
      }

      case 'update_bookmark': {
        const bookmarks = await getBookmarks();
        const target = bookmarks.find(b => b.id === args.id);
        if (!target) throw new Error(`Bookmark with ID "${args.id}" not found`);

        const updated = {
          ...target,
          ...(args.name ? { name: args.name } : {}),
          ...(args.groupId ? { groupId: args.groupId } : {}),
          ...(args.tags ? { tags: args.tags } : {})
        };
        await saveBookmark(updated);
        return { success: true, message: `Bookmark "${updated.name}" updated`, bookmark: updated };
      }

      case 'delete_bookmark': {
        await deleteBookmark(args.id);
        return { success: true, message: `Bookmark ${args.id} deleted` };
      }

      case 'create_group': {
        const groups = await saveGroup({ name: args.name });
        return { success: true, message: `Group "${args.name}" created`, groups };
      }

      case 'batch_organize_bookmarks': {
        await createSnapshot('[MCP AI] Pre-refactor snapshot before LLM batch governance', 'auto_mcp');
        let groupResult = null;
        let tagResult = null;

        if (Array.isArray(args.groupPlan) && args.groupPlan.length > 0) {
          groupResult = await batchApplyAiGroups(args.groupPlan);
        }
        if (Array.isArray(args.tagPlan) && args.tagPlan.length > 0) {
          tagResult = await batchApplyAiTags(args.tagPlan, 'append');
        }

        return {
          success: true,
          message: 'External LLM governance plan applied successfully',
          groupChanges: groupResult?.modifiedCount || 0,
          tagChanges: tagResult?.modifiedCount || 0
        };
      }

      case 'get_network_topology': {
        const probeCache = await getProbeCache();
        return { probeCache };
      }

      case 'export_full_data': {
        const json = await exportFullBackupJson();
        return JSON.parse(json);
      }

      default:
        throw new Error(`Unknown tool name: ${name}`);
    }
  }
}

export const mcpClient = new McpClient();
