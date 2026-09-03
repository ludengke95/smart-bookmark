/**
 * Smart Bookmark 极简设计系统常量与默认配置
 */

// 连通性探测缓存 TTL 默认 15 分钟 (毫秒)
export const PROBE_CACHE_TTL_MS = 15 * 60 * 1000;

// 系统内置动态常用分组 ID 与固定未分组 ID
export const PINNED_GROUP_ID = 'group_system_pinned';
export const UNGROUPED_GROUP_ID = 'group_system_ungrouped';

// 默认搜索引擎列表
export const DEFAULT_SEARCH_ENGINES = [
  { id: 'baidu', name: '百度', iconText: '度', colorClass: 'text-blue-600', url: 'https://www.baidu.com/s?wd=' },
  { id: 'google', name: 'Google', iconText: 'G', colorClass: 'text-red-500', url: 'https://www.google.com/search?q=' },
  { id: 'bing', name: 'Bing', iconText: 'B', colorClass: 'text-blue-500', url: 'https://www.bing.com/search?q=' },
  { id: 'github', name: 'GitHub', iconText: '⌥', colorClass: 'text-purple-500', url: 'https://github.com/search?q=' }
];

// 3 套高质感极简主题定义 (严格符合 doc/前端设计规范.md)
export const THEMES = [
  {
    id: 'paper-sand',
    name: '纸本暖沙 (Paper Sand)',
    isDark: false,
    previewBg: '#F5F2EB',
    previewBorder: '#3A5A40',
    desc: '质朴墨色，温和护眼'
  },
  {
    id: 'ceramic-light',
    name: '陶瓷素白 (Ceramic Light)',
    isDark: false,
    previewBg: '#F6F7F9',
    previewBorder: '#1E293B',
    desc: '温润骨瓷，柔和浅色'
  },
  {
    id: 'obsidian-dark',
    name: '深曜黑 (Obsidian Dark)',
    isDark: true,
    previewBg: '#14161A',
    previewBorder: '#E2E7F0',
    desc: '深空石墨，沉静暗夜'
  }
];

// 默认系统分组 (仅保留系统内置常用与未分组骨架)
export const DEFAULT_GROUPS = [
  {
    id: PINNED_GROUP_ID,
    name: '常用',
    isPinned: true,
    isDefaultCollapsed: false,
    order: 0
  },
  {
    id: UNGROUPED_GROUP_ID,
    name: '未分组',
    isPinned: false,
    isUngrouped: true,
    isDefaultCollapsed: false,
    order: 999
  }
];

// 默认初始书签 (新安装与重置后默认为空)
export const DEFAULT_BOOKMARKS = [];

// 书签排序模式选项
export const BOOKMARK_SORT_OPTIONS = [
  { value: 'custom', label: '自定义排序', iconText: '↕' },
  { value: 'clicks', label: '按访问热度', iconText: '🔥' },
  { value: 'name', label: '按书签名称', iconText: '🔤' },
  { value: 'latency', label: '按响应测速', iconText: '⚡' },
  { value: 'time', label: '按添加时间', iconText: '🕒' }
];

/**
 * 响应延迟转换为语义化中文标签与色彩指示
 */
export function formatLatencyChinese(latency, reachable = true, error = '') {
  if (reachable === false) {
    if (error === 'timeout') {
      return { label: '超时', colorClass: 'text-amber-500' };
    }
    return { label: '不可达', colorClass: 'text-status-danger' };
  }
  if (latency === null || latency === undefined || latency <= 0) {
    return { label: '直达', colorClass: 'text-text-tertiary' };
  }
  if (latency < 100) {
    return { label: '极快', colorClass: 'text-status-intranet' };
  }
  if (latency < 300) {
    return { label: '良好', colorClass: 'text-emerald-500' };
  }
  if (latency < 800) {
    return { label: '较慢', colorClass: 'text-amber-500' };
  }
  return { label: '迟缓', colorClass: 'text-rose-500' };
}

// 大模型 API 常用预设模板
export const AI_API_PRESETS = [
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', desc: '超高性价比，中文理解极强' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', desc: '经典通用，稳定快速' },
  { id: 'ollama', name: 'Ollama (本地私有)', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b', desc: '完全本地运行，离线私密免 Key' },
  { id: 'custom', name: '自定义接口', baseUrl: '', model: '', desc: '兼容任何 OpenAI 协议端点' }
];

// 默认 AI 智能治理配置
export const DEFAULT_AI_SETTINGS = {
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
  preset: 'deepseek',
  grouping: {
    scope: 'ungrouped', // 'ungrouped' (仅未分组) | 'all' (全部书签)
    allowNewGroups: true
  },
  tagging: {
    scope: 'untagged', // 'untagged' (仅无标签) | 'all' (全部书签)
    mode: 'append', // 'append' (增量追加) | 'replace' (重构覆盖)
    maxTagsPerBookmark: 3
  }
};

// 默认 MCP 外部协同协议配置 (默认关闭，默认本地 127.0.0.1:8333)
export const DEFAULT_MCP_SETTINGS = {
  enabled: false,
  wsHost: '127.0.0.1',
  wsPort: 8333,
  autoReconnect: false
};

// 默认全局设置
export const DEFAULT_SETTINGS = {
  theme: 'paper-sand',
  clockFormat: '24',
  showSeconds: false,
  defaultSearchEngine: 'baidu',
  bookmarkSortOrder: 'custom',
  motto: 'Stay hungry, stay foolish. 无论内网外网，一键极速直达。',
  frequentLimits: { compact: 6, icon: 8, list: 5, comfortable: 4 },
  density: 'compact',
  aestheticSize: 'medium',
  customWallpaper: null,
  wallpaperMaskOpacity: 40,
  ai: DEFAULT_AI_SETTINGS,
  mcp: DEFAULT_MCP_SETTINGS
};
