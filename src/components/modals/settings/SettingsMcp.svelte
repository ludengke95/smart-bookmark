<script>
  import { t } from '../../../i18n/index.svelte.js';
  import { appState } from '../../../state/app.svelte.js';
  import { toast } from '../../../state/toast.svelte.js';
  import { DEFAULT_MCP_SETTINGS, DEFAULT_MCP_WS_HOST, DEFAULT_MCP_WS_PORT } from '../../../constants/index.js';
  import Switch from '../../common/Switch.svelte';
  import ToggleRow from '../../common/ToggleRow.svelte';

  // 步进索引：1 | 2 | 3
  // 如果当前服务已成功连通，初始直接定位到第 3 步；如果开启但尚未连接定位第 2 步；否则第 1 步引导
  let currentStep = $state(appState.mcpStatus.isConnected ? 3 : (appState.settings.mcp?.enabled ? 2 : 1));
  let showAdvanced = $state(false);
  let portInputRef = $state(null);

  let errorCategory = $derived.by(() => {
    const err = appState.mcpStatus.lastError;
    if (!err) return null;
    const str = String(err).toLowerCase();
    if (str.includes('eaddrinuse') || str.includes('address already in use')) {
      return 'PORT_IN_USE';
    }
    if (
      str.includes('specified native messaging host not found') ||
      str.includes('native messaging host not found') ||
      str.includes('host not found')
    ) {
      return 'NOT_REGISTERED';
    }
    return 'GENERAL';
  });

  function updateMcpSettings(partial) {
    const current = appState.settings.mcp || DEFAULT_MCP_SETTINGS;
    const updated = { ...current, ...partial };
    appState.updateSettings({ mcp: updated });
    if (updated.enabled === true) {
      appState.reconnectMcp(
        updated.wsHost || DEFAULT_MCP_WS_HOST,
        updated.wsPort || DEFAULT_MCP_WS_PORT,
        updated.allowLan
      );
    } else {
      appState.disconnectMcp();
    }
  }

  const registerCommand = 'npx -y @ludengke95/smart-bookmark-mcp register';

  function copyRegisterCommand() {
    navigator.clipboard.writeText(registerCommand).then(() => {
      toast.show(t('common.copied'));
    }).catch(() => {
      toast.show(t('mcp.copyFailedToast'));
    });
  }
  function copyHttpEndpoint() {
    const host = appState.settings.mcp?.wsHost || DEFAULT_MCP_WS_HOST;
    const port = appState.settings.mcp?.wsPort || DEFAULT_MCP_WS_PORT;
    const endpoint = `http://${host}:${port}/mcp`;
    navigator.clipboard.writeText(endpoint).then(() => {
      toast.show(t('mcp.copiedHttpToast'));
    }).catch(() => {
      toast.show(t('mcp.copyFailedToast'));
    });
  }

  function copyHttpJsonConfig() {
    const host = appState.settings.mcp?.wsHost || DEFAULT_MCP_WS_HOST;
    const port = appState.settings.mcp?.wsPort || DEFAULT_MCP_WS_PORT;
    const endpoint = `http://${host}:${port}/mcp`;

    const snippet = JSON.stringify({
      mcpServers: {
        "smart-bookmark": {
          url: endpoint
        }
      }
    }, null, 2);

    navigator.clipboard.writeText(snippet).then(() => {
      toast.show(t('mcp.copiedHttpJsonToast'));
    }).catch(() => {
      toast.show(t('mcp.copyFailedToast'));
    });
  }

  function copyStdioConfig() {
    const host = appState.settings.mcp?.wsHost || DEFAULT_MCP_WS_HOST;
    const port = appState.settings.mcp?.wsPort || DEFAULT_MCP_WS_PORT;
    const extraArgs = [];
    if (host !== DEFAULT_MCP_WS_HOST) extraArgs.push('--host', host);
    if (port !== DEFAULT_MCP_WS_PORT) extraArgs.push('--port', String(port));

    const snippet = JSON.stringify({
      mcpServers: {
        "smart-bookmark": {
          command: "npx",
          args: ["-y", "@ludengke95/smart-bookmark-mcp", "stdio", ...extraArgs]
        }
      }
    }, null, 2);

    navigator.clipboard.writeText(snippet).then(() => {
      toast.show(t('mcp.copiedToast'));
    }).catch(() => {
      toast.show(t('mcp.copyFailedToast'));
    });
  }
</script>

<div class="space-y-3">
  <!-- 顶部步进指示条 (紧凑 Stepper) -->
  <div class="grid grid-cols-3 gap-1.5 bg-subtle p-1 rounded-lg text-xs flex-shrink-0">
    <button
      type="button"
      onclick={() => (currentStep = 1)}
      class="h-7 px-2 rounded-md transition-all flex items-center justify-center gap-1.5 text-[11px] font-medium {currentStep === 1
        ? 'bg-surface text-text-primary shadow-sm font-semibold border border-border-subtle/70'
        : 'text-text-secondary hover:text-text-primary hover:bg-surface/50 border border-transparent'}"
    >
      <span class="w-3.5 h-3.5 rounded-full text-[9px] flex items-center justify-center {currentStep === 1 ? 'bg-accent text-white font-bold' : 'bg-subtle text-text-tertiary border border-border-subtle'}">
        1
      </span>
      <span>{t('mcp.step1Tab')}</span>
    </button>

    <button
      type="button"
      onclick={() => (currentStep = 2)}
      class="h-7 px-2 rounded-md transition-all flex items-center justify-center gap-1.5 text-[11px] font-medium {currentStep === 2
        ? 'bg-surface text-text-primary shadow-sm font-semibold border border-border-subtle/70'
        : 'text-text-secondary hover:text-text-primary hover:bg-surface/50 border border-transparent'}"
    >
      <span class="w-3.5 h-3.5 rounded-full text-[9px] flex items-center justify-center {currentStep === 2 ? 'bg-accent text-white font-bold' : 'bg-subtle text-text-tertiary border border-border-subtle'}">
        2
      </span>
      <span>{t('mcp.step2Tab')}</span>
    </button>

    <button
      type="button"
      onclick={() => (currentStep = 3)}
      class="h-7 px-2 rounded-md transition-all flex items-center justify-center gap-1.5 text-[11px] font-medium {currentStep === 3
        ? 'bg-surface text-text-primary shadow-sm font-semibold border border-border-subtle/70'
        : 'text-text-secondary hover:text-text-primary hover:bg-surface/50 border border-transparent'}"
    >
      <span class="w-3.5 h-3.5 rounded-full text-[9px] flex items-center justify-center {currentStep === 3 ? 'bg-accent text-white font-bold' : 'bg-subtle text-text-tertiary border border-border-subtle'}">
        3
      </span>
      <span>{t('mcp.step3Tab')}</span>
    </button>
  </div>

  <!-- 步骤主体内容 (紧凑无滚动条) -->
  {#if currentStep === 1}
    <!-- 第 1 步：准备环境 -->
    <div class="space-y-2.5">
      <div class="p-3 rounded-xl bg-surface border border-border-subtle space-y-2">
        <div class="flex items-center justify-between">
          <span class="font-semibold text-text-primary text-xs">{t('mcp.step1Title')}</span>
          <span class="text-[10px] text-text-tertiary font-mono">Terminal / CMD</span>
        </div>
        <p class="text-[11px] text-text-secondary leading-relaxed">
          {t('mcp.step1Desc')}
        </p>
        <div class="flex items-center gap-2 p-1.5 rounded-lg bg-subtle border border-border-subtle/80">
          <code class="flex-1 font-mono text-[11px] text-accent select-all truncate pl-1" title={registerCommand}>
            {registerCommand}
          </code>
          <button
            type="button"
            onclick={copyRegisterCommand}
            class="px-2.5 py-1 rounded-md bg-accent text-white hover:opacity-90 transition-opacity text-[11px] font-medium flex-shrink-0 shadow-sm"
          >
            {t('mcp.copyRegister')}
          </button>
        </div>
        <p class="text-[10px] text-text-tertiary leading-relaxed">
          💡 {t('mcp.step1Hint')}
        </p>
      </div>

      <!-- 第 1 步底部导航 -->
      <div class="flex items-center justify-end pt-1">
        <button
          type="button"
          onclick={() => (currentStep = 2)}
          class="px-3.5 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1 shadow-sm"
        >
          <span>{t('mcp.nextStep')}</span>
          <span>→</span>
        </button>
      </div>
    </div>

  {:else if currentStep === 2}
    <!-- 第 2 步：开启服务 -->
    <div class="space-y-2.5">
      <div class="p-3 rounded-xl bg-surface border border-border-subtle space-y-2.5">
        <div class="flex items-center justify-between">
          <div class="space-y-0.5">
            <span class="font-semibold text-text-primary text-xs block">{t('mcp.step2Title')}</span>
            <p class="text-[10px] text-text-tertiary">
              {appState.mcpStatus.isConnected ? t('mcp.step2RunningHint') : t('mcp.step2Desc')}
            </p>
          </div>
          <Switch
            id="mcp-toggle-step"
            checked={appState.settings.mcp?.enabled === true}
            size="md"
            onchange={(val) => updateMcpSettings({ enabled: val })}
          />
        </div>

        <!-- 状态条 -->
        <div class="p-2 rounded-lg flex items-center gap-2 border {errorCategory ? 'bg-status-danger/10 border-status-danger/30' : 'bg-subtle/70 border-border-subtle/60'}">
          <span class="w-2.5 h-2.5 rounded-full flex-shrink-0 {
            appState.mcpStatus.isConnected
              ? 'bg-emerald-500 animate-pulse'
              : (errorCategory
                  ? 'bg-status-danger'
                  : (appState.settings.mcp?.enabled && appState.mcpStatus.isConnecting
                      ? 'bg-amber-500 animate-pulse'
                      : (appState.settings.mcp?.enabled ? 'bg-amber-500' : 'bg-status-danger')))
          }"></span>
          <span class="text-[11px] font-medium {errorCategory ? 'text-status-danger' : 'text-text-primary'} truncate">
            {#if appState.mcpStatus.isConnected}
              {t('mcp.nativeActive', { port: appState.settings.mcp?.wsPort || DEFAULT_MCP_WS_PORT })}
            {:else if errorCategory === 'PORT_IN_USE'}
              {t('mcp.errPortInUse', { port: appState.settings.mcp?.wsPort || DEFAULT_MCP_WS_PORT })}
            {:else if errorCategory === 'NOT_REGISTERED'}
              {t('mcp.errNotRegistered')}
            {:else if errorCategory === 'GENERAL'}
              {t('mcp.errGeneral', { error: appState.mcpStatus.lastError })}
            {:else if appState.settings.mcp?.enabled && appState.mcpStatus.isConnecting}
              {t('mcp.connecting')}
            {:else}
              {t('mcp.offline')}
            {/if}
          </span>

          {#if errorCategory === 'PORT_IN_USE'}
            <button
              type="button"
              onclick={() => {
                showAdvanced = true;
                setTimeout(() => portInputRef?.focus(), 50);
              }}
              class="ml-auto px-2 py-0.5 rounded text-[10px] font-medium bg-accent text-white hover:opacity-90 transition-opacity flex-shrink-0 shadow-sm"
            >
              {t('mcp.fixPort')}
            </button>
          {:else if errorCategory === 'NOT_REGISTERED'}
            <button
              type="button"
              onclick={() => (currentStep = 1)}
              class="ml-auto px-2 py-0.5 rounded text-[10px] font-medium bg-accent text-white hover:opacity-90 transition-opacity flex-shrink-0 shadow-sm"
            >
              {t('mcp.fixRegister')}
            </button>
          {/if}
        </div>

        <!-- 高级网络设置 (折叠展开) -->
        <div>
          <button
            type="button"
            onclick={() => (showAdvanced = !showAdvanced)}
            class="text-[10px] text-text-tertiary hover:text-text-secondary transition-colors flex items-center gap-1"
          >
            <span>{showAdvanced ? '▾' : '▸'}</span>
            <span>{t('mcp.advancedSettings')}</span>
          </button>
          {#if showAdvanced}
            <div class="mt-2 p-2.5 rounded-lg bg-subtle/40 border border-border-subtle/40 space-y-2.5">
              <div class="flex items-center justify-between gap-2">
                <span class="text-[10px] text-text-secondary">{t('mcp.portLabel')}</span>
                <input
                  id="mcp-port-input"
                  bind:this={portInputRef}
                  type="number"
                  value={appState.settings.mcp?.wsPort || DEFAULT_MCP_WS_PORT}
                  onchange={(e) => updateMcpSettings({ wsPort: parseInt(e.target.value, 10) || DEFAULT_MCP_WS_PORT })}
                  onkeydown={(e) => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur();
                    }
                  }}
                  class="w-16 px-1.5 py-0.5 rounded bg-surface border border-border-subtle text-center text-[11px] text-text-primary font-mono outline-none focus:border-accent"
                />
              </div>

              <div class="pt-2 border-t border-border-subtle/30">
                <ToggleRow
                  id="mcp-allow-lan"
                  label={t('mcp.allowLanTitle')}
                  description={t('mcp.allowLanDesc')}
                  checked={appState.settings.mcp?.allowLan === true}
                  size="sm"
                  onchange={(val) => updateMcpSettings({ allowLan: val })}
                />
                {#if appState.settings.mcp?.allowLan}
                  <p class="mt-1.5 text-[10px] text-amber-600 dark:text-amber-400/90 leading-relaxed">
                    {t('mcp.allowLanWarning')}
                  </p>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      </div>

      <!-- 第 2 步底部导航 -->
      <div class="flex items-center justify-between pt-1">
        <button
          type="button"
          onclick={() => (currentStep = 1)}
          class="px-3 py-1.5 rounded-lg border border-border-subtle bg-surface hover:bg-subtle text-text-secondary hover:text-text-primary text-xs transition-colors"
        >
          ← {t('mcp.prevStep')}
        </button>
        <button
          type="button"
          onclick={() => (currentStep = 3)}
          class="px-3.5 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1 shadow-sm"
        >
          <span>{t('mcp.nextStep')}</span>
          <span>→</span>
        </button>
      </div>
    </div>

  {:else if currentStep === 3}
    <!-- 第 3 步：接入外部 AI 客户端 -->
    <div class="space-y-2.5">
      <div class="space-y-0.5">
        <h3 class="text-xs font-semibold text-text-primary">{t('mcp.step3Title')}</h3>
        <p class="text-[10px] text-text-secondary leading-relaxed">
          {t('mcp.step3Desc')}
        </p>
      </div>

      <div class="grid grid-cols-2 gap-2.5">
        <!-- 方式 A：Cursor / Claude Desktop -->
        <div class="p-2.5 rounded-xl border border-border-subtle bg-surface space-y-2 flex flex-col justify-between">
          <div class="space-y-0.5">
            <span class="font-semibold text-text-primary text-xs block">{t('mcp.clientCodeTitle')}</span>
            <p class="text-[10px] text-text-secondary leading-relaxed">
              {t('mcp.clientCodeDesc')}
            </p>
          </div>
          <button
            type="button"
            onclick={copyStdioConfig}
            class="w-full py-1.5 rounded-lg bg-subtle hover:bg-surface border border-border-subtle text-text-primary text-xs font-medium transition-colors shadow-sm text-center"
          >
            {t('mcp.copyCursor')}
          </button>
        </div>

        <!-- 方式 B：CherryStudio / 网页助手 -->
        <div class="p-2.5 rounded-xl border border-accent/25 bg-accent/5 space-y-2 flex flex-col justify-between">
          <div class="space-y-0.5">
            <span class="font-semibold text-text-primary text-xs block">{t('mcp.clientWebTitle')}</span>
            <p class="text-[10px] text-text-secondary leading-relaxed">
              {t('mcp.clientWebDesc')}
            </p>
          </div>
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              onclick={copyHttpJsonConfig}
              class="flex-1 py-1.5 rounded-lg bg-accent text-white hover:opacity-90 transition-opacity text-xs font-medium shadow-sm text-center"
            >
              {t('mcp.copyHttpJson')}
            </button>
            <button
              type="button"
              onclick={copyHttpEndpoint}
              class="px-2.5 py-1.5 rounded-lg bg-surface hover:bg-subtle border border-border-subtle text-text-secondary hover:text-text-primary text-xs font-medium transition-colors text-center flex-shrink-0"
            >
              {t('mcp.copyHttpUrl')}
            </button>
          </div>
        </div>
      </div>
      <!-- 第 3 步底部导航 -->
      <div class="flex items-center justify-between pt-1">
        <button
          type="button"
          onclick={() => (currentStep = 2)}
          class="px-3 py-1.5 rounded-lg border border-border-subtle bg-surface hover:bg-subtle text-text-secondary hover:text-text-primary text-xs transition-colors"
        >
          ← {t('mcp.prevStep')}
        </button>
      </div>
    </div>
  {/if}
</div>
