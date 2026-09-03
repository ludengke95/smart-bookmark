/**
 * Svelte 5 全局响应式状态总线 (Runes 驱动)
 */
import {
  initStorage,
  getBookmarks,
  saveBookmark as storageSaveBm,
  deleteBookmark as storageDeleteBm,
  saveAllBookmarks as storageSaveAllBms,
  getGroups,
  saveGroup as storageSaveGroup,
  deleteGroup as storageDeleteGroup,
  reorderGroups as storageReorderGroups,
  reorderBookmarks as storageReorderBookmarks,
  batchImportData as storageBatchImportData,
  batchApplyAiGroups as storageBatchApplyAiGroups,
  batchApplyAiTags as storageBatchApplyAiTags,
  getSettings,
  saveSettings as storageSaveSettings,
  getProbeCache,
  saveProbeCache,
  recordClick as storageRecordClick,
  getClickStats,
  getDetailedStats,
  resetAllStats,
  getSnapshots,
  createSnapshot as storageCreateSnapshot,
  deleteSnapshot as storageDeleteSnapshot,
  toggleSnapshotLock as storageToggleSnapshotLock,
  rollbackToSnapshot as storageRollbackToSnapshot,
  resetToDefaultData as storageResetDefaultData,
  clearAllData as storageClearAll
} from '../services/storage.js';
import { detectLocalIp } from '../services/ip-detector.js';
import { probeAllUrls } from '../services/ping-probe.js';
import { sortEndpointsByTopology } from '../services/xor-matcher.js';
import { mcpClient } from '../services/mcp/client.js';
import { testCustomApiConnection } from '../services/ai/custom-engine.js';
import { analyzeSmartGrouping, analyzeSmartTagging, parseManualAiResult } from '../services/ai/organizer.js';
import { generateGroupingPromptAndData, generateTaggingPromptAndData } from '../services/ai/prompt-builder.js';
import {
  DEFAULT_SEARCH_ENGINES,
  THEMES,
  PINNED_GROUP_ID,
  UNGROUPED_GROUP_ID,
  DEFAULT_SETTINGS
} from '../constants/index.js';

class AppState {
  bookmarks = $state([]);
  groups = $state([]);
  settings = $state(DEFAULT_SETTINGS);
  snapshots = $state([]);
  activeTag = $state('all');
  searchQuery = $state('');
  currentLocalIp = $state('');
  probeResults = $state({});
  clickStats = $state({});
  detailedStats = $state({ totalClicksMap: {}, sevenDaysMap: {}, lastClickedMap: {} });
  collapsedGroups = $state(new Set());
  isLoaded = $state(false);

  // MCP 连接状态
  mcpStatus = $state({ isConnected: false, isConnecting: false, lastError: null });

  // AI 状态
  aiRunning = $state(false);
  aiProgress = $state(null); // { phase, current, total, percent, message }

  // 兼容别名
  get localIp() {
    return this.currentLocalIp;
  }

  // 派生状态：当前选中的搜索引擎
  selectedEngine = $derived.by(() => {
    const engineId = this.settings.defaultSearchEngine || 'baidu';
    return DEFAULT_SEARCH_ENGINES.find(e => e.id === engineId) || DEFAULT_SEARCH_ENGINES[0];
  });

  // 派生状态：所有标签及频次统计
  allTags = $derived.by(() => {
    const tagCountMap = {};
    const tagClickMap = {};

    for (const bm of this.bookmarks) {
      const clicks = this.clickStats[bm.id] || 0;
      for (const tag of (bm.tags || [])) {
        tagCountMap[tag] = (tagCountMap[tag] || 0) + 1;
        tagClickMap[tag] = (tagClickMap[tag] || 0) + clicks;
      }
    }

    return Object.keys(tagCountMap).map(tag => ({
      name: tag,
      count: tagCountMap[tag],
      clickCount: tagClickMap[tag] || 0
    })).sort((a, b) => b.clickCount - a.clickCount || b.count - a.count);
  });

  // 派生状态：动态高频常用书签 (Pinned Bookmarks)
  frequentBookmarks = $derived.by(() => {
    const limit = this.settings.frequentLimits?.compact || 6;
    return [...this.bookmarks]
      .sort((a, b) => (this.clickStats[b.id] || 0) - (this.clickStats[a.id] || 0))
      .slice(0, limit);
  });

  // 派生状态：经过搜索与标签过滤后的书签
  filteredBookmarks = $derived.by(() => {
    const q = this.searchQuery.trim().toLowerCase();
    const tag = this.activeTag;

    return this.bookmarks.filter(bm => {
      // 标签过滤
      if (tag !== 'all' && !(bm.tags || []).includes(tag)) {
        return false;
      }
      // 搜索关键词过滤 (名称、URL、标签)
      if (q) {
        const matchName = bm.name?.toLowerCase().includes(q);
        const matchTag = (bm.tags || []).some(t => t.toLowerCase().includes(q));
        const matchUrl = (bm.endpoints || []).some(ep => ep.url?.toLowerCase().includes(q));
        return matchName || matchTag || matchUrl;
      }
      return true;
    });
  });

  // 派生状态：按分组聚合的书签结构 (常用在首位，自定义分组居中，未分组始终置于最后)
  groupedBookmarks = $derived.by(() => {
    const map = new Map();
    for (const g of this.groups) {
      map.set(g.id, []);
    }

    for (const bm of this.filteredBookmarks) {
      const gId = bm.groupId || UNGROUPED_GROUP_ID;
      if (!map.has(gId)) {
        map.set(gId, []);
      }
      map.get(gId).push(bm);
    }

    const sortOrder = this.settings.bookmarkSortOrder || 'custom';

    // 对每个分组内的书签执行排序
    for (const [gId, list] of map.entries()) {
      list.sort((a, b) => {
        if (sortOrder === 'clicks') {
          return (this.clickStats[b.id] || 0) - (this.clickStats[a.id] || 0);
        }
        if (sortOrder === 'name') {
          return (a.name || '').localeCompare(b.name || '', 'zh-CN');
        }
        if (sortOrder === 'time') {
          return (b.createdAt || 0) - (a.createdAt || 0);
        }
        if (sortOrder === 'latency') {
          const routeA = this.getBookmarkRoute(a);
          const routeB = this.getBookmarkRoute(b);
          const reachA = routeA.optimal?.reachable !== false;
          const reachB = routeB.optimal?.reachable !== false;
          if (reachA !== reachB) return reachA ? -1 : 1;
          const latA = typeof routeA.optimal?.latency === 'number' ? routeA.optimal.latency : 99999;
          const latB = typeof routeB.optimal?.latency === 'number' ? routeB.optimal.latency : 99999;
          return latA - latB;
        }
        // 默认 'custom'：按书签 order 属性排序
        return (a.order || 0) - (b.order || 0);
      });
    }

    const customGroups = this.groups.filter(g => g.id !== PINNED_GROUP_ID && g.id !== UNGROUPED_GROUP_ID);
    customGroups.sort((a, b) => (a.order || 0) - (b.order || 0));

    const pinnedGroup = this.groups.find(g => g.id === PINNED_GROUP_ID) || { id: PINNED_GROUP_ID, name: '常用', isPinned: true, order: 0 };
    const ungroupedGroup = this.groups.find(g => g.id === UNGROUPED_GROUP_ID) || { id: UNGROUPED_GROUP_ID, name: '未分组', isUngrouped: true, isDefaultCollapsed: false, order: 9999 };
    const sortedGroups = [pinnedGroup, ...customGroups, ungroupedGroup];

    return sortedGroups.map(g => ({
      group: g,
      bookmarks: map.get(g.id) || []
    }));
  });

  // 初始化加载全量数据
  async init() {
    await initStorage();
    this.settings = await getSettings();
    this.groups = await getGroups();
    this.bookmarks = await getBookmarks();
    this.clickStats = await getClickStats('30d');
    this.detailedStats = await getDetailedStats();
    this.snapshots = await getSnapshots();

    // 恢复默认折叠状态
    const initCollapsed = new Set();
    for (const g of this.groups) {
      if (g.isDefaultCollapsed) initCollapsed.add(g.id);
    }
    this.collapsedGroups = initCollapsed;

    // 应用当前主题到 DOM
    this.applyThemeToDOM(this.settings.theme || 'obsidian-dark');

    // 读取网络探测缓存
    const cache = await getProbeCache();
    if (cache.results) {
      this.probeResults = cache.results;
    }

    this.isLoaded = true;

    // 订阅 MCP 状态并按需尝试连接 (默认关闭，仅在用户开启时连接)
    mcpClient.subscribe((status) => {
      this.mcpStatus = status;
    });
    if (this.settings.mcp?.enabled === true) {
      mcpClient.connect(this.settings.mcp?.wsHost || '127.0.0.1', this.settings.mcp?.wsPort || 8333);
    }

    // 异步后台探测局域网 IP 与 URL 连通性
    this.refreshNetwork();
  }

  applyThemeToDOM(themeId) {
    const valid = THEMES.some(t => t.id === themeId);
    const target = valid ? themeId : 'obsidian-dark';
    document.documentElement.setAttribute('data-theme', target);
  }

  async setTheme(themeId) {
    this.applyThemeToDOM(themeId);
    this.settings = await storageSaveSettings({ theme: themeId });
  }

  async setEngine(engineId) {
    this.settings = await storageSaveSettings({ defaultSearchEngine: engineId });
  }

  async setBookmarkSortOrder(sortOrder) {
    this.settings = await storageSaveSettings({ bookmarkSortOrder: sortOrder });
  }

  async updateSettings(partial) {
    this.settings = await storageSaveSettings(partial);
    if (partial.theme) {
      this.applyThemeToDOM(partial.theme);
    }
  }

  async refreshNetwork() {
    try {
      const ip = await detectLocalIp(1200);
      this.currentLocalIp = ip || '';

      // 提取全部 URL 进行批量轻量探测
      const allUrls = [];
      for (const bm of this.bookmarks) {
        for (const ep of (bm.endpoints || [])) {
          if (ep.url) allUrls.push(ep.url);
        }
      }

      if (allUrls.length > 0) {
        const results = await probeAllUrls(allUrls, 1800);
        this.probeResults = { ...this.probeResults, ...results };
        await saveProbeCache({
          localIp: this.currentLocalIp,
          results: this.probeResults
        });
      }
    } catch (e) {
      console.warn('Network probe error:', e);
    }
  }

  // 获取单个书签的智能寻径分析结果 (全量防御性校验)
  getBookmarkRoute(bookmark) {
    if (!bookmark || typeof bookmark !== 'object') {
      return { optimal: null, sorted: [], reason: '无书签数据' };
    }
    const endpoints = Array.isArray(bookmark.endpoints) && bookmark.endpoints.length > 0
      ? bookmark.endpoints
      : (bookmark.url ? [{ url: bookmark.url, order: 0, type: 'extranet' }] : []);

    return sortEndpointsByTopology(
      endpoints,
      this.currentLocalIp || '',
      this.probeResults || {}
    );
  }

  // 批量原子导入书签与分组
  async batchImportBookmarks(newGroups, newBookmarks) {
    const result = await storageBatchImportData({ newGroups, newBookmarks });
    this.groups = result.groups;
    this.bookmarks = result.bookmarks;
    this.snapshots = await getSnapshots();

    // 后台异步探测导入的新 URL
    const importedUrls = [];
    for (const bm of newBookmarks) {
      for (const ep of (bm.endpoints || [])) {
        if (ep?.url) importedUrls.push(ep.url);
      }
    }
    if (importedUrls.length > 0) {
      probeAllUrls(importedUrls, 1800).then(res => {
        this.probeResults = { ...this.probeResults, ...res };
      });
    }

    return result;
  }

  // 保存书签
  async saveBookmark(bmData) {
    this.bookmarks = await storageSaveBm(bmData);
    this.snapshots = await getSnapshots();
    // 异步探测新书签中的 URL
    const newUrls = (bmData.endpoints || []).map(e => e.url).filter(Boolean);
    if (newUrls.length > 0) {
      probeAllUrls(newUrls, 1800).then(res => {
        this.probeResults = { ...this.probeResults, ...res };
      });
    }
  }

  // 删除书签
  async deleteBookmark(bmId) {
    this.bookmarks = await storageDeleteBm(bmId);
    this.snapshots = await getSnapshots();
  }

  // 批量保存书签
  async saveAllBookmarks(newBms) {
    this.bookmarks = await storageSaveAllBms(newBms);
    this.snapshots = await getSnapshots();
  }

  // 重新排序书签
  async reorderBookmarks(orderedIds) {
    this.bookmarks = await storageReorderBookmarks(orderedIds);
  }

  // 分组操作
  async saveGroup(grpData) {
    this.groups = await storageSaveGroup(grpData);
    return this.groups;
  }

  async deleteGroup(grpId) {
    this.groups = await storageDeleteGroup(grpId);
    this.bookmarks = await getBookmarks();
  }

  async reorderGroups(orderedIds) {
    this.groups = await storageReorderGroups(orderedIds);
  }

  toggleGroupCollapse(grpId) {
    const next = new Set(this.collapsedGroups);
    if (next.has(grpId)) {
      next.delete(grpId);
    } else {
      next.add(grpId);
    }
    this.collapsedGroups = next;
  }

  // 快照管理
  async createSnapshot(reason, type, isLocked) {
    const snap = await storageCreateSnapshot(reason, type, isLocked);
    this.snapshots = await getSnapshots();
    return snap;
  }

  async deleteSnapshot(snapshotId) {
    this.snapshots = await storageDeleteSnapshot(snapshotId);
  }

  async toggleSnapshotLock(snapshotId) {
    this.snapshots = await storageToggleSnapshotLock(snapshotId);
  }

  async rollbackSnapshot(snapshotId) {
    const target = await storageRollbackToSnapshot(snapshotId);
    if (target) {
      await this.init();
      return true;
    }
    return false;
  }

  // 点击并记录统计
  async recordClick(bmId) {
    await storageRecordClick(bmId);
    this.clickStats = await getClickStats('30d');
    this.detailedStats = await getDetailedStats();
  }

  // 清空访问统计
  async clearStats() {
    await resetAllStats();
    this.clickStats = {};
    this.detailedStats = { totalClicksMap: {}, sevenDaysMap: {}, lastClickedMap: {} };
  }

  // 恢复出厂默认数据
  async resetDefaultData() {
    await storageResetDefaultData();
    await this.init();
  }

  // 清空所有数据
  async clearAll() {
    await storageClearAll();
    this.bookmarks = [];
    this.groups = await getGroups();
    this.clickStats = {};
    this.detailedStats = { totalClicksMap: {}, sevenDaysMap: {}, lastClickedMap: {} };
  }

  // ==========================================
  // AI 智能治理与操作 (通用大模型 API)
  // ==========================================

  async testCustomApiConfig(config) {
    return await testCustomApiConnection(config);
  }

  /**
   * 启动智能分组分析流水线
   */
  async runSmartGrouping() {
    this.aiRunning = true;
    this.aiProgress = { phase: 'grouping', current: 0, total: 0, percent: 0, message: '正在准备书签数据...' };

    try {
      const result = await analyzeSmartGrouping({
        bookmarks: this.bookmarks,
        groups: this.groups,
        aiSettings: this.settings.ai,
        onProgress: (prog) => {
          this.aiProgress = prog;
        }
      });
      return result;
    } finally {
      this.aiRunning = false;
      this.aiProgress = null;
    }
  }

  /**
   * 启动智能标签提炼流水线
   */
  async runSmartTagging() {
    this.aiRunning = true;
    this.aiProgress = { phase: 'tagging', current: 0, total: 0, percent: 0, message: '正在准备书签数据...' };

    try {
      const result = await analyzeSmartTagging({
        bookmarks: this.bookmarks,
        aiSettings: this.settings.ai,
        onProgress: (prog) => {
          this.aiProgress = prog;
        }
      });
      return result;
    } finally {
      this.aiRunning = false;
      this.aiProgress = null;
    }
  }

  /**
   * 生成智能分组的手动 Prompt 和数据
   */
  getManualGroupingPromptData(options = {}) {
    const scope = options.scope || this.settings.ai?.grouping?.scope || 'ungrouped';
    const allowNewGroups = options.allowNewGroups !== undefined
      ? options.allowNewGroups
      : (this.settings.ai?.grouping?.allowNewGroups !== false);

    return generateGroupingPromptAndData({
      bookmarks: this.bookmarks,
      groups: this.groups,
      scope,
      allowNewGroups
    });
  }

  /**
   * 生成智能标签的手动 Prompt 和数据
   */
  getManualTaggingPromptData(options = {}) {
    const scope = options.scope || this.settings.ai?.tagging?.scope || 'untagged';
    const mode = options.mode || this.settings.ai?.tagging?.mode || 'append';
    const maxTags = options.maxTagsPerBookmark || this.settings.ai?.tagging?.maxTagsPerBookmark || 3;

    return generateTaggingPromptAndData({
      bookmarks: this.bookmarks,
      scope,
      mode,
      maxTags
    });
  }

  /**
   * 解析用户从外部大模型粘贴或上传的手动结果
   */
  parseManualAiResponse(rawInput, type = 'grouping', options = {}) {
    return parseManualAiResult({
      rawInput,
      type,
      bookmarks: this.bookmarks,
      groups: this.groups,
      options: {
        mode: options.mode || this.settings.ai?.tagging?.mode || 'append',
        maxTagsPerBookmark: options.maxTagsPerBookmark || this.settings.ai?.tagging?.maxTagsPerBookmark || 3
      }
    });
  }

  /**
   * 应用 AI 智能分组建议
   */
  async applyAiGroupChanges(selectedChanges = []) {
    const result = await storageBatchApplyAiGroups(selectedChanges);
    if (result.success) {
      this.groups = await getGroups();
      this.bookmarks = await getBookmarks();
      this.snapshots = await getSnapshots();
    }
    return result;
  }

  /**
   * 应用 AI 智能标签建议
   */
  async applyAiTagChanges(selectedChanges = [], mode = 'append') {
    const result = await storageBatchApplyAiTags(selectedChanges, mode);
    if (result.success) {
      this.bookmarks = await getBookmarks();
      this.snapshots = await getSnapshots();
    }
    return result;
  }

  // ==========================================
  // MCP 外部协同
  // ==========================================

  reconnectMcp(host, port) {
    const targetHost = host || this.settings.mcp?.wsHost || '127.0.0.1';
    const targetPort = port || this.settings.mcp?.wsPort || 8333;
    mcpClient.connect(targetHost, targetPort);
  }

  disconnectMcp() {
    mcpClient.disconnect();
  }
}

export const appState = new AppState();
