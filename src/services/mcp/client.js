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
  batchDeleteBookmarks,
  getGroups,
  saveGroup,
  getAllTagsWithCount,
  batchUpdateBookmarks,
  batchApplyAiGroups,
  batchApplyAiTags,
  getProbeCache,
  exportFullBackupJson,
  importFullBackupJson,
  createSnapshot,
  getSnapshots,
  rollbackToSnapshot
} from '../storage.js';
import {
  sortIpByPriority,
  getSystemNetworkInterfaces,
  detectIpsViaWebRTC
} from '../ip-detector.js';
import { DEFAULT_MCP_SETTINGS, DEFAULT_MCP_WS_HOST, DEFAULT_MCP_WS_PORT, PINNED_GROUP_ID, UNGROUPED_GROUP_ID } from '../../constants/index.js';
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
        description: 'List bookmarks stored in this extension with optional search and pagination. Supports filtering by keyword (matches name, tags, or URL), group ID, and tag.',
        inputSchema: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: 'Search keyword matching bookmark name, tags, or endpoint URLs' },
            groupId: { type: 'string', description: 'Filter by specific group ID' },
            tag: { type: 'string', description: 'Filter by tag' },
            limit: { type: 'integer', description: 'Max bookmarks to return (default 50, max 200)' },
            offset: { type: 'integer', description: 'Pagination offset (default 0)' }
          }
        }
      },
      {
        name: 'get_groups',
        description: 'List all custom and built-in bookmark groups, including bookmark count per group and assignability flags',
        inputSchema: { type: 'object', properties: {} }
      },
      {
        name: 'get_tags',
        description: 'List all tags in use with their usage counts and popularity, ordered by popularity',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'integer', description: 'Limit number of top tags returned (optional)' }
          }
        }
      },
      {
        name: 'create_bookmark',
        description: 'Create a new bookmark in the extension with primary URL and optional multi-endpoint routing',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Bookmark name' },
            url: { type: 'string', description: 'Primary access URL of the bookmark' },
            groupId: { type: 'string', description: 'Target group ID (optional, defaults to system_ungrouped)' },
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
        description: 'Update the name, group, tags, primary URL, or multi-endpoints of an existing bookmark',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique ID of the bookmark to update' },
            name: { type: 'string', description: 'New name' },
            url: { type: 'string', description: 'New primary access URL' },
            groupId: { type: 'string', description: 'New group ID' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Tag list' },
            tagAction: {
              type: 'string',
              enum: ['replace', 'append', 'remove'],
              description: 'Tag update strategy: replace (default), append, or remove'
            },
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
              description: 'Updated multi-endpoint routing configuration'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'delete_bookmark',
        description: 'Delete an existing bookmark by its ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'ID of the bookmark to delete' }
          },
          required: ['id']
        }
      },
      {
        name: 'batch_delete_bookmarks',
        description: 'Delete multiple bookmarks in bulk by their IDs',
        inputSchema: {
          type: 'object',
          properties: {
            ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of bookmark IDs to delete'
            }
          },
          required: ['ids']
        }
      },
      {
        name: 'create_group',
        description: 'Create a new custom bookmark group',
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
        description: 'Batch-refactor bookmarks: update groups and tags in bulk (a safety snapshot is created automatically before execution)',
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
        name: 'list_snapshots',
        description: 'List safety backup snapshots with metadata (ID, timestamp, reason, bookmark counts) for disaster recovery',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'integer', description: 'Max snapshots to return (default 10, max 50)' }
          }
        }
      },
      {
        name: 'rollback_snapshot',
        description: 'Roll back all bookmarks, groups, and settings to a previously saved safety snapshot',
        inputSchema: {
          type: 'object',
          properties: {
            snapshotId: { type: 'string', description: 'ID of the snapshot to restore' }
          },
          required: ['snapshotId']
        }
      },
      {
        name: 'get_network_topology',
        description: 'Get local network topology detected by this extension (LAN IPs, network interfaces, and cached latency history)',
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
          const q = String(args.keyword).trim().toLowerCase();
          filtered = filtered.filter(b => {
            const matchName = b.name?.toLowerCase().includes(q);
            const matchTag = (b.tags || []).some(t => t.toLowerCase().includes(q));
            const matchUrl = (b.endpoints || []).some(ep => ep.url?.toLowerCase().includes(q));
            return matchName || matchTag || matchUrl;
          });
        }
        if (args.groupId) {
          filtered = filtered.filter(b => b.groupId === args.groupId);
        }
        if (args.tag) {
          filtered = filtered.filter(b => (b.tags || []).includes(args.tag));
        }
        const total = filtered.length;
        const offset = Math.max(0, parseInt(args.offset, 10) || 0);
        const limit = Math.min(200, Math.max(1, parseInt(args.limit, 10) || 50));
        const paged = filtered.slice(offset, offset + limit);
        return {
          total,
          offset,
          limit,
          hasMore: offset + limit < total,
          bookmarks: paged
        };
      }

      case 'get_groups': {
        const groups = await getGroups();
        const bookmarks = await getBookmarks();
        const countMap = {};
        for (const b of bookmarks) {
          const gid = b.groupId || UNGROUPED_GROUP_ID;
          countMap[gid] = (countMap[gid] || 0) + 1;
        }
        const enrichedGroups = groups.map(g => ({
          id: g.id,
          name: g.name,
          order: g.order,
          isBuiltin: g.id === PINNED_GROUP_ID || g.id === UNGROUPED_GROUP_ID,
          canAssign: g.id !== PINNED_GROUP_ID,
          bookmarkCount: countMap[g.id] || 0
        }));
        return { total: enrichedGroups.length, groups: enrichedGroups };
      }

      case 'get_tags': {
        const tags = await getAllTagsWithCount();
        const limit = args.limit ? Math.max(1, parseInt(args.limit, 10)) : null;
        const resultTags = limit ? tags.slice(0, limit) : tags;
        return { total: tags.length, tags: resultTags };
      }

      case 'create_bookmark': {
        const bookmarkId = 'bm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
        const endpoints = Array.isArray(args.endpoints) && args.endpoints.length > 0
          ? args.endpoints
          : [{ url: args.url, type: 'extranet', order: 0 }];
        const newBm = {
          id: bookmarkId,
          name: String(args.name).trim(),
          groupId: args.groupId || UNGROUPED_GROUP_ID,
          tags: Array.isArray(args.tags) ? args.tags : [],
          endpoints,
          createdAt: Date.now()
        };
        await saveBookmark(newBm);
        return {
          success: true,
          message: `Bookmark "${newBm.name}" created successfully with ID "${newBm.id}"`,
          bookmark: newBm
        };
      }

      case 'update_bookmark': {
        const bookmarks = await getBookmarks();
        const target = bookmarks.find(b => b.id === args.id);
        if (!target) throw new Error(`Bookmark with ID "${args.id}" not found`);

        let finalTags = target.tags || [];
        if (Array.isArray(args.tags)) {
          const action = args.tagAction || 'replace';
          if (action === 'append') {
            finalTags = Array.from(new Set([...finalTags, ...args.tags]));
          } else if (action === 'remove') {
            const removeSet = new Set(args.tags);
            finalTags = finalTags.filter(t => !removeSet.has(t));
          } else {
            finalTags = args.tags;
          }
        }

        let finalEndpoints = target.endpoints;
        if (Array.isArray(args.endpoints) && args.endpoints.length > 0) {
          finalEndpoints = args.endpoints;
        } else if (args.url) {
          const u = String(args.url).trim();
          if (Array.isArray(finalEndpoints) && finalEndpoints.length > 0) {
            finalEndpoints = [{ ...finalEndpoints[0], url: u }, ...finalEndpoints.slice(1)];
          } else {
            finalEndpoints = [{ url: u, type: 'extranet', order: 0 }];
          }
        }

        const updated = {
          ...target,
          ...(args.name !== undefined ? { name: String(args.name).trim() } : {}),
          ...(args.groupId !== undefined ? { groupId: args.groupId } : {}),
          tags: finalTags,
          endpoints: finalEndpoints,
          updatedAt: Date.now()
        };
        await saveBookmark(updated);
        return { success: true, message: `Bookmark "${updated.name}" updated`, bookmark: updated };
      }

      case 'delete_bookmark': {
        const bookmarks = await getBookmarks();
        const target = bookmarks.find(b => b.id === args.id);
        if (!target) {
          return { success: false, message: `Bookmark with ID "${args.id}" not found` };
        }
        await deleteBookmark(args.id);
        return {
          success: true,
          message: `Bookmark "${target.name}" (${args.id}) deleted successfully`,
          deletedBookmark: { id: target.id, name: target.name }
        };
      }

      case 'batch_delete_bookmarks': {
        const res = await batchDeleteBookmarks(args.ids);
        return {
          success: true,
          message: `Batch delete completed: ${res.deletedCount} bookmark(s) removed`,
          deletedCount: res.deletedCount,
          deletedIds: res.deletedIds
        };
      }

      case 'create_group': {
        const trimmedName = String(args.name).trim();
        const groups = await saveGroup({ name: trimmedName });
        const createdGroup = groups.find(g => g.name === trimmedName) || { name: trimmedName };
        return {
          success: true,
          message: `Group "${trimmedName}" created successfully`,
          group: createdGroup
        };
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
          newGroupsCreated: groupResult?.newGroupsCreated || 0,
          tagChanges: tagResult?.modifiedCount || 0
        };
      }

      case 'list_snapshots': {
        const snapshots = await getSnapshots();
        const limit = Math.min(50, Math.max(1, parseInt(args.limit, 10) || 10));
        const list = snapshots.slice(0, limit).map(s => ({
          id: s.id,
          timestamp: s.timestamp,
          timeStr: s.timeStr,
          reason: s.reason,
          type: s.type,
          isLocked: !!s.isLocked,
          counts: s.counts
        }));
        return { total: snapshots.length, limit, snapshots: list };
      }

      case 'rollback_snapshot': {
        const restored = await rollbackToSnapshot(args.snapshotId);
        return {
          success: true,
          message: `Successfully rolled back to snapshot "${restored.timeStr}" (${args.snapshotId})`,
          restored: {
            id: restored.id,
            timeStr: restored.timeStr,
            reason: restored.reason,
            counts: restored.counts
          }
        };
      }

      case 'get_network_topology': {
        const probeCache = await getProbeCache();
        let interfaces = [];
        let detectedIps = [];

        try {
          const [sysIfaces, webrtcIps] = await Promise.all([
            getSystemNetworkInterfaces().catch(() => []),
            detectIpsViaWebRTC(800).catch(() => [])
          ]);
          interfaces = sysIfaces || [];
          const allIps = [
            ...interfaces.map(i => i.address).filter(Boolean),
            ...(webrtcIps || [])
          ];
          detectedIps = sortIpByPriority(allIps);
        } catch (e) {
          console.warn('[MCP] Network topology detection partial failure:', e);
        }

        return {
          detectedIps,
          interfaces,
          probeCache
        };
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
