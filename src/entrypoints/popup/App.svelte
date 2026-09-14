<script>
  import { onMount } from 'svelte';
  import { appState } from '../../state/app.svelte.js';
  import { toast } from '../../state/toast.svelte.js';
  import { classifyUrl } from '../../services/xor-matcher.js';
  import { openInNewTab } from '../../services/navigation.js';
  import {
    sanitizeUrlForStorage,
    matchCurrentTabWithBookmarks
  } from '../../services/bookmark-matcher.js';
  import { PINNED_GROUP_ID, UNGROUPED_GROUP_ID } from '../../constants/index.js';
  import { t } from '../../i18n/index.svelte.js';
  import { getGroupName } from '../../i18n/utils.js';
  import IconRender from '../../components/common/IconRender.svelte';
  import Toast from '../../components/common/Toast.svelte';
  import Select from '../../components/common/Select.svelte';

  let currentTab = $state({ title: '', url: '', favIconUrl: '' });
  let searchQuery = $state('');
  let isSavingTab = $state(false);
  let selectedGroupId = $state('');
  let showSaveTabForm = $state(false);
  let isAppendMode = $state(false);
  let showEndpointsDetail = $state(false);
  let searchInputEl = $state(null);

  const groupOptions = $derived(
    appState.groups
      .filter(g => g.id !== PINNED_GROUP_ID)
      .map(g => ({
        value: g.id,
        label: getGroupName(g),
        iconText: g.id === UNGROUPED_GROUP_ID ? '📄' : '📁'
      }))
  );

  $effect(() => {
    if (!selectedGroupId && groupOptions.length > 0) {
      selectedGroupId = groupOptions[0].value;
    }
  });

  // 响应式分析当前网页在书签库中的精确匹配
  let matchResult = $derived(
    matchCurrentTabWithBookmarks(currentTab.url, appState.bookmarks)
  );
  let existingBookmarkMatch = $derived(matchResult.exactMatch);
  let matchedEndpoint = $derived(matchResult.matchedEndpoint);

  let filteredList = $derived.by(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return appState.bookmarks.slice(0, 20);
    return appState.bookmarks.filter(bm => {
      const matchName = (bm.name || '').toLowerCase().includes(q);
      const matchTag = (bm.tags || []).some(t => t.toLowerCase().includes(q));
      const matchEp = (bm.endpoints || []).some(ep => (ep.url || '').toLowerCase().includes(q));
      return matchName || matchTag || matchEp;
    });
  });

  onMount(async () => {
    await appState.init();

    if (typeof chrome !== 'undefined' && chrome.tabs) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('edge://') && !tab.url.startsWith('about:')) {
          currentTab = {
            title: tab.title || '',
            url: tab.url,
            favIconUrl: tab.favIconUrl || ''
          };
        }
      } catch (e) {
        console.warn('读取当前活动标签页失败:', e);
      }
    }
  });

  function openNewTab() {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.runtime) {
      chrome.tabs.create({ url: chrome.runtime.getURL('/home.html') });
    } else {
      window.open('/home.html', '_blank');
    }
  }

  function startAppendMode() {
    isAppendMode = true;
    showSaveTabForm = false;
    searchQuery = '';
    setTimeout(() => {
      searchInputEl?.focus();
    }, 60);
  }

  function cancelAppendMode() {
    isAppendMode = false;
    searchQuery = '';
  }

  async function handleSaveCurrentTab() {
    if (!currentTab.url) return;
    isSavingTab = true;
    try {
      const cleanUrl = sanitizeUrlForStorage(currentTab.url);
      const classification = classifyUrl(cleanUrl);
      await appState.saveBookmark({
        name: currentTab.title || cleanUrl,
        groupId: selectedGroupId,
        tags: [],
        endpoints: [
          {
            url: cleanUrl,
            order: 0,
            type: classification.type
          }
        ]
      });
      toast.show(t('popup.saved'));
      showSaveTabForm = false;
    } catch (e) {
      toast.show(t('popup.saveFailed'));
    } finally {
      isSavingTab = false;
    }
  }

  async function handleAppendEndpoint(bm) {
    if (!currentTab.url) return;
    const cleanUrl = sanitizeUrlForStorage(currentTab.url);
    const urls = (bm.endpoints || []).map(e => sanitizeUrlForStorage(e.url));
    if (urls.includes(cleanUrl)) {
      toast.show(t('popup.alreadyExists'));
      return;
    }

    const classification = classifyUrl(cleanUrl);
    const updatedEndpoints = [
      ...(bm.endpoints || []),
      {
        url: cleanUrl,
        order: (bm.endpoints || []).length,
        type: classification.type
      }
    ];

    try {
      await appState.saveBookmark({
        ...bm,
        endpoints: updatedEndpoints
      });

      const topologyName = classification.type === 'intranet'
        ? t('popup.topologyIntranet')
        : t('popup.topologyExtranet');

      toast.show(t('popup.appendedWithTopology', { name: bm.name, topology: topologyName }));
      isAppendMode = false;
      searchQuery = '';
    } catch (e) {
      toast.show(t('popup.saveFailed'));
    }
  }

  function handleJump(bm) {
    if (isAppendMode) {
      handleAppendEndpoint(bm);
      return;
    }
    const route = appState.getBookmarkRoute(bm);
    if (route.optimal?.url) {
      appState.recordClick(bm.id);
      openInNewTab(route.optimal.url);
    } else {
      toast.show(t('popup.noValidEndpoint'));
    }
  }

  function handleSwitchToEndpoint(ep) {
    if (!ep?.url) return;
    if (typeof chrome !== 'undefined' && chrome.tabs?.update) {
      chrome.tabs.update({ url: ep.url });
      window.close();
    } else {
      window.location.href = ep.url;
    }
  }

  async function handleCopyEndpoint(epUrl) {
    if (!epUrl) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(epUrl);
      } else {
        const input = document.createElement('input');
        input.value = epUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      toast.show(t('popup.copiedEndpoint'));
    } catch (e) {
      toast.show(t('popup.copiedEndpoint'));
    }
  }

  function handleEditInNewTab(bm) {
    if (!bm?.id) return;
    const targetUrl = typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL(`/home.html?action=edit&id=${encodeURIComponent(bm.id)}`)
      : `/home.html?action=edit&id=${encodeURIComponent(bm.id)}`;
    openInNewTab(targetUrl);
    if (typeof window !== 'undefined' && window.close) {
      window.close();
    }
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape' && isAppendMode) {
      cancelAppendMode();
    }
  }}
/>

<div
  class="w-[380px] h-[520px] bg-canvas text-text-primary flex flex-col font-sans select-none overflow-hidden"
  role="region"
  aria-label="Smart Bookmark Popup"
>
  <!-- 头部栏 -->
  <header class="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle bg-surface flex-shrink-0">
    <div class="flex items-center gap-2">
      <div class="w-6 h-6 rounded-md bg-accent flex items-center justify-center text-accent-fg font-bold text-xs shadow-sm">
        S
      </div>
      <div>
        <h1 class="text-xs font-semibold text-text-primary leading-tight">{t('nav.title')}</h1>
        <!-- 本机 IP 徽章 -->
        <div class="flex items-center gap-1 text-[10px] font-mono text-text-tertiary">
          <span class="w-1.5 h-1.5 rounded-full {appState.localIp ? 'bg-status-intranet' : 'bg-text-tertiary'}"></span>
          <span>{appState.localIp || t('popup.detectingNetwork')}</span>
        </div>
      </div>
    </div>

    <!-- 右侧操作 -->
    <div class="flex items-center gap-1">
      <button
        type="button"
        onclick={() => appState.refreshNetwork()}
        class="p-1.5 rounded-lg hover:bg-subtle text-text-tertiary hover:text-text-primary transition-colors"
        aria-label={t('popup.refreshNetwork')}
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>

      <button
        type="button"
        onclick={openNewTab}
        class="p-1.5 rounded-lg hover:bg-subtle text-text-tertiary hover:text-text-primary transition-colors"
        aria-label={t('popup.openConsole')}
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </button>
    </div>
  </header>

  <!-- 当前网页快捷操作区 -->
  {#if currentTab.url}
    <div class="p-2.5 bg-surface/60 border-b border-border-subtle flex-shrink-0 text-xs">
      {#if isAppendMode}
        <!-- 追加入口模式提示条 -->
        <div class="flex items-center justify-between gap-2 p-2 rounded-lg bg-accent/10 border border-accent/30 text-accent">
          <div class="flex items-center gap-1.5 min-w-0 flex-1">
            <svg class="w-3.5 h-3.5 flex-shrink-0 animate-pulse" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span class="text-[11px] font-medium truncate">{t('popup.appendModePrompt')}</span>
          </div>
          <button
            type="button"
            onclick={cancelAppendMode}
            class="px-2 py-0.5 rounded bg-surface hover:bg-subtle text-text-secondary hover:text-text-primary text-[10px] font-medium transition-colors border border-border-subtle flex-shrink-0"
          >
            {t('common.cancel')}
          </button>
        </div>
      {:else if existingBookmarkMatch}
        <!-- 已收录状态面板 -->
        <div class="rounded-lg bg-subtle/80 border border-border-subtle p-2 space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0 flex-1">
              <IconRender iconKey={existingBookmarkMatch.iconKey} customIcon={existingBookmarkMatch.customIconBase64} size={18} />
              <div class="min-w-0 flex-1 truncate">
                <span class="font-medium text-text-primary truncate block leading-tight">{existingBookmarkMatch.name}</span>
                <span class="text-[10px] text-text-tertiary truncate block font-mono">
                  {matchedEndpoint?.type === 'intranet' ? t('popup.topologyIntranet') : t('popup.topologyExtranet')} · {matchedEndpoint?.url || currentTab.url}
                </span>
              </div>
            </div>

            <div class="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onclick={() => (showEndpointsDetail = !showEndpointsDetail)}
                class="px-1.5 py-1 rounded hover:bg-surface text-[10px] font-medium text-accent hover:opacity-90 transition-colors flex items-center gap-0.5 border border-transparent hover:border-border-subtle"
              >
                <span>{showEndpointsDetail ? t('popup.hideEndpoints') : t('popup.viewEndpoints', { count: (existingBookmarkMatch.endpoints || []).length })}</span>
                <span class="text-[8px]">{showEndpointsDetail ? '▲' : '▼'}</span>
              </button>
              <button
                type="button"
                onclick={() => handleEditInNewTab(existingBookmarkMatch)}
                class="p-1 rounded hover:bg-surface text-text-tertiary hover:text-text-primary transition-colors"
                aria-label={t('popup.editInNewTab')}
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            </div>
          </div>

          <!-- 折叠入口明细微列表 -->
          {#if showEndpointsDetail}
            <div class="pt-1.5 border-t border-border-subtle space-y-1 max-h-[105px] overflow-y-auto pr-0.5">
              {#each (existingBookmarkMatch.endpoints || []) as ep (ep.url)}
                {@const isCurrent = matchedEndpoint?.url === ep.url}
                {@const isIntranet = ep.type === 'intranet'}
                <div class="flex items-center justify-between gap-1 px-1.5 py-1 rounded bg-surface border border-border-subtle text-[10px] font-mono">
                  <div class="flex items-center gap-1.5 min-w-0 flex-1 truncate">
                    <span class="px-1 py-0.2 rounded text-[9px] font-medium {isIntranet ? 'bg-status-intranet/15 text-status-intranet' : 'bg-status-extranet/15 text-status-extranet'}">
                      {isIntranet ? t('popup.topologyIntranet') : t('popup.topologyExtranet')}
                    </span>
                    <span class="truncate {isCurrent ? 'font-semibold text-text-primary' : 'text-text-secondary'}">
                      {ep.url}
                    </span>
                  </div>

                  <div class="flex items-center gap-1 flex-shrink-0">
                    {#if isCurrent}
                      <span class="text-[9px] text-text-tertiary italic">{t('popup.currentEndpointBadge')}</span>
                    {:else}
                      <button
                        type="button"
                        onclick={() => handleSwitchToEndpoint(ep)}
                        class="px-1.5 py-0.5 rounded bg-subtle hover:bg-accent hover:text-accent-fg text-text-secondary transition-colors"
                        aria-label={t('popup.switchToEndpoint')}
                      >
                        {t('popup.switchToEndpoint')}
                      </button>
                    {/if}
                    <button
                      type="button"
                      onclick={() => handleCopyEndpoint(ep.url)}
                      class="p-0.5 rounded hover:bg-subtle text-text-tertiary hover:text-text-primary transition-colors"
                      aria-label={t('popup.copyEndpoint')}
                    >
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        <!-- 未收录状态面板 -->
        {#if !showSaveTabForm}
          <div class="space-y-1.5">
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0 flex-1 truncate">
                <span class="font-medium text-text-primary truncate block">{currentTab.title || t('popup.currentPage')}</span>
                <span class="font-mono text-[10px] text-text-tertiary truncate block">{currentTab.url}</span>
              </div>
              <div class="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  onclick={() => (showSaveTabForm = true)}
                  class="px-2 py-1 rounded-lg bg-accent text-accent-fg font-medium text-[11px] shadow-sm hover:opacity-90 transition-opacity flex items-center gap-0.5"
                >
                  <span>{t('popup.collect')}</span>
                </button>
                <button
                  type="button"
                  onclick={startAppendMode}
                  class="px-2 py-1 rounded-lg bg-subtle hover:bg-border-subtle text-text-secondary hover:text-text-primary font-medium text-[11px] transition-colors flex items-center gap-0.5 border border-border-subtle"
                  aria-label={t('popup.appendEndpoint')}
                >
                  <span>{t('popup.appendEndpoint')}</span>
                </button>
              </div>
            </div>
          </div>
        {:else}
          <!-- 展开保存新书签表单 -->
          <div class="space-y-2 p-2 rounded-lg bg-subtle border border-border-subtle">
            <div class="flex items-center justify-between">
              <span class="font-medium text-text-secondary">{t('popup.saveTo')}</span>
              <button
                type="button"
                onclick={() => (showSaveTabForm = false)}
                class="text-text-tertiary hover:text-text-primary text-[11px]"
              >
                {t('common.cancel')}
              </button>
            </div>
            <input
              type="text"
              bind:value={currentTab.title}
              class="w-full px-2.5 py-1 rounded bg-surface border border-border-subtle text-text-primary outline-none focus:border-border-focus"
            />
            <div class="flex items-center gap-2">
              <div class="flex-1">
                <Select
                  options={groupOptions}
                  bind:value={selectedGroupId}
                />
              </div>
              <button
                type="button"
                disabled={isSavingTab}
                onclick={handleSaveCurrentTab}
                class="px-3 py-2 rounded-lg bg-accent text-accent-fg font-medium text-xs hover:opacity-90 transition-opacity flex-shrink-0"
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        {/if}
      {/if}
    </div>
  {/if}

  <!-- 极简搜索栏 -->
  <div class="px-3 py-2 border-b border-border-subtle flex-shrink-0 bg-surface">
    <div class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-subtle border {isAppendMode ? 'border-accent ring-1 ring-accent/30' : 'border-border-subtle focus-within:border-border-focus'} transition-colors">
      <svg class="w-3.5 h-3.5 {isAppendMode ? 'text-accent' : 'text-text-tertiary'}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        bind:this={searchInputEl}
        type="text"
        bind:value={searchQuery}
        placeholder={isAppendMode ? t('popup.appendSearchPlaceholder') : t('popup.searchPlaceholder')}
        class="flex-1 bg-transparent border-0 outline-none text-xs text-text-primary placeholder:text-text-tertiary"
      />
      {#if searchQuery}
        <button
          type="button"
          onclick={() => (searchQuery = '')}
          class="text-text-tertiary hover:text-text-primary"
          aria-label={t('common.clear')}
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      {/if}
    </div>
  </div>

  <!-- 书签快速直达列表 -->
  <div class="flex-1 overflow-y-auto divide-y divide-border-subtle/50 text-xs">
    {#each filteredList as bm (bm.id)}
      {@const route = appState.getBookmarkRoute(bm)}
      {@const optimal = route.optimal}
      <div
        role="button"
        tabindex="0"
        onclick={() => handleJump(bm)}
        onkeydown={(e) => { if (e.key === 'Enter') handleJump(bm); }}
        class="flex items-center justify-between p-2.5 hover:bg-subtle cursor-pointer transition-colors group {isAppendMode ? 'hover:bg-accent/5' : ''}"
      >
        <div class="flex items-center gap-2.5 min-w-0 flex-1">
          <IconRender iconKey={bm.iconKey} customIcon={bm.customIconBase64} size={22} />
          <div class="min-w-0 flex-1 truncate">
            <span class="font-medium text-text-primary group-hover:text-accent transition-colors block truncate">
              {bm.name}
            </span>
            <div class="flex items-center gap-1.5 text-[10px] font-mono text-text-tertiary truncate mt-0.5">
              {#if optimal}
                {@const dotTip = optimal.latency
                  ? `${optimal.latency}ms · ${optimal.isIntranet ? t('bookmark.intranetBadge') : t('bookmark.extranetBadge')}`
                  : (optimal.reachable === false
                    ? (optimal.probeError === 'timeout' ? t('latency.timeout') : t('latency.offline'))
                    : (optimal.isIntranet ? t('bookmark.intranetBadge') : t('bookmark.extranetBadge')))}
                <span
                  class="w-1.5 h-1.5 rounded-full flex-shrink-0 {optimal.reachable === false ? 'bg-status-danger' : optimal.isIntranet ? 'bg-status-intranet' : 'bg-status-extranet'}"
                  aria-label={dotTip}
                ></span>
                <span class="truncate">{optimal.targetIp || optimal.host || optimal.url}</span>
              {:else}
                <span>{t('bookmark.noEndpointsConfigured')}</span>
              {/if}
            </div>
          </div>
        </div>

        <!-- 右侧操作区：追加模式 vs 常规入口展示 -->
        <div class="flex items-center gap-1.5 flex-shrink-0 font-mono text-[10px]">
          {#if isAppendMode}
            <button
              type="button"
              onclick={(e) => {
                e.stopPropagation();
                handleAppendEndpoint(bm);
              }}
              class="px-2 py-1 rounded bg-accent text-accent-fg font-medium text-[10px] hover:opacity-90 shadow-sm transition-opacity"
            >
              {t('popup.appendAction')}
            </button>
          {:else}
            {#if (bm.endpoints || []).length > 1}
              <span class="px-1.5 py-0.5 rounded bg-subtle text-text-secondary border border-border-subtle">
                {bm.endpoints.length}
              </span>
            {/if}
          {/if}
        </div>
      </div>
    {:else}
      <div class="py-12 text-center text-text-tertiary">
        {t('popup.noBookmarksFound')}
      </div>
    {/each}
  </div>

  <!-- 底部微型状态栏 -->
  <footer class="flex items-center justify-between px-3 py-1.5 border-t border-border-subtle bg-surface text-[10px] font-mono text-text-tertiary flex-shrink-0">
    <span>{t('stats.totalBookmarks')}: {appState.bookmarks.length}</span>
    <button
      type="button"
      onclick={openNewTab}
      class="text-accent hover:underline flex items-center gap-1"
    >
      <span>{t('popup.openConsole')}</span>
      <span>→</span>
    </button>
  </footer>

  <Toast />
</div>
