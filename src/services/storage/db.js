/**
 * Dexie.js (IndexedDB) 数据库实例与环境适配
 *
 * 在浏览器/Chrome 扩展环境下使用原生 indexedDB；
 * 在纯 Node.js 测试环境下，自动注入 fake-indexeddb 提供完整支持。
 */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';

export class SmartBookmarkDB extends Dexie {
  constructor() {
    super('SmartBookmarkDB');

    this.version(1).stores({
      // 1. 书签表：主键 id，单值索引 groupId, order, createdAt, updatedAt
      // 内嵌 tagIds: string[] 与 tags: string[]
      bookmarks: 'id, groupId, order, createdAt, updatedAt',

      // 2. 标签实体表 (独立表)：主键 id，唯一索引 &name，单值索引 order, updatedAt
      tags: 'id, &name, order, updatedAt',

      // 3. 分组表：主键 id，单值索引 order, isPinned
      groups: 'id, order, isPinned',

      // 4. 点击统计表
      dailyClicks: '[date+bookmarkId], date',
      bookmarkStats: 'bookmarkId, totalClicks, lastClicked',

      // 5. 备份快照表
      snapshots: 'id, timestamp, isLocked, type',

      // 6. 系统杂项设置与缓存键值表
      appSettings: 'key'
    });
  }
}

export const db = new SmartBookmarkDB();
