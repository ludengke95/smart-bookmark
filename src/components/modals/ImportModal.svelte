<script>
  import { appState } from '../../state/app.svelte.js';
  import { toast } from '../../state/toast.svelte.js';
  import { classifyUrl } from '../../services/xor-matcher.js';
  import { fetchFaviconAsBase64, matchBrandIcon } from '../../services/favicon-fetcher.js';
  import { UNGROUPED_GROUP_ID, PINNED_GROUP_ID } from '../../constants/index.js';
  import IconRender from '../common/IconRender.svelte';
  import Select from '../common/Select.svelte';

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

  const groupStrategyOptions = [
    { value: 'ungrouped', label: '未分组 (推荐)' },
    { value: 'path', label: '按原路径建组' },
    { value: 'specified', label: '指定分组' }
  ];

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
      toast.show('当前环境未启用 Chrome 书签权限');
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
              folder: path || '默认导入',
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
      toast.show('读取 Chrome 书签失败');
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
                folder: currentPath || '默认导入',
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
            folder: 'HTML导入',
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
        toast.show('解析 HTML 书签文件失败');
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
      return folder || '默认分组';
    }
    if (groupMode === 'specified') {
      const g = customGroups.find(group => group.id === targetGroupId) || customGroups[0];
      return g?.name || '指定分组';
    }
    return '未分组';
  }

  async function executeImport() {
    if (importPreview.length === 0) {
      toast.show('没有可导入的书签');
      return;
    }

    isImporting = true;
    importTotal = importPreview.length;
    importCurrent = 0;
    importProgress = 0;
    importStatusText = '准备导入...';

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
          if (!folderName) folderName = '默认导入';

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
          name: item.name || '未命名书签',
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
        importStatusText = `正在获取图标与处理 (${importCurrent}/${importTotal})...`;
      }

      const workers = Array.from({ length: Math.min(concurrency, preparedBookmarks.length) }, async () => {
        while (currentIndex < preparedBookmarks.length) {
          const idx = currentIndex++;
          await processItem(preparedBookmarks[idx]);
        }
      });

      await Promise.all(workers);

      importStatusText = '正在写入存储...';
      importProgress = 100;

      // 3. 单次原子批量写入
      const res = await appState.batchImportBookmarks(groupsToCreate, preparedBookmarks);
      toast.show(`成功导入 ${res.importedCount || preparedBookmarks.length} 个智能书签（已同步获取图标）`);
      open = false;
    } catch (e) {
      console.error('导入书签失败:', e);
      toast.show('导入过程出错: ' + (e.message || '未知异常'));
    } finally {
      isImporting = false;
    }
  }
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={(e) => { if (!isImporting && e.target === e.currentTarget) open = false; }}
    onkeydown={(e) => { if (!isImporting && e.key === 'Escape') open = false; }}
  >
    <div class="w-full max-w-xl h-[530px] bg-surface border border-border-subtle rounded-xl shadow-popover p-5 space-y-4 flex flex-col">
      <!-- 头部 -->
      <div class="flex items-center justify-between pb-2 border-b border-border-subtle flex-shrink-0">
        <h2 class="text-sm font-semibold text-text-primary">导入与迁移书签</h2>
        {#if !isImporting}
          <button
            type="button"
            onclick={() => (open = false)}
            class="p-1 rounded hover:bg-subtle text-text-tertiary hover:text-text-primary transition-colors"
            aria-label="关闭对话框"
            title="关闭"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        {/if}
      </div>

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
              正在并发识别品牌图标并抓取网站 Favicon，请稍候...
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
              浏览器书签
            </button>
          {/if}
          <button
            type="button"
            onclick={() => { activeTab = 'file'; }}
            class="py-1.5 px-3 rounded-md transition-all font-medium text-center {activeTab === 'file'
              ? 'bg-surface text-text-primary shadow-sm font-semibold border border-border-subtle/60'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface/50'}"
          >
            HTML 书签文件
          </button>
        </div>

        <!-- 导入目标分组策略配置区 -->
        <div class="space-y-2 bg-subtle p-3 rounded-lg border border-border-subtle flex-shrink-0 text-xs">
          <div class="space-y-1.5">
            <span class="block text-text-secondary font-medium">导入目标分组策略</span>
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
                <strong class="text-text-primary font-medium">推荐策略</strong>：书签将先统一归入「未分组」，导入完成后可前往 <strong class="text-accent font-medium">设置 → AI 与 MCP</strong> 使用智能分组一键完成整理与分类。
              </span>
            </div>
          {:else if groupMode === 'specified'}
            <div class="space-y-1 pt-1.5 border-t border-border-subtle/50">
              <span class="block text-text-secondary font-medium">选择指定的目标分组 (自定义分组)</span>
              {#if customGroups.length > 0}
                <Select
                  options={customGroupOptions}
                  bind:value={targetGroupId}
                />
              {:else}
                <div class="p-2 rounded bg-surface border border-border-subtle text-text-tertiary text-[11px]">
                  当前暂无自定义分组，请先在“偏好设置”中创建，或选择「未分组」/「按原路径建组」。
                </div>
              {/if}
            </div>
          {:else if groupMode === 'path'}
            <div class="p-2 rounded-md bg-surface/60 border border-border-subtle/60 text-[11px] text-text-tertiary">
              📁 将自动读取原书签夹的目录结构，并为每个目录创建对应的分组。
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
              自动合并同名书签为多入口 (内网 / 外网多地址聚合)
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
                <p class="font-medium text-text-primary">点击选择 Chrome 导出的 HTML 书签文件</p>
                <p class="text-[11px] text-text-tertiary">支持 Netscape / 标准 HTML 树状书签格式 (含内置图标)</p>
              </label>
            </div>
          {/if}

          <!-- 扫描加载中 -->
          {#if isScanning}
            <div class="py-12 flex-1 flex flex-col items-center justify-center text-text-tertiary space-y-2">
              <div class="w-5 h-5 mx-auto border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
              <p>正在读取并解析书签路径结构...</p>
            </div>
          {:else if importPreview.length > 0}
            <div class="flex-1 min-h-0 flex flex-col space-y-1.5">
              <div class="flex items-center justify-between text-text-tertiary text-[11px] px-1 flex-shrink-0">
                <span>待导入书签列表 ({importPreview.length} 项)</span>
                <div class="flex items-center gap-2">
                  <span>目标策略：{groupStrategyOptions.find(o => o.value === groupMode)?.label}</span>
                  {#if activeTab === 'file'}
                    <span>·</span>
                    <label for="html-file-input-reselect" class="text-accent hover:underline cursor-pointer">
                      重选文件
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
                      {item.endpoints.length} 入口
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
            {#if importPreview.length > 0}已解析 {importPreview.length} 个书签{/if}
          </span>
          <div class="flex items-center gap-2">
            <button
              type="button"
              onclick={() => (open = false)}
              class="px-4 py-2 rounded-lg border border-border-subtle hover:bg-subtle text-xs font-medium text-text-secondary transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              disabled={importPreview.length === 0}
              onclick={executeImport}
              class="px-4 py-2 rounded-lg bg-accent text-accent-fg text-xs font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              确认导入
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
