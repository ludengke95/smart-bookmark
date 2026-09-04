<script>
  import { appState } from '../../state/app.svelte.js';
  import { toast } from '../../state/toast.svelte.js';
  import { t } from '../../i18n/index.svelte.js';
  import { formatSnapshotReason } from '../../i18n/utils.js';
  import { exportFullBackupJson, importFullBackupJson } from '../../services/storage.js';
  import ModalShell from '../common/ModalShell.svelte';
  import ConfirmModal from '../common/ConfirmModal.svelte';

  let { open = $bindable(false) } = $props();

  let snapshotReason = $state('');
  let rollbackConfirm = $state({ open: false, targetId: null });

  function formatTime(isoString) {
    try {
      const d = new Date(isoString);
      return d.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  }

  async function handleCreateSnapshot() {
    const reason = snapshotReason.trim() || t('backup.manualSnapshot');
    await appState.createSnapshot(reason);
    snapshotReason = '';
    toast.show(t('backup.created'));
  }

  function handleRollback(id) {
    rollbackConfirm = { open: true, targetId: id };
  }

  async function performRollback() {
    const ok = await appState.rollbackSnapshot(rollbackConfirm.targetId);
    if (ok) {
      toast.show(t('backup.rollbackSuccess'));
    } else {
      toast.show(t('backup.rollbackFailed'));
    }
  }

  async function handleToggleLock(id) {
    await appState.toggleSnapshotLock(id);
  }

  async function handleDeleteSnapshot(id) {
    await appState.deleteSnapshot(id);
    toast.show(t('backup.deleted'));
  }

  async function handleExportJson() {
    const jsonStr = await exportFullBackupJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smart-bookmarks-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.show(t('backup.exported'));
  }

  function handleImportJson(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = ev.target?.result;
        const res = await importFullBackupJson(text);
        if (res.success) {
          await appState.init();
          toast.show(t('backup.importSuccess', { count: res.count }));
          open = false;
        } else {
          toast.show(t('backup.importFailed', { error: res.error }));
        }
      } catch (err) {
        toast.show(t('backup.parseFailed'));
      }
    };
    reader.readAsText(file);
  }
</script>

<ModalShell bind:open title={t('backup.modalTitle')} maxWidth="max-w-xl">
      <!-- 手动创建快照与导出/导入快捷工具 -->
      <div class="space-y-3 flex-shrink-0">
        <div class="flex items-center gap-2">
          <input
            type="text"
            bind:value={snapshotReason}
            placeholder={t('backup.reasonPlaceholder')}
            class="flex-1 px-3 py-1.5 rounded-lg bg-subtle border border-border-subtle outline-none text-xs text-text-primary"
          />
          <button
            type="button"
            onclick={handleCreateSnapshot}
            class="px-3 py-1.5 rounded-lg bg-accent text-accent-fg text-xs font-medium hover:opacity-90 transition-opacity flex-shrink-0"
          >
            {t('backup.createSnapshot')}
          </button>
        </div>

        <div class="flex items-center gap-2 pt-1 text-xs">
          <button
            type="button"
            onclick={handleExportJson}
            class="px-3 py-1.5 rounded-lg border border-border-subtle hover:bg-subtle text-text-secondary flex items-center gap-1.5 transition-colors"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>{t('backup.exportJson')}</span>
          </button>

          <label class="px-3 py-1.5 rounded-lg border border-border-subtle hover:bg-subtle text-text-secondary flex items-center gap-1.5 transition-colors cursor-pointer">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span>{t('backup.importJson')}</span>
            <input type="file" accept=".json" onchange={handleImportJson} class="hidden" />
          </label>
        </div>
      </div>

      <!-- 快照历史列表 -->
      <div class="flex-1 overflow-y-auto space-y-2 text-xs">
        <div class="flex items-center justify-between text-text-tertiary text-[11px] px-1">
          <span>{t('backup.historyTitle', { count: appState.snapshots.length })}</span>
          <span>{t('backup.autoRetentionNote')}</span>
        </div>

        {#if appState.snapshots.length === 0}
          <div class="py-12 text-center text-text-tertiary border border-dashed border-border-subtle rounded-xl">
            {t('backup.noSnapshots')}
          </div>
        {:else}
          <div class="divide-y divide-border-subtle/50 border border-border-subtle rounded-xl bg-surface">
            {#each appState.snapshots as snap}
              <div class="p-3 flex items-center justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-text-primary truncate">{formatSnapshotReason(snap)}</span>
                    {#if snap.isLocked}
                      <span class="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20 font-medium">{t('backup.locked')}</span>
                    {/if}
                  </div>
                  <div class="flex items-center gap-3 text-[11px] text-text-tertiary font-mono mt-0.5">
                    <span>{formatTime(snap.timestamp)}</span>
                    <span>·</span>
                    <span>{t('backup.itemSummary', { bookmarks: snap.counts?.bookmarks ?? 0, groups: snap.counts?.groups ?? 0 })}</span>
                  </div>
                </div>

                <div class="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onclick={() => handleToggleLock(snap.id)}
                    class="p-1.5 rounded hover:bg-subtle text-text-tertiary hover:text-text-primary transition-colors"
                    title={snap.isLocked ? t('backup.unlockTooltip') : t('backup.lockTooltip')}
                  >
                    {#if snap.isLocked}
                      <span class="text-amber-500 text-xs">🔒</span>
                    {:else}
                      <span class="text-xs">🔓</span>
                    {/if}
                  </button>

                  <button
                    type="button"
                    onclick={() => handleRollback(snap.id)}
                    class="px-2.5 py-1 rounded-md bg-subtle hover:bg-accent hover:text-accent-fg border border-border-subtle text-text-secondary text-[11px] font-medium transition-colors"
                  >
                    {t('backup.restore')}
                  </button>

                  {#if !snap.isLocked}
                    <button
                      type="button"
                      onclick={() => handleDeleteSnapshot(snap.id)}
                      class="p-1.5 rounded hover:bg-subtle text-text-tertiary hover:text-status-danger transition-colors"
                      title={t('backup.deleteTooltip')}
                    >
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- 底部 -->
      <div class="flex items-center justify-end pt-3 border-t border-border-subtle flex-shrink-0">
        <button
          type="button"
          onclick={() => (open = false)}
          class="px-4 py-2 rounded-lg bg-subtle hover:bg-surface border border-border-subtle text-text-primary text-xs font-medium transition-colors"
        >
          {t('common.close')}
        </button>
      </div>
</ModalShell>

<ConfirmModal
  bind:open={rollbackConfirm.open}
  title={t('backup.modalTitle')}
  message={t('backup.rollbackConfirm')}
  confirmLabel={t('backup.restore')}
  onconfirm={performRollback}
/>
