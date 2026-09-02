<script>
  import { appState } from '../../state/app.svelte.js';
  import { toast } from '../../state/toast.svelte.js';
  import { PINNED_GROUP_ID, UNGROUPED_GROUP_ID } from '../../constants/index.js';
  import BookmarkCard from './BookmarkCard.svelte';

  let { onEditBookmark = () => {}, onDeleteBookmark = () => {}, onAddBookmarkToGroup = () => {}, onOpenImport = () => {} } = $props();

  let draggedBookmarkId = $state(null);
  let dropTargetBookmarkId = $state(null);

  // 只有在自定义排序模式且未处于搜索/单标签筛选时允许拖拽排序
  let isCustomSort = $derived(
    (appState.settings.bookmarkSortOrder || 'custom') === 'custom' && appState.activeTag === 'all' && !appState.searchQuery
  );

  function handleDragStart(e, bm) {
    if (!isCustomSort) return;
    draggedBookmarkId = bm.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', bm.id);
  }

  function handleDragEnd() {
    draggedBookmarkId = null;
    dropTargetBookmarkId = null;
  }

  function handleDragOver(e, targetBm) {
    if (!isCustomSort) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedBookmarkId && draggedBookmarkId !== targetBm.id) {
      dropTargetBookmarkId = targetBm.id;
    }
  }

  function handleDragLeave(targetBm) {
    if (dropTargetBookmarkId === targetBm.id) {
      dropTargetBookmarkId = null;
    }
  }

  async function handleDrop(e, targetBm, group) {
    if (!isCustomSort) return;
    e.preventDefault();
    const sourceId = draggedBookmarkId || e.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === targetBm.id) {
      draggedBookmarkId = null;
      dropTargetBookmarkId = null;
      return;
    }

    const allBms = [...appState.bookmarks];
    const sourceIdx = allBms.findIndex(b => b.id === sourceId);
    const targetIdx = allBms.findIndex(b => b.id === targetBm.id);

    if (sourceIdx !== -1 && targetIdx !== -1) {
      const [movedBm] = allBms.splice(sourceIdx, 1);
      // 若跨分组拖拽，同步更新所属分组
      if (group?.id && group.id !== PINNED_GROUP_ID) {
        movedBm.groupId = group.id;
      }
      const newTargetIdx = allBms.findIndex(b => b.id === targetBm.id);
      allBms.splice(newTargetIdx, 0, movedBm);

      const orderedIds = allBms.map(b => b.id);
      await appState.reorderBookmarks(orderedIds);
      if (movedBm.groupId !== targetBm.groupId && group?.id && group.id !== PINNED_GROUP_ID) {
        await appState.saveBookmark(movedBm);
      }
      toast.show('已更新书签排序');
    }

    draggedBookmarkId = null;
    dropTargetBookmarkId = null;
  }
</script>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
  {#if appState.bookmarks.length === 0}
    <!-- 全局空数据引导 (新安装或无书签状态) -->
    <div class="py-20 text-center space-y-4 max-w-md mx-auto">
      <div class="w-12 h-12 mx-auto rounded-2xl bg-subtle border border-border-subtle flex items-center justify-center text-text-tertiary text-xl">
        🔖
      </div>
      <div class="space-y-1">
        <h3 class="text-sm font-medium text-text-primary">开启你的智能书签</h3>
        <p class="text-xs text-text-tertiary leading-relaxed">
          当前暂无书签数据。你可以直接导入浏览器书签，或手动添加第一个书签。
        </p>
      </div>
      <div class="flex items-center justify-center gap-3 pt-2">
        <button
          type="button"
          onclick={() => onAddBookmarkToGroup('')}
          class="px-3.5 py-1.5 rounded-lg bg-accent text-accent-fg text-xs font-medium shadow-sm hover:opacity-90 transition-opacity"
        >
          + 新增书签
        </button>
        <button
          type="button"
          onclick={() => onOpenImport()}
          class="px-3.5 py-1.5 rounded-lg bg-subtle border border-border-subtle hover:bg-surface text-text-primary text-xs font-medium transition-colors"
        >
          导入书签
        </button>
      </div>
    </div>
  {:else}
    <!-- 1. 常用置顶分组 (Pinned / High Frequency) -->
    {#if appState.frequentBookmarks.length > 0 && appState.activeTag === 'all' && !appState.searchQuery}
      <section class="space-y-3">
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
            <span class="text-amber-500">★</span>
            <span>常用推荐</span>
          </div>
          <div class="flex-1 h-[1px] bg-border-subtle/60"></div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {#each appState.frequentBookmarks as bm (bm.id || bm.name)}
            <BookmarkCard
              bookmark={bm}
              onEdit={onEditBookmark}
              onDelete={onDeleteBookmark}
            />
          {/each}
        </div>
      </section>
    {/if}

    <!-- 2. 全部分组流 (Group Flow) -->
    {#each appState.groupedBookmarks as { group, bookmarks } (group.id || group.name)}
      <!-- 当分组是内置 PINNED 时，且我们在上面已经展示了常用，跳过普通分组渲染以避免重复 -->
      {#if group.id !== PINNED_GROUP_ID && (bookmarks.length > 0 || appState.activeTag === 'all')}
        <section class="space-y-3">
          <!-- 分组标题栏 -->
          <div class="flex items-center justify-between gap-3 group/header">
            <div class="flex items-center gap-2">
              <button
                type="button"
                onclick={() => appState.toggleGroupCollapse(group.id)}
                class="flex items-center gap-1.5 text-xs font-semibold text-text-primary hover:text-accent transition-colors"
              >
                <svg
                  class="w-3.5 h-3.5 text-text-tertiary transition-transform duration-200 {appState.collapsedGroups.has(group.id) ? '-rotate-90' : 'rotate-0'}"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
                <span>{group.name}</span>
              </button>
              <span class="text-[11px] font-mono text-text-tertiary">
                ({bookmarks.length})
              </span>
            </div>

            <!-- 极细横贯分割线 -->
            <div class="flex-1 h-[1px] bg-border-subtle/60"></div>

            <!-- 分组快捷操作 (新增到此分组) -->
            {#if group.id !== UNGROUPED_GROUP_ID}
              <button
                type="button"
                onclick={() => onAddBookmarkToGroup(group.id)}
                class="opacity-0 group-hover/header:opacity-100 text-[11px] text-text-tertiary hover:text-text-primary transition-opacity flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-subtle"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                <span>加书签</span>
              </button>
            {/if}
          </div>

          <!-- 卡片网格 (支持折叠收起与自定义拖拽排序) -->
          {#if !appState.collapsedGroups.has(group.id)}
            {#if bookmarks.length > 0}
              <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {#each bookmarks as bm (bm.id || bm.name)}
                  <div
                    class="transition-transform duration-150 {draggedBookmarkId === bm.id ? 'opacity-40 scale-95' : ''} {dropTargetBookmarkId === bm.id ? 'ring-2 ring-accent ring-offset-2 ring-offset-canvas rounded-lg' : ''}"
                  >
                    <BookmarkCard
                      bookmark={bm}
                      draggable={isCustomSort}
                      ondragstart={(e) => handleDragStart(e, bm)}
                      ondragend={handleDragEnd}
                      ondragover={(e) => handleDragOver(e, bm)}
                      ondragleave={() => handleDragLeave(bm)}
                      ondrop={(e) => handleDrop(e, bm, group)}
                      onEdit={onEditBookmark}
                      onDelete={onDeleteBookmark}
                    />
                  </div>
                {/each}
              </div>
            {:else}
              <div class="p-6 rounded-lg border border-dashed border-border-subtle/80 text-center text-text-tertiary text-xs">
                该分组暂无书签
              </div>
            {/if}
          {/if}
        </section>
      {/if}
    {/each}

    <!-- 搜索无结果空状态 -->
    {#if appState.filteredBookmarks.length === 0 && (appState.searchQuery || appState.activeTag !== 'all')}
      <div class="py-16 text-center space-y-3">
        <div class="w-10 h-10 mx-auto rounded-full bg-subtle flex items-center justify-center text-text-tertiary">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <p class="text-sm text-text-secondary">未找到匹配的书签</p>
        <button
          type="button"
          onclick={() => { appState.searchQuery = ''; appState.activeTag = 'all'; }}
          class="text-xs text-accent underline hover:opacity-80"
        >
          清除筛选条件
        </button>
      </div>
    {/if}
  {/if}
</div>
