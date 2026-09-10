<script>
  import { t } from '../../../i18n/index.svelte.js';
  import { appState } from '../../../state/app.svelte.js';
  import { toast } from '../../../state/toast.svelte.js';
  import { DEFAULT_MCP_SETTINGS, DEFAULT_MCP_WS_HOST, DEFAULT_MCP_WS_PORT } from '../../../constants/index.js';

  function updateMcpSettings(partial) {
    const current = appState.settings.mcp || DEFAULT_MCP_SETTINGS;
    const updated = { ...current, ...partial };
    appState.updateSettings({ mcp: updated });
    if (updated.enabled === true) {
      appState.reconnectMcp(updated.wsHost || DEFAULT_MCP_WS_HOST, updated.wsPort || DEFAULT_MCP_WS_PORT);
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

<div class="space-y-4">
  <!-- 头部介绍 -->
  <div class="p-3.5 rounded-xl border border-border-subtle bg-surface space-y-2">
    <div class="flex items-center gap-2">
      <span class="font-semibold text-text-primary text-sm">{t('mcp.title')}</span>
      <span class="text-[10px] px-1.5 py-0.5 rounded bg-subtle text-text-tertiary font-mono">{t('mcp.badge')}</span>
    </div>
    <p class="text-[11px] text-text-secondary leading-relaxed">
      {t('mcp.desc')}
    </p>
  </div>

  <!-- 步骤一：本地注册宿主 -->
  <div class="p-3.5 rounded-xl border border-border-subtle bg-surface space-y-2.5">
    <div class="flex items-center gap-2">
      <span class="w-5 h-5 rounded-full bg-accent/15 text-accent font-bold text-[11px] flex items-center justify-center">1</span>
      <span class="font-semibold text-text-primary text-xs">{t('mcp.step1Title')}</span>
    </div>
    <p class="text-[11px] text-text-secondary leading-relaxed">
      {t('mcp.step1Desc')}
    </p>
    <div class="flex items-center gap-2 p-2 rounded-lg bg-subtle border border-border-subtle/80">
      <code class="flex-1 font-mono text-[11px] text-accent select-all truncate" title={registerCommand}>
        {registerCommand}
      </code>
      <button
        type="button"
        onclick={copyRegisterCommand}
        class="px-2.5 py-1 rounded bg-surface hover:bg-subtle border border-border-subtle text-text-secondary hover:text-text-primary text-[11px] font-medium transition-colors flex-shrink-0"
      >
        {t('common.copy')}
      </button>
    </div>
  </div>

  <!-- 步骤二：开启 MCP 协同与配置 -->
  <div class="p-3.5 rounded-xl border border-border-subtle bg-surface space-y-3">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="w-5 h-5 rounded-full bg-accent/15 text-accent font-bold text-[11px] flex items-center justify-center">2</span>
        <span class="font-semibold text-text-primary text-xs">{t('mcp.step2Title')}</span>
      </div>
      <!-- 开启总开关 -->
      <div class="flex items-center gap-2">
        <input
          type="checkbox"
          id="mcp-page-enabled"
          checked={appState.settings.mcp?.enabled === true}
          onchange={(e) => updateMcpSettings({ enabled: e.target.checked })}
          class="rounded border-border-subtle text-accent"
        />
        <label for="mcp-page-enabled" class="text-text-secondary cursor-pointer text-[11px] font-medium">
          {t('mcp.enable')}
        </label>
      </div>
    </div>
    <p class="text-[11px] text-text-secondary leading-relaxed">
      {t('mcp.step2Desc')}
    </p>

    <!-- 运行状态与端口设置 -->
    <div class="p-2.5 rounded-lg bg-subtle/70 border border-border-subtle/60 flex items-center justify-between gap-2">
      <div class="flex items-center gap-2 min-w-0">
        <span class="w-2.5 h-2.5 rounded-full flex-shrink-0 {appState.mcpStatus.isConnected ? 'bg-emerald-500 animate-pulse' : (appState.settings.mcp?.enabled ? 'bg-amber-500' : 'bg-status-danger')}"></span>
        <span class="font-medium text-text-primary text-[11px] truncate">
          {appState.mcpStatus.isConnected
            ? t('mcp.nativeActive', { url: `http://${appState.settings.mcp?.wsHost || DEFAULT_MCP_WS_HOST}:${appState.settings.mcp?.wsPort || DEFAULT_MCP_WS_PORT}/mcp` })
            : (appState.mcpStatus.lastError
                ? t('mcp.nativeUnregistered')
                : t('mcp.offline'))}
        </span>
      </div>

      <div class="flex items-center gap-2 text-[11px] flex-shrink-0">
        <div class="flex items-center gap-1">
          <span class="text-[10px] text-text-tertiary">{t('mcp.portLabel')}</span>
          <input
            type="number"
            value={appState.settings.mcp?.wsPort || DEFAULT_MCP_WS_PORT}
            onchange={(e) => updateMcpSettings({ wsPort: parseInt(e.target.value, 10) || DEFAULT_MCP_WS_PORT })}
            class="w-16 px-1.5 py-0.5 rounded bg-surface border border-border-subtle text-center text-[11px] text-text-primary font-mono outline-none"
          />
        </div>
      </div>
    </div>
  </div>

  <!-- 步骤三：接入外部 AI 客户端 -->
  <div class="p-3.5 rounded-xl border border-border-subtle bg-surface space-y-3">
    <div class="flex items-center gap-2">
      <span class="w-5 h-5 rounded-full bg-accent/15 text-accent font-bold text-[11px] flex items-center justify-center">3</span>
      <span class="font-semibold text-text-primary text-xs">{t('mcp.step3Title')}</span>
    </div>
    <p class="text-[11px] text-text-secondary leading-relaxed">
      {t('mcp.step3Desc')}
    </p>

    <!-- 方式 A：Streamable HTTP -->
    <div class="p-2.5 rounded-lg border border-accent/25 bg-accent/5 space-y-2">
      <div class="flex items-center justify-between">
        <span class="font-medium text-text-primary text-[11px]">{t('mcp.httpModeTitle')}</span>
        <button
          type="button"
          onclick={copyHttpEndpoint}
          class="px-2.5 py-1 rounded bg-accent text-white font-medium text-[10px] hover:opacity-90 transition-opacity shadow-sm"
        >
          {t('mcp.copyHttp')}
        </button>
      </div>
      <p class="text-[10px] text-text-secondary leading-relaxed">
        {t('mcp.httpModeDesc')}
      </p>
      <div class="p-1.5 rounded bg-surface/80 border border-border-subtle/60 font-mono text-[11px] text-accent truncate select-all">
        http://{appState.settings.mcp?.wsHost || DEFAULT_MCP_WS_HOST}:{appState.settings.mcp?.wsPort || DEFAULT_MCP_WS_PORT}/mcp
      </div>
    </div>

    <!-- 方式 B：Stdio 客户端 -->
    <div class="p-2.5 rounded-lg border border-border-subtle bg-subtle/50 space-y-2">
      <div class="flex items-center justify-between">
        <span class="font-medium text-text-primary text-[11px]">{t('mcp.stdioModeTitle')}</span>
        <button
          type="button"
          onclick={copyStdioConfig}
          class="px-2.5 py-1 rounded bg-surface hover:bg-subtle border border-border-subtle text-text-secondary hover:text-text-primary text-[10px] font-medium transition-colors"
        >
          {t('mcp.copyCursor')}
        </button>
      </div>
      <p class="text-[10px] text-text-secondary leading-relaxed">
        {t('mcp.stdioModeDesc')}
      </p>
    </div>
  </div>
</div>
