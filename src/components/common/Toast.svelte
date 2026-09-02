<script>
  import { toast } from '../../state/toast.svelte.js';
</script>

{#if toast.visible}
  <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] pointer-events-none transition-all duration-200">
    <div class="px-4 py-2 rounded-full bg-accent text-accent-fg text-xs font-medium shadow-popover border border-border-subtle flex items-center gap-2">
      <span>{toast.message}</span>
    </div>
  </div>
{/if}
