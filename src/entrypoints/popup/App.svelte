<script>
  import { onMount } from 'svelte';
  import { appState } from '../../state/app.svelte.js';
  import { toast } from '../../state/toast.svelte.js';
  import { classifyUrl } from '../../services/xor-matcher.js';
  import { PINNED_GROUP_ID, UNGROUPED_GROUP_ID } from '../../constants/index.js';
  import IconRender from '../../components/common/IconRender.svelte';
  import Toast from '../../components/common/Toast.svelte';
  import Select from '../../components/common/Select.svelte';

  let currentTab = $state({ title: '', url: '', favIconUrl: '' });
  let searchQuery = $state('');
  let isSavingTab = $state(false);
  let selectedGroupId = $state('');
  let showSaveTabForm = $state(false);

  const groupOptions = $derived(
    appState.groups
      .filter(g => g.id !== PINNED_GROUP_ID)
      .map(g => ({
        value: g.id,
        label: g.name,
        iconText: g.id === UNGROUPED_GROUP_ID ? '📄' : '📁'
      }))
  );

  $effect(() => {
    if (!selectedGroupId && groupOptions.length > 0) {
      selectedGroupId = groupOptions[0].value;
    }
  });

  // 检查当前网页是否已经存在于某个书签中
  let existingBookmarkMatch = $derived.by(() => {
    if (!currentTab.url) return null;
    for (const bm of appState.bookmarks) {
      const match = (bm.endpoints || []).some(ep => ep.url === currentTab.url);
      if (match) return bm;
    }
    return null;
  });

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
        if (tab && tab.url && !tab.url.startsWith('chrome://')) {
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

  async function handleSaveCurrentTab() {
    if (!currentTab.url) return;
    isSavingTab = true;
    try {
      const classification = classifyUrl(currentTab.url);
      await appState.saveBookmark({
        name: currentTab.title || currentTab.url,
        groupId: selectedGroupId,
        tags: [],
        endpoints: [
          {
            url: currentTab.url,
            order: 0,
            type: classification.type
          }
        ]
      });
      toast.show('已成功收藏当前网页');
      showSaveTabForm = false;
    } catch (e) {
      toast.show('收藏失败');
    } finally {
      isSavingTab = false;
    }
  }

  async function handleAppendEndpoint(bm) {
    if (!currentTab.url) return;
    const urls = (bm.endpoints || []).map(e => e.url);
    if (urls.includes(currentTab.url)) {
      toast.show('该入口已存在于此书签中');
      return;
    }

    const updatedEndpoints = [
      ...(bm.endpoints || []),
      {
        url: currentTab.url,
        order: (bm.endpoints || []).length,
        type: classifyUrl(currentTab.url).type
      }
    ];

    await appState.saveBookmark({
      ...bm,
      endpoints: updatedEndpoints
    });
    toast.show(`已将当前网址追加为「${bm.name}」的新入口`);
  }

  function handleJump(bm) {
    const route = appState.getBookmarkRoute(bm);
    if (route.optimal?.url) {
      appState.recordClick(bm.id);
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.create({ url: route.optimal.url });
      } else {
        window.open(route.optimal.url, '_blank');
      }
    } else {
      toast.show('未配置有效入口');
    }
  }
</script>

<div class="w-[380px] h-[520px] bg-canvas text-text-primary flex flex-col font-sans select-none overflow-hidden">
  <!-- 头部栏 -->
  <header class="flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-surface flex-shrink-0">
    <div class="flex items-center gap-2">
      <div class="w-6 h-6 rounded-md bg-accent flex items-center justify-center text-accent-fg font-bold text-xs">
        S
      </div>
      <div>
        <h1 class="text-xs font-semibold text-text-primary leading-tight">智能书签</h1>
        <!-- 本机 IP 徽章 -->
        <div class="flex items-center gap-1 text-[10px] font-mono text-text-tertiary">
          <span class="w-1.5 h-1.5 rounded-full {appState.localIp ? 'bg-status-intranet' : 'bg-text-tertiary'}"></span>
          <span>{appState.localIp || '检测网络中...'}</span>
        </div>
      </div>
    </div>

    <!-- 右侧操作 -->
    <div class="flex items-center gap-1">
      <button
        type="button"
        onclick={() => appState.refreshNetwork()}
        class="p-1.5 rounded-lg hover:bg-subtle text-text-tertiary hover:text-text-primary transition-colors"
        title="刷新网络状态"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>

      <button
        type="button"
        onclick={openNewTab}
        class="p-1.5 rounded-lg hover:bg-subtle text-text-tertiary hover:text-text-primary transition-colors"
        title="在新标签页中打开控制台"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </button>
    </div>
  </header>

  <!-- 当前网页快捷收藏胶囊 -->
  {#if currentTab.url}
    <div class="p-3 bg-surface/50 border-b border-border-subtle flex-shrink-0 text-xs">
      {#if existingBookmarkMatch}
        <div class="flex items-center justify-between gap-2 p-2 rounded-lg bg-subtle/80 border border-border-subtle">
          <div class="min-w-0 flex-1 truncate">
            <span class="text-text-tertiary text-[10px] block">已收录于书签</span>
            <span class="font-medium text-text-primary truncate block">{existingBookmarkMatch.name}</span>
          </div>
          <span class="px-2 py-1 rounded text-[10px] font-mono text-status-intranet bg-status-intranet/10 border border-status-intranet/20 flex-shrink-0">
            已就绪
          </span>
        </div>
      {:else}
        {#if !showSaveTabForm}
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0 flex-1 truncate">
              <span class="font-medium text-text-primary truncate block">{currentTab.title || '当前网页'}</span>
              <span class="font-mono text-[10px] text-text-tertiary truncate block">{currentTab.url}</span>
            </div>
            <button
              type="button"
              onclick={() => (showSaveTabForm = true)}
              class="px-2.5 py-1.5 rounded-lg bg-accent text-accent-fg font-medium text-[11px] shadow-sm hover:opacity-90 transition-opacity flex-shrink-0 flex items-center gap-1"
            >
              <span>+ 收藏</span>
            </button>
          </div>
        {:else}
          <!-- 展开保存表单 -->
          <div class="space-y-2 p-2 rounded-lg bg-subtle border border-border-subtle">
            <div class="flex items-center justify-between">
              <span class="font-medium text-text-secondary">收藏到书签</span>
              <button
                type="button"
                onclick={() => (showSaveTabForm = false)}
                class="text-text-tertiary hover:text-text-primary text-[11px]"
              >
                取消
              </button>
            </div>
            <input
              type="text"
              bind:value={currentTab.title}
              class="w-full px-2.5 py-1 rounded bg-surface border border-border-subtle text-text-primary outline-none"
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
                保存
              </button>
            </div>
          </div>
        {/if}
      {/if}
    </div>
  {/if}

  <!-- 极简搜索栏 -->
  <div class="px-3 py-2 border-b border-border-subtle flex-shrink-0 bg-surface">
    <div class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-subtle border border-border-subtle focus-within:border-border-focus transition-colors">
      <svg class="w-3.5 h-3.5 text-text-tertiary" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="快速检索书签与多入口..."
        class="flex-1 bg-transparent border-0 outline-none text-xs text-text-primary placeholder:text-text-tertiary"
      />
      {#if searchQuery}
        <button
          type="button"
          onclick={() => (searchQuery = '')}
          class="text-text-tertiary hover:text-text-primary"
          aria-label="清空搜索"
          title="清空搜索"
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
        class="flex items-center justify-between p-2.5 hover:bg-subtle cursor-pointer transition-colors group"
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
                  ? `${optimal.latency}ms · ${optimal.isIntranet ? '内网直达' : '公网直达'}`
                  : (optimal.reachable === false
                    ? (optimal.probeError === 'timeout' ? '响应超时' : '网络离线')
                    : (optimal.isIntranet ? '内网直达' : '公网直达'))}
                <span
                  class="w-1.5 h-1.5 rounded-full flex-shrink-0 {optimal.reachable === false ? 'bg-status-danger' : optimal.isIntranet ? 'bg-status-intranet' : 'bg-status-extranet'}"
                  title={dotTip}
                ></span>
                <span class="truncate">{optimal.targetIp || optimal.host || optimal.url}</span>
              {:else}
                <span>未配置入口</span>
              {/if}
            </div>
          </div>
        </div>

        <!-- 右侧入口数量 -->
        <div class="flex items-center gap-1.5 flex-shrink-0 font-mono text-[10px]">
          {#if (bm.endpoints || []).length > 1}
            <span class="px-1.5 py-0.5 rounded bg-subtle text-text-secondary border border-border-subtle">
              {bm.endpoints.length} 入口
            </span>
          {/if}
        </div>
      </div>
    {:else}
      <div class="py-12 text-center text-text-tertiary">
        未找到相关书签
      </div>
    {/each}
  </div>

  <!-- 底部微型状态栏 -->
  <footer class="flex items-center justify-between px-3 py-1.5 border-t border-border-subtle bg-surface text-[10px] font-mono text-text-tertiary flex-shrink-0">
    <span>共 {appState.bookmarks.length} 个书签</span>
    <button
      type="button"
      onclick={openNewTab}
      class="text-accent hover:underline flex items-center gap-1"
    >
      <span>打开主面板</span>
      <span>→</span>
    </button>
  </footer>

  <Toast />
</div>
