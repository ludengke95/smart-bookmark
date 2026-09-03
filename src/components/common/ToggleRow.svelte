<script>
  /**
   * 开关行 (Toggle Row)
   *
   * 统一的「label + 可选描述 + 勾选控件」配置行，
   * 复用于设置弹窗等场景，消除重复的内联 Tailwind 模板。
   */
  let {
    id = '',
    label = '',
    description = '',
    checked = $bindable(false),
    disabled = false,
    onchange = null
  } = $props();

  function handleChange(e) {
    if (typeof onchange === 'function') {
      onchange(e.target.checked);
    }
  }
</script>

<div class="flex items-start justify-between gap-3">
  <div class="min-w-0 space-y-0.5">
    <label for={id} class="block font-medium text-text-secondary">{label}</label>
    {#if description}
      <p class="text-[11px] text-text-tertiary leading-relaxed">{description}</p>
    {/if}
  </div>

  <input
    type="checkbox"
    {id}
    bind:checked
    {disabled}
    onchange={handleChange}
    class="rounded border-border-subtle text-accent mt-0.5"
  />
</div>
