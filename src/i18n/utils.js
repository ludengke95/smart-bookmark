/**
 * 多语言语义映射与辅助函数
 */
import { PINNED_GROUP_ID, UNGROUPED_GROUP_ID } from '../constants/index.js';
import { t } from './index.svelte.js';

/**
 * 获取分组在 UI 层面的国际化展示名称
 * 系统内置常用/未分组根据当前语言动态翻译，用户自定义分组保留原有名称
 */
export function getGroupName(group) {
  if (!group) return '';
  if (typeof group === 'string') {
    if (group === PINNED_GROUP_ID) return t('groups.pinned');
    if (group === UNGROUPED_GROUP_ID) return t('groups.ungrouped');
    return group;
  }
  if (group.id === PINNED_GROUP_ID) return t('groups.pinned');
  if (group.id === UNGROUPED_GROUP_ID) return t('groups.ungrouped');
  return group.name || '';
}

/**
 * 响应延迟转换为语义化国际化标签与色彩指示
 */
export function formatLatencyI18n(latency, reachable = true, error = '') {
  if (reachable === false) {
    if (error === 'timeout') {
      return { label: t('latency.timeout'), colorClass: 'text-amber-500' };
    }
    return { label: t('latency.unreachable'), colorClass: 'text-status-danger' };
  }
  if (latency === null || latency === undefined || latency <= 0) {
    return { label: t('latency.direct'), colorClass: 'text-text-tertiary' };
  }
  if (latency < 100) {
    return { label: t('latency.fast'), colorClass: 'text-status-intranet' };
  }
  if (latency < 300) {
    return { label: t('latency.good'), colorClass: 'text-emerald-500' };
  }
  if (latency < 800) {
    return { label: t('latency.slow'), colorClass: 'text-amber-500' };
  }
  return { label: t('latency.sluggish'), colorClass: 'text-rose-500' };
}
