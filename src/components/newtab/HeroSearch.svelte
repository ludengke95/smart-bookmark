<script>
  import { onMount, onDestroy } from 'svelte';
  import { appState } from '../../state/app.svelte.js';
  import { DEFAULT_SEARCH_ENGINES } from '../../constants/index.js';
  import { toast } from '../../state/toast.svelte.js';
  import { t, i18n } from '../../i18n/index.svelte.js';
  import { openInNewTab } from '../../services/navigation.js';

  let currentTimeStr = $state('--:--');
  let currentDateStr = $state('');
  let timer = null;
  let showEngineMenu = $state(false);
  let searchInputEl = $state(null);
  let isFocused = $state(false);
  let activeActionIndex = $state(0); // 0: 搜索引擎, 1..N: 直达最佳书签

  let candidateBookmarks = $derived(appState.filteredBookmarks.slice(0, 4));
  let totalActions = $derived(1 + candidateBookmarks.length);
  let hasQuery = $derived(Boolean(appState.searchQuery?.trim()));
  let showSuggestions = $derived(isFocused && hasQuery);

  function formatHost(urlStr) {
    try {
      return new URL(urlStr).hostname;
    } catch {
      return '';
    }
  }

  function updateClock() {
    const now = new Date();
    const is24h = appState.settings.clockFormat !== '12';
    const showSec = !!appState.settings.showSeconds;

    let h = now.getHours();
    if (!is24h) {
      h = h % 12 || 12;
    }
    const hh = String(h).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');

    currentTimeStr = showSec ? `${hh} : ${mm} : ${ss}` : `${hh} : ${mm}`;

    const locale = i18n.currentLocale === 'en-US' ? 'en-US' : 'zh-CN';
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    currentDateStr = now.toLocaleDateString(locale, dateOptions);
  }

  onMount(() => {
    updateClock();
    timer = setInterval(updateClock, 1000);

    const handleKeyDown = (e) => {
      if (e.key === '/' && document.activeElement !== searchInputEl && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        searchInputEl?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  function executeEngineSearch(customQuery) {
    const q = (customQuery !== undefined ? customQuery : appState.searchQuery).trim();
    if (!q) return;
    const engine = appState.selectedEngine;
    openInNewTab(`${engine.url}${encodeURIComponent(q)}`);
    isFocused = false;
    searchInputEl?.blur();
  }

  function executeDirectBookmark(bm) {
    if (!bm) return;
    const route = appState.getBookmarkRoute(bm);
    if (route.optimal?.url) {
      appState.recordClick(bm.id);
      toast.show(t('search.directJump', { name: bm.name }));
      openInNewTab(route.optimal.url);
      isFocused = false;
      searchInputEl?.blur();
    }
  }

  function handleInputKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeActionIndex = (activeActionIndex + 1) % totalActions;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeActionIndex = (activeActionIndex - 1 + totalActions) % totalActions;
    } else if (e.key === 'Escape') {
      isFocused = false;
      searchInputEl?.blur();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const q = appState.searchQuery.trim();
      if (!q) return;

      if (e.shiftKey) {
        // Shift + Enter: 优先直达首个书签
        if (candidateBookmarks.length > 0) {
          executeDirectBookmark(candidateBookmarks[0]);
          return;
        }
        executeEngineSearch(q);
      } else {
        // 普通 Enter: 按照当前聚焦动作执行
        if (activeActionIndex > 0 && candidateBookmarks[activeActionIndex - 1]) {
          executeDirectBookmark(candidateBookmarks[activeActionIndex - 1]);
        } else {
          executeEngineSearch(q);
        }
      }
    }
  }

  function handleSearchSubmit(e) {
    e?.preventDefault();
    const q = appState.searchQuery.trim();
    if (!q) return;

    if (activeActionIndex > 0 && candidateBookmarks[activeActionIndex - 1]) {
      executeDirectBookmark(candidateBookmarks[activeActionIndex - 1]);
    } else {
      executeEngineSearch(q);
    }
  }

  function handleSelectEngine(engId) {
    appState.setEngine(engId);
    showEngineMenu = false;
  }
</script>

<section class="flex flex-col items-center justify-center pt-8 pb-4 px-4 text-center select-none">
  <!-- 极简轻量等宽时钟 -->
  <div class="font-mono text-5xl sm:text-6xl font-extralight tracking-tight text-text-primary transition-all duration-300">
    {currentTimeStr}
  </div>

  <!-- 日期展示 -->
  <div class="text-xs text-text-secondary font-medium tracking-wide mt-2">
    {currentDateStr}
  </div>

  <!-- 极简座右铭 -->
  {#if appState.settings.motto}
    <div class="text-xs text-text-tertiary mt-1.5 max-w-md truncate">
      {appState.settings.motto}
    </div>
  {/if}

  <!-- 极简胶囊搜索框 -->
  <div class="w-full max-w-xl mt-6 relative">
    <form
      onsubmit={handleSearchSubmit}
      class="relative flex items-center bg-surface border border-border-subtle focus-within:border-border-focus focus-within:shadow-md rounded-full px-3.5 py-2.5 transition-all duration-150"
    >
      <!-- 搜索引擎选择器 -->
      <div class="relative flex-shrink-0">
        <button
          type="button"
          onclick={() => (showEngineMenu = !showEngineMenu)}
          class="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full hover:bg-subtle text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          aria-label={t('search.engineSwitch')}
        >
          <span class="w-4 h-4 rounded-full bg-subtle flex items-center justify-center text-[11px] font-bold {appState.selectedEngine.colorClass}">
            {appState.selectedEngine.iconText}
          </span>
          <svg class="w-3 h-3 text-text-tertiary" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <!-- 引擎下拉菜单 -->
        {#if showEngineMenu}
          <div class="absolute left-0 top-full mt-2 w-36 bg-surface border border-border-subtle rounded-xl shadow-popover p-1 z-50 text-xs">
            {#each DEFAULT_SEARCH_ENGINES as eng}
              <button
                type="button"
                onclick={() => handleSelectEngine(eng.id)}
                class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-subtle text-left text-text-secondary hover:text-text-primary transition-colors {eng.id === appState.selectedEngine.id ? 'bg-subtle text-text-primary font-medium' : ''}"
              >
                <span class="w-4 h-4 rounded-full bg-subtle flex items-center justify-center text-[11px] font-bold {eng.colorClass}">
                  {eng.iconText}
                </span>
                <span>{eng.name}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- 搜索输入框 -->
      <input
        bind:this={searchInputEl}
        type="text"
        bind:value={appState.searchQuery}
        onfocus={() => { isFocused = true; activeActionIndex = 0; }}
        onblur={() => {
          // 延迟收起，确保下拉选项点击生效
          setTimeout(() => { isFocused = false; }, 180);
        }}
        onkeydown={handleInputKeyDown}
        placeholder={t('search.placeholder')}
        class="flex-1 bg-transparent border-0 outline-none px-3 text-xs sm:text-sm text-text-primary placeholder:text-text-tertiary min-w-0"
        autocomplete="off"
      />

      <!-- 快捷清除或快捷键提示 -->
      <div class="flex items-center gap-1.5 text-text-tertiary">
        {#if appState.searchQuery}
          <button
            type="button"
            onclick={() => (appState.searchQuery = '')}
            class="p-1 rounded-full hover:text-text-primary hover:bg-subtle transition-colors"
            aria-label={t('search.clearQuery')}
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        {:else}
          <kbd class="hidden sm:inline-block px-1.5 py-0.5 rounded border border-border-subtle bg-subtle text-[11px] font-mono text-text-tertiary leading-none">
            /
          </kbd>
        {/if}

        <button
          type="button"
          onclick={() => executeEngineSearch()}
          onauxclick={(e) => { if (e.button === 1) { e.preventDefault(); executeEngineSearch(); } }}
          class="p-1.5 rounded-full bg-accent text-accent-fg hover:opacity-90 transition-opacity cursor-pointer"
          aria-label={t('search.searchWithEngine', { engine: appState.selectedEngine.name })}
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      </div>
    </form>

    <!-- 搜索意图建议面板 (聚焦且有搜索词时展现) -->
    {#if showSuggestions}
      <div
        class="absolute left-0 right-0 top-full mt-2 bg-surface border border-border-subtle rounded-2xl shadow-popover p-1.5 z-40 text-left space-y-1 backdrop-blur-md"
      >
        <!-- 动作 0：调用所选搜索引擎搜索 (Enter 默认触发) -->
        <button
          type="button"
          onmousedown={(e) => { e.preventDefault(); executeEngineSearch(); }}
          onauxclick={(e) => { if (e.button === 1) { e.preventDefault(); executeEngineSearch(); } }}
          onmouseenter={() => (activeActionIndex = 0)}
          class="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer {activeActionIndex === 0 ? 'bg-subtle text-text-primary' : 'text-text-secondary hover:bg-subtle/70'}"
        >
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="w-5 h-5 rounded-full bg-subtle flex-shrink-0 flex items-center justify-center text-[11px] font-bold {appState.selectedEngine.colorClass}">
              {appState.selectedEngine.iconText}
            </span>
            <span class="text-text-secondary flex-shrink-0">
              {t('search.searchWithEngine', { engine: appState.selectedEngine.name })}:
            </span>
            <span class="font-medium text-text-primary truncate">
              "{appState.searchQuery.trim()}"
            </span>
          </div>
          <kbd class="flex-shrink-0 px-2 py-0.5 rounded border border-border-subtle bg-subtle text-[11px] font-mono text-text-tertiary">
            {t('search.shortcutEnter')}
          </kbd>
        </button>

        <!-- 动作 1..N：直达最佳匹配书签 (最多 4 个) -->
        {#each candidateBookmarks as bm, idx}
          {@const bmRoute = appState.getBookmarkRoute(bm)}
          {@const isActionActive = activeActionIndex === idx + 1}
          <button
            type="button"
            onmousedown={(e) => { e.preventDefault(); executeDirectBookmark(bm); }}
            onauxclick={(e) => { if (e.button === 1) { e.preventDefault(); executeDirectBookmark(bm); } }}
            onmouseenter={() => (activeActionIndex = idx + 1)}
            class="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer {isActionActive ? 'bg-subtle text-text-primary' : 'text-text-secondary hover:bg-subtle/70'}"
          >
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="w-5 h-5 rounded-full bg-status-warn/10 text-status-warn flex-shrink-0 flex items-center justify-center text-xs font-bold">
                ★
              </span>
              <span class="text-text-secondary flex-shrink-0">
                {t('search.directBookmark')}:
              </span>
              <span class="font-medium text-text-primary truncate">
                {bm.name}
              </span>
              {#if bmRoute?.optimal?.url}
                <span class="text-[11px] text-text-tertiary font-mono truncate hidden sm:inline">
                  ({formatHost(bmRoute.optimal.url)})
                </span>
              {/if}
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              {#if bmRoute?.optimal?.latency}
                <span class="font-mono text-[11px] text-status-intranet">{bmRoute.optimal.latency}ms</span>
              {/if}
              <kbd class="px-2 py-0.5 rounded border border-border-subtle bg-subtle text-[11px] font-mono text-text-tertiary">
                {idx === 0 ? t('search.shortcutShiftEnter') : t('search.shortcutEnter')}
              </kbd>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</section>
