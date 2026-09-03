<script>
  import { toast } from '../../state/toast.svelte.js';
  import { t } from '../../i18n/index.svelte.js';
  import { formatServiceError } from '../../i18n/utils.js';
  import ModalShell from '../common/ModalShell.svelte';

  let {
    open = $bindable(false),
    type = 'grouping', // 'grouping' | 'tagging'
    items = $bindable([]),
    onApply = () => {}
  } = $props();

  let onlyShowChanged = $state(true);
  let isApplying = $state(false);

  // 派生已勾选数量
  let selectedCount = $derived(items.filter(i => i.selected).length);

  // 过滤显示列表
  let displayItems = $derived(
    items.filter(item => {
      if (!onlyShowChanged) return true;
      if (type === 'grouping') {
        return item.currentGroupName !== item.suggestedGroupName;
      } else {
        const oldTags = (item.currentTags || []).slice().sort().join(',');
        const newTags = (item.finalMergedTags || item.suggestedTags || []).slice().sort().join(',');
        return oldTags !== newTags;
      }
    })
  );

  function handleToggleAll(e) {
    const checked = e.target.checked;
    for (const item of items) {
      item.selected = checked;
    }
  }

  async function handleConfirmApply() {
    const selectedItems = items.filter(i => i.selected);
    if (selectedItems.length === 0) {
      toast.show(t('ai.result.selectAtLeastOne'));
      return;
    }

    isApplying = true;
    try {
      await onApply(selectedItems);
      open = false;
    } catch (err) {
      toast.show(t('ai.result.applyFailed', { error: formatServiceError(err) }));
    } finally {
      isApplying = false;
    }
  }
</script>

<ModalShell
  bind:open
  maxWidth="max-w-2xl"
  height="h-[580px]"
  zIndex="z-[60]"
  backdrop="bg-black/50"
  closeDisabled={isApplying}
>
  {#snippet header()}
    <h2 class="text-sm font-semibold text-text-primary flex items-center gap-2">
      {#if type === 'grouping'}
        <span>✨ {t('ai.result.titleGrouping')}</span>
      {:else}
        <span>🏷️ {t('ai.result.titleTagging')}</span>
      {/if}
      <span class="text-xs font-normal text-text-tertiary">
        {t('ai.result.analyzedCount', { total: items.length, selected: selectedCount })}
      </span>
    </h2>
  {/snippet}

      <!-- 操作过滤栏 -->
      <div class="flex items-center justify-between bg-subtle/70 px-3 py-2 rounded-lg text-xs flex-shrink-0">
        <label class="flex items-center gap-2 cursor-pointer text-text-secondary select-none">
          <input
            type="checkbox"
            checked={selectedCount === items.length && items.length > 0}
            onchange={handleToggleAll}
            class="rounded border-border-subtle text-accent"
          />
          <span>{t('ai.result.selectAll', { count: items.length })}</span>
        </label>

        <label class="flex items-center gap-1.5 cursor-pointer text-text-secondary select-none">
          <input
            type="checkbox"
            bind:checked={onlyShowChanged}
            class="rounded border-border-subtle text-accent"
          />
          <span>{t('ai.result.onlyChanged')}</span>
        </label>
      </div>

      <!-- 结果滚动比对区 -->
      <div class="flex-1 overflow-y-auto space-y-2 pr-1 text-xs">
        {#if displayItems.length === 0}
          <div class="h-48 flex flex-col items-center justify-center text-text-tertiary space-y-1">
            <p>{t('ai.result.noChanges')}</p>
          </div>
        {:else}
          {#each displayItems as item (item.bookmarkId)}
            <div class="p-3 rounded-lg border border-border-subtle bg-surface hover:bg-subtle/30 transition-colors flex items-start gap-3">
              <!-- 复选框 -->
              <input
                type="checkbox"
                bind:checked={item.selected}
                class="mt-1 rounded border-border-subtle text-accent"
              />

              <!-- 内容明细 -->
              <div class="flex-1 min-w-0 space-y-1.5">
                <div class="flex items-center justify-between gap-2">
                  <span class="font-medium text-text-primary truncate" title={item.bookmarkName}>
                    {item.bookmarkName}
                  </span>
                  {#if item.reason}
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-subtle text-text-tertiary flex-shrink-0 border border-border-subtle/50">
                      {item.reason}
                    </span>
                  {/if}
                </div>

                {#if type === 'grouping'}
                  <!-- 分组前后对比 -->
                  <div class="flex items-center gap-2 text-[11px]">
                    <span class="text-text-secondary px-2 py-0.5 rounded bg-subtle/60 border border-border-subtle/40">
                      {item.currentGroupName || t('groups.ungrouped')}
                    </span>
                    <span class="text-text-tertiary">➔</span>
                    <span class="font-medium text-accent px-2 py-0.5 rounded bg-accent/10 border border-accent/20 flex items-center gap-1">
                      {item.suggestedGroupName}
                      {#if item.isNewGroup}
                        <span class="text-[9px] px-1 rounded bg-accent text-accent-fg">{t('ai.result.newGroup')}</span>
                      {/if}
                    </span>
                  </div>
                {:else}
                  <!-- 标签前后对比 -->
                  <div class="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span class="text-text-tertiary">{t('ai.result.originalTags')}</span>
                    {#if !item.currentTags || item.currentTags.length === 0}
                      <span class="text-text-tertiary italic text-[10px]">{t('ai.result.none')}</span>
                    {:else}
                      {#each item.currentTags as tag}
                        <span class="px-1.5 py-0.2 rounded bg-subtle text-text-secondary text-[10px] border border-border-subtle/40">{tag}</span>
                      {/each}
                    {/if}

                    <span class="text-text-tertiary mx-1">➔</span>

                    <span class="text-text-tertiary">{t('ai.result.aiSuggested')}</span>
                    {#each (item.finalMergedTags || item.suggestedTags || []) as tag}
                      <span class="px-1.5 py-0.2 rounded bg-accent/10 text-accent font-medium text-[10px] border border-accent/20">
                        +{tag}
                      </span>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        {/if}
      </div>

      <!-- 底部操作与安全提示 -->
      <div class="flex items-center justify-between pt-3 border-t border-border-subtle flex-shrink-0 text-xs">
        <div class="flex items-center gap-1.5 text-text-tertiary text-[11px]">
          <svg class="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span>{t('ai.result.snapshotHint')}</span>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            disabled={isApplying}
            onclick={() => (open = false)}
            class="px-3.5 py-1.5 rounded-lg border border-border-subtle text-text-secondary hover:text-text-primary hover:bg-subtle transition-colors"
          >
            {t('ai.result.cancel')}
          </button>
          <button
            type="button"
            disabled={isApplying || selectedCount === 0}
            onclick={handleConfirmApply}
            class="px-4 py-1.5 rounded-lg bg-accent text-accent-fg font-medium hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center gap-1.5"
          >
            {#if isApplying}
              <span class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              <span>{t('ai.result.applying')}</span>
            {:else}
              <span>{t('ai.result.applyButton', { count: selectedCount })}</span>
            {/if}
          </button>
        </div>
      </div>
</ModalShell>
