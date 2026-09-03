<script>
  import { appState } from '../../state/app.svelte.js';
  import { toast } from '../../state/toast.svelte.js';
  import { UNGROUPED_GROUP_ID, DEFAULT_AI_MODEL } from '../../constants/index.js';
  import { t } from '../../i18n/index.svelte.js';
  import AiResultModal from './AiResultModal.svelte';
  import ModalShell from '../common/ModalShell.svelte';

  let { open = $bindable(false) } = $props();

  let organizeMode = $state('manual'); // 'manual' (免Key网页对话) | 'api' (API直连)
  let activeType = $state('grouping'); // 'grouping' | 'tagging'
  let rawInput = $state('');
  let fileName = $state('');
  let isDraggingOver = $state(false);
  let isParsing = $state(false);

  // 结果审核弹窗状态
  let showResultModal = $state(false);
  let resultType = $state('grouping');
  let resultItems = $state([]);

  // 统计指标
  let ungroupedCount = $derived(
    appState.bookmarks.filter(b => !b.groupId || b.groupId === UNGROUPED_GROUP_ID).length
  );
  let untaggedCount = $derived(
    appState.bookmarks.filter(b => !Array.isArray(b.tags) || b.tags.length === 0).length
  );

  function updateAiSettings(partial) {
    const current = appState.settings.ai || {};
    const updated = {
      ...current,
      ...partial,
      grouping: {
        ...(current.grouping || {}),
        ...(partial.grouping || {})
      },
      tagging: {
        ...(current.tagging || {}),
        ...(partial.tagging || {})
      }
    };
    appState.updateSettings({ ai: updated });
  }

  function handleCopyPrompt() {
    if (appState.bookmarks.length === 0) {
      toast.show('当前书签库为空，无法生成提示词');
      return;
    }
    const result = activeType === 'grouping'
      ? appState.getManualGroupingPromptData()
      : appState.getManualTaggingPromptData();

    if (result.count === 0) {
      toast.show(activeType === 'grouping' ? '当前范围内没有待整理的书签' : '当前范围内所有书签均已存在标签');
      return;
    }

    navigator.clipboard.writeText(result.promptText).then(() => {
      toast.show('📋 提示词已复制到剪贴板！请配合下载的数据文件发给大模型');
    }).catch(() => {
      toast.show('复制失败，请手动复制');
    });
  }

  function handleDownloadDataJson() {
    if (appState.bookmarks.length === 0) {
      toast.show('当前书签库为空，无法导出数据');
      return;
    }
    const result = activeType === 'grouping'
      ? appState.getManualGroupingPromptData()
      : appState.getManualTaggingPromptData();

    if (result.count === 0) {
      toast.show(activeType === 'grouping' ? '当前范围内没有待整理的书签' : '当前范围内所有书签均已存在标签');
      return;
    }

    const jsonStr = JSON.stringify(result.simplifiedBookmarks, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smart_bookmarks_${activeType}_data_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.show(`💾 已下载 ${result.count} 项书签精简数据文件`);
  }

  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    readFile(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    isDraggingOver = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      readFile(file);
    }
  }

  function readFile(file) {
    fileName = file.name;
    const reader = new FileReader();
    reader.onload = (evt) => {
      rawInput = evt.target.result;
      toast.show(`已载入文件: ${file.name}`);
    };
    reader.onerror = () => {
      toast.show('读取文件失败');
    };
    reader.readAsText(file);
  }

  function handleParseResult() {
    if (!rawInput.trim()) {
      toast.show('请先粘贴模型回复内容或上传变更 JSON 文件');
      return;
    }

    isParsing = true;
    try {
      const parsed = appState.parseManualAiResponse(rawInput, activeType);
      if (!parsed.success || !parsed.items || parsed.items.length === 0) {
        toast.show('未能解析出有效的变更项，请检查大模型返回格式');
        return;
      }
      resultType = activeType;
      resultItems = parsed.items;
      showResultModal = true;
      toast.show(`✅ 成功解析 ${parsed.matchedCount} 项变更建议`);
    } catch (err) {
      toast.show(`❌ 解析失败: ${err.message}`);
    } finally {
      isParsing = false;
    }
  }

  // API 直连模式执行智能分组
  async function handleStartApiGrouping() {
    if (appState.bookmarks.length === 0) {
      toast.show('当前书签库为空，请先添加或导入书签');
      return;
    }

    try {
      const result = await appState.runSmartGrouping();
      if (!result.success || !result.items || result.items.length === 0) {
        toast.show(result.message || '没有发现需要迁移分组的书签');
        return;
      }
      resultType = 'grouping';
      resultItems = result.items;
      showResultModal = true;
    } catch (err) {
      toast.show(`AI 分组分析失败: ${err.message}`);
    }
  }

  // API 直连模式执行智能标签
  async function handleStartApiTagging() {
    if (appState.bookmarks.length === 0) {
      toast.show('当前书签库为空，请先添加或导入书签');
      return;
    }

    try {
      const result = await appState.runSmartTagging();
      if (!result.success || !result.items || result.items.length === 0) {
        toast.show(result.message || '没有发现需要提炼标签的书签');
        return;
      }
      resultType = 'tagging';
      resultItems = result.items;
      showResultModal = true;
    } catch (err) {
      toast.show(`AI 标签提炼失败: ${err.message}`);
    }
  }

  async function handleApplyResult(selectedItems) {
    if (resultType === 'grouping') {
      const plan = selectedItems.map(item => ({
        bookmarkId: item.bookmarkId,
        targetGroupName: item.suggestedGroupName,
        isNewGroup: item.isNewGroup
      }));
      const res = await appState.applyAiGroupChanges(plan);
      toast.show(`✅ 已成功迁移 ${res.modifiedCount} 项书签${res.newGroupsCreated ? `，新建 ${res.newGroupsCreated} 个分组` : ''}`);
    } else {
      const plan = selectedItems.map(item => ({
        bookmarkId: item.bookmarkId,
        suggestedTags: item.suggestedTags
      }));
      const mode = appState.settings.ai?.tagging?.mode || 'append';
      const res = await appState.applyAiTagChanges(plan, mode);
      toast.show(`✅ 已成功更新 ${res.modifiedCount} 项书签的标签`);
    }
    open = false;
  }
</script>

<ModalShell
  bind:open
  maxWidth="max-w-2xl"
  height="h-[610px]"
  spacing="space-y-3.5"
  closeDisabled={isParsing || appState.aiRunning}
>
  {#snippet header()}
    <div class="flex items-center gap-2">
      <div class="w-6 h-6 rounded-lg bg-accent/10 text-accent flex items-center justify-center font-bold text-xs">✨</div>
      <div>
        <h2 class="text-sm font-semibold text-text-primary">{t('ai.dialogTitle')}</h2>
      </div>
    </div>
  {/snippet}

      <!-- 模式切换分段胶囊：免Key网页对话 vs API直连 (显式固定高度 h-8，彻底消除因边框或徽标导致的 32px vs 30px 尺寸跳动) -->
      <div class="grid grid-cols-2 gap-1 bg-subtle p-1 rounded-lg text-xs flex-shrink-0">
        <button
          type="button"
          onclick={() => (organizeMode = 'manual')}
          class="h-8 px-2 rounded-md transition-all font-medium text-center flex items-center justify-center gap-1.5 {organizeMode === 'manual'
            ? 'bg-surface text-text-primary shadow-sm font-semibold border border-border-subtle/60'
            : 'text-text-secondary hover:text-text-primary hover:bg-surface/50 border border-transparent'}"
        >
          <span>{t('ai.manualTab')}</span>
          <span class="text-[9px] px-1 py-0.2 rounded font-sans font-medium bg-status-intranet/10 text-status-intranet border border-status-intranet/20">{t('ai.manualTabBadge')}</span>
        </button>
        <button
          type="button"
          onclick={() => (organizeMode = 'api')}
          class="h-8 px-2 rounded-md transition-all font-medium text-center flex items-center justify-center gap-1.5 {organizeMode === 'api'
            ? 'bg-surface text-text-primary shadow-sm font-semibold border border-border-subtle/60'
            : 'text-text-secondary hover:text-text-primary hover:bg-surface/50 border border-transparent'}"
        >
          <span>{t('ai.apiTab')}</span>
        </button>
      </div>

      <!-- 统一滚动内容区 (布局紧凑且一屏直达，消除常态滚动条) -->
      <div class="flex-1 overflow-y-auto space-y-3 text-xs pr-0.5">
        {#if organizeMode === 'manual'}
          <!-- ================= 网页对话模式 (3 步流) ================= -->
          <!-- 任务类型选择 (智能分组 / 智能标签) 卡片式分段切换 -->
          <div class="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onclick={() => (activeType = 'grouping')}
              class="p-2 rounded-xl border text-left transition-all flex items-center justify-between {activeType === 'grouping'
                ? 'border-border-focus bg-subtle ring-1 ring-border-focus'
                : 'border-border-subtle bg-surface hover:bg-subtle/50'}"
            >
              <div class="flex items-center gap-2">
                <span class="text-sm">📁</span>
                <div>
                  <div class="font-medium text-text-primary text-[11px]">{t('ai.groupingCardTitle')}</div>
                  <div class="text-[10px] text-text-tertiary">{t('ai.groupingCardDesc')}</div>
                </div>
              </div>
              <span class="text-[10px] px-1.5 py-0.5 rounded font-mono bg-surface border border-border-subtle text-text-secondary">
                {t('ai.ungroupedCount', { count: ungroupedCount })}
              </span>
            </button>
            <button
              type="button"
              onclick={() => (activeType = 'tagging')}
              class="p-2 rounded-xl border text-left transition-all flex items-center justify-between {activeType === 'tagging'
                ? 'border-border-focus bg-subtle ring-1 ring-border-focus'
                : 'border-border-subtle bg-surface hover:bg-subtle/50'}"
            >
              <div class="flex items-center gap-2">
                <span class="text-sm">🏷️</span>
                <div>
                  <div class="font-medium text-text-primary text-[11px]">{t('ai.taggingCardTitle')}</div>
                  <div class="text-[10px] text-text-tertiary">{t('ai.taggingCardDesc')}</div>
                </div>
              </div>
              <span class="text-[10px] px-1.5 py-0.5 rounded font-mono bg-surface border border-border-subtle text-text-secondary">
                {t('ai.untaggedCount', { count: untaggedCount })}
              </span>
            </button>
          </div>

          <!-- 步骤 1：准备提示词与数据 -->
          <div class="p-2.5 rounded-xl border border-border-subtle bg-surface space-y-2">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-text-primary text-[11px] flex items-center gap-1.5">
                <span class="w-4 h-4 rounded-full bg-accent/10 text-accent flex items-center justify-center text-[10px] font-bold font-mono">1</span>
                <span>{t('ai.step1Title')}</span>
              </span>
            </div>

            <!-- 参数配置行 (单色/无原生生硬样式) -->
            <div class="text-[11px] text-text-secondary space-y-1.5 bg-subtle/60 p-2 rounded-lg border border-border-subtle/50">
              {#if activeType === 'grouping'}
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="flex items-center gap-3">
                    <span class="text-text-tertiary">范围:</span>
                    <label class="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="modal-group-scope"
                        checked={appState.settings.ai?.grouping?.scope !== 'all'}
                        onchange={() => updateAiSettings({ grouping: { scope: 'ungrouped' } })}
                        class="accent-accent"
                      />
                      <span>仅未分组 ({ungroupedCount} 项)</span>
                    </label>
                    <label class="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="modal-group-scope"
                        checked={appState.settings.ai?.grouping?.scope === 'all'}
                        onchange={() => updateAiSettings({ grouping: { scope: 'all' } })}
                        class="accent-accent"
                      />
                      <span>全部书签 ({appState.bookmarks.length} 项)</span>
                    </label>
                  </div>

                  <label class="flex items-center gap-1.5 cursor-pointer text-text-secondary">
                    <input
                      type="checkbox"
                      checked={appState.settings.ai?.grouping?.allowNewGroups !== false}
                      onchange={(e) => updateAiSettings({ grouping: { allowNewGroups: e.target.checked } })}
                      class="rounded border-border-subtle accent-accent"
                    />
                    <span>允许提议新建分组</span>
                  </label>
                </div>
              {:else}
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="flex items-center gap-3">
                    <span class="text-text-tertiary">范围:</span>
                    <label class="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="modal-tag-scope"
                        checked={appState.settings.ai?.tagging?.scope !== 'all'}
                        onchange={() => updateAiSettings({ tagging: { scope: 'untagged' } })}
                        class="accent-accent"
                      />
                      <span>仅无标签 ({untaggedCount} 项)</span>
                    </label>
                    <label class="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="modal-tag-scope"
                        checked={appState.settings.ai?.tagging?.scope === 'all'}
                        onchange={() => updateAiSettings({ tagging: { scope: 'all' } })}
                        class="accent-accent"
                      />
                      <span>全部书签 ({appState.bookmarks.length} 项)</span>
                    </label>
                  </div>

                  <div class="flex items-center gap-3">
                    <span class="text-text-tertiary">模式:</span>
                    <label class="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="modal-tag-mode"
                        checked={appState.settings.ai?.tagging?.mode !== 'replace'}
                        onchange={() => updateAiSettings({ tagging: { mode: 'append' } })}
                        class="accent-accent"
                      />
                      <span>增量追加</span>
                    </label>
                    <label class="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="modal-tag-mode"
                        checked={appState.settings.ai?.tagging?.mode === 'replace'}
                        onchange={() => updateAiSettings({ tagging: { mode: 'replace' } })}
                        class="accent-accent"
                      />
                      <span>重构覆盖</span>
                    </label>
                  </div>
                </div>
              {/if}
            </div>

            <!-- 按钮组：复制提示词 + 下载数据 -->
            <div class="grid grid-cols-2 gap-2 pt-0.5">
              <button
                type="button"
                onclick={handleCopyPrompt}
                class="py-1.5 px-3 rounded-lg bg-accent text-accent-fg font-medium hover:opacity-90 transition-all flex items-center justify-center gap-1.5 text-xs shadow-xs"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>一键复制提示词</span>
              </button>

              <button
                type="button"
                onclick={handleDownloadDataJson}
                class="py-1.5 px-3 rounded-lg border border-border-subtle bg-surface hover:bg-subtle text-text-primary transition-all flex items-center justify-center gap-1.5 text-xs shadow-2xs font-medium"
              >
                <svg class="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>下载书签数据 JSON</span>
              </button>
            </div>
          </div>

          <!-- 步骤 2：外部对话引导 -->
          <div class="p-2 rounded-xl border border-border-subtle/70 bg-subtle/30 space-y-0.5 text-[11px]">
            <div class="flex items-center gap-1.5 font-semibold text-text-primary text-[11px]">
              <span class="w-4 h-4 rounded-full bg-accent/10 text-accent flex items-center justify-center text-[10px] font-bold font-mono">2</span>
              <span>前往网页大模型对话</span>
            </div>
            <p class="text-text-secondary leading-relaxed">
              在 <strong>DeepSeek / ChatGPT / Claude / Kimi / 豆包</strong> 中粘贴提示词并上传数据文件，模型将返回整理结果。
            </p>
          </div>

          <!-- 步骤 3：导入变更并生效 -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-text-primary text-[11px] flex items-center gap-1.5">
                <span class="w-4 h-4 rounded-full bg-accent/10 text-accent flex items-center justify-center text-[10px] font-bold font-mono">3</span>
                <span>导入大模型返回的变更结果</span>
              </span>
              {#if rawInput}
                <button
                  type="button"
                  onclick={() => { rawInput = ''; fileName = ''; }}
                  class="text-[11px] text-text-tertiary hover:text-status-danger transition-colors"
                >
                  清空
                </button>
              {/if}
            </div>

            <!-- 拖拽/上传/粘贴混合区 -->
            <div
              class="relative rounded-xl border-2 border-dashed transition-colors {isDraggingOver ? 'border-border-focus bg-subtle' : 'border-border-subtle bg-surface'}"
              ondragover={(e) => { e.preventDefault(); isDraggingOver = true; }}
              ondragleave={() => (isDraggingOver = false)}
              ondrop={handleDrop}
              role="region"
              aria-label="拖拽上传区域"
            >
              <textarea
                bind:value={rawInput}
                placeholder="在此直接粘贴 (Ctrl+V) 大模型返回的 JSON 内容或 Markdown 代码块...（或将文件拖入此处）"
                rows="2"
                class="w-full p-2 bg-transparent border-0 outline-none text-[11px] text-text-primary font-mono resize-none placeholder:text-text-tertiary"
              ></textarea>

              <div class="flex items-center justify-between px-3 py-1 bg-subtle/50 border-t border-border-subtle/50 text-[10px]">
                <label class="cursor-pointer text-text-primary hover:underline flex items-center gap-1 font-medium">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span>上传返回的 JSON 文件</span>
                  <input type="file" accept=".json,.txt" onchange={handleFileUpload} class="hidden" />
                </label>

                {#if fileName}
                  <span class="text-text-secondary font-mono truncate max-w-[200px]">已加载: {fileName}</span>
                {:else if rawInput}
                  <span class="text-text-tertiary">已输入 {rawInput.length} 字符</span>
                {/if}
              </div>
            </div>

            <!-- 解析并预览按钮 -->
            <button
              type="button"
              disabled={!rawInput.trim() || isParsing}
              onclick={handleParseResult}
              class="w-full py-2 rounded-xl bg-accent text-accent-fg font-medium hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5 text-xs shadow-xs"
            >
              {#if isParsing}
                <span class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <span>正在解析中...</span>
              {:else}
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                <span>解析并预览变更建议</span>
              {/if}
            </button>
          </div>

        {:else}
          <!-- ================= API 直连模式 ================= -->
          <div class="space-y-3 text-xs">
            <!-- 当前配置信息条 -->
            <div class="p-3 rounded-xl border border-border-subtle bg-subtle/50 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-text-tertiary">接口地址:</span>
                <span class="font-mono font-medium text-text-primary">{appState.settings.ai?.baseUrl || '未设置'}</span>
                <span class="px-1.5 py-0.5 rounded bg-surface text-[10px] text-text-secondary border border-border-subtle font-mono">{appState.settings.ai?.model || DEFAULT_AI_MODEL}</span>
              </div>
              <span class="text-[10px] text-text-tertiary">可在偏好设置中修改 API Key</span>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <!-- 智能分组 -->
              <div class="p-3.5 rounded-xl border border-border-subtle bg-surface space-y-3 flex flex-col justify-between">
                <div class="space-y-2">
                  <div class="flex items-center justify-between">
                    <span class="font-semibold text-text-primary text-[11px] flex items-center gap-1.5">
                      <span>📁 智能分组治理</span>
                    </span>
                    <span class="text-[10px] text-text-tertiary font-mono">未分组: {ungroupedCount}</span>
                  </div>
                  <p class="text-[11px] text-text-secondary leading-relaxed">
                    基于大模型分析书签语义，自动归类并提议创建新分组。
                  </p>

                  <div class="space-y-1.5 pt-1 text-[11px]">
                    <div class="flex items-center gap-2">
                      <input
                        type="radio"
                        id="api-scope-ungrouped"
                        name="api-group-scope"
                        checked={appState.settings.ai?.grouping?.scope !== 'all'}
                        onchange={() => updateAiSettings({ grouping: { scope: 'ungrouped' } })}
                        class="accent-accent"
                      />
                      <label for="api-scope-ungrouped" class="text-text-secondary cursor-pointer">
                        仅未分组 ({ungroupedCount} 项)
                      </label>
                    </div>
                    <div class="flex items-center gap-2">
                      <input
                        type="radio"
                        id="api-scope-all"
                        name="api-group-scope"
                        checked={appState.settings.ai?.grouping?.scope === 'all'}
                        onchange={() => updateAiSettings({ grouping: { scope: 'all' } })}
                        class="accent-accent"
                      />
                      <label for="api-scope-all" class="text-text-secondary cursor-pointer">
                        全部书签 ({appState.bookmarks.length} 项)
                      </label>
                    </div>

                    <div class="flex items-center gap-1.5 pt-1">
                      <input
                        type="checkbox"
                        id="api-allow-new-groups"
                        checked={appState.settings.ai?.grouping?.allowNewGroups !== false}
                        onchange={(e) => updateAiSettings({ grouping: { allowNewGroups: e.target.checked } })}
                        class="rounded border-border-subtle accent-accent"
                      />
                      <label for="api-allow-new-groups" class="text-text-tertiary cursor-pointer text-[10px]">
                        允许 AI 提议创建语义新分组
                      </label>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={appState.aiRunning}
                  onclick={handleStartApiGrouping}
                  class="w-full py-2 rounded-lg bg-accent text-accent-fg font-medium hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5 text-xs shadow-xs"
                >
                  {#if appState.aiRunning && appState.aiProgress?.phase === 'grouping'}
                    <span class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>{appState.aiProgress.message}</span>
                  {:else}
                    <span>🚀 启动 AI 智能分组分析</span>
                  {/if}
                </button>
              </div>

              <!-- 智能标签 -->
              <div class="p-3.5 rounded-xl border border-border-subtle bg-surface space-y-3 flex flex-col justify-between">
                <div class="space-y-2">
                  <div class="flex items-center justify-between">
                    <span class="font-semibold text-text-primary text-[11px] flex items-center gap-1.5">
                      <span>🏷️ 智能标签提炼</span>
                    </span>
                    <span class="text-[10px] text-text-tertiary font-mono">无标签: {untaggedCount}</span>
                  </div>
                  <p class="text-[11px] text-text-secondary leading-relaxed">
                    提炼技术栈与业务属性标签，支持增量追加或重构覆盖。
                  </p>

                  <div class="space-y-1.5 pt-1 text-[11px]">
                    <div class="flex items-center gap-2">
                      <input
                        type="radio"
                        id="api-scope-untagged"
                        name="api-tag-scope"
                        checked={appState.settings.ai?.tagging?.scope !== 'all'}
                        onchange={() => updateAiSettings({ tagging: { scope: 'untagged' } })}
                        class="accent-accent"
                      />
                      <label for="api-scope-untagged" class="text-text-secondary cursor-pointer">
                        仅无标签 ({untaggedCount} 项)
                      </label>
                    </div>
                    <div class="flex items-center gap-2">
                      <input
                        type="radio"
                        id="api-scope-tag-all"
                        name="api-tag-scope"
                        checked={appState.settings.ai?.tagging?.scope === 'all'}
                        onchange={() => updateAiSettings({ tagging: { scope: 'all' } })}
                        class="accent-accent"
                      />
                      <label for="api-scope-tag-all" class="text-text-secondary cursor-pointer">
                        优化全部标签 ({appState.bookmarks.length} 项)
                      </label>
                    </div>

                    <div class="flex items-center justify-between pt-1 text-[10px] text-text-tertiary">
                      <span>合并方式:</span>
                      <div class="flex items-center gap-2">
                        <label class="cursor-pointer">
                          <input
                            type="radio"
                            name="api-tag-mode"
                            checked={appState.settings.ai?.tagging?.mode !== 'replace'}
                            onchange={() => updateAiSettings({ tagging: { mode: 'append' } })}
                            class="accent-accent mr-0.5"
                          /> 增量追加
                        </label>
                        <label class="cursor-pointer">
                          <input
                            type="radio"
                            name="api-tag-mode"
                            checked={appState.settings.ai?.tagging?.mode === 'replace'}
                            onchange={() => updateAiSettings({ tagging: { mode: 'replace' } })}
                            class="accent-accent mr-0.5"
                          /> 重构覆盖
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={appState.aiRunning}
                  onclick={handleStartApiTagging}
                  class="w-full py-2 rounded-lg bg-accent text-accent-fg font-medium hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5 text-xs shadow-xs"
                >
                  {#if appState.aiRunning && appState.aiProgress?.phase === 'tagging'}
                    <span class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>{appState.aiProgress.message}</span>
                  {:else}
                    <span>🏷️ 启动 AI 标签提炼</span>
                  {/if}
                </button>
              </div>
            </div>
          </div>
        {/if}
      </div>
</ModalShell>

<!-- 结果比对与应用弹窗 -->
<AiResultModal
  bind:open={showResultModal}
  type={resultType}
  bind:items={resultItems}
  onApply={handleApplyResult}
/>
