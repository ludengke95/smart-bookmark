<script>
  /**
   * 空状态占位 (Empty State)
   *
   * 统一「图标 + 文案 + 可选操作」的空数据占位，复用于列表为空的场景。
   */
  let {
    icon = '📭',
    message = '',
    actionLabel = '',
    onaction = null
  } = $props();
</script>

<div class="py-12 flex flex-col items-center justify-center text-text-tertiary space-y-2 text-center">
  <span class="text-2xl">{icon}</span>
  {#if message}
    <p class="text-xs">{message}</p>
  {/if}
  {#if actionLabel && onaction}
    <button
      type="button"
      onclick={onaction}
      class="mt-1 px-3 py-1.5 rounded-lg border border-border-subtle text-text-secondary hover:text-text-primary hover:bg-subtle text-xs transition-colors"
    >
      {actionLabel}
    </button>
  {/if}
</div>
