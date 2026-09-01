/**
 * 智能书签应用常量与预设配置
 */

// 系统内置动态常用分组 ID 与固定未分组 ID
export const PINNED_GROUP_ID = 'group_system_pinned';
export const UNGROUPED_GROUP_ID = 'group_system_ungrouped';

// 默认搜索引擎列表
export const DEFAULT_SEARCH_ENGINES = [
  { id: 'google', name: 'Google', iconText: 'G', colorClass: 'text-red-500', url: 'https://www.google.com/search?q=' },
  { id: 'bing', name: 'Bing', iconText: 'B', colorClass: 'text-blue-500', url: 'https://www.bing.com/search?q=' },
  { id: 'baidu', name: '百度', iconText: '度', colorClass: 'text-blue-600', url: 'https://www.baidu.com/s?wd=' },
  { id: 'github', name: 'GitHub', iconText: '⌥', colorClass: 'text-purple-500', url: 'https://github.com/search?q=' }
];

// 插件内置高质感精选壁纸库 (8 款经典多风格高清壁纸)
export const PRESET_WALLPAPERS = [
  { id: 'dark_geometry', name: '极简暗黑几何', category: '极简', url: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=1920&q=80', thumb: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=400&q=70' },
  { id: 'nordic_mountain', name: '北欧迷雾雪山', category: '自然', url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1920&q=80', thumb: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=400&q=70' },
  { id: 'anime_sunset', name: '日系夕阳电车', category: '二次元', url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1920&q=80', thumb: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=400&q=70' },
  { id: 'cyber_metropolis', name: '赛博未来都市', category: '科幻', url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1920&q=80', thumb: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=400&q=70' },
  { id: 'cosmic_nebula', name: '深邃幽紫星云', category: '宇宙', url: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=1920&q=80', thumb: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=400&q=70' },
  { id: 'golden_dune', name: '暮色流金沙丘', category: '极简', url: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=1920&q=80', thumb: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=400&q=70' },
  { id: 'polar_aurora', name: '极地幽绿极光', category: '自然', url: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?auto=format&fit=crop&w=1920&q=80', thumb: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?auto=format&fit=crop&w=400&q=70' },
  { id: 'purple_fluid', name: '深紫暗光流体', category: '抽象', url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1920&q=80', thumb: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=400&q=70' }
];

// 5 套内置官方默认主题（纯色极简方案，默认无预设壁纸）
export const THEMES = [
  { id: 'dark-slate', name: 'Dark Slate (暗黑岩板)', isDark: true, previewBg: '#0f172a', previewBorder: '#6366f1', wallpaper: null },
  { id: 'clean-light', name: 'Clean Light (清新浅白)', isDark: false, previewBg: '#f8fafc', previewBorder: '#4f46e5', wallpaper: null },
  { id: 'cyber-indigo', name: 'Cyber Indigo (赛博数码)', isDark: true, previewBg: '#09090b', previewBorder: '#ec4899', wallpaper: null },
  { id: 'emerald-minimal', name: 'Emerald (极客墨绿)', isDark: true, previewBg: '#064e3b', previewBorder: '#10b981', wallpaper: null },
  { id: 'sunset-warm', name: 'Sunset (暮色暖金)', isDark: true, previewBg: '#1c1917', previewBorder: '#f97316', wallpaper: null }
];

// 默认初始系统分组
export const DEFAULT_GROUPS = [
  {
    id: PINNED_GROUP_ID,
    name: '常用',
    isPinned: true,
    isDefaultCollapsed: false,
    order: 0
  },
  {
    id: 'group_devops',
    name: 'DevOps & 基础设施',
    isPinned: false,
    isDefaultCollapsed: false,
    order: 1
  },
  {
    id: 'group_tools',
    name: 'AI 工具与日常办公',
    isPinned: false,
    isDefaultCollapsed: false,
    order: 2
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

// 默认预置示范书签（按语义分类归属于具体业务分组，常用分组将基于点击频次动态高亮展示）
export const DEFAULT_BOOKMARKS = [
  {
    id: 'bm_gitlab',
    name: 'GitLab 代码平台',
    iconKey: 'gitlab',
    groupId: 'group_devops',
    tags: ['代码仓库', 'CI/CD'],
    endpoints: [
      { url: 'http://192.168.10.50:8080', order: 0, type: 'intranet' },
      { url: 'https://gitlab.company.com', order: 1, type: 'extranet' }
    ],
    createdAt: Date.now() - 100000
  },
  {
    id: 'bm_grafana',
    name: 'Grafana 监控看板',
    iconKey: 'grafana',
    groupId: 'group_devops',
    tags: ['运维监控'],
    endpoints: [
      { url: 'http://192.168.10.88:3000', order: 0, type: 'intranet' },
      { url: 'http://10.200.5.12:3000', order: 1, type: 'intranet' }
    ],
    createdAt: Date.now() - 90000
  },
  {
    id: 'bm_jenkins',
    name: 'Jenkins CI 构建',
    iconKey: 'jenkins',
    groupId: 'group_devops',
    tags: ['CI/CD'],
    endpoints: [
      { url: 'http://192.168.10.60:8080', order: 0, type: 'intranet' },
      { url: 'https://ci.company.com', order: 1, type: 'extranet' }
    ],
    createdAt: Date.now() - 80000
  },
  {
    id: 'bm_portainer',
    name: 'Portainer 集群管理',
    iconKey: 'docker',
    groupId: 'group_devops',
    tags: ['开发环境'],
    endpoints: [
      { url: 'https://192.168.10.99:9443', order: 0, type: 'intranet' }
    ],
    createdAt: Date.now() - 70000
  },
  {
    id: 'bm_wiki',
    name: '团队知识库 Wiki',
    iconKey: 'confluence',
    groupId: 'group_tools',
    tags: ['知识库'],
    endpoints: [
      { url: 'https://wiki.company.com', order: 0, type: 'extranet' }
    ],
    createdAt: Date.now() - 60000
  },
  {
    id: 'bm_prometheus',
    name: 'Prometheus Server',
    iconKey: 'prometheus',
    groupId: 'group_devops',
    tags: ['运维监控'],
    endpoints: [
      { url: 'http://10.10.1.20:9090', order: 0, type: 'intranet' }
    ],
    createdAt: Date.now() - 50000
  },
  {
    id: 'bm_harbor',
    name: 'Harbor 私有镜像库',
    iconKey: 'docker',
    groupId: 'group_devops',
    tags: ['开发环境'],
    endpoints: [
      { url: 'https://harbor.infra.local', order: 0, type: 'intranet' }
    ],
    createdAt: Date.now() - 40000
  },
  {
    id: 'bm_k8s',
    name: 'K8s 生产控制台',
    iconKey: 'kubernetes',
    groupId: 'group_devops',
    tags: ['运维监控'],
    endpoints: [
      { url: 'https://192.168.10.200:8443', order: 0, type: 'intranet' }
    ],
    createdAt: Date.now() - 30000
  },
  {
    id: 'bm_nacos',
    name: 'Nacos 配置注册中心',
    iconKey: 'server',
    groupId: 'group_devops',
    tags: ['开发环境'],
    endpoints: [
      { url: 'http://192.168.10.35:8848', order: 0, type: 'intranet' }
    ],
    createdAt: Date.now() - 20000
  },
  {
    id: 'bm_chatgpt',
    name: 'ChatGPT',
    iconKey: 'chatgpt',
    groupId: 'group_tools',
    tags: ['AI工具'],
    endpoints: [
      { url: 'https://chatgpt.com', order: 0, type: 'extranet' }
    ],
    createdAt: Date.now() - 10000
  },
  {
    id: 'bm_claude',
    name: 'Claude AI',
    iconKey: 'claude',
    groupId: 'group_tools',
    tags: ['AI工具'],
    endpoints: [
      { url: 'https://claude.ai', order: 0, type: 'extranet' }
    ],
    createdAt: Date.now() - 5000
  },
  {
    id: 'bm_github',
    name: 'GitHub',
    iconKey: 'github',
    groupId: 'group_tools',
    tags: ['代码仓库'],
    endpoints: [
      { url: 'https://github.com', order: 0, type: 'extranet' }
    ],
    createdAt: Date.now() - 1000
  }
];

// 默认偏好设置
export const DEFAULT_SETTINGS = {
  theme: 'dark-slate',
  density: 'compact', // compact (5-6列), icon (8列), list (列表行), comfortable (3-4列)
  aestheticSize: 'large', // 'large' (大/默认), 'medium' (中), 'small' (小)
  timeFormat: '24', // 12 或 24
  motto: 'Stay hungry, stay foolish. 无论身处内网还是外网，一键直达。',
  defaultSearchEngine: 'google',
  probeTimeoutMs: 1800, // 探测超时 1.8 秒
  // 全局分组展示行数与智能排版策略
  frequentRows: 1,  // 常用高频分组默认展示行数：1 行 (默认智能 1 行), 2 行, 3 行, 0 (不限全部)
  groupRows: 0,     // 普通业务分组默认展示行数：0 (不限全部/默认), 1 行, 2 行, 3 行
  // 4 种排版模式下单行基准容量配置
  frequentLimits: {
    compact: 6,      // 紧凑卡片模式单行 6 条
    icon: 8,         // 极简图标模式单行 8 条
    list: 5,         // 详细列表模式单行 5 条
    comfortable: 4   // 舒适大卡模式单行 4 条
  },
  // 独立全局壁纸配置
  wallpaper: {
    enabled: false,
    mode: 'preset',      // 'preset' | 'custom' | 'url'
    presetId: 'deep_space',
    customDataUrl: '',   // 本地上传 Base64 图片数据
    customUrl: '',       // 自定义网络图片地址
    blur: 0,             // 模糊度 0~20px
    mask: 0.35           // 暗色遮罩浓度 0.1~0.8
  }
};
