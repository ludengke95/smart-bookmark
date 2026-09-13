<script>
  import { appState } from '../../../state/app.svelte.js';
  import { toast } from '../../../state/toast.svelte.js';
  import { t } from '../../../i18n/index.svelte.js';
  import { formatServiceError } from '../../../i18n/utils.js';
  import {
    AI_API_PRESETS,
    DEFAULT_AI_SETTINGS,
    DEFAULT_AI_BASE_URL,
    DEFAULT_AI_MODEL
  } from '../../../constants/index.js';

  let isTestingApi = $state(false);

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
      toast.show(t('ai.testFailed', { error: formatServiceError(e) }));
    } finally {
      isTestingApi = false;
    }
  }

  function updateAiSettings(partial) {
    const current = appState.settings.ai || DEFAULT_AI_SETTINGS;
    const updated = {
      ...current,
      ...partial
    };
    appState.updateSettings({ ai: updated });
  }
</script>

<div class="space-y-4">
  <!-- AI 驱动引擎与常用预设 -->
  <div class="p-3.5 rounded-xl border border-border-subtle bg-surface space-y-3">
    <div class="flex items-center justify-between">
      <span class="font-semibold text-text-primary flex items-center gap-1.5 text-sm">
        <span>{t('ai.apiConfigTitle')}</span>
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

    <!-- API 配置表单：端点、模型与 API Key -->
    <div class="space-y-3 pt-2 border-t border-border-subtle/60">
      <div class="grid grid-cols-2 gap-2.5">
        <div class="space-y-1">
          <label for="ai-base-url" class="block font-medium text-text-secondary text-[11px]">{t('ai.baseUrlLabel')}</label>
          <input
            id="ai-base-url"
            type="text"
            value={appState.settings.ai?.baseUrl || DEFAULT_AI_BASE_URL}
            onchange={(e) => updateAiSettings({ baseUrl: e.target.value.trim() })}
            placeholder={DEFAULT_AI_BASE_URL}
            class="w-full px-2.5 py-1.5 rounded-lg bg-subtle border border-border-subtle outline-none text-text-primary text-[11px] font-mono"
          />
        </div>
        <div class="space-y-1">
          <label for="ai-model" class="block font-medium text-text-secondary text-[11px]">{t('ai.modelLabel')}</label>
          <input
            id="ai-model"
            type="text"
            value={appState.settings.ai?.model || DEFAULT_AI_MODEL}
            onchange={(e) => updateAiSettings({ model: e.target.value.trim() })}
            placeholder="deepseek-chat / gpt-4o-mini / qwen2.5:7b"
            class="w-full px-2.5 py-1.5 rounded-lg bg-subtle border border-border-subtle outline-none text-text-primary text-[11px] font-mono"
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
            class="flex-1 px-2.5 py-1.5 rounded-lg bg-subtle border border-border-subtle outline-none text-text-primary text-[11px] font-mono"
          />
          <button
            type="button"
            disabled={isTestingApi}
            onclick={handleTestApi}
            class="px-3 py-1.5 rounded-lg border border-border-subtle hover:bg-subtle text-text-secondary hover:text-text-primary transition-colors text-[11px] font-medium disabled:opacity-40 flex-shrink-0"
          >
            {isTestingApi ? t('ai.testing') : t('ai.testConnect')}
          </button>
        </div>
      </div>
    </div>
  </div>
</div>
