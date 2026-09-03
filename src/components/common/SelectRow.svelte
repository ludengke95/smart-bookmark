<script>
  import Select from './Select.svelte';

  /**
   * 下拉行 (Select Row)
   *
   * 统一的「label + 可选描述 + 下拉选择器」配置行，
   * 内部复用 Select 组件，避免每处重复 label 包裹模板。
   */
  let {
    label = '',
    description = '',
    options = [],
    value = $bindable(),
    onchange = null,
    mode = 'auto',
    size = 'md',
    id = ''
  } = $props();
</script>

<div class="space-y-1.5">
  <span class="block font-medium text-text-secondary">{label}</span>
  {#if description}
    <p class="text-[11px] text-text-tertiary leading-relaxed">{description}</p>
  {/if}
  <Select {options} bind:value {onchange} {mode} {size} {id} />
</div>
