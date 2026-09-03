<script>
  import { appState } from '../../state/app.svelte.js';
  import { toast } from '../../state/toast.svelte.js';
  import { t } from '../../i18n/index.svelte.js';

  let {
    onOpenAdd = () => {},
    onOpenImport = () => {},
    onOpenSettings = () => {},
    onOpenBackup = () => {},
    onOpenStats = () => {},
    onOpenAiOrganize = () => {}
  } = $props();

  let isRefreshing = $state(false);
  let showIpPopover = $state(false);

  async function handleRefreshNetwork() {
    isRefreshing = true;
    toast.show(t('nav.statusDetecting'));
    await appState.refreshNetwork(true);
    isRefreshing = false;
    toast.show(appState.currentLocalIp ? `${t('nav.statusIntranet')}: ${appState.currentLocalIp}` : t('nav.statusExtranet'));
  }
</script>

<header class="sticky top-0 z-40 w-full backdrop-blur-md bg-canvas/80 border-b border-border-subtle transition-colors duration-200">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
    <!-- 左侧：Logo 与局域网状态微标 -->
    <div class="flex items-center gap-3">
      <div class="w-7 h-7 rounded-lg bg-surface border border-border-subtle flex items-center justify-center text-text-primary shadow-sm">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
      </div>

      <div class="flex items-center gap-2">
        <span class="font-semibold text-sm tracking-tight text-text-primary">Smart Bookmark</span>

        <!-- 本机 IP 状态微标与定制悬浮面板 -->
        <div
          class="relative flex items-center"
          role="region"
          aria-label="网络状态"
          onmouseenter={() => (showIpPopover = true)}
          onmouseleave={() => (showIpPopover = false)}
        >
          <button
            type="button"
            onclick={handleRefreshNetwork}
            class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-subtle border border-border-subtle text-[11px] font-mono text-text-secondary hover:text-text-primary hover:border-border-focus transition-all"
            aria-label="本机网络状态，点击重新探测"
          >
            <span class="w-1.5 h-1.5 rounded-full {appState.currentLocalIp ? 'bg-status-intranet shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-text-tertiary'} {isRefreshing ? 'animate-pulse' : ''}"></span>
            <span>{appState.currentLocalIp || t('nav.statusExtranet')}</span>
            {#if appState.allLocalIps.length > 1}
              <span class="px-1 py-0.2 text-[9px] font-sans font-semibold rounded bg-surface border border-border-subtle text-text-tertiary">+{appState.allLocalIps.length - 1}</span>
            {/if}
          </button>

          <!-- 优雅悬浮卡片 (符合主题规范，带平滑渐入效果) -->
          {#if showIpPopover}
            <div class="absolute left-0 top-full pt-2 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
              <div class="w-64 p-3 rounded-xl bg-surface border border-border-subtle shadow-popover backdrop-blur-xl text-xs space-y-2.5">
                <!-- 头部 -->
                <div class="flex items-center justify-between border-b border-border-subtle/60 pb-2">
                  <span class="text-[11px] font-semibold text-text-primary flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full {appState.currentLocalIp ? 'bg-status-intranet' : 'bg-text-tertiary'}"></span>
                    {t('nav.topologySensing')}
                  </span>
                  <span class="text-[10px] text-text-tertiary">
                    {appState.allLocalIps.length > 0 ? t('nav.discoveredSubnets', { count: appState.allLocalIps.length }) : t('nav.noPrivateIp')}
                  </span>
                </div>

                <!-- 网卡 IP 列表 -->
                <div class="space-y-1.5">
                  {#if appState.allLocalIps.length > 0}
                    {#each appState.allLocalIps as ip, idx}
                      <div class="flex items-center justify-between p-1.5 rounded-lg {idx === 0 ? 'bg-subtle/80 border border-border-subtle/50' : 'hover:bg-subtle/40'} transition-colors">
                        <div class="flex items-center gap-2">
                          <span class="w-1 h-1 rounded-full {idx === 0 ? 'bg-status-intranet' : 'bg-text-tertiary'}"></span>
                          <span class="font-mono text-[11px] {idx === 0 ? 'text-text-primary font-medium' : 'text-text-secondary'}">{ip}</span>
                        </div>
                        {#if idx === 0}
                          <span class="text-[9px] px-1.5 py-0.5 rounded bg-status-intranet/10 text-status-intranet border border-status-intranet/20 font-medium">{t('nav.primaryNic')}</span>
                        {:else if ip.startsWith('198.18.')}
                          <span class="text-[9px] text-text-tertiary">{t('nav.tunProxy')}</span>
                        {:else if ip.startsWith('172.')}
                          <span class="text-[9px] text-text-tertiary">{t('nav.virtualNic')}</span>
                        {:else if ip.startsWith('10.')}
                          <span class="text-[9px] text-text-tertiary">{t('nav.vpnSubnet')}</span>
                        {/if}
                      </div>
                    {/each}
                  {:else}
                    <div class="p-2 text-center text-text-tertiary text-[11px]">
                      {t('nav.noSubnetDetected')}
                    </div>
                  {/if}
                </div>

                <!-- 底部提示 -->
                <div class="pt-2 border-t border-border-subtle/60 flex items-center justify-between text-[10px] text-text-tertiary">
                  <span>{t('nav.lpmBenchmark')}</span>
                  <button
                    type="button"
                    class="text-accent cursor-pointer hover:underline text-[10px] bg-transparent border-0 p-0"
                    onclick={handleRefreshNetwork}
                  >
                    {t('nav.clickToRefresh')}
                  </button>
                </div>
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- 右侧：极简操作工具组 -->
    <div class="flex items-center gap-2">
      <!-- 统计入口 -->
      <button
        onclick={onOpenStats}
        class="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-subtle transition-colors"
        title={t('nav.stats')}
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      </button>

      <!-- 快照与备份入口 -->
      <button
        onclick={onOpenBackup}
        class="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-subtle transition-colors"
        title={t('nav.backup')}
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      <!-- AI 智能整理 -->
      <button
        onclick={onOpenAiOrganize}
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-accent bg-accent/10 hover:bg-accent/15 border border-accent/20 transition-all shadow-2xs"
        title={t('nav.aiOrganize')}
      >
        <span class="text-xs">✨</span>
        <span>{t('nav.aiOrganize')}</span>
      </button>

      <!-- 导入书签 -->
      <button
        onclick={onOpenImport}
        class="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-subtle border border-border-subtle transition-colors"
        title={t('nav.importBookmarks')}
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        <span>{t('common.import')}</span>
      </button>

      <!-- 添加书签 (主行动点，单色胶囊按钮) -->
      <button
        onclick={onOpenAdd}
        class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium bg-accent text-accent-fg hover:opacity-90 shadow-sm transition-all"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        <span>{t('nav.addBookmark')}</span>
      </button>

      <!-- 设置入口 -->
      <button
        onclick={onOpenSettings}
        class="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-subtle transition-colors"
        title={t('nav.settings')}
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    </div>
  </div>
</header>
