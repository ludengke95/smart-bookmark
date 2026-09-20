<script>
  import { t } from '../../i18n/index.svelte.js';
  import { appState } from '../../state/app.svelte.js';
  import ModalShell from '../common/ModalShell.svelte';
  import SettingsAppearance from './settings/SettingsAppearance.svelte';
  import SettingsGroups from './settings/SettingsGroups.svelte';
  import SettingsTags from './settings/SettingsTags.svelte';
  import SettingsSubscriptions from './settings/SettingsSubscriptions.svelte';
  import SettingsAi from './settings/SettingsAi.svelte';
  import SettingsMcp from './settings/SettingsMcp.svelte';
  import SettingsData from './settings/SettingsData.svelte';
  import SettingsSync from './settings/SettingsSync.svelte';

  let { open = $bindable(false) } = $props();

  let activeTab = $state('general'); // 'general' | 'groups' | 'tags' | 'subscriptions' | 'ai' | 'mcp' | 'sync' | 'danger'

  const tabMeta = $derived({
    general: {
      title: t('settings.tabs.general'),
      desc: t('settings.descriptions.general')
    },
    groups: {
      title: t('settings.tabs.groups'),
      desc: t('settings.descriptions.groups')
    },
    tags: {
      title: t('settings.tabs.tags'),
      desc: t('settings.descriptions.tags')
    },
    subscriptions: {
      title: t('settings.tabs.subscriptions'),
      desc: t('settings.descriptions.subscriptions')
    },
    ai: {
      title: t('settings.tabs.ai'),
      desc: t('settings.descriptions.ai')
    },
    mcp: {
      title: t('settings.tabs.mcp'),
      desc: t('settings.descriptions.mcp')
    },
    sync: {
      title: t('settings.tabs.sync'),
      desc: t('settings.descriptions.sync')
    },
    danger: {
      title: t('settings.tabs.danger'),
      desc: t('settings.descriptions.danger')
    }
  });

  const navGroups = $derived([
    {
      key: 'core',
      label: t('settings.sections.core'),
      items: [
        { id: 'general', label: t('settings.tabs.general'), icon: 'general' },
        { id: 'groups', label: t('settings.tabs.groups'), icon: 'groups' },
        { id: 'tags', label: t('settings.tabs.tags'), icon: 'tags' }
      ]
    },
    {
      key: 'integrations',
      label: t('settings.sections.integrations'),
      items: [
        { id: 'sync', label: t('settings.tabs.sync'), icon: 'sync', hasDot: true },
        { id: 'subscriptions', label: t('settings.tabs.subscriptions'), icon: 'subscriptions' },
        { id: 'ai', label: t('settings.tabs.ai'), icon: 'ai' },
        { id: 'mcp', label: t('settings.tabs.mcp'), icon: 'mcp' }
      ]
    },
    {
      key: 'data',
      label: t('settings.sections.data'),
      items: [
        { id: 'danger', label: t('settings.tabs.danger'), icon: 'danger', isDanger: true }
      ]
    }
  ]);
</script>

<ModalShell bind:open title={t('settings.title')} maxWidth="max-w-3xl" height="h-[600px]">
  <div class="flex-1 flex gap-5 min-h-0 pt-0.5">
    <!-- 左侧树状层级导航栏 -->
    <aside class="w-44 sm:w-48 flex-shrink-0 flex flex-col justify-between border-r border-border-subtle/70 pr-3 pb-1">
      <div class="space-y-4 overflow-y-auto pr-0.5">
        {#each navGroups as group}
          <div class="space-y-1">
            <div class="px-2 pb-1 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider select-none">
              {group.label}
            </div>

            <div class="space-y-0.5">
              {#each group.items as item}
                <button
                  type="button"
                  onclick={() => (activeTab = item.id)}
                  class="w-full h-8 px-2.5 rounded-lg text-xs transition-all flex items-center gap-2 text-left {activeTab === item.id
                    ? (item.isDanger
                        ? 'bg-status-danger/10 text-status-danger font-semibold border border-status-danger/30'
                        : 'bg-surface text-accent font-semibold shadow-2xs border border-border-subtle/80')
                    : (item.isDanger
                        ? 'text-text-tertiary hover:text-status-danger hover:bg-subtle border border-transparent'
                        : 'text-text-secondary hover:text-text-primary hover:bg-subtle border border-transparent')}"
                >
                  {#if item.icon === 'general'}
                    <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                  {:else if item.icon === 'groups'}
                    <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                  {:else if item.icon === 'tags'}
                    <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                  {:else if item.icon === 'sync'}
                    <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  {:else if item.icon === 'subscriptions'}
                    <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  {:else if item.icon === 'ai'}
                    <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.286L13 21l-2.286-6.857L5 12l5.714-2.286L13 3z" />
                    </svg>
                  {:else if item.icon === 'mcp'}
                    <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  {:else if item.icon === 'danger'}
                    <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  {/if}

                  <span class="truncate flex-1">{item.label}</span>

                  {#if item.hasDot}
                    {#if appState.cloudSyncStatus === 'locked_pending'}
                      <span class="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0"></span>
                    {:else if appState.cloudSyncStatus === 'conflict' || appState.cloudSyncStatus === 'error'}
                      <span class="w-1.5 h-1.5 rounded-full bg-status-danger flex-shrink-0"></span>
                    {/if}
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>

      <!-- 底部微标信息 -->
      <div class="pt-2 border-t border-border-subtle/40 px-2 flex items-center justify-between text-[10px] text-text-tertiary font-mono select-none">
        <span>Smart Bookmark</span>
        <span>v1.1.1</span>
      </div>
    </aside>

    <!-- 右侧独立内容面板 -->
    <main class="flex-1 min-w-0 flex flex-col overflow-hidden">
      <!-- 统一面板标题与简短说明 -->
      <div class="pb-2.5 border-b border-border-subtle/40 mb-3 flex items-center justify-between flex-shrink-0">
        <div>
          <h3 class="text-sm font-semibold text-text-primary">{tabMeta[activeTab]?.title || ''}</h3>
          <p class="text-[11px] text-text-secondary mt-0.5">{tabMeta[activeTab]?.desc || ''}</p>
        </div>
      </div>

      <!-- 面板视口内容 (高度恒定：groups 与 tags 使用独占高度单滚动条，其他使用自适应滚动) -->
      {#if activeTab === 'groups' || activeTab === 'tags'}
        <div class="flex-1 min-h-0 flex flex-col overflow-hidden text-xs">
          {#if activeTab === 'groups'}
            <SettingsGroups />
          {:else if activeTab === 'tags'}
            <SettingsTags />
          {/if}
        </div>
      {:else}
        <div class="flex-1 min-h-0 overflow-y-auto pr-1 text-xs space-y-4">
          {#if activeTab === 'general'}
            <SettingsAppearance />
          {:else if activeTab === 'subscriptions'}
            <SettingsSubscriptions />
          {:else if activeTab === 'ai'}
            <SettingsAi />
          {:else if activeTab === 'mcp'}
            <SettingsMcp />
          {:else if activeTab === 'sync'}
            <SettingsSync />
          {:else if activeTab === 'danger'}
            <SettingsData onClose={() => (open = false)} />
          {/if}
        </div>
      {/if}
    </main>
  </div>

  <!-- 底部关闭栏 -->
  <div class="flex items-center justify-end pt-3 border-t border-border-subtle flex-shrink-0">
    <button
      type="button"
      onclick={() => (open = false)}
      class="px-4 py-2 rounded-lg bg-subtle hover:bg-surface border border-border-subtle text-text-primary text-xs font-medium transition-colors"
    >
      {t('common.close')}
    </button>
  </div>
</ModalShell>
