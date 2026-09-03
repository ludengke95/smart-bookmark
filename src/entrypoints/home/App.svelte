<script>
  import { onMount } from 'svelte';
  import { appState } from '../../state/app.svelte.js';
  import { toast } from '../../state/toast.svelte.js';
  import { t } from '../../i18n/index.svelte.js';
  import TopNav from '../../components/newtab/TopNav.svelte';
  import HeroSearch from '../../components/newtab/HeroSearch.svelte';
  import TagPills from '../../components/newtab/TagPills.svelte';
  import BookmarkGrid from '../../components/newtab/BookmarkGrid.svelte';
  import Toast from '../../components/common/Toast.svelte';
  import ConfirmModal from '../../components/common/ConfirmModal.svelte';

  import BookmarkModal from '../../components/modals/BookmarkModal.svelte';
  import ImportModal from '../../components/modals/ImportModal.svelte';
  import SettingsModal from '../../components/modals/SettingsModal.svelte';
  import BackupModal from '../../components/modals/BackupModal.svelte';
  import StatsModal from '../../components/modals/StatsModal.svelte';
  import AiOrganizeModal from '../../components/modals/AiOrganizeModal.svelte';

  let showBookmarkModal = $state(false);
  let showImportModal = $state(false);
  let showSettingsModal = $state(false);
  let showBackupModal = $state(false);
  let showStatsModal = $state(false);
  let showAiOrganizeModal = $state(false);

  let editingBookmark = $state(null);
  let targetDefaultGroupId = $state('');
  let deleteTarget = $state({ open: false, bookmark: null });

  onMount(async () => {
    await appState.init();
  });

  function handleOpenAddBookmark(groupId = '') {
    editingBookmark = null;
    targetDefaultGroupId = groupId;
    showBookmarkModal = true;
  }

  function handleOpenEditBookmark(bm) {
    editingBookmark = bm;
    targetDefaultGroupId = bm.groupId || '';
    showBookmarkModal = true;
  }

  function handleOpenDeleteBookmark(bm) {
    deleteTarget = { open: true, bookmark: bm };
  }

  async function performDeleteBookmark() {
    if (!deleteTarget.bookmark) return;
    await appState.deleteBookmark(deleteTarget.bookmark.id);
    toast.show(t('bookmark.toastDeleted'));
  }
</script>

<div class="min-h-screen bg-canvas text-text-primary flex flex-col font-sans selection:bg-accent/20">
  <!-- 顶部极简浮动导航栏 -->
  <TopNav
    onOpenAdd={() => handleOpenAddBookmark()}
    onOpenImport={() => (showImportModal = true)}
    onOpenAiOrganize={() => (showAiOrganizeModal = true)}
    onOpenSettings={() => (showSettingsModal = true)}
    onOpenBackup={() => (showBackupModal = true)}
    onOpenStats={() => (showStatsModal = true)}
  />

  <!-- 页面主体内容区 -->
  <main class="flex-1 flex flex-col pt-14 pb-12">
    <!-- 英雄区：时钟、日期与胶囊搜索 -->
    <HeroSearch />

    <!-- 标签筛选胶囊区 -->
    <TagPills />

    <!-- 书签瀑布流分组网格 -->
    <BookmarkGrid
      onEditBookmark={handleOpenEditBookmark}
      onDeleteBookmark={handleOpenDeleteBookmark}
      onAddBookmarkToGroup={(gid) => handleOpenAddBookmark(gid)}
      onOpenImport={() => (showImportModal = true)}
    />
  </main>

  <!-- 底部全局轻量 Toast 反馈 -->
  <Toast />

  <!-- 弹窗模态层 (Modals) -->
  <BookmarkModal
    bind:open={showBookmarkModal}
    editBookmark={editingBookmark}
    defaultGroupId={targetDefaultGroupId}
  />

  <ImportModal
    bind:open={showImportModal}
  />

  <AiOrganizeModal
    bind:open={showAiOrganizeModal}
  />

  <SettingsModal
    bind:open={showSettingsModal}
  />

  <BackupModal
    bind:open={showBackupModal}
  />

  <StatsModal
    bind:open={showStatsModal}
  />
</div>

<!-- 删除书签确认弹窗 -->
<ConfirmModal
  bind:open={deleteTarget.open}
  title={t('bookmark.editTitle')}
  message={deleteTarget.bookmark ? t('bookmark.deleteConfirm', { name: deleteTarget.bookmark.name }) : ''}
  confirmLabel={t('common.delete')}
  danger
  onconfirm={performDeleteBookmark}
/>
