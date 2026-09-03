<script>
  import { appState } from '../../../state/app.svelte.js';
  import { toast } from '../../../state/toast.svelte.js';
  import { t } from '../../../i18n/index.svelte.js';
  import {
    UNGROUPED_GROUP_ID,
    AI_API_PRESETS,
    DEFAULT_AI_SETTINGS,
    DEFAULT_MCP_SETTINGS
  } from '../../../constants/index.js';
  import AiResultModal from '../AiResultModal.svelte';

  let isTestingApi = $state(false);
  let showAiResultModal = $state(false);
  let aiResultType = $state('grouping'); // 'grouping' | 'tagging'
  let aiResultItems = $state([]);

  // 派生统计
  let ungroupedBookmarksCount = $derived(
    appState.bookmarks.filter(b => !b.groupId || b.groupId === UNGROUPED_GROUP_ID).length
  );
  let untaggedBookmarksCount = $derived(
    appState.bookmarks.filter(b => !Array.isArray(b.tags) || b.tags.length === 0).length
  );

  function handleSelectPreset(preset) {
    updateAiSettings({
      preset: preset.id,
      baseUrl: preset.baseUrl,
      model: preset.model || appState.settings.ai?.model || 'gpt-4o-mini'
    });
    toast.show(t('ai.presetSwitched', { name: preset.name }));
  }

  async function handleTestApi() {
    const aiConfig = appState.settings.ai || DEFAULT_AI_SETTINGS;
    if (!aiConfig.baseUrl) {
      toast.show(t('ai.testNoEndpoint'));
      return;
    }
    isTestingApi = true;
    toast.show(t('ai.testing'));
    try {
      const res = await appState.testCustomApiConfig(aiConfig);
      toast.show(t('ai.testSuccess', { model: res.model }));
    } catch (e) {
      toast.show(t('ai.testFailed', { error: e.message }));
    } finally {
      isTestingApi = false;
    }
  }

  function updateAiSettings(partial) {
    const current = appState.settings.ai || DEFAULT_AI_SETTINGS;
    const updated = {
      ...current,
      ...partial,
      grouping: {
        ...(current.grouping || {}),
        ...(partial.grouping || {})
      },
      tagging: {
        ...(current.tagging || {}),
        ...(partial.tagging || {})
      }
    };
    appState.updateSettings({ ai: updated });
  }

  function updateMcpSettings(partial) {
    const current = appState.settings.mcp || DEFAULT_MCP_SETTINGS;
    const updated = { ...current, ...partial };
    appState.updateSettings({ mcp: updated });
    if (updated.enabled === true) {
      appState.reconnectMcp(updated.wsHost || '127.0.0.1', updated.wsPort || 8333);
    } else {
      appState.disconnectMcp();
    }
  }

  async function handleStartSmartGrouping() {
    if (appState.bookmarks.length === 0) {
      toast.show(t('ai.bookmarksEmpty'));
      return;
    }

    try {
      const result = await appState.runSmartGrouping();
      if (!result.success || !result.items || result.items.length === 0) {
        toast.show(result.message || t('ai.noGroupingChanges'));
        return;
      }
      aiResultType = 'grouping';
      aiResultItems = result.items;
      showAiResultModal = true;
    } catch (err) {
      toast.show(t('ai.groupingAnalysisFailed', { error: err.message }));
    }
  }

  async function handleStartSmartTagging() {
    if (appState.bookmarks.length === 0) {
      toast.show(t('ai.bookmarksEmpty'));
      return;
    }

    try {
      const result = await appState.runSmartTagging();
      if (!result.success || !result.items || result.items.length === 0) {
        toast.show(result.message || t('ai.noTaggingChanges'));
        return;
      }
      aiResultType = 'tagging';
      aiResultItems = result.items;
      showAiResultModal = true;
    } catch (err) {
      toast.show(t('ai.taggingAnalysisFailed', { error: err.message }));
    }
  }

  async function handleApplyAiResult(selectedItems) {
    if (aiResultType === 'grouping') {
      const plan = selectedItems.map(item => ({
        bookmarkId: item.bookmarkId,
        targetGroupName: item.suggestedGroupName,
        isNewGroup: item.isNewGroup
      }));
      const res = await appState.applyAiGroupChanges(plan);
      const newGroupsSuffix = res.newGroupsCreated
        ? t('ai.groupingAppliedNewGroups', { newGroups: res.newGroupsCreated })
        : '';
      toast.show(t('ai.groupingApplied', { count: res.modifiedCount, newGroups: newGroupsSuffix }));
    } else {
      const plan = selectedItems.map(item => ({
        bookmarkId: item.bookmarkId,
        suggestedTags: item.suggestedTags
      }));
      const mode = appState.settings.ai?.tagging?.mode || 'append';
      const res = await appState.applyAiTagChanges(plan, mode);
      toast.show(t('ai.taggingApplied', { count: res.modifiedCount }));
    }
  }

  // 复制 MCP 配置片段
  function copyConfig(type) {
    const host = appState.settings.mcp?.wsHost || '127.0.0.1';
    const port = appState.settings.mcp?.wsPort || 8333;
    const extraArgs = [];
    if (host !== '127.0.0.1') extraArgs.push('--host', host);
    if (port !== 8333) extraArgs.push('--port', String(port));

    let snippet = '';

    if (type === 'claude') {
      snippet = JSON.stringify({
        mcpServers: {
          "smart-bookmark": {
            command: "node",
            args: ["scripts/mcp-bridge.js", ...extraArgs]
          }
        }
      }, null, 2);
    } else if (type === 'cursor') {
      const cursorArgs = ["run", "mcp"];
      if (extraArgs.length > 0) {
        cursorArgs.push("--", ...extraArgs);
      }
      snippet = JSON.stringify({
        mcpServers: {
          "smart-bookmark": {
            command: "npm",
            args: cursorArgs
          }
        }
      }, null, 2);
    }

    navigator.clipboard.writeText(snippet).then(() => {
      toast.show(t('mcp.copiedToast'));
    }).catch(() => {
      toast.show(t('mcp.copyFailedToast'));
    });
  }
</script>

<!-- 模块 1: AI 驱动引擎与常用预设 -->
<div class="p-3.5 rounded-xl border border-border-subtle bg-surface space-y-3">
  <div class="flex items-center justify-between">
    <span class="font-semibold text-text-primary flex items-center gap-1.5">
      <span>🤖 {t('ai.apiConfigTitle')}</span>
    </span>
    <span class="text-[10px] text-text-tertiary">{t('ai.apiConfigDesc')}</span>
  </div>

  <!-- 快捷预设按钮组 -->
  <div class="space-y-1.5">
    <span class="text-[11px] font-medium text-text-secondary block">{t('ai.presetsTitle')}</span>
    <div class="grid grid-cols-4 gap-1.5">
      {#each AI_API_PRESETS as p}
        <button
          type="button"
          onclick={() => handleSelectPreset(p)}
          class="p-2 rounded-lg border text-left transition-all {(appState.settings.ai?.preset || 'deepseek') === p.id
            ? 'border-accent bg-accent/5 ring-1 ring-accent/30 text-text-primary font-medium'
            : 'border-border-subtle bg-subtle/50 hover:bg-subtle text-text-secondary'}"
        >
          <div class="text-[11px] font-semibold">{p.name}</div>
          <div class="text-[9px] text-text-tertiary truncate mt-0.5">{t('ai.presets.' + p.id + 'Desc', {}, p.desc)}</div>
        </button>
      {/each}
    </div>
  </div>

  <!-- API 配置表单 -->
  <div class="space-y-2.5 pt-1 border-t border-border-subtle/60">
    <div class="grid grid-cols-2 gap-2">
      <div class="space-y-1">
        <label for="ai-base-url" class="block font-medium text-text-secondary text-[11px]">{t('ai.baseUrlLabel')}</label>
        <input
          id="ai-base-url"
          type="text"
          value={appState.settings.ai?.baseUrl || 'https://api.deepseek.com/v1'}
          onchange={(e) => updateAiSettings({ baseUrl: e.target.value.trim() })}
          placeholder="https://api.deepseek.com/v1"
          class="w-full px-2.5 py-1.5 rounded-lg bg-subtle border border-border-subtle outline-none text-text-primary text-[11px]"
        />
      </div>
      <div class="space-y-1">
        <label for="ai-model" class="block font-medium text-text-secondary text-[11px]">{t('ai.modelLabel')}</label>
        <input
          id="ai-model"
          type="text"
          value={appState.settings.ai?.model || 'deepseek-chat'}
          onchange={(e) => updateAiSettings({ model: e.target.value.trim() })}
          placeholder="deepseek-chat / gpt-4o-mini / qwen2.5:7b"
          class="w-full px-2.5 py-1.5 rounded-lg bg-subtle border border-border-subtle outline-none text-text-primary text-[11px]"
        />
      </div>
    </div>

    <div class="space-y-1">
      <label for="ai-key" class="block font-medium text-text-secondary text-[11px]">{t('ai.apiKeyLabel')}</label>
      <div class="flex items-center gap-2">
        <input
          id="ai-key"
          type="password"
          value={appState.settings.ai?.apiKey || ''}
          onchange={(e) => updateAiSettings({ apiKey: e.target.value.trim() })}
          placeholder="sk-..."
          class="flex-1 px-2.5 py-1.5 rounded-lg bg-subtle border border-border-subtle outline-none text-text-primary text-[11px]"
        />
        <button
          type="button"
          disabled={isTestingApi}
          onclick={handleTestApi}
          class="px-3 py-1.5 rounded-lg border border-border-subtle hover:bg-subtle text-text-secondary hover:text-text-primary transition-colors text-[11px] disabled:opacity-40"
        >
          {isTestingApi ? t('ai.testing') : t('ai.testConnect')}
        </button>
      </div>
    </div>
  </div>
</div>

<!-- 模块 2: 两个核心 AI 治理操作 -->
<div class="grid grid-cols-2 gap-3">
  <!-- 操作 1: 智能分组 -->
  <div class="p-3.5 rounded-xl border border-border-subtle bg-surface space-y-3 flex flex-col justify-between">
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <span class="font-semibold text-text-primary flex items-center gap-1.5">
          <span>✨ {t('ai.groupingTitle')}</span>
        </span>
        <span class="text-[10px] text-text-tertiary">{t('ai.ungroupedCount', { count: ungroupedBookmarksCount })}</span>
      </div>
      <p class="text-[11px] text-text-secondary leading-relaxed">
        {t('ai.groupingDesc')}
      </p>

      <div class="space-y-1.5 pt-1 text-[11px]">
        <div class="flex items-center gap-2">
          <input
            type="radio"
            id="scope-ungrouped"
            name="group-scope"
            checked={appState.settings.ai?.grouping?.scope !== 'all'}
            onchange={() => updateAiSettings({ grouping: { scope: 'ungrouped' } })}
            class="text-accent"
          />
          <label for="scope-ungrouped" class="text-text-secondary cursor-pointer">
            {t('ai.scopeUngrouped', { count: ungroupedBookmarksCount })}
          </label>
        </div>
        <div class="flex items-center gap-2">
          <input
            type="radio"
            id="scope-all"
            name="group-scope"
            checked={appState.settings.ai?.grouping?.scope === 'all'}
            onchange={() => updateAiSettings({ grouping: { scope: 'all' } })}
            class="text-accent"
          />
          <label for="scope-all" class="text-text-secondary cursor-pointer">
            {t('ai.scopeAll', { count: appState.bookmarks.length })}
          </label>
        </div>

        <div class="flex items-center gap-1.5 pt-1">
          <input
            type="checkbox"
            id="allow-new-groups"
            checked={appState.settings.ai?.grouping?.allowNewGroups !== false}
            onchange={(e) => updateAiSettings({ grouping: { allowNewGroups: e.target.checked } })}
            class="rounded border-border-subtle text-accent"
          />
          <label for="allow-new-groups" class="text-text-tertiary cursor-pointer text-[10px]">
            {t('ai.allowNewGroups')}
          </label>
        </div>
      </div>
    </div>

    <button
      type="button"
      disabled={appState.aiRunning}
      onclick={handleStartSmartGrouping}
      class="w-full py-2 rounded-lg bg-accent text-accent-fg font-medium hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5 text-xs shadow-xs"
    >
      {#if appState.aiRunning && appState.aiProgress?.phase === 'grouping'}
        <span class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
        <span>{appState.aiProgress.message}</span>
      {:else}
        <span>🚀 {t('ai.startGrouping')}</span>
      {/if}
    </button>
  </div>

  <!-- 操作 2: 智能标签 -->
  <div class="p-3.5 rounded-xl border border-border-subtle bg-surface space-y-3 flex flex-col justify-between">
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <span class="font-semibold text-text-primary flex items-center gap-1.5">
          <span>🏷️ {t('ai.taggingTitle')}</span>
        </span>
        <span class="text-[10px] text-text-tertiary">{t('ai.untaggedCount', { count: untaggedBookmarksCount })}</span>
      </div>
      <p class="text-[11px] text-text-secondary leading-relaxed">
        {t('ai.taggingDesc')}
      </p>

      <div class="space-y-1.5 pt-1 text-[11px]">
        <div class="flex items-center gap-2">
          <input
            type="radio"
            id="scope-untagged"
            name="tag-scope"
            checked={appState.settings.ai?.tagging?.scope !== 'all'}
            onchange={() => updateAiSettings({ tagging: { scope: 'untagged' } })}
            class="text-accent"
          />
          <label for="scope-untagged" class="text-text-secondary cursor-pointer">
            {t('ai.scopeUntagged', { count: untaggedBookmarksCount })}
          </label>
        </div>
        <div class="flex items-center gap-2">
          <input
            type="radio"
            id="scope-tag-all"
            name="tag-scope"
            checked={appState.settings.ai?.tagging?.scope === 'all'}
            onchange={() => updateAiSettings({ tagging: { scope: 'all' } })}
            class="text-accent"
          />
          <label for="scope-tag-all" class="text-text-secondary cursor-pointer">
            {t('ai.scopeTagAll', { count: appState.bookmarks.length })}
          </label>
        </div>

        <div class="flex items-center justify-between pt-1 text-[10px] text-text-tertiary">
          <span>{t('ai.mergeMode')}</span>
          <div class="flex items-center gap-2">
            <label class="cursor-pointer">
              <input
                type="radio"
                name="tag-mode"
                checked={appState.settings.ai?.tagging?.mode !== 'replace'}
                onchange={() => updateAiSettings({ tagging: { mode: 'append' } })}
                class="text-accent mr-0.5"
              /> {t('ai.modeAppend')}
            </label>
            <label class="cursor-pointer">
              <input
                type="radio"
                name="tag-mode"
                checked={appState.settings.ai?.tagging?.mode === 'replace'}
                onchange={() => updateAiSettings({ tagging: { mode: 'replace' } })}
                class="text-accent mr-0.5"
              /> {t('ai.modeReplace')}
            </label>
          </div>
        </div>
      </div>
    </div>

    <button
      type="button"
      disabled={appState.aiRunning}
      onclick={handleStartSmartTagging}
      class="w-full py-2 rounded-lg bg-accent text-accent-fg font-medium hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5 text-xs shadow-xs"
    >
      {#if appState.aiRunning && appState.aiProgress?.phase === 'tagging'}
        <span class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
        <span>{appState.aiProgress.message}</span>
      {:else}
        <span>🏷️ {t('ai.startTagging')}</span>
      {/if}
    </button>
  </div>
</div>

<!-- 模块 3: MCP 外部协议开放生态支持 -->
<div class="p-3.5 rounded-xl border border-border-subtle bg-surface space-y-3">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <span class="font-semibold text-text-primary">🔌 {t('mcp.title')}</span>
      <span class="text-[10px] px-1.5 py-0.5 rounded bg-subtle text-text-tertiary font-mono">{t('mcp.badge')}</span>
    </div>

    <!-- MCP 开关 -->
    <div class="flex items-center gap-2">
      <input
        type="checkbox"
        id="mcp-enabled"
        checked={appState.settings.mcp?.enabled === true}
        onchange={(e) => updateMcpSettings({ enabled: e.target.checked })}
        class="rounded border-border-subtle text-accent"
      />
      <label for="mcp-enabled" class="text-text-secondary cursor-pointer text-[11px]">
        {t('mcp.enable')}
      </label>
    </div>
  </div>

  <p class="text-[11px] text-text-secondary leading-relaxed">
    {t('mcp.desc')}
  </p>

  <!-- 状态与主机/端口设置 -->
  <div class="p-2.5 rounded-lg bg-subtle/70 border border-border-subtle/60 flex items-center justify-between gap-2">
    <div class="flex items-center gap-2 min-w-0">
      <span class="w-2 h-2 rounded-full flex-shrink-0 {appState.mcpStatus.isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-status-danger'}"></span>
      <span class="font-medium text-text-primary text-[11px] truncate">
        {appState.mcpStatus.isConnected
          ? t('mcp.connected', { url: `ws://${appState.settings.mcp?.wsHost || '127.0.0.1'}:${appState.settings.mcp?.wsPort || 8333}` })
          : t('mcp.offline')}
      </span>
    </div>

    <div class="flex items-center gap-2 text-[11px] flex-shrink-0">
      <div class="flex items-center gap-1">
        <span class="text-[10px] text-text-tertiary">{t('mcp.hostLabel')}</span>
        <input
          type="text"
          value={appState.settings.mcp?.wsHost || '127.0.0.1'}
          onchange={(e) => updateMcpSettings({ wsHost: e.target.value.trim() || '127.0.0.1' })}
          placeholder="127.0.0.1"
          class="w-24 px-1.5 py-0.5 rounded bg-surface border border-border-subtle text-[11px] text-text-primary font-mono outline-none"
        />
      </div>
      <div class="flex items-center gap-1">
        <span class="text-[10px] text-text-tertiary">{t('mcp.portLabel')}</span>
        <input
          type="number"
          value={appState.settings.mcp?.wsPort || 8333}
          onchange={(e) => updateMcpSettings({ wsPort: parseInt(e.target.value, 10) || 8333 })}
          class="w-16 px-1.5 py-0.5 rounded bg-surface border border-border-subtle text-center text-[11px] text-text-primary font-mono outline-none"
        />
      </div>
    </div>
  </div>

  <!-- 启动指令与一键配置复制 -->
  <div class="space-y-2 pt-1">
    <div class="flex items-center justify-between text-[11px]">
      <span class="text-text-secondary font-medium">{t('mcp.step1Bridge')}</span>
      <code class="px-2 py-0.5 rounded bg-subtle text-accent font-mono text-[10px] border border-border-subtle">
        {(appState.settings.mcp?.wsHost && appState.settings.mcp?.wsHost !== '127.0.0.1') || (appState.settings.mcp?.wsPort && appState.settings.mcp?.wsPort !== 8333)
          ? `node scripts/mcp-bridge.js${appState.settings.mcp?.wsHost !== '127.0.0.1' ? ` --host ${appState.settings.mcp?.wsHost}` : ''}${appState.settings.mcp?.wsPort !== 8333 ? ` --port ${appState.settings.mcp?.wsPort}` : ''}`
          : 'npm run mcp'}
      </code>
    </div>

    <div class="flex items-center justify-between text-[11px]">
      <span class="text-text-secondary font-medium">{t('mcp.step2Config')}</span>
      <div class="flex items-center gap-2">
        <button
          type="button"
          onclick={() => copyConfig('cursor')}
          class="px-2 py-1 rounded bg-subtle hover:bg-surface border border-border-subtle text-text-secondary hover:text-text-primary text-[10px] transition-colors"
        >
          {t('mcp.copyCursor')}
        </button>
        <button
          type="button"
          onclick={() => copyConfig('claude')}
          class="px-2 py-1 rounded bg-subtle hover:bg-surface border border-border-subtle text-text-secondary hover:text-text-primary text-[10px] transition-colors"
        >
          {t('mcp.copyClaude')}
        </button>
      </div>
    </div>
  </div>
</div>

<!-- AI 分析结果 Diff 确认与应用模态框 -->
<AiResultModal
  bind:open={showAiResultModal}
  type={aiResultType}
  bind:items={aiResultItems}
  onApply={handleApplyAiResult}
/>
