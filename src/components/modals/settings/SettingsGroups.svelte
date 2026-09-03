<script>
  import { appState } from '../../../state/app.svelte.js';
  import { toast } from '../../../state/toast.svelte.js';
  import { t } from '../../../i18n/index.svelte.js';
  import { getGroupName } from '../../../i18n/utils.js';
  import { PINNED_GROUP_ID, UNGROUPED_GROUP_ID } from '../../../constants/index.js';

  let newGroupName = $state('');
  let editingGroupId = $state(null);
  let editingGroupName = $state('');

  // 用户自定义分组（排除系统内置的常用/未分组）
  let customGroups = $derived(
    appState.groups.filter(g => g.id !== PINNED_GROUP_ID && g.id !== UNGROUPED_GROUP_ID)
  );

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
</script>

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
