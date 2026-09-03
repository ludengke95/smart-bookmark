<script>
  import { onMount, onDestroy } from 'svelte';
  import { appState } from '../../state/app.svelte.js';
  import { DEFAULT_SEARCH_ENGINES } from '../../constants/index.js';
  import { toast } from '../../state/toast.svelte.js';
  import { t, i18n } from '../../i18n/index.svelte.js';

  let currentTimeStr = $state('--:--');
  let currentDateStr = $state('');
  let timer = null;
  let showEngineMenu = $state(false);
  let searchInputEl = $state(null);

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

    const isEn = i18n.currentLocale === 'en-US';
    if (isEn) {
      const options = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };
      currentDateStr = now.toLocaleDateString('en-US', options);
    } else {
      const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
      const Y = now.getFullYear();
      const M = now.getMonth() + 1;
      const D = now.getDate();
      const dayStr = days[now.getDay()];
      currentDateStr = `${Y}年${M}月${D}日 ${dayStr}`;
    }
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

  function handleSearchSubmit(e) {
    e?.preventDefault();
    const q = appState.searchQuery.trim();
    if (!q) return;

    // 如果当前有匹配的书签，直接直达第一个书签的最优入口
    if (appState.filteredBookmarks.length > 0) {
      const targetBm = appState.filteredBookmarks[0];
      const route = appState.getBookmarkRoute(targetBm);
      if (route.optimal?.url) {
        appState.recordClick(targetBm.id);
        toast.show(`⚡ 直达: ${targetBm.name}`);
        window.location.href = route.optimal.url;
        return;
      }
    }

    // 否则调用当前选中的搜索引擎
    const engine = appState.selectedEngine;
    window.location.href = `${engine.url}${encodeURIComponent(q)}`;
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
          title="点击切换搜索引擎"
        >
          <span class="w-4 h-4 rounded-full bg-subtle flex items-center justify-center text-[10px] font-bold {appState.selectedEngine.colorClass}">
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
                <span class="w-4 h-4 rounded-full bg-subtle flex items-center justify-center text-[10px] font-bold {eng.colorClass}">
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
            title="清空搜索"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        {:else}
          <kbd class="hidden sm:inline-block px-1.5 py-0.5 rounded border border-border-subtle bg-subtle text-[10px] font-mono text-text-tertiary leading-none">
            /
          </kbd>
        {/if}

        <button
          type="submit"
          class="p-1.5 rounded-full bg-accent text-accent-fg hover:opacity-90 transition-opacity"
          title="搜索"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      </div>
    </form>
  </div>
</section>
