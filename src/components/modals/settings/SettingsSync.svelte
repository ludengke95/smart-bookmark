<script>
  import { onMount } from 'svelte';
  import { appState } from '../../../state/app.svelte.js';
  import { toast } from '../../../state/toast.svelte.js';
  import { t } from '../../../i18n/index.svelte.js';
  import { formatServiceError } from '../../../i18n/utils.js';
  import ToggleRow from '../../common/ToggleRow.svelte';
  import ConfirmModal from '../../common/ConfirmModal.svelte';

  // 本地表单状态
  let provider = $state(appState.cloudSyncSettings?.provider || 'none');
  let autoUploadOnBackup = $state(appState.cloudSyncSettings?.autoUploadOnBackup ?? true);
  let useE2EE = $state(appState.cloudSyncSettings?.useE2EE ?? false);

  let webdavUrl = $state(appState.cloudSyncSettings?.webdav?.url || '');
  let webdavUsername = $state(appState.cloudSyncSettings?.webdav?.username || '');
  let webdavPassword = $state('');

  let gistToken = $state('');
  let gistId = $state(appState.cloudSyncSettings?.gist?.gistId || '');

  let inputMasterPassword = $state('');
  let hasCreds = $state({ hasWebdavPassword: false, hasGistToken: false });

  let isTesting = $state(false);
  let isSavingCreds = $state(false);
  let isPushing = $state(false);
  let isPulling = $state(false);

  let testResult = $state(null);
  let pullConfirmOpen = $state(false);
  let conflictConfirmOpen = $state(false);
  let gistPlaintextConfirmOpen = $state(false);

  onMount(async () => {
    await refreshCredentialsState();
  });

  async function refreshCredentialsState() {
    const creds = await appState.getCloudCredentials();
    hasCreds = {
      hasWebdavPassword: Boolean(creds?.webdavPassword),
      hasGistToken: Boolean(creds?.gistToken)
    };
  }

  function formatTime(timestamp) {
    if (!timestamp) return t('sync.neverSynced');
    try {
      const d = new Date(timestamp);
      return d.toLocaleString();
    } catch {
      return String(timestamp);
    }
  }

  async function updateProvider(newProvider) {
    provider = newProvider;
    const patch = { provider: newProvider };
    if (newProvider === 'gist' && !useE2EE) {
      useE2EE = true;
      patch.useE2EE = true;
      toast.show(t('sync.gistE2eeAutoEnabled'));
    }
    await appState.saveCloudSyncSettings(patch);
    testResult = null;
  }

  async function handleFieldBlur() {
    await appState.saveCloudSyncSettings({
      webdav: { url: webdavUrl.trim(), username: webdavUsername.trim() },
      gist: { gistId: gistId.trim() }
    });
  }

  async function handleToggleAutoUpload(val) {
    autoUploadOnBackup = val;
    await appState.saveCloudSyncSettings({ autoUploadOnBackup: val });
  }

  async function handleToggleE2EE(val) {
    if (val && !appState.isE2eeUnlocked && !inputMasterPassword.trim()) {
      toast.show(t('sync.passphraseRequired'));
    }
    useE2EE = val;
    await appState.saveCloudSyncSettings({ useE2EE: val });
  }

  async function handleSaveCredentials() {
    isSavingCreds = true;
    try {
      const payload = {};
      if (provider === 'webdav' && webdavPassword.trim()) {
        payload.webdavPassword = webdavPassword.trim();
      }
      if (provider === 'gist' && gistToken.trim()) {
        payload.gistToken = gistToken.trim();
      }
      await appState.saveCloudCredentials(payload);
      await refreshCredentialsState();
      webdavPassword = '';
      gistToken = '';
      toast.show(t('sync.credentialsSaved'));
    } catch (err) {
      toast.show(formatServiceError(err, err.message));
    } finally {
      isSavingCreds = false;
    }
  }

  function handleUnlockMasterPassword() {
    const pass = inputMasterPassword.trim();
    if (!pass) {
      toast.show(t('sync.passphraseRequired'));
      return;
    }
    appState.setCloudMasterPassword(pass);
    inputMasterPassword = '';
    toast.show(t('sync.unlockedToast'));
  }

  function handleLockMasterPassword() {
    appState.clearCloudMasterPassword();
    toast.show(t('sync.lockedToast'));
  }

  async function handleTestConnection() {
    isTesting = true;
    testResult = null;
    try {
      await handleFieldBlur();
      if (webdavPassword.trim() || gistToken.trim()) {
        await handleSaveCredentials();
      }
      const res = await appState.testCloudConnection();
      const statusText = res.fileExists ? t('sync.testFileExists') : t('sync.testFileNone');
      testResult = { ok: true, message: t('sync.testSuccess', { status: statusText }) };
      toast.show(testResult.message);
    } catch (err) {
      const msg = formatServiceError(err, err.message);
      testResult = { ok: false, message: t('sync.testFailed', { error: msg }) };
      toast.show(testResult.message);
    } finally {
      isTesting = false;
    }
  }

  async function handlePush(force = false) {
    if (provider === 'gist' && !useE2EE && !force) {
      gistPlaintextConfirmOpen = true;
      return;
    }
    isPushing = true;
    try {
      await handleFieldBlur();
      if (inputMasterPassword.trim()) {
        appState.setCloudMasterPassword(inputMasterPassword.trim());
        inputMasterPassword = '';
      }
      await appState.pushToCloud({ force });
      conflictConfirmOpen = false;
      gistPlaintextConfirmOpen = false;
      toast.show(t('sync.pushSuccess'));
    } catch (err) {
      if (err.code === 'cloudConflict') {
        conflictConfirmOpen = true;
      } else {
        toast.show(formatServiceError(err, err.message));
      }
    } finally {
      isPushing = false;
    }
  }

  function triggerPull() {
    pullConfirmOpen = true;
  }

  async function performPull() {
    isPulling = true;
    try {
      const pass = inputMasterPassword.trim() || null;
      await appState.pullFromCloud({ passphrase: pass });
      inputMasterPassword = '';
      pullConfirmOpen = false;
      toast.show(t('sync.pullSuccess'));
    } catch (err) {
      toast.show(formatServiceError(err, err.message));
    } finally {
      isPulling = false;
    }
  }
</script>

<div class="space-y-4">
  <!-- 概览卡片 -->
  <div class="p-3.5 rounded-xl border border-border-subtle bg-surface/50 space-y-1.5">
    <div class="flex items-center gap-2">
      <svg class="w-4 h-4 text-accent flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
      <h3 class="font-medium text-text-primary text-xs">{t('sync.title')}</h3>
    </div>
    <p class="text-[11px] text-text-secondary leading-relaxed">
      {t('sync.desc')}
    </p>
  </div>

  <!-- 协议选择器 (Segmented Control) -->
  <div class="space-y-2">
    <span class="block text-xs font-medium text-text-secondary">{t('sync.providerLabel')}</span>
    <div class="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-subtle">
      <button
        type="button"
        onclick={() => updateProvider('none')}
        class="py-1.5 px-3 rounded-md text-xs font-medium transition-all text-center {provider === 'none'
          ? 'bg-surface text-text-primary shadow-xs font-semibold'
          : 'text-text-secondary hover:text-text-primary hover:bg-surface/40'}"
      >
        {t('sync.providerNone')}
      </button>
      <button
        type="button"
        onclick={() => updateProvider('webdav')}
        class="py-1.5 px-3 rounded-md text-xs font-medium transition-all text-center {provider === 'webdav'
          ? 'bg-surface text-accent shadow-xs font-semibold'
          : 'text-text-secondary hover:text-text-primary hover:bg-surface/40'}"
      >
        {t('sync.providerWebDav')}
      </button>
      <button
        type="button"
        onclick={() => updateProvider('gist')}
        class="py-1.5 px-3 rounded-md text-xs font-medium transition-all text-center {provider === 'gist'
          ? 'bg-surface text-accent shadow-xs font-semibold'
          : 'text-text-secondary hover:text-text-primary hover:bg-surface/40'}"
      >
        {t('sync.providerGist')}
      </button>
    </div>
  </div>

  {#if provider !== 'none'}
    <!-- WebDAV 配置面板 -->
    {#if provider === 'webdav'}
      <div class="p-3.5 rounded-xl border border-border-subtle bg-surface space-y-3">
        <div class="space-y-1">
          <label for="webdav-url-input" class="block text-xs font-medium text-text-primary">{t('sync.webdavUrl')}</label>
          <input
            id="webdav-url-input"
            type="text"
            bind:value={webdavUrl}
            onblur={handleFieldBlur}
            placeholder={t('sync.webdavUrlPlaceholder')}
            class="w-full px-3 py-1.5 rounded-lg bg-subtle border border-border-subtle outline-none text-xs text-text-primary focus:border-accent"
          />
          <p class="text-[10px] text-text-tertiary">{t('sync.webdavUrlHint')}</p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="space-y-1">
            <label for="webdav-username-input" class="block text-xs font-medium text-text-primary">{t('sync.webdavUsername')}</label>
            <input
              id="webdav-username-input"
              type="text"
              bind:value={webdavUsername}
              onblur={handleFieldBlur}
              placeholder="username"
              class="w-full px-3 py-1.5 rounded-lg bg-subtle border border-border-subtle outline-none text-xs text-text-primary focus:border-accent"
            />
          </div>

          <div class="space-y-1">
            <div class="flex items-center justify-between">
              <label for="webdav-password-input" class="block text-xs font-medium text-text-primary">{t('sync.webdavPassword')}</label>
              {#if hasCreds.hasWebdavPassword}
                <span class="text-[10px] text-emerald-500 font-medium">✓ {t('sync.hasSavedPassword')}</span>
              {/if}
            </div>
            <input
              id="webdav-password-input"
              type="password"
              bind:value={webdavPassword}
              placeholder={hasCreds.hasWebdavPassword ? '••••••••••••' : t('sync.webdavPasswordPlaceholder')}
              class="w-full px-3 py-1.5 rounded-lg bg-subtle border border-border-subtle outline-none text-xs text-text-primary focus:border-accent"
            />
          </div>
        </div>

        {#if webdavPassword.trim()}
          <div class="flex justify-end">
            <button
              type="button"
              onclick={handleSaveCredentials}
              disabled={isSavingCreds}
              class="px-3 py-1.5 rounded-lg bg-accent text-accent-fg text-xs font-medium hover:opacity-90 transition-opacity"
            >
              {isSavingCreds ? '...' : t('sync.saveCredentials')}
            </button>
          </div>
        {/if}
      </div>
    {/if}

    <!-- GitHub Gist 配置面板 -->
    {#if provider === 'gist'}
      <div class="p-3.5 rounded-xl border border-border-subtle bg-surface space-y-3">
        <div class="space-y-1">
          <div class="flex items-center justify-between">
            <label for="gist-token-input" class="block text-xs font-medium text-text-primary">{t('sync.gistToken')}</label>
            {#if hasCreds.hasGistToken}
              <span class="text-[10px] text-emerald-500 font-medium">✓ {t('sync.hasSavedToken')}</span>
            {/if}
          </div>
          <input
            id="gist-token-input"
            type="password"
            bind:value={gistToken}
            placeholder={hasCreds.hasGistToken ? '••••••••••••' : t('sync.gistTokenPlaceholder')}
            class="w-full px-3 py-1.5 rounded-lg bg-subtle border border-border-subtle outline-none text-xs text-text-primary font-mono focus:border-accent"
          />
          <div class="flex items-center justify-between text-[10px] text-text-tertiary">
            <span>{t('sync.gistTokenHint')}</span>
            <a
              href="https://github.com/settings/tokens/new?scopes=gist&description=Smart%20Bookmark%20Sync"
              target="_blank"
              rel="noopener noreferrer"
              class="text-accent hover:underline inline-flex items-center gap-0.5"
            >
              <span>GitHub Tokens</span>
              <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>

        <div class="space-y-1">
          <label for="gist-id-input" class="block text-xs font-medium text-text-primary">{t('sync.gistId')}</label>
          <input
            id="gist-id-input"
            type="text"
            bind:value={gistId}
            onblur={handleFieldBlur}
            placeholder={t('sync.gistIdPlaceholder')}
            class="w-full px-3 py-1.5 rounded-lg bg-subtle border border-border-subtle outline-none text-xs text-text-primary font-mono focus:border-accent"
          />
        </div>

        <!-- Gist 安全性提示 -->
        <div class="p-2.5 rounded-lg {useE2EE ? 'bg-subtle/80 border border-border-subtle/80 text-text-secondary' : 'bg-amber-500/10 border border-amber-500/30 text-amber-500'} text-[11px] leading-relaxed flex items-start gap-2">
          <svg class="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            {#if !useE2EE}
              <span class="font-medium">{t('sync.gistE2eeWarning')}</span>
            {:else}
              <span>{t('sync.gistSecurityNotice')}</span>
            {/if}
          </div>
        </div>

        {#if gistToken.trim()}
          <div class="flex justify-end">
            <button
              type="button"
              onclick={handleSaveCredentials}
              disabled={isSavingCreds}
              class="px-3 py-1.5 rounded-lg bg-accent text-accent-fg text-xs font-medium hover:opacity-90 transition-opacity"
            >
              {isSavingCreds ? '...' : t('sync.saveCredentials')}
            </button>
          </div>
        {/if}
      </div>
    {/if}

    <!-- 连通性测试与快速检测按钮 -->
    <div class="flex items-center justify-between gap-2 p-3 rounded-xl border border-border-subtle bg-surface">
      <div class="min-w-0 flex-1">
        {#if testResult}
          <div class="text-xs font-medium {testResult.ok ? 'text-emerald-500' : 'text-status-danger'} truncate">
            {testResult.message}
          </div>
        {:else}
          <div class="text-xs text-text-tertiary">
            {t('sync.lastSync', { time: formatTime(appState.cloudSyncSettings.lastSyncTime) })}
          </div>
        {/if}
      </div>
      <button
        type="button"
        onclick={handleTestConnection}
        disabled={isTesting}
        class="px-3 py-1.5 rounded-lg border border-border-subtle hover:bg-subtle text-text-primary text-xs font-medium transition-colors flex-shrink-0"
      >
        {isTesting ? t('sync.testing') : t('sync.testConnection')}
      </button>
    </div>

    <!-- 同步与加密高级策略 -->
    <div class="p-3.5 rounded-xl border border-border-subtle bg-surface space-y-3.5">
      <ToggleRow
        id="sync-autoupload"
        label={t('sync.autoUploadLabel')}
        description={t('sync.autoUploadDesc')}
        bind:checked={autoUploadOnBackup}
        onchange={handleToggleAutoUpload}
      />

      <div class="pt-2 border-t border-border-subtle/50">
        <ToggleRow
          id="sync-e2ee"
          label={t('sync.e2eeLabel')}
          description={t('sync.e2eeDesc')}
          bind:checked={useE2EE}
          onchange={handleToggleE2EE}
        />

        {#if useE2EE}
          <div class="mt-3 p-3 rounded-lg bg-subtle border border-border-subtle space-y-2.5">
            <div class="flex items-center justify-between text-xs">
              <label for="sync-master-password-input" class="font-medium text-text-primary">{t('sync.masterPasswordLabel')}</label>
              {#if appState.isE2eeUnlocked}
                <span class="text-[10px] text-emerald-500 font-medium">{t('sync.unlockedStatus')}</span>
              {:else}
                <span class="text-[10px] text-amber-500 font-medium">{t('sync.lockedStatus')}</span>
              {/if}
            </div>

            {#if appState.isE2eeUnlocked}
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs text-text-secondary">••••••••••••••••</span>
                <button
                  type="button"
                  onclick={handleLockMasterPassword}
                  class="px-2.5 py-1 rounded-md bg-surface hover:bg-status-danger/10 text-status-danger border border-status-danger/30 text-xs font-medium transition-colors"
                >
                  {t('sync.lockBtn')}
                </button>
              </div>
            {:else}
              <div class="flex items-center gap-2">
                <input
                  id="sync-master-password-input"
                  type="password"
                  bind:value={inputMasterPassword}
                  placeholder={t('sync.masterPasswordPlaceholder')}
                  class="flex-1 px-3 py-1.5 rounded-lg bg-surface border border-border-subtle outline-none text-xs text-text-primary focus:border-accent"
                />
                <button
                  type="button"
                  onclick={handleUnlockMasterPassword}
                  class="px-3 py-1.5 rounded-lg bg-accent text-accent-fg text-xs font-medium hover:opacity-90 transition-opacity flex-shrink-0"
                >
                  {t('sync.unlockBtn')}
                </button>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <!-- 状态指示条 -->
    {#if appState.cloudSyncStatus === 'conflict'}
      <div class="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-500 text-xs flex items-center justify-between gap-2">
        <span>{t('sync.statusConflict')}</span>
        <button
          type="button"
          onclick={() => (conflictConfirmOpen = true)}
          class="px-2.5 py-1 rounded-md bg-amber-500 text-white font-medium hover:opacity-90 text-[11px]"
        >
          {t('sync.pushButton')}
        </button>
      </div>
    {:else if appState.cloudSyncStatus === 'locked_pending'}
      <div class="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-500 text-xs leading-relaxed">
        {t('sync.statusLockedPending')}
      </div>
    {:else if appState.cloudSyncStatus === 'error'}
      <div class="p-3 rounded-xl border border-status-danger/30 bg-status-danger/10 text-status-danger text-xs leading-relaxed">
        {t('sync.statusError', { error: appState.cloudSyncError })}
      </div>
    {/if}

    <!-- 手动推拉操作区 -->
    <div class="p-3.5 rounded-xl border border-border-subtle bg-surface space-y-2.5">
      <h4 class="font-medium text-text-primary text-xs">{t('sync.manualActions')}</h4>
      <div class="grid grid-cols-2 gap-3">
        <button
          type="button"
          onclick={() => handlePush(false)}
          disabled={isPushing}
          class="px-3 py-2 rounded-lg bg-accent text-accent-fg text-xs font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          <span>{isPushing ? t('sync.pushing') : t('sync.pushButton')}</span>
        </button>

        <button
          type="button"
          onclick={triggerPull}
          disabled={isPulling}
          class="px-3 py-2 rounded-lg border border-border-subtle bg-subtle hover:bg-surface text-text-primary text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <span>{isPulling ? t('sync.pulling') : t('sync.pullButton')}</span>
        </button>
      </div>
    </div>
  {/if}
</div>

<!-- 冲突强制覆盖确认弹窗 -->
<ConfirmModal
  bind:open={conflictConfirmOpen}
  title={t('sync.conflictConfirmTitle')}
  message={t('sync.conflictConfirmMsg')}
  confirmLabel={t('sync.pushButton')}
  danger
  onconfirm={() => handlePush(true)}
/>

<!-- 云端拉取覆盖前确认弹窗 -->
<ConfirmModal
  bind:open={pullConfirmOpen}
  title={t('sync.pullConfirmTitle')}
  message={t('sync.pullConfirmMsg')}
  confirmLabel={t('sync.pullButton')}
  danger
  onconfirm={performPull}
/>

<!-- Gist 明文上传二次确认弹窗 -->
<ConfirmModal
  bind:open={gistPlaintextConfirmOpen}
  title={t('sync.gistPlaintextConfirmTitle')}
  message={t('sync.gistPlaintextConfirmMsg')}
  confirmLabel={t('sync.pushButton')}
  danger
  onconfirm={() => handlePush(true)}
/>
