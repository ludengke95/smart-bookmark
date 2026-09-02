<script>
  import { appState } from '../../state/app.svelte.js';
  import { toast } from '../../state/toast.svelte.js';
  import { exportFullBackupJson, importFullBackupJson } from '../../services/storage.js';

  let { open = $bindable(false) } = $props();

  let snapshotReason = $state('');

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
    const reason = snapshotReason.trim() || '手动快照';
    await appState.createSnapshot(reason);
    snapshotReason = '';
    toast.show('已创建数据快照');
  }

  async function handleRollback(id) {
    if (confirm('确定要回退到该快照版本吗？回退前将自动保存当前数据为新快照。')) {
      const ok = await appState.rollbackSnapshot(id);
      if (ok) {
        toast.show('已成功回滚至指定快照');
      } else {
        toast.show('回滚快照失败');
      }
    }
  }

  async function handleToggleLock(id) {
    await appState.toggleSnapshotLock(id);
  }

  async function handleDeleteSnapshot(id) {
    await appState.deleteSnapshot(id);
    toast.show('快照已删除');
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
    toast.show('备份数据已导出');
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
          toast.show(`导入成功！恢复了 ${res.count} 条书签`);
          open = false;
        } else {
          toast.show('导入备份失败: ' + res.error);
        }
      } catch (err) {
        toast.show('解析 JSON 备份文件失败');
      }
    };
    reader.readAsText(file);
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
        <h2 class="text-sm font-semibold text-text-primary">数据快照与容灾备份</h2>
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

      <!-- 手动创建快照与导出/导入快捷工具 -->
      <div class="space-y-3 flex-shrink-0">
        <div class="flex items-center gap-2">
          <input
            type="text"
            bind:value={snapshotReason}
            placeholder="快照说明 (如: 调整网络分组前)..."
            class="flex-1 px-3 py-1.5 rounded-lg bg-subtle border border-border-subtle outline-none text-xs text-text-primary"
          />
          <button
            type="button"
            onclick={handleCreateSnapshot}
            class="px-3 py-1.5 rounded-lg bg-accent text-accent-fg text-xs font-medium hover:opacity-90 transition-opacity flex-shrink-0"
          >
            创建快照
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
            <span>导出完整 JSON 备份</span>
          </button>

          <label class="px-3 py-1.5 rounded-lg border border-border-subtle hover:bg-subtle text-text-secondary flex items-center gap-1.5 transition-colors cursor-pointer">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span>导入 JSON 文件</span>
            <input type="file" accept=".json" onchange={handleImportJson} class="hidden" />
          </label>
        </div>
      </div>

      <!-- 快照历史列表 -->
      <div class="flex-1 overflow-y-auto space-y-2 text-xs">
        <div class="flex items-center justify-between text-text-tertiary text-[11px] px-1">
          <span>历史快照记录 ({appState.snapshots.length})</span>
          <span>自动维护最近 7 份与已加锁快照</span>
        </div>

        {#if appState.snapshots.length === 0}
          <div class="py-12 text-center text-text-tertiary border border-dashed border-border-subtle rounded-xl">
            暂无历史快照记录
          </div>
        {:else}
          <div class="divide-y divide-border-subtle/50 border border-border-subtle rounded-xl bg-surface">
            {#each appState.snapshots as snap}
              <div class="p-3 flex items-center justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-text-primary truncate">{snap.reason || '自动备份'}</span>
                    {#if snap.locked}
                      <span class="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20 font-medium">已锁定</span>
                    {/if}
                  </div>
                  <div class="flex items-center gap-3 text-[11px] text-text-tertiary font-mono mt-0.5">
                    <span>{formatTime(snap.timestamp)}</span>
                    <span>·</span>
                    <span>{snap.bookmarks?.length || 0} 个书签</span>
                    <span>·</span>
                    <span>{snap.groups?.length || 0} 个分组</span>
                  </div>
                </div>

                <div class="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onclick={() => handleToggleLock(snap.id)}
                    class="p-1.5 rounded hover:bg-subtle text-text-tertiary hover:text-text-primary transition-colors"
                    title={snap.locked ? '解锁快照' : '锁定防自动清理'}
                  >
                    {#if snap.locked}
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
                    回滚至此
                  </button>

                  {#if !snap.locked}
                    <button
                      type="button"
                      onclick={() => handleDeleteSnapshot(snap.id)}
                      class="p-1.5 rounded hover:bg-subtle text-text-tertiary hover:text-status-danger transition-colors"
                      title="删除快照"
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
          关闭
        </button>
      </div>
    </div>
  </div>
{/if}
