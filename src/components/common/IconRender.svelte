<script>
  import { BRAND_ICONS } from '../../services/icons-library.js';

  let { iconKey = '', customIcon = '', size = 26, className = '' } = $props();

  let brand = $derived(BRAND_ICONS[iconKey]);
</script>

<div
  class="flex-shrink-0 flex items-center justify-center rounded-md bg-subtle text-text-secondary overflow-hidden {className}"
  style="width: {size}px; height: {size}px;"
>
  {#if customIcon}
    <img src={customIcon} alt="icon" class="w-full h-full object-contain" />
  {:else if brand}
    <div class="w-4 h-4 flex items-center justify-center text-text-primary" style="color: {brand.color || 'currentColor'}">
      {@html brand.svg}
    </div>
  {:else}
    <!-- 默认通用书签图标 -->
    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
    </svg>
  {/if}
</div>
