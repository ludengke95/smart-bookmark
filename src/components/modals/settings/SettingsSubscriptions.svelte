<script>
  import { appState } from '../../../state/app.svelte.js';
  import { toast } from '../../../state/toast.svelte.js';
  import { t } from '../../../i18n/index.svelte.js';
  import ConfirmModal from '../../common/ConfirmModal.svelte';
  import Select from '../../common/Select.svelte';
  import ExportTeamFeedModal from '../ExportTeamFeedModal.svelte';
  import { getSampleSubscriptionTemplate } from '../../../services/subscription/index.js';

  // 表单状态
  let url = $state('');
  let name = $state('');
  let updateInterval = $state(60); // 默认 60 分钟
  let editingSubId = $state(null);
  let isSubmitting = $state(false);
  let syncingSubIds = $state(new Set());

  // 确认删除弹窗状态
  let confirmDeleteOpen = $state(false);
  let pendingDeleteSub = $state(null);

  // 导出弹窗状态
  let exportModalOpen = $state(false);

  function handleDownloadTemplate() {
    const template = getSampleSubscriptionTemplate();
    const jsonStr = JSON.stringify(template, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'smart-bookmark-sample-team-feed.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.show(t('subscriptions.templateDownloaded'));
  }

  const intervalOptions = $derived([
    { value: 0, label: t('subscriptions.intervals.manual') },
    { value: 30, label: t('subscriptions.intervals.m30') },
    { value: 60, label: t('subscriptions.intervals.h1') },
    { value: 360, label: t('subscriptions.intervals.h6') },
    { value: 1440, label: t('subscriptions.intervals.d1') }
  ]);

  function resetForm() {
    url = '';
    name = '';
    updateInterval = 60;
    editingSubId = null;
  }

  function handleStartEdit(sub) {
    editingSubId = sub.id;
    url = sub.url;
    name = sub.name || '';
    updateInterval = typeof sub.updateInterval === 'number' ? sub.updateInterval : 60;
  }

  async function handleSubmit() {
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      toast.show(t('subscriptions.urlPlaceholder'));
      return;
    }

    isSubmitting = true;
    try {
      const subPayload = {
        id: editingSubId || undefined,
        url: cleanUrl,
        name: name.trim(),
        updateInterval: Number(updateInterval)
      };

      const saved = await appState.saveSubscription(subPayload);
      const isNew = !editingSubId;
      resetForm();

      toast.show(isNew ? t('subscriptions.addSuccess') : t('subscriptions.updateSuccess'));

      // 新增订阅后立即触发一次初次同步
      if (isNew && saved?.id) {
        handleSync(saved.id);
      }
    } catch (err) {
      toast.show(err.message || t('common.failed'));
    } finally {
      isSubmitting = false;
    }
  }

  async function handleSync(subId) {
    if (syncingSubIds.has(subId)) return;
    const nextSyncing = new Set(syncingSubIds);
    nextSyncing.add(subId);
    syncingSubIds = nextSyncing;

    try {
      const res = await appState.syncSubscription(subId);
      if (res?.notModified) {
        toast.show(t('subscriptions.syncNotModified'));
      } else if (res?.stats) {
        toast.show(t('subscriptions.syncSuccess', res.stats));
      } else {
        toast.show(t('common.success'));
      }
    } catch (err) {
      toast.show(t('subscriptions.syncFailed', { error: err.message }));
    } finally {
      const finishSyncing = new Set(syncingSubIds);
      finishSyncing.delete(subId);
      syncingSubIds = finishSyncing;
    }
  }

  function promptDelete(sub) {
    pendingDeleteSub = sub;
    confirmDeleteOpen = true;
  }

  async function executeDelete() {
    if (!pendingDeleteSub) return;
    try {
      await appState.deleteSubscription(pendingDeleteSub.id);
      toast.show(t('subscriptions.deleteSuccess'));
      if (editingSubId === pendingDeleteSub.id) {
        resetForm();
      }
    } catch (err) {
      toast.show(err.message || t('common.failed'));
    } finally {
      pendingDeleteSub = null;
    }
  }

  function formatSyncTime(ts) {
    if (!ts) return t('subscriptions.neverSynced');
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
</script>

<div class="space-y-3.5">
  <!-- 订阅说明横幅 -->
  <div class="p-3 rounded-xl border border-border-subtle bg-surface flex items-start gap-2.5">
    <div class="p-1.5 rounded-lg bg-accent/10 text-accent flex-shrink-0 mt-0.5">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    </div>
    <div class="flex-1 text-xs">
      <div class="font-semibold text-text-primary">{t('subscriptions.title')}</div>
      <div class="text-text-tertiary mt-0.5 leading-relaxed">{t('subscriptions.desc')}</div>
    </div>
  </div>

  <!-- 添加 / 编辑订阅源表单卡片 -->
  <div class="p-3.5 rounded-xl border border-border-subtle bg-surface space-y-2.5">
    <div class="flex items-center justify-between text-xs font-semibold text-text-primary">
      <span>{editingSubId ? t('subscriptions.editBtn') : t('subscriptions.addBtn')}</span>
      {#if editingSubId}
        <button
          type="button"
          onclick={resetForm}
          class="text-[11px] text-text-tertiary hover:text-text-primary transition-colors"
        >
          {t('common.cancel')}
        </button>
      {/if}
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
      <!-- 订阅 URL -->
      <div class="space-y-1 md:col-span-2">
        <label for="sub-url-input" class="text-[11px] font-medium text-text-secondary">{t('subscriptions.urlLabel')}</label>
        <input
          id="sub-url-input"
          type="url"
          bind:value={url}
          placeholder={t('subscriptions.urlPlaceholder')}
          class="w-full px-3 py-1.5 rounded-lg bg-subtle border border-border-subtle outline-none text-text-primary font-mono text-xs focus:border-border-focus transition-colors"
        />
      </div>

      <!-- 订阅名称 (选填) -->
      <div class="space-y-1">
        <label for="sub-name-input" class="text-[11px] font-medium text-text-secondary">{t('subscriptions.nameLabel')}</label>
        <input
          id="sub-name-input"
          type="text"
          bind:value={name}
          placeholder={t('subscriptions.namePlaceholder')}
          class="w-full px-3 py-1.5 rounded-lg bg-subtle border border-border-subtle outline-none text-text-primary text-xs focus:border-border-focus transition-colors"
        />
      </div>

      <!-- 自动更新频率 -->
      <div class="space-y-1">
        <span class="block text-[11px] font-medium text-text-secondary">{t('subscriptions.intervalLabel')}</span>
        <Select
          options={intervalOptions}
          bind:value={updateInterval}
          size="sm"
        />
      </div>
    </div>

    <div class="flex justify-end pt-1">
      <button
        type="button"
        onclick={handleSubmit}
        disabled={isSubmitting || !url.trim()}
        class="px-3.5 py-1.5 rounded-lg bg-accent text-accent-fg font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity text-xs flex items-center gap-1.5"
      >
        {#if isSubmitting}
          <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        {/if}
        {editingSubId ? t('common.save') : t('subscriptions.addBtn')}
      </button>
    </div>
  </div>

  <!-- 订阅源列表 -->
  <div class="space-y-2">
    <div class="text-[11px] font-semibold text-text-tertiary px-1 uppercase tracking-wider">
      {t('subscriptions.title')} ({appState.subscriptions.length})
    </div>

    {#if appState.subscriptions.length === 0}
      <!-- 空状态 -->
      <div class="p-6 rounded-xl border border-dashed border-border-subtle bg-surface/50 text-center space-y-1.5">
        <div class="text-text-tertiary">
          <svg class="w-8 h-8 mx-auto opacity-40 mb-1" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </div>
        <div class="text-xs font-medium text-text-secondary">{t('subscriptions.emptyTitle')}</div>
        <div class="text-[11px] text-text-tertiary max-w-sm mx-auto">{t('subscriptions.emptyDesc')}</div>
      </div>
    {:else}
      <div class="space-y-2">
        {#each appState.subscriptions as sub (sub.id)}
          {@const isSyncing = syncingSubIds.has(sub.id) || sub.status === 'syncing'}
          <div class="p-3 rounded-xl border border-border-subtle bg-surface hover:border-border-focus/40 transition-colors flex items-center justify-between gap-3">
            <!-- 左侧信息 -->
            <div class="space-y-1 min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <!-- 同步状态小圆点 -->
                {#if sub.status === 'error'}
                  <span class="w-2 h-2 rounded-full bg-status-danger flex-shrink-0" title={sub.error || t('subscriptions.statusError')}></span>
                {:else if sub.status === 'success'}
                  <span class="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" title={t('subscriptions.statusSuccess')}></span>
                {:else}
                  <span class="w-2 h-2 rounded-full bg-text-tertiary/40 flex-shrink-0" title={t('subscriptions.statusIdle')}></span>
                {/if}

                <span class="font-semibold text-text-primary text-xs truncate">
                  {sub.name || t('subscriptions.urlLabel')}
                </span>

                <!-- 统计胶囊 -->
                <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-subtle text-text-secondary border border-border-subtle font-mono">
                  {t('subscriptions.countsSummary', { bmCount: sub.bookmarkCount || 0, grpCount: sub.groupCount || 0 })}
                </span>
              </div>

              <!-- URL 文本 -->
              <div class="text-[11px] font-mono text-text-tertiary truncate" title={sub.url}>
                {sub.url}
              </div>

              <!-- 上次同步时间与错误提示 -->
              <div class="flex items-center gap-3 text-[10px] text-text-tertiary">
                <span>{t('subscriptions.lastSyncTime', { time: formatSyncTime(sub.lastSyncedAt) })}</span>
                {#if sub.error}
                  <span class="text-status-danger truncate max-w-[200px]" title={sub.error}>
                    {sub.error}
                  </span>
                {/if}
              </div>
            </div>

            <!-- 右侧操作胶囊组 -->
            <div class="flex items-center gap-1.5 flex-shrink-0">
              <!-- 立即同步按钮 -->
              <button
                type="button"
                disabled={isSyncing}
                onclick={() => handleSync(sub.id)}
                class="px-2.5 py-1 rounded-lg border border-border-subtle hover:bg-subtle text-text-secondary hover:text-text-primary disabled:opacity-40 transition-colors flex items-center gap-1 text-[11px]"
                title={t('subscriptions.syncNow')}
              >
                <svg class="w-3 h-3 {isSyncing ? 'animate-spin text-accent' : ''}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>{isSyncing ? t('subscriptions.syncing') : t('subscriptions.syncNow')}</span>
              </button>

              <!-- 编辑按钮 -->
              <button
                type="button"
                onclick={() => handleStartEdit(sub)}
                class="p-1.5 rounded-lg border border-border-subtle hover:bg-subtle text-text-secondary hover:text-text-primary transition-colors"
                title={t('common.edit')}
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>

              <!-- 取消订阅按钮 -->
              <button
                type="button"
                onclick={() => promptDelete(sub)}
                class="p-1.5 rounded-lg border border-border-subtle hover:bg-status-danger/10 text-text-secondary hover:text-status-danger transition-colors"
                title={t('common.delete')}
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- 发布与导出团队源卡片 -->
  <div class="p-3.5 rounded-xl border border-border-subtle bg-surface space-y-2.5">
    <div class="flex items-center justify-between gap-3">
      <div class="space-y-0.5 min-w-0 flex-1">
        <div class="text-xs font-semibold text-text-primary">{t('subscriptions.exportSectionTitle')}</div>
        <div class="text-[11px] text-text-tertiary leading-relaxed">{t('subscriptions.exportSectionDesc')}</div>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onclick={handleDownloadTemplate}
          class="px-2.5 py-1.5 rounded-lg border border-border-subtle hover:bg-subtle text-text-secondary hover:text-text-primary transition-colors text-xs font-medium flex items-center gap-1.5"
          title={t('subscriptions.downloadTemplateBtn')}
        >
          <svg class="w-3.5 h-3.5 text-text-tertiary" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span>{t('subscriptions.downloadTemplateBtn')}</span>
        </button>

        <button
          type="button"
          onclick={() => (exportModalOpen = true)}
          class="px-3 py-1.5 rounded-lg bg-accent text-accent-fg hover:opacity-90 transition-opacity text-xs font-medium flex items-center gap-1.5 shadow-sm"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          <span>{t('subscriptions.exportBtn')}</span>
        </button>
      </div>
    </div>
  </div>
</div>

<!-- 导出团队订阅源弹窗 -->
<ExportTeamFeedModal bind:open={exportModalOpen} />

<!-- 取消订阅确认弹窗 -->
<ConfirmModal
  bind:open={confirmDeleteOpen}
  title={t('common.warning')}
  message={pendingDeleteSub ? t('subscriptions.deleteConfirm', { name: pendingDeleteSub.name || pendingDeleteSub.url }) : ''}
  danger={true}
  confirmLabel={t('common.delete')}
  onconfirm={executeDelete}
/>
