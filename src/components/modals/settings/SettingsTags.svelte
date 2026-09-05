<script>
  import { appState } from '../../../state/app.svelte.js';
  import { toast } from '../../../state/toast.svelte.js';
  import { t } from '../../../i18n/index.svelte.js';
  import ConfirmModal from '../../common/ConfirmModal.svelte';

  let searchQuery = $state('');
  let editingTag = $state(null);
  let editingNewName = $state('');

  let tagToDelete = $state(null);
  let showDeleteConfirm = $state(false);

  // 过滤后的标签列表
  let filteredTags = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return appState.allTags;
    return appState.allTags.filter(item => item.name.toLowerCase().includes(q));
  });

  function handleStartEdit(item) {
    editingTag = item.name;
    editingNewName = item.name;
  }

  function handleCancelEdit() {
    editingTag = null;
    editingNewName = '';
  }

  async function handleSaveEdit() {
    const oldName = editingTag;
    const newName = editingNewName.trim();

    if (!newName) {
      toast.show(t('tags.nameRequired'));
      return;
    }

    if (newName === oldName) {
      handleCancelEdit();
      return;
    }

    const isExisting = appState.allTags.some(t => t.name.toLowerCase() === newName.toLowerCase() && t.name !== oldName);

    const res = await appState.renameTag(oldName, newName);
    handleCancelEdit();

    if (res.success) {
      if (isExisting) {
        toast.show(t('tags.merged', { oldTag: oldName, newTag: newName }));
      } else {
        toast.show(t('tags.renamed', { tag: newName }));
      }
    } else {
      toast.show(t('common.failed'));
    }
  }

  function handlePromptDelete(tagName) {
    tagToDelete = tagName;
    showDeleteConfirm = true;
  }

  async function handleConfirmDelete() {
    if (!tagToDelete) return;
    const target = tagToDelete;
    const res = await appState.deleteTag(target);
    if (res.success) {
      toast.show(t('tags.deleted', { tag: target }));
    } else {
      toast.show(t('common.failed'));
    }
    tagToDelete = null;
  }
</script>

<!-- 搜索栏与概览 -->
<div class="flex items-center gap-2">
  <div class="relative flex-1">
    <input
      type="text"
      bind:value={searchQuery}
      placeholder={t('tags.searchPlaceholder')}
      class="w-full px-3 py-2 pl-8 rounded-lg bg-subtle border border-border-subtle outline-none text-text-primary text-xs focus:border-border-focus transition-colors"
    />
    <svg class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
    {#if searchQuery}
      <button
        type="button"
        onclick={() => (searchQuery = '')}
        aria-label={t('common.clear')}
        title={t('common.clear')}
        class="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary p-0.5 rounded"
      >
        <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    {/if}
  </div>
  <div class="px-2.5 py-1.5 rounded-lg bg-subtle border border-border-subtle text-text-secondary text-xs flex items-center gap-1 flex-shrink-0">
    <span>{t('tags.title')}:</span>
    <span class="font-semibold text-text-primary font-mono">{appState.allTags.length}</span>
  </div>
</div>

<!-- 提示说明 -->
<div class="text-[11px] text-text-tertiary leading-relaxed px-1">
  {t('tags.mergeNotice')}
</div>

<!-- 标签列表 -->
{#if appState.allTags.length === 0}
  <div class="p-8 text-center border border-dashed border-border-subtle rounded-xl text-text-tertiary text-xs">
    {t('tags.noTags')}
  </div>
{:else if filteredTags.length === 0}
  <div class="p-8 text-center border border-dashed border-border-subtle rounded-xl text-text-tertiary text-xs">
    {t('tags.noMatch')}
  </div>
{:else}
  <div class="space-y-1 divide-y divide-border-subtle/50 border border-border-subtle rounded-xl bg-surface p-1 max-h-[380px] overflow-y-auto">
    {#each filteredTags as tag (tag.name)}
      <div class="flex items-center justify-between p-2 hover:bg-subtle/40 rounded-lg transition-colors">
        {#if editingTag === tag.name}
          <div class="flex items-center gap-1.5 flex-1 mr-2">
            <input
              type="text"
              bind:value={editingNewName}
              class="flex-1 px-2 py-1 rounded bg-subtle border border-border-focus outline-none text-text-primary text-xs font-medium"
              placeholder={t('tags.renamePlaceholder')}
              onkeydown={(e) => {
                if (e.key === 'Enter') handleSaveEdit();
                if (e.key === 'Escape') handleCancelEdit();
              }}
            />
            <button
              type="button"
              onclick={handleSaveEdit}
              class="px-2.5 py-1 rounded bg-accent text-accent-fg text-[11px] font-medium hover:opacity-90 transition-opacity"
            >
              {t('common.confirm')}
            </button>
            <button
              type="button"
              onclick={handleCancelEdit}
              class="px-2.5 py-1 rounded border border-border-subtle text-text-secondary hover:text-text-primary text-[11px] transition-colors"
            >
              {t('common.cancel')}
            </button>
          </div>
        {:else}
          <div class="flex items-center gap-2 flex-1 min-w-0 mr-2">
            <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-subtle border border-border-subtle/70 text-xs font-medium text-text-primary truncate">
              <span class="text-accent">#</span>
              <span class="truncate">{tag.name}</span>
            </span>
            <span class="text-[11px] text-text-tertiary font-mono flex-shrink-0">
              {t('tags.bookmarkCount', { count: tag.count })}
            </span>
          </div>

          <div class="flex items-center gap-1 flex-shrink-0">
            <!-- 重命名/合并按钮 -->
            <button
              type="button"
              onclick={() => handleStartEdit(tag)}
              class="p-1.5 rounded hover:bg-subtle text-text-tertiary hover:text-text-primary transition-colors"
              title={t('tags.renameTooltip')}
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <!-- 删除标签按钮 -->
            <button
              type="button"
              onclick={() => handlePromptDelete(tag.name)}
              class="p-1.5 rounded hover:bg-subtle text-text-tertiary hover:text-status-danger transition-colors"
              title={t('tags.deleteTooltip')}
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
{/if}

<!-- 删除确认弹窗 -->
<ConfirmModal
  bind:open={showDeleteConfirm}
  title={t('common.delete')}
  message={t('tags.deleteConfirm', { tag: tagToDelete || '' })}
  confirmLabel={t('common.delete')}
  danger={true}
  onconfirm={handleConfirmDelete}
/>
