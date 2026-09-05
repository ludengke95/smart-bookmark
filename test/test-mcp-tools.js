/**
 * MCP Tools 定义与执行逻辑冒烟验证脚本
 */
import assert from 'node:assert/strict';
import { mcpClient } from '../src/services/mcp/client.js';

console.log('--- 1. 验证 MCP 工具定义 (Tool Definitions) ---');
const tools = mcpClient.getToolDefinitions();
assert.ok(Array.isArray(tools), 'tools should be an array');
assert.equal(tools.length, 13, `expected 13 tools, got ${tools.length}`);

const toolNames = new Set(tools.map(t => t.name));
const expectedNames = [
  'list_bookmarks',
  'get_groups',
  'get_tags',
  'create_bookmark',
  'update_bookmark',
  'delete_bookmark',
  'batch_delete_bookmarks',
  'create_group',
  'batch_organize_bookmarks',
  'list_snapshots',
  'rollback_snapshot',
  'get_network_topology',
  'export_full_data'
];

for (const name of expectedNames) {
  assert.ok(toolNames.has(name), `Missing expected tool: ${name}`);
}
console.log('✓ 13 个 MCP 工具宣告完整且名称正确');

console.log('--- 2. 验证每个工具 inputSchema 结构 ---');
for (const tool of tools) {
  assert.ok(tool.name, 'Tool must have a name');
  assert.ok(tool.description, `Tool ${tool.name} must have a description`);
  assert.equal(tool.inputSchema.type, 'object', `Tool ${tool.name} inputSchema must be type object`);
  assert.ok(typeof tool.inputSchema.properties === 'object', `Tool ${tool.name} must have properties`);
}
console.log('✓ 所有工具 inputSchema 均符合 MCP JSON Schema 规范');

console.log('--- 3. 验证优化工具的具体入参特性 ---');
const listBm = tools.find(t => t.name === 'list_bookmarks');
assert.ok(listBm.inputSchema.properties.limit, 'list_bookmarks should support limit');
assert.ok(listBm.inputSchema.properties.offset, 'list_bookmarks should support offset');
assert.ok(listBm.inputSchema.properties.keyword, 'list_bookmarks should support keyword');

const updateBm = tools.find(t => t.name === 'update_bookmark');
assert.ok(updateBm.inputSchema.properties.url, 'update_bookmark should support url');
assert.ok(updateBm.inputSchema.properties.endpoints, 'update_bookmark should support endpoints');
assert.ok(updateBm.inputSchema.properties.tagAction, 'update_bookmark should support tagAction');

const batchDel = tools.find(t => t.name === 'batch_delete_bookmarks');
assert.deepEqual(batchDel.inputSchema.required, ['ids'], 'batch_delete_bookmarks requires ids');

const rollbackSnap = tools.find(t => t.name === 'rollback_snapshot');
assert.deepEqual(rollbackSnap.inputSchema.required, ['snapshotId'], 'rollback_snapshot requires snapshotId');

console.log('✓ 新增参数与新增工具 Schema 校验全部通过');

console.log('\n==============================');
console.log('🎉 所有 MCP 接口规范测试 100% 通过！');
console.log('==============================');
