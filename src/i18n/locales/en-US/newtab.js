/**
 * English · Home & quick-entry copy (nav / search / sort / popup)
 */
export default {
  nav: {
    title: 'Smart Bookmark',
    statusIntranet: 'Intranet',
    statusExtranet: 'Public Network',
    statusDetecting: 'Probing network topology...',
    statusDiscoveredIp: 'Detected Local IP: {ip}',
    statusNotInPrivate: 'Not currently in a private subnet',
    topologySensing: 'Network Topology Sensing',
    discoveredSubnets: '{count} subnet(s) discovered',
    noPrivateIp: 'No private address',
    primaryNic: 'Primary NIC',
    tunProxy: 'TUN Proxy',
    virtualNic: 'Virtual NIC',
    vpnSubnet: 'VPN / Intranet',
    noSubnetDetected: 'Currently not connected to any private LAN subnet',
    lpmBenchmark: 'LPM Benchmark Routing Depth',
    clickToRefresh: 'Click to refresh',
    aiOrganize: 'AI Organize',
    aiOrganizeTitle: 'AI Smart Grouping & Tag Refinement',
    importBookmarks: 'Import Bookmarks',
    stats: 'Usage Stats',
    statsTitle: 'Traffic & Access Analytics',
    backup: 'Backups & Snapshots',
    backupTitle: 'Snapshots & Rollback',
    settings: 'Preferences',
    addBookmark: 'Add Bookmark'
  },
  search: {
    placeholder: 'Search bookmarks or query the web...',
    engineTooltip: 'Switch search engine'
  },
  sort: {
    tooltip: 'Switch bookmark sorting order',
    toastSorted: 'Sorted by "{label}"',
    custom: 'Custom Order',
    clicks: 'By Frequency',
    name: 'By Name',
    latency: 'By Latency',
    time: 'By Added Date'
  },
  popup: {
    title: 'Smart Bookmark Quick Add',
    quickAdd: 'Bookmark Current Tab',
    searchPlaceholder: 'Quick search bookmarks...',
    openFullNewtab: 'Open Full New Tab',
    openConsole: 'Open full dashboard in new tab',
    saved: 'Current webpage bookmarked',
    saveFailed: 'Failed to bookmark',
    alreadyExists: 'Endpoint already exists in this bookmark',
    appendedEndpoint: 'Appended as new endpoint for "{name}"',
    alreadySaved: 'Already Bookmarked',
    ready: 'Ready',
    collect: '+ Save',
    saveTo: 'Save to Bookmarks',
    noValidEndpoint: 'No valid endpoint configured',
    refreshNetwork: 'Refresh network status',
    detectingNetwork: 'Detecting network...',
    noBookmarksFound: 'No matching bookmarks'
  }
};
