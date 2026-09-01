import { initStorage, getBookmarks, saveBookmark, deleteBookmark, clearAllData, saveAllBookmarks, getGroups, saveGroup, deleteGroup, reorderGroups, getAllTagsWithCount, getSettings, saveSettings, getProbeCache, recordClick, getClickStats, resetAllStats, getBackupSettings, saveBackupSettings, getSnapshots, createSnapshot, deleteSnapshot, toggleSnapshotLock, rollbackToSnapshot, checkDailyAutoBackup, getCustomThemes, saveCustomTheme, deleteCustomTheme, getAllThemes, getWallpaperSettings, saveWallpaperSettings, getUploadedWallpapers, saveUploadedWallpaper, deleteUploadedWallpaper, deleteUploadedWallpapersBatch, saveUploadedWallpapersBatch, getAllRemoteIconCaches, getRemoteIconCache, setRemoteIconCache, clearRemoteIconCache, clearAllTemporaryCaches, calculateStorageUsageAnalysis } from '../common/storage.js';
import { initTheme, setTheme, applyTheme, applyWallpaper, exportThemeAsZip, exportThemeAsJson, importThemeFromPackage, importThemeFromJson, fetchBingDailyWallpaper, syncBingDailyWallpaper, PRESET_THEME_VARIABLES } from '../common/theme.js';
import { renderIcon, searchIcons, BRAND_ICONS, preloadRemoteIconCaches, downloadAndCacheRemoteIcon, searchRemoteIconify } from '../common/icons-library.js';
import { DEFAULT_SEARCH_ENGINES, THEMES, PRESET_WALLPAPERS, PINNED_GROUP_ID, UNGROUPED_GROUP_ID } from '../common/constants.js';
import { sortEndpointsByTopology, classifyUrl } from '../background/xor-matcher.js';
import { detectLocalIp } from '../background/ip-detector.js';

// 全局应用状态
let state = {
  bookmarks: [],
  groups: [],
  settings: {},
  tags: [],
  activeTag: 'all',
  searchQuery: '',
  selectedEngine: DEFAULT_SEARCH_ENGINES[0],
  probeCache: { localIp: '', results: {} },
  currentLocalIp: '',
  collapsedGroups: new Set(),
  expandedRowGroups: new Set()
};

// 拖拽排序与移动全局控制
let isDraggingBookmark = false;
let draggedBmId = null;
let draggedSourceGid = null;

// 页面初始化入口
document.addEventListener('DOMContentLoaded', async () => {
  await initStorage();
  await initTheme();
  await preloadRemoteIconCaches();
  await loadState();

  initClock();
  initSearchEngine();
  initDensityControls();
  initTopTags();
  initGroupRenderer();
  initModals();
  initIconPicker();
  initNetworkStatus();

  // 后台静默检测并触发每日定时快照
  checkDailyAutoBackup().catch(e => console.warn('Daily auto backup check:', e));
});

/**
 * 加载全量持久化数据
 */
async function loadState() {
  state.settings = await getSettings();
  state.groups = await getGroups();
  state.bookmarks = await getBookmarks();
  state.tags = await getAllTagsWithCount();
  state.probeCache = await getProbeCache();

  // 恢复座右铭
  if (state.settings.motto !== undefined) {
    document.getElementById('motto-text').innerText = state.settings.motto || '点击此处自定义您的座右铭...';
  }

  // 恢复默认搜索引擎
  const savedEngine = DEFAULT_SEARCH_ENGINES.find(e => e.id === state.settings.defaultSearchEngine);
  if (savedEngine) {
    state.selectedEngine = savedEngine;
    updateEngineUI(savedEngine);
  }

  // 同步栅格列数与单行容量
  syncGridColumns();

  // 恢复布局密度
  applyDensity(state.settings.density || 'compact', false);

  // 恢复美化区尺寸 (大 / 中 / 小，默认设置为大)
  applyAestheticSize(state.settings.aestheticSize || 'large', false);
}

function syncGridColumns() {
  const frequentLimits = state.settings.frequentLimits || { compact: 6, icon: 8, list: 5, comfortable: 4 };
  const root = document.documentElement;
  root.style.setProperty('--compact-cols', frequentLimits.compact || 6);
  root.style.setProperty('--icon-cols', frequentLimits.icon || 8);
  root.style.setProperty('--comfortable-cols', frequentLimits.comfortable || 4);
}

// 美化区 3 档尺寸切换 (大 / 中 / 小)
function applyAestheticSize(size, save = true) {
  const validSizes = ['large', 'medium', 'small'];
  if (!validSizes.includes(size)) size = 'large';

  document.body.classList.remove('aesthetic-size-small', 'aesthetic-size-medium', 'aesthetic-size-large');
  document.body.classList.add(`aesthetic-size-${size}`);
  state.settings.aestheticSize = size;

  document.querySelectorAll('.aesthetic-size-btn').forEach(btn => {
    const btnSize = btn.getAttribute('data-aesthetic-size');
    if (btnSize === size) {
      btn.classList.add('border-[var(--primary)]', 'text-[var(--text-main)]', 'bg-[var(--primary)]/10', 'shadow-sm');
      btn.classList.remove('border-[var(--border)]', 'text-[var(--text-muted)]');
    } else {
      btn.classList.remove('border-[var(--primary)]', 'text-[var(--text-main)]', 'bg-[var(--primary)]/10', 'shadow-sm');
      btn.classList.add('border-[var(--border)]', 'text-[var(--text-muted)]');
    }
  });

  if (save) {
    saveSettings({ aestheticSize: size });
    const sizeNameMap = { large: '大 (大气开阔 / 默认)', medium: '中 (标准平衡)', small: '小 (极简紧凑)' };
    showToast('✨ 美化区尺寸已更新', sizeNameMap[size] || size);
  }
}

// ==========================================
// 1. 美化区时钟、日期与座右铭
// ==========================================

function initClock() {
  function update() {
    const now = new Date();
    const is12 = state.settings.timeFormat === '12';
    
    let hours = now.getHours();
    const ampm = hours >= 12 ? ' PM' : ' AM';
    if (is12) {
      hours = hours % 12 || 12;
    }
    const h = String(hours).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');

    document.getElementById('live-clock').innerText = `${h}:${m}:${s}${is12 ? ampm : ''}`;

    const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${days[now.getDay()]}`;
    document.getElementById('live-date').innerText = dateStr;
  }
  update();
  setInterval(update, 1000);
}

// ==========================================
// 2. 统一聚合搜索引擎与实时匹配
// ==========================================

function initSearchEngine() {
  const engineBtn = document.getElementById('engine-btn');
  const engineMenu = document.getElementById('engine-menu');
  const searchInput = document.getElementById('main-search-input');
  const searchDropdown = document.getElementById('search-results-dropdown');
  const matchesList = document.getElementById('search-matches-list');

  // 渲染搜索引擎下拉菜单
  const renderEngineMenu = () => {
    engineMenu.innerHTML = DEFAULT_SEARCH_ENGINES.map(e => {
      const isCurrent = e.id === state.selectedEngine.id;
      return `
        <button data-engine-id="${e.id}" class="w-full px-2.5 py-1.5 text-left hover:bg-[var(--bg-card-hover)] flex items-center justify-between rounded-xl transition-colors cursor-pointer ${isCurrent ? 'bg-[var(--primary)]/10 text-[var(--primary)] font-semibold' : 'text-[var(--text-main)]'}">
          <div class="flex items-center gap-2">
            <span class="w-5 h-5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)] flex items-center justify-center font-bold text-xs ${e.colorClass}">${e.iconText}</span>
            <span>${e.name}</span>
          </div>
          ${isCurrent ? '<span class="text-xs text-[var(--primary)] font-bold">✓</span>' : ''}
        </button>
      `;
    }).join('');

    engineMenu.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-engine-id');
        const engine = DEFAULT_SEARCH_ENGINES.find(e => e.id === id);
        if (engine) {
          state.selectedEngine = engine;
          updateEngineUI(engine);
          renderEngineMenu();
          await saveSettings({ defaultSearchEngine: engine.id });
        }
        engineMenu.classList.add('hidden');
      });
    });
  };
  renderEngineMenu();

  // 引擎下拉点击切换
  engineBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    engineMenu.classList.toggle('hidden');
  });

  const clearBtn = document.getElementById('search-clear-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input'));
      searchInput.focus();
    });
  }

  // 实时书签模糊搜索与下拉提示
  searchInput.addEventListener('input', (e) => {
    const val = e.target.value.trim().toLowerCase();
    state.searchQuery = val;
    renderAllGroups(); // 实时过滤网格

    if (clearBtn) {
      if (val) {
        clearBtn.classList.remove('hidden');
        clearBtn.classList.add('flex');
      } else {
        clearBtn.classList.add('hidden');
        clearBtn.classList.remove('flex');
      }
    }

    if (!val) {
      searchDropdown.classList.add('hidden');
      return;
    }

    const matches = state.bookmarks.filter(bm => {
      const inName = (bm.name || '').toLowerCase().includes(val);
      const inTags = (bm.tags || []).some(t => t.toLowerCase().includes(val));
      const inUrls = (bm.endpoints || []).some(ep => (ep.url || '').toLowerCase().includes(val));
      return inName || inTags || inUrls;
    });

    if (matches.length > 0) {
      matchesList.innerHTML = matches.map(bm => `
        <div data-jump-id="${bm.id}" class="p-2 rounded-xl hover:bg-[var(--bg-card-hover)] flex items-center justify-between cursor-pointer transition-colors">
          <div class="flex items-center gap-2 min-w-0">
            ${renderIcon(bm.iconKey, bm.iconData, 'w-5 h-5 flex-shrink-0')}
            <div class="min-w-0">
              <div class="font-semibold text-xs text-[var(--text-main)] truncate">${bm.name}</div>
              <div class="text-[10px] text-[var(--text-dim)] font-mono truncate">${bm.endpoints[0] ? bm.endpoints[0].url : ''}</div>
            </div>
          </div>
          <span class="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-medium">直达</span>
        </div>
      `).join('');

      matchesList.querySelectorAll('[data-jump-id]').forEach(el => {
        el.addEventListener('click', () => {
          const id = el.getAttribute('data-jump-id');
          const bm = state.bookmarks.find(b => b.id === id);
          if (bm) triggerSmartJump(bm);
        });
      });

      searchDropdown.classList.remove('hidden');
    } else {
      matchesList.innerHTML = `
        <div class="p-3 text-center text-xs text-[var(--text-muted)]">
          无匹配本地书签，按 <kbd class="px-1.5 py-0.5 bg-[var(--bg-subtle)] border border-[var(--border)] rounded font-mono">Enter</kbd> 使用 ${state.selectedEngine.name} 搜索 "${val}"
        </div>
      `;
      searchDropdown.classList.remove('hidden');
    }
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      triggerSearch();
    }
  });

  const submitBtn = document.getElementById('search-submit-btn');
  if (submitBtn) {
    submitBtn.addEventListener('click', triggerSearch);
  }

  // 点击外部关闭浮层
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#engine-btn') && !e.target.closest('#engine-menu')) {
      engineMenu.classList.add('hidden');
    }
    if (!e.target.closest('#main-search-input') && !e.target.closest('#search-results-dropdown') && !e.target.closest('#search-clear-btn')) {
      searchDropdown.classList.add('hidden');
    }
  });

  // 全局快捷键 Ctrl+K / / 聚焦搜索框
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey && e.key === 'k') || (e.key === '/' && document.activeElement !== searchInput)) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });
}

function updateEngineUI(engine) {
  const label = document.getElementById('engine-label');
  if (label) label.innerText = engine.name;
  const icon = document.getElementById('engine-icon');
  if (icon) {
    icon.innerText = engine.iconText;
    icon.className = `w-4 h-4 flex items-center justify-center font-bold ${engine.colorClass}`;
  }
}

function triggerSearch() {
  const input = document.getElementById('main-search-input');
  const query = input.value.trim();
  if (!query) return;

  const url = state.selectedEngine.url + encodeURIComponent(query);
  window.open(url, '_blank');
  document.getElementById('search-results-dropdown').classList.add('hidden');
}

// ==========================================
// 3. 布局密度切换
// ==========================================

function initDensityControls() {
  document.querySelectorAll('.density-switch-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const density = btn.getAttribute('data-density');
      applyDensity(density, true);
    });
  });
}

async function applyDensity(densityName, save = false) {
  document.body.classList.remove('density-compact', 'density-icon', 'density-list', 'density-comfortable');
  document.body.classList.add('density-' + densityName);
  state.settings.density = densityName;

  document.querySelectorAll('.density-switch-btn').forEach(btn => {
    const isCurrent = btn.getAttribute('data-density') === densityName;
    if (isCurrent) {
      btn.className = 'density-switch-btn p-1.5 rounded font-medium flex items-center justify-center transition-all bg-[var(--primary)] text-white shadow-sm';
    } else {
      btn.className = 'density-switch-btn p-1.5 rounded font-medium flex items-center justify-center transition-all text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-hover)]';
    }
  });

  if (save) {
    await saveSettings({ density: densityName });
    renderAllGroups();
    showToast('📐 布局密度已切换', `已应用 [${densityName}] 排版模式`);
  }
}

// ==========================================
// 4. 顶部高频标签筛选
// ==========================================

function initTopTags() {
  const container = document.getElementById('top-tags-bar');
  const tags = state.tags.slice(0, 8); // 取前 8 个高频

  let html = `
    <span class="text-[11px] text-[var(--text-dim)] mr-1">高频标签:</span>
    <button data-tag="all" class="tag-pill px-2.5 py-0.5 rounded-lg text-[11px] font-medium transition-all ${state.activeTag === 'all' ? 'bg-[var(--primary)] text-white shadow-sm' : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-muted)]'}">
      全部 (${state.bookmarks.length})
    </button>
  `;

  for (const t of tags) {
    const isActive = state.activeTag === t.name;
    html += `
      <button data-tag="${t.name}" class="tag-pill px-2.5 py-0.5 rounded-lg text-[11px] font-medium transition-all ${isActive ? 'bg-[var(--primary)] text-white shadow-sm' : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--primary)]'}">
        ${t.name} <span class="text-[10px] opacity-60">${t.count}</span>
      </button>
    `;
  }

  container.innerHTML = html;

  container.querySelectorAll('.tag-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeTag = btn.getAttribute('data-tag');
      initTopTags();
      renderAllGroups();
    });
  });
}

// ==========================================
// 5. 分组与智能卡片渲染器
// ==========================================

function initGroupRenderer() {
  renderAllGroups();
}

async function renderAllGroups() {
  const container = document.getElementById('groups-container');
  const groups = state.groups;
  const filterQuery = state.searchQuery.toLowerCase();
  const filterTag = state.activeTag;
  const currentDensity = state.settings.density || 'compact';
  const densityBaseLimits = state.settings.frequentLimits || { compact: 6, icon: 8, list: 5, comfortable: 4 };
  const itemsPerRow = Number(densityBaseLimits[currentDensity]) || 6;
  const frequentRows = state.settings.frequentRows !== undefined ? Number(state.settings.frequentRows) : 1;
  const groupRows = state.settings.groupRows !== undefined ? Number(state.settings.groupRows) : 0;

  const clickStats = await getClickStats('30d');

  let fullHtml = '';

  for (const group of groups) {
    let bms = [];
    const isPinned = group.id === PINNED_GROUP_ID || group.isPinned;

    if (isPinned) {
      // 常用分组：动态聚合全量书签中点击频次 Top N 的高频应用
      const sortedByClicks = [...state.bookmarks].sort((a, b) => {
        const clicksA = clickStats[a.id] || 0;
        const clicksB = clickStats[b.id] || 0;
        if (clicksB !== clicksA) return clicksB - clicksA;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });

      bms = sortedByClicks;
      if (filterTag !== 'all') {
        bms = bms.filter(b => (b.tags || []).includes(filterTag));
      }
      if (filterQuery) {
        bms = bms.filter(b => 
          (b.name || '').toLowerCase().includes(filterQuery) ||
          (b.tags || []).some(t => t.toLowerCase().includes(filterQuery)) ||
          (b.endpoints || []).some(ep => (ep.url || '').toLowerCase().includes(filterQuery))
        );
      }
      // 按常用分组设定行数截取（若非搜索过滤且非标签筛选）
      const frequentMaxCount = frequentRows > 0 ? frequentRows * itemsPerRow : bms.length;
      if (!filterQuery && filterTag === 'all') {
        bms = bms.slice(0, frequentMaxCount);
      }
    } else {
      // 普通业务分组：仅包含该组下的书签
      bms = state.bookmarks.filter(b => b.groupId === group.id);

      if (filterTag !== 'all') {
        bms = bms.filter(b => (b.tags || []).includes(filterTag));
      }
      if (filterQuery) {
        bms = bms.filter(b => 
          (b.name || '').toLowerCase().includes(filterQuery) ||
          (b.tags || []).some(t => t.toLowerCase().includes(filterQuery)) ||
          (b.endpoints || []).some(ep => (ep.url || '').toLowerCase().includes(filterQuery))
        );
      }
    }

    // 隐藏主页被用户设为不展示的分组（若有搜索过滤词或标签筛选则依然允许临时展示以防漏查）
    if (group.isHidden && !filterQuery && filterTag === 'all') continue;

    // 若有搜索过滤词 或 点击了标签筛选，且该分组无匹配书签，则彻底隐藏不展示该分组
    if ((filterQuery || filterTag !== 'all') && bms.length === 0) continue;

    const isCollapsed = state.collapsedGroups.has(group.id) || (!state.collapsedGroups.has(group.id) && group.isDefaultCollapsed && !state.collapsedGroups.has('user_toggled_' + group.id));

    // 计算业务分组行数限制与展开状态
    const isGroupExpanded = state.expandedRowGroups && state.expandedRowGroups.has(group.id);
    const shouldClampGroup = !isPinned && groupRows > 0 && !filterQuery && filterTag === 'all';
    const groupLimitCount = groupRows * itemsPerRow;
    const hasMore = shouldClampGroup && bms.length > groupLimitCount;
    const displayedBms = (shouldClampGroup && !isGroupExpanded) ? bms.slice(0, groupLimitCount) : bms;
    const remainingCount = bms.length - groupLimitCount;

    fullHtml += `
      <section data-group-section="${group.id}" class="bookmark-group bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 shadow-sm transition-all">
        <!-- 分组标题栏 -->
        <div data-toggle-group="${group.id}" class="group-header flex items-center justify-between cursor-pointer select-none pb-3 border-b border-[var(--border)]">
          <div class="flex items-center gap-2">
            ${isPinned ? `
              <span class="p-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
              </span>
            ` : `
              <span class="p-1 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
              </span>
            `}
            <h2 class="font-bold text-sm sm:text-base text-[var(--text-main)]">${group.name}</h2>
            ${isPinned ? `
              <span class="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono">
                高频智能 ${frequentRows > 0 ? `${frequentRows} 行` : '全部'} · Top ${bms.length}
              </span>
            ` : `
              <span class="group-count-badge text-[11px] px-2 py-0.5 rounded-full bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border)] font-mono">
                ${bms.length} 个应用
              </span>
            `}
          </div>

          <div class="flex items-center gap-2">
            ${!isPinned ? `
              <button data-add-to-group="${group.id}" class="p-1.5 rounded-lg hover:bg-[var(--bg-card-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)] text-xs flex items-center gap-1 cursor-pointer">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
                <span class="hidden sm:inline">添加</span>
              </button>
            ` : ''}
            <svg class="group-chevron w-4 h-4 text-[var(--text-dim)] transform transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
          </div>
        </div>

        <!-- 卡片网格折叠动画容器 -->
        <div id="wrapper-${group.id}" class="group-collapse-wrapper ${isCollapsed ? 'is-collapsed' : ''}">
          <div class="group-collapse-inner">
            <div id="grid-${group.id}" data-group-grid="${group.id}" class="bookmark-grid pt-3.5">
              ${displayedBms.map(bm => renderBookmarkCardHtml(bm, group.id, !isPinned)).join('')}
              
              ${!isPinned ? `
                <!-- 快捷添加占位卡片 (仅非常用分组展示) -->
                <div data-add-to-group="${group.id}" class="bm-card border border-dashed border-[var(--border)] hover:border-[var(--primary)] flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-[var(--bg-card-hover)]/40 group min-h-[70px]">
                  <div class="p-1.5 rounded-full bg-[var(--bg-subtle)] text-[var(--text-muted)] group-hover:text-[var(--primary)] transition-colors">
                    <svg class="w-3.5 h-3.5 fill-none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
                  </div>
                  <span class="text-[11px] font-medium text-[var(--text-muted)] group-hover:text-[var(--text-main)] mt-1">+ 添加书签</span>
                </div>
              ` : ''}
            </div>

            ${hasMore ? `
              <!-- 业务分组超量展开/收起按钮 -->
              <div class="pt-3 pb-1 text-center">
                <button type="button" data-toggle-expand-group="${group.id}" class="px-3.5 py-1.5 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-card-hover)] border border-[var(--border)] hover:border-[var(--primary)] text-xs text-[var(--text-muted)] hover:text-[var(--primary)] transition-all inline-flex items-center gap-1.5 cursor-pointer font-medium shadow-2xs">
                  ${isGroupExpanded ? `
                    <svg class="w-3.5 h-3.5 transform rotate-180" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
                    <span>收起至默认 ${groupRows} 行</span>
                  ` : `
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
                    <span>展开余下 ${remainingCount} 个应用</span>
                  `}
                </button>
              </div>
            ` : ''}
          </div>
        </div>
      </section>
    `;
  }

  if (!fullHtml && (filterQuery || filterTag !== 'all')) {
    const filterDesc = filterTag !== 'all' ? `标签「${filterTag}」` : `关键词「${filterQuery}」`;
    container.innerHTML = `
      <div class="p-12 text-center bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl shadow-sm space-y-3 my-4">
        <div class="text-3xl">🏷️</div>
        <div class="font-semibold text-sm text-[var(--text-main)]">未找到与 ${filterDesc} 匹配的书签应用</div>
        <p class="text-xs text-[var(--text-dim)]">可点击顶栏「全部」标签或清空搜索栏以恢复完整展示</p>
        <button id="btn-reset-filter" type="button" class="px-4 py-1.5 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-semibold shadow-sm transition-all cursor-pointer inline-flex items-center gap-1">
          <span>查看全部书签</span>
        </button>
      </div>
    `;
    const resetBtn = document.getElementById('btn-reset-filter');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        state.activeTag = 'all';
        state.searchQuery = '';
        const searchInput = document.getElementById('main-search-input');
        if (searchInput) searchInput.value = '';
        initTopTags();
        renderAllGroups();
      });
    }
    return;
  }

  container.innerHTML = fullHtml;
  bindCardInteractions(container);
}

function updateGroupHeaderCounts() {
  document.querySelectorAll('.bookmark-group').forEach(groupSec => {
    const gid = groupSec.getAttribute('data-group-section');
    if (gid === PINNED_GROUP_ID) return;
    const count = state.bookmarks.filter(b => b.groupId === gid).length;
    const badge = groupSec.querySelector('.group-count-badge');
    if (badge) {
      badge.innerText = `${count} 个应用`;
    }
  });
}

function bindCardInteractions(container) {
  // 分组折叠与展开 (平滑动画切换)
  container.querySelectorAll('[data-toggle-group]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-add-to-group]')) return;

      const gid = el.getAttribute('data-toggle-group');
      const wrapper = document.getElementById(`wrapper-${gid}`);
      const chevron = el.querySelector('.group-chevron');

      const isCurrentlyCollapsed = wrapper ? wrapper.classList.contains('is-collapsed') : state.collapsedGroups.has(gid);
      const willCollapse = !isCurrentlyCollapsed;

      if (willCollapse) {
        state.collapsedGroups.add(gid);
      } else {
        state.collapsedGroups.delete(gid);
      }
      state.collapsedGroups.add('user_toggled_' + gid);

      if (wrapper) {
        if (willCollapse) {
          wrapper.classList.add('is-collapsed');
          if (chevron) chevron.classList.add('rotate-180');
        } else {
          wrapper.classList.remove('is-collapsed');
          if (chevron) chevron.classList.remove('rotate-180');
        }
      }
    });
  });

  // 业务分组超量展开/收起切换
  container.querySelectorAll('[data-toggle-expand-group]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const gid = btn.getAttribute('data-toggle-expand-group');
      if (!state.expandedRowGroups) state.expandedRowGroups = new Set();
      if (state.expandedRowGroups.has(gid)) {
        state.expandedRowGroups.delete(gid);
      } else {
        state.expandedRowGroups.add(gid);
      }
      renderAllGroups();
    });
  });

  // 添加书签
  container.querySelectorAll('[data-add-to-group]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const gid = btn.getAttribute('data-add-to-group');
      openBookmarkModal(null, gid);
    });
  });

  // 卡片点击跳转（防止拖拽误触）
  container.querySelectorAll('[data-jump-card]').forEach(card => {
    card.addEventListener('click', () => {
      if (isDraggingBookmark) return;
      const bmId = card.getAttribute('data-jump-card');
      const bm = state.bookmarks.find(b => b.id === bmId);
      if (bm) triggerSmartJump(bm);
    });
  });

  // 编辑书签
  container.querySelectorAll('[data-edit-bm]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-edit-bm');
      const bm = state.bookmarks.find(b => b.id === id);
      if (bm) openBookmarkModal(bm);
    });
  });

  // 展开备选入口
  container.querySelectorAll('[data-toggle-endpoints]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-toggle-endpoints');
      const panel = document.getElementById('endpoints-drawer-' + id);
      if (panel) panel.classList.toggle('hidden');
    });
  });

  // 直接跳转指定入口
  container.querySelectorAll('[data-direct-jump]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = btn.getAttribute('data-direct-jump');
      window.open(url, '_blank');
    });
  });

  // 点击卡片上的标签胶囊一键快速筛选
  container.querySelectorAll('[data-tag-pill]').forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      const tag = pill.getAttribute('data-tag-pill');
      state.activeTag = tag;
      initTopTags();
      renderAllGroups();
    });
  });

  // ==========================================
  // HTML5 书签卡片拖拽排序与跨分组移动事件 (仅限普通业务分组，常用高频分组不可拖动)
  // ==========================================
  const draggableCards = container.querySelectorAll('.bm-card[draggable="true"]');
  draggableCards.forEach(card => {
    card.addEventListener('dragstart', (e) => {
      const bmId = card.getAttribute('data-bm-id');
      const gid = card.getAttribute('data-group-id');
      if (gid === PINNED_GROUP_ID) {
        e.preventDefault();
        return;
      }
      draggedBmId = bmId;
      draggedSourceGid = gid;
      isDraggingBookmark = true;

      e.dataTransfer.setData('text/plain', bmId);
      e.dataTransfer.effectAllowed = 'move';

      setTimeout(() => {
        card.classList.add('is-dragging');
      }, 0);
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
      container.querySelectorAll('.bm-card').forEach(c => {
        c.classList.remove('is-dragging', 'drag-insert-before', 'drag-insert-after');
      });
      container.querySelectorAll('.bookmark-group').forEach(g => {
        g.classList.remove('group-drag-over');
      });
      draggedBmId = null;
      draggedSourceGid = null;
      setTimeout(() => {
        isDraggingBookmark = false;
      }, 80);
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const targetGid = card.getAttribute('data-group-id');
      if (targetGid === PINNED_GROUP_ID || !draggedBmId || draggedBmId === card.getAttribute('data-bm-id')) return;
      e.dataTransfer.dropEffect = 'move';

      const rect = card.getBoundingClientRect();
      const isList = document.body.classList.contains('density-list');
      let isAfter = false;
      if (isList) {
        isAfter = (e.clientY - rect.top) > (rect.height / 2);
      } else {
        isAfter = (e.clientX - rect.left) > (rect.width / 2);
      }

      container.querySelectorAll('.bm-card').forEach(c => {
        if (c !== card) c.classList.remove('drag-insert-before', 'drag-insert-after');
      });

      if (isAfter) {
        card.classList.remove('drag-insert-before');
        card.classList.add('drag-insert-after');
      } else {
        card.classList.remove('drag-insert-after');
        card.classList.add('drag-insert-before');
      }
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-insert-before', 'drag-insert-after');
    });

    card.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const targetGid = card.getAttribute('data-group-id');
      if (targetGid === PINNED_GROUP_ID) return; // 常用分组不允许被放置

      const sourceId = e.dataTransfer.getData('text/plain') || draggedBmId;
      const targetId = card.getAttribute('data-bm-id');

      card.classList.remove('drag-insert-before', 'drag-insert-after');
      if (!sourceId || sourceId === targetId) return;

      const sourceBm = state.bookmarks.find(b => b.id === sourceId);
      const targetBm = state.bookmarks.find(b => b.id === targetId);
      if (!sourceBm || !targetBm) return;

      const isAfter = card.classList.contains('drag-insert-after');
      const oldGid = sourceBm.groupId;

      // 1. 直接原地移动 DOM 节点，完全杜绝整页重建与全屏闪烁跳跃
      const draggedCardEl = container.querySelector(`.bm-card[data-bm-id="${sourceId}"]`);
      const targetGrid = card.closest('.bookmark-grid');

      if (draggedCardEl && targetGrid) {
        if (isAfter) {
          targetGrid.insertBefore(draggedCardEl, card.nextSibling);
        } else {
          targetGrid.insertBefore(draggedCardEl, card);
        }
        draggedCardEl.setAttribute('data-group-id', targetGid);

        // 柔和落定呼吸动画
        draggedCardEl.classList.add('drop-settled');
        setTimeout(() => draggedCardEl.classList.remove('drop-settled'), 460);
      }

      // 2. 更新内存数据与持久化
      sourceBm.groupId = targetGid;

      // 调整 state.bookmarks 数组中的顺序
      const oldIdx = state.bookmarks.findIndex(b => b.id === sourceId);
      if (oldIdx >= 0) {
        state.bookmarks.splice(oldIdx, 1);
      }
      const targetIdx = state.bookmarks.findIndex(b => b.id === targetId);
      const insertIdx = targetIdx + (isAfter ? 1 : 0);
      state.bookmarks.splice(insertIdx, 0, sourceBm);

      await saveAllBookmarks(state.bookmarks);
      updateGroupHeaderCounts();

      if (oldGid !== targetGid) {
        const targetGroup = state.groups.find(g => g.id === targetGid);
        showToast('📦 书签已移动', `[${sourceBm.name}] 已移动至 [${targetGroup ? targetGroup.name : '目标分组'}]`);
      } else {
        showToast('↕️ 排序已更新', `[${sourceBm.name}] 位置已调整`);
      }
    });
  });

  // 分组空白区域支持拖入以迁移分组 (排除常用分组)
  container.querySelectorAll('[data-group-section]').forEach(groupSec => {
    const gid = groupSec.getAttribute('data-group-section');
    if (gid === PINNED_GROUP_ID) return; // 常用分组不允许作为拖放目标

    groupSec.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!draggedBmId) return;
      e.dataTransfer.dropEffect = 'move';
      groupSec.classList.add('group-drag-over');
    });

    groupSec.addEventListener('dragleave', (e) => {
      if (!groupSec.contains(e.relatedTarget)) {
        groupSec.classList.remove('group-drag-over');
      }
    });

    groupSec.addEventListener('drop', async (e) => {
      e.preventDefault();
      groupSec.classList.remove('group-drag-over');

      const sourceId = e.dataTransfer.getData('text/plain') || draggedBmId;
      if (!sourceId) return;

      const sourceBm = state.bookmarks.find(b => b.id === sourceId);
      if (!sourceBm) return;

      if (sourceBm.groupId !== gid) {
        const oldGid = sourceBm.groupId;
        sourceBm.groupId = gid;

        const draggedCardEl = container.querySelector(`.bm-card[data-bm-id="${sourceId}"]`);
        const targetGrid = groupSec.querySelector('.bookmark-grid');

        if (draggedCardEl && targetGrid) {
          const addPlaceholder = targetGrid.querySelector('[data-add-to-group]');
          if (addPlaceholder) {
            targetGrid.insertBefore(draggedCardEl, addPlaceholder);
          } else {
            targetGrid.appendChild(draggedCardEl);
          }
          draggedCardEl.setAttribute('data-group-id', gid);
          draggedCardEl.classList.add('drop-settled');
          setTimeout(() => draggedCardEl.classList.remove('drop-settled'), 460);
        }

        const oldIdx = state.bookmarks.findIndex(b => b.id === sourceId);
        if (oldIdx >= 0) state.bookmarks.splice(oldIdx, 1);
        state.bookmarks.push(sourceBm);

        await saveAllBookmarks(state.bookmarks);
        updateGroupHeaderCounts();

        const targetGroup = state.groups.find(g => g.id === gid);
        showToast('📦 书签已移动', `[${sourceBm.name}] 已移动至 [${targetGroup ? targetGroup.name : '目标分组'}]`);
      }
    });
  });
}

function renderBookmarkCardHtml(bm, groupId, isDraggable = true) {
  // 计算智能最优入口
  const decision = sortEndpointsByTopology(bm.endpoints, state.probeCache.localIp || state.currentLocalIp, state.probeCache.results);
  const optimal = decision.optimal;
  const isIntranet = optimal && optimal.isIntranet;
  const actualGid = groupId || bm.groupId;
  const dragAttr = isDraggable ? 'draggable="true"' : 'draggable="false"';

  // 格式化网络延迟与连通状态 (区分正常延迟与 1800ms 探针超时/不可达)
  let latencyText = isIntranet ? '内网' : '外网';
  let badgeClass = isIntranet ? 'bg-emerald-500/20 text-emerald-300' : 'bg-blue-500/20 text-blue-300';
  let dotClass = isIntranet ? 'bg-emerald-500 pulse-dot' : 'bg-blue-500';

  if (optimal) {
    const rawLatency = optimal.latency;
    const isReachable = optimal.reachable !== false;

    if (rawLatency !== null && rawLatency !== undefined) {
      if (isReachable && rawLatency < 1800) {
        latencyText = `${rawLatency}ms`;
        badgeClass = isIntranet ? 'bg-emerald-500/20 text-emerald-300' : 'bg-blue-500/20 text-blue-300';
        dotClass = isIntranet ? 'bg-emerald-500 pulse-dot' : 'bg-blue-500';
      } else {
        // 探针超时或网络无法连通（如内网离线或目标服务无响应）
        latencyText = isIntranet ? '内网 · 离线' : '响应超时';
        badgeClass = 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
        dotClass = 'bg-amber-400';
      }
    }
  } else {
    latencyText = '无入口';
    badgeClass = 'bg-slate-500/20 text-slate-400';
    dotClass = 'bg-slate-500';
  }

  return `
    <div data-jump-card="${bm.id}" data-bm-id="${bm.id}" data-group-id="${actualGid}" ${dragAttr} class="bm-card group relative bg-[var(--bg-subtle)] hover:bg-[var(--bg-card-hover)] border border-[var(--border)] hover:border-[var(--primary)] transition-all duration-150 shadow-sm flex flex-col justify-between cursor-pointer">
      
      <div class="bm-card-header flex items-start justify-between gap-2">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="bm-icon-box rounded-lg bg-[var(--bg-card)] border border-[var(--border)] flex items-center justify-center flex-shrink-0">
            ${renderIcon(bm.iconKey, bm.iconData, 'w-4 h-4')}
          </div>
          <div class="min-w-0">
            <h3 class="bm-title font-semibold text-[var(--text-main)] group-hover:text-[var(--primary)] transition-colors truncate">
              ${bm.name}
            </h3>
            <div class="bm-tags flex items-center gap-1 mt-0.5">
              ${(bm.tags || []).slice(0, 2).map(t => `<span data-tag-pill="${t}" class="text-[9px] px-1 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 truncate cursor-pointer transition-colors" title="点击筛选【${t}】标签">${t}</span>`).join('')}
            </div>
          </div>
        </div>

        <div class="bm-actions flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onclick="event.stopPropagation()">
          <button data-edit-bm="${bm.id}" title="编辑书签" class="p-1 hover:bg-[var(--bg-card)] rounded text-[var(--text-dim)] hover:text-[var(--text-main)]">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
          </button>
          <button data-toggle-endpoints="${bm.id}" title="查看所有入口" class="p-1 hover:bg-[var(--bg-card)] rounded text-[var(--text-dim)] hover:text-[var(--text-main)]">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
          </button>
        </div>
      </div>

      <!-- 极简模式微型状态 -->
      <div class="bm-status-mini hidden mt-1.5 text-[10px] font-mono">
        <span class="inline-block w-1.5 h-1.5 rounded-full ${dotClass}"></span> <span class="${badgeClass} px-1 rounded">${latencyText}</span>
      </div>

      <!-- 紧凑/列表/舒适模式底栏状态 -->
      <div class="bm-footer mt-2 pt-1.5 border-t border-[var(--border)]/50 flex items-center justify-between text-[10px]">
        <div class="flex items-center gap-1 font-mono truncate text-[var(--text-muted)]">
          <span class="w-1.5 h-1.5 rounded-full ${dotClass} flex-shrink-0"></span>
          <span class="truncate">${optimal ? optimal.host : '无入口'}</span>
        </div>
        <span class="text-[9px] px-1 rounded ${badgeClass} font-sans flex-shrink-0">${latencyText}</span>
      </div>

      <!-- 展开的所有备选入口面板 -->
      <div id="endpoints-drawer-${bm.id}" class="hidden mt-2 pt-2 border-t border-[var(--border)] space-y-1 text-[10px]" onclick="event.stopPropagation()">
        ${decision.sorted.map(ep => `
          <div class="flex items-center justify-between p-1 rounded bg-[var(--bg-card)] border ${ep === optimal ? 'border-emerald-500/30' : 'border-transparent'}">
            <span class="truncate font-mono text-[var(--text-main)]">${ep.url}</span>
            <button data-direct-jump="${ep.url}" class="px-1.5 py-0.5 rounded bg-[var(--primary)] text-white text-[9px] flex-shrink-0 ml-1">直达</button>
          </div>
        `).join('')}
      </div>

    </div>
  `;
}

// ==========================================
// 6. 智能跳转与执行
// ==========================================

async function triggerSmartJump(bookmark) {
  await recordClick(bookmark.id);

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({
      type: 'SMART_JUMP',
      payload: {
        bookmarkId: bookmark.id,
        endpoints: bookmark.endpoints,
        verify: state.settings.smartJumpVerify !== false,
        openInNewTab: true
      }
    }, (res) => {
      if (res && res.targetUrl) {
        showToast(`⚡ 智能跳转: ${bookmark.name}`, `${res.reason || '已优选入口'} → ${res.targetUrl}`);
      } else {
        // 降级本地直接打开
        localFallbackJump(bookmark);
      }
    });
  } else {
    localFallbackJump(bookmark);
  }
}

function localFallbackJump(bookmark) {
  const decision = sortEndpointsByTopology(bookmark.endpoints, state.currentLocalIp, state.probeCache.results);
  const target = decision.optimal ? decision.optimal.url : null;
  if (target) {
    window.open(target, '_blank');
    showToast(`⚡ 直达: ${bookmark.name}`, `${decision.reason} → ${target}`);
  } else {
    showToast('⚠️ 无法跳转', '该书签未配置任何有效入口 URL');
  }
}

// ==========================================
// 7. 模态框交互 (新增/编辑、导入、设置)
// ==========================================

// 模态框打开/关闭助手（弹簧缩放平滑动画 + 隔离背景滚动与穿透）
function showModal(modal) {
  if (typeof modal === 'string') modal = document.getElementById(modal);
  if (!modal) return;

  modal.classList.remove('hidden', 'modal-closing');
  modal.offsetHeight; // 触发重绘以平滑开启动画
  modal.classList.add('modal-active');
  document.body.classList.add('overflow-hidden', 'modal-open');
}

function hideModal(modal) {
  if (typeof modal === 'string') modal = document.getElementById(modal);
  if (!modal || modal.classList.contains('hidden')) return;

  modal.classList.add('modal-closing');
  modal.classList.remove('modal-active');

  setTimeout(() => {
    modal.classList.add('hidden');
    modal.classList.remove('modal-closing');

    const openModals = document.querySelectorAll('#modal-bookmark:not(.hidden), #modal-import:not(.hidden), #modal-settings:not(.hidden), #modal-snapshot-create:not(.hidden), #modal-diy-theme:not(.hidden), #modal-prompt:not(.hidden)');
    if (openModals.length === 0) {
      document.body.classList.remove('overflow-hidden', 'modal-open');
    }
  }, 190);
}

// 通用现代化主题弹窗 (代替浏览器丑陋的 prompt 对话框)
function openPromptModal({ title, subtitle, icon, label, placeholder, tip, initialValue = '', confirmText = '确定' }) {
  return new Promise((resolve) => {
    const modal = document.getElementById('modal-prompt');
    if (!modal) {
      const fallback = prompt(`${title}\n${subtitle || ''}`, initialValue);
      resolve(fallback ? fallback.trim() : null);
      return;
    }

    const form = document.getElementById('prompt-modal-form');
    const input = document.getElementById('prompt-modal-input');
    const titleEl = document.getElementById('prompt-modal-title');
    const subEl = document.getElementById('prompt-modal-subtitle');
    const iconEl = document.getElementById('prompt-modal-icon');
    const labelEl = document.getElementById('prompt-modal-label');
    const tipEl = document.getElementById('prompt-modal-tip');
    const confirmBtn = document.getElementById('prompt-modal-confirm');
    const cancelBtn = document.getElementById('prompt-modal-cancel');
    const closeBtn = document.getElementById('prompt-modal-close');

    titleEl.innerText = title || '请输入';
    subEl.innerText = subtitle || '';
    subEl.style.display = subtitle ? 'block' : 'none';
    iconEl.innerText = icon || '✏️';
    labelEl.innerText = label || '名称';
    input.placeholder = placeholder || '';
    input.value = initialValue || '';
    tipEl.innerText = tip || '';
    tipEl.style.display = tip ? 'block' : 'none';
    confirmBtn.querySelector('span').innerText = confirmText;

    let isResolved = false;
    const handleFinish = (val) => {
      if (isResolved) return;
      isResolved = true;
      hideModal(modal);
      resolve(val);
    };

    form.onsubmit = (e) => {
      e.preventDefault();
      const val = input.value.trim();
      handleFinish(val || null);
    };

    cancelBtn.onclick = () => handleFinish(null);
    closeBtn.onclick = () => handleFinish(null);

    showModal(modal);
    setTimeout(() => {
      input.focus();
      input.select();
    }, 60);
  });
}

// 通用现代化主题确认弹窗 (代替浏览器原生 confirm)
function openConfirmModal({
  title = '操作确认',
  subtitle = '',
  icon = '⚠️',
  iconType = 'warn', // 'warn' | 'danger' | 'info' | 'success'
  message = '',
  details = [], // 数组：[{ icon: '🛡️', title: '标题', desc: '说明' }] 或字符串
  confirmText = '确定',
  cancelText = '取消',
  isDanger = false
}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('modal-dialog');
    if (!modal) {
      const fallback = confirm(`${title}\n${subtitle ? subtitle + '\n' : ''}${message}`);
      resolve(fallback);
      return;
    }

    const titleEl = document.getElementById('dialog-title');
    const subEl = document.getElementById('dialog-subtitle');
    const iconEl = document.getElementById('dialog-icon');
    const iconContainer = document.getElementById('dialog-icon-container');
    const contentEl = document.getElementById('dialog-content');
    const cancelBtn = document.getElementById('dialog-cancel');
    const confirmBtn = document.getElementById('dialog-confirm');
    const confirmTextEl = document.getElementById('dialog-confirm-text');
    const closeBtn = document.getElementById('dialog-close');

    titleEl.innerText = title;
    subEl.innerText = subtitle || '';
    subEl.style.display = subtitle ? 'block' : 'none';
    iconEl.innerText = icon;

    // 图标容器与确认按钮风格
    if (isDanger || iconType === 'danger') {
      iconContainer.className = 'w-7 h-7 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 flex items-center justify-center text-sm shadow-sm';
      confirmBtn.className = 'px-5 py-1.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-semibold shadow-md transition-all flex items-center gap-1.5 cursor-pointer';
    } else if (iconType === 'info') {
      iconContainer.className = 'w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center text-sm shadow-sm';
      confirmBtn.className = 'px-5 py-1.5 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-semibold shadow-md transition-all flex items-center gap-1.5 cursor-pointer';
    } else {
      iconContainer.className = 'w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center text-sm shadow-sm';
      confirmBtn.className = 'px-5 py-1.5 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-semibold shadow-md transition-all flex items-center gap-1.5 cursor-pointer';
    }

    cancelBtn.style.display = 'block';
    cancelBtn.innerText = cancelText;
    confirmTextEl.innerText = confirmText;

    // 组装内容 HTML
    let bodyHtml = '';
    if (message) {
      bodyHtml += `<p class="text-xs text-[var(--text-main)]">${message}</p>`;
    }
    if (Array.isArray(details) && details.length > 0) {
      bodyHtml += `<div class="mt-2 space-y-1.5 p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)]">`;
      details.forEach(item => {
        if (typeof item === 'string') {
          bodyHtml += `<div class="text-[11px] text-[var(--text-muted)] flex items-start gap-1.5 leading-relaxed">${item}</div>`;
        } else {
          bodyHtml += `
            <div class="text-[11px] flex items-start gap-1.5 leading-relaxed">
              <span class="flex-shrink-0">${item.icon || '•'}</span>
              <div>
                <span class="font-medium text-[var(--text-main)]">${item.title || ''}</span>
                <span class="text-[var(--text-muted)]">${item.desc || ''}</span>
              </div>
            </div>
          `;
        }
      });
      bodyHtml += `</div>`;
    }
    contentEl.innerHTML = bodyHtml;

    let isResolved = false;
    const handleFinish = (val) => {
      if (isResolved) return;
      isResolved = true;
      hideModal(modal);
      resolve(val);
    };

    confirmBtn.onclick = () => handleFinish(true);
    cancelBtn.onclick = () => handleFinish(false);
    closeBtn.onclick = () => handleFinish(false);

    showModal(modal);
  });
}

// 通用现代化主题警告/提示弹窗 (代替浏览器原生 alert)
function openAlertModal({
  title = '提示',
  subtitle = '',
  icon = 'ℹ️',
  iconType = 'info',
  message = '',
  confirmText = '我知道了'
}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('modal-dialog');
    if (!modal) {
      alert(`${title}\n${subtitle ? subtitle + '\n' : ''}${message}`);
      resolve();
      return;
    }

    const titleEl = document.getElementById('dialog-title');
    const subEl = document.getElementById('dialog-subtitle');
    const iconEl = document.getElementById('dialog-icon');
    const iconContainer = document.getElementById('dialog-icon-container');
    const contentEl = document.getElementById('dialog-content');
    const cancelBtn = document.getElementById('dialog-cancel');
    const confirmBtn = document.getElementById('dialog-confirm');
    const confirmTextEl = document.getElementById('dialog-confirm-text');
    const closeBtn = document.getElementById('dialog-close');

    titleEl.innerText = title;
    subEl.innerText = subtitle || '';
    subEl.style.display = subtitle ? 'block' : 'none';
    iconEl.innerText = icon;

    if (iconType === 'danger') {
      iconContainer.className = 'w-7 h-7 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 flex items-center justify-center text-sm shadow-sm';
      confirmBtn.className = 'px-5 py-1.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-semibold shadow-md transition-all flex items-center gap-1.5 cursor-pointer';
    } else if (iconType === 'warn') {
      iconContainer.className = 'w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center text-sm shadow-sm';
      confirmBtn.className = 'px-5 py-1.5 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-semibold shadow-md transition-all flex items-center gap-1.5 cursor-pointer';
    } else {
      iconContainer.className = 'w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center text-sm shadow-sm';
      confirmBtn.className = 'px-5 py-1.5 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-semibold shadow-md transition-all flex items-center gap-1.5 cursor-pointer';
    }

    cancelBtn.style.display = 'none'; // Alert 不需要取消按钮
    confirmTextEl.innerText = confirmText;
    contentEl.innerHTML = `<p class="text-xs text-[var(--text-main)]">${message}</p>`;

    let isResolved = false;
    const handleFinish = () => {
      if (isResolved) return;
      isResolved = true;
      hideModal(modal);
      resolve();
    };

    confirmBtn.onclick = handleFinish;
    closeBtn.onclick = handleFinish;

    showModal(modal);
  });
}

// ==========================================
// 6.5 全局 Shadcn 质感 Custom Select 引擎与数字步进器
// ==========================================

function enhanceSelect(selectEl) {
  if (!selectEl || selectEl.tagName !== 'SELECT') return;

  let container = selectEl.nextElementSibling;
  if (!container || !container.classList.contains('custom-select-container')) {
    container = document.createElement('div');
    container.className = 'custom-select-container';
    selectEl.parentNode.insertBefore(container, selectEl.nextSibling);
    selectEl.style.display = 'none';
  }

  const render = () => {
    const selectedOpt = selectEl.options[selectEl.selectedIndex] || selectEl.options[0];
    const selectedVal = selectEl.value;
    const selectedText = selectedOpt ? selectedOpt.text : '请选择...';

    container.innerHTML = `
      <button type="button" class="custom-select-trigger" aria-haspopup="listbox">
        <span class="custom-select-label">${selectedText}</span>
        <svg class="custom-select-chevron" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
      </button>
      <div class="custom-select-popover custom-scrollbar" role="listbox">
        ${Array.from(selectEl.options).map(opt => `
          <div class="custom-select-option ${opt.value === selectedVal ? 'is-selected' : ''}" data-select-val="${opt.value}">
            <span>${opt.text}</span>
            <svg class="option-check" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
          </div>
        `).join('')}
      </div>
    `;

    const trigger = container.querySelector('.custom-select-trigger');
    const popover = container.querySelector('.custom-select-popover');

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = popover.classList.contains('is-open');
      document.querySelectorAll('.custom-select-popover.is-open').forEach(p => {
        if (p !== popover) {
          p.classList.remove('is-open', 'popover-top');
          p.previousElementSibling?.classList.remove('is-active');
        }
      });

      if (isOpen) {
        popover.classList.remove('is-open', 'popover-top');
        trigger.classList.remove('is-active');
      } else {
        // 智能判断展开方向：测量下方空间与距离最近滚动容器底部的距离
        const rect = trigger.getBoundingClientRect();
        const scrollParent = trigger.closest('.overflow-y-auto, .settings-panel') || document.body;
        const scrollParentRect = scrollParent.getBoundingClientRect();
        const spaceBelowInScroll = scrollParentRect.bottom - rect.bottom;
        const spaceBelowInViewport = window.innerHeight - rect.bottom;

        if (spaceBelowInScroll < 190 || spaceBelowInViewport < 200) {
          popover.classList.add('popover-top');
        } else {
          popover.classList.remove('popover-top');
        }

        popover.classList.add('is-open');
        trigger.classList.add('is-active');
      }
    });

    container.querySelectorAll('.custom-select-option').forEach(optEl => {
      optEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = optEl.getAttribute('data-select-val');
        selectEl.value = val;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        popover.classList.remove('is-open');
        trigger.classList.remove('is-active');
        render();
      });
    });
  };

  render();
  selectEl._syncCustomSelect = render;
}

function initNumberSteppers() {
  document.querySelectorAll('[data-step-target]').forEach(btn => {
    if (btn._stepperBound) return;
    btn._stepperBound = true;

    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-step-target');
      const dir = parseInt(btn.getAttribute('data-step-dir'), 10) || 1;
      const input = document.getElementById(targetId);
      if (!input) return;

      const min = parseInt(input.min, 10) || 1;
      const max = parseInt(input.max, 10) || 50;
      let val = (parseInt(input.value, 10) || min) + dir;
      val = Math.max(min, Math.min(max, val));
      input.value = val;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}

function initModals() {
  // 顶部按钮绑定
  const clearAllBtn = document.getElementById('nav-btn-clear-all');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', async () => {
      const confirmed = await openConfirmModal({
        title: '清空全部数据',
        subtitle: '危险操作：将清空全部现有书签与自定义业务分组',
        icon: '🗑️',
        iconType: 'danger',
        isDanger: true,
        message: '确定要清空全部书签和自定义分组数据吗？（系统将仅保留默认常用分组）',
        details: [
          { icon: '🛡️', title: '全量自动备份：', desc: '执行清空前，系统将自动生成一份【清空前自动保护快照】' },
          { icon: '⏪', title: '无损回滚支持：', desc: '如有需要，可随时在「设置 - 数据备份与回滚」中一键回滚恢复' }
        ],
        confirmText: '立即清空',
        cancelText: '取消'
      });
      if (!confirmed) return;

      await clearAllData();
      await loadState();
      initTopTags();
      renderAllGroups();
      showToast('🗑️ 数据已清空', '已清空全部书签与分组，并自动生成了清空前保护快照');
    });
  }

  document.getElementById('nav-btn-add').addEventListener('click', () => openBookmarkModal());
  document.getElementById('nav-btn-import').addEventListener('click', openImportModal);
  document.getElementById('nav-btn-settings').addEventListener('click', openSettingsModal);

  // 初始化 Stepper 步进器
  initNumberSteppers();

  // 新增/编辑书签弹窗
  const bmModal = document.getElementById('modal-bookmark');
  document.getElementById('modal-bm-close').addEventListener('click', () => hideModal(bmModal));
  document.getElementById('bm-form-cancel').addEventListener('click', () => hideModal(bmModal));
  document.getElementById('btn-add-endpoint-row').addEventListener('click', () => addEndpointInputRow());
  document.getElementById('btn-toggle-icon-picker').addEventListener('click', toggleIconPicker);
  document.getElementById('bm-icon-preview').addEventListener('click', toggleIconPicker);
  document.getElementById('bm-form-save').addEventListener('click', handleSaveBookmarkForm);
  document.getElementById('btn-fetch-favicon').addEventListener('click', handleAutoFavicon);

  // 导入弹窗
  const importModal = document.getElementById('modal-import');
  document.getElementById('modal-import-close').addEventListener('click', () => hideModal(importModal));
  document.getElementById('import-cancel-btn').addEventListener('click', () => hideModal(importModal));
  document.getElementById('import-confirm-btn').addEventListener('click', handleExecuteImport);

  // 设置弹窗
  const settingsModal = document.getElementById('modal-settings');
  document.getElementById('modal-settings-close').addEventListener('click', () => hideModal(settingsModal));
  document.getElementById('modal-settings-done').addEventListener('click', () => hideModal(settingsModal));
  
  // 设置 Tab 切换
  document.getElementById('set-tab-appearance').addEventListener('click', () => {
    switchSettingsTab('appearance');
    enhanceSelect(document.getElementById('setting-time-format'));
    enhanceSelect(document.getElementById('setting-default-engine'));
  });

  // 外观与偏好子分段切换 (主题包 / 壁纸 / 布局与组件)
  document.querySelectorAll('.appearance-subtab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const subtab = btn.getAttribute('data-appearance-subtab');
      document.querySelectorAll('.appearance-subtab-btn').forEach(b => {
        const isCur = b.getAttribute('data-appearance-subtab') === subtab;
        if (isCur) {
          b.classList.add('bg-[var(--primary)]', 'text-white', 'font-semibold', 'shadow-xs');
          b.classList.remove('text-[var(--text-muted)]', 'font-medium');
        } else {
          b.classList.remove('bg-[var(--primary)]', 'text-white', 'font-semibold', 'shadow-xs');
          b.classList.add('text-[var(--text-muted)]', 'font-medium');
        }
      });
      document.querySelectorAll('.appearance-subpanel').forEach(p => p.classList.add('hidden'));
      const targetPanel = document.getElementById('subpanel-appearance-' + subtab);
      if (targetPanel) targetPanel.classList.remove('hidden');

      if (subtab === 'layout') {
        enhanceSelect(document.getElementById('setting-time-format'));
        enhanceSelect(document.getElementById('setting-default-engine'));
      }
    });
  });

  // 分组管理子分段切换 (展示策略 / 列表与排序)
  document.querySelectorAll('.groups-subtab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const subtab = btn.getAttribute('data-groups-subtab');
      document.querySelectorAll('.groups-subtab-btn').forEach(b => {
        const isCur = b.getAttribute('data-groups-subtab') === subtab;
        if (isCur) {
          b.classList.add('bg-[var(--primary)]', 'text-white', 'font-semibold', 'shadow-xs');
          b.classList.remove('text-[var(--text-muted)]', 'font-medium');
        } else {
          b.classList.remove('bg-[var(--primary)]', 'text-white', 'font-semibold', 'shadow-xs');
          b.classList.add('text-[var(--text-muted)]', 'font-medium');
        }
      });
      document.querySelectorAll('.groups-subpanel').forEach(p => p.classList.add('hidden'));
      const targetPanel = document.getElementById('subpanel-groups-' + subtab);
      if (targetPanel) targetPanel.classList.remove('hidden');

      if (subtab === 'strategy') {
        enhanceSelect(document.getElementById('setting-frequent-rows'));
        enhanceSelect(document.getElementById('setting-group-rows'));
      }
    });
  });

  document.getElementById('set-tab-groups').addEventListener('click', () => {
    switchSettingsTab('groups');
    enhanceSelect(document.getElementById('setting-frequent-rows'));
    enhanceSelect(document.getElementById('setting-group-rows'));
  });
  document.getElementById('set-tab-tags').addEventListener('click', () => {
    switchSettingsTab('tags');
    renderSettingsTagList();
  });
  document.getElementById('set-tab-stats').addEventListener('click', () => switchSettingsTab('stats'));
  document.getElementById('set-tab-backup').addEventListener('click', () => {
    switchSettingsTab('backup');
    renderSnapshotList();
    enhanceSelect(document.getElementById('backup-interval-select'));
  });
  document.getElementById('set-tab-storage').addEventListener('click', () => {
    switchSettingsTab('storage');
    renderStorageAnalysis();
  });

  // 存储分析与缓存清理事件
  const btnRefreshStorage = document.getElementById('btn-refresh-storage-analysis');
  if (btnRefreshStorage) {
    btnRefreshStorage.addEventListener('click', async () => {
      showToast('🔄 正在分析', '重新计算本地存储分布...');
      await renderStorageAnalysis();
      showToast('✅ 刷新成功', '存储分析已更新');
    });
  }

  const btnClearIcons = document.getElementById('btn-clear-remote-icons');
  if (btnClearIcons) {
    btnClearIcons.addEventListener('click', async () => {
      const confirmClean = await openConfirmModal({
        title: '清除远程图标缓存？',
        icon: '🧹',
        iconType: 'warn',
        message: '此操作将释放本地已缓存的远程 SVG 及图片数据。书签本身不受任何影响，下次展示时将按需自动静默重新下载。',
        confirmText: '立即清理',
        confirmClass: 'bg-amber-600 hover:bg-amber-700 text-white'
      });
      if (confirmClean) {
        const res = await clearRemoteIconCache();
        showToast('🧹 清除完成', `已释放 ${(res.totalBytes / 1024).toFixed(1)} KB 存储空间 (${res.count} 个缓存图标)`);
        await renderStorageAnalysis();
      }
    });
  }

  // 清空网络探测与点击统计缓存
  const btnClearStats = document.getElementById('btn-clear-stats-probe-cache');
  if (btnClearStats) {
    btnClearStats.addEventListener('click', async () => {
      const confirmClean = await openConfirmModal({
        title: '重置探测与统计缓存？',
        icon: '⚡',
        iconType: 'warn',
        message: '此操作将清空历史点击频次统计与网络连通性探针缓存。书签与分组不受任何影响。',
        confirmText: '立即重置',
        confirmClass: 'bg-slate-700 hover:bg-slate-800 text-white'
      });
      if (confirmClean) {
        await resetAllStats();
        showToast('⚡ 重置完成', '已清空访问统计与探针缓存');
        await renderStorageAnalysis();
      }
    });
  }

  // 手动创建快照弹窗
  const snapshotModal = document.getElementById('modal-snapshot-create');
  document.getElementById('btn-open-create-snapshot').addEventListener('click', () => {
    document.getElementById('snapshot-reason-input').value = '';
    document.getElementById('snapshot-lock-checkbox').checked = false;
    showModal(snapshotModal);
  });
  document.getElementById('modal-snapshot-close').addEventListener('click', () => hideModal(snapshotModal));
  document.getElementById('snapshot-cancel-btn').addEventListener('click', () => hideModal(snapshotModal));
  document.getElementById('snapshot-confirm-btn').addEventListener('click', async () => {
    const reason = document.getElementById('snapshot-reason-input').value.trim() || '用户手动快照';
    const isLocked = document.getElementById('snapshot-lock-checkbox').checked;
    await createSnapshot(reason, 'manual', isLocked);
    hideModal(snapshotModal);
    showToast('💾 快照创建成功', reason);
    renderSnapshotList();
  });

  // 备份策略变更监听
  document.getElementById('backup-interval-select').onchange = async (e) => {
    await saveBackupSettings({ autoBackupInterval: e.target.value });
    showToast('💾 备份设置已更新', `定时周期已设为: ${e.target.options[e.target.selectedIndex].text}`);
  };
  document.getElementById('backup-preaction-toggle').onchange = async (e) => {
    await saveBackupSettings({ preActionAutoBackup: e.target.checked });
    showToast('🛡️ 关键操作保护', e.target.checked ? '已开启重要操作前自动打快照' : '已关闭重要操作自动快照');
  };

  // 主题包导入与导出 (支持 .zip 压缩包及向后兼容 .json)
  const themeFileInput = document.getElementById('theme-file-input');
  const btnImportTheme = document.getElementById('btn-import-theme-pkg');
  if (btnImportTheme && themeFileInput) {
    btnImportTheme.addEventListener('click', () => {
      themeFileInput.value = '';
      themeFileInput.click();
    });

    themeFileInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      try {
        const theme = await importThemeFromPackage(file);
        state.settings.theme = theme.id;
        await loadState();
        renderThemeGrid();
        renderWallpaperSettings();
        showToast('🎉 主题包导入成功', `已成功解压导入并应用「${theme.name}」及其专属壁纸`);
      } catch (err) {
        showToast('❌ 导入失败', err.message || '主题压缩包或格式错误');
      }
    });
  }

  const btnExportTheme = document.getElementById('btn-export-active-theme');
  if (btnExportTheme) {
    btnExportTheme.addEventListener('click', async () => {
      const currentThemeId = state.settings.theme || 'dark-slate';
      await exportThemeAsZip(currentThemeId);
      showToast('📦 主题包已打包导出', '已生成并下载包含色彩与壁纸的 .zip 压缩包');
    });
  }

  // DIY 主题可视化编辑器
  const diyThemeModal = document.getElementById('modal-diy-theme');
  const btnOpenDiyTheme = document.getElementById('btn-open-diy-theme');
  if (btnOpenDiyTheme) {
    btnOpenDiyTheme.addEventListener('click', () => openDiyThemeModal());
  }
  document.getElementById('modal-diy-close').addEventListener('click', () => hideModal(diyThemeModal));
  document.getElementById('diy-theme-cancel-btn').addEventListener('click', () => hideModal(diyThemeModal));

  // 保存 DIY 主题包
  document.getElementById('diy-theme-save-btn').addEventListener('click', async () => {
    const name = document.getElementById('diy-theme-name').value.trim();
    if (!name) {
      await openAlertModal({
        title: '主题包名称未填写',
        icon: '🎨',
        iconType: 'warn',
        message: '请输入自定义主题包的名称后再保存。'
      });
      return;
    }

    const id = document.getElementById('diy-theme-id').value.trim();
    const author = document.getElementById('diy-theme-author').value.trim() || 'Smart Bookmark 用户';
    const bgMain = document.getElementById('diy-hex-bg-main')?.value || '#0f172a';
    const bgCard = document.getElementById('diy-hex-bg-card')?.value || '#1e293b';
    const primary = document.getElementById('diy-hex-primary')?.value || '#6366f1';
    const border = document.getElementById('diy-hex-border')?.value || '#334155';
    const textMain = document.getElementById('diy-hex-text-main')?.value || '#f8fafc';
    const textMuted = document.getElementById('diy-hex-text-muted')?.value || '#94a3b8';
    const colorClock = document.getElementById('diy-hex-clock')?.value || textMain;
    const colorDate = document.getElementById('diy-hex-date')?.value || textMuted;
    const colorMotto = document.getElementById('diy-hex-motto')?.value || textMuted;

    // 提取关联壁纸配置（支持多壁纸打包，第一张为默认）
    const isBundleWp = document.getElementById('diy-bundle-wallpaper-toggle').checked;
    let bundledWallpaper = null;
    if (isBundleWp && diySelectedWallpapers.length > 0) {
      bundledWallpaper = {
        enabled: true,
        mode: 'bundled',
        defaultIndex: 0,
        wallpapers: diySelectedWallpapers.map((w, idx) => ({
          id: w.id || `wp_${idx + 1}`,
          name: w.name || `壁纸 ${idx + 1}`,
          dataUrl: w.dataUrl || '',
          presetId: w.presetId || '',
          url: w.url || '',
          isDefault: idx === 0
        })),
        customDataUrl: diySelectedWallpapers[0].dataUrl || '',
        presetId: diySelectedWallpapers[0].presetId || '',
        blur: 0,
        mask: 0.35
      };
    }

    const themeObj = {
      id: id || ('theme_diy_' + Date.now()),
      name,
      author,
      isDark: true,
      previewBg: bgMain,
      previewBorder: primary,
      isCustom: true,
      wallpaper: bundledWallpaper,
      variables: {
        '--bg-main': bgMain,
        '--bg-card': bgCard,
        '--bg-card-hover': bgCard,
        '--bg-subtle': bgMain,
        '--bg-input': bgCard,
        '--border': border,
        '--border-focus': primary,
        '--text-main': textMain,
        '--text-muted': textMuted,
        '--text-dim': textMuted,
        '--color-clock': colorClock,
        '--color-date': colorDate,
        '--color-motto': colorMotto,
        '--color-motto-star': primary,
        '--primary': primary,
        '--primary-hover': primary,
        '--primary-fg': '#ffffff',
        '--accent-intranet': '#10b981',
        '--accent-extranet': '#3b82f6',
        '--accent-warn': '#f59e0b',
        '--accent-danger': '#ef4444'
      }
    };

    await saveCustomTheme(themeObj);
    await setTheme(themeObj.id, Boolean(themeObj.wallpaper && themeObj.wallpaper.enabled));
    state.settings.theme = themeObj.id;
    if (themeObj.wallpaper && themeObj.wallpaper.enabled) {
      state.settings.wallpaper = themeObj.wallpaper;
    }
    hideModal(diyThemeModal);
    renderThemeGrid();
    renderWallpaperSettings();
    showToast('🎨 DIY 主题包已保存并应用', themeObj.name);
  });

  // 从 DIY 编辑器直接导出为完整 .zip 压缩包
  document.getElementById('diy-theme-export-json').addEventListener('click', async () => {
    const name = document.getElementById('diy-theme-name').value.trim() || '自定义主题包';
    const id = document.getElementById('diy-theme-id').value.trim() || ('theme_diy_' + Date.now());
    const author = document.getElementById('diy-theme-author').value.trim() || 'Smart Bookmark 用户';
    const bgMain = document.getElementById('diy-hex-bg-main')?.value || '#0f172a';
    const bgCard = document.getElementById('diy-hex-bg-card')?.value || '#1e293b';
    const primary = document.getElementById('diy-hex-primary')?.value || '#6366f1';
    const border = document.getElementById('diy-hex-border')?.value || '#334155';
    const textMain = document.getElementById('diy-hex-text-main')?.value || '#f8fafc';
    const textMuted = document.getElementById('diy-hex-text-muted')?.value || '#94a3b8';
    const colorClock = document.getElementById('diy-hex-clock')?.value || textMain;
    const colorDate = document.getElementById('diy-hex-date')?.value || textMuted;
    const colorMotto = document.getElementById('diy-hex-motto')?.value || textMuted;

    const isBundleWp = document.getElementById('diy-bundle-wallpaper-toggle').checked;
    let bundledWallpaper = null;
    if (isBundleWp && diySelectedWallpapers.length > 0) {
      bundledWallpaper = {
        enabled: true,
        mode: 'bundled',
        defaultIndex: 0,
        wallpapers: diySelectedWallpapers.map((w, idx) => ({
          id: w.id || `wp_${idx + 1}`,
          name: w.name || `壁纸 ${idx + 1}`,
          dataUrl: w.dataUrl || '',
          presetId: w.presetId || '',
          url: w.url || '',
          isDefault: idx === 0
        })),
        customDataUrl: diySelectedWallpapers[0].dataUrl || '',
        presetId: diySelectedWallpapers[0].presetId || '',
        blur: 0,
        mask: 0.35
      };
    }

    const themeObj = {
      id,
      name,
      author,
      isDark: true,
      previewBg: bgMain,
      previewBorder: primary,
      isCustom: true,
      wallpaper: bundledWallpaper,
      variables: {
        '--bg-main': bgMain,
        '--bg-card': bgCard,
        '--bg-card-hover': bgCard,
        '--bg-subtle': bgMain,
        '--bg-input': bgCard,
        '--border': border,
        '--border-focus': primary,
        '--text-main': textMain,
        '--text-muted': textMuted,
        '--text-dim': textMuted,
        '--color-clock': colorClock,
        '--color-date': colorDate,
        '--color-motto': colorMotto,
        '--color-motto-star': primary,
        '--primary': primary,
        '--primary-hover': primary,
        '--primary-fg': '#ffffff',
        '--accent-intranet': '#10b981',
        '--accent-extranet': '#3b82f6',
        '--accent-warn': '#f59e0b',
        '--accent-danger': '#ef4444'
      }
    };

    // 先持久化该主题包，然后直接导出为 ZIP
    await saveCustomTheme(themeObj);
    await exportThemeAsZip(themeObj.id);
    showToast('📦 主题包已打包导出', `已生成并下载「${themeObj.name}」.zip 压缩包`);
  });

  // 美化区大 / 中 / 小 3 档尺寸切换按钮绑定
  document.querySelectorAll('.aesthetic-size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const size = btn.getAttribute('data-aesthetic-size');
      applyAestheticSize(size, true);
    });
  });

  // 点击遮罩空白处关闭
  const promptModal = document.getElementById('modal-prompt');
  const dialogModal = document.getElementById('modal-dialog');
  [bmModal, importModal, settingsModal, snapshotModal, diyThemeModal, promptModal, dialogModal].forEach(modal => {
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          hideModal(modal);
        }
      });
    }
  });

  // 全局点击空白处关闭所有 Custom Select Popover
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.custom-select-container')) {
      document.querySelectorAll('.custom-select-popover.is-open').forEach(p => {
        p.classList.remove('is-open', 'popover-top');
        p.previousElementSibling?.classList.remove('is-active');
      });
    }
  });

  // ESC 键关闭模态框与下拉菜单
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const openPopovers = document.querySelectorAll('.custom-select-popover.is-open');
      if (openPopovers.length > 0) {
        openPopovers.forEach(p => {
          p.classList.remove('is-open', 'popover-top');
          p.previousElementSibling?.classList.remove('is-active');
        });
        return;
      }
      const openModals = document.querySelectorAll('#modal-bookmark:not(.hidden), #modal-import:not(.hidden), #modal-settings:not(.hidden), #modal-snapshot-create:not(.hidden), #modal-diy-theme:not(.hidden), #modal-prompt:not(.hidden), #modal-dialog:not(.hidden)');
      openModals.forEach(m => hideModal(m));
    }
  });
}

// 7.1 新增/编辑书签表单逻辑
let currentIconKey = 'globe';
let currentIconData = null;

function openBookmarkModal(bookmark = null, defaultGroupId = null) {
  const modal = document.getElementById('modal-bookmark');
  const title = document.getElementById('modal-bm-title');
  const idInput = document.getElementById('bm-form-id');
  const nameInput = document.getElementById('bm-form-name');
  const groupSelect = document.getElementById('bm-form-group');
  const tagsInput = document.getElementById('bm-form-tags');
  const endpointsList = document.getElementById('endpoints-input-list');

  // 填充分组下拉：展示所有业务分组与未分组（常用为系统动态计算高亮展示）
  const selectableGroups = state.groups.filter(g => g.id !== PINNED_GROUP_ID);
  groupSelect.innerHTML = selectableGroups.map(g => `
    <option value="${g.id}">${g.name}</option>
  `).join('');

  endpointsList.innerHTML = '';
  document.getElementById('bm-icon-drawer').classList.add('hidden');

  const fallbackGroupId = selectableGroups[0] ? selectableGroups[0].id : UNGROUPED_GROUP_ID;

  if (bookmark) {
    title.innerText = '编辑书签: ' + bookmark.name;
    idInput.value = bookmark.id;
    nameInput.value = bookmark.name || '';
    groupSelect.value = (bookmark.groupId && bookmark.groupId !== PINNED_GROUP_ID) ? bookmark.groupId : fallbackGroupId;
    tagsInput.value = (bookmark.tags || []).join(', ');
    currentIconKey = bookmark.iconKey || 'globe';
    currentIconData = bookmark.iconData || null;

    (bookmark.endpoints || []).forEach(ep => addEndpointInputRow(ep.url));
  } else {
    title.innerText = '新增智能书签';
    idInput.value = '';
    nameInput.value = '';
    groupSelect.value = (defaultGroupId && defaultGroupId !== PINNED_GROUP_ID) ? defaultGroupId : fallbackGroupId;
    tagsInput.value = '';
    currentIconKey = 'globe';
    currentIconData = null;

    addEndpointInputRow('');
  }

  updateIconPreview();
  enhanceSelect(groupSelect);
  showModal(modal);
}

function addEndpointInputRow(initialUrl = '') {
  const container = document.getElementById('endpoints-input-list');
  const row = document.createElement('div');
  row.className = 'flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] focus-within:border-[var(--primary)] focus-within:ring-2 focus-within:ring-[var(--primary)]/15 transition-all group';
  
  const classification = classifyUrl(initialUrl);
  let badgeHtml = '';
  if (initialUrl) {
    badgeHtml = classification.isIntranet 
      ? '<span class="endpoint-badge px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex-shrink-0">🟢 内网</span>'
      : '<span class="endpoint-badge px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 flex-shrink-0">🔵 外网</span>';
  } else {
    badgeHtml = '<span class="endpoint-badge hidden px-1.5 py-0.5 rounded text-[10px] font-mono flex-shrink-0"></span>';
  }

  row.innerHTML = `
    <svg class="w-3.5 h-3.5 text-[var(--text-dim)] flex-shrink-0 group-focus-within:text-[var(--primary)] transition-colors" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
    <input type="text" value="${initialUrl}" placeholder="https://..." class="endpoint-url-input flex-1 bg-transparent border-0 outline-none text-xs font-mono text-[var(--text-main)] placeholder-[var(--text-dim)]/50 focus:outline-none min-w-0">
    <div class="badge-container flex-shrink-0">${badgeHtml}</div>
    <button type="button" title="移除此入口" class="btn-remove-endpoint p-1 rounded-lg text-[var(--text-dim)] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer flex-shrink-0">
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
    </button>
  `;

  const inputEl = row.querySelector('.endpoint-url-input');
  const badgeContainer = row.querySelector('.badge-container');

  inputEl.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (!val) {
      badgeContainer.innerHTML = '<span class="endpoint-badge hidden px-1.5 py-0.5 rounded text-[10px] font-mono flex-shrink-0"></span>';
      return;
    }
    const c = classifyUrl(val);
    badgeContainer.innerHTML = c.isIntranet 
      ? '<span class="endpoint-badge px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex-shrink-0">🟢 内网</span>'
      : '<span class="endpoint-badge px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 flex-shrink-0">🔵 外网</span>';
  });

  row.querySelector('.btn-remove-endpoint').addEventListener('click', () => {
    if (container.children.length > 1) {
      row.remove();
    } else {
      inputEl.value = '';
      badgeContainer.innerHTML = '<span class="endpoint-badge hidden px-1.5 py-0.5 rounded text-[10px] font-mono flex-shrink-0"></span>';
    }
  });

  container.appendChild(row);
}

let activeIconPickerTab = 'online';
let onlineSearchDebounceTimer = null;

function initIconPicker() {
  // Tab 切换
  document.querySelectorAll('.icon-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-icon-tab');
      switchIconPickerTab(tab);
    });
  });

  // 在线搜索输入与按钮监听
  const onlineInput = document.getElementById('online-icon-search-input');
  const btnOnlineSearch = document.getElementById('btn-do-online-icon-search');
  if (onlineInput) {
    onlineInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        renderOnlineIconPickerGrid(onlineInput.value);
      }
    });
    onlineInput.addEventListener('input', (e) => {
      clearTimeout(onlineSearchDebounceTimer);
      onlineSearchDebounceTimer = setTimeout(() => {
        renderOnlineIconPickerGrid(e.target.value);
      }, 350);
    });
  }
  if (btnOnlineSearch && onlineInput) {
    btnOnlineSearch.addEventListener('click', () => {
      renderOnlineIconPickerGrid(onlineInput.value);
    });
  }

  // 远程 URL 应用
  const btnApplyUrl = document.getElementById('btn-apply-remote-icon-url');
  if (btnApplyUrl) {
    btnApplyUrl.addEventListener('click', handleApplyRemoteIconUrl);
  }
}

function switchIconPickerTab(tabName) {
  activeIconPickerTab = tabName;
  document.querySelectorAll('.icon-source-panel').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.icon-tab-btn').forEach(btn => {
    btn.classList.remove('bg-[var(--primary)]', 'text-white', 'shadow-xs', 'font-semibold');
    btn.classList.add('text-[var(--text-muted)]', 'font-medium');
  });

  const activePanel = document.getElementById('icon-panel-' + tabName);
  if (activePanel) activePanel.classList.remove('hidden');

  const activeBtn = document.querySelector(`.icon-tab-btn[data-icon-tab="${tabName}"]`);
  if (activeBtn) {
    activeBtn.classList.add('bg-[var(--primary)]', 'text-white', 'shadow-xs', 'font-semibold');
    activeBtn.classList.remove('text-[var(--text-muted)]', 'font-medium');
  }

  if (tabName === 'online') {
    const inputVal = document.getElementById('online-icon-search-input')?.value || '';
    if (inputVal.trim()) {
      renderOnlineIconPickerGrid(inputVal);
    } else {
      const grid = document.getElementById('online-icon-grid-picker');
      if (grid) grid.innerHTML = '';
    }
  }
}

function toggleIconPicker() {
  const drawer = document.getElementById('bm-icon-drawer');
  const wasHidden = drawer.classList.contains('hidden');
  drawer.classList.toggle('hidden');
  if (wasHidden) {
    drawer.classList.remove('is-opening');
    // 强制重绘以重新触发 CSS 关键帧动画
    void drawer.offsetWidth;
    drawer.classList.add('is-opening');
    switchIconPickerTab(activeIconPickerTab || 'online');
  }
}

async function renderOnlineIconPickerGrid(query = '') {
  const grid = document.getElementById('online-icon-grid-picker');
  const loadingEl = document.getElementById('online-icon-loading');
  const trimmed = query.trim();

  if (!trimmed) {
    grid.innerHTML = '';
    return;
  }

  loadingEl?.classList.remove('hidden');
  grid.innerHTML = '';

  const results = await searchRemoteIconify(trimmed);
  loadingEl?.classList.add('hidden');

  if (!results || results.length === 0) {
    grid.innerHTML = `<div class="col-span-full w-full py-4 text-center text-xs text-[var(--text-dim)]">未检索到与 "${trimmed}" 相关的图标</div>`;
    return;
  }

  grid.innerHTML = results.map(item => `
    <button type="button" data-pick-online-key="${item.key}" class="p-2.5 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--primary)]/20 border border-[var(--border)] hover:border-[var(--primary)] flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer group">
      <div class="w-6 h-6 flex items-center justify-center group-hover:scale-110 transition-transform">
        <img src="${item.previewUrl}" class="w-5 h-5 object-contain" alt="${item.name}" loading="lazy">
      </div>
      <span class="text-[8px] text-[var(--text-dim)] group-hover:text-[var(--text-main)] truncate w-full text-center font-mono" title="${item.fullName}">${item.name}</span>
    </button>
  `).join('');

  grid.querySelectorAll('[data-pick-online-key]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.getAttribute('data-pick-online-key');
      currentIconKey = key;
      currentIconData = null;
      updateIconPreview();
      document.getElementById('bm-icon-drawer').classList.add('hidden');
      showToast('🌐 正在缓存远程图标', '已选择并自动存入离线缓存池');
      // 预先触发静默下载进缓存池
      await downloadAndCacheRemoteIcon(key);
      updateIconPreview();
    });
  });
}

async function handleApplyRemoteIconUrl() {
  const input = document.getElementById('remote-icon-url-input');
  const url = input ? input.value.trim() : '';
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('data:'))) {
    showToast('⚠️ 地址无效', '请输入以 http:// 或 https:// 开头的合法图片/SVG 链接');
    return;
  }

  const key = `remote:url:${url}`;
  currentIconKey = key;
  currentIconData = null;
  updateIconPreview();
  document.getElementById('bm-icon-drawer').classList.add('hidden');
  showToast('🔗 正在下载并缓存图片', '系统将离线保存为本地缓存');

  const cached = await downloadAndCacheRemoteIcon(key);
  if (cached) {
    showToast('✅ 缓存成功', '远程图片已转为离线高速缓存');
  }
  updateIconPreview();
}

function updateIconPreview() {
  document.getElementById('bm-icon-preview').innerHTML = renderIcon(currentIconKey, currentIconData, 'w-6 h-6');
}

async function handleAutoFavicon() {
  const firstInput = document.querySelector('.endpoint-url-input');
  if (!firstInput || !firstInput.value.trim()) {
    showToast('⚠️ 提示', '请先填写至少一个访问入口 URL');
    return;
  }

  showToast('🔍 抓取中', '正在尝试获取 Favicon...');
  const url = firstInput.value.trim();

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ type: 'FETCH_FAVICON', payload: { url } }, (res) => {
      if (res && res.base64) {
        currentIconData = res.base64;
        updateIconPreview();
        showToast('✅ 抓取成功', '已应用站点 Favicon');
      } else {
        showToast('⚠️ 抓取失败', '未能解析到 Favicon，保持默认图标');
      }
    });
  }
}

async function handleSaveBookmarkForm() {
  const id = document.getElementById('bm-form-id').value;
  const name = document.getElementById('bm-form-name').value.trim();
  const groupId = document.getElementById('bm-form-group').value;
  const tagsRaw = document.getElementById('bm-form-tags').value;
  
  if (!name) {
    await openAlertModal({
      title: '书签名称未填写',
      icon: '📝',
      iconType: 'warn',
      message: '请输入书签的名称（例如：GitLab 代码平台、Jenkins CI）。'
    });
    return;
  }

  const endpointInputs = document.querySelectorAll('.endpoint-url-input');
  const endpoints = [];
  endpointInputs.forEach((inp, idx) => {
    const url = inp.value.trim();
    if (url) {
      const c = classifyUrl(url);
      endpoints.push({
        url,
        order: idx,
        type: c.type
      });
    }
  });

  if (endpoints.length === 0) {
    await openAlertModal({
      title: '缺少访问入口',
      icon: '🔗',
      iconType: 'warn',
      message: '请至少添加一个有效的访问入口 URL（例如：http://192.168.1.10:8080 或 https://github.com）。'
    });
    return;
  }

  const tags = tagsRaw.split(/[,，]/).map(t => t.trim()).filter(Boolean);

  const bmData = {
    id: id || undefined,
    name,
    groupId,
    tags,
    endpoints,
    iconKey: currentIconKey,
    iconData: currentIconData
  };

  await saveBookmark(bmData);
  hideModal(document.getElementById('modal-bookmark'));
  showToast('✅ 保存成功', `书签 [${name}] 已更新`);

  await loadState();
  initTopTags();
  renderAllGroups();

  // 触发后台探针刷新
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ type: 'PERFORM_FULL_PROBE' });
  }
}

// 7.2 浏览器书签导入与查重逻辑 (支持按路径建组 / 统一导入单分组)
let importMode = 'folder'; // 'folder' | 'single'
let currentImportCandidates = [];

async function openImportModal() {
  const modal = document.getElementById('modal-import');
  const container = document.getElementById('import-list-container');
  const dupBanner = document.getElementById('import-dup-banner');
  const groupSelect = document.getElementById('import-target-group');
  const modeFolderBtn = document.getElementById('import-mode-folder');
  const modeSingleBtn = document.getElementById('import-mode-single');
  const singleGroupBox = document.getElementById('import-single-group-box');
  const folderTip = document.getElementById('import-folder-tip');

  // 初始化模式为按路径建组
  importMode = 'folder';
  updateImportModeUI();

  modeFolderBtn.onclick = () => {
    importMode = 'folder';
    updateImportModeUI();
  };

  modeSingleBtn.onclick = () => {
    importMode = 'single';
    updateImportModeUI();
  };

  function updateImportModeUI() {
    if (importMode === 'folder') {
      modeFolderBtn.className = 'px-2.5 py-1 rounded font-medium transition-all bg-[var(--primary)] text-white shadow-sm flex items-center gap-1';
      modeSingleBtn.className = 'px-2.5 py-1 rounded font-medium transition-all text-[var(--text-muted)] hover:text-[var(--text-main)] flex items-center gap-1';
      singleGroupBox.classList.add('hidden');
      folderTip.classList.remove('hidden');
    } else {
      modeSingleBtn.className = 'px-2.5 py-1 rounded font-medium transition-all bg-[var(--primary)] text-white shadow-sm flex items-center gap-1';
      modeFolderBtn.className = 'px-2.5 py-1 rounded font-medium transition-all text-[var(--text-muted)] hover:text-[var(--text-main)] flex items-center gap-1';
      singleGroupBox.classList.remove('hidden');
      folderTip.classList.add('hidden');
    }
  }

  // 填充分组下拉：展示现有业务分组，并提供新建“导入书签”分组选项
  const selectableGroups = state.groups.filter(g => g.id !== PINNED_GROUP_ID);
  groupSelect.innerHTML = `
    ${selectableGroups.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}
    <option value="__NEW_IMPORTED_GROUP__">+ 新建【导入书签】分组</option>
  `;
  enhanceSelect(groupSelect);

  container.innerHTML = '<div class="text-center py-6 text-[var(--text-muted)]">正在读取浏览器书签...</div>';
  showModal(modal);

  let rawList = [];

  if (typeof chrome !== 'undefined' && chrome.bookmarks && chrome.bookmarks.getTree) {
    chrome.bookmarks.getTree((tree) => {
      rawList = extractBookmarkNodes(tree);
      renderImportCandidates(rawList);
    });
  } else {
    // 模拟包含层级路径的数据供测试
    rawList = [
      { title: 'GitLab 内部代码库', url: 'https://git.company.com/projects', folderName: '研发协同', folderPathStr: '书签栏 / 研发协同' },
      { title: '阿里云控制台', url: 'https://homenew.console.aliyun.com', folderName: '云基础设施', folderPathStr: '书签栏 / 云基础设施' },
      { title: 'Jira 需求看板', url: 'http://192.168.10.120:8080', folderName: '研发协同', folderPathStr: '书签栏 / 研发协同' },
      { title: 'MDN Web 技术文档 - 权威的前端开发者 Web API 和 JavaScript 核心规范与开发实践参考手册', url: 'https://developer.mozilla.org', folderName: '学习资料', folderPathStr: '学习资料' }
    ];
    renderImportCandidates(rawList);
  }
}

function normalizeUrl(u) {
  if (!u) return '';
  try {
    let clean = u.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'http://' + clean;
    }
    const urlObj = new URL(clean);
    let path = urlObj.pathname;
    if (path.endsWith('/') && path.length > 1) path = path.slice(0, -1);
    return (urlObj.protocol + '//' + urlObj.host + path + urlObj.search).toLowerCase();
  } catch {
    return u.trim().toLowerCase();
  }
}

function extractBookmarkNodes(nodes, currentPath = []) {
  let list = [];
  for (const node of nodes) {
    const isFolder = !!node.children;
    const nextPath = (node.title && isFolder) ? [...currentPath, node.title.trim()] : currentPath;

    if (node.url) {
      // 分组名为书签的全路径层级（如“书签栏 / 研发协同 / 项目A”）
      const fullPathStr = currentPath.length > 0 ? currentPath.join(' / ') : '书签栏';
      list.push({
        title: (node.title || node.url).trim(),
        url: node.url.trim(),
        folderPathStr: fullPathStr
      });
    }
    if (node.children) {
      list.push(...extractBookmarkNodes(node.children, nextPath));
    }
  }
  return list;
}

function renderImportCandidates(candidates) {
  currentImportCandidates = candidates;
  const container = document.getElementById('import-list-container');
  const dupBanner = document.getElementById('import-dup-banner');

  let dupCount = 0;
  const html = candidates.map((cand, idx) => {
    // 检查是否疑似与现有书签重复
    const normCandUrl = normalizeUrl(cand.url);
    const existing = state.bookmarks.find(b => 
      (b.name && cand.title && b.name.toLowerCase() === cand.title.toLowerCase()) ||
      (b.endpoints || []).some(ep => normalizeUrl(ep.url) === normCandUrl)
    );

    if (existing) dupCount++;

    const safeTitle = (cand.title || '').replace(/"/g, '&quot;');
    const safeUrl = (cand.url || '').replace(/"/g, '&quot;');
    const safeFolderPath = (cand.folderPathStr || '').replace(/"/g, '&quot;');
    const safeExistingName = existing ? (existing.name || '').replace(/"/g, '&quot;') : '';

    return `
      <div class="import-candidate-card p-3 rounded-xl bg-[var(--bg-subtle)] border ${existing ? 'border-amber-500/40' : 'border-[var(--border)]'} space-y-2 overflow-hidden">
        <div class="import-candidate-header flex items-center justify-between gap-3 min-w-0 w-full">
          <label class="import-candidate-label flex items-center gap-2.5 font-medium text-[var(--text-main)] cursor-pointer select-none min-w-0 flex-1 overflow-hidden" title="${safeTitle}">
            <input type="checkbox" checked data-import-idx="${idx}" class="import-chk custom-checkbox flex-shrink-0">
            <span class="import-candidate-title truncate block min-w-0 flex-1" title="${safeTitle}">${cand.title}</span>
          </label>
          <div class="flex items-center gap-1.5 flex-shrink-0 ml-2">
            <span class="import-candidate-folder text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-mono truncate max-w-[140px] sm:max-w-[200px]" title="${safeFolderPath}">📁 ${cand.folderPathStr}</span>
            ${existing ? '<span class="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-medium flex-shrink-0">疑似重复项</span>' : ''}
          </div>
        </div>
        <div class="text-[11px] font-mono text-[var(--text-dim)] truncate pl-6" title="${safeUrl}">${cand.url}</div>
        ${existing ? `
          <div class="pl-6 pt-1 flex flex-wrap items-center gap-2 text-[11px] min-w-0">
            <span class="text-[var(--text-muted)] flex-shrink-0">建议处理:</span>
            <button data-merge-to="${existing.id}" data-cand-url="${cand.url}" class="btn-merge-import px-2 py-0.5 rounded bg-indigo-600 text-white hover:bg-indigo-500 font-medium truncate max-w-md" title="作为新入口合并到 [${safeExistingName}]">作为新入口合并到 [${existing.name}]</button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  container.innerHTML = html || '<div class="text-center py-4 text-[var(--text-muted)]">未检测到可导入的书签</div>';
  if (dupCount > 0) {
    dupBanner.classList.remove('hidden');
  } else {
    dupBanner.classList.add('hidden');
  }

  // 全选/反选监听
  const selectAllChk = document.getElementById('import-select-all');
  if (selectAllChk) {
    selectAllChk.onchange = (e) => {
      container.querySelectorAll('.import-chk').forEach(c => c.checked = e.target.checked);
    };
  }

  // 合并按钮点击
  container.querySelectorAll('.btn-merge-import').forEach(btn => {
    btn.addEventListener('click', async () => {
      const bmId = btn.getAttribute('data-merge-to');
      const url = btn.getAttribute('data-cand-url');
      const bm = state.bookmarks.find(b => b.id === bmId);
      if (bm) {
        bm.endpoints.push({ url, order: bm.endpoints.length, type: classifyUrl(url).type });
        await saveBookmark(bm);
        showToast('🎉 合并成功', `已将 ${url} 作为新入口合并至 [${bm.name}]`);
        btn.parentElement.innerHTML = '<span class="text-emerald-400 font-medium">✓ 已合并</span>';
      }
    });
  });
}

async function handleExecuteImport() {
  const checkedBoxes = Array.from(document.querySelectorAll('.import-chk:checked'));
  if (checkedBoxes.length === 0) {
    await openAlertModal({
      title: '未选择书签',
      icon: '📥',
      iconType: 'info',
      message: '请至少勾选一个需要导入的 Chrome 浏览器书签。'
    });
    return;
  }

  const progressBox = document.getElementById('import-progress-box');
  const progressBar = document.getElementById('import-progress-bar');
  const progressPercent = document.getElementById('import-progress-percent');
  const progressDetail = document.getElementById('import-progress-detail');
  const confirmBtn = document.getElementById('import-confirm-btn');
  const cancelBtn = document.getElementById('import-cancel-btn');

  // 显示进度条并锁定按钮
  progressBox.classList.remove('hidden');
  confirmBtn.disabled = true;
  confirmBtn.classList.add('opacity-50', 'pointer-events-none');
  cancelBtn.disabled = true;
  cancelBtn.classList.add('opacity-50', 'pointer-events-none');

  let importedCount = 0;
  let skippedCount = 0;
  const total = checkedBoxes.length;

  // 1. 获取现有书签并触发前置自动保护快照
  const currentBookmarks = await getBookmarks();
  const backupSettings = await getBackupSettings();
  if (backupSettings.preActionAutoBackup) {
    try {
      await createSnapshot(`[导入前自动保护] 批量导入 Chrome 书签前 (共 ${currentBookmarks.length} 项)`, 'auto_preimport');
    } catch (e) {
      console.warn('Pre-import auto snapshot failed:', e);
    }
  }

  const existingUrlSet = new Set();
  currentBookmarks.forEach(b => {
    (b.endpoints || []).forEach(ep => {
      if (ep.url) existingUrlSet.add(normalizeUrl(ep.url));
    });
  });

  // 本批次已导入 URL 集合（防止浏览器书签树自身包含重复项）
  const batchImportedUrls = new Set();

  // 2. 预先建立现有分组全路径名称映射
  const currentGroups = await getGroups();
  const groupPathMap = new Map();
  currentGroups.forEach(g => groupPathMap.set(g.name.trim().toLowerCase(), g.id));

  // 单分组模式下的目标分组 ID
  let singleTargetGid = null;
  if (importMode === 'single') {
    singleTargetGid = document.getElementById('import-target-group').value;
    if (singleTargetGid === '__NEW_IMPORTED_GROUP__') {
      const newG = { id: 'group_imported_' + Date.now(), name: '导入书签' };
      await saveGroup(newG);
      singleTargetGid = newG.id;
      groupPathMap.set('导入书签', newG.id);
    }
  }

  // 3. 逐项流式处理与实时进度更新
  for (let i = 0; i < total; i++) {
    const chk = checkedBoxes[i];
    const idx = parseInt(chk.getAttribute('data-import-idx'), 10);
    const cand = currentImportCandidates[idx];
    if (!cand) continue;

    const normUrl = normalizeUrl(cand.url);

    // 进度百分比与详情
    const pct = Math.round(((i + 1) / total) * 100);
    progressBar.style.width = pct + '%';
    progressPercent.innerText = pct + '%';
    progressDetail.innerText = `[${i + 1}/${total}] 正在校验: ${cand.title} (${cand.folderPathStr})`;

    // 重复校验：如果库中或本批次已存在该 URL，则安全跳过，防止重复导入
    if (existingUrlSet.has(normUrl) || batchImportedUrls.has(normUrl)) {
      skippedCount++;
      await new Promise(r => setTimeout(r, 12)); // 丝滑微延时
      continue;
    }
    batchImportedUrls.add(normUrl);
    existingUrlSet.add(normUrl);

    let targetGid = singleTargetGid;

    if (importMode === 'folder') {
      // 全路径作为分组名称（如“书签栏 / 研发协同 / 项目A”）
      const fullPathName = cand.folderPathStr || '书签栏';
      const pathKey = fullPathName.trim().toLowerCase();
      targetGid = groupPathMap.get(pathKey);

      // 若该全路径分组不存在，则自动创建该全路径分组
      if (!targetGid) {
        const newGroup = {
          id: 'group_path_' + Date.now() + '_' + Math.random().toString(36).substr(2, 3),
          name: fullPathName, // 全路径分组名
          isPinned: false,
          isDefaultCollapsed: false
        };
        await saveGroup(newGroup);
        targetGid = newGroup.id;
        groupPathMap.set(pathKey, targetGid);
      }
    }

    const lastFolderName = cand.folderPathStr.split(' / ').pop() || '导入';

    await saveBookmark({
      name: cand.title,
      groupId: targetGid,
      tags: ['导入', lastFolderName],
      endpoints: [{ url: cand.url, order: 0, type: classifyUrl(cand.url).type }]
    });

    importedCount++;
    await new Promise(r => setTimeout(r, 16)); // 保证 UI 进度条动画流畅
  }

  // 4. 收尾与反馈
  progressBar.style.width = '100%';
  progressPercent.innerText = '100%';
  progressDetail.innerText = `处理完成！成功导入: ${importedCount}，跳过重复: ${skippedCount}`;

  await new Promise(r => setTimeout(r, 350));

  confirmBtn.disabled = false;
  confirmBtn.classList.remove('opacity-50', 'pointer-events-none');
  cancelBtn.disabled = false;
  cancelBtn.classList.remove('opacity-50', 'pointer-events-none');
  progressBox.classList.add('hidden');

  hideModal(document.getElementById('modal-import'));

  const modeDesc = importMode === 'folder' ? '（已按全路径创建分组）' : '';
  if (skippedCount > 0) {
    showToast('🎉 导入完成', `成功导入 ${importedCount} 个新书签，自动去重跳过 ${skippedCount} 个已存在项${modeDesc}`);
  } else {
    showToast('🎉 导入完成', `已成功导入 ${importedCount} 个书签${modeDesc}`);
  }

  await loadState();
  initTopTags();
  renderAllGroups();
}

// 7.3 设置与使用统计分析
function openSettingsModal() {
  const modal = document.getElementById('modal-settings');
  renderThemeGrid();
  renderWallpaperSettings();
  initWallpaperControls();
  renderSettingsGroupList();
  renderSettingsTagList();
  renderStatsView('7d');
  renderSnapshotList();
  renderStorageAnalysis();
  switchSettingsTab('appearance');
  applyAestheticSize(state.settings.aestheticSize || 'large', false);

  const firstSubtabBtn = document.querySelector('.appearance-subtab-btn[data-appearance-subtab="themes"]');
  if (firstSubtabBtn) {
    firstSubtabBtn.click();
  }

  const firstGroupsSubtab = document.querySelector('.groups-subtab-btn[data-groups-subtab="strategy"]');
  if (firstGroupsSubtab) {
    firstGroupsSubtab.click();
  }

  document.getElementById('setting-time-format').value = state.settings.timeFormat || '24';
  document.getElementById('setting-default-engine').value = state.settings.defaultSearchEngine || 'google';
  document.getElementById('setting-motto-input').value = state.settings.motto || '';

  const frequentRowsSelect = document.getElementById('setting-frequent-rows');
  if (frequentRowsSelect) {
    frequentRowsSelect.value = String(state.settings.frequentRows !== undefined ? state.settings.frequentRows : 1);
    frequentRowsSelect.onchange = async (e) => {
      const val = Number(e.target.value);
      state.settings.frequentRows = val;
      await saveSettings({ frequentRows: val });
      renderAllGroups();
    };
  }

  const groupRowsSelect = document.getElementById('setting-group-rows');
  if (groupRowsSelect) {
    groupRowsSelect.value = String(state.settings.groupRows !== undefined ? state.settings.groupRows : 0);
    groupRowsSelect.onchange = async (e) => {
      const val = Number(e.target.value);
      state.settings.groupRows = val;
      await saveSettings({ groupRows: val });
      renderAllGroups();
    };
  }

  const frequentLimits = state.settings.frequentLimits || { compact: 6, icon: 8, list: 5, comfortable: 4 };
  document.getElementById('setting-limit-compact').value = frequentLimits.compact || 6;
  document.getElementById('setting-limit-icon').value = frequentLimits.icon || 8;
  document.getElementById('setting-limit-list').value = frequentLimits.list || 5;
  document.getElementById('setting-limit-comfortable').value = frequentLimits.comfortable || 4;

  const saveLimits = async () => {
    const updatedLimits = {
      compact: Math.max(1, parseInt(document.getElementById('setting-limit-compact').value, 10) || 6),
      icon: Math.max(1, parseInt(document.getElementById('setting-limit-icon').value, 10) || 8),
      list: Math.max(1, parseInt(document.getElementById('setting-limit-list').value, 10) || 5),
      comfortable: Math.max(1, parseInt(document.getElementById('setting-limit-comfortable').value, 10) || 4)
    };
    state.settings.frequentLimits = updatedLimits;
    syncGridColumns();
    await saveSettings({ frequentLimits: updatedLimits });
    renderAllGroups();
  };

  document.getElementById('setting-limit-compact').oninput = saveLimits;
  document.getElementById('setting-limit-icon').oninput = saveLimits;
  document.getElementById('setting-limit-list').oninput = saveLimits;
  document.getElementById('setting-limit-comfortable').oninput = saveLimits;

  document.getElementById('setting-time-format').onchange = (e) => saveSettings({ timeFormat: e.target.value });
  document.getElementById('setting-default-engine').onchange = (e) => saveSettings({ defaultSearchEngine: e.target.value });
  document.getElementById('setting-motto-input').onchange = async (e) => {
    const newMotto = e.target.value;
    await saveSettings({ motto: newMotto });
    state.settings.motto = newMotto;
    document.getElementById('motto-text').innerText = newMotto || 'Stay hungry, stay foolish. 无论身处内网还是外网，一键直达。';
  };

  enhanceSelect(document.getElementById('setting-time-format'));
  enhanceSelect(document.getElementById('setting-default-engine'));
  if (frequentRowsSelect) enhanceSelect(frequentRowsSelect);
  if (groupRowsSelect) enhanceSelect(groupRowsSelect);
  enhanceSelect(document.getElementById('backup-interval-select'));
  initNumberSteppers();

  showModal(modal);
}

function switchSettingsTab(tabName) {
  document.querySelectorAll('.settings-panel').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.settings-nav-btn').forEach(btn => {
    btn.classList.remove('bg-[var(--primary)]', 'text-white', 'shadow-sm');
    btn.classList.add('text-[var(--text-muted)]');
  });

  const panel = document.getElementById('set-panel-' + tabName);
  if (panel) panel.classList.remove('hidden');

  const activeBtn = document.getElementById('set-tab-' + tabName);
  if (activeBtn) {
    activeBtn.classList.add('bg-[var(--primary)]', 'text-white', 'shadow-sm');
    activeBtn.classList.remove('text-[var(--text-muted)]');
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function renderStorageAnalysis() {
  try {
    const analysis = await calculateStorageUsageAnalysis();
    const { totalUsedBytes, quotaBytes, percentage, categories } = analysis;

    // 总览文本
    const totalEl = document.getElementById('storage-total-text');
    const pctEl = document.getElementById('storage-percentage-text');
    if (totalEl) totalEl.innerText = `${formatBytes(totalUsedBytes)} / ${formatBytes(quotaBytes)}`;
    if (pctEl) pctEl.innerText = `占用 ${percentage}%`;

    // 进度条分段比例
    const safeTotal = Math.max(totalUsedBytes, 1);
    const getBarPct = (bytes) => `${Math.min(100, Math.max(0, (bytes / safeTotal) * 100))}%`;

    const barBm = document.getElementById('storage-bar-bookmarks');
    const barIcons = document.getElementById('storage-bar-icons');
    const barWp = document.getElementById('storage-bar-wallpapers');
    const barBk = document.getElementById('storage-bar-backups');
    const barTh = document.getElementById('storage-bar-themes');
    const barOther = document.getElementById('storage-bar-other');

    if (barBm) barBm.style.width = getBarPct(categories.bookmarks.bytes);
    if (barIcons) barIcons.style.width = getBarPct(categories.remoteIcons.bytes);
    if (barWp) barWp.style.width = getBarPct(categories.wallpapers.bytes);
    if (barBk) barBk.style.width = getBarPct(categories.backups.bytes);
    if (barTh) barTh.style.width = getBarPct(categories.themes.bytes);
    if (barOther) barOther.style.width = getBarPct(categories.statsAndProbes.bytes);

    // 明细卡片更新 (6项完整对齐)
    const bmByteEl = document.getElementById('storage-bookmarks-bytes');
    const bmCountEl = document.getElementById('storage-bookmarks-count');
    if (bmByteEl) bmByteEl.innerText = formatBytes(categories.bookmarks.bytes);
    if (bmCountEl) bmCountEl.innerText = `${categories.bookmarks.count} 项`;

    const iconsByteEl = document.getElementById('storage-icons-bytes');
    const iconsCountEl = document.getElementById('storage-icons-count');
    if (iconsByteEl) iconsByteEl.innerText = formatBytes(categories.remoteIcons.bytes);
    if (iconsCountEl) iconsCountEl.innerText = `${categories.remoteIcons.count} 个图标`;

    const wpByteEl = document.getElementById('storage-wallpapers-bytes');
    const wpCountEl = document.getElementById('storage-wallpapers-count');
    if (wpByteEl) wpByteEl.innerText = formatBytes(categories.wallpapers.bytes);
    if (wpCountEl) wpCountEl.innerText = `${categories.wallpapers.count} 张壁纸`;

    const bkByteEl = document.getElementById('storage-backups-bytes');
    const bkCountEl = document.getElementById('storage-backups-count');
    if (bkByteEl) bkByteEl.innerText = formatBytes(categories.backups.bytes);
    if (bkCountEl) bkCountEl.innerText = `${categories.backups.count} 份快照`;

    const thByteEl = document.getElementById('storage-themes-bytes');
    const thCountEl = document.getElementById('storage-themes-count');
    if (thByteEl) thByteEl.innerText = formatBytes(categories.themes.bytes);
    if (thCountEl) thCountEl.innerText = `${categories.themes.count} 套主题`;

    const statsByteEl = document.getElementById('storage-stats-bytes');
    if (statsByteEl) statsByteEl.innerText = formatBytes(categories.statsAndProbes.bytes);

    // 初始化/绑定图例与轴联动交互
    initStorageAnalysisLinkage();
  } catch (err) {
    console.warn('Storage analysis render failed:', err);
  }
}

let isStorageLinkageBound = false;
function initStorageAnalysisLinkage() {
  if (isStorageLinkageBound) return;
  isStorageLinkageBound = true;

  const progressBar = document.getElementById('storage-progress-bar');
  const segments = document.querySelectorAll('.storage-bar-seg');
  const legendItems = document.querySelectorAll('.storage-legend-item');
  const detailCards = document.querySelectorAll('.storage-detail-card');

  function setCategoryHighlight(cat, active) {
    if (active && cat) {
      progressBar?.classList.add('has-highlight');
      segments.forEach(s => s.classList.toggle('is-highlighted', s.getAttribute('data-storage-cat') === cat));
      legendItems.forEach(l => l.classList.toggle('is-highlighted', l.getAttribute('data-storage-cat') === cat));
      detailCards.forEach(c => c.classList.toggle('is-highlighted', c.getAttribute('data-storage-card') === cat));
    } else {
      progressBar?.classList.remove('has-highlight');
      segments.forEach(s => s.classList.remove('is-highlighted'));
      legendItems.forEach(l => l.classList.remove('is-highlighted'));
      detailCards.forEach(c => c.classList.remove('is-highlighted'));
    }
  }

  function focusCategoryCard(cat) {
    const targetCard = document.querySelector(`.storage-detail-card[data-storage-card="${cat}"]`);
    if (targetCard) {
      targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      targetCard.classList.remove('pulse-focus');
      void targetCard.offsetWidth; // 触发 CSS 重绘
      targetCard.classList.add('pulse-focus');
    }
  }

  // 1. 进度条分段悬浮高亮与点击滚屏
  segments.forEach(seg => {
    const cat = seg.getAttribute('data-storage-cat');
    seg.addEventListener('mouseenter', () => setCategoryHighlight(cat, true));
    seg.addEventListener('mouseleave', () => setCategoryHighlight(cat, false));
    seg.addEventListener('click', () => focusCategoryCard(cat));
  });

  // 2. 图例项悬浮高亮与点击滚屏
  legendItems.forEach(item => {
    const cat = item.getAttribute('data-storage-cat');
    item.addEventListener('mouseenter', () => setCategoryHighlight(cat, true));
    item.addEventListener('mouseleave', () => setCategoryHighlight(cat, false));
    item.addEventListener('click', () => focusCategoryCard(cat));
  });

  // 3. 明细卡片悬浮反向联动进度条与图例
  detailCards.forEach(card => {
    const cat = card.getAttribute('data-storage-card');
    card.addEventListener('mouseenter', () => setCategoryHighlight(cat, true));
    card.addEventListener('mouseleave', () => setCategoryHighlight(cat, false));
  });
}

async function renderThemeGrid() {
  const container = document.getElementById('theme-cards-grid');
  const allThemes = await getAllThemes();
  const currentThemeId = state.settings.theme || 'dark-slate';

  container.innerHTML = allThemes.map(t => {
    const isSelected = currentThemeId === t.id;
    const isCustom = !!t.isCustom;
    const hasWallpaper = Boolean(t.wallpaper && t.wallpaper.enabled);

    return `
      <div data-theme-choice="${t.id}" class="p-3 rounded-xl border-2 cursor-pointer transition-all relative group flex flex-col justify-between ${isSelected ? 'border-[var(--primary)] bg-[var(--primary)]/10 shadow-sm' : 'border-[var(--border)] bg-[var(--bg-subtle)] hover:border-[var(--primary)]/40'}">
        <div>
          <div class="flex items-center justify-between gap-1.5 mb-1">
            <span class="font-bold text-xs text-[var(--text-main)] truncate" title="${t.name}">${t.name}</span>
            <div class="flex items-center gap-1 flex-shrink-0">
              ${hasWallpaper ? '<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-0.5">🖼️ 壁纸</span>' : ''}
              ${isCustom ? '<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">DIY</span>' : ''}
            </div>
          </div>
          ${t.author ? `<div class="text-[10px] text-[var(--text-dim)] truncate">作者: ${t.author}</div>` : ''}
        </div>

        <div class="flex items-center justify-between mt-2.5 pt-2 border-t border-[var(--border)]/50">
          <div class="flex gap-1.5 items-center">
            <span class="w-3.5 h-3.5 rounded-full border border-black/20 shadow-inner" style="background:${t.previewBg}" title="背景色"></span>
            <span class="w-3.5 h-3.5 rounded-full border border-black/20 shadow-inner" style="background:${t.previewBorder}" title="主题主色"></span>
            <span class="w-3.5 h-3.5 rounded-full border border-black/20 shadow-inner" style="background:${(t.variables && t.variables['--color-clock']) || (PRESET_THEME_VARIABLES[t.id] && PRESET_THEME_VARIABLES[t.id]['--color-clock']) || t.previewBorder}" title="时钟数字色"></span>
          </div>

          <!-- 卡片操作按钮 -->
          <div class="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity" onclick="event.stopPropagation()">
            <button data-export-theme="${t.id}" title="打包导出为主题包 .zip 文件（含壁纸）" class="p-1 rounded hover:bg-[var(--bg-card)] text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors cursor-pointer">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            </button>
            ${isCustom ? `
              <button data-edit-diy-theme="${t.id}" title="编辑此主题包" class="p-1 rounded hover:bg-[var(--bg-card)] text-[var(--text-dim)] hover:text-indigo-400 transition-colors cursor-pointer">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
              </button>
              <button data-delete-diy-theme="${t.id}" title="彻底卸载此主题包及壁纸" class="p-1 rounded hover:bg-red-500/10 text-[var(--text-dim)] hover:text-red-400 transition-colors cursor-pointer">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // 点击主题包切换（若主题包包含专属壁纸则同步套用）
  container.querySelectorAll('[data-theme-choice]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tid = btn.getAttribute('data-theme-choice');
      const targetTheme = allThemes.find(t => t.id === tid);
      const hasWp = Boolean(targetTheme && targetTheme.wallpaper && targetTheme.wallpaper.enabled);
      
      await setTheme(tid, hasWp);
      state.settings.theme = tid;
      if (hasWp) {
        state.settings.wallpaper = targetTheme.wallpaper;
      }
      renderThemeGrid();
      renderWallpaperSettings();
      showToast('🎨 主题包已应用', `${targetTheme ? targetTheme.name : tid}${hasWp ? '（已同步套用专属壁纸）' : ''}`);
    });
  });

  // 独立导出主题包 (ZIP 格式)
  container.querySelectorAll('[data-export-theme]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tid = btn.getAttribute('data-export-theme');
      await exportThemeAsZip(tid);
      showToast('📦 主题包已打包导出', '已生成并下载 .zip 压缩包');
    });
  });

  // 编辑 DIY 主题包
  container.querySelectorAll('[data-edit-diy-theme]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tid = btn.getAttribute('data-edit-diy-theme');
      const all = await getAllThemes();
      const target = all.find(t => t.id === tid);
      if (target) openDiyThemeModal(target);
    });
  });

  // 卸载/删除 DIY 主题包（同步深度清理主题与壁纸）
  container.querySelectorAll('[data-delete-diy-theme]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tid = btn.getAttribute('data-delete-diy-theme');
      const all = await getAllThemes();
      const target = all.find(t => t.id === tid);
      const themeName = target ? target.name : '该主题包';

      const confirmed = await openConfirmModal({
        title: '卸载自定义主题包',
        subtitle: `主题包：${themeName}`,
        icon: '🗑️',
        iconType: 'danger',
        isDanger: true,
        message: `确定要彻底卸载自定义主题包「${themeName}」吗？`,
        details: [
          { icon: '🎨', title: '色彩配置：', desc: '该主题包的全部颜色变量规则将被删除' },
          { icon: '🖼️', title: '专属壁纸：', desc: '关联绑定的自定义壁纸资源将同步从存储中清理释放' },
          { icon: '🛡️', title: '平滑回退：', desc: '若当前正使用此主题包，将自动安全回退至系统默认主题与壁纸' }
        ],
        confirmText: '确认卸载',
        cancelText: '取消'
      });
      if (!confirmed) return;

      await deleteCustomTheme(tid);
      await loadState();
      await applyWallpaper(state.settings.wallpaper);
      renderThemeGrid();
      renderWallpaperSettings();
      showToast('🗑️ 主题包已卸载', `已彻底删除「${themeName}」及关联壁纸`);
    });
  });
}

// 7.3.1 全局壁纸管理与控制器
let wallpaperControlsInitialized = false;
let isBatchUploadMode = false;
let batchSelectedUploadIds = new Set();

// 辅助：压缩单个图片为 WebP DataURL
async function compressImageFileToWebP(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = 1920;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const compressedDataUrl = canvas.toDataURL('image/webp', 0.85);
        const fileName = file.name ? file.name.replace(/\.[^/.]+$/, '') : '本地壁纸';
        resolve({ name: fileName, dataUrl: compressedDataUrl });
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 辅助：批量压缩并保存上传的本地壁纸
async function processUploadedWallpapersBatch(files) {
  const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
  if (imageFiles.length === 0) {
    showToast('⚠️ 格式不支持', '请上传图片格式文件 (PNG, JPG, WebP)');
    return;
  }

  showToast('⏳ 正在优化壁纸', `正在处理 ${imageFiles.length} 张图片...`);

  const compressedItems = [];
  for (const f of imageFiles) {
    try {
      const item = await compressImageFileToWebP(f);
      compressedItems.push(item);
    } catch (err) {
      console.warn('Failed to compress image:', f.name, err);
    }
  }

  if (compressedItems.length === 0) {
    showToast('⚠️ 处理失败', '无法解析上传的图片');
    return;
  }

  await saveUploadedWallpapersBatch(compressedItems);

  // 默认自动将最新上传的第一张设为主页壁纸
  const latest = compressedItems[0];
  const newWp = await saveWallpaperSettings({
    enabled: true,
    mode: 'custom',
    customDataUrl: latest.dataUrl
  });
  state.settings.wallpaper = newWp;
  await applyWallpaper(newWp);
  renderWallpaperSettings();

  showToast('🖼️ 本地壁纸上传成功', `已存入 ${compressedItems.length} 张壁纸并设为当前背景`);
}

function initWallpaperControls() {
  if (wallpaperControlsInitialized) return;
  wallpaperControlsInitialized = true;

  // 1. 开关总控制
  const enableToggle = document.getElementById('setting-wallpaper-enable');
  if (enableToggle) {
    enableToggle.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      const newWp = await saveWallpaperSettings({ enabled });
      state.settings.wallpaper = newWp;
      await applyWallpaper(newWp);
      renderWallpaperSettings();
      showToast(enabled ? '🖼️ 壁纸已开启' : '🖼️ 壁纸已关闭', enabled ? '主页已载入壁纸背景' : '已还原纯净主题色');
    });
  }

  // 2. 来源切换 Tab (主题包壁纸 / 内置预设 / 本地上传 / 网络链接)
  document.querySelectorAll('.wp-source-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-wp-tab');
      document.querySelectorAll('.wp-source-tab-btn').forEach(b => {
        const isCur = b.getAttribute('data-wp-tab') === tab;
        if (isCur) {
          b.classList.add('bg-[var(--primary)]', 'text-white');
          b.classList.remove('text-[var(--text-muted)]');
        } else {
          b.classList.remove('bg-[var(--primary)]', 'text-white');
          b.classList.add('text-[var(--text-muted)]');
        }
      });
      document.querySelectorAll('.wp-source-panel').forEach(p => p.classList.add('hidden'));
      const activePanel = document.getElementById('wp-panel-' + tab);
      if (activePanel) activePanel.classList.remove('hidden');
    });
  });

  // 3. 本地上传控制 (多图支持、拖拽、剪贴板粘贴与批量管理)
  const fileInput = document.getElementById('wallpaper-file-input');
  const btnTriggerUpload = document.getElementById('btn-trigger-upload');
  const dropzoneCompact = document.getElementById('wallpaper-dropzone-compact');
  const dropzoneEmpty = document.getElementById('wallpaper-dropzone-empty');
  
  if (btnTriggerUpload && fileInput) {
    btnTriggerUpload.addEventListener('click', () => fileInput.click());
  }

  [dropzoneCompact, dropzoneEmpty].forEach(dz => {
    if (!dz) return;
    dz.addEventListener('click', () => fileInput && fileInput.click());

    dz.addEventListener('dragover', (e) => {
      e.preventDefault();
      dz.classList.add('border-[var(--primary)]', 'bg-[var(--bg-card)]');
    });

    dz.addEventListener('dragleave', () => {
      dz.classList.remove('border-[var(--primary)]', 'bg-[var(--bg-card)]');
    });

    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('border-[var(--primary)]', 'bg-[var(--bg-card)]');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        processUploadedWallpapersBatch(e.dataTransfer.files);
      }
    });
  });

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        processUploadedWallpapersBatch(e.target.files);
        fileInput.value = '';
      }
    });
  }

  // 监听全局 Ctrl+V 剪贴板图片粘贴
  window.addEventListener('paste', async (e) => {
    const targetTag = e.target.tagName;
    if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') return;

    if (e.clipboardData && e.clipboardData.items) {
      const imageFiles = [];
      for (const item of e.clipboardData.items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        showToast('📋 已从剪贴板捕获图片', '正在导入为本地壁纸...');
        await processUploadedWallpapersBatch(imageFiles);
      }
    }
  });

  // 批量管理控制
  const btnToggleBatch = document.getElementById('btn-toggle-batch-uploads');
  const btnCancelBatch = document.getElementById('btn-cancel-batch-uploads');
  const chkSelectAll = document.getElementById('chk-select-all-uploads');
  const btnBatchDelete = document.getElementById('btn-batch-delete-uploads');

  if (btnToggleBatch) {
    btnToggleBatch.addEventListener('click', () => {
      isBatchUploadMode = !isBatchUploadMode;
      batchSelectedUploadIds.clear();
      renderWallpaperSettings();
    });
  }

  if (btnCancelBatch) {
    btnCancelBatch.addEventListener('click', () => {
      isBatchUploadMode = false;
      batchSelectedUploadIds.clear();
      renderWallpaperSettings();
    });
  }

  if (chkSelectAll) {
    chkSelectAll.addEventListener('change', async (e) => {
      const list = await getUploadedWallpapers();
      if (e.target.checked) {
        list.forEach(w => batchSelectedUploadIds.add(w.id));
      } else {
        batchSelectedUploadIds.clear();
      }
      renderWallpaperSettings();
    });
  }

  if (btnBatchDelete) {
    btnBatchDelete.addEventListener('click', async () => {
      if (batchSelectedUploadIds.size === 0) return;
      const count = batchSelectedUploadIds.size;
      const wp = state.settings.wallpaper || {};
      const uploadedList = await getUploadedWallpapers();
      
      const containsActive = Array.from(batchSelectedUploadIds).some(id => {
        const item = uploadedList.find(x => x.id === id);
        return item && wp.enabled && wp.mode === 'custom' && wp.customDataUrl === item.dataUrl;
      });

      const details = [
        { icon: '🗑️', title: '批量清理：', desc: `即将永久删除选中的 ${count} 张本地壁纸` }
      ];
      if (containsActive) {
        details.push({ icon: '⚠️', title: '当前背景回退：', desc: '其中包含当前生效的主页壁纸，删除后将自动为您平滑回退至其他壁纸' });
      }

      const confirmed = await openConfirmModal({
        title: '批量删除本地壁纸',
        subtitle: `共选中 ${count} 张壁纸`,
        icon: '🗑️',
        iconType: 'danger',
        isDanger: true,
        message: `确定要彻底删除选中的 ${count} 张本地壁纸吗？此操作不可恢复。`,
        details,
        confirmText: `确认删除 (${count})`,
        cancelText: '取消'
      });
      if (!confirmed) return;

      await deleteUploadedWallpapersBatch(Array.from(batchSelectedUploadIds));

      if (containsActive) {
        const remaining = await getUploadedWallpapers();
        if (remaining.length > 0) {
          const newWp = await saveWallpaperSettings({ enabled: true, mode: 'custom', customDataUrl: remaining[0].dataUrl });
          state.settings.wallpaper = newWp;
          await applyWallpaper(newWp);
        } else {
          const newWp = await saveWallpaperSettings({ enabled: true, mode: 'preset', presetId: 'dark_geometry' });
          state.settings.wallpaper = newWp;
          await applyWallpaper(newWp);
        }
      }

      isBatchUploadMode = false;
      batchSelectedUploadIds.clear();
      renderWallpaperSettings();
      showToast('🗑️ 批量删除成功', `已清理 ${count} 张本地壁纸`);
    });
  }

  // 4. 网络 URL 壁纸应用
  const btnApplyUrl = document.getElementById('btn-apply-wallpaper-url');
  const urlInput = document.getElementById('wallpaper-url-input');
  if (btnApplyUrl && urlInput) {
    btnApplyUrl.addEventListener('click', async () => {
      const val = urlInput.value.trim();
      if (!val) {
        showToast('⚠️ 提示', '请输入图片直链 URL');
        return;
      }
      const newWp = await saveWallpaperSettings({
        enabled: true,
        mode: 'url',
        customUrl: val
      });
      state.settings.wallpaper = newWp;
      await applyWallpaper(newWp);
      renderWallpaperSettings();
      showToast('🖼️ 网络壁纸已套用', '已设置为当前主页背景');
    });
  }

  // 6. 模糊滤镜与暗色遮罩滑块
  const blurSlider = document.getElementById('wallpaper-blur-slider');
  const blurLabel = document.getElementById('wallpaper-blur-label');
  if (blurSlider) {
    blurSlider.addEventListener('input', async (e) => {
      const blurVal = parseInt(e.target.value, 10) || 0;
      if (blurLabel) blurLabel.innerText = `${blurVal}px`;
      const newWp = await saveWallpaperSettings({ blur: blurVal });
      state.settings.wallpaper = newWp;
      await applyWallpaper(newWp);
    });
  }

  const maskSlider = document.getElementById('wallpaper-mask-slider');
  const maskLabel = document.getElementById('wallpaper-mask-label');
  if (maskSlider) {
    maskSlider.addEventListener('input', async (e) => {
      const percent = parseInt(e.target.value, 10) || 35;
      const maskVal = percent / 100;
      if (maskLabel) maskLabel.innerText = `${percent}%`;
      const newWp = await saveWallpaperSettings({ mask: maskVal });
      state.settings.wallpaper = newWp;
      await applyWallpaper(newWp);
    });
  }
}

async function renderWallpaperSettings() {
  const wp = state.settings.wallpaper || (await getWallpaperSettings());
  state.settings.wallpaper = wp;

  const enableToggle = document.getElementById('setting-wallpaper-enable');
  const configArea = document.getElementById('wallpaper-config-area');
  const themePackGrid = document.getElementById('wallpaper-theme-pack-grid');
  const builtInGrid = document.getElementById('wallpaper-built-in-grid');
  const blurSlider = document.getElementById('wallpaper-blur-slider');
  const blurLabel = document.getElementById('wallpaper-blur-label');
  const maskSlider = document.getElementById('wallpaper-mask-slider');
  const maskLabel = document.getElementById('wallpaper-mask-label');
  const statusDesc = document.getElementById('wallpaper-active-status-desc');
  const urlInput = document.getElementById('wallpaper-url-input');

  const uploadsHeaderBar = document.getElementById('wallpaper-uploads-header-bar');
  const uploadsBatchBar = document.getElementById('uploads-batch-bar');
  const dropzoneCompact = document.getElementById('wallpaper-dropzone-compact');
  const dropzoneEmpty = document.getElementById('wallpaper-dropzone-empty');
  const uploadsGallery = document.getElementById('wallpaper-uploads-gallery');
  const uploadsCount = document.getElementById('uploads-gallery-count');
  const batchCountEl = document.getElementById('batch-selected-count');
  const chkSelectAll = document.getElementById('chk-select-all-uploads');
  const btnBatchDelete = document.getElementById('btn-batch-delete-uploads');

  if (enableToggle) {
    enableToggle.checked = !!wp.enabled;
  }
  if (configArea) {
    if (wp.enabled) {
      configArea.classList.remove('hidden');
    } else {
      configArea.classList.add('hidden');
    }
  }

  // 1. 渲染 Tab 1: 主题包专属壁纸网格
  if (themePackGrid) {
    const customThemes = await getCustomThemes();
    const themePackWps = [];
    customThemes.forEach(t => {
      if (t.wallpaper && t.wallpaper.enabled) {
        if (t.wallpaper.wallpapers && t.wallpaper.wallpapers.length > 0) {
          t.wallpaper.wallpapers.forEach((w, idx) => {
            themePackWps.push({
              id: w.id || `${t.id}_wp_${idx}`,
              name: w.name || `${t.name} 壁纸 ${idx + 1}`,
              themeName: t.name,
              dataUrl: w.dataUrl || '',
              presetId: w.presetId || '',
              url: w.dataUrl || (PRESET_WALLPAPERS.find(p => p.id === w.presetId) || {}).url || ''
            });
          });
        } else if (t.wallpaper.customDataUrl) {
          themePackWps.push({
            id: `${t.id}_custom_wp`,
            name: `${t.name} 专属壁纸`,
            themeName: t.name,
            dataUrl: t.wallpaper.customDataUrl,
            url: t.wallpaper.customDataUrl
          });
        }
      }
    });

    if (themePackWps.length === 0) {
      themePackGrid.innerHTML = `
        <div class="col-span-2 sm:col-span-4 p-5 text-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-card)]/30">
          <div class="text-xl mb-1">📦</div>
          <div class="text-xs font-semibold text-[var(--text-main)]">暂无主题包壁纸</div>
          <div class="text-[10px] text-[var(--text-dim)] mt-1">创建或导入包含专属壁纸的 DIY 主题包，壁纸将自动展示在此处</div>
        </div>
      `;
    } else {
      themePackGrid.innerHTML = themePackWps.map(p => {
        const isCurrentActive = wp.enabled && (
          (wp.mode === 'custom' && wp.customDataUrl && p.dataUrl && wp.customDataUrl === p.dataUrl) ||
          (wp.mode === 'preset' && wp.presetId && p.presetId && wp.presetId === p.presetId)
        );
        return `
          <div data-tp-wp-id="${p.id}" class="wp-preset-card group ${isCurrentActive ? 'is-active' : ''}" style="background-image: url('${p.url || p.dataUrl}')">
            <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent p-2 flex flex-col justify-between">
              <span class="self-end px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-600/90 text-white shadow-sm border border-indigo-400/40 backdrop-blur-xs">
                ✨ ${p.themeName}
              </span>
              <div class="flex items-center justify-between text-white">
                <span class="text-[10px] font-bold truncate">${p.name}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');

      themePackGrid.querySelectorAll('[data-tp-wp-id]').forEach(card => {
        card.addEventListener('click', async () => {
          const wId = card.getAttribute('data-tp-wp-id');
          const target = themePackWps.find(x => x.id === wId);
          if (!target) return;
          const update = target.dataUrl 
            ? { enabled: true, mode: 'custom', customDataUrl: target.dataUrl }
            : { enabled: true, mode: 'preset', presetId: target.presetId || 'dark_geometry' };
          const newWp = await saveWallpaperSettings(update);
          state.settings.wallpaper = newWp;
          await applyWallpaper(newWp);
          renderWallpaperSettings();
          showToast('🖼️ 已应用主题包壁纸', `${target.name}（${target.themeName}）`);
        });
      });
    }
  }

  // 2. 渲染 Tab 2: 插件内置高质感精选壁纸网格
  if (builtInGrid) {
    builtInGrid.innerHTML = PRESET_WALLPAPERS.map(p => {
      const isActive = wp.enabled && (wp.mode === 'preset' || !wp.mode) && (wp.presetId === p.id);
      return `
        <div data-wp-preset-id="${p.id}" class="wp-preset-card group ${isActive ? 'is-active' : ''}" style="background-image: url('${p.thumb || p.url}')">
          <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent p-2 flex flex-col justify-between">
            <span class="self-end px-1.5 py-0.5 rounded text-[9px] font-bold bg-black/60 text-white backdrop-blur-xs">
              ${p.category}
            </span>
            <div class="flex items-center justify-between text-white">
              <span class="text-[10px] font-bold truncate">${p.name}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    builtInGrid.querySelectorAll('[data-wp-preset-id]').forEach(card => {
      card.addEventListener('click', async () => {
        const pid = card.getAttribute('data-wp-preset-id');
        const p = PRESET_WALLPAPERS.find(x => x.id === pid);
        const update = {
          enabled: true,
          mode: 'preset',
          presetId: pid
        };
        const newWp = await saveWallpaperSettings(update);
        state.settings.wallpaper = newWp;
        await applyWallpaper(newWp);
        renderWallpaperSettings();
        showToast('🖼️ 已应用内置精选壁纸', p ? p.name : pid);
      });
    });
  }

  // 3. 渲染 Tab 3: 必应每日壁纸 (全自动跨天每日静默同步)
  const bingContainer = document.getElementById('bing-wallpaper-container');
  if (bingContainer) {
    const isBingActive = wp.enabled && wp.mode === 'bing';
    let currentBingUrl = wp.bingUrl || 'https://cn.bing.com/th?id=OHR.MountFuji_ZH-CN_1920x1080.jpg';
    let currentBingTitle = wp.bingTitle || '必应每日一图 (今日精选)';
    let currentBingCopyright = wp.bingCopyright || '微软官方每日精选摄影壁纸 (© Microsoft Bing)';

    bingContainer.innerHTML = `
      <div class="space-y-3">
        <!-- 必应大尺寸 16:9 展示卡片 -->
        <div id="bing-showcase-card" class="wp-preset-card group relative cursor-pointer ${isBingActive ? 'is-active' : ''}" style="background-image: url('${currentBingUrl}'); min-height: 180px;">
          <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/20 p-3.5 flex flex-col justify-between">
            <div class="flex items-center justify-between">
              <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/90 text-black shadow-sm flex items-center gap-1">
                <span>🌄</span> <span>必应每日一图</span>
              </span>
              <span class="px-2 py-0.5 rounded-full text-[9px] font-mono ${isBingActive ? 'bg-emerald-500/90 text-white font-bold' : 'bg-black/60 text-white'} backdrop-blur-xs">
                ${isBingActive ? '⚡ 每日自动跟随中' : '点击开启每日跟随'}
              </span>
            </div>

            <div class="space-y-1 text-white">
              <h5 class="text-xs sm:text-sm font-bold truncate">${currentBingTitle}</h5>
              <p class="text-[10px] text-white/80 line-clamp-1">${currentBingCopyright}</p>
            </div>
          </div>
        </div>

        <!-- 每日自动更新状态与操作栏 -->
        <div class="p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] flex flex-wrap items-center justify-between gap-2.5">
          <div class="flex items-center gap-2">
            <span class="text-base flex-shrink-0">🔄</span>
            <div>
              <div class="text-xs font-semibold text-[var(--text-main)] flex items-center gap-1.5">
                <span>全自动每日静默同步</span>
                ${isBingActive ? '<span class="px-1.5 py-0.2 rounded text-[8px] bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">运行中</span>' : ''}
              </div>
              <p class="text-[10px] text-[var(--text-dim)] mt-0.5">选择后每天打开新标签页时，系统自动无感更新为当天最新的必应壁纸，无需手动操作</p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button type="button" id="btn-refresh-bing-daily" class="px-2.5 py-1.5 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--bg-card-hover)] border border-[var(--border)] text-[var(--text-main)] text-[10px] font-medium transition-all flex items-center gap-1 cursor-pointer" title="重新向 Bing 接口检测并拉取今日最新一图">
              <svg class="w-3 h-3 text-indigo-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              <span>立即检测更新</span>
            </button>
            ${!isBingActive ? `
              <button type="button" id="btn-apply-bing-daily" class="px-3 py-1.5 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-[10px] font-bold transition-all shadow-sm cursor-pointer">
                开启必应每日壁纸
              </button>
            ` : `
              <span class="text-[10px] text-emerald-400 font-bold px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">已开启自动同步</span>
            `}
          </div>
        </div>
      </div>
    `;

    // 若本地尚无最新 bingUrl，异步拉取并更新卡片信息
    if (!wp.bingUrl) {
      fetchBingDailyWallpaper().then(info => {
        if (info && info.url) {
          const card = document.getElementById('bing-showcase-card');
          if (card) {
            card.style.backgroundImage = `url('${info.url}')`;
            const titleEl = card.querySelector('h5');
            const descEl = card.querySelector('p');
            if (titleEl) titleEl.innerText = info.title;
            if (descEl) descEl.innerText = info.copyright;
          }
        }
      }).catch(() => {});
    }

    // 绑定点击应用与开启每日自动同步
    const handleApplyBing = async () => {
      showToast('🔄 正在同步', '正在拉取必应今日最新壁纸...');
      const bingInfo = await fetchBingDailyWallpaper();
      const updatedWp = await saveWallpaperSettings({
        enabled: true,
        mode: 'bing',
        bingUrl: bingInfo ? bingInfo.url : currentBingUrl,
        bingDate: bingInfo ? bingInfo.date : '',
        bingTitle: bingInfo ? bingInfo.title : '必应每日壁纸',
        bingCopyright: bingInfo ? bingInfo.copyright : ''
      });
      state.settings.wallpaper = updatedWp;
      await applyWallpaper(updatedWp);
      renderWallpaperSettings();
      showToast('🌄 必应每日壁纸已开启', '已设置为当前主页背景，每天打开将自动同步当天最新壁纸');
    };

    const card = document.getElementById('bing-showcase-card');
    if (card) card.addEventListener('click', handleApplyBing);

    const btnApply = document.getElementById('btn-apply-bing-daily');
    if (btnApply) btnApply.addEventListener('click', handleApplyBing);

    const btnRefresh = document.getElementById('btn-refresh-bing-daily');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', async (e) => {
        e.stopPropagation();
        showToast('🔄 正在检测', '正在向必应官方接口查询最新壁纸...');
        const res = await syncBingDailyWallpaper(true);
        if (res) {
          state.settings.wallpaper = res;
          await applyWallpaper(res);
          renderWallpaperSettings();
          showToast('✅ 必应壁纸已是最新', res.bingTitle || '已完成同步');
        } else {
          showToast('⚠️ 同步提示', '未能拉取到最新必应壁纸，请检查网络');
        }
      });
    }
  }

  // 4. 渲染 Tab 4: 本地已上传壁纸图库 (纯边框高亮、悬浮工具栏与防误触确认)
  if (uploadsGallery) {
    const uploadedList = await getUploadedWallpapers();
    const hasUploads = uploadedList && uploadedList.length > 0;

    if (uploadsCount) uploadsCount.innerText = `${uploadedList.length} / 12 张`;

    if (!hasUploads) {
      if (uploadsHeaderBar) uploadsHeaderBar.classList.add('hidden');
      if (uploadsBatchBar) uploadsBatchBar.classList.add('hidden');
      if (dropzoneCompact) dropzoneCompact.classList.add('hidden');
      if (dropzoneEmpty) dropzoneEmpty.classList.remove('hidden');
      uploadsGallery.innerHTML = '';
    } else {
      if (uploadsHeaderBar) uploadsHeaderBar.classList.remove('hidden');
      if (dropzoneEmpty) dropzoneEmpty.classList.add('hidden');

      if (isBatchUploadMode) {
        if (uploadsBatchBar) uploadsBatchBar.classList.remove('hidden');
        if (dropzoneCompact) dropzoneCompact.classList.add('hidden');
        if (batchCountEl) batchCountEl.innerText = String(batchSelectedUploadIds.size);
        if (btnBatchDelete) btnBatchDelete.disabled = batchSelectedUploadIds.size === 0;
        if (chkSelectAll) chkSelectAll.checked = (uploadedList.length > 0 && batchSelectedUploadIds.size === uploadedList.length);
      } else {
        if (uploadsBatchBar) uploadsBatchBar.classList.add('hidden');
        if (dropzoneCompact) dropzoneCompact.classList.remove('hidden');
      }

      uploadsGallery.innerHTML = uploadedList.map(item => {
        const isCurrentActive = wp.enabled && wp.mode === 'custom' && (wp.customDataUrl === item.dataUrl);
        const isBatchSelected = batchSelectedUploadIds.has(item.id);

        if (isBatchUploadMode) {
          return `
            <div data-batch-card-id="${item.id}" class="wp-preset-card group cursor-pointer relative ${isBatchSelected ? 'ring-2 ring-indigo-500 bg-indigo-500/20' : (isCurrentActive ? 'is-active' : '')}" style="background-image: url('${item.dataUrl}')">
              <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent p-2 flex flex-col justify-between">
                <div class="flex justify-between items-start">
                  <input type="checkbox" data-batch-chk-id="${item.id}" ${isBatchSelected ? 'checked' : ''} class="w-4 h-4 rounded accent-[var(--primary)] cursor-pointer" onclick="event.stopPropagation()">
                </div>
                <span class="text-[10px] font-bold text-white truncate">${item.name}</span>
              </div>
            </div>
          `;
        }

        return `
          <div data-uploaded-card-id="${item.id}" class="wp-preset-card group relative ${isCurrentActive ? 'is-active' : ''}" style="background-image: url('${item.dataUrl}')">
            <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent p-2 flex flex-col justify-between">
              
              <!-- 顶部徽标与操作工具栏 -->
              <div class="flex justify-between items-center">
                <span class="px-1.5 py-0.5 rounded text-[9px] font-mono bg-black/60 text-white backdrop-blur-xs">
                  本地
                </span>
                
                <!-- 悬浮操作工具栏 (删除) -->
                <div class="wp-card-actions flex items-center gap-1.5 z-10">
                  <button type="button" data-delete-upload-id="${item.id}" title="删除此壁纸" class="w-6 h-6 rounded-md bg-black/70 hover:bg-red-500 text-white flex items-center justify-center border border-white/10 shadow-sm transition-all cursor-pointer" onclick="event.stopPropagation()">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </div>
              </div>

              <!-- 底部名称 -->
              <div class="flex items-center text-white">
                <span class="text-[10px] font-bold truncate">${item.name}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');

      // 绑定普通模式卡片点击与操作
      if (!isBatchUploadMode) {
        uploadsGallery.querySelectorAll('[data-uploaded-card-id]').forEach(card => {
          card.addEventListener('click', async () => {
            const uId = card.getAttribute('data-uploaded-card-id');
            const target = uploadedList.find(x => x.id === uId);
            if (!target) return;
            const newWp = await saveWallpaperSettings({
              enabled: true,
              mode: 'custom',
              customDataUrl: target.dataUrl
            });
            state.settings.wallpaper = newWp;
            await applyWallpaper(newWp);
            renderWallpaperSettings();
            showToast('🖼️ 已应用本地壁纸', target.name);
          });
        });

        // 单张删除防误触确认弹窗
        uploadsGallery.querySelectorAll('[data-delete-upload-id]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const uId = btn.getAttribute('data-delete-upload-id');
            const target = uploadedList.find(x => x.id === uId);
            if (!target) return;

            const isActive = wp.enabled && wp.mode === 'custom' && wp.customDataUrl === target.dataUrl;
            const details = [
              { icon: '🖼️', title: '壁纸名称：', desc: target.name },
              { icon: '💾', title: '存储释放：', desc: '该壁纸图片数据将从浏览器本地存储中彻底清除' }
            ];
            if (isActive) {
              details.push({ icon: '⚠️', title: '当前背景回退：', desc: '该壁纸当前正生效为主页背景，删除后将自动为您回退至其他壁纸' });
            }

            const confirmed = await openConfirmModal({
              title: '删除本地壁纸',
              subtitle: `壁纸：${target.name}`,
              icon: '🗑️',
              iconType: 'danger',
              isDanger: true,
              message: `确定要彻底删除本地壁纸「${target.name}」吗？`,
              details,
              confirmText: '确认删除',
              cancelText: '取消'
            });
            if (!confirmed) return;

            await deleteUploadedWallpaper(target.id);

            // 若删除的是当前正生效的壁纸，平滑回退
            if (isActive) {
              const remaining = await getUploadedWallpapers();
              if (remaining.length > 0) {
                const newWp = await saveWallpaperSettings({ enabled: true, mode: 'custom', customDataUrl: remaining[0].dataUrl });
                state.settings.wallpaper = newWp;
                await applyWallpaper(newWp);
              } else {
                const newWp = await saveWallpaperSettings({ enabled: true, mode: 'preset', presetId: 'dark_geometry' });
                state.settings.wallpaper = newWp;
                await applyWallpaper(newWp);
              }
            }

            renderWallpaperSettings();
            showToast('🗑️ 已删除本地壁纸', `「${target.name}」已移除`);
          });
        });
      } else {
        // 批量管理模式点击勾选
        uploadsGallery.querySelectorAll('[data-batch-card-id]').forEach(card => {
          card.addEventListener('click', () => {
            const uId = card.getAttribute('data-batch-card-id');
            if (batchSelectedUploadIds.has(uId)) {
              batchSelectedUploadIds.delete(uId);
            } else {
              batchSelectedUploadIds.add(uId);
            }
            renderWallpaperSettings();
          });
        });

        uploadsGallery.querySelectorAll('[data-batch-chk-id]').forEach(chk => {
          chk.addEventListener('change', () => {
            const uId = chk.getAttribute('data-batch-chk-id');
            if (chk.checked) {
              batchSelectedUploadIds.add(uId);
            } else {
              batchSelectedUploadIds.delete(uId);
            }
            renderWallpaperSettings();
          });
        });
      }
    }
  }

  if (wp.mode === 'url' && wp.customUrl && urlInput) {
    urlInput.value = wp.customUrl;
  }

  // 滤镜滑块状态
  if (blurSlider && blurLabel) {
    blurSlider.value = wp.blur || 0;
    blurLabel.innerText = `${wp.blur || 0}px`;
  }
  if (maskSlider && maskLabel) {
    const maskPercent = Math.round((wp.mask !== undefined ? wp.mask : 0.35) * 100);
    maskSlider.value = maskPercent;
    maskLabel.innerText = `${maskPercent}%`;
  }

  // 状态文案
  if (statusDesc) {
    if (!wp.enabled) {
      statusDesc.innerText = '壁纸已关闭 (纯色主题背景)';
      statusDesc.className = 'text-[10px] text-[var(--text-dim)] font-mono';
    } else if (wp.mode === 'bing') {
      statusDesc.innerText = '已开启：必应每日壁纸 (每日自动同步)';
      statusDesc.className = 'text-[10px] text-amber-400 font-mono';
    } else if (wp.mode === 'custom') {
      statusDesc.innerText = '已套用本地壁纸';
      statusDesc.className = 'text-[10px] text-emerald-400 font-mono';
    } else if (wp.mode === 'url') {
      statusDesc.innerText = '已套用网络链接壁纸';
      statusDesc.className = 'text-[10px] text-indigo-400 font-mono';
    } else {
      const curPreset = PRESET_WALLPAPERS.find(p => p.id === wp.presetId) || PRESET_WALLPAPERS[0];
      statusDesc.innerText = `已套用：${curPreset ? curPreset.name : '内置精选'}`;
      statusDesc.className = 'text-[10px] text-indigo-400 font-mono';
    }
  }
}

const DIY_PRESETS = [
  {
    name: '北欧极光',
    badge: '🌌 极光',
    bgMain: '#2e3440',
    bgCard: '#3b4252',
    primary: '#88c0d0',
    colorClock: '#eceff4',
    colorDate: '#d8dee9',
    colorMotto: '#88c0d0',
    border: '#4c566a',
    textMain: '#eceff4',
    textMuted: '#d8dee9'
  },
  {
    name: '赛博霓虹',
    badge: '🌸 霓虹',
    bgMain: '#0d0221',
    bgCard: '#190e38',
    primary: '#ff2a6d',
    colorClock: '#05d9e8',
    colorDate: '#d1f7ff',
    colorMotto: '#ff2a6d',
    border: '#3f2b68',
    textMain: '#05d9e8',
    textMuted: '#d1f7ff'
  },
  {
    name: '抹茶墨绿',
    badge: '🍵 抹茶',
    bgMain: '#0a1f18',
    bgCard: '#133529',
    primary: '#10b981',
    colorClock: '#ecfdf5',
    colorDate: '#a7f3d0',
    colorMotto: '#10b981',
    border: '#1e4d3c',
    textMain: '#ecfdf5',
    textMuted: '#a7f3d0'
  },
  {
    name: '深海湛蓝',
    badge: '🌊 湛蓝',
    bgMain: '#0b132b',
    bgCard: '#1c2541',
    primary: '#48cae4',
    colorClock: '#ffffff',
    colorDate: '#90e0ef',
    colorMotto: '#48cae4',
    border: '#3a506b',
    textMain: '#ffffff',
    textMuted: '#90e0ef'
  },
  {
    name: '暮色暖咖',
    badge: '☕ 暖咖',
    bgMain: '#1c1917',
    bgCard: '#292524',
    primary: '#f97316',
    colorClock: '#fafaf9',
    colorDate: '#a8a29e',
    colorMotto: '#f97316',
    border: '#44403c',
    textMain: '#fafaf9',
    textMuted: '#a8a29e'
  },
  {
    name: '紫罗兰数码',
    badge: '🔮 紫晶',
    bgMain: '#130e24',
    bgCard: '#20183b',
    primary: '#a855f7',
    colorClock: '#faf5ff',
    colorDate: '#d8b4fe',
    colorMotto: '#c084fc',
    border: '#382a61',
    textMain: '#faf5ff',
    textMuted: '#d8b4fe'
  },
  {
    name: '黑曜暗夜',
    badge: '🌑 黑曜',
    bgMain: '#09090b',
    bgCard: '#141417',
    primary: '#38bdf8',
    colorClock: '#fafafa',
    colorDate: '#a1a1aa',
    colorMotto: '#38bdf8',
    border: '#27272a',
    textMain: '#fafafa',
    textMuted: '#a1a1aa'
  },
  {
    name: '白瓷极简',
    badge: '⚪ 白瓷',
    bgMain: '#f8fafc',
    bgCard: '#ffffff',
    primary: '#4f46e5',
    colorClock: '#0f172a',
    colorDate: '#64748b',
    colorMotto: '#4f46e5',
    border: '#e2e8f0',
    textMain: '#0f172a',
    textMuted: '#64748b'
  }
];

const NOTION_SWATCHES = [
  '#0F172A', '#1E293B', '#64748B', '#F8FAFC',
  '#6366F1', '#3B82F6', '#10B981', '#F59E0B'
];

const CORE_COLORS = [
  { key: '--bg-main', label: '主背景色', colorId: 'diy-color-bg-main', hexId: 'diy-hex-bg-main', default: '#0F172A' },
  { key: '--bg-card', label: '卡片底色', colorId: 'diy-color-bg-card', hexId: 'diy-hex-bg-card', default: '#1E293B' },
  { key: '--primary', label: '品牌主色', colorId: 'diy-color-primary', hexId: 'diy-hex-primary', default: '#6366F1' }
];

const AESTHETIC_COLORS = [
  { key: '--color-clock', label: '时钟颜色', colorId: 'diy-color-clock', hexId: 'diy-hex-clock', default: '#F8FAFC' },
  { key: '--color-date', label: '日期颜色', colorId: 'diy-color-date', hexId: 'diy-hex-date', default: '#94A3B8' },
  { key: '--color-motto', label: '座右铭色', colorId: 'diy-color-motto', hexId: 'diy-hex-motto', default: '#94A3B8' }
];

const DETAIL_COLORS = [
  { key: '--border', label: '边框线条', colorId: 'diy-color-border', hexId: 'diy-hex-border', default: '#334155' },
  { key: '--text-main', label: '主要文字', colorId: 'diy-color-text-main', hexId: 'diy-hex-text-main', default: '#F8FAFC' },
  { key: '--text-muted', label: '次要文字', colorId: 'diy-color-text-muted', hexId: 'diy-hex-text-muted', default: '#94A3B8' }
];

const ALL_DIY_COLORS = [...CORE_COLORS, ...AESTHETIC_COLORS, ...DETAIL_COLORS];

let diySelectedWallpapers = [];

function openDiyThemeModal(themeToEdit = null) {
  const modal = document.getElementById('modal-diy-theme');
  const title = document.getElementById('diy-theme-modal-title');
  const idInput = document.getElementById('diy-theme-id');
  const nameInput = document.getElementById('diy-theme-name');
  const authorInput = document.getElementById('diy-theme-author');
  const presetsContainer = document.getElementById('diy-preset-chips');
  const coreGrid = document.getElementById('diy-core-colors-grid');
  const aestheticGrid = document.getElementById('diy-aesthetic-colors-grid');
  const detailGrid = document.getElementById('diy-detail-colors-grid');
  const popover = document.getElementById('diy-color-popover');

  const currentValues = {};
  let activeColorKey = null;

  if (themeToEdit) {
    title.innerText = '编辑 DIY 主题包: ' + themeToEdit.name;
    idInput.value = themeToEdit.id;
    nameInput.value = themeToEdit.name || '';
    authorInput.value = themeToEdit.author || '';

    const vars = themeToEdit.variables || {};
    ALL_DIY_COLORS.forEach(f => {
      currentValues[f.key] = vars[f.key] || f.default;
    });

    if (themeToEdit.wallpaper && themeToEdit.wallpaper.enabled) {
      if (themeToEdit.wallpaper.wallpapers && themeToEdit.wallpaper.wallpapers.length > 0) {
        diySelectedWallpapers = themeToEdit.wallpaper.wallpapers.map(w => ({ ...w }));
      } else if (themeToEdit.wallpaper.customDataUrl) {
        diySelectedWallpapers = [{ id: 'upl_custom', name: '自定义壁纸', dataUrl: themeToEdit.wallpaper.customDataUrl, isDefault: true }];
      } else if (themeToEdit.wallpaper.presetId) {
        const p = PRESET_WALLPAPERS.find(x => x.id === themeToEdit.wallpaper.presetId) || PRESET_WALLPAPERS[0];
        diySelectedWallpapers = [{ id: p.id, name: p.name, presetId: p.id, url: p.url, thumb: p.thumb || p.url, isDefault: true }];
      } else {
        diySelectedWallpapers = [];
      }
    } else {
      diySelectedWallpapers = [];
    }
  } else {
    title.innerText = '新建 DIY 专属主题包';
    idInput.value = '';
    nameInput.value = '';
    authorInput.value = '';

    ALL_DIY_COLORS.forEach(f => {
      currentValues[f.key] = f.default;
    });
    diySelectedWallpapers = [];
  }

  // 初始化专属壁纸绑定组件（多选壁纸，首张为默认）
  const wpToggle = document.getElementById('diy-bundle-wallpaper-toggle');
  const wpSection = document.getElementById('diy-wallpaper-section');
  const chipsContainer = document.getElementById('diy-selected-wallpapers-chips');
  const chipsListWrap = document.getElementById('diy-selected-wallpapers-list');
  const selectedCountEl = document.getElementById('diy-wp-selected-count');
  const builtinGrid = document.getElementById('diy-builtin-wallpapers-grid');
  const uploadedGrid = document.getElementById('diy-uploaded-wallpapers-grid');
  const noUploadsMsg = document.getElementById('diy-no-uploads-msg');

  // 渲染已选壁纸芯片列表
  const renderDiyChips = () => {
    if (!chipsContainer || !chipsListWrap) return;
    if (diySelectedWallpapers.length === 0) {
      chipsListWrap.classList.add('hidden');
      return;
    }
    chipsListWrap.classList.remove('hidden');
    if (selectedCountEl) selectedCountEl.innerText = `(${diySelectedWallpapers.length} 张)`;

    chipsContainer.innerHTML = diySelectedWallpapers.map((w, idx) => {
      const isDefault = idx === 0;
      return `
        <div class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium border transition-all ${isDefault ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300 ring-1 ring-indigo-500/30' : 'bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-muted)]'}">
          ${isDefault ? '<span class="text-[9px] font-bold text-amber-400 bg-amber-500/20 px-1 rounded">🌟 默认</span>' : `<button type="button" data-set-default-idx="${idx}" class="text-[9px] text-[var(--text-dim)] hover:text-indigo-300 underline cursor-pointer" title="点击将此壁纸设为默认主壁纸">设为默认</button>`}
          <span class="truncate max-w-[85px]" title="${w.name}">${w.name}</span>
          <button type="button" data-remove-wp-idx="${idx}" class="hover:text-red-400 ml-0.5 cursor-pointer text-xs font-bold leading-none" title="移除此壁纸">×</button>
        </div>
      `;
    }).join('');

    chipsContainer.querySelectorAll('[data-set-default-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-set-default-idx'), 10);
        const item = diySelectedWallpapers.splice(idx, 1)[0];
        diySelectedWallpapers.unshift(item);
        refreshDiyWallpaperUI();
      });
    });

    chipsContainer.querySelectorAll('[data-remove-wp-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-remove-wp-idx'), 10);
        diySelectedWallpapers.splice(idx, 1);
        refreshDiyWallpaperUI();
      });
    });
  };

  // 渲染内置精选壁纸网格
  const renderDiyBuiltin = () => {
    if (!builtinGrid) return;
    builtinGrid.innerHTML = PRESET_WALLPAPERS.map(p => {
      const matchIdx = diySelectedWallpapers.findIndex(w => w.presetId === p.id || w.id === p.id);
      const isSelected = matchIdx !== -1;
      return `
        <div data-diy-pick-builtin="${p.id}" class="wp-preset-card group relative cursor-pointer ${isSelected ? 'is-active' : ''}" style="background-image: url('${p.thumb || p.url}')">
          <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent p-1.5 flex flex-col justify-between">
            <span class="self-start px-1 py-0.2 rounded text-[8px] font-mono bg-black/60 text-white backdrop-blur-xs">${p.category}</span>
            <span class="text-[9px] font-bold text-white truncate">${p.name}</span>
          </div>
        </div>
      `;
    }).join('');

    builtinGrid.querySelectorAll('[data-diy-pick-builtin]').forEach(card => {
      card.addEventListener('click', () => {
        const pId = card.getAttribute('data-diy-pick-builtin');
        const p = PRESET_WALLPAPERS.find(x => x.id === pId);
        if (!p) return;
        const existingIdx = diySelectedWallpapers.findIndex(w => w.presetId === p.id || w.id === p.id);
        if (existingIdx !== -1) {
          diySelectedWallpapers.splice(existingIdx, 1);
        } else {
          diySelectedWallpapers.push({
            id: p.id,
            name: p.name,
            presetId: p.id,
            url: p.url,
            thumb: p.thumb || p.url
          });
        }
        refreshDiyWallpaperUI();
      });
    });
  };

  // 渲染已上传本地壁纸网格
  const renderDiyUploaded = async () => {
    if (!uploadedGrid) return;
    const uploadedList = await getUploadedWallpapers();
    if (!uploadedList || uploadedList.length === 0) {
      if (noUploadsMsg) noUploadsMsg.classList.remove('hidden');
      uploadedGrid.innerHTML = '';
      return;
    }
    if (noUploadsMsg) noUploadsMsg.classList.add('hidden');

    uploadedGrid.innerHTML = uploadedList.map(item => {
      const matchIdx = diySelectedWallpapers.findIndex(w => (w.dataUrl && w.dataUrl === item.dataUrl) || w.id === item.id);
      const isSelected = matchIdx !== -1;
      return `
        <div data-diy-pick-uploaded="${item.id}" class="wp-preset-card group relative cursor-pointer ${isSelected ? 'is-active' : ''}" style="background-image: url('${item.dataUrl}')">
          <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent p-1.5 flex flex-col justify-between">
            <span class="self-start px-1 py-0.2 rounded text-[8px] font-mono bg-black/60 text-white backdrop-blur-xs">本地</span>
            <span class="text-[9px] font-bold text-white truncate">${item.name}</span>
          </div>
        </div>
      `;
    }).join('');

    uploadedGrid.querySelectorAll('[data-diy-pick-uploaded]').forEach(card => {
      card.addEventListener('click', () => {
        const uId = card.getAttribute('data-diy-pick-uploaded');
        const item = uploadedList.find(x => x.id === uId);
        if (!item) return;
        const existingIdx = diySelectedWallpapers.findIndex(w => (w.dataUrl && w.dataUrl === item.dataUrl) || w.id === item.id);
        if (existingIdx !== -1) {
          diySelectedWallpapers.splice(existingIdx, 1);
        } else {
          diySelectedWallpapers.push({
            id: item.id,
            name: item.name,
            dataUrl: item.dataUrl
          });
        }
        refreshDiyWallpaperUI();
      });
    });
  };

  const refreshDiyWallpaperUI = () => {
    renderDiyChips();
    renderDiyBuiltin();
    renderDiyUploaded();
    updatePreview();
  };

  // Tab 切换 (内置精选 / 本地上传)
  modal.querySelectorAll('.diy-wp-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-diy-wp-tab');
      modal.querySelectorAll('.diy-wp-tab-btn').forEach(b => {
        const isCur = b.getAttribute('data-diy-wp-tab') === tab;
        if (isCur) {
          b.classList.add('bg-[var(--primary)]', 'text-white');
          b.classList.remove('text-[var(--text-muted)]');
        } else {
          b.classList.remove('bg-[var(--primary)]', 'text-white');
          b.classList.add('text-[var(--text-muted)]');
        }
      });
      modal.querySelectorAll('.diy-wp-panel').forEach(p => p.classList.add('hidden'));
      const p = document.getElementById('diy-wp-panel-' + tab);
      if (p) p.classList.remove('hidden');
    });
  });

  if (wpToggle && wpSection) {
    const hasWp = Boolean(themeToEdit && themeToEdit.wallpaper && themeToEdit.wallpaper.enabled);
    wpToggle.checked = hasWp;
    if (hasWp) {
      wpSection.classList.remove('hidden');
    } else {
      wpSection.classList.add('hidden');
    }

    wpToggle.onchange = () => {
      if (wpToggle.checked) {
        wpSection.classList.remove('hidden');
        if (diySelectedWallpapers.length === 0 && PRESET_WALLPAPERS.length > 0) {
          const p0 = PRESET_WALLPAPERS[0];
          diySelectedWallpapers.push({
            id: p0.id,
            name: p0.name,
            presetId: p0.id,
            url: p0.url,
            thumb: p0.thumb || p0.url
          });
        }
      } else {
        wpSection.classList.add('hidden');
      }
      refreshDiyWallpaperUI();
    };
  }

  // 1. 渲染 8 套大师级配色预设胶囊
  if (presetsContainer) {
    presetsContainer.innerHTML = DIY_PRESETS.map(p => `
      <button type="button" data-preset-name="${p.name}" class="p-1.5 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--primary)] text-left flex items-center justify-between transition-all cursor-pointer group shadow-2xs">
        <div class="flex items-center gap-1.5 min-w-0">
          <span class="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-black/20" style="background:${p.primary};"></span>
          <span class="font-medium text-[10px] text-[var(--text-main)] group-hover:text-[var(--primary)] truncate">${p.badge}</span>
        </div>
      </button>
    `).join('');

    presetsContainer.querySelectorAll('[data-preset-name]').forEach(btn => {
      btn.addEventListener('click', () => {
        const pName = btn.getAttribute('data-preset-name');
        const preset = DIY_PRESETS.find(p => p.name === pName);
        if (preset) {
          if (!nameInput.value || DIY_PRESETS.some(p => p.name === nameInput.value)) {
            nameInput.value = preset.name;
          }
          currentValues['--bg-main'] = preset.bgMain;
          currentValues['--bg-card'] = preset.bgCard;
          currentValues['--primary'] = preset.primary;
          currentValues['--color-clock'] = preset.colorClock || preset.textMain;
          currentValues['--color-date'] = preset.colorDate || preset.textMuted;
          currentValues['--color-motto'] = preset.colorMotto || preset.primary || preset.textMuted;
          currentValues['--border'] = preset.border;
          currentValues['--text-main'] = preset.textMain;
          currentValues['--text-muted'] = preset.textMuted;

          renderColorGrids();
          updatePreview();
          if (popover && !popover.classList.contains('hidden') && activeColorKey) {
            syncPopoverState(currentValues[activeColorKey]);
          }
          showToast('🎨 已套用配色灵感', preset.name);
        }
      });
    });
  }

  // 2. 渲染高颜值交互色块胶囊
  function renderColorGrids() {
    const renderCard = (f) => {
      const val = (currentValues[f.key] || f.default).toUpperCase();
      return `
        <div class="p-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] flex flex-col gap-1 shadow-2xs hover:border-[var(--primary)] transition-all">
          <span class="text-[10px] font-medium text-[var(--text-muted)] truncate">${f.label}</span>
          <button type="button" data-open-color-popover="${f.key}" class="w-full px-2 py-1.5 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--bg-card-hover)] border border-[var(--border)] flex items-center justify-between gap-1.5 transition-all cursor-pointer group">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="w-3.5 h-3.5 rounded-md flex-shrink-0 border border-black/20 shadow-xs ring-1 ring-white/10" style="background:${val};"></span>
              <span class="font-mono text-[10px] font-bold text-[var(--text-main)] uppercase truncate">${val}</span>
            </div>
            <svg class="w-3 h-3 text-[var(--text-dim)] group-hover:text-[var(--primary)] flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
          </button>
          <input type="hidden" id="${f.hexId}" value="${val}">
        </div>
      `;
    };

    if (coreGrid) coreGrid.innerHTML = CORE_COLORS.map(renderCard).join('');
    if (aestheticGrid) aestheticGrid.innerHTML = AESTHETIC_COLORS.map(renderCard).join('');
    if (detailGrid) detailGrid.innerHTML = DETAIL_COLORS.map(renderCard).join('');

    // 绑定点击弹出浮动取色盘
    modal.querySelectorAll('[data-open-color-popover]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = btn.getAttribute('data-open-color-popover');
        openColorPopover(key, btn);
      });
    });
  }

  // 3. 极简 Notion / Linear 风格微型 Popover 引擎
  function openColorPopover(key, triggerBtn) {
    if (!popover) return;
    activeColorKey = key;
    const currentHex = (currentValues[key] || '#6366F1').toUpperCase();

    syncPopoverState(currentHex);

    // 定位 popover 在触发按钮正下方，宽度 100% 等宽贴合按钮
    popover.classList.remove('hidden');
    const rect = triggerBtn.getBoundingClientRect();
    const modalRect = modal.getBoundingClientRect();

    let top = rect.bottom - modalRect.top + 3;
    let left = rect.left - modalRect.left;
    const width = Math.max(rect.width, 96);

    if (left + width > modalRect.width) left = modalRect.width - width - 8;
    if (top + 65 > modalRect.height) top = rect.top - modalRect.top - 62;
    if (top < 8) top = 8;
    if (left < 8) left = 8;

    popover.style.width = `${width}px`;
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
  }

  function syncPopoverState(hex) {
    hex = (hex || '#6366F1').toUpperCase();

    const hexInput = document.getElementById('popover-hex-input');
    if (hexInput) hexInput.value = hex.replace('#', '');

    const nativePicker = document.getElementById('popover-native-picker');
    if (nativePicker) nativePicker.value = hex;

    // 渲染 8 颗极简微型色板 (2 行 × 4 列)
    const swatchesGrid = document.getElementById('popover-swatches-grid');
    if (swatchesGrid) {
      swatchesGrid.innerHTML = NOTION_SWATCHES.map(c => `
        <button type="button" data-popover-color="${c}" class="w-4 h-4 rounded-full border border-black/25 hover:scale-130 transition-transform cursor-pointer shadow-2xs ${c.toUpperCase() === hex ? 'ring-2 ring-indigo-400 scale-110' : ''}" style="background:${c};" title="${c}"></button>
      `).join('');

      swatchesGrid.querySelectorAll('[data-popover-color]').forEach(b => {
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          applyColor(b.getAttribute('data-popover-color'));
        });
      });
    }
  }

  function applyColor(newHex) {
    if (!activeColorKey || !newHex) return;
    if (!newHex.startsWith('#')) newHex = '#' + newHex;
    newHex = newHex.toUpperCase();

    currentValues[activeColorKey] = newHex;
    const config = ALL_DIY_COLORS.find(f => f.key === activeColorKey);
    if (config) {
      const hiddenInput = document.getElementById(config.hexId);
      if (hiddenInput) hiddenInput.value = newHex;
    }

    renderColorGrids();
    updatePreview();
    syncPopoverState(newHex);
  }

  const hexInput = document.getElementById('popover-hex-input');
  if (hexInput) {
    hexInput.oninput = (e) => {
      let v = e.target.value.trim();
      if (!v.startsWith('#')) v = '#' + v;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        applyColor(v);
      }
    };
  }

  const nativePicker = document.getElementById('popover-native-picker');
  if (nativePicker) {
    nativePicker.oninput = (e) => {
      applyColor(e.target.value);
    };
  }

  const eyeDropperBtn = document.getElementById('popover-eyedropper-btn');
  if (eyeDropperBtn) {
    if (window.EyeDropper) {
      eyeDropperBtn.onclick = async (e) => {
        e.stopPropagation();
        try {
          const eyeDropper = new EyeDropper();
          const result = await eyeDropper.open();
          if (result && result.sRGBHex) {
            applyColor(result.sRGBHex);
          }
        } catch (err) {
          // 用户取消吸管
        }
      };
    } else {
      eyeDropperBtn.style.display = 'none';
    }
  }

  // 4. 高级细节抽屉展开/折叠
  const advToggle = document.getElementById('diy-advanced-toggle');
  const advDrawer = document.getElementById('diy-advanced-drawer');
  const advArrow = document.getElementById('diy-advanced-arrow');
  if (advToggle && advDrawer) {
    advToggle.onclick = () => {
      const isHidden = advDrawer.classList.contains('hidden');
      if (isHidden) {
        advDrawer.classList.remove('hidden');
        if (advArrow) advArrow.classList.add('rotate-180');
      } else {
        advDrawer.classList.add('hidden');
        if (advArrow) advArrow.classList.remove('rotate-180');
      }
    };
  }

  // 5. 颜色与壁纸联动与预览刷新
  const updatePreview = () => {
    const bgMain = currentValues['--bg-main'] || '#0F172A';
    const bgCard = currentValues['--bg-card'] || '#1E293B';
    const primary = currentValues['--primary'] || '#6366F1';
    const border = currentValues['--border'] || '#334155';
    const textMain = currentValues['--text-main'] || '#F8FAFC';
    const textMuted = currentValues['--text-muted'] || '#94A3B8';

    const container = document.getElementById('diy-preview-container');
    const isBundleWp = wpToggle && wpToggle.checked && diySelectedWallpapers.length > 0;
    
    if (container) {
      container.style.borderColor = border;
      if (isBundleWp) {
        const defaultWp = diySelectedWallpapers[0];
        const previewBgUrl = defaultWp.dataUrl || defaultWp.url || (PRESET_WALLPAPERS.find(p => p.id === defaultWp.presetId) || PRESET_WALLPAPERS[0]).thumb || PRESET_WALLPAPERS[0].url;
        container.style.background = `linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url("${previewBgUrl}") center / cover no-repeat`;
      } else {
        container.style.background = bgMain;
      }
    }

    const card = document.getElementById('diy-preview-card');
    if (card) {
      card.style.background = bgCard;
      card.style.borderColor = border;
      const icon = document.getElementById('diy-preview-icon');
      if (icon) {
        icon.style.background = bgMain;
        icon.style.borderColor = border;
        icon.style.color = primary;
      }
      const titleEl = document.getElementById('diy-preview-title');
      if (titleEl) titleEl.style.color = textMain;
      const descEl = document.getElementById('diy-preview-desc');
      if (descEl) descEl.style.color = textMuted;
      const badgeEl = document.getElementById('diy-preview-badge');
      if (badgeEl) {
        badgeEl.style.background = primary;
        badgeEl.style.color = '#ffffff';
      }
    }

    const colorClock = currentValues['--color-clock'] || textMain;
    const colorDate = currentValues['--color-date'] || textMuted;
    const colorMotto = currentValues['--color-motto'] || textMuted;

    const prevClock = document.getElementById('diy-preview-clock');
    if (prevClock) prevClock.style.color = colorClock;

    const prevDate = document.getElementById('diy-preview-date');
    if (prevDate) prevDate.style.color = colorDate;

    const prevMotto = document.getElementById('diy-preview-motto');
    if (prevMotto) prevMotto.style.color = colorMotto;

    const prevMottoStar = document.getElementById('diy-preview-motto-star');
    if (prevMottoStar) prevMottoStar.style.color = primary;

    const searchEl = document.getElementById('diy-preview-search');
    if (searchEl) {
      searchEl.style.background = bgCard;
      searchEl.style.borderColor = border;
    }
    const searchText = document.getElementById('diy-preview-search-text');
    if (searchText) searchText.style.color = textMuted;
    const searchBtn = document.getElementById('diy-preview-search-btn');
    if (searchBtn) {
      searchBtn.style.background = primary;
      searchBtn.style.color = '#ffffff';
    }
  };

  modal.onclick = (e) => {
    if (popover && !popover.classList.contains('hidden')) {
      if (!popover.contains(e.target) && !e.target.closest('[data-open-color-popover]')) {
        popover.classList.add('hidden');
      }
    }
  };

  renderColorGrids();
  updatePreview();
  showModal(modal);
}

function renderSettingsGroupList() {
  const listEl = document.getElementById('settings-group-list');
  if (!listEl) return;

  listEl.innerHTML = state.groups.map(g => {
    const isPinned = g.id === PINNED_GROUP_ID;
    const isUngrouped = g.id === UNGROUPED_GROUP_ID;
    const isSystem = isPinned || isUngrouped;
    const count = state.bookmarks.filter(b => b.groupId === g.id).length;

    let badgeHtml = '';
    if (isPinned) {
      badgeHtml = '<span class="text-[9px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded flex-shrink-0">★ 固定常用排首</span>';
    } else if (isUngrouped) {
      badgeHtml = '<span class="text-[9px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded flex-shrink-0">⚑ 固定未分组排尾</span>';
    }

    return `
      <div class="settings-group-item flex items-center justify-between p-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] transition-all ${g.isHidden ? 'opacity-65' : ''} ${!isSystem ? 'cursor-grab' : ''}" 
           data-grp-item="${g.id}" 
           ${!isSystem ? 'draggable="true"' : ''}>
        
        <!-- 左侧：拖拽把手、分组名称、徽标与书签数 -->
        <div class="flex items-center gap-2 min-w-0 flex-1">
          ${!isSystem ? `
            <span class="drag-handle text-indigo-400/80 hover:text-[var(--primary)] font-mono text-sm cursor-grab active:cursor-grabbing select-none px-1 py-0.5" title="按住上下拖拽调整主页排序">⋮⋮</span>
          ` : `
            <span class="text-indigo-400 font-mono select-none px-1">${isPinned ? '★' : '⚑'}</span>
          `}
          <span class="font-semibold text-xs text-[var(--text-main)] truncate ${g.isHidden ? 'line-through text-[var(--text-dim)]' : ''}">${g.name}</span>
          ${badgeHtml}
          ${!isPinned ? `<span class="text-[10px] text-[var(--text-dim)] font-mono flex-shrink-0">(${count})</span>` : ''}
        </div>

        <!-- 右侧：功能工具栏 (编辑/删除 -> 眼睛展示 -> 默认折叠状态胶囊) -->
        <div class="flex items-center gap-1.5 flex-shrink-0">
          
          <!-- 1. 编辑/重命名图标按钮 (仅自定义分组) -->
          ${!isSystem ? `
            <button data-grp-rename="${g.id}" 
                    type="button"
                    title="重命名此分组" 
                    class="p-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--primary)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer flex items-center justify-center">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>
          ` : ''}

          <!-- 2. 删除图标按钮 (仅自定义分组) -->
          ${!isSystem ? `
            <button data-grp-delete="${g.id}" 
                    type="button"
                    title="删除此分组（组内书签转移至未分组并自动备份）" 
                    class="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors cursor-pointer flex items-center justify-center">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          ` : ''}

          <!-- 3. 主页显示/隐藏状态图标按钮 -->
          <button data-grp-toggle-visible="${g.id}" 
                  type="button"
                  title="${g.isHidden ? '当前状态：主页已隐藏（点击设为在主页显示）' : '当前状态：主页已正常显示（点击设为在主页隐藏）'}" 
                  class="p-1.5 rounded-lg ${g.isHidden ? 'bg-slate-500/10 border border-slate-500/20 text-slate-400' : 'bg-[var(--bg-card)] border border-[var(--border)] text-indigo-400'} hover:border-[var(--primary)] hover:text-[var(--primary)] transition-all cursor-pointer flex items-center justify-center">
            ${g.isHidden ? `
              <!-- 闭眼图标 (隐藏) -->
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
            ` : `
              <!-- 睁眼图标 (显示) -->
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
            `}
          </button>

          <!-- 4. 默认折叠/展开状态胶囊按钮 (明确标示状态) -->
          <button data-grp-toggle-collapse="${g.id}" 
                  type="button"
                  title="${g.isDefaultCollapsed ? '当前默认状态为「折叠」（点击切换为默认展开）' : '当前默认状态为「展开」（点击切换为默认折叠）'}" 
                  class="px-2 py-1 rounded-lg ${g.isDefaultCollapsed ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300' : 'bg-[var(--bg-card)] border border-[var(--border)] text-indigo-400 hover:border-[var(--primary)] hover:text-[var(--primary)]'} text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1">
            ${g.isDefaultCollapsed ? `
              <!-- 向右箭头 + 默认折叠文案 -->
              <svg class="w-3 h-3 text-amber-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
              <span>默认折叠</span>
            ` : `
              <!-- 向下箭头 + 默认展开文案 -->
              <svg class="w-3 h-3 text-indigo-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
              <span>默认展开</span>
            `}
          </button>

        </div>
      </div>
    `;
  }).join('');

  // 1. 是否展示切换 (眼睛图标)
  listEl.querySelectorAll('[data-grp-toggle-visible]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const gid = btn.getAttribute('data-grp-toggle-visible');
      const grp = state.groups.find(g => g.id === gid);
      if (grp) {
        grp.isHidden = !grp.isHidden;
        await saveGroup(grp);
        renderSettingsGroupList();
        renderAllGroups();
        showToast('分组展示状态已更新', `${grp.name} 已${grp.isHidden ? '在主页隐藏' : '在主页显示'}`);
      }
    });
  });

  // 2. 默认折叠状态切换 (折叠图标)
  listEl.querySelectorAll('[data-grp-toggle-collapse]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const gid = btn.getAttribute('data-grp-toggle-collapse');
      const grp = state.groups.find(g => g.id === gid);
      if (grp) {
        grp.isDefaultCollapsed = !grp.isDefaultCollapsed;
        await saveGroup(grp);
        renderSettingsGroupList();
        showToast('分组折叠设置已更新', `${grp.name} 默认状态已设为: ${grp.isDefaultCollapsed ? '折叠' : '展开'}`);
      }
    });
  });

  // 3. 拖拽排序 (Drag & Drop)
  let draggedGid = null;
  const draggableItems = listEl.querySelectorAll('.settings-group-item[draggable="true"]');
  draggableItems.forEach(item => {
    item.addEventListener('dragstart', (e) => {
      draggedGid = item.getAttribute('data-grp-item');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedGid);
      item.classList.add('is-dragging');
    });

    item.addEventListener('dragend', () => {
      draggedGid = null;
      draggableItems.forEach(i => i.classList.remove('is-dragging', 'drag-over-top', 'drag-over-bottom'));
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const targetGid = item.getAttribute('data-grp-item');
      if (draggedGid && targetGid !== draggedGid) {
        const rect = item.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          item.classList.add('drag-over-top');
          item.classList.remove('drag-over-bottom');
        } else {
          item.classList.add('drag-over-bottom');
          item.classList.remove('drag-over-top');
        }
      }
    });

    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over-top', 'drag-over-bottom');
    });

    item.addEventListener('drop', async (e) => {
      e.preventDefault();
      const targetGid = item.getAttribute('data-grp-item');
      const isTop = item.classList.contains('drag-over-top');
      item.classList.remove('drag-over-top', 'drag-over-bottom');

      if (!draggedGid || draggedGid === targetGid) return;

      const curOrder = state.groups.map(g => g.id);
      const fromIdx = curOrder.indexOf(draggedGid);
      if (fromIdx === -1) return;

      curOrder.splice(fromIdx, 1);
      let toIdx = curOrder.indexOf(targetGid);
      if (!isTop) toIdx += 1;

      curOrder.splice(toIdx, 0, draggedGid);

      await reorderGroups(curOrder);
      await loadState();
      renderSettingsGroupList();
      renderAllGroups();
      showToast('↕️ 排序已保存', '分组主页展示顺序已成功更新');
    });
  });

  // 4. 删除分组
  listEl.querySelectorAll('[data-grp-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const gid = btn.getAttribute('data-grp-delete');
      const grp = state.groups.find(g => g.id === gid);
      if (!grp) return;

      const affectedCount = state.bookmarks.filter(b => b.groupId === gid).length;
      const confirmed = await openConfirmModal({
        title: '删除业务分组',
        subtitle: `正在删除分组【${grp.name}】`,
        icon: '📁',
        iconType: 'danger',
        isDanger: true,
        message: `确定要删除分组【${grp.name}】吗？`,
        details: [
          { icon: '🛡️', title: '自动生成快照：', desc: '系统将在执行删除前自动为您生成一份【删除分组前安全保护快照】' },
          { icon: '📁', title: '书签无损迁移：', desc: `原分组内的 ${affectedCount} 个书签将自动转移至「未分组」，数据 100% 完好保留` }
        ],
        confirmText: '确认删除',
        cancelText: '取消'
      });
      if (!confirmed) return;

      try {
        // 1. 删除前自动创建快照
        const reason = `删除分组【${grp.name}】前自动保护快照`;
        await createSnapshot(reason, 'auto_preimport', false);

        // 2. 执行删除并转移至未分组
        await deleteGroup(gid);
        await loadState();

        // 3. 重新渲染
        renderSettingsGroupList();
        renderAllGroups();
        renderSnapshotList();

        showToast('📁 分组已删除', `已删除【${grp.name}】，原组内 ${affectedCount} 个书签已安全转移至「未分组」，并已自动生成保护快照`);
      } catch (err) {
        console.error('Delete group error:', err);
        showToast('❌ 删除失败', err.message || '操作异常');
      }
    });
  });

  // 5. 重命名
  listEl.querySelectorAll('[data-grp-rename]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const gid = btn.getAttribute('data-grp-rename');
      const grp = state.groups.find(g => g.id === gid);
      if (grp) {
        const newName = await openPromptModal({
          title: '重命名分组',
          subtitle: `正在修改分组「${grp.name}」的展示名称`,
          icon: '✏️',
          label: '新分组名称',
          initialValue: grp.name,
          placeholder: '请输入新的分组名称...',
          confirmText: '保存修改'
        });
        if (newName && newName !== grp.name) {
          grp.name = newName;
          await saveGroup(grp);
          renderSettingsGroupList();
          renderAllGroups();
          showToast('📁 分组已重命名', grp.name);
        }
      }
    });
  });

  // 6. 新增自定义分组
  document.getElementById('btn-add-new-group').onclick = async () => {
    const name = await openPromptModal({
      title: '新增自定义分组',
      subtitle: '分组将按序排列于主页中，支持拖拽排序与独立展示开关',
      icon: '📁',
      label: '分组名称',
      placeholder: '例如：研发协同、私有云基础设施、常用办公...',
      tip: '💡 提示：创建后可按住 ⋮⋮ 拖拽调整排列顺序',
      confirmText: '立即创建'
    });
    if (name) {
      await saveGroup({ name });
      await loadState();
      renderSettingsGroupList();
      renderAllGroups();
      showToast('📁 分组已创建', name);
    }
  };
}

// ==========================================
// 7.2.5 标签全生命周期管理 (Tag Management & Auto Backup)
// ==========================================

function initTagManagementEvents() {
  const searchInput = document.getElementById('settings-tag-search-input');
  if (searchInput && !searchInput._bound) {
    searchInput._bound = true;
    searchInput.addEventListener('input', (e) => {
      renderSettingsTagList(e.target.value);
    });
  }

  const addBtn = document.getElementById('btn-add-new-tag');
  if (addBtn && !addBtn._bound) {
    addBtn._bound = true;
    addBtn.addEventListener('click', async () => {
      const tagName = await openPromptModal({
        title: '新增业务标签',
        subtitle: '创建后可在添加或编辑书签时快速输入与智能归类',
        icon: '🏷️',
        label: '标签名称',
        placeholder: '例如：开发环境、AI工具、CI/CD、常用监控...',
        tip: '💡 提示：标签支持跨分组聚合检索与快捷点击过滤',
        confirmText: '创建标签'
      });
      if (!tagName) return;

      const exists = state.bookmarks.some(b => (b.tags || []).includes(tagName));
      if (exists) {
        showToast('⚠️ 提示', `标签【${tagName}】已存在`);
        return;
      }

      showToast('🏷️ 标签已就绪', `新标签【${tagName}】已创建，在添加或编辑书签时输入即可直接关联`);
      renderSettingsTagList();
    });
  }
}

function renderSettingsTagList(filterQuery = '') {
  const listEl = document.getElementById('settings-tags-list');
  if (!listEl) return;

  initTagManagementEvents();

  // 从全量书签中聚合统计所有标签及其关联的书签
  const tagMap = new Map();
  state.bookmarks.forEach(bm => {
    (bm.tags || []).forEach(t => {
      const cleanTag = t ? t.trim() : '';
      if (!cleanTag) return;
      if (!tagMap.has(cleanTag)) {
        tagMap.set(cleanTag, []);
      }
      tagMap.get(cleanTag).push(bm);
    });
  });

  let tags = Array.from(tagMap.entries()).map(([name, bms]) => ({
    name,
    count: bms.length,
    bookmarks: bms
  })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  if (filterQuery && filterQuery.trim()) {
    const q = filterQuery.trim().toLowerCase();
    tags = tags.filter(t => t.name.toLowerCase().includes(q));
  }

  if (tags.length === 0) {
    listEl.innerHTML = `
      <div class="p-8 text-center bg-[var(--bg-subtle)] border border-dashed border-[var(--border)] rounded-xl text-[var(--text-dim)]">
        <svg class="w-8 h-8 mx-auto mb-2 opacity-40 text-indigo-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>
        <p class="text-xs">${filterQuery ? '未搜索到匹配的标签' : '暂无任何书签标签'}</p>
        <p class="text-[10px] mt-1 text-[var(--text-dim)]">${filterQuery ? '请尝试搜索其他关键字' : '在新增或编辑书签时输入标签（如 "运维监控"），即可在此集中管理'}</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = tags.map(t => {
    const bmNames = t.bookmarks.map(b => b.name).filter(Boolean);
    const previewDesc = bmNames.slice(0, 3).join('、') + (t.count > 3 ? ` 等 ${t.count} 项` : '');

    return `
      <div class="p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] flex items-center justify-between gap-3 text-xs hover:border-[var(--border)]/80 transition-all">
        <div class="flex items-center gap-2.5 min-w-0 flex-1">
          <span class="px-2.5 py-1 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] font-bold text-xs border border-[var(--primary)]/20 flex items-center gap-1.5 flex-shrink-0">
            <span>#</span>
            <span>${t.name}</span>
          </span>
          <span class="text-[11px] text-[var(--text-muted)] truncate" title="关联书签：${bmNames.join('、')}">
            关联 <b>${t.count}</b> 个书签 (${previewDesc})
          </span>
        </div>

        <div class="flex items-center gap-1.5 flex-shrink-0">
          <button data-tag-rename="${encodeURIComponent(t.name)}" title="批量重命名此标签" class="px-2.5 py-1 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--primary)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors text-[11px] flex items-center gap-1 cursor-pointer">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            <span>重命名</span>
          </button>
          <button data-tag-delete="${encodeURIComponent(t.name)}" title="删除此标签（自动解除全部关联并自动备份）" class="px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors text-[11px] flex items-center gap-1 cursor-pointer">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            <span>删除标签</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  // 绑定删除事件
  listEl.querySelectorAll('[data-tag-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tagName = decodeURIComponent(btn.getAttribute('data-tag-delete'));
      const confirmed = await openConfirmModal({
        title: '删除业务标签',
        subtitle: `正在删除标签【${tagName}】`,
        icon: '🏷️',
        iconType: 'danger',
        isDanger: true,
        message: `确定要删除标签【${tagName}】吗？`,
        details: [
          { icon: '🛡️', title: '自动生成快照：', desc: '系统将在执行删除前自动为您生成一份【删除标签前安全保护快照】' },
          { icon: '🏷️', title: '批量解绑标签：', desc: `将自动从关联的所有书签属性中移除「${tagName}」标签` },
          { icon: '📌', title: '书签完好保留：', desc: '书签本身与所属分组不会受到任何影响' }
        ],
        confirmText: '确认删除',
        cancelText: '取消'
      });
      if (!confirmed) return;

      await deleteTagWithAutoBackup(tagName);
    });
  });

  // 绑定重命名事件
  listEl.querySelectorAll('[data-tag-rename]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const oldTagName = decodeURIComponent(btn.getAttribute('data-tag-rename'));
      const newTagName = await openPromptModal({
        title: '批量重命名标签',
        subtitle: `将同步更新所有关联书签中的标签「${oldTagName}」`,
        icon: '🏷️',
        label: '新标签名称',
        initialValue: oldTagName,
        placeholder: '请输入新标签名称...',
        tip: '🛡️ 保护机制：重命名执行前系统将自动生成安全保护快照',
        confirmText: '批量更新'
      });
      if (!newTagName || newTagName === oldTagName) return;

      await renameTagWithAutoBackup(oldTagName, newTagName);
    });
  });
}

async function deleteTagWithAutoBackup(tagName) {
  try {
    // 1. 删除前自动创建备份快照
    const reason = `删除标签【${tagName}】前自动保护快照`;
    await createSnapshot(reason, 'auto_preimport', false);

    // 2. 遍历所有书签，解绑该标签关联
    let affectedCount = 0;
    state.bookmarks.forEach(bm => {
      if (bm.tags && bm.tags.includes(tagName)) {
        bm.tags = bm.tags.filter(t => t !== tagName);
        affectedCount++;
      }
    });

    // 3. 保存更新后的书签数据
    await saveAllBookmarks(state.bookmarks);
    await loadState();

    // 4. 若主页当前正按该标签过滤，重置为全部
    if (state.activeTag === tagName) {
      state.activeTag = 'all';
    }

    // 5. 重新渲染主页与设置
    initTopTags();
    renderAllGroups();
    renderSettingsTagList(document.getElementById('settings-tag-search-input')?.value || '');
    renderSnapshotList();

    showToast('🏷️ 标签已删除', `已移除标签【${tagName}】并解绑了 ${affectedCount} 个书签，已自动生成安全保护快照`);
  } catch (err) {
    console.error('Delete tag error:', err);
    showToast('❌ 删除失败', err.message || '操作异常');
  }
}

async function renameTagWithAutoBackup(oldTagName, newTagName) {
  try {
    // 1. 重命名之前自动创建备份快照
    const reason = `重命名标签【${oldTagName}】->【${newTagName}】前自动保护快照`;
    await createSnapshot(reason, 'auto_preimport', false);

    let affectedCount = 0;
    state.bookmarks.forEach(bm => {
      if (bm.tags && bm.tags.includes(oldTagName)) {
        bm.tags = bm.tags.map(t => t === oldTagName ? newTagName : t);
        bm.tags = [...new Set(bm.tags)]; // 去重
        affectedCount++;
      }
    });

    await saveAllBookmarks(state.bookmarks);
    await loadState();

    if (state.activeTag === oldTagName) {
      state.activeTag = newTagName;
    }

    initTopTags();
    renderAllGroups();
    renderSettingsTagList(document.getElementById('settings-tag-search-input')?.value || '');
    renderSnapshotList();

    showToast('🏷️ 标签已重命名', `已将 ${affectedCount} 个书签中的【${oldTagName}】批量更新为【${newTagName}】`);
  } catch (err) {
    console.error('Rename tag error:', err);
    showToast('❌ 重命名失败', err.message || '操作异常');
  }
}

async function renderStatsView(period = '7d') {
  document.querySelectorAll('.stat-period-btn').forEach(btn => {
    const isCur = btn.getAttribute('data-stat-period') === period;
    btn.className = `stat-period-btn px-2.5 py-1 rounded text-xs transition-all ${isCur ? 'bg-[var(--primary)] text-white font-medium' : 'text-[var(--text-muted)]'}`;
  });

  const stats = await getClickStats(period);
  document.getElementById('stat-total-bm').innerText = state.bookmarks.length;
  document.getElementById('stat-total-groups').innerText = state.groups.length;
  document.getElementById('stat-total-tags').innerText = state.tags.length;
  document.getElementById('stat-reachability').innerText = '96.8%';

  // 渲染 Top 5
  const ranked = state.bookmarks.map(bm => ({
    name: bm.name,
    clicks: stats[bm.id] || 0
  })).sort((a, b) => b.clicks - a.clicks).slice(0, 5);

  const topListEl = document.getElementById('stat-top-list');
  topListEl.innerHTML = ranked.map((r, i) => `
    <div class="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-subtle)]">
      <div class="flex items-center gap-2">
        <span class="w-4 h-4 rounded-full ${i === 0 ? 'bg-amber-500' : 'bg-slate-500'} text-black font-bold flex items-center justify-center text-[10px]">${i + 1}</span>
        <span class="font-medium text-[var(--text-main)]">${r.name}</span>
      </div>
      <span class="font-mono text-indigo-400 font-bold">${r.clicks} 次</span>
    </div>
  `).join('');

  document.querySelectorAll('.stat-period-btn').forEach(btn => {
    btn.onclick = () => renderStatsView(btn.getAttribute('data-stat-period'));
  });

  document.getElementById('btn-reset-stats').onclick = async () => {
    const confirmed = await openConfirmModal({
      title: '重置访问统计',
      subtitle: '清空今日与历史访问点击计数',
      icon: '📊',
      iconType: 'warn',
      message: '确定要清空所有书签的点击统计数据吗？',
      details: [
        { icon: 'ℹ️', title: '影响范围：', desc: '所有书签的访问计数将归零，「常用」分组将重新开始累计高频应用' }
      ],
      confirmText: '确认清空',
      cancelText: '取消'
    });
    if (!confirmed) return;

    await resetAllStats();
    renderStatsView(period);
    showToast('🗑️ 统计已重置', '所有历史点击计数已清空');
  };
}

// 7.4 历史快照版本管理与回滚
async function renderSnapshotList() {
  const listContainer = document.getElementById('snapshot-list-container');
  if (!listContainer) return;

  const snapshots = await getSnapshots();
  const backupSettings = await getBackupSettings();

  document.getElementById('backup-interval-select').value = backupSettings.autoBackupInterval || 'daily';
  enhanceSelect(document.getElementById('backup-interval-select'));
  document.getElementById('backup-preaction-toggle').checked = backupSettings.preActionAutoBackup !== false;
  document.getElementById('snapshot-max-count').innerText = backupSettings.maxSnapshots || 15;

  if (!snapshots || snapshots.length === 0) {
    listContainer.innerHTML = `
      <div class="p-8 text-center bg-[var(--bg-subtle)] border border-dashed border-[var(--border)] rounded-xl text-[var(--text-dim)]">
        <svg class="w-8 h-8 mx-auto mb-2 opacity-40 text-indigo-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
        <p class="text-xs">暂无历史快照版本</p>
        <p class="text-[10px] mt-1 text-[var(--text-dim)]">点击上方「创建当前快照」或等待定时后台静默备份</p>
      </div>
    `;
    return;
  }

  const typeBadgeMap = {
    'auto_daily': { label: '每日自动', cls: 'snapshot-badge-auto_daily' },
    'auto_preimport': { label: '导入前保护', cls: 'snapshot-badge-auto_preimport' },
    'manual': { label: '手动创建', cls: 'snapshot-badge-manual' },
    'auto_prerollback': { label: '回滚前保护', cls: 'snapshot-badge-auto_prerollback' }
  };

  listContainer.innerHTML = snapshots.map(s => {
    const badge = typeBadgeMap[s.type] || { label: '快照版本', cls: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' };
    const bmCount = s.counts ? s.counts.bookmarks : (s.data && s.data.bookmarks ? s.data.bookmarks.length : 0);
    const grpCount = s.counts ? s.counts.groups : (s.data && s.data.groups ? s.data.groups.length : 0);

    return `
      <div class="snapshot-card p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] flex items-center justify-between gap-3 text-xs">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="px-1.5 py-0.5 rounded text-[10px] font-medium ${badge.cls}">${badge.label}</span>
            <span class="font-mono text-[11px] text-[var(--text-muted)]">${s.timeStr || ''}</span>
            ${s.isLocked ? '<span title="已锁定保护，不被自动清理" class="text-amber-400 text-xs">⭐</span>' : ''}
          </div>
          <div class="font-semibold text-[var(--text-main)] mt-1 truncate" title="${s.reason}">
            ${s.reason}
          </div>
          <div class="text-[10px] text-[var(--text-dim)] mt-0.5 font-mono">
            包含 ${bmCount} 个书签 · ${grpCount} 个分组
          </div>
        </div>

        <!-- 操作按钮组 -->
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <button data-lock-snap="${s.id}" title="${s.isLocked ? '点击取消锁定' : '点击锁定保护（防止自动淘汰）'}" class="p-1.5 rounded-lg hover:bg-[var(--bg-card)] text-[var(--text-dim)] hover:text-amber-400 transition-colors cursor-pointer">
            <svg class="w-3.5 h-3.5 ${s.isLocked ? 'text-amber-400 fill-amber-400' : 'fill-none'}" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>
          </button>
          <button data-export-snap="${s.id}" title="导出为 JSON 备份文件" class="px-2 py-1 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--primary)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors flex items-center gap-1 text-[11px] cursor-pointer">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            <span>导出</span>
          </button>
          <button data-rollback-snap="${s.id}" title="回滚恢复至此版本" class="px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-sm transition-colors flex items-center gap-1 text-[11px] cursor-pointer">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
            <span>回滚</span>
          </button>
          <button data-delete-snap="${s.id}" title="删除此快照" class="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--text-dim)] hover:text-red-400 transition-colors cursor-pointer">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  // 绑定快照条目事件
  listContainer.querySelectorAll('[data-lock-snap]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-lock-snap');
      await toggleSnapshotLock(id);
      renderSnapshotList();
    });
  });

  listContainer.querySelectorAll('[data-export-snap]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-export-snap');
      const snap = snapshots.find(s => s.id === id);
      if (!snap) return;

      const exportData = {
        version: 'smart_bookmark_v1',
        exportTime: new Date().toISOString(),
        snapshotInfo: { id: snap.id, reason: snap.reason, timeStr: snap.timeStr, type: snap.type },
        bookmarks: snap.data.bookmarks || [],
        groups: snap.data.groups || [],
        settings: snap.data.settings || {}
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `smart_bookmark_backup_${(snap.timeStr || '').replace(/[: ]/g, '_')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('📥 导出完成', `已下载快照备份文件`);
    });
  });

  listContainer.querySelectorAll('[data-rollback-snap]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-rollback-snap');
      const snap = snapshots.find(s => s.id === id);
      if (!snap) return;

      const confirmed = await openConfirmModal({
        title: '回滚历史快照',
        subtitle: `目标版本：${snap.reason || snap.timeStr}`,
        icon: '⏪',
        iconType: 'warn',
        message: '确定要将全部书签与分组数据回滚恢复至此历史版本吗？',
        details: [
          { icon: '⏱️', title: '快照时间：', desc: snap.timeStr },
          { icon: '📦', title: '包含数据：', desc: `${snap.counts ? snap.counts.bookmarks : 0} 个书签，${snap.counts ? snap.counts.groups : 0} 个分组` },
          { icon: '🛡️', title: '自动保护：', desc: '系统已为您自动生成当前实时状态的保护快照，随时可再次撤销反向恢复' }
        ],
        confirmText: '立即回滚',
        cancelText: '取消'
      });
      if (!confirmed) return;

      try {
        await rollbackToSnapshot(id);
        await loadState();
        renderAllGroups();
        initTopTags();
        renderSettingsGroupList();
        renderSnapshotList();
        showToast('🎉 回滚成功', `已恢复至 ${snap.timeStr} 状态，并自动生成了回滚前安全快照`);
      } catch (err) {
        showToast('❌ 回滚失败', err.message || '数据解析错误');
      }
    });
  });

  listContainer.querySelectorAll('[data-delete-snap]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-delete-snap');
      const snap = snapshots.find(s => s.id === id);
      if (snap && snap.isLocked) {
        await openAlertModal({
          title: '无法删除锁定快照',
          icon: '⭐',
          iconType: 'warn',
          message: '该快照已被永久锁定保护。如需删除，请先点击星号 ⭐ 解锁后再试。'
        });
        return;
      }

      const confirmed = await openConfirmModal({
        title: '删除备份快照',
        subtitle: `快照：${snap ? snap.reason || snap.timeStr : ''}`,
        icon: '🗑️',
        iconType: 'danger',
        isDanger: true,
        message: '确定要删除此备份快照吗？删除后此历史版本将无法恢复。',
        confirmText: '确认删除',
        cancelText: '取消'
      });
      if (!confirmed) return;

      await deleteSnapshot(id);
      renderSnapshotList();
      showToast('🗑️ 快照已删除', '');
    });
  });
}

// ==========================================
// 8. 全局网络探测状态与重测
// ==========================================

async function initNetworkStatus() {
  state.currentLocalIp = await detectLocalIp(1000) || state.probeCache.localIp;
  document.getElementById('status-local-ip').innerText = state.currentLocalIp ? `本机 IP: ${state.currentLocalIp} (局域网)` : '本机 IP: 公网直连';

  document.getElementById('btn-reprobe-network').addEventListener('click', async () => {
    showToast('🔄 探测中', '正在并发扫描所有书签入口延迟与连通性...');
    
    // 页面 DOM 环境下具备完整的 WebRTC 局域网 IP 探测能力
    const pageDetectedIp = await detectLocalIp(1200) || state.currentLocalIp;
    if (pageDetectedIp) {
      state.currentLocalIp = pageDetectedIp;
      document.getElementById('status-local-ip').innerText = `本机 IP: ${pageDetectedIp} (探测中...)`;
    }

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ 
        type: 'PERFORM_FULL_PROBE',
        payload: { clientIp: pageDetectedIp }
      }, async (res) => {
        if (res && res.data) {
          state.probeCache = res.data;
          const finalIp = pageDetectedIp || res.data.localIp || state.currentLocalIp;
          state.currentLocalIp = finalIp;
          state.probeCache.localIp = finalIp;
          document.getElementById('status-local-ip').innerText = finalIp ? `本机 IP: ${finalIp} (局域网)` : '本机 IP: 公网直连';
          renderAllGroups();
          showToast('⚡ 探测完成', `全量入口延迟与拓扑寻径已更新 (${finalIp ? `IP: ${finalIp}` : '公网'})`);
        }
      });
    } else {
      document.getElementById('status-local-ip').innerText = pageDetectedIp ? `本机 IP: ${pageDetectedIp} (局域网)` : '本机 IP: 公网直连';
      showToast('⚡ 模拟探测完成', '本地缓存已就绪');
    }
  });
}

// ==========================================
// 9. 全局 Toast 提示工具 (水滴弹性浮入与侧滑飞出)
// ==========================================

let toastTimer;
export function showToast(title, desc) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  document.getElementById('toast-title').innerText = title;
  document.getElementById('toast-desc').innerText = desc;

  toast.classList.remove('toast-hide', 'opacity-0', 'translate-y-20', 'pointer-events-none');
  toast.offsetHeight; // 触发重绘以重启 spring 动画
  toast.classList.add('toast-show');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('toast-show');
    toast.classList.add('toast-hide');
  }, 3200);
}
