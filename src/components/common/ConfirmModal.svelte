<script>
  import ModalShell from './ModalShell.svelte';
  import { t } from '../../i18n/index.svelte.js';

  /**
   * 应用内确认弹窗 (Confirm Modal)
   * 替代原生 confirm()，符合「禁止原生 alert/confirm」的设计规范。
   * onconfirm 支持异步（确认中按钮 loading 并禁用关闭），成功后自动关闭。
   */
  let {
    open = $bindable(false),
    title = t('common.warning'),
    message = '',
    messageSnippet = null,     // 可选的富文本 snippet，优先于 message
    confirmLabel = '',
    cancelLabel = '',
    danger = false,
    onconfirm = null
  } = $props();

  let isWorking = $state(false);

  const resolvedConfirmLabel = $derived(confirmLabel || t('common.confirm'));
  const resolvedCancelLabel = $derived(cancelLabel || t('common.cancel'));

  async function handleConfirm() {
    if (isWorking) return;
    isWorking = true;
    try {
      await onconfirm?.();
      open = false;
    } catch (err) {
      console.error('[ConfirmModal] confirm action failed:', err);
    } finally {
      isWorking = false;
    }
  }
</script>

<ModalShell
  bind:open
  {title}
  maxWidth="max-w-sm"
  height="h-auto"
  spacing="space-y-0"
  closable={!isWorking}
  closeDisabled={isWorking}
>
  <div class="pt-1 text-xs text-text-secondary leading-relaxed">
    {#if messageSnippet}
      {@render messageSnippet()}
    {:else}
      {message}
    {/if}
  </div>

  <div class="flex items-center justify-end gap-2 pt-3 mt-4 border-t border-border-subtle flex-shrink-0">
    <button
      type="button"
      disabled={isWorking}
      onclick={() => (open = false)}
      class="px-4 py-2 rounded-lg border border-border-subtle text-text-secondary hover:text-text-primary hover:bg-subtle text-xs font-medium transition-colors disabled:opacity-40"
    >
      {resolvedCancelLabel}
    </button>
    <button
      type="button"
      disabled={isWorking}
      onclick={handleConfirm}
      class="px-4 py-2 rounded-lg text-xs font-medium shadow-sm hover:opacity-90 transition-opacity flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed {danger
        ? 'bg-status-danger text-white'
        : 'bg-accent text-accent-fg'}"
    >
      {#if isWorking}
        <span class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
      {/if}
      {resolvedConfirmLabel}
    </button>
  </div>
</ModalShell>
