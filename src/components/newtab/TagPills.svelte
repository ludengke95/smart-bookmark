<script>
  import { appState } from '../../state/app.svelte.js';
  import { BOOKMARK_SORT_OPTIONS } from '../../constants/index.js';
  import { toast } from '../../state/toast.svelte.js';
  import { t } from '../../i18n/index.svelte.js';

  let showSortMenu = $state(false);
  let isExpanded = $state(false);
  let currentSort = $derived(
    BOOKMARK_SORT_OPTIONS.find(opt => opt.value === (appState.settings.bookmarkSortOrder || 'custom')) || BOOKMARK_SORT_OPTIONS[0]
  );

  function getSortLabel(value) {
    return t(`sort.${value}`, {}, currentSort.label);
  }

  function handleSelectSort(sortVal) {
    appState.setBookmarkSortOrder(sortVal);
    showSortMenu = false;
    const label = getSortLabel(sortVal);
    toast.show(t('sort.toastSorted', { label }));
  }
</script>

{#if appState.bookmarks.length > 0}
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-start justify-between gap-2.5 select-none">
    <!-- 标签筛选胶囊区 -->
    <nav aria-label={t('nav.tagFilter')} class="flex items-start gap-1.5 flex-1 min-w-0">
      <button
        type="button"
        onclick={() => (appState.activeTag = 'all')}
        class="flex-shrink-0 px-3 py-1 rounded-full text-xs transition-all mt-[1px] {appState.activeTag === 'all'
          ? 'bg-accent text-accent-fg font-medium shadow-sm'
          : 'text-text-secondary hover:text-text-primary hover:bg-subtle'}"
      >
        {t('common.all')} ({appState.bookmarks.length})
      </button>

      {#if appState.allTags.length > 0}
        <div class="flex flex-wrap items-center content-start gap-1.5 flex-1 min-w-0 transition-all duration-200 {isExpanded ? 'h-auto py-[1px]' : 'h-[28px] py-[1px] overflow-hidden'}">
          {#each appState.allTags as tag}
            <button
              type="button"
              onclick={() => (appState.activeTag = appState.activeTag === tag.name ? 'all' : tag.name)}
              class="flex-shrink-0 px-3 py-1 rounded-full text-xs transition-all flex items-center gap-1 {appState.activeTag === tag.name
                ? 'bg-accent text-accent-fg font-medium shadow-sm'
                : 'text-text-secondary hover:text-text-primary hover:bg-subtle'}"
            >
              <span>{tag.name}</span>
              <span class="opacity-60 text-[10px] font-mono">({tag.count})</span>
            </button>
          {/each}
        </div>

        <!-- 展开/收起全部标签箭头 -->
        <button
          type="button"
          onclick={() => (isExpanded = !isExpanded)}
          class="flex-shrink-0 p-1.5 mt-[1px] rounded-lg border border-border-subtle/70 bg-surface hover:bg-subtle text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          title={isExpanded ? t('tags.collapseAll') : t('tags.expandAll')}
          aria-label={isExpanded ? t('tags.collapseAll') : t('tags.expandAll')}
        >
          <svg class="w-3.5 h-3.5 transition-transform duration-200 {isExpanded ? 'rotate-180' : ''}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      {/if}
    </nav>

    <!-- 排序规则下拉切换器 -->
    <div class="relative flex-shrink-0 mt-[1px]">
      <button
        type="button"
        onclick={() => (showSortMenu = !showSortMenu)}
        class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border-subtle bg-surface hover:bg-subtle text-xs text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
        title={t('sort.tooltip')}
      >
        <span class="text-xs">{currentSort.iconText}</span>
        <span class="font-medium text-[11px]">{getSortLabel(currentSort.value)}</span>
        <svg class="w-3 h-3 text-text-tertiary transition-transform duration-200 {showSortMenu ? 'rotate-180 text-text-primary' : ''}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {#if showSortMenu}
        <!-- 遮罩用于点击外部关闭 -->
        <div
          class="fixed inset-0 z-40"
          tabindex="-1"
          role="presentation"
          onclick={() => (showSortMenu = false)}
          onkeydown={(e) => { if (e.key === 'Escape') showSortMenu = false; }}
        ></div>

        <div class="absolute right-0 top-full mt-1.5 w-36 bg-surface border border-border-subtle rounded-xl shadow-popover p-1 z-50 text-xs space-y-0.5">
          <div class="px-2 py-1 text-[10px] text-text-tertiary font-medium border-b border-border-subtle/50 mb-0.5">{t('settings.sortOrder')}</div>
          {#each BOOKMARK_SORT_OPTIONS as opt}
            {@const isSelected = opt.value === (appState.settings.bookmarkSortOrder || 'custom')}
            <button
              type="button"
              onclick={() => handleSelectSort(opt.value)}
              class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors {isSelected ? 'bg-subtle text-text-primary font-medium' : 'text-text-secondary hover:bg-subtle/70 hover:text-text-primary'}"
            >
              <div class="flex items-center gap-1.5">
                <span>{opt.iconText}</span>
                <span class="text-[11px]">{getSortLabel(opt.value)}</span>
              </div>
              {#if isSelected}
                <svg class="w-3 h-3 text-accent" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}
