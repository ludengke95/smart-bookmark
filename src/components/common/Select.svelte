<script>
  import { onMount, onDestroy } from 'svelte';
  import { t } from '../../i18n/index.svelte.js';

  /**
   * 自适应表单选择器组件 (Adaptive Select / Segmented Control)
   *
   * 设计规范规则：
   * - 当选项数量 <= 2 时，自动降级为 iOS/macOS 极简分段胶囊 (Segmented Control)
   * - 当选项数量 > 2 时，自动展示为 Linear / Raycast 风格极简弹出卡片下拉 (Custom Popover Select)
   * - 支持通过 mode='segmented' 或 mode='popover' 显式强制指定形态
   */
  let {
    value = $bindable(),
    options = [],
    placeholder = '',
    disabled = false,
    id = '',
    mode = 'auto', // 'auto' | 'segmented' | 'popover'
    size = 'md', // 'sm' | 'md'
    class: customClass = '',
    onchange = null
  } = $props();

  let isOpen = $state(false);
  let containerEl = $state(null);

  // 计算当前是分段胶囊还是卡片下拉
  const isSegmented = $derived(
    mode === 'segmented' || (mode === 'auto' && options.length <= 2)
  );

  // 当前选中的选项对象
  const selectedOption = $derived(
    options.find(opt => String(opt.value) === String(value))
  );

  function handleSelect(val) {
    if (disabled) return;
    value = val;
    isOpen = false;
    if (typeof onchange === 'function') {
      onchange(val);
    }
  }

  function handleToggleDropdown() {
    if (disabled) return;
    isOpen = !isOpen;
  }

  function handleWindowClick(e) {
    if (isOpen && containerEl && !containerEl.contains(e.target)) {
      isOpen = false;
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape' && isOpen) {
      isOpen = false;
    }
  }

  onMount(() => {
    window.addEventListener('pointerdown', handleWindowClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handleWindowClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  });
</script>

{#if isSegmented}
  <!-- ================= 风格 2：分段胶囊控制器 (<= 2 项) ================= -->
  <div
    {id}
    class="w-full flex items-center bg-subtle border border-border-subtle p-0.5 rounded-lg select-none {disabled ? 'opacity-50 cursor-not-allowed' : ''} {customClass}"
    role="radiogroup"
  >
    {#each options as opt}
      {@const isSelected = String(opt.value) === String(value)}
      <button
        type="button"
        role="radio"
        aria-checked={isSelected}
        {disabled}
        onclick={() => handleSelect(opt.value)}
        class="flex-1 py-1.5 px-3 rounded-md text-xs transition-all duration-150 flex items-center justify-center gap-1.5 cursor-pointer {isSelected
          ? 'bg-surface text-text-primary shadow-sm font-semibold border border-border-subtle/60'
          : 'text-text-secondary hover:text-text-primary hover:bg-surface/50 font-medium'}"
      >
        {#if opt.iconText}
          <span class="w-3.5 h-3.5 rounded-full bg-subtle flex items-center justify-center text-[9px] font-bold {opt.colorClass || ''}">
            {opt.iconText}
          </span>
        {/if}
        <span>{opt.label}</span>
      </button>
    {/each}
  </div>

{:else}
  <!-- ================= 风格 1：Linear 极简卡片弹出选择器 (> 2 项) ================= -->
  <div
    bind:this={containerEl}
    {id}
    class="relative w-full select-none {customClass}"
  >
    <!-- 触发按钮 -->
    <button
      type="button"
      {disabled}
      onclick={handleToggleDropdown}
      class="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-subtle border transition-all duration-150 text-left text-xs {disabled
        ? 'opacity-50 cursor-not-allowed border-border-subtle'
        : isOpen
        ? 'border-border-focus bg-surface ring-1 ring-border-focus text-text-primary'
        : 'border-border-subtle hover:border-border-focus/70 text-text-primary'}"
      aria-haspopup="listbox"
      aria-expanded={isOpen}
    >
      <div class="flex items-center gap-2 truncate flex-1 mr-2">
        {#if selectedOption?.iconText}
          <span class="w-4 h-4 rounded-full bg-subtle flex items-center justify-center text-[10px] font-bold flex-shrink-0 {selectedOption.colorClass || ''}">
            {selectedOption.iconText}
          </span>
        {/if}
        {#if selectedOption}
          <span class="truncate font-medium">{selectedOption.label}</span>
        {:else}
          <span class="text-text-tertiary truncate">{placeholder || t('select.placeholder')}</span>
        {/if}
      </div>

      <!-- 顺滑旋转微箭头 -->
      <svg
        class="w-3.5 h-3.5 text-text-tertiary transition-transform duration-200 flex-shrink-0 {isOpen ? 'rotate-180 text-text-primary' : ''}"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- 下拉弹出浮层卡片 -->
    {#if isOpen}
      <div
        class="absolute left-0 top-full mt-1.5 w-full bg-surface border border-border-subtle rounded-xl shadow-popover p-1 z-50 text-xs max-h-56 overflow-y-auto space-y-0.5 focus:outline-none"
        role="listbox"
      >
        {#each options as opt}
          {@const isSelected = String(opt.value) === String(value)}
          <button
            type="button"
            role="option"
            aria-selected={isSelected}
            onclick={() => handleSelect(opt.value)}
            class="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer {isSelected
              ? 'bg-subtle text-text-primary font-medium'
              : 'text-text-secondary hover:bg-subtle/70 hover:text-text-primary'}"
          >
            <div class="flex items-center gap-2 truncate flex-1 mr-2">
              {#if opt.iconText}
                <span class="w-4 h-4 rounded-full bg-subtle flex items-center justify-center text-[10px] font-bold flex-shrink-0 {opt.colorClass || ''}">
                  {opt.iconText}
                </span>
              {/if}
              <span class="truncate">{opt.label}</span>
              {#if opt.subtext}
                <span class="text-[10px] text-text-tertiary truncate font-mono">({opt.subtext})</span>
              {/if}
            </div>

            {#if isSelected}
              <!-- 勾选指示图标 -->
              <svg class="w-3.5 h-3.5 text-accent flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}
