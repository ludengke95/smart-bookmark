<script>
  /**
   * 极简现代主题滑块开关 (Themed Switch)
   * 遵循 doc/前端设计规范.md 5.8 规范，彻底替代原生 checkbox。
   * 支持全键盘操作 (Space/Enter) 与无障碍语义 (role="switch")。
   */
  let {
    id = '',
    checked = $bindable(false),
    disabled = false,
    size = 'md', // 'md' | 'sm'
    label = '',
    onchange = null
  } = $props();

  function toggle() {
    if (disabled) return;
    checked = !checked;
    if (typeof onchange === 'function') {
      onchange(checked);
    }
  }

  function handleKeyDown(e) {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggle();
    }
  }
</script>

<button
  type="button"
  role="switch"
  {id}
  aria-checked={checked}
  aria-label={label || id || 'switch'}
  {disabled}
  onclick={toggle}
  onkeydown={handleKeyDown}
  class="relative inline-flex flex-shrink-0 items-center transition-colors duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 {disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} {size === 'sm' ? 'w-7 h-4 rounded-full p-0.5' : 'w-9 h-5 rounded-full p-0.5'} {checked ? 'bg-accent border border-accent' : 'bg-subtle border border-border-subtle'}"
>
  <span
    aria-hidden="true"
    class="pointer-events-none inline-block rounded-full bg-white dark:bg-surface shadow-sm transition-transform duration-150 ease-out {size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} {checked ? (size === 'sm' ? 'translate-x-3' : 'translate-x-4') : 'translate-x-0'}"
  ></span>
</button>
