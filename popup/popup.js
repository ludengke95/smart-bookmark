/**
 * Smart Bookmark Popup 快捷弹窗逻辑控制器
 */
import { initStorage, getBookmarks, saveBookmark, getProbeCache, getAllTagsWithCount, getClickStats } from '../common/storage.js';
import { initTheme } from '../common/theme.js';
import { renderIcon } from '../common/icons-library.js';
import { sortEndpointsByTopology, classifyUrl } from '../background/xor-matcher.js';
import { detectLocalIp } from '../background/ip-detector.js';

let bookmarks = [];
let probeCache = { localIp: '', results: {} };
let activeTag = 'all';
let currentSelectedIndex = 0;
let filteredList = [];

document.addEventListener('DOMContentLoaded', async () => {
  await initStorage();
  await initTheme();

  bookmarks = await getBookmarks();
  probeCache = await getProbeCache();

  // 渲染当前检测到的 IP
  const localIp = probeCache.localIp || await detectLocalIp(600);
  document.getElementById('popup-local-ip').innerText = localIp ? `${localIp} (局域网)` : '公网';

  initTags();
  renderList();
  initSearch();
  initKeyNavigation();
  initActions();
});

function initTags() {
  const container = document.getElementById('popup-tag-bar');
  getAllTagsWithCount().then(tags => {
    let html = `
      <button data-tag="all" class="px-2 py-0.5 rounded font-medium flex-shrink-0 transition-all ${activeTag === 'all' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border)]'}">
        常用
      </button>
    `;
    tags.slice(0, 5).forEach(t => {
      html += `
        <button data-tag="${t.name}" class="px-2 py-0.5 rounded flex-shrink-0 transition-all ${activeTag === t.name ? 'bg-[var(--primary)] text-white font-medium' : 'bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border)]'}">
          ${t.name}
        </button>
      `;
    });
    container.innerHTML = html;

    container.querySelectorAll('[data-tag]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTag = btn.getAttribute('data-tag');
        initTags();
        renderList();
      });
    });
  });
}

async function renderList() {
  const container = document.getElementById('popup-bookmark-list');
  const searchInput = document.getElementById('popup-search-input');
  const query = (searchInput.value || '').trim().toLowerCase();
  const clickStats = await getClickStats('30d');

  // 过滤
  filteredList = bookmarks.filter(b => {
    if (activeTag !== 'all' && !(b.tags || []).includes(activeTag)) return false;
    if (query) {
      const inName = (b.name || '').toLowerCase().includes(query);
      const inTags = (b.tags || []).some(t => t.toLowerCase().includes(query));
      const inUrls = (b.endpoints || []).some(ep => (ep.url || '').toLowerCase().includes(query));
      return inName || inTags || inUrls;
    }
    return true;
  });

  // 按使用频次高频优先排序
  filteredList.sort((a, b) => {
    const clicksA = clickStats[a.id] || 0;
    const clicksB = clickStats[b.id] || 0;
    if (clicksB !== clicksA) return clicksB - clicksA;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  if (filteredList.length === 0) {
    container.innerHTML = `<div class="p-6 text-center text-xs text-[var(--text-muted)]">未找到匹配的书签</div>`;
    return;
  }

  // 保证选中索引在有效区间
  if (currentSelectedIndex >= filteredList.length) {
    currentSelectedIndex = 0;
  }

  container.innerHTML = filteredList.map((bm, index) => {
    const decision = sortEndpointsByTopology(bm.endpoints, probeCache.localIp, probeCache.results);
    const optimal = decision.optimal;
    const isIntranet = optimal && optimal.isIntranet;
    
    let latencyText = isIntranet ? '内网' : '外网';
    let badgeClass = isIntranet ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400';

    if (optimal) {
      const rawLatency = optimal.latency;
      const isReachable = optimal.reachable !== false;

      if (rawLatency !== null && rawLatency !== undefined) {
        if (isReachable && rawLatency < 1800) {
          latencyText = `${rawLatency}ms`;
          badgeClass = isIntranet ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400';
        } else {
          latencyText = isIntranet ? '内网·离线' : '超时';
          badgeClass = 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
        }
      }
    } else {
      latencyText = '无入口';
      badgeClass = 'bg-slate-500/20 text-slate-400';
    }

    const isSelected = index === currentSelectedIndex;

    return `
      <div data-bm-index="${index}" class="popup-item p-2 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${isSelected ? 'bg-[var(--bg-card-hover)] border-[var(--primary)] shadow-sm' : 'border-transparent hover:bg-[var(--bg-card-hover)] hover:border-[var(--border)]'}">
        <div class="flex items-center gap-2 min-w-0">
          <div class="w-7 h-7 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)] flex items-center justify-center flex-shrink-0">
            ${renderIcon(bm.iconKey, bm.iconData, 'w-4 h-4')}
          </div>
          <div class="min-w-0">
            <div class="text-xs font-semibold text-[var(--text-main)] truncate">${bm.name}</div>
            <div class="text-[10px] text-[var(--text-dim)] font-mono truncate">${optimal ? optimal.url : ''}</div>
          </div>
        </div>

        <div class="flex items-center gap-1.5 flex-shrink-0">
          <span class="text-[10px] px-1.5 py-0.5 rounded font-mono ${badgeClass}">
            ${latencyText}
          </span>
          <svg class="w-3.5 h-3.5 text-[var(--text-dim)]" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-bm-index]').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.getAttribute('data-bm-index'), 10);
      jumpToBookmark(filteredList[idx]);
    });
  });
}

function initSearch() {
  const input = document.getElementById('popup-search-input');
  input.addEventListener('input', () => {
    currentSelectedIndex = 0;
    renderList();
  });
}

function initKeyNavigation() {
  document.addEventListener('keydown', (e) => {
    if (filteredList.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      currentSelectedIndex = (currentSelectedIndex + 1) % filteredList.length;
      renderList();
      scrollToActive();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      currentSelectedIndex = (currentSelectedIndex - 1 + filteredList.length) % filteredList.length;
      renderList();
      scrollToActive();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredList[currentSelectedIndex]) {
        jumpToBookmark(filteredList[currentSelectedIndex]);
      }
    }
  });
}

function scrollToActive() {
  const activeEl = document.querySelector('.popup-item.border-\\[var\\(--primary\\)\\]');
  if (activeEl) {
    activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function jumpToBookmark(bookmark) {
  if (!bookmark) return;

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({
      type: 'SMART_JUMP',
      payload: {
        bookmarkId: bookmark.id,
        endpoints: bookmark.endpoints,
        openInNewTab: true
      }
    }, () => {
      window.close();
    });
  } else {
    const decision = sortEndpointsByTopology(bookmark.endpoints, probeCache.localIp, probeCache.results);
    if (decision.optimal && decision.optimal.url) {
      window.open(decision.optimal.url, '_blank');
    }
  }
}

function initActions() {
  // 打开完整管理页
  document.getElementById('btn-open-manager').addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: chrome.runtime.getURL('newtab/newtab.html') });
    } else {
      window.open('../newtab/newtab.html', '_blank');
    }
  });

  // 添加当前页面为书签
  document.getElementById('btn-add-current-tab').addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (tabs && tabs[0]) {
          const tab = tabs[0];
          const newBm = {
            name: tab.title || '新书签',
            groupId: 'group_system_pinned',
            tags: ['浏览器标签'],
            endpoints: [{
              url: tab.url,
              order: 0,
              type: classifyUrl(tab.url).type
            }],
            iconKey: 'globe'
          };
          await saveBookmark(newBm);
          bookmarks = await getBookmarks();
          renderList();
          showPopupToast(`✓ 已添加 [${newBm.name}]`);
        }
      });
    } else {
      showPopupToast('✓ 已模拟添加当前页面');
    }
  });
}

function showPopupToast(text) {
  const toast = document.getElementById('popup-toast');
  const textEl = document.getElementById('popup-toast-text');
  if (toast && textEl) {
    textEl.innerText = text;
    toast.classList.remove('hidden');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 2200);
  }
}
