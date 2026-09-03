<script>
  import { appState } from '../../state/app.svelte.js';
  import { toast } from '../../state/toast.svelte.js';
  import { t } from '../../i18n/index.svelte.js';
  import IconRender from '../common/IconRender.svelte';

  let {
    bookmark,
    onEdit = () => {},
    onDelete = () => {},
    draggable = false,
    ondragstart = null,
    ondragend = null,
    ondragover = null,
    ondragleave = null,
    ondrop = null
  } = $props();

  let showEndpoints = $state(false);

  // 计算当前书签的最优寻径结果
  let route = $derived(appState.getBookmarkRoute(bookmark));
  let optimal = $derived(route.optimal);

  function handleCardClick(e) {
    // 避免点击下拉菜单或操作按钮时触发跳转
    if (e.target.closest('.no-jump')) return;

    if (!optimal?.url) {
      toast.show(t('bookmark.noValidEndpointToast'));
      return;
    }

    appState.recordClick(bookmark.id);
    const latInfo = optimal?.latency ? ` (${optimal.latency}ms)` : '';
    toast.show(t('bookmark.directJumpToast', { target: `${optimal.targetIp || optimal.host || optimal.url}${latInfo}` }));
    window.open(optimal.url, '_blank');
  }

  function handleEndpointClick(ep) {
    appState.recordClick(bookmark.id);
    toast.show(t('bookmark.directEndpointToast', { url: ep.url }));
    window.open(ep.url, '_blank');
  }
</script>

<div
  role="button"
  tabindex="0"
  {draggable}
  {ondragstart}
  {ondragend}
  {ondragover}
  {ondragleave}
  {ondrop}
  onclick={handleCardClick}
  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleCardClick(e); }}
  class="group relative flex flex-col justify-between p-3 rounded-lg border border-border-subtle bg-surface hover:border-border-focus hover:shadow-sm transition-all duration-150 cursor-pointer select-none text-left"
>
  <!-- 卡片头部：图标、名称与右上角悬浮操作区 -->
  <div class="flex items-start justify-between gap-2.5">
    <div class="flex items-center gap-2.5 min-w-0 flex-1">
      <IconRender
        iconKey={bookmark.iconKey}
        customIcon={bookmark.customIconBase64}
        size={26}
      />
      <div class="min-w-0 flex-1">
        <h3 class="text-xs sm:text-sm font-medium text-text-primary truncate group-hover:text-accent transition-colors">
          {bookmark.name}
        </h3>
        {#if (bookmark.tags || []).length > 0}
          <div class="flex items-center gap-1 mt-0.5 overflow-hidden">
            {#each bookmark.tags.slice(0, 2) as tag}
              <span class="text-[10px] text-text-tertiary truncate">
                #{tag}
              </span>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <!-- 悬浮操作按钮组 (编辑 / 更多入口 / 删除) -->
    <div class="no-jump opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
      {#if (bookmark.endpoints || []).length > 1}
        <button
          type="button"
          onclick={() => (showEndpoints = !showEndpoints)}
          class="p-1 rounded hover:bg-subtle text-text-tertiary hover:text-text-primary transition-colors"
          title={t('bookmark.allEndpoints', { count: bookmark.endpoints.length })}
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      {/if}

      <button
        type="button"
        onclick={() => onEdit(bookmark)}
        class="p-1 rounded hover:bg-subtle text-text-tertiary hover:text-text-primary transition-colors"
        title={t('common.edit')}
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </button>

      <button
        type="button"
        onclick={() => onDelete(bookmark)}
        class="p-1 rounded hover:bg-subtle text-text-tertiary hover:text-status-danger transition-colors"
        title={t('common.delete')}
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  </div>

  <!-- 卡片底部：精密网络拓扑微标行 -->
  <div class="mt-2.5 flex items-center justify-between gap-2 text-[11px] font-mono">
    {#if optimal?.url}
      {@const dotTip = optimal.latency
        ? `${optimal.latency}ms · ${optimal.isIntranet ? t('bookmark.intranetBadge') : t('bookmark.extranetBadge')}`
        : (optimal.reachable === false
          ? (optimal.probeError === 'timeout' ? t('latency.timeout') : t('latency.offline'))
          : (optimal.isIntranet ? t('bookmark.intranetBadge') : t('bookmark.extranetBadge')))}
      <div class="flex items-center gap-1.5 min-w-0 text-text-secondary truncate">
        <!-- 网络拓扑与测速状态指示点 (悬停显示延迟与网络类型) -->
        <span
          class="w-1.5 h-1.5 rounded-full flex-shrink-0 {optimal.reachable === false
            ? 'bg-status-danger'
            : optimal.isIntranet
              ? 'bg-status-intranet'
              : 'bg-status-extranet'}"
          title={dotTip}
        ></span>
        <span class="truncate">
          {optimal.targetIp || optimal.host || optimal.url || t('bookmark.directAddress')}
        </span>
      </div>
    {:else}
      <div class="flex items-center gap-1.5 min-w-0 text-text-secondary truncate">
        <span class="text-text-tertiary">{t('bookmark.noEndpointsConfigured')}</span>
      </div>
    {/if}
  </div>

  <!-- 多入口展开抽屉面板 -->
  {#if showEndpoints && (bookmark.endpoints || []).length > 1}
    <div class="no-jump absolute left-0 right-0 top-full mt-1 bg-surface border border-border-subtle rounded-lg shadow-popover p-1.5 z-30 text-xs space-y-1">
      <div class="px-2 py-1 text-[10px] text-text-tertiary font-medium">{t('bookmark.allEndpoints', { count: bookmark.endpoints.length })}</div>
      {#each route.sorted as ep}
        {@const epDotTip = ep.latency
          ? `${ep.latency}ms · ${ep.isIntranet ? t('bookmark.intranetBadge') : t('bookmark.extranetBadge')}`
          : (ep.reachable === false
            ? (ep.probeError === 'timeout' ? t('latency.timeout') : t('latency.offline'))
            : (ep.isIntranet ? t('bookmark.intranetBadge') : t('bookmark.extranetBadge')))}
        <button
          type="button"
          onclick={() => handleEndpointClick(ep)}
          class="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-subtle text-left transition-colors {ep === optimal ? 'bg-subtle/60 text-text-primary font-medium' : 'text-text-secondary'}"
        >
          <div class="flex items-center gap-1.5 min-w-0 truncate">
            <span
              class="w-1.5 h-1.5 rounded-full flex-shrink-0 {ep.reachable === false ? 'bg-status-danger' : ep.isIntranet ? 'bg-status-intranet' : 'bg-status-extranet'}"
              title={epDotTip}
            ></span>
            <span class="font-mono text-[11px] truncate">{ep.url}</span>
          </div>
          {#if ep === optimal}
            <div class="flex items-center flex-shrink-0 text-[10px] font-mono">
              <span class="text-status-intranet font-medium">{t('bookmark.optimal')}</span>
            </div>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>
