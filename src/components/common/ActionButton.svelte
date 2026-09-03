<script>
  /**
   * 主题统一按钮 (Action Button)
   *
   * 统一弹窗内常用按钮样式，避免各弹窗重复书写 primary/ghost/danger 的 Tailwind 组合。
   * variant: primary | ghost | danger | outline
   */
  let {
    variant = 'primary',
    type = 'button',
    disabled = false,
    loading = false,
    onclick = null,
    class: customClass = '',
    children = null
  } = $props();

  const variantClasses = {
    primary: 'bg-accent text-accent-fg font-medium shadow-sm hover:opacity-90',
    ghost: 'border border-border-subtle text-text-secondary hover:text-text-primary hover:bg-subtle',
    danger: 'bg-status-danger text-white font-medium hover:opacity-90',
    outline: 'bg-subtle hover:bg-surface border border-border-subtle text-text-primary font-medium'
  };
</script>

<button
  {type}
  {disabled}
  {onclick}
  class="px-4 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed {variantClasses[variant] || variantClasses.primary} {customClass}"
>
  {#if loading}
    <span class="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
  {/if}
  {@render children?.()}
</button>
