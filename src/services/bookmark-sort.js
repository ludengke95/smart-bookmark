/**
 * 书签排序比较器 (Bookmark Sort Comparator)
 *
 * 从全局状态总线中抽出的纯函数，用于按用户配置的排序方式
 * (clicks / name / time / latency / custom) 比较两个书签。
 */
export function createBookmarkComparator({ sortOrder = 'custom', clickStats = {}, getRoute }) {
  return (a, b) => {
    if (sortOrder === 'clicks') {
      return (clickStats[b.id] || 0) - (clickStats[a.id] || 0);
    }
    if (sortOrder === 'name') {
      return (a.name || '').localeCompare(b.name || '', 'zh-CN');
    }
    if (sortOrder === 'time') {
      return (b.createdAt || 0) - (a.createdAt || 0);
    }
    if (sortOrder === 'latency') {
      const routeA = getRoute(a);
      const routeB = getRoute(b);
      const reachA = routeA.optimal?.reachable !== false;
      const reachB = routeB.optimal?.reachable !== false;
      if (reachA !== reachB) return reachA ? -1 : 1;
      const latA = typeof routeA.optimal?.latency === 'number' ? routeA.optimal.latency : 99999;
      const latB = typeof routeB.optimal?.latency === 'number' ? routeB.optimal.latency : 99999;
      return latA - latB;
    }
    // 默认 'custom'：按书签 order 属性排序
    return (a.order || 0) - (b.order || 0);
  };
}
