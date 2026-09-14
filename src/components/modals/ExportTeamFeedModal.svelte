<script>
  import { appState } from '../../state/app.svelte.js';
  import { toast } from '../../state/toast.svelte.js';
  import { t } from '../../i18n/index.svelte.js';
  import { getGroupName } from '../../i18n/utils.js';
  import { PINNED_GROUP_ID, UNGROUPED_GROUP_ID } from '../../constants/index.js';
  import { buildTeamCollectionPayload } from '../../services/subscription/index.js';
  import ModalShell from '../common/ModalShell.svelte';

  let { open = $bindable(false) } = $props();

  let name = $state('');
  let description = $state('');
  let intranetCidrs = $state('10.0.0.0/8, 192.168.0.0/16');
  let selectedGroupIds = $state(new Set());
  let isExporting = $state(false);

  // 可导出的自定义分组列表 (排除系统内置常用与未分组)
  const exportableGroups = $derived(
    appState.groups.filter(g => g.id !== PINNED_GROUP_ID && g.id !== UNGROUPED_GROUP_ID)
  );

  // 初始化或打开弹窗时默认全选可用分组
  $effect(() => {
    if (open && exportableGroups.length > 0 && selectedGroupIds.size === 0) {
      selectedGroupIds = new Set(exportableGroups.map(g => g.id));
      if (!name) {
        name = t('subscriptions.collectionNamePlaceholder');
      }
    }
  });

  function toggleGroup(groupId) {
    const next = new Set(selectedGroupIds);
    if (next.has(groupId)) {
      next.delete(groupId);
    } else {
      next.add(groupId);
    }
    selectedGroupIds = next;
  }

  function handleSelectAll() {
    selectedGroupIds = new Set(exportableGroups.map(g => g.id));
  }

  function handleDeselectAll() {
    selectedGroupIds = new Set();
  }

  function getGroupBookmarkCount(groupId) {
    return appState.bookmarks.filter(b => b.groupId === groupId).length;
  }

  function handleExport() {
    const cleanName = name.trim();
    if (!cleanName) {
      toast.show(t('subscriptions.collectionNameLabel'));
      return;
    }

    if (selectedGroupIds.size === 0) {
      toast.show(t('subscriptions.noGroupsSelected'));
      return;
    }

    isExporting = true;
    try {
      const cidrArray = intranetCidrs
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const payload = buildTeamCollectionPayload({
        name: cleanName,
        description: description.trim(),
        intranetCidrs: cidrArray,
        groupIds: Array.from(selectedGroupIds),
        groups: appState.groups,
        bookmarks: appState.bookmarks
      });

      const jsonStr = JSON.stringify(payload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const filename = `team-bookmarks-${cleanName.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'collection'}.json`;
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.show(t('subscriptions.exportSuccess', { filename }));
      open = false;
    } catch (err) {
      toast.show(err.message || t('common.failed'));
    } finally {
      isExporting = false;
    }
  }
</script>

<ModalShell
  bind:open
  title={t('subscriptions.exportModalTitle')}
  maxWidth="max-w-lg"
  height="h-[560px]"
  zIndex="z-[60]"
>
  <div class="flex flex-col h-full space-y-3.5 text-xs">
    <!-- 顶部说明 -->
    <div class="p-2.5 rounded-lg border border-border-subtle bg-subtle text-text-tertiary leading-relaxed">
      {t('subscriptions.exportModalDesc')}
    </div>

    <!-- 表单字段区 (自适应滚动) -->
    <div class="flex-1 overflow-y-auto space-y-3 pr-1">
      <!-- 团队源名称 -->
      <div class="space-y-1">
        <label for="export-name-input" class="text-[11px] font-medium text-text-secondary">
          {t('subscriptions.collectionNameLabel')}
        </label>
        <input
          id="export-name-input"
          type="text"
          bind:value={name}
          placeholder={t('subscriptions.collectionNamePlaceholder')}
          class="w-full px-3 py-1.5 rounded-lg bg-subtle border border-border-subtle outline-none text-text-primary text-xs focus:border-border-focus transition-colors"
        />
      </div>

      <!-- 描述说明 -->
      <div class="space-y-1">
        <label for="export-desc-input" class="text-[11px] font-medium text-text-secondary">
          {t('subscriptions.collectionDescLabel')}
        </label>
        <input
          id="export-desc-input"
          type="text"
          bind:value={description}
          placeholder={t('subscriptions.collectionDescPlaceholder')}
          class="w-full px-3 py-1.5 rounded-lg bg-subtle border border-border-subtle outline-none text-text-primary text-xs focus:border-border-focus transition-colors"
        />
      </div>

      <!-- 内网 CIDR 网段声明 -->
      <div class="space-y-1">
        <label for="export-cidrs-input" class="text-[11px] font-medium text-text-secondary">
          {t('subscriptions.intranetCidrsLabel')}
        </label>
        <input
          id="export-cidrs-input"
          type="text"
          bind:value={intranetCidrs}
          placeholder={t('subscriptions.intranetCidrsPlaceholder')}
          class="w-full px-3 py-1.5 rounded-lg bg-subtle border border-border-subtle outline-none text-text-primary font-mono text-xs focus:border-border-focus transition-colors"
        />
      </div>

      <!-- 分组多选列表 -->
      <div class="space-y-1.5 pt-1">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-medium text-text-secondary">
            {t('subscriptions.selectGroupsLabel')} ({selectedGroupIds.size}/{exportableGroups.length})
          </span>
          <div class="flex items-center gap-2 text-[10px]">
            <button
              type="button"
              onclick={handleSelectAll}
              class="text-accent hover:underline"
            >
              {t('subscriptions.selectAllGroups')}
            </button>
            <span class="text-border-subtle">|</span>
            <button
              type="button"
              onclick={handleDeselectAll}
              class="text-text-tertiary hover:text-text-primary"
            >
              {t('subscriptions.deselectAllGroups')}
            </button>
          </div>
        </div>

        <div class="space-y-1 max-h-40 overflow-y-auto border border-border-subtle rounded-lg p-1.5 bg-subtle/50">
          {#if exportableGroups.length === 0}
            <div class="py-4 text-center text-text-tertiary text-[11px]">
              {t('import.noCustomGroupHint')}
            </div>
          {:else}
            {#each exportableGroups as grp}
              {@const isChecked = selectedGroupIds.has(grp.id)}
              {@const bmCount = getGroupBookmarkCount(grp.id)}
              <button
                type="button"
                onclick={() => toggleGroup(grp.id)}
                class="w-full flex items-center justify-between p-2 rounded-md transition-colors text-left {isChecked ? 'bg-surface border border-border-subtle shadow-2xs' : 'hover:bg-surface/50 border border-transparent'}"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <div class="w-3.5 h-3.5 rounded flex items-center justify-center border {isChecked ? 'bg-accent border-accent text-accent-fg' : 'border-border-subtle bg-surface'}">
                    {#if isChecked}
                      <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    {/if}
                  </div>
                  <span class="font-medium text-text-primary truncate">{getGroupName(grp)}</span>
                </div>
                <span class="text-[10px] text-text-tertiary font-mono">
                  {bmCount} {t('tags.bookmarkCount', { count: bmCount }).replace(`${bmCount} `, '')}
                </span>
              </button>
            {/each}
          {/if}
        </div>
      </div>
    </div>

    <!-- 底部操作按钮栏 -->
    <div class="flex items-center justify-end gap-2 pt-3 border-t border-border-subtle flex-shrink-0">
      <button
        type="button"
        onclick={() => (open = false)}
        class="px-3.5 py-1.5 rounded-lg border border-border-subtle hover:bg-subtle text-text-secondary hover:text-text-primary transition-colors text-xs font-medium"
      >
        {t('common.cancel')}
      </button>

      <button
        type="button"
        onclick={handleExport}
        disabled={isExporting || !name.trim() || selectedGroupIds.size === 0}
        class="px-4 py-1.5 rounded-lg bg-accent text-accent-fg font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity text-xs flex items-center gap-1.5 shadow-sm"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <span>{t('subscriptions.exportBtn')}</span>
      </button>
    </div>
  </div>
</ModalShell>
