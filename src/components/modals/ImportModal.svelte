<script>
  import { appState } from '../../state/app.svelte.js';
  import { toast } from '../../state/toast.svelte.js';
  import { classifyUrl } from '../../services/xor-matcher.js';
  import { fetchFaviconAsBase64, matchBrandIcon } from '../../services/favicon-fetcher.js';
  import { UNGROUPED_GROUP_ID, PINNED_GROUP_ID } from '../../constants/index.js';
  import { t } from '../../i18n/index.svelte.js';
  import IconRender from '../common/IconRender.svelte';
  import Select from '../common/Select.svelte';
  import ModalShell from '../common/ModalShell.svelte';

  let { open = $bindable(false) } = $props();

  let activeTab = $state('chrome'); // 'chrome' | 'file'
  let isScanning = $state(false);
  let isImporting = $state(false);
  let importProgress = $state(0);
  let importTotal = $state(0);
  let importCurrent = $state(0);
  let importStatusText = $state('');

  let rawScannedList = $state([]);
  let importPreview = $state([]);
  let mergeSimilar = $state(true);

  // 分组策略：'ungrouped' (未分组 - 默认推荐) | 'path' (按原路径建组) | 'specified' (指定分组)
  let groupMode = $state('ungrouped');
  let targetGroupId = $state('');

  const groupStrategyOptions = $derived([
    { value: 'ungrouped', label: t('import.strategyUngrouped') },
    { value: 'path', label: t('import.strategyPath') },
    { value: 'specified', label: t('import.strategySpecified') }
  ]);

  // 过滤出用户自定义分组（排除系统内置的常用分组和未分组）
  const customGroups = $derived(
    appState.groups.filter(g => g.id !== PINNED_GROUP_ID && g.id !== UNGROUPED_GROUP_ID)
  );

  const customGroupOptions = $derived(
    customGroups.map(g => ({
      value: g.id,
      label: g.name,
      iconText: '📁'
    }))
  );

  // 当选择指定分组模式时，确保默认选中第一个有效自定义分组
  $effect(() => {
    if (groupMode === 'specified' && customGroups.length > 0) {
      if (!targetGroupId || targetGroupId === PINNED_GROUP_ID || targetGroupId === UNGROUPED_GROUP_ID || !customGroups.some(g => g.id === targetGroupId)) {
        targetGroupId = customGroups[0].id;
      }
    }
  });

  function resetState() {
    rawScannedList = [];
    importPreview = [];
    isScanning = false;
    isImporting = false;
    importProgress = 0;
    importTotal = 0;
    importCurrent = 0;
    importStatusText = '';
    groupMode = 'ungrouped';
  }

  $effect(() => {
    if (open) {
      resetState();
      if (typeof chrome !== 'undefined' && chrome.bookmarks) {
        activeTab = 'chrome';
        scanChromeBookmarks();
      } else {
        activeTab = 'file';
      }
    }
  });

  async function scanChromeBookmarks() {
    if (typeof chrome === 'undefined' || !chrome.bookmarks) {
      toast.show(t('import.chromePermissionError'));
      return;
    }
    isScanning = true;
    try {
      const tree = await chrome.bookmarks.getTree();
      const rawList = [];

      function traverse(nodes, path = '') {
        for (const node of nodes) {
          if (node.url) {
            rawList.push({
              name: node.title || node.url,
              url: node.url,
              folder: path || t('import.defaultImportFolder'),
              customIconBase64: ''
            });
          }
          if (node.children) {
            const folderName = node.title || '';
            // 过滤无意义的顶级容器命名
            const nextPath = path ? (folderName ? `${path}/${folderName}` : path) : folderName;
            traverse(node.children, nextPath);
          }
        }
      }
      traverse(tree);
      rawScannedList = rawList;
      processScannedBookmarks(rawList);
    } catch (e) {
      console.error('扫描 Chrome 书签失败:', e);
      toast.show(t('import.chromeScanFailed'));
    } finally {
      isScanning = false;
    }
  }

  function parseHtmlBookmarks(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const rawList = [];

    function traverseNode(node, currentPath = '') {
      for (const child of node.children) {
        if (child.tagName === 'DT') {
          const h3 = child.querySelector(':scope > h3, :scope > H3');
          const dl = child.querySelector(':scope > dl, :scope > DL');
          const a = child.querySelector(':scope > a, :scope > A');

          if (a) {
            const href = a.getAttribute('href');
            const title = a.textContent?.trim() || href;
            const iconAttr = a.getAttribute('icon') || a.getAttribute('ICON') || a.getAttribute('icon_uri') || a.getAttribute('ICON_URI') || '';
            if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
              rawList.push({
                name: title,
                url: href,
                folder: currentPath || t('import.defaultImportFolder'),
                customIconBase64: iconAttr
              });
            }
          }

          if (h3 && dl) {
            const folderName = h3.textContent?.trim() || '';
            const nextPath = currentPath ? `${currentPath}/${folderName}` : folderName;
            traverseNode(dl, nextPath);
          } else if (dl) {
            traverseNode(dl, currentPath);
          }
        } else if (child.tagName === 'DL') {
          traverseNode(child, currentPath);
        }
      }
    }

    const rootDl = doc.querySelector('dl, DL');
    if (rootDl) {
      traverseNode(rootDl, '');
    } else {
      const links = doc.querySelectorAll('a');
      links.forEach(a => {
        const href = a.getAttribute('href');
        const title = a.textContent?.trim() || href;
        const iconAttr = a.getAttribute('icon') || a.getAttribute('ICON') || a.getAttribute('icon_uri') || a.getAttribute('ICON_URI') || '';
        if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
          rawList.push({
            name: title,
            url: href,
            folder: t('import.htmlImportFolder'),
            customIconBase64: iconAttr
          });
        }
      });
    }

    return rawList;
  }

  function handleHtmlFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    isScanning = true;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result;
        const raw = parseHtmlBookmarks(text);
        rawScannedList = raw;
        processScannedBookmarks(raw);
      } catch (err) {
        toast.show(t('import.htmlParseFailed'));
      } finally {
        isScanning = false;
      }
    };
    reader.readAsText(file);
  }

  function processScannedBookmarks(rawList) {
    if (mergeSimilar) {
      // 智能合并同名或同域名的书签为多入口
      const map = new Map();
      for (const item of rawList) {
        const key = item.name.toLowerCase().trim();
        const brand = matchBrandIcon(item.url, item.name);
        if (!map.has(key)) {
          map.set(key, {
            name: item.name,
            folder: item.folder,
            iconKey: brand,
            customIconBase64: item.customIconBase64 || '',
            endpoints: [{ url: item.url, order: 0, type: classifyUrl(item.url).type }]
          });
        } else {
          const existing = map.get(key);
          if (!existing.iconKey && brand) existing.iconKey = brand;
          if (!existing.customIconBase64 && item.customIconBase64) existing.customIconBase64 = item.customIconBase64;
          const urls = existing.endpoints.map(ep => ep.url);
          if (!urls.includes(item.url)) {
            existing.endpoints.push({
              url: item.url,
              order: existing.endpoints.length,
              type: classifyUrl(item.url).type
            });
          }
        }
      }
      importPreview = Array.from(map.values());
    } else {
      importPreview = rawList.map(item => ({
        name: item.name,
        folder: item.folder,
        iconKey: matchBrandIcon(item.url, item.name),
        customIconBase64: item.customIconBase64 || '',
        endpoints: [{ url: item.url, order: 0, type: classifyUrl(item.url).type }]
      }));
    }
  }

  function handleMergeToggle() {
    processScannedBookmarks(rawScannedList);
  }

  // 获取单个书签预览在当前策略下归属的分组名称展示
  function getPreviewTargetGroupName(item) {
    if (groupMode === 'path') {
      let folder = (item.folder || '').trim();
      if (folder.includes('/')) {
        const parts = folder.split('/').filter(Boolean);
        folder = parts[parts.length - 1] || folder;
      }
      return folder || t('import.defaultGroup');
    }
    if (groupMode === 'specified') {
      const g = customGroups.find(group => group.id === targetGroupId) || customGroups[0];
      return g?.name || t('import.specifiedGroup');
    }
    return t('groups.ungrouped');
  }

  async function executeImport() {
    if (importPreview.length === 0) {
      toast.show(t('import.noBookmarks'));
      return;
    }

    isImporting = true;
    importTotal = importPreview.length;
    importCurrent = 0;
    importProgress = 0;
    importStatusText = t('import.preparingImport');

    try {
      // 1. 构建已有分组名称索引
      const groupNameMap = new Map();
      for (const g of appState.groups) {
        groupNameMap.set(g.name.trim().toLowerCase(), g.id);
      }

      const groupsToCreate = [];
      const preparedBookmarks = [];

      for (const item of importPreview) {
        let finalGroupId = UNGROUPED_GROUP_ID;

        if (groupMode === 'path') {
          // 模式 1：按照路径设置分组名 (不存在同名分组则准备自动创建)
          let folderName = (item.folder || '').trim();
          if (folderName.includes('/')) {
            const parts = folderName.split('/').filter(Boolean);
            folderName = parts[parts.length - 1] || folderName;
          }
          if (!folderName) folderName = t('import.defaultImportFolder');

          const key = folderName.toLowerCase();
          if (groupNameMap.has(key)) {
            finalGroupId = groupNameMap.get(key);
          } else {
            const newGid = 'group_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
            groupsToCreate.push({ id: newGid, name: folderName });
            groupNameMap.set(key, newGid);
            finalGroupId = newGid;
          }
        } else if (groupMode === 'specified') {
          // 模式 2：指定分组 (仅限用户自定义分组，排除系统内置常用与未分组)
          const validGroup = customGroups.find(g => g.id === targetGroupId) || customGroups[0];
          finalGroupId = validGroup ? validGroup.id : UNGROUPED_GROUP_ID;
        } else {
          // 模式 3：未分组
          finalGroupId = UNGROUPED_GROUP_ID;
        }

        const validEndpoints = (item.endpoints && item.endpoints.length > 0)
          ? item.endpoints
          : (item.url ? [{ url: item.url, order: 0, type: classifyUrl(item.url).type }] : []);

        preparedBookmarks.push({
          id: 'bm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
          name: item.name || t('import.unnamedBookmark'),
          groupId: finalGroupId,
          tags: [],
          iconKey: item.iconKey || '',
          customIconBase64: item.customIconBase64 || '',
          endpoints: validEndpoints
        });
      }

      // 2. 异步并发抓取 Favicon 图标并更新进度条 (并发度 6)
      const concurrency = 6;
      let currentIndex = 0;

      async function processItem(bm) {
        const primaryUrl = bm.endpoints?.[0]?.url || '';
        if (!bm.iconKey && !bm.customIconBase64 && primaryUrl) {
          // 先匹配离线品牌库
          const brand = matchBrandIcon(primaryUrl, bm.name);
          if (brand) {
            bm.iconKey = brand;
          } else {
            // 异步抓取网络 Favicon
            try {
              const b64 = await fetchFaviconAsBase64(primaryUrl, 1500);
              if (b64) bm.customIconBase64 = b64;
            } catch {}
          }
        }
        importCurrent++;
        importProgress = Math.min(100, Math.round((importCurrent / importTotal) * 100));
        importStatusText = t('import.fetchingIcons', { current: importCurrent, total: importTotal });
      }

      const workers = Array.from({ length: Math.min(concurrency, preparedBookmarks.length) }, async () => {
        while (currentIndex < preparedBookmarks.length) {
          const idx = currentIndex++;
          await processItem(preparedBookmarks[idx]);
        }
      });

      await Promise.all(workers);

      importStatusText = t('import.writingStorage');
      importProgress = 100;

      // 3. 单次原子批量写入
      const res = await appState.batchImportBookmarks(groupsToCreate, preparedBookmarks);
      toast.show(t('import.importSuccess', { count: res.importedCount || preparedBookmarks.length }));
      open = false;
    } catch (e) {
      console.error('导入书签失败:', e);
      toast.show(t('import.importError', { error: e.message || t('import.unknownError') }));
    } finally {
      isImporting = false;
    }
  }
</script>

<ModalShell
  bind:open
  title={t('import.title')}
  maxWidth="max-w-xl"
  closable={!isImporting}
  closeDisabled={isImporting}
>
      {#if isImporting}
        <!-- 导入中进度条全屏反馈 -->
        <div class="flex-1 flex flex-col items-center justify-center space-y-5 px-6 text-center">
          <div class="w-14 h-14 rounded-2xl bg-subtle border border-border-subtle flex items-center justify-center text-accent">
            <div class="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
          </div>
          <div class="space-y-2 w-full max-w-sm">
            <div class="flex items-center justify-between text-xs">
              <span class="font-medium text-text-primary">{importStatusText}</span>
              <span class="font-mono text-accent font-semibold">{importProgress}%</span>
            </div>
            <!-- 进度条轨道 -->
            <div class="w-full h-2 rounded-full bg-subtle overflow-hidden border border-border-subtle p-[1px]">
              <div
                class="h-full bg-accent rounded-full transition-all duration-150 ease-out"
                style="width: {importProgress}%;"
              ></div>
            </div>
            <p class="text-[11px] text-text-tertiary pt-1">
              {t('import.importingHint')}
            </p>
          </div>
        </div>
      {:else}
        <!-- 选项卡切换 (等宽分段胶囊) -->
        <div class="grid {typeof chrome !== 'undefined' && chrome.bookmarks ? 'grid-cols-2' : 'grid-cols-1'} gap-1 bg-subtle p-1 rounded-lg text-xs flex-shrink-0">
          {#if typeof chrome !== 'undefined' && chrome.bookmarks}
            <button
              type="button"
              onclick={() => { activeTab = 'chrome'; scanChromeBookmarks(); }}
              class="py-1.5 px-3 rounded-md transition-all font-medium text-center {activeTab === 'chrome'
                ? 'bg-surface text-text-primary shadow-sm font-semibold border border-border-subtle/60'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface/50'}"
            >
              {t('import.tabChrome')}
            </button>
          {/if}
          <button
            type="button"
            onclick={() => { activeTab = 'file'; }}
            class="py-1.5 px-3 rounded-md transition-all font-medium text-center {activeTab === 'file'
              ? 'bg-surface text-text-primary shadow-sm font-semibold border border-border-subtle/60'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface/50'}"
          >
            {t('import.tabFile')}
          </button>
        </div>

        <!-- 导入目标分组策略配置区 -->
        <div class="space-y-2 bg-subtle p-3 rounded-lg border border-border-subtle flex-shrink-0 text-xs">
          <div class="space-y-1.5">
            <span class="block text-text-secondary font-medium">{t('import.strategyLabel')}</span>
            <Select
              mode="segmented"
              options={groupStrategyOptions}
              bind:value={groupMode}
            />
          </div>

          {#if groupMode === 'ungrouped'}
            <div class="flex items-start gap-2 p-2 rounded-md bg-accent/5 border border-accent/15 text-[11px] leading-relaxed">
              <span class="text-accent flex-shrink-0 mt-0.5">✨</span>
              <span class="text-text-secondary">
                <strong class="text-text-primary font-medium">{t('import.recommendedTitle')}</strong>：{t('import.recommendedDesc')}
              </span>
            </div>
          {:else if groupMode === 'specified'}
            <div class="space-y-1 pt-1.5 border-t border-border-subtle/50">
              <span class="block text-text-secondary font-medium">{t('import.specifiedGroupLabel')}</span>
              {#if customGroups.length > 0}
                <Select
                  options={customGroupOptions}
                  bind:value={targetGroupId}
                />
              {:else}
                <div class="p-2 rounded bg-surface border border-border-subtle text-text-tertiary text-[11px]">
                  {t('import.noCustomGroupHint')}
                </div>
              {/if}
            </div>
          {:else if groupMode === 'path'}
            <div class="p-2 rounded-md bg-surface/60 border border-border-subtle/60 text-[11px] text-text-tertiary">
              {t('import.pathGroupHint')}
            </div>
          {/if}

          <div class="flex items-center gap-2 pt-1 border-t border-border-subtle/50">
            <input
              type="checkbox"
              id="merge-similar"
              bind:checked={mergeSimilar}
              onchange={handleMergeToggle}
              class="rounded border-border-subtle text-accent"
            />
            <label for="merge-similar" class="text-text-secondary cursor-pointer">
              {t('import.mergeSimilarLabel')}
            </label>
          </div>
        </div>

        <!-- 内容区与文件上传 / 预览列表 -->
        <div class="flex-1 min-h-0 flex flex-col space-y-2 text-xs">
          {#if activeTab === 'file' && rawScannedList.length === 0 && !isScanning}
            <div class="border-2 border-dashed border-border-subtle hover:border-border-focus rounded-xl p-6 text-center transition-colors flex-1 flex flex-col items-center justify-center">
              <input
                type="file"
                accept=".html,.htm"
                onchange={handleHtmlFileUpload}
                class="hidden"
                id="html-file-input"
              />
              <label for="html-file-input" class="cursor-pointer space-y-2 block w-full">
                <div class="w-8 h-8 mx-auto rounded-full bg-subtle flex items-center justify-center text-text-tertiary">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                </div>
                <p class="font-medium text-text-primary">{t('import.chooseHtmlFile')}</p>
                <p class="text-[11px] text-text-tertiary">{t('import.htmlFormatHint')}</p>
              </label>
            </div>
          {/if}

          <!-- 扫描加载中 -->
          {#if isScanning}
            <div class="py-12 flex-1 flex flex-col items-center justify-center text-text-tertiary space-y-2">
              <div class="w-5 h-5 mx-auto border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
              <p>{t('import.scanningHint')}</p>
            </div>
          {:else if importPreview.length > 0}
            <div class="flex-1 min-h-0 flex flex-col space-y-1.5">
              <div class="flex items-center justify-between text-text-tertiary text-[11px] px-1 flex-shrink-0">
                <span>{t('import.previewCount', { count: importPreview.length })}</span>
                <div class="flex items-center gap-2">
                  <span>{t('import.targetStrategy', { strategy: groupStrategyOptions.find(o => o.value === groupMode)?.label })}</span>
                  {#if activeTab === 'file'}
                    <span>·</span>
                    <label for="html-file-input-reselect" class="text-accent hover:underline cursor-pointer">
                      {t('import.reselectFile')}
                    </label>
                    <input
                      type="file"
                      accept=".html,.htm"
                      onchange={handleHtmlFileUpload}
                      class="hidden"
                      id="html-file-input-reselect"
                    />
                  {/if}
                </div>
              </div>
              <div class="flex-1 min-h-0 overflow-y-auto divide-y divide-border-subtle/50 border border-border-subtle rounded-lg bg-surface">
                {#each importPreview as item}
                  <div class="p-2 flex items-center justify-between gap-2 hover:bg-subtle/40 transition-colors">
                    <div class="flex items-center gap-2.5 min-w-0 flex-1 truncate">
                      <IconRender iconKey={item.iconKey} customIcon={item.customIconBase64} size={22} />
                      <div class="min-w-0 flex-1 truncate">
                        <div class="flex items-center gap-1.5 truncate">
                          <span class="font-medium text-text-primary truncate">{item.name}</span>
                          <span class="px-1.5 py-0.2 rounded text-[9px] font-mono bg-subtle text-text-tertiary border border-border-subtle flex-shrink-0">
                            📁 {getPreviewTargetGroupName(item)}
                          </span>
                        </div>
                        <span class="font-mono text-[10px] text-text-tertiary block truncate mt-0.5">
                          {item.endpoints.map(e => e.url).join(' | ')}
                        </span>
                      </div>
                    </div>
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-subtle text-text-secondary flex-shrink-0">
                      {t('import.entryCount', { count: item.endpoints.length })}
                    </span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>

        <!-- 底部操作按钮 -->
        <div class="flex items-center justify-between pt-3 border-t border-border-subtle flex-shrink-0">
          <span class="text-xs text-text-tertiary">
            {#if importPreview.length > 0}{t('import.parsedCount', { count: importPreview.length })}{/if}
          </span>
          <div class="flex items-center gap-2">
            <button
              type="button"
              onclick={() => (open = false)}
              class="px-4 py-2 rounded-lg border border-border-subtle hover:bg-subtle text-xs font-medium text-text-secondary transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={importPreview.length === 0}
              onclick={executeImport}
              class="px-4 py-2 rounded-lg bg-accent text-accent-fg text-xs font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('import.confirmImport')}
            </button>
          </div>
        </div>
      {/if}
</ModalShell>
