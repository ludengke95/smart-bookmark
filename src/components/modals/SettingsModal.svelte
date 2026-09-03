<script>
  import { appState } from '../../state/app.svelte.js';
  import { toast } from '../../state/toast.svelte.js';
  import { t } from '../../i18n/index.svelte.js';
  import { getGroupName } from '../../i18n/utils.js';
  import {
    THEMES,
    PINNED_GROUP_ID,
    UNGROUPED_GROUP_ID,
    AI_API_PRESETS,
    DEFAULT_AI_SETTINGS,
    DEFAULT_MCP_SETTINGS
  } from '../../constants/index.js';
  import Select from '../common/Select.svelte';
  import AiResultModal from './AiResultModal.svelte';

  let { open = $bindable(false) } = $props();

  let activeTab = $state('general'); // 'general' | 'groups' | 'ai' | 'danger'
  let newGroupName = $state('');
  let editingGroupId = $state(null);
  let editingGroupName = $state('');

  // AI 相关局部响应式状态
  let isTestingApi = $state(false);
  let showAiResultModal = $state(false);
  let aiResultType = $state('grouping'); // 'grouping' | 'tagging'
  let aiResultItems = $state([]);

  const languageOptions = $derived([
    { value: 'auto', label: t('settings.languageAuto'), iconText: '🌐' },
    { value: 'zh-CN', label: t('settings.languageZh'), iconText: '🇨🇳' },
    { value: 'en-US', label: t('settings.languageEn'), iconText: '🇺🇸' }
  ]);

  const clockFormatOptions = $derived([
    { value: '24', label: t('settings.clock24') },
    { value: '12', label: t('settings.clock12') }
  ]);

  // 派生统计
  let ungroupedBookmarksCount = $derived(
    appState.bookmarks.filter(b => !b.groupId || b.groupId === UNGROUPED_GROUP_ID).length
  );
  let untaggedBookmarksCount = $derived(
    appState.bookmarks.filter(b => !Array.isArray(b.tags) || b.tags.length === 0).length
  );

  function handleThemeChange(themeId) {
    const t = THEMES.find(item => item.id === themeId);
    appState.updateSettings({ theme: themeId });
    toast.show(`已切换至主题: ${t?.name || themeId}`);
  }

  function handleAddGroup() {
    const name = newGroupName.trim();
    if (!name) {
      toast.show(t('groups.groupNamePlaceholder'));
      return;
    }
    appState.saveGroup({ name });
    newGroupName = '';
    toast.show(t('groups.created'));
  }

  function handleStartEditGroup(group) {
    editingGroupId = group.id;
    editingGroupName = group.name;
  }

  function handleSaveEditGroup() {
    if (!editingGroupName.trim()) return;
    appState.saveGroup({ id: editingGroupId, name: editingGroupName.trim() });
    editingGroupId = null;
    editingGroupName = '';
    toast.show(t('groups.renamed'));
  }

  async function handleDeleteGroup(groupId) {
    if (groupId === PINNED_GROUP_ID || groupId === UNGROUPED_GROUP_ID) {
      toast.show(t('groups.builtinNoDelete'));
      return;
    }
    await appState.deleteGroup(groupId);
    toast.show(t('groups.deleted'));
  }

  async function handleMoveGroup(groupId, direction) {
    const custom = appState.groups.filter(g => g.id !== PINNED_GROUP_ID && g.id !== UNGROUPED_GROUP_ID);
    const idx = custom.findIndex(g => g.id === groupId);
    if (idx === -1) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= custom.length) return;

    // 交换位置并重排
    const newCustom = [...custom];
    const temp = newCustom[idx];
    newCustom[idx] = newCustom[targetIdx];
    newCustom[targetIdx] = temp;

    const orderedIds = newCustom.map(g => g.id);
    await appState.reorderGroups(orderedIds);
    toast.show(t('groups.orderUpdated'));
  }

  async function handleResetData() {
    if (confirm('确定要恢复出厂初始数据吗？当前数据将自动生成安全快照备份。')) {
      await appState.resetDefaultData();
      toast.show('已重置为默认初始数据');
      open = false;
    }
  }

  // ==========================================
  // AI 智能治理与 MCP 交互处理
  // ==========================================

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

{#if open}
  <div
    class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={(e) => { if (e.target === e.currentTarget) open = false; }}
    onkeydown={(e) => { if (e.key === 'Escape') open = false; }}
  >
    <div class="w-full max-w-xl h-[560px] bg-surface border border-border-subtle rounded-xl shadow-popover p-5 space-y-4 flex flex-col">
      <!-- 头部 -->
      <div class="flex items-center justify-between pb-2 border-b border-border-subtle flex-shrink-0">
        <h2 class="text-sm font-semibold text-text-primary flex items-center gap-2">
          <span>{t('settings.title')}</span>
        </h2>
        <button
          type="button"
          onclick={() => (open = false)}
          class="p-1 rounded hover:bg-subtle text-text-tertiary hover:text-text-primary transition-colors"
          aria-label={t('common.close')}
          title={t('common.close')}
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

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
          <!-- 语言选择 (使用统一规范 Select 组件) -->
          <div class="space-y-1.5">
            <span class="block font-medium text-text-secondary">{t('settings.language')}</span>
            <Select
              options={languageOptions}
              value={appState.settings.language || 'auto'}
              onchange={(val) => {
                appState.updateSettings({ language: val });
                toast.show(t('common.success'));
              }}
            />
          </div>

          <!-- 3款极简主题切换 -->
          <div class="space-y-2 pt-2 border-t border-border-subtle">
            <span class="block font-medium text-text-secondary">{t('settings.theme')}</span>
            <span class="block font-medium text-text-secondary">视觉风格 (3款极简主题)</span>
            <div class="grid grid-cols-3 gap-2.5">
              {#each THEMES as theme}
                <button
                  type="button"
                  onclick={() => handleThemeChange(theme.id)}
                  class="p-3 rounded-xl border text-left flex flex-col justify-between transition-all {appState.settings.theme === theme.id
                    ? 'border-border-focus bg-subtle ring-1 ring-border-focus'
                    : 'border-border-subtle bg-surface hover:bg-subtle/50'}"
                >
                  <div class="flex items-center justify-between mb-2">
                    <span class="font-medium text-text-primary text-[11px]">{theme.name}</span>
                    {#if appState.settings.theme === theme.id}
                      <span class="w-1.5 h-1.5 rounded-full bg-accent"></span>
                    {/if}
                  </div>
                  <!-- 色彩预览色块 -->
                  <div class="flex items-center gap-1.5 mt-1">
                    <div class="w-4 h-4 rounded border border-border-subtle" style="background-color: {theme.previewBg}"></div>
                    <div class="w-4 h-4 rounded border border-border-subtle" style="background-color: {theme.previewBorder}"></div>
                  </div>
                </button>
              {/each}
            </div>
          </div>

          <!-- 时钟与座右铭 -->
          <div class="space-y-3 pt-2 border-t border-border-subtle">
            <div class="space-y-1">
              <span class="block font-medium text-text-secondary">{t('settings.clockFormat')}</span>
              <Select
                options={clockFormatOptions}
                value={appState.settings.clockFormat}
                onchange={(val) => appState.updateSettings({ clockFormat: val })}
              />
            </div>

            <div class="flex items-center gap-2">
              <input
                type="checkbox"
                id="show-seconds"
                checked={appState.settings.showSeconds}
                onchange={(e) => appState.updateSettings({ showSeconds: e.target.checked })}
                class="rounded border-border-subtle text-accent"
              />
              <label for="show-seconds" class="text-text-secondary cursor-pointer">
                {t('settings.showSeconds')}
              </label>
            </div>

            <div class="space-y-1">
              <label for="set-motto" class="block font-medium text-text-secondary">{t('settings.motto')}</label>
              <input
                id="set-motto"
                type="text"
                value={appState.settings.motto}
                onchange={(e) => appState.updateSettings({ motto: e.target.value })}
                placeholder={t('settings.mottoPlaceholder')}
                class="w-full px-3 py-2 rounded-lg bg-subtle border border-border-subtle outline-none text-text-primary"
              />
            </div>
          </div>

        {:else if activeTab === 'groups'}
          <!-- 分组添加 -->
          <div class="flex items-center gap-2">
            <input
              type="text"
              bind:value={newGroupName}
              placeholder={t('groups.groupNamePlaceholder')}
              class="flex-1 px-3 py-2 rounded-lg bg-subtle border border-border-subtle outline-none text-text-primary"
            />
            <button
              type="button"
              onclick={handleAddGroup}
              class="px-3 py-2 rounded-lg bg-accent text-accent-fg font-medium hover:opacity-90 transition-opacity"
            >
              {t('groups.addGroup')}
            </button>
          </div>

          <!-- 分组列表 -->
          {@const customGroups = appState.groups.filter(g => g.id !== PINNED_GROUP_ID && g.id !== UNGROUPED_GROUP_ID)}
          <div class="space-y-1.5 divide-y divide-border-subtle/50 border border-border-subtle rounded-xl bg-surface p-1">
            {#each appState.groups as g}
              {@const customIdx = customGroups.findIndex(cg => cg.id === g.id)}
              {@const isCustom = customIdx >= 0}
              <div class="flex items-center justify-between p-2">
                {#if editingGroupId === g.id}
                  <div class="flex items-center gap-1.5 flex-1 mr-2">
                    <input
                      type="text"
                      bind:value={editingGroupName}
                      class="flex-1 px-2 py-1 rounded bg-subtle border border-border-focus outline-none text-text-primary font-medium"
                    />
                    <button
                      type="button"
                      onclick={handleSaveEditGroup}
                      class="px-2 py-1 rounded bg-accent text-accent-fg text-[11px]"
                    >
                      确定
                    </button>
                    <button
                      type="button"
                      onclick={() => (editingGroupId = null)}
                      class="px-2 py-1 rounded border border-border-subtle text-[11px]"
                    >
                      取消
                    </button>
                  </div>
                {:else}
                  <span class="font-medium text-text-primary flex items-center gap-1.5">
                    {#if g.id === PINNED_GROUP_ID}
                      <span class="text-amber-500">★</span>
                    {/if}
                    {getGroupName(g)}
                    {#if g.id === PINNED_GROUP_ID || g.id === UNGROUPED_GROUP_ID}
                      <span class="text-[10px] text-text-tertiary font-mono">({t('common.systemBuiltin')})</span>
                    {/if}
                  </span>
                {/if}

                {#if isCustom}
                  <div class="flex items-center gap-1">
                    <!-- 上移按钮 -->
                    <button
                      type="button"
                      disabled={customIdx === 0}
                      onclick={() => handleMoveGroup(g.id, -1)}
                      class="p-1 rounded hover:bg-subtle text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                      title="上移分组"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <!-- 下移按钮 -->
                    <button
                      type="button"
                      disabled={customIdx === customGroups.length - 1}
                      onclick={() => handleMoveGroup(g.id, 1)}
                      class="p-1 rounded hover:bg-subtle text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                      title="下移分组"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <!-- 重命名按钮 -->
                    <button
                      type="button"
                      onclick={() => handleStartEditGroup(g)}
                      class="p-1 rounded hover:bg-subtle text-text-tertiary hover:text-text-primary transition-colors"
                      title="重命名"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <!-- 删除按钮 -->
                    <button
                      type="button"
                      onclick={() => handleDeleteGroup(g.id)}
                      class="p-1 rounded hover:bg-subtle text-text-tertiary hover:text-status-danger transition-colors"
                      title="删除分组"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                {/if}
              </div>
            {/each}
          </div>

        {:else if activeTab === 'ai'}
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

        {:else if activeTab === 'danger'}
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
    </div>
  </div>
{/if}

<!-- AI 分析结果 Diff 确认与应用模态框 -->
<AiResultModal
  bind:open={showAiResultModal}
  type={aiResultType}
  bind:items={aiResultItems}
  onApply={handleApplyAiResult}
/>
