<script>
  /**
   * 开关行 (Toggle Row)
   * 统一的「label + 可选描述 + 主题滑块开关」配置行，
   * 遵循 doc/前端设计规范.md 5.8 规范，彻底消除原生 checkbox。
   */
  import Switch from './Switch.svelte';

  let {
    id = '',
    label = '',
    description = '',
    checked = $bindable(false),
    disabled = false,
    size = 'md',
    onchange = null
  } = $props();

  function toggle() {
    if (disabled) return;
    checked = !checked;
    if (typeof onchange === 'function') {
      onchange(checked);
    }
  }
</script>

<div class="flex items-center justify-between gap-3 {disabled ? 'opacity-50 cursor-not-allowed' : ''}">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="min-w-0 space-y-0.5 cursor-pointer select-none flex-1" onclick={toggle}>
    <span class="block font-medium text-text-secondary text-xs">{label}</span>
    {#if description}
      <p class="text-[11px] text-text-tertiary leading-relaxed">{description}</p>
    {/if}
  </div>

  <Switch
    {id}
    bind:checked
    {disabled}
    {size}
    {label}
    {onchange}
  />
</div>
