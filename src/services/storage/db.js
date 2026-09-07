/**
 * Dexie.js (IndexedDB) 数据库实例与核心数据表声明
 *
 * 采用原生 IndexedDB，并通过 DBCore 全局中间件自动拦截并脱敏所有写入实体，
 * 彻底杜绝 Svelte 5 Runes Proxy 或不可克隆对象引发的 DataCloneError。
 */
import Dexie from 'dexie';
import { deepCloneToRaw } from './base.js';

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

    // 注册 DBCore 全局脱敏中间件：拦截所有表的 add/put 操作（含批量）
    this.use({
      stack: 'dbcore',
      name: 'SanitizeAndCloneMiddleware',
      create(downlevelDatabase) {
        return {
          ...downlevelDatabase,
          table(tableName) {
            const downlevelTable = downlevelDatabase.table(tableName);
            return {
              ...downlevelTable,
              mutate(req) {
                if (req.type === 'add' || req.type === 'put') {
                  if (Array.isArray(req.values)) {
                    req.values = req.values.map(val => deepCloneToRaw(val));
                  }
                }
                return downlevelTable.mutate(req);
              }
            };
          }
        };
      }
    });
  }
}

export const db = new SmartBookmarkDB();
