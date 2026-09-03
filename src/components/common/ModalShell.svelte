<script>
  import { t } from '../../i18n/index.svelte.js';

  /**
   * 统一弹窗外框 (Modal Shell)
   *
   * 封装所有弹窗共用的遮罩层、面板容器、标题栏与关闭按钮，
   * 通过 props 控制尺寸/层级/遮罩/关闭行为，保持弹窗外框尺寸恒定无抖动。
   *
   * 使用方式：
   * - 简单标题：<ModalShell bind:open title="标题"> ...内容... </ModalShell>
   * - 富标题：  <ModalShell bind:open> {#snippet header()} ... {/snippet} ... </ModalShell>
   */
  let {
    open = $bindable(false),
    title = '',
    maxWidth = 'max-w-xl',
    height = 'h-[530px]',
    zIndex = 'z-50',
    backdrop = 'bg-black/40',
    spacing = 'space-y-4',
    closeOnBackdrop = true,
    closeOnEscape = true,
    closable = true,          // 是否渲染关闭按钮
    closeDisabled = false,    // busy 态：禁用关闭按钮并阻止遮罩/Esc 关闭
    onclose = null,
    header = null,            // 自定义标题内容 snippet（覆盖默认 h2）
    children = null           // 主体内容
  } = $props();

  function requestClose() {
    if (closeDisabled) return;
    open = false;
    if (typeof onclose === 'function') onclose();
  }

  function handleBackdropClick(e) {
    if (closeDisabled) return;
    if (closeOnBackdrop && e.target === e.currentTarget) {
      requestClose();
    }
  }

  function handleKeydown(e) {
    if (closeDisabled) return;
    if (closeOnEscape && e.key === 'Escape') {
      requestClose();
    }
  }
</script>

{#if open}
  <div
    class="fixed inset-0 {zIndex} {backdrop} backdrop-blur-sm flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
  >
    <div
      class="w-full {maxWidth} {height} bg-surface border border-border-subtle rounded-xl shadow-popover p-5 {spacing} flex flex-col"
    >
      <!-- 头部 -->
      <div class="flex items-center justify-between pb-2 border-b border-border-subtle flex-shrink-0">
        <div class="flex-1 min-w-0">
          {#if header}
            {@render header()}
          {:else}
            <h2 class="text-sm font-semibold text-text-primary">{title}</h2>
          {/if}
        </div>

        {#if closable}
          <button
            type="button"
            disabled={closeDisabled}
            onclick={requestClose}
            class="p-1 rounded hover:bg-subtle text-text-tertiary hover:text-text-primary transition-colors disabled:opacity-40"
            aria-label={t('common.close')}
            title={t('common.close')}
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        {/if}
      </div>

      {@render children?.()}
    </div>
  </div>
{/if}
