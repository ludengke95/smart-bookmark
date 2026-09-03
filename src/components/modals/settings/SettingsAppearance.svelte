<script>
  import { appState } from '../../../state/app.svelte.js';
  import { toast } from '../../../state/toast.svelte.js';
  import { t } from '../../../i18n/index.svelte.js';
  import { THEMES } from '../../../constants/index.js';
  import Select from '../../common/Select.svelte';

  const languageOptions = $derived([
    { value: 'auto', label: t('settings.languageAuto'), iconText: '🌐' },
    { value: 'zh-CN', label: t('settings.languageZh'), iconText: '🇨🇳' },
    { value: 'en-US', label: t('settings.languageEn'), iconText: '🇺🇸' }
  ]);

  const clockFormatOptions = $derived([
    { value: '24', label: t('settings.clock24') },
    { value: '12', label: t('settings.clock12') }
  ]);

  function getThemeName(theme) {
    return t('themes.' + theme.id, {}, theme.name);
  }

  function handleThemeChange(themeId) {
    const theme = THEMES.find(item => item.id === themeId);
    appState.updateSettings({ theme: themeId });
    toast.show(t('settings.themeSwitched', { name: getThemeName(theme) }));
  }
</script>

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
  <span class="block font-medium text-text-secondary">{t('settings.themeDesc')}</span>
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
          <span class="font-medium text-text-primary text-[11px]">{getThemeName(theme)}</span>
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
