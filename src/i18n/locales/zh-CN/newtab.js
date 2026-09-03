/**
 * 简体中文 · 主页与快捷入口文案 (nav / search / sort / popup)
 */
export default {
  nav: {
    title: '智能书签',
    statusIntranet: '内网环境',
    statusExtranet: '外网环境',
    statusDetecting: '正在探测网络拓扑...',
    statusDiscoveredIp: '已发现本机内网 IP: {ip}',
    statusNotInPrivate: '当前未处于私有局域网网段',
    topologySensing: '网络拓扑感知',
    discoveredSubnets: '已发现 {count} 个内网',
    noPrivateIp: '无私网地址',
    primaryNic: '主网卡',
    tunProxy: 'TUN 代理',
    virtualNic: '虚拟网卡',
    vpnSubnet: 'VPN / 专网',
    noSubnetDetected: '当前未处于任何局域网 / 私有网段',
    lpmBenchmark: '拓扑最长前缀寻径基准',
    clickToRefresh: '点击刷新',
    aiOrganize: 'AI 整理',
    aiOrganizeTitle: 'AI 智能分组与智能标签整理',
    importBookmarks: '导入书签',
    stats: '访问统计',
    statsTitle: '访问频次与数据统计',
    backup: '备份与快照',
    backupTitle: '数据快照与版本回滚',
    settings: '系统设置',
    addBookmark: '添加书签'
  },
  search: {
    placeholder: '搜索书签或网页内容...',
    engineTooltip: '切换搜索引擎'
  },
  sort: {
    tooltip: '切换书签排序方式',
    toastSorted: '已按「{label}」排序',
    custom: '自定义排序',
    clicks: '按访问热度',
    name: '按书签名称',
    latency: '按响应测速',
    time: '按添加时间'
  },
  popup: {
    title: 'Smart Bookmark 快捷收藏',
    quickAdd: '一键收藏当前标签页',
    searchPlaceholder: '快速搜索书签...',
    openFullNewtab: '进入完整新标签页',
    openConsole: '在新标签页中打开控制台',
    saved: '已成功收藏当前网页',
    saveFailed: '收藏失败',
    alreadyExists: '该入口已存在于此书签中',
    appendedEndpoint: '已将当前网址追加为「{name}」的新入口',
    alreadySaved: '已收录于书签',
    ready: '已就绪',
    collect: '+ 收藏',
    saveTo: '收藏到书签',
    noValidEndpoint: '未配置有效入口',
    refreshNetwork: '刷新网络状态',
    detectingNetwork: '检测网络中...',
    noBookmarksFound: '未找到匹配书签'
  }
};
