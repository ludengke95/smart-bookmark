<script>
  import { appState } from '../../state/app.svelte.js';
  import { toast } from '../../state/toast.svelte.js';
  import { UNGROUPED_GROUP_ID } from '../../constants/index.js';
  import AiResultModal from './AiResultModal.svelte';

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

{#if open}
  <div
    class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={(e) => { if (e.target === e.currentTarget && !isParsing && !appState.aiRunning) open = false; }}
    onkeydown={(e) => { if (e.key === 'Escape' && !isParsing && !appState.aiRunning) open = false; }}
  >
    <div class="w-full max-w-xl bg-surface border border-border-subtle rounded-2xl shadow-popover p-5 space-y-4 flex flex-col max-h-[90vh] overflow-y-auto">
      <!-- 头部 -->
      <div class="flex items-center justify-between pb-3 border-b border-border-subtle flex-shrink-0">
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 rounded-lg bg-accent/10 text-accent flex items-center justify-center font-bold text-sm">
            ✨
          </div>
          <div>
            <h2 class="text-sm font-semibold text-text-primary">AI 智能书签分析整理</h2>
            <p class="text-[11px] text-text-tertiary">基于大模型语义推理，智能推荐书签分组与标签</p>
          </div>
        </div>
        <button
          type="button"
          disabled={isParsing || appState.aiRunning}
          onclick={() => (open = false)}
          class="p-1 rounded-lg hover:bg-subtle text-text-tertiary hover:text-text-primary transition-colors disabled:opacity-40"
          aria-label="关闭"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- 模式切换：免Key网页对话 vs API直连 -->
      <div class="flex items-center p-1 bg-subtle rounded-xl border border-border-subtle text-xs">
        <button
          type="button"
          onclick={() => (organizeMode = 'manual')}
          class="flex-1 py-1.5 px-3 rounded-lg font-medium transition-all flex items-center justify-center gap-1.5 {organizeMode === 'manual'
            ? 'bg-accent text-accent-fg font-semibold shadow-xs'
            : 'text-text-secondary hover:text-text-primary hover:bg-surface/50'}"
        >
          <span>💬 网页模型对话 (免 Key / 零门槛)</span>
          <span class="text-[9px] px-1.5 py-0.2 rounded {organizeMode === 'manual' ? 'bg-white/20 text-white' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-normal'}">推荐</span>
        </button>
        <button
          type="button"
          onclick={() => (organizeMode = 'api')}
          class="flex-1 py-1.5 px-3 rounded-lg font-medium transition-all flex items-center justify-center gap-1.5 {organizeMode === 'api'
            ? 'bg-accent text-accent-fg font-semibold shadow-xs'
            : 'text-text-secondary hover:text-text-primary hover:bg-surface/50'}"
        >
          <span>⚡ API 自动化直连</span>
        </button>
      </div>

      {#if organizeMode === 'manual'}
        <!-- ================= 网页对话模式 (3 步流) ================= -->
        <!-- 任务类型选择 (智能分组 / 智能标签) 卡片式高亮切换 -->
        <div class="grid grid-cols-2 gap-2 text-xs">
          <button
            type="button"
            onclick={() => (activeType = 'grouping')}
            class="py-2 px-3 rounded-xl border text-left transition-all flex items-center justify-between {activeType === 'grouping'
              ? 'border-accent bg-accent/10 ring-1 ring-accent text-accent font-semibold shadow-xs'
              : 'border-border-subtle bg-subtle/50 hover:bg-subtle text-text-secondary hover:text-text-primary'}"
          >
            <span class="flex items-center gap-1.5">
              <span>✨</span>
              <span>智能分类分组</span>
            </span>
            <span class="text-[10px] px-1.5 py-0.5 rounded font-mono transition-colors {activeType === 'grouping' ? 'bg-accent text-accent-fg font-medium' : 'bg-surface text-text-tertiary border border-border-subtle'}">
              {ungroupedCount} 项未分组
            </span>
          </button>
          <button
            type="button"
            onclick={() => (activeType = 'tagging')}
            class="py-2 px-3 rounded-xl border text-left transition-all flex items-center justify-between {activeType === 'tagging'
              ? 'border-accent bg-accent/10 ring-1 ring-accent text-accent font-semibold shadow-xs'
              : 'border-border-subtle bg-subtle/50 hover:bg-subtle text-text-secondary hover:text-text-primary'}"
          >
            <span class="flex items-center gap-1.5">
              <span>🏷️</span>
              <span>智能标签提炼</span>
            </span>
            <span class="text-[10px] px-1.5 py-0.5 rounded font-mono transition-colors {activeType === 'tagging' ? 'bg-accent text-accent-fg font-medium' : 'bg-surface text-text-tertiary border border-border-subtle'}">
              {untaggedCount} 项无标签
            </span>
          </button>
        </div>

        <!-- 步骤 1：准备提示词与数据 -->
        <div class="p-3.5 rounded-xl border border-border-subtle bg-surface/50 space-y-3">
          <div class="flex items-center justify-between">
            <span class="font-semibold text-text-primary text-xs flex items-center gap-1.5">
              <span class="w-4 h-4 rounded-full bg-accent/10 text-accent flex items-center justify-center text-[10px] font-bold">1</span>
              <span>配置范围并获取提示词与数据</span>
            </span>
          </div>

          <!-- 参数配置行 -->
          <div class="text-[11px] text-text-secondary space-y-2 bg-subtle/40 p-2.5 rounded-lg border border-border-subtle/40">
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
                      class="text-accent"
                    />
                    <span>仅未分组 ({ungroupedCount} 项)</span>
                  </label>
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="modal-group-scope"
                      checked={appState.settings.ai?.grouping?.scope === 'all'}
                      onchange={() => updateAiSettings({ grouping: { scope: 'all' } })}
                      class="text-accent"
                    />
                    <span>全部书签 ({appState.bookmarks.length} 项)</span>
                  </label>
                </div>

                <label class="flex items-center gap-1 cursor-pointer text-text-secondary">
                  <input
                    type="checkbox"
                    checked={appState.settings.ai?.grouping?.allowNewGroups !== false}
                    onchange={(e) => updateAiSettings({ grouping: { allowNewGroups: e.target.checked } })}
                    class="rounded border-border-subtle text-accent"
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
                      class="text-accent"
                    />
                    <span>仅无标签 ({untaggedCount} 项)</span>
                  </label>
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="modal-tag-scope"
                      checked={appState.settings.ai?.tagging?.scope === 'all'}
                      onchange={() => updateAiSettings({ tagging: { scope: 'all' } })}
                      class="text-accent"
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
                      class="text-accent"
                    />
                    <span>增量追加</span>
                  </label>
                  <label class="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="modal-tag-mode"
                      checked={appState.settings.ai?.tagging?.mode === 'replace'}
                      onchange={() => updateAiSettings({ tagging: { mode: 'replace' } })}
                      class="text-accent"
                    />
                    <span>重构覆盖</span>
                  </label>
                </div>
              </div>
            {/if}
          </div>

          <!-- 按钮组：复制提示词 + 下载数据 -->
          <div class="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onclick={handleCopyPrompt}
              class="py-2 px-3 rounded-lg bg-accent text-accent-fg font-medium hover:opacity-90 transition-all flex items-center justify-center gap-1.5 text-xs shadow-xs"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span>一键复制提示词</span>
            </button>

            <button
              type="button"
              onclick={handleDownloadDataJson}
              class="py-2 px-3 rounded-lg border border-border-subtle bg-surface hover:bg-subtle text-text-primary transition-all flex items-center justify-center gap-1.5 text-xs shadow-2xs font-medium"
            >
              <svg class="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>下载书签数据 JSON</span>
            </button>
          </div>
        </div>

        <!-- 步骤 2：外部对话引导 -->
        <div class="p-3 rounded-xl border border-border-subtle/80 bg-subtle/30 space-y-1.5 text-[11px]">
          <div class="flex items-center gap-1.5 font-semibold text-text-primary text-xs">
            <span class="w-4 h-4 rounded-full bg-accent/10 text-accent flex items-center justify-center text-[10px] font-bold">2</span>
            <span>前往网页大模型对话</span>
          </div>
          <p class="text-text-secondary leading-relaxed">
            在 <strong>DeepSeek / ChatGPT / Claude / Kimi / 豆包</strong> 对话框中粘贴复制的提示词，并上传刚才下载的数据文件，大模型将返回整理变更结果。
          </p>
        </div>

        <!-- 步骤 3：导入变更并生效 -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="font-semibold text-text-primary text-xs flex items-center gap-1.5">
              <span class="w-4 h-4 rounded-full bg-accent/10 text-accent flex items-center justify-center text-[10px] font-bold">3</span>
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
            class="relative rounded-xl border-2 border-dashed transition-colors {isDraggingOver ? 'border-accent bg-accent/5' : 'border-border-subtle bg-subtle/30'}"
            ondragover={(e) => { e.preventDefault(); isDraggingOver = true; }}
            ondragleave={() => (isDraggingOver = false)}
            ondrop={handleDrop}
            role="region"
            aria-label="拖拽上传区域"
          >
            <textarea
              bind:value={rawInput}
              placeholder="在此直接粘贴 (Ctrl+V) 大模型返回的 JSON 内容或 Markdown 围栏代码块...（或将返回的文件拖入此处）"
              rows="3"
              class="w-full p-3 bg-transparent border-0 outline-none text-xs text-text-primary font-mono resize-none placeholder:text-text-tertiary"
            ></textarea>

            <div class="flex items-center justify-between px-3 py-2 bg-subtle/50 border-t border-border-subtle/40 text-[10px]">
              <label class="cursor-pointer text-accent hover:underline flex items-center gap-1">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span>上传模型返回的 JSON 文件</span>
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
            class="w-full py-2.5 rounded-xl bg-accent text-accent-fg font-medium hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5 text-xs shadow-xs"
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
          <div class="p-3 rounded-xl border border-border-subtle bg-subtle/40 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-text-tertiary">已配置接口:</span>
              <span class="font-mono font-medium text-text-primary">{appState.settings.ai?.baseUrl || '未设置'}</span>
              <span class="px-1.5 py-0.5 rounded bg-subtle text-[10px] text-text-secondary border border-border-subtle">{appState.settings.ai?.model || 'deepseek-chat'}</span>
            </div>
            <span class="text-[10px] text-text-tertiary">可在设置中修改 API Key</span>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <!-- 智能分组 -->
            <div class="p-3.5 rounded-xl border border-border-subtle bg-surface space-y-3 flex flex-col justify-between">
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <span class="font-semibold text-text-primary flex items-center gap-1.5">
                    <span>✨ 智能分组治理</span>
                  </span>
                  <span class="text-[10px] text-text-tertiary">未分组: {ungroupedCount}</span>
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
                      class="text-accent"
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
                      class="text-accent"
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
                      class="rounded border-border-subtle text-accent"
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
                  <span class="font-semibold text-text-primary flex items-center gap-1.5">
                    <span>🏷️ 智能标签提炼</span>
                  </span>
                  <span class="text-[10px] text-text-tertiary">无标签: {untaggedCount}</span>
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
                      class="text-accent"
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
                      class="text-accent"
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
                          class="text-accent mr-0.5"
                        /> 增量追加
                      </label>
                      <label class="cursor-pointer">
                        <input
                          type="radio"
                          name="api-tag-mode"
                          checked={appState.settings.ai?.tagging?.mode === 'replace'}
                          onchange={() => updateAiSettings({ tagging: { mode: 'replace' } })}
                          class="text-accent mr-0.5"
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
  </div>
{/if}

<!-- 结果比对与应用弹窗 -->
<AiResultModal
  bind:open={showResultModal}
  type={resultType}
  bind:items={resultItems}
  onApply={handleApplyResult}
/>
