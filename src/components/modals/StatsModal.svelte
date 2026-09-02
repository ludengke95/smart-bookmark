<script>
  import { appState } from '../../state/app.svelte.js';
  import { toast } from '../../state/toast.svelte.js';
  import IconRender from '../common/IconRender.svelte';

  let { open = $bindable(false) } = $props();

  // 累计点击直达（历史总点击数求和）
  let totalClicks = $derived.by(() => {
    const totalMap = appState.detailedStats?.totalClicksMap || {};
    return Object.values(totalMap).reduce((acc, cur) => acc + (Number(cur) || 0), 0);
  });

  // 书签访问频次排行榜：优先按历史总点击降序，次级按近7天点击降序，再次级按最后访问时间降序
  let rankedBookmarks = $derived.by(() => {
    const totalMap = appState.detailedStats?.totalClicksMap || {};
    const recentMap = appState.detailedStats?.sevenDaysMap || {};
    const lastMap = appState.detailedStats?.lastClickedMap || {};

    return appState.bookmarks
      .map(bm => {
        const total = totalMap[bm.id] || 0;
        const recent = recentMap[bm.id] || 0;
        const last = lastMap[bm.id] || 0;

        return {
          ...bm,
          totalClicks: total,
          recentClicks: recent,
          lastClicked: last
        };
      })
      .sort((a, b) => {
        if (b.totalClicks !== a.totalClicks) {
          return b.totalClicks - a.totalClicks;
        }
        if (b.recentClicks !== a.recentClicks) {
          return b.recentClicks - a.recentClicks;
        }
        return (b.lastClicked || 0) - (a.lastClicked || 0);
      });
  });

  function formatRelativeTime(ts) {
    if (!ts) return '从未访问';
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins} 分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    return `${days} 天前`;
  }

  async function handleClearStats() {
    if (confirm('确定要清空所有书签的访问统计数据吗？')) {
      await appState.clearStats();
      toast.show('访问统计已清空');
    }
  }
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={(e) => { if (e.target === e.currentTarget) open = false; }}
    onkeydown={(e) => { if (e.key === 'Escape') open = false; }}
  >
    <div class="w-full max-w-xl h-[530px] bg-surface border border-border-subtle rounded-xl shadow-popover p-5 space-y-4 flex flex-col">
      <!-- 头部 -->
      <div class="flex items-center justify-between pb-2 border-b border-border-subtle flex-shrink-0">
        <h2 class="text-sm font-semibold text-text-primary">访问热度与统计分析</h2>
        <button
          type="button"
          onclick={() => (open = false)}
          class="p-1 rounded hover:bg-subtle text-text-tertiary hover:text-text-primary transition-colors"
          aria-label="关闭对话框"
          title="关闭"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- 核心指标卡片 -->
      <div class="grid grid-cols-3 gap-3 flex-shrink-0">
        <div class="p-3 rounded-xl bg-subtle border border-border-subtle text-center">
          <div class="text-[11px] text-text-tertiary">总书签数</div>
          <div class="text-xl font-semibold font-mono text-text-primary mt-0.5">{appState.bookmarks.length}</div>
        </div>
        <div class="p-3 rounded-xl bg-subtle border border-border-subtle text-center">
          <div class="text-[11px] text-text-tertiary">总分组数</div>
          <div class="text-xl font-semibold font-mono text-text-primary mt-0.5">{appState.groups.length}</div>
        </div>
        <div class="p-3 rounded-xl bg-subtle border border-border-subtle text-center">
          <div class="text-[11px] text-text-tertiary">累计点击直达</div>
          <div class="text-xl font-semibold font-mono text-accent mt-0.5">{totalClicks}</div>
        </div>
      </div>

      <!-- 访问排行榜 -->
      <div class="flex-1 overflow-y-auto space-y-2 text-xs">
        <div class="flex items-center justify-between text-text-tertiary text-[11px] px-1">
          <span>书签访问频次排行</span>
          <button
            type="button"
            onclick={handleClearStats}
            class="text-text-tertiary hover:text-status-danger transition-colors underline"
          >
            清空统计
          </button>
        </div>

        <div class="divide-y divide-border-subtle/50 border border-border-subtle rounded-xl bg-surface">
          {#each rankedBookmarks as bm, idx}
            <div class="p-2.5 flex items-center justify-between gap-3">
              <div class="flex items-center gap-2.5 min-w-0 flex-1">
                <!-- 序号 -->
                <span class="w-4 text-center font-mono text-xs font-semibold {idx < 3 ? 'text-accent' : 'text-text-tertiary'}">
                  {idx + 1}
                </span>

                <IconRender iconKey={bm.iconKey} customIcon={bm.customIconBase64} size={22} />

                <div class="min-w-0 flex-1 truncate">
                  <span class="font-medium text-text-primary block truncate">{bm.name}</span>
                  <span class="text-[10px] text-text-tertiary block font-mono">
                    最后访问: {formatRelativeTime(bm.lastClicked)}
                  </span>
                </div>
              </div>

              <!-- 统计数值 -->
              <div class="flex items-center gap-3 font-mono text-xs flex-shrink-0">
                <span class="text-text-tertiary text-[11px]">近7天: {bm.recentClicks}次</span>
                <span class="font-semibold text-text-primary px-2 py-0.5 rounded bg-subtle">
                  总计 {bm.totalClicks} 次
                </span>
              </div>
            </div>
          {/each}
        </div>
      </div>

      <!-- 底部 -->
      <div class="flex items-center justify-end pt-3 border-t border-border-subtle flex-shrink-0">
        <button
          type="button"
          onclick={() => (open = false)}
          class="px-4 py-2 rounded-lg bg-subtle hover:bg-surface border border-border-subtle text-text-primary text-xs font-medium transition-colors"
        >
          关闭
        </button>
      </div>
    </div>
  </div>
{/if}
