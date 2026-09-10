/**
 * Smart Bookmark MCP Tool Definitions & Executor
 * 纯业务逻辑模块，解耦 UI 与视图层，直接操作 Dexie.js (IndexedDB) 本地存储与网络探测服务。
 * 可在 Background Service Worker 中独立无头执行。
 */

import {
  getBookmarks,
  saveBookmark,
  deleteBookmark,
  batchDeleteBookmarks,
  getGroups,
  saveGroup,
  updateGroup,
  deleteGroup,
  renameTag,
  deleteTag,
  getAllTagsWithCount,
  batchOrganizeBookmarks,
  getProbeCache,
  exportFullBackupJson,
  getSnapshots,
  rollbackToSnapshot
} from '../storage.js';
import {
  sortIpByPriority,
  getSystemNetworkInterfaces,
  detectIpsViaWebRTC
} from '../ip-detector.js';
import { PINNED_GROUP_ID, UNGROUPED_GROUP_ID } from '../../constants/index.js';

export const MCP_TOOL_DEFINITIONS = [
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
    name: 'update_group',
    description: 'Rename or update an existing custom bookmark group (system built-in groups cannot be renamed)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID of the group to update' },
        name: { type: 'string', description: 'New name for the group' }
      },
      required: ['id', 'name']
    }
  },
  {
    name: 'delete_group',
    description: 'Delete a custom bookmark group by its ID. Bookmarks in this group are safely preserved and moved to the unorganized group (system built-in groups cannot be deleted)',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID of the group to delete' }
      },
      required: ['id']
    }
  },
  {
    name: 'rename_tag',
    description: 'Globally rename or merge a tag across all bookmarks (merges duplicates if bookmark already has new tag, automatically creates backup snapshot)',
    inputSchema: {
      type: 'object',
      properties: {
        oldTag: { type: 'string', description: 'Current tag name to rename' },
        newTag: { type: 'string', description: 'Target new tag name' }
      },
      required: ['oldTag', 'newTag']
    }
  },
  {
    name: 'delete_tag',
    description: 'Globally remove a tag from all bookmarks across the library (automatically creates backup snapshot)',
    inputSchema: {
      type: 'object',
      properties: {
        tag: { type: 'string', description: 'Tag name to delete from all bookmarks' }
      },
      required: ['tag']
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
              bookmarkId: { type: ['string', 'number'] },
              suggestedTags: { type: ['array', 'string'], items: { type: 'string' } },
              tags: { type: ['array', 'string'], items: { type: 'string' } }
            },
            required: ['bookmarkId']
          },
          description: 'Tag update plan (supports suggestedTags or tags array/comma string)'
        },
        tagMode: {
          type: 'string',
          enum: ['append', 'replace'],
          description: 'Tagging strategy: append (default, merge existing tags) or replace (overwrite tags)'
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

/**
 * 执行工具调用
 * @param {string} name
 * @param {Record<string, any>} args
 */
export async function executeMcpTool(name, args = {}) {
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

    case 'update_group': {
      const trimmedName = String(args.name).trim();
      if (!trimmedName) throw new Error('Group name cannot be empty');
      if (args.id === PINNED_GROUP_ID || args.id === UNGROUPED_GROUP_ID) {
        throw new Error('System built-in groups cannot be renamed');
      }
      const updatedGroups = await updateGroup(args.id, trimmedName);
      const target = updatedGroups.find(g => g.id === args.id);
      return {
        success: true,
        message: `Group "${trimmedName}" (${args.id}) updated successfully`,
        group: target || { id: args.id, name: trimmedName }
      };
    }

    case 'delete_group': {
      if (args.id === PINNED_GROUP_ID || args.id === UNGROUPED_GROUP_ID) {
        throw new Error('System built-in groups cannot be deleted');
      }
      const groupsBefore = await getGroups();
      const target = groupsBefore.find(g => g.id === args.id);
      if (!target) {
        return { success: false, message: `Group with ID "${args.id}" not found` };
      }
      await deleteGroup(args.id);
      return {
        success: true,
        message: `Group "${target.name}" (${args.id}) deleted successfully, bookmarks migrated to unorganized group`,
        deletedGroup: { id: target.id, name: target.name }
      };
    }

    case 'rename_tag': {
      const oldTag = String(args.oldTag || '').trim();
      const newTag = String(args.newTag || '').trim();
      if (!oldTag || !newTag) {
        throw new Error('Both oldTag and newTag must be non-empty strings');
      }
      const res = await renameTag(oldTag, newTag);
      return {
        success: true,
        message: `Tag "${oldTag}" renamed to "${newTag}" across ${res.modifiedCount} bookmark(s)`,
        modifiedCount: res.modifiedCount,
        oldTag,
        newTag
      };
    }

    case 'delete_tag': {
      const tag = String(args.tag || '').trim();
      if (!tag) {
        throw new Error('Tag must be a non-empty string');
      }
      const res = await deleteTag(tag);
      return {
        success: true,
        message: `Tag "${tag}" removed from ${res.modifiedCount} bookmark(s)`,
        modifiedCount: res.modifiedCount,
        deletedTag: tag
      };
    }

    case 'batch_organize_bookmarks': {
      const res = await batchOrganizeBookmarks({
        groupPlan: args.groupPlan,
        tagPlan: args.tagPlan,
        tagMode: args.tagMode || 'append',
        snapshotReason: '[MCP AI] Pre-refactor snapshot before LLM batch governance',
        snapshotType: 'auto_mcp'
      });

      return {
        success: true,
        message: 'External LLM governance plan applied atomically',
        groupChanges: res.groupChanges,
        newGroupsCreated: res.newGroupsCreated,
        tagChanges: res.tagChanges
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
