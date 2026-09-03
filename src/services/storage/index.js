/**
 * 存储层统一导出入口 (Barrel)
 *
 * 将各功能域模块的公开 API 聚合重导出，
 * 保持原有 src/services/storage.js 的公开接口完全兼容。
 */
export * from './base.js';
export * from './bookmark.js';
export * from './group.js';
export * from './stats.js';
export * from './backup.js';
export * from './ai.js';
