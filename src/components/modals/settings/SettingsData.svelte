<script>
  import { appState } from '../../../state/app.svelte.js';
  import { toast } from '../../../state/toast.svelte.js';
  import { t } from '../../../i18n/index.svelte.js';
  import ConfirmModal from '../../common/ConfirmModal.svelte';

  let { onClose = () => {} } = $props();
  let resetConfirmOpen = $state(false);

  function handleResetData() {
    resetConfirmOpen = true;
  }

  async function performReset() {
    await appState.resetDefaultData();
    toast.show(t('settings.resetDone'));
    onClose();
  }
</script>

<div class="space-y-4">
  <!-- 数据隐私与本地优先声明卡片 -->
  <div class="p-4 rounded-xl border border-border-subtle bg-surface/50 space-y-2.5">
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2 min-w-0">
        <svg class="w-4 h-4 text-accent flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <h3 class="font-medium text-text-primary text-sm truncate">{t('settings.privacyTitle')}</h3>
      </div>
      <a
        href="https://github.com/ludengke95/smart-bookmark/blob/master/PRIVACY.md"
        target="_blank"
        rel="noopener noreferrer"
        class="text-xs text-accent hover:underline flex items-center gap-1 transition-colors flex-shrink-0"
      >
        <span>{t('settings.privacyLink')}</span>
        <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </a>
    </div>
    <p class="text-xs text-text-secondary leading-relaxed">
      {t('settings.privacyDesc')}
    </p>
  </div>

  <!-- 危险重置操作区 -->
  <div class="p-4 rounded-xl border border-status-danger/30 bg-status-danger/5 space-y-3">
    <h3 class="font-medium text-status-danger text-sm">{t('settings.tabs.danger')}</h3>
    <p class="text-text-secondary leading-relaxed text-xs">
      {t('settings.resetWarning')}
    </p>
    <button
      type="button"
      onclick={handleResetData}
      class="px-4 py-2 rounded-lg bg-status-danger text-white font-medium hover:opacity-90 transition-opacity text-xs"
    >
      {t('settings.resetBtn')}
    </button>
  </div>
</div>

<ConfirmModal
  bind:open={resetConfirmOpen}
  title={t('settings.tabs.danger')}
  message={t('settings.resetWarning')}
  confirmLabel={t('settings.resetBtn')}
  danger
  onconfirm={performReset}
/>
