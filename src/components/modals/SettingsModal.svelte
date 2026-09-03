<script>
  import { t } from '../../i18n/index.svelte.js';
  import ModalShell from '../common/ModalShell.svelte';
  import SettingsAppearance from './settings/SettingsAppearance.svelte';
  import SettingsGroups from './settings/SettingsGroups.svelte';
  import SettingsAi from './settings/SettingsAi.svelte';
  import SettingsData from './settings/SettingsData.svelte';

  let { open = $bindable(false) } = $props();

  let activeTab = $state('general'); // 'general' | 'groups' | 'ai' | 'danger'
</script>

<ModalShell bind:open title={t('settings.title')} maxWidth="max-w-xl" height="h-[560px]">
      <!-- 标签页导航 (4个均分等宽分段胶囊，显式锁定 h-8 保持绝对空间稳定性) -->
      <div class="grid grid-cols-4 gap-1 bg-subtle p-1 rounded-lg text-xs flex-shrink-0">
        <button
          type="button"
          onclick={() => (activeTab = 'general')}
          class="h-8 px-2 rounded-md transition-all font-medium text-center flex items-center justify-center {activeTab === 'general'
            ? 'bg-surface text-text-primary shadow-sm font-semibold border border-border-subtle/60'
            : 'text-text-secondary hover:text-text-primary hover:bg-surface/50 border border-transparent'}"
        >
          {t('settings.tabs.general')}
        </button>
        <button
          type="button"
          onclick={() => (activeTab = 'groups')}
          class="h-8 px-2 rounded-md transition-all font-medium text-center flex items-center justify-center {activeTab === 'groups'
            ? 'bg-surface text-text-primary shadow-sm font-semibold border border-border-subtle/60'
            : 'text-text-secondary hover:text-text-primary hover:bg-surface/50 border border-transparent'}"
        >
          {t('settings.tabs.groups')}
        </button>
        <button
          type="button"
          onclick={() => (activeTab = 'ai')}
          class="h-8 px-2 rounded-md transition-all font-medium text-center flex items-center justify-center gap-1 {activeTab === 'ai'
            ? 'bg-surface text-accent shadow-sm font-semibold border border-accent/30 ring-1 ring-accent/20'
            : 'text-text-secondary hover:text-accent hover:bg-surface/50 border border-transparent'}"
        >
          <span>{t('settings.tabs.ai')}</span>
        </button>
        <button
          type="button"
          onclick={() => (activeTab = 'danger')}
          class="h-8 px-2 rounded-md transition-all font-medium text-center flex items-center justify-center {activeTab === 'danger'
            ? 'bg-surface text-status-danger shadow-sm font-semibold border border-status-danger/40 ring-1 ring-status-danger/20'
            : 'text-text-secondary hover:text-status-danger hover:bg-surface/50 border border-transparent'}"
        >
          {t('settings.tabs.danger')}
        </button>
      </div>

      <!-- 标签页内容 (统一高度与滚动区) -->
      <div class="flex-1 overflow-y-auto space-y-4 text-xs pr-1">
        {#if activeTab === 'general'}
          <SettingsAppearance />
        {:else if activeTab === 'groups'}
          <SettingsGroups />
        {:else if activeTab === 'ai'}
          <SettingsAi />
        {:else if activeTab === 'danger'}
          <SettingsData onClose={() => (open = false)} />
        {/if}
      </div>

      <!-- 底部关闭 -->
      <div class="flex items-center justify-end pt-3 border-t border-border-subtle flex-shrink-0">
        <button
          type="button"
          onclick={() => (open = false)}
          class="px-4 py-2 rounded-lg bg-accent text-accent-fg font-medium hover:opacity-90 transition-opacity"
        >
          {t('common.close')}
        </button>
      </div>
</ModalShell>
