<script>
  import { appState } from '../../../state/app.svelte.js';
  import { toast } from '../../../state/toast.svelte.js';
  import { t } from '../../../i18n/index.svelte.js';

  let { onClose = () => {} } = $props();

  async function handleResetData() {
    if (confirm(t('settings.resetWarning'))) {
      await appState.resetDefaultData();
      toast.show(t('settings.resetDone'));
      onClose();
    }
  }
</script>

<div class="p-4 rounded-xl border border-status-danger/30 bg-status-danger/5 space-y-3">
  <h3 class="font-medium text-status-danger text-sm">{t('settings.tabs.danger')}</h3>
  <p class="text-text-secondary leading-relaxed">
    {t('settings.resetWarning')}
  </p>
  <button
    type="button"
    onclick={handleResetData}
    class="px-4 py-2 rounded-lg bg-status-danger text-white font-medium hover:opacity-90 transition-opacity"
  >
    {t('settings.resetBtn')}
  </button>
</div>
